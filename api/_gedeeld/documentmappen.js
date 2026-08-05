/**
 * App-only documentcontext per cliënt: bepaalt op basis van de SharePoint-map van de cliënt
 * (cr283_sharepoint) de basismap en de vaste submappen "Directie" en "Administratie". Wordt gedeeld
 * door /api/mijn-documenten (lijst) en /api/mijn-document-inhoud (download), zodat beide dezelfde
 * mappen en dezelfde rechten-afdwinging gebruiken.
 *
 * De submapnamen zijn instelbaar via App Settings (DOCUMENTEN_DIRECTIE_MAP / _ADMINISTRATIE_MAP /
 * _AANLEVEREN_MAP), met nette standaardwaarden.
 */
const { resolveFolder } = require("./sharepointUpload");

const GRAPH = "https://graph.microsoft.com/v1.0";
const SELECT = "$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference";

const DIRECTIE_MAP = process.env.DOCUMENTEN_DIRECTIE_MAP || "Directie";
const ADMINISTRATIE_MAP = process.env.DOCUMENTEN_ADMINISTRATIE_MAP || "Administratie";
const AANLEVEREN_MAP = process.env.DOCUMENTEN_AANLEVEREN_MAP || "Aanleveren";
// Submap die onder het recht "inzien" als enige zichtbaar/toegankelijk is voor de klant: zo ziet de
// klant onder "inzien" alléén de correspondentie, niet de hele basismap. Instelbaar via App Setting,
// standaard "Correspondentie" (zelfde map waar o.a. de verstuurde aangiftes in belanden).
const INZIEN_MAP = process.env.DOCUMENTEN_INZIEN_MAP || "Correspondentie";

function graphHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

/** Zet een Graph-driveItem om naar de vorm die de frontend gebruikt. */
function mapItem(item) {
  const isMap = !!item.folder;
  return {
    id: item.id,
    naam: item.name,
    type: isMap ? "map" : "bestand",
    grootteKb: item.size ? Math.round(item.size / 1024) : null,
    gewijzigd: item.lastModifiedDateTime,
    url: item.webUrl,
    driveId: item.parentReference && item.parentReference.driveId,
    itemId: item.id,
    aantalItems: isMap ? (item.folder.childCount != null ? item.folder.childCount : null) : null,
  };
}

/** Ruwe children van een map ophalen (app-only). */
async function haalKinderen(token, driveId, itemId) {
  const url = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children?${SELECT}&$top=400&$orderby=name`;
  const res = await fetch(url, { headers: graphHeaders(token) });
  if (!res.ok) throw new Error(`Map-inhoud ophalen mislukt (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.value || [];
}

/** Eén item ophalen (webUrl/parent) — voor het verifiëren dat een navigatie/download binnen een
 *  toegestane sectie valt. */
async function haalItem(token, driveId, itemId) {
  const url = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?${SELECT}`;
  const res = await fetch(url, { headers: graphHeaders(token) });
  if (!res.ok) return null;
  return await res.json();
}

/** Zoekt een submap (op naam, hoofdletterongevoelig) tussen al opgehaalde children. */
function vindSubmap(kinderen, naam) {
  const laag = String(naam).toLowerCase();
  const gevonden = (kinderen || []).find((c) => c.folder && String(c.name || "").toLowerCase() === laag);
  return gevonden ? { itemId: gevonden.id, webUrl: gevonden.webUrl || "", naam: gevonden.name } : null;
}

/**
 * Bouwt de documentcontext voor één SharePoint-map-URL (de basismap van de cliënt):
 *   { driveId, base:{itemId,webUrl}, baseKinderen:[raw], directie|null, administratie|null }
 * baseKinderen zijn de ruwe children van de basismap (zodat de aanroeper ze kan filteren zonder
 * een extra Graph-call).
 */
async function haalDocumentContext(appToken, sharepointUrl) {
  const { driveId, itemId, webUrl } = await resolveFolder(appToken, sharepointUrl);
  const baseKinderen = await haalKinderen(appToken, driveId, itemId);
  return {
    driveId,
    base: { itemId, webUrl: webUrl || "" },
    baseKinderen,
    directie: vindSubmap(baseKinderen, DIRECTIE_MAP),
    administratie: vindSubmap(baseKinderen, ADMINISTRATIE_MAP),
    correspondentie: vindSubmap(baseKinderen, INZIEN_MAP),
  };
}

/** Bepaalt in welke sectie (documenten/directie/administratie) een item valt, o.b.v. de webUrl. */
function sectieVanItem(itemWebUrl, context) {
  const url = String(itemWebUrl || "");
  if (context.directie && context.directie.webUrl && url.startsWith(context.directie.webUrl)) return "directie";
  if (context.administratie && context.administratie.webUrl && url.startsWith(context.administratie.webUrl)) return "administratie";
  // Onder het recht "inzien" is alléén de Correspondentie-submap (INZIEN_MAP) toegankelijk. Al het
  // overige direct in de basismap valt buiten elke sectie en is dus niet toegankelijk (fail-closed).
  if (context.correspondentie && context.correspondentie.webUrl && url.startsWith(context.correspondentie.webUrl)) return "documenten";
  return "";
}

module.exports = {
  GRAPH, DIRECTIE_MAP, ADMINISTRATIE_MAP, AANLEVEREN_MAP, INZIEN_MAP,
  mapItem, haalKinderen, haalItem, vindSubmap, haalDocumentContext, sectieVanItem, graphHeaders,
};
