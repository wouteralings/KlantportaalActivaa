const { haalRechten, zetRechten } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET → { niveaus: { "<email>": "manager"|"beheerder" }, bulk: ["<email>"] }
 *       medewerker = standaard (niet opgeslagen).
 * PUT body { niveaus: {...}, bulk: [...] } → overschrijft de rechten.
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const { niveaus, bulk } = await haalRechten();
      context.res = { headers: { "Content-Type": "application/json" }, body: { niveaus, bulk } };
      return;
    }
    if (req.method === "PUT") {
      const niveaus = (req.body && req.body.niveaus) || {};
      const bulk = (req.body && req.body.bulk) || [];
      if (typeof niveaus !== "object" || Array.isArray(niveaus)) {
        context.res = { status: 400, body: { error: "Geef 'niveaus' (object van e-mail → niveau) mee." } };
        return;
      }
      if (!Array.isArray(bulk)) {
        context.res = { status: 400, body: { error: "Geef 'bulk' (lijst met e-mailadressen) mee." } };
        return;
      }
      const opgeslagen = await zetRechten({ niveaus, bulk });
      context.res = { headers: { "Content-Type": "application/json" }, body: opgeslagen };
      return;
    }
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij wijzigrechten.", detail: String(err) } };
  }
};
