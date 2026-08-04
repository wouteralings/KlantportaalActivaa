/**
 * Persoonlijke opgeslagen weergaven per medewerker, in Azure Blob Storage (container
 * portaalcontent, blob klantoverzicht-weergaven.json). Oorspronkelijk alleen voor het
 * klantoverzicht; sinds de sorteerbare/filterbare kolommen ook in de dossieroverzichten
 * (Inkomstenbelasting/Vennootschapsbelasting) zitten, per "scherm" opgeslagen zodat een
 * weergave van het ene scherm niet per ongeluk op een ander scherm wordt toegepast (andere
 * schermen hebben andere kolomsleutels).
 *
 * Structuur: { "<email>": { "<scherm>": { views: [{ naam, config }] }, ... } }
 * config = { kolommen: [keys], filters: {..}, sortKey, sortDir, toonAantal }
 *
 * Backwards compatible met de oude, schermloze vorm van vóór deze uitbreiding
 * ({ "<email>": { views: [...] } }, altijd voor het klantoverzicht) — scherm "klanten" valt
 * terug op dat oude, vlakke veld als er nog geen nieuw-formaat data voor is opgeslagen, en
 * blijft er ook bij het opslaan aan meeschrijven zodat een eventuele oudere build niet ineens
 * niets meer ziet.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "klantoverzicht-weergaven.json";
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

async function haalAlles() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function schrijfAlles(data) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

function schermSleutel(scherm) {
  const s = String(scherm || "klanten").trim();
  return s.length ? s.slice(0, 60) : "klanten";
}

async function haalWeergavenVoor(email, scherm) {
  const laag = String(email || "").toLowerCase();
  if (!laag) return [];
  const s = schermSleutel(scherm);
  const alle = await haalAlles();
  const eigen = alle[laag];
  if (!eigen) return [];
  if (eigen[s] && Array.isArray(eigen[s].views)) return eigen[s].views;
  // Oude, schermloze vorm (vóór meerdere schermen) hoorde bij het klantoverzicht.
  if (s === "klanten" && Array.isArray(eigen.views)) return eigen.views;
  return [];
}

async function zetWeergavenVoor(email, scherm, views) {
  const laag = String(email || "").toLowerCase();
  if (!laag) throw new Error("GEEN_EMAIL");
  const s = schermSleutel(scherm);
  const schoon = (Array.isArray(views) ? views : [])
    .filter((v) => v && v.naam)
    .slice(0, 50)
    .map((v) => ({ naam: String(v.naam).slice(0, 80), config: v.config || {} }));
  const alle = await haalAlles();
  const eigen = { ...(alle[laag] || {}) };
  eigen[s] = { views: schoon };
  if (s === "klanten") eigen.views = schoon; // compat met de oude, schermloze vorm
  alle[laag] = eigen;
  await schrijfAlles(alle);
  return schoon;
}

// Oude namen (schermloos, altijd klantoverzicht) blijven bestaan voor bestaande call-sites.
async function haalWeergavenVoorEmail(email) {
  return haalWeergavenVoor(email, "klanten");
}

async function zetWeergavenVoorEmail(email, views) {
  return zetWeergavenVoor(email, "klanten", views);
}

module.exports = { haalWeergavenVoor, zetWeergavenVoor, haalWeergavenVoorEmail, zetWeergavenVoorEmail };
