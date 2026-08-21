/**
 * Een zelf toegevoegd PDF-formulier invullen met de antwoorden uit het portaal.
 *
 * Werkt op elk invulbaar PDF-formulier: we zetten de waarden in de velden die bij het uploaden zijn
 * uitgelezen (zie _gedeeld/formulieren.js). Geen enkel formulier hoeft hiervoor geprogrammeerd te
 * worden — wat het formulier zelf meebrengt is genoeg.
 *
 * De velden blijven invulbaar (we maken de PDF niet plat), zodat je vlak voor het afdrukken nog kunt
 * bijstellen. Een handtekening zetten blijft handwerk; die kan een PDF-formulier niet voor je doen.
 */
const { PDFDocument, PDFName, PDFNumber, PDFBool } = require("pdf-lib");
const { zichtbareVeldnamen, lijktOpIban, ibanTekst } = require("./formulierVoorwaarden");

const VERBORGEN = 2; // /F bit 2 — zie _gedeeld/formulieren.js
const AFDRUKKEN = 4; // /F bit 3

/** dd-mm-jjjj-delen uit een ISO-datum of uit een al ingetikte datum. */
function datumDelen(waarde) {
  const t = String(waarde == null ? "" : waarde).trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { dag: iso[3], maand: iso[2], jaar: iso[1] };
  const nl = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (nl) return { dag: nl[1].padStart(2, "0"), maand: nl[2].padStart(2, "0"), jaar: nl[3] };
  return null;
}

/**
 * Een datumveld in de PDF hoeft geen datum te zijn: de meeste formulieren hebben er drie losse
 * hokjes van (dag, maand, jaar). Kiest de beheerder "datum" als soort, dan schrijven we een ISO-datum
 * weg als dd-mm-jjjj — dat is wat er op papier hoort te staan.
 */
function datumAlsTekst(waarde) {
  const delen = datumDelen(waarde);
  return delen ? `${delen.dag}-${delen.maand}-${delen.jaar}` : String(waarde == null ? "" : waarde);
}

/**
 * Een veld dat wij invullen moet ook op papier komen. Sommige formulieren zetten velden op
 * verborgen en laten hun eigen JavaScript ze pas tonen zodra je in Acrobat een vraag beantwoordt —
 * de IBAN-regels van de Belastingdienst doen dat. Dat script draait bij ons niet, dus zonder deze
 * ingreep vul je netjes een rekeningnummer in en komt het vel leeg uit de printer.
 */
function maakZichtbaar(veld) {
  if (!veld || !veld.acroField) return;
  for (const widget of veld.acroField.getWidgets()) {
    const huidig = widget.dict.get(PDFName.of("F"));
    const nu = huidig && typeof huidig.asNumber === "function" ? huidig.asNumber() : 0;
    widget.dict.set(PDFName.of("F"), PDFNumber.of((nu & ~VERBORGEN) | AFDRUKKEN));
  }
}

/**
 * Past de waarde aan de ruimte in het veld aan. Hokjesvelden hebben een maximum: postcode 6,
 * telefoonnummer 10, bsn 9. "7511 AA" is er één te lang en "06-12345678" één te veel — daar sloegen
 * we het veld vroeger stilzwijgend over, waarna er niets op papier stond. Nu halen we eerst de
 * scheidingstekens eruit (in de hokjes hoort toch geen spatie) en kappen pas daarna af.
 */
function pasInVeld(veld, tekst) {
  let max = 0;
  try { max = veld.getMaxLength() || 0; } catch { /* geen maximum */ }
  if (!max || tekst.length <= max) return tekst;
  const strak = tekst.replace(/[\s.\-/]/g, "");
  return strak.length <= max ? strak : strak.slice(0, max);
}

