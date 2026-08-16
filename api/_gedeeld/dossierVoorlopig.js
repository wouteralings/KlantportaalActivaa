/**
 * Voorlopige aangifte: een aangifte die bewust nog niet definitief is — bijvoorbeeld omdat de
 * jaarcijfers van de onderneming er nog niet zijn. Om te voorkomen dat zo'n dossier stilletjes
 * blijft hangen, dwingt deze module drie dingen af bij het markeren:
 *
 *   1) een REDEN uit de lijst die je in Beheer → Dossiers zelf beheert,
 *   2) een verplichte TOELICHTING (vrije tekst),
 *   3) een verplichte HERZIENINGSDATUM, waar meteen een taak van wordt gemaakt.
 *
 * Die herzieningstaak draagt de dossierkoppeling `[dossier-ref: <soort>:<id>|voorlopig]` (zie
 * dossierTaakketen.js), zodat je er vanuit het Taken-overzicht met één klik het dossier bij pakt en
 * de markering automatisch op "herzien" gaat zodra de taak wordt afgerond.
 *
 * Opslag: Azure Blob Storage, container portaalcontent, blob dossier-voorlopig.json — gesleuteld op
 * "<soort>|<dossierId>", zodat er per dossier één lopende registratie is. Afgehandelde registraties
 * blijven bewaard (historie: wie, wanneer, waarom en of het herzien is).
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const { haalInstellingen } = require("./instellingen");
const { SOORTEN, haalEenDossier, werkDossierBij } = require("./dossiers");
const dossierTaakketen = require("./dossierTaakketen");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "dossier-voorlopig.json";
let cachedContainerClient = null;

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
async function leesAlles() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const obj = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
async function schrijfAlles(obj) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(obj), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

const tekst = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const sleutelVan = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const dossierSleutel = (soort, id) => `${String(soort || "").toLowerCase()}|${String(id || "").trim().toLowerCase()}`;

// ── Beheer-instellingen per dossiersoort ────────────────────────────────────
const STANDAARD_REDENEN = [
  { sleutel: "jaarcijfers-onderneming", label: "Wacht op jaarcijfers onderneming", actief: true },
  { sleutel: "buitenlands-inkomen", label: "Buitenlands inkomen nog onbekend", actief: true },
  { sleutel: "ontbrekende-stukken", label: "Ontbrekende stukken van de cliënt", actief: true },
  { sleutel: "teruggaaf-versnellen", label: "Teruggaaf versnellen", actief: true },
];

const STANDAARD_VOORLOPIG = {
  aan: false,
  redenen: STANDAARD_REDENEN,
  status: null,          // dossierstatus bij het markeren als voorlopig
  taakSoort: null,       // soort van de herzieningstaak (verplicht om de knop te laten werken)
  taakOnderwerp: "Moet de voorlopige aangifte {soort} {periode} herzien worden?",
  taakRubriek: null,
  // De herziening wordt niet per dossier ingepland maar op een VASTE JAARLIJKSE DATUM uitgevraagd bij
  // de cliënt — standaard 1 december. Zit die datum dit jaar nog voor ons, dan is het dit jaar;
  // anders die van volgend jaar. Zo vallen alle herzieningen op hetzelfde moment samen.
  herzienDag: 1,
  herzienMaand: 12,
};

function getalOfNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normaliseerRedenen(lijst) {
  if (!Array.isArray(lijst)) return [];
  const gezien = new Set();
  const uit = [];
  for (const r of lijst.slice(0, 50)) {
    const label = tekst(r && r.label, 120);
    if (!label) continue;
    const sleutel = sleutelVan((r && r.sleutel) || label);
    if (!sleutel || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ sleutel, label, actief: r && r.actief === false ? false : true });
  }
  return uit;
}

function normaliseerVoorlopigConfig(ruw) {
  const r = ruw && typeof ruw === "object" ? ruw : {};
  const redenen = normaliseerRedenen(r.redenen);
  const dag = getalOfNull(r.herzienDag);
  const maand = getalOfNull(r.herzienMaand);
  return {
    aan: r.aan === true,
    // Een bewust lege lijst blijft leeg; alleen een ontbrekende lijst krijgt de startset.
    redenen: Array.isArray(r.redenen) ? redenen : STANDAARD_REDENEN,
    status: getalOfNull(r.status),
    taakSoort: getalOfNull(r.taakSoort),
    taakOnderwerp: tekst(r.taakOnderwerp, 300) || STANDAARD_VOORLOPIG.taakOnderwerp,
    taakRubriek: getalOfNull(r.taakRubriek),
    herzienDag: dag !== null && dag >= 1 && dag <= 31 ? Math.round(dag) : 1,
    herzienMaand: maand !== null && maand >= 1 && maand <= 12 ? Math.round(maand) : 12,
  };
}

/**
 * De eerstvolgende vaste herzieningsdatum: dag/maand uit Beheer, dit jaar als die datum nog niet
 * geweest is, anders volgend jaar. Een dag die in die maand niet bestaat (bijv. 31 februari) valt
 * terug op de laatste dag van de maand.
 *
 * @param {{herzienDag:number, herzienMaand:number}} cfg
 * @param {Date} [vanaf] referentiemoment (standaard nu) — als parameter voor de testbaarheid
 */
