/**
 * /api/mijn-document-inhoud — de INHOUD (bytes) van één document van de ingelogde klant, app-only
 * opgehaald en met dezelfde rechten-afdwinging als /api/mijn-documenten. De klant heeft zelf geen
 * SharePoint-toegang; het portaal streamt het bestand door.
 *
 * GET ?accountId=&driveId=&itemId=[&formaat=pdf]
 *   - accountId : één van de cliënten van de ingelogde gebruiker (geverifieerd)
 *   - formaat   : optioneel, laat Graph converteren (bv. 'pdf') voor inline preview
 */
const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { haalVoorContact } = require("../_gedeeld/documentrechten");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const dm = require("../_gedeeld/documentmappen");

function magSectie(sectie, rechten) {
  if (sectie === "directie") return !!rechten.inzienDirectie;
  if (sectie === "administratie") return !!(rechten.inzienAdministratie || rechten.bewerkenAdministratie);
  if (sectie === "documenten") return !!rechten.inzien;
  return false; // onbekende/niet-toegestane sectie → geen toegang (fail-closed)
}

async function haalSharePointUrl(resource, dynToken, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=cr283_sharepoint`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${dynToken}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
  if (!res.ok) return "";
  const d = await res.json();
  return d.cr283_sharepoint || "";
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const accountId = (req.query.accountId || "").trim();
  const driveId = (req.query.driveId || "").trim();
  const itemId = (req.query.itemId || "").trim();
  const formaat = (req.query.formaat || "").trim().toLowerCase();
  if (!accountId || !driveId || !itemId) {
    context.res = { status: 400, body: { error: "Geef 'accountId', 'driveId' en 'itemId' mee." } };
    return;
  }

  try {
    const dynToken = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, dynToken);
    const account = accounts.find((a) => a.accountId === accountId);
    if (!account) { context.res = { status: 403, body: { error: "Geen toegang tot deze cliënt." } }; return; }

    const rechten = await haalVoorContact(account.contactId);
    if (!rechten.inzien && !rechten.inzienDirectie && !rechten.inzienAdministratie) {
      context.res = { status: 403, body: { error: "Je hebt geen recht om documenten in te zien." } };
      return;
    }

    const appToken = await haalAppGraphToken();
    const spUrl = await haalSharePointUrl(resource, dynToken, account.accountId);
    if (!spUrl) { context.res = { status: 404, body: { error: "Voor deze cliënt is geen documentmap ingesteld." } }; return; }

    const ctx = await dm.haalDocumentContext(appToken, spUrl);
    const item = await dm.haalItem(appToken, driveId, itemId);
    if (!item || !item.webUrl || !ctx.base.webUrl || !item.webUrl.startsWith(ctx.base.webUrl)) {
      context.res = { status: 403, body: { error: "Dit document hoort niet bij je cliënt." } };
      return;
    }
    const sectie = dm.sectieVanItem(item.webUrl, ctx);
    if (!magSectie(sectie, rechten)) {
      context.res = { status: 403, body: { error: "Je hebt geen recht op dit document." } };
      return;
    }

    let graphUrl = `${dm.GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`;
    if (formaat) graphUrl += `?format=${encodeURIComponent(formaat)}`;
    const res = await fetch(graphUrl, { headers: { Authorization: `Bearer ${appToken}` } });
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
      headers: { "Content-Type": contentType, "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
      body: buffer,
      isRaw: true,
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "De app-only SharePoint-koppeling is nog niet geconfigureerd." } }; return; }
    if (err.code === "GRAPH_APP_TOKEN_MISLUKT") { context.res = { status: 501, body: { error: "De app-only SharePoint-toegang is nog niet actief (Sites.Selected ontbreekt)." } }; return; }
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, body: { error: "Onverwachte fout bij ophalen van het document.", detail: String(err.message || err) } };
  }
};
