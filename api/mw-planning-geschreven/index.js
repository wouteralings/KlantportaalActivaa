/**
 * /api/mw-planning-geschreven — de geschreven uren van een periode, per medewerker × cliënt × soort.
 * Bedoeld voor de Planning-weergave "Gepland vs geschreven": de planner legt de geplande
 * (indicatie-)uren uit de planning-configuratie naast wat er werkelijk op die klant is geschreven, en
 * ziet zo of een overschrijding op de **standaard dienstverlening** (abonnement → derving) of op
 * **meerwerk** (UXT → apart te factureren) staat.
 *
 *   GET ?maand=YYYY-MM  → de betreffende maand
 *   GET ?jaar=YYYY      → het hele jaar
 *   → { periode, vanaf, tot, rijen: [{ email, naam, accountId, klantnaam, soort, uren, bedrag }] }
 *
 * Alle statussen tellen mee (concept t/m gefactureerd) — het gaat om wat er is besteed, niet om wat
 * er al is goedgekeurd. Kantoorbreed: een planner wil juist over alle medewerkers heen kunnen kijken.
 * Beveiligd via staticwebapp.config.json én het granulaire Planning-recht (metPlanningRecht).
 */
const { metPlanningRecht } = require("../_gedeeld/planningRecht");
const uren = require("../_gedeeld/urenDataverse");

const pad = (n) => String(n).padStart(2, "0");

module.exports = metPlanningRecht(async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const jaarParam = req.query && req.query.jaar ? Number(req.query.jaar) : null;
    let vanaf, tot, periode;
    if (jaarParam && jaarParam >= 2000 && jaarParam <= 2100) {
      vanaf = `${jaarParam}-01-01`;
      tot = `${jaarParam}-12-31`;
      periode = String(jaarParam);
    } else {
      const maand = (req.query && req.query.maand) || "";
      const [j, m] = String(maand).split("-").map(Number);
      if (!j || !m || m < 1 || m > 12) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef maand als YYYY-MM of jaar als YYYY mee." } };
        return;
      }
      const laatsteDag = new Date(Date.UTC(j, m, 0)).getUTCDate();
      vanaf = `${j}-${pad(m)}-01`;
      tot = `${j}-${pad(m)}-${pad(laatsteDag)}`;
      periode = `${j}-${pad(m)}`;
    }

    const rijen = await uren.geschrevenPerKlant({ vanaf, tot });
    context.res = { headers: { "Content-Type": "application/json" }, body: { periode, vanaf, tot, rijen } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de geschreven uren niet ophalen.", detail: String(err.message || err) } };
  }
});
