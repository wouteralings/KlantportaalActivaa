/**
 * Gedeelde lees-/schrijflogica voor de fiscale dossiers (Inkomstenbelasting + Vennootschapsbelasting)
 * uit Dynamics — gebruikt door /api/dossiers (klant), /api/medewerker-dossiers (medewerker: lijst) en
 * /api/medewerker-dossier (medewerker: bewerken). Zo staan de logische veldnamen, de status-/label-
 * afhandeling en de status-keuzelijsten op ÉÉN plek.
 *
 * Zie het projectdoc "Dossiers (IB-VPB) — Dynamics-schema" voor de volledige veldenlijst en de
 * exacte option-set-waarden (die per tabel verschillen).
 */
const {
  IB_VELDEN, IB_DYNAMISCHE_PICKLISTS,
  VPB_VELDEN, VPB_DYNAMISCHE_PICKLISTS,
  DIVIDEND_VELDEN, DIVIDEND_DYNAMISCHE_PICKLISTS,
  NOTULEN_VELDEN, NOTULEN_DYNAMISCHE_PICKLISTS,
} = require("./dossierVelden");

const FV = "@OData.Community.Display.V1.FormattedValue";
// Standaard-statuskolom (IB/VPB). Dividend/Notulen hebben een EIGEN statuskolom — zie
// SOORTEN.<soort>.statusVeld hieronder; alle status-lees/schrijf gebruikt statusVeldVan(soort).
const STATUS_VELD = "cr283_statusaangifte";
const CLIENT_VALUE = "_cr283_client_value";

// De statuskolom van een soort — cr283_statusaangifte tenzij de soort een eigen statusVeld heeft.
function statusVeldVan(soort) {
  return (soort && soort.statusVeld) || STATUS_VELD;
}

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  // Levert naast de ruwe waarde ook het leesbare label (status, accountant/assistent-naam, klant).
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
});

// Status-keuzelijsten per soort (option set cr283_statusaangifte). De opties én de nummerwaarden
// verschillen per tabel — zie het projectdoc. Voor het TONEN van een bestaande waarde gebruiken we
// het label uit Dynamics (FormattedValue); deze lijst is voor het KIEZEN van een nieuwe status.
const STATUS_OPTIES_IB = [
  { waarde: 601280000, label: "In bewerking" },
  { waarde: 601280001, label: "Aangifte gereed voor review" },
  { waarde: 601280002, label: "Aangifte aanpassen na review" },
  { waarde: 601280005, label: "Aangifte verzenden naar client" },
  { waarde: 601280003, label: "Aangifte verzonden naar client" },
  { waarde: 601280008, label: "Aangifte te versturen naar Belastingdienst" },
  { waarde: 601280004, label: "Aangifte verzonden naar Belastingdienst" },
  { waarde: 601280006, label: "Voorlopige aangifte verzonden naar client" },
  { waarde: 601280009, label: "Voorlopige aangifte te versturen naar Belastingdienst" },
  { waarde: 601280007, label: "Voorlopige aangifte verzonden naar Belastingdienst" },
];
const STATUS_OPTIES_VPB = [
  { waarde: 601280000, label: "In bewerking" },
  { waarde: 601280001, label: "Aangifte gereed voor review" },
  { waarde: 601280002, label: "Aangifte aanpassen na review" },
  { waarde: 601280003, label: "Aangifte verzenden naar client" },
  { waarde: 601280004, label: "Aangifte verzonden naar client" },
  { waarde: 601280005, label: "Aangifte verzonden naar Belastingdienst" },
];
// Status-optieset cr283_statusdividenduitkering (eigen kolom, NIET cr283_statusaangifte).
const STATUS_OPTIES_DIVIDEND = [
  { waarde: 601280000, label: "In bewerking" },
  { waarde: 601280001, label: "Verzonden naar client" },
  { waarde: 601280002, label: "Dividend getekend door client" },
  { waarde: 601280003, label: "Dividend en dividend aangifte getekend door client" },
];
// Status-optieset cr283_statusnotulen (eigen kolom).
const STATUS_OPTIES_NOTULEN = [
  { waarde: 601280000, label: "In bewerking" },
  { waarde: 601280001, label: "Ter akkoord naar client" },
  { waarde: 601280002, label: "Getekend" },
];

