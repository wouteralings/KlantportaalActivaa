/**
 * ZBS — zonder begeleidend schrijven.
 *
 * Een voorblad op ons briefpapier met alleen het adres van de ontvanger en één korte regel, zoals
 * "Ter afwikkeling". Geen aanhef, geen brieftekst, geen ondertekening: je stuurt een formulier op en
 * de ontvanger hoeft alleen te zien van wie het komt en waarvoor het bedoeld is.
 *
 * Het voorblad wordt als eerste pagina vóór het ingevulde formulier gezet, zodat er één document uit
 * de printer komt dat je zo in de envelop kunt doen.
 *
 * We gebruiken bewust dezelfde renderer als de Brieven-module (_gedeeld/briefRenderer.js): dan staat
 * het adresblok op precies dezelfde plek als bij een gewone brief, en verandert het mee zodra het
 * briefpapier in Beheer wordt vervangen.
 */
const { PDFDocument } = require("pdf-lib");
const { genereerBriefPdf } = require("./briefRenderer");
const { haalConfig } = require("./briefSjablonen");
const { haalAfbeelding } = require("./media");

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

const veiligeStr = (v) => String(v == null ? "" : v).trim();

/** "Enschede, 21 augustus 2026" — zelfde opmaak als op een gewone brief. */
function plaatsDatumRegel(plaats, datum) {
  const d = datum instanceof Date ? datum : new Date();
  const tekst = `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
  const p = veiligeStr(plaats);
  return p ? `${p}, ${tekst}` : tekst;
}

/** De basisnaam uit een /api/media/<naam>-url; zo vinden we de opgeslagen afbeelding terug. */
function basisnaamUitMediaUrl(url) {
  const m = /^\/api\/media\/([a-z0-9_-]+)/i.exec(veiligeStr(url));
  return m ? m[1] : null;
}

/**
 * Rendert het voorblad. `adresRegels` is het adresblok zoals het op de envelop zou staan, `regel` de
 * ene zin eronder. Beide komen uit het invulscherm; wat er verder op het vel staat (logo, voetband)
 * zit in het briefpapier uit Beheer → Instellingen.
 */
async function maakZbsVoorblad({ adresRegels, regel, kenmerk, extraRegels }) {
  const config = await haalConfig().catch(() => ({}));
  const a = (config && config.afzender) || {};

  // Exact dezelfde velden als BrievenOverzicht meegeeft aan een gewone brief. Alleen aanhef,
  // afsluiting en ondertekening blijven leeg — dát is wat een ZBS onderscheidt van een brief.
  const pcp = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join("  ");
  const brief = {
    afzenderNaam: veiligeStr(a.bedrijfsnaam) || "Activaa",
    afzenderRegels: [
      veiligeStr(a.adres),
      pcp,
      veiligeStr(a.telefoon) ? `T ${veiligeStr(a.telefoon)}` : "",
      [veiligeStr(a.email), veiligeStr(a.website)].filter(Boolean).join("  ·  "),
    ].filter(Boolean),
    afzenderMiniRegel: [veiligeStr(a.adres), [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ")].filter(Boolean).join("  "),
    ontvangerRegels: (Array.isArray(adresRegels) ? adresRegels : []).map(veiligeStr).filter(Boolean),
    // Twee witregels extra boven het adres: op een ZBS staat er geen brieftekst onder, en dan begint
    // het blok anders wel erg hoog op het briefpapier.
    extraRegelsBovenAdres: Number.isFinite(Number(extraRegels)) ? Number(extraRegels) : 2,
    plaatsDatum: plaatsDatumRegel(a.plaats),
    kenmerk: veiligeStr(kenmerk),
    beconnummer: veiligeStr(a.beconnummer),
    tekst: veiligeStr(regel),
    footerKolommen: [
      [veiligeStr(a.bedrijfsnaam) || "Activaa", veiligeStr(a.adres), [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ")].filter(Boolean),
      [veiligeStr(a.telefoon), veiligeStr(a.website), veiligeStr(a.email)].filter(Boolean),
      [veiligeStr(a.btw) && `BTW ${veiligeStr(a.btw)}`, veiligeStr(a.kvk) && `KvK ${veiligeStr(a.kvk)}`, veiligeStr(a.iban) && `IBAN ${veiligeStr(a.iban)}`].filter(Boolean),
    ],
    voetnoot: veiligeStr(a.voetnoot) || [veiligeStr(a.bedrijfsnaam) || "Activaa", veiligeStr(a.kvk) ? `KvK ${veiligeStr(a.kvk)}` : "", veiligeStr(a.email), veiligeStr(a.website)].filter(Boolean).join("  ·  "),
    logoUitlijning: a.logoUitlijning || "links",
    logoGrootte: a.logoGrootte || "normaal",
  };

  // Briefpapier (achtergrond) en logo erbij, net als bij een gewone brief. Best-effort: zonder
  // briefpapier komt er een nette blanco A4 uit in plaats van een foutmelding.
  const logoNaam = basisnaamUitMediaUrl(a.logoUrl);
  if (logoNaam) {
    try {
      const afb = await haalAfbeelding(logoNaam);
      if (afb && afb.buffer) brief.logo = { buffer: afb.buffer, contentType: afb.contentType };
    } catch { /* zonder logo verder */ }
  }
  const achtergrondNaam = basisnaamUitMediaUrl(a.achtergrondUrl);
  if (achtergrondNaam) {
    try {
      const afb = await haalAfbeelding(achtergrondNaam);
      if (afb && afb.buffer) brief.achtergrond = { buffer: afb.buffer, contentType: afb.contentType };
    } catch { /* zonder briefpapier verder */ }
  }

  return genereerBriefPdf(brief);
}

/**
 * Zet het voorblad vóór het formulier. We voegen de pagina toe aan het formulier-document zelf en
 * bouwen het niet opnieuw op: de invulvelden van het formulier blijven zo gewoon werken.
 */
async function zetVoorbladVoor(formulierPdf, voorbladPdf) {
  const doc = await PDFDocument.load(formulierPdf);
  const voorblad = await PDFDocument.load(voorbladPdf);
  const paginas = await doc.copyPages(voorblad, voorblad.getPageIndices());
  // Achterstevoren invoegen, zodat een voorblad van meer dan één pagina in de goede volgorde staat.
  for (let i = paginas.length - 1; i >= 0; i--) doc.insertPage(0, paginas[i]);
  return Buffer.from(await doc.save());
}

module.exports = { maakZbsVoorblad, zetVoorbladVoor, plaatsDatumRegel };
