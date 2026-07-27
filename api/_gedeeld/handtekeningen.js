/**
 * Opslag van door de klant gezette handtekeningen op taken (DocuSign-achtig) in Azure Blob
 * Storage (container portaalcontent, blob taak-handtekeningen.json). Dit is de "log in beheer":
 * wie heeft wat ondertekend, wanneer, met welke bewijs-PDF (SharePoint-URL + evt. blob-kopie).
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "taak-handtekeningen.json";
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

async function haalAlleHandtekeningen() {
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

async function schrijf(lijst) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(lijst, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Bewaart optioneel de bewijs-PDF als blob (fallback/altijd-beschikbaar) en geeft de blob-naam terug. */
async function bewaarPdfBlob(bestandsnaam, pdfBuffer) {
  const containerClient = await haalContainerClient();
  const veiligeNaam = "handtekeningen/" + Date.now() + "-" + bestandsnaam.replace(/[^\w.\- ]+/g, "_");
  const blobClient = containerClient.getBlockBlobClient(veiligeNaam);
  await blobClient.upload(pdfBuffer, pdfBuffer.length, {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: "application/pdf" },
  });
  return veiligeNaam;
}

/** Haalt een eerder bewaarde bewijs-PDF (blob) op als Buffer, of null als hij niet bestaat. */
async function haalPdfBlob(blobNaam) {
  if (!blobNaam) return null;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(blobNaam);
  if (!(await blobClient.exists())) return null;
  return blobClient.downloadToBuffer();
}

async function voegHandtekeningToe(record) {
  const lijst = await haalAlleHandtekeningen();
  const nieuw = { id: crypto.randomUUID(), ondertekendOp: new Date().toISOString(), ...record };
  lijst.push(nieuw);
  await schrijf(lijst);
  return nieuw;
}

async function haalHandtekeningenVoorEmail(email) {
  const alle = await haalAlleHandtekeningen();
  const laag = (email || "").toLowerCase();
  return alle.filter((h) => (h.aanvragerEmail || "").toLowerCase() === laag);
}

module.exports = {
  haalAlleHandtekeningen,
  haalHandtekeningenVoorEmail,
  voegHandtekeningToe,
  bewaarPdfBlob,
  haalPdfBlob,
};
