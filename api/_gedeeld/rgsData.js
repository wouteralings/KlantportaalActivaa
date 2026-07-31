/**
 * RGS 3.5-referentielijst (Referentie GrootboekSchema) voor de Rapportagemodule (W&V + Balans).
 *
 * BELANGRIJK: dit is een representatieve subset (de meest voorkomende hoofdrubrieken voor een
 * gewone MKB-klant), handmatig samengesteld — GEEN volledige RGS 3.5-export. Zodra de Exact
 * Online-koppeling er is (zie api/_gedeeld/exact.js, al klaar voor OAuth/tokens), wordt deze
 * lijst vervangen door de RGS-mapping die Exact per grootboekrekening meelevert
 * (GLAccount → RgsCode). Tot die tijd geeft genereerDemoSaldi() hieronder nette, in zichzelf
 * kloppende demo-cijfers (Activa = Passiva, Resultaat = Omzet - Kosten), zodat de interface
 * (klantportaal + beheerscherm) nu al volledig gebouwd en getest kan worden.
 *
 * Een beheerder kan per RGS-code een eigen naam en presentatievolgorde instellen (Beheer →
 * Rapportages → "RGS-namen en volgorde", zie api/rgs-instellingen.js) — dat overschrijft alleen
 * de PRESENTATIE (naam/volgorde), nooit de code zelf of de cijfers.
 *
 * rapportage: "wv" (winst-en-verliesrekening) | "balans"
 * categorie:  wv  → "omzet" | "kosten"
 *             balans → "activa" | "passiva"
 * groep:      subkop binnen de categorie, voor nette weergave (bijv. "Vaste activa").
 */
