/**
 * /api/mw-planning-maand-toewijzing — eenmalige (per-maand) toewijzing van planning-configuratie-
 * regels aan een andere medewerker, voor de maandplanning. Verandert NIET de vaste toewijzing van
 * de regel (dat is /api/mw-planning-config), maar legt alleen voor die ene maand een uitzondering
 * vast. Beveiligd via de rol (staticwebapp.config.json '/*') én het granulaire Planning-recht.
 *
 * GET  ?maand=YYYY-MM              → { maand, toewijzingen: { "<regelId>": "<naam>" } }
 * PUT  { id, maand, naam }         → zet (of, bij lege naam, verwijdert) de eenmalige toewijzing.
 */
const { metPlanningRecht } = require("../_gedeeld/planningRecht");
const maandToewijzing = require("../_gedeeld/planningMaandToewijzing");

module.exports = metPlanningRecht(async function (context, req) {
  try {
    if (req.method === "GET") {
      const maand = (req.query && req.query.maand) || "";
      const toewijzingen = await maandToewijzing.haalVoorMaand(maand);
      context.res = { headers: { "Content-Type": "application/json" }, body: { maand, toewijzingen } };
      return;
    }

    if (req.method === "PUT") {
      const id = req.body && req.body.id;
      const maand = req.body && req.body.maand;
      const naam = req.body ? req.body.naam : "";
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef de regel (id) mee." } };
        return;
      }
      try {
        const nieuw = await maandToewijzing.zet(id, maand, naam);
        context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true, naam: nieuw } };
      } catch (e) {
        const validatie = String(e.message || "").startsWith("VALIDATIE:");
        context.res = { status: validatie ? 400 : 500, headers: { "Content-Type": "application/json" }, body: { error: validatie ? e.message.replace("VALIDATIE: ", "") : "Kon de eenmalige toewijzing niet opslaan." } };
      }
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "STORAGE_CONNECTION_STRING ontbreekt." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout.", detail: String(err.message || err) } };
  }
});
