/**
 * Beheerbare configuratie van de Brieven-module (medewerkersportaal → Klantoverzicht → Brieven) —
 * gebouwd 05-08-2026 op verzoek van Wouter ("Kan je onder klantenoverzicht een tab brieven maken?
 * We willen snel standaard brieven kunnen genereren en voorbeeld brief altijd in scherm zien.").
 *
 * Zelfde opslag-patroon als contractenTypes.js / aanleveronderwerpen.js: Azure Blob Storage,
 * container portaalcontent, blob brief-sjablonen.json. In één blob bewaard:
 *
 *   { afzender, sharepointMap, sjablonen: [ { id, naam, onderwerp, tekst, actief } ] }
 *
 *   - afzender      : de vaste briefpapier-/afzendergegevens van Activaa (bedrijfsnaam, adres,
 *                     contact, standaard afsluiting + wie de brief standaard ondertekent). Deze
 *                     komen boven- en onderaan elke brief te staan.
 *   - sharepointMap : submap in het SharePoint-klantdossier waar een opgeslagen brief terechtkomt
 *                     (zelfde mechanisme als de contract-dossierkopie, contractenSharepoint.js).
 *   - sjablonen     : de standaardbrieven. `onderwerp` en `tekst` mogen merge-placeholders zoals
 *                     {{klantnaam}}, {{contactpersoon}}, {{relatiebeheerder}} bevatten; die worden
 *                     in de frontend ingevuld met de Dynamics-gegevens van de gekozen klant (zie
 *                     src/medewerker/klanten/BrievenOverzicht.jsx → PLACEHOLDERS). De backend
 *                     rendert alleen de al-ingevulde tekst (briefRenderer.js) en weet dus niets van
 *                     placeholders af.
 *
 * Bij de eerste aanroep (nog geen blob) wordt geseed met een sensibele startset (afzender leeg in
 * te vullen in Beheer, plus vier standaardbrieven), zodat de tab meteen bruikbaar is.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "brief-sjablonen.json";
let cachedContainerClient = null;

const STANDAARD_AFZENDER = {
  bedrijfsnaam: "Activaa",
  adres: "",
  postcode: "",
  plaats: "",
  telefoon: "",
  email: "info@activaa.nl",
  website: "www.activaa.nl",
  kvk: "",
  btw: "",
  iban: "",
  beconnummer: "",
  afsluiting: "Met vriendelijke groet,",
  // Wie ondertekent standaard: "relatiebeheerder" | "accountant" | "vast" (dan ondertekenaarVast).
  ondertekenaarBron: "relatiebeheerder",
  ondertekenaarVast: "",
  voetnoot: "",
  // Briefpapier: logo + plaatsing. logoUrl wijst naar /api/media/brieflogo (zie media.js).
  logoUrl: "",
  logoUitlijning: "links", // "links" | "midden" | "rechts"
  logoGrootte: "normaal",  // "klein" | "normaal" | "groot"
  // Achtergrond (volledig briefpapier als afbeelding), wijst naar /api/media/briefachtergrond.
  achtergrondUrl: "",
  // Begeleidende e-mail bij het mailen van een brief (Beheer → Instellingen → Brieven). mailAfzender
  // leeg = val terug op GRAPH_MAIL_SENDER; mailOnderwerp leeg = onderwerp van de brief; mailTekst
  // leeg = standaard begeleidende tekst. mailOnderwerp/mailTekst mogen {{placeholders}} bevatten die
  // (net als brief-onderwerp/tekst) in de frontend met de klantgegevens worden ingevuld.
  mailAfzender: "",
  mailOnderwerp: "",
  mailTekst: "",
  // Backoffice-taak "brief printen & versturen": naar welk postvak de taak gaat (leeg = manager/
  // relatiebeheerder van de klant) + het onderwerp-sjabloon van die taak.
  backofficeEigenaarEmail: "",
  backofficeOnderwerp: "",
};

const STANDAARD_SHAREPOINT_MAP = "Brieven";

// Standaard onderwerp van de backoffice-taak (met placeholders) — startpunt in Beheer + terugval.
const STANDAARD_BACKOFFICE_ONDERWERP = "Brief printen en versturen — {{klantnaam}}";

// Standaard begeleidende mailtekst (met placeholders) — startpunt in Beheer en terugval bij het
// mailen wanneer er (nog) geen eigen tekst is ingesteld.
const STANDAARD_MAIL_TEKST =
  "Geachte heer/mevrouw,\n\n" +
  "Bijgaand ontvangt u een brief van {{afzendernaam}}. Wij verzoeken u vriendelijk kennis te nemen van de inhoud.\n\n" +
  "Heeft u vragen naar aanleiding van deze brief? Neem dan gerust contact met ons op.\n\n" +
  "Met vriendelijke groet,\n{{afzendernaam}}";

const STANDAARD_SJABLONEN = [
  {
    id: "algemene-brief",
    naam: "Algemene brief",
    onderwerp: "",
    tekst: "[Schrijf hier de inhoud van de brief.]",
    actief: true,
  },
  {
    id: "welkomstbrief",
    naam: "Welkomstbrief nieuwe cliënt",
    onderwerp: "Welkom als cliënt bij {{afzendernaam}}",
    tekst:
      "Hartelijk welkom bij {{afzendernaam}}. Wij danken u voor het in ons gestelde vertrouwen en kijken uit naar een prettige samenwerking.\n\n" +
      "Uw vaste aanspreekpunt is {{relatiebeheerder}}. U kunt met al uw vragen bij hem of haar terecht.\n\n" +
      "Wij nemen op korte termijn contact met u op om de vervolgstappen door te nemen.",
    actief: true,
  },
  {
    id: "bevestiging-dienstverlening",
    naam: "Bevestiging dienstverlening",
    onderwerp: "Bevestiging van onze dienstverlening",
    tekst:
      "Hierbij bevestigen wij de afspraken over onze dienstverlening aan {{klantnaam}} (cliëntnummer {{klantnummer}}).\n\n" +
      "[Vul hier de specifieke afspraken in.]\n\n" +
      "Mocht u nog vragen hebben, neem dan gerust contact met ons op.",
    actief: true,
  },
  {
    id: "verzoek-aanleveren-stukken",
    naam: "Verzoek aanleveren stukken",
    onderwerp: "Verzoek tot aanlevering van stukken",
    tekst:
      "Voor de verdere behandeling van uw dossier ontvangen wij graag de volgende stukken van u:\n\n" +
      "- [stuk 1]\n- [stuk 2]\n\n" +
      "Wij verzoeken u deze vóór [datum] aan te leveren. Alvast hartelijk dank voor uw medewerking.",
    actief: true,
  },
  {
    id: "wijziging-aangiftetijdvak",
    naam: "Belastingdienst — wijziging aangiftetijdvak",
    onderwerp: "Wijziging aangiftetijdvak {{soortbelasting}} {{klantnaam}}",
    tekst:
      "Namens onze cliënt {{klantnaam}} verzoeken wij om het aangiftetijdvak van de {{soortbelasting}} om te zetten naar {{periode}} aangifte.\n\n" +
      "Wij verzoeken u om het aangiftetijdvak te wijzigen per eerstvolgende mogelijke periode.\n\n" +
      "Graag ontvangen wij een schriftelijke bevestiging van het doorgeven van deze wijziging.\n\n" +
      "Wij vertrouwen erop u hiermee voldoende te hebben geïnformeerd en zijn uiteraard bereid tot nadere toelichting.",
    actief: true,
    vertrouwelijk: true,
    velden: ["soortbelasting", "periode"],
  },
];

// Beheerbare, vaste set invulvelden. Een standaardbrief kiest hieruit welke velden erbij horen
// (sjabloon.velden = lijst van sleutels); de medewerker vult/kiest ze, en ze vullen {{sleutel}} in
// onderwerp/tekst. Bewust los van Dynamics — de medewerker vult ze zelf in.
const STANDAARD_BRIEFVELDEN = [
  { sleutel: "periode", label: "Periode", type: "keuze", opties: [
    { sleutel: "maand", label: "maand" }, { sleutel: "kwartaal", label: "kwartaal" }, { sleutel: "jaar", label: "jaar" },
  ] },
  { sleutel: "soortbelasting", label: "Soort belasting", type: "keuze", opties: [
    { sleutel: "omzetbelasting", label: "omzetbelasting" }, { sleutel: "loonheffing", label: "loonheffing" },
    { sleutel: "vennootschapsbelasting", label: "vennootschapsbelasting" }, { sleutel: "inkomstenbelasting", label: "inkomstenbelasting" },
  ] },
  { sleutel: "aanslagnummer", label: "Aanslagnummer", type: "tekst", opties: [] },
];

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
  for await (const stuk of readableStream) stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  return Buffer.concat(stukken).toString("utf-8");
}

function tekst(v, max = 400) {
  return String(v == null ? "" : v).trim().slice(0, max);
}
function langeTekst(v, max = 20000) {
  // Behoud regeleinden (word-wrap gebeurt bij het renderen), knip alleen extreem lange invoer af.
  return String(v == null ? "" : v).replace(/\r\n/g, "\n").slice(0, max);
}

function maakId(bron) {
  return String(bron || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function normaliseerAfzender(a) {
  const bron = a && typeof a === "object" ? a : {};
  const bronOndertekenaar = String(bron.ondertekenaarBron || "").trim();
  const ondertekenaarBron = ["relatiebeheerder", "accountant", "vast"].includes(bronOndertekenaar)
    ? bronOndertekenaar
    : "relatiebeheerder";
  const logoUitlijning = ["links", "midden", "rechts"].includes(bron.logoUitlijning) ? bron.logoUitlijning : "links";
  const logoGrootte = ["klein", "normaal", "groot"].includes(bron.logoGrootte) ? bron.logoGrootte : "normaal";
  // Alleen een eigen media-route toestaan als logoUrl (geen externe URL's) — defensief.
  const logoUrlRuw = tekst(bron.logoUrl, 300);
  const logoUrl = /^\/api\/media\/[a-z0-9_-]+(\?.*)?$/i.test(logoUrlRuw) ? logoUrlRuw : "";
  const achtergrondRuw = tekst(bron.achtergrondUrl, 300);
  const achtergrondUrl = /^\/api\/media\/[a-z0-9_-]+(\?.*)?$/i.test(achtergrondRuw) ? achtergrondRuw : "";
  // Afzender-mailadres voor brieven: alleen een geldig ogend e-mailadres toestaan (anders leeg =
  // terugval op GRAPH_MAIL_SENDER). Het postvak moet in Entra Mail.Send-rechten hebben.
  const mailAfzenderRuw = tekst(bron.mailAfzender, 160);
  const mailAfzender = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailAfzenderRuw) ? mailAfzenderRuw : "";
  // Backoffice-taak: e-mailadres van het postvak dat de taak krijgt (leeg = manager van de klant).
  const backofficeEigenaarRuw = tekst(bron.backofficeEigenaarEmail, 160);
  const backofficeEigenaarEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(backofficeEigenaarRuw) ? backofficeEigenaarRuw : "";
  return {
    bedrijfsnaam: tekst(bron.bedrijfsnaam, 120) || STANDAARD_AFZENDER.bedrijfsnaam,
    adres: tekst(bron.adres, 160),
    postcode: tekst(bron.postcode, 20),
    plaats: tekst(bron.plaats, 80),
    telefoon: tekst(bron.telefoon, 40),
    email: tekst(bron.email, 120),
    website: tekst(bron.website, 120),
    kvk: tekst(bron.kvk, 40),
    btw: tekst(bron.btw, 40),
    iban: tekst(bron.iban, 40),
    beconnummer: tekst(bron.beconnummer, 40),
    afsluiting: tekst(bron.afsluiting, 120) || STANDAARD_AFZENDER.afsluiting,
    ondertekenaarBron,
    ondertekenaarVast: tekst(bron.ondertekenaarVast, 120),
    voetnoot: tekst(bron.voetnoot, 400),
    logoUrl,
    logoUitlijning,
    logoGrootte,
    achtergrondUrl,
    briefpapierDocx: bron.briefpapierDocx === true,
    mailAfzender,
    mailOnderwerp: tekst(bron.mailOnderwerp, 300),
    mailTekst: langeTekst(bron.mailTekst, 20000),
    backofficeEigenaarEmail,
    backofficeOnderwerp: tekst(bron.backofficeOnderwerp, 300),
  };
}

/** Normaliseert de sjablonenlijst; kent een stabiel id toe waar dat ontbreekt en ontdubbelt ids. */
function normaliseerSjablonen(sjablonen) {
  if (!Array.isArray(sjablonen)) return [];
  const gezien = new Set();
  const uit = [];
  for (const s of sjablonen.slice(0, 200)) {
    const naam = tekst(s && s.naam, 120);
    if (!naam) continue;
    let id = maakId((s && s.id) || naam) || "brief";
    let uniek = id;
    let n = 2;
    while (gezien.has(uniek)) uniek = `${id}-${n++}`;
    gezien.add(uniek);
    const velden = (Array.isArray(s && s.velden) ? s.velden : [])
      .map((x) => String(x || "").toLowerCase().replace(/[^a-z0-9-]/g, ""))
      .filter(Boolean)
      .slice(0, 50);
    uit.push({
      id: uniek,
      naam,
      onderwerp: tekst(s && s.onderwerp, 300),
      tekst: langeTekst(s && s.tekst),
      actief: s && s.actief === false ? false : true,
      vertrouwelijk: s && s.vertrouwelijk === true,
      velden,
    });
  }
  return uit;
}

