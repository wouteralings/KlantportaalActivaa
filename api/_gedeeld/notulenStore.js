/**
 * Opslag van de INVULGEGEVENS van een opgestelde notulen, in Azure Blob Storage (container
 * portaalcontent, blob notulen-opgesteld.json). Spiegelt _gedeeld/briefLog.js en dossierReview.js.
 *
 * Waarom naast Dynamics? Het notulendossier in Dynamics houdt de harde gegevens vast (cliënt, datum,
 * status, behandelaar, bedrag/percentage, de SharePoint-link naar het stuk). Wat daar níét in past
 * zijn de NAMEN van de aandeelhouders: die kolommen zijn in Dynamics lookups naar relaties
 * (cr283_aandeelhouder1..5) terwijl in de notulen ook een aandeelhouder kan staan die geen relatie
 * is. Zonder deze opslag zou je een opgestelde notulen niet meer kunnen heropenen en bijwerken —
 * je zou het stuk elke keer opnieuw moeten invullen.
 *
 * Eén record per notulendossier (gesleuteld op dossierId), zodat opnieuw opslaan het record bijwerkt
 * in plaats van er een tweede naast te zetten.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "notulen-opgesteld.json";
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

/** Alle opgestelde notulen als object { [dossierId]: record }. */
async function haalAlles() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const obj = JSON.parse(tekst);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

async function schrijfAlles(alles) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(alles, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Eén opgestelde notulen ophalen (of null). */
async function haalVoorDossier(dossierId) {
  if (!dossierId) return null;
  try {
    const alles = await haalAlles();
    return alles[String(dossierId)] || null;
  } catch {
    return null;
  }
}

/** Alle opgestelde notulen van één cliënt, nieuwste eerst. */
async function haalVoorKlant(accountId) {
  if (!accountId) return [];
  try {
    const alles = await haalAlles();
    return Object.values(alles)
      .filter((r) => r && String(r.accountId) === String(accountId))
      .sort((a, b) => String(b.opgesteldOp).localeCompare(String(a.opgesteldOp)));
  } catch {
    return [];
  }
}

/**
 * Slaat de invulgegevens van een notulen op (nieuw of bijgewerkt). Best-effort bij de aanroeper:
 * het dossier en het document in SharePoint zijn leidend — mislukt dit, dan is de notulen nog steeds
 * opgesteld, alleen niet meer heropenbaar met dezelfde gegevens.
 */
async function bewaar(record) {
  const dossierId = String((record && record.dossierId) || "").trim();
  if (!dossierId) throw new Error("Geen dossierId meegegeven.");
  const alles = await haalAlles();
  const bestaand = alles[dossierId] || {};
  alles[dossierId] = {
    ...bestaand,
    dossierId,
    accountId: record.accountId || bestaand.accountId || null,
    klantnaam: record.klantnaam || bestaand.klantnaam || "",
    modelNaam: record.modelNaam || bestaand.modelNaam || "",
    datum: record.datum || bestaand.datum || "",
    velden: record.velden || bestaand.velden || {},
    // De dossiervelden (catalogussleutel → waarde) zoals in het opstel-scherm ingevuld — nodig om
    // een stuk te kunnen heropenen met alles er nog in, ook zelf aangemaakte velden.
    dossierVelden: record.dossierVelden || bestaand.dossierVelden || {},
    // De vrije invulvelden van dit stuk (sleutel → waarde), zodat "Bewerken" ze terughaalt.
    invulwaarden: record.invulwaarden || bestaand.invulwaarden || {},
    aandeelhouders: Array.isArray(record.aandeelhouders) ? record.aandeelhouders : (bestaand.aandeelhouders || []),
    tekst: record.tekst != null ? String(record.tekst) : (bestaand.tekst || ""),
    // Het besluitblok (punt I) van dít stuk — kop en staart komen uit Beheer en gelden voor alle
    // notulen, dus alleen dit hoeft per stuk bewaard te worden om het te kunnen heropenen.
    besluit: record.besluit != null ? String(record.besluit) : (bestaand.besluit || ""),
    pdfUrl: record.pdfUrl || bestaand.pdfUrl || "",
    bestandsnaam: record.bestandsnaam || bestaand.bestandsnaam || "",
    // Laatste verzending (mail of ter ondertekening) — voor het logboek.
    verstuurd: record.verstuurd || bestaand.verstuurd || null,
    opgesteldOp: new Date().toISOString(),
    opgesteldDoor: record.opgesteldDoor || bestaand.opgesteldDoor || "",
    aangemaaktOp: bestaand.aangemaaktOp || new Date().toISOString(),
  };
  await schrijfAlles(alles);
  return alles[dossierId];
}

/**
 * Haalt één opgestelde notulen uit het overzicht (op dossierId). Alleen de vermelding verdwijnt: het
 * stuk in SharePoint en het notulendossier in Dynamics blijven staan — dat zijn het dossier van de
 * cliënt en de administratie, en daar hoort dit overzicht niet ongevraagd in te snijden.
 */
async function verwijder(dossierId) {
  const sleutel = String(dossierId || "").trim();
  if (!sleutel) return false;
  const alles = await haalAlles();
  if (!alles[sleutel]) return false;
  delete alles[sleutel];
  await schrijfAlles(alles);
  return true;
}

module.exports = { haalAlles, haalVoorDossier, haalVoorKlant, bewaar, verwijder };
