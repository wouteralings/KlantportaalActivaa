const { haalAlleAkkoorden } = require("../_gedeeld/taakakkoorden");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET → log van alle door klanten gegeven akkoorden op taken (wie, wanneer, welke taak),
 * nieuwste eerst. Vergelijkbaar met het overzicht van wijzigingsverzoeken.
 */
module.exports = async function (context, req) {
  try {
    const akkoorden = await haalAlleAkkoorden();
    akkoorden.sort((a, b) => new Date(b.akkoordOp) - new Date(a.akkoordOp));
    context.res = { headers: { "Content-Type": "application/json" }, body: { akkoorden } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de akkoord-log.", detail: String(err) },
    };
  }
};
