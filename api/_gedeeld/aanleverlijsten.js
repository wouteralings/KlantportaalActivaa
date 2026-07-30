/**
 * Aanleverlijsten (herbruikbare "vaste lijsten" van uit te vragen documenten) — centraal beheerd in
 * het beheerdersportaal. Een lijst is een sjabloon dat je later als aanlever-verzoek naar een klant
 * uitzet; per regel vraag je één document uit, met een vaste bestandsnaam-structuur.
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob aanleverlijsten.json.
 * Structuur: { lijsten: [ { id, naam, omschrijving,
 *   regels: [ { id, naam, bestandsnaam, toelichting, verplicht } ] } ] }
 *
 *   - naam         : waar de regel om vraagt (bv. "Aangifte IB 2025")
 *   - bestandsnaam : vaste naam die het aangeleverde bestand krijgt (optioneel; leeg = de naam)
 *   - toelichting  : extra instructie voor de klant (optioneel)
 *   - verplicht    : moet dit document aangeleverd worden (default true)
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "aanleverlijsten.json";
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

function tekst(v, max = 400) {
  return String(v == null ? "" : v).slice(0, max);
}

/** Normaliseert het hele lijsten-document: dwingt vorm/typen af en vult ontbrekende id's aan. */
function normaliseer(lijsten) {
  if (!Array.isArray(lijsten)) return [];
  return lijsten.slice(0, 200).map((l) => ({
    id: tekst(l && l.id, 60) || crypto.randomUUID(),
    naam: tekst(l && l.naam, 200),
    omschrijving: tekst(l && l.omschrijving, 600),
    // Mappad (opslaglocatie) onder de klant-basismap in SharePoint; plaatshouders {jaar} en {lijst}.
    // Leeg = de vaste 'Aanleveren'-map van de klant.
    pad: tekst(l && l.pad, 300),
    regels: Array.isArray(l && l.regels)
      ? l.regels.slice(0, 200).map((r) => ({
          id: tekst(r && r.id, 60) || crypto.randomUUID(),
          naam: tekst(r && r.naam, 200),
          bestandsnaam: tekst(r && r.bestandsnaam, 200),
          toelichting: tekst(r && r.toelichting, 600),
          verplicht: r && r.verplicht === false ? false : true,
        }))
      : [],
  }));
}

async function haalLijsten() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return normaliseer(Array.isArray(data) ? data : data.lijsten);
  } catch {
    return [];
  }
}

async function zetLijsten(lijsten) {
  const schoon = normaliseer(lijsten);
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ lijsten: schoon }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

module.exports = { haalLijsten, zetLijsten, normaliseer };
