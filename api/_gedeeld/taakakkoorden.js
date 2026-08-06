/**
 * Opslag van door de klant gegeven akkoorden op taken ("In afwachting reactie client")
 * in Azure Blob Storage, in dezelfde container (portaalcontent), blob taak-akkoorden.json.
 *
 * Dit spiegelt bewust _gedeeld/wijzigingen.js: het akkoord wordt hier vastgelegd (wie, wanneer,
 * welke taak) zodat het klantportaal een archief "Akkoord gegeven" kan tonen, ook nadat de taak
 * in Dynamics is afgerond en dus uit de openstaande lijst is verdwenen.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "taak-akkoorden.json";
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

async function haalAlleAkkoorden() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    return JSON.parse(tekst);
  } catch {
    return [];
  }
}

async function schrijfAkkoorden(akkoorden) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(akkoorden, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/**
 * Legt de reactie van de klant op een taak vast: "akkoord" of "niet_akkoord" (met bericht/reden).
 * Als voor dezelfde taak al een reactie bestaat wordt die bijgewerkt i.p.v. gedupliceerd
 * (idempotent bij dubbelklikken).
 */
async function voegAkkoordToe({ taakId, accountId, klantnummer, klantnaam, taaktitel, omschrijving, soort, aanvragerEmail, beslissing, bericht }) {
  const akkoorden = await haalAlleAkkoorden();
  const nu = new Date().toISOString();
  const beslissingWaarde = beslissing === "niet_akkoord" ? "niet_akkoord" : "akkoord";
  const bestaand = akkoorden.find((a) => a.taakId === taakId);
  if (bestaand) {
    bestaand.akkoordOp = nu;
    bestaand.aanvragerEmail = aanvragerEmail || bestaand.aanvragerEmail || "";
    bestaand.beslissing = beslissingWaarde;
    bestaand.bericht = bericht || "";
    // Omschrijving (de body/toelichting van de taak) bijwerken zodat de log toont waar het om ging.
    if (omschrijving !== undefined) bestaand.omschrijving = omschrijving || "";
    await schrijfAkkoorden(akkoorden);
    return bestaand;
  }
  const nieuw = {
    id: crypto.randomUUID(),
    taakId,
    accountId: accountId || null,
    klantnummer: klantnummer ?? null,
    klantnaam: klantnaam || "",
    taaktitel: taaktitel || "",
    // Omschrijving van de taak (Dynamics task.description) — zodat de medewerker in de log ziet
    // om welke taak het ging, niet alleen de titel.
    omschrijving: omschrijving || "",
    soort: soort || "",
    aanvragerEmail: aanvragerEmail || "",
    beslissing: beslissingWaarde,
    bericht: bericht || "",
    akkoordOp: nu,
  };
  akkoorden.push(nieuw);
  await schrijfAkkoorden(akkoorden);
  return nieuw;
}

// "Gezien"-markering voor de badge op de tab "Log klantreacties" (zelfde idee als de reviews-gezien
// in reviewopslag.js): één timestamp-blob; alle reacties die daarna binnenkomen tellen als "nieuw".
const GEZIEN_BLOB = "reacties-gezien.json";
async function haalReactiesGezien() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(GEZIEN_BLOB);
  if (!(await blobClient.exists())) return null;
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    return JSON.parse(tekst).gezienOp || null;
  } catch {
    return null;
  }
}
async function zetReactiesGezien(moment) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(GEZIEN_BLOB);
  const buffer = Buffer.from(JSON.stringify({ gezienOp: moment }), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return moment;
}

async function haalAkkoordenVoorEmail(email) {
  const alle = await haalAlleAkkoorden();
  const laag = (email || "").toLowerCase();
  return alle.filter((a) => (a.aanvragerEmail || "").toLowerCase() === laag);
}

module.exports = { haalAlleAkkoorden, voegAkkoordToe, haalAkkoordenVoorEmail, haalReactiesGezien, zetReactiesGezien };
