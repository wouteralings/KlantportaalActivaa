/**
 * /api/brief-kenmerk — kent één uniek briefkenmerk toe (jaar-klantnummer-volgnummer).
 * Rol beheerder + medewerker (route in staticwebapp.config.json).
 *
 * De frontend vraagt dit één keer aan bij de eerste verstuur-/genereeractie op een brief, toont het
 * (niet-bewerkbaar) en stuurt het daarna in het brief-object mee. Zo krijgt elke brief precies één
 * uniek kenmerk dat op de brief én in het logboek terechtkomt.
 *
 *   POST { klantnummer }  → { kenmerk: "2026-1023-0001" }
 */
const { genereerKenmerk } = require("../_gedeeld/briefKenmerk");

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const klantnummer = (req.body && req.body.klantnummer) != null ? req.body.klantnummer : "";
    const kenmerk = await genereerKenmerk(klantnummer);
    context.res = { headers: { "Content-Type": "application/json" }, body: { kenmerk } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd (STORAGE_CONNECTION_STRING)." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon geen kenmerk toekennen.", detail: String(err) } };
  }
};
