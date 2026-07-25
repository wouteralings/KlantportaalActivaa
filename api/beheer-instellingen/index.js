const { haalInstellingen, werkInstellingenBij } = require("../_gedeeld/instellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET  → huidige instellingen, bijv. { googleReviewUrl: "https://g.page/r/.../review" }
 * PUT  body: { googleReviewUrl?: "..." } → bijwerken (alleen meegegeven velden wijzigen)
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      context.res = { headers: { "Content-Type": "application/json" }, body: await haalInstellingen() };
      return;
    }

    if (req.method === "PUT") {
      const bijgewerkt = await werkInstellingenBij(req.body || {});
      context.res = { headers: { "Content-Type": "application/json" }, body: bijgewerkt };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij instellingenbeheer.", detail: String(err) },
    };
  }
};
