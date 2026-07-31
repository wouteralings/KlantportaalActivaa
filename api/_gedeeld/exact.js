/**
 * Exact Online-koppeling — OAuth2 (authorization code + refresh) en tokenbeheer.
 *
 * Config-gated: doet niets tenzij de Application Settings aanwezig zijn:
 *   EXACT_CLIENT_ID, EXACT_CLIENT_SECRET, EXACT_REDIRECT_URI
 *   EXACT_BASE (optioneel, standaard https://start.exactonline.nl)
 *   EXACT_DIVISION (optioneel; anders opgehaald via /current/Me na verbinden)
 *
 * Tokens worden bewaard in Azure Blob (container portaalcontent, blob exact-tokens.json). LET OP:
 * Exact's access-token verloopt na ~10 minuten en het refresh-token ROTEERT bij elke vernieuwing —
 * daarom slaan we na elke refresh het nieuwe refresh-token direct weer op.
 */
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "portaalcontent";
const BLOB = "exact-tokens.json";

function base() { return (process.env.EXACT_BASE || "https://start.exactonline.nl").replace(/\/$/, ""); }
function isGeconfigureerd() { return !!(process.env.EXACT_CLIENT_ID && process.env.EXACT_CLIENT_SECRET && process.env.EXACT_REDIRECT_URI); }

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
async function leesTokens() {
  try {
    const c = await haalContainer();
    const blob = c.getBlockBlobClient(BLOB);
    if (!(await blob.exists())) return null;
    return JSON.parse(await streamNaarTekst((await blob.download()).readableStreamBody));
  } catch (e) { if (e.message === "MISSING_CONFIG") throw e; return null; }
}
async function bewaarTokens(t) {
  const c = await haalContainer();
  const data = Buffer.from(JSON.stringify(t), "utf-8");
  await c.getBlockBlobClient(BLOB).upload(data, data.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json" } });
}

/** Bouwt de URL waar de gebruiker naartoe moet om Exact-toegang te verlenen. */
function authorizeUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.EXACT_CLIENT_ID || "",
    redirect_uri: process.env.EXACT_REDIRECT_URI || "",
    response_type: "code",
    force_login: "1",
  });
  if (state) p.set("state", state);
  return `${base()}/api/oauth2/auth?${p.toString()}`;
}

async function haalDivision(accessToken) {
  if (process.env.EXACT_DIVISION) return process.env.EXACT_DIVISION;
  const res = await fetch(`${base()}/api/v1/current/Me?$select=CurrentDivision`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Exact /current/Me mislukt (${res.status}): ${await res.text()}`);
  const d = await res.json();
  const div = d && d.d && d.d.results && d.d.results[0] && d.d.results[0].CurrentDivision;
  if (!div) throw new Error("Kon de Exact-division niet bepalen.");
  return String(div);
}

/** Wisselt de authorization code in voor tokens (na de OAuth-redirect) en bewaart ze. */
async function wisselCodeIn(code) {
  if (!isGeconfigureerd()) throw new Error("EXACT_NIET_GECONFIGUREERD");
  const body = new URLSearchParams({
    code, grant_type: "authorization_code",
    client_id: process.env.EXACT_CLIENT_ID, client_secret: process.env.EXACT_CLIENT_SECRET,
    redirect_uri: process.env.EXACT_REDIRECT_URI,
  });
  const res = await fetch(`${base()}/api/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!res.ok) throw new Error(`Exact token-uitwisseling mislukt (${res.status}): ${await res.text()}`);
  const t = await res.json();
  const division = await haalDivision(t.access_token);
  const opslag = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (Number(t.expires_in || 600) - 30) * 1000).toISOString(), division };
  await bewaarTokens(opslag);
  return { verbonden: true, division };
}

async function vernieuw(tokens) {
  const body = new URLSearchParams({
    refresh_token: tokens.refresh_token, grant_type: "refresh_token",
    client_id: process.env.EXACT_CLIENT_ID, client_secret: process.env.EXACT_CLIENT_SECRET,
  });
  const res = await fetch(`${base()}/api/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!res.ok) throw new Error(`Exact token-vernieuwing mislukt (${res.status}): ${await res.text()}`);
  const t = await res.json();
  const opslag = { access_token: t.access_token, refresh_token: t.refresh_token || tokens.refresh_token, expires_at: new Date(Date.now() + (Number(t.expires_in || 600) - 30) * 1000).toISOString(), division: tokens.division };
  await bewaarTokens(opslag);
  return opslag;
}

/** Geldig access-token + division; vernieuwt automatisch. Gooit EXACT_NIET_VERBONDEN als er nog niet is gekoppeld. */
async function geldigToken() {
  if (!isGeconfigureerd()) throw new Error("EXACT_NIET_GECONFIGUREERD");
  let tokens = await leesTokens();
  if (!tokens || !tokens.refresh_token) throw new Error("EXACT_NIET_VERBONDEN");
  if (!tokens.expires_at || new Date(tokens.expires_at).getTime() <= Date.now()) tokens = await vernieuw(tokens);
  return { accessToken: tokens.access_token, division: tokens.division, base: base() };
}

async function status() {
  const geconfigureerd = isGeconfigureerd();
  if (!geconfigureerd) return { geconfigureerd: false, verbonden: false };
  let tokens = null;
  try { tokens = await leesTokens(); } catch { /* geen storage */ }
  return { geconfigureerd: true, verbonden: !!(tokens && tokens.refresh_token), division: tokens ? tokens.division : (process.env.EXACT_DIVISION || null), verlooptOp: tokens ? tokens.expires_at : null };
}

module.exports = { isGeconfigureerd, authorizeUrl, wisselCodeIn, geldigToken, status, base };
