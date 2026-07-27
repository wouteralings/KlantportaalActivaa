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
 * Legt een gegeven akkoord vast. Als voor dezelfde taak al een akkoord bestaat wordt het
 * bijgewerkt i.p.v. gedupliceerd (idempotent bij dubbelklikken).
 */
async function voegAkkoordToe({ taakId, accountId, klantnummer, klantnaam, taaktitel, soort, aanvragerEmail }) {
  const akkoorden = await haalAlleAkkoorden();
  const bestaand = akkoorden.find((a) => a.taakId === taakId);
  if (bestaand) {
    bestaand.akkoordOp = new Date().toISOString();
    bestaand.aanvragerEmail = aanvragerEmail || bestaand.aanvragerEmail || "";
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
    soort: soort || "",
    aanvragerEmail: aanvragerEmail || "",
    akkoordOp: new Date().toISOString(),
  };
  akkoorden.push(nieuw);
  await schrijfAkkoorden(akkoorden);
  return nieuw;
}

async function haalAkkoordenVoorEmail(email) {
  const alle = await haalAlleAkkoorden();
  const laag = (email || "").toLowerCase();
  return alle.filter((a) => (a.aanvragerEmail || "").toLowerCase() === laag);
}

module.exports = { haalAlleAkkoorden, voegAkkoordToe, haalAkkoordenVoorEmail };
