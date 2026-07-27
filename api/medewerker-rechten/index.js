const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Geeft terug of de ingelogde gebruiker klantgegevens mag wijzigen.
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
    const mag = await magWijzigen(email, beheerder).catch(() => false);
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: mag, beheerder } };
  } catch {
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: false, beheerder: false } };
  }
};