function volgendeHerzieningsdatum(cfg, vanaf) {
  const nu = vanaf ? new Date(vanaf) : new Date();
  const dag = cfg && cfg.herzienDag >= 1 && cfg.herzienDag <= 31 ? cfg.herzienDag : 1;
  const maand = cfg && cfg.herzienMaand >= 1 && cfg.herzienMaand <= 12 ? cfg.herzienMaand : 12;
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const maak = (jaar) => {
    const laatste = new Date(jaar, maand, 0).getDate(); // dag 0 van de volgende maand = laatste dag
    return new Date(jaar, maand - 1, Math.min(dag, laatste));
  };
  let d = maak(nu.getFullYear());
  if (d < vandaag) d = maak(nu.getFullYear() + 1);
  return d;
}

function normaliseerAlleVoorlopigConfig(ruw) {
  const uit = {};
  for (const [soort, cfg] of Object.entries(ruw && typeof ruw === "object" ? ruw : {})) {
    const key = tekst(soort, 20).toLowerCase();
    if (key) uit[key] = normaliseerVoorlopigConfig(cfg);
  }
  return uit;
}

async function instellingenVoorSoort(soortKey) {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const alle = normaliseerAlleVoorlopigConfig(instellingen && instellingen.dossierVoorlopig);
  return alle[String(soortKey || "").toLowerCase()] || { ...STANDAARD_VOORLOPIG };
}

// ── Registratie per dossier ─────────────────────────────────────────────────
async function haalAlle() {
  return leesAlles();
}

/** De (laatste) voorlopige-aangifte-registratie van een dossier, of null. */
async function haalVoorDossier(soortKey, dossierId) {
  const alle = await leesAlles();
  return alle[dossierSleutel(soortKey, dossierId)] || null;
}

/** Registreert een dossier als voorlopige aangifte. */
async function zetVoorlopig(registratie) {
  const key = dossierSleutel(registratie && registratie.dossierSoort, registratie && registratie.dossierId);
  if (!key.includes("|") || key.endsWith("|")) throw new Error("VALIDATIE: soort en dossier-id zijn verplicht.");
  const alle = await leesAlles();
  alle[key] = {
    dossierSoort: String(registratie.dossierSoort || "").toLowerCase(),
    dossierId: String(registratie.dossierId || "").trim(),
    accountId: String(registratie.accountId || "").toLowerCase(),
    klantnaam: tekst(registratie.klantnaam, 200),
    periode: tekst(registratie.periode, 40),
    redenSleutel: sleutelVan(registratie.redenSleutel),
    redenLabel: tekst(registratie.redenLabel, 120),
    toelichting: tekst(registratie.toelichting, 4000),
    herzienOp: tekst(registratie.herzienOp, 40),
    taakId: String(registratie.taakId || "").toLowerCase(),
    doorEmail: tekst(registratie.doorEmail, 200).toLowerCase(),
    doorNaam: tekst(registratie.doorNaam, 200),
    aangemaaktOp: new Date().toISOString(),
    status: "open",
    herzienDoor: "",
    herzienDatum: "",
  };
  await schrijfAlles(alle);
  return alle[key];
}

/** Markeert de registratie als herzien (de herzieningstaak is afgerond). */
async function markeerHerzien(soortKey, dossierId, door) {
  const key = dossierSleutel(soortKey, dossierId);
  const alle = await leesAlles();
  if (!alle[key] || alle[key].status !== "open") return null;
  alle[key] = { ...alle[key], status: "herzien", herzienDoor: tekst(door, 200).toLowerCase(), herzienDatum: new Date().toISOString() };
  await schrijfAlles(alle);
  return alle[key];
}

/** Haalt de markering helemaal weg (bijv. als de aangifte alsnog definitief wordt ingediend). */
async function wisVoorlopig(soortKey, dossierId) {
  const key = dossierSleutel(soortKey, dossierId);
  const alle = await leesAlles();
  if (!alle[key]) return false;
  delete alle[key];
  await schrijfAlles(alle);
  return true;
}

