/**
 * PDF-renderer voor notulen (en andere stukken die met documentOpmaak.js zijn opgemaakt).
 *
 * Het medewerkersportaal stuurt de al ontlede BLOKKEN mee — dezelfde array die het scherm rechts
 * rendert (zie src/medewerker/documentOpmaak.js → ontleedDocument). Zo kan hier geen tweede,
 * afwijkende ontleder ontstaan: wat je in het voorbeeld ziet, is wat er in de PDF komt.
 *
 * Blokvormen (allemaal { type, ... }):
 *   titel | kop | kopje | midden | lijn | punt {merk,tekst} | inspring | alinea {tekst,naPunt}
 *   ondertekening {functie,naam} | handtekening {namen:[]}
 *
 * De maatvoering spiegelt AFDRUK_CSS in documentOpmaak.js (A4, 20 mm marge, 11 pt tekst).
 * Bewust géén afhankelijkheid van briefRenderer.js: dat bestand gaat over de briefhuisstijl
 * (briefpapier, afzenderkop, voetband) en een notulenstuk is een blanco A4.
 */
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const KLEUR = {
  tekst: rgb(0.11, 0.14, 0.13),
  subtekst: rgb(0.36, 0.38, 0.35),
  muted: rgb(0.54, 0.56, 0.53),
  rand: rgb(0.11, 0.14, 0.13),
};

/**
 * pdf-lib's StandardFonts (Helvetica) gebruiken WinAnsi-encoding en crashen op tekens daarbuiten.
 * Zelfde normalisatie als briefRenderer.js — een aandeelhoudersnaam met een bijzonder teken mag de
 * PDF nooit laten mislukken. Let op: de em-dash uit "Naam — 50%" en de stippellijn van het
 * ondertekenblok worden hier naar ASCII gebracht.
 */
