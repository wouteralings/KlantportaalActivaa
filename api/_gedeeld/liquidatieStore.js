/**
 * Opslag van de INVULGEGEVENS van een opgesteld liquidatiestuk (ontbindingsrapport), in Azure Blob
 * Storage (container portaalcontent, blob liquidatie-opgesteld.json). Spiegelt _gedeeld/notulenStore.js
 * en _gedeeld/dividendStore.js.
 *
 * Waarom naast Dynamics? Het liquidatiedossier houdt de harde gegevens vast (cliënt, datums, status,
 * KvK, de cijfers van balans en resultatenrekening, de SharePoint-link naar het stuk). Wat daar níét
 * in past zijn de NAMEN van de aandeelhouders en van de bewaarder: dat zijn in Dynamics lookups naar
 * relaties, terwijl in het stuk ook iemand kan staan die geen relatie is. Zonder deze opslag zou je
 * een opgesteld rapport niet meer kunnen heropenen en bijwerken.
 *
 * Eén record per liquidatiedossier (gesleuteld op dossierId), zodat opnieuw opslaan het record
 * bijwerkt in plaats van er een tweede naast te zetten.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "liquidatie-opgesteld.json";
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

/** Alle opgestelde liquidatiestukken als object { [dossierId]: record }. */
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

/** Eén opgesteld liquidatiestuk ophalen (of null). */
async function haalVoorDossier(dossierId) {
  if (!dossierId) return null;
  try {
    const alles = await haalAlles();
    return alles[String(dossierId)] || null;
  } catch {
    return null;
  }
}

/** Alle opgestelde liquidatiestukken van één cliënt, nieuwste eerst. */
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
 * Slaat de invulgegevens van een liquidatiestuk op (nieuw of bijgewerkt). Best-effort bij de
 * aanroeper: het dossier en het document in SharePoint zijn leidend — mislukt dit, dan is het stuk
 * nog steeds opgesteld, alleen niet meer heropenbaar met dezelfde gegevens.
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
    // De datum van de notulen (de vergadering) naast `datum` = de datum van ontbinding; in het
    // rapport staan die allebei en ze hoeven niet gelijk te zijn.
    datumnotulen: record.datumnotulen != null ? String(record.datumnotulen) : (bestaand.datumnotulen || ""),
    kvknummer: record.kvknummer != null ? String(record.kvknummer) : (bestaand.kvknummer || ""),
    // Bewaarder van de administratie (besluit III) — naam als tekst, want het hoeft geen relatie te zijn.
    bewaarder: record.bewaarder != null ? String(record.bewaarder) : (bestaand.bewaarder || ""),
    // Balans + resultatenrekening zoals ingetikt (sleutel → bedrag). De totalen worden altijd
    // herrekend, nooit bewaard als losse waarheid — zie _gedeeld/liquidatieCijfers.js.
    cijfers: record.cijfers && typeof record.cijfers === "object" ? record.cijfers : (bestaand.cijfers || {}),
    // Antwoorden op KvK-formulier 17a (vraag-id → waarde), zodat het formulier bij heropenen nog
    // ingevuld is en je 'm opnieuw kunt afdrukken zonder alles over te tikken.
    formulier: record.formulier && typeof record.formulier === "object" ? record.formulier : (bestaand.formulier || {}),
    tekst: record.tekst != null ? String(record.tekst) : (bestaand.tekst || ""),
    // Het tussenstuk (de besluiten) van dít stuk — kop en staart komen uit Beheer en gelden voor
    // alle liquidatiestukken, dus alleen dit hoeft per stuk bewaard te worden.
    besluit: record.besluit != null ? String(record.besluit) : (bestaand.besluit || ""),
    pdfUrl: record.pdfUrl || bestaand.pdfUrl || "",
    bestandsnaam: record.bestandsnaam || bestaand.bestandsnaam || "",
    // Het ontbindingsrapport is een tweede, los document; ook daarvan houden we de link bij.
    rapportUrl: record.rapportUrl || bestaand.rapportUrl || "",
    rapportBestandsnaam: record.rapportBestandsnaam || bestaand.rapportBestandsnaam || "",
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
 * Haalt één opgesteld liquidatiestuk uit het overzicht (op dossierId). Het liquidatiedossier in
 * Dynamics blijft staan — dat is de administratie. Het bestand in SharePoint wordt wél opgeruimd,
 * maar door de aanroeper (api/medewerker-liquidatie-opslaan), niet hier.
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
