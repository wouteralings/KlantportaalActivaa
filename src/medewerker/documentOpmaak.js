/**
 * Lichte opmaak voor de voorbeelddocumenten (notulen / dividenduitkering). De sjablonen in
 * Beheer → Dossiers zijn platte tekst; met een handvol markeringen aan het begin van een regel geef
 * je toch de structuur die zulke stukken nodig hebben — zonder een tekstverwerker in te bouwen.
 *
 *   # Titel            → gecentreerde titel (het "Notulen" bovenaan)
 *   ## Kop             → kop boven een blok
 *   ### Kopje          → klein kopje ("Besluit:", "Sluiting:")
 *   ---                → horizontale scheidingslijn
 *   - punt             → opsomming met bolletje
 *   a) punt            → opsomming met de letter/nummer die je zelf typt (blijft staan). Letters
 *                        alleen in kleine letters (a) / a.), cijfers en Romeinse cijfers (1. / I.);
 *                        "J. de Vries" is dus een naam, geen opsommingspunt.
 *   > tekst            → ingesprongen blok (het besluit onder een genummerd punt)
 *   [handtekening] Voorzitter | Notulist   → twee ondertekenregels naast elkaar
 *   [midden] tekst     → één regel gecentreerd
 *
 * Alles zonder markering is een gewone alinea. Eén lege regel = witruimte tussen blokken.
 *
 * Begint een sjabloon met "# ", dan bepaalt het document zijn eigen kop en laat het voorbeeldscherm
 * de standaardkop (klantnaam + soort) weg — die staat bij deze notulen namelijk al in de tekst zelf.
 *
 * Deze module levert alleen de BLOKKEN op; het scherm rendert ze als React en het afdrukvenster als
 * HTML. Zo zien voorbeeld en PDF er gegarandeerd hetzelfde uit.
 */

