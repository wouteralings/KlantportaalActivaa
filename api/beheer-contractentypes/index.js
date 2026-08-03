/**
 * /api/beheer-contractentypes — beheer van de contracttype-lijst (Contractenmodule). Beheerder-only
 * (afgedwongen via de route in staticwebapp.config.json), zelfde opzet als beheer-aanleveronderwerpen.
 *
 *   - GET → { types: [...] }  (incl. niet-actieve, zodat het beheerscherm ze ook kan tonen/heractiveren)
 *   - PUT { types: [...] } → volledige set overschrijven, geeft de genormaliseerde set terug
 */
const { haalTypes, zetTypes } = require("../_gedeeld/contractenTypes");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { types: await haalTypes() } };
      return;
    }
    if (methode === "PUT" || methode === "POST") {
      const invoer = req.body && Array.isArray(req.body.types) ? req.body.types : null;
      if (!invoer) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'types' (array) mee." } };
        return;
      }
      const types = await zetTypes(invoer);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, types } };
      return;
    }
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag (STORAGE_CONNECTION_STRING) is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de contracttypes niet verwerken.", detail: String(err) } };
  }
};
