/**
 * Welke klant-accounts (Dataverse accountId) de facturatiemodule mogen gebruiken.
 *
 * Standaard UIT: een klant ziet de Facturen-tab pas nadat een beheerder deze voor dát
 * specifieke account heeft aangezet in het beheerdersportaal (tab "Facturatie"). Dit is
 * bewust GEEN Dynamics-veld — er is geen maker-toegang nodig en het werkt meteen, op
 * dezelfde manier als wijzigrechten.js dat al doet voor medewerkerrechten.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob facturatie-klanten.json):
 *   { "<accountId>": { ingeschakeld: bool, gewijzigdOp: ISO-datum, gewijzigdDoor: e-mail,
 *                       aangevraagdOp?: ISO-datum, aangevraagdDoor?: e-mail } }
 * aangevraagdOp/aangevraagdDoor: klant heeft op "Vraag facturatiemodule aan" geklikt terwijl
 * ingeschakeld nog false was (zie zetAanvraag). Wordt automatisch weer leeggemaakt zodra de
 * beheerder de module voor dat account aanzet (zie zetIngeschakeld).
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "facturatie-klanten.json";
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

/** Of de facturatiemodule voor dit ene klant-account is ingeschakeld (standaard false). */
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
    // Een aanzetten door de beheerder handelt een eventuele openstaande aanvraag af — die
    // hoeft dan niet meer apart getoond te worden in het beheerscherm.
    ...(ingeschakeld ? { aangevraagdOp: null, aangevraagdDoor: null } : {}),
  };
  await bewaarStatussen(statussen);
  return statussen[accountId];
}

/**
 * Legt vast dat een klant heeft gevraagd om de facturatiemodule voor zijn account aan te
 * laten zetten (klantportaal, "vraag facturatiemodule aan"-knop bij een uitgeschakeld
 * account). Zet de module zelf niet aan — dat blijft een bewuste actie van de beheerder
 * in Beheer → Facturatie, die daar de aanvraag als badge terugziet.
 */
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

/**
 * Klant-voorkeur: toon een snelknop "Factuur maken" op de homepagina van het klantportaal.
 * Los van aan/uit (dat blijft de beheerder); dit is puur een eigen voorkeur van de klant, in
 * dezelfde blob bijgehouden (los veld toonOpHome per account, laat de rest ongemoeid).
 */
async function zetToonOpHome(accountId, toonOpHome) {
  if (!accountId) throw new Error("VALIDATIE: accountId is verplicht.");
  const statussen = await haalStatussen();
  const huidig = statussen[accountId] || { ingeschakeld: false };
  statussen[accountId] = { ...huidig, toonOpHome: !!toonOpHome };
  await bewaarStatussen(statussen);
  return statussen[accountId];
}

async function bewaarStatussen(statussen) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(statussen, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

module.exports = { haalStatussen, isIngeschakeld, zetIngeschakeld, zetAanvraag, zetToonOpHome };
