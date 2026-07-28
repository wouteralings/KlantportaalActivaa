const { haalGebruikersToken, wisselVoorGraphToken } = require("../_gedeeld/graphObo");

/**
 * Haalt de INHOUD van één SharePoint-/OneDrive-document op via Microsoft Graph (on-behalf-of),
 * en geeft de bytes terug. Zo hoeft het document niet in een SharePoint-iframe getoond te worden
 * (dat blokkeert SharePoint via 'frame-ancestors') en is er ook geen anonieme deellink nodig:
 * Graph past de échte permissies van de ingelogde gebruiker toe.
 *
 * GET /api/document-inhoud?url=<sharepoint web-/deellink>
 *   of ?driveId=..&itemId=..   (zoals aangeleverd door /api/documenten)
 *
 * De frontend stuurt het MSAL-token mee als Authorization: Bearer <token>, haalt de bytes op,
 * maakt er een blob-URL van en toont die in een <iframe>/<embed>.
 */

// Codeert een deel-/web-URL naar een Graph 'shareId' (u!<base64url>).
function encodeShareUrl(url) {
  const b64 = Buffer.from(url, "utf8").toString("base64");
  return "u!" + b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

module.exports = async function (context, req) {
  const gebruikersToken = haalGebruikersToken(req);
  if (!gebruikersToken) {
    context.res = { status: 401, body: { error: "Geen geldig token meegestuurd. Log opnieuw in." } };
    return;
  }

  const url = (req.query.url || "").trim();
  const driveId = (req.query.driveId || "").trim();
  const itemId = (req.query.itemId || "").trim();
  // Optioneel: laat Graph het bestand converteren (bv. Word/Excel/PowerPoint → 'pdf'),
  // zodat het inline te previewen is in de browser.
  const formaat = (req.query.formaat || "").trim().toLowerCase();
  if (!url && !(driveId && itemId)) {
    context.res = { status: 400, body: { error: "Geef 'url' of 'driveId'+'itemId' mee." } };
    return;
  }

  try {
    const graphToken = await wisselVoorGraphToken(gebruikersToken);

    let graphUrl = url
      ? `https://graph.microsoft.com/v1.0/shares/${encodeShareUrl(url)}/driveItem/content`
      : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`;
    if (formaat) graphUrl += `?format=${encodeURIComponent(formaat)}`;

    const res = await fetch(graphUrl, { headers: { Authorization: `Bearer ${graphToken}` } });
    if (!res.ok) {
      const tekst = await res.text().catch(() => "");
      const status = res.status === 404 ? 404 : res.status === 403 ? 403 : 502;
      context.res = { status, body: { error: "Document ophalen bij SharePoint mislukt.", detail: tekst.slice(0, 500) } };
      return;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";

    context.res = {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Inline tonen (preview in iframe/embed), niet als download forceren.
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
      body: buffer,
      isRaw: true,
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Graph-koppeling (AAD_*) is nog niet geconfigureerd." } };
      return;
    }
    if (err.code === "OBO_MISLUKT") {
      context.res = { status: 401, body: { error: "Sessie verlopen of onvoldoende rechten. Log opnieuw in." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, body: { error: "Onverwachte fout bij ophalen van het document.", detail: String(err) } };
  }
};
