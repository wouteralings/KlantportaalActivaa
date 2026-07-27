const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalWeergavenVoorEmail, zetWeergavenVoorEmail } = require("../_gedeeld/weergaven");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Persoonlijke opgeslagen weergaven van het klantoverzicht, gekoppeld aan de ingelogde gebruiker.
 *
 * GET → { views: [{ naam, config }] }
 * PUT body { views: [...] } → overschrijft de eigen weergaven.
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    if (!email) { context.res = { status: 403, body: { error: "Geen ingelogde gebruiker." } }; return; }

    if (req.method === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { views: await haalWeergavenVoorEmail(email) } };
      return;
    }
    if (req.method === "PUT") {
      const views = (req.body && req.body.views) || [];
      if (!Array.isArray(views)) { context.res = { status: 400, body: { error: "Geef 'views' (array) mee." } }; return; }
      const opgeslagen = await zetWeergavenVoorEmail(email, views);
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
