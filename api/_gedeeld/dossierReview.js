/**
 * Dossier-review: een medewerker legt zijn dossier (IB/VPB/…) ter review bij een collega neer, en die
 * collega tekent af — met akkoord óf met "aanpassen na review". Beide uitkomsten leveren een nieuwe
 * taak op, met de opmerking van de reviewer erin.
 *
 * De keten in het kort:
 *   1) Dossier → knop "Review aanvragen" (api/medewerker-dossier, actie "review-aanvragen")
 *      → REVIEWTAAK in Dynamics bij de gekozen reviewer + dossierstatus naar "gereed voor review".
 *   2) De reviewer ziet die taak in het Taken-overzicht met twee knoppen (api/mw-taken, acties
 *      "review-akkoord" / "review-aanpassen") en typt daar zijn opmerking.
 *      → reviewtaak wordt afgerond, er komt een VERVOLGTAAK bij de AANVRAGER met die opmerking,
 *        de opmerking landt ook in het review-notitieveld van het dossier en de status beweegt mee.
 *
 * Welke taaksoort en welke statussen daarbij horen stel je per dossiersoort in bij
 * Beheer → Dossiers (instellingen-sleutel `dossierReview`, zie instellingenVoorSoort hieronder).
 *
 * Opslag van de lopende reviews: Azure Blob Storage, container portaalcontent, blob
 * dossier-reviews.json — zelfde patroon als takenTijd.js/takenUrencode.js. Gesleuteld op het
 * TAAK-id van de reviewtaak, zodat het Taken-overzicht in één blob-lees weet welke taken een review
 * zijn (en wie de aanvrager was; die informatie staat nergens in Dynamics).
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const { haalInstellingen } = require("./instellingen");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "dossier-reviews.json";
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
const sleutel = (id) => String(id || "").trim().toLowerCase();

// ── Beheer-instellingen per dossiersoort ────────────────────────────────────
// Statuswaarden komen uit de vaste optiesets in dossiers.js (STATUS_OPTIES_IB/VPB): 601280001 =
// "Aangifte gereed voor review", 601280002 = "Aangifte aanpassen na review". Voor "na akkoord" is er
// geen voor de hand liggende standaard (IB kent 601280005 "Aangifte verzenden naar client", VPB
// 601280003) — die laten we leeg tot Wouter 'm in Beheer kiest, zodat we nooit ongevraagd een status
// zetten die niet bij zijn werkwijze past.
const STANDAARD_REVIEW = {
  aan: false,
  taakSoort: null,
  taakOnderwerp: "Review {soort} {jaar} — {klant}",
  taakRubriek: null,
  statusAanvraag: 601280001,
  akkoordTaakSoort: null,
  akkoordTaakOnderwerp: "Afronden na review: {soort} {jaar} — {klant}",
  statusAkkoord: null,
  aanpassenTaakSoort: null,
  aanpassenTaakOnderwerp: "Aanpassen na review: {soort} {jaar} — {klant}",
  statusAanpassen: 601280002,
};

function getalOfNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliseert één soort-configuratie naar een vaste vorm (onbekende sleutels vallen weg). */
function normaliseerReviewConfig(ruw) {
  const r = ruw && typeof ruw === "object" ? ruw : {};
  return {
    aan: r.aan === true,
    taakSoort: getalOfNull(r.taakSoort),
    taakOnderwerp: tekst(r.taakOnderwerp, 300) || STANDAARD_REVIEW.taakOnderwerp,
    taakRubriek: getalOfNull(r.taakRubriek),
    statusAanvraag: getalOfNull(r.statusAanvraag),
    akkoordTaakSoort: getalOfNull(r.akkoordTaakSoort),
    akkoordTaakOnderwerp: tekst(r.akkoordTaakOnderwerp, 300) || STANDAARD_REVIEW.akkoordTaakOnderwerp,
    statusAkkoord: getalOfNull(r.statusAkkoord),
    aanpassenTaakSoort: getalOfNull(r.aanpassenTaakSoort),
    aanpassenTaakOnderwerp: tekst(r.aanpassenTaakOnderwerp, 300) || STANDAARD_REVIEW.aanpassenTaakOnderwerp,
    statusAanpassen: getalOfNull(r.statusAanpassen),
  };
}

/** Alle soort-configuraties uit de instellingen: { ib: {...}, vpb: {...} }. */
function normaliseerAlleReviewConfig(ruw) {
  const uit = {};
  for (const [soort, cfg] of Object.entries((ruw && typeof ruw === "object" ? ruw : {}))) {
    const key = tekst(soort, 20).toLowerCase();
    if (!key) continue;
    uit[key] = normaliseerReviewConfig(cfg);
  }
  return uit;
}

/** De review-instellingen van één dossiersoort (met de standaarden als terugval). */
async function instellingenVoorSoort(soortKey) {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const alle = normaliseerAlleReviewConfig(instellingen && instellingen.dossierReview);
  const eigen = alle[String(soortKey || "").toLowerCase()];
  return eigen || { ...STANDAARD_REVIEW };
}

/** Vult {klant}/{jaar}/{soort}/{aanvrager}/{reviewer} in een onderwerp-sjabloon in. */
function vulSjabloonIn(sjabloon, velden) {
  let uit = String(sjabloon || "").trim();
  for (const [k, v] of Object.entries(velden || {})) {
    uit = uit.replaceAll(`{${k}}`, v == null ? "" : String(v));
  }
  // Dubbele spaties/streepjes opruimen die ontstaan als een plaatshouder leeg is (bijv. geen jaar).
  return uit.replace(/\s{2,}/g, " ").replace(/\s+—\s*$/, "").trim();
}

