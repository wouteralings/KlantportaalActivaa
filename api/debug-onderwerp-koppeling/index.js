/**
 * TIJDELIJK diagnose-endpoint (03-08-2026) — helpt uitzoeken waarom een uitvraag niet automatisch in
 * het IB-dossier verscheen (zie "Beheer → Dossiers: uitvraaglijst gekoppeld aan dossier"). Alleen-
 * lezen, geen schrijfacties. Bedoeld om via de browser-adresbalk te bezoeken (geen DevTools nodig):
 *
 *   GET /api/debug-onderwerp-koppeling?klant=<zoekterm, optioneel>
 *
 * Geeft terug: alle onderwerpen (id+naam), het onderwerpId dat nu aan het IB-dossier is gekoppeld
 * (Beheer → Dossiers), en alle aanlever-verzoeken waarvan de klantnaam de zoekterm bevat (of alle
 * verzoeken als er geen zoekterm is) met hun onderwerpId/jaar/accountId — zodat in één oogopslag te
 * zien is of het onderwerpId van het dossier wel exact overeenkomt met het onderwerpId op het
 * verzoek. Weghalen zodra de koppeling weer werkt (of Wouter geeft aan hem niet meer nodig te hebben).
 *
 * Alleen medewerker/beheerder.
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalAlle } = require("../_gedeeld/aanleververzoeken");
const { haalOnderwerpen } = require("../_gedeeld/aanleveronderwerpen");
const { haalInstellingen } = require("../_gedeeld/instellingen");

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  try {
    const klantZoek = ((req.query && req.query.klant) || "").toLowerCase().trim();

    const [alleVerzoeken, onderwerpen, instellingen] = await Promise.all([
      haalAlle(),
      haalOnderwerpen(),
      haalInstellingen(),
    ]);

    const ibIndeling = (instellingen && instellingen.dossierIndeling && instellingen.dossierIndeling.ib) || null;

    const verzoeken = alleVerzoeken
      .filter((v) => !klantZoek || (v.klantnaam || "").toLowerCase().includes(klantZoek))
      .map((v) => ({
        id: v.id,
        klantnaam: v.klantnaam || "",
        accountId: v.accountId || "",
        lijstNaam: v.lijstNaam || "",
        jaar: v.jaar || "",
        onderwerpId: v.onderwerpId || null,
        onderwerp: v.onderwerp || null,
        status: v.status || "",
      }));

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        onderwerpIdOpDossierIB: (ibIndeling && ibIndeling.onderwerpId) || null,
        onderwerpen: (onderwerpen || []).map((o) => ({ id: o.id, naam: o.naam })),
        verzoeken,
      },
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Diagnose mislukt.", detail: String(err.message || err) } };
  }
};
