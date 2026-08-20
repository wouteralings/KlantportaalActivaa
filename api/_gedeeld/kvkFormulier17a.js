/**
 * KvK-formulier 17a — "Ontbinding melden van een rechtspersoon".
 *
 * Dit bestand beschrijft het formulier één keer: welke vragen erin staan, in welke volgorde, wanneer
 * een vraag wel of niet getoond wordt (de "ga naar"-verwijzingen uit het formulier), waar het
 * antwoord vandaan mag komen als we het al weten, en in welk PDF-veld het terechtkomt.
 *
 * Zo staat er maar één waarheid: het opstelscherm bouwt de vragenlijst hieruit op en de server vult
 * er de PDF mee. Verandert KvK het formulier, dan pas je dit bestand aan (en het blanco formulier in
 * _gedeeld/formulieren/) — nergens anders.
 *
 * LET OP: `src/medewerker/kvkFormulier17a.js` is de spiegel hiervan voor de browser (ESM i.p.v.
 * CommonJS). Wijzig je hier iets, wijzig het daar mee.
 *
 * Veldsoorten:
 *   tekst   → één PDF-tekstveld (`pdf`)
 *   memo    → idem, maar met een groter invoervak (adressen)
 *   datum   → drie PDF-velden (dag/maand/jaar); `pdf` is de basisnaam, wij plakken er
 *             _datumdag/_datummaand/_datumjaar achter
 *   keuze   → een aankruisveld met meerdere hokjes. `opties` staat in dezelfde volgorde als de
 *             hokjes in de PDF; we kiezen op INDEX en niet op naam, want de namen in het PDF-veld
 *             bevatten escapes en verminkte tekens (bijv. "be#91indiging") waar je niet op wilt matchen.
 *   keuzes  → meerdere losse aankruisvelden die tegelijk aan mogen staan (vraag 3.3).
 */

/** Prefill-sleutels: waar een antwoord vandaan komt als we het al weten. */
const BRON = {
  KLANTNAAM: "klantnaam",
  VESTIGINGSPLAATS: "vestigingsplaats",
  KVK: "kvknummer",
  DATUM_ONTBINDING: "datumontbinding",
  BEWAARDER: "bewaarder",
  ONDERTEKENAAR: "ondertekenaar",
  EMAIL: "email",
  TELEFOON: "telefoon",
  VANDAAG: "vandaag",
};

/** Heeft de rechtspersoon baten? Bij "nee" is het een turboliquidatie en slaan we 3.2 t/m 3.6 over. */
const heeftBaten = (a) => a["3.1"] === 1;
/** Zijn alle bestuursleden vereffenaar? Zo ja: door naar 5 (geen aparte vereffenaarsgegevens). */
const apartVereffenaar = (a) => heeftBaten(a) && a["3.2"] === 1;
const vereffenaarPersoon = (a) => apartVereffenaar(a) && a["3.3_persoon"] === true;
const vereffenaarOrg = (a) => apartVereffenaar(a) && a["3.3_org"] === true;
const vereffenaarNL = (a) => vereffenaarOrg(a) && a["3.5"] === 1;
const vereffenaarBuitenland = (a) => vereffenaarOrg(a) && a["3.5"] === 0;
const bewaarderPersoon = (a) => a["4.1"] === 0;
const bewaarderOrg = (a) => a["4.1"] === 1;
const bewaarderNL = (a) => bewaarderOrg(a) && a["4.2"] === 0;
const bewaarderBuitenland = (a) => bewaarderOrg(a) && a["4.2"] === 1;
const heeftOnderneming = (a) => a["5.1"] === 1;
const ondernemingBeeindigd = (a) => heeftOnderneming(a) && a["5.2"] === 1;
const ondernemingOvergedragen = (a) => heeftOnderneming(a) && a["5.2"] === 0;
const eerderBeeindigd = (a) => ondernemingBeeindigd(a) && a["5.2.2"] === 1;
const overnemerInHR = (a) => ondernemingOvergedragen(a) && a["5.3"] === 1;
const overnemerNietInHR = (a) => ondernemingOvergedragen(a) && a["5.3"] === 0;

