/**
 * Logboek per cliënt/contactpersoon: legt vast wie wat wanneer heeft gedaan bij het koppelen,
 * loskoppelen en bewerken van contactpersonen (zie api/medewerker-contactpersoon).
 *
 * Opslag in Azure Blob Storage, dezelfde container (portaalcontent) als de overige portaal-data,
 * maar als APPEND BLOB (klant-log.jsonl): elke gebeurtenis is één JSON-regel die server-side
 * atomisch wordt aangehangen. Zo kunnen meerdere medewerkers tegelijk loggen zonder dat er regels
 * verloren gaan (in tegenstelling tot het read-modify-write patroon van de block-blobs elders).
 *
 * Eén gebeurtenis:
 *   { id, tijd(ISO), door(email), actie("koppel"|"ontkoppel"|"bewerken"),
 *     accountId, accountIds[], klantnaam, klantnummer, contactId, contactNaam, tekst }
 * `accountIds` bevat alle cliënten waar de gebeurtenis bij hoort (bij bewerken kan een
 * contactpersoon aan meerdere cliënten hangen), zodat het logboek bij élke betrokken cliënt
 * verschijnt. `tekst` is de kant-en-klare, leesbare omschrijving voor de weergave.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "klant-log.jsonl";
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
 * Voegt één gebeurtenis toe aan het logboek. Best-effort: een fout bij het loggen mag de
 * daadwerkelijke handeling (koppelen/bewerken) nooit laten mislukken, dus fouten worden hier
 * opgevangen en als null teruggegeven.
 */
async function logGebeurtenis(gebeurtenis) {
  try {
    const containerClient = await haalContainerClient();
    const appendClient = containerClient.getAppendBlobClient(BLOB_NAAM);
    await appendClient.createIfNotExists();
    const record = {
      id: crypto.randomUUID(),
      tijd: new Date().toISOString(),
      ...gebeurtenis,
    };
    const buffer = Buffer.from(JSON.stringify(record) + "\n", "utf-8");
    await appendClient.appendBlock(buffer, buffer.length);
    return record;
  } catch {
    return null;
  }
}

/**
 * Haalt het logboek op, gefilterd op cliënt (accountId) of contactpersoon (contactId), nieuwste
 * eerst. Best-effort: bij een leeg/ontbrekend logboek of een leesfout komt er gewoon een lege
 * lijst terug.
 */
async function haalLog({ accountId, contactId } = {}) {
  try {
    const containerClient = await haalContainerClient();
    const blobClient = containerClient.getBlobClient(BLOB_NAAM);
    if (!(await blobClient.exists())) return [];
    const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
    const gebeurtenissen = [];
    for (const regel of tekst.split("\n")) {
      const t = regel.trim();
      if (!t) continue;
      try { gebeurtenissen.push(JSON.parse(t)); } catch { /* corrupte regel overslaan */ }
    }
    let uit = gebeurtenissen;
    if (accountId) uit = uit.filter((e) => e.accountId === accountId || (Array.isArray(e.accountIds) && e.accountIds.includes(accountId)));
    if (contactId) uit = uit.filter((e) => e.contactId === contactId);
    uit.sort((a, b) => (String(a.tijd) < String(b.tijd) ? 1 : -1)); // nieuwste eerst
    return uit;
  } catch {
    return [];
  }
}

module.exports = { logGebeurtenis, haalLog };
