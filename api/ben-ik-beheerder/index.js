const { isBeheerder } = require("../_gedeeld/offertesOnboarding");

// Simpele check voor de client: mag deze ingelogde gebruiker het Instellingen-scherm zien
// en op verzoek een Dataverse-kolom aanmaken (zie api/dataverse-kolom-aanmaken)? Alleen
// lezend (GET), dus geen CSRF-header-check nodig (zelfde afweging als bij api/dataverse-status).
// Let op: dit endpoint is puur voor de UI (tonen/verbergen van beheerders-only onderdelen) —
// de daadwerkelijke afdwinging gebeurt hoe dan ook server-side in api/instellingen (PUT/DELETE)
// en api/dataverse-kolom-aanmaken zelf, dus een gemanipuleerd antwoord hier opent geen toegang.
module.exports = async function (context, req) {
  try {
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { beheerder: await isBeheerder(req) },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { beheerder: false },
    };
  }
};
