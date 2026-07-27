const { haalWijzigers, zetWijzigers } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET → { wijzigers: [emails] } — de medewerkers die mogen wijzigen.
 * PUT body { wijzigers: [emails] } → overschrijft de lijst.
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { wijzigers: await haalWijzigers() } };
      return;
    }
    if (req.method === "PUT") {
      const emails = (req.body && req.body.wijzigers) || [];
      if (!Array.isArray(emails)) {
        context.res = { status: 400, body: { error: "Geef 'wijzigers' (array van e-mailadressen) mee." } };
        return;
      }
      const opgeslagen = await zetWijzigers(emails);
      context.res = { headers: { "Content-Type": "application/json" }, body: { wijzigers: opgeslagen } };
      return;
    }
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij wijzigrechten.", detail: String(err) } };
  }
};
