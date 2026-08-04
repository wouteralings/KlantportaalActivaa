/**
 * Rechten per medewerker (op e-mailadres) voor het medewerkersportaal.
 *
 * Negen onafhankelijke instellingen, allemaal beheerd in het beheerdersportaal
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
 *   5) Contracten-recht (Contractmanagement-plan, Stap 3 — de tab "Contracten" in het
 *      medewerkersportaal): ook een aparte lijst met e-mailadressen. De Azure-rol 'beheerder'
 *      mag dit sowieso altijd. Bepaalt in deze stap alleen of de tab wordt getoond (net als
 *      als-klant); er is nog geen eigen medewerkerskant-API om serverkant af te dwingen zoals
 *      bij offertes — die komt pas met Stap 6, wanneer `ContractenOverzicht.jsx` zijn placeholder
 *      inruilt voor echte inhoud. Dit recht ligt dan al klaar om diezelfde Functions mee af te
 *      schermen (zelfde opzet als api/_gedeeld/offertesRecht.js).
 *   6) Verwijder-IB-recht: mag Inkomstenbelasting-dossiers definitief uit Dynamics verwijderen
 *      (knop "Verwijderen" in een geopend IB-dossier). Aparte lijst met e-mailadressen; de
 *      Azure-rol 'beheerder' mag dit sowieso altijd. Serverkant afgedwongen — zie
 *      api/medewerker-dossier/index.js (actie "verwijderen").
 *   7) Verwijder-VPB-recht: hetzelfde, maar voor Vennootschapsbelasting-dossiers.
 *   8) Verwijder-contactpersonen-recht: mag contactpersonen verwijderen (zet ze op inactief en
 *      ontkoppelt ze van cliënten — bewust geen harde Dynamics-delete, zie
 *      api/medewerker-contactpersoon/index.js actie "verwijderen"). Voorheen kon alleen de
 *      Azure-rol 'beheerder' dit; sinds dit recht bestaat mag ook wie hier is aangevinkt het.
 *   9) Verwijder-dividendbelasting-recht: alvast klaargezet voor als de tab "Dividendbelasting"
 *      (nu nog een "nog in te richten"-placeholder in Klantoverzicht) een eigen medewerkerskant
 *      met verwijderfunctie krijgt — wordt nog nergens afgedwongen.
 *
 * Let op: een lege lijst betekent "niemand", net als bij bulk en als-klant. Bij het invoeren
 * van een nieuw recht heeft dus in eerste instantie alleen een beheerder toegang, tot er
 * medewerkers zijn aangevinkt.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob wijzigrechten.json).
 * Structuur: { "niveaus": { "naam@activaa.nl": "manager" }, "bulk": ["naam@activaa.nl"],
 *              "alsKlant": ["naam@activaa.nl"], "offertes": ["naam@activaa.nl"],
 *              "contracten": ["naam@activaa.nl"], "verwijderIb": ["naam@activaa.nl"],
 *              "verwijderVpb": ["naam@activaa.nl"], "verwijderContactpersonen": ["naam@activaa.nl"],
 *              "verwijderDividendbelasting": ["naam@activaa.nl"] }
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

const LEEG = {
  niveaus: {}, bulk: [], alsKlant: [], offertes: [], contracten: [],
  verwijderIb: [], verwijderVpb: [], verwijderContactpersonen: [], verwijderDividendbelasting: [],
};

/**
 * Leest het volledige rechtendocument:
 * { niveaus: {email:niveau}, bulk: [email], alsKlant: [email], offertes: [email], contracten: [email],
 *   verwijderIb: [email], verwijderVpb: [email], verwijderContactpersonen: [email],
 *   verwijderDividendbelasting: [email] }.
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
      contracten: schoonLijst(data && data.contracten),
      verwijderIb: schoonLijst(data && data.verwijderIb),
      verwijderVpb: schoonLijst(data && data.verwijderVpb),
      verwijderContactpersonen: schoonLijst(data && data.verwijderContactpersonen),
      verwijderDividendbelasting: schoonLijst(data && data.verwijderDividendbelasting),
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

/** Geeft de contracten-lijst terug: [ "<email>" ] (kleine letters). */
async function haalContracten() {
  return (await haalRechten()).contracten;
}

