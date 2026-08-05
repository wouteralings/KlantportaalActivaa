/**
 * /api/beheer-briefachtergrond — upload van de achtergrond (volledig briefpapier) voor de
 * Brieven-module. Beheerder-only. Zelfde opzet als /api/beheer-brieflogo: bewaart onder de blob
 * "briefachtergrond" (media.js) én zet de achtergrondUrl in de Brieven-configuratie
 * (afzender.achtergrondUrl).
 *
 *   POST { dataUrl: "data:image/png;base64,..." }  →  { achtergrondUrl }
 */
const { slaBriefachtergrondOp } = require("../_gedeeld/media");
const { haalConfig, zetConfig } = require("../_gedeeld/briefSjablonen");

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  const dataUrl = req.body && req.body.dataUrl;
  if (!dataUrl) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'dataUrl' mee." } };
    return;
  }
  try {
    const achtergrondUrl = await slaBriefachtergrondOp(dataUrl);
    const config = await haalConfig();
    config.afzender = { ...config.afzender, achtergrondUrl };
    const opgeslagen = await zetConfig(config);
    context.res = { headers: { "Content-Type": "application/json" }, body: { achtergrondUrl: opgeslagen.afzender.achtergrondUrl } };
  } catch (err) {
    if (err.code === "ONGELDIGE_AFBEELDING") {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij het uploaden van de achtergrond." } };
  }
};
