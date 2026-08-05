/**
 * Aanlever-verzoeken: een aanleverlijst (sjabloon) die is uitgezet naar één cliënt/contactpersoon.
 * De klant levert per regel een bestand aan; dat landt app-only in de 'Aanleveren'-map van de cliënt.
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob aanleververzoeken.json.
 * Eén verzoek:
 *   { id, accountId, klantnaam, klantnummer, contactId, contactNaam,
 *     lijstId, lijstNaam, notitie, status ("open"|"afgerond"),
 *     aangemaaktOp, aangemaaktDoor,
 *     regels: [ { id, naam, bestandsnaam, toelichting, verplicht,
 *                 status ("open"|"aangeleverd"|"afgemeld"), aangeleverdOp, aangeleverdDoor,
 *                 bestand: { naam, url, driveId, itemId } | null } ] }
 *
 * Regelstatus 'afgemeld': de klant heeft geen bestand geüpload maar wél een opmerking geplaatst
 * (bv. "niet van toepassing" / "zit in de bijlage") — dat tekent de regel af zonder bestand. Telt
 * voor de voortgang/afronding hetzelfde als 'aangeleverd'; alleen bij een echte upload wordt de
 * regel 'aangeleverd'.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "aanleververzoeken.json";
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

async function haalAlle() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return Array.isArray(data) ? data : Array.isArray(data.verzoeken) ? data.verzoeken : [];
  } catch {
    return [];
  }
}

async function schrijfAlle(verzoeken) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(verzoeken, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Maakt één regel (gevraagd document) aan — gebruikt bij het aanmaken van een verzoek, én om
 * later (via 'regel-toevoegen' in medewerker-vragenlijsten) een extra vraag aan een bestaand,
 * al uitgezet verzoek toe te voegen. */
function maakRegel(r) {
  return {
    id: crypto.randomUUID(),
    naam: String(r && r.naam ? r.naam : "").slice(0, 200),
    bestandsnaam: String(r && r.bestandsnaam ? r.bestandsnaam : "").slice(0, 200),
    toelichting: String(r && r.toelichting ? r.toelichting : "").slice(0, 600),
    verplicht: r && r.verplicht === false ? false : true,
    status: "open",
    opmerking: "",
    aangeleverdOp: null,
    aangeleverdDoor: null,
    bestand: null,
    // Gezet door een medewerker via 'heropenen' (zie api/medewerker-vragenlijsten): wanneer een
    // eerder aangeleverd/afgemeld document weer open wordt gezet omdat de klant het opnieuw moet
    // aanleveren. Alleen gebruikt voor de "nieuwe activiteit"-detectie bij de klant hieronder.
    heropendOp: null,
  };
}

/** Maakt een nieuw verzoek uit een set regels (bv. gekopieerd uit een aanleverlijst). */
function maakVerzoek({ accountId, klantnaam, klantnummer, contactId, contactNaam, lijstId, lijstNaam, onderwerpId, onderwerp, jaar, map, notitie, regels, aangemaaktDoor, zichtbaar, deadline, bron }) {
  return {
    id: crypto.randomUUID(),
    accountId: accountId || "",
    klantnaam: klantnaam || "",
    klantnummer: klantnummer || "",
    contactId: contactId || "",
    contactNaam: contactNaam || "",
    lijstId: lijstId || "",
    lijstNaam: lijstNaam || "",
    onderwerpId: onderwerpId || "",
    onderwerp: onderwerp || "",
    jaar: jaar != null ? String(jaar) : "",
    map: Array.isArray(map) ? map.filter(Boolean).map((s) => String(s).slice(0, 100)).slice(0, 8) : [],
    notitie: notitie || "",
    status: "open",
    // zichtbaar=false → 'concept': wel klaargezet, maar nog niet zichtbaar voor de klant totdat een
    // medewerker hem vrijgeeft. deadline (YYYY-MM-DD) = uiterste aanleverdatum. bron: bv. "abonnement".
    zichtbaar: zichtbaar === false ? false : true,
    deadline: deadline ? String(deadline).slice(0, 10) : "",
    bron: bron || "",
    // Vraag-/berichtenreeks tussen klant en medewerker over deze vragenlijst:
    // [ { id, rol("klant"|"medewerker"|"ai"), auteur, tekst, tijd } ]
    vragen: [],
    aangemaaktOp: new Date().toISOString(),
    aangemaaktDoor: aangemaaktDoor || "",
    regels: (Array.isArray(regels) ? regels : []).map(maakRegel),
  };
}

async function voegToe(verzoek) {
  const alle = await haalAlle();
  alle.push(verzoek);
  await schrijfAlle(alle);
  return verzoek;
}

/** Past één verzoek aan via een mutator-functie (krijgt het verzoek, muteert in place). */
async function werkBij(id, mutator) {
  const alle = await haalAlle();
  const v = alle.find((x) => x.id === id);
  if (!v) return null;
  mutator(v);
  await schrijfAlle(alle);
  return v;
}

