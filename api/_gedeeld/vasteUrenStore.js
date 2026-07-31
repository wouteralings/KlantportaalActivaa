/**
 * Vaste (contract)uren per medewerker voor de interne urenregistratie. De BEHEERDER legt hier per
 * medewerker vast welke uren elke week automatisch klaarstaan — bijvoorbeeld parttime-uren of een
 * vaste vrije dag — zodat iedere medewerker op precies 40 uur uitkomt. De medewerker ziet deze uren
 * wel, maar kan ze niet zelf wijzigen of verwijderen.
 *
 * Opslag in Azure Blob (container portaalcontent, blob uren-vaste-uren.json) — beheerbare
 * referentiedata, net als de urencodes. Vorm:
 *   { "<email>": [ { id, urencode, weekdag, uren } ], ... }
 *   weekdag: 1 = maandag .. 7 = zondag. urencode verwijst naar een (niet-declarabele) urencode.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER = "portaalcontent";
const BLOB = "uren-vaste-uren.json";

let cachedContainer = null;
async function haalContainer() {
  if (cachedContainer) return cachedContainer;
  const cs = process.env.STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("MISSING_CONFIG");
  const client = BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER);
  await client.createIfNotExists();
  cachedContainer = client;
  return client;
}
async function streamNaarTekst(stream) {
  const stukken = [];
  for await (const s of stream) stukken.push(Buffer.isBuffer(s) ? s : Buffer.from(s));
  return Buffer.concat(stukken).toString("utf-8");
}

async function haalAlle() {
  try {
    const c = await haalContainer();
    const blob = c.getBlockBlobClient(BLOB);
    if (!(await blob.exists())) return {};
    return JSON.parse(await streamNaarTekst((await blob.download()).readableStreamBody)) || {};
  } catch (e) {
    if (e.message === "MISSING_CONFIG") throw e;
    return {};
  }
}

async function bewaar(alle) {
  const c = await haalContainer();
  const data = Buffer.from(JSON.stringify(alle), "utf-8");
  await c.getBlockBlobClient(BLOB).upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
}

/** Genormaliseerde slots voor één medewerker (lege lijst als er niets is ingesteld). */
function normaliseer(slots) {
  return (Array.isArray(slots) ? slots : [])
    .map((s) => ({
      id: s.id || crypto.randomUUID(),
      urencode: String(s.urencode || "").trim(),
      weekdag: Math.min(7, Math.max(1, Number(s.weekdag) || 1)),
      uren: Number(String(s.uren).toString().replace(",", ".")) || 0,
    }))
    .filter((s) => s.urencode && s.uren > 0)
    .sort((a, b) => a.weekdag - b.weekdag);
}

async function haalVoor(email) {
  const alle = await haalAlle();
  return normaliseer(alle[String(email || "").toLowerCase()]);
}

/** Vervangt de volledige set vaste uren van één medewerker. */
async function zetVoor(email, slots) {
  const sleutel = String(email || "").toLowerCase();
  if (!sleutel) throw new Error("Geen e-mailadres.");
  const alle = await haalAlle();
  const genorm = normaliseer(slots);
  if (genorm.length === 0) delete alle[sleutel]; else alle[sleutel] = genorm;
  await bewaar(alle);
  return genorm;
}

module.exports = { haalAlle, haalVoor, zetVoor };
