/**
 * /api/beheer-ritten-klanten — beheerder-only, per-klant aan/uit-schakelaar voor de
 * Rittenregistratie (dbo-onafhankelijk, blob-opslag via api/_gedeeld/rittenInstellingen.js).
 * Route-beveiliging (rol beheerder) loopt via staticwebapp.config.json, zelfde patroon als
 * /api/beheer-facturatie-klanten en /api/beheer-uren-klanten.
 *
 *   GET               → { statussen: { "<accountId>": { ingeschakeld, gewijzigdOp, ... } } }
 *   PUT body { accountId, ingeschakeld }  → zet er één
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalStatussen, zetIngeschakeld } = require("../_gedeeld/rittenInstellingen");

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
      const opgeslagen = await zetIngeschakeld(accountId, !!(req.body && req.body.ingeschakeld), email);
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
