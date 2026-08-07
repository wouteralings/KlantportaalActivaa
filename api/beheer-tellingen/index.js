/**
 * Lichtgewicht tellingen voor de badges op de beheer-/medewerkerstabbladen:
 *  - openWijzigingen      : aantal wijzigingsverzoeken met status "open" (nog af te handelen)
 *  - nieuweReviews        : aantal reviews binnengekomen sinds de beheerder ze voor het laatst bekeek
 *  - vragenlijstenAandacht: aantal vragenlijsten die nog aandacht nodig hebben (open, of afgerond
 *                           maar nog niet door een medewerker geaccepteerd) mét klant-activiteit
 *                           (aangeleverd/afgemeld of een vraag) sinds medewerkers de tab
 *                           "Vragenlijsten" voor het laatst openden
 *
 * GET  → { openWijzigingen, nieuweReviews, vragenlijstenAandacht, laatstGezien }
 * POST { actie: "reviews-gezien" }       → markeert de reviews als gezien (zet de teller op 0)
 * POST { actie: "vragenlijsten-gezien" } → markeert de vragenlijsten als gezien (zet de teller op 0)
 */
const { haalReviews, haalReviewGezien, zetReviewGezien } = require("../_gedeeld/reviewopslag");
const { haalAlleVerzoeken } = require("../_gedeeld/wijzigingen");
const { haalAlleAkkoorden, haalReactiesGezien, zetReactiesGezien } = require("../_gedeeld/taakakkoorden");
const aanleververzoeken = require("../_gedeeld/aanleververzoeken");
const { haalDynamicsToken, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { DYNAMICS_HEADERS, haalSystemuser } = require("../_gedeeld/takenGedeeld");
const takenGezien = require("../_gedeeld/takenGezien");

/**
 * Telt de "nieuwe" openstaande taken van de ingelogde medewerker zelf (eigenaar) sinds hij het
 * tabblad Taken voor het laatst opende — de bron voor de rode badge. Per medewerker (eigen
 * gezien-moment), niet kantoorbreed. Best-effort: bij een ontbrekende Dynamics-koppeling of een
 * fout geeft dit 0 terug, zodat de overige tellingen gewoon blijven werken.
 */
async function telMijnNieuweTaken(email) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource || !email) return 0;
  try {
    const token = await haalDynamicsToken();
    const mij = await haalSystemuser(resource, token, email);
    if (!mij.id) return 0;
    const sinds = await takenGezien.haalGezien(email).catch(() => null);
    let filter = `statecode eq 0 and _ownerid_value eq ${mij.id}`;
    if (sinds) filter += ` and createdon gt ${new Date(sinds).toISOString()}`;
    const url = `${resource}/api/data/v9.2/tasks?$select=activityid&$count=true&$filter=${encodeURIComponent(filter)}`;
    const res = await fetch(url, { headers: { ...DYNAMICS_HEADERS(token), Prefer: "odata.maxpagesize=1" } });
    if (!res.ok) return 0;
    const data = await res.json();
    const n = data["@odata.count"];
    return typeof n === "number" ? n : (data.value || []).length;
  } catch {
    return 0;
  }
}

module.exports = async function (context, req) {
  try {
    if (req.method === "POST") {
      if (req.body?.actie === "reviews-gezien") {
        const moment = await zetReviewGezien(new Date().toISOString());
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, laatstGezien: moment } };
        return;
      }
      if (req.body?.actie === "vragenlijsten-gezien") {
        const moment = await aanleververzoeken.zetLaatstGezien(new Date().toISOString());
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, laatstGezien: moment } };
        return;
      }
      if (req.body?.actie === "reacties-gezien") {
        const moment = await zetReactiesGezien(new Date().toISOString());
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, laatstGezien: moment } };
        return;
      }
      if (req.body?.actie === "taken-gezien") {
        // Per-medewerker: legt vast dat DEZE medewerker de taken nu gezien heeft (badge → 0 voor hem).
        const moment = await takenGezien.zetGezien(haalEmailUitPrincipal(req), new Date().toISOString()).catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, laatstGezien: moment } };
        return;
      }
      context.res = { status: 400, body: { error: "Onbekende actie." } };
      return;
    }

    const [verzoeken, reviews, laatstGezien, alleVragenlijsten, laatstGezienVragenlijsten, akkoorden, laatstGezienReacties] = await Promise.all([
      haalAlleVerzoeken().catch(() => []),
      haalReviews().catch(() => []),
      haalReviewGezien().catch(() => null),
      aanleververzoeken.haalAlle().catch(() => []),
      aanleververzoeken.haalLaatstGezien().catch(() => null),
      haalAlleAkkoorden().catch(() => []),
      haalReactiesGezien().catch(() => null),
    ]);

    const openWijzigingen = verzoeken.filter((v) => v.status === "open").length;
    // Nieuwe klantreacties op taken (akkoord/niet-akkoord) sinds de medewerker de tab voor het
    // laatst opende — voor de badge op "Log klantreacties".
    const sindsReacties = laatstGezienReacties ? new Date(laatstGezienReacties) : null;
    const nieuweReacties = sindsReacties
      ? akkoorden.filter((a) => a.akkoordOp && new Date(a.akkoordOp) > sindsReacties).length
      : akkoorden.length;
    const sinds = laatstGezien ? new Date(laatstGezien) : null;
    const nieuweReviews = sinds
      ? reviews.filter((r) => r.datum && new Date(r.datum) > sinds).length
      : reviews.length;
    // Zelfde zichtbaarheidsregel als /api/medewerker-vragenlijsten: een afgeronde vragenlijst telt
    // hier nog mee totdat een medewerker 'm heeft geaccepteerd (anders lopen badge en rijenlijst uiteen).
    const vragenlijstenAandacht = alleVragenlijsten
      .filter((v) => !(v.status === "afgerond" && v.medewerkerGeaccepteerd))
      .filter((v) => aanleververzoeken.heeftKlantActiviteitSinds(v, laatstGezienVragenlijsten)).length;

    // Rode badge op de tab "Taken": mijn nieuwe openstaande taken (eigenaar) sinds ik voor het
    // laatst keek — per medewerker (zie telMijnNieuweTaken). Best-effort; 0 als Dynamics niet kan.
    const nieuweTaken = await telMijnNieuweTaken(haalEmailUitPrincipal(req)).catch(() => 0);

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { openWijzigingen, nieuweReviews, vragenlijstenAandacht, nieuweReacties, nieuweTaken, laatstGezien },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van tellingen.", detail: String(err) },
    };
  }
};
