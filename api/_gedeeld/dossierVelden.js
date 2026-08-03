/**
 * Volledige veldencatalogus voor de fiscale dossiers, gebruikt om het medewerkersscherm
 * (Klantoverzicht → Inkomstenbelasting → dossier openen) hetzelfde te kunnen tonen/bewerken als
 * het echte Dynamics-formulier ("Dossier"/"Algemeen"/"BOX I"/"BOX II"/"BOX III"/"Review"),
 * maar dan met een door Wouter zelf te bepalen indeling (Beheer → Dossiers).
 *
 * Bron: rechtstreeks uit de Dynamics Web-API-metadata gehaald (EntityDefinitions
 * (LogicalName='cr283_inkomstenbelasting')/Attributes, 03-08-2026) en vergeleken met het echte
 * formulier (tabbladen Dossier/Algemeen/BOX I/BOX II/BOX III/Review). Bewust WEGGELATEN t.o.v.
 * de volledige ~85 kolommen: systeemvelden (createdon/ownerid/statecode/enz. — die lopen al via
 * bestaande, aparte paden) en een handvol overduidelijk verouderde/dubbele kolommen die niet op
 * het huidige formulier staan (cr283_partneralimenatie/cr283_partneralimentatie,
 * cr283_pensioenpremies, cr283_voorlopigeaanslagteruggaaf [de tekst-variant; de ja/nee-variant
 * "voorlopigeaanslagteruggaafbel" staat wél op het formulier], cr283_nieuwekolom — allemaal in
 * overleg met Wouter overgeslagen, 03-08-2026).
 *
 * Elk item:
 *   key    — korte sleutel, gebruikt in de Beheer-indeling (instellingen.json → dossierIndeling)
 *            en in de "velden"-bag die het medewerkersscherm heen-en-weer stuurt.
 *   veld   — echte Dynamics-kolomnaam (logical name).
 *   type   — "boolean" | "picklist" | "string" | "memo" | "datetime"
 *            (bepaalt het besturingselement + hoe de waarde naar Dynamics wordt teruggeschreven).
 *   label  — schermtekst, zoals die (ongeveer) ook op het Dynamics-formulier staat.
 *   sectie — voorgestelde standaardgroep (zelfde indeling als de Dynamics-tabbladen); alleen
 *            gebruikt om de Beheer-indeling de EERSTE keer mee te vullen. Wouter kan dit daarna
 *            vrij aanpassen via Beheer → Dossiers.
 */

