const { BlobServiceClient } = require("@azure/storage-blob");

// Zelfde container/blob-indeling als api/instellingen (die is de enige die er ook naar
// schrijft, via de browser). Deze module is er voor functies die een instelling alleen
// hoeven te *lezen*, buiten de browser om — zoals api/teken, dat na een acceptatie de
// Power Automate-webhook-URL nodig heeft. Geen derde kopie van dezelfde blob-logica.
const CONTAINER_NAAM = "instellingen";

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

// Zelfde "veilige blobnaam"-regel als api/instellingen/index.js.
function veiligeBlobNaam(sleutel) {
  return sleutel.replace(/[^a-zA-Z0-9-_]/g, "_");
}

// Geeft de opgeslagen waarde van een instellingensleutel terug (ruwe string, zoals ook
// opgeslagen), of null als er nog niets is opgeslagen voor die sleutel.
async function haalInstellingWaarde(sleutel) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(veiligeBlobNaam(sleutel));
  const bestaat = await blobClient.exists();
  if (!bestaat) return null;
  const downloadResponse = await blobClient.download();
  return streamNaarTekst(downloadResponse.readableStreamBody);
}

module.exports = { haalInstellingWaarde };
