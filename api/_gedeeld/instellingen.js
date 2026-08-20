const { BlobServiceClient } = require("@azure/storage-blob");
const { standaardIndelingIB } = require("./dossierVelden");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "instellingen.json";
let cachedContainerClient = null;

// Standaard onderwerp/tekst van de mail bij "Aangifte versturen" (IB-dossier) — zelfde plaatshouders
// als aangifteBestandsnaamTemplate hieronder: {klant} (naam van de ontvanger) en {jaar} (dossierjaar).
// Was tot 04-08-2026 hardcoded in de frontend (AangifteVersturenKaart in MedewerkerPortaal.jsx);
// nu instelbaar via Beheer → Dossiers (DossierIndelingBeheer.jsx), zie api/medewerker-aangifte-ontvanger.
const STANDAARD_AANGIFTE_MAIL_ONDERWERP = "Uw aangifte inkomstenbelasting {jaar} staat klaar in het portaal";
const STANDAARD_AANGIFTE_MAIL_TEKST =
  "Beste {klant},\n\nUw aangifte inkomstenbelasting over {jaar} staat klaar ter beoordeling in het klantportaal.\n\n" +
  "U kunt de aangifte inzien via het portaal, onder \"Taken\". Zodra u akkoord geeft, ronden wij de aangifte verder voor u af.\n\n" +
  "Heeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\nActivaa Accountants en Adviseurs";

// Standaard-submap (onder cr283_sharepoint) waarin een via het IB-dossier gedropte aangifte belandt,
// het onderwerp van de bijbehorende Dynamics-taak en de optiesetwaarde (soort) van die taak — tot
// 05-08-2026 hardcoded in api/medewerker-aangifte-versturen, nu instelbaar via Beheer → Dossiers.
// Pad ondersteunt submappen (scheiding met "/") en dezelfde plaatshouders als de rest: {klant}/{jaar}.
const STANDAARD_AANGIFTE_PAD = "Correspondentie";
const STANDAARD_AANGIFTE_TAAK_ONDERWERP = "Aangifte inkomstenbelasting {jaar} klaar ter beoordeling";
// "In afwachting reactie client" — bestaande optiesetwaarde op Task.cr283_soortactiecategorie.
const STANDAARD_AANGIFTE_TAAK_SOORT = 8006;

async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAAM);
  await containerClient.createIfNotExists();
  cachedContainerClient = containerClient;
  return containerClient;
}

async function streamNaarTekst(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) {
    stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  }
  return Buffer.concat(stukken).toString("utf-8");
}

