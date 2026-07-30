/**
 * Rechten per medewerker (op e-mailadres) voor het medewerkersportaal.
 *
 * Vier onafhankelijke instellingen, alle vier beheerd in het beheerdersportaal
 * (Beheer → Medewerkers → "Medewerkers — wijzig-rechten"):
 *   1) Wijzig-niveau (klantgegevens per klant wijzigen):
 *        - "medewerker" (standaard, niet opgeslagen) → alleen lezen
 *        - "manager"                                  → mag klantgegevens wijzigen
 *        - "beheerder"                                → mag wijzigen
 *      De Azure-rol 'beheerder' geeft sowieso altijd wijzig-rechten, los van deze lijst.
 *   2) Bulk-recht (meerdere klanten tegelijk aanpassen): een aparte lijst met e-mailadressen.
 *      De Azure-rol 'beheerder' mag sowieso altijd bulk-aanpassingen doen.
 *   3) Als-klant-recht ("meekijken" — alleen-lezen het klantportaal bekijken namens een
 *      gekozen klant, zie api/_gedeeld/identiteit.js → herleidAccounts): ook een aparte lijst
 *      met e-mailadressen. De Azure-rol 'beheerder' mag dit sowieso altijd.
 *   4) Offertes-recht (offertes en opdrachtbevestigingen opstellen — de tab "Offertes" in het
 *      medewerkersportaal): ook een aparte lijst met e-mailadressen. De Azure-rol 'beheerder'
 *      mag dit sowieso altijd. Dit recht wordt niet alleen gebruikt om de tab te tonen of te
 *      verbergen, maar ook serverkant afgedwongen op alle offerte-Functions — zie
 *      api/_gedeeld/offertesRecht.js. De publieke tekenpagina (/api/teken/*) valt hier
 *      bewust buiten: die is voor klanten en heeft helemaal geen medewerkersrol.
 *
 * Let op: een lege lijst betekent "niemand", net als bij bulk en als-klant. Bij het invoeren
 * van het offertes-recht heeft dus in eerste instantie alleen een beheerder toegang, tot er
 * medewerkers zijn aangevinkt.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob wijzigrechten.json).
 * Structuur: { "niveaus": { "naam@activaa.nl": "manager" }, "bulk": ["naam@activaa.nl"],
 *              "alsKlant": ["naam@activaa.nl"], "offertes": ["naam@activaa.nl"] }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "wijzigrechten.json";
const GELDIGE_NIVEAUS = ["medewerker", "manager", "beheerder"];
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
  for await (const stuk of readableStream) {
    stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  }
  return Buffer.concat(stukken).toString("utf-8");
}

/** Normaliseert een lijst e-mailadressen: kleine letters, zonder witruimte, zonder duplicaten. */
function schoonLijst(lijst) {
  return [...new Set(
    (Array.isArray(lijst) ? lijst : []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
  )];
}

const LEEG = { niveaus: {}, bulk: [], alsKlant: [], offertes: [] };

/**
 * Leest het volledige rechtendocument:
 * { niveaus: {email:niveau}, bulk: [email], alsKlant: [email], offertes: [email] }.
 * Verwerkt ook de oude structuur { wijzigers: [emails] } (→ die golden als 'manager').
 */
async function haalRechten() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return { ...LEEG };
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    let niveaus = {};
    if (data && data.niveaus && typeof data.niveaus === "object" && !Array.isArray(data.niveaus)) {
      niveaus = data.niveaus;
    } else if (data && Array.isArray(data.wijzigers)) {
      // Backward-compat: oude structuur { wijzigers: [emails] }.
      for (const e of data.wijzigers) niveaus[String(e).toLowerCase()] = "manager";
    }
    return {
      niveaus,
      bulk: schoonLijst(data && data.bulk),
      alsKlant: schoonLijst(data && data.alsKlant),
      offertes: schoonLijst(data && data.offertes),
    };
  } catch {
    return { ...LEEG };
  }
}

/** Geeft alleen de niveaus terug: { "<email>": "manager"|"beheerder" }. */
async function haalNiveaus() {
  return (await haalRechten()).niveaus;
}

/** Geeft de bulk-lijst terug: [ "<email>" ] (kleine letters). */
async function haalBulk() {
  return (await haalRechten()).bulk;
}

/** Geeft de als-klant-lijst terug: [ "<email>" ] (kleine letters). */
async function haalAlsKlant() {
  return (await haalRechten()).alsKlant;
}

/** Geeft de offertes-lijst terug: [ "<email>" ] (kleine letters). */
async function haalOffertes() {
  return (await haalRechten()).offertes;
}

/** Overschrijft het volledige rechtendocument. Normaliseert e-mail; 'medewerker' wordt niet bewaard. */
async function zetRechten({ niveaus, bulk, alsKlant, offertes }) {
  const schoonNiveaus = {};
  for (const [email, niveau] of Object.entries(niveaus || {})) {
    const laag = String(email || "").trim().toLowerCase();
    if (!laag) continue;
    if (niveau === "manager" || niveau === "beheerder") schoonNiveaus[laag] = niveau;
  }
  const nieuw = {
    niveaus: schoonNiveaus,
    bulk: schoonLijst(bulk),
    alsKlant: schoonLijst(alsKlant),
    offertes: schoonLijst(offertes),
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(nieuw, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return nieuw;
}

/** Overschrijft alleen de niveaus; behoudt de bestaande bulk-/als-klant-/offertes-lijst. */
async function zetNiveaus(niveaus) {
  const { bulk, alsKlant, offertes } = await haalRechten();
  return (await zetRechten({ niveaus, bulk, alsKlant, offertes })).niveaus;
}

/** Bepaalt of deze gebruiker mag wijzigen: beheerder (Azure) mag altijd; anders niveau manager/beheerder. */
async function magWijzigen(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  const niveaus = await haalNiveaus();
  return niveaus[laag] === "manager" || niveaus[laag] === "beheerder";
}

/** Bepaalt of deze gebruiker bulk-aanpassingen mag doen: beheerder (Azure) mag altijd; anders in de bulk-lijst. */
async function magBulk(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalBulk()).includes(laag);
}

/** Bepaalt of deze gebruiker alleen-lezen mag "meekijken als klant": beheerder (Azure) mag altijd; anders in de alsKlant-lijst. */
async function magAlsKlant(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalAlsKlant()).includes(laag);
}

/** Bepaalt of deze gebruiker offertes/opdrachtbevestigingen mag maken: beheerder (Azure) mag altijd; anders in de offertes-lijst. */
async function magOffertes(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalOffertes()).includes(laag);
}

module.exports = {
  haalRechten, haalNiveaus, haalBulk, haalAlsKlant, haalOffertes, zetRechten, zetNiveaus,
  magWijzigen, magBulk, magAlsKlant, magOffertes, GELDIGE_NIVEAUS,
};
