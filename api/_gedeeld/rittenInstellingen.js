/**
 * Welke klant-accounts (Dataverse accountId) de Rittenregistratie mogen gebruiken.
 *
 * Zelfde Blob-JSON-patroon als facturatieInstellingen.js/urenInstellingen.js — bewust GEEN
 * Dataverse-veld, werkt direct. Standaard UIT: een klant ziet de Ritten-tab pas nadat een
 * beheerder deze voor dát account heeft aangezet (Beheer → Ritten). ANDERS DAN Uren is dit
 * bewust NIET afhankelijk van de Facturatiemodule — zie het plan/skill "rittenregistratie".
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob ritten-klanten.json):
 *   { "<accountId>": { ingeschakeld: bool, gewijzigdOp: ISO-datum, gewijzigdDoor: e-mail,
 *                       aangevraagdOp?: ISO-datum, aangevraagdDoor?: e-mail } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "ritten-klanten.json";
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

async function isIngeschakeld(accountId) {
  if (!accountId) return false;
  const statussen = await haalStatussen();
  return !!(statussen[accountId] && statussen[accountId].ingeschakeld);
}

async function zetIngeschakeld(accountId, ingeschakeld, gewijzigdDoor) {
  if (!accountId) throw new Error("VALIDATIE: accountId is verplicht.");
  const statussen = await haalStatussen();
  const huidig = statussen[accountId] || {};
  statussen[accountId] = {
    ...huidig,
    ingeschakeld: !!ingeschakeld,
    gewijzigdOp: new Date().toISOString(),
    gewijzigdDoor: gewijzigdDoor || "",
    ...(ingeschakeld ? { aangevraagdOp: null, aangevraagdDoor: null } : {}),
  };
  await bewaarStatussen(statussen);
  return statussen[accountId];
}

/** Legt vast dat een klant heeft gevraagd om Ritten voor zijn account aan te laten zetten. Zet
 * de module zelf niet aan — dat blijft een bewuste actie van de beheerder. */
async function zetAanvraag(accountId, aangevraagdDoor) {
  if (!accountId) throw new Error("VALIDATIE: accountId is verplicht.");
  const statussen = await haalStatussen();
  const huidig = statussen[accountId] || { ingeschakeld: false };
  statussen[accountId] = {
    ...huidig,
    aangevraagdOp: new Date().toISOString(),
    aangevraagdDoor: aangevraagdDoor || "",
  };
  await bewaarStatussen(statussen);
  return statussen[accountId];
}

async function bewaarStatussen(statussen) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(statussen, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

module.exports = { haalStatussen, isIngeschakeld, zetIngeschakeld, zetAanvraag };
