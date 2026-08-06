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
 *
 * Zelfhelende achtergrond: is er wél een Word-briefpapier ingesteld (afzender.briefpapierDocx) maar
 * nog geen afgeleide achtergrond (afzender.achtergrondUrl leeg) — bijv. omdat het briefpapier is
 * geüpload vóórdat de automatische extractie live stond — dan leiden we de volledige-pagina-
 * achtergrond alsnog uit het opgeslagen .docx af en bewaren die, zodat het live voorbeeld én de PDF
 * meteen de huisstijl tonen zonder dat de beheerder opnieuw hoeft te uploaden.
 */
const { haalVoorPortaal, haalConfig, zetConfig } = require("../_gedeeld/briefSjablonen");
const { haalBriefpapier, extraheerAchtergrond } = require("../_gedeeld/briefWordpapier");
const { slaBriefachtergrondOp } = require("../_gedeeld/media");

/** Leidt (best-effort) de achtergrond uit het opgeslagen Word-briefpapier af en bewaart 'm. Geeft de
 *  nieuwe media-URL terug, of "" als er geen (geschikte) achtergrond in het briefpapier zit. */
async function backfillAchtergrond(context) {
  try {
    const buf = await haalBriefpapier();
    if (!buf) return "";
    const dataUrl = await extraheerAchtergrond(buf);
    if (!dataUrl) return "";
    const url = await slaBriefachtergrondOp(dataUrl);
    const config = await haalConfig();
    config.afzender = { ...config.afzender, achtergrondUrl: url };
    await zetConfig(config); // bewaart de héle config (afzender + sjablonen + …) opnieuw, geen verlies
    return url;
  } catch (e) {
    if (context && context.log && context.log.warn) context.log.warn("Achtergrond-backfill mislukt:", String((e && e.message) || e));
    return "";
  }
}

module.exports = async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const data = await haalVoorPortaal();
    // Zelfhelend: briefpapier ingesteld maar nog geen achtergrond afgeleid → nu alsnog afleiden.
    if (data.afzender && data.afzender.briefpapierDocx && !data.afzender.achtergrondUrl) {
      const url = await backfillAchtergrond(context);
      if (url) data.afzender = { ...data.afzender, achtergrondUrl: url };
    }
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