const SECTIES = [
  {
    sleutel: "1",
    titel: "1 · Gegevens van de rechtspersoon",
    vragen: [
      { id: "1.1.1", type: "tekst", vraag: "Naam van de rechtspersoon", pdf: "1.1.1_naam", bron: BRON.KLANTNAAM, verplicht: true },
      { id: "1.1.2", type: "tekst", vraag: "Vestigingsplaats", pdf: "1.1.2_vestigingsplaats", bron: BRON.VESTIGINGSPLAATS, verplicht: true },
      { id: "1.1.3", type: "tekst", vraag: "KVK-nummer", pdf: "1.1.3_KVK", bron: BRON.KVK, verplicht: true },
    ],
  },
  {
    sleutel: "2",
    titel: "2 · Ontbinding",
    vragen: [
      {
        id: "2.1.1", type: "datum", vraag: "Datum van ontbinding", pdf: "2.1.1", bron: BRON.DATUM_ONTBINDING, verplicht: true,
        hulp: "Een datum vóór het ontbindingsbesluit mag niet van de wet.",
      },
    ],
  },
  {
    sleutel: "3",
    titel: "3 · Vereffening of turboliquidatie",
    vragen: [
      {
        id: "3.1", type: "keuze", vraag: "Heeft de rechtspersoon op het moment van ontbinding baten?",
        pdf: "3.1.1_baten", opties: ["Nee — turboliquidatie", "Ja"], verplicht: true,
        hulp: "Baten zijn niet alleen geld: ook vorderingen, voorraad, inventaris en laptops tellen mee.",
      },
      { id: "3.1.2", type: "memo", vraag: "Postadres waarop de rechtspersoon tijdens de vereffening bereikbaar is", pdf: "3.1.2_adres", toon: heeftBaten, verplicht: true },
      { id: "3.2", type: "keuze", vraag: "Zijn alle bestuursleden vereffenaar?", pdf: "3.2.1_bestuursleden", opties: ["Ja", "Nee"], toon: heeftBaten, verplicht: true },

      { id: "3.3_persoon", type: "vink", vraag: "Vereffenaar is een natuurlijk persoon (een mens)", pdf: "3.3.1_vereffenaar", toon: apartVereffenaar },
      { id: "3.3_org", type: "vink", vraag: "Vereffenaar is een samenwerkingsverband of rechtspersoon", pdf: "3.3.2_vereffenaar", toon: apartVereffenaar },

      { id: "3.4.1", type: "tekst", vraag: "Vereffenaar — achternaam", pdf: "3.4.1_Achternaam", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.2", type: "tekst", vraag: "Vereffenaar — voornamen (voluit)", pdf: "3.4.2_Voornaam", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.3", type: "tekst", vraag: "Vereffenaar — BSN", pdf: "3.4.3_BSN", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.4", type: "datum", vraag: "Vereffenaar — geboortedatum", pdf: "3.4.4", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.5", type: "tekst", vraag: "Vereffenaar — geboorteplaats", pdf: "3.4.5_Geboorteplaats", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.6", type: "tekst", vraag: "Vereffenaar — geboorteland", pdf: "3.4.6_Geboorteland", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.7", type: "keuze", vraag: "Vereffenaar — geslacht", pdf: "3.4.7_Geslacht", opties: ["Man", "Vrouw", "Anders"], toon: vereffenaarPersoon },
      { id: "3.4.8", type: "memo", vraag: "Vereffenaar — woonadres", pdf: "3.4.8_adres", toon: vereffenaarPersoon, verplicht: true },
      { id: "3.4.9", type: "keuze", vraag: "Vereffenaar — bevoegdheid", pdf: "3.4.9_Bevoegdheid", opties: ["Alleen bevoegd", "Gezamenlijk bevoegd"], toon: vereffenaarPersoon },

      { id: "3.5", type: "keuze", vraag: "De vereffenaar-organisatie is ingeschreven in", pdf: "3.5.1_inschrijving", opties: ["Het buitenland", "Nederland"], toon: vereffenaarOrg, verplicht: true },
      { id: "3.5.2", type: "tekst", vraag: "Naam van de vereffenaar", pdf: "3.5.2_naam", toon: vereffenaarNL, verplicht: true },
      { id: "3.5.3", type: "memo", vraag: "Bezoekadres van de vereffenaar", pdf: "3.5.3_bezoekadres", toon: vereffenaarNL, verplicht: true },
      { id: "3.5.4", type: "tekst", vraag: "KVK-nummer van de vereffenaar", pdf: "3.5.4_KVK", toon: vereffenaarNL },
      { id: "3.5.5", type: "tekst", vraag: "Achternaam en voorletters van wie tekent namens de vereffenaar", pdf: "3.5.5_achternaam", toon: vereffenaarNL, verplicht: true },
      { id: "3.5.6", type: "keuze", vraag: "Bevoegdheid van de vereffenaar", pdf: "3.5.6_Bevoegdheid", opties: ["Alleen bevoegd", "Gezamenlijk bevoegd"], toon: vereffenaarNL },

      { id: "3.6.1", type: "tekst", vraag: "Naam van de buitenlandse vennootschap of rechtspersoon", pdf: "3.6.1_naam", toon: vereffenaarBuitenland, verplicht: true },
      { id: "3.6.2", type: "tekst", vraag: "Naam van het register en land", pdf: "3.6.2_register", toon: vereffenaarBuitenland, verplicht: true },
      { id: "3.6.3", type: "tekst", vraag: "Inschrijfnummer in dat register", pdf: "3.6.3_inschrijfnummer", toon: vereffenaarBuitenland, verplicht: true },
      { id: "3.6.4", type: "memo", vraag: "Bezoekadres volgens dat register", pdf: "3.6.4_bezoekadres", toon: vereffenaarBuitenland, verplicht: true },
      { id: "3.6.5", type: "tekst", vraag: "Achternaam en voorletters van wie tekent namens de vereffenaar", pdf: "3.6.5_naam", toon: vereffenaarBuitenland, verplicht: true },
      { id: "3.6.6", type: "keuze", vraag: "Bevoegdheid van de vereffenaar", pdf: "3.6.6_bevoegdheid", opties: ["Alleen bevoegd", "Gezamenlijk bevoegd"], toon: vereffenaarBuitenland },
    ],
  },
  {
    sleutel: "4",
    titel: "4 · Bewaarder van boeken en bescheiden",
    vragen: [
      {
        id: "4.1", type: "keuze", vraag: "Wie of wat is de bewaarder van boeken en bescheiden?",
        pdf: "4.1.1_bewaarder", opties: ["Een natuurlijk persoon", "Een samenwerkingsverband of rechtspersoon"], verplicht: true,
        hulp: "De bewaarder houdt de administratie tot zeven jaar na het einde. Het adres komt openbaar in het Handelsregister.",
      },
      { id: "4.1.2", type: "tekst", vraag: "Bewaarder — achternaam", pdf: "4.1.2_achternaam", toon: bewaarderPersoon, bron: BRON.BEWAARDER, verplicht: true },
      { id: "4.1.3", type: "tekst", vraag: "Bewaarder — voornamen (voluit)", pdf: "4.1.3_voornaam", toon: bewaarderPersoon, verplicht: true },
      { id: "4.1.4", type: "memo", vraag: "Bewaarder — woonadres", pdf: "4.1.4_adres", toon: bewaarderPersoon, verplicht: true },

      { id: "4.1.5", type: "tekst", vraag: "Naam van het samenwerkingsverband of de rechtspersoon", pdf: "4.1.5_naam", toon: bewaarderOrg, bron: BRON.BEWAARDER, verplicht: true },
      { id: "4.2", type: "keuze", vraag: "Heeft die organisatie een KVK-nummer?", pdf: "4.2_vestiging", opties: ["Ja", "Nee"], toon: bewaarderOrg, verplicht: true },
      { id: "4.2.1", type: "tekst", vraag: "KVK-nummer van de bewaarder", pdf: "4.2.1_KVK", toon: bewaarderNL, verplicht: true },
      { id: "4.2.3", type: "tekst", vraag: "Naam van het buitenlandse register en het land", pdf: "4.2.3_naam", toon: bewaarderBuitenland, verplicht: true },
      { id: "4.2.4", type: "tekst", vraag: "Inschrijfnummer in dat register", pdf: "4.2.4_inschrijfnummer", toon: bewaarderBuitenland, verplicht: true },
      { id: "4.2.5", type: "memo", vraag: "Buitenlands bezoekadres", pdf: "4.2.5_adres", toon: bewaarderBuitenland, verplicht: true },
      { id: "4.3.1", type: "tekst", vraag: "Naam van de functionaris die tekent voor de bewaarder", pdf: "4.3.1_naam", toon: bewaarderOrg, verplicht: true },
    ],
  },
  {
    sleutel: "5",
    titel: "5 · Onderneming van de rechtspersoon",
    vragen: [
      {
        id: "5.1", type: "keuze", vraag: "Heeft de rechtspersoon een onderneming die in het Handelsregister staat?",
        pdf: "5.1_onderneming", opties: ["Nee", "Ja"], verplicht: true,
        hulp: "Is de beëindiging of overname al doorgevoerd in het Handelsregister, kies dan “Nee”.",
      },
      { id: "5.2", type: "keuze", vraag: "Is de onderneming beëindigd?", pdf: "5.2.1_onderneming", opties: ["Nee, de onderneming is overgedragen", "Ja"], toon: heeftOnderneming, verplicht: true },
      { id: "5.2.2", type: "keuze", vraag: "Wanneer is de onderneming beëindigd?", pdf: "5.2.2_onderneming", opties: ["Op de datum van ontbinding", "Eerder dan de rechtspersoon"], toon: ondernemingBeeindigd, verplicht: true },
      { id: "5.2.3", type: "datum", vraag: "Datum van beëindiging van de onderneming", pdf: "5.2.3", toon: eerderBeeindigd, verplicht: true },

      { id: "5.3", type: "keuze", vraag: "Staat de overnemer in het Handelsregister?", pdf: "__5.3", opties: ["Nee", "Ja"], toon: ondernemingOvergedragen, verplicht: true },
      { id: "5.3.1", type: "tekst", vraag: "Handelsnaam van de overnemer", pdf: "5.3.1_handelsnaam", toon: overnemerInHR, verplicht: true },
      { id: "5.3.2", type: "memo", vraag: "Bezoekadres van de overnemer", pdf: "5.3.2_bezoekadres", toon: overnemerInHR, verplicht: true },
      { id: "5.3.3", type: "tekst", vraag: "KVK-nummer van de overnemer", pdf: "5.3.3_KVK", toon: overnemerInHR },
      { id: "5.3.4", type: "tekst", vraag: "Achternaam en voorletters van de aankomende eigenaar", pdf: "5.3.4_naam", toon: overnemerNietInHR, verplicht: true },
      { id: "5.3.5", type: "memo", vraag: "Woonadres van de aankomende eigenaar", pdf: "5.3.5_adres", toon: overnemerNietInHR, verplicht: true },
      { id: "5.4.1", type: "datum", vraag: "Datum van voortzetting", pdf: "5.4.1", toon: ondernemingOvergedragen, verplicht: true },
    ],
  },
  {
    sleutel: "6",
    titel: "6 · Ondertekenen",
    vragen: [
      {
        id: "6.1.1", type: "tekst", vraag: "Achternaam en voorletter(s) van wie tekent", pdf: "6.1.1_achternaam", bron: BRON.ONDERTEKENAAR, verplicht: true,
        hulp: "Alleen een bestuurder, een notaris of iemand met volmacht mag tekenen. KvK wil een kopie van een geldig identiteitsbewijs.",
      },
      { id: "6.1.2", type: "tekst", vraag: "E-mailadres", pdf: "6.1.2_email", bron: BRON.EMAIL, verplicht: true },
      { id: "6.1.3", type: "tekst", vraag: "Telefoonnummer", pdf: "6.1.3_telefoonnummer", bron: BRON.TELEFOON, verplicht: true },
      { id: "6.1.4", type: "datum", vraag: "Datum van ondertekenen", pdf: "6.1.4", bron: BRON.VANDAAG, verplicht: true },
    ],
  },
];