/** Splitst een (al ingevulde) sjabloontekst in blokken: [{ type, tekst, ... }]. */
export function ontleedDocument(tekst) {
  const regels = String(tekst == null ? "" : tekst).replace(/\r\n/g, "\n").split("\n");
  const blokken = [];
  let alinea = [];

  const sluitAlinea = () => {
    if (!alinea.length) return;
    blokken.push({ type: "alinea", tekst: alinea.join("\n") });
    alinea = [];
  };

  for (const ruw of regels) {
    const r = ruw.replace(/\s+$/, "");
    const kaal = r.trim();

    if (!kaal) { sluitAlinea(); continue; }

    if (kaal === "---" || kaal === "___") { sluitAlinea(); blokken.push({ type: "lijn" }); continue; }

    let m;
    if ((m = /^###\s+(.*)$/.exec(kaal))) { sluitAlinea(); blokken.push({ type: "kopje", tekst: m[1] }); continue; }
    if ((m = /^##\s+(.*)$/.exec(kaal))) { sluitAlinea(); blokken.push({ type: "kop", tekst: m[1] }); continue; }
    if ((m = /^#\s+(.*)$/.exec(kaal))) { sluitAlinea(); blokken.push({ type: "titel", tekst: m[1] }); continue; }
    if ((m = /^\[midden\]\s*(.*)$/i.exec(kaal))) { sluitAlinea(); blokken.push({ type: "midden", tekst: m[1] }); continue; }
    // [ondertekening] Voorzitter | {{directeur}} | {{namensvoorzitter}}  → één ondertekenblok:
    // ondertekenruimte, een streep, de naam, eventueel "handelend namens <vennootschap>" en daaronder
    // de functie. Het derde deel is optioneel — laat je het weg of blijft het leeg, dan komt die regel
    // er niet. Meerdere regels = meerdere blokken onder elkaar, precies zoals in de Word-modellen.
    if ((m = /^\[ondertekening\]\s*(.*)$/i.exec(kaal))) {
      sluitAlinea();
      const delen = m[1].split("|").map((s) => s.trim());
      blokken.push({ type: "ondertekening", functie: delen[0] || "", naam: delen[1] || "", namens: delen[2] || "" });
      continue;
    }
    // Oudere vorm: twee namen naast elkaar. Blijft werken voor bestaande sjablonen.
    if ((m = /^\[handtekening\]\s*(.*)$/i.exec(kaal))) {
      sluitAlinea();
      const namen = m[1].split("|").map((s) => s.trim()).filter(Boolean);
      blokken.push({ type: "handtekening", namen: namen.length ? namen : ["Voorzitter", "Notulist"] });
      continue;
    }
    if ((m = /^>\s?(.*)$/.exec(r))) { sluitAlinea(); blokken.push({ type: "inspring", tekst: m[1] }); continue; }
    if ((m = /^-\s+(.*)$/.exec(kaal))) { sluitAlinea(); blokken.push({ type: "punt", merk: "•", tekst: m[1] }); continue; }
    // "a) tekst", "a. tekst", "1. tekst", "I. tekst" — het merkteken dat je zelf typt blijft staan.
    // Letters bewust ALLEEN in kleine letters: een regel als "J. de Vries — 50%" of "M. Jansen treedt
    // op als voorzitter" is een naam met een voorletter, geen opsommingspunt. Zou een hoofdletter ook
    // meetellen, dan zou elke aandeelhouder met een voorletter als bolletje in de notulen komen.
    // Hoofdletters blijven wél toegestaan als Romeins cijfer (I., II., IV.) — zo blijft "I. Dividend-
    // uitkering" in de notulenmodellen gewoon een genummerd punt.
    if ((m = /^([a-z]\)|[a-z]\.|[0-9]+\.|[IVX]{1,4}\.)\s+(.*)$/.exec(kaal))) {
      sluitAlinea();
      blokken.push({ type: "punt", merk: m[1], tekst: m[2] });
      continue;
    }

    alinea.push(kaal);
  }
  sluitAlinea();
  // Een alinea die direct op een opsomming volgt krijgt wat lucht mee — anders plakt de afsluitende
  // zin ("zodat op de Vergadering …") tegen het laatste bolletje aan.
  for (let i = 1; i < blokken.length; i++) {
    if (blokken[i].type === "alinea" && blokken[i - 1].type === "punt") blokken[i].naPunt = true;
  }
  return blokken;
}

/** Bepaalt de eigen kop van een sjabloon (begint met "# ") — dan geen standaardkop erboven. */
export function heeftEigenKop(tekst) {
  return /^\s*#\s+/.test(String(tekst == null ? "" : tekst));
}

/** Gedeelde maatvoering, zodat scherm en afdruk dezelfde verhoudingen aanhouden. */
export const OPMAAK = {
  titel: { fontSize: 1.65, gewicht: 700, ruimteOnder: 2 },
  kop: { fontSize: 1.12, gewicht: 700, ruimteBoven: 14, ruimteOnder: 4 },
  kopje: { fontSize: 1, gewicht: 700, ruimteBoven: 12, ruimteOnder: 3 },
  alineaRuimte: 9,
  inspringLinks: 22,
};

/**
 * De blokken als HTML — gebruikt door het afdrukvenster (Afdrukken / PDF). `esc` escapet tekst;
 * die geven we mee zodat de aanroeper geen tweede kopie hoeft te hebben.
 */
export function blokkenNaarHtml(blokken, esc) {
  const uit = [];
  for (const b of blokken || []) {
    switch (b.type) {
      case "titel": uit.push(`<h1 class="titel">${esc(b.tekst)}</h1>`); break;
      case "kop": uit.push(`<h2>${esc(b.tekst)}</h2>`); break;
      case "kopje": uit.push(`<h3>${esc(b.tekst)}</h3>`); break;
      case "midden": uit.push(`<p class="midden">${esc(b.tekst)}</p>`); break;
      case "lijn": uit.push(`<hr>`); break;
      case "punt": uit.push(`<div class="punt"><span class="merk">${esc(b.merk)}</span><span>${esc(b.tekst)}</span></div>`); break;
      case "inspring": uit.push(`<p class="inspring">${esc(b.tekst)}</p>`); break;
      case "ondertekening":
        uit.push(
          // Geen "[Handtekening]"-tekst; de lege ondertekenruimte blijft wel staan (.ondertekenlabel
          // houdt alleen nog de hoogte vast), zodat er in het afgedrukte stuk plek is om te tekenen.
          // De ondertekenlijn is een doorgetrokken streep (border), geen rij puntjes.
          `<div class="onderteken"><div class="ondertekenlabel">&nbsp;</div>` +
          `<div class="streep"></div>` +
          (b.naam ? `<div class="ondertekennaam">${esc(b.naam)}</div>` : "") +
          (b.namens ? `<div class="ondertekennamens">handelend namens ${esc(b.namens)}</div>` : "") +
          (b.functie ? `<div class="ondertekenfunctie">${esc(b.functie)}</div>` : "") +
          `</div>`,
        );
        break;
      case "handtekening":
        uit.push(
          `<div class="hand">${b.namen
            .map((n) => `<div class="handkolom"><div class="lijntje"></div><div class="handnaam">${esc(n)}</div></div>`)
            .join("")}</div>`,
        );
        break;
      default: uit.push(`<p${b.naPunt ? ' class="na-punt"' : ""}>${esc(b.tekst).replace(/\n/g, "<br>")}</p>`);
    }
  }
  return uit.join("");
}

/** De bijbehorende stylesheet voor het afdrukvenster (A4, zelfde verhoudingen als op het scherm). */
export const AFDRUK_CSS = `
@page { size: A4; margin: 20mm }
body { font-family: Helvetica, Arial, sans-serif; color: #1C2321; font-size: 11pt; line-height: 1.55 }
h1.titel { font-size: 18pt; font-weight: 700; text-align: center; margin: 0 0 2px }
h2 { font-size: 12.5pt; font-weight: 700; margin: 14px 0 4px }
h3 { font-size: 11pt; font-weight: 700; margin: 12px 0 3px }
p { margin: 0 0 9px }
p.na-punt { margin-top: 9px }
p.midden { text-align: center; margin: 0 0 4px }
p.inspring { margin: 0 0 9px 22px }
hr { border: none; border-top: 1px solid #1C2321; margin: 14px 0 }
.punt { display: flex; gap: 8px; margin: 0 0 5px 10px }
.punt .merk { flex: 0 0 auto; min-width: 18px }
.onderteken { margin-top: 34px; page-break-inside: avoid }
.ondertekenlabel { color: #8A9089; font-size: 9.5pt; margin-bottom: 18px }
.streep { width: 62mm; border-bottom: 0.4pt solid #1C2321 }
.stippel { letter-spacing: 0.5px }
.ondertekennaam { margin-top: 4px }
.ondertekennamens { font-size: 10pt }
.ondertekenfunctie { font-size: 10pt }
.hand { display: flex; gap: 40px; margin-top: 46px; page-break-inside: avoid }
.handkolom { flex: 1 1 0; min-width: 0 }
.lijntje { border-bottom: 1px solid #1C2321; height: 34px }
.handnaam { font-size: 10pt; margin-top: 4px }
.kop-klant { font-size: 13pt; font-weight: 700; margin: 0 0 2px }
.kop-sub { color: #5B6259; font-size: 10pt; margin-bottom: 24px }
`;