/** Geeft de verwijder-IB-lijst terug: [ "<email>" ] (kleine letters). */
async function haalVerwijderIb() {
  return (await haalRechten()).verwijderIb;
}

/** Geeft de verwijder-VPB-lijst terug: [ "<email>" ] (kleine letters). */
async function haalVerwijderVpb() {
  return (await haalRechten()).verwijderVpb;
}

/** Geeft de verwijder-contactpersonen-lijst terug: [ "<email>" ] (kleine letters). */
async function haalVerwijderContactpersonen() {
  return (await haalRechten()).verwijderContactpersonen;
}

/** Geeft de verwijder-dividendbelasting-lijst terug: [ "<email>" ] (kleine letters). */
async function haalVerwijderDividendbelasting() {
  return (await haalRechten()).verwijderDividendbelasting;
}

/** Overschrijft het volledige rechtendocument. Normaliseert e-mail; 'medewerker' wordt niet bewaard. */
async function zetRechten({
  niveaus, bulk, alsKlant, offertes, contracten,
  verwijderIb, verwijderVpb, verwijderContactpersonen, verwijderDividendbelasting,
}) {
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
    contracten: schoonLijst(contracten),
    verwijderIb: schoonLijst(verwijderIb),
    verwijderVpb: schoonLijst(verwijderVpb),
    verwijderContactpersonen: schoonLijst(verwijderContactpersonen),
    verwijderDividendbelasting: schoonLijst(verwijderDividendbelasting),
  };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(nieuw, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return nieuw;
}

/** Overschrijft alleen de niveaus; behoudt de rest van de bestaande rechten. */
async function zetNiveaus(niveaus) {
  const { bulk, alsKlant, offertes, contracten, verwijderIb, verwijderVpb, verwijderContactpersonen, verwijderDividendbelasting } = await haalRechten();
  return (await zetRechten({ niveaus, bulk, alsKlant, offertes, contracten, verwijderIb, verwijderVpb, verwijderContactpersonen, verwijderDividendbelasting })).niveaus;
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

/** Bepaalt of deze gebruiker de tab "Contracten" mag zien: beheerder (Azure) mag altijd; anders in de contracten-lijst. */
async function magContracten(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalContracten()).includes(laag);
}

/** Bepaalt of deze gebruiker IB-dossiers mag verwijderen: beheerder (Azure) mag altijd; anders in de verwijderIb-lijst. */
async function magVerwijderIb(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalVerwijderIb()).includes(laag);
}

/** Bepaalt of deze gebruiker VPB-dossiers mag verwijderen: beheerder (Azure) mag altijd; anders in de verwijderVpb-lijst. */
async function magVerwijderVpb(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalVerwijderVpb()).includes(laag);
}

/** Bepaalt of deze gebruiker contactpersonen mag verwijderen: beheerder (Azure) mag altijd; anders in de verwijderContactpersonen-lijst. */
async function magVerwijderContactpersonen(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalVerwijderContactpersonen()).includes(laag);
}

/** Bepaalt of deze gebruiker dividendbelasting-aangiftes mag verwijderen: beheerder (Azure) mag altijd; anders in de verwijderDividendbelasting-lijst. Nog nergens serverkant afgedwongen (tab bestaat nog niet). */
async function magVerwijderDividendbelasting(email, isBeheerder) {
  if (isBeheerder) return true;
  const laag = String(email || "").trim().toLowerCase();
  if (!laag) return false;
  return (await haalVerwijderDividendbelasting()).includes(laag);
}

module.exports = {
  haalRechten, haalNiveaus, haalBulk, haalAlsKlant, haalOffertes, haalContracten,
  haalVerwijderIb, haalVerwijderVpb, haalVerwijderContactpersonen, haalVerwijderDividendbelasting,
  zetRechten, zetNiveaus,
  magWijzigen, magBulk, magAlsKlant, magOffertes, magContracten,
  magVerwijderIb, magVerwijderVpb, magVerwijderContactpersonen, magVerwijderDividendbelasting,
  GELDIGE_NIVEAUS,
};
