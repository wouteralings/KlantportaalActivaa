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
 *   type   — "boolean" | "picklist" | "string" | "memo" | "datetime" | "vast-url"
 *            (bepaalt het besturingselement + hoe de waarde naar Dynamics wordt teruggeschreven;
 *            "vast-url" is een tekstveld dat bovendien een klikbaar linkje toont zodra het gevuld is).
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
  // type "vast-url" (i.p.v. "string") zodat dit veld — net als URL dossier/Documentlink hierboven
  // — een klikbaar linkje toont zodra het gevuld is (zie VeldInvoer in MedewerkerPortaal.jsx).
  { key: "urlpermanentdossier", veld: "cr283_urlpermanentdossier", type: "vast-url", label: "URL permanent dossier", sectie: "algemeen" },
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

/**
 * Volledige veldencatalogus voor Vennootschapsbelasting (tabel cr283_vennootschapsbelasting).
 * Zelfde opzet als IB_VELDEN hierboven, config-gedreven en door Beheer → Dossiers zelf in te delen.
 *
 * Bron: rechtstreeks uit de Dynamics Web-API-metadata gehaald
 * (EntityDefinitions(LogicalName='cr283_vennootschapsbelasting')/Attributes, 05-08-2026) — alle
 * custom, bewerkbare kolommen. Bewust NIET in deze vrije catalogus (lopen al via een eigen, vast
 * pad in dossiers.js — SOORTEN.vpb):
 *   - cr283_statusaangifte  → de vaste "Status van de aangifte" (__status)
 *   - cr283_urldossier      → de vaste "URL dossier" (__urlDossier)
 *   - cr283_urluitgaandedocumenten → de vaste "Documentlink" (__documentUrl)
 *   - cr283_client / cr283_accountant / cr283_assistent / cr283_manager / cr283_groepsnaam
 *                           → lookups, getoond als alleen-lezen naam (SOORTEN.vpb.optioneel)
 *   - cr283_jaar / cr283_begindatum / cr283_einddatum → de periode/boekjaar (SOORTEN.vpb.optioneel),
 *                           net als "jaar" bij IB geen bewerkbaar detailveld maar de dossierperiode
 *   - cr283_dossier         → de primaire "Dossier"-tekstkolom (via metDossiernaam)
 *   - cr283_nieuwekolom     → verouderd/dubbel (label "Onderwerp"), overgeslagen net als bij IB
 */
