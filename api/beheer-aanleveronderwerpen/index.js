/**
 * /api/beheer-aanleveronderwerpen — beheer van de onderwerpen + opslaglocaties voor aanlever-
 * uitvragen. Beheerder-only (afgedwongen via de route in staticwebapp.config.json).
 *
 *   - GET → { onderwerpen: [...] }
 *   - PUT { onderwerpen: [...] } → volledige set overschrijven, geeft de genormaliseerde set terug
 */
const { haalOnderwerpen, zetOnderwerpen } = require("../_gedeeld/aanleveronderwerpen");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { onderwerpen: await haalOnderwerpen() } };
      return;
    }
    if (methode === "PUT" || methode === "POST") {
      const invoer = req.body && Array.isArray(req.body.onderwerpen) ? req.body.onderwerpen : null;
      if (!invoer) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'onderwerpen' (array) mee." } };
        return;
      }
      const onderwerpen = await zetOnderwerpen(invoer);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, onderwerpen } };
      return;
    }
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag (STORAGE_CONNECTION_STRING) is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de onderwerpen niet verwerken.", detail: String(err) } };
  }
};
