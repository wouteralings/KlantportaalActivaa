/**
 * Server-side proxy naar de Google Maps Distance Matrix API — berekent de "normale route"-
 * afstand tussen twee adressen, ZONDER real-time verkeer (er wordt bewust geen departure_time
 * meegegeven, dus geen live-files-omleiding — zie het plan/de skill "rittenregistratie", punt 6).
 *
 * Vereist de Application Setting GOOGLE_MAPS_API_KEY (server-side; NIET als VITE_*, zodat de key
 * nooit in de frontend-bundle terechtkomt — alle calls lopen via api/ritten-afstand).
 *
 * Best-effort: bij een configuratie- of API-fout gooien we een gerichte fout die de aanroeper
 * (api/ritten-afstand) omzet in { afstandKm: null, fout: "..." } — de rit-registratie zelf mag
 * hier nooit op vastlopen, de klant kan de afstand altijd zelf intypen/overschrijven.
 */

const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

async function haalAfstandKm(vanAdres, naarAdres) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const fout = new Error("GOOGLE_MAPS_NIET_GECONFIGUREERD");
    fout.code = "GOOGLE_MAPS_NIET_GECONFIGUREERD";
    throw fout;
  }
  if (!vanAdres || !naarAdres) {
    const fout = new Error("VALIDATIE: van- en naar-adres zijn beide verplicht.");
    throw fout;
  }

  const params = new URLSearchParams({
    origins: vanAdres,
    destinations: naarAdres,
    units: "metric",
    region: "nl",
    // Bewust GEEN departure_time: dat zou Google een live-verkeer-afhankelijke route laten
    // berekenen. Zonder departure_time krijgen we de "normale", tijdstip-onafhankelijke route.
    key: apiKey,
  });

  let response;
  try {
    response = await fetch(`${DISTANCE_MATRIX_URL}?${params.toString()}`);
  } catch (netwerkFout) {
    const fout = new Error("GOOGLE_MAPS_NETWERKFOUT");
    fout.code = "GOOGLE_MAPS_NETWERKFOUT";
    fout.oorzaak = netwerkFout;
    throw fout;
  }

  if (!response.ok) {
    const fout = new Error(`GOOGLE_MAPS_HTTP_${response.status}`);
    fout.code = "GOOGLE_MAPS_FOUT";
    throw fout;
  }

  const data = await response.json();
  if (data.status !== "OK") {
    const fout = new Error(`GOOGLE_MAPS_STATUS_${data.status}`);
    fout.code = "GOOGLE_MAPS_FOUT";
    throw fout;
  }

  const element = data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
  if (!element || element.status !== "OK") {
    const fout = new Error("GOOGLE_MAPS_ONBEKEND_ADRES");
    fout.code = "GOOGLE_MAPS_ONBEKEND_ADRES";
    throw fout;
  }

  const meters = element.distance && element.distance.value;
  if (!Number.isFinite(meters)) {
    const fout = new Error("GOOGLE_MAPS_ONBEKEND_ADRES");
    fout.code = "GOOGLE_MAPS_ONBEKEND_ADRES";
    throw fout;
  }

  return {
    afstandKm: Math.round((meters / 1000) * 10) / 10,
    afstandTekst: element.distance.text,
    duurTekst: element.duration ? element.duration.text : null,
  };
}

module.exports = { haalAfstandKm };
