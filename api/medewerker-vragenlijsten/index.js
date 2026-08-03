/**
 * /api/medewerker-vragenlijsten — werkoverzicht voor medewerkers: alle vragenlijsten (aanlever-
 * verzoeken) die nog aandacht nodig hebben — open, of afgerond maar nog niet gecontroleerd — met
 * voortgang en de vraag-/berichtenreeks per lijst, plus het beantwoorden van vragen van klanten.
 *
 *   - GET  → { rijen: [...], mijnNaam }
 *            Een verzoek verdwijnt pas uit dit overzicht als het 'afgerond' is (klant klaar) ÉN een
 *            medewerker het heeft geaccepteerd — zo mist niemand de controle op een net binnengekomen
 *            complete vragenlijst (het rode bolletje/badge blijft ook gewoon werken via de bestaande
 *            'gezien'-tracking).
 *   - POST { actie:"antwoord", verzoekId, tekst }    → medewerker beantwoordt een vraag (klant ziet dit)
 *   - POST { actie:"accepteren", verzoekId }         → medewerker keurt een afgeronde vragenlijst goed;
 *                                                       verdwijnt daarna uit dit overzicht
 *   - POST { actie:"heropenen", verzoekId, regelId } → één document weer open zetten zodat de klant het
 *                                                       opnieuw kan aanleveren (klant krijgt een bericht)
 *   - POST { actie:"deadline-zetten", verzoekId, deadline } → deadline (YYYY-MM-DD, leeg mag) aanpassen
 *                                                       op een al uitgezet verzoek (klant krijgt een bericht
 *                                                       als de deadline echt wijzigt)
 *   - POST { actie:"regel-toevoegen", verzoekId, naam, toelichting?, verplicht?, bestandsnaam? } →
 *                                                       extra document/vraag toevoegen aan een al
 *                                                       uitgezet verzoek (heropent 'm eventueel, klant
 *                                                       krijgt een bericht)
 *   - POST { actie:"regel-bewerken", verzoekId, regelId, naam?, toelichting?, verplicht? } →
 *                                                       een al bestaande vraag/document aanpassen
 *                                                       (naam/toelichting/verplicht), ongeacht de status
 *   - POST { actie:"titel-zetten", verzoekId, lijstNaam, jaar? } → naam en/of jaar van een al uitgezet
 *                                                       verzoek aanpassen. Wijzigt het jaar, dan wordt de
 *                                                       SharePoint-opslagmap (voor nog te uploaden
 *                                                       documenten) opnieuw berekend via hetzelfde
 *                                                       pad-sjabloon (onderwerp/lijst) als bij het aanmaken.
 *
 * Verwijderen van een heel verzoek loopt via de bestaande /api/medewerker-aanleververzoeken
 * ({actie:"verwijderen", id}) — geen aparte actie hier, één plek voor die logica.
 *
 * Alleen medewerker/beheerder (rolcheck in het endpoint zelf).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const verzoeken = require("../_gedeeld/aanleververzoeken");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { haalOnderwerpen, resolvePad } = require("../_gedeeld/aanleveronderwerpen");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");

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

function verrijk(v, laatstGezien) {
  const regels = Array.isArray(v.regels) ? v.regels : [];
  // 'afgemeld' (opmerking zonder bestand) telt hier ook mee als afgehandeld, zelfde als 'aangeleverd'.
  const aangeleverd = regels.filter((r) => r.status !== "open").length;
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
    // Heeft de klant hier iets aangeleverd/afgemeld of gevraagd sinds medewerkers dit voor het laatst
    // bekeken (tab "Vragenlijsten" geopend)? Voor het rode bolletje op de rij én op de tab zelf.
    heeftNieuweActiviteit: verzoeken.heeftKlantActiviteitSinds(v, laatstGezien),
    // Afgerond (klant klaar) maar nog niet door een medewerker gecontroleerd/geaccepteerd — dan blijft
    // de rij zichtbaar met een "wacht op controle"-status i.p.v. stilletjes te verdwijnen.
    wachtOpControle: v.status === "afgerond" && !v.medewerkerGeaccepteerd,
    medewerkerGeaccepteerd: !!v.medewerkerGeaccepteerd,
    geaccepteerdOp: v.geaccepteerdOp || null,
    geaccepteerdDoor: v.geaccepteerdDoor || "",
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
      const {
        actie, verzoekId, regelId, tekst, deadline, lijstNaam, jaar,
        naam: nieuweRegelNaam, toelichting: nieuweRegelToelichting, verplicht: nieuweRegelVerplicht, bestandsnaam: nieuweRegelBestandsnaam,
      } = req.body || {};

      if (actie === "antwoord") {
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
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      if (actie === "accepteren") {
        if (!verzoekId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' mee." } }; return; }
        let foutmelding = "";
        const v = await verzoeken.werkBij(verzoekId, (x) => {
          if (x.status !== "afgerond") { foutmelding = "Deze vragenlijst is nog niet compleet."; return; }
          x.medewerkerGeaccepteerd = true;
          x.geaccepteerdOp = new Date().toISOString();
          x.geaccepteerdDoor = naam || email || "";
          // Kort berichtje in de vragen-/berichtenreeks zodat de klant ook echt merkt dat alles is
          // gecontroleerd en in orde is (en dit meteen het klant-rode-bolletje triggert, zie
          // heeftMedewerkerActiviteitSinds in aanleververzoeken.js).
          if (!Array.isArray(x.vragen)) x.vragen = [];
          x.vragen.push(verzoeken.maakBericht("medewerker", naam || email || "Medewerker", "Vragenlijst gecontroleerd en akkoord bevonden — bedankt voor het aanleveren!"));
        });
        if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
        if (foutmelding) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: foutmelding } }; return; }
        await logGebeurtenis({
          door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
          klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
          tekst: `Vragenlijst "${v.lijstNaam || "aanlever-verzoek"}" gecontroleerd en geaccepteerd.`,
        });
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      if (actie === "heropenen") {
        if (!verzoekId || !regelId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' en 'regelId' mee." } }; return; }
        let regelNaam = "";
        let foutmelding = "";
        const v = await verzoeken.werkBij(verzoekId, (x) => {
          const r = (x.regels || []).find((rr) => rr.id === regelId);
          if (!r) { foutmelding = "Document niet gevonden in deze vragenlijst."; return; }
          regelNaam = r.naam || "document";
          r.status = "open";
          r.bestand = null;
          r.aangeleverdOp = null;
          r.aangeleverdDoor = null;
          // Voor het rode bolletje bij de klant (zie aanleververzoeken.js, heeftMedewerkerActiviteitSinds).
          r.heropendOp = new Date().toISOString();
          // Een geaccepteerde/afgeronde vragenlijst gaat door het heropenen van een document weer
          // 'open' — de klant moet 'm dan opnieuw aanleveren, dus ook de acceptatie vervalt.
          x.medewerkerGeaccepteerd = false;
          x.geaccepteerdOp = null;
          x.geaccepteerdDoor = "";
          if (!Array.isArray(x.vragen)) x.vragen = [];
          x.vragen.push(verzoeken.maakBericht("medewerker", naam || email || "Medewerker", `"${regelNaam}" is heropend — kun je deze opnieuw aanleveren?`));
          verzoeken.herberekenStatus(x);
        });
        if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
        if (foutmelding) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: foutmelding } }; return; }
        await logGebeurtenis({
          door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
          klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
          tekst: `Document "${regelNaam}" heropend bij "${v.lijstNaam || "aanlever-verzoek"}" — klant moet opnieuw aanleveren.`,
        });
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      if (actie === "deadline-zetten") {
        if (!verzoekId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' mee." } }; return; }
        const nieuweDeadline = String(deadline || "").slice(0, 10);
        let oudeDeadline = "";
        const v = await verzoeken.werkBij(verzoekId, (x) => {
          oudeDeadline = x.deadline || "";
          x.deadline = nieuweDeadline;
          if (oudeDeadline !== nieuweDeadline) {
            if (!Array.isArray(x.vragen)) x.vragen = [];
            x.vragen.push(verzoeken.maakBericht(
              "medewerker", naam || email || "Medewerker",
              nieuweDeadline ? `Deadline gewijzigd naar ${nieuweDeadline}.` : "Deadline verwijderd."
            ));
          }
        });
        if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
        if (oudeDeadline !== nieuweDeadline) {
          await logGebeurtenis({
            door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
            klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
            tekst: `Deadline van "${v.lijstNaam || "aanlever-verzoek"}" gewijzigd naar ${nieuweDeadline || "(geen deadline)"}.`,
          });
        }
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      if (actie === "regel-toevoegen") {
        if (!verzoekId || !String(nieuweRegelNaam || "").trim()) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' en 'naam' mee." } }; return; }
        let nieuweRegel = null;
        const v = await verzoeken.werkBij(verzoekId, (x) => {
          nieuweRegel = verzoeken.maakRegel({
            naam: nieuweRegelNaam, toelichting: nieuweRegelToelichting, bestandsnaam: nieuweRegelBestandsnaam,
            verplicht: nieuweRegelVerplicht,
          });
          if (!Array.isArray(x.regels)) x.regels = [];
          x.regels.push(nieuweRegel);
          // Een nieuwe vraag maakt een eerder geaccepteerde/afgeronde lijst weer actief.
          x.medewerkerGeaccepteerd = false;
          x.geaccepteerdOp = null;
          x.geaccepteerdDoor = "";
          if (!Array.isArray(x.vragen)) x.vragen = [];
          x.vragen.push(verzoeken.maakBericht(
            "medewerker", naam || email || "Medewerker",
            `Nieuwe vraag toegevoegd: "${nieuweRegel.naam}"${nieuweRegel.toelichting ? ` — ${nieuweRegel.toelichting}` : ""}`
          ));
          verzoeken.herberekenStatus(x);
        });
        if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
        await logGebeurtenis({
          door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
          klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
          tekst: `Nieuwe vraag "${nieuweRegel.naam}" toegevoegd aan "${v.lijstNaam || "aanlever-verzoek"}".`,
        });
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      if (actie === "regel-bewerken") {
        if (!verzoekId || !regelId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' en 'regelId' mee." } }; return; }
        const naamTrim = nieuweRegelNaam != null ? String(nieuweRegelNaam).trim().slice(0, 200) : null;
        if (naamTrim !== null && !naamTrim) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Naam mag niet leeg zijn." } }; return; }
        let foutmelding = "";
        let wijziging = "";
        const v = await verzoeken.werkBij(verzoekId, (x) => {
          const r = (x.regels || []).find((rr) => rr.id === regelId);
          if (!r) { foutmelding = "Document niet gevonden in deze vragenlijst."; return; }
          const oudeNaam = r.naam || "";
          const oudeToelichting = r.toelichting || "";
          if (naamTrim !== null) r.naam = naamTrim;
          if (nieuweRegelToelichting != null) r.toelichting = String(nieuweRegelToelichting).slice(0, 600);
          if (nieuweRegelBestandsnaam != null) r.bestandsnaam = String(nieuweRegelBestandsnaam).trim().slice(0, 200);
          if (nieuweRegelVerplicht != null) r.verplicht = nieuweRegelVerplicht !== false;
          // Alleen een berichtje aan de klant als er echt iets in naam/toelichting is veranderd —
          // verplicht/bestandsnaam zijn interne details die geen extra bericht nodig hebben.
          if (r.naam !== oudeNaam || (r.toelichting || "") !== oudeToelichting) {
            wijziging = r.naam !== oudeNaam
              ? `Vraag aangepast: "${oudeNaam}" → "${r.naam}"${r.toelichting ? ` — ${r.toelichting}` : ""}.`
              : `Vraag "${r.naam}" aangepast — ${r.toelichting || "toelichting verwijderd"}.`;
            if (!Array.isArray(x.vragen)) x.vragen = [];
            x.vragen.push(verzoeken.maakBericht("medewerker", naam || email || "Medewerker", wijziging));
          }
        });
        if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
        if (foutmelding) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: foutmelding } }; return; }
        if (wijziging) {
          await logGebeurtenis({
            door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
            klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
            tekst: `${wijziging} (bij "${v.lijstNaam || "aanlever-verzoek"}")`,
          });
        }
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      if (actie === "titel-zetten") {
        if (!verzoekId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'verzoekId' mee." } }; return; }
        const nieuweLijstNaam = String(lijstNaam || "").trim().slice(0, 200);
        if (!nieuweLijstNaam) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Naam mag niet leeg zijn." } }; return; }
        const nieuweJaar = String(jaar || "").trim().slice(0, 4);

        const alleVoorLookup = await verzoeken.haalAlle();
        const bestaand = alleVoorLookup.find((x) => x.id === verzoekId);
        if (!bestaand) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }

        const oudeLijstNaam = bestaand.lijstNaam || "";
        const oudeJaar = bestaand.jaar || "";

        // Als het jaar wijzigt, moet de opslagmap (voor nog te uploaden documenten) mee — anders
        // blijven nieuwe aanleveringen in de map van het oude jaar belanden. We herberekenen 'm via
        // hetzelfde pad-sjabloon (onderwerp of lijst) als bij het aanmaken van dit verzoek. Dit moet
        // vóór werkBij gebeuren: de mutator daarin is synchroon en wordt niet ge-awaited.
        let nieuweMap = null; // null = map ongewijzigd laten
        if (nieuweJaar !== oudeJaar) {
          try {
            if (bestaand.onderwerpId) {
              const onderwerp = (await haalOnderwerpen()).find((o) => o.id === bestaand.onderwerpId);
              if (onderwerp && onderwerp.pad) nieuweMap = resolvePad(onderwerp.pad, { jaar: nieuweJaar, onderwerp: onderwerp.naam });
            } else if (bestaand.lijstId) {
              const lijst = (await haalLijsten()).find((l) => l.id === bestaand.lijstId);
              if (lijst && lijst.pad) nieuweMap = resolvePad(lijst.pad, { jaar: nieuweJaar, lijst: lijst.naam, onderwerp: lijst.naam });
            }
          } catch (opzoekFout) {
            context.log.error("Opslagmap herberekenen bij jaarwijziging mislukt:", opzoekFout);
          }
        }

        const v = await verzoeken.werkBij(verzoekId, (x) => {
          x.lijstNaam = nieuweLijstNaam;
          x.jaar = nieuweJaar;
          if (nieuweMap) x.map = nieuweMap;
          if (oudeLijstNaam !== nieuweLijstNaam || oudeJaar !== nieuweJaar) {
            const delen = [];
            if (oudeLijstNaam !== nieuweLijstNaam) delen.push(`titel gewijzigd naar "${nieuweLijstNaam}"`);
            if (oudeJaar !== nieuweJaar) delen.push(`jaar gewijzigd naar ${nieuweJaar || "(geen jaar)"}`);
            if (!Array.isArray(x.vragen)) x.vragen = [];
            x.vragen.push(verzoeken.maakBericht("medewerker", naam || email || "Medewerker", delen.join(", ") + "."));
          }
        });
        if (!v) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Verzoek niet gevonden." } }; return; }
        if (oudeLijstNaam !== nieuweLijstNaam || oudeJaar !== nieuweJaar) {
          await logGebeurtenis({
            door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
            klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
            tekst: `Titel/jaar van "${oudeLijstNaam}" gewijzigd naar "${nieuweLijstNaam}"${nieuweJaar ? ` ${nieuweJaar}` : ""}.`,
          });
        }
        const laatstGezienNa = await verzoeken.haalLaatstGezien().catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: verrijk(v, laatstGezienNa) } };
        return;
      }

      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } };
      return;
    }

    if (methode !== "GET") { context.res = { status: 405, body: { error: "Methode niet toegestaan." } }; return; }

    const laatstGezien = await verzoeken.haalLaatstGezien().catch(() => null);
    const alle = await verzoeken.haalAlle();
    // Blijft zichtbaar: nog open, óf afgerond maar nog niet door een medewerker geaccepteerd.
    const rijen = alle.filter((v) => !(v.status === "afgerond" && v.medewerkerGeaccepteerd)).map((v) => verrijk(v, laatstGezien));
    // Nieuwste/urgentste eerst: nieuwe klant-activiteit + wacht-op-controle + open vragen bovenaan,
    // dan op deadline, dan op startdatum.
    rijen.sort((a, b) =>
      (b.heeftNieuweActiviteit > 0) - (a.heeftNieuweActiviteit > 0) ||
      (b.wachtOpControle > 0) - (a.wachtOpControle > 0) ||
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
