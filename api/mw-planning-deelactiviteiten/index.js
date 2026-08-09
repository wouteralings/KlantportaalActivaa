/**
 * /api/mw-planning-deelactiviteiten — de afvink-status van deelstappen (deelactiviteiten) per klant
 * per periode, plus de per-klant aangepaste deelstappen-lijsten. Het overzicht zelf (welke klanten
 * welke hoofdactiviteit hebben) wordt aan de voorkant samengesteld uit /api/mw-planning-config +
 * /api/beheer-klanten + /api/mw-planning-overzicht (de activiteiten incl. hun deelstappen-sjabloon).
 *
 * Beveiligd via de rol ('/*') én het granulaire Planning-recht (metPlanningRecht).
 *
 * GET  ?periode=YYYY-MM|YYYY
 *        → { periode, status: { "<accountId>|<activiteit>|<deelstap>": { gereed, wie, datum } },
 *            klantDeelstappen: { "<accountId>|<activiteit>": [ { sleutel, label } ] } }
 * PUT  { actie: "afvink",      accountId, activiteit, periode, deelstap, gereed }   (deelstap of "__hoofd__")
 * PUT  { actie: "klantstappen", accountId, activiteit, deelstappen: [ { label } ] }
 */
const { haalEmailUitPrincipal, haalNaamUitPrincipal } = require("../_gedeeld/identiteit");
const { metPlanningRecht } = require("../_gedeeld/planningRecht");
const deel = require("../_gedeeld/planningDeelactiviteiten");

module.exports = metPlanningRecht(async function (context, req) {
  try {
    if (req.method === "GET") {
      const periode = (req.query && req.query.periode) || "";
      const [status, klantDeelstappen] = await Promise.all([
        deel.haalStatusVoorPeriode(periode),
        deel.haalAlleKlantDeelstappen(),
      ]);
      context.res = { headers: { "Content-Type": "application/json" }, body: { periode, status, klantDeelstappen } };
      return;
    }

    if (req.method === "PUT") {
      const actie = (req.body && req.body.actie) || "";
      if (actie === "afvink") {
        const { accountId, activiteit, periode, deelstap, gereed } = req.body || {};
        const wie = haalNaamUitPrincipal(req) || haalEmailUitPrincipal(req) || "";
        const datum = new Date().toISOString();
        try {
          const rec = await deel.zetStatus(accountId, activiteit, periode, deelstap, !!gereed, wie, datum);
          context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true, status: rec } };
        } catch (e) {
          const v = String(e.message || "").startsWith("VALIDATIE:");
          context.res = { status: v ? 400 : 500, headers: { "Content-Type": "application/json" }, body: { error: v ? e.message.replace("VALIDATIE: ", "") : "Kon de status niet opslaan." } };
        }
        return;
      }
      if (actie === "klantstappen") {
        const { accountId, activiteit, deelstappen } = req.body || {};
        try {
          const lijst = await deel.zetKlantDeelstappen(accountId, activiteit, deelstappen);
          context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true, deelstappen: lijst } };
        } catch (e) {
          const v = String(e.message || "").startsWith("VALIDATIE:");
          context.res = { status: v ? 400 : 500, headers: { "Content-Type": "application/json" }, body: { error: v ? e.message.replace("VALIDATIE: ", "") : "Kon de deelstappen niet opslaan." } };
        }
        return;
      }
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } };
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
