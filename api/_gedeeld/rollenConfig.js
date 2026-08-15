/**
 * Rollen & toegang — beheerbare rollen die bepalen welke tabs (rubrieken) een medewerker in het
 * medewerkers- en beheerdersportaal ziet, plus welke functies hij mag. Elke medewerker krijgt precies
 * één rol toegewezen (op e-mailadres). De harde beveiligingsgrens blijft de Azure/SWA-rol
 * 'medewerker'/'beheerder' (zie api/rollen); deze rollen verfijnen de toegang dáárbinnen: de tab-
 * zichtbaarheid (UI) en de al server-afgedwongen functies (bulk, als-klant, planning, offertes,
 * verwijder-rechten — via api/_gedeeld/wijzigrechten.js).
 *
 * Opslag: Azure Blob Storage (container portaalcontent, blob rollen.json):
 *   { rollen: [{ sleutel, naam, medewerkerTabs:[key], beheerTabs:[key], functies:{key:bool} }],
 *     toewijzingen: { "<email>": "<rolsleutel>" } }
 *
 * FASE 1 (dit bestand + beheer-rollen + RollenBeheer.jsx): rollen aanmaken/bewerken en toewijzen —
 * puur additief, nog geen afdwinging. Latere fases lezen dit om tabs te verbergen en de functies te
 * voeden.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "rollen.json";
let cachedContainerClient = null;

// De tabs van het medewerkersportaal (sleutel = de tab-key in MedewerkerPortaal.jsx).
const MEDEWERKER_TABS = [
  { key: "klantoverzicht", label: "Klantoverzicht" },
  { key: "taken", label: "Taken" },
  { key: "postboek", label: "Postboek" },
  { key: "mijnwerk", label: "Mijn werk" },
  { key: "planning", label: "Planning" },
  { key: "vragenlijsten", label: "Vragenlijsten" },
  { key: "uren", label: "Uren" },
  { key: "verzoeken", label: "Wijzigingsverzoeken" },
  { key: "reviews", label: "Reviews" },
  { key: "offertes", label: "Offertes" },
];

// De tabs van het beheerdersportaal (sleutel = de tab-key in BeheerPortaal.jsx).
const BEHEER_TABS = [
  { key: "content", label: "Berichten" },
  { key: "faq", label: "FAQ" },
  { key: "taken", label: "Taken" },
  { key: "medewerkers", label: "Medewerkers" },
  { key: "gastaccounts", label: "Gastaccounts" },
  { key: "facturatie", label: "Functies" },
  { key: "planning", label: "Planning" },
  { key: "offertes", label: "Offertes" },
  { key: "brieven", label: "Brieven" },
  { key: "aanleveren", label: "Uitvraag" },
  { key: "uren", label: "Uren" },
  { key: "dossiers", label: "Dossiers" },
  { key: "postboek", label: "Postboek" },
  { key: "instellingen", label: "Instellingen" },
];

// Losse functies (rechten) die aan een rol gekoppeld kunnen worden. De sleutels sluiten aan op
// api/_gedeeld/wijzigrechten.js zodat latere fases ze server-side kunnen voeden.
const FUNCTIES = [
  { key: "wijzigen", label: "Klantgegevens wijzigen" },
  { key: "bulk", label: "Bulk wijzigen" },
  { key: "alsKlant", label: "Als klant kijken (meekijken)" },
  { key: "planning", label: "Planning aanpassen" },
  { key: "offertes", label: "Offertes maken" },
  { key: "contracten", label: "Contracten zien" },
];

// Verwijder-functies die vroeger als losse pill in de FUNCTIES-sectie stonden. Ze zijn daar weggehaald:
// verwijderen stel je nu per subpagina in met de Verwijderen-schakelaar (verwijderSubTabs), dezelfde bron
// die bulk-verwijderen al gebruikt — zo kan een rol niet meer wél bulk maar géén los verwijderen.
// De sleutels blijven hier staan zodat schoonFuncties() ze NIET wegsaneert bij een volgende opslag: dan
// zou een bestaande rol z'n oude recht kwijtraken vóór de migratie hieronder is gedraaid. De terugval
// blijft ook server-side bestaan (zie de OR in api/_gedeeld/wijzigrechten.js).
const LEGACY_VERWIJDER_FUNCTIES = {
  verwijderIb: "klantoverzicht.ib",
  verwijderVpb: "klantoverzicht.vpb",
  verwijderContactpersonen: "klantoverzicht.contactpersonen",
};

// Subpagina's (sub-tabbladen) binnen de medewerker-rubrieken die sub-navigatie hebben. Sleutel =
// "<rubriek>.<sub>", parent = de medewerker-tab-key. Hiermee kan een rol per subpagina apart geregeld
// worden: uit/lezen/bewerken + verwijderen + bulk-verwijderen. Een rubriek zonder subpagina-config
// gedraagt zich als voorheen (de subpagina's erven dan de rechten van de hoofd-rubriek).
const MEDEWERKER_SUBTABS = [
  { key: "klantoverzicht.klanten", parent: "klantoverzicht", label: "Klanten" },
  { key: "klantoverzicht.contactpersonen", parent: "klantoverzicht", label: "Contactpersonen" },
  { key: "klantoverzicht.brieven", parent: "klantoverzicht", label: "Brieven" },
  { key: "klantoverzicht.contracten", parent: "klantoverzicht", label: "Contracten" },
  { key: "klantoverzicht.ib", parent: "klantoverzicht", label: "Inkomstenbelasting" },
  { key: "klantoverzicht.vpb", parent: "klantoverzicht", label: "Vennootschapsbelasting" },
  { key: "klantoverzicht.dividend", parent: "klantoverzicht", label: "Dividenduitkeringen" },
  { key: "klantoverzicht.notulen", parent: "klantoverzicht", label: "Notulen" },
  { key: "klantoverzicht.lonen", parent: "klantoverzicht", label: "Lonen" },
  { key: "uren.schrijven", parent: "uren", label: "Schrijven" },
  { key: "uren.verlof", parent: "uren", label: "Verlof" },
  { key: "uren.verlofgoedkeuren", parent: "uren", label: "Verlof goedkeuren" },
  { key: "uren.vakantieoverzicht", parent: "uren", label: "Vakantieoverzicht" },
  { key: "uren.goedkeuren", parent: "uren", label: "Goedkeuren" },
  { key: "uren.controle", parent: "uren", label: "Facturatiecontrole" },
  { key: "uren.facturatie", parent: "uren", label: "Facturatie" },
  { key: "uren.rapportage", parent: "uren", label: "Rapportage" },
  { key: "uren.bezetting", parent: "uren", label: "Bezetting" },
  { key: "planning.maand", parent: "planning", label: "Maand" },
  { key: "planning.jaar", parent: "planning", label: "Jaar" },
  { key: "planning.deel", parent: "planning", label: "Deelactiviteiten" },
  { key: "planning.config", parent: "planning", label: "Config per klant" },
  { key: "planning.overzicht", parent: "planning", label: "Overzicht" },
];

const MEDEWERKER_TAB_KEYS = new Set(MEDEWERKER_TABS.map((t) => t.key));
const BEHEER_TAB_KEYS = new Set(BEHEER_TABS.map((t) => t.key));
const FUNCTIE_KEYS = new Set(FUNCTIES.map((f) => f.key));
const MEDEWERKER_SUBTAB_KEYS = new Set(MEDEWERKER_SUBTABS.map((t) => t.key));

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
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
function tekst(v, max = 80) { return String(v == null ? "" : v).trim().slice(0, max); }

function schoonTabs(lijst, geldige) {
  return [...new Set((Array.isArray(lijst) ? lijst : []).map((k) => String(k || "").trim()).filter((k) => geldige.has(k)))];
}
function schoonFuncties(obj) {
  const uit = {};
  const bron = obj && typeof obj === "object" ? obj : {};
  for (const k of FUNCTIE_KEYS) if (bron[k]) uit[k] = true;
  // Oude verwijder-vlaggen bewaren we ongemoeid (ze staan niet meer in FUNCTIES, zie daar): weggooien
  // zou een bestaande rol z'n verwijderrecht afnemen zodra iemand de rollen opnieuw opslaat.
  for (const k of Object.keys(LEGACY_VERWIJDER_FUNCTIES)) if (bron[k]) uit[k] = true;
  return uit;
}

function normaliseerRollen(lijst) {
  if (!Array.isArray(lijst)) return [];
  const gezien = new Set();
  const uit = [];
  for (const r of lijst.slice(0, 100)) {
    const naam = tekst(r && r.naam, 80);
    if (!naam) continue;
    let sleutel = maakSleutel((r && r.sleutel) || naam);
    if (!sleutel || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const mwTabs = schoonTabs(r && r.medewerkerTabs, MEDEWERKER_TAB_KEYS);
    const mwSet = new Set(mwTabs);
    // bewerkTabs = de medewerker-tabs (rubrieken) die de rol mag BEWERKEN; de rest is alleen-lezen.
    // Altijd een deelverzameling van de zichtbare medewerker-tabs (onbekende/niet-zichtbare keys weg).
    const bewerkTabs = schoonTabs(r && r.bewerkTabs, MEDEWERKER_TAB_KEYS).filter((k) => mwSet.has(k));
    // verwijderTabs = de medewerker-rubrieken waarin de rol mag VERWIJDEREN (een losse schakelaar,
    // náást bewerken). Alleen zinvol op een zichtbare rubriek → altijd een deelverzameling van de
    // zichtbare medewerker-tabs. Het knijpt bestaande verwijderrechten dicht (UI), het opent ze niet.
    const verwijderTabs = schoonTabs(r && r.verwijderTabs, MEDEWERKER_TAB_KEYS).filter((k) => mwSet.has(k));
    // Idem voor het beheerdersportaal (uniform): bewerkBeheerTabs = deelverzameling van de zichtbare beheer-tabs.
    const bhTabs = schoonTabs(r && r.beheerTabs, BEHEER_TAB_KEYS);
    const bhSet = new Set(bhTabs);
    const bewerkBeheerTabs = schoonTabs(r && r.bewerkBeheerTabs, BEHEER_TAB_KEYS).filter((k) => bhSet.has(k));
    // Subpagina-rechten (hiërarchisch): subTabs = zichtbare subpagina's; bewerkSubTabs ⊆ subTabs;
    // verwijderSubTabs ⊆ subTabs (verwijderen kan alleen op een zichtbare subpagina); en
    // bulkVerwijderSubTabs ⊆ verwijderSubTabs (bulk vereist het gewone verwijderrecht). verwijder/bulk zijn
    // TOE TE KENNEN rechten (grant): expliciet aanzetten geeft het recht, ook aan niet-beheerders.
    const subTabs = schoonTabs(r && r.subTabs, MEDEWERKER_SUBTAB_KEYS);
    const subSet = new Set(subTabs);
    const bewerkSubTabs = schoonTabs(r && r.bewerkSubTabs, MEDEWERKER_SUBTAB_KEYS).filter((k) => subSet.has(k));
    const verwijderSubTabs = schoonTabs(r && r.verwijderSubTabs, MEDEWERKER_SUBTAB_KEYS).filter((k) => subSet.has(k));
    // Migratie van de oude losse verwijder-pills naar de per-subpagina Verwijderen-schakelaar. Alleen
    // TOEVOEGEN, nooit afnemen, en alleen voor een subpagina die deze rol al mag zien (anders zou de
    // filter hierboven 'm toch wegknippen én zouden we ongevraagd zichtbaarheid uitbreiden). Draait bij
    // elke normalisatie en is idempotent: staat het recht er al, dan verandert er niets. Rollen waarvan
    // de subpagina niet zichtbaar is houden hun oude recht via de terugval in wijzigrechten.js.
    const funcs = r && r.functies && typeof r.functies === "object" ? r.functies : {};
    for (const [legacyKey, subSleutel] of Object.entries(LEGACY_VERWIJDER_FUNCTIES)) {
      if (funcs[legacyKey] && subSet.has(subSleutel) && !verwijderSubTabs.includes(subSleutel)) {
        verwijderSubTabs.push(subSleutel);
      }
    }
    const verwSubSet = new Set(verwijderSubTabs);
    const bulkVerwijderSubTabs = schoonTabs(r && r.bulkVerwijderSubTabs, MEDEWERKER_SUBTAB_KEYS).filter((k) => verwSubSet.has(k));
    uit.push({
      sleutel, naam,
      medewerkerTabs: mwTabs,
      bewerkTabs,
      verwijderTabs,
      subTabs,
      bewerkSubTabs,
      verwijderSubTabs,
      bulkVerwijderSubTabs,
      beheerTabs: bhTabs,
      bewerkBeheerTabs,
      functies: schoonFuncties(r && r.functies),
    });
  }
  return uit;
}
function normaliseerToewijzingen(obj, geldigeSleutels) {
  const uit = {};
  const bron = obj && typeof obj === "object" ? obj : {};
  for (const [email, sleutel] of Object.entries(bron)) {
    const laag = String(email || "").trim().toLowerCase();
    const s = String(sleutel || "").trim();
    if (laag && s && geldigeSleutels.has(s)) uit[laag] = s;
  }
  return uit;
}

async function haalRollenConfig() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return { rollen: [], toewijzingen: {} };
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    const rollen = normaliseerRollen(data && data.rollen);
    return { rollen, toewijzingen: normaliseerToewijzingen(data && data.toewijzingen, new Set(rollen.map((r) => r.sleutel))) };
  } catch {
    return { rollen: [], toewijzingen: {} };
  }
}

async function zetRollenConfig({ rollen, toewijzingen }) {
  const schoonRollen = normaliseerRollen(rollen);
  const schoon = {
    rollen: schoonRollen,
    toewijzingen: normaliseerToewijzingen(toewijzingen, new Set(schoonRollen.map((r) => r.sleutel))),
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(schoon, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

/** De rol van een e-mailadres, of null als er geen (geldige) rol is toegewezen. Best-effort. */
async function haalRolVoorEmail(email) {
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return null;
  try {
    const { rollen, toewijzingen } = await haalRollenConfig();
    const sleutel = toewijzingen[laag];
    if (!sleutel) return null;
    return rollen.find((r) => r.sleutel === sleutel) || null;
  } catch { return null; }
}

