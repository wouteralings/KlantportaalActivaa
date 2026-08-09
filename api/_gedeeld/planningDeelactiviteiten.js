/**
 * Deelactiviteiten (deelstappen) van de planning:
 *   1) per-klant AANPASSING van de deelstappen-lijst van een hoofdactiviteit (overschrijft het
 *      Beheer-sjabloon uit planningInstellingen.js voor die ene klant), en
 *   2) de AFVINK-STATUS per deelstap per klant per periode (maand YYYY-MM of jaar YYYY), met wie +
 *      wanneer. De hoofdactiviteit gebruikt de speciale deelstap-sleutel "__hoofd__".
 *
 * Opslag: Azure Blob Storage, container portaalcontent, twee blobs (zelfde patroon als takenTijd.js):
 *   - planning-deelstappen-klant.json : { "<accountId>|<activiteit>": [ { sleutel, label } ] }
 *   - planning-deelstap-status.json   : { "<accountId>|<activiteit>|<periode>|<deelstap>": { gereed, wie, datum } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_KLANT = "planning-deelstappen-klant.json";
const BLOB_STATUS = "planning-deelstap-status.json";
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
async function leesObject(blobNaam) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(blobNaam);
  if (!(await blobClient.exists())) return {};
  try {
    const obj = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
async function schrijfObject(blobNaam, obj) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(blobNaam);
  const buffer = Buffer.from(JSON.stringify(obj), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

const sleutel = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const schoon = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

// ── Per-klant deelstappen (override) ────────────────────────────────────────
async function haalAlleKlantDeelstappen() {
  return leesObject(BLOB_KLANT);
}
/** Zet de per-klant deelstappen-lijst voor (klant, activiteit). Lege lijst = terug naar het sjabloon. */
async function zetKlantDeelstappen(accountId, activiteit, deelstappen) {
  const acc = String(accountId || "").toLowerCase();
  const act = String(activiteit || "");
  if (!acc || !act) throw new Error("VALIDATIE: klant en activiteit zijn verplicht.");
  const alle = await haalAlleKlantDeelstappen();
  const key = `${acc}|${act}`;
  const gezien = new Set();
  const lijst = (Array.isArray(deelstappen) ? deelstappen : []).slice(0, 50).map((d) => {
    const label = schoon(d && d.label, 80);
    if (!label) return null;
    const sl = sleutel((d && d.sleutel) || label);
    if (!sl || gezien.has(sl)) return null;
    gezien.add(sl);
    return { sleutel: sl, label };
  }).filter(Boolean);
  if (lijst.length === 0) delete alle[key]; else alle[key] = lijst;
  await schrijfObject(BLOB_KLANT, alle);
  return lijst;
}

// ── Afvink-status per deelstap per periode ──────────────────────────────────
async function haalAlleStatus() {
  return leesObject(BLOB_STATUS);
}
/** De status-items van één periode: { "<accountId>|<activiteit>|<deelstap>": { gereed, wie, datum } }. */
async function haalStatusVoorPeriode(periode) {
  const p = String(periode || "");
  if (!p) return {};
  const alle = await haalAlleStatus();
  const uit = {};
  const suffix = `|${p}|`;
  for (const [k, v] of Object.entries(alle)) {
    const idx = k.indexOf(suffix);
    if (idx < 0) continue;
    // key = acc|act|periode|deel → geef terug als acc|act|deel
    const acc = k.slice(0, idx);
    const deel = k.slice(idx + suffix.length);
    uit[`${acc}|${deel}`] = v;
  }
  return uit;
}
/** Vink een deelstap (of "__hoofd__") af/uit voor (klant, activiteit, periode), met wie + datum. */
async function zetStatus(accountId, activiteit, periode, deelstap, gereed, wie, datumIso) {
  const acc = String(accountId || "").toLowerCase();
  const act = String(activiteit || "");
  const p = String(periode || "");
  const deel = deelstap === "__hoofd__" ? "__hoofd__" : sleutel(deelstap);
  if (!acc || !act || !p || !deel) throw new Error("VALIDATIE: klant, activiteit, periode en deelstap zijn verplicht.");
  const alle = await haalAlleStatus();
  const key = `${acc}|${act}|${p}|${deel}`;
  if (gereed) {
    alle[key] = { gereed: true, wie: schoon(wie, 200), datum: schoon(datumIso, 40) };
  } else {
    delete alle[key];
  }
  await schrijfObject(BLOB_STATUS, alle);
  return alle[key] || null;
}

module.exports = {
  haalAlleKlantDeelstappen, zetKlantDeelstappen,
  haalStatusVoorPeriode, zetStatus,
};
