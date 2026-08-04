/**
 * Ontwikkelverzoeken — intern bord waarop medewerkers bugs melden en nieuwe functionaliteit
 * voorstellen. Gedeeld: iedere medewerker ziet alle verzoeken; alleen beheerders zetten de status
 * en plaatsen reacties. Medewerkers kunnen stemmen (👍) op een verzoek.
 *
 * Opslag in Azure Blob (container portaalcontent):
 *   - ontwikkelverzoeken.json                → de lijst met verzoeken
 *   - ontwikkelverzoeken-afb/<blobnaam>      → geüploade screenshots (los per verzoek)
 *
 * Eén verzoek:
 *   { id, type: "bug"|"functionaliteit", titel, omschrijving, prioriteit: "laag"|"midden"|"hoog",
 *     status: "nieuw"|"opgepakt"|"afgerond"|"afgewezen", indienerEmail, indienerNaam, aangemaaktOp,
 *     stemmen: [email], reacties: [{ door, email, tekst, op }],
 *     afbeelding: { blob, contentType, naam } | null, gewijzigdOp, afgehandeldDoor }
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const CONTAINER = "portaalcontent";
const BLOB = "ontwikkelverzoeken.json";
const AFB_PREFIX = "ontwikkelverzoeken-afb/";

const TYPES = ["bug", "functionaliteit"];
const PRIORITEITEN = ["laag", "midden", "hoog"];
const STATUSSEN = ["nieuw", "opgepakt", "afgerond", "afgewezen"];

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
async function streamNaarBuffer(stream) {
  const stukken = [];
  for await (const s of stream) stukken.push(Buffer.isBuffer(s) ? s : Buffer.from(s));
  return Buffer.concat(stukken);
}

async function haalAlle() {
  try {
    const c = await haalContainer();
    const blob = c.getBlockBlobClient(BLOB);
    if (!(await blob.exists())) return [];
    const buf = await streamNaarBuffer((await blob.download()).readableStreamBody);
    const lijst = JSON.parse(buf.toString("utf-8")) || [];
    return Array.isArray(lijst) ? lijst : [];
  } catch (e) {
    if (e.message === "MISSING_CONFIG") throw e;
    return [];
  }
}

async function bewaarAlle(lijst) {
  const c = await haalContainer();
  const data = Buffer.from(JSON.stringify(lijst), "utf-8");
  await c.getBlockBlobClient(BLOB).upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
}

function normPrioriteit(p) { return PRIORITEITEN.includes(String(p)) ? String(p) : "midden"; }
function normType(t) { return TYPES.includes(String(t)) ? String(t) : "functionaliteit"; }

/** Slaat een geüploade screenshot (data-URL of losse base64 + contentType) op als eigen blob. */
async function bewaarAfbeelding(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const contentType = m[1];
  if (!/^image\//.test(contentType)) return null;
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null; // max 8MB
  const ext = (contentType.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png";
  const blobNaam = `${AFB_PREFIX}${crypto.randomUUID()}.${ext}`;
  const c = await haalContainer();
  await c.getBlockBlobClient(blobNaam).upload(buffer, buffer.length, { blobHTTPHeaders: { blobContentType: contentType } });
  return { blob: blobNaam, contentType };
}

/** Streamt een eerder opgeslagen screenshot terug (buffer + contentType), of null. */
async function haalAfbeelding(blobNaam) {
  if (!blobNaam || !String(blobNaam).startsWith(AFB_PREFIX)) return null;
  const c = await haalContainer();
  const blob = c.getBlockBlobClient(blobNaam);
  if (!(await blob.exists())) return null;
  const dl = await blob.download();
  const buffer = await streamNaarBuffer(dl.readableStreamBody);
  return { buffer, contentType: dl.contentType || "application/octet-stream" };
}

async function verwijderAfbeelding(blobNaam) {
  if (!blobNaam || !String(blobNaam).startsWith(AFB_PREFIX)) return;
  try { const c = await haalContainer(); await c.getBlockBlobClient(blobNaam).deleteIfExists(); } catch { /* best effort */ }
}

async function voegToe({ type, titel, omschrijving, prioriteit, indienerEmail, indienerNaam, afbeeldingData }) {
  const lijst = await haalAlle();
  const afbeelding = afbeeldingData ? await bewaarAfbeelding(afbeeldingData) : null;
  const nu = new Date().toISOString();
  const verzoek = {
    id: crypto.randomUUID(),
    type: normType(type),
    titel: String(titel || "").trim().slice(0, 200),
    omschrijving: String(omschrijving || "").trim().slice(0, 5000),
    prioriteit: normPrioriteit(prioriteit),
    status: "nieuw",
    indienerEmail: String(indienerEmail || "").toLowerCase(),
    indienerNaam: indienerNaam || indienerEmail || "",
    aangemaaktOp: nu,
    gewijzigdOp: nu,
    stemmen: [],
    reacties: [],
    afbeelding: afbeelding ? { blob: afbeelding.blob, contentType: afbeelding.contentType, naam: "screenshot" } : null,
    afgehandeldDoor: "",
  };
  lijst.unshift(verzoek);
  await bewaarAlle(lijst);
  return verzoek;
}

async function werkBij(id, velden, door) {
  const lijst = await haalAlle();
  const i = lijst.findIndex((v) => v.id === id);
  if (i < 0) return null;
  const v = lijst[i];
  if (velden.status && STATUSSEN.includes(velden.status)) { v.status = velden.status; v.afgehandeldDoor = door || v.afgehandeldDoor; }
  if (velden.prioriteit) v.prioriteit = normPrioriteit(velden.prioriteit);
  if (velden.type) v.type = normType(velden.type);
  if (typeof velden.titel === "string") v.titel = velden.titel.trim().slice(0, 200);
  if (typeof velden.omschrijving === "string") v.omschrijving = velden.omschrijving.trim().slice(0, 5000);
  v.gewijzigdOp = new Date().toISOString();
  lijst[i] = v;
  await bewaarAlle(lijst);
  return v;
}

async function voegReactieToe(id, { door, email, tekst }) {
  const lijst = await haalAlle();
  const i = lijst.findIndex((v) => v.id === id);
  if (i < 0) return null;
  const schoon = String(tekst || "").trim().slice(0, 2000);
  if (!schoon) return lijst[i];
  lijst[i].reacties = lijst[i].reacties || [];
  lijst[i].reacties.push({ door: door || email || "", email: String(email || "").toLowerCase(), tekst: schoon, op: new Date().toISOString() });
  lijst[i].gewijzigdOp = new Date().toISOString();
  await bewaarAlle(lijst);
  return lijst[i];
}

/** Toggelt een stem van een medewerker (op e-mail). */
async function stemToggle(id, email) {
  const e = String(email || "").toLowerCase();
  const lijst = await haalAlle();
  const i = lijst.findIndex((v) => v.id === id);
  if (i < 0 || !e) return null;
  const stemmen = new Set((lijst[i].stemmen || []).map((x) => String(x).toLowerCase()));
  if (stemmen.has(e)) stemmen.delete(e); else stemmen.add(e);
  lijst[i].stemmen = [...stemmen];
  await bewaarAlle(lijst);
  return lijst[i];
}

async function verwijder(id) {
  const lijst = await haalAlle();
  const v = lijst.find((x) => x.id === id);
  if (v && v.afbeelding && v.afbeelding.blob) await verwijderAfbeelding(v.afbeelding.blob);
  const nieuw = lijst.filter((x) => x.id !== id);
  await bewaarAlle(nieuw);
  return nieuw.length !== lijst.length;
}

module.exports = {
  TYPES, PRIORITEITEN, STATUSSEN,
  haalAlle, voegToe, werkBij, voegReactieToe, stemToggle, verwijder,
  haalAfbeelding,
};
