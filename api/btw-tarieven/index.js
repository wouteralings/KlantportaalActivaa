/**
 * /api/btw-tarieven — de op dit moment geldige BTW-tarieven (klant-facing), voor de
 * BTW-keuzelijst bij het aanmaken/bewerken van een artikel. Voor de volledige historie
 * en het toevoegen/corrigeren van tarieven, zie /api/beheer-btw-tarieven.
 *
 *   GET /api/btw-tarieven?accountId=...  → { tarieven: [...] }
 *
 * accountId is verplicht (zelfde afspraak als de andere facturatie-endpoints, zie
 * api/_gedeeld/facturatieToegang.js) zodat alleen ingelogde portaalklanten met een
 * geldige koppeling deze lijst kunnen opvragen — de tarieven zelf zijn niet per klant.
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalActueleTarieven } = require("../_gedeeld/btwTarieven");

module.exports = async function (context, req) {
  try {
    await controleerToegang(req);

    if (req.method === "GET") {
      const tarieven = await haalActueleTarieven();
      context.res = { headers: { "Content-Type": "application/json" }, body: { tarieven } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
