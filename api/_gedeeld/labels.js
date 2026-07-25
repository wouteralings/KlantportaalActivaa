const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "documentlabels";
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

function veiligeBlobNaam(email) {
  return email.trim().toLowerCase().replace(/[^a-z0-9-_.@]/g, "_") + ".json";
}

/** Geeft { [driveItemId]: { label, entiteit } } terug voor deze gebruiker, of {} als er nog niets is opgeslagen. */
async function haalLabels(email) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(veiligeBlobNaam(email));
  const bestaat = await blobClient.exists();
  if (!bestaat) return {};
  const downloadResponse = await blobClient.download();
  const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
  return JSON.parse(tekst);
}

/** Werkt alleen de meegegeven velden bij (bijv. { label } of { entiteit } of allebei), de rest blijft staan. */
async function werkDocumentVeldenBij(email, driveItemId, updates) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(veiligeBlobNaam(email));
  const labels = await haalLabels(email);
  labels[driveItemId] = { ...(labels[driveItemId] || {}), ...updates };
  const buffer = Buffer.from(JSON.stringify(labels, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return labels[driveItemId];
}

module.exports = { haalLabels, werkDocumentVeldenBij };