// ── Opslag van lopende/afgeronde reviews ────────────────────────────────────
async function haalAlle() {
  return leesAlles();
}

/** De review-gegevens bij één reviewtaak, of null. */
async function haalVoorTaak(taakId) {
  const k = sleutel(taakId);
  if (!k) return null;
  return (await leesAlles())[k] || null;
}

/** Alle reviews van één dossier, nieuwste eerst. */
async function haalVoorDossier(soortKey, dossierId) {
  const soort = String(soortKey || "").toLowerCase();
  const did = sleutel(dossierId);
  if (!soort || !did) return [];
  const alle = await leesAlles();
  return Object.values(alle)
    .filter((r) => r && String(r.dossierSoort || "").toLowerCase() === soort && sleutel(r.dossierId) === did)
    .sort((a, b) => String(b.aangevraagdOp || "").localeCompare(String(a.aangevraagdOp || "")));
}

/** De nog OPEN review van een dossier (er kan er maar één tegelijk lopen), of null. */
async function haalOpenVoorDossier(soortKey, dossierId) {
  return (await haalVoorDossier(soortKey, dossierId)).find((r) => r.status === "open") || null;
}

/** Legt een nieuwe (open) review vast bij het taak-id van de zojuist aangemaakte reviewtaak. */
async function zetReview(review) {
  const k = sleutel(review && review.taakId);
  if (!k) throw new Error("VALIDATIE: taakId ontbreekt.");
  const alle = await leesAlles();
  alle[k] = {
    taakId: k,
    dossierSoort: tekst(review.dossierSoort, 20).toLowerCase(),
    dossierId: sleutel(review.dossierId),
    accountId: sleutel(review.accountId),
    klantnaam: tekst(review.klantnaam, 200),
    jaar: tekst(review.jaar, 10),
    aanvragerEmail: tekst(review.aanvragerEmail, 200).toLowerCase(),
    aanvragerNaam: tekst(review.aanvragerNaam, 200),
    reviewerEmail: tekst(review.reviewerEmail, 200).toLowerCase(),
    reviewerNaam: tekst(review.reviewerNaam, 200),
    toelichting: tekst(review.toelichting, 4000),
    aangevraagdOp: tekst(review.aangevraagdOp, 40) || new Date().toISOString(),
    status: "open",
    uitkomst: "",
    opmerking: "",
    afgerondOp: "",
    afgerondDoor: "",
    vervolgTaakId: "",
  };
  await schrijfAlles(alle);
  return alle[k];
}

/** Rondt een review af met een uitkomst ("akkoord" | "aanpassen") en de opmerking van de reviewer. */
async function rondReviewAf(taakId, { uitkomst, opmerking, door, vervolgTaakId }) {
  const k = sleutel(taakId);
  const alle = await leesAlles();
  if (!alle[k]) return null;
  alle[k] = {
    ...alle[k],
    status: uitkomst === "aanpassen" ? "aanpassen" : "akkoord",
    uitkomst: uitkomst === "aanpassen" ? "aanpassen" : "akkoord",
    opmerking: tekst(opmerking, 4000),
    afgerondOp: new Date().toISOString(),
    afgerondDoor: tekst(door, 200).toLowerCase(),
    vervolgTaakId: sleutel(vervolgTaakId),
  };
  await schrijfAlles(alle);
  return alle[k];
}

/** Verwijdert een review-registratie (bijv. als het aanmaken van de taak alsnog misging). */
async function verwijderReview(taakId) {
  const k = sleutel(taakId);
  const alle = await leesAlles();
  if (!alle[k]) return false;
  delete alle[k];
  await schrijfAlles(alle);
  return true;
}

// ── Dynamics-taken ──────────────────────────────────────────────────────────
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
});

/**
 * Maakt één taak aan in Dynamics en geeft het activityid terug. Gooit door bij een fout — anders
 * zou een medewerker denken dat de review is uitgezet terwijl er niets bij de reviewer terechtkomt.
 */
async function maakTaak(resource, token, { subject, description, accountId, soortWaarde, rubriekWaarde, eigenaarId, deadline }) {
  const body = {
    subject: tekst(subject, 400) || "Review",
    description: String(description || "").slice(0, 100000),
  };
  if (accountId) body[`${KLANT_VELD}@odata.bind`] = `/accounts(${accountId})`;
  if (SOORT_VELD && soortWaarde !== null && soortWaarde !== undefined && soortWaarde !== "") {
    const n = Number(soortWaarde);
    if (Number.isFinite(n)) body[SOORT_VELD] = n;
  }
  if (RUBRIEK_VELD && rubriekWaarde !== null && rubriekWaarde !== undefined && rubriekWaarde !== "") {
    const n = Number(rubriekWaarde);
    if (Number.isFinite(n)) body[RUBRIEK_VELD] = n;
  }
  if (eigenaarId) body["ownerid@odata.bind"] = `/systemusers(${eigenaarId})`;
  if (deadline) body.scheduledend = deadline;

  const res = await fetch(`${resource}/api/data/v9.2/tasks`, {
    method: "POST",
    headers: { ...HEADERS(token), Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Aanmaken taak mislukt (${res.status}): ${await res.text()}`);
  const gemaakt = await res.json().catch(() => ({}));
  return gemaakt.activityid || "";
}

module.exports = {
  STANDAARD_REVIEW,
  normaliseerReviewConfig, normaliseerAlleReviewConfig, instellingenVoorSoort, vulSjabloonIn,
  haalAlle, haalVoorTaak, haalVoorDossier, haalOpenVoorDossier, zetReview, rondReviewAf, verwijderReview,
  maakTaak,
};
