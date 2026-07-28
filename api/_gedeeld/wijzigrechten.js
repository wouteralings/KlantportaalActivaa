/**
 * Rechten per medewerker (op e-mailadres) voor het medewerkersportaal.
 *
 * Twee onafhankelijke instellingen, beide beheerd in het beheerdersportaal:
 *   1) Wijzig-niveau (klantgegevens per klant wijzigen):
 *        - "medewerker" (standaard, niet opgeslagen) → alleen lezen
 *        - "manager"                                  → mag klantgegevens wijzigen
 *        - "beheerder"                                → mag wijzigen
 *      De Azure-rol 'beheerder' geeft sowieso altijd wijzig-rechten, los van deze lijst.
 *   2) Bulk-recht (meerdere klanten tegelijk aanpassen): een aparte lijst met e-mailadressen.
 *      De Azure-rol 'beheerder' mag sowieso altijd bulk-aanpassingen doen.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob wijzigrechten.json).
 * Structuur: { "niveaus": { "naam@activaa.nl": "manager" }, "bulk": ["naam@activaa.nl"] }
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

/**
 * Leest het volledige rechtendocument: { niveaus: {email:niveau}, bulk: [email] }.
 * Verwerkt ook de oude structuur { wijzigers: [emails] } (→ die golden als 'manager').
 */
async function haalRechten() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return { niveaus: {}, bulk: [] };
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    let niveaus = {};
    if (data && data.niveaus && typeof data.niveaus === "object" && !Array.isArray(data.niveaus)) {
      niveaus = data.niveaus;
    } else if (data && Array.isArray(data.wijzigers)) {
      // Backward-compat: oude structuur { wijzigers: [emails] }.
      for (const e of data.wijzigers) niveaus[String(e).toLowerCase()] = "manager";
    }
    const bulk = Array.isArray(data && data.bulk)
      ? data.bulk.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
      : [];
    return { niveaus, bulk };
  } catch {
    return { niveaus: {}, bulk: [] };
  }
}

/** Geeft alleen de niveaus terug: { "<email>": "manager"|"beheerder" }. */
async function haalNiveaus() {
  return (await haalRechten()).niveaus;
}

/** Geeft de bulk-lijst terug: [ "<email>" ] (kleine letters). */
async function haalBulk() {
  return (await haalRechten()).bulk;
}

/** Overschrijft het volledige rechtendocument. Normaliseert e-mail; 'medewerker' wordt niet bewaard. */
async function zetRechten({ niveaus, bulk }) {
  const schoonNiveaus = {};
  for (const [email, niveau] of Object.entries(niveaus || {})) {
    const laag = String(email || "").trim().toLowerCase();
    if (!laag) continue;
    if (niveau === "manager" || niveau === "beheerder") schoonNiveaus[laag] = niveau;
  }
  const schoonBulk = [...new Set(
    (Array.isArray(bulk) ? bulk : []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
  )];
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ niveaus: schoonNiveaus, bulk: schoonBulk }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return { niveaus: schoonNiveaus, bulk: schoonBulk };
}

/** Overschrijft alleen de niveaus; behoudt de bestaande bulk-lijst. */
async function zetNiveaus(niveaus) {
  const { bulk } = await haalRechten();
  return (await zetRechten({ niveaus, bulk })).niveaus;
}

/** Bepaalt of deze gebruiker mag wijzigen: beheerder (Azure) mag altijd; anders niveau manager/beheerder. */
async function magWijzigen(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  const niveaus = await haalNiveaus();
  return niveaus[laag] === "manager" || niveaus[laag] === "beheerder";
}

/** Bepaalt of deze gebruiker bulk-aanpassingen mag doen: beheerder (Azure) mag altijd; anders in de bulk-lijst. */
async function magBulk(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalBulk()).includes(laag);
}

module.exports = { haalRechten, haalNiveaus, haalBulk, zetRechten, zetNiveaus, magWijzigen, magBulk, GELDIGE_NIVEAUS };
