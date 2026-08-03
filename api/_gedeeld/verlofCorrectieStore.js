/**
 * Handmatige verlofsaldo-correcties per medewerker (Wouter, 03-08-2026: "de beheerder per
 * medewerker verlofsaldo wil kunnen aanpassen middels een correctie. Hier moet verplicht een
 * toelichting geschreven worden en we kunnen zien wie dat heeft ingevoerd (log)").
 *
 * Append-only logboek: elke correctie is een eigen, blijvende regel — nooit overschreven of
 * verwijderd, zodat er altijd een volledig, betrouwbaar audit-trail is (wie, wanneer, hoeveel uur,
 * waarom). Het saldo (zie verlofDataverse.berekenSaldo) telt gewoon de som van alle correcties op
 * bij de pro-rata basis. Opslag in Azure Blob (container portaalcontent, blob
 * verlof-correcties.json), zelfde patroon als vasteUrenStore.js: { "<email>": [ {id, datum, door,
 * uren, toelichting} ] }.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER = "portaalcontent";
const BLOB = "verlof-correcties.json";

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

async function haalAlle() {
  try {
    const c = await haalContainer();
    const blob = c.getBlockBlobClient(BLOB);
    if (!(await blob.exists())) return {};
    return JSON.parse(await streamNaarTekst((await blob.download()).readableStreamBody)) || {};
  } catch (e) {
    if (e.message === "MISSING_CONFIG") throw e;
    return {};
  }
}

async function bewaar(alle) {
  const c = await haalContainer();
  const data = Buffer.from(JSON.stringify(alle, null, 2), "utf-8");
  await c.getBlockBlobClient(BLOB).upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
}

/** Alle correcties van één medewerker, nieuwste eerst. */
async function haalCorrecties(email) {
  const alle = await haalAlle();
  const lijst = alle[String(email || "").toLowerCase()] || [];
  return lijst.slice().sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

/** Correcties van ALLE medewerkers ineens (voor het beheer-overzicht), gegroepeerd op e-mail. */
async function haalAlleCorrecties() {
  return haalAlle();
}

/**
 * Voegt een correctie toe — verplicht een toelichting en een niet-nul aantal uren. Bestaande
 * regels blijven ALTIJD ongewijzigd staan (append-only log); er is bewust geen functie om een
 * correctie te bewerken of te verwijderen.
 */
async function voegCorrectieToe(email, { uren, toelichting }, door) {
  const sleutel = String(email || "").toLowerCase();
  if (!sleutel) throw new Error("VALIDATIE: e-mailadres is verplicht.");
  const aantal = Number(String(uren).replace(",", "."));
  if (!aantal || isNaN(aantal)) throw new Error("VALIDATIE: geef een aantal uren ongelijk aan 0 (positief = erbij, negatief = eraf).");
  const tekst = String(toelichting || "").trim();
  if (!tekst) throw new Error("VALIDATIE: een toelichting is verplicht bij een correctie.");

  const alle = await haalAlle();
  const regel = {
    id: crypto.randomUUID(),
    datum: new Date().toISOString(),
    door: String(door || "").trim() || "onbekend",
    uren: Math.round(aantal * 100) / 100,
    toelichting: tekst.slice(0, 1000),
  };
  alle[sleutel] = [...(alle[sleutel] || []), regel];
  await bewaar(alle);
  return regel;
}

module.exports = { haalCorrecties, haalAlleCorrecties, voegCorrectieToe };
