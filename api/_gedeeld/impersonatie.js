/**
 * "Kijken als rol" (FASE 4) — server-ondersteunde impersonatie waarmee een BEHEERDER het portaal kan
 * bekijken zoals een bepaalde rol dat ziet en kan. De SWA-token van de beheerder kan niet worden
 * gewijzigd, dus we bewaren de actieve impersonatie server-side (per e-mailadres van de beheerder) en
 * laten /api/mijn-toegang die rol teruggeven i.p.v. zijn eigen. Zo volgt de hele UI (verborgen tabs,
 * functie-knoppen) automatisch de nagebootste rol.
 *
 * BELANGRIJK (veilig ontwerp): dit stuurt ALLEEN de weergave. De harde server-beveiliging blijft op de
 * echte identiteit van de beheerder (SWA-rol 'beheerder' + de mag*-checks in wijzigrechten.js op zijn
 * echte e-mailadres). Impersonatie kan een beheerder dus nooit méér laten dan hij al mag, en nooit
 * buitensluiten: stoppen kan altijd via de banner (het /api/impersonatie-endpoint is beveiligd op zijn
 * ECHTE beheerdersrol, niet op de nagebootste rol).
 *
 * Opslag: Azure Blob Storage (container portaalcontent, blob impersonatie.json):
 *   { "<beheerder-email>": { rolSleutel, sinds } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "impersonatie.json";
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

function normaliseerEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function haalAlles() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    if (!data || typeof data !== "object") return {};
    const uit = {};
    for (const [email, waarde] of Object.entries(data)) {
      const laag = normaliseerEmail(email);
      const sleutel = waarde && typeof waarde === "object" ? String(waarde.rolSleutel || "").trim() : "";
      if (laag && sleutel) uit[laag] = { rolSleutel: sleutel, sinds: (waarde && waarde.sinds) || "" };
    }
    return uit;
  } catch {
    return {};
  }
}

async function zetAlles(alles) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(alles || {}, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** De actieve impersonatie van een beheerder, of null. Best-effort. */
async function haalImpersonatie(email) {
  const laag = normaliseerEmail(email);
  if (!laag) return null;
  try {
    const alles = await haalAlles();
    return alles[laag] || null;
  } catch {
    return null;
  }
}

/** Start (of vervang) de impersonatie voor deze beheerder. */
async function zetImpersonatie(email, rolSleutel) {
  const laag = normaliseerEmail(email);
  const sleutel = String(rolSleutel || "").trim();
  if (!laag || !sleutel) return;
  const alles = await haalAlles();
  alles[laag] = { rolSleutel: sleutel, sinds: new Date().toISOString() };
  await zetAlles(alles);
}

/** Stop de impersonatie voor deze beheerder (geen fout als er niets liep). */
async function stopImpersonatie(email) {
  const laag = normaliseerEmail(email);
  if (!laag) return;
  const alles = await haalAlles();
  if (alles[laag]) {
    delete alles[laag];
    await zetAlles(alles);
  }
}

module.exports = { haalImpersonatie, zetImpersonatie, stopImpersonatie };