const SOORTEN = [
  {
    key: "ib",
    label: "Inkomstenbelasting",
    entiteit: "cr283_inkomstenbelasting",
    idVeld: "cr283_inkomstenbelastingid",
    statusOpties: STATUS_OPTIES_IB,
    // Volledige, door Beheer → Dossiers zelf in te delen veldencatalogus (zie dossierVelden.js).
    // Alleen IB heeft dit vooralsnog (03-08-2026) — VPB volgt in een latere stap.
    catalogus: IB_VELDEN,
    dynamischePicklists: IB_DYNAMISCHE_PICKLISTS,
    optioneel: {
      jaar: "cr283_jaar",
      accountant: "_cr283_accountant_value",
      assistent: "_cr283_assistent_value",
      manager: "_cr283_manager_value",
      groepsnaam: "_cr283_groepsnaam_value",
      // Wie de fiscaal partner van de cliënt is (los van cr283_fiscaalpartnerschap, het ja/nee-veld
      // uit de vrije catalogus hierboven) — bestaand Dynamics-veld, door Wouter bevestigd 04-08-2026.
      fiscaalpartner: "_cr283_fiscaalpartner_value",
      reviewnotitie: "cr283_reviewnotitie",
      reactie: "cr283_reactiereviewnotitie",
      urlDossier: "cr283_urldossier",
      documentUrl: "cr283_urluitgaandedocumenten",
      // De volledige catalogus erbij: key → Dynamics-kolomnaam, zodat haalRuweRijen/haalEenDossier
      // ze meeselecteren (met dezelfde defensieve terugval bij een onbekende/foute kolomnaam).
      ...Object.fromEntries(IB_VELDEN.map((v) => [v.key, v.veld])),
    },
  },
  {
    key: "vpb",
    label: "Vennootschapsbelasting",
    entiteit: "cr283_vennootschapsbelasting",
    idVeld: "cr283_vennootschapsbelastingid",
    statusOpties: STATUS_OPTIES_VPB,
    // Volledige, door Beheer → Dossiers zelf in te delen veldencatalogus (zie dossierVelden.js) —
    // uit de Dynamics-metadata van cr283_vennootschapsbelasting (05-08-2026).
    catalogus: VPB_VELDEN,
    dynamischePicklists: VPB_DYNAMISCHE_PICKLISTS,
    optioneel: {
      // Periode/boekjaar (getoond als dossierperiode, niet als bewerkbaar detailveld — net als
      // "jaar" bij IB). VPB heeft zowel een jaar als een begin/einddatum voor het (afwijkende) boekjaar.
      jaar: "cr283_jaar",
      begindatum: "cr283_begindatum",
      einddatum: "cr283_einddatum",
      // Lookups: alleen-lezen naam getoond (zelfde als IB).
      accountant: "_cr283_accountant_value",
      assistent: "_cr283_assistent_value",
      manager: "_cr283_manager_value",
      groepsnaam: "_cr283_groepsnaam_value",
      // Review-notitie + reactie: de review-/reactieflow (klant mag reactie geven, zie klantportaal).
      reviewnotitie: "cr283_reviewnotitie",
      reactie: "cr283_reviewnotitiereactie",
      // Vaste dossierlinks.
      urlDossier: "cr283_urldossier",
      documentUrl: "cr283_urluitgaandedocumenten",
      // De volledige catalogus erbij: key → Dynamics-kolomnaam, zodat haalRuweRijen/haalEenDossier
      // ze meeselecteren (met dezelfde defensieve terugval bij een onbekende/foute kolomnaam).
      ...Object.fromEntries(VPB_VELDEN.map((v) => [v.key, v.veld])),
    },
  },
  {
    key: "dividend",
    label: "Dividenduitkeringen",
    entiteit: "cr283_dividenduitkering",
    idVeld: "cr283_dividenduitkeringid",
    // Eigen statuskolom (NIET cr283_statusaangifte) — zie statusVeldVan().
    statusVeld: "cr283_statusdividenduitkering",
    statusOpties: STATUS_OPTIES_DIVIDEND,
    catalogus: DIVIDEND_VELDEN,
    dynamischePicklists: DIVIDEND_DYNAMISCHE_PICKLISTS,
    optioneel: {
      // Periode = "Jaar" (net als IB geen bewerkbaar detailveld, wel de dossierperiode).
      jaar: "cr283_jaar",
      // Lookups: alleen-lezen naam getoond (zelfde als IB/VPB).
      accountant: "_cr283_accountant_value",
      assistent: "_cr283_assistent_value",
      manager: "_cr283_manager_value",
      groepsnaam: "_cr283_groepsnaam_value",
      // Vaste dossierlink (geen aparte "Documentlink" op deze tabel).
      urlDossier: "cr283_urldossier",
      // De volledige catalogus erbij: key → Dynamics-kolomnaam (met defensieve terugval).
      ...Object.fromEntries(DIVIDEND_VELDEN.map((v) => [v.key, v.veld])),
    },
  },
  {
    key: "notulen",
    label: "Notulen",
    entiteit: "cr283_notulen",
    idVeld: "cr283_notulenid",
    statusVeld: "cr283_statusnotulen",
    statusOpties: STATUS_OPTIES_NOTULEN,
    catalogus: NOTULEN_VELDEN,
    dynamischePicklists: NOTULEN_DYNAMISCHE_PICKLISTS,
    optioneel: {
      // Geen jaar; de periode is de vergaderdatum (cr283_datum) — getoond als "Datum".
      begindatum: "cr283_datum",
      accountant: "_cr283_accountant_value",
      assistent: "_cr283_assistent_value",
      manager: "_cr283_manager_value",
      groepsnaam: "_cr283_groepsnaam_value",
      urlDossier: "cr283_urlnotulen",
      ...Object.fromEntries(NOTULEN_VELDEN.map((v) => [v.key, v.veld])),
    },
  },
];