/** Beheerbare set invulvelden; ontdubbelt sleutels, normaliseert type + keuze-opties. */
function normaliseerBriefvelden(lijst) {
  if (!Array.isArray(lijst)) return [];
  const gezien = new Set();
  const uit = [];
  for (const v of lijst.slice(0, 200)) {
    if (!v || typeof v !== "object") continue;
    const label = tekst(v.label, 80);
    const sleutel = maakId(v.sleutel || label);
    if (!label || !sleutel || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const type = v.type === "keuze" ? "keuze" : "tekst";
    const opties = [];
    if (type === "keuze" && Array.isArray(v.opties)) {
      const gz = new Set();
      for (const o of v.opties.slice(0, 100)) {
        const ol = typeof o === "string" ? o.trim().slice(0, 80) : tekst(o && o.label, 80);
        if (!ol) continue;
        const os = maakId((o && o.sleutel) || ol);
        if (!os || gz.has(os)) continue;
        gz.add(os);
        opties.push({ sleutel: os, label: ol });
      }
    }
    uit.push({ sleutel, label, type, opties });
  }
  return uit;
}

/** Volledige configuratie (afzender + sharepointMap + sjablonen + briefvelden), voor het beheerscherm. */
async function haalConfig() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) {
    return { afzender: { ...STANDAARD_AFZENDER }, sharepointMap: STANDAARD_SHAREPOINT_MAP, sjablonen: STANDAARD_SJABLONEN, briefvelden: STANDAARD_BRIEFVELDEN };
  }
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    const sjablonen = normaliseerSjablonen(data.sjablonen);
    // briefvelden: bestaat de sleutel nog niet in het blob (oudere versie), val terug op de startset.
    const briefvelden = Array.isArray(data.briefvelden) ? normaliseerBriefvelden(data.briefvelden) : STANDAARD_BRIEFVELDEN;
    return {
      afzender: normaliseerAfzender(data.afzender),
      sharepointMap: tekst(data.sharepointMap, 80) || STANDAARD_SHAREPOINT_MAP,
      sjablonen: sjablonen.length ? sjablonen : STANDAARD_SJABLONEN,
      briefvelden,
    };
  } catch {
    return { afzender: { ...STANDAARD_AFZENDER }, sharepointMap: STANDAARD_SHAREPOINT_MAP, sjablonen: STANDAARD_SJABLONEN, briefvelden: STANDAARD_BRIEFVELDEN };
  }
}

/** Alleen wat het medewerkersportaal nodig heeft: afzender + sharepointMap + actieve sjablonen + briefvelden. */
async function haalVoorPortaal() {
  const config = await haalConfig();
  return {
    afzender: config.afzender,
    sharepointMap: config.sharepointMap,
    sjablonen: config.sjablonen.filter((s) => s.actief),
    briefvelden: config.briefvelden,
  };
}

async function zetConfig(config) {
  const schoon = {
    afzender: normaliseerAfzender(config && config.afzender),
    sharepointMap: tekst(config && config.sharepointMap, 80) || STANDAARD_SHAREPOINT_MAP,
    sjablonen: normaliseerSjablonen(config && config.sjablonen),
    briefvelden: normaliseerBriefvelden(config && config.briefvelden),
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(schoon, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

module.exports = {
  haalConfig,
  haalVoorPortaal,
  zetConfig,
  STANDAARD_AFZENDER,
  STANDAARD_SJABLONEN,
  STANDAARD_SHAREPOINT_MAP,
  STANDAARD_MAIL_TEKST,
  STANDAARD_BACKOFFICE_ONDERWERP,
};
