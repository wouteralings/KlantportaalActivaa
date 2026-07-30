/**
 * Onderwerpen + opslaglocaties voor aanlever-uitvragen — centraal beheerd in het beheerdersportaal.
 * Een onderwerp bepaalt WAAR een aanlevering landt (het mappad onder de SharePoint-map van de klant)
 * en welke aanleverlijst standaard bij dat onderwerp hoort.
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob aanleveronderwerpen.json.
 * Structuur: { onderwerpen: [ { id, naam, pad, standaardLijstId } ] }
 *
 *   - naam            : bv. "Jaarwerk IB", "BTW", "Loonadministratie"
 *   - pad             : mappad onder de klant-basismap, met plaatshouders {jaar} en {onderwerp},
 *                       bv. "Jaarwerk/{jaar}" of "Aanleveren/{onderwerp}/{jaar}"
 *   - standaardLijstId: de aanleverlijst die standaard (algemeen) bij dit onderwerp hoort (optioneel)
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "aanleveronderwerpen.json";
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

function tekst(v, max = 200) {
  return String(v == null ? "" : v).slice(0, max);
}

function normaliseer(onderwerpen) {
  if (!Array.isArray(onderwerpen)) return [];
  return onderwerpen.slice(0, 200).map((o) => ({
    id: tekst(o && o.id, 60) || crypto.randomUUID(),
    naam: tekst(o && o.naam, 200),
    pad: tekst(o && o.pad, 300),
    standaardLijstId: tekst(o && o.standaardLijstId, 60),
  }));
}

async function haalOnderwerpen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return normaliseer(Array.isArray(data) ? data : data.onderwerpen);
  } catch {
    return [];
  }
}

async function zetOnderwerpen(onderwerpen) {
  const schoon = normaliseer(onderwerpen);
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ onderwerpen: schoon }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

/**
 * Zet een pad-sjabloon om naar concrete mapsegmenten, met {jaar} en {onderwerp} ingevuld. Lege
 * plaatshouders (bv. geen jaar opgegeven) en verboden tekens vallen weg; lege segmenten worden
 * overgeslagen. Geeft een array van submapnamen terug (t.o.v. de klant-basismap).
 */
function resolvePad(pad, { jaar, onderwerp, lijst } = {}) {
  const schoon = (s) => String(s || "").replace(/[\\:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").trim();
  return String(pad || "")
    .split("/")
    .map((seg) =>
      seg
        .replace(/\{jaar\}/gi, schoon(jaar))
        .replace(/\{onderwerp\}/gi, schoon(onderwerp))
        .replace(/\{lijst\}/gi, schoon(lijst))
    )
    .map((seg) => schoon(seg))
    .filter(Boolean)
    .slice(0, 8);
}

module.exports = { haalOnderwerpen, zetOnderwerpen, normaliseer, resolvePad };
