/**
 * Opslag van het Postboek (inkomende post) in Azure Blob Storage — dezelfde container (portaalcontent)
 * als de overige portaal-data, als één block-blob (postboek.json) met een array van regels. Anders dan
 * het klantlog (append-only events) moeten postboek-regels bij te werken zijn (status Open → Afgehandeld,
 * documentlink), daarom een read-modify-write op één JSON-array. Bij Activaa is de gelijktijdigheid laag
 * (klein kantoor); mocht dat ooit knellen, dan is een append-event-log het alternatief.
 *
 * Eén regel:
 *   { id, aangemaaktOp(ISO), door(email uploader), accountId, klantnaam, klantnummer,
 *     soortId, soortLabel, bestand(naam), documentUrl(SharePoint webUrl), submap,
 *     naarType("rol"|"persoon"), naarRol, naarNaam, naarEmail, betrokkenEmails[],
 *     status("open"|"afgehandeld"), afgehandeldDoor, afgehandeldOp }
 * `betrokkenEmails` = de e-mailadressen die deze regel in hun "Mijn postboek" zien (de geadresseerde +
 * het team van de klant), zodat de medewerker-endpoint op "mijn" kan filteren.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "postboek.json";
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

/** Haalt alle postboek-regels op (lege lijst als er nog niets is). Best-effort bij leesfouten: []. */
async function haalPostboek() {
  try {
    const containerClient = await haalContainerClient();
    const blobClient = containerClient.getBlobClient(BLOB_NAAM);
    if (!(await blobClient.exists())) return [];
    const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
    const data = JSON.parse(tekst);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function schrijfPostboek(lijst) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(Array.isArray(lijst) ? lijst : [], null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Voegt één regel toe (met gegenereerd id + aangemaaktOp) en geeft de opgeslagen regel terug. */
async function voegToe(regel) {
  const lijst = await haalPostboek();
  const record = { id: crypto.randomUUID(), aangemaaktOp: new Date().toISOString(), ...regel };
  lijst.push(record);
  await schrijfPostboek(lijst);
  return record;
}

/** Werkt één regel bij (op id) met een patch; geeft de bijgewerkte regel terug of null als niet gevonden. */
async function werkBij(id, patch) {
  const lijst = await haalPostboek();
  const i = lijst.findIndex((e) => e && e.id === id);
  if (i === -1) return null;
  lijst[i] = { ...lijst[i], ...(patch || {}) };
  await schrijfPostboek(lijst);
  return lijst[i];
}

/** Verwijdert één regel (op id) uit het postboek; geeft de verwijderde regel terug of null als niet
 *  gevonden. Het SharePoint-document zelf wordt niet aangeraakt — alleen de registratie verdwijnt. */
async function verwijder(id) {
  const lijst = await haalPostboek();
  const i = lijst.findIndex((e) => e && e.id === id);
  if (i === -1) return null;
  const [weg] = lijst.splice(i, 1);
  await schrijfPostboek(lijst);
  return weg;
}

module.exports = { haalPostboek, voegToe, werkBij, verwijder };
