/**
 * /api/medewerker-vragenlijsten — werkoverzicht voor medewerkers: alle openstaande vragenlijsten
 * (aanlever-verzoeken) met voortgang en de vraag-/berichtenreeks per lijst, plus het beantwoorden van
 * vragen van klanten.
 *
 *   - GET  → { rijen: [ ...openstaande verzoeken, verrijkt... ], mijnNaam }
 *   - POST { actie:"antwoord", verzoekId, tekst } → medewerker beantwoordt een vraag (klant ziet dit)
 *
 * Alleen medewerker/beheerder (rolcheck in het endpoint zelf).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const verzoeken = require("../_gedeeld/aanleververzoeken");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

/**
 * Zoekt de volledige naam (systemuser fullname) van de ingelogde medewerker op basis van het
 * e-mailadres. Dat is dezelfde naam die Dynamics bij de klant-rolvelden (relatiebeheerder, accountant,
 * …) gebruikt, zodat het 'mijn cliënten'-filter betrouwbaar matcht — ook als het inlogtoken zelf geen
 * naam-claim meestuurt. Best effort: leeg bij een fout.
 */
async function haalMijnNaam(resource, token, email) {
  if (!resource || !email) return "";
  const veilig = String(email).replace(/'/g, "''");
  const url = `${resource}/api/data/v9.2/systemusers?$select=fullname&$filter=internalemailaddress eq '${encodeURIComponent(veilig)}' and isdisabled eq false&$top=1`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!res.ok) return "";
    const d = await res.json();
    return (d.value && d.value[0] && d.value[0].fullname) || "";
  } catch {
    return "";
  }
}

/** Aantal onbeantwoorde klantvragen: klantberichten ná het laatste medewerker-/ai-antwoord. */
function openVragen(vragen) {
  if (!Array.isArray(vragen) || !vragen.length) return 0;
  let laatsteAntwoord = -1;
  vragen.forEach((m, i) => { if (m.rol === "medewerker" || m.rol === "ai") laatsteAntwoord = i; });
  return vragen.filter((m, i) => m.rol === "klant" && i > laatsteAntwoord).length;
}

function verrijk(v) {
  const regels = Array.isArray(v.regels) ? v.regels : [];
  const aangeleverd = regels.filter((r) => r.status === "aangeleverd").length;
  const vragen = Array.isArray(v.vragen) ? v.vragen : [];
  return {
    id: v.id,
    accountId: v.accountId,
    klantnaam: v.klantnaam || "",
    klantnummer: v.klantnummer || "",
    contactNaam: v.contactNaam || "",
    lijstNaam: v.lijstNaam || v.onderwerp || "Aanlever-verzoek",
    jaar: v.jaar || "",
    startdatum: (v.aangemaaktOp || "").slice(0, 10),
    deadline: v.deadline || "",
    aantalDocumenten: regels.length,
    aangeleverd,
    notitie: v.notitie || "",
    documenten: regels.map((r) => ({
      id: r.id,
      naam: r.naam || "",
      verplicht: r.verplicht !== false,
      toelichting: r.toelichting || "",
      status: r.status || "open",
      opmerking: r.opmerking || "",
      bestandNaam: (r.bestand && r.bestand.naam) || "",
      aangeleverdOp: r.aangeleverdOp || null,
    })),
    status: v.status || "open",
    zichtbaar: v.zichtbaar !== false,
    vragen,
    openVragen: openVragen(vragen),
    heeftVragen: vragen.some((m) => m.rol === "klant"),
  };
}

module.exports = async function (context, req) {
  const email = haalEmailUitPrincipal(req);
  const naam = haalNaamUitPrincipal(req);
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "POST") {
      const { actie, verzoekId, tekst } = req.body || {};
      if (actie !== "antwoord") { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } }; return; }
      if (!verzoekId || !String(tekst || "").trim()) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' en 'tekst' mee." } }; return; }
      const v = await verzoeken.werkBij(verzoekId, (x) => {
        if (!Array.isArray(x.vragen)) x.vragen = [];
        x.vragen.push(verzoeken.maakBericht("medewerker", naam || email || "Medewerker", tekst));
      });
      if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
      await logGebeurtenis({
        door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
        klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
        tekst: `Vraag van klant beantwoord bij "${v.lijstNaam || "aanlever-verzoek"}".`,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v) } };
      return;
    }

    if (methode !== "GET") { context.res = { status: 405, body: { error: "Methode niet toegestaan." } }; return; }

    const alle = await verzoeken.haalAlle();
    const rijen = alle.filter((v) => v.status !== "afgerond").map(verrijk);
    // Nieuwste/urgentste eerst: open vragen bovenaan, dan op deadline, dan op startdatum.
    rijen.sort((a, b) =>
      (b.openVragen > 0) - (a.openVragen > 0) ||
      String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")) ||
      String(b.startdatum).localeCompare(String(a.startdatum))
    );

    // Betrouwbare naam voor het 'mijn cliënten'-filter: uit Dynamics (systemuser fullname) op basis
    // van het e-mailadres; val terug op de token-naam als dat niet lukt.
    let mijnNaam = naam || "";
    const resource = process.env.DYNAMICS_RESOURCE_URL;
    if (resource && email) {
      try {
        const token = await haalDynamicsToken();
        const fn = await haalMijnNaam(resource, token, email);
        if (fn) mijnNaam = fn;
      } catch { /* val terug op token-naam */ }
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { rijen, mijnNaam } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de vragenlijsten niet ophalen.", detail: String(err.message || err) } };
  }
};
