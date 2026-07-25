const { slaFaviconOp } = require("../_gedeeld/media");
const { werkInstellingenBij } = require("../_gedeeld/instellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * POST body: { dataUrl: "data:image/png;base64,...." }
 * Slaat de favicon op in Blob Storage en bewaart de URL in de instellingen als 'faviconUrl'.
 */
module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const dataUrl = req.body?.dataUrl;
  if (!dataUrl) {
    context.res = { status: 400, body: { error: "Geef 'dataUrl' mee." } };
    return;
  }

  try {
    const faviconUrl = await slaFaviconOp(dataUrl);
    await werkInstellingenBij({ faviconUrl });
    context.res = { headers: { "Content-Type": "application/json" }, body: { faviconUrl } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    if (err.code === "ONGELDIGE_AFBEELDING") {
      context.res = { status: 400, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, body: { error: "Onverwachte fout bij uploaden van de favicon." } };
  }
};
