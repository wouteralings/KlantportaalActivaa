/**
 * /api/beheer-planning-instellingen — beheer van de activiteiten- en statuslijsten van de
 * Planningsmodule (api/_gedeeld/planningInstellingen.js). Beveiligd via staticwebapp.config.json
 * (alleen rol 'beheerder').
 *
 *   GET → { activiteiten: [{ sleutel, label, type, actief }], statussen: [{ sleutel, label, kleur, actief }] }
 *   PUT body { activiteiten: [...], statussen: [...] } → overschrijft de lijsten (volgorde blijft behouden)
 */
const { haalInstellingen, zetInstellingen } = require("../_gedeeld/planningInstellingen");

module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const { activiteiten, statussen } = await haalInstellingen();
      context.res = { headers: { "Content-Type": "application/json" }, body: { activiteiten, statussen } };
      return;
    }
    if (req.method === "PUT") {
      const activiteiten = (req.body && req.body.activiteiten) || [];
      const statussen = (req.body && req.body.statussen) || [];
      if (!Array.isArray(activiteiten) || !Array.isArray(statussen)) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'activiteiten' en 'statussen' als lijsten mee." } };
        return;
      }
      const opgeslagen = await zetInstellingen({ activiteiten, statussen });
      context.res = { headers: { "Content-Type": "application/json" }, body: opgeslagen };
      return;
    }
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd (STORAGE_CONNECTION_STRING)." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij de planning-instellingen.", detail: String(err.message || err) } };
  }
};
