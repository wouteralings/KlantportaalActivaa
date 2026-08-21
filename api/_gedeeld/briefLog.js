/**
 * Logboek van verstuurde/gearchiveerde brieven, in Azure Blob Storage (container portaalcontent,
 * blob brieven-log.json). Spiegelt _gedeeld/taakakkoorden.js.
 *
 * Elke keer dat een brief via /api/brieven wordt gemaild, in het dossier gezet of naar backoffice
 * gestuurd, komt hier een record bij. Ingevulde PDF-formulieren (/api/medewerker-formulier) landen
 * in hetzelfde logboek, herkenbaar aan soort: "formulier". Zo kan het medewerkersportaal per klant (en centraal,
 * filterbaar) terugzien welke brieven zijn verstuurd, met een link naar de PDF in SharePoint.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "brieven-log.json";
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

async function haalAlleBrieven() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const arr = JSON.parse(tekst);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function schrijfBrieven(brieven) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(brieven, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/**
 * Voegt een verstuurde brief toe aan het logboek. Best-effort — gooit door zodat de aanroeper kan
 * loggen, maar mag het versturen van de brief zelf niet blokkeren (aanroeper vangt af).
 */
async function voegBriefToe(record) {
  const brieven = await haalAlleBrieven();
  const nieuw = {
    id: crypto.randomUUID(),
    verzondenOp: new Date().toISOString(),
    kenmerk: record.kenmerk || "",
    // "brief" of "formulier" — een ingevuld PDF-formulier komt in hetzelfde logboek terecht, want
    // het is hetzelfde soort werk: iets opmaken voor een cliënt en het in het dossier zetten.
    soort: record.soort === "formulier" ? "formulier" : "brief",
    actie: record.actie || "",
    accountId: record.accountId || null,
    klantnummer: record.klantnummer ?? null,
    klantnaam: record.klantnaam || "",
    sjabloonnaam: record.sjabloonnaam || "",
    betreft: record.betreft || "",
    geadType: record.geadType || "",
    ontvangerNaam: record.ontvangerNaam || "",
    naar: record.naar || "",
    cc: record.cc || "",
    medewerker: record.medewerker || "",
    pdfUrl: record.pdfUrl || "",
    bijlageNaam: record.bijlageNaam || "",
    // Alleen bij een formulier: genoeg om hem later opnieuw te openen en er een kopie van te maken.
    // De antwoorden zijn de ingetikte waarden, niet het document zelf — dat staat in SharePoint.
    ...(record.soort === "formulier" ? {
      formulierId: record.formulierId || "",
      antwoorden: record.antwoorden && typeof record.antwoorden === "object" ? record.antwoorden : {},
      zbs: record.zbs && typeof record.zbs === "object" ? record.zbs : null,
    } : {}),
  };
  brieven.push(nieuw);
  await schrijfBrieven(brieven);
  return nieuw;
}

/**
 * Werkt een bestaande regel bij in plaats van er een toe te voegen. Gebruikt bij een formulier dat je
 * uit het logboek opent en corrigeert: hetzelfde kenmerk, hetzelfde bestand, één regel in het
 * logboek. Alleen de meegegeven velden veranderen; `verzondenOp` en `kenmerk` blijven wat ze waren.
 * Geeft de bijgewerkte regel terug, of null als hij niet meer bestaat.
 */
async function werkBriefBij(id, wijziging) {
  const brieven = await haalAlleBrieven();
  const index = brieven.findIndex((b) => String(b.id) === String(id));
  if (index === -1) return null;
  const huidig = brieven[index];
  const nieuw = { ...huidig };
  for (const [sleutel, waarde] of Object.entries(wijziging || {})) {
    if (["id", "verzondenOp", "kenmerk", "soort"].includes(sleutel)) continue;
    if (waarde !== undefined) nieuw[sleutel] = waarde;
  }
  nieuw.gewijzigdOp = new Date().toISOString();
  brieven[index] = nieuw;
  await schrijfBrieven(brieven);
  return nieuw;
}

/** Alle brieven van één klant (op accountId), nieuwste eerst. */
async function haalBrievenVoorKlant(accountId) {
  const alle = await haalAlleBrieven();
  return alle
    .filter((b) => b.accountId === accountId)
    .sort((a, b) => String(b.verzondenOp).localeCompare(String(a.verzondenOp)));
}

/** Eén briefregel op id (of null). Nodig om bij het verwijderen te weten welk bestand in SharePoint
 *  bij deze brief hoort. */
async function haalBrief(id) {
  if (!id) return null;
  try {
    const brieven = await haalAlleBrieven();
    return brieven.find((b) => String(b.id) === String(id)) || null;
  } catch {
    return null;
  }
}

/**
 * Verwijdert één brief uit het logboek (op id). Alleen de LOGREGEL verdwijnt hier — het opruimen van
 * de PDF in SharePoint doet de aanroeper (api/brief-log), zodat het logboek zelf niets van Graph hoeft
 * te weten. Geeft true als er echt iets is verwijderd.
 */
async function verwijderBrief(id) {
  const brieven = await haalAlleBrieven();
  const over = brieven.filter((b) => String(b.id) !== String(id));
  if (over.length === brieven.length) return false;
  await schrijfBrieven(over);
  return true;
}

module.exports = { haalAlleBrieven, voegBriefToe, werkBriefBij, haalBrievenVoorKlant, haalBrief, verwijderBrief };
