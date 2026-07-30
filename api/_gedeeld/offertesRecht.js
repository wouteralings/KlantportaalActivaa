/**
 * Serverkant-slot op de offertetool.
 *
 * Wie offertes en opdrachtbevestigingen mag maken wordt beheerd in het beheerdersportaal
 * (Beheer → Medewerkers → "Medewerkers — wijzig-rechten", kolom "Offertes") en opgeslagen in
 * wijzigrechten.json — zie api/_gedeeld/wijzigrechten.js. Het verbergen van de tab "Offertes"
 * in het medewerkersportaal is alleen een weergave-keuze; de echte grens ligt hier, want een
 * verborgen tab houdt niemand tegen die het API-pad kent.
 *
 * Gebruik in een Function:
 *
 *     const { metOffertesRecht } = require("../_gedeeld/offertesRecht");
 *     const handler = async function (context, req) { ... };
 *     module.exports = metOffertesRecht(handler);
 *
 * De Azure-rol 'beheerder' komt er altijd door, net als bij de andere rechten. De publieke
 * tekenpagina (/api/teken/*) mag hier nooit achter: die wordt door klanten zonder login
 * gebruikt en heeft dus per definitie geen medewerkersrol.
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("./identiteit");
const { magOffertes } = require("./wijzigrechten");

/** Mag deze aanvraag de offertetool gebruiken? Beheerders altijd; medewerkers als ze het recht hebben. */
async function magOffertesGebruiken(req) {
  const rollen = haalRollenUitPrincipal(req);
  if (rollen.includes("beheerder")) return true;
  return magOffertes(haalEmailUitPrincipal(req), false);
}

/** Wikkelt een Function-handler in de rechtencontrole hierboven. */
function metOffertesRecht(handler) {
  return async function (context, req) {
    let mag = false;
    try {
      mag = await magOffertesGebruiken(req);
    } catch (err) {
      // Kan de opslag niet gelezen worden, dan weigeren we — een fout in de rechtenopslag mag
      // nooit stilzwijgend uitmonden in toegang voor iedereen.
      if (context && context.log && context.log.error) context.log.error(err);
      mag = false;
    }
    if (!mag) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: {
          error:
            "Je hebt geen recht om offertes en opdrachtbevestigingen te maken. " +
            "Vraag een beheerder om dit recht toe te kennen via Beheer → Medewerkers.",
        },
      };
      return;
    }
    return handler(context, req);
  };
}

module.exports = { magOffertesGebruiken, metOffertesRecht };