async function verwijder(id) {
  const alle = await haalAlle();
  const over = alle.filter((x) => x.id !== id);
  await schrijfAlle(over);
  return over.length !== alle.length;
}

/** Alle verzoeken voor een set accountId's (voor de klantweergave). */
async function haalVoorAccounts(accountIds) {
  const set = new Set(accountIds || []);
  return (await haalAlle()).filter((v) => set.has(v.accountId));
}

/** Maakt een bericht voor de vraag-/berichtenreeks van een verzoek. */
function maakBericht(rol, auteur, tekst) {
  return {
    id: crypto.randomUUID(),
    rol: rol === "medewerker" ? "medewerker" : rol === "ai" ? "ai" : "klant",
    auteur: String(auteur || "").slice(0, 200),
    tekst: String(tekst || "").slice(0, 4000),
    tijd: new Date().toISOString(),
  };
}

/** Herberekent de verzoekstatus: 'afgerond' zodra alle verplichte regels niet meer 'open' staan
 * (aangeleverd mét bestand, óf afgemeld via een opmerking). */
function herberekenStatus(verzoek) {
  const verplicht = verzoek.regels.filter((r) => r.verplicht !== false);
  const relevant = verplicht.length ? verplicht : verzoek.regels;
  const klaar = relevant.length > 0 && relevant.every((r) => r.status !== "open");
  verzoek.status = klaar ? "afgerond" : "open";
  return verzoek.status;
}

// ── "Gezien" door medewerkers — één gedeeld, globaal moment (geen per-medewerker tracking, zelfde
// eenvoudige opzet als reviewopslag.js) — voor het rode aantal-bolletje bij Vragenlijsten. ──
const GEZIEN_BLOB_NAAM = "vragenlijsten-gezien.json";

async function haalLaatstGezien() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(GEZIEN_BLOB_NAAM);
  if (!(await blobClient.exists())) return null;
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return data.laatstGezien || null;
  } catch {
    return null;
  }
}

