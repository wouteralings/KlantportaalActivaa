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

/** "Label: waarde"-alinea met vet label + normale waarde. */
function labelParaXml(label, waarde, after = 40) {
  const runs =
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(label)}: </w:t></w:r>` +
    `<w:r><w:rPr></w:rPr><w:t xml:space="preserve">${esc(waarde)}</w:t></w:r>`;
  return para(runs, { after });
}
/** Kleine, gecentreerde grijze regel (afzenderadres / automatisch-gegenereerd). */
function kleinCentraal(tekst, opts = {}) {
  const before = opts.before != null ? `w:before="${opts.before}" ` : "";
  const jc = opts.center ? '<w:jc w:val="center"/>' : "";
  return `<w:p><w:pPr><w:spacing ${before}w:after="${opts.after != null ? opts.after : 0}"/>${jc}</w:pPr>` +
    `<w:r><w:rPr><w:color w:val="8A9089"/><w:sz w:val="${opts.sz || 16}"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(tekst)}</w:t></w:r></w:p>`;
}

/** Bouwt de body-alinea's in huisstijl-layout (zonder eigen briefkop/voet — die zitten in het
 *  briefpapier): afzenderadres, VERTROUWELIJK, geadresseerde, plaats/datum, Kenmerk/Beconnummer/
 *  Betreft, Behandeld door/Telefoonnummer, aanhef, tekst, groet + ondertekening, automatisch-regel. */
function bouwBody(brief) {
  const b = brief || {};
  const k = [];
  if (b.afzenderMiniRegel) k.push(kleinCentraal(b.afzenderMiniRegel, { center: true, sz: 14, after: 200 }));
  if (b.vertrouwelijk) k.push(para(run("VERTROUWELIJK", { b: true }), { after: 80 }));
  for (const r of (b.ontvangerRegels || [])) k.push(para(run(r), { after: 0 }));
  k.push(para(run(""), { after: 160 }));
  if (b.plaatsDatum) k.push(para(run(b.plaatsDatum), { after: 160 })); // links uitgelijnd
  if (b.kenmerk) k.push(labelParaXml("Kenmerk", b.kenmerk));
  if (b.beconnummer) k.push(labelParaXml("Beconnummer", b.beconnummer));
  if (b.onderwerp) k.push(labelParaXml("Betreft", b.onderwerp, (b.behandeldDoor || b.telefoonnummer) ? 160 : 200));
  if (b.behandeldDoor) k.push(labelParaXml("Behandeld door", b.behandeldDoor));
  if (b.telefoonnummer) k.push(labelParaXml("Telefoonnummer", b.telefoonnummer));
  if (b.behandeldDoor || b.telefoonnummer) {
    k.push(para(run(""), { after: 120 }));
    k.push(para(run(""), { after: 0 })); // extra witregel tussen Telefoonnummer en aanhef
  }
  if (b.aanhef) k.push(para(run(b.aanhef), { after: 160 }));
  for (const alinea of String(b.tekst || "").replace(/\r\n/g, "\n").split(/\n[ \t]*\n/)) {
    k.push(para(alineaRuns(alinea), { after: 160 }));
  }
  if (b.afsluiting) k.push(para(run(b.afsluiting), { after: 0 }));
  if (b.ondertekeningBedrijf) k.push(para(run(b.ondertekeningBedrijf), { after: 0 }));
  k.push(para(run(""), { after: 400 })); // ruimte voor handtekening
  if (b.ondertekenaar) k.push(para(run(b.ondertekenaar), { after: 0 }));
  else for (const r of (b.ondertekenaarRegels || [])) k.push(para(run(r), { after: 0 }));
  if (b.automatischGegenereerd) k.push(kleinCentraal("Deze brief is automatisch gegenereerd en daarom niet ondertekend", { before: 160, after: 0 }));
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

/** Pixelafmetingen + (JPEG) aantal kleurkanalen uit een afbeelding-buffer (dependency-vrij). */
function beeldInfo(buffer, naam) {
  const isPng = /\.png$/i.test(naam);
  try {
    if (isPng) {
      if (buffer.length >= 24 && buffer[12] === 0x49 && buffer[13] === 0x48 && buffer[14] === 0x44 && buffer[15] === 0x52) {
        return { type: "image/png", w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20), comp: 3 };
      }
      return { type: "image/png", w: 0, h: 0, comp: 3 };
    }
    let o = 2;
    while (o + 9 < buffer.length) {
      if (buffer[o] !== 0xff) { o++; continue; }
      const marker = buffer[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "image/jpeg", h: buffer.readUInt16BE(o + 5), w: buffer.readUInt16BE(o + 7), comp: buffer[o + 9] };
      }
      o += 2 + buffer.readUInt16BE(o + 2);
    }
  } catch { /* val terug */ }
  return { type: isPng ? "image/png" : "image/jpeg", w: 0, h: 0, comp: 3 };
}

/**
 * Zoekt in een .docx-briefpapier de volledige-pagina-achtergrondafbeelding en geeft die terug als
 * data-URL (voor het live voorbeeld + de PDF). Kiest de grootste A4-vormige afbeelding, slaat kleine
 * logo's/iconen over en negeert CMYK-JPEG's (die kunnen pdf-lib en de browser niet weergeven).
 * Geeft null als er geen geschikte achtergrond in het briefpapier zit.
 */
async function extraheerAchtergrond(docxBuffer) {
  try {
    const zip = await JSZip.loadAsync(docxBuffer);
    const paden = [];
    zip.forEach((pad, entry) => { if (/^word\/media\/.*\.(jpe?g|png)$/i.test(pad) && !entry.dir) paden.push(pad); });
    let beste = null;
    for (const pad of paden) {
      const buf = await zip.file(pad).async("nodebuffer");
      const info = beeldInfo(buf, pad);
      const w = info.w || 0, h = info.h || 0, aspect = w ? h / w : 0;
      const volledigePagina = w >= 1000 && h >= 1400 && aspect >= 1.2 && aspect <= 1.6; // A4-vormig, staand
      if (!volledigePagina) continue;   // logo's/iconen overslaan
      if (info.comp === 4) continue;     // CMYK kan pdf-lib/preview niet aan
      const area = w * h;
      if (!beste || area > beste.area) beste = { buf, type: info.type, area };
    }
    if (!beste) return null;
    return `data:${beste.type};base64,${beste.buf.toString("base64")}`;
  } catch {
    return null;
  }
}

module.exports = { slaBriefpapier, haalBriefpapier, verwijderBriefpapier, heeftBriefpapier, vulBriefpapier, extraheerAchtergrond };
