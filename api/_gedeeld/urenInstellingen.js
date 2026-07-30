/**
 * Welke klant-accounts (Dataverse accountId) de urenregistratie mogen gebruiken.
 *
 * Aparte, losse schakelaar naast de facturatiemodule (zie facturatieInstellingen.js) — een klant
 * kan de urenregistratie (€2,50 per administratie) los aan laten zetten. Uren wérken alleen als
 * óók de facturatiemodule aan staat (klanten/artikelen/factureren zitten daar) — die combinatie
 * wordt afgedwongen in api/_gedeeld/urenToegang.js, niet hier.
 *
 * Standaard UIT: een klant ziet de Uren-sub-tab pas nadat een beheerder deze voor dát specifieke
 * account heeft aangezet in het beheerdersportaal (tab "Facturatie"/"Administratie", tweede
 * schakelaar). Zelfde Blob-JSON-patroon als facturatieInstellingen.js.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob uren-klanten.json):
 *   { "<accountId>": { ingeschakeld: bool, gewijzigdOp: ISO-datum, gewijzigdDoor: e-mail,
 *                       aangevraagdOp?: ISO-datum, aangevraagdDoor?: e-mail } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "uren-klanten.json";
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

/** Geeft het volledige statusdocument terug: { "<accountId>": { ingeschakeld, gewijzigdOp, gewijzigdDoor } }. */
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

/** Of de urenregistratie voor dit ene klant-account is ingeschakeld (standaard false). */
async function isIngeschakeld(accountId) {
  if (!accountId) return false;
  const statussen = await haalStatussen();
  return !!(statussen[accountId] && statussen[accountId].ingeschakeld);
}

/** Zet de status voor één klant-account en bewaart wie dit deed. */
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

/** Legt vast dat een klant de urenregistratie voor zijn account heeft aangevraagd. */
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
