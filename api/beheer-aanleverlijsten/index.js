/**
 * /api/beheer-aanleverlijsten — beheer van de herbruikbare aanleverlijsten (sjablonen van uit te
 * vragen documenten). Beheerder-only (afgedwongen via de route in staticwebapp.config.json).
 *
 *   - GET → { lijsten: [...] }
 *   - PUT { lijsten: [...] } → volledige set overschrijven, geeft de genormaliseerde set terug
 */
const { haalLijsten, zetLijsten } = require("../_gedeeld/aanleverlijsten");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      const lijsten = await haalLijsten();
      context.res = { headers: { "Content-Type": "application/json" }, body: { lijsten } };
      return;
    }

    if (methode === "PUT" || methode === "POST") {
      const invoer = req.body && Array.isArray(req.body.lijsten) ? req.body.lijsten : null;
      if (!invoer) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'lijsten' (array) mee." } };
        return;
      }
      const lijsten = await zetLijsten(invoer);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, lijsten } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag (STORAGE_CONNECTION_STRING) is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de aanleverlijsten niet verwerken.", detail: String(err) } };
  }
};
