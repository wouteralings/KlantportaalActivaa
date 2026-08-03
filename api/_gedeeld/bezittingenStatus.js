/**
 * Of een klant heeft aangegeven dat een bezitting niet meer in zijn bezit is (verkocht, kapot,
 * ingeruild, weggegooid, …) — op verzoek van Wouter: "Kan je achter bezittingen de optie geven
 * om te vertellen als deze niet meer in bezit is?"
 *
 * De bezittingen zelf komen (nog) niet uit een echte, bewerkbare database — ze worden deterministisch
 * gegenereerd door genereerDemoBezittingen() (zie bezittingenData.js) in afwachting van de Exact
 * Online-koppeling. Om toch een aan/uit-vlag per bezitting te kunnen opslaan, staat die vlag apart,
 * gekoppeld aan het (stabiele, deterministische) bezitting-id — zelfde blob-opslagpatroon als
 * bezittingenInstellingen.js, alleen deze keer genest per accountId én per bezittingId:
 *
 *   { "<accountId>": { "<bezittingId>": { nietMeerInBezit, datum, opmerking, gewijzigdOp, gewijzigdDoor } } }
 *
 * Zodra de echte Exact-koppeling er is, kan dit gewoon blijven bestaan als aanvullende, door de
 * klant zelf ingevoerde annotatie naast de "harde" Exact-data.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "bezittingen-status.json";
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

/** Geeft het volledige statusdocument terug: { "<accountId>": { "<bezittingId>": {...} } }. */
async function haalAlleStatussen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** De statussen van alle bezittingen van één klantaccount: { "<bezittingId>": {...} }. */
async function haalStatussenVoorAccount(accountId) {
  if (!accountId) return {};
  const alles = await haalAlleStatussen();
  return alles[accountId] || {};
}

/** Zet (of wist) de "niet meer in bezit"-vlag voor één bezitting van één klantaccount. */
async function zetStatus(accountId, bezittingId, { nietMeerInBezit, datum, opmerking }, gewijzigdDoor) {
  if (!accountId) throw new Error("VALIDATIE: accountId is verplicht.");
  if (!bezittingId) throw new Error("VALIDATIE: bezittingId is verplicht.");
  const alles = await haalAlleStatussen();
  const voorAccount = { ...(alles[accountId] || {}) };
  if (nietMeerInBezit) {
    voorAccount[bezittingId] = {
      nietMeerInBezit: true,
      datum: datum || new Date().toISOString().slice(0, 10),
      opmerking: String(opmerking || "").trim().slice(0, 500),
      gewijzigdOp: new Date().toISOString(),
      gewijzigdDoor: gewijzigdDoor || "",
    };
  } else {
    // Ongedaan maken — de vlag verwijderen i.p.v. op false te zetten, zodat het statusdocument
    // niet blijft aangroeien met lege/inactieve entries voor bezittingen die weer "gewoon" zijn.
    delete voorAccount[bezittingId];
  }
  alles[accountId] = voorAccount;
  await bewaarAlleStatussen(alles);
  return voorAccount[bezittingId] || null;
}

async function bewaarAlleStatussen(alles) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(alles, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

module.exports = { haalStatussenVoorAccount, zetStatus };