function zetTekst(form, naam, waarde) {
  let tekst = String(waarde == null ? "" : waarde);
  if (!tekst.trim()) return;
  const veld = form.getFieldMaybe(naam);
  if (!veld || typeof veld.setText !== "function") return;
  if (lijktOpIban(tekst)) {
    // Losse hokjes tellen een spatie als teken en dan schuift het hele nummer op; een gewone
    // schrijfregel leest juist prettiger mét spaties. Zie ibanTekst in formulierVoorwaarden.
    let hokjes = false;
    try { hokjes = !!veld.isCombed(); } catch { /* niet elk veld meldt dit */ }
    tekst = ibanTekst(tekst, hokjes);
  }
  try { veld.setText(pasInVeld(veld, tekst)); } catch { /* een raar teken mag de PDF niet slopen */ }
  maakZichtbaar(veld);
}

/** Een datum over drie losse hokjesvelden verdelen (dag, maand, jaar). */
function zetDatumDelen(form, delen, waarde) {
  const d = datumDelen(waarde);
  if (!d) return;
  zetTekst(form, delen.dag, d.dag);
  zetTekst(form, delen.maand, d.maand);
  zetTekst(form, delen.jaar, d.jaar);
}

/** Eén hokje aanzetten (en de rest uit), op index — zie de uitleg in _gedeeld/formulieren.js. */
function zetKeuze(form, naam, index) {
  const veld = form.getFieldMaybe(naam);
  if (!veld || !veld.acroField) return;
  // Een echte radiogroep kan gewoon op waarde gezet worden.
  if (veld.constructor.name === "PDFRadioGroup" && typeof veld.select === "function") {
    const opties = veld.getOptions() || [];
    if (index >= 0 && index < opties.length) {
      try { veld.select(opties[index]); maakZichtbaar(veld); } catch { /* val terug op de widgets */ }
    }
    return;
  }
  const widgets = veld.acroField.getWidgets();
  let gekozen = null;
  widgets.forEach((w, i) => {
    const aan = typeof w.getOnValue === "function" ? w.getOnValue() : null;
    if (i === index && aan) { w.dict.set(PDFName.of("AS"), aan); gekozen = aan; }
    else w.dict.set(PDFName.of("AS"), PDFName.of("Off"));
  });
  veld.acroField.dict.set(PDFName.of("V"), gekozen || PDFName.of("Off"));
  if (index >= 0) maakZichtbaar(veld);
}

function zetKeuzelijst(form, naam, waarde) {
  const veld = form.getFieldMaybe(naam);
  if (!veld || typeof veld.select !== "function") return;
  const tekst = String(waarde == null ? "" : waarde);
  if (!tekst) return;
  try { veld.select(tekst); maakZichtbaar(veld); } catch { /* waarde staat niet in de lijst */ }
}

/**
 * Vult het formulier. `velden` is de uitgelezen lijst uit de definitie, `instellingen` wat de
 * beheerder per veld heeft ingesteld (label, verbergen, soort), en `antwoorden` is veldnaam → waarde.
 *
 * Een veld dat niet gevraagd is wordt NIET gevuld, ook niet als er een oude waarde in de antwoorden
 * staat: wat je niet in beeld hebt gehad, hoort niet op papier te komen. Dat geldt voor velden die in
 * Beheer op verbergen staan én voor velden achter een voorwaarde die nu niet klopt — zet je vraag 1a
 * om van Nee naar Ja, dan blijft het blok dat aan "Nee" hing leeg.
 */