const VPB_VELDEN = [
  // Algemeen
  { key: "isboekjaarafwijkend", veld: "cr283_isboekjaarafwijkend", type: "boolean", label: "Is boekjaar afwijkend?", sectie: "algemeen" },
  { key: "bijzonderhedenboekjaar", veld: "cr283_bijzonderhedenboekjaar", type: "memo", label: "Bijzonderheden boekjaar", sectie: "algemeen" },
  { key: "jaarrekeningdefinitief", veld: "cr283_jaarrekeningdefinitief", type: "boolean", label: "Jaarrekening definitief", sectie: "algemeen" },
  { key: "specificatiesontvangen", veld: "cr283_specificatiesontvangen", type: "boolean", label: "Specificaties ontvangen", sectie: "algemeen" },
  { key: "isactienodigvanklant", veld: "cr283_isactienodigvanklant", type: "boolean", label: "Is actie nodig van klant?", sectie: "algemeen" },
  { key: "isaangiftegereedvoorreview", veld: "cr283_isaangiftegereedvoorreview", type: "boolean", label: "Is aangifte gereed voor review?", sectie: "algemeen" },
  { key: "urlpermanentdossier", veld: "cr283_urlpermanentdossier", type: "vast-url", label: "URL permanent dossier", sectie: "algemeen" },

  // Fiscale winst & berekening
  { key: "resultaatvoorbelasting", veld: "cr283_resultaatvoorbelasting", type: "integer", label: "Resultaat voor belasting", sectie: "winst" },
  { key: "fiscalewinst", veld: "cr283_fiscalewinst", type: "integer", label: "Fiscale winst", sectie: "winst" },
  { key: "vpbberekend", veld: "cr283_vpbberekend", type: "integer", label: "VPB berekend", sectie: "winst" },
  { key: "zijnercompensabeleverliezen", veld: "cr283_zijnercompensabeleverliezen", type: "boolean", label: "Zijn er compensabele verliezen?", sectie: "winst" },
  { key: "hoogteverrekenbareverliezen", veld: "cr283_hoogteverrekenbareverliezen", type: "integer", label: "Hoogte verrekenbare verliezen", sectie: "winst" },
  { key: "hoeveelverliesverrekeningtoegepast", veld: "cr283_hoeveelverliesverrekeningtoegepast", type: "integer", label: "Hoeveel verliesverrekening toegepast?", sectie: "winst" },
  { key: "nominalewaardeafgewaardeerdevorderingen", veld: "cr283_nominalewaardeafgewaardeerdevorderingen", type: "integer", label: "Nominale waarde afgewaardeerde vorderingen", sectie: "winst" },

  // Fiscale correcties & posities
  { key: "afschrijvingencorrecttoegepast", veld: "cr283_afschrijvingencorrecttoegepast", type: "boolean", label: "Afschrijvingen correct toegepast?", sectie: "correcties" },
  { key: "zijnerfiscaalbedrijfseconomischeverschillen", veld: "cr283_zijnerfiscaalbedrijfseconomischeverschillen", type: "boolean", label: "Zijn er fiscaal/bedrijfseconomische verschillen?", sectie: "correcties" },
  { key: "zijnernietaftrekbarekosten", veld: "cr283_zijnernietaftrekbarekosten", type: "boolean", label: "Zijn er niet-aftrekbare kosten?", sectie: "correcties" },
  { key: "zijnerincidentelebatenlasten", veld: "cr283_zijnerincidentelebatenlasten", type: "boolean", label: "Zijn er incidentele baten/lasten?", sectie: "correcties" },
  { key: "zijnerfiscalevoorzieningen", veld: "cr283_zijnerfiscalevoorzieningen", type: "boolean", label: "Zijn er fiscale voorzieningen?", sectie: "correcties" },
  { key: "zijneronttrekkingenstortingen", veld: "cr283_zijneronttrekkingenstortingen", type: "boolean", label: "Zijn er onttrekkingen / stortingen?", sectie: "correcties" },
  { key: "investeringsaftrek", veld: "cr283_investeringsaftrek", type: "boolean", label: "Investeringsaftrek", sectie: "correcties" },
  { key: "desinvesteringsaftrek", veld: "cr283_desinvesteringsaftrek", type: "boolean", label: "Desinvesteringsaftrek", sectie: "correcties" },
  { key: "miaeiaaftrek", veld: "cr283_miaeiaaftrek", type: "boolean", label: "MIA/EIA aftrek", sectie: "correcties" },
  { key: "miaeia", veld: "cr283_miaeia", type: "string", label: "MIA/EIA", sectie: "correcties" },
  { key: "isdeelnemingsvrijstellingtoegepast", veld: "cr283_isdeelnemingsvrijstellingtoegepast", type: "boolean", label: "Is deelnemingsvrijstelling toegepast?", sectie: "correcties" },
  { key: "isgebruikelijkloontoegepast", veld: "cr283_isgebruikelijkloontoegepast", type: "boolean", label: "Is gebruikelijk loon toegepast?", sectie: "correcties" },
  { key: "iserinnovatieboxsubsidies", veld: "cr283_iserinnovatieboxsubsidies", type: "boolean", label: "Is er innovatiebox / subsidies?", sectie: "correcties" },
  { key: "isfiscalepositiejaarrekeninggelijkaanvpb", veld: "cr283_isfiscalepositiejaarrekeninggelijkaanvpb", type: "boolean", label: "Is fiscale positie jaarrekening gelijk aan vpb?", sectie: "correcties" },
  { key: "toelichtingafwijkingfiscalepositie", veld: "cr283_toelichtingafwijkingfiscalepositie", type: "memo", label: "Toelichting afwijking fiscale positie", sectie: "correcties" },
  { key: "toelichtingfiscalecorrecties", veld: "cr283_toelichtingfiscalecorrecties", type: "memo", label: "Toelichting fiscale correcties", sectie: "correcties" },
  { key: "fiscalerisicosgeidentificeerd", veld: "cr283_fiscalerisicosgeidentificeerdtekstveld", type: "memo", label: "Fiscale risico's geïdentificeerd", sectie: "correcties" },
  { key: "adviesgegevenaanklant", veld: "cr283_adviesgegevenaanklanttekstveld", type: "memo", label: "Advies gegeven aan klant", sectie: "correcties" },

  // Deelnemingen & structuur
  { key: "isersprakevandeelnemingen", veld: "cr283_isersprakevandeelnemingen", type: "boolean", label: "Is er sprake van deelnemingen?", sectie: "deelnemingen" },
  { key: "zijnerresultatenuitdeelnemingen", veld: "cr283_zijnerresultatenuitdeelnemingen", type: "boolean", label: "Zijn er resultaten uit deelnemingen?", sectie: "deelnemingen" },
  { key: "issprakevanafgewaardeerdedeelnemingsvordering", veld: "cr283_issprakevanafgewaardeerdedeelnemingsvordering", type: "boolean", label: "Is sprake van afgewaardeerde deelnemingsvordering?", sectie: "deelnemingen" },
  { key: "isersprakevaneenfiscaleeenheid", veld: "cr283_isersprakevaneenfiscaleeenheid", type: "boolean", label: "Is er sprake van een fiscale eenheid?", sectie: "deelnemingen" },
  { key: "zijnerbuitenlandseactiviteiten", veld: "cr283_zijnerbuitenlandseactiviteiten", type: "boolean", label: "Zijn er buitenlandse activiteiten?", sectie: "deelnemingen" },

  // DGA
  { key: "isereendga", veld: "cr283_isereendga", type: "boolean", label: "Is er een DGA?", sectie: "dga" },
  { key: "zijnerleningenaandga", veld: "cr283_zijnerleningenaandga", type: "boolean", label: "Zijn er leningen aan DGA?", sectie: "dga" },
  { key: "isrekeningcourantdgaaanwezig", veld: "cr283_isrekeningcourantdgaaanwezig", type: "boolean", label: "Is rekening-courant DGA aanwezig?", sectie: "dga" },
  { key: "iserdividenduitgekeerdinditjaar", veld: "cr283_iserdividenduitgekeerdinditjaar", type: "boolean", label: "Is er dividend uitgekeerd in dit jaar?", sectie: "dga" },

  // Review
  { key: "reviewnotitie", veld: "cr283_reviewnotitie", type: "memo", label: "Review-notitie (aan de klant)", sectie: "review" },
  { key: "reviewnotitiedatum", veld: "cr283_reviewnotitiedatum", type: "datetime", label: "Review-notitie - datum", sectie: "review" },
  { key: "reactiereviewnotitie", veld: "cr283_reviewnotitiereactie", type: "memo", label: "Reactie op review-notitie (van de klant)", sectie: "review" },
];

