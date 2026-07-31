/**
 * Demo-activaregister + lineaire afschrijvingsberekening voor de Bezittingenmodule.
 *
 * TODO (Exact Online): dit wordt vervangen door de echte activastaat/afschrijvingsstaat uit
 * Exact Online (Asset-API, gescoped op de Exact-"division" van dit klantaccount — zelfde
 * openstaande koppelvraag als bij rgsData.js). Tot die tijd genereert genereerDemoBezittingen()
 * een stabiele, in zichzelf kloppende set demo-activa per klantaccount, zodat de interface
 * (klantportaal + beheerscherm) nu al volledig gebouwd en getest kan worden. De activagroepen
 * hieronder sluiten bewust aan op de "Materiële vaste activa"-groep uit rgsData.js, zodat
 * Rapportages en Bezittingen straks logisch op elkaar aansluiten.
 */
const GROEPEN = [
  { key: "computers", label: "Computers & Hardware", afschrijvingsduurMaanden: 36, restwaardePct: 0 },
  { key: "auto", label: "Auto's & Vervoermiddelen", afschrijvingsduurMaanden: 60, restwaardePct: 15 },
  { key: "inventaris", label: "Meubels & Inventaris", afschrijvingsduurMaanden: 120, restwaardePct: 0 },
  { key: "machines", label: "Machines & Installaties", afschrijvingsduurMaanden: 96, restwaardePct: 10 },
];

const OMSCHRIJVINGEN = {
  computers: ["Laptop Dell Latitude", "Werkstation iMac", "Serverkast + NAS", "Beeldschermenset (2x)"],
  auto: ["Bedrijfsauto Volkswagen Transporter", "Leaseauto Škoda Octavia", "Bestelbus Ford Transit"],
  inventaris: ["Bureaustoelen (per set)", "Vergadertafel + stoelen", "Kantoorindeling / meubilair", "Archiefkasten"],
  machines: ["Productiemachine", "Compressor installatie", "Verpakkingsmachine"],
};

function hash(tekst) {
  let h = 2166136261;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
function seedGetal(seed, min, max) {
  return min + (hash(seed) % (max - min + 1));
}

/** Bepaalt de boekwaarde van één bezitting op een gegeven peildatum (lineaire afschrijving,
 * nooit onder de restwaarde, nooit boven de aanschafwaarde vóór de aanschafdatum). */
function boekwaardeOpDatum(bezitting, peildatum) {
  const start = new Date(bezitting.aanschafdatum);
  if (peildatum < start) return bezitting.aanschafwaarde;
  const maandenVerstreken = (peildatum.getFullYear() - start.getFullYear()) * 12 + (peildatum.getMonth() - start.getMonth());
  const afTeSchrijven = bezitting.aanschafwaarde - bezitting.restwaarde;
  const perMaand = afTeSchrijven / bezitting.afschrijvingsduurMaanden;
  const afgeschreven = Math.min(afTeSchrijven, Math.max(0, maandenVerstreken) * perMaand);
  return Math.round((bezitting.aanschafwaarde - afgeschreven) * 100) / 100;
}

/** Afschrijving in één kalenderjaar (boekwaarde begin - boekwaarde eind van dat jaar). */
function afschrijvingInJaar(bezitting, jaar) {
  const beginJaar = boekwaardeOpDatum(bezitting, new Date(jaar, 0, 1));
  const eindJaar = boekwaardeOpDatum(bezitting, new Date(jaar, 11, 31));
  return { beginboekwaarde: beginJaar, afschrijving: Math.round((beginJaar - eindJaar) * 100) / 100, eindboekwaarde: eindJaar };
}

/** Genereert een stabiele set demo-activa voor dit klantaccount (8 stuks, verdeeld over de
 * groepen). Aanschafdatums liggen tussen 1 en 6 jaar geleden t.o.v. `nu`. */
function genereerDemoBezittingen(accountId, nu = new Date()) {
  const bezittingen = [];
  let volgnummer = 1;
  for (const groep of GROEPEN) {
    const namen = OMSCHRIJVINGEN[groep.key];
    const aantal = seedGetal(`${accountId}|${groep.key}|aantal`, 1, namen.length);
    for (let i = 0; i < aantal; i++) {
      const seed = `${accountId}|${groep.key}|${i}`;
      const jarenGeleden = seedGetal(`${seed}|jaren`, 1, 6);
      const maandOffset = seedGetal(`${seed}|maand`, 0, 11);
      const aanschafdatum = new Date(nu.getFullYear() - jarenGeleden, maandOffset, seedGetal(`${seed}|dag`, 1, 27));
      const aanschafwaarde = seedGetal(`${seed}|waarde`, 800, groep.key === "auto" ? 45000 : groep.key === "machines" ? 60000 : 12000);
      const restwaarde = Math.round(aanschafwaarde * (groep.restwaardePct / 100));
      const bezitting = {
        id: `${groep.key}-${volgnummer}`,
        omschrijving: namen[i % namen.length],
        groep: groep.key,
        groepLabel: groep.label,
        aanschafdatum: aanschafdatum.toISOString().slice(0, 10),
        aanschafwaarde,
        restwaarde,
        afschrijvingsduurMaanden: groep.afschrijvingsduurMaanden,
        afschrijvingsmethode: "lineair",
      };
      bezitting.boekwaardeNu = boekwaardeOpDatum(bezitting, nu);
      bezitting.volledigAfgeschreven = bezitting.boekwaardeNu <= bezitting.restwaarde + 0.01;
      bezittingen.push(bezitting);
      volgnummer++;
    }
  }
  return bezittingen;
}

module.exports = { GROEPEN, genereerDemoBezittingen, boekwaardeOpDatum, afschrijvingInJaar };
