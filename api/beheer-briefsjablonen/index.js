/**
 * /api/beheer-briefsjablonen — beheer van de Brieven-module (afzendergegevens, sjablonen,
 * SharePoint-submap). Beheerder-only (afgedwongen via de route in staticwebapp.config.json),
 * zelfde opzet als beheer-contractentypes.
 *
 *   - GET → { afzender, sharepointMap, sjablonen: [...] }   (incl. niet-actieve sjablonen)
 *   - PUT { afzender, sharepointMap, sjablonen } → hele configuratie overschrijven; geeft de
 *          genormaliseerde configuratie terug
 */
const { haalConfig, zetConfig } = require("../_gedeeld/briefSjablonen");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: await haalConfig() };
      return;
    }
    if (methode === "PUT" || methode === "POST") {
      const invoer = req.body && typeof req.body === "object" ? req.body : null;
      if (!invoer) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een configuratie-object mee." } };
        return;
      }
      const config = await zetConfig(invoer);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, ...config } };
      return;
    }
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag (STORAGE_CONNECTION_STRING) is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de briefsjablonen niet verwerken.", detail: String(err) } };
  }
};
