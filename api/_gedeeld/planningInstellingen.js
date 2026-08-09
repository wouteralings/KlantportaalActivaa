/**
 * Beheerbare lijsten voor de Planningsmodule: de activiteiten (maand-/jaaractiviteiten) en de
 * statussen die een planningsregel kan hebben. Op verzoek van Wouter (07-08-2026) volledig in
 * Beheer zelf te beheren ("Ik wil in beheerscherm zelf deze statussen kunnen maken").
 *
 * Zelfde opslag-patroon als api/_gedeeld/contractenTypes.js: Azure Blob Storage, container
 * portaalcontent, blob planning-instellingen.json. Structuur:
 *   {
 *     activiteiten: [ { sleutel, label, type: "maand"|"jaar", actief } ],
 *     statussen:    [ { sleutel, label, kleur, actief } ]
 *   }
 *
 *   - sleutel : stabiele, machine-leesbare waarde die in dbo.planning_klanten.activiteit resp.
 *               .status wordt opgeslagen (bestaande regels blijven geldig, ook als het label
 *               later wijzigt). Afgeleid van het label bij het aanmaken.
 *   - label   : de weergavenaam.
 *   - type    : (alleen bij activiteiten) "maand" of "jaar" — bepaalt onder welke noemer de
 *               activiteit valt (maandplanning vs. jaarplanning).
 *   - kleur   : (alleen bij statussen) hex-kleur voor de badge in het overzicht.
 *   - actief  : staat het item nog in de keuzelijst voor NIEUWE planningsregels? Uitzetten i.p.v.
 *               verwijderen, zodat bestaande regels met dat item geldig blijven en hun label tonen.
 *
 * Bij de eerste aanroep (nog geen blob) wordt geseed met een sensibele startlijst (de Offsoo-
 * achtige activiteiten en Te doen/Bezig/Wacht op klant/Gereed), zodat er meteen mee te werken is.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "planning-instellingen.json";
let cachedContainerClient = null;

// De rollen waaraan een activiteit gekoppeld kan worden (het "Type" dat de activiteit uitvoert).
// De sleutel matcht een rol-persoon die /api/beheer-klanten per klant teruggeeft (uit Dynamics),
// zodat de planning automatisch het TEAM van de klant toewijst. Vrij per activiteit te kiezen.
// 'backoffice' en 'backup' hebben geen vaste rol-persoon per klant in /api/beheer-klanten; activiteiten
// met die rol krijgen dus geen automatische team-toewijzing en wijs je handmatig toe.
const GELDIGE_ROLLEN = ["assistent", "manager", "accountant", "fiscaal", "loonadministratie", "backoffice", "backup"];

const STANDAARD_ACTIVITEITEN = [
  { sleutel: "administratie", label: "Administratie", type: "maand", rol: "assistent", actief: true },
  { sleutel: "controle-administratie", label: "Controle administratie", type: "maand", rol: "manager", actief: true },
  { sleutel: "rapportage", label: "Rapportage", type: "maand", rol: "assistent", actief: true },
  { sleutel: "omzetbelasting", label: "Omzetbelasting", type: "maand", rol: "assistent", actief: true },
  { sleutel: "icp-aangifte", label: "ICP Aangifte", type: "maand", rol: "assistent", actief: true },
  { sleutel: "aangifte-ioss", label: "Aangifte iOSS", type: "maand", rol: "assistent", actief: true },
  { sleutel: "aangifte-oss", label: "Aangifte OSS", type: "maand", rol: "assistent", actief: true },
  { sleutel: "overige-klanthandelingen", label: "Overige klanthandelingen", type: "maand", rol: "assistent", actief: true },
  { sleutel: "hcm", label: "HCM", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "planning", label: "Planning", type: "jaar", rol: "manager", actief: true },
  { sleutel: "interim-controle", label: "Interim controle", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "concept-jaarrekening", label: "Concept jaarrekening", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "definitieve-jaarrekening", label: "Definitieve jaarrekening", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "publicatiestukken", label: "Publicatiestukken", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "aangifte-vennootschapsbelasting", label: "Aangifte vennootschapsbelasting", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "sbr", label: "SBR", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "bijlage-wuo", label: "Bijlage WUO", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "aangifte-inkomstenbelasting", label: "Aangifte inkomstenbelasting", type: "jaar", rol: "fiscaal", actief: true },
  { sleutel: "rapport-4400", label: "Rapport 4400", type: "jaar", rol: "accountant", actief: true },
  { sleutel: "rapport-2400", label: "Rapport 2400", type: "jaar", rol: "accountant", actief: true },
];

const STANDAARD_STATUSSEN = [
  { sleutel: "te-doen", label: "Te doen", kleur: "#8A9089", actief: true },
  { sleutel: "bezig", label: "Bezig", kleur: "#A9660C", actief: true },
  { sleutel: "wacht-op-klant", label: "Wacht op klant", kleur: "#1C5D8C", actief: true },
  { sleutel: "gereed", label: "Gereed", kleur: "#2E7D46", actief: true },
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

function maakSleutel(tekst) {
  return String(tekst || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function tekst(v, max = 100) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function geldigeKleur(v) {
  const s = String(v || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "#8A9089";
}

/** Standaard-uren van een activiteit: een getal ≥ 0 of null (= geen standaard ingesteld). */
function urenOfNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normaliseerActiviteiten(lijst) {
  if (!Array.isArray(lijst)) return [];
  const gezien = new Set();
  const uit = [];
  for (const t of lijst.slice(0, 200)) {
    const label = tekst(t && t.label, 100);
    if (!label) continue;
    let sleutel = maakSleutel((t && t.sleutel) || label);
    if (!sleutel || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const rol = GELDIGE_ROLLEN.includes(t && t.rol) ? t.rol : "";
    // standaardUren = de standaard indicatie-uren van deze activiteit. Per klant overschrijfbaar
    // (planning_config_klanten.indicatie_uren); leeg per klant = erf deze standaard.
    uit.push({ sleutel, label, type: (t && t.type) === "jaar" ? "jaar" : "maand", rol, standaardUren: urenOfNull(t && t.standaardUren), actief: t && t.actief === false ? false : true });
  }
  return uit;
}

function normaliseerStatussen(lijst) {
  if (!Array.isArray(lijst)) return [];
  const gezien = new Set();
  const uit = [];
  for (const t of lijst.slice(0, 200)) {
    const label = tekst(t && t.label, 60);
    if (!label) continue;
    let sleutel = maakSleutel((t && t.sleutel) || label);
    if (!sleutel || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ sleutel, label, kleur: geldigeKleur(t && t.kleur), actief: t && t.actief === false ? false : true });
  }
  return uit;
}

