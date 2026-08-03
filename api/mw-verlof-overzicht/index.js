/**
 * /api/mw-verlof-overzicht — vakantieoverzicht: alle GOEDGEKEURDE verlof, bedrijfsbreed. Bewust
 * zonder scope-beperking (geen "mijn team"/"kantoorbreed" zoals bij Bezetting/Weekstaten) — dit is
 * juist bedoeld zodat iedere collega kan zien wie wanneer vrij is, voor onderlinge afstemming.
 * Elke medewerker/beheerder mag dit zien; niemand kan hier iets goedkeuren of wijzigen.
 *
 *   - GET ?maand=YYYY-MM → { maand, eerste, laatste, verlof: [{id, medewerkerNaam, verloftype,
 *                            verloftypeLabel, startdatum, einddatum, aantalUren}, ...] }
 *
 * Route: medewerker/beheerder.
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const verlof = require("../_gedeeld/verlofDataverse");
const verlofInstellingen = require("../_gedeeld/verlofInstellingen");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

function maandVanNu() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function maandRange(maand) {
  const [j, m] = maand.split("-").map(Number);
  const eerste = new Date(Date.UTC(j, m - 1, 1)).toISOString().slice(0, 10);
  const laatste = new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
  return { eerste, laatste };
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });

  try {
    const maand = (req.query && req.query.maand) || maandVanNu();
    if (!/^\d{4}-\d{2}$/.test(maand)) return json(context, 400, { error: "Ongeldige maand (verwacht YYYY-MM)." });
    const { eerste, laatste } = maandRange(maand);

    const [aanvragen, instellingen] = await Promise.all([
      verlof.goedgekeurdVerlof({ vanaf: eerste, tot: laatste }),
      verlofInstellingen.haalInstellingen(),
    ]);
    const labelVan = new Map(instellingen.verloftypen.map((t) => [t.sleutel, t.label]));
    const lijst = aanvragen.map((a) => ({ ...a, verloftypeLabel: labelVan.get(a.verloftype) || a.verloftype }));
    return json(context, 200, { maand, eerste, laatste, verlof: lijst });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon het vakantieoverzicht niet opbouwen.", detail: String(err.message || err) });
  }
};
