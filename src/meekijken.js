/**
 * "Meekijken als klant" — gedeeld tussen het medewerkersportaal (kiest een klant, zie
 * MeekijkenAlsKlant in src/medewerker/MedewerkerPortaal.jsx) en het klantportaal (voert de
 * daadwerkelijke, alleen-lezen weergave uit, zie src/portaal/KlantPortaal.jsx). Beide bundels
 * delen dezelfde build (main.jsx importeert alle drie portalen), dus dit ene bestand kan door
 * beide kanten gebruikt worden.
 *
 * BELANGRIJK: de echte autorisatie en de garantie dat dit alleen-lezen is, gebeurt op de
 * backend in herleidAccounts() (api/_gedeeld/identiteit.js) — die controleert het als-klant-recht
 * en weigert elke niet-GET-aanroep. Dit bestand is puur de overdracht tussen de twee schermen
 * (sessionStorage, niet localStorage — vervalt zodra het tabblad dichtgaat) plus een client-side
 * fetch-interceptor als extra, niet-doorslaggevende verdedigingslaag (nooit de enige controle).
 */

const SLEUTEL = "kp_meekijken_als_klant";

/** Wordt aangeroepen vanuit het medewerkersportaal zodra "Bekijk als klant" wordt gekozen. */
export function startMeekijken({ accountId, klantnummer, klantnaam, contactEmail, medewerkerNaam, medewerkerEmail }) {
  sessionStorage.setItem(
    SLEUTEL,
    JSON.stringify({ accountId, klantnummer, klantnaam, contactEmail, medewerkerNaam, medewerkerEmail, sinds: new Date().toISOString() })
  );
}

/** Geeft de actieve meekijk-sessie terug (of null als er geen is / de data onbruikbaar is). */
export function haalMeekijkSessie() {
  try {
    const ruw = sessionStorage.getItem(SLEUTEL);
    if (!ruw) return null;
    const data = JSON.parse(ruw);
    if (!data || !data.contactEmail) return null;
    return data;
  } catch {
    return null;
  }
}

/** Beëindigt de meekijk-sessie (verwijdert alleen de overdrachtsdata; de interceptor zelf
 * wordt door de aanroeper losgekoppeld via deactiveerMeekijkFetch vóór een reload/redirect). */
export function stopMeekijken() {
  sessionStorage.removeItem(SLEUTEL);
}

let interceptorActief = false;
let origineleFetch = null;

/**
 * Activeert de fetch-interceptor voor de rest van deze paginasessie:
 *  - elke GET naar /api/... krijgt de header x-meekijken-als-email mee (herleidAccounts op de
 *    backend gebruikt die, ná een eigen rechtencontrole, i.p.v. de eigen identiteit van de
 *    ingelogde medewerker);
 *  - elke andere methode (POST/PUT/PATCH/DELETE) naar /api/... wordt hier al client-side
 *    tegengehouden met een synthetische 403 — vóór er ook maar iets over het netwerk gaat. Dit is
 *    een extra verdedigingslaag; de eigenlijke garantie zit in herleidAccounts() op de backend,
 *    die dezelfde header bij een niet-GET-aanroep sowieso al weigert.
 */
export function activeerMeekijkFetch(contactEmail) {
  if (interceptorActief) return;
  interceptorActief = true;
  origineleFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const methode = ((init && init.method) || (typeof input !== "string" && input && input.method) || "GET").toUpperCase();
    if (url.startsWith("/api/")) {
      if (methode !== "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: "Alleen-lezen: je bekijkt dit portaal als medewerker namens een klant." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      const bestaandeHeaders = (init && init.headers) || (typeof input !== "string" && input && input.headers) || undefined;
      const nieuweHeaders = new Headers(bestaandeHeaders);
      nieuweHeaders.set("x-meekijken-als-email", contactEmail);
      return origineleFetch(input, { ...(init || {}), headers: nieuweHeaders });
    }
    return origineleFetch(input, init);
  };
}

/** Zet window.fetch terug naar het origineel — altijd aanroepen vóór een reload/redirect na "Stop met meekijken". */
export function deactiveerMeekijkFetch() {
  if (origineleFetch) window.fetch = origineleFetch;
  interceptorActief = false;
  origineleFetch = null;
}
