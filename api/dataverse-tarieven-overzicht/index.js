const { haalTarievenOverzicht, haalTariefKolomMapping, isBeheerder } = require("../_gedeeld/offertesOnboarding");

// Leesbaar overzicht van de weggeschreven cr283_tarief-rijen, optioneel gefilterd op klant
// (?klantId=<accountid>) — voor Instellingen ("Tarieven — Dataverse inzien"), zodat je de
// data zelf kunt bekijken zonder in de Power Apps-portal te hoeven kijken. Alleen lezend (GET),
// toegang loopt via de normale "authenticated"-routeregel in staticwebapp.config.json.
// Beheerders-only, want dit hoort bij het (nu beheerders-only) Instellingen-scherm — zie
// isBeheerder — en toont bovendien daadwerkelijke prijsafspraken per klant.
module.exports = async function (context, req) {
  try {
    if (!(await isBeheerder(req))) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { ok: false, error: "Alleen beheerders hebben hier toegang toe." },
      };
      return;
    }
    const klantId = req.query.klantId || null;
    const kolomMapping = await haalTariefKolomMapping();
    const tarieven = await haalTarievenOverzicht({ klantId, kolomMapping });
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, tarieven },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { ok: false, error: err.message || "Er ging iets mis. Probeer het later opnieuw." },
    };
  }
};
