/**
 * /api/brief-dynamics-velden — leest de velden van de Dynamics-tabel "Brieven" (cr283_brief) uit,
 * zodat de beheerder in Beheer → Brieven per standaardparagraaf een voorwaarde kan kiezen op een
 * ja/nee-veld of optielijst (mét opties), en zodat we het klant-lookupveld automatisch vinden.
 * Beheerder-only (route in staticwebapp.config.json).
 *
 *   GET [?entiteit=cr283_brief]
 *     → { entiteit, entitySet, primaryId, primaryName, booleans[], optielijsten[], lookups[], klantVeldVoorstel }
 *
 * De logische tabelnaam komt uit ?entiteit=, anders uit App Setting DYNAMICS_BRIEF_ENTITEIT,
 * anders de standaard 'cr283_brief'.
 */
const { haalSchema } = require("../_gedeeld/briefDynamics");

module.exports = async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const entiteit = (req.query && (req.query.entiteit || req.query.entity)) || "";
    const schema = await haalSchema(entiteit);
    context.res = { headers: { "Content-Type": "application/json" }, body: schema };
  } catch (err) {
    if (err.code === "MISSING_DYNAMICS" || err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Kon de velden van de Brieven-tabel niet ophalen. Controleer of DYNAMICS_BRIEF_ENTITEIT de juiste logische tabelnaam is (standaard cr283_brief) en of de app leesrechten op die tabel heeft.", detail: String(err) },
    };
  }
};
