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
 *
 * Toegang & SCOPE — je krijgt alleen de uren te zien die je mag zien:
 *   - beheerder of het granulaire Planning-recht → kantoorbreed (alles);
 *   - LEIDINGGEVENDE → zijn eigen uren plus die van de medewerkers waarvoor hij in
 *     Beheer → Uren → "Tarieven & deadline per medewerker" als leidinggevende staat;
 *   - overige medewerkers → alleen hun eigen uren.
 * De filtering gebeurt hier op de server: de route-regel in staticwebapp.config.json houdt alleen
 * klanten tegen, dus een verborgen scherm is geen grens.
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { magPlanningLezen, magPlanningGebruiken } = require("../_gedeeld/planningRecht");
const uren = require("../_gedeeld/urenDataverse");

/**
 * De e-mailadressen die deze aanvrager mag zien: zichzelf + zijn team. "Zijn team" = iedereen die in
 * de urentarieven deze persoon als leidinggevende heeft. De naam waarop we matchen komt uit de
 * urentarief-rij van de aanvrager zelf, dus uit exact dezelfde lijst als waar de leidinggevende-namen
 * zijn gekozen — zo kan er geen schrijfwijze-verschil tussen twee bronnen ontstaan.
 */
function zichtbareEmails(tarieven, mijnEmail) {
  const mij = String(mijnEmail || "").trim().toLowerCase();
  const zichtbaar = new Set(mij ? [mij] : []);
  const mijnRij = tarieven.find((t) => String(t.medewerker_email || "").trim().toLowerCase() === mij);
  const mijnNaam = String((mijnRij && mijnRij.medewerker_naam) || "").trim().toLowerCase();
  for (const t of tarieven) {
    const leiding = String(t.leidinggevende || "").trim().toLowerCase();
    if (!leiding) continue;
    // Meestal staat hier de naam; een e-mailadres accepteren we ook, voor de zekerheid.
    if ((mijnNaam && leiding === mijnNaam) || (mij && leiding === mij)) {
      const e = String(t.medewerker_email || "").trim().toLowerCase();
      if (e) zichtbaar.add(e);
    }
  }
  return zichtbaar;
}

const pad = (n) => String(n).padStart(2, "0");

const verwerk = async function (context, req) {
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

    const alles = await magPlanningGebruiken(req).catch(() => false);
    const alleRijen = await uren.geschrevenPerKlant({ vanaf, tot });
    let rijen = alleRijen;
    let scope = "alles";
    if (!alles) {
      const tarieven = await uren.lijstTarieven().catch(() => []);
      const mag = zichtbareEmails(tarieven, haalEmailUitPrincipal(req));
      rijen = alleRijen.filter((r) => mag.has(String(r.email || "").trim().toLowerCase()));
      scope = mag.size > 1 ? "team" : "eigen";
    }
    context.res = { headers: { "Content-Type": "application/json" }, body: { periode, vanaf, tot, scope, rijen } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de geschreven uren niet ophalen.", detail: String(err.message || err) } };
  }
};

module.exports = async function (context, req) {
  if (!magPlanningLezen(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  return verwerk(context, req);
};
