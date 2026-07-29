/**
 * Genereert een echte, downloadbare PDF van een factuur/offerte/creditnota — met pdf-lib,
 * dezelfde aanpak als de bewijs-PDF in api/taken-ondertekenen/index.js (en de offertetool's
 * api/_gedeeld/onboarding.js: genereerOffertePdf). Geen headless-browser-afhankelijkheid,
 * dus prima geschikt voor een Azure Functions Consumption-hostingplan.
 *
 * De opmaak volgt zo veel mogelijk het scherm-voorbeeld (DocumentVoorbeeld in
 * src/portaal/FacturatieModule.jsx): afzender/klant-blokken, betaalbanner, regels,
 * subtotaal/btw-per-tarief, en onderaan de betaalinstructies + een SEPA-betaal-QR-code
 * (zie qrBetaling.js) als er een IBAN bekend is.
 */
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { genereerBetaalQr } = require("./qrBetaling");
const { haalAfbeelding } = require("./media");

const KLEUR = {
  tekst: rgb(0.11, 0.14, 0.13),
  subtekst: rgb(0.36, 0.38, 0.35),
  muted: rgb(0.54, 0.56, 0.53),
  rand: rgb(0.89, 0.89, 0.87),
  blauw: rgb(0.11, 0.36, 0.55),
  lichtblauw: rgb(0.92, 0.95, 0.97),
};

const NAAM_PER_TYPE = { factuur: "Factuur", offerte: "Offerte", creditnota: "Creditnota" };