/**
 * Vraag 5.3 zit in de PDF als TWEE losse aankruisvelden (5.3.1_handelsregister = "ja" en
 * 5.3_handelsregister = "nee") in plaats van één veld met twee hokjes. In de vragenlijst is het één
 * vraag; hier staat hoe die op de twee velden landt.
 */
const GESPLITSTE_KEUZES = {
  "__5.3": [
    { pdf: "5.3_handelsregister", index: 0 },   // optie 0 = Nee
    { pdf: "5.3.1_handelsregister", index: 0 }, // optie 1 = Ja
  ],
};

/** Alle vragen achter elkaar, in formuliervolgorde. */
function alleVragen() {
  return SECTIES.flatMap((s) => s.vragen);
}

/** Wordt deze vraag getoond bij deze antwoorden? Zonder `toon` is het antwoord altijd ja. */
function toonVraag(vraag, antwoorden) {
  if (!vraag || typeof vraag.toon !== "function") return true;
  try {
    return !!vraag.toon(antwoorden || {});
  } catch {
    return true;
  }
}

/** De vragen die nu zichtbaar zijn, per sectie (secties zonder zichtbare vragen vallen weg). */
function zichtbareSecties(antwoorden) {
  return SECTIES
    .map((s) => ({ ...s, vragen: s.vragen.filter((v) => toonVraag(v, antwoorden)) }))
    .filter((s) => s.vragen.length > 0);
}

