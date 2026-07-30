/**
 * Klant-specifieke aanleverlijsten per onderwerp. Per klant (accountId) en per onderwerp bepaal je
 * of het onderwerp van toepassing is en of je de algemene lijst gebruikt of een aangepaste lijst
 * voor deze klant (die dan voorrang krijgt bij een uitvraag).
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob klant-onderwerplijsten.json.
 * Structuur: { "<accountId>": { "<onderwerpId>": { actief: bool, regels: [ ... ] | null } } }
 *   - actief = onderwerp is van toepassing voor deze klant
 *   - regels = null  → gebruik de algemene lijst van het onderwerp (standaardLijstId)
 *   - regels = array → klant-specifieke lijst (voorrang); zelfde regel-vorm als een aanleverlijst
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "klant-onderwerplijsten.json";
let cachedContainerClient = null;

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

function tekst(v, max = 300) {
  return String(v == null ? "" : v).slice(0, max);
}

function normaliseerRegels(regels) {
  if (!Array.isArray(regels)) return null;
  return regels.slice(0, 200).map((r) => ({
    id: tekst(r && r.id, 60) || crypto.randomUUID(),
    naam: tekst(r && r.naam, 200),
    bestandsnaam: tekst(r && r.bestandsnaam, 200),
    toelichting: tekst(r && r.toelichting, 600),
    verplicht: r && r.verplicht === false ? false : true,
  }));
}

/** Normaliseert de config van één klant: { onderwerpId: { actief, regels|null } }. */
function normaliseerConfig(config) {
  const uit = {};
  if (!config || typeof config !== "object") return uit;
  for (const [onderwerpId, waarde] of Object.entries(config)) {
    if (!onderwerpId || !waarde || typeof waarde !== "object") continue;
    uit[tekst(onderwerpId, 60)] = {
      actief: waarde.actief === true,
      regels: waarde.regels == null ? null : normaliseerRegels(waarde.regels),
    };
  }
  return uit;
}

async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function schrijfAlle(alle) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(alle, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

async function haalVoorKlant(accountId) {
  if (!accountId) return {};
  return normaliseerConfig((await haalAlle())[accountId]);
}

/** Overschrijft de volledige onderwerp-config van één klant. Lege config → record weglaten. */
async function zetVoorKlant(accountId, config) {
  if (!accountId) throw new Error("Geen accountId opgegeven.");
  const alle = await haalAlle();
  const schoon = normaliseerConfig(config);
  if (Object.keys(schoon).length === 0) delete alle[accountId];
  else alle[accountId] = schoon;
  await schrijfAlle(alle);
  return schoon;
}

module.exports = { haalVoorKlant, zetVoorKlant, normaliseerConfig, normaliseerRegels };