/** Geeft de huidige instellingen terug, met lege strings als er nog niets is opgeslagen. */
async function haalInstellingen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);

  const bestaat = await blobClient.exists();
  if (!bestaat) return { medewerkersGroepId: "", medewerkersGroepNaam: "", googleReviewUrl: "", teamsChatUrl: "", whatsappUrl: "", copilotEmbedUrl: "", logoUrl: "", faviconUrl: "", wijzigingFormNawUrl: "", wijzigingFormContactUrl: "", taaksoorten: {}, taakAfwijzingWebhookUrl: "", reviewWebhookUrl: "", facturatiemodulePrijs: 5, urenmodulePrijs: 2.5, rapportagesmodulePrijs: 7.5, bezittingenmodulePrijs: 5, rittenmodulePrijs: 1.5, contractenmodulePrijs: 2.5, contractenSharepointOpslag: false, contractenSharepointMap: "Contracten", contractenReminderAfzender: "", contractenReminderOnderwerp: "", contractenReminderTekst: "", klantoverzicht: { extraKolommen: [], standaardVerborgen: [] }, dossierIndeling: { ib: standaardIndelingIB() }, aangifteBestandsnaamTemplate: "Aangifte inkomstenbelasting {jaar} - {klant}.pdf", aangifteMailOnderwerpTemplate: STANDAARD_AANGIFTE_MAIL_ONDERWERP, aangifteMailTekstTemplate: STANDAARD_AANGIFTE_MAIL_TEKST, aangiftePadTemplate: STANDAARD_AANGIFTE_PAD, aangifteTaakOnderwerpTemplate: STANDAARD_AANGIFTE_TAAK_ONDERWERP, aangifteTaakSoort: STANDAARD_AANGIFTE_TAAK_SOORT, dossierExtraKolommen: { ib: [], vpb: [] }, contactpersonenExtraKolommen: [], uitvraagTabellen: [], dossierReview: {}, dossierAkkoord: {}, dossierVoorlopig: {} };

  const downloadResponse = await blobClient.download();
  const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
  return {
    // Entra-groep waarvan het lidmaatschap de rol 'medewerker' geeft (Beheer → Medewerkers →
    // "Toegang via Entra-groep"). Wordt gelezen door api/rollen, de rolesSource van de Static
    // Web App. Leeg = niemand krijgt de rol via een groep; dan gelden alleen de noodbeheerders
    // uit de Application Setting ROLLEN_NOODBEHEERDERS en de beheerders uit wijzigrechten.json.
    medewerkersGroepId: "",
    // Alleen om de gekozen groep in het beheersportaal bij naam te kunnen tonen zonder eerst
    // Graph te hoeven bevragen.
    medewerkersGroepNaam: "",
    googleReviewUrl: "",
    teamsChatUrl: "",
    whatsappUrl: "",
    copilotEmbedUrl: "",
    logoUrl: "",
    faviconUrl: "",
    wijzigingFormNawUrl: "",
    wijzigingFormContactUrl: "",
    // Per soort (op numerieke optieset-waarde): { zichtbaar: bool, magGoedkeuren: bool, label: string }.
    taaksoorten: {},
    // Power Automate HTTP-trigger (webhook) die een mail stuurt als een klant "Niet akkoord" geeft.
    taakAfwijzingWebhookUrl: "",
    // Power Automate HTTP-trigger (webhook) voor de afhandeling van reviews onder de 5 sterren.
    reviewWebhookUrl: "",
    // Prijs (in hele euro's of met centen, bijv. 5 of 7.5) van de facturatiemodule per
    // klantaccount per maand — getoond in het klantportaal bij een nog niet actief account
    // (Facturatiemodule → "Niet actief"-uitleg), instelbaar in Beheer → Facturatie.
    facturatiemodulePrijs: 5,
    // Prijs van de losse urenregistratie-module per klantaccount per maand — zelfde soort als de
    // facturatiemoduleprijs, apart instelbaar in Beheer → Facturatie.
    urenmodulePrijs: 2.5,
    // Prijs van de losse Rapportagemodule (W&V + Balans uit RGS 3.5/Exact) per klantaccount per
    // maand — standalone, los van Facturatie/Uren. Instelbaar in Beheer → Rapportages.
    rapportagesmodulePrijs: 7.5,
    // Prijs van de losse Bezittingenmodule (activastaat + afschrijvingen uit Exact) per
    // klantaccount per maand — standalone. Instelbaar in Beheer → Bezittingen.
    bezittingenmodulePrijs: 5,
    // Prijs van de losse rittenregistratie-module per klantaccount per maand — volledig los van
    // Facturatie/Uren, apart instelbaar in Beheer → Facturatie (rubriek "Rittenregistratie").
    rittenmodulePrijs: 1.5,
    // Prijs van de losse Contractenmodule (zelf geregistreerde verzekeringen/telefonie/overige
    // doorlopende contracten, met verloopherinneringen) per klantaccount per maand — volledig los
    // van de andere modules, instelbaar in Beheer → Facturatie.
    contractenmodulePrijs: 2.5,
    // Sinds 04-08-2026: contractdocumenten (bijlagen bij een contract, zie
    // api/_gedeeld/contractenDocumenten.js) óók als kopie wegschrijven naar het SharePoint-
    // klantdossier van de klant (cr283_sharepoint), net als bij de bestaande aanlever-uitvragen —
    // instelbaar in Beheer → Facturatie. Standaard UIT (bewuste, expliciete keuze nodig, o.a.
    // omdat het de Sites.Selected-Graph-grant vereist, zie het projectdoc "Documenten & rechten").
    // De blob-opslag (contractenDocumenten.js) blijft ALTIJD de bron voor de documentenlijst/
    // -download in het portaal zelf; de SharePoint-kopie is puur een archiefkopie in het dossier.
    contractenSharepointOpslag: false,
    // Naam van de submap onder de basismap van de klant waarin die archiefkopie terechtkomt
    // (er wordt daaronder nog een submap per contract aangemaakt). Zelfde idee als de vaste
    // Directie/Administratie/Aanleveren-submappen in api/_gedeeld/documentmappen.js, maar hier via
    // Beheer instelbaar i.p.v. een App Setting, zoals Wouter vroeg ("Dit willen we kunnen instellen").
    contractenSharepointMap: "Contracten",
    // Aanpasbare verloopherinnering per e-mail (Contractenmodule) — op verzoek van Wouter
    // (05-08-2026: "Ik zou graag contracten mail willen kunnen aanpassen en mailadres waarvan
    // wordt gemaild."), instelbaar in Beheer → Facturatie → Betaalde functionaliteiten. Alle drie
    // leeg = ingebouwde standaardtekst + het standaard afzenderadres (Application Setting
    // GRAPH_MAIL_SENDER) gebruiken — zie maakOnderwerpEnTekst()/verwerkReminders() in
    // contractenReminders.js en verstuurMail() in mail.js.
    contractenReminderAfzender: "",
    contractenReminderOnderwerp: "",
    contractenReminderTekst: "",
    // Kolom-configuratie voor het klantoverzicht in het medewerkersportaal.
    // extraKolommen: [{ veld, label, type: "tekst"|"keuze"|"lookup" }]; standaardVerborgen: [kolom-keys].
    klantoverzicht: { extraKolommen: [], standaardVerborgen: [] },
    // Door Beheer → Dossiers zelf te bepalen indeling van de fiscale-dossiervelden per soort
    // (vooralsnog alleen "ib" — zie dossierVelden.js/standaardIndelingIB voor de standaardindeling
    // die hier als terugval dient zolang er nog niets eigens is opgeslagen).
    dossierIndeling: { ib: standaardIndelingIB() },
    // Bestandsnaam waaronder een via het IB-dossier gedropte aangifte (cliënt of fiscaal partner)
    // in de SharePoint-map "Correspondentie" van dat account wordt opgeslagen — instelbaar via
    // Beheer → Dossiers (DossierIndelingBeheer.jsx). Plaatshouders: {klant} (naam van de
    // ontvanger — cliënt of partner) en {jaar} (dossierjaar). Zie api/medewerker-aangifte-versturen.
    aangifteBestandsnaamTemplate: "Aangifte inkomstenbelasting {jaar} - {klant}.pdf",
    // Standaard onderwerp/tekst van de mail bij "Aangifte versturen" — zie STANDAARD_AANGIFTE_MAIL_*
    // hierboven. Ook instelbaar via Beheer → Dossiers, zelfde blok als de bestandsnaam hierboven.
    // De medewerker ziet dit als voorstel in het voorbeeldscherm en kan het per verzending nog
    // aanpassen (mailOnderwerp/mailTekst in api/medewerker-aangifte-versturen) — deze instelling
    // bepaalt alleen wat daar standaard al is ingevuld.
    aangifteMailOnderwerpTemplate: STANDAARD_AANGIFTE_MAIL_ONDERWERP,
    aangifteMailTekstTemplate: STANDAARD_AANGIFTE_MAIL_TEKST,
    // Submap onder de SharePoint-basismap (cr283_sharepoint) van de ontvanger waarin de aangifte-PDF
    // wordt opgeslagen, het onderwerp van de aangemaakte Dynamics-taak en de soort (optiesetwaarde,
    // Task.cr283_soortactiecategorie / DYNAMICS_TAAK_SOORT_VELD) van die taak — alle drie instelbaar
    // via Beheer → Dossiers (DossierIndelingBeheer.jsx), zie api/medewerker-aangifte-versturen. Het pad
    // mag submappen bevatten (scheiding met "/") en dezelfde plaatshouders {klant}/{jaar} als de rest.
    aangiftePadTemplate: STANDAARD_AANGIFTE_PAD,
    aangifteTaakOnderwerpTemplate: STANDAARD_AANGIFTE_TAAK_ONDERWERP,
    aangifteTaakSoort: STANDAARD_AANGIFTE_TAAK_SOORT,
    // Extra (door Beheer zelf toegevoegde) Dynamics-velden als kolom in de hoofdtabellen
    // Inkomstenbelasting/Vennootschapsbelasting — zelfde vorm als klantoverzicht.extraKolommen
    // hierboven, maar per dossiersoort (andere entiteit/velden per soort, zie api/_gedeeld/dossiers.js).
    dossierExtraKolommen: { ib: [], vpb: [] },
    // Zelfde idee voor het contactpersonen-overzicht (zie api/beheer-contactpersonen).
    contactpersonenExtraKolommen: [],
    // Uitvraag Fase B: de in Beheer → Uitvraag gekozen KORTE lijst Dynamics-tabellen die in de
    // koppel-keuzelijst verschijnen ([{ logicalName, entitySet, label }]). Leeg = alle tabellen.
    uitvraagTabellen: [],
    // Dossier-review per dossiersoort: welke taaksoort de reviewtaak krijgt, welke taak er ná het
    // aftekenen ontstaat (akkoord vs. aanpassen) en welke dossierstatus daarbij hoort. Vorm per
    // soort: { aan, taakSoort, taakOnderwerp, taakRubriek, statusAanvraag, akkoordTaakSoort,
    // akkoordTaakOnderwerp, statusAkkoord, aanpassenTaakSoort, aanpassenTaakOnderwerp,
    // statusAanpassen }. Instelbaar via Beheer → Dossiers; zie api/_gedeeld/dossierReview.js.
    dossierReview: {},
    // Dossier-taakketen ná "versturen naar de cliënt", per dossiersoort: welke dossierstatus bij het
    // versturen hoort, welke interne vervolgtaak + status er ontstaat zodra de cliënt akkoord geeft,
    // en welke status (en of het dossier op inactief gaat) zodra die vervolgtaak is afgerond. Vorm
    // per soort: { statusVersturen, akkoordTaakSoort, akkoordTaakOnderwerp, akkoordTaakRubriek,
    // statusAkkoord, statusVervolgKlaar, inactiefNaVervolg }. Zie api/_gedeeld/dossierTaakketen.js.
    dossierAkkoord: {},
    // Voorlopige aangifte per dossiersoort: de beheerbare redenenlijst, de dossierstatus bij het
    // markeren, en de herzieningstaak die verplicht wordt ingepland. Vorm per soort:
    // { aan, redenen: [{sleutel,label,actief}], status, taakSoort, taakOnderwerp, taakRubriek,
    // standaardTermijnMaanden }. Zie api/_gedeeld/dossierVoorlopig.js.
    dossierVoorlopig: {},
    ...JSON.parse(tekst),
  };
}

