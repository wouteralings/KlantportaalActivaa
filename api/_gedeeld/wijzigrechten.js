/**
 * Legt vast welke medewerkers (op e-mailadres) mogen wijzigen in het medewerkersportaal.
 * Rechtenniveaus:
 *   - gewone medewerker (rol 'medewerker')      → alleen lezen
 *   - medewerker in de "wijzigers"-lijst         → mag klantgegevens wijzigen
 *   - beheerder (rol 'beheerder')                → mag altijd wijzigen + beheert deze lijst
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob wijzigrechten.json).
 * Structuur: { "wijzigers": ["medewerker1@activaa.nl", "medewerker2@activaa.nl"] }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "wijzigrechten.json";
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

/** Geeft de lijst met e-mailadressen die mogen wijzigen (kleine letters). */
async function haalWijzigers() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    return Array.isArray(data.wijzigers) ? data.wijzigers : [];
  } catch {
    return [];
  }
}

/** Overschrijft de wijzigers-lijst (genormaliseerd naar unieke kleine letters). */
async function zetWijzigers(emails) {
  const uniek = [...new Set((emails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ wijzigers: uniek }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return uniek;
}

/** Bepaalt of deze gebruiker mag wijzigen: beheerder mag altijd; anders moet het e-mailadres in de lijst staan. */
async function magWijzigen(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  const wijzigers = await haalWijzigers();
  return wijzigers.includes(laag);
}

module.exports = { haalWijzigers, zetWijzigers, magWijzigen };
