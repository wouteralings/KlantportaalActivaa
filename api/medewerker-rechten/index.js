const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen, magBulk } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Geeft terug of de ingelogde gebruiker klantgegevens mag wijzigen en of hij bulk-aanpassingen mag doen.
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
    const mag = await magWijzigen(email, beheerder).catch(() => false);
    const bulk = await magBulk(email, beheerder).catch(() => false);
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: mag, magBulk: bulk, beheerder } };
  } catch {
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: false, magBulk: false, beheerder: false } };
  }
};
