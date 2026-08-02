const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalStatussen, zetIngeschakeld } = require("../_gedeeld/contractenInstellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET → { statussen: { "<accountId>": { ingeschakeld, gewijzigdOp, gewijzigdDoor } } }
 * PUT body { accountId, ingeschakeld } → zet de Contractenmodule voor één klant aan/uit.
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const statussen = await haalStatussen();
      context.res = { headers: { "Content-Type": "application/json" }, body: { statussen } };
      return;
    }

    if (req.method === "PUT") {
      const { accountId, ingeschakeld } = req.body || {};
      if (!accountId) {
        context.res = { status: 400, body: { error: "Geef 'accountId' mee." } };
        return;
      }
      const email = haalEmailUitPrincipal(req);
      const opgeslagen = await zetIngeschakeld(accountId, !!ingeschakeld, email);
      context.res = { headers: { "Content-Type": "application/json" }, body: { accountId, ...opgeslagen } };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    if (typeof err.message === "string" && err.message.startsWith("VALIDATIE")) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het beheren van de Contractenmodule-status.", detail: String(err) },
    };
  }
};
