const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalmedia";
let cachedContainerClient = null;

async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAAM);
  // Privé container: veel Azure Storage-accounts blokkeren tegenwoordig publieke blob-toegang
  // (PublicAccessNotPermitted), waardoor createIfNotExists({access:"blob"}) faalt. We serveren
  // de afbeeldingen daarom via de eigen (anonieme) route /api/media/{naam} i.p.v. via de blob-URL.
  await containerClient.createIfNotExists();
  cachedContainerClient = containerClient;
  return containerClient;
}

async function streamNaarBuffer(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) {
    stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  }
  return Buffer.concat(stukken);
}

/**
 * Slaat een afbeelding op vanuit een data-URL (bijv. "data:image/png;base64,....") onder een
 * vaste naam (logo/favicon) en geeft een relatieve, publiek bereikbare URL terug naar de
 * media-route. Er wordt een versie-parameter meegegeven zodat de browser een nieuwe upload
 * direct oppikt in plaats van de oude uit de cache te halen.
 */
async function slaAfbeeldingOp(dataUrl, basisnaam) {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) {
    const fout = new Error("Verwacht een data-URL, bijv. 'data:image/png;base64,...'.");
    fout.code = "ONGELDIGE_AFBEELDING";
    throw fout;
  }
  const [, contentType, base64Data] = match;

  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(basisnaam);
  const buffer = Buffer.from(base64Data, "base64");
  await blobClient.upload(buffer, buffer.length, {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return `/api/media/${basisnaam}?v=${Date.now()}`;
}

/** Leest een opgeslagen afbeelding terug: { buffer, contentType } — of null als hij niet bestaat. */
async function haalAfbeelding(basisnaam) {
  const naam = String(basisnaam || "").replace(/[^a-z0-9_-]/gi, "");
  if (!naam) return null;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(naam);
  if (!(await blobClient.exists())) return null;
  const download = await blobClient.download();
  const buffer = await streamNaarBuffer(download.readableStreamBody);
  return { buffer, contentType: download.contentType || "application/octet-stream" };
}

const slaLogoOp = (dataUrl) => slaAfbeeldingOp(dataUrl, "logo");
const slaFaviconOp = (dataUrl) => slaAfbeeldingOp(dataUrl, "favicon");

// Eigen logo van een portaalklant (Facturatiemodule → Bedrijfsgegevens & logo), voor op de
// eigen facturen/offertes. Eén blob per klant-account; accountId is een GUID (hex + '-'),
// dus altijd al een veilige blobnaam — geen aparte sanitatie nodig zoals bij haalAfbeelding.
const slaKlantLogoOp = (dataUrl, klantAccountId) => slaAfbeeldingOp(dataUrl, `klantlogo-${klantAccountId}`);

// Logo op het briefpapier van de Brieven-module (Beheer → Brieven). Eén blob "brieflogo",
// geserveerd via /api/media/brieflogo en geëmbed in de PDF/Word van een brief.
const slaBrieflogoOp = (dataUrl) => slaAfbeeldingOp(dataUrl, "brieflogo");

module.exports = { slaLogoOp, slaFaviconOp, slaKlantLogoOp, slaBrieflogoOp, haalAfbeelding };
