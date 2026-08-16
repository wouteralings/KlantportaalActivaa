/**
 * /api/mw-planning-deelactiviteiten — de afvink-status van deelstappen (deelactiviteiten) per klant
 * per periode, plus de per-klant aangepaste deelstappen-lijsten. Het overzicht zelf (welke klanten
 * welke hoofdactiviteit hebben) wordt aan de voorkant samengesteld uit /api/mw-planning-config +
 * /api/beheer-klanten + /api/mw-planning-overzicht (de activiteiten incl. hun deelstappen-sjabloon).
 *
 * Beveiligd via de rol ('/*') én het granulaire Planning-recht (metPlanningRecht).
 *
 * GET  ?periode=YYYY-MM|YYYY[&eerdere=1]
 *        → { periode, status: { "<accountId>|<activiteit>|<deelstap>": { gereed, wie, datum } },
 *            klantDeelstappen: { "<accountId>|<activiteit>": [ { sleutel, label } ] },
 *            eerdereStatus: { "<periode>": { ...zelfde vorm als status } } }
 *      Met `eerdere=1` komt ook de status van de vóórliggende maanden van hetzelfde jaar mee. Daarmee
 *      kan een scherm werk dat in een eerdere maand niet is afgerond DOORSCHUIVEN naar de huidige
 *      maand, zodat het in zicht blijft. Alleen zinvol bij een maand-periode.
 * PUT  { actie: "afvink",      accountId, activiteit, periode, deelstap, gereed }   (deelstap of "__hoofd__")
 * PUT  { actie: "klantstappen", accountId, activiteit, deelstappen: [ { label } ] }
 */
const { haalEmailUitPrincipal, haalNaamUitPrincipal } = require("../_gedeeld/identiteit");
const { magPlanningLezen, magPlanningGebruiken } = require("../_gedeeld/planningRecht");
const { magStatus } = require("../_gedeeld/planningInstellingen");
const deel = require("../_gedeeld/planningDeelactiviteiten");

const verwerk = async function (context, req) {
  try {
    if (req.method === "GET") {
      const periode = (req.query && req.query.periode) || "";
      // Eerdere maanden van hetzelfde jaar (voor het doorschuiven van niet-afgerond werk).
      const eerdereGevraagd = String((req.query && req.query.eerdere) || "") === "1";
      const maandMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(periode));
      const eerderePeriodes = eerdereGevraagd && maandMatch
        ? Array.from({ length: Number(maandMatch[2]) - 1 }, (_, i) => `${maandMatch[1]}-${String(i + 1).padStart(2, "0")}`)
        : [];
      const [status, klantDeelstappen, eerdereStatus] = await Promise.all([
        deel.haalStatusVoorPeriode(periode),
        deel.haalAlleKlantDeelstappen(),
        eerderePeriodes.length ? deel.haalStatusVoorPeriodes(eerderePeriodes) : Promise.resolve({}),
      ]);
      context.res = { headers: { "Content-Type": "application/json" }, body: { periode, status, klantDeelstappen, eerdereStatus } };
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
      if (actie === "status") {
        const { accountId, activiteit, periode, status } = req.body || {};
        const wie = haalNaamUitPrincipal(req) || haalEmailUitPrincipal(req) || "";
        const datum = new Date().toISOString();
        try {
          if (status && !(await magStatus(status))) throw new Error("VALIDATIE: onbekende status. Ga naar Beheer → Planning om statussen te beheren.");
          const rec = await deel.zetActiviteitStatus(accountId, activiteit, periode, status || "", wie, datum);
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
};

// Aftekenen (GET status + PUT afvink) mag elke ingelogde MEDEWERKER — dat is "Mijn werk". Het per-klant
// aanpassen van de deelstappen-sjablonen (PUT klantstappen) blijft voorbehouden aan het Planning-recht.
// Klant-gastgebruikers hebben de rol 'medewerker' niet en worden geweerd (ook via de SWA-route-regel).
module.exports = async function (context, req) {
  if (!magPlanningLezen(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang tot de planning." } };
    return;
  }
  const actie = (req.method === "PUT" && req.body && req.body.actie) || "";
  if (actie === "klantstappen" && !(await magPlanningGebruiken(req))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen met het Planning-recht kun je de deelstappen-sjablonen aanpassen." } };
    return;
  }
  return verwerk(context, req);
};
