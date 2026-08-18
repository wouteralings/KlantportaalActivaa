/**
 * Welke dossiervelden als {{plaatshouder}} in de voorbeelddocumenten van een soort gebruikt mogen
 * worden. Per veld aan te vinken bij Beheer → Dossiers (het accolade-knopje op de veldregel); de
 * keuze staat in dossierIndeling.<soort>.mergevelden.
 *
 * Twee schermen moeten het hier over eens zijn — Beheer → Dossiers zet de vinkjes, Beheer → Notulen /
 * Dividend toont de chips — dus staat de regel op één plek in plaats van in beide bestanden.
 */

/**
 * De standaard, zolang er nog niets is aangevinkt: elk veld is een mergeveld, behalve de
 * aandeelhouder-kolommen. Die leveren los in een sjabloon alleen kale percentages zonder naam op (bij
 * notulen komen ze als één blok via {{aandeelhouders}}) en maakten de chiplijst onleesbaar. Velden met
 * "__" ervoor zijn interne, vaste velden en horen sowieso niet in de lijst.
 */
export function isStandaardMergeveld(key) {
  const k = String(key || "");
  if (!k || k.startsWith("__")) return false;
  return !/aandeelhouder/i.test(k);
}

/**
 * Is dit veld een mergeveld? `lijst` is dossierIndeling.<soort>.mergevelden: een array zodra er ooit
 * een vinkje is omgezet (dan is die lijst leidend en volledig), anders null/undefined → de standaard.
 */
export function isMergeveld(key, lijst) {
  const k = String(key || "");
  if (!k || k.startsWith("__")) return false;
  return Array.isArray(lijst) ? lijst.includes(k) : isStandaardMergeveld(k);
}

/**
 * De volledige mergeveld-lijst voor een catalogus, uitgaand van de standaard. Nodig op het moment dat
 * de eerste keer een vinkje wordt omgezet: vanaf dan leggen we álle velden expliciet vast, zodat een
 * later toegevoegd Dynamics-veld niet stilzwijgend meelift.
 */
export function standaardMergevelden(catalogus) {
  return (catalogus || [])
    .map((v) => (v && v.key ? String(v.key) : ""))
    .filter((k) => isStandaardMergeveld(k));
}