const IB_VELDEN = [
  // Algemeen
  { key: "fiscaalpartnerschap", veld: "cr283_fiscaalpartnerschap", type: "boolean", label: "Fiscaal partnerschap", sectie: "algemeen" },
  { key: "gezinssituatie", veld: "cr283_gezinssituatie", type: "picklist", label: "Gezinssituatie (huidige situatie)", sectie: "algemeen" },
  { key: "gezinssituatiegewijzigd", veld: "cr283_gezinssituatiegewijzigd", type: "boolean", label: "Gezinssituatie gewijzigd", sectie: "algemeen" },
  { key: "via", veld: "cr283_via", type: "boolean", label: "VIA", sectie: "algemeen" },
  { key: "voorlopigeaanslagteruggaaf", veld: "cr283_voorlopigeaanslagteruggaafbel", type: "boolean", label: "Voorlopige aanslag/teruggaaf", sectie: "algemeen" },
  { key: "voorkomingdubbelebelasting", veld: "cr283_voorkomingdubbelebelasting", type: "boolean", label: "Voorkoming dubbele belasting", sectie: "algemeen" },
  { key: "toelichtingalgemeen", veld: "cr283_toelichtingalgemeen", type: "memo", label: "Toelichting algemeen", sectie: "algemeen" },
  // Let op: "URL uitgaande documenten" (cr283_urluitgaandedocumenten) zit BEWUST niet in deze
  // catalogus — dat veld is al de bestaande, vaste "Documentlink"-kop van het dossier (zie
  // SOORTEN.ib.optioneel.documentUrl hieronder in dossiers.js) en zou hier dubbel staan.
  { key: "urlpermanentdossier", veld: "cr283_urlpermanentdossier", type: "string", label: "URL permanent dossier", sectie: "algemeen" },
  { key: "thuiswonendkind", veld: "cr283_thuiswonendkind", type: "boolean", label: "Thuiswonend kind(eren)", sectie: "algemeen" },
  { key: "naamjongstekind", veld: "cr283_naamjongstekind", type: "string", label: "Naam jongste kind", sectie: "algemeen" },
  { key: "bsnjongstekind", veld: "cr283_bsnjongstekind", type: "string", label: "BSN jongste kind", sectie: "algemeen" },
  { key: "geboortedatumjongstekind", veld: "cr283_geboortedatumjongstekind", type: "datetime", label: "Geboortedatum jongste kind", sectie: "algemeen" },
  { key: "verhuisdinjaar", veld: "cr283_verhuisdinjaar", type: "boolean", label: "Verhuisd in jaar", sectie: "algemeen" },
  { key: "verhuisdinfiscaaljaar", veld: "cr283_verhuisdinfiscaaljaar", type: "string", label: "Verhuisd in fiscaal jaar", sectie: "algemeen" },
  { key: "alimentatie", veld: "cr283_alimentatie", type: "boolean", label: "Alimentatie", sectie: "algemeen" },
  { key: "dividendbelastingaandelen", veld: "cr283_dividendbelasting", type: "boolean", label: "Dividendbelasting aandelen", sectie: "algemeen" },
  { key: "giften", veld: "cr283_giften", type: "boolean", label: "Giften", sectie: "algemeen" },
  { key: "studiekosten", veld: "cr283_studiekosten", type: "boolean", label: "Studiekosten", sectie: "algemeen" },
  { key: "zorgkosten", veld: "cr283_zorgkosten", type: "boolean", label: "Zorgkosten", sectie: "algemeen" },

  // BOX I - Inkomen werk en woning
  { key: "loon", veld: "cr283_loon", type: "boolean", label: "Loon", sectie: "boxi" },
  { key: "uitkering", veld: "cr283_uitkering", type: "boolean", label: "Uitkering", sectie: "boxi" },
  { key: "pensioen", veld: "cr283_pensioen", type: "boolean", label: "Pensioen", sectie: "boxi" },
  { key: "pensioenpremie", veld: "cr283_pensioenpremie", type: "boolean", label: "Pensioen premie", sectie: "boxi" },
  { key: "winstuitonderneming", veld: "cr283_winstuitonderneming", type: "boolean", label: "Winst uit onderneming", sectie: "boxi" },
  { key: "voldaanaanurencriterium", veld: "cr283_voldaanaanurencriterium", type: "boolean", label: "Voldaan aan urencriterium", sectie: "boxi" },
  { key: "investeringsaftrek", veld: "cr283_investeringsaftrek", type: "boolean", label: "Investeringsaftrek", sectie: "boxi" },
  { key: "miaeia", veld: "cr283_miaeia", type: "boolean", label: "MIA/EIA", sectie: "boxi" },
  { key: "starteraftrek", veld: "cr283_starteraftrek", type: "boolean", label: "Starteraftrek", sectie: "boxi" },
  { key: "inkomstenoverigwerk", veld: "cr283_inkomstenoverigwerk", type: "boolean", label: "Inkomsten overig werk", sectie: "boxi" },
  { key: "loonpensioenbuitenland", veld: "cr283_loonpensioenenuitkeringenbuitenland", type: "boolean", label: "Loon, pensioen en uitkeringen buitenland", sectie: "boxi" },
  { key: "tbs", veld: "cr283_terbeschikkingstellenvanvermogentbs", type: "boolean", label: "Ter beschikking stellen van vermogen (TBS)", sectie: "boxi" },
  { key: "autovandezaak", veld: "cr283_autovandezaak", type: "boolean", label: "Auto van de zaak", sectie: "boxi" },
  { key: "bijtelling", veld: "cr283_bijtelling", type: "picklist", label: "Bijtelling", sectie: "boxi" },
  { key: "desinvesteringsbijtelling", veld: "cr283_desinvesteringsbijtelling", type: "boolean", label: "Desinvesteringsbijtelling", sectie: "boxi" },
  { key: "werkelijkekosten", veld: "cr283_werkelijkekosten", type: "boolean", label: "Werkelijke kosten", sectie: "boxi" },
  { key: "beperktaftrekbarekosten", veld: "cr283_nietofbeperktaftrekbarekosten", type: "boolean", label: "Niet of beperkt aftrekbare kosten", sectie: "boxi" },
  { key: "eigenwoning", veld: "cr283_eigenwoning", type: "boolean", label: "Eigen woning", sectie: "boxi" },
  { key: "eigenwoningschuld", veld: "cr283_eigenwoningschuld", type: "boolean", label: "Eigen woning schuld", sectie: "boxi" },
  { key: "hypotheekonroerendezaken", veld: "cr283_hypotheekonroerendezaken", type: "boolean", label: "Hypotheek onroerende zaken", sectie: "boxi" },
  { key: "toelichtingboxi", veld: "cr283_toelichtinginkomenenwoning", type: "memo", label: "Toelichting Box I - Inkomen en woning", sectie: "boxi" },

  // BOX II - Aanmerkelijk belang
  { key: "aanmerkelijkbelang", veld: "cr283_aanmerkelijkbelang", type: "boolean", label: "Aanmerkelijk belang", sectie: "boxii" },
  { key: "dividenduitgekeerd", veld: "cr283_dividenduitgekeerd", type: "boolean", label: "Dividend uitgekeerd", sectie: "boxii" },
  { key: "schuldbijeigenbv", veld: "cr283_schuldbijeigenbv", type: "boolean", label: "Schuld bij eigen B.V.", sectie: "boxii" },
  { key: "excessieflenen", veld: "cr283_excessieflenen", type: "boolean", label: "Excessief lenen", sectie: "boxii" },
  { key: "toelichtingboxii", veld: "cr283_toelichtingaanmerkelijkbelang", type: "memo", label: "Toelichting Box II - Aanmerkelijk belang", sectie: "boxii" },

  // BOX III - Voordeel uit sparen en beleggen
  { key: "banktegoeden", veld: "cr283_banktegoeden", type: "boolean", label: "Banktegoeden", sectie: "boxiii" },
  { key: "beleggingen", veld: "cr283_beleggingen", type: "boolean", label: "Beleggingen", sectie: "boxiii" },
  { key: "bezittingen", veld: "cr283_bezettingen", type: "boolean", label: "Bezittingen", sectie: "boxiii" },
  { key: "onroerendezaken", veld: "cr283_onroerendezaken", type: "boolean", label: "Onroerende zaken", sectie: "boxiii" },
  { key: "overigevorderingen", veld: "cr283_overigevorderingen", type: "boolean", label: "Overige vorderingen", sectie: "boxiii" },
  { key: "crypto", veld: "cr283_crypto", type: "boolean", label: "Crypto", sectie: "boxiii" },
  { key: "boxiiibezittingen", veld: "cr283_boxiiibezittingen", type: "string", label: "BOX III bezittingen (toelichting)", sectie: "boxiii" },
  { key: "schulden", veld: "cr283_schulden", type: "boolean", label: "Schulden", sectie: "boxiii" },
  { key: "overigeschulden", veld: "cr283_overigeschulden", type: "boolean", label: "Overige schulden", sectie: "boxiii" },
  { key: "leningmetschuldherkenning", veld: "cr283_leningmetschuldherkenning", type: "boolean", label: "Lening met schuldherkenning", sectie: "boxiii" },
  { key: "vorderingmetschuldherkenning", veld: "cr283_vorderingmetschuldherkenning", type: "boolean", label: "Vordering met schuldherkenning", sectie: "boxiii" },
  { key: "familielening", veld: "cr283_familielening", type: "boolean", label: "Familielening", sectie: "boxiii" },
  { key: "aovpremie", veld: "cr283_aovpremie", type: "boolean", label: "AOV premie", sectie: "boxiii" },
  { key: "toelichtingboxiii", veld: "cr283_toelichtingsparenenbeleggen", type: "memo", label: "Toelichting Box III - Sparen en beleggen", sectie: "boxiii" },

  // Review
  { key: "reviewnotitie", veld: "cr283_reviewnotitie", type: "memo", label: "Review-notitie (aan de klant)", sectie: "review" },
  { key: "reviewnotitiedatum", veld: "cr283_reviewnotitiedatum", type: "datetime", label: "Review-notitie - datum", sectie: "review" },
  { key: "reviewdoor", veld: "cr283_reviewdoor", type: "string", label: "Review door", sectie: "review" },
  { key: "reactiereviewnotitie", veld: "cr283_reactiereviewnotitie", type: "memo", label: "Reactie op review-notitie (van de klant)", sectie: "review" },
  { key: "reactiereviewnotitiedatum", veld: "cr283_reactiereviewnotitiedatum", type: "datetime", label: "Reactie review-notitie - datum", sectie: "review" },
  { key: "reactiereviewdoor", veld: "cr283_reactiereviewdoor", type: "string", label: "Reactie review door", sectie: "review" },
  { key: "controle", veld: "cr283_controle", type: "boolean", label: "Controle", sectie: "review" },
  { key: "opmerkingen", veld: "cr283_opmerkingen", type: "memo", label: "Opmerkingen", sectie: "review" },
  { key: "datumgewijzigd", veld: "cr283_datumgewijzigd", type: "datetime", label: "Datum gewijzigd", sectie: "review" },
];

