/**
 * Helpers om via Microsoft Graph een bestand in een SharePoint-map te schrijven, uitgaande van
 * een volledige map-URL (zoals opgeslagen in cr283_sharepoint op de cliënt). Gebruikt een
 * Graph-token met schrijfrechten (Files.ReadWrite.All), verkregen via de OBO-flow.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";

function graphHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra };
}

/** Codeert een gedeelde URL naar de Graph "shares"-notatie (u!<base64url>). */
function encodeShareUrl(url) {
  const b64 = Buffer.from(url, "utf-8").toString("base64");
  return "u!" + b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

/** Zoekt de driveItem (map) achter een SharePoint-map-URL op. Geeft {driveId, itemId, webUrl}. */
async function resolveFolder(token, folderUrl) {
  const enc = encodeShareUrl(folderUrl);
  const res = await fetch(`${GRAPH}/shares/${enc}/driveItem?$select=id,name,webUrl,parentReference,folder`, {
    headers: graphHeaders(token),
  });
  if (!res.ok) throw new Error(`Map niet gevonden in SharePoint (${res.status}): ${await res.text()}`);
  const item = await res.json();
  const driveId = item.parentReference?.driveId || item.parentReference?.driveId;
  if (!driveId || !item.id) throw new Error("Kon driveId/itemId van de SharePoint-map niet bepalen.");
  return { driveId, itemId: item.id, webUrl: item.webUrl };
}

/** Zorgt dat een submap met 'naam' onder parentId bestaat en geeft het item-id terug. */
async function ensureSubfolder(token, driveId, parentId, naam) {
  // Bestaat de map al?
  const zoek = await fetch(
    `${GRAPH}/drives/${driveId}/items/${parentId}/children?$select=id,name,folder&$filter=${encodeURIComponent(`name eq '${naam.replace(/'/g, "''")}'`)}`,
    { headers: graphHeaders(token) }
  );
  if (zoek.ok) {
    const data = await zoek.json();
    const bestaand = (data.value || []).find((c) => c.name === naam && c.folder);
    if (bestaand) return bestaand.id;
  }
  // Anders aanmaken.
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${parentId}/children`, {
    method: "POST",
    headers: graphHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name: naam, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (res.ok) return (await res.json()).id;
  // Race/al bestaand → nog eens ophalen.
  const her = await fetch(
    `${GRAPH}/drives/${driveId}/items/${parentId}/children?$select=id,name,folder`,
    { headers: graphHeaders(token) }
  );
  if (her.ok) {
    const data = await her.json();
    const bestaand = (data.value || []).find((c) => c.name === naam && c.folder);
    if (bestaand) return bestaand.id;
  }
  throw new Error(`Kon submap '${naam}' niet aanmaken: ${await res.text()}`);
}

/** Loopt een pad van submappen af (aanmaken waar nodig) en geeft het diepste item-id terug. */
async function ensureFolderPath(token, driveId, startItemId, segmenten) {
  let huidig = startItemId;
  for (const seg of segmenten) huidig = await ensureSubfolder(token, driveId, huidig, seg);
  return huidig;
}

/** Uploadt (klein) bestand naar map 'folderId'. Geeft het aangemaakte driveItem terug. */
async function uploadBestand(token, driveId, folderId, bestandsnaam, buffer, contentType = "application/pdf") {
  const pad = encodeURIComponent(bestandsnaam);
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${folderId}:/${pad}:/content`, {
    method: "PUT",
    headers: graphHeaders(token, { "Content-Type": contentType }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`Uploaden naar SharePoint mislukt (${res.status}): ${await res.text()}`);
  return res.json();
}

module.exports = { resolveFolder, ensureFolderPath, uploadBestand };
