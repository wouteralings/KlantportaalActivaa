/**
 * /api/dossier-velden?soort=ib — de volledige veldencatalogus van een fiscaal-dossiersoort
 * (key/veld/type/label, zie api/_gedeeld/dossierVelden.js), voor Beheer → Dossiers (om een
 * indeling mee samen te stellen). Alleen voor medewerker/beheerder — bevat geen klantdata, puur
 * schemametadata, maar hoort niet in de publieke, niet-ingelogde route.
 *
 * Bevat, vóór de vrije catalogus, ook de "vaste" velden (Status van de aangifte/URL dossier/
 * Documentlink) — die horen niet bij de vrije catalogus (zie dossierVelden.js) maar zijn wel
 * gewoon zelf in te delen via dit scherm — en, ná de vrije catalogus, eventuele door Wouter zelf
 * aangemaakte extra velden (dossierIndeling.<soort>.aangepasteVelden, zie
 * api/dossier-kolom-aanmaken). Eigen labels (dossierIndeling.<soort>.labels) zijn al toegepast,
 * zodat Beheer altijd het actuele label ziet, niet de standaardtekst uit de code.
 *
 *   GET ?soort=ib → { soort: "ib", catalogus: [{ key, veld?, type, label, sectie? }, ...] }
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder').
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN } = require("../_gedeeld/dossiers");
const { vasteVeldenVoorSoort, metLabels, standaardIndelingIB, standaardIndelingVPB, standaardIndelingDividend, standaardIndelingNotulen, standaardIndelingOverig } = require("../_gedeeld/dossierVelden");
const { haalInstellingen } = require("../_gedeeld/instellingen");

// De standaardindeling van een soort — zodat Beheer → Dossiers een nog niet geconfigureerde soort
// (bijv. Dividend/Notulen voordat er iets is opgeslagen) tóch met de nette standaard-secties kan
// tonen i.p.v. leeg.
function standaardIndelingVoor(soort) {
  if (soort.key === "ib") return standaardIndelingIB();
  if (soort.key === "vpb") return standaardIndelingVPB();
  if (soort.key === "dividend") return standaardIndelingDividend();
  if (soort.key === "notulen") return standaardIndelingNotulen();
  return standaardIndelingOverig(soort);
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  const soortKey = (req.query && req.query.soort) || "ib";
  const soort = SOORTEN.find((s) => s.key === soortKey);
  if (!soort) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldige 'soort' mee (ib)." } };
    return;
  }

  let aangepasteVelden = [];
  let labels = {};
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling[soortKey];
    if (eigen && Array.isArray(eigen.aangepasteVelden)) aangepasteVelden = eigen.aangepasteVelden;
    if (eigen && eigen.labels && typeof eigen.labels === "object") labels = eigen.labels;
  } catch {
    // Best-effort: geen instellingen kunnen lezen mag de standaardcatalogus niet blokkeren.
  }

  const catalogusRuw = [...vasteVeldenVoorSoort(soort), ...(soort.catalogus || []), ...aangepasteVelden];
  const catalogus = metLabels(catalogusRuw, labels);
  context.res = { headers: { "Content-Type": "application/json" }, body: { soort: soort.key, catalogus, standaardIndeling: standaardIndelingVoor(soort) } };
};
