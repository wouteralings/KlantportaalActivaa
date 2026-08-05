/**
 * /api/brief-sjablonen — de afzendergegevens + ACTIEVE briefsjablonen voor de Brieven-tab in het
 * medewerkersportaal (Klantoverzicht → Brieven). Rol beheerder + medewerker (zie
 * staticwebapp.config.json) — bewust NIET onder de authenticated-catch-all, zodat een ingelogde
 * klant deze interne sjablonen/afzendergegevens niet kan opvragen.
 *
 *   GET → { afzender, sharepointMap, sjablonen: [{ id, naam, onderwerp, tekst }] }
 *
 * Beheer (incl. niet-actieve sjablonen + bewerken) loopt via het aparte, beheerder-only
 * /api/beheer-briefsjablonen.
 */
const { haalVoorPortaal } = require("../_gedeeld/briefSjablonen");

module.exports = async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const data = await haalVoorPortaal();
    context.res = { headers: { "Content-Type": "application/json" }, body: data };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de briefsjablonen niet ophalen.", detail: String(err) } };
  }
};
