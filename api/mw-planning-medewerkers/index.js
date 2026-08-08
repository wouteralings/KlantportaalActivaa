/**
 * /api/mw-planning-medewerkers — de lijst medewerkers (naam + e-mail) voor de zoek-/kies-velden in
 * de Planningsmodule (Stap 3c: "medewerkers doorzoekbaar net als klanten"). Komt uit de interne
 * urentarieven (cr283_urentarief, één rij per medewerker; zie urenDataverse.lijstTarieven) — dezelfde
 * bron als de bezetting. Beveiligd via staticwebapp.config.json (medewerker/beheerder) + metPlanningRecht.
 *
 * GET → { medewerkers: [{ naam, email }] } (alleen actieve, op naam gesorteerd)
 */
const { metPlanningRecht } = require("../_gedeeld/planningRecht");
const uren = require("../_gedeeld/urenDataverse");

module.exports = metPlanningRecht(async function (context, req) {
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
});