const RGS_REFERENTIE = [
  // --- W&V: Omzet -----------------------------------------------------
  { rgsCode: "WOmzNetOmzHan", standaardNaam: "Netto-omzet handel", rapportage: "wv", categorie: "omzet", groep: "Netto-omzet", standaardVolgorde: 10 },
  { rgsCode: "WOmzNetOmzDns", standaardNaam: "Netto-omzet diensten", rapportage: "wv", categorie: "omzet", groep: "Netto-omzet", standaardVolgorde: 20 },
  { rgsCode: "WOmzOvOpbOvOb", standaardNaam: "Overige bedrijfsopbrengsten", rapportage: "wv", categorie: "omzet", groep: "Overige opbrengsten", standaardVolgorde: 30 },
  { rgsCode: "WFinRtbRob", standaardNaam: "Rentebaten", rapportage: "wv", categorie: "omzet", groep: "Financiële baten", standaardVolgorde: 40 },

  // --- W&V: Kosten ------------------------------------------------------
  { rgsCode: "WKprInkWrdHan", standaardNaam: "Inkoopwaarde omzet", rapportage: "wv", categorie: "kosten", groep: "Kostprijs omzet", standaardVolgorde: 10 },
  { rgsCode: "WKprUitKst", standaardNaam: "Uitbesteed werk", rapportage: "wv", categorie: "kosten", groep: "Kostprijs omzet", standaardVolgorde: 20 },
  { rgsCode: "WPerLonSal", standaardNaam: "Lonen en salarissen", rapportage: "wv", categorie: "kosten", groep: "Personeelskosten", standaardVolgorde: 30 },
  { rgsCode: "WPerSocLsn", standaardNaam: "Sociale lasten", rapportage: "wv", categorie: "kosten", groep: "Personeelskosten", standaardVolgorde: 40 },
  { rgsCode: "WPerPenLsn", standaardNaam: "Pensioenlasten", rapportage: "wv", categorie: "kosten", groep: "Personeelskosten", standaardVolgorde: 50 },
  { rgsCode: "WAfsMvaAfs", standaardNaam: "Afschrijvingen materiële vaste activa", rapportage: "wv", categorie: "kosten", groep: "Afschrijvingen", standaardVolgorde: 60 },
  { rgsCode: "WAfsIvaAfs", standaardNaam: "Afschrijvingen immateriële vaste activa", rapportage: "wv", categorie: "kosten", groep: "Afschrijvingen", standaardVolgorde: 70 },
  { rgsCode: "WHuiHvsHur", standaardNaam: "Huisvestingskosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 80 },
  { rgsCode: "WVrkVrkKst", standaardNaam: "Verkoopkosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 90 },
  { rgsCode: "WAutAutKst", standaardNaam: "Autokosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 100 },
  { rgsCode: "WKanKanKst", standaardNaam: "Kantoorkosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 110 },
  { rgsCode: "WAlgAdvKst", standaardNaam: "Advieskosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 120 },
  { rgsCode: "WAlgVrzKst", standaardNaam: "Verzekeringskosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 130 },
  { rgsCode: "WAlgOvOvrKst", standaardNaam: "Overige algemene kosten", rapportage: "wv", categorie: "kosten", groep: "Overige bedrijfskosten", standaardVolgorde: 140 },
  { rgsCode: "WFinRlbRlb", standaardNaam: "Rentelasten", rapportage: "wv", categorie: "kosten", groep: "Financiële lasten", standaardVolgorde: 150 },
  { rgsCode: "WBelBelWinBep", standaardNaam: "Belastingen resultaat", rapportage: "wv", categorie: "kosten", groep: "Belastingen", standaardVolgorde: 160 },

  // --- Balans: Activa -----------------------------------------------------
  { rgsCode: "BIvaKpvKpv", standaardNaam: "Kosten van oprichting en uitgifte", rapportage: "balans", categorie: "activa", groep: "Immateriële vaste activa", standaardVolgorde: 10 },
  { rgsCode: "BIvaGdwGdw", standaardNaam: "Goodwill", rapportage: "balans", categorie: "activa", groep: "Immateriële vaste activa", standaardVolgorde: 20 },
  { rgsCode: "BMvaBegBeg", standaardNaam: "Bedrijfsgebouwen en -terreinen", rapportage: "balans", categorie: "activa", groep: "Materiële vaste activa", standaardVolgorde: 30 },
  { rgsCode: "BMvaMachInv", standaardNaam: "Machines en installaties", rapportage: "balans", categorie: "activa", groep: "Materiële vaste activa", standaardVolgorde: 40 },
  { rgsCode: "BMvaAvmAvm", standaardNaam: "Andere vaste bedrijfsmiddelen, inventaris en vervoermiddelen", rapportage: "balans", categorie: "activa", groep: "Materiële vaste activa", standaardVolgorde: 50 },
  { rgsCode: "BFvaDelDel", standaardNaam: "Deelnemingen", rapportage: "balans", categorie: "activa", groep: "Financiële vaste activa", standaardVolgorde: 60 },
  { rgsCode: "BVrdGrdHvp", standaardNaam: "Voorraad grond- en hulpstoffen", rapportage: "balans", categorie: "activa", groep: "Voorraden", standaardVolgorde: 70 },
  { rgsCode: "BVrdGrdHva", standaardNaam: "Voorraad handelsgoederen", rapportage: "balans", categorie: "activa", groep: "Voorraden", standaardVolgorde: 80 },
  { rgsCode: "BVorDebDeb", standaardNaam: "Handelsdebiteuren", rapportage: "balans", categorie: "activa", groep: "Vorderingen", standaardVolgorde: 90 },
  { rgsCode: "BVorBtwBtw", standaardNaam: "Te vorderen omzetbelasting", rapportage: "balans", categorie: "activa", groep: "Vorderingen", standaardVolgorde: 100 },
  { rgsCode: "BVorOvrOvr", standaardNaam: "Overige vorderingen en overlopende activa", rapportage: "balans", categorie: "activa", groep: "Vorderingen", standaardVolgorde: 110 },
  { rgsCode: "BLimBanBan", standaardNaam: "Banktegoeden", rapportage: "balans", categorie: "activa", groep: "Liquide middelen", standaardVolgorde: 120 },
  { rgsCode: "BLimKasKas", standaardNaam: "Kasmiddelen", rapportage: "balans", categorie: "activa", groep: "Liquide middelen", standaardVolgorde: 130 },

  // --- Balans: Passiva ------------------------------------------------------
  { rgsCode: "BEigGepKap", standaardNaam: "Geplaatst kapitaal", rapportage: "balans", categorie: "passiva", groep: "Eigen vermogen", standaardVolgorde: 10 },
  { rgsCode: "BEigAgpAgp", standaardNaam: "Agioreserve", rapportage: "balans", categorie: "passiva", groep: "Eigen vermogen", standaardVolgorde: 20 },
  { rgsCode: "BEigOvrRes", standaardNaam: "Overige reserves", rapportage: "balans", categorie: "passiva", groep: "Eigen vermogen", standaardVolgorde: 30 },
  { rgsCode: "BEigOfjOfj", standaardNaam: "Onverdeeld resultaat boekjaar", rapportage: "balans", categorie: "passiva", groep: "Eigen vermogen", standaardVolgorde: 40 },
  { rgsCode: "BVrzOvrVrz", standaardNaam: "Overige voorzieningen", rapportage: "balans", categorie: "passiva", groep: "Voorzieningen", standaardVolgorde: 50 },
  { rgsCode: "BLasKrdKrd", standaardNaam: "Schulden aan kredietinstellingen", rapportage: "balans", categorie: "passiva", groep: "Langlopende schulden", standaardVolgorde: 60 },
  { rgsCode: "BSchCrdCrd", standaardNaam: "Handelscrediteuren", rapportage: "balans", categorie: "passiva", groep: "Kortlopende schulden", standaardVolgorde: 70 },
  { rgsCode: "BSchBtwBtw", standaardNaam: "Te betalen omzetbelasting", rapportage: "balans", categorie: "passiva", groep: "Kortlopende schulden", standaardVolgorde: 80 },
  { rgsCode: "BSchLnhLnh", standaardNaam: "Loonheffing en sociale premies", rapportage: "balans", categorie: "passiva", groep: "Kortlopende schulden", standaardVolgorde: 90 },
  { rgsCode: "BSchVpbVpb", standaardNaam: "Te betalen vennootschapsbelasting", rapportage: "balans", categorie: "passiva", groep: "Kortlopende schulden", standaardVolgorde: 100 },
  { rgsCode: "BSchOvrOvr", standaardNaam: "Overige schulden en overlopende passiva", rapportage: "balans", categorie: "passiva", groep: "Kortlopende schulden", standaardVolgorde: 110 },
];

/** Simpele, deterministische string-hash (FNV-1a-achtig) — geen Math.random(), zodat demo-cijfers
 * stabiel blijven tussen aanroepen voor hetzelfde account+jaar+code (prettiger tijdens testen dan
 * elke keer wisselende bedragen). */
function hash(tekst) {
  let h = 2166136261;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Getal tussen [min, max] (inclusief), deterministisch afgeleid van seed. */
function seedGetal(seed, min, max) {
  const h = hash(seed);
  return min + (h % (max - min + 1));
}

/**
 * Genereert in zichzelf kloppende demo-saldi voor één klantaccount + jaar:
 *  - Balans: som(activa) === som(passiva) exact (laatste passivaregel vangt het afrondingsverschil op).
 *  - W&V: resultaat = omzet - kosten (het resultaat wordt ook als saldo van de passiva-eigenvermogen-
 *    regel "Onverdeeld resultaat boekjaar" gebruikt, zodat de twee rapportages logisch samenhangen).
 *
 * TODO (Exact-koppeling): dit wordt straks vervangen door een aanroep naar Exact Online (via
 * api/_gedeeld/exact.js → geldigToken()) die per grootboekrekening het werkelijke RGS-code +
 * saldo voor het gekozen jaar ophaalt (bijv. via de Exact "ReportingBalance"/"GLAccount"-API's,
 * gescoped op de Exact-"division" die bij dit klantaccount hoort — die koppeling accountId →
 * Exact-division moet dan nog worden vastgelegd, bijv. als extra veld in
 * rapportagesInstellingen.json of op de Dynamics-account).
 */
function genereerDemoSaldi(accountId, jaar) {
  const seedBasis = `${accountId}|${jaar}`;
  const saldi = {};

  const omzetRegels = RGS_REFERENTIE.filter((r) => r.rapportage === "wv" && r.categorie === "omzet");
  const kostenRegels = RGS_REFERENTIE.filter((r) => r.rapportage === "wv" && r.categorie === "kosten");
  const activaRegels = RGS_REFERENTIE.filter((r) => r.rapportage === "balans" && r.categorie === "activa");
  const passivaRegels = RGS_REFERENTIE.filter((r) => r.rapportage === "balans" && r.categorie === "passiva");

  let omzetTotaal = 0;
  for (const r of omzetRegels) {
    const bedrag = seedGetal(`${seedBasis}|${r.rgsCode}`, 5_000, 180_000);
    saldi[r.rgsCode] = bedrag;
    omzetTotaal += bedrag;
  }

  let kostenTotaal = 0;
  for (const r of kostenRegels) {
    // Kosten schalen mee met de omzet (grofweg 60-90% ervan verdeeld over de regels), zodat het
    // resultaat een plausibele marge overhoudt in plaats van willekeurig negatief te worden.
    const aandeel = seedGetal(`${seedBasis}|${r.rgsCode}`, 2, 14) / 100;
    const bedrag = Math.round(omzetTotaal * aandeel);
    saldi[r.rgsCode] = bedrag;
    kostenTotaal += bedrag;
  }
  const resultaat = omzetTotaal - kostenTotaal;

  let activaTotaal = 0;
  for (const r of activaRegels) {
    const bedrag = seedGetal(`${seedBasis}|${r.rgsCode}`, 1_000, 120_000);
    saldi[r.rgsCode] = bedrag;
    activaTotaal += bedrag;
  }

  // Passiva-regels naar rato verdelen zodat de som exact activaTotaal wordt — het eigen-vermogen-
  // resultaat ("Onverdeeld resultaat boekjaar") wordt daarbij vastgezet op het echte W&V-resultaat,
  // de rest van de passivaregels verdeelt het restant, en de laatste regel vangt het
  // afrondingsverschil op zodat de balans altijd exact klopt.
  const resultaatRegel = passivaRegels.find((r) => r.rgsCode === "BEigOfjOfj");
  if (resultaatRegel) saldi[resultaatRegel.rgsCode] = resultaat;
  const restRegels = passivaRegels.filter((r) => r.rgsCode !== "BEigOfjOfj");
  const restTotaal = activaTotaal - resultaat;
  const gewichten = restRegels.map((r) => seedGetal(`${seedBasis}|${r.rgsCode}|w`, 3, 20));
  const gewichtSom = gewichten.reduce((a, b) => a + b, 0) || 1;
  let toegewezen = 0;
  restRegels.forEach((r, i) => {
    const isLaatste = i === restRegels.length - 1;
    const bedrag = isLaatste ? restTotaal - toegewezen : Math.round((restTotaal * gewichten[i]) / gewichtSom);
    saldi[r.rgsCode] = bedrag;
    toegewezen += bedrag;
  });

  return { saldi, omzetTotaal, kostenTotaal, resultaat, activaTotaal, passivaTotaal: activaTotaal };
}

module.exports = { RGS_REFERENTIE, genereerDemoSaldi };
