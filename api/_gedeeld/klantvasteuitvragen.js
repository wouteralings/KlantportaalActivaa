/**
 * Vaste uitvragen per klant. Een "vaste uitvraag" is een aanleverlijst die je voor één klant
 * (accountId) hebt ingericht: eventueel aangepaste documentregels + een toegewezen contactpersoon.
 * Zo staat de uitvraag klaar en is hij het jaar erop met één klik opnieuw uit te zetten.
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob klant-vaste-uitvragen.json.
 * Structuur: { "<accountId>": { "<lijstId>": {
 *     regels: [ { id, naam, bestandsnaam, toelichting, verplicht } ] | null,   // null = lijst uit beheer
 *     contactId, contactNaam,                                                   // toegewezen contactpersoon
 *     notitie,
 *     bewerktDoor, bewerktOp                                                     // audit: wie en wanneer
 * } } }
 *   - regels = null  → gebruik de lijst zoals in beheer (geen klant-specifieke aanpassing)
 *   - regels = array → klant-specifiek aangepaste lijst (voorrang bij uitzetten)
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "klant-vaste-uitvragen.json";
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

function tekst(v, max = 300) {
  return String(v == null ? "" : v).slice(0, max);
}

function normaliseerRegels(regels) {
  if (!Array.isArray(regels)) return null;
  return regels.slice(0, 200).map((r) => ({
    id: tekst(r && r.id, 60) || crypto.randomUUID(),
    naam: tekst(r && r.naam, 200),
    bestandsnaam: tekst(r && r.bestandsnaam, 200),
    toelichting: tekst(r && r.toelichting, 600),
    verplicht: r && r.verplicht === false ? false : true,
  }));
}

const FREQUENTIES = ["eenmalig", "wekelijks", "maandelijks", "kwartaal", "halfjaarlijks", "jaarlijks"];

function getal(v, min, max, standaard) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return standaard;
  return Math.min(max, Math.max(min, n));
}

/** ISO-datum (YYYY-MM-DD) of leeg; kapt eventuele tijd weg. */
function datum(v) {
  const s = String(v == null ? "" : v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * Normaliseert het abonnement (de herhaling) van een vaste uitvraag. Leeg/uit → null.
 *   - frequentie   : eenmalig | wekelijks | maandelijks | kwartaal | halfjaarlijks | jaarlijks
 *   - startDatum   : YYYY-MM-DD, de eerste (of enige) datum waarop het verzoek klaargezet wordt
 *   - deadlineDagen: de deadline = startdatum + zoveel dagen
 *   - modus        : "versturen" (direct zichtbaar voor de klant) of "concept" (medewerker geeft vrij)
 *   - email        : ook een e-mail naar de contactpersoon sturen
 *   - laatsteRun   : YYYY-MM-DD van de laatst klaargezette periode (dubbel-preventie)
 */
function normaliseerAbonnement(ab) {
  if (!ab || typeof ab !== "object") return null;
  return {
    actief: ab.actief === true,
    gepauzeerd: ab.gepauzeerd === true, // tijdelijk uit: de verwerker slaat het over, maar het blijft bestaan
    frequentie: FREQUENTIES.includes(ab.frequentie) ? ab.frequentie : "jaarlijks",
    startDatum: datum(ab.startDatum),
    deadlineDagen: getal(ab.deadlineDagen, 0, 3650, 30),
    modus: ab.modus === "versturen" ? "versturen" : "concept",
    email: ab.email === true,
    laatsteRun: datum(ab.laatsteRun),
  };
}

/** Normaliseert één vaste-uitvraag-item (van één lijst voor één klant). */
function normaliseerItem(item) {
  if (!item || typeof item !== "object") return null;
  return {
    regels: item.regels == null ? null : normaliseerRegels(item.regels),
    contactId: tekst(item.contactId, 60),
    contactNaam: tekst(item.contactNaam, 200),
    notitie: tekst(item.notitie, 600),
    abonnement: normaliseerAbonnement(item.abonnement),
    bewerktDoor: tekst(item.bewerktDoor, 200),
    bewerktOp: tekst(item.bewerktOp, 40),
  };
}

/** Normaliseert de volledige config van één klant: { lijstId: item }. */
function normaliseerConfig(config) {
  const uit = {};
  if (!config || typeof config !== "object") return uit;
  for (const [lijstId, item] of Object.entries(config)) {
    if (!lijstId) continue;
    const schoon = normaliseerItem(item);
    if (schoon) uit[tekst(lijstId, 60)] = schoon;
  }
  return uit;
}

async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
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

/** Alle vaste uitvragen van één klant: { lijstId: item }. */
async function haalVoorKlant(accountId) {
  if (!accountId) return {};
  return normaliseerConfig((await haalAlle())[accountId]);
}

/** Alle klanten met hun (genormaliseerde) vaste uitvragen: { accountId: { lijstId: item } }. Voor de verwerker. */
async function haalAlleGenormaliseerd() {
  const alle = await haalAlle();
  const uit = {};
  for (const [accountId, config] of Object.entries(alle || {})) {
    if (!accountId) continue;
    uit[accountId] = normaliseerConfig(config);
  }
  return uit;
}

/** Schrijft de volledige (genormaliseerde) set terug; lege klant-records worden weggelaten. Voor de verwerker. */
async function schrijfAlleGenormaliseerd(alle) {
  const uit = {};
  for (const [accountId, config] of Object.entries(alle || {})) {
    const schoon = normaliseerConfig(config);
    if (Object.keys(schoon).length) uit[accountId] = schoon;
  }
  await schrijfAlle(uit);
  return uit;
}

/**
 * Slaat één vaste uitvraag (lijst) voor één klant op. Stempelt automatisch bewerktDoor/bewerktOp.
 * Geeft het opgeslagen item terug.
 */
async function zetItem(accountId, lijstId, item, { door } = {}) {
  if (!accountId) throw new Error("Geen accountId opgegeven.");
  if (!lijstId) throw new Error("Geen lijstId opgegeven.");
  const alle = await haalAlle();
  const klantConfig = normaliseerConfig(alle[accountId]);
  const schoon = normaliseerItem(item) || normaliseerItem({});
  schoon.bewerktDoor = tekst(door, 200) || schoon.bewerktDoor;
  schoon.bewerktOp = new Date().toISOString();
  klantConfig[tekst(lijstId, 60)] = schoon;
  alle[accountId] = klantConfig;
  await schrijfAlle(alle);
  return schoon;
}

/**
 * Past het abonnement van één vaste uitvraag aan (merge van 'patch' in het bestaande abonnement) en
 * geeft het bijgewerkte abonnement terug, of null als het item niet bestaat.
 */
async function patchAbonnement(accountId, lijstId, patch) {
  if (!accountId || !lijstId) return null;
  const alle = await haalAlle();
  const klantConfig = normaliseerConfig(alle[accountId]);
  const item = klantConfig[lijstId];
  if (!item) return null;
  const huidig = item.abonnement || { actief: true, frequentie: "jaarlijks", startDatum: "", deadlineDagen: 30, modus: "concept", email: false, laatsteRun: "" };
  item.abonnement = normaliseerAbonnement({ ...huidig, ...(patch || {}) });
  klantConfig[lijstId] = item;
  alle[accountId] = klantConfig;
  await schrijfAlle(alle);
  return item.abonnement;
}

/** Verwijdert alleen het abonnement van een vaste uitvraag (de uitvraag zelf blijft bestaan). */
async function verwijderAbonnement(accountId, lijstId) {
  if (!accountId || !lijstId) return false;
  const alle = await haalAlle();
  const klantConfig = normaliseerConfig(alle[accountId]);
  const item = klantConfig[lijstId];
  if (!item || !item.abonnement) return false;
  item.abonnement = null;
  klantConfig[lijstId] = item;
  alle[accountId] = klantConfig;
  await schrijfAlle(alle);
  return true;
}

/** Verwijdert één vaste uitvraag (lijst) van één klant. */
async function verwijderItem(accountId, lijstId) {
  if (!accountId || !lijstId) return false;
  const alle = await haalAlle();
  const klantConfig = normaliseerConfig(alle[accountId]);
  if (!klantConfig[lijstId]) return false;
  delete klantConfig[lijstId];
  if (Object.keys(klantConfig).length === 0) delete alle[accountId];
  else alle[accountId] = klantConfig;
  await schrijfAlle(alle);
  return true;
}

module.exports = { haalVoorKlant, haalAlleGenormaliseerd, schrijfAlleGenormaliseerd, zetItem, verwijderItem, patchAbonnement, verwijderAbonnement, normaliseerConfig, normaliseerItem, normaliseerRegels, normaliseerAbonnement, FREQUENTIES };
