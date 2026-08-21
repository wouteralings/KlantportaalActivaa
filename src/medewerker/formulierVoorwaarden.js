/**
 * Voorwaardelijke velden: een veld alleen vragen als een eerdere vraag een bepaald antwoord heeft.
 *
 * Papieren formulieren zitten vol met sprongen — "Nee. Ga verder met vraag 3e", "Ja. Ga verder met
 * vraag 1d". Wie het formulier invult slaat dan een heel blok over. In Beheer koppel je zo'n blok
 * aan de vraag die erover beslist; hier staat wat die koppeling betekent.
 *
 * De voorwaarde staat bij het veld dat je wilt verbergen, niet bij de vraag die stuurt:
 *
 *   instellingen["1.3"] = { toonAls: { veld: "1.0", opties: [1] } }
 *   → "vraag 1d alleen stellen als vraag 1a op optie 1 (Nee) staat"
 *
 * Twee dingen die hieruit volgen en waar dit bestand voor bestaat:
 *
 *   1. Wat niet gevraagd is, hoort niet op papier. Verandert het antwoord op de stuurvraag, dan
 *      verdwijnt het blok uit beeld én blijven die vakjes leeg — ook als er eerder iets in stond.
 *      Daarom rekent zowel het invulscherm als de PDF-vuller met dezelfde functie.
 *   2. Het werkt door. Hangt de stuurvraag zelf aan een voorwaarde die niet klopt, dan is alles
 *      eronder ook weg. Anders zou een blok terugkomen in een tak die je helemaal niet volgt.
 *
 * Dit bestand is de ESM-tweeling van api/_gedeeld/formulierVoorwaarden.js. Wijzig ze samen.
 */

/** Is de voorwaarde van dit veld vervuld? Zonder voorwaarde: altijd. */
export function voldoetAanVoorwaarde(eigen, antwoorden) {
  const voorwaarde = eigen && eigen.toonAls;
  if (!voorwaarde || !voorwaarde.veld) return true;
  const opties = (Array.isArray(voorwaarde.opties) ? voorwaarde.opties : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  // Half ingestelde voorwaarde (wel een stuurvraag, nog geen antwoord aangevinkt): dan liever tonen
  // dan verbergen. Een vraag die per ongeluk verdwijnt is erger dan een die te veel gesteld wordt.
  if (!opties.length) return true;

  const antwoord = (antwoorden || {})[voorwaarde.veld];
  // Een aankruisvak: aangevinkt telt als optie 0.
  if (antwoord === true) return opties.includes(0);
  if (antwoord === false) return false;
  // Let op: Number("") is 0 en 0 is een geldige optie-index. Leeg is "nog niet beantwoord" en mag
  // dus nooit als "eerste optie gekozen" gelden.
  if (antwoord === undefined || antwoord === null || antwoord === "") return false;
  const gekozen = Number(antwoord);
  return Number.isInteger(gekozen) && opties.includes(gekozen);
}

/**
 * De namen van de velden die op dit moment gevraagd mogen worden. Valt af:
 *   - wat de beheerder op verbergen heeft gezet
 *   - wat het formulier zelf invult (alleen-lezen velden; die lopen via `overnemenVan`)
 *   - wat achter een voorwaarde zit die nu niet klopt — of waarvan de stuurvraag zelf wegvalt
 */
export function zichtbareVeldnamen(velden, instellingen, antwoorden) {
  const lijst = Array.isArray(velden) ? velden : [];
  const cfg = (instellingen && typeof instellingen === "object") ? instellingen : {};
  const perNaam = new Map(lijst.map((v) => [v.naam, v]));

  /** Naar welk veld wijst de voorwaarde van dit veld? Leeg als er geen (bruikbare) voorwaarde is. */
  const stuurVan = (naam) => {
    const v = (cfg[naam] || {}).toonAls;
    return v && v.veld && perNaam.has(v.veld) ? v.veld : "";
  };

  // Voorwaarden die (via een omweg) naar zichzelf wijzen zijn een instelfout. Zulke velden houden we
  // zichtbaar: een kapotte instelling mag geen vragen laten verdwijnen zonder dat iemand het merkt.
  const inKring = new Set();
  for (const veld of lijst) {
    const gezien = new Set();
    let huidig = veld.naam;
    while (huidig && !gezien.has(huidig)) { gezien.add(huidig); huidig = stuurVan(huidig); }
    if (huidig) gezien.forEach((n) => inKring.add(n));
  }

  const bekend = new Map();
  function magGevraagd(naam) {
    if (bekend.has(naam)) return bekend.get(naam);
    const veld = perNaam.get(naam);
    const eigen = cfg[naam] || {};
    let ok = !!veld && !veld.automatisch && eigen.verborgen !== true;
    const stuur = inKring.has(naam) ? "" : stuurVan(naam);
    if (ok && stuur) {
      bekend.set(naam, ok); // voorlopige waarde; de keten hieronder is gegarandeerd kringloos
      ok = magGevraagd(stuur) && voldoetAanVoorwaarde(eigen, antwoorden);
    }
    bekend.set(naam, ok);
    return ok;
  }

  const uit = new Set();
  for (const veld of lijst) if (magGevraagd(veld.naam)) uit.add(veld.naam);
  return uit;
}

/** De velden die als stuurvraag kunnen dienen: alles waar een keuze uit te maken valt. */
export function stuurbareVelden(velden) {
  return (Array.isArray(velden) ? velden : []).filter(
    (v) => !v.automatisch && (v.soort === "keuze" || v.soort === "vink")
  );
}

/** De mogelijke antwoorden van een stuurvraag, als leesbare labels op index. */
export function antwoordLabels(veld) {
  if (!veld) return [];
  if (veld.soort === "vink") return ["Aangekruist"];
  return (veld.opties || []).map((o, i) => String(o || "").trim() || `Optie ${i + 1}`);
}

/**
 * Ziet deze waarde eruit als een rekeningnummer? Twee letters (het land), twee controlecijfers en
 * daarna nog tien tot dertig letters of cijfers — dat is de vorm van elk IBAN.
 *
 * We kijken naar de wáárde en niet naar de veldnaam of de tooltip. Dat scheelde een blunder: op het
 * formulier Opgaaf rekeningnummer heet het veld eronder "Het nieuwe IBAN rekeningnummer staat op
 * naam van", en op naam herkennen maakte van "Alings, W." dan "ALIN GSW".
 */
export function lijktOpIban(waarde) {
  const strak = String(waarde == null ? "" : waarde).toUpperCase().replace(/[\s.-]/g, "");
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(strak);
}

/**
 * Een rekeningnummer netjes op papier krijgen.
 *
 * Je tikt een IBAN in zoals je hem kent — "NL34 INGB 0100 9652 53". Staat het veld op papier als een
 * rij losse hokjes, dan telt elke spatie als een hokje en schuift het hele nummer scheef; daar moeten
 * de spaties dus juist uit, want de hokjes doen de groepering al. Is het een gewone schrijfregel, dan
 * zetten we de spaties er per vier tekens juist in — dat leest zoals een rekeningnummer hoort.
 */
export function ibanTekst(waarde, inHokjes) {
  const strak = String(waarde == null ? "" : waarde).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!strak) return "";
  if (inHokjes) return strak;
  return strak.replace(/(.{4})(?=.)/g, "$1 ");
}
