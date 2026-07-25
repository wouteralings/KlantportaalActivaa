const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { werkDocumentVeldenBij } = require("../_gedeeld/labels");

module.exports = async function (context, req) {
  const email = haalEmailUitPrincipal(req);
  if (!email) {
    context.res = { status: 403, body: { error: "Kon geen ingelogde gebruiker herkennen." } };
    return;
  }

  if (req.method !== "PATCH") {
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const driveItemId = req.query.id || req.body?.id;
  const nieuwLabel = req.body?.label !== undefined ? req.body.label.trim() : undefined;
  const nieuweEntiteit = req.body?.entiteit !== undefined ? req.body.entiteit.trim() : undefined;

  if (!driveItemId || (nieuwLabel === undefined && nieuweEntiteit === undefined)) {
    context.res = { status: 400, body: { error: "Geef 'id' mee, plus minstens 'label' of 'entiteit'." } };
    return;
  }

  const updates = {};
  if (nieuwLabel !== undefined) updates.label = nieuwLabel;
  if (nieuweEntiteit !== undefined) updates.entiteit = nieuweEntiteit;

  try {
    const bijgewerkt = await werkDocumentVeldenBij(email, driveItemId, updates);
    context.res = { headers: { "Content-Type": "application/json" }, body: { id: driveItemId, ...bijgewerkt } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, body: { error: "Onverwachte fout bij opslaan." } };
  }
};
