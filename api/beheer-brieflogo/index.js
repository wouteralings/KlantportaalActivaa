/**
 * /api/beheer-brieflogo — upload van het logo voor het briefpapier (Brieven-module). Beheerder-only
 * (route in staticwebapp.config.json). Zelfde opzet als /api/beheer-logo, maar bewaart onder de blob
 * "brieflogo" (media.js) én zet de logoUrl direct in de Brieven-configuratie (afzender.logoUrl), zodat
 * het portaal het logo meteen in het briefpapier gebruikt.
 *
 *   POST { dataUrl: "data:image/png;base64,..." }  →  { logoUrl }
 */
const { slaBrieflogoOp } = require("../_gedeeld/media");
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
    const logoUrl = await slaBrieflogoOp(dataUrl);
    // logoUrl in de Brieven-config zetten (afzender), zodat het portaal 'm meteen oppikt.
    const config = await haalConfig();
    config.afzender = { ...config.afzender, logoUrl };
    const opgeslagen = await zetConfig(config);
    context.res = { headers: { "Content-Type": "application/json" }, body: { logoUrl: opgeslagen.afzender.logoUrl } };
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
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij het uploaden van het logo." } };
  }
};
