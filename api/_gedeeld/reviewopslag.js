/**
 * Opslag van reviews en review-uitnodigingen in Azure Blob Storage.
 * Gebruikt dezelfde container (portaalcontent) als de overige content.
 *
 * - reviews.json          : lijst met alle binnengekomen reviews
 * - review-uitnodigingen.json : { [accountId]: laatsteUitnodigingISO }
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const REVIEWS_BLOB = "reviews.json";
const UITNODIGINGEN_BLOB = "review-uitnodigingen.json";
const GEZIEN_BLOB = "review-gezien.json";
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

async function leesJson(blobNaam, standaard) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(blobNaam);
  if (!(await blobClient.exists())) return standaard;
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    return JSON.parse(tekst);
  } catch {
    return standaard;
  }
}

async function schrijfJson(blobNaam, data) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(blobNaam);
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Legt één review vast. Faalt stil-niet: gooit door zodat de aanroeper kan loggen. */
async function voegReviewToe({ accountId, klantnummer, klantnaam, sterren, opmerking, reviewerEmail }) {
  const reviews = await leesJson(REVIEWS_BLOB, []);
  const nieuw = {
    id: crypto.randomUUID(),
    accountId: accountId || null,
    klantnummer: klantnummer ?? null,
    klantnaam: klantnaam || "",
    sterren,
    opmerking: opmerking || "",
    reviewerEmail: reviewerEmail || "",
    datum: new Date().toISOString(),
  };
  reviews.push(nieuw);
  await schrijfJson(REVIEWS_BLOB, reviews);
  return nieuw;
}

async function haalReviews() {
  return leesJson(REVIEWS_BLOB, []);
}

async function haalUitnodigingen() {
  return leesJson(UITNODIGINGEN_BLOB, {});
}

/** Zet de uitnodigingsdatum (nu) voor elk meegegeven accountId. */
async function registreerUitnodigingen(accountIds) {
  const map = await leesJson(UITNODIGINGEN_BLOB, {});
  const nu = new Date().toISOString();
  for (const id of accountIds) {
    if (id) map[id] = nu;
  }
  await schrijfJson(UITNODIGINGEN_BLOB, map);
  return map;
}

/** Geeft het moment terug waarop een beheerder de reviews voor het laatst heeft bekeken (of null). */
async function haalReviewGezien() {
  const data = await leesJson(GEZIEN_BLOB, {});
  return data.laatstGezien || null;
}

/** Markeert de reviews als "gezien" tot en met het opgegeven moment (standaard nu). */
async function zetReviewGezien(iso) {
  const moment = iso || new Date().toISOString();
  await schrijfJson(GEZIEN_BLOB, { laatstGezien: moment });
  return moment;
}

module.exports = {
  voegReviewToe,
  haalReviews,
  haalUitnodigingen,
  registreerUitnodigingen,
  haalReviewGezien,
  zetReviewGezien,
};
