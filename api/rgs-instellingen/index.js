const { RGS_REFERENTIE } = require("../_gedeeld/rgsData");
const { haalOverschrijvingen, zetNaam, zetVolgorde, pasToe } = require("../_gedeeld/rgsInstellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 * Beheer → Rapportages → "RGS-namen en volgorde": per RGS-code een eigen naam en de
 * presentatievolgorde instellen. Globaal (niet per klant), zie rgsInstellingen.js.
 *
 * GET → { codes: [{ rgsCode, standaardNaam, naam, rapportage, categorie, groep, standaardVolgorde, volgorde }] }
 *        (al gesorteerd op de effectieve volgorde)
 * PUT body { actie: "naam", rgsCode, naam }                     → naam van één code (leeg = terug naar standaard)
 * PUT body { actie: "volgorde", rgsCodes: [rgsCode, ...] }      → herschikt deze codes (10, 20, 30, …)
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const overschrijvingen = await haalOverschrijvingen();
      const codes = pasToe(RGS_REFERENTIE, overschrijvingen);
      context.res = { headers: { "Content-Type": "application/json" }, body: { codes } };
      return;
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      if (body.actie === "naam") {
        if (!body.rgsCode) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'rgsCode' mee." } };
          return;
        }
        await zetNaam(body.rgsCode, body.naam || "");
      } else if (body.actie === "volgorde") {
        if (!Array.isArray(body.rgsCodes) || body.rgsCodes.length === 0) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'rgsCodes' (niet-lege lijst) mee." } };
          return;
        }
        await zetVolgorde(body.rgsCodes);
      } else {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie — gebruik 'naam' of 'volgorde'." } };
        return;
      }
      const overschrijvingen = await haalOverschrijvingen();
      const codes = pasToe(RGS_REFERENTIE, overschrijvingen);
      context.res = { headers: { "Content-Type": "application/json" }, body: { codes } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    if (typeof err.message === "string" && err.message.startsWith("VALIDATIE")) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het beheren van de RGS-instellingen.", detail: String(err) },
    };
  }
};
