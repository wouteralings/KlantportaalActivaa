const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const {
  magWijzigen, magBulk, magAlsKlant, magOffertes, magContracten, magPlanning,
  magVerwijderIb, magVerwijderVpb, magVerwijderContactpersonen, magVerwijderDividendbelasting,
} = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Geeft terug of de ingelogde gebruiker klantgegevens mag wijzigen, bulk-aanpassingen mag doen,
 * (alleen-lezen) mag "meekijken als klant" (zie api/_gedeeld/identiteit.js → herleidAccounts),
 * offertes/opdrachtbevestigingen mag maken (de tab "Offertes"), de tab "Contracten" mag zien
 * (Contractmanagement-plan, Stap 3), en Inkomstenbelasting-/Vennootschapsbelasting-dossiers,
 * contactpersonen resp. dividendbelasting-aangiftes mag verwijderen. Voor offertes bepaalt dit
 * alleen of de tab wordt getoond; de echte grens ligt op de offerte-Functions zelf, zie
 * api/_gedeeld/offertesRecht.js. Voor contracten geldt dat vooralsnog ook (er is nog geen eigen
 * medewerkerskant-API om af te schermen — die komt met Stap 6). Voor de vier verwijder-rechten
 * ligt de echte grens wél al op de Functions zelf (medewerker-dossier resp.
 * medewerker-contactpersoon) — dividendbelasting uitgezonderd, die tab bestaat nog niet.
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
    const planning = await magPlanning(email, beheerder).catch(() => false);
    const verwijderIb = await magVerwijderIb(email, beheerder).catch(() => false);
    const verwijderVpb = await magVerwijderVpb(email, beheerder).catch(() => false);
    const verwijderContactpersonen = await magVerwijderContactpersonen(email, beheerder).catch(() => false);
    const verwijderDividendbelasting = await magVerwijderDividendbelasting(email, beheerder).catch(() => false);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        magWijzigen: mag, magBulk: bulk, magAlsKlant: alsKlant, magOffertes: offertes, magContracten: contracten,
        magPlanning: planning,
        magVerwijderIb: verwijderIb, magVerwijderVpb: verwijderVpb,
        magVerwijderContactpersonen: verwijderContactpersonen, magVerwijderDividendbelasting: verwijderDividendbelasting,
        beheerder,
      },
    };
  } catch {
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        magWijzigen: false, magBulk: false, magAlsKlant: false, magOffertes: false, magContracten: false,
        magPlanning: false,
        magVerwijderIb: false, magVerwijderVpb: false, magVerwijderContactpersonen: false, magVerwijderDividendbelasting: false,
        beheerder: false,
      },
    };
  }
};