async function zetLaatstGezien(iso) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(GEZIEN_BLOB_NAAM);
  const moment = iso || new Date().toISOString();
  const buffer = Buffer.from(JSON.stringify({ laatstGezien: moment }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return moment;
}

/** Heeft dit verzoek klant-activiteit (een aangeleverde/afgemelde regel, of een klantvraag) ná
 * 'sindsIso'? Zonder 'sindsIso' (nog nooit gezien) telt élke bestaande klant-activiteit mee. Voor
 * het rode "nieuw"-bolletje bij medewerkers op de tab/rij Vragenlijsten. */
function heeftKlantActiviteitSinds(verzoek, sindsIso) {
  const sinds = sindsIso ? new Date(sindsIso) : null;
  const regels = Array.isArray(verzoek.regels) ? verzoek.regels : [];
  const vragen = Array.isArray(verzoek.vragen) ? verzoek.vragen : [];
  const momenten = [
    ...regels.filter((r) => r.status !== "open" && r.aangeleverdOp).map((r) => r.aangeleverdOp),
    ...vragen.filter((m) => m.rol === "klant").map((m) => m.tijd),
  ];
  return sinds ? momenten.some((t) => t && new Date(t) > sinds) : momenten.length > 0;
}

// ── "Gezien" door de klant zelf — per e-mailadres (in tegenstelling tot het gedeelde, globale
// moment van medewerkers hierboven: elke klant heeft hier zijn eigen laatst-bekeken-moment nodig).
// Zelfde eenvoudige opzet als nieuwsgelezen.js: { "<email in kleine letters>": "<iso-moment>" }.
// Voor het rode bolletje/aantal in het klantportaal (Home + tabblad Documenten) wanneer een
// medewerker iets heeft gevraagd/gereageerd, of een document heeft heropend.
const KLANT_GEZIEN_BLOB_NAAM = "vragenlijsten-klant-gezien.json";

async function haalKlantGezienAlles() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(KLANT_GEZIEN_BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function haalKlantLaatstGezien(email) {
  const alle = await haalKlantGezienAlles();
  return alle[(email || "").toLowerCase()] || null;
}

async function zetKlantLaatstGezien(email, iso) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(KLANT_GEZIEN_BLOB_NAAM);
  const alle = await haalKlantGezienAlles();
  const moment = iso || new Date().toISOString();
  alle[(email || "").toLowerCase()] = moment;
  const buffer = Buffer.from(JSON.stringify(alle, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return moment;
}

/** Heeft een medewerker hier iets gedaan (een vraag/reactie, of een document heropend) ná
 * 'sindsIso' — of is het verzoek zelf pas ná 'sindsIso' aangemaakt (dus voor het eerst te zien voor
 * de klant)? Zonder 'sindsIso' (klant heeft nog nooit gekeken) telt alles mee. Voor het rode
 * bolletje/aantal bij de klant op Home en het tabblad Documenten. */
function heeftMedewerkerActiviteitSinds(verzoek, sindsIso) {
  const sinds = sindsIso ? new Date(sindsIso) : null;
  const regels = Array.isArray(verzoek.regels) ? verzoek.regels : [];
  const vragen = Array.isArray(verzoek.vragen) ? verzoek.vragen : [];
  const momenten = [
    verzoek.aangemaaktOp,
    ...regels.filter((r) => r.heropendOp).map((r) => r.heropendOp),
    ...vragen.filter((m) => m.rol === "medewerker" || m.rol === "ai").map((m) => m.tijd),
  ];
  return sinds ? momenten.some((t) => t && new Date(t) > sinds) : momenten.length > 0;
}

/** Aantal onbeantwoorde klantvragen: klantberichten ná het laatste medewerker-/ai-antwoord. Gedeeld
 * tussen api/medewerker-vragenlijsten (het werkoverzicht) en api/medewerker-dossier (de gekoppelde
 * uitvraaglijst-kaart in een fiscaal dossier) zodat beide exact dezelfde badge/telling tonen. */
function openVragen(vragen) {
  if (!Array.isArray(vragen) || !vragen.length) return 0;
  let laatsteAntwoord = -1;
  vragen.forEach((m, i) => { if (m.rol === "medewerker" || m.rol === "ai") laatsteAntwoord = i; });
  return vragen.filter((m, i) => m.rol === "klant" && i > laatsteAntwoord).length;
}

/** Verrijkt een ruw opgeslagen verzoek tot de vorm die de medewerkers-UI gebruikt: voortgang,
 * documentenlijst, vraag-/berichtenreeks en activiteitsindicatoren afgeleid van de rauwe regels/
 * vragen. Gedeeld tussen het Vragenlijsten-werkoverzicht en de "Gekoppelde uitvraaglijst"-kaart in
 * een dossier (via VragenlijstDetail — zelfde vorm, dus dezelfde component kan hem overal tonen). */
function verrijkVerzoek(v, laatstGezien) {
  const regels = Array.isArray(v.regels) ? v.regels : [];
  // 'afgemeld' (opmerking zonder bestand) telt hier ook mee als afgehandeld, zelfde als 'aangeleverd'.
  const aangeleverd = regels.filter((r) => r.status !== "open").length;
  const vragen = Array.isArray(v.vragen) ? v.vragen : [];
  return {
    id: v.id,
    accountId: v.accountId,
    klantnaam: v.klantnaam || "",
    klantnummer: v.klantnummer || "",
    contactNaam: v.contactNaam || "",
    lijstNaam: v.lijstNaam || v.onderwerp || "Aanlever-verzoek",
    jaar: v.jaar || "",
    startdatum: (v.aangemaaktOp || "").slice(0, 10),
    // E-mail van de medewerker die deze lijst heeft uitgezet ("behandelaar") — gebruikt in het
    // Vragenlijsten-werkoverzicht om de "volledig aangeleverd, wacht op controle"-melding aan de
    // juiste medewerker te tonen (zie Vragenlijsten.jsx, vergeleken met mijnEmail).
    aangemaaktDoor: v.aangemaaktDoor || "",
    deadline: v.deadline || "",
    aantalDocumenten: regels.length,
    aangeleverd,
    notitie: v.notitie || "",
    documenten: regels.map((r) => ({
      id: r.id,
      naam: r.naam || "",
      verplicht: r.verplicht !== false,
      toelichting: r.toelichting || "",
      status: r.status || "open",
      opmerking: r.opmerking || "",
      bestandNaam: (r.bestand && r.bestand.naam) || "",
      // SharePoint-link naar het aangeleverde bestand — alleen via verrijkVerzoek (medewerker-kant)
      // beschikbaar, dus NIET zichtbaar voor de cliënt (die gebruikt zijn eigen shaping in
      // mijn-aanleververzoeken). Medewerkers kunnen het document zo rechtstreeks in SharePoint openen.
      bestandUrl: (r.bestand && r.bestand.url) || "",
      aangeleverdOp: r.aangeleverdOp || null,
    })),
    status: v.status || "open",
    zichtbaar: v.zichtbaar !== false,
    vragen,
    openVragen: openVragen(vragen),
    heeftVragen: vragen.some((m) => m.rol === "klant"),
    heeftNieuweActiviteit: heeftKlantActiviteitSinds(v, laatstGezien),
    wachtOpControle: v.status === "afgerond" && !v.medewerkerGeaccepteerd,
    medewerkerGeaccepteerd: !!v.medewerkerGeaccepteerd,
    geaccepteerdOp: v.geaccepteerdOp || null,
    geaccepteerdDoor: v.geaccepteerdDoor || "",
  };
}

module.exports = {
  haalAlle, maakVerzoek, maakRegel, maakBericht, voegToe, werkBij, verwijder, haalVoorAccounts, herberekenStatus,
  haalLaatstGezien, zetLaatstGezien, heeftKlantActiviteitSinds,
  haalKlantLaatstGezien, zetKlantLaatstGezien, heeftMedewerkerActiviteitSinds,
  openVragen, verrijkVerzoek,
};
