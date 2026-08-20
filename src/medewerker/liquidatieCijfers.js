/**
 * De cijfers van het ontbindingsrapport: balans (activa/passiva) en resultatenrekening.
 *
 * Eén plek waar vastligt wélke regels er zijn, in welke volgorde ze staan, en welke regels een
 * TOTAAL zijn dat uit de andere volgt. Zo tellen het opstelscherm, de PDF en het dossier in Dynamics
 * gegarandeerd hetzelfde op — een totaal wordt nooit door de gebruiker ingetikt en dus ook nooit
 * "vergeten bij te werken".
 *
 * LET OP: `api/_gedeeld/liquidatieCijfers.js` is de spiegel van dit bestand voor de server
 * (CommonJS i.p.v. ESM). Wijzig je hier een regel of een formule, wijzig 'm daar dan mee.
 */

// Elke regel: sleutel (= catalogussleutel én Dynamics-kolom zonder cr283_), label zoals in het
// rapport, en of het een berekend totaal is. `zwaar` markeert de regels die vet gedrukt horen.
export const BALANS_ACTIVA = [
  { sleutel: "imva", label: "Immateriële vaste activa" },
  { sleutel: "mva", label: "Materiële vaste activa" },
  { sleutel: "fva", label: "Financiële vaste activa" },
  { sleutel: "voorraden", label: "Voorraden" },
  { sleutel: "vorderingen", label: "Vorderingen" },
  { sleutel: "liquidemiddelen", label: "Liquide middelen" },
  { sleutel: "totaalactiva", label: "Totaal", berekend: true, zwaar: true },
];

export const BALANS_PASSIVA = [
  { sleutel: "aandelenkapitaal", label: "Aandelenkapitaal" },
  { sleutel: "overigereserve", label: "Overige reserves" },
  { sleutel: "langlopendeschulden", label: "Langlopende schulden" },
  { sleutel: "kortlopendeschulden", label: "Kortlopende schulden" },
  { sleutel: "totaalpassiva", label: "Totaal", berekend: true, zwaar: true },
];

export const RESULTAAT = [
  { sleutel: "omzet", label: "Omzet" },
  { sleutel: "kostprijsvandeomzet", label: "Kostprijs van de omzet" },
  { sleutel: "brutomarge", label: "Bruto marge", berekend: true, zwaar: true },
  { sleutel: "overigebedrijfskosten", label: "Overige bedrijfskosten" },
  { sleutel: "bedrijfsresultaat", label: "Bedrijfsresultaat", berekend: true, zwaar: true },
  { sleutel: "financielebatenenlasten", label: "Financiële baten en lasten" },
  { sleutel: "belastingen", label: "Belastingen" },
  { sleutel: "resultaatnabelastingen", label: "Resultaat na belasting", berekend: true, zwaar: true },
];

/** Alle regels samen, in rapportvolgorde. */
export const ALLE_REGELS = [...BALANS_ACTIVA, ...BALANS_PASSIVA, ...RESULTAAT];
/** Alleen wat je zelf intikt — de rest rekenen we uit. */
export const INVULSLEUTELS = ALLE_REGELS.filter((r) => !r.berekend).map((r) => r.sleutel);
export const TOTAALSLEUTELS = ALLE_REGELS.filter((r) => r.berekend).map((r) => r.sleutel);

/**
 * Eén bedrag als getal. Accepteert wat er in de praktijk ingetikt wordt: "€ 100.000",
 * "100.000,50", "1234", een leeg veld (= 0) en een negatief bedrag met een gewoon minteken.
 * Punten worden alleen als duizendtalscheiding weggehaald als ze ook echt zo staan (drie cijfers
 * erachter); "1.5" blijft dus 1,5 en wordt geen 15.
 */
export function getal(waarde) {
  if (typeof waarde === "number") return Number.isFinite(waarde) ? waarde : 0;
  const tekst = String(waarde == null ? "" : waarde).replace(/[€\s]/g, "").trim();
  if (!tekst) return 0;
  const genormaliseerd = tekst.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(genormaliseerd);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Vult de totalen aan op basis van de ingevulde regels. Geeft een NIEUW object terug met alle
 * sleutels als getal, dus zowel wat je intikte als wat eruit volgt:
 *
 *   Totaal activa  = IMVA + MVA + FVA + voorraden + vorderingen + liquide middelen
 *   Totaal passiva = aandelenkapitaal + overige reserves + langlopende + kortlopende schulden
 *   Bruto marge    = omzet − kostprijs van de omzet
 *   Bedrijfsresultaat = bruto marge − overige bedrijfskosten
 *   Resultaat na belasting = bedrijfsresultaat + financiële baten en lasten − belastingen
 */
export function berekenCijfers(ruw) {
  const bron = ruw && typeof ruw === "object" ? ruw : {};
  const uit = {};
  for (const sleutel of INVULSLEUTELS) uit[sleutel] = getal(bron[sleutel]);

  uit.totaalactiva = uit.imva + uit.mva + uit.fva + uit.voorraden + uit.vorderingen + uit.liquidemiddelen;
  uit.totaalpassiva = uit.aandelenkapitaal + uit.overigereserve + uit.langlopendeschulden + uit.kortlopendeschulden;
  uit.brutomarge = uit.omzet - uit.kostprijsvandeomzet;
  uit.bedrijfsresultaat = uit.brutomarge - uit.overigebedrijfskosten;
  uit.resultaatnabelastingen = uit.bedrijfsresultaat + uit.financielebatenenlasten - uit.belastingen;
  return uit;
}

/**
 * Klopt de balans? Activa en passiva horen gelijk te zijn. We blokkeren daar niets op — een
 * concept mag nog niet sluiten — maar het scherm laat het wél zien, want een ontbindingsrapport
 * met een scheve balans wil je niet naar de cliënt sturen.
 */
export function balansVerschil(cijfers) {
  const c = berekenCijfers(cijfers);
  return c.totaalactiva - c.totaalpassiva;
}

/** Bedrag als "€ 100.000" / "€ -2.500" — zoals het in het rapport hoort te staan. */
export function bedragTekst(waarde) {
  const n = getal(waarde);
  return "€ " + n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

/** Zijn er überhaupt cijfers ingevuld? Zo niet, dan slaan we het cijferdeel in het stuk over. */
export function heeftCijfers(ruw) {
  const bron = ruw && typeof ruw === "object" ? ruw : {};
  return INVULSLEUTELS.some((s) => getal(bron[s]) !== 0);
}
