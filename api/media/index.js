const { haalAfbeelding } = require("../_gedeeld/media");

/**
 * Anonieme route (zie staticwebapp.config.json): serveert een opgeslagen afbeelding
 * (logo/favicon) uit de privé Blob-container. Zo hoeft de container geen publieke
 * blob-toegang te hebben (die veel Azure-accounts blokkeren).
 *
 * GET /api/media/{naam}  →  de afbeelding met het juiste content-type.
 */
module.exports = async function (context, req) {
  const naam = context.bindingData.naam || (req.params && req.params.naam) || "";
  try {
    const afbeelding = await haalAfbeelding(naam);
    if (!afbeelding) {
      context.res = { status: 404, body: "Niet gevonden." };
      return;
    }
    context.res = {
      status: 200,
      headers: {
        "Content-Type": afbeelding.contentType,
        // Kort cachen; nieuwe uploads krijgen een ?v=-parameter zodat de browser die direct oppikt.
        "Cache-Control": "public, max-age=300",
      },
      body: afbeelding.buffer,
      isRaw: true,
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: "Opslag is nog niet geconfigureerd." }; return; }
    context.log.error(err);
    context.res = { status: 500, body: "Kon de afbeelding niet laden." };
  }
};