const VPB_DYNAMISCHE_PICKLISTS = VPB_VELDEN.filter((v) => v.type === "picklist").map((v) => v.veld);

const VPB_SECTIE_TITELS_STANDAARD = {
  algemeen: "Algemeen",
  winst: "Fiscale winst & berekening",
  correcties: "Fiscale correcties & posities",
  deelnemingen: "Deelnemingen & structuur",
  dga: "DGA",
  review: "Review",
};
const VPB_SECTIE_VOLGORDE_STANDAARD = ["algemeen", "winst", "correcties", "deelnemingen", "dga", "review"];

const SECTIE_TITELS_STANDAARD = {
  algemeen: "Algemeen",
  boxi: "Box I - Inkomen en eigen woning",
  boxii: "Box II - Aanmerkelijk belang",
  boxiii: "Box III - Sparen en beleggen",
  review: "Review",
};
const SECTIE_VOLGORDE_STANDAARD = ["algemeen", "boxi", "boxii", "boxiii", "review"];

/** De drie "vaste" dossiervelden (Status van de aangifte / URL dossier / Documentlink) zijn GEEN
 * onderdeel van de vrije veldencatalogus hierboven — ze staan al vast in dossiers.js
 * (werkDossierBij/naarBuiten, elk met hun eigen Dynamics-kolom per soort) en blijven dat ook.
 * Maar Wouter wil ze WEL zelf kunnen indelen via Beheer → Dossiers (in een sectie/subrubriek
 * zetten, een kop meegeven, verbergen, alleen-lezen maken) net als elk ander veld. Daarom krijgen
 * ze hier alleen een "schema-only" catalogusentry (geen "veld"-kolom nodig — dat pad loopt al via
 * de bestaande status/urlDossier/documentUrl-parameters, zie werkDossierBij). Sleutels beginnen
 * bewust met "__" zodat ze nooit kunnen botsen met een echte catalogussleutel.
 * Niet elke soort heeft alle drie (VPB heeft bijv. geen "urlDossier", zie SOORTEN.optioneel in
 * dossiers.js) — vasteVeldenVoorSoort() geeft daarom alleen terug wat voor die soort van
 * toepassing is. */
