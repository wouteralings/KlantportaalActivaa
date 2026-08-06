/**
 * Overschrijvingen op de RGS-referentielijst (zie rgsData.js): per RGS-code een eigen
 * presentatienaam en/of presentatievolgorde, door de beheerder ingesteld in Beheer → Rapportages
 * → "RGS-namen en volgorde". GLOBAAL (niet per klant) — dezelfde RGS-code heet voor elke klant
 * hetzelfde, dat is precies het idee van RGS. Overschrijft alleen de presentatie, nooit de code
 * zelf of de onderliggende cijfers.
 *
 * Opslag in Azure Blob Storage (container portaalcontent, blob rgs-instellingen.json):
 *   { "<rgsCode>": { naam?: string, volgorde?: number } }
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "rgs-instellingen.json";
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

/** Geeft alle overschrijvingen terug: { "<rgsCode>": { naam?, volgorde? } }. Best-effort: als de
 * opslag nog niet geconfigureerd is, gewoon leeg (dan gelden overal de standaardnamen/-volgorde). */
async function haalOverschrijvingen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return {};
  const tekst = await streamNaarTekst((await blobClient.download()).readableStreamBody);
  try {
    const data = JSON.parse(tekst);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Zet de naam-overschrijving voor één RGS-code. Lege naam = terug naar de standaardnaam. */
async function zetNaam(rgsCode, naam) {
  if (!rgsCode) throw new Error("VALIDATIE: rgsCode is verplicht.");
  const overschrijvingen = await haalOverschrijvingen();
  const huidig = overschrijvingen[rgsCode] || {};
  const nieuweNaam = (naam || "").trim();
  overschrijvingen[rgsCode] = nieuweNaam ? { ...huidig, naam: nieuweNaam } : { ...huidig, naam: undefined };
  await bewaarOverschrijvingen(overschrijvingen);
  return overschrijvingen[rgsCode];
}

/** Zet de presentatievolgorde voor een hele reeks RGS-codes tegelijk (binnen één categorie/groep
 * herschikt) — 10, 20, 30, … zodat er later nog tussengevoegd kan worden. */
async function zetVolgorde(rgsCodesInVolgorde) {
  if (!Array.isArray(rgsCodesInVolgorde) || rgsCodesInVolgorde.length === 0) {
    throw new Error("VALIDATIE: volgorde moet een niet-lege lijst RGS-codes zijn.");
  }
  const overschrijvingen = await haalOverschrijvingen();
  rgsCodesInVolgorde.forEach((rgsCode, i) => {
    const huidig = overschrijvingen[rgsCode] || {};
    overschrijvingen[rgsCode] = { ...huidig, volgorde: (i + 1) * 10 };
  });
  await bewaarOverschrijvingen(overschrijvingen);
  return overschrijvingen;
}

/** Voegt één RGS-code samen met een doelcode (samenvoegNaar = rgsCode van de doel-/hoofdregel).
 *  De saldi van samengevoegde codes worden bij het doel opgeteld en de bronregel verdwijnt uit de
 *  rapportage (zie bouwRapportage in api/rapportages). Leeg = samenvoeging opheffen (weer los). */
async function zetSamenvoeging(rgsCode, samenvoegNaar) {
  if (!rgsCode) throw new Error("VALIDATIE: rgsCode is verplicht.");
  const doel = (samenvoegNaar || "").trim();
  if (doel && doel === rgsCode) throw new Error("VALIDATIE: een code kan niet met zichzelf worden samengevoegd.");
  const overschrijvingen = await haalOverschrijvingen();
  const huidig = overschrijvingen[rgsCode] || {};
  overschrijvingen[rgsCode] = doel ? { ...huidig, samenvoegNaar: doel } : { ...huidig, samenvoegNaar: undefined };
  await bewaarOverschrijvingen(overschrijvingen);
  return overschrijvingen[rgsCode];
}

async function bewaarOverschrijvingen(overschrijvingen) {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(overschrijvingen, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
}

/** Past de overschrijvingen toe op de RGS-referentielijst — geeft dezelfde vorm terug als
 * RGS_REFERENTIE, maar dan met naam/volgorde vervangen waar een overschrijving bestaat. */
function pasToe(rgsReferentie, overschrijvingen) {
  return rgsReferentie
    .map((r) => {
      const o = overschrijvingen[r.rgsCode] || {};
      return {
        ...r,
        naam: o.naam || r.standaardNaam,
        volgorde: o.volgorde != null ? o.volgorde : r.standaardVolgorde,
        samenvoegNaar: o.samenvoegNaar || null,
      };
    })
    .sort((a, b) => a.volgorde - b.volgorde);
}

module.exports = { haalOverschrijvingen, zetNaam, zetVolgorde, zetSamenvoeging, pasToe };
