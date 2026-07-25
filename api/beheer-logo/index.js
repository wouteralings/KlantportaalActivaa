const { slaLogoOp } = require("../_gedeeld/media");
const { werkInstellingenBij } = require("../_gedeeld/instellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * POST body: { dataUrl: "data:image/png;base64,...." }
 * (bijv. via FileReader.readAsDataURL() op het gekozen bestand in een eigen beheerschermpje,
 * of handmatig een bestand naar base64 omzetten)
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
    const logoUrl = await slaLogoOp(dataUrl);
    await werkInstellingenBij({ logoUrl });
    context.res = { headers: { "Content-Type": "application/json" }, body: { logoUrl } };
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
    context.res = { status: 500, body: { error: "Onverwachte fout bij uploaden van het logo." } };
  }
};