async function vulFormulier(pdfBuffer, { velden, instellingen, antwoorden }) {
  const doc = await PDFDocument.load(pdfBuffer);
  const form = doc.getForm();
  const cfg = instellingen && typeof instellingen === "object" ? instellingen : {};
  const a = antwoorden && typeof antwoorden === "object" ? antwoorden : {};

  const lijst = Array.isArray(velden) ? velden : [];
  // Welke vragen op dit moment gesteld worden — verbergen én de voorwaarden ("toon alleen als vraag
  // 1a op Nee staat") zitten hierin. Wat niet gevraagd is komt niet op papier, ook niet als er ooit
  // een waarde is ingetikt en de stuurvraag daarna is omgezet.
  const gevraagd = zichtbareVeldnamen(lijst, cfg, a);
  for (const veld of lijst) {
    const eigen = cfg[veld.naam] || {};
    if (!veld.automatisch && !gevraagd.has(veld.naam)) continue;
    // Een veld dat het formulier zelf zou invullen (alleen-lezen) krijgt zijn waarde van de vraag
    // die de beheerder eraan gekoppeld heeft — zo komt het bsn ook op de tweede pagina te staan.
    if (veld.automatisch) {
      const bronNaam = String(eigen.overnemenVan || "");
      // Is de vraag waarvan we overnemen zelf niet gesteld (verborgen of achter een voorwaarde die
      // niet klopt), dan valt hier ook niets over te nemen.
      if (!bronNaam || !gevraagd.has(bronNaam)) continue;
      const bronVeld = lijst.find((v) => v.naam === bronNaam);
      const overgenomen = a[bronNaam];
      zetTekst(form, veld.naam, bronVeld && bronVeld.soort === "datum" ? datumAlsTekst(overgenomen) : overgenomen);
      continue;
    }
    const waarde = a[veld.naam];
    const soort = eigen.soort || veld.soort;

    if (soort === "vink") {
      zetKeuze(form, veld.naam, waarde === true ? 0 : -1);
      continue;
    }
    if (soort === "keuze") {
      // Number("") is 0 en 0 is een geldige index: leeg mag nooit als "eerste optie" doorgaan.
      if (waarde === undefined || waarde === null || waarde === "") continue;
      const index = Number(waarde);
      if (!Number.isInteger(index) || index < 0) continue;
      zetKeuze(form, veld.naam, index);
      continue;
    }
    if (soort === "keuzelijst") {
      zetKeuzelijst(form, veld.naam, waarde);
      continue;
    }
    if (soort === "datum") {
      // Staat de datum op papier in drie hokjesvelden, dan verdelen we hem daarover; anders gaat
      // hij als dd-mm-jjjj in één veld.
      if (veld.delen && veld.delen.dag) zetDatumDelen(form, veld.delen, waarde);
      else zetTekst(form, veld.naam, datumAlsTekst(waarde));
      continue;
    }
    zetTekst(form, veld.naam, waarde);
  }

  vraagViewerOmOpnieuwTekenen(doc);
  return Buffer.from(await doc.save());
}

/**
 * Zet /NeedAppearances, zodat de PDF-lezer de velden zelf opnieuw tekent bij het openen.
 *
 * Zonder dit zie je op een hokjesveld eerst de tekst aan elkaar geplakt staan, en pas als je er één
 * keer in klikt springt hij netjes in de vakjes — de lezer tekent dan alsnog zelf, mét de
 * hokjes-instelling van het veld. De opmaak die wij meegeven kan dat niet nabootsen: pdf-lib schrijft
 * gewoon een regel tekst. We laten die opmaak wél staan als terugval voor lezers die deze vlag
 * negeren; daar staat de waarde dan leesbaar maar iets minder strak.
 */
function vraagViewerOmOpnieuwTekenen(doc) {
  try {
    const ref = doc.catalog.get(PDFName.of("AcroForm"));
    const acro = ref ? doc.context.lookup(ref) : null;
    if (acro && typeof acro.set === "function") acro.set(PDFName.of("NeedAppearances"), PDFBool.True);
  } catch {
    /* geen AcroForm in een vorm die we herkennen: dan valt er ook niets te hertekenen */
  }
}

/** Nette bestandsnaam: "<formulier> - <klant> - <datum>.pdf". */
function bestandsnaamVoor(formuliernaam, klantnaam, datum) {
  const schoon = (s) => String(s == null ? "" : s).replace(/[\\/:*?"<>|]/g, "-").trim();
  const delen = [schoon(formuliernaam), schoon(klantnaam), schoon(datum)].filter(Boolean);
  return `${delen.join(" - ").slice(0, 180) || "formulier"}.pdf`;
}

module.exports = { vulFormulier, bestandsnaamVoor, datumAlsTekst, datumDelen, pasInVeld };
