/**
 * /api/medewerker-dossier — één fiscaal dossier (IB/VPB) ophalen of bewerken vanuit het
 * medewerkersportaal. Elke medewerker/beheerder mag bewerken; een dossier dat in Dynamics op
 * Inactief (statecode) staat is alleen-lezen.
 *
 *   - GET  ?soort=ib|vpb&id=<guid>
 *       → { dossier, statusOpties, catalogus, secties, picklistOpties }
 *         (catalogus/secties/picklistOpties zijn leeg/afwezig voor soorten zonder eigen
 *         veldencatalogus, momenteel alleen "ib" heeft die — zie dossierVelden.js)
 *   - POST { soort, id, status?, urlDossier?, documentUrl?, velden? }  → bijwerken (weigert bij
 *         inactief). "velden" is de vrije bag met catalogussleutels, bijv. { loon: true }.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, werkDossierBij, haalDynamischePicklistOpties } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { standaardIndelingIB } = require("../_gedeeld/dossierVelden");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

/** Haalt de (door Beheer → Dossiers ingestelde) sectie-indeling van een soort op, met de
 * standaardindeling als terugval zolang er nog niets eigens is opgeslagen. */
async function haalSecties(soortKey) {
  if (soortKey !== "ib") return []; // vooralsnog alleen IB heeft een eigen indeling
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling.ib && Array.isArray(dossierIndeling.ib.secties) ? dossierIndeling.ib.secties : null;
    return (eigen && eigen.length ? { secties: eigen } : standaardIndelingIB()).secties;
  } catch {
    return standaardIndelingIB().secties;
  }
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  const email = haalEmailUitPrincipal(req);
  const methode = (req.method || "GET").toUpperCase();

  const soortVan = (k) => SOORTEN.find((s) => s.key === k);

  try {
    const token = await haalDynamicsToken();

    if (methode === "GET") {
      const soort = soortVan((req.query && req.query.soort) || "");
      const id = (req.query && req.query.id) || "";
      if (!soort || !id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort' (ib/vpb) en 'id' mee." } }; return; }
      const dossier = await haalEenDossier(resource, token, soort, id);
      if (!dossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
      const [secties, picklistOpties] = await Promise.all([
        haalSecties(soort.key),
        haalDynamischePicklistOpties(resource, token, soort),
      ]);
      context.res = { headers: { "Content-Type": "application/json" }, body: { dossier, statusOpties: soort.statusOpties, catalogus: soort.catalogus || [], secties, picklistOpties } };
      return;
    }

    if (methode === "POST" || methode === "PATCH") {
      const { soort: soortKey, id, status, urlDossier, documentUrl, velden: veldenBag } = req.body || {};
      const soort = soortVan(soortKey);
      if (!soort || !id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort' (ib/vpb) en 'id' mee." } }; return; }

      // Actueel dossier ophalen om de status (inactief?) te controleren vóór het schrijven.
      const huidig = await haalEenDossier(resource, token, soort, id);
      if (!huidig) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
      if (!huidig.actief) { context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: "Dit dossier staat op inactief en kan niet worden bewerkt." } }; return; }

      const velden = {};
      if (status !== undefined) velden.status = status;
      if (urlDossier !== undefined) velden.urlDossier = urlDossier;
      if (documentUrl !== undefined) velden.documentUrl = documentUrl;
      if (veldenBag && typeof veldenBag === "object") velden.velden = veldenBag;
      if (Object.keys(velden).length === 0) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Niets om bij te werken." } }; return; }

      await werkDossierBij(resource, token, soort, id, velden);
      const bijgewerkt = await haalEenDossier(resource, token, soort, id);

      // Best-effort log bij de cliënt.
      if (bijgewerkt) {
        const aantalCatalogusVelden = veldenBag && typeof veldenBag === "object" ? Object.keys(veldenBag).length : 0;
        await logGebeurtenis({
          door: email || "onbekend", actie: "dossier", accountId: bijgewerkt.accountId, accountIds: [bijgewerkt.accountId],
          klantnaam: bijgewerkt.klantnaam,
          tekst: `Dossier ${soort.label}${bijgewerkt.jaar ? ` ${bijgewerkt.jaar}` : ""} bijgewerkt${status !== undefined ? ` — status: ${bijgewerkt.statusLabel || status}` : ""}${documentUrl !== undefined ? " — documentlink gewijzigd" : ""}${aantalCatalogusVelden ? ` — ${aantalCatalogusVelden} veld(en) gewijzigd` : ""}.`,
        });
      }

      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, dossier: bijgewerkt } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het dossier niet verwerken.", detail: String(err.message || err) } };
  }
};
