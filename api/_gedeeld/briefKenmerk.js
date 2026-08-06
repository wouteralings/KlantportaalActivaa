/**
 * Genereert een uniek briefkenmerk in de vorm  {jaar}-{klantnummer}-{volgnummer}
 * (bijv. 2026-1023-0001). Het volgnummer loopt per klant per jaar op en wordt in Azure Blob
 * Storage bijgehouden (container portaalcontent, blob brief-kenmerk-teller.json).
 *
 * Uniciteit: de teller wordt met optimistic concurrency (ETag ifMatch/ifNoneMatch) weggeschreven,
 * met een paar retries. Zo krijgen twee gelijktijdige verzendingen nooit hetzelfde nummer — bij
 * botsing (412 Precondition Failed) leest de generator opnieuw en probeert het volgende nummer.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "brief-kenmerk-teller.json";
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

/** Leest de teller-blob → { tellers: {sleutel: n}, etag|null }. Ontbreekt de blob, dan etag=null. */
async function leesTellers(blobClient) {
  if (!(await blobClient.exists())) return { tellers: {}, etag: null };
  const dl = await blobClient.download();
  const tekst = await streamNaarTekst(dl.readableStreamBody);
  let tellers = {};
  try { tellers = JSON.parse(tekst) || {}; } catch { tellers = {}; }
  return { tellers, etag: dl.etag || null };
}

/**
 * Kent het volgende unieke kenmerk toe voor deze klant (per jaar oplopend).
 * @param {string|number} klantnummer  Het klantnummer (cijfers); leeg → "0000".
 * @returns {Promise<string>}          bv. "2026-1023-0001"
 */
async function genereerKenmerk(klantnummer) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const jaar = new Date().getFullYear();
  const knr = String(klantnummer == null ? "" : klantnummer).replace(/\D/g, "") || "0000";
  const sleutel = `${jaar}-${knr}`;

  for (let poging = 0; poging < 6; poging++) {
    const { tellers, etag } = await leesTellers(blobClient);
    const volgnr = (Number(tellers[sleutel]) || 0) + 1;
    tellers[sleutel] = volgnr;
    const buffer = Buffer.from(JSON.stringify(tellers, null, 2), "utf-8");
    // Bestaat de blob nog niet → alleen aanmaken als niemand anders 'm ondertussen aanmaakte
    // (ifNoneMatch:"*"); bestaat 'ie wel → alleen schrijven als de ETag nog klopt (ifMatch).
    const condities = etag ? { ifMatch: etag } : { ifNoneMatch: "*" };
    try {
      await blobClient.upload(buffer, buffer.length, { conditions: condities });
      return `${jaar}-${knr}-${String(volgnr).padStart(4, "0")}`;
    } catch (e) {
      const status = e && (e.statusCode || e.status);
      if (status === 412 || status === 409) continue; // botsing → opnieuw lezen en volgende nummer
      throw e;
    }
  }
  throw new Error("Kon geen uniek briefkenmerk toekennen (te veel gelijktijdige verzendingen).");
}

module.exports = { genereerKenmerk };
