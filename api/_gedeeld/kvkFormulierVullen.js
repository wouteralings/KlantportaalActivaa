/**
 * Het blanco KvK-formulier 17a vullen met de antwoorden uit het portaal.
 *
 * Het formulier is een echt invulbaar PDF-formulier (AcroForm), dus we typen niets over: we zetten
 * de waarden in de bestaande velden. Wat er níét in kan is de handtekening — die moet met pen, geen
 * kopie of scan. Vandaar de opzet: digitaal invullen, afdrukken, ondertekenen.
 *
 * Aankruisvelden kiezen we op INDEX en niet op naam. De namen in dit formulier bevatten escapes en
 * verminkte tekens (een hokje heet bijvoorbeeld "be#91indiging van de onderneming vond al eerder
 * plaats"); daarop matchen is vragen om problemen. De volgorde van de hokjes in de PDF is dezelfde
 * als de volgorde op papier, en die staat als `opties` in _gedeeld/kvkFormulier17a.js.
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFBool } = require("pdf-lib");
const { alleVragen, toonVraag, GESPLITSTE_KEUZES } = require("./kvkFormulier17a");

const BLANCO = path.join(__dirname, "formulieren", "kvk-formulier-17a.pdf");

/** dd-mm-jjjj uit een ISO-datum (of uit een al ingetikte dd-mm-jjjj). Leeg → lege delen. */
function datumDelen(waarde) {
  const t = String(waarde == null ? "" : waarde).trim();
  if (!t) return { dag: "", maand: "", jaar: "" };
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { dag: iso[3], maand: iso[2], jaar: iso[1] };
  const nl = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (nl) return { dag: nl[1].padStart(2, "0"), maand: nl[2].padStart(2, "0"), jaar: nl[3] };
  return { dag: "", maand: "", jaar: "" };
}

/** Eén tekstveld vullen. Onbekende velden slaan we stil over — nooit de hele PDF laten mislukken. */
function zetTekst(form, naam, waarde) {
  const tekst = String(waarde == null ? "" : waarde);
  if (!tekst.trim()) return;
  const veld = form.getFieldMaybe(naam);
  if (!veld || typeof veld.setText !== "function") return;
  try {
    veld.setText(tekst);
  } catch {
    /* een te lange waarde of een raar teken mag het formulier niet slopen */
  }
}

/**
 * Eén hokje van een aankruisveld aanzetten (en de rest uit). `index` telt de hokjes zoals ze op
 * papier onder elkaar staan.
 */
function zetKeuze(form, naam, index) {
  const veld = form.getFieldMaybe(naam);
  if (!veld || !veld.acroField) return;
  const widgets = veld.acroField.getWidgets();
  let gekozen = null;
  widgets.forEach((w, i) => {
    const aan = typeof w.getOnValue === "function" ? w.getOnValue() : null;
    if (i === index && aan) {
      w.dict.set(PDFName.of("AS"), aan);
      gekozen = aan;
    } else {
      w.dict.set(PDFName.of("AS"), PDFName.of("Off"));
    }
  });
  veld.acroField.dict.set(PDFName.of("V"), gekozen || PDFName.of("Off"));
}

/** Een los vinkje aan of uit (vraag 3.3: vereffenaar is persoon én/of organisatie). */
function zetVink(form, naam, aan) {
  zetKeuze(form, naam, aan ? 0 : -1);
}

/**
 * Vult het formulier en geeft de PDF terug als Buffer.
 *
 * Alleen ZICHTBARE vragen worden ingevuld: kruis je bij 3.1 "geen baten" aan, dan blijven de velden
 * van de vereffenaar leeg, ook als daar eerder iets is ingetikt. Anders zou een antwoord dat je
 * onderweg hebt herroepen alsnog op papier belanden.
 *
 * De velden blijven invulbaar (we maken het formulier niet plat), zodat je op het scherm of met de
 * hand nog kunt bijstellen voordat je afdrukt.
 */
async function vulFormulier17a(antwoorden) {
  const a = antwoorden || {};
  const doc = await PDFDocument.load(fs.readFileSync(BLANCO));
  const form = doc.getForm();

  for (const vraag of alleVragen()) {
    if (!toonVraag(vraag, a)) continue;
    const waarde = a[vraag.id];

    if (vraag.type === "datum") {
      const { dag, maand, jaar } = datumDelen(waarde);
      zetTekst(form, `${vraag.pdf}_datumdag`, dag);
      zetTekst(form, `${vraag.pdf}_datummaand`, maand);
      zetTekst(form, `${vraag.pdf}_datumjaar`, jaar);
      continue;
    }

    if (vraag.type === "vink") {
      zetVink(form, vraag.pdf, waarde === true);
      continue;
    }

    if (vraag.type === "keuze") {
      // Let op: Number("") is 0, en 0 is een geldige optie-index. Zonder deze controle zou een vraag
      // die je hebt leeggelaten of weer uitgeklikt stilletjes het EERSTE hokje aankruisen — en dan
      // meldt het formulier bijvoorbeeld "geen baten" terwijl je dat nooit hebt aangegeven.
      if (waarde === undefined || waarde === null || waarde === "") continue;
      const keuze = Number(waarde);
      if (!Number.isInteger(keuze) || keuze < 0) continue;
      // Vraag 5.3 zit in de PDF als twee losse velden; die krijgen elk hun eigen behandeling.
      const gesplitst = GESPLITSTE_KEUZES[vraag.pdf];
      if (gesplitst) {
        gesplitst.forEach((doel, i) => zetKeuze(form, doel.pdf, i === keuze ? doel.index : -1));
        continue;
      }
      zetKeuze(form, vraag.pdf, keuze);
      continue;
    }

    zetTekst(form, vraag.pdf, waarde);
  }

  // Laat de PDF-lezer de velden zelf opnieuw tekenen; zie de uitleg bij dezelfde ingreep in
  // _gedeeld/formulierVullen.js. Zonder dit staan hokjesvelden aan elkaar geplakt tot je erin klikt.
  try {
    const acroRef = doc.catalog.get(PDFName.of("AcroForm"));
    const acro = acroRef ? doc.context.lookup(acroRef) : null;
    if (acro && typeof acro.set === "function") acro.set(PDFName.of("NeedAppearances"), PDFBool.True);
  } catch { /* geen herkenbare AcroForm */ }
  return Buffer.from(await doc.save());
}

/** Nette bestandsnaam: "KvK 17a - <klant> - <datum>.pdf". */
function bestandsnaamVoor(klantnaam, datum) {
  const schoon = (s) => String(s == null ? "" : s).replace(/[\\/:*?"<>|]/g, "-").trim();
  const delen = ["KvK 17a", schoon(klantnaam), schoon(datum)].filter(Boolean);
  return `${delen.join(" - ").slice(0, 180)}.pdf`;
}

module.exports = { vulFormulier17a, bestandsnaamVoor, datumDelen };
