const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen, magBulk, magAlsKlant } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Geeft terug of de ingelogde gebruiker klantgegevens mag wijzigen, bulk-aanpassingen mag doen,
 * en (alleen-lezen) mag "meekijken als klant" (zie api/_gedeeld/identiteit.js → herleidAccounts).
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
    const mag = await magWijzigen(email, beheerder).catch(() => false);
    const bulk = await magBulk(email, beheerder).catch(() => false);
    const alsKlant = await magAlsKlant(email, beheerder).catch(() => false);
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: mag, magBulk: bulk, magAlsKlant: alsKlant, beheerder } };
  } catch {
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: false, magBulk: false, magAlsKlant: false, beheerder: false } };
  }
};
