/**
 * Periodieke (geautomatiseerde) aanlever-uitvragen — centraal beheerd in het beheerdersportaal en
 * uitgevoerd door /api/verwerk-periodieke-uitvragen (aangeroepen door hetzelfde externe schema als
 * de terugkerende facturen).
 *
 * Opslag in Azure Blob Storage, container portaalcontent, blob periodieke-uitvragen.json.
 * Structuur: { schemas: [ { id, actief, naam, onderwerpId, frequentie, dag, maand, jaarLogica,
 *              notitie, laatstePeriode } ] }
 *   - frequentie : "maandelijks" | "kwartaal" | "jaarlijks"
 *   - dag        : dag van de maand (1-28) waarop de uitvraag klaargezet wordt
 *   - maand      : maand (1-12) — alleen voor "jaarlijks" (in welke maand)
 *   - jaarLogica : "huidig" | "vorig" — welk jaar in het {jaar} van de map/uitvraag komt
 *   - laatstePeriode : laatst verwerkte periode-sleutel (bv. "2025-Q1"); door de verwerker gezet
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "periodieke-uitvragen.json";
const FREQUENTIES = ["maandelijks", "kwartaal", "jaarlijks"];
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

function getal(v, min, max, def) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function normaliseer(schemas) {
  if (!Array.isArray(schemas)) return [];
  return schemas.slice(0, 200).map((s) => ({
    id: String((s && s.id) || "").slice(0, 60) || crypto.randomUUID(),
    actief: !(s && s.actief === false),
    naam: String((s && s.naam) || "").slice(0, 200),
    onderwerpId: String((s && s.onderwerpId) || "").slice(0, 60),
    frequentie: FREQUENTIES.includes(s && s.frequentie) ? s.frequentie : "jaarlijks",
    dag: getal(s && s.dag, 1, 28, 1),
    maand: getal(s && s.maand, 1, 12, 1),
    jaarLogica: (s && s.jaarLogica) === "vorig" ? "vorig" : "huidig",
    notitie: String((s && s.notitie) || "").slice(0, 400),
    laatstePeriode: String((s && s.laatstePeriode) || "").slice(0, 20),
  }));
}

async function haalSchemas() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  if (!(await blobClient.exists())) return [];
  try {
    const data = JSON.parse(await streamNaarTekst((await blobClient.download()).readableStreamBody));
    return normaliseer(Array.isArray(data) ? data : data.schemas);
  } catch {
    return [];
  }
}

async function zetSchemas(schemas) {
  const schoon = normaliseer(schemas);
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify({ schemas: schoon }, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return schoon;
}

/**
 * Bepaalt of een schema vandaag "vervallen" is en, zo ja, met welke periode-sleutel + jaar-label.
 * `nu` is een Date. Geeft null terug als het schema vandaag niet aan de beurt is.
 */
function bepaalPeriode(schema, nu) {
  if (!schema.actief) return null;
  const jaar = nu.getFullYear();
  const maand = nu.getMonth() + 1; // 1-12
  const dag = nu.getDate();
  const effJaar = schema.jaarLogica === "vorig" ? jaar - 1 : jaar;

  if (dag < schema.dag) return null; // firing-dag nog niet bereikt deze maand

  if (schema.frequentie === "maandelijks") {
    const periode = `${jaar}-${String(maand).padStart(2, "0")}`;
    return { periode, jaarLabel: `${effJaar}-${String(maand).padStart(2, "0")}` };
  }
  if (schema.frequentie === "kwartaal") {
    if (![1, 4, 7, 10].includes(maand)) return null; // alleen begin van een kwartaal
    const kwartaal = Math.floor((maand - 1) / 3) + 1;
    return { periode: `${jaar}-Q${kwartaal}`, jaarLabel: `${effJaar}-Q${kwartaal}` };
  }
  // jaarlijks
  if (maand !== schema.maand) return null;
  return { periode: `${jaar}`, jaarLabel: `${effJaar}` };
}

module.exports = { FREQUENTIES, haalSchemas, zetSchemas, normaliseer, bepaalPeriode };
