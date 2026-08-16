/**
 * Gedeelde helpers voor de medewerkerskant van "Taken" — gebruikt door zowel api/mw-taken
 * (het takenoverzicht) als api/beheer-tellingen (de rode badge "mijn nieuwe taken").
 *
 * Bewust apart gehouden van api/taken (dat is de KLANTkant: alleen de eigen accounts van de
 * ingelogde klant, gefilterd op de in Beheer zichtbaar gezette soorten). De medewerkerskant is
 * juist kantoorbreed en toont alle open taken, los van de klant-zichtbaarheidsinstelling.
 *
 * De veldnamen (soort-optieset, klant-lookup) komen uit dezelfde Application Settings als api/taken,
 * zodat er maar één plek is waar die geconfigureerd worden.
 */
const { haalInstellingen } = require("./instellingen");

// Het "Soort"-veld op Task is een keuzelijst (option set). Zelfde Application Setting als api/taken.
// Leeg = geen soort/afwikkeling bekend (de kolom blijft dan leeg, taken worden gewoon getoond).
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
// De lookup op Task die naar de klant (Account) wijst — bij Activaa "Cliënt" (sk_client).
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const KLANT_VALUE = `_${KLANT_VELD}_value`;

const FV = "@OData.Community.Display.V1.FormattedValue";

const DYNAMICS_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  // Geeft naast de ruwe optieset-/lookup-waarde ook het leesbare label mee (soort, eigenaar, ...).
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
});

/**
 * Zoekt de systemuser (Dynamics-medewerker) op e-mailadres. Geeft { id, naam } terug, of
 * { id: "", naam: "" } als er niets gevonden wordt. Dezelfde bron als /api/mijn-naam, zodat de
 * eigenaar-match ("Mijn taken") betrouwbaar is — ook als het inlogtoken geen naam-claim meestuurt.
 */
async function haalSystemuser(resource, token, email) {
  if (!resource || !email) return { id: "", naam: "" };
  const veilig = String(email).replace(/'/g, "''");
  const url =
    `${resource}/api/data/v9.2/systemusers` +
    `?$select=systemuserid,fullname&$filter=internalemailaddress eq '${encodeURIComponent(veilig)}' and isdisabled eq false&$top=1`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    });
    if (!res.ok) return { id: "", naam: "" };
    const d = await res.json();
    const u = (d.value && d.value[0]) || null;
    return u ? { id: u.systemuserid || "", naam: u.fullname || "" } : { id: "", naam: "" };
  } catch {
    return { id: "", naam: "" };
  }
}

/**
 * Leest de per-soort-configuratie uit de instellingen (Beheer → Taken) en bepaalt welke
 * taaksoorten "automatisch afgewikkeld" worden: de soorten die de cliënt zélf afhandelt — via
 * akkoord geven ("mag goedkeuren") of via ondertekenen ("vereist handtekening"). Zodra de cliënt
 * dat doet, wordt de taak automatisch in Dynamics afgerond. Alle overige soorten moeten door een
 * medewerker handmatig afgetekend worden.
 *
 * Geeft een Set met de numerieke optieset-waarden (als string) van de automatisch-afgewikkelde
 * soorten terug.
 */
async function haalAutomatischAfgewikkeldeSoorten() {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const config = (instellingen && instellingen.taaksoorten) || {};
  const automatisch = new Set();
  for (const [waarde, opties] of Object.entries(config)) {
    if (opties && (opties.magGoedkeuren || opties.vereistHandtekening)) automatisch.add(String(waarde));
  }
  return automatisch;
}

/** "automatisch" als de soort door de cliënt wordt afgehandeld, anders "handmatig". */
function afwikkelingVoorSoort(soortWaarde, automatischeSet) {
  if (soortWaarde == null || soortWaarde === "") return "handmatig";
  return automatischeSet.has(String(soortWaarde)) ? "automatisch" : "handmatig";
}

/**
 * De in Beheer → Taken per taaksoort ingestelde standaard-tijd (uren) voor de planning/bezetting.
 * Geeft een map { "<optieset-waarde>": <uren-getal> } terug (alleen soorten met een geldig getal).
 */
async function haalStandaardUrenPerSoort() {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const config = (instellingen && instellingen.taaksoorten) || {};
  const map = {};
  for (const [waarde, opties] of Object.entries(config)) {
    if (!opties) continue;
    const n = Number(opties.standaardUren);
    if (opties.standaardUren != null && opties.standaardUren !== "" && !isNaN(n) && n >= 0) {
      map[String(waarde)] = Math.round(n * 100) / 100;
    }
  }
  return map;
}

/**
 * De in Beheer → Taken per taaksoort ingestelde standaard-URENCODE (voor het gekoppelde
 * urenschrijven vanuit een taak). Geeft een map { "<optieset-waarde>": "<urencode-naam>" } terug
 * (alleen soorten met een ingevulde code).
 */
async function haalStandaardUrencodePerSoort() {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const config = (instellingen && instellingen.taaksoorten) || {};
  const map = {};
  for (const [waarde, opties] of Object.entries(config)) {
    if (!opties) continue;
    const code = String(opties.standaardUrencode || "").trim();
    if (code) map[String(waarde)] = code;
  }
  return map;
}

/** De effectieve urencode van een taak: de per-taak-overschrijving wint, anders die van de soort. */
function effectieveTaakUrencode(soortWaarde, standaardPerSoort, override) {
  const eigen = override == null ? "" : String(override).trim();
  if (eigen) return eigen;
  const std = soortWaarde == null ? undefined : standaardPerSoort[String(soortWaarde)];
  return std || "";
}

/** De effectieve uren van een taak: de per-taak-overschrijving wint, anders de standaard van de soort. */
function effectieveTaakUren(soortWaarde, standaardPerSoort, override) {
  if (override != null && override !== "") {
    const n = Number(override);
    if (!isNaN(n) && n >= 0) return Math.round(n * 100) / 100;
  }
  const std = soortWaarde == null ? undefined : standaardPerSoort[String(soortWaarde)];
  return std != null ? std : 0;
}

/**
 * De app-URL (waar een medewerker een taak in Dynamics opent) afgeleid uit de resource-URL. De
 * resource is bv. https://orgxxx.api.crm4.dynamics.com; de web-app draait op dezelfde host zonder
 * het ".api"-deel. Zo kan het overzicht een "Open in Dynamics"-link tonen.
 */
function dynamicsAppUrl(resource) {
  if (!resource) return "";
  return String(resource).replace(".api.crm", ".crm").replace(/\/$/, "");
}

module.exports = {
  SOORT_VELD,
  KLANT_VELD,
  KLANT_VALUE,
  FV,
  DYNAMICS_HEADERS,
  haalSystemuser,
  haalAutomatischAfgewikkeldeSoorten,
  afwikkelingVoorSoort,
  haalStandaardUrenPerSoort,
  effectieveTaakUren,
  haalStandaardUrencodePerSoort,
  effectieveTaakUrencode,
  dynamicsAppUrl,
};
