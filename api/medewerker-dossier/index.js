/**
 * /api/medewerker-dossier — één fiscaal dossier (IB/VPB) ophalen of bewerken vanuit het
 * medewerkersportaal. Elke medewerker/beheerder mag bewerken; een dossier dat in Dynamics op
 * Inactief (statecode) staat is alleen-lezen.
 *
 *   - GET  ?soort=ib|vpb&id=<guid>
 *       → { dossier, statusOpties, catalogus, secties, verborgen, voorwaarden, alleenLezen, picklistOpties }
 *         (catalogus bevat naast de vrije catalogus ook de "vaste" velden __status/__urlDossier/
 *         __documentUrl, zie vasteVeldenVoorSoort() in dossierVelden.js; secties/subsecties zijn
 *         voor soorten zonder eigen vrije catalogus — momenteel alleen "ib" heeft die — beperkt
 *         tot één "Algemeen"-sectie met alleen die vaste velden)
 *   - POST { soort, id, status?, urlDossier?, documentUrl?, velden? }  → bijwerken (weigert bij
 *         inactief). "velden" is de vrije bag met catalogussleutels, bijv. { loon: true }.
 *         Velden die in Beheer → Dossiers op alleen-lezen staan worden hier genegeerd, ook al
 *         staan ze in de request-body (server-side afdwingen, niet alleen in het scherm).
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, werkDossierBij, haalDynamischePicklistOpties } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { standaardIndelingIB, standaardIndelingOverig, vasteVeldenVoorSoort } = require("../_gedeeld/dossierVelden");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

/** Haalt de (door Beheer → Dossiers ingestelde) indeling van een soort op — secties (met
 * eventuele subrubrieken), verborgen velden, tonen-alleen-als-voorwaarden en alleen-lezen velden
 * — met een standaardindeling als terugval zolang er nog niets eigens is opgeslagen. Soorten
 * zonder eigen vrije catalogus (vooralsnog VPB) krijgen een minimale standaardindeling met alleen
 * de vaste velden (Status/links), zodat die blijven verschijnen ook zonder Beheer-indeling. */
async function haalIndeling(soort) {
  const standaard = soort.key === "ib" ? standaardIndelingIB() : standaardIndelingOverig(soort);
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling[soort.key];
    const secties = eigen && Array.isArray(eigen.secties) && eigen.secties.length ? eigen.secties : standaard.secties;
    const verborgen = eigen && Array.isArray(eigen.verborgen) ? eigen.verborgen : standaard.verborgen;
    const voorwaarden = eigen && eigen.voorwaarden && typeof eigen.voorwaarden === "object" ? eigen.voorwaarden : standaard.voorwaarden;
    const alleenLezen = eigen && Array.isArray(eigen.alleenLezen) ? eigen.alleenLezen : standaard.alleenLezen;
    return { secties, verborgen, voorwaarden, alleenLezen };
  } catch {
    return standaard;
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
      const [indeling, picklistOpties] = await Promise.all([
        haalIndeling(soort),
        haalDynamischePicklistOpties(resource, token, soort),
      ]);
      const catalogus = [...vasteVeldenVoorSoort(soort), ...(soort.catalogus || [])];
      context.res = { headers: { "Content-Type": "application/json" }, body: { dossier, statusOpties: soort.statusOpties, catalogus, secties: indeling.secties, verborgen: indeling.verborgen, voorwaarden: indeling.voorwaarden, alleenLezen: indeling.alleenLezen, picklistOpties } };
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

      // Alleen-lezen velden (Beheer → Dossiers) ook server-side afdwingen — niet alleen de
      // invoervelden in het scherm uitschakelen, anders kan een rechtstreekse API-aanroep ze
      // alsnog wijzigen.
      const indeling = await haalIndeling(soort);
      const alleenLezenSet = new Set(indeling.alleenLezen || []);

      const velden = {};
      if (status !== undefined && !alleenLezenSet.has("__status")) velden.status = status;
      if (urlDossier !== undefined && !alleenLezenSet.has("__urlDossier")) velden.urlDossier = urlDossier;
      if (documentUrl !== undefined && !alleenLezenSet.has("__documentUrl")) velden.documentUrl = documentUrl;
      if (veldenBag && typeof veldenBag === "object") {
        const gefilterdeBag = Object.fromEntries(Object.entries(veldenBag).filter(([k]) => !alleenLezenSet.has(k)));
        if (Object.keys(gefilterdeBag).length > 0) velden.velden = gefilterdeBag;
      }
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
