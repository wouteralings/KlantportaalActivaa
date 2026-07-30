/**
 * Opgeslagen filters voor het abonnementen-overzicht in het beheerdersportaal. Per gebruiker (e-mail)
 * een aantal benoemde filter-presets, zodat een beheerder zijn favoriete filtercombinaties bewaart.
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob abonnement-filters.json.
 * Structuur: { "<email>": [ { id, naam, filter: { ... vrije velden ... } } ] }
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "abonnement-filters.json";
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

function sleutel(email) { return String(email || "").trim().toLowerCase(); }

async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function schrijfAlle(alle) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(alle, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** De opgeslagen filters van één gebruiker. */
async function haalVoor(email) {
  const e = sleutel(email);
  if (!e) return [];
  const lijst = (await haalAlle())[e];
  return Array.isArray(lijst) ? lijst : [];
}

/** Slaat een nieuwe preset op (of overschrijft er een met dezelfde naam). Geeft de bijgewerkte lijst terug. */
async function bewaar(email, naam, filter) {
  const e = sleutel(email);
  if (!e) throw new Error("Geen gebruiker.");
  const schoonNaam = String(naam || "").trim().slice(0, 80) || "Filter";
  const alle = await haalAlle();
  const lijst = Array.isArray(alle[e]) ? alle[e] : [];
  const bestaand = lijst.find((f) => f.naam.toLowerCase() === schoonNaam.toLowerCase());
  const veiligFilter = (filter && typeof filter === "object") ? JSON.parse(JSON.stringify(filter)) : {};
  if (bestaand) {
    bestaand.filter = veiligFilter;
  } else {
    lijst.push({ id: crypto.randomUUID(), naam: schoonNaam, filter: veiligFilter });
  }
  alle[e] = lijst.slice(0, 100);
  await schrijfAlle(alle);
  return alle[e];
}

/** Verwijdert een preset. Geeft de bijgewerkte lijst terug. */
async function verwijder(email, id) {
  const e = sleutel(email);
  if (!e) return [];
  const alle = await haalAlle();
  const lijst = (Array.isArray(alle[e]) ? alle[e] : []).filter((f) => f.id !== id);
  if (lijst.length) alle[e] = lijst; else delete alle[e];
  await schrijfAlle(alle);
  return lijst;
}

module.exports = { haalVoor, bewaar, verwijder };
