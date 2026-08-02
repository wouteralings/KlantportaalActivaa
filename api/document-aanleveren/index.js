const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");

/**
 * Laat de ingelogde klant documenten aanleveren die direct in ZIJN EIGEN SharePoint-map worden
 * gezet — zonder dat de klant zelf SharePoint-rechten heeft. De app schrijft namelijk app-only
 * (met eigen rechten). De doelmap wordt afgeleid uit de identiteit van de klant (via Dynamics),
 * nooit uit iets wat de browser meestuurt, zodat een klant nooit in de map van een ander kan.
 *
 * POST body: { taakId, bestanden: [{ naam, dataUrl }] }
 * De taak bepaalt (net als bij het ondertekenen) om welke klant het gaat; er wordt gecontroleerd
 * dat die taak bij een van de accounts van de ingelogde gebruiker hoort.
 */
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const KLANT_VALUE = `_${KLANT_VELD}_value`;
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const AANLEVER_SUBMAP = process.env.KLANT_AANLEVER_SUBMAP || "Aangeleverd via portaal";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per bestand

const DYN = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
});

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }
  if (req.method !== "POST") { context.res = { status: 405, body: { error: "Methode niet ondersteund." } }; return; }

  try {
    const email = haalEmailUitPrincipal(req);
    if (!email) { context.res = { status: 403, body: { error: "Kon je identiteit niet bepalen." } }; return; }

    const taakId = req.body?.taakId || req.body?.id;
    const bestanden = Array.isArray(req.body?.bestanden) ? req.body.bestanden : [];
    if (!taakId) { context.res = { status: 400, body: { error: "Geef 'taakId' mee." } }; return; }
    if (bestanden.length === 0) { context.res = { status: 400, body: { error: "Geen bestanden meegestuurd." } }; return; }

    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);
    const accountIds = accounts.map((a) => a.accountId);

    // Taak ophalen en controleren dat hij bij een account van deze klant hoort.
    const taakRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?$select=subject,_regardingobjectid_value,${KLANT_VALUE}`, { headers: DYN(token) });
    if (!taakRes.ok) { context.res = { status: 404, body: { error: "Taak niet gevonden." } }; return; }
    const taak = await taakRes.json();
    const accountId = taak[KLANT_VALUE] || taak._regardingobjectid_value;
    if (!accountIds.includes(accountId)) { context.res = { status: 403, body: { error: "Deze taak hoort niet bij een van jouw accounts." } }; return; }

    // Basis-map van de klant (cr283_sharepoint op het account).
    const accRes = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=${SHAREPOINT_VELD}`, { headers: DYN(token) });
    const accData = accRes.ok ? await accRes.json() : {};
    const basisUrl = accData[SHAREPOINT_VELD];
    if (!basisUrl) { context.res = { status: 409, body: { error: `Voor deze klant is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD}).` } }; return; }

    const graphToken = await haalAppGraphToken();
    const map = await resolveFolder(graphToken, basisUrl);
    const doelId = await ensureFolderPath(graphToken, map.driveId, map.itemId, [AANLEVER_SUBMAP]);

    const resultaat = [];
    for (const b of bestanden) {
      const m = /^data:([^;]*);base64,(.+)$/.exec((b && b.dataUrl) || "");
      const veiligeNaam = String((b && b.naam) || "bestand").replace(/[\\/:*?"<>|]+/g, " ").trim() || "bestand";
      if (!m) { resultaat.push({ naam: veiligeNaam, ok: false, error: "ongeldig bestand" }); continue; }
      const contentType = m[1] || "application/octet-stream";
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length === 0) { resultaat.push({ naam: veiligeNaam, ok: false, error: "leeg bestand" }); continue; }
      if (buffer.length > MAX_BYTES) { resultaat.push({ naam: veiligeNaam, ok: false, error: "te groot (max 25 MB)" }); continue; }
      try {
        const up = await uploadBestand(graphToken, map.driveId, doelId, veiligeNaam, buffer, contentType);
        resultaat.push({ naam: veiligeNaam, ok: true, url: up.webUrl || null });
      } catch (e) {
        resultaat.push({ naam: veiligeNaam, ok: false, error: String(e.message || e) });
      }
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: resultaat.every((r) => r.ok), resultaat } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Graph-/opslag-koppeling is nog niet geconfigureerd." } }; return; }
    if (err.code === "APP_TOKEN_MISLUKT") { context.res = { status: 502, body: { error: "Kon geen app-toegang tot SharePoint krijgen. Controleer de Graph-applicatiepermissie (admin-consent)." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Aanleveren is niet gelukt.", detail: String(err) } };
  }
};
