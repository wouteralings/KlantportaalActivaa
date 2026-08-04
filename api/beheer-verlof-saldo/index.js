/**
 * /api/beheer-verlof-saldo — verlofsaldo-overzicht per medewerker + handmatige correcties.
 *
 *   - GET                                            → { medewerkers: [{email, naam, saldo}] }
 *   - GET ?email=...                                 → { email, naam, saldo } (incl. correctieHistorie/log)
 *   - POST { email, uren, toelichting }               → correctie toevoegen (verplichte toelichting, wordt gelogd)
 *
 * De correctie is een append-only logboek (zie verlofCorrectieStore.js): elke correctie blijft
 * zichtbaar met wie hem invoerde, wanneer en met welke toelichting — er is bewust geen
 * bewerk/verwijder-functie (Wouter, 03-08-2026: "we kunnen zien wie dat heeft ingevoerd (log)").
 * Beheerder-only (route in staticwebapp.config.json).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");
const verlof = require("../_gedeeld/verlofDataverse");
const verlofCorrectieStore = require("../_gedeeld/verlofCorrectieStore");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

/**
 * Alle actieve Activaa-medewerkers (Dynamics systemusers, zelfde selectie als /api/beheer-medewerkers
 * en /api/beheer-uren-tarieven — bewust hier gedupliceerd, zie codebase-conventie).
 *
 * Vóór deze fix werd de medewerkerslijst hier direct uit cr283_urentarief gehaald (lijstTarieven()) —
 * dus alleen medewerkers die al ooit een tarief-rij hadden opgeslagen. Een medewerker die nog nooit
 * "Opslaan" had geklikt bij Tarieven & deadline (bijv. net in dienst) viel daardoor stil uit zowel de
 * beginbalans-lijst als het saldo-overzicht, ook al stond hij/zij gewoon actief in Dynamics.
 */
async function haalMedewerkers() {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) return [];
  const token = await haalDynamicsToken();
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", Prefer: "odata.maxpagesize=1000" };
  const start = `${resource}/api/data/v9.2/systemusers` +
    `?$select=systemuserid,fullname,internalemailaddress,title,address1_telephone1` +
    `&$filter=isdisabled eq false and internalemailaddress ne null and applicationid eq null` +
    `&$orderby=fullname asc`;
  const alles = [];
  let next = start;
  while (next && alles.length < 2000) {
    const res = await fetch(next, { headers });
    if (!res.ok) throw new Error(`Ophalen medewerkers mislukt (${res.status}): ${await res.text()}`);
    const data = await res.json();
    alles.push(...(data.value || []));
    next = data["@odata.nextLink"] || null;
  }
  const TELFILTER = (process.env.MEDEWERKER_TELEFOONFILTER || "850600960").replace(/\D/g, "");
  const cijfers = (s) => String(s || "").replace(/\D/g, "");
  return alles
    .filter((u) => u.title && cijfers(u.address1_telephone1).includes(TELFILTER))
    .map((u) => ({ id: u.systemuserid, naam: u.fullname || "", email: (u.internalemailaddress || "").toLowerCase(), functie: u.title || "" }))
    .filter((m) => m.email);
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) return json(context, 403, { error: "Alleen beheerders hebben hier toegang toe." });
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const enkelEmail = req.query && req.query.email;
      if (enkelEmail) {
        const saldo = await verlof.berekenSaldo(enkelEmail);
        return json(context, 200, { email: enkelEmail, saldo });
      }
      const [dynamicsMedewerkers, tarieven] = await Promise.all([haalMedewerkers().catch(() => []), uren.lijstTarieven()]);
      const tvan = new Map(tarieven.map((t) => [String(t.medewerker_email).toLowerCase(), t]));
      // Iedereen uit Dynamics die (nog) geen tarief-rij heeft is standaard "actief" — zelfde default
      // als tariefUit() in beheer-uren-tarieven. Alleen expliciet op inactief gezette medewerkers vallen weg.
      const actieveMedewerkers = dynamicsMedewerkers.filter((m) => tvan.get(m.email)?.actief !== false);
      const medewerkers = [];
      for (const m of actieveMedewerkers) {
        const saldo = await verlof.berekenSaldo(m.email);
        medewerkers.push({ email: m.email, naam: m.naam || m.email, saldo });
      }
      medewerkers.sort((a, b) => (a.naam || "").localeCompare(b.naam || ""));
      return json(context, 200, { medewerkers });
    }

    if (methode === "POST") {
      const b = req.body || {};
      if (!b.email) return json(context, 400, { error: "Geef een medewerker (email) mee." });
      const door = haalNaamUitPrincipal(req) || haalEmailUitPrincipal(req) || "onbekend";
      const regel = await verlofCorrectieStore.voegCorrectieToe(b.email, { uren: b.uren, toelichting: b.toelichting }, door);
      const saldo = await verlof.berekenSaldo(b.email);
      return json(context, 200, { ok: true, correctie: regel, saldo });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    if (String(err.message || "").startsWith("VALIDATIE")) return json(context, 400, { error: String(err.message).replace(/^VALIDATIE:\s*/, "") });
    context.log.error(err);
    return json(context, 500, { error: "Kon het verlofsaldo niet verwerken.", detail: String(err.message || err) });
  }
};
