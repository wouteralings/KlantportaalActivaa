/**
 * Instellingen voor de verlofmodule (interne urenregistratie): de landelijke (bedrijfsbrede)
 * fulltime verlofuren per jaar, en de beheerbare lijst verloftypen. Opslag in Azure Blob
 * (container portaalcontent, blob verlof-instellingen.json) — zelfde soort app-configuratie als
 * urenInstellingenIntern.js (herinneringen) en contractenTypes.js (beheerbare lijst).
 *
 * verlofUrenFulltime: ÉÉN bedrijfsbreed getal (bijv. 200 = 25 dagen × 8 uur). Het werkelijke
 * verloftegoed per medewerker wordt hiervan afgeleid via de parttime-factor uit hun eigen
 * werkrooster (zie verlofDataverse.js) — er is dus bewust GEEN los tegoed per medewerker in te
 * voeren, om dubbele invoer te voorkomen.
 *
 * verloftypen: zelfde patroon als contractenTypes.js — een vaste startlijst (vakantie, ziek,
 * bijzonder verlof, onbetaald) die de beheerder later kan uitbreiden/aanpassen zonder migratie.
 * sleutel = stabiele, machine-leesbare waarde (opgeslagen op de aanvraag); label = weergavenaam;
 * actief = staat het type nog in de keuzelijst voor NIEUWE aanvragen (uitzetten i.p.v.
 * verwijderen, zodat bestaande aanvragen met dat type geldig blijven).
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "verlof-instellingen.json";
let cachedContainerClient = null;

const STANDAARD_VERLOFTYPEN = [
  { sleutel: "vakantie", label: "Vakantie", actief: true },
  { sleutel: "ziek", label: "Ziek", actief: true },
  { sleutel: "bijzonder_verlof", label: "Bijzonder verlof", actief: true },
  { sleutel: "onbetaald", label: "Onbetaald verlof", actief: true },
];
const STANDAARD_VERLOFUREN_FULLTIME = 200; // 25 dagen × 8 uur

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

function maakSleutel(tekst) {
  return String(tekst || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/** Normaliseert + ontdubbelt de verloftypen-lijst (zelfde aanpak als contractenTypes.js). */
function normaliseerTypen(types) {
  if (!Array.isArray(types)) return [];
  const gezien = new Set();
  const uit = [];
  for (const t of types.slice(0, 50)) {
    const label = String((t && t.label) || "").trim().slice(0, 100);
    if (!label) continue;
    let sleutel = maakSleutel((t && t.sleutel) || label);
    if (!sleutel) continue;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ sleutel, label, actief: t && t.actief === false ? false : true });
  }
  return uit;
}

async function haalRuw() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return null;
  try {
    return JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
  } catch {
    return null;
  }
}

/** Volledige instellingen: { verlofUrenFulltime, verloftypen }. Seedt de standaardwaarden bij de eerste aanroep. */
async function haalInstellingen() {
  const ruw = await haalRuw();
  const verloftypen = normaliseerTypen(ruw && ruw.verloftypen);
  return {
    verlofUrenFulltime: ruw && ruw.verlofUrenFulltime != null ? Number(ruw.verlofUrenFulltime) : STANDAARD_VERLOFUREN_FULLTIME,
    verloftypen: verloftypen.length ? verloftypen : STANDAARD_VERLOFTYPEN,
  };
}

/** Alleen actieve verloftypen — voor de keuzelijst bij het indienen van een aanvraag. */
async function haalActieveVerloftypen() {
  return (await haalInstellingen()).verloftypen.filter((t) => t.actief);
}

async function bewaar(data) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
}

/** Zet het landelijke aantal fulltime verlofuren per jaar. */
async function zetVerlofUrenFulltime(uren) {
  const huidig = await haalInstellingen();
  const nieuw = { ...huidig, verlofUrenFulltime: Math.max(0, Number(uren) || 0) };
  await bewaar(nieuw);
  return nieuw;
}

/** Vervangt de volledige verloftypen-lijst (toevoegen/bewerken/uitzetten gaat via de hele lijst, zelfde als contractenTypes.js). */
async function zetVerloftypen(types) {
  const huidig = await haalInstellingen();
  const schoon = normaliseerTypen(types);
  const nieuw = { ...huidig, verloftypen: schoon.length ? schoon : STANDAARD_VERLOFTYPEN };
  await bewaar(nieuw);
  return nieuw;
}

/** Of 'sleutel' een geldig (bekend) verloftype is — incl. niet-actieve, zodat een oudere aanvraag
 *  met een inmiddels gedeactiveerd type geldig blijft. */
async function magSleutel(sleutel) {
  const s = maakSleutel(sleutel);
  if (!s) return false;
  const { verloftypen } = await haalInstellingen();
  return verloftypen.some((t) => t.sleutel === s);
}

/** Label bij een sleutel (valt terug op de sleutel zelf als het type niet meer bekend is). */
async function labelVoor(sleutel) {
  const { verloftypen } = await haalInstellingen();
  const t = verloftypen.find((x) => x.sleutel === sleutel);
  return t ? t.label : String(sleutel || "");
}

module.exports = {
  haalInstellingen, haalActieveVerloftypen, zetVerlofUrenFulltime, zetVerloftypen, magSleutel, labelVoor,
  maakSleutel, STANDAARD_VERLOFTYPEN, STANDAARD_VERLOFUREN_FULLTIME,
};