function vasteVeldenVoorSoort(soort) {
  const optioneel = (soort && soort.optioneel) || {};
  const velden = [{ key: "__status", type: "vast-status", label: "Status van de aangifte" }];
  if (optioneel.urlDossier) velden.push({ key: "__urlDossier", type: "vast-url", label: "URL dossier" });
  if (optioneel.documentUrl) velden.push({ key: "__documentUrl", type: "vast-url", label: "Documentlink (uitgaande stukken)" });
  return velden;
}

/** De standaardindeling (spiegelt de Dynamics-tabbladen) — het startpunt zolang Wouter in
 * Beheer → Dossiers nog niets eigens heeft opgeslagen, en de basis waaruit hij verder kan
 * herindelen (secties/subrubrieken hernoemen/samenvoegen/herordenen, velden verplaatsen).
 *
 * secties[].subsecties — optionele subrubrieken binnen een hoofdrubriek (elk weer { sleutel,
 *                titel, velden }); een veld staat OFWEL rechtstreeks in sectie.velden OFWEL in
 *                precies één van sectie.subsecties[].velden, nooit beide.
 * verborgen    — sleutels die nooit getoond worden in het medewerkersdossier, ook al staan ze nog
 *                gewoon in een sectie/subrubriek (in tegenstelling tot "Niet ingedeeld": de
 *                plek/volgorde blijft bewaard voor als Wouter het veld later weer wil tonen).
 * voorwaarden  — { childKey: parentBooleanKey }: childKey wordt alleen getoond als het
 *                boolean-veld parentBooleanKey op dat dossier "Ja" is. Standaard leeg — Wouter
 *                stelt dit zelf in via Beheer → Dossiers (geen door ons geraden bedrijfslogica).
 * alleenLezen  — sleutels die in het medewerkersportaal wel getoond maar niet bewerkt mogen
 *                worden (ook server-side afgedwongen, zie medewerker-dossier/index.js).
 * labels       — { sleutel: eigenLabel } — overschrijft het standaardlabel van een veld (vast,
 *                catalogus- of aangepast veld) met een eigen, door Wouter ingetypte tekst.
 * aangepasteVelden — extra catalogusvelden die Wouter zelf via Beheer → Dossiers heeft
 *                aangemaakt (incl. een echte nieuwe kolom in Dynamics, zie
 *                api/dossier-kolom-aanmaken) — zelfde vorm als IB_VELDEN-items (key/veld/type/
 *                label), maar hier opgeslagen i.p.v. in code, want pas tijdens gebruik bepaald.
 * onderwerpId  — het "onderwerp" (uit Beheer → Onderwerpen, zie api/_gedeeld/aanleveronderwerpen.js)
 *                dat bij deze dossiersoort hoort, voor het automatisch tonen van gekoppelde
 *                uitvraaglijsten (aanleververzoeken) in het dossier — zie
 *                gekoppeldeUitvragenVoorDossier() in api/medewerker-dossier/index.js. Leeg = geen
 *                koppeling, Wouter stelt dit zelf per dossiersoort in via Beheer → Dossiers. */
