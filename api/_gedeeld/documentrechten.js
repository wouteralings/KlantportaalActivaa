/**
 * Documentrechten per contactpersoon voor het klantportaal (SharePoint via app-only, bestuurd
 * vanuit het portaal — zie het projectdoc "Documenten & rechten — SharePoint via app-only").
 *
 * Zes rechten per contactpersoon (contactId):
 *   - aanleveren            → mag bestanden uploaden op een openstaand aanlever-verzoek
 *   - inzien                → mag de (algemene) documenten van de klant zien
 *   - akkorderen            → mag akkoord/ondertekening geven
 *   - inzienDirectie        → mag de vaste 'Directie'-submap van de klant zien
 *   - inzienAdministratie   → mag de vaste 'Administratie'-submap van de klant zien
 *   - bewerkenAdministratie → mag zelf bestanden uploaden in de 'Administratie'-submap (omvat ook
 *                             inzien+downloaden van die map — je moet 'm immers kunnen zien)
 *
 * Opslag in Azure Blob Storage, dezelfde container (portaalcontent), blob documentrechten.json.
 * Structuur: { "<contactId>": { aanleveren:bool, inzien:bool, akkorderen:bool,
 *              inzienDirectie:bool, inzienAdministratie:bool, bewerkenAdministratie:bool } }
 *
 * Fail-closed: een contactpersoon zonder record heeft overal 'false' (geen toegang), en de rechten
 * worden server-side afgedwongen in de document-endpoints. De rechten worden door beheerders gezet
 * in het contactpersoon-scherm van het medewerkersportaal.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "documentrechten.json";
const RECHT_KEYS = ["aanleveren", "inzien", "akkorderen", "inzienDirectie", "inzienAdministratie", "bewerkenAdministratie"];
let cachedContainerClient = null;

function leegRecht() {
  const uit = {};
  for (const k of RECHT_KEYS) uit[k] = false;
  return uit;
}

/** Houdt alleen de bekende recht-sleutels over en dwingt booleans af. */
function normaliseer(obj) {
  const uit = leegRecht();
  if (obj && typeof obj === "object") {
    for (const k of RECHT_KEYS) uit[k] = obj[k] === true;
  }
  return uit;
}

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

async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
    const data = JSON.parse(tekst);
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

/** Rechten van één contactpersoon (altijd genormaliseerd; onbekend = overal false). */
async function haalVoorContact(contactId) {
  if (!contactId) return leegRecht();
  const alle = await haalAlle();
  return normaliseer(alle[contactId]);
}

/** Zet (overschrijft) de rechten van één contactpersoon. Geeft de opgeslagen rechten terug. */
async function zetVoorContact(contactId, rechten) {
  if (!contactId) throw new Error("Geen contactId opgegeven.");
  const alle = await haalAlle();
  const schoon = normaliseer(rechten);
  // Heeft de contactpersoon nergens recht op, dan het record weglaten (compacter, zelfde effect).
  if (RECHT_KEYS.every((k) => !schoon[k])) delete alle[contactId];
  else alle[contactId] = schoon;
  await schrijfAlle(alle);
  return schoon;
}

module.exports = { RECHT_KEYS, leegRecht, normaliseer, haalAlle, haalVoorContact, zetVoorContact };
