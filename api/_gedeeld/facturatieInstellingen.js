/**
 * Welke klant-accounts (Dataverse accountId) de facturatiemodule mogen gebruiken.
 *
 * Standaard UIT: een klant ziet de Facturen-tab pas nadat een beheerder deze voor dát
 * specifieke account heeft aangezet in het beheerdersportaal (tab "Facturatie"). Dit is
 * bewust GEEN Dynamics-veld — er is geen maker-toegang nodig en het werkt meteen, op
 * dezelfde manier als wijzigrechten.js dat al doet voor medewerkerrechten.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob facturatie-klanten.json):
 *   { "<accountId>": { ingeschakeld: bool, gewijzigdOp: ISO-datum, gewijzigdDoor: e-mail } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "facturatie-klanten.json";
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

/** Geeft het volledige statusdocument terug: { "<accountId>": { ingeschakeld, gewijzigdOp, gewijzigdDoor } }. */
async function haalStatussen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Of de facturatiemodule voor dit ene klant-account is ingeschakeld (standaard false). */
async function isIngeschakeld(accountId) {
  if (!accountId) return false;
  const statussen = await haalStatussen();
  return !!(statussen[accountId] && statussen[accountId].ingeschakeld);
}

/** Zet de status voor één klant-account en bewaart wie dit deed. */
async function zetIngeschakeld(accountId, ingeschakeld, gewijzigdDoor) {
  if (!accountId) throw new Error("VALIDATIE: accountId is verplicht.");
  const statussen = await haalStatussen();
  statussen[accountId] = {
    ingeschakeld: !!ingeschakeld,
    gewijzigdOp: new Date().toISOString(),
    gewijzigdDoor: gewijzigdDoor || "",
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(statussen, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return statussen[accountId];
}

module.exports = { haalStatussen, isIngeschakeld, zetIngeschakeld };