function standaardIndelingIB() {
  return {
    secties: SECTIE_VOLGORDE_STANDAARD.map((sleutel, i) => ({
      sleutel,
      titel: SECTIE_TITELS_STANDAARD[sleutel],
      velden: i === 0
        ? ["__status", "__urlDossier", "__documentUrl", ...IB_VELDEN.filter((v) => v.sectie === sleutel).map((v) => v.key)]
        : IB_VELDEN.filter((v) => v.sectie === sleutel).map((v) => v.key),
      subsecties: [],
    })),
    verborgen: [],
    voorwaarden: {},
    alleenLezen: [],
    labels: {},
    aangepasteVelden: [],
    onderwerpId: "",
  };
}

/** Standaardindeling voor Vennootschapsbelasting — spiegelt de VPB-secties (Algemeen / Fiscale
 * winst / Correcties / Deelnemingen / DGA / Review). Zelfde structuur als standaardIndelingIB():
 * de vaste velden (Status/URL dossier/Documentlink) staan vooraan in "Algemeen". Startpunt zolang
 * Wouter in Beheer → Dossiers voor VPB nog niets eigens heeft opgeslagen. */
function standaardIndelingVPB() {
  return {
    secties: VPB_SECTIE_VOLGORDE_STANDAARD.map((sleutel, i) => ({
      sleutel,
      titel: VPB_SECTIE_TITELS_STANDAARD[sleutel],
      velden: i === 0
        ? ["__status", "__urlDossier", "__documentUrl", ...VPB_VELDEN.filter((v) => v.sectie === sleutel).map((v) => v.key)]
        : VPB_VELDEN.filter((v) => v.sectie === sleutel).map((v) => v.key),
      subsecties: [],
    })),
    verborgen: [],
    voorwaarden: {},
    alleenLezen: [],
    labels: {},
    aangepasteVelden: [],
    onderwerpId: "",
  };
}

/** Minimale standaardindeling voor soorten zonder eigen veldencatalogus (vooralsnog VPB) — alleen
 * de vaste velden die voor die soort gelden, in één "Algemeen"-sectie. Zorgt dat Status/links
 * gewoon blijven verschijnen ook al heeft VPB (nog) geen eigen Beheer-indeling. */
function standaardIndelingOverig(soort) {
  return {
    secties: [{ sleutel: "algemeen", titel: "Algemeen", velden: vasteVeldenVoorSoort(soort).map((v) => v.key), subsecties: [] }],
    verborgen: [],
    voorwaarden: {},
    alleenLezen: [],
    labels: {},
    aangepasteVelden: [],
    onderwerpId: "",
  };
}

// Past een { sleutel: eigenLabel }-overschrijving toe op een catalogus — gebruikt door zowel
// /api/dossier-velden (Beheer) als /api/medewerker-dossier (portaalscherm) zodat een door Wouter
// aangepast veldlabel overal hetzelfde verschijnt, zonder dat elke aanroeper de merge-logica zelf
// hoeft te herhalen.
function metLabels(catalogus, labels) {
  if (!labels || typeof labels !== "object" || Object.keys(labels).length === 0) return catalogus;
  return (catalogus || []).map((v) => (labels[v.key] ? { ...v, label: labels[v.key] } : v));
}

function veldOpKey(key) {
  return IB_VELDEN.find((v) => v.key === key) || VPB_VELDEN.find((v) => v.key === key);
}

module.exports = {
  IB_VELDEN,
  IB_DYNAMISCHE_PICKLISTS,
  VPB_VELDEN,
  VPB_DYNAMISCHE_PICKLISTS,
  standaardIndelingIB,
  standaardIndelingVPB,
  standaardIndelingOverig,
  vasteVeldenVoorSoort,
  metLabels,
  veldOpKey,
};
