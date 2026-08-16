/**
 * Gedeelde berekening van de WERKVOORRAAD uit de planning: welke hoofdactiviteiten liggen er in een
 * bepaalde periode bij wie? Gebruikt door "Mijn werk" (MijnWerk.jsx, matrix + voortgang) en door
 * Planning → "Gepland vs geschreven" (PlanningGeplandVsGeschreven.jsx), zodat beide schermen
 * gegarandeerd dezelfde regels en dezelfde uren tellen.
 *
 * Bron is de per-klant planning-configuratie (`/api/mw-planning-config`); de uitvoerder volgt de
 * vaste toewijzing (`toegewezenAan`) en anders het TEAM van de klant — de rol die in Beheer → Planning
 * aan de activiteit hangt, opgezocht in de klantgegevens uit `/api/beheer-klanten`.
 */

export const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
export const MAAND_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");

/** De naam van de persoon in een bepaalde rol op de klant (uit /api/beheer-klanten). */
export function teamPersoon(klant, rol) {
  if (!klant || !rol) return "";
  switch (rol) {
    case "assistent": return klant.assistent?.naam || "";
    case "manager": return klant.manager?.naam || klant.relatiebeheerder || "";
    case "accountant": return klant.accountantPersoon?.naam || klant.accountant || "";
    case "fiscaal": return klant.fiscaalMedewerker?.naam || "";
    case "loonadministratie": return klant.loonadministratie?.naam || "";
    case "backup": return klant.backup?.naam || "";
    default: return "";
  }
}

/** Valt een maandactiviteit met deze frequentie in maand `maand1` (1-12)? */
export function valtInMaand(r, maand1) {
  if (r.frequentie === "maandelijks") return true;
  if (r.frequentie === "kwartaal") return [1, 4, 7, 10].includes(maand1);
  if (r.frequentie === "jaarlijks" || r.frequentie === "eenmalig") return Number(r.uitvoerMaand) === maand1;
  return false;
}

/**
 * De hoofdactiviteiten die in deze periode spelen, van IEDEREEN — per (klant × hoofdtaak) één regel.
 *
 *   type "maand" → alleen maandactiviteiten die in `maand` vallen (frequentie/uitvoermaand).
 *   type "jaar"  → alle jaaractiviteiten van `jaar`; filteren op de ingeplande maand doet de
 *                  aanroeper zelf (met `uitvoerMaand`), zodat de totalen over het hele jaar kloppen.
 *
 * Per regel komt de effectieve urencode en het effectieve aantal indicatie-uren mee: per klant
 * ingesteld, anders de standaard van de activiteit (Beheer → Planning). `indicatieUren` is bewust
 * `null` als er nergens uren staan — zo kan een scherm melden dat de planning nog niet compleet is.
 */
export function werkRegels({ config, activiteitById, klantenMap, type, jaar, maand }) {
  if (!config) return [];
  const seen = new Set();
  const rijen = [];
  for (const r of config) {
    if (r.actief === false) continue;
    const act = activiteitById[r.activiteit];
    if (!act || (act.type || "maand") !== type) continue;
    // "Vanaf" (maand/jaar) — per klant ingesteld: de activiteit telt voor deze klant pas vanaf dan mee.
    if (r.vanaf) {
      if (type === "maand") { if (`${jaar}-${pad(maand)}` < r.vanaf) continue; }
      else if (jaar < Number(String(r.vanaf).slice(0, 4))) continue;
    }
    if (type === "maand" && !valtInMaand(r, maand)) continue;
    const acc = String(r.klantAccountId || "").toLowerCase();
    const klant = (klantenMap && klantenMap[acc]) || null;
    const wie = (r.toegewezenAan || "").trim() || teamPersoon(klant, act.rol);
    const dubbelKey = `${acc}|${act.sleutel}`;
    if (seen.has(dubbelKey)) continue;
    seen.add(dubbelKey);
    rijen.push({
      key: dubbelKey,
      acc,
      accountId: klant?.accountId || r.klantAccountId || "",
      actSleutel: act.sleutel,
      act,
      regel: r,
      uitvoerMaand: r.uitvoerMaand,
      wie: String(wie || "").trim(),
      wieLc: String(wie || "").trim().toLowerCase(),
      urencode: (r.urencode || "").trim() || act.standaardUrencode || "",
      indicatieUren: r.indicatieUren != null ? r.indicatieUren : (act.standaardUren != null ? act.standaardUren : null),
      klantnaam: klant?.klantnaam || "Onbekende klant",
      klantnummer: klant?.klantnummer || "",
      klantgroep: klant?.groepsnaam || "",
    });
  }
  return rijen;
}
