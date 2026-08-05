const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalRecordVoor, zetWeergavenVoor, zetLaatsteVoor } = require("../_gedeeld/weergaven");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Persoonlijke opgeslagen weergaven (kolommen/filters/sortering), gekoppeld aan de ingelogde
 * gebruiker en het scherm waar ze bij horen — bv. "klanten" (klantoverzicht, ook de standaard
 * als er geen 'scherm' wordt meegegeven, voor de bestaande frontend-aanroepen) of
 * "dossiers-ib"/"dossiers-vpb" (de fiscale dossieroverzichten).
 *
 * `views` = expliciet benoemde weergaven ("Opslaan als…", evt. met ster als persoonlijke
 * standaard). `laatst` = de laatst gebruikte (niet-benoemde) kolommen/volgorde/filters/sortering,
 * automatisch bijgewerkt zodra iets wijzigt — zie de uitleg in _gedeeld/weergaven.js.
 *
 * GET  ?scherm=<naam>                    → { views: [{ naam, config }], laatst: config|null }
 * PUT  body { scherm?, views?, laatst? } → werkt bij wat is meegegeven (minstens één van beide).
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    if (!email) { context.res = { status: 403, body: { error: "Geen ingelogde gebruiker." } }; return; }

    if (req.method === "GET") {
      const scherm = (req.query && req.query.scherm) || "klanten";
      context.res = { headers: { "Content-Type": "application/json" }, body: await haalRecordVoor(email, scherm) };
      return;
    }
    if (req.method === "PUT") {
      const b = req.body || {};
      const scherm = b.scherm || "klanten";
      const heeftViews = Array.isArray(b.views);
      const heeftLaatst = Object.prototype.hasOwnProperty.call(b, "laatst");
      if (!heeftViews && !heeftLaatst) { context.res = { status: 400, body: { error: "Geef 'views' (array) of 'laatst' (object) mee." } }; return; }
      if (heeftViews) await zetWeergavenVoor(email, scherm, b.views);
      if (heeftLaatst) await zetLaatsteVoor(email, scherm, b.laatst);
      context.res = { headers: { "Content-Type": "application/json" }, body: await haalRecordVoor(email, scherm) };
      return;
    }
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij weergaven.", detail: String(err) } };
  }
};
