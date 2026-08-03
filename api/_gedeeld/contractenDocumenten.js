/**
 * Documentupload bij een contract (Contractmanagement-plan, Stap 4) — een klant kan bij een eigen
 * contract (dbo.contracten_klanten, zie contractenKlanten.js) één of meer bestanden bewaren, bv.
 * de polis of de getekende overeenkomst zelf.
 *
 * BEWUST Azure Blob Storage, in een eigen container "contracten" — dus NIET het SharePoint/Graph
 * app-only-patroon van api/document-aanleveren (dat hoort bij een taak-uploadlink en schrijft naar
 * de SharePoint-map van de klant). Contracten-documenten zijn geen taak-aanlevering maar losse
 * bijlagen bij een eigen record in een module die bewust "BEWUST ZONDER afhankelijkheid van de
 * Facturatiemodule" is opgezet (zie contractenToegang.js) — dezelfde STORAGE_CONNECTION_STRING/
 * Blob-opslag als de rest van het portaal (media.js, wijzigrechten.js, etc.), maar een eigen
 * container zodat contract-bijlagen niet tussen de kleine JSON-configbestanden in "portaalcontent"
 * belanden.
 *
 * Blob-pad: contracten/<accountId>/<contractId>/<documentId> — geen los indexbestand nodig, de
 * lijst per contract wordt opgehaald door de container te doorzoeken op het prefix
 * "<accountId>/<contractId>/" (listBlobsFlat). De oorspronkelijke bestandsnaam en wie het uploadde
 * staan als blob-metadata (URI-encoded, want Azure-metadata moet ASCII zijn); wanneer het bestand
 * is geüpload staat al in de blob-eigenschappen (lastModified) — geen aparte tijdstempel nodig.
 *
 * Verwijderen van een bijlage MAG hier wel (in tegenstelling tot het contract-record zelf, dat
 * besluit §5.7 bewust niet toestaat) — dat besluit ging over audit van het CONTRACT, niet over een
 * per ongeluk verkeerd geüploade bijlage. Een klant moet een misupload kunnen corrigeren.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "contracten";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per bestand — zelfde limiet als api/document-aanleveren
let cachedContainerClient = null;

async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAAM);
  // Privé container (net als "portaalmedia") — bestanden worden via deze eigen route geserveerd,
  // niet via een publieke blob-URL.
  await containerClient.createIfNotExists();
  cachedContainerClient = containerClient;
  return containerClient;
}

async function streamNaarBuffer(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  return Buffer.concat(stukken);
}

function veiligPad(waarde) {
  // accountId/contractId zijn Dataverse/SQL GUID's, documentId is zelf crypto.randomUUID() —
  // allemaal al veilig als blobpad-segment, maar defensief opschonen mag nooit kwaad.
  return String(waarde || "").replace(/[^a-zA-Z0-9-]/g, "");
}

/**
 * Slaat een bestand op uit een data-URL (bijv. "data:application/pdf;base64,...."). Geeft de
 * documentmetadata terug (zonder de inhoud zelf).
 */
async function uploadDocument(accountId, contractId, dataUrl, bestandsnaam, email) {
  const acc = veiligPad(accountId);
  const con = veiligPad(contractId);
  if (!acc || !con) throw new Error("VALIDATIE: accountId en contractId zijn verplicht.");

  const match = /^data:([^;]*);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("VALIDATIE: verwacht een geldig bestand (data-URL).");
  const contentType = match[1] || "application/octet-stream";
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) throw new Error("VALIDATIE: het bestand is leeg.");
  if (buffer.length > MAX_BYTES) throw new Error("VALIDATIE: het bestand is te groot (max 25 MB).");

  const veiligeNaam = String(bestandsnaam || "bestand").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 200) || "bestand";
  const documentId = crypto.randomUUID();

  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(`${acc}/${con}/${documentId}`);
  await blobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
    metadata: {
      bestandsnaam: encodeURIComponent(veiligeNaam),
      geuploadDoor: encodeURIComponent(email || ""),
    },
  });

  return { id: documentId, bestandsnaam: veiligeNaam, contentType, grootte: buffer.length, geuploadOp: new Date().toISOString(), geuploadDoor: email || "" };
}

/** Lijst van documenten bij een contract (zonder de inhoud), nieuwste eerst. */
async function haalDocumenten(accountId, contractId) {
  const acc = veiligPad(accountId);
  const con = veiligPad(contractId);
  if (!acc || !con) return [];
  const containerClient = await haalContainerClient();
  const prefix = `${acc}/${con}/`;
  const resultaat = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix, includeMetadata: true })) {
    const metadata = blob.metadata || {};
    resultaat.push({
      id: blob.name.slice(prefix.length),
      bestandsnaam: metadata.bestandsnaam ? decodeURIComponent(metadata.bestandsnaam) : blob.name.slice(prefix.length),
      contentType: (blob.properties && blob.properties.contentType) || "application/octet-stream",
      grootte: (blob.properties && blob.properties.contentLength) || 0,
      geuploadOp: blob.properties && blob.properties.lastModified ? blob.properties.lastModified.toISOString() : null,
      geuploadDoor: metadata.geuploadDoor ? decodeURIComponent(metadata.geuploadDoor) : "",
    });
  }
  resultaat.sort((a, b) => String(b.geuploadOp || "").localeCompare(String(a.geuploadOp || "")));
  return resultaat;
}

/** Eén document + inhoud, voor downloaden. Null als het niet bestaat. */
async function haalDocument(accountId, contractId, documentId) {
  const acc = veiligPad(accountId);
  const con = veiligPad(contractId);
  const doc = veiligPad(documentId);
  if (!acc || !con || !doc) return null;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(`${acc}/${con}/${doc}`);
  if (!(await blobClient.exists())) return null;
  const download = await blobClient.download();
  const buffer = await streamNaarBuffer(download.readableStreamBody);
  const metadata = download.metadata || {};
  return {
    buffer,
    contentType: download.contentType || "application/octet-stream",
    bestandsnaam: metadata.bestandsnaam ? decodeURIComponent(metadata.bestandsnaam) : doc,
  };
}

/** Verwijdert een document; geeft true terug als hij bestond (en dus verwijderd is). */
async function verwijderDocument(accountId, contractId, documentId) {
  const acc = veiligPad(accountId);
  const con = veiligPad(contractId);
  const doc = veiligPad(documentId);
  if (!acc || !con || !doc) return false;
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(`${acc}/${con}/${doc}`);
  const res = await blobClient.deleteIfExists();
  return !!res.succeeded;
}

module.exports = { uploadDocument, haalDocumenten, haalDocument, verwijderDocument, MAX_BYTES };
