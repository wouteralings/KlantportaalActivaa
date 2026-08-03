/**
 * Gedeelde lees-/schrijflogica voor de fiscale dossiers (Inkomstenbelasting + Vennootschapsbelasting)
 * uit Dynamics — gebruikt door /api/dossiers (klant), /api/medewerker-dossiers (medewerker: lijst) en
 * /api/medewerker-dossier (medewerker: bewerken). Zo staan de logische veldnamen, de status-/label-
 * afhandeling en de status-keuzelijsten op ÉÉN plek.
 *
 * Zie het projectdoc "Dossiers (IB-VPB) — Dynamics-schema" voor de volledige veldenlijst en de
 * exacte option-set-waarden (die per tabel verschillen).
 */
const { IB_VELDEN, IB_DYNAMISCHE_PICKLISTS } = require("./dossierVelden");

const FV = "@OData.Community.Display.V1.FormattedValue";
const STATUS_VELD = "cr283_statusaangifte";
const CLIENT_VALUE = "_cr283_client_value";

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
    optioneel: {
      begindatum: "cr283_begindatum",
      einddatum: "cr283_einddatum",
      accountant: "_cr283_accountant_value",
      assistent: "_cr283_assistent_value",
      reviewnotitie: "cr283_reviewnotitie",
      reactie: "cr283_reviewnotitiereactie",
      documentUrl: "cr283_urluitgaandedocumenten",
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

/**
 * Haalt de ruwe rijen van één dossiersoort op. accountIds optioneel:
 *  - meegegeven → alleen dossiers van die accounts (klantweergave)
 *  - weggelaten → alle dossiers (medewerker/beheerderweergave)
 */
async function haalRuweRijen(resource, token, soort, accountIds) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const verplicht = [soort.idVeld, CLIENT_VALUE, STATUS_VELD, "statecode"];
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
  const basis = {
    id: rij[soort.idVeld],
    soort: soort.key,
    soortLabel: soort.label,
    accountId: rij[CLIENT_VALUE] || null,
    klantnaam: rij[CLIENT_VALUE + FV] || "",
    jaar: o.jaar ? (rij[o.jaar] ?? null) : null,
    begindatum: o.begindatum ? (rij[o.begindatum] || null) : null,
    einddatum: o.einddatum ? (rij[o.einddatum] || null) : null,
    status: rij[STATUS_VELD] ?? null,
    statusLabel: rij[STATUS_VELD + FV] || "",
    // statecode 0 = Actief, 1 = Inactief. Ontbreekt het veld, dan behandelen we het als actief.
    statecode: rij.statecode ?? null,
    statecodeLabel: rij["statecode" + FV] || "",
    actief: rij.statecode == null ? true : rij.statecode === 0,
    accountant: o.accountant ? (rij[o.accountant + FV] || "") : "",
    assistent: o.assistent ? (rij[o.assistent + FV] || "") : "",
    manager: o.manager ? (rij[o.manager + FV] || "") : "",
    groepsnaam: o.groepsnaam ? (rij[o.groepsnaam + FV] || "") : "",
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
  const verplicht = [soort.idVeld, CLIENT_VALUE, STATUS_VELD, "statecode"];
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
    body[STATUS_VELD] = Number(velden.status);
  }
  if (velden.urlDossier !== undefined && soort.optioneel.urlDossier) {
    body[soort.optioneel.urlDossier] = velden.urlDossier ? String(velden.urlDossier).slice(0, 2000) : null;
  }
  if (velden.documentUrl !== undefined) {
    body[soort.optioneel.documentUrl] = velden.documentUrl ? String(velden.documentUrl).slice(0, 2000) : null;
  }
  if (velden.velden && typeof velden.velden === "object" && Array.isArray(soort.catalogus)) {
    for (const [key, waarde] of Object.entries(velden.velden)) {
      const veldDef = soort.catalogus.find((v) => v.key === key);
      if (!veldDef) continue; // onbekende/verwijderde catalogussleutel — negeren i.p.v. fout geven
      const dynamicsWaarde = catalogusWaardeNaarDynamics(veldDef, waarde);
      if (dynamicsWaarde !== undefined) body[veldDef.veld] = dynamicsWaarde;
    }
  }
  if (Object.keys(body).length === 0) return;
  const res = await fetch(`${resource}/api/data/v9.2/${entitySet}(${id})`, {
    method: "PATCH",
    headers: { ...HEADERS(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bijwerken ${soort.key} mislukt (${res.status}): ${await res.text()}`);
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

module.exports = { SOORTEN, haalDossiersVoorSoort, haalEenDossier, werkDossierBij, haalDynamischePicklistOpties, metAangepasteVelden };