// De OData-verzamelingsnaam (meervoud) wordt door Dataverse zelf bepaald — opzoeken via metadata en cachen.
const entitySetCache = {};
async function haalEntitySetNaam(resource, logicalName, token) {
  if (entitySetCache[logicalName]) return entitySetCache[logicalName];
  const res = await fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Kon tabelnaam niet opzoeken voor ${logicalName} (${res.status}): ${await res.text()}`);
  const data = await res.json();
  entitySetCache[logicalName] = data.EntitySetName;
  return data.EntitySetName;
}

// "Kernnaam" van een select-veld om het in een Dynamics-foutmelding te herkennen.
function kernNaam(veld) {
  return veld.replace(/^_/, "").replace(/_value$/, "");
}

// "Dossiernaam" = de primaire kolom van de entiteit zelf (bij IB de samengestelde tekstkolom
// "Dossier", bv. "Akhiat, L. | | 2025" — zie het projectdoc). De exacte logische naam hangt af van
// de omgeving en wordt daarom niet hardgecodeerd, maar via metadata opgezocht en gecached, zelfde
// aanpak als haalEntitySetNaam hierboven (PrimaryNameAttribute staat gewoon op EntityDefinitions).
const primaireNaamCache = {};
async function haalPrimaireNaamVeld(resource, logicalName, token) {
  if (primaireNaamCache[logicalName]) return primaireNaamCache[logicalName];
  const res = await fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=PrimaryNameAttribute`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Kon primair naamveld niet opzoeken voor ${logicalName} (${res.status}): ${await res.text()}`);
  const data = await res.json();
  primaireNaamCache[logicalName] = data.PrimaryNameAttribute;
  return data.PrimaryNameAttribute;
}

// De NAVIGATIE-eigenschap van een lookup-kolom (nodig voor @odata.bind en /$ref) is in Dataverse
// niet per se gelijk aan de logische kolomnaam — het is de "ReferencingEntityNavigationPropertyName"
// van de relatie (vaak de schema-naam mét hoofdletters, bv. cr283_Client i.p.v. cr283_client).
// Gebruik je de verkeerde, dan geeft Dataverse 0x80048d19 ("undeclared property"). Daarom uit de
// metadata halen en cachen, zelfde aanpak als haalEntitySetNaam/haalPrimaireNaamVeld hierboven.
// Terugval op de logische naam als het opzoeken onverhoopt niet lukt.
const navNaamCache = {};
async function haalNavigatieNaam(resource, entiteitLogicalName, lookupAttribuut, token) {
  const cacheKey = `${entiteitLogicalName}.${lookupAttribuut}`;
  if (navNaamCache[cacheKey]) return navNaamCache[cacheKey];
  const url = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${entiteitLogicalName}')?$select=LogicalName&$expand=ManyToOneRelationships($select=ReferencingAttribute,ReferencingEntityNavigationPropertyName)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) return lookupAttribuut;
  const data = await res.json();
  const rel = (data.ManyToOneRelationships || []).find((r) => r.ReferencingAttribute === lookupAttribuut);
  const nav = (rel && rel.ReferencingEntityNavigationPropertyName) || lookupAttribuut;
  navNaamCache[cacheKey] = nav;
  return nav;
}

// Zelfde leeshelpers als api/beheer-klanten/index.js (leesVeld/leesLookup) — hier apart herhaald,
// dit bestand houdt bewust geen gedeelde afhankelijkheid met dat andere overzicht.
function leesVeld(rij, veld) {
  if (!veld) return "";
  if (rij[veld + FV] != null) return rij[veld + FV];
  return rij[veld] != null ? rij[veld] : "";
}
function leesLookup(rij, veld) {
  if (!veld) return "";
  return rij[`_${veld}_value${FV}`] || "";
}

/** Breidt soort.optioneel uit met door Beheer → Kolommen zelf toegevoegde extra Dynamics-velden
 *  voor de hoofdtabel (lijst) van deze dossiersoort — zelfde idee als klantoverzicht.extraKolommen
 *  (zie api/beheer-klanten), maar dan voor de dossierlijst. Elke extra kolom komt in de output
 *  terecht onder extra.<veld> (zie naarBuiten hieronder), los van de vaste basisvelden, zodat een
 *  kolom toevoegen/verwijderen nooit de vaste velden kan raken. Best-effort per veld gebeurt al via
 *  de bestaande terugval in haalRuweRijen/haalEenDossier (die de hele optioneel-lijst gebruikt). */
function metExtraKolommen(soort, extraKolommen) {
  const extra = Array.isArray(extraKolommen) ? extraKolommen.filter((c) => c && c.veld) : [];
  if (!extra.length) return soort;
  const optioneel = { ...soort.optioneel };
  for (const c of extra) {
    optioneel[`extra_${c.veld}`] = c.type === "lookup" ? `_${c.veld}_value` : c.veld;
  }
  return { ...soort, optioneel, extraKolommenDefs: extra };
}

/** Breidt soort.optioneel uit met "dossiernaam" → het opgezochte primaire naamveld van de entiteit
 *  (zie hierboven). Best-effort: lukt de opzoeking niet, dan blijft "soort" ongewijzigd (dossiernaam
 *  ontbreekt dan simpelweg in de output i.p.v. de rest van de lijst te blokkeren) — zelfde
 *  voorzichtige patroon als metAangepasteVelden hieronder. Gebruikt door de hoofdtabel (lijst) in
 *  het medewerkersportaal, zie api/medewerker-dossiers. */
async function metDossiernaam(resource, token, soort) {
  try {
    const veld = await haalPrimaireNaamVeld(resource, soort.entiteit, token);
    if (!veld) return soort;
    return { ...soort, optioneel: { ...soort.optioneel, dossiernaam: veld } };
  } catch {
    return soort;
  }
}

/**
 * Haalt de ruwe rijen van één dossiersoort op. accountIds optioneel:
 *  - meegegeven → alleen dossiers van die accounts (klantweergave)
 *  - weggelaten → alle dossiers (medewerker/beheerderweergave)
 */
async function haalRuweRijen(resource, token, soort, accountIds) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const verplicht = [soort.idVeld, CLIENT_VALUE, statusVeldVan(soort), "statecode"];
  let optioneleVelden = Object.values(soort.optioneel);

  const filter = Array.isArray(accountIds) && accountIds.length
    ? `&$filter=(${accountIds.map((id) => `${CLIENT_VALUE} eq ${id}`).join(" or ")})`
    : "";

  let poging = 0;
  const maxPogingen = optioneleVelden.length + 1;
  while (poging <= maxPogingen) {
    const select = [...verplicht, ...optioneleVelden].join(",");
    const url = `${resource}/api/data/v9.2/${entitySet}?$select=${select}${filter}`;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (res.ok) return (await res.json()).value || [];

    const tekst = await res.text();
    const foutVeld = optioneleVelden.find((v) => tekst.includes(kernNaam(v)) || tekst.includes(v));
    if (!foutVeld) throw new Error(`Ophalen ${soort.key} mislukt: ${tekst}`);
    optioneleVelden = optioneleVelden.filter((v) => v !== foutVeld);
    poging++;
  }
  return [];
}

// Zet één catalogusveld van een ruwe Dynamics-rij om naar { waarde, label? } — per type, zodat
// het medewerkersscherm elk veld met het juiste besturingselement kan tonen/bewerken.
function catalogusVeldNaarBuiten(rij, veldDef) {
  const ruw = rij[veldDef.veld];
  switch (veldDef.type) {
    case "boolean":
      return { waarde: ruw == null ? null : !!ruw };
    case "picklist":
      return { waarde: ruw ?? null, label: rij[veldDef.veld + FV] || "" };
    case "datetime":
      return { waarde: ruw || null };
    case "decimal":
      return { waarde: ruw == null ? null : ruw };
    default: // string, memo
      return { waarde: ruw || "" };
  }
}

function naarBuiten(rij, soort) {
  const o = soort.optioneel;
  const statusVeld = statusVeldVan(soort);
  const basis = {
    id: rij[soort.idVeld],
    soort: soort.key,
    soortLabel: soort.label,
    accountId: rij[CLIENT_VALUE] || null,
    klantnaam: rij[CLIENT_VALUE + FV] || "",
    // Primaire kolom van het dossier zelf (bv. de samengestelde "Dossier"-kolom bij IB) — alleen
    // aanwezig als de aanroeper metDossiernaam() heeft toegepast op "soort" (zie hierboven).
    dossiernaam: o.dossiernaam ? (rij[o.dossiernaam] || "") : "",
    jaar: o.jaar ? (rij[o.jaar] ?? null) : null,
    begindatum: o.begindatum ? (rij[o.begindatum] || null) : null,
    einddatum: o.einddatum ? (rij[o.einddatum] || null) : null,
    status: rij[statusVeld] ?? null,
    statusLabel: rij[statusVeld + FV] || "",
    // statecode 0 = Actief, 1 = Inactief. Ontbreekt het veld, dan behandelen we het als actief.
    statecode: rij.statecode ?? null,
    statecodeLabel: rij["statecode" + FV] || "",
    actief: rij.statecode == null ? true : rij.statecode === 0,
    accountant: o.accountant ? (rij[o.accountant + FV] || "") : "",
    assistent: o.assistent ? (rij[o.assistent + FV] || "") : "",
    manager: o.manager ? (rij[o.manager + FV] || "") : "",
    // Ruwe id (GUID) van de manager-lookup (systemuser) — o.a. gebruikt om de aangifte-taak aan de
    // manager toe te wijzen (zie api/medewerker-aangifte-versturen). Leeg als er geen manager is.
    managerId: o.manager ? (rij[o.manager] || null) : null,
    groepsnaam: o.groepsnaam ? (rij[o.groepsnaam + FV] || "") : "",
    fiscaalPartnerAccountId: o.fiscaalpartner ? (rij[o.fiscaalpartner] || null) : null,
    fiscaalPartnerNaam: o.fiscaalpartner ? (rij[o.fiscaalpartner + FV] || "") : "",
    reviewNotitie: o.reviewnotitie ? (rij[o.reviewnotitie] || "") : "",
    reactie: o.reactie ? (rij[o.reactie] || "") : "",
    urlDossier: o.urlDossier ? (rij[o.urlDossier] || "") : "",
    documentUrl: o.documentUrl ? (rij[o.documentUrl] || "") : "",
  };
  if (Array.isArray(soort.catalogus)) {
    basis.velden = {};
    for (const veldDef of soort.catalogus) {
      basis.velden[veldDef.key] = catalogusVeldNaarBuiten(rij, veldDef);
    }
  }
  // Extra (door Beheer zelf toegevoegde) kolommen voor de hoofdtabel — alleen aanwezig als de
  // aanroeper metExtraKolommen() heeft toegepast op "soort" (zie hierboven).
  if (Array.isArray(soort.extraKolommenDefs) && soort.extraKolommenDefs.length) {
    basis.extra = {};
    for (const c of soort.extraKolommenDefs) {
      basis.extra[c.veld] = c.type === "lookup" ? leesLookup(rij, c.veld) : leesVeld(rij, c.veld);
    }
  }
  return basis;
}

/** Breidt een SOORTEN-item uit met door Wouter via Beheer → Dossiers zelf aangemaakte extra
 * velden (dossierIndeling.<soort>.aangepasteVelden, zie dossierVelden.js) — nodig zodat zulke
 * velden niet alleen in het scherm getoond worden, maar ook echt uit Dynamics gelezen (select)
 * en teruggeschreven worden, precies zoals de vaste catalogusvelden (IB_VELDEN). Geen wijziging
 * op de statische SOORTEN zelf — geeft een nieuw object terug, of hetzelfde soort-object als er
 * niets aangepast is (geen onnodige allocaties/rerenders bij de veelvoorkomende lege-lijst-case). */
function metAangepasteVelden(soort, aangepasteVelden) {
  if (!Array.isArray(aangepasteVelden) || aangepasteVelden.length === 0) return soort;
  return {
    ...soort,
    catalogus: [...(soort.catalogus || []), ...aangepasteVelden],
    optioneel: { ...soort.optioneel, ...Object.fromEntries(aangepasteVelden.map((v) => [v.key, v.veld])) },
    dynamischePicklists: [
      ...(soort.dynamischePicklists || []),
      ...aangepasteVelden.filter((v) => v.type === "picklist").map((v) => v.veld),
    ],
  };
}

/** Mapt de ruwe rijen van één soort naar de portaal-vorm. Gooit door bij een harde fout. */
async function haalDossiersVoorSoort(resource, token, soort, accountIds) {
  const rijen = await haalRuweRijen(resource, token, soort, accountIds);
  return rijen.map((rij) => naarBuiten(rij, soort));
}

/** Eén dossier op id (voor het detail/bewerken). Zelfde defensieve terugval bij onbekende velden. */
async function haalEenDossier(resource, token, soort, id) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const verplicht = [soort.idVeld, CLIENT_VALUE, statusVeldVan(soort), "statecode"];
  let optioneleVelden = Object.values(soort.optioneel);
  let poging = 0;
  const maxPogingen = optioneleVelden.length + 1;
  while (poging <= maxPogingen) {
    const select = [...verplicht, ...optioneleVelden].join(",");
    const res = await fetch(`${resource}/api/data/v9.2/${entitySet}(${id})?$select=${select}`, { headers: HEADERS(token) });
    if (res.ok) return naarBuiten(await res.json(), soort);
    const tekst = await res.text();
    if (res.status === 404) return null;
    const foutVeld = optioneleVelden.find((v) => tekst.includes(kernNaam(v)) || tekst.includes(v));
    if (!foutVeld) throw new Error(`Ophalen dossier ${soort.key} mislukt: ${tekst}`);
    optioneleVelden = optioneleVelden.filter((v) => v !== foutVeld);
    poging++;
  }
  return null;
}

// Zet één ingevulde waarde uit het formulier om naar wat Dynamics voor dat kolomtype verwacht.
// Bij twijfel (lege string, ongeldig getal) wordt het veld op "leeg" (null) gezet i.p.v. de
// PATCH te laten mislukken.
function catalogusWaardeNaarDynamics(veldDef, waarde) {
  if (waarde === undefined) return undefined;
  switch (veldDef.type) {
    case "boolean":
      return waarde === null ? null : !!waarde;
    case "picklist":
    case "integer":
    case "decimal": {
      if (waarde === null || waarde === "") return null;
      const n = Number(waarde);
      return Number.isFinite(n) ? n : null;
    }
    case "datetime":
      return waarde ? String(waarde) : null;
    case "memo":
      return waarde ? String(waarde) : null;
    default: // string
      return waarde ? String(waarde).slice(0, 2000) : null;
  }
}

/**
 * Werkt een dossier bij in Dynamics (PATCH). Ondersteunt:
 *   - status      : nieuwe cr283_statusaangifte (optionset-nummer)
 *   - actief      : true/false — zet het dossier op statecode Actief/Inactief (zelfde standaard-
 *                   statuscode-paar als elders in de app bij deactiveren: 1/2, zie
 *                   medewerker-klant/medewerker-contactpersoon). Een inactief dossier is voor de
 *                   medewerker alleen-lezen (zie de statecode-controle in medewerker-dossier).
 *   - urlDossier  : cr283_urldossier
 *   - documentUrl : cr283_urluitgaandedocumenten
 *   - velden      : { [catalogusKey]: nieuweWaarde } — alle overige velden uit de (Beheer-
 *                   ingedeelde) catalogus, bijv. { loon: true, toelichtingalgemeen: "..." }.
 * Onbekende sleutels in "velden" (niet in soort.catalogus) worden genegeerd. Geeft niets terug;
 * gooit bij een fout.
 */
async function werkDossierBij(resource, token, soort, id, velden) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const body = {};
  if (velden.status !== undefined && velden.status !== null && velden.status !== "") {
    body[statusVeldVan(soort)] = Number(velden.status);
  }
  if (velden.actief !== undefined && velden.actief !== null) {
    body.statecode = velden.actief ? 0 : 1;
    body.statuscode = velden.actief ? 1 : 2;
  }
  if (velden.urlDossier !== undefined && soort.optioneel.urlDossier) {
    body[soort.optioneel.urlDossier] = velden.urlDossier ? String(velden.urlDossier).slice(0, 2000) : null;
  }
  if (velden.documentUrl !== undefined && soort.optioneel.documentUrl) {
    body[soort.optioneel.documentUrl] = velden.documentUrl ? String(velden.documentUrl).slice(0, 2000) : null;
  }
  // Reactie op de review-notitie (van de klant). Gebruikt door de goedkeuring van een klant-
  // wijzigingsverzoek van type "dossier" (zie api/beheer-wijzigingen) — schrijft naar het
  // reactie-veld van de soort (cr283_reactiereviewnotitie bij IB, cr283_reviewnotitiereactie bij VPB).
  if (velden.reactie !== undefined && soort.optioneel.reactie) {
    body[soort.optioneel.reactie] = velden.reactie ? String(velden.reactie) : null;
  }
  if (velden.velden && typeof velden.velden === "object" && Array.isArray(soort.catalogus)) {
    for (const [key, waarde] of Object.entries(velden.velden)) {
      const veldDef = soort.catalogus.find((v) => v.key === key);
      if (!veldDef) continue; // onbekende/verwijderde catalogussleutel — negeren i.p.v. fout geven
      const dynamicsWaarde = catalogusWaardeNaarDynamics(veldDef, waarde);
      if (dynamicsWaarde !== undefined) body[veldDef.veld] = dynamicsWaarde;
    }
  }
  // Fiscaal partner (single-valued lookup): KOPPELEN kan mee in de PATCH via @odata.bind; het
  // LOSKOPPELEN moet via een aparte DELETE op de navigatie-eigenschap ($ref) — dat kan niet in een
  // PATCH-body. De navigatienaam is niet per se de logische kolomnaam (zie haalNavigatieNaam).
  const partnerAttr = soort.optioneel.fiscaalpartner ? kernNaam(soort.optioneel.fiscaalpartner) : null;
  let partnerLoskoppelen = false;
  let partnerNav = null;
  if (partnerAttr && velden.fiscaalPartnerAccountId !== undefined) {
    partnerNav = await haalNavigatieNaam(resource, soort.entiteit, partnerAttr, token);
    if (velden.fiscaalPartnerAccountId) {
      body[`${partnerNav}@odata.bind`] = `/accounts(${velden.fiscaalPartnerAccountId})`;
    } else {
      partnerLoskoppelen = true;
    }
  }

  if (Object.keys(body).length > 0) {
    const res = await fetch(`${resource}/api/data/v9.2/${entitySet}(${id})`, {
      method: "PATCH",
      headers: { ...HEADERS(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Bijwerken ${soort.key} mislukt (${res.status}): ${await res.text()}`);
  }

  if (partnerLoskoppelen && partnerNav) {
    const res = await fetch(`${resource}/api/data/v9.2/${entitySet}(${id})/${partnerNav}/$ref`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Fiscaal partner loskoppelen mislukt (${res.status}): ${await res.text()}`);
  }
}

/** Verwijdert een dossier DEFINITIEF uit Dynamics (harde DELETE, geen terugweg — anders dan
 * contactpersonen, die worden gedeactiveerd). Gebruikt door /api/medewerker-dossier (actie
 * "verwijderen"), zelf al gate't op het bijbehorende verwijder-recht (zie wijzigrechten.js). 404
 * (al weg) telt niet als fout. */
async function verwijderDossier(resource, token, soort, id) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const res = await fetch(`${resource}/api/data/v9.2/${entitySet}(${id})`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Verwijderen ${soort.key} mislukt (${res.status}): ${await res.text()}`);
}

