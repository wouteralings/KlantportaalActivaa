/**
 * /api/beheer-abonnementen — overzicht van alle abonnementen op vaste uitvragen (vragenlijsten) voor
 * het beheerdersportaal, plus het beheren van persoonlijke opgeslagen filters.
 *
 *   - GET  → { rijen: [ ... alle abonnementen, verrijkt ... ], filters: [ opgeslagen presets van mij ] }
 *   - POST { actie:"filterOpslaan", naam, filter }  → preset opslaan
 *   - POST { actie:"filterVerwijderen", id }        → preset verwijderen
 *
 * Beheerder-only (rolcheck in het endpoint zelf).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");
const vasteUitvragen = require("../_gedeeld/klantvasteuitvragen");
const { volgende } = require("../_gedeeld/abonnementdatum");
const filters = require("../_gedeeld/abonnementfilters");

const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";

function leesHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
}

/** Haalt naam + clientnummer voor een set accountId's op (in brokken, via een OR-filter). */
async function haalAccountNamen(resource, token, accountIds) {
  const namen = new Map();
  const ids = [...new Set(accountIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 20) {
    const brok = ids.slice(i, i + 20);
    const filter = brok.map((id) => `accountid eq ${id}`).join(" or ");
    const url = `${resource}/api/data/v9.2/accounts?$select=accountid,name,${CLIENTNUMMER_VELD}&$filter=${encodeURIComponent(filter)}`;
    try {
      const res = await fetch(url, { headers: leesHeaders(token) });
      if (!res.ok) continue;
      const d = await res.json();
      for (const a of d.value || []) {
        const nummer = a[CLIENTNUMMER_VELD];
        namen.set(a.accountid, { klantnaam: a.name || "", klantnummer: nummer != null && nummer !== "" ? String(nummer) : "" });
      }
    } catch { /* brok overslaan */ }
  }
  return namen;
}

function eerstvolgende(ab) {
  if (!ab || !ab.actief || !ab.startDatum) return "";
  return ab.laatsteRun ? (volgende(ab.laatsteRun, ab.frequentie) || "") : ab.startDatum;
}

module.exports = async function (context, req) {
  const email = haalEmailUitPrincipal(req);
  const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
  if (!beheerder) { context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen voor beheerders." } }; return; }

  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "POST") {
      const { actie, naam, filter, id } = req.body || {};
      if (actie === "filterOpslaan") {
        const lijst = await filters.bewaar(email, naam, filter);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, filters: lijst } };
        return;
      }
      if (actie === "filterVerwijderen") {
        const lijst = await filters.verwijder(email, id);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, filters: lijst } };
        return;
      }
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } };
      return;
    }

    if (methode !== "GET") { context.res = { status: 405, body: { error: "Methode niet toegestaan." } }; return; }

    const [alle, lijsten, mijnFilters] = await Promise.all([
      vasteUitvragen.haalAlleGenormaliseerd(),
      haalLijsten(),
      filters.haalVoor(email),
    ]);
    const lijstNaam = new Map(lijsten.map((l) => [l.id, l.naam]));

    // Alle klant/lijst-combinaties mét een abonnement verzamelen.
    const ruwe = [];
    for (const [accountId, config] of Object.entries(alle)) {
      for (const [lijstId, item] of Object.entries(config)) {
        if (!item.abonnement) continue;
        ruwe.push({ accountId, lijstId, item });
      }
    }

    // Klantnamen ophalen (alleen als er iets is en Dynamics beschikbaar is).
    let namen = new Map();
    const resource = process.env.DYNAMICS_RESOURCE_URL;
    if (ruwe.length && resource) {
      try {
        const token = await haalDynamicsToken();
        namen = await haalAccountNamen(resource, token, ruwe.map((r) => r.accountId));
      } catch { /* namen blijven leeg; overzicht werkt nog met accountId */ }
    }

    const rijen = ruwe.map(({ accountId, lijstId, item }) => {
      const ab = item.abonnement;
      const naam = namen.get(accountId) || {};
      return {
        accountId,
        klantnaam: naam.klantnaam || "",
        klantnummer: naam.klantnummer || "",
        lijstId,
        lijstNaam: lijstNaam.get(lijstId) || "(verwijderde lijst)",
        contactNaam: item.contactNaam || "",
        actief: !!ab.actief,
        frequentie: ab.frequentie,
        startDatum: ab.startDatum,
        deadlineDagen: ab.deadlineDagen,
        modus: ab.modus,
        email: !!ab.email,
        laatsteRun: ab.laatsteRun || "",
        eerstvolgende: eerstvolgende(ab),
      };
    });
    rijen.sort((a, b) => (a.klantnaam || a.accountId).localeCompare(b.klantnaam || b.accountId) || a.lijstNaam.localeCompare(b.lijstNaam));

    context.res = { headers: { "Content-Type": "application/json" }, body: { rijen, filters: mijnFilters } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de abonnementen niet ophalen.", detail: String(err.message || err) } };
  }
};