// Velden die NOOIT via een instellingen-update gewijzigd mogen worden. De medewerkersgroep ligt
// bewust vast op de in Entra gekozen groep (Activaa B.V.): wie er binnenkomt is een beveiligings-
// keuze, geen portaalinstelling. De keuze-UI in het beheersportaal is verwijderd; deze serverkant-
// grendel zorgt dat ook een directe API-aanroep de groep niet kan omzetten. De opgeslagen waarde
// blijft staan; wil je hem ooit tóch wijzigen, dan kan dat alleen bewust in de opslag (blob) zelf.
const VERGRENDELDE_VELDEN = ["medewerkersGroepId", "medewerkersGroepNaam"];

async function werkInstellingenBij(velden) {
  const huidig = await haalInstellingen();
  const toegestaneVelden = { ...(velden || {}) };
  for (const veld of VERGRENDELDE_VELDEN) delete toegestaneVelden[veld];
  const nieuw = { ...huidig, ...toegestaneVelden };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(nieuw, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return nieuw;
}

// Standaard SharePoint-submap per soort voor de (generieke) bijlage-dropzone — terugval als er in
// Beheer → Dossiers nog geen eigen submap is ingesteld.
const STANDAARD_BIJLAGE_MAP = { dividend: "Dividendbelasting", notulen: "Notulen", ib: "Bijlagen", vpb: "Bijlagen" };

/**
 * Resolvet de bijlage-dropzone-configuratie van één dossiersoort tot een vaste vorm
 * { aan, trigger, map, bestandsnaam }. In Beheer → Dossiers stelt Wouter dit per soort in
 * (instellingen-sleutel <soort>Bijlage): of de dropzone aan staat, welk ja/nee-veld (veld-key uit de
 * catalogus) hem in het dossier activeert (leeg = altijd tonen), in welke SharePoint-submap de
 * bestanden belanden, en onder welke bestandsnaam een gedropt bestand wordt opgeslagen (met
 * plaatshouders {{klantnaam}}/{{jaar}}/{{datum}}; leeg = de originele bestandsnaam behouden).
 *
 * Terugwaartse compatibiliteit: als er nog géén <soort>Bijlage is opgeslagen behouden dividend en
 * notulen hun bestaande gedrag zonder dat Wouter iets opnieuw hoeft in te stellen — dividend toont de
 * dropzone zodra "Dividendbelasting" (veld-key dividendbelasting) op Ja staat, notulen toont hem altijd,
 * en de submap komt uit de oude losse sleutel <soort>BijlageMap (of de standaard hierboven). Andere
 * soorten (ib/vpb) staan standaard uit tot Wouter ze aanzet.
 */
function resolveBijlageConfig(instellingen, soortKey) {
  const inst = instellingen || {};
  const raw = inst[`${soortKey}Bijlage`];
  const legacyMap = typeof inst[`${soortKey}BijlageMap`] === "string" ? inst[`${soortKey}BijlageMap`].trim() : "";
  const standaardMap = STANDAARD_BIJLAGE_MAP[soortKey] || "Bijlagen";
  if (raw && typeof raw === "object") {
    return {
      aan: !!raw.aan,
      trigger: typeof raw.trigger === "string" ? raw.trigger : "",
      map: (typeof raw.map === "string" && raw.map.trim()) ? raw.map.trim() : (legacyMap || standaardMap),
      bestandsnaam: typeof raw.bestandsnaam === "string" ? raw.bestandsnaam : "",
    };
  }
  if (soortKey === "dividend") return { aan: true, trigger: "dividendbelasting", map: legacyMap || standaardMap, bestandsnaam: "" };
  if (soortKey === "notulen") return { aan: true, trigger: "", map: legacyMap || standaardMap, bestandsnaam: "" };
  if (soortKey === "liquidatie") return { aan: true, trigger: "", map: legacyMap || standaardMap, bestandsnaam: "" };
  return { aan: false, trigger: "", map: standaardMap, bestandsnaam: "" };
}

module.exports = { haalInstellingen, werkInstellingenBij, resolveBijlageConfig };
