const { haalGebruikersToken, wisselVoorGraphToken } = require("../_gedeeld/graphObo");
const { haalLabels } = require("../_gedeeld/labels");
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");

/**
 * Toont de SharePoint-/OneDrive-items waar de ingelogde klant recht op heeft. Graph past de
 * échte permissies van die gebruiker toe (on-behalf-of), dus er is geen aparte toegangs-
 * administratie nodig.
 *
 * - Zonder query: de met de klant gedeelde items op topniveau (me/drive/sharedWithMe).
 * - Met ?driveId=..&itemId=..: de inhoud van die map (drives/{driveId}/items/{itemId}/children),
 *   zodat de klant door de mappenstructuur kan navigeren.
 */
const SELECT = "$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,remoteItem,parentReference";

function mapItem(item) {
  // Gedeelde items staan vaak onder remoteItem; de inhoud van een map zijn gewone driveItems.
  const bron = item.remoteItem || item;
  const driveId = bron.parentReference?.driveId || item.parentReference?.driveId || null;
  const itemId = bron.id || item.id;
  const isMap = !!bron.folder;
  return {
    id: item.id,
    naam: bron.name,
    type: isMap ? "map" : "bestand",
    grootteKb: bron.size ? Math.round(bron.size / 1024) : null,
    gewijzigd: bron.lastModifiedDateTime,
    url: bron.webUrl,
    // Nodig om in deze map te kunnen doorklikken:
    driveId,
    itemId,
    aantalItems: isMap ? bron.folder.childCount ?? null : null,
  };
}

async function haalGedeeldeItems(graphToken) {
  const url = "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?" + SELECT;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
  if (!res.ok) throw new Error(`Graph-aanvraag mislukt: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map(mapItem);
}

async function haalMapInhoud(graphToken, driveId, itemId) {
  const url =
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}` +
    `/items/${encodeURIComponent(itemId)}/children?` + SELECT + "&$top=200&$orderby=name";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
  if (!res.ok) throw new Error(`Map-inhoud ophalen mislukt: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map(mapItem);
}

module.exports = async function (context, req) {
  const gebruikersToken = haalGebruikersToken(req);
  if (!gebruikersToken) {
    context.res = { status: 401, body: { error: "Geen geldig token meegestuurd. Log opnieuw in." } };
    return;
  }

  try {
    const graphToken = await wisselVoorGraphToken(gebruikersToken);

    const driveId = req.query.driveId;
    const itemId = req.query.itemId;
    const items =
      driveId && itemId
        ? await haalMapInhoud(graphToken, driveId, itemId)
        : await haalGedeeldeItems(graphToken);

    // Eigen labels/entiteit-koppelingen toepassen (per e-mailadres opgeslagen, op item-id).
    const email = haalEmailUitPrincipal(req);
    const labels = email ? await haalLabels(email) : {};

    const resultaat = items.map((item) => {
      const opgeslagen = labels[item.id] || {};
      return { ...item, label: opgeslagen.label || item.naam, entiteit: opgeslagen.entiteit || "" };
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: resultaat };
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
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij ophalen van documenten.", detail: String(err) },
    };
  }
};
