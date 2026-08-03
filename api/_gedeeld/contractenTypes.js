/**
 * Beheerbare lijst van contracttypes (Contractenmodule) — sinds 04-08-2026 op verzoek van Wouter
 * ("Type contract zou ik graag uitbreiden. En willen kunnen uitbreiden in beheer.") omgezet van
 * de vaste GELDIGE_TYPES-array (contractenKlanten.js) naar een in Beheer bewerkbare lijst.
 *
 * Zelfde opslag-patroon als aanleveronderwerpen.js: Azure Blob Storage, container portaalcontent,
 * blob contracten-types.json. Structuur: { types: [ { sleutel, label, actief } ] }.
 *
 *   - sleutel : de stabiele, machine-leesbare waarde die in dbo.contracten_klanten.type wordt
 *               opgeslagen (bestaande contracten blijven dus geldig, ook als het label later
 *               wijzigt). Wordt bij het aanmaken van een nieuw type automatisch afgeleid van het
 *               label als er nog geen sleutel is meegegeven; bij het bewerken van een bestaand
 *               type blijft de sleutel altijd hetzelfde (alleen het label is dan nog aan te
 *               passen — een sleutel wijzigen zou bestaande contracten "ontkoppelen").
 *   - label   : de weergavenaam, bijv. "Verzekering".
 *   - actief  : staat het type nog in de keuzelijst voor NIEUWE contracten (klant/medewerker)?
 *               Uitzetten in plaats van verwijderen, zodat contracten met dat type in het
 *               verleden geldig blijven en gewoon hun label blijven tonen.
 *
 * Bij de eerste aanroep (nog geen blob) wordt de lijst geseed met exact de oude, hardcoded
 * GELDIGE_TYPES-lijst, zodat bestaande contracten zonder enige migratie geldig blijven.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "contracten-types.json";
let cachedContainerClient = null;

const STANDAARD_TYPES = [
  { sleutel: "verzekering", label: "Verzekering", actief: true },
  { sleutel: "telefonie", label: "Telefonie", actief: true },
  { sleutel: "internet", label: "Internet", actief: true },
  { sleutel: "software", label: "Software", actief: true },
  { sleutel: "lease", label: "Lease", actief: true },
  { sleutel: "overig", label: "Overig", actief: true },
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

function maakSleutel(tekst) {
  return String(tekst || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accenten weg
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function tekst(v, max = 200) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** Normaliseert + ontdubbelt sleutels (laatste met dezelfde sleutel wint niet — de eerste blijft). */
function normaliseer(types) {
  if (!Array.isArray(types)) return [];
  const gezien = new Set();
  const uit = [];
  for (const t of types.slice(0, 100)) {
    const label = tekst(t && t.label, 100);
    if (!label) continue;
    let sleutel = maakSleutel((t && t.sleutel) || label);
    if (!sleutel) continue;
    if (gezien.has(sleutel)) continue; // dubbele sleutel overslaan i.p.v. data laten overschrijven
    gezien.add(sleutel);
    uit.push({ sleutel, label, actief: t && t.actief === false ? false : true });
  }
  return uit;
}

/** Alle types (incl. niet-actieve) — voor het beheerscherm en voor validatie van bestaande contracten. */
async function haalTypes() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return STANDAARD_TYPES;
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    const genormaliseerd = normaliseer(Array.isArray(data) ? data : data.types);
    return genormaliseerd.length ? genormaliseerd : STANDAARD_TYPES;
  } catch {
    return STANDAARD_TYPES;
  }
}

/** Alleen actieve types — voor de keuzelijst bij het aanmaken/wijzigen van een contract. */
async function haalActieveTypes() {
  return (await haalTypes()).filter((t) => t.actief);
}

async function zetTypes(types) {
  const schoon = normaliseer(types);
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ types: schoon }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

/** Of 'sleutel' een geldig (bekend) contracttype is — incl. niet-actieve, zodat een contract met
 *  een inmiddels gedeactiveerd type nog steeds opgeslagen/bewerkt kan worden zonder het type te
 *  hoeven wijzigen. */
async function magSleutel(sleutel) {
  const s = maakSleutel(sleutel);
  if (!s) return false;
  const types = await haalTypes();
  return types.some((t) => t.sleutel === s);
}

module.exports = { haalTypes, haalActieveTypes, zetTypes, magSleutel, maakSleutel, STANDAARD_TYPES };
