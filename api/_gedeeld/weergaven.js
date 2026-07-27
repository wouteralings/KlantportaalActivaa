/**
 * Persoonlijke opgeslagen weergaven (klantoverzicht) per medewerker, in Azure Blob Storage
 * (container portaalcontent, blob klantoverzicht-weergaven.json).
 *
 * Structuur: { "<email>": { views: [{ naam, config }] } }
 * config = { kolommen: [keys], filters: {..}, sortKey, sortDir, toonAantal }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "klantoverzicht-weergaven.json";
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
  for await (const stuk of readableStream) {
    stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  }
  return Buffer.concat(stukken).toString("utf-8");
}

async function haalAlles() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function schrijfAlles(data) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

async function haalWeergavenVoorEmail(email) {
  const laag = String(email || "").toLowerCase();
  if (!laag) return [];
  const alle = await haalAlles();
  const eigen = alle[laag];
  return eigen && Array.isArray(eigen.views) ? eigen.views : [];
}

async function zetWeergavenVoorEmail(email, views) {
  const laag = String(email || "").toLowerCase();
  if (!laag) throw new Error("GEEN_EMAIL");
  const schoon = (Array.isArray(views) ? views : [])
    .filter((v) => v && v.naam)
    .slice(0, 50)
    .map((v) => ({ naam: String(v.naam).slice(0, 80), config: v.config || {} }));
  const alle = await haalAlles();
  alle[laag] = { views: schoon };
  await schrijfAlles(alle);
  return schoon;
}

module.exports = { haalWeergavenVoorEmail, zetWeergavenVoorEmail };
