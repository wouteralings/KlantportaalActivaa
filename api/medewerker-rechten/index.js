const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen, magBulk, magAlsKlant, magOffertes, magContracten } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Geeft terug of de ingelogde gebruiker klantgegevens mag wijzigen, bulk-aanpassingen mag doen,
 * (alleen-lezen) mag "meekijken als klant" (zie api/_gedeeld/identiteit.js → herleidAccounts),
 * offertes/opdrachtbevestigingen mag maken (de tab "Offertes"), en de tab "Contracten" mag zien
 * (Contractmanagement-plan, Stap 3). Voor offertes bepaalt dit alleen of de tab wordt getoond;
 * de echte grens ligt op de offerte-Functions zelf, zie api/_gedeeld/offertesRecht.js. Voor
 * contracten geldt dat vooralsnog ook (er is nog geen eigen medewerkerskant-API om af te
 * schermen — die komt met Stap 6).
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
    const mag = await magWijzigen(email, beheerder).catch(() => false);
    const bulk = await magBulk(email, beheerder).catch(() => false);
    const alsKlant = await magAlsKlant(email, beheerder).catch(() => false);
    const offertes = await magOffertes(email, beheerder).catch(() => false);
    const contracten = await magContracten(email, beheerder).catch(() => false);
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: mag, magBulk: bulk, magAlsKlant: alsKlant, magOffertes: offertes, magContracten: contracten, beheerder } };
  } catch {
    context.res = { headers: { "Content-Type": "application/json" }, body: { magWijzigen: false, magBulk: false, magAlsKlant: false, magOffertes: false, magContracten: false, beheerder: false } };
  }
};
