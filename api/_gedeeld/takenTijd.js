/**
 * Per-taak "indicatie-tijd" voor de planning/bezetting. Elke Dynamics-taak kan voor de werklast-
 * berekening een aantal uren meekrijgen. Standaard geldt de standaard-tijd van de TAAKSOORT
 * (Beheer → Taken → "Std. uren"); per losse taak kan die worden overschreven — dan wint de
 * overschrijving. Zelfde idee als de indicatie-uren bij de planningsregels/-config.
 *
 * Opslag: Azure Blob Storage, container portaalcontent, blob taken-tijd.json — een object
 * { "<taak-id>": <uren-getal> }. Zelfde container/patroon als takenGezien.js.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "taken-tijd.json";
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

/** Het volledige { taakId: uren }-object (kleine letters als sleutel). */
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

/** De overschreven uren van één taak, of null als er geen overschrijving is. */
async function haalTijd(taakId) {
  if (!taakId) return null;
  const alle = await haalAlle();
  const v = alle[String(taakId).toLowerCase()];
  return v == null ? null : Number(v);
}

/** Zet (of verwijder, bij null/"") de overschreven uren van één taak. Geeft de nieuwe waarde terug. */
async function zetTijd(taakId, uren) {
  if (!taakId) return null;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const alle = await haalAlle();
  const key = String(taakId).toLowerCase();
  let waarde = null;
  if (uren === "" || uren == null) {
    delete alle[key];
  } else {
    const n = Number(uren);
    if (isNaN(n) || n < 0) throw new Error("VALIDATIE: uren moet een getal ≥ 0 zijn.");
    waarde = Math.round(n * 100) / 100;
    alle[key] = waarde;
  }
  const buffer = Buffer.from(JSON.stringify(alle), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return waarde;
}

module.exports = { haalAlle, haalTijd, zetTijd };
