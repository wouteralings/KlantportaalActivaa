/**
 * Beheerbare configuratie van de Brieven-module (medewerkersportaal → Klantoverzicht → Brieven) —
 * gebouwd 05-08-2026 op verzoek van Wouter ("Kan je onder klantenoverzicht een tab brieven maken?
 * We willen snel standaard brieven kunnen genereren en voorbeeld brief altijd in scherm zien.").
 *
 * Zelfde opslag-patroon als contractenTypes.js / aanleveronderwerpen.js: Azure Blob Storage,
 * container portaalcontent, blob brief-sjablonen.json. In één blob bewaard:
 *
 *   { afzender, sharepointMap, sjablonen: [ { id, naam, onderwerp, tekst, actief } ] }
 *
 *   - afzender      : de vaste briefpapier-/afzendergegevens van Activaa (bedrijfsnaam, adres,
 *                     contact, standaard afsluiting + wie de brief standaard ondertekent). Deze
 *                     komen boven- en onderaan elke brief te staan.
 *   - sharepointMap : submap in het SharePoint-klantdossier waar een opgeslagen brief terechtkomt
 *                     (zelfde mechanisme als de contract-dossierkopie, contractenSharepoint.js).
 *   - sjablonen     : de standaardbrieven. `onderwerp` en `tekst` mogen merge-placeholders zoals
 *                     {{klantnaam}}, {{contactpersoon}}, {{relatiebeheerder}} bevatten; die worden
 *                     in de frontend ingevuld met de Dynamics-gegevens van de gekozen klant (zie
 *                     src/medewerker/klanten/BrievenOverzicht.jsx → PLACEHOLDERS). De backend
 *                     rendert alleen de al-ingevulde tekst (briefRenderer.js) en weet dus niets van
 *                     placeholders af.
 *
 * Bij de eerste aanroep (nog geen blob) wordt geseed met een sensibele startset (afzender leeg in
 * te vullen in Beheer, plus vier standaardbrieven), zodat de tab meteen bruikbaar is.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "brief-sjablonen.json";
let cachedContainerClient = null;

const STANDAARD_AFZENDER = {
  bedrijfsnaam: "Activaa",
  adres: "",
  postcode: "",
  plaats: "",
  telefoon: "",
  email: "info@activaa.nl",
  website: "www.activaa.nl",
  kvk: "",
  afsluiting: "Met vriendelijke groet,",
  // Wie ondertekent standaard: "relatiebeheerder" | "accountant" | "vast" (dan ondertekenaarVast).
  ondertekenaarBron: "relatiebeheerder",
  ondertekenaarVast: "",
  voetnoot: "",
};

const STANDAARD_SHAREPOINT_MAP = "Brieven";

const STANDAARD_SJABLONEN = [
  {
    id: "algemene-brief",
    naam: "Algemene brief",
    onderwerp: "",
    tekst: "[Schrijf hier de inhoud van de brief.]",
    actief: true,
  },
  {
    id: "welkomstbrief",
    naam: "Welkomstbrief nieuwe cliënt",
    onderwerp: "Welkom als cliënt bij {{afzendernaam}}",
    tekst:
      "Hartelijk welkom bij {{afzendernaam}}. Wij danken u voor het in ons gestelde vertrouwen en kijken uit naar een prettige samenwerking.\n\n" +
      "Uw vaste aanspreekpunt is {{relatiebeheerder}}. U kunt met al uw vragen bij hem of haar terecht.\n\n" +
      "Wij nemen op korte termijn contact met u op om de vervolgstappen door te nemen.",
    actief: true,
  },
  {
    id: "bevestiging-dienstverlening",
    naam: "Bevestiging dienstverlening",
    onderwerp: "Bevestiging van onze dienstverlening",
    tekst:
      "Hierbij bevestigen wij de afspraken over onze dienstverlening aan {{klantnaam}} (cliëntnummer {{klantnummer}}).\n\n" +
      "[Vul hier de specifieke afspraken in.]\n\n" +
      "Mocht u nog vragen hebben, neem dan gerust contact met ons op.",
    actief: true,
  },
  {
    id: "verzoek-aanleveren-stukken",
    naam: "Verzoek aanleveren stukken",
    onderwerp: "Verzoek tot aanlevering van stukken",
    tekst:
      "Voor de verdere behandeling van uw dossier ontvangen wij graag de volgende stukken van u:\n\n" +
      "- [stuk 1]\n- [stuk 2]\n\n" +
      "Wij verzoeken u deze vóór [datum] aan te leveren. Alvast hartelijk dank voor uw medewerking.",
    actief: true,
  },
];

async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAAM);
  await containerClient.createIfNotExists();
  cachedContainerClient = containerClient;
  return containerClient;
}

async function streamNaarTekst(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  return Buffer.concat(stukken).toString("utf-8");
}

function tekst(v, max = 400) {
  return String(v == null ? "" : v).trim().slice(0, max);
}
function langeTekst(v, max = 20000) {
  // Behoud regeleinden (word-wrap gebeurt bij het renderen), knip alleen extreem lange invoer af.
  return String(v == null ? "" : v).replace(/\r\n/g, "\n").slice(0, max);
}

function maakId(bron) {
  return String(bron || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function normaliseerAfzender(a) {
  const bron = a && typeof a === "object" ? a : {};
  const bronOndertekenaar = String(bron.ondertekenaarBron || "").trim();
  const ondertekenaarBron = ["relatiebeheerder", "accountant", "vast"].includes(bronOndertekenaar)
    ? bronOndertekenaar
    : "relatiebeheerder";
  return {
    bedrijfsnaam: tekst(bron.bedrijfsnaam, 120) || STANDAARD_AFZENDER.bedrijfsnaam,
    adres: tekst(bron.adres, 160),
    postcode: tekst(bron.postcode, 20),
    plaats: tekst(bron.plaats, 80),
    telefoon: tekst(bron.telefoon, 40),
    email: tekst(bron.email, 120),
    website: tekst(bron.website, 120),
    kvk: tekst(bron.kvk, 40),
    afsluiting: tekst(bron.afsluiting, 120) || STANDAARD_AFZENDER.afsluiting,
    ondertekenaarBron,
    ondertekenaarVast: tekst(bron.ondertekenaarVast, 120),
    voetnoot: tekst(bron.voetnoot, 400),
  };
}

/** Normaliseert de sjablonenlijst; kent een stabiel id toe waar dat ontbreekt en ontdubbelt ids. */
function normaliseerSjablonen(sjablonen) {
  if (!Array.isArray(sjablonen)) return [];
  const gezien = new Set();
  const uit = [];
  for (const s of sjablonen.slice(0, 200)) {
    const naam = tekst(s && s.naam, 120);
    if (!naam) continue;
    let id = maakId((s && s.id) || naam) || "brief";
    let uniek = id;
    let n = 2;
    while (gezien.has(uniek)) uniek = `${id}-${n++}`;
    gezien.add(uniek);
    uit.push({
      id: uniek,
      naam,
      onderwerp: tekst(s && s.onderwerp, 300),
      tekst: langeTekst(s && s.tekst),
      actief: s && s.actief === false ? false : true,
    });
  }
  return uit;
}

