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
  if (!bestaat) return { medewerkersGroepId: "", medewerkersGroepNaam: "", googleReviewUrl: "", teamsChatUrl: "", whatsappUrl: "", copilotEmbedUrl: "", logoUrl: "", faviconUrl: "", wijzigingFormNawUrl: "", wijzigingFormContactUrl: "", taaksoorten: {}, taakAfwijzingWebhookUrl: "", reviewWebhookUrl: "", facturatiemodulePrijs: 5, urenmodulePrijs: 2.5, rapportagesmodulePrijs: 7.5, bezittingenmodulePrijs: 5, rittenmodulePrijs: 1.5, contractenmodulePrijs: 2.5, contractenSharepointOpslag: false, contractenSharepointMap: "Contracten", contractenReminderAfzender: "", contractenReminderOnderwerp: "", contractenReminderTekst: "", klantoverzicht: { extraKolommen: [], standaardVerborgen: [] }, dossierIndeling: { ib: standaardIndelingIB() }, aangifteBestandsnaamTemplate: "Aangifte inkomstenbelasting {jaar} - {klant}.pdf", aangifteMailOnderwerpTemplate: STANDAARD_AANGIFTE_MAIL_ONDERWERP, aangifteMailTekstTemplate: STANDAARD_AANGIFTE_MAIL_TEKST, dossierExtraKolommen: { ib: [], vpb: [] }, contactpersonenExtraKolommen: [] };

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
    // Extra (door Beheer zelf toegevoegde) Dynamics-velden als kolom in de hoofdtabellen
    // Inkomstenbelasting/Vennootschapsbelasting — zelfde vorm als klantoverzicht.extraKolommen
    // hierboven, maar per dossiersoort (andere entiteit/velden per soort, zie api/_gedeeld/dossiers.js).
    dossierExtraKolommen: { ib: [], vpb: [] },
    // Zelfde idee voor het contactpersonen-overzicht (zie api/beheer-contactpersonen).
    contactpersonenExtraKolommen: [],
    ...JSON.parse(tekst),
  };
}

async function werkInstellingenBij(velden) {
  const huidig = await haalInstellingen();
  const nieuw = { ...huidig, ...velden };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(nieuw, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return nieuw;
}

module.exports = { haalInstellingen, werkInstellingenBij };
