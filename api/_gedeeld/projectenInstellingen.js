/**
 * Of de Uren-module voor een klant-account ook een Project-koppeling toont ("projectenGekoppeld",
 * zie het plan/de skill "rittenregistratie" — punt "Uren ↔ Projecten"). Losstaand van de Ritten-
 * schakelaar (rittenInstellingen.js): een account kan best projectenGekoppeld=aan hebben zonder
 * dat Ritten voor dat account actief is, en andersom.
 *
 * Standaard UIT (backward compatible): Uren blijft dan werken zoals nu, met een verplicht
 * klant_klant_id en zonder zichtbaar projectveld. Alleen door de BEHEERDER per account aan te
 * zetten (zie api/beheer-projecten-koppeling) — geen aanvraagflow, dit is geen betaalmodule maar
 * een functie-schakelaar.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob projecten-koppeling.json):
 *   { "<accountId>": { gekoppeld: bool, gewijzigdOp: ISO-datum, gewijzigdDoor: e-mail } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "projecten-koppeling.json";
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

async function isGekoppeld(accountId) {
  if (!accountId) return false;
  const statussen = await haalStatussen();
  return !!(statussen[accountId] && statussen[accountId].gekoppeld);
}

async function zetGekoppeld(accountId, gekoppeld, gewijzigdDoor) {
  if (!accountId) throw new Error("VALIDATIE: accountId is verplicht.");
  const statussen = await haalStatussen();
  const huidig = statussen[accountId] || {};
  statussen[accountId] = {
    ...huidig,
    gekoppeld: !!gekoppeld,
    gewijzigdOp: new Date().toISOString(),
    gewijzigdDoor: gewijzigdDoor || "",
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(statussen, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return statussen[accountId];
}

module.exports = { haalStatussen, isGekoppeld, zetGekoppeld };