/** Bestaat er al een dossier van deze soort voor deze cliënt in dit jaar? Het schema is 1 rij per
 * cliënt per jaar (zie project-doc) — gebruikt door /api/medewerker-dossier-aanmaken om een
 * dubbele aangifte voor hetzelfde jaar te voorkomen. Alleen zinvol voor soorten met een jaar-veld
 * (IB); soorten zonder (VPB, met begindatum/einddatum) geven altijd false — best-effort: een
 * leesfout blokkeert het aanmaken niet (dan ontdekt een latere blik in Dynamics het eventueel). */
async function bestaatDossierAl(resource, token, soort, accountId, jaar) {
  if (!soort.optioneel.jaar) return false;
  try {
    const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
    const url = `${resource}/api/data/v9.2/${entitySet}?$select=${soort.idVeld}&$filter=${CLIENT_VALUE} eq ${accountId} and ${soort.optioneel.jaar} eq ${Number(jaar)}&$top=1`;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.value || []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Maakt een nieuw dossier aan in Dynamics (POST). Krijgt altijd status "In bewerking" (601280000,
 * gelijk voor IB/VPB — zie project-doc). Twee toepassingen, samen te gebruiken via `opties`:
 *   - accountId          : verplicht — de cliënt (account) van het nieuwe dossier.
 *   - jaar                : optioneel — alleen gezet als de soort een jaar-veld heeft (IB).
 *   - fiscaalPartnerAccountId : optioneel — wie de fiscaal partner is (cr283_fiscaalpartner).
 *   - kopieerVanDossier   : optioneel — een reeds opgehaald dossier (naarBuiten()-vorm, dus met
 *                           `.velden`) waarvan de catalogusvelden worden overgenomen, BEHALVE de
 *                           Review-sectie (workflow-/notitievelden — geen cliëntgegevens) en
 *                           behalve wat expliciet al in `velden` hieronder staat. Is er geen eigen
 *                           fiscaalPartnerAccountId meegegeven, dan wordt die van dit brondossier
 *                           overgenomen (partner hoort net zo goed bij "alle gegevens").
 *   - velden              : optioneel — expliciete { catalogusKey: waarde }-overschrijvingen,
 *                           bijv. { fiscaalpartnerschap: true } bij een geheel nieuwe aangifte.
 * Geeft het nieuwe Dynamics-id terug (uit de OData-EntityId-responseheader). Gooit bij een fout.
 */
async function maakDossier(resource, token, soort, opties) {
  const { accountId, jaar, fiscaalPartnerAccountId, kopieerVanDossier, velden } = opties || {};
  if (!accountId) throw new Error("Geef een cliënt (accountId) mee om een dossier aan te maken.");
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  // @odata.bind vereist de NAVIGATIE-eigenschapsnaam van de cliënt-lookup (niet per se de logische
  // kolomnaam cr283_client) — uit de metadata halen, anders 0x80048d19 "undeclared property".
  const clientNav = await haalNavigatieNaam(resource, soort.entiteit, "cr283_client", token);
  const body = { [`${clientNav}@odata.bind`]: `/accounts(${accountId})` };
  body[statusVeldVan(soort)] = 601280000; // "In bewerking" — een nieuw dossier start altijd hier.
  if (soort.optioneel.jaar && jaar !== undefined && jaar !== null && jaar !== "") {
    body[soort.optioneel.jaar] = Number(jaar);
  }
  const partnerId = fiscaalPartnerAccountId || (kopieerVanDossier ? kopieerVanDossier.fiscaalPartnerAccountId : null);
  if (soort.optioneel.fiscaalpartner && partnerId) {
    const partnerNav = await haalNavigatieNaam(resource, soort.entiteit, kernNaam(soort.optioneel.fiscaalpartner), token);
    body[`${partnerNav}@odata.bind`] = `/accounts(${partnerId})`;
  }
  if (Array.isArray(soort.catalogus)) {
    for (const veldDef of soort.catalogus) {
      if (veldDef.sectie === "review") continue; // review-/reactienotities, opmerkingen — bewust nooit meenemen
      let waarde;
      if (velden && Object.prototype.hasOwnProperty.call(velden, veldDef.key)) waarde = velden[veldDef.key];
      else if (kopieerVanDossier && kopieerVanDossier.velden && kopieerVanDossier.velden[veldDef.key]) waarde = kopieerVanDossier.velden[veldDef.key].waarde;
      if (waarde === undefined) continue;
      const dynamicsWaarde = catalogusWaardeNaarDynamics(veldDef, waarde);
      if (dynamicsWaarde !== undefined && dynamicsWaarde !== null) body[veldDef.veld] = dynamicsWaarde;
    }
  }
  const res = await fetch(`${resource}/api/data/v9.2/${entitySet}`, {
    method: "POST",
    headers: { ...HEADERS(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Aanmaken ${soort.key}-dossier mislukt (${res.status}): ${await res.text()}`);
  const locatie = res.headers.get("OData-EntityId") || res.headers.get("odata-entityid") || "";
  const match = locatie.match(/\(([^)]+)\)/);
  if (!match) throw new Error("Dossier aangemaakt, maar kon het nieuwe id niet bepalen uit het Dynamics-antwoord.");
  return match[1];
}

// Haalt live de opties van een lokale picklist op (voor catalogusvelden waarvan we de
// optiewaarden niet hardcoded kennen, zoals Gezinssituatie/Bijtelling — in tegenstelling tot
// cr283_statusaangifte, dat zijn eigen vaste STATUS_OPTIES_* lijst heeft). Gecached per
// (entiteit, veld), zelfde aanpak als haalEntitySetNaam hierboven.
const picklistOptiesCache = {};
async function haalPicklistOpties(resource, token, entiteitLogicalName, veldLogicalName) {
  const cacheKey = `${entiteitLogicalName}.${veldLogicalName}`;
  if (picklistOptiesCache[cacheKey]) return picklistOptiesCache[cacheKey];
  const url = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${entiteitLogicalName}')/Attributes(LogicalName='${veldLogicalName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Options)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) return []; // best-effort: geen opties kunnen ophalen mag de rest van het scherm niet blokkeren
  const data = await res.json();
  const ruweOpties = (data.OptionSet && data.OptionSet.Options) || (data.GlobalOptionSet && data.GlobalOptionSet.Options) || [];
  const opties = ruweOpties.map((o) => ({
    waarde: o.Value,
    label: (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value),
  }));
  picklistOptiesCache[cacheKey] = opties;
  return opties;
}

/** Haalt voor alle "dynamische" picklist-velden van een soort (zie dossierVelden.js) hun opties
 * op, als { [catalogusKey]: [{ waarde, label }] }. Best-effort — een mislukte lookup levert een
 * lege lijst op i.p.v. de rest van het dossierscherm te blokkeren. */
async function haalDynamischePicklistOpties(resource, token, soort) {
  if (!Array.isArray(soort.catalogus)) return {};
  const resultaat = {};
  const picklistVelden = soort.catalogus.filter((v) => v.type === "picklist");
  await Promise.all(
    picklistVelden.map(async (veldDef) => {
      resultaat[veldDef.key] = await haalPicklistOpties(resource, token, soort.entiteit, veldDef.veld);
    })
  );
  return resultaat;
}

module.exports = { SOORTEN, haalDossiersVoorSoort, haalEenDossier, werkDossierBij, verwijderDossier, maakDossier, bestaatDossierAl, haalDynamischePicklistOpties, metAangepasteVelden, metDossiernaam, metExtraKolommen, haalNavigatieNaam };