function geld(n) {
  return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function kortDatum(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}
function leveringsperiodeTekst(start, eind) {
  const s = kortDatum(start);
  const e = kortDatum(eind);
  if (s && e && s !== e) return `${s} t/m ${e}`;
  return s || e || "";
}
function adresRegels(adres) {
  const a = adres || {};
  return [
    [a.straat, a.huisnummer, a.toevoeging].filter(Boolean).join(" "),
    [a.postcode, a.plaats].filter(Boolean).join(" "),
    a.land && a.land !== "NL" ? a.land : "",
  ].filter(Boolean);
}
// Het logo wordt bewaard als eigen blob (zie media.js#slaKlantLogoOp) en de opgeslagen
// `logoUrl` is de eigen serveerroute ernaartoe ("/api/media/klantlogo-<accountId>?v=...").
// Voor de PDF hebben we de ruwe bytes nodig (niet nóg een keer over HTTP ophalen — we draaien
// al in dezelfde Azure Functions-app) — vandaar dat we hier de blob-naam terugleiden uit de
// URL en 'm rechtstreeks via haalAfbeelding() (media.js) opvragen.
function basisnaamUitMediaUrl(url) {
  const match = /\/api\/media\/([a-z0-9_-]+)/i.exec(url || "");
  return match ? match[1] : null;
}

function groepeerBtw(regels) {
  const groepen = new Map();
  for (const r of regels) {
    const percentage = Number(r.btwPercentage) || 0;
    const basis = (Number(r.aantal) || 0) * (Number(r.prijs) || 0);
    const huidig = groepen.get(percentage) || { percentage, basis: 0, btw: 0 };
    huidig.basis += basis;
    huidig.btw += basis * (percentage / 100);
    groepen.set(percentage, huidig);
  }
  return [...groepen.values()].sort((a, b) => b.percentage - a.percentage);
}
/** Knipt tekst in regels die binnen maxWidth passen (eenvoudige word-wrap). */
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

async function genereerFactuurPdf({ document: doc, klant, bedrijfsgegevens, documenttype }) {
  const bg = bedrijfsgegevens || {};
  const naamType = NAAM_PER_TYPE[documenttype] || "Document";
  const regels = (doc.regels || []).filter((r) => (r.omschrijving || "").trim() || Number(r.prijs));
  const btwGroepen = groepeerBtw(regels);
  const totaal = doc.totaal != null ? Number(doc.totaal) : (Number(doc.subtotaal) || 0) + (Number(doc.btwBedrag) || 0);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const marge = 50;
  const breedte = 595.28 - marge * 2;
  let y = 792;

  // Logo (optioneel) — staat wél al op het scherm-voorbeeld, ontbrak tot nu toe op de echte
  // PDF. Best-effort: een ontbrekende blob, een niet-ondersteund formaat (pdf-lib kan alleen
  // PNG/JPEG embedden, terwijl de upload zelf elk `image/*`-type toestaat) of een andere fout
  // mag de PDF-generatie nooit laten mislukken — de factuur moet ook zonder logo gewoon lukken.
  let logoAfbeelding = null;
  const logoBasisnaam = basisnaamUitMediaUrl(bg.logoUrl);
  if (logoBasisnaam) {
    try {
      const opgehaald = await haalAfbeelding(logoBasisnaam);
      if (opgehaald) {
        if (/png/i.test(opgehaald.contentType)) logoAfbeelding = await pdf.embedPng(opgehaald.buffer);
        else if (/jpe?g/i.test(opgehaald.contentType)) logoAfbeelding = await pdf.embedJpg(opgehaald.buffer);
      }
    } catch {
      logoAfbeelding = null;
    }
  }

  const tekst = (t, x, size, { f = font, kleur = KLEUR.tekst, align = "left" } = {}) => {
    const inhoud = String(t == null ? "" : t);
    const posX = align === "right" ? x - f.widthOfTextAtSize(inhoud, size) : x;
    page.drawText(inhoud, { x: posX, y, size, font: f, color: kleur });
  };

  // ── Kop: afzender (evt. met logo) links, documenttitel + meta rechts ──────────────────
  const kopStartY = y;
  if (logoAfbeelding) {
    const maxBreedte = 110, maxHoogte = 34;
    const schaal = Math.min(maxBreedte / logoAfbeelding.width, maxHoogte / logoAfbeelding.height, 1);
    const logoBreedte = logoAfbeelding.width * schaal;
    const logoHoogte = logoAfbeelding.height * schaal;
    page.drawImage(logoAfbeelding, { x: marge, y: y - logoHoogte, width: logoBreedte, height: logoHoogte });
    y -= logoHoogte + 8;
  }
  if (bg.bedrijfsnaam) tekst(bg.bedrijfsnaam, marge, 13, { f: bold });
  y -= 16;
  for (const regel of adresRegels(bg)) { tekst(regel, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }
  if (bg.kvkNummer) { tekst(`KvK ${bg.kvkNummer}`, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }
  if (bg.btwNummer) { tekst(`BTW ${bg.btwNummer}`, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }

  // De factuurgegevens (titel + metaregels) rechts staan 2 regels lager dan de kop van de
  // linkerkolom — feedback Wouter (29-07-2026): stond te hoog/te dicht tegen de bovenrand (en
  // het logo, indien aanwezig) aan. Het hele blok schuift als geheel naar beneden, de interne
  // regelafstand binnen het blok blijft ongewijzigd.
  let yRechts = kopStartY - 26;
  const rechtsX = marge + breedte;
  // Let op: bewust page.drawText (met een expliciete y) i.p.v. de tekst()-helper hierboven —
  // die tekent op de gedeelde, inmiddels al door het afzenderblok (en evt. logo) verlaagde
  // `y`, wat de titel zou laten overlappen met de metaregels (factuurnummer/-datum/
  // leveringsperiode) hieronder. De rechterkolom start altijd bovenaan (op 2 regels na, zie
  // hierboven), ongeacht of er links een logo staat — zelfde als het scherm-voorbeeld
  // (DocumentVoorbeeld: alignItems: "flex-start" op de gezamenlijke flex-rij, dus de titel zakt
  // niet mee met een logo in de linkerkolom).
  page.drawText(naamType, {
    x: rechtsX - bold.widthOfTextAtSize(naamType, 18), y: yRechts, size: 18, font: bold, color: KLEUR.blauw,
  });
  yRechts -= 22;
  const metaRegels = [
    [`${naamType}nummer`, doc.nummer || "(concept)"],
    [`${naamType}datum`, kortDatum(doc.factuurdatum)],
  ];
  // Een offerte heeft een geldigheidsdatum, geen vervaldatum/betalingstermijn voor betaling —
  // die tonen op een offerte zou ten onrechte een betaalverplichting suggereren (zelfde
  // voorwaarde als DocumentVoorbeeld op het scherm).
  if (documenttype !== "offerte") metaRegels.push(["Vervaldatum", kortDatum(doc.vervaldatum)]);
  if (documenttype !== "offerte" && doc.betalingstermijnDagen != null) {
    metaRegels.push(["Betalingstermijn", `${doc.betalingstermijnDagen} dagen`]);
  }
  const leveringTekst = leveringsperiodeTekst(doc.leveringsperiodeStart, doc.leveringsperiodeEind);
  if (leveringTekst) metaRegels.push(["Leveringsperiode", leveringTekst]);
  for (const [label, waarde] of metaRegels) {
    page.drawText(`${label}: ${waarde}`, {
      x: rechtsX - font.widthOfTextAtSize(`${label}: ${waarde}`, 9.5), y: yRechts, size: 9.5, font, color: KLEUR.subtekst,
    });
    yRechts -= 13;
  }

  y = Math.min(y, yRechts) - 22;

  // ── Klant ("Factuur aan" / "Offerte aan" / "Creditnota aan") ──────────────────────────
  tekst(`${naamType.toUpperCase()} AAN`, marge, 8.5, { f: bold, kleur: KLEUR.muted });
  y -= 13;
  if (klant) {
    tekst(klant.naam, marge, 11.5, { f: bold });
    y -= 14;
    for (const regel of adresRegels(klant.adres)) { tekst(regel, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }
    // BTW/KvK van de klant zelf — stond al op het scherm-voorbeeld, ontbrak nog op de PDF.
    if (klant.btwNummer) { tekst(`BTW ${klant.btwNummer}`, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }
    if (klant.kvkNummer) { tekst(`KvK ${klant.kvkNummer}`, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }
    if (klant.email) { tekst(klant.email, marge, 9.5, { kleur: KLEUR.subtekst }); y -= 12; }
  } else {
    tekst("— geen klant —", marge, 10.5, { kleur: KLEUR.muted });
    y -= 14;
  }
  y -= 12;

  // ── Betaalbanner (alleen factuur/creditnota, niet offerte) ────────────────────────────
  if (documenttype !== "offerte" && doc.vervaldatum) {
    const bannerTekst = `${geld(totaal)} te betalen op ${kortDatum(doc.vervaldatum)}`;
    page.drawRectangle({ x: marge, y: y - 22, width: breedte, height: 26, color: KLEUR.lichtblauw });
    page.drawText(bannerTekst, { x: marge + 10, y: y - 14, size: 11, font: bold, color: KLEUR.blauw });
    y -= 38;
  }

  // ── Regels-tabel ───────────────────────────────────────────────────────────────────────
  const kolX = { omschrijving: marge, aantal: marge + 260, prijs: marge + 320, btw: marge + 400, bedrag: marge + breedte };
  page.drawRectangle({ x: marge, y: y - 16, width: breedte, height: 18, color: KLEUR.lichtblauw });
  page.drawText("Omschrijving", { x: kolX.omschrijving + 6, y: y - 11, size: 8.5, font: bold, color: KLEUR.subtekst });
  page.drawText("Aantal", { x: kolX.aantal, y: y - 11, size: 8.5, font: bold, color: KLEUR.subtekst });
  page.drawText("Prijs", { x: kolX.prijs, y: y - 11, size: 8.5, font: bold, color: KLEUR.subtekst });
  page.drawText("BTW", { x: kolX.btw, y: y - 11, size: 8.5, font: bold, color: KLEUR.subtekst });
  page.drawText("Bedrag", {
    x: kolX.bedrag - font.widthOfTextAtSize("Bedrag", 8.5), y: y - 11, size: 8.5, font: bold, color: KLEUR.subtekst,
  });
  y -= 20;

  if (regels.length === 0) {
    tekst("Nog geen regels.", marge + 6, 10, { kleur: KLEUR.muted });
    y -= 16;
  }
  for (const r of regels) {
    const bedragRegel = (Number(r.aantal) || 0) * (Number(r.prijs) || 0);
    const omschrijvingRegels = wrapTekst(r.omschrijving || "—", font, 10, kolX.aantal - kolX.omschrijving - 12);
    const regelLevering = leveringsperiodeTekst(r.leveringsperiodeStart, r.leveringsperiodeEind);
    const rijHoogte = 14 * omschrijvingRegels.length + (regelLevering ? 11 : 0) + 6;

    page.drawLine({ start: { x: marge, y: y + 4 }, end: { x: marge + breedte, y: y + 4 }, thickness: 0.5, color: KLEUR.rand });
    let regelY = y - 8;
    for (const stuk of omschrijvingRegels) {
      page.drawText(stuk, { x: kolX.omschrijving + 6, y: regelY, size: 10, font, color: KLEUR.tekst });
      regelY -= 13;
    }
    if (regelLevering) {
      page.drawText(`Leveringsperiode: ${regelLevering}`, { x: kolX.omschrijving + 6, y: regelY, size: 8, font, color: KLEUR.muted });
    }
    page.drawText(String(r.aantal ?? ""), { x: kolX.aantal, y: y - 8, size: 10, font, color: KLEUR.tekst });
    page.drawText(geld(r.prijs), { x: kolX.prijs, y: y - 8, size: 10, font, color: KLEUR.tekst });
    page.drawText(`${r.btwPercentage ?? 0}%`, { x: kolX.btw, y: y - 8, size: 10, font, color: KLEUR.tekst });
    const bedragTekst = geld(bedragRegel);
    page.drawText(bedragTekst, { x: kolX.bedrag - font.widthOfTextAtSize(bedragTekst, 10), y: y - 8, size: 10, font: bold, color: KLEUR.tekst });

    y -= rijHoogte;
  }
  page.drawLine({ start: { x: marge, y: y + 4 }, end: { x: marge + breedte, y: y + 4 }, thickness: 0.5, color: KLEUR.rand });
  y -= 14;

  // ── Totalen ────────────────────────────────────────────────────────────────────────────
  const totaalRegel = (label, waarde, opts = {}) => {
    page.drawText(label, { x: kolX.bedrag - 140, y, size: opts.size || 10, font: opts.f || font, color: opts.kleur || KLEUR.subtekst });
    const w = geld(waarde);
    page.drawText(w, { x: kolX.bedrag - (opts.f || font).widthOfTextAtSize(w, opts.size || 10), y, size: opts.size || 10, font: opts.f || font, color: opts.kleur || KLEUR.subtekst });
    y -= (opts.size || 10) + 6;
  };
  totaalRegel("Subtotaal", doc.subtotaal);
  if (btwGroepen.length === 0) {
    totaalRegel("BTW", doc.btwBedrag);
  } else {
    for (const g of btwGroepen) totaalRegel(`BTW ${g.percentage}%`, g.btw);
  }
  y -= 2;
  totaalRegel("Totaal", totaal, { size: 12.5, f: bold, kleur: KLEUR.tekst });
  y -= 16;

  if (doc.opmerkingen) {
    for (const regel of wrapTekst(doc.opmerkingen, font, 9.5, breedte)) {
      tekst(regel, marge, 9.5, { kleur: KLEUR.subtekst });
      y -= 12;
    }
    y -= 8;
  }

  // ── Betaalinstructies + QR-code (alleen als er een IBAN bekend is) ───────────────────
  if (bg.iban && documenttype !== "offerte") {
    const qrPng = await genereerBetaalQr({
      naam: bg.bedrijfsnaam, iban: bg.iban, bedrag: totaal,
      omschrijving: doc.nummer ? `Factuurnummer ${doc.nummer}` : "Factuur",
    });
    const qrGrootte = 78;
    const qrY = Math.max(y - qrGrootte, 70);
    if (qrPng) {
      const png = await pdf.embedPng(qrPng);
      page.drawImage(png, { x: marge, y: qrY, width: qrGrootte, height: qrGrootte });
    }
    const tekstX = marge + (qrPng ? qrGrootte + 14 : 0);
    let ty = qrY + qrGrootte - 10;
    const instructieRegels = wrapTekst(
      `Wij verzoeken u het bedrag van ${geld(totaal)} uiterlijk ${kortDatum(doc.vervaldatum)} over te maken naar ` +
      `rekeningnummer ${bg.iban}${bg.ibanTenaamstelling ? ` ten name van ${bg.ibanTenaamstelling}` : ""}, onder vermelding van het factuurnummer.` +
      (qrPng ? " Scan de QR-code met uw bank-app om direct te betalen." : ""),
      font, 9, breedte - (qrPng ? qrGrootte + 14 : 0)
    );
    for (const regel of instructieRegels) {
      page.drawText(regel, { x: tekstX, y: ty, size: 9, font, color: KLEUR.subtekst });
      ty -= 12;
    }
  }

  // ── Voettekst ──────────────────────────────────────────────────────────────────────────
  const voettekst = [bg.bedrijfsnaam, bg.kvkNummer && `KvK ${bg.kvkNummer}`, bg.btwNummer && `BTW ${bg.btwNummer}`]
    .filter(Boolean).join(" · ");
  if (voettekst) {
    page.drawText(voettekst, { x: marge, y: 36, size: 8, font, color: KLEUR.muted });
  }

  return Buffer.from(await pdf.save());
}

module.exports = { genereerFactuurPdf };