/**
 * Wordt aangeroepen zodra een medewerker een taak afrondt: is het de herzieningstaak van een
 * voorlopige aangifte, dan gaat de registratie op "herzien". Best-effort.
 */
async function naHerzieningstaakAfgerond({ context, omschrijving, door }) {
  try {
    const ref = dossierTaakketen.leesRef(omschrijving);
    if (!ref || ref.fase !== "voorlopig") return { gedaan: false };
    const bijgewerkt = await markeerHerzien(ref.soort, ref.id, door);
    return { gedaan: !!bijgewerkt, soort: ref.soort, dossierId: ref.id };
  } catch (err) {
    if (context && context.log && context.log.error) context.log.error("Voorlopige aangifte op herzien zetten mislukt (de taak is wél afgerond):", err);
    return { gedaan: false };
  }
}

// ── Taak aanmaken ───────────────────────────────────────────────────────────
// Bewust een eigen kopie i.p.v. lenen uit dossierReview.js: deze module moet op zichzelf kunnen
// draaien. Leende hij die functie, dan zou een deploy waarin dossierReview.js een oudere versie is
// hier een "is not a function"-fout opleveren — precies de 500 die we anders niet zien aankomen.
const TAAK_SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const TAAK_KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const TAAK_RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";

/** Vult {klant}/{periode}/{jaar}/{soort} in een onderwerp-sjabloon in. */
function vulSjabloonIn(sjabloon, velden) {
  let uit = String(sjabloon || "").trim();
  for (const [k, v] of Object.entries(velden || {})) uit = uit.replaceAll(`{${k}}`, v == null ? "" : String(v));
  return uit.replace(/\s{2,}/g, " ").replace(/\s+—\s*$/, "").trim();
}

/** Leesbare periode van een dossier: jaar, boekjaar ("2025–2026") of datum (notulen). */
function periodeTekst(dossier) {
  if (!dossier) return "";
  if (dossier.jaar !== null && dossier.jaar !== undefined && dossier.jaar !== "") return String(dossier.jaar);
  const jaarVan = (x) => { const d = x ? new Date(x) : null; return d && !isNaN(d.getTime()) ? d.getFullYear() : null; };
  const van = jaarVan(dossier.begindatum);
  const tot = jaarVan(dossier.einddatum);
  if (van && tot) return van === tot ? String(van) : `${van}–${tot}`;
  const datum = dossier.begindatum || dossier.einddatum || "";
  if (!datum) return "";
  const d = new Date(datum);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL");
}

/** Maakt één taak aan in Dynamics en geeft het activityid terug. Gooit door bij een fout. */
async function maakTaak(resource, token, { subject, description, accountId, soortWaarde, rubriekWaarde, eigenaarId, deadline }) {
  const body = {
    subject: tekst(subject, 400) || "Voorlopige aangifte herzien",
    description: String(description || "").slice(0, 100000),
  };
  if (accountId) body[`${TAAK_KLANT_VELD}@odata.bind`] = `/accounts(${accountId})`;
  if (TAAK_SOORT_VELD && soortWaarde !== null && soortWaarde !== undefined && soortWaarde !== "") {
    const n = Number(soortWaarde);
    if (Number.isFinite(n)) body[TAAK_SOORT_VELD] = n;
  }
  if (TAAK_RUBRIEK_VELD && rubriekWaarde !== null && rubriekWaarde !== undefined && rubriekWaarde !== "") {
    const n = Number(rubriekWaarde);
    if (Number.isFinite(n)) body[TAAK_RUBRIEK_VELD] = n;
  }
  if (eigenaarId) body["ownerid@odata.bind"] = `/systemusers(${eigenaarId})`;
  if (deadline) body.scheduledend = deadline;

  const res = await fetch(`${resource}/api/data/v9.2/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Aanmaken herzieningstaak mislukt (${res.status}): ${await res.text()}`);
  return (await res.json().catch(() => ({}))).activityid || "";
}

module.exports = {
  STANDAARD_VOORLOPIG, STANDAARD_REDENEN,
  vulSjabloonIn, periodeTekst, maakTaak,
  normaliseerVoorlopigConfig, normaliseerAlleVoorlopigConfig, instellingenVoorSoort, volgendeHerzieningsdatum,
  haalAlle, haalVoorDossier, zetVoorlopig, markeerHerzien, wisVoorlopig, naHerzieningstaakAfgerond,
  // Doorgeven zodat aanroepers één module hoeven te kennen.
  SOORTEN, haalEenDossier, werkDossierBij,
};
