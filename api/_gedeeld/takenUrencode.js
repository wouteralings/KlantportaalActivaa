/**
 * Per-taak "urencode" voor het gekoppelde urenschrijven. Elke Dynamics-taak kan een urencode
 * meekrijgen; die wordt voorgevuld zodra je vanuit de taak uren schrijft. Standaard geldt de
 * urencode van de TAAKSOORT (Beheer → Taken → "Urencode"); per losse taak kan die worden
 * overschreven — dan wint de overschrijving. Exact hetzelfde idee (en dezelfde opslagvorm) als
 * takenTijd.js voor de indicatie-uren.
 *
 * Opslag: Azure Blob Storage, container portaalcontent, blob taken-urencode.json — een object
 * { "<taak-id>": "<urencode-naam>" }. Bewust op NAAM, net als cr283_urenboeking.urencode, zodat de
 * koppeling los staat van interne id's van de urencodelijst.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "taken-urencode.json";
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

/** Het volledige { taakId: urencode }-object (kleine letters als sleutel). */
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

/** De overschreven urencode van één taak, of null als er geen overschrijving is. */
async function haalUrencode(taakId) {
  if (!taakId) return null;
  const alle = await haalAlle();
  const v = alle[String(taakId).toLowerCase()];
  return v == null || v === "" ? null : String(v);
}

/** Zet (of verwijder, bij leeg/null) de urencode van één taak. Geeft de nieuwe waarde terug. */
async function zetUrencode(taakId, urencode) {
  if (!taakId) return null;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const alle = await haalAlle();
  const key = String(taakId).toLowerCase();
  let waarde = null;
  const schoon = urencode == null ? "" : String(urencode).trim().slice(0, 100);
  if (!schoon) {
    delete alle[key];
  } else {
    waarde = schoon;
    alle[key] = waarde;
  }
  const buffer = Buffer.from(JSON.stringify(alle), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return waarde;
}

module.exports = { haalAlle, haalUrencode, zetUrencode };
