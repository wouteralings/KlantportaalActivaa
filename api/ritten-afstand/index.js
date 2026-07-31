/**
 * /api/ritten-afstand — server-side proxy naar Google Maps (zie api/_gedeeld/googleMapsAfstand.js).
 * Nooit de hele rit-registratie laten vastlopen op een externe API-fout: bij elke Maps-fout geven
 * we gewoon 200 terug met afstandKm: null + een fout-tekst, zodat het front-end het afstandveld
 * leeg laat en de klant zelf de afstand kan intypen (zie het plan, "Google Maps-integratie").
 *
 *   POST body { accountId, vanAdres, naarAdres }  → { afstandKm, afstandTekst, duurTekst }
 *                                                    of { afstandKm: null, fout: "..." }
 */
const { controleerRittenToegang, afhandelFout } = require("../_gedeeld/rittenToegang");
const { haalAfstandKm } = require("../_gedeeld/googleMapsAfstand");

const FOUTMELDINGEN = {
  GOOGLE_MAPS_NIET_GECONFIGUREERD: "Google Maps is nog niet geconfigureerd — typ de afstand zelf in.",
  GOOGLE_MAPS_NETWERKFOUT: "Kon Google Maps niet bereiken — typ de afstand zelf in.",
  GOOGLE_MAPS_FOUT: "Google Maps kon de afstand niet berekenen — typ de afstand zelf in.",
  GOOGLE_MAPS_ONBEKEND_ADRES: "Een van beide adressen werd niet herkend — typ de afstand zelf in.",
};

module.exports = async function (context, req) {
  try {
    await controleerRittenToegang(req);

    if (req.method !== "POST") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }

    const vanAdres = req.body && req.body.vanAdres;
    const naarAdres = req.body && req.body.naarAdres;
    if (!vanAdres || !naarAdres) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "vanAdres en naarAdres zijn beide verplicht." } };
      return;
    }

    try {
      const resultaat = await haalAfstandKm(vanAdres, naarAdres);
      context.res = { headers: { "Content-Type": "application/json" }, body: resultaat };
    } catch (mapsFout) {
      context.log && context.log.warn && context.log.warn("ritten-afstand: Google Maps-fout", mapsFout.code || mapsFout.message);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { afstandKm: null, fout: FOUTMELDINGEN[mapsFout.code] || "Kon de afstand niet berekenen — typ de afstand zelf in." },
      };
    }
  } catch (err) {
    afhandelFout(context, err);
  }
};
