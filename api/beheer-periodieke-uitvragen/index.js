/**
 * /api/beheer-periodieke-uitvragen — beheer van de periodieke (geautomatiseerde) aanlever-uitvragen.
 * Beheerder-only (afgedwongen via de route in staticwebapp.config.json).
 *
 *   - GET → { schemas: [...], onderwerpen: [...] }   (onderwerpen voor de keuzelijst)
 *   - PUT { schemas: [...] } → volledige set overschrijven, geeft de genormaliseerde set terug
 */
const { haalSchemas, zetSchemas } = require("../_gedeeld/periodiekeuitvragen");
const { haalOnderwerpen } = require("../_gedeeld/aanleveronderwerpen");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      const [schemas, onderwerpen] = await Promise.all([haalSchemas(), haalOnderwerpen()]);
      context.res = { headers: { "Content-Type": "application/json" }, body: { schemas, onderwerpen } };
      return;
    }
    if (methode === "PUT" || methode === "POST") {
      const invoer = req.body && Array.isArray(req.body.schemas) ? req.body.schemas : null;
      if (!invoer) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'schemas' (array) mee." } };
        return;
      }
      const schemas = await zetSchemas(invoer);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, schemas } };
      return;
    }
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de periodieke uitvragen niet verwerken.", detail: String(err) } };
  }
};