const OPERATOREN = ["is", "isNiet", "ingevuld", "leeg"];

/**
 * Standaardparagrafen (regels-engine): elke paragraaf heeft een tekst en een voorwaarde op een veld
 * van de Dynamics-tabel Brieven (cr283_brief). De medewerker kiest een brief-record; de engine
 * (client-side) neemt de paragrafen mee waarvan de voorwaarde klopt, in deze volgorde.
 *
 *   voorwaarde = { modus: "altijd" | "veld", veld, operator: is|isNiet|ingevuld|leeg, waarde }
 *     - ja/nee-veld  → waarde = true/false
 *     - optielijst   → waarde = optie-waarde (getal) of tekst
 */
function normaliseerVoorwaarde(v) {
  const bron = v && typeof v === "object" ? v : {};
  const modus = bron.modus === "veld" ? "veld" : "altijd";
  if (modus === "altijd") return { modus: "altijd" };
  const veld = String(bron.veld || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 100);
  const operator = OPERATOREN.includes(bron.operator) ? bron.operator : "is";
  let waarde = bron.waarde;
  if (typeof waarde === "string") waarde = waarde.slice(0, 200);
  else if (typeof waarde !== "number" && typeof waarde !== "boolean") waarde = null;
  return { modus: "veld", veld, operator, waarde };
}

function normaliseerParagrafen(paragrafen) {
  if (!Array.isArray(paragrafen)) return [];
  const gezien = new Set();
  const uit = [];
  for (const p of paragrafen.slice(0, 400)) {
    if (!p || typeof p !== "object") continue;
    const inhoud = langeTekst(p.tekst, 8000);
    const naam = tekst(p.naam, 120);
    if (!inhoud && !naam) continue;
    let id = maakId(p.id || naam || "paragraaf") || "paragraaf";
    let uniek = id;
    let n = 2;
    while (gezien.has(uniek)) uniek = `${id}-${n++}`;
    gezien.add(uniek);
    uit.push({
      id: uniek,
      naam,
      tekst: inhoud,
      actief: p.actief === false ? false : true,
      voorwaarde: normaliseerVoorwaarde(p.voorwaarde),
    });
  }
  return uit;
}

/** Volledige configuratie (afzender + sharepointMap + sjablonen + paragrafen), voor het beheerscherm. */
async function haalConfig() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) {
    return { afzender: { ...STANDAARD_AFZENDER }, sharepointMap: STANDAARD_SHAREPOINT_MAP, sjablonen: STANDAARD_SJABLONEN, paragrafen: [] };
  }
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    const sjablonen = normaliseerSjablonen(data.sjablonen);
    return {
      afzender: normaliseerAfzender(data.afzender),
      sharepointMap: tekst(data.sharepointMap, 80) || STANDAARD_SHAREPOINT_MAP,
      sjablonen: sjablonen.length ? sjablonen : STANDAARD_SJABLONEN,
      paragrafen: normaliseerParagrafen(data.paragrafen),
    };
  } catch {
    return { afzender: { ...STANDAARD_AFZENDER }, sharepointMap: STANDAARD_SHAREPOINT_MAP, sjablonen: STANDAARD_SJABLONEN, paragrafen: [] };
  }
}

/** Alleen wat het medewerkersportaal nodig heeft: afzender + sharepointMap + actieve sjablonen + actieve paragrafen. */
async function haalVoorPortaal() {
  const config = await haalConfig();
  return {
    afzender: config.afzender,
    sharepointMap: config.sharepointMap,
    sjablonen: config.sjablonen.filter((s) => s.actief),
    paragrafen: config.paragrafen.filter((p) => p.actief),
  };
}

async function zetConfig(config) {
  const schoon = {
    afzender: normaliseerAfzender(config && config.afzender),
    sharepointMap: tekst(config && config.sharepointMap, 80) || STANDAARD_SHAREPOINT_MAP,
    sjablonen: normaliseerSjablonen(config && config.sjablonen),
    paragrafen: normaliseerParagrafen(config && config.paragrafen),
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(schoon, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

module.exports = {
  haalConfig,
  haalVoorPortaal,
  zetConfig,
  STANDAARD_AFZENDER,
  STANDAARD_SJABLONEN,
  STANDAARD_SHAREPOINT_MAP,
};
