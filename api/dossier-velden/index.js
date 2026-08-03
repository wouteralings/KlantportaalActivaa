/**
 * /api/dossier-velden?soort=ib — de volledige veldencatalogus van een fiscaal-dossiersoort
 * (key/veld/type/label, zie api/_gedeeld/dossierVelden.js), voor Beheer → Dossiers (om een
 * indeling mee samen te stellen). Alleen voor medewerker/beheerder — bevat geen klantdata, puur
 * schemametadata, maar hoort niet in de publieke, niet-ingelogde route.
 *
 * Bevat, vóór de vrije catalogus, ook de "vaste" velden (Status van de aangifte/URL dossier/
 * Documentlink) — die horen niet bij de vrije catalogus (zie dossierVelden.js) maar zijn wel
 * gewoon zelf in te delen via dit scherm.
 *
 *   GET ?soort=ib → { soort: "ib", catalogus: [{ key, veld?, type, label, sectie? }, ...] }
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder').
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN } = require("../_gedeeld/dossiers");
const { vasteVeldenVoorSoort } = require("../_gedeeld/dossierVelden");

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

  const catalogus = [...vasteVeldenVoorSoort(soort), ...(soort.catalogus || [])];
  context.res = { headers: { "Content-Type": "application/json" }, body: { soort: soort.key, catalogus } };
};
