/**
 * Word-briefpapier voor de Brieven-module — sinds 05-08-2026 op verzoek van Wouter ("kan ik
 * briefpapier niet als word geven ... één briefpapier voor alle brieven"). De beheerder uploadt één
 * Word-briefpapier (.docx) met jullie huisstijl in de **kop- en voetteksten** (logo/adres/voettekst);
 * dit vervangt bij het downloaden van Word alleen de **body** door de gegenereerde brief, zodat de
 * huisstijl (headers/footers/afbeeldingen/marges) exact behouden blijft. De brief is dan een echte,
 * bewerkbare .docx op jullie eigen briefpapier.
 *
 * Opslag: Azure Blob Storage, container portaalcontent, blob brief-briefpapier.docx.
 * Techniek: het .docx is een zip; we openen 'm (jszip), vervangen in word/document.xml de inhoud
 * van <w:body> door onze alinea's + de bestaande <w:sectPr> (die de header-/footerverwijzingen en
 * paginamarges bevat), en zippen 'm weer dicht. Alle andere onderdelen (headers, footers, media,
 * styles) blijven ongemoeid.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const JSZip = require("jszip");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "brief-briefpapier.docx";
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

async function streamNaarBuffer(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  return Buffer.concat(stukken);
}

async function slaBriefpapier(buffer) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  await blobClient.upload(buffer, buffer.length, {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  });
}

async function haalBriefpapier() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return null;
  return streamNaarBuffer((await blobClient.download()).readableStreamBody);
}

async function verwijderBriefpapier() {
  const containerClient = await haalContainerClient();
  await containerClient.getBlockBlobClient(BLOB_NAAM).deleteIfExists();
}

async function heeftBriefpapier() {
  const containerClient = await haalContainerClient();
  return containerClient.getBlockBlobClient(BLOB_NAAM).exists();
}

// ── WordprocessingML-opbouw van de body ──
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function run(tekst, opts = {}) {
  const b = opts.b ? "<w:b/>" : "";
  return `<w:r><w:rPr>${b}</w:rPr><w:t xml:space="preserve">${esc(tekst)}</w:t></w:r>`;
}
/** Runs met behoud van losse regeleinden binnen één alinea (\n → <w:br/>). */
function alineaRuns(alinea) {
  return String(alinea).split("\n").map((r, i) =>
    `<w:r><w:rPr></w:rPr>${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(r)}</w:t></w:r>`
  ).join("");
}
function para(runsXml, opts = {}) {
  const jc = opts.jc ? `<w:jc w:val="${opts.jc}"/>` : "";
  const sp = opts.after != null ? `<w:spacing w:after="${opts.after}"/>` : "";
  return `<w:p><w:pPr>${sp}${jc}</w:pPr>${runsXml}</w:p>`;
}

/** Bouwt de body-alinea's (zelfde volgorde als de PDF/Word-renderer, maar zonder eigen briefkop/voet). */
function bouwBody(brief) {
  const b = brief || {};
  const k = [];
  if (b.plaatsDatum) k.push(para(run(b.plaatsDatum), { jc: "right", after: 240 }));
  for (const r of (b.ontvangerRegels || [])) k.push(para(run(r), { after: 0 }));
  k.push(para(run(""), { after: 160 }));
  if (b.onderwerp) k.push(para(run(`Betreft: ${b.onderwerp}`, { b: true }), { after: 200 }));
  if (b.aanhef) k.push(para(run(b.aanhef), { after: 160 }));
  for (const alinea of String(b.tekst || "").replace(/\r\n/g, "\n").split(/\n[ \t]*\n/)) {
    k.push(para(alineaRuns(alinea), { after: 160 }));
  }
  if (b.afsluiting) k.push(para(run(b.afsluiting), { after: 0 }));
  k.push(para(run(""), { after: 400 })); // ruimte voor handtekening
  for (const r of (b.ondertekenaarRegels || [])) k.push(para(run(r), { after: 0 }));
  return k.join("");
}

/**
 * Vult het opgeslagen Word-briefpapier met de brief. Geeft een Buffer terug, of null als er (nog)
 * geen briefpapier is ingesteld — dan valt de aanroeper terug op de standaard docx-generatie.
 */
async function vulBriefpapier(brief) {
  const buf = await haalBriefpapier();
  if (!buf) return null;
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return null;
  let doc = await docFile.async("string");
  const bodyMatch = doc.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) return null;
  // De laatste <w:sectPr> in de body bevat de header-/footerverwijzingen + marges — die behouden.
  const secties = [...bodyMatch[1].matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)];
  const sectPr = secties.length ? secties[secties.length - 1][0] : "";
  const nieuweBody = `<w:body>${bouwBody(brief)}${sectPr}</w:body>`;
  doc = doc.replace(/<w:body>[\s\S]*<\/w:body>/, nieuweBody);
  zip.file("word/document.xml", doc);
  return zip.generateAsync({ type: "nodebuffer" });
}

module.exports = { slaBriefpapier, haalBriefpapier, verwijderBriefpapier, heeftBriefpapier, vulBriefpapier };
