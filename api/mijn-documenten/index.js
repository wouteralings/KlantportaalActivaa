/**
 * /api/mijn-documenten — de SharePoint-documenten van de INGELOGDE klant, app-only opgehaald (via
 * één portaal-identiteit), waarbij het portaal — niet de klant — bepaalt wat zichtbaar is. De klant
 * heeft zelf géén SharePoint-toegang nodig.
 *
 * Rechten komen uit api/_gedeeld/documentrechten (per contactpersoon). Zichtbaarheid:
 *   - recht 'inzien'              → sectie "Documenten" (basismap, zonder de Directie/Administratie-submap)
 *   - recht 'inzienDirectie'      → sectie "Directie" (vaste submap)
 *   - recht 'inzienAdministratie' → sectie "Administratie" (vaste submap)
 *
 * GET (zonder params) → { accounts: [ { accountId, klantnaam, klantnummer, rechten, secties:[...] } ] }
 * GET ?accountId=&sectie=&driveId=&itemId= → { items:[...] }  (doorklikken in een toegestane map)
 *
 * Fail-closed: geen recht = niets zichtbaar. Navigatie wordt geverifieerd tegen de basismap van de
 * cliënt (geen sprong naar een andere cliënt of een verboden sectie).
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
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const dynToken = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, dynToken);
    const appToken = await haalAppGraphToken();

    // ── Doorklikken in een (sub)map ──────────────────────────────────────
    const navAccountId = (req.query.accountId || "").trim();
    const navDriveId = (req.query.driveId || "").trim();
    const navItemId = (req.query.itemId || "").trim();
    if (navAccountId && navDriveId && navItemId) {
      const account = accounts.find((a) => a.accountId === navAccountId);
      if (!account) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang tot deze cliënt." } };
        return;
      }
      const rechten = await haalVoorContact(account.contactId);
      const spUrl = await haalSharePointUrl(resource, dynToken, account.accountId);
      if (!spUrl) { context.res = { headers: { "Content-Type": "application/json" }, body: { items: [] } }; return; }
      const ctx = await dm.haalDocumentContext(appToken, spUrl);
      const item = await dm.haalItem(appToken, navDriveId, navItemId);
      // Binnen de basismap van déze cliënt blijven, en het juiste sectierecht hebben.
      if (!item || !item.webUrl || !ctx.base.webUrl || !item.webUrl.startsWith(ctx.base.webUrl)) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Deze map hoort niet bij je documenten." } };
        return;
      }
      const sectie = dm.sectieVanItem(item.webUrl, ctx);
      if (!magSectie(sectie, rechten)) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen recht op deze map." } };
        return;
      }
      const kinderen = await dm.haalKinderen(appToken, navDriveId, navItemId);
      context.res = { headers: { "Content-Type": "application/json" }, body: { items: kinderen.map(dm.mapItem) } };
      return;
    }

    // ── Topniveau: per cliënt de toegestane secties ──────────────────────
    const uit = [];
    for (const account of accounts) {
      const rechten = await haalVoorContact(account.contactId);
      if (!rechten.inzien && !rechten.inzienDirectie && !rechten.inzienAdministratie) continue;

      const spUrl = await haalSharePointUrl(resource, dynToken, account.accountId);
      const basis = { accountId: account.accountId, klantnaam: account.klantnaam, klantnummer: account.klantnummer, rechten };
      if (!spUrl) { uit.push({ ...basis, secties: [], geenMap: true }); continue; }

      let ctx;
      try {
        ctx = await dm.haalDocumentContext(appToken, spUrl);
      } catch (e) {
        (context.log.warn || context.log)(`Documentcontext ${account.klantnaam} mislukt: ${e}`);
        uit.push({ ...basis, secties: [], fout: true });
        continue;
      }

      const secties = [];
      if (rechten.inzien) {
        // Onder "inzien" tonen we alléén de Correspondentie-submap — de inhoud daarvan direct
        // (zelfde patroon als Directie/Administratie hieronder), niet meer de hele basismap.
        if (ctx.correspondentie) {
          const kinderen = await dm.haalKinderen(appToken, ctx.driveId, ctx.correspondentie.itemId).catch(() => []);
          secties.push({ key: "documenten", label: "Correspondentie", driveId: ctx.driveId, itemId: ctx.correspondentie.itemId, items: kinderen.map(dm.mapItem) });
        } else {
          secties.push({ key: "documenten", label: "Correspondentie", driveId: ctx.driveId, itemId: ctx.base.itemId, items: [] });
        }
      }
      if (rechten.inzienDirectie && ctx.directie) {
        const kinderen = await dm.haalKinderen(appToken, ctx.driveId, ctx.directie.itemId).catch(() => []);
        secties.push({ key: "directie", label: "Directie", driveId: ctx.driveId, itemId: ctx.directie.itemId, items: kinderen.map(dm.mapItem) });
      }
      if ((rechten.inzienAdministratie || rechten.bewerkenAdministratie) && ctx.administratie) {
        const kinderen = await dm.haalKinderen(appToken, ctx.driveId, ctx.administratie.itemId).catch(() => []);
        secties.push({ key: "administratie", label: "Administratie", driveId: ctx.driveId, itemId: ctx.administratie.itemId, items: kinderen.map(dm.mapItem) });
      }
      uit.push({ ...basis, secties });
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { accounts: uit } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De app-only SharePoint-koppeling is nog niet (volledig) geconfigureerd." } };
      return;
    }
    if (err.code === "GRAPH_APP_TOKEN_MISLUKT") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De app-only SharePoint-toegang is nog niet actief (Sites.Selected-grant ontbreekt of onvolledig)." } };
      return;
    }
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij ophalen van je documenten.", detail: String(err.message || err) } };
  }
};
