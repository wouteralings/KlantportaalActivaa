const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const TOEGESTANE_TYPES = ["programma", "mededeling", "faq"];
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

function valideerType(type) {
  if (!TOEGESTANE_TYPES.includes(type)) {
    const fout = new Error(`Onbekend type '${type}', verwacht 'programma', 'mededeling' of 'faq'.`);
    fout.code = "ONGELDIG_TYPE";
    throw fout;
  }
}

/** Geeft alle items van een type terug (leeg array als er nog niets is aangemaakt). */
async function haalItems(type) {
  valideerType(type);
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(`${type}.json`);

  const bestaat = await blobClient.exists();
  if (!bestaat) return [];

  const downloadResponse = await blobClient.download();
  const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
  return JSON.parse(tekst);
}

async function slaItemsOp(type, items) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(`${type}.json`);
  const buffer = Buffer.from(JSON.stringify(items, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/**
 * @param {"programma"|"mededeling"|"faq"} type
 * @param {object} velden - voor 'programma': { titel, url, klantcategorieen? }
 *                          voor 'mededeling': { titel, tekst, klantcategorieen? }
 *                          voor 'faq': { vraag, antwoord, klantcategorieen? }
 *                          Lege of ontbrekende klantcategorieen = zichtbaar voor iedereen.
 */
async function voegItemToe(type, velden) {
  const items = await haalItems(type);
  const { klantcategorieen, ...overigeVelden } = velden;
  const nieuw = {
    id: crypto.randomUUID(),
    ...overigeVelden,
    klantcategorieen: klantcategorieen || [],
    aangemaaktOp: new Date().toISOString(),
  };
  items.push(nieuw);
  await slaItemsOp(type, items);
  return nieuw;
}

async function werkItemBij(type, id, velden) {
  const items = await haalItems(type);
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  Object.assign(item, velden);
  await slaItemsOp(type, items);
  return item;
}

async function verwijderItem(type, id) {
  const items = await haalItems(type);
  const overgebleven = items.filter((i) => i.id !== id);
  await slaItemsOp(type, overgebleven);
  return overgebleven.length !== items.length;
}

/**
 * Herschikt de items van een type volgens de gegeven id-volgorde. Id's die niet in de lijst
 * voorkomen worden genegeerd; items die niet in de volgorde staan blijven achteraan.
 */
async function herschikItems(type, volgordeIds) {
  const items = await haalItems(type);
  const opId = new Map(items.map((i) => [i.id, i]));
  const geordend = [];
  for (const id of volgordeIds || []) {
    if (opId.has(id)) {
      geordend.push(opId.get(id));
      opId.delete(id);
    }
  }
  for (const rest of opId.values()) geordend.push(rest);
  await slaItemsOp(type, geordend);
  return geordend;
}

/** Filtert items die passen bij minstens één van de gegeven klantcategorieën, of voor iedereen zijn. */
function filterVoorCategorieen(items, klantcategorieen) {
  return items.filter(
    (item) =>
      !item.klantcategorieen ||
      item.klantcategorieen.length === 0 ||
      item.klantcategorieen.some((c) => klantcategorieen.includes(c))
  );
}

module.exports = { haalItems, voegItemToe, werkItemBij, verwijderItem, herschikItems, filterVoorCategorieen };
