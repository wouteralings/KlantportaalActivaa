/**
 * /api/artikelen-algemeen — de centraal (door Activaa, via Beheer) beheerde artikelen die
 * voor ELKE klant beschikbaar zijn (dbo.artikelen_algemeen), read-only voor klanten.
 * Aanmaken/wijzigen/verwijderen gebeurt via /api/beheer-artikelen-algemeen.
 *
 *   GET /api/artikelen-algemeen?accountId=...  → { artikelen: [...] }
 *
 * accountId is verplicht (zelfde afspraak als de andere facturatie-endpoints, zie
 * api/_gedeeld/facturatieToegang.js) — de artikelen zelf zijn niet per klant, maar we
 * controleren wel dat de aanvrager een ingelogde portaalklant met een geldige koppeling is.
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalArtikelenAlgemeen } = require("../_gedeeld/artikelenAlgemeen");

module.exports = async function (context, req) {
  try {
    await controleerToegang(req);

    if (req.method === "GET") {
      const artikelen = await haalArtikelenAlgemeen({ alleenActief: true });
      context.res = { headers: { "Content-Type": "application/json" }, body: { artikelen } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
