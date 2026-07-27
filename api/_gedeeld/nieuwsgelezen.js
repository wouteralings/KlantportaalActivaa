/**
 * Onthoudt welke nieuws-/blogberichten een klant als "gelezen" heeft gemarkeerd, in Azure Blob
 * Storage (container portaalcontent, blob nieuws-gelezen.json). Berichten hebben geen eigen id;
 * we gebruiken de artikel-URL als sleutel.
 *
 * Structuur: { "<email in kleine letters>": ["https://…", "https://…"] }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "nieuws-gelezen.json";
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

async function haalGelezenVoorEmail(email) {
  const alle = await haalAlles();
  return alle[(email || "").toLowerCase()] || [];
}

/** Markeert één URL als gelezen voor dit e-mailadres (idempotent). */
async function markeerGelezen(email, url) {
  const laag = (email || "").toLowerCase();
  const alle = await haalAlles();
  const lijst = alle[laag] || [];
  if (!lijst.includes(url)) {
    lijst.push(url);
    alle[laag] = lijst;
    await schrijfAlles(alle);
  }
  return lijst;
}

/** Haalt een URL weer uit de gelezen-lijst (voor 'markeer als ongelezen'). */
async function verwijderGelezen(email, url) {
  const laag = (email || "").toLowerCase();
  const alle = await haalAlles();
  const lijst = (alle[laag] || []).filter((u) => u !== url);
  alle[laag] = lijst;
  await schrijfAlles(alle);
  return lijst;
}

module.exports = { haalGelezenVoorEmail, markeerGelezen, verwijderGelezen };