/**
 * Mag de (toegewezen) rol van dit e-mailadres in de gegeven medewerker-rubriek VERWIJDEREN?
 * Dit is een expliciet TOE TE KENNEN recht (grant): zonder rol, of met een rol waarin de rubriek niet
 * in verwijderTabs staat, is het false. Voor rubrieken waar verwijderen standaard alleen bij de beheerder
 * hoort (zoals het postboek) opent dit het recht dus gericht voor een rol — de aanroeper checkt de
 * SWA-rol 'beheerder' apart. Best-effort: false bij twijfel.
 */
async function magRubriekVerwijderen(email, rubriek) {
  try {
    const rol = await haalRolVoorEmail(email);
    return !!(rol && Array.isArray(rol.verwijderTabs) && rol.verwijderTabs.includes(String(rubriek || "")));
  } catch { return false; }
}

/**
 * Mag de rol van dit e-mailadres op de gegeven SUBPAGINA verwijderen (grant)? subSleutel = "<rubriek>.<sub>".
 * Zonder rol of zonder de subpagina in verwijderSubTabs → false. Best-effort.
 */
async function magSubVerwijderen(email, subSleutel) {
  try {
    const rol = await haalRolVoorEmail(email);
    return !!(rol && Array.isArray(rol.verwijderSubTabs) && rol.verwijderSubTabs.includes(String(subSleutel || "")));
  } catch { return false; }
}

/** Mag de rol op de gegeven SUBPAGINA in BULK verwijderen (meerdere tegelijk)? Vereist het bulk-recht. Best-effort. */
async function magSubBulkVerwijderen(email, subSleutel) {
  try {
    const rol = await haalRolVoorEmail(email);
    return !!(rol && Array.isArray(rol.bulkVerwijderSubTabs) && rol.bulkVerwijderSubTabs.includes(String(subSleutel || "")));
  } catch { return false; }
}

module.exports = {
  haalRollenConfig, zetRollenConfig, haalRolVoorEmail,
  magRubriekVerwijderen, magSubVerwijderen, magSubBulkVerwijderen,
  MEDEWERKER_TABS, BEHEER_TABS, FUNCTIES, MEDEWERKER_SUBTABS,
};
