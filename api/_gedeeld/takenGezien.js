/**
 * Per-medewerker "gezien"-markering voor de rode badge op het tabblad "Taken" in het
 * medewerkersportaal. Anders dan de reviews-/reacties-badge (één gedeelde timestamp voor iedereen)
 * is dit PER medewerker: de badge telt "mijn nieuwe taken (eigenaar) sinds ík voor het laatst
 * keek", dus elke medewerker heeft een eigen gezien-moment.
 *
 * Opslag: Azure Blob Storage, container portaalcontent, blob taken-gezien.json — een object
 * { "<email-in-kleine-letters>": "<ISO-timestamp>" }. Zelfde container/patroon als taakakkoorden.js.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "taken-gezien.json";
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

/** Het laatste gezien-moment (ISO-string) van deze medewerker, of null als hij nog nooit keek. */
async function haalGezien(email) {
  if (!email) return null;
  const alle = await haalAlle();
  return alle[String(email).toLowerCase()] || null;
}

/** Legt vast dat deze medewerker de taken nú gezien heeft. */
async function zetGezien(email, moment) {
  if (!email) return moment;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const alle = await haalAlle();
  alle[String(email).toLowerCase()] = moment;
  const buffer = Buffer.from(JSON.stringify(alle), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return moment;
}

module.exports = { haalGezien, zetGezien };
