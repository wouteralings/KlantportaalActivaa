/**
 * /api/mw-uren-bron — de terugkoppeling van het gekoppelde urenschrijven: hoeveel uren zijn er al
 * geschreven vanuit een taak of vanuit een planningstaak? Zo kun je in het Taken-overzicht en in
 * "Mijn werk" de werkelijk geschreven uren naast de indicatie-uren zetten.
 *
 *   GET ?soort=taak      → { perBron: { "<activityid>": { uren, aantal } } }
 *   GET ?soort=planning  → { perBron: { "<accountId>|<activiteit>|<periode>": { uren, aantal } } }
 *
 * Bewust KANTOORBREED (alle medewerkers): op één planningstaak of taak kunnen meerdere mensen uren
 * schrijven, en de vraag is steeds "hoeveel is er in totaal aan besteed?". Alleen lezen; de
 * boekingen zelf blijven via /api/mw-uren-boekingen lopen.
 *
 * Beveiligd via staticwebapp.config.json (rol 'beheerder'/'medewerker'); de rol wordt hier ook zelf
 * gecontroleerd. Bestaan de bron-velden in Dataverse nog niet (uren-schema-setup nog niet opnieuw
 * gedraaid), dan komt er simpelweg een leeg overzicht terug.
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });
  if ((req.method || "GET").toUpperCase() !== "GET") return json(context, 405, { error: "Methode niet toegestaan." });

  const soort = String((req.query && req.query.soort) || "").trim().toLowerCase();
  if (!uren.BRON_SOORTEN.includes(soort)) {
    return json(context, 400, { error: `Geef een geldige soort mee (${uren.BRON_SOORTEN.join(" of ")}).` });
  }

  try {
    const perBron = await uren.urenPerBron(soort);
    return json(context, 200, { soort, perBron });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    // Nooit blokkerend: de schermen tonen dan gewoon geen geschreven uren.
    return json(context, 200, { soort, perBron: {} });
  }
};
