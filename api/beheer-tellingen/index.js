/**
 * Lichtgewicht tellingen voor de badges op de beheer-/medewerkerstabbladen:
 *  - openWijzigingen      : aantal wijzigingsverzoeken met status "open" (nog af te handelen)
 *  - nieuweReviews        : aantal reviews binnengekomen sinds de beheerder ze voor het laatst bekeek
 *  - vragenlijstenAandacht: aantal (nog niet afgeronde) vragenlijsten met klant-activiteit
 *                           (aangeleverd/afgemeld of een vraag) sinds medewerkers de tab
 *                           "Vragenlijsten" voor het laatst openden
 *
 * GET  → { openWijzigingen, nieuweReviews, vragenlijstenAandacht, laatstGezien }
 * POST { actie: "reviews-gezien" }       → markeert de reviews als gezien (zet de teller op 0)
 * POST { actie: "vragenlijsten-gezien" } → markeert de vragenlijsten als gezien (zet de teller op 0)
 */
const { haalReviews, haalReviewGezien, zetReviewGezien } = require("../_gedeeld/reviewopslag");
const { haalAlleVerzoeken } = require("../_gedeeld/wijzigingen");
const aanleververzoeken = require("../_gedeeld/aanleververzoeken");

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
      context.res = { status: 400, body: { error: "Onbekende actie." } };
      return;
    }

    const [verzoeken, reviews, laatstGezien, alleVragenlijsten, laatstGezienVragenlijsten] = await Promise.all([
      haalAlleVerzoeken().catch(() => []),
      haalReviews().catch(() => []),
      haalReviewGezien().catch(() => null),
      aanleververzoeken.haalAlle().catch(() => []),
      aanleververzoeken.haalLaatstGezien().catch(() => null),
    ]);

    const openWijzigingen = verzoeken.filter((v) => v.status === "open").length;
    const sinds = laatstGezien ? new Date(laatstGezien) : null;
    const nieuweReviews = sinds
      ? reviews.filter((r) => r.datum && new Date(r.datum) > sinds).length
      : reviews.length;
    const vragenlijstenAandacht = alleVragenlijsten
      .filter((v) => v.status !== "afgerond")
      .filter((v) => aanleververzoeken.heeftKlantActiviteitSinds(v, laatstGezienVragenlijsten)).length;

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { openWijzigingen, nieuweReviews, vragenlijstenAandacht, laatstGezien },
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
