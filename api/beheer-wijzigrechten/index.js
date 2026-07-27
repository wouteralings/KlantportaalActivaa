const { haalNiveaus, zetNiveaus } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET → { niveaus: { "<email>": "manager"|"beheerder" } } — medewerker = standaard (niet opgeslagen).
 * PUT body { niveaus: {...} } → overschrijft de niveaus.
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { niveaus: await haalNiveaus() } };
      return;
    }
    if (req.method === "PUT") {
      const niveaus = (req.body && req.body.niveaus) || {};
      if (typeof niveaus !== "object" || Array.isArray(niveaus)) {
        context.res = { status: 400, body: { error: "Geef 'niveaus' (object van e-mail → niveau) mee." } };
        return;
      }
      const opgeslagen = await zetNiveaus(niveaus);
      context.res = { headers: { "Content-Type": "application/json" }, body: { niveaus: opgeslagen } };
      return;
    }
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij wijzigrechten.", detail: String(err) } };
  }
};
