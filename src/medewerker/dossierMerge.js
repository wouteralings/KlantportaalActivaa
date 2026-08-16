/**
 * Merge-velden voor de voorbeelddocumenten (notulen & dividenduitkering): {{sleutel}} in een sjabloon
 * omzetten naar de waarde uit een dossier. Gedeeld door het dossiervoorbeeld in MedewerkerPortaal.jsx
 * en door "Notulen opstellen" (src/medewerker/klanten/NotulenOpstellen.jsx), zodat een sjabloon in
 * beide schermen exact hetzelfde wordt ingevuld.
 */

/** Zelfde sleutel-normalisatie als de Brieven-merge (vulIn): kleine letters, alleen a-z0-9. */
export function normaliseerSleutel(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }

/**
 * Vervangt {{sleutel}} door de bijbehorende waarde. Is er geen waarde (veld leeg, of het veld bestaat
 * niet bij deze soort), dan komt er een zichtbare INVULPLEK te staan — [NAAM], [BEDRAG] — in plaats
 * van niets. Zo oogt een voorbeeld nooit als een leeg vel en zie je meteen wat er nog ingevuld moet
 * worden, net als in de Word-modellen.
 *
 * Met {{sleutel|EIGEN LABEL}} bepaal je zelf wat er in die invulplek komt; laat je dat weg, dan wordt
 * het de sleutel in hoofdletters.
 */
export function vulSjabloonIn(tekst, waarden) {
  return String(tekst || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_, sleutel, label) => {
    const key = normaliseerSleutel(sleutel);
    const waarde = Object.prototype.hasOwnProperty.call(waarden, key) ? String(waarden[key] == null ? "" : waarden[key]).trim() : "";
    if (waarde) return waarde;
    const plek = (label && label.trim()) || String(sleutel).replace(/[_.-]+/g, " ").toUpperCase();
    return `[${plek}]`;
  });
}

/** Leesbare weergave van één dossierveld-waarde voor in het voorbeeld: ja/nee, keuzelijst-label,
 *  gekoppelde-relatienaam (lookup), nette datum en getallen met duizendtalscheiding. */
export function menselijkeVeldwaarde(veldDef, waarde, picklistOpties, lookupNamen) {
  if (waarde === null || waarde === undefined || waarde === "") return veldDef.type === "boolean" ? "Nee" : "";
  switch (veldDef.type) {
    case "boolean": return waarde ? "Ja" : "Nee";
    case "picklist": {
      const opts = (picklistOpties && picklistOpties[veldDef.key]) || [];
      const g = opts.find((o) => String(o.waarde) === String(waarde));
      return g ? g.label : String(waarde);
    }
    case "lookup": return (lookupNamen && lookupNamen[veldDef.key]) || "";
    case "datetime": {
      const d = new Date(waarde);
      return isNaN(d.getTime()) ? String(waarde) : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    }
    case "decimal": { const n = Number(waarde); return Number.isFinite(n) ? n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : String(waarde); }
    case "integer": { const n = Number(waarde); return Number.isFinite(n) ? n.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) : String(waarde); }
    default: return String(waarde);
  }
}

/** Bouwt de merge-waarden-map ({{sleutel}} → leesbare waarde) uit één dossier. Los gehouden zodat
 *  zowel de schermweergave als de afdruk-functie ermee kunnen invullen. */
export function bouwMergeWaarden({ dossier, periodeTekst, catalogus, veldenState, picklistOpties, lookupNamen }) {
  const mergeWaarden = {};
  const zet = (k, v) => { mergeWaarden[normaliseerSleutel(k)] = v == null ? "" : String(v); };
  zet("klantnaam", dossier.klantnaam);
  zet("groepsnaam", dossier.groepsnaam);
  zet("accountant", dossier.accountant);
  zet("assistent", dossier.assistent);
  zet("manager", dossier.manager && (dossier.manager.naam || dossier.manager));
  zet("periode", periodeTekst);
  zet("datum", new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }));
  for (const v of catalogus || []) {
    if (!v || !v.key || String(v.key).startsWith("__")) continue;
    zet(v.key, menselijkeVeldwaarde(v, veldenState[v.key], picklistOpties, lookupNamen));
  }
  return mergeWaarden;
}
