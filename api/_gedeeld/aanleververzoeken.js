/**
 * Aanlever-verzoeken: een aanleverlijst (sjabloon) die is uitgezet naar één cliënt/contactpersoon.
 * De klant levert per regel een bestand aan; dat landt app-only in de 'Aanleveren'-map van de cliënt.
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob aanleververzoeken.json.
 * Eén verzoek:
 *   { id, accountId, klantnaam, klantnummer, contactId, contactNaam,
 *     lijstId, lijstNaam, notitie, status ("open"|"afgerond"),
 *     aangemaaktOp, aangemaaktDoor,
 *     regels: [ { id, naam, bestandsnaam, toelichting, verplicht,
 *                 status ("open"|"aangeleverd"), aangeleverdOp, aangeleverdDoor,
 *                 bestand: { naam, url, driveId, itemId } | null } ] }
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "aanleververzoeken.json";
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

async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return Array.isArray(data) ? data : Array.isArray(data.verzoeken) ? data.verzoeken : [];
  } catch {
    return [];
  }
}

async function schrijfAlle(verzoeken) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(verzoeken, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Maakt een nieuw verzoek uit een set regels (bv. gekopieerd uit een aanleverlijst). */
function maakVerzoek({ accountId, klantnaam, klantnummer, contactId, contactNaam, lijstId, lijstNaam, onderwerpId, onderwerp, jaar, map, notitie, regels, aangemaaktDoor }) {
  return {
    id: crypto.randomUUID(),
    accountId: accountId || "",
    klantnaam: klantnaam || "",
    klantnummer: klantnummer || "",
    contactId: contactId || "",
    contactNaam: contactNaam || "",
    lijstId: lijstId || "",
    lijstNaam: lijstNaam || "",
    onderwerpId: onderwerpId || "",
    onderwerp: onderwerp || "",
    jaar: jaar != null ? String(jaar) : "",
    map: Array.isArray(map) ? map.filter(Boolean).map((s) => String(s).slice(0, 100)).slice(0, 8) : [],
    notitie: notitie || "",
    status: "open",
    aangemaaktOp: new Date().toISOString(),
    aangemaaktDoor: aangemaaktDoor || "",
    regels: (Array.isArray(regels) ? regels : []).map((r) => ({
      id: crypto.randomUUID(),
      naam: String(r && r.naam ? r.naam : "").slice(0, 200),
      bestandsnaam: String(r && r.bestandsnaam ? r.bestandsnaam : "").slice(0, 200),
      toelichting: String(r && r.toelichting ? r.toelichting : "").slice(0, 600),
      verplicht: r && r.verplicht === false ? false : true,
      status: "open",
      opmerking: "",
      aangeleverdOp: null,
      aangeleverdDoor: null,
      bestand: null,
    })),
  };
}

async function voegToe(verzoek) {
  const alle = await haalAlle();
  alle.push(verzoek);
  await schrijfAlle(alle);
  return verzoek;
}

/** Past één verzoek aan via een mutator-functie (krijgt het verzoek, muteert in place). */
async function werkBij(id, mutator) {
  const alle = await haalAlle();
  const v = alle.find((x) => x.id === id);
  if (!v) return null;
  mutator(v);
  await schrijfAlle(alle);
  return v;
}

async function verwijder(id) {
  const alle = await haalAlle();
  const over = alle.filter((x) => x.id !== id);
  await schrijfAlle(over);
  return over.length !== alle.length;
}

/** Alle verzoeken voor een set accountId's (voor de klantweergave). */
async function haalVoorAccounts(accountIds) {
  const set = new Set(accountIds || []);
  return (await haalAlle()).filter((v) => set.has(v.accountId));
}

/** Herberekent de verzoekstatus: 'afgerond' zodra alle verplichte regels zijn aangeleverd. */
function herberekenStatus(verzoek) {
  const verplicht = verzoek.regels.filter((r) => r.verplicht !== false);
  const relevant = verplicht.length ? verplicht : verzoek.regels;
  const klaar = relevant.length > 0 && relevant.every((r) => r.status === "aangeleverd");
  verzoek.status = klaar ? "afgerond" : "open";
  return verzoek.status;
}

module.exports = { haalAlle, maakVerzoek, voegToe, werkBij, verwijder, haalVoorAccounts, herberekenStatus };
