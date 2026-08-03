/**
 * Serverkant-slot voor de Contracten-medewerkerskant (mw-contracten-overzicht) — Contractmanagement-
 * plan, Stap 6.
 *
 * Wie het medewerkersoverzicht van Contracten mag zien wordt beheerd in het beheerdersportaal
 * (Beheer → Medewerkers → "Medewerkers — wijzig-rechten", kolom "Contracten") en opgeslagen in
 * wijzigrechten.json — zie api/_gedeeld/wijzigrechten.js (het recht zelf is al sinds Stap 3
 * beschikbaar, dit bestand voegt de bijbehorende serverkant-afdwinging toe, exact naar het patroon
 * van offertesRecht.js). Het verbergen van de tab "Contracten" in het medewerkersportaal (zie
 * MedewerkerPortaal.jsx) is alleen een weergave-keuze; de echte grens ligt hier, want een verborgen
 * tab houdt niemand tegen die het API-pad kent.
 *
 * Gebruik in een Function:
 *
 *     const { metContractenRecht } = require("../_gedeeld/contractenRecht");
 *     const handler = async function (context, req) { ... };
 *     module.exports = metContractenRecht(handler);
 *
 * De Azure-rol 'beheerder' komt er altijd door, net als bij de andere rechten (magOffertes,
 * magAlsKlant, etc.).
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("./identiteit");
const { magContracten } = require("./wijzigrechten");

/** Mag deze aanvraag het Contracten-medewerkersoverzicht gebruiken? Beheerders altijd; medewerkers als ze het recht hebben. */
async function magContractenOverzichtGebruiken(req) {
  const rollen = haalRollenUitPrincipal(req);
  if (rollen.includes("beheerder")) return true;
  return magContracten(haalEmailUitPrincipal(req), false);
}

/** Wikkelt een Function-handler in de rechtencontrole hierboven. */
function metContractenRecht(handler) {
  return async function (context, req) {
    let mag = false;
    try {
      mag = await magContractenOverzichtGebruiken(req);
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
            "Je hebt geen recht om het Contracten-overzicht te bekijken. " +
            "Vraag een beheerder om dit recht toe te kennen via Beheer → Medewerkers.",
        },
      };
      return;
    }
    return handler(context, req);
  };
}

module.exports = { magContractenOverzichtGebruiken, metContractenRecht };