/** Volledige instellingen (incl. niet-actieve items) — voor het beheerscherm en voor validatie. */
async function haalInstellingen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) {
    return { activiteiten: STANDAARD_ACTIVITEITEN, statussen: STANDAARD_STATUSSEN, uitgeslotenMedewerkers: [] };
  }
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    const activiteiten = normaliseerActiviteiten(data && data.activiteiten);
    const statussen = normaliseerStatussen(data && data.statussen);
    return {
      activiteiten: activiteiten.length ? activiteiten : STANDAARD_ACTIVITEITEN,
      statussen: statussen.length ? statussen : STANDAARD_STATUSSEN,
      uitgeslotenMedewerkers: normaliseerUitgesloten(data && data.uitgeslotenMedewerkers),
    };
  } catch {
    return { activiteiten: STANDAARD_ACTIVITEITEN, statussen: STANDAARD_STATUSSEN, uitgeslotenMedewerkers: [] };
  }
}

/** Normaliseert de uitgesloten-medewerkers-lijst naar [{ email, naam, reden }], ontdubbeld op e-mail.
 *  Backward-compat: een lijst met kale e-mailstrings wordt omgezet naar objecten zonder reden. */
function normaliseerUitgesloten(lijst) {
  const gezien = new Set();
  const uit = [];
  for (const item of Array.isArray(lijst) ? lijst : []) {
    const obj = typeof item === "string" ? { email: item } : (item || {});
    const email = String(obj.email || "").trim().toLowerCase();
    if (!email || gezien.has(email)) continue;
    gezien.add(email);
    uit.push({ email, naam: tekst(obj.naam, 200), reden: tekst(obj.reden, 300) });
  }
  return uit;
}

async function haalActieveActiviteiten() {
  return (await haalInstellingen()).activiteiten.filter((a) => a.actief);
}

async function haalActieveStatussen() {
  return (await haalInstellingen()).statussen.filter((s) => s.actief);
}

/** E-mailadressen van medewerkers die uit de planning-bezetting worden gelaten (bijv. secretaresses,
 *  loonadministratie) — beheerd in Beheer → Planning. */
async function haalUitgeslotenMedewerkers() {
  return (await haalInstellingen()).uitgeslotenMedewerkers || [];
}

async function zetInstellingen({ activiteiten, statussen, uitgeslotenMedewerkers }) {
  const schoon = {
    activiteiten: normaliseerActiviteiten(activiteiten),
    statussen: normaliseerStatussen(statussen),
    uitgeslotenMedewerkers: normaliseerUitgesloten(uitgeslotenMedewerkers),
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(schoon, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

/** Of 'sleutel' een geldige (bekende) activiteit is — incl. niet-actieve (bewerken van een oude
 *  regel met een inmiddels uitgezette activiteit blijft dan werken). */
async function magActiviteit(sleutel) {
  const s = maakSleutel(sleutel);
  if (!s) return false;
  return (await haalInstellingen()).activiteiten.some((a) => a.sleutel === s);
}

/** Of 'sleutel' een geldige (bekende) status is. Een lege status is toegestaan (nog geen status). */
async function magStatus(sleutel) {
  const s = maakSleutel(sleutel);
  if (!s) return true;
  return (await haalInstellingen()).statussen.some((st) => st.sleutel === s);
}

module.exports = {
  haalInstellingen, haalActieveActiviteiten, haalActieveStatussen, haalUitgeslotenMedewerkers, zetInstellingen,
  magActiviteit, magStatus, maakSleutel, GELDIGE_ROLLEN, STANDAARD_ACTIVITEITEN, STANDAARD_STATUSSEN,
};