/**
 * Welke zichtbare, verplichte vragen nog leeg zijn. Bewust géén blokkade: je mag het formulier
 * half ingevuld afdrukken en met pen afmaken. Het scherm laat alleen zien wat er nog mist.
 */
function ontbrekend(antwoorden) {
  const a = antwoorden || {};
  return alleVragen()
    .filter((v) => v.verplicht && toonVraag(v, a))
    .filter((v) => {
      const w = a[v.id];
      if (v.type === "keuze") return w === undefined || w === null || w === "";
      if (v.type === "vink") return false;
      return !String(w == null ? "" : w).trim();
    })
    .map((v) => ({ id: v.id, vraag: v.vraag }));
}

/**
 * Vult de antwoorden aan met wat we al weten uit de klantkaart en het liquidatiedossier. Bestaande
 * antwoorden blijven staan — een ingevuld antwoord wordt nooit overschreven door een voorstel.
 */
function vulVoor(antwoorden, context) {
  const a = { ...(antwoorden || {}) };
  const c = context || {};
  const waarden = {
    [BRON.KLANTNAAM]: c.klantnaam,
    [BRON.VESTIGINGSPLAATS]: c.vestigingsplaats,
    [BRON.KVK]: c.kvknummer,
    [BRON.DATUM_ONTBINDING]: c.datumontbinding,
    [BRON.BEWAARDER]: c.bewaarder,
    [BRON.ONDERTEKENAAR]: c.ondertekenaar,
    [BRON.EMAIL]: c.email,
    [BRON.TELEFOON]: c.telefoon,
    [BRON.VANDAAG]: c.vandaag,
  };
  for (const v of alleVragen()) {
    if (!v.bron) continue;
    const huidig = a[v.id];
    if (huidig !== undefined && huidig !== null && String(huidig).trim() !== "") continue;
    const voorstel = waarden[v.bron];
    if (voorstel !== undefined && voorstel !== null && String(voorstel).trim() !== "") a[v.id] = String(voorstel);
  }
  return a;
}

module.exports = { SECTIES, GESPLITSTE_KEUZES, BRON, alleVragen, toonVraag, zichtbareSecties, ontbrekend, vulVoor };
