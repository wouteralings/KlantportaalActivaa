const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalWeergavenVoor, zetWeergavenVoor } = require("../_gedeeld/weergaven");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Persoonlijke opgeslagen weergaven (kolommen/filters/sortering), gekoppeld aan de ingelogde
 * gebruiker en het scherm waar ze bij horen — bv. "klanten" (klantoverzicht, ook de standaard
 * als er geen 'scherm' wordt meegegeven, voor de bestaande frontend-aanroepen) of
 * "dossiers-ib"/"dossiers-vpb" (de fiscale dossieroverzichten).
 *
 * GET  ?scherm=<naam>          → { views: [{ naam, config }] }
 * PUT  body { scherm?, views } → overschrijft de eigen weergaven van dát scherm.
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    if (!email) { context.res = { status: 403, body: { error: "Geen ingelogde gebruiker." } }; return; }

    if (req.method === "GET") {
      const scherm = (req.query && req.query.scherm) || "klanten";
      context.res = { headers: { "Content-Type": "application/json" }, body: { views: await haalWeergavenVoor(email, scherm) } };
      return;
    }
    if (req.method === "PUT") {
      const views = (req.body && req.body.views) || [];
      const scherm = (req.body && req.body.scherm) || "klanten";
      if (!Array.isArray(views)) { context.res = { status: 400, body: { error: "Geef 'views' (array) mee." } }; return; }
      const opgeslagen = await zetWeergavenVoor(email, scherm, views);
      context.res = { headers: { "Content-Type": "application/json" }, body: { views: opgeslagen } };
      return;
    }
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij weergaven.", detail: String(err) } };
  }
};
