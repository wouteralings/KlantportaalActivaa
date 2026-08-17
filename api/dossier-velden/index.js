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
 * Voor notulen/dividend komen ook de voorbeeld-sjablonen mee (dossierSjablonen[soort]) — nodig voor
 * het scherm "Notulen opstellen" in het medewerkersportaal, dat een stuk opmaakt zónder dat er al
 * een dossier is (en dus niet via /api/medewerker-dossier aan de sjablonen kan komen).
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder').
 */
const { haalRollenUitPrincipal, haalDynamicsToken } = require("../_gedeeld/identiteit");
const { SOORTEN, haalDynamischePicklistOpties } = require("../_gedeeld/dossiers");
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

/** De voorbeeld-sjablonen van een soort uit de instellingen (dossierSjablonen[soort]) — dezelfde
 *  vorm en dezelfde terugwaartse compatibiliteit als haalSjabloonVoor() in api/medewerker-dossier.
 *  Best-effort: onleesbare of ontbrekende instellingen leveren een lege lijst, nooit een fout. */
async function haalSjablonenVoor(soortKey) {
  if (soortKey !== "notulen" && soortKey !== "dividend") return { sjablonen: [], kop: "", staart: "", standaard: null, velddefinities: [] };
  try {
    const { dossierSjablonen } = await haalInstellingen();
    const eigen = dossierSjablonen && dossierSjablonen[soortKey];
    // Kop en staart gelden bij notulen voor álle stukken (Beheer → Dossiers → Voorbeelddocumenten);
    // leeg = het scherm gebruikt zijn eigen standaardtekst.
    const kop = eigen && typeof eigen.kop === "string" ? eigen.kop : "";
    const staart = eigen && typeof eigen.staart === "string" ? eigen.staart : "";
    // Wie standaard als voorzitter/notulist wordt voorgesteld in "Notulen opstellen".
    const st = (eigen && eigen.standaard && typeof eigen.standaard === "object") ? eigen.standaard : {};
    // Vrije invulvelden (zelfde opzet als de briefvelden): [{ sleutel, label, type, opties }].
    const velddefinities = eigen && Array.isArray(eigen.velddefinities)
      ? eigen.velddefinities
          .filter((v) => v && (v.sleutel || v.label))
          .map((v) => ({
            sleutel: String(v.sleutel || ""),
            label: String(v.label || v.sleutel || ""),
            type: ["keuze", "paragraaf", "bedrag", "datum"].includes(v.type) ? v.type : "tekst",
            opties: Array.isArray(v.opties) ? v.opties.map((o) => ({ sleutel: String(o.sleutel || ""), label: String(o.label || ""), tekst: String(o.tekst || "") })) : [],
          }))
      : [];
    const standaard = {
      voorzitterBron: st.voorzitterBron === "vast" ? "vast" : "contact",
      voorzitterVast: String(st.voorzitterVast || ""),
      notulistBron: st.notulistBron === "vast" ? "vast" : "medewerker",
      notulistVast: String(st.notulistVast || ""),
    };
    if (eigen && Array.isArray(eigen.sjablonen)) {
      const sjablonen = eigen.sjablonen
        .filter((s) => s && (s.naam != null || s.tekst != null || s.besluit != null))
        .map((s, i) => ({
          id: s.id || `s${i}`,
          naam: String(s.naam || "Naamloos sjabloon"),
          tekst: String(s.tekst || ""),
          // Het besluitblok (punt I) — per model, en bij het opstellen per stuk aan te passen.
          besluit: s.besluit != null ? String(s.besluit) : "",
          // De Dynamics-kolommen die bij dit model horen (catalogussleutels); leeg = alle velden.
          velden: Array.isArray(s.velden) ? s.velden.map(String) : [],
          // De vrije invulvelden die bij dit model horen (sleutels uit velddefinities).
          invulvelden: Array.isArray(s.invulvelden) ? s.invulvelden.map(String) : [],
        }));
      return { sjablonen, kop, staart, standaard, velddefinities };
    }
    // Oude vorm { standaard, perSoort } → dezelfde sjablonenlijst.
    const sjablonen = [];
    if (eigen && typeof eigen.standaard === "string" && eigen.standaard.trim()) sjablonen.push({ id: "standaard", naam: "Standaard", tekst: eigen.standaard, besluit: "", velden: [] });
    if (eigen && eigen.perSoort && typeof eigen.perSoort === "object") {
      for (const [k, v] of Object.entries(eigen.perSoort)) if (v && String(v).trim()) sjablonen.push({ id: `soort_${k}`, naam: `Soort ${k}`, tekst: String(v), besluit: "", velden: [] });
    }
    return { sjablonen, kop, staart, standaard, velddefinities };
  } catch {
    return { sjablonen: [], kop: "", staart: "", standaard: null, velddefinities: [] };
  }
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
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: `Geef een geldige 'soort' mee (${SOORTEN.map((s) => s.key).join("/")}).` } };
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

  // Keuzelijst-opties per veld (key → [{ waarde, label }]) — nodig zodat Beheer → Dossiers bij een
  // voorwaarde op een keuzeveld ("alleen tonen als … = <optie>") de juiste optie kan laten kiezen.
  // Best-effort: zonder (werkende) Dynamics-koppeling blijft dit leeg en werkt de rest van het scherm
  // gewoon; alleen de waarde-keuze bij een keuzeveld-voorwaarde is dan nog niet in te vullen.
  let picklistOpties = {};
  try {
    const resource = process.env.DYNAMICS_RESOURCE_URL;
    if (resource) {
      const token = await haalDynamicsToken();
      picklistOpties = await haalDynamischePicklistOpties(resource, token, soort);
    }
  } catch {
    picklistOpties = {};
  }

  // statusOpties erbij: Beheer → Dossiers gebruikt die om per review-uitkomst de dossierstatus te
  // kiezen (zie het Review-blok in DossierIndelingBeheer.jsx). Zelfde lijst als het dossierdetail.
  const { sjablonen, kop, staart, standaard: sjabloonStandaard, velddefinities } = await haalSjablonenVoor(soort.key);

  // De ACTUELE indeling (de secties/volgorde/verborgen/voorwaarden zoals in Beheer → Dossiers
  // ingesteld, met de standaardindeling als terugval) — zodat een scherm dat velden toont zonder een
  // bestaand dossier (zie "Notulen opstellen") dezelfde rubrieken en dezelfde "alleen tonen als"-
  // regels aanhoudt als het dossierdetail. Dezelfde samenstelling als haalIndeling() in
  // api/medewerker-dossier; die blijft daar leidend voor het dossier zelf.
  const standaard = standaardIndelingVoor(soort);
  let indeling = standaard;
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling[soortKey];
    indeling = {
      secties: eigen && Array.isArray(eigen.secties) && eigen.secties.length ? eigen.secties : standaard.secties,
      verborgen: eigen && Array.isArray(eigen.verborgen) ? eigen.verborgen : standaard.verborgen,
      voorwaarden: eigen && eigen.voorwaarden && typeof eigen.voorwaarden === "object" ? eigen.voorwaarden : standaard.voorwaarden,
      alleenLezen: eigen && Array.isArray(eigen.alleenLezen) ? eigen.alleenLezen : standaard.alleenLezen,
    };
  } catch {
    // Best-effort: zonder leesbare instellingen de standaardindeling.
  }

  context.res = { headers: { "Content-Type": "application/json" }, body: { soort: soort.key, catalogus, picklistOpties, standaardIndeling: standaard, indeling, statusOpties: soort.statusOpties || [], sjablonen, sjabloonOpbouw: { kop, staart, standaard: sjabloonStandaard, velddefinities } } };
};
