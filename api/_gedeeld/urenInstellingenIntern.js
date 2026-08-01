/**
 * Instellingen van de herinneringsflow voor de INTERNE urenregistratie. Opslag in Azure Blob
 * (container portaalcontent, blob uren-intern-instellingen.json) — dit is app-configuratie, geen
 * urendata, dus bewust niet in Dataverse. Eén JSON-object.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "portaalcontent";
const BLOB = "uren-intern-instellingen.json";
const STANDAARD = {
  herinneringActief: false, herinneringWeekdag: 5, herinneringMinuren: 40, herinneringWebhook: "", herinneringTekst: "",
  // Tweede, onafhankelijke herinnering (bijv. een strengere reminder op een latere dag). Eigen weekdag,
  // minimum en tekst; als de tweede webhook leeg is wordt de eerste webhook gebruikt.
  herinnering2Actief: false, herinnering2Weekdag: 1, herinnering2Minuren: 40, herinnering2Webhook: "", herinnering2Tekst: "",
  laatsteRun: null,
};

let cachedContainer = null;
async function haalContainer() {
  if (cachedContainer) return cachedContainer;
  const cs = process.env.STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("MISSING_CONFIG");
  const client = BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER);
  await client.createIfNotExists();
  cachedContainer = client;
  return client;
}
async function streamNaarTekst(stream) {
  const stukken = [];
  for await (const s of stream) stukken.push(Buffer.isBuffer(s) ? s : Buffer.from(s));
  return Buffer.concat(stukken).toString("utf-8");
}

async function haalInstellingen() {
  try {
    const container = await haalContainer();
    const blob = container.getBlockBlobClient(BLOB);
    if (!(await blob.exists())) return { ...STANDAARD };
    const download = await blob.download();
    const tekst = await streamNaarTekst(download.readableStreamBody);
    return { ...STANDAARD, ...(JSON.parse(tekst) || {}) };
  } catch (e) {
    if (e.message === "MISSING_CONFIG") throw e;
    return { ...STANDAARD };
  }
}

async function zetInstellingen(velden) {
  const container = await haalContainer();
  const huidig = await haalInstellingen();
  const nieuw = {
    ...huidig,
    herinneringActief: !!velden.herinneringActief,
    herinneringWeekdag: velden.herinneringWeekdag != null ? Number(velden.herinneringWeekdag) : huidig.herinneringWeekdag,
    herinneringMinuren: velden.herinneringMinuren != null ? Number(velden.herinneringMinuren) : huidig.herinneringMinuren,
    herinneringWebhook: velden.herinneringWebhook != null ? String(velden.herinneringWebhook) : huidig.herinneringWebhook,
    herinneringTekst: velden.herinneringTekst != null ? String(velden.herinneringTekst) : huidig.herinneringTekst,
    herinnering2Actief: velden.herinnering2Actief != null ? !!velden.herinnering2Actief : huidig.herinnering2Actief,
    herinnering2Weekdag: velden.herinnering2Weekdag != null ? Number(velden.herinnering2Weekdag) : huidig.herinnering2Weekdag,
    herinnering2Minuren: velden.herinnering2Minuren != null ? Number(velden.herinnering2Minuren) : huidig.herinnering2Minuren,
    herinnering2Webhook: velden.herinnering2Webhook != null ? String(velden.herinnering2Webhook) : huidig.herinnering2Webhook,
    herinnering2Tekst: velden.herinnering2Tekst != null ? String(velden.herinnering2Tekst) : huidig.herinnering2Tekst,
  };
  const blob = container.getBlockBlobClient(BLOB);
  const data = Buffer.from(JSON.stringify(nieuw), "utf-8");
  await blob.upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
  return nieuw;
}

async function zetLaatsteRun() {
  const container = await haalContainer();
  const huidig = await haalInstellingen();
  huidig.laatsteRun = new Date().toISOString();
  const blob = container.getBlockBlobClient(BLOB);
  const data = Buffer.from(JSON.stringify(huidig), "utf-8");
  await blob.upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
  return huidig;
}

module.exports = { haalInstellingen, zetInstellingen, zetLaatsteRun };
