/**
 * /api/mijn-document-upload — de INGELOGDE klant uploadt (app-only) een bestand in de vaste
 * "Administratie"-map van zijn cliënt. De klant heeft zelf géén SharePoint-toegang; het portaal
 * schrijft namens de app-identiteit, en bepaalt (niet de klant) waar geschreven mag worden.
 *
 * Vereist het recht 'bewerkenAdministratie' op de contactpersoon (zie api/_gedeeld/documentrechten).
 * De doelmap moet server-side binnen de Administratie-submap van DÉZE cliënt vallen — zo kan een
 * klant nooit buiten Administratie (of bij een andere cliënt) schrijven, ook al stuurt de browser
 * iets anders mee.
 *
 * POST { accountId, driveId, itemId, origineleNaam, contentType?, contentBase64 }
 *   itemId = de (sub)map binnen Administratie waarin geüpload wordt (uit /api/mijn-documenten).
 *   → { ok:true, bestand:{ naam, url } }
 *
 * Route valt onder de catch-all /* ("authenticated") in staticwebapp.config.json; de fijnmazige
 * rechten-/locatiecontrole gebeurt hier server-side (fail-closed).
 */
const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalVoorContact } = require("../_gedeeld/documentrechten");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { uploadBestand } = require("../_gedeeld/sharepointUpload");
const dm = require("../_gedeeld/documentmappen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

const MAX_BYTES = 40 * 1024 * 1024; // 40 MB

/** Maakt een veilige SharePoint-bestandsnaam: verboden tekens eruit, extensie (in de naam) behouden. */
function veiligeBestandsnaam(origineleNaam) {
  const schoon = String(origineleNaam || "").replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").trim();
  return (schoon || "document").slice(0, 200);
}

async function haalSharePointUrl(resource, dynToken, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=cr283_sharepoint`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${dynToken}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
  if (!res.ok) return "";
  return (await res.json()).cr283_sharepoint || "";
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }
  if ((req.method || "").toUpperCase() !== "POST") { context.res = { status: 405, body: { error: "Methode niet toegestaan." } }; return; }

  const b = req.body || {};
  const accountId = String(b.accountId || "").trim();
  const driveId = String(b.driveId || "").trim();
  const itemId = String(b.itemId || "").trim();
  if (!accountId || !driveId || !itemId) { context.res = { status: 400, body: { error: "Geef 'accountId', 'driveId' en 'itemId' (doelmap) mee." } }; return; }
  if (!b.contentBase64) { context.res = { status: 400, body: { error: "Geef 'contentBase64' mee." } }; return; }

  let buffer;
  try { buffer = Buffer.from(String(b.contentBase64), "base64"); } catch { buffer = null; }
  if (!buffer || buffer.length === 0) { context.res = { status: 400, body: { error: "Leeg of ongeldig bestand." } }; return; }
  if (buffer.length > MAX_BYTES) { context.res = { status: 400, body: { error: `Bestand is te groot (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` } }; return; }

  const naam = veiligeBestandsnaam(b.origineleNaam);

  try {
    const dynToken = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, dynToken);
    const account = accounts.find((a) => a.accountId === accountId);
    if (!account) { context.res = { status: 403, body: { error: "Geen toegang tot deze cliënt." } }; return; }

    const rechten = await haalVoorContact(account.contactId);
    if (!rechten.bewerkenAdministratie) {
      context.res = { status: 403, body: { error: "Je hebt geen recht om bestanden in de map Administratie te plaatsen." } };
      return;
    }

    const appToken = await haalAppGraphToken();
    const spUrl = await haalSharePointUrl(resource, dynToken, account.accountId);
    if (!spUrl) { context.res = { status: 404, body: { error: "Voor deze cliënt is geen documentmap ingesteld." } }; return; }

    const ctx = await dm.haalDocumentContext(appToken, spUrl);
    const doel = await dm.haalItem(appToken, driveId, itemId);
    // De doelmap moet een MAP zijn, binnen de basismap van déze cliënt, én binnen de Administratie-sectie.
    if (!doel || !doel.folder || !doel.webUrl || !ctx.base.webUrl || !doel.webUrl.startsWith(ctx.base.webUrl)) {
      context.res = { status: 403, body: { error: "Deze doelmap hoort niet bij je cliënt." } };
      return;
    }
    if (dm.sectieVanItem(doel.webUrl, ctx) !== "administratie") {
      context.res = { status: 403, body: { error: "Je mag alleen uploaden in de map Administratie." } };
      return;
    }

    const geupload = await uploadBestand(appToken, driveId, itemId, naam, buffer, b.contentType || "application/octet-stream");

    await logGebeurtenis({
      door: haalEmailUitPrincipal(req) || account.contactNaam || "klant",
      actie: "document", accountId: account.accountId, accountIds: [account.accountId],
      klantnaam: account.klantnaam,
      tekst: `Klant heeft bestand "${naam}" geüpload in de map Administratie via het klantportaal.`,
    }).catch(() => {});

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, bestand: { naam, url: (geupload && geupload.webUrl) || "" } },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "De app-only SharePoint-koppeling is nog niet geconfigureerd." } }; return; }
    if (err.code === "APP_TOKEN_MISLUKT") { context.res = { status: 501, body: { error: "De app-only SharePoint-toegang is nog niet actief (Sites.Selected ontbreekt of onvolledig)." } }; return; }
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT") {
      context.res = { status: 403, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, body: { error: "Uploaden van het document is mislukt.", detail: String(err.message || err) } };
  }
};
