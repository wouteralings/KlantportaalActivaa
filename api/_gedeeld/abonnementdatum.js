/**
 * Datumlogica voor de abonnementen op vaste uitvragen. Werkt met datum-strings YYYY-MM-DD (geen tijd),
 * zodat de dagelijkse verwerker deterministisch is ongeacht het tijdstip van de aanroep.
 */

function pad2(n) { return String(n).padStart(2, "0"); }
function naarISO(d) { return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
function parse(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Telt hele dagen op bij een datum-string. */
function voegDagenToe(iso, dagen) {
  const d = parse(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + Number(dagen || 0));
  return naarISO(d);
}

/** Telt maanden op met dag-clamping (31 jan + 1 maand → 28/29 feb). */
function voegMaandenToe(d, maanden) {
  const dag = d.getUTCDate();
  const res = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + maanden, 1));
  const laatsteDag = new Date(Date.UTC(res.getUTCFullYear(), res.getUTCMonth() + 1, 0)).getUTCDate();
  res.setUTCDate(Math.min(dag, laatsteDag));
  return res;
}

/** De eerstvolgende datum ná 'iso' volgens de frequentie. 'eenmalig' → null (geen herhaling). */
function volgende(iso, frequentie) {
  const d = parse(iso);
  if (!d) return null;
  switch (frequentie) {
    case "eenmalig": return null;
    case "wekelijks": { d.setUTCDate(d.getUTCDate() + 7); return naarISO(d); }
    case "maandelijks": return naarISO(voegMaandenToe(d, 1));
    case "kwartaal": return naarISO(voegMaandenToe(d, 3));
    case "halfjaarlijks": return naarISO(voegMaandenToe(d, 6));
    case "jaarlijks": return naarISO(voegMaandenToe(d, 12));
    default: return naarISO(voegMaandenToe(d, 12));
  }
}

/**
 * Bepaalt of er vandaag iets klaargezet moet worden en zo ja voor welke datum. Geeft de meest recente
 * vervallen periode ≤ vandaag terug (haalt in één keer in als er runs gemist zijn), of null.
 *   - nog niet gedraaid → de startdatum (mits ≤ vandaag)
 *   - eerder gedraaid   → de eerstvolgende periode ná de laatste run (mits ≤ vandaag)
 */
function bepaalDue(abonnement, vandaagISO) {
  if (!abonnement || abonnement.actief !== true) return null;
  const start = abonnement.startDatum;
  if (!parse(start) || !parse(vandaagISO)) return null;

  let due = abonnement.laatsteRun ? volgende(abonnement.laatsteRun, abonnement.frequentie) : start;
  if (!due || due > vandaagISO) return null;

  // Inhalen: schuif door tot de laatste periode die nog ≤ vandaag ligt.
  while (true) {
    const na = volgende(due, abonnement.frequentie);
    if (!na || na > vandaagISO) break;
    due = na;
  }
  return due;
}

/** Deadline = due-datum + zoveel dagen. Leeg bij 0/ontbrekend. */
function deadlineVan(dueISO, dagen) {
  if (!dueISO || !Number(dagen)) return "";
  return voegDagenToe(dueISO, dagen);
}

module.exports = { volgende, bepaalDue, deadlineVan, voegDagenToe, naarISO, parse };
