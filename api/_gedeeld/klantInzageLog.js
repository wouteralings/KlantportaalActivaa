/**
 * Audit-log van "meekijken als klant": elke keer dat een medewerker (met het als-klant-recht,
 * zie _gedeeld/wijzigrechten.js) het klantportaal alleen-lezen namens een klant bekijkt, wordt
 * hier vastgelegd wie, namens welke klant, en wanneer. Opslag in Azure Blob Storage, dezelfde
 * container (portaalcontent), blob klant-inzage-log.json — spiegelt bewust _gedeeld/taakakkoorden.js.
 *
 * Wordt geschreven vanuit api/_gedeeld/identiteit.js → herleidAccounts() zodra een geautoriseerde
 * meekijk-aanvraag (header x-meekijken-als-email) daadwerkelijk wordt uitgevoerd — dus per
 * ingelogde sessie/pagina-load, niet per losse API-aanroep (dat zou de log onleesbaar groot maken).
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "klant-inzage-log.json";
const MAX_ITEMS = 5000; // voorkomt een onbeperkt groeiend logbestand
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

async function haalLog() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function schrijfLog(items) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(items, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/**
 * Legt één meekijk-moment vast. Best-effort: een fout hier mag het meekijken zelf nooit blokkeren
 * (zie de aanroep in herleidAccounts, die dit in een try/catch aanroept).
 */
async function voegInzageToe({ medewerkerEmail, medewerkerNaam, klantAccountId, klantnummer, klantnaam }) {
  const log = await haalLog();
  log.push({
    id: crypto.randomUUID(),
    medewerkerEmail: medewerkerEmail || "",
    medewerkerNaam: medewerkerNaam || "",
    klantAccountId: klantAccountId || null,
    klantnummer: klantnummer ?? null,
    klantnaam: klantnaam || "",
    tijdstip: new Date().toISOString(),
  });
  // Nieuwste eerst bewaren zou elke keer het hele bestand herschrijven; in plaats daarvan
  // knippen we van vóór (oudste) af zodra de lijst te groot wordt.
  const bijgesneden = log.length > MAX_ITEMS ? log.slice(log.length - MAX_ITEMS) : log;
  await schrijfLog(bijgesneden);
  return bijgesneden[bijgesneden.length - 1];
}

module.exports = { haalLog, voegInzageToe };
