/**
 * Rechtenniveau per medewerker (op e-mailadres) voor het medewerkersportaal:
 *   - "medewerker" (standaard, niet opgeslagen) → alleen lezen
 *   - "manager"                                  → mag klantgegevens wijzigen
 *   - "beheerder"                                → mag wijzigen (en is bedoeld als beheerder)
 *
 * De Azure-rol 'beheerder' geeft sowieso altijd wijzig-rechten, los van deze lijst.
 * Opslag in Azure Blob Storage (container portaalcontent, blob wijzigrechten.json).
 * Structuur: { "niveaus": { "naam@activaa.nl": "manager" } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "wijzigrechten.json";
const GELDIGE_NIVEAUS = ["medewerker", "manager", "beheerder"];
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

/** Geeft de niveaus terug: { "<email>": "manager"|"beheerder" }. Alleen niet-standaard niveaus. */
async function haalNiveaus() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    if (data && data.niveaus && typeof data.niveaus === "object") return data.niveaus;
    // Backward-compat: oude structuur { wijzigers: [emails] } → die golden als 'manager'.
    if (data && Array.isArray(data.wijzigers)) {
      const n = {};
      for (const e of data.wijzigers) n[String(e).toLowerCase()] = "manager";
      return n;
    }
    return {};
  } catch {
    return {};
  }
}

/** Overschrijft de niveaus. Normaliseert e-mail naar kleine letters; 'medewerker' wordt niet bewaard. */
async function zetNiveaus(niveaus) {
  const schoon = {};
  for (const [email, niveau] of Object.entries(niveaus || {})) {
    const laag = String(email || "").trim().toLowerCase();
    if (!laag) continue;
    if (niveau === "manager" || niveau === "beheerder") schoon[laag] = niveau;
  }
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ niveaus: schoon }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

/** Bepaalt of deze gebruiker mag wijzigen: beheerder (Azure) mag altijd; anders niveau manager/beheerder. */
async function magWijzigen(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  const niveaus = await haalNiveaus();
  return niveaus[laag] === "manager" || niveaus[laag] === "beheerder";
}

module.exports = { haalNiveaus, zetNiveaus, magWijzigen, GELDIGE_NIVEAUS };
