/**
 * Eenmalige (per-maand) toewijzing van een planning-configuratieregel aan een andere medewerker,
 * zonder de vaste toewijzing van die regel te wijzigen. Bedoeld voor de maandplanning: "deze maand
 * doet Piet de administratie van klant X i.p.v. Jan", terwijl de vaste planning bij Jan blijft.
 *
 * Opslag: Azure Blob Storage, container portaalcontent, blob planning-maand-toewijzing.json — een
 * object per maand: { "YYYY-MM": { "<config-regel-id>": "<medewerker-naam>" } }. Zelfde container/
 * patroon als takenTijd.js / takenGezien.js. De maandplanning past deze overschrijving toe bovenop
 * de vaste toewijzing (per-maand > vaste toewijzing > team).
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "planning-maand-toewijzing.json";
let cachedContainerClient = null;

const geldigeMaand = (m) => /^\d{4}-\d{2}$/.test(String(m || ""));

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

/** Het volledige { "YYYY-MM": { regelId: naam } }-object. */
async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const obj = JSON.parse(tekst);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** De eenmalige toewijzingen van één maand: { regelId: naam }. */
async function haalVoorMaand(maand) {
  if (!geldigeMaand(maand)) return {};
  const alle = await haalAlle();
  const m = alle[maand];
  return m && typeof m === "object" ? m : {};
}

/** Zet (of verwijder, bij lege naam) de eenmalige toewijzing van één regel in één maand. */
async function zet(regelId, maand, naam) {
  if (!regelId) throw new Error("VALIDATIE: regel-id ontbreekt.");
  if (!geldigeMaand(maand)) throw new Error("VALIDATIE: maand moet YYYY-MM zijn.");
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const alle = await haalAlle();
  const key = String(regelId);
  const schoon = (naam == null ? "" : String(naam)).trim();
  if (!alle[maand] || typeof alle[maand] !== "object") alle[maand] = {};
  if (!schoon) {
    delete alle[maand][key];
    if (Object.keys(alle[maand]).length === 0) delete alle[maand];
  } else {
    alle[maand][key] = schoon.slice(0, 320);
  }
  const buffer = Buffer.from(JSON.stringify(alle), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

module.exports = { haalAlle, haalVoorMaand, zet };