// Namen van de picklist-velden waarvoor we de opties NIET hardcoded kennen (in tegenstelling tot
// cr283_statusaangifte, dat al zijn eigen vaste lijst had) — die vragen we live bij Dynamics op
// (metadata-endpoint, met dezelfde cache-aanpak als haalEntitySetNaam in dossiers.js).
const IB_DYNAMISCHE_PICKLISTS = IB_VELDEN.filter((v) => v.type === "picklist").map((v) => v.veld);

const SECTIE_TITELS_STANDAARD = {
  algemeen: "Algemeen",
  boxi: "Box I - Inkomen en eigen woning",
  boxii: "Box II - Aanmerkelijk belang",
  boxiii: "Box III - Sparen en beleggen",
  review: "Review",
};
const SECTIE_VOLGORDE_STANDAARD = ["algemeen", "boxi", "boxii", "boxiii", "review"];

/** De standaardindeling (spiegelt de Dynamics-tabbladen) — het startpunt zolang Wouter in
 * Beheer → Dossiers nog niets eigens heeft opgeslagen, en de basis waaruit hij verder kan
 * herindelen (secties hernoemen/samenvoegen/herordenen, velden verplaatsen). */
function standaardIndelingIB() {
  return {
    secties: SECTIE_VOLGORDE_STANDAARD.map((sleutel) => ({
      sleutel,
      titel: SECTIE_TITELS_STANDAARD[sleutel],
      velden: IB_VELDEN.filter((v) => v.sectie === sleutel).map((v) => v.key),
    })),
  };
}

function veldOpKey(key) {
  return IB_VELDEN.find((v) => v.key === key);
}

module.exports = { IB_VELDEN, IB_DYNAMISCHE_PICKLISTS, standaardIndelingIB, veldOpKey };
