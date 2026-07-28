/**
 * Opslag van wijzigingsverzoeken (klant stelt wijziging voor → beheerder keurt goed) in
 * Azure Blob Storage, in dezelfde container (portaalcontent), blob wijzigingsverzoeken.json.
 *
 * Statussen: "open" (wacht op goedkeuring) | "goedgekeurd" | "afgewezen".
 *
 * `type` onderscheidt wat voor verzoek het is en dus hoe een goedkeuring verwerkt moet
 * worden (zie de dispatch in api/beheer-wijzigingen/index.js):
 *   - "naw" (of ontbrekend, voor oudere al opgeslagen verzoeken) — contactpersoon/bedrijfsadres,
 *     wordt bij goedkeuring in Dynamics weggeschreven.
 *   - "bedrijfsgegevens_facturatie" — de eigen afzendergegevens/logo-gegevens van de
 *     facturatiemodule (dbo.bedrijfsgegevens_klanten), wordt bij goedkeuring in die SQL-tabel
 *     weggeschreven (geen Dynamics bij betrokken).
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "wijzigingsverzoeken.json";
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

async function haalAlleVerzoeken() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    return JSON.parse(tekst);
  } catch {
    return [];
  }
}

async function schrijfVerzoeken(verzoeken) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(verzoeken, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

async function voegVerzoekToe({ accountId, contactId, klantnummer, klantnaam, aanvragerEmail, huidig, voorstel, type }) {
  const verzoeken = await haalAlleVerzoeken();
  const nieuw = {
    id: crypto.randomUUID(),
    type: type || "naw",
    accountId,
    contactId: contactId || null,
    klantnummer: klantnummer ?? null,
    klantnaam: klantnaam || "",
    aanvragerEmail: aanvragerEmail || "",
    huidig: huidig || {},
    voorstel: voorstel || {},
    status: "open",
    aangevraagdOp: new Date().toISOString(),
    verwerktOp: null,
    verwerktDoor: null,
    verwerkingsfout: null,
  };
  verzoeken.push(nieuw);
  await schrijfVerzoeken(verzoeken);
  return nieuw;
}

async function haalVerzoekenVoorEmail(email) {
  const alle = await haalAlleVerzoeken();
  const laag = (email || "").toLowerCase();
  return alle.filter((v) => (v.aanvragerEmail || "").toLowerCase() === laag);
}

async function werkVerzoekBij(id, velden) {
  const verzoeken = await haalAlleVerzoeken();
  const v = verzoeken.find((x) => x.id === id);
  if (!v) return null;
  Object.assign(v, velden);
  await schrijfVerzoeken(verzoeken);
  return v;
}

module.exports = { haalAlleVerzoeken, voegVerzoekToe, haalVerzoekenVoorEmail, werkVerzoekBij };
