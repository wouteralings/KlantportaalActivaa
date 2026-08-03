/**
 * /api/contracten-typeopties — de ACTIEVE contracttypes, voor de keuzelijst bij het aanmaken/
 * wijzigen van een contract (klantportaal én medewerkersoverzicht). Geen aparte rol-restrictie
 * nodig in staticwebapp.config.json — valt onder de bestaande /*-catch-all ("authenticated"),
 * zelfde als api/contracten-aanvraag. Beheer (incl. niet-actieve types) loopt via het aparte,
 * beheerder-only /api/beheer-contractentypes.
 *
 *   GET → { typen: [{ sleutel, label }] }
 */
const { haalActieveTypes } = require("../_gedeeld/contractenTypes");

module.exports = async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const types = await haalActieveTypes();
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { typen: types.map((t) => ({ sleutel: t.sleutel, label: t.label })) },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de contracttypes niet ophalen.", detail: String(err) } };
  }
};