function pdfVeilig(s) {
  return String(s == null ? "" : s)
    .replace(/\r/g, "")
    .replace(/\t/g, "    ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "-")
    .replace(/ /g, " ")
    .replace(/[^ -ÿ€]/g, "?");
}

/** Word-wrap: knipt tekst in regels die binnen maxWidth passen. */
function wrapTekst(tekst, font, size, maxWidth) {
  const woorden = String(tekst || "").split(/\s+/).filter(Boolean);
  const regels = [];
  let huidig = "";
  for (const woord of woorden) {
    const kandidaat = huidig ? `${huidig} ${woord}` : woord;
    if (font.widthOfTextAtSize(kandidaat, size) > maxWidth && huidig) {
      regels.push(huidig);
      huidig = woord;
    } else {
      huidig = kandidaat;
    }
  }
  if (huidig) regels.push(huidig);
  return regels.length ? regels : [""];
}

/**
 * Rendert de blokken naar een A4-PDF (Buffer).
 *   blokken — zoals ontleedDocument() ze oplevert
 *   kop     — optioneel { klantnaam, subkop }: alleen tonen als het stuk geen eigen titel heeft
 */
async function blokkenNaarPdf(blokken, kop) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const BREEDTE = 595.28, HOOGTE = 841.89; // A4
  const marge = 56.7; // 20 mm
  const inhoudBreedte = BREEDTE - marge * 2;
  const boven = HOOGTE - marge;
  const onder = marge;

  let page = pdf.addPage([BREEDTE, HOOGTE]);
  let y = boven;

  const nieuwePagina = () => { page = pdf.addPage([BREEDTE, HOOGTE]); y = boven; };
  const ruimte = (nodig) => { if (y - nodig < onder) nieuwePagina(); };
  const witruimte = (h) => { ruimte(h); y -= h; };

  /** Eén stuk tekst, met woordafbreking, links/gecentreerd, eventueel ingesprongen. */
  const schrijf = (ruw, { size = 11, f = font, kleur = KLEUR.tekst, links = 0, regelhoogte = size * 1.55, midden = false } = {}) => {
    const breedte = inhoudBreedte - links;
    // Eerst op regeleinden splitsen, dán pas normaliseren: pdfVeilig() vervangt alles buiten Latin-1
    // door een vraagteken en zou een \n anders in een "?" veranderen — precies midden in de
    // aandeelhouderslijst, die immers uit meerdere regels in één alinea bestaat.
    for (const stuk of String(ruw == null ? "" : ruw).replace(/\r\n/g, "\n").split("\n")) {
      for (const r of wrapTekst(pdfVeilig(stuk), f, size, breedte)) {
        ruimte(regelhoogte);
        const x = midden ? marge + (inhoudBreedte - f.widthOfTextAtSize(r, size)) / 2 : marge + links;
        page.drawText(r, { x, y, size, font: f, color: kleur });
        y -= regelhoogte;
      }
    }
  };

  // Standaardkop (klantnaam + soort/datum) — alleen als het stuk niet zijn eigen titel meebrengt.
  if (kop && (kop.klantnaam || kop.subkop)) {
    if (kop.klantnaam) schrijf(kop.klantnaam, { size: 13, f: bold, regelhoogte: 17 });
    if (kop.subkop) schrijf(kop.subkop, { size: 10, kleur: KLEUR.subtekst, regelhoogte: 14 });
    witruimte(14);
  }

  for (const b of blokken || []) {
    switch (b && b.type) {
      case "titel":
        schrijf(b.tekst, { size: 18, f: bold, regelhoogte: 24, midden: true });
        witruimte(2);
        break;
      case "kop":
        witruimte(10);
        schrijf(b.tekst, { size: 12.5, f: bold, regelhoogte: 17 });
        witruimte(2);
        break;
      case "kopje":
        witruimte(8);
        schrijf(b.tekst, { size: 11, f: bold, regelhoogte: 16 });
        witruimte(1);
        break;
      case "midden":
        schrijf(b.tekst, { midden: true, regelhoogte: 16 });
        witruimte(2);
        break;
      case "lijn": {
        witruimte(8);
        ruimte(10);
        page.drawLine({ start: { x: marge, y }, end: { x: BREEDTE - marge, y }, thickness: 0.7, color: KLEUR.rand });
        y -= 12;
        break;
      }
      case "punt": {
        // Merkteken links, tekst met hangende inspring ernaast.
        const merk = pdfVeilig(b.merk || "-");
        const merkBreedte = Math.max(18, font.widthOfTextAtSize(merk, 11) + 8);
        const regels = wrapTekst(pdfVeilig(b.tekst), font, 11, inhoudBreedte - 10 - merkBreedte);
        ruimte(17);
        page.drawText(merk, { x: marge + 10, y, size: 11, font, color: KLEUR.tekst });
        page.drawText(regels[0] || "", { x: marge + 10 + merkBreedte, y, size: 11, font, color: KLEUR.tekst });
        y -= 17;
        for (let i = 1; i < regels.length; i++) {
          ruimte(17);
          page.drawText(regels[i], { x: marge + 10 + merkBreedte, y, size: 11, font, color: KLEUR.tekst });
          y -= 17;
        }
        witruimte(4);
        break;
      }
      case "inspring":
        schrijf(b.tekst, { links: 22, regelhoogte: 17 });
        witruimte(6);
        break;
      case "ondertekening":
        witruimte(30);
        schrijf("[Handtekening]", { size: 9.5, kleur: KLEUR.muted, regelhoogte: 13 });
        witruimte(16);
        schrijf(".......................................................", { size: 11, regelhoogte: 15 });
        if (b.naam) schrijf(b.naam, { regelhoogte: 15 });
        if (b.functie) schrijf(b.functie, { size: 10, kleur: KLEUR.subtekst, regelhoogte: 14 });
        break;
      case "handtekening": {
        // Oudere vorm: twee ondertekenregels naast elkaar.
        witruimte(40);
        const namen = Array.isArray(b.namen) ? b.namen : [];
        const kolomBreedte = namen.length ? (inhoudBreedte - 40 * (namen.length - 1)) / namen.length : inhoudBreedte;
        ruimte(40);
        namen.forEach((n, i) => {
          const x = marge + i * (kolomBreedte + 40);
          page.drawLine({ start: { x, y: y + 4 }, end: { x: x + kolomBreedte, y: y + 4 }, thickness: 0.7, color: KLEUR.rand });
          page.drawText(pdfVeilig(n), { x, y: y - 10, size: 10, font, color: KLEUR.tekst });
        });
        y -= 26;
        break;
      }
      default:
        if (b && b.naPunt) witruimte(6);
        schrijf(b ? b.tekst : "", { regelhoogte: 17 });
        witruimte(5);
    }
  }

  return Buffer.from(await pdf.save());
}

module.exports = { blokkenNaarPdf, pdfVeilig };
