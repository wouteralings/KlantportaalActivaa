/**
 * /api/beheer-projecten-koppeling — beheerder-only, per-klant aan/uit-schakelaar voor de
 * Project-koppeling in de Uren-module ("projectenGekoppeld", zie api/_gedeeld/projectenInstellingen.js).
 * Route-beveiliging (rol beheerder) loopt via staticwebapp.config.json.
 *
 *   GET               → { statussen: { "<accountId>": { gekoppeld, gewijzigdOp, ... } } }
 *   PUT body { accountId, gekoppeld }  → zet er één
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalStatussen, zetGekoppeld } = require("../_gedeeld/projectenInstellingen");

module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const statussen = await haalStatussen();
      context.res = { headers: { "Content-Type": "application/json" }, body: { statussen } };
      return;
    }

    if (req.method === "PUT") {
      const accountId = req.body && req.body.accountId;
      if (!accountId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "accountId is verplicht." } };
        return;
      }
      const email = haalEmailUitPrincipal(req);
      const opgeslagen = await zetGekoppeld(accountId, !!(req.body && req.body.gekoppeld), email);
      context.res = { headers: { "Content-Type": "application/json" }, body: { accountId, ...opgeslagen } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout.", detail: String(err.message || err) },
    };
  }
};
