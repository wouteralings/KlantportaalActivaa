/**
 * Onderhoudbare urencodes voor de interne urenregistratie. Elke code hoort bij één categorie
 * (abonnement | uxt | indirect | kantoor); de categorie bepaalt of de code declarabel is en hoe de
 * facturatie/goedkeuring werkt. Opslag in Azure Blob (container portaalcontent, blob uren-codes.json)
 * — dit is beheerbare referentiedata, net als de herinneringsinstellingen.
 *
 * Eén code: { id, naam, categorie, actief, volgorde }.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER = "portaalcontent";
const BLOB = "uren-codes.json";
const CATEGORIEEN = ["abonnement", "uxt", "indirect", "kantoor"];

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

async function haalCodes() {
  try {
    const c = await haalContainer();
    const blob = c.getBlockBlobClient(BLOB);
    if (!(await blob.exists())) return [];
    const lijst = JSON.parse(await streamNaarTekst((await blob.download()).readableStreamBody)) || [];
    return lijst.sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0) || String(a.naam).localeCompare(String(b.naam)));
  } catch (e) {
    if (e.message === "MISSING_CONFIG") throw e;
    return [];
  }
}

async function bewaar(lijst) {
  const c = await haalContainer();
  const data = Buffer.from(JSON.stringify(lijst), "utf-8");
  await c.getBlockBlobClient(BLOB).upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
}

/** Voegt een code toe of werkt hem bij (op id). */
async function zetCode(code) {
  const categorie = CATEGORIEEN.includes(String(code.categorie)) ? code.categorie : "kantoor";
  const lijst = await haalCodes();
  if (code.id) {
    const i = lijst.findIndex((x) => x.id === code.id);
    if (i >= 0) {
      lijst[i] = { ...lijst[i], naam: String(code.naam || "").trim(), categorie, actief: code.actief !== false, volgorde: code.volgorde != null ? Number(code.volgorde) : lijst[i].volgorde };
      await bewaar(lijst);
      return lijst[i];
    }
  }
  const nieuw = { id: crypto.randomUUID(), naam: String(code.naam || "").trim(), categorie, actief: code.actief !== false, volgorde: code.volgorde != null ? Number(code.volgorde) : lijst.length };
  lijst.push(nieuw);
  await bewaar(lijst);
  return nieuw;
}

async function verwijderCode(id) {
  const lijst = await haalCodes();
  const nieuw = lijst.filter((x) => x.id !== id);
  await bewaar(nieuw);
  return nieuw.length !== lijst.length;
}

module.exports = { haalCodes, zetCode, verwijderCode, CATEGORIEEN };
