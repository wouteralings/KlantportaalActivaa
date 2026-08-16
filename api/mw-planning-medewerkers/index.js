/**
 * /api/mw-planning-medewerkers — de lijst medewerkers (naam + e-mail) voor de zoek-/kies-velden in
 * de Planningsmodule (Stap 3c: "medewerkers doorzoekbaar net als klanten"). Komt uit de interne
 * urentarieven (cr283_urentarief, één rij per medewerker; zie urenDataverse.lijstTarieven) — dezelfde
 * bron als de bezetting. Beveiligd via staticwebapp.config.json (medewerker/beheerder) + metPlanningRecht.
 *
 * GET → { medewerkers: [{ naam, email }] } (alleen actieve, op naam gesorteerd)
 */
const { magPlanningLezen } = require("../_gedeeld/planningRecht");
const uren = require("../_gedeeld/urenDataverse");

// Bewust op magPlanningLezen (elke ingelogde MEDEWERKER) i.p.v. het granulaire Planning-recht: dit is
// niet meer dan de namenlijst van collega's, en hij wordt inmiddels ook buiten de Planning gebruikt —
// o.a. door de reviewkiezer in het dossier (zie api/_gedeeld/dossierReview.js). Klant-gastgebruikers
// hebben de rol 'medewerker' niet en komen er dus nog steeds niet in.
module.exports = async function (context, req) {
  if (!magPlanningLezen(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const tarieven = await uren.lijstTarieven();
    const medewerkers = tarieven
      .filter((t) => t.actief !== false && (t.medewerker_naam || t.medewerker_email))
      .map((t) => ({ naam: t.medewerker_naam || t.medewerker_email, email: t.medewerker_email || "" }))
      .sort((a, b) => String(a.naam).localeCompare(String(b.naam), "nl"));
    context.res = { headers: { "Content-Type": "application/json" }, body: { medewerkers } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de medewerkerslijst niet ophalen.", detail: String(err.message || err) } };
  }
};
