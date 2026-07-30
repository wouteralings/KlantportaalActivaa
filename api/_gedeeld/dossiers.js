/**
 * Gedeelde lees-/schrijflogica voor de fiscale dossiers (Inkomstenbelasting + Vennootschapsbelasting)
 * uit Dynamics — gebruikt door /api/dossiers (klant), /api/medewerker-dossiers (medewerker: lijst) en
 * /api/medewerker-dossier (medewerker: bewerken). Zo staan de logische veldnamen, de status-/label-
 * afhandeling en de status-keuzelijsten op ÉÉN plek.
 *
 * Zie het projectdoc "Dossiers (IB-VPB) — Dynamics-schema" voor de volledige veldenlijst en de
 * exacte option-set-waarden (die per tabel verschillen).
 */
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
    optioneel: {
      jaar: "cr283_jaar",
      accountant: "_cr283_accountant_value",
      assistent: "_cr283_assistent_value",
      reviewnotitie: "cr283_reviewnotitie",
      reactie: "cr283_reactiereviewnotitie",
      documentUrl: "cr283_urluitgaandedocumenten",
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

function naarBuiten(rij, soort) {
  const o = soort.optioneel;
  return {
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
    reviewNotitie: o.reviewnotitie ? (rij[o.reviewnotitie] || "") : "",
    reactie: o.reactie ? (rij[o.reactie] || "") : "",
    documentUrl: o.documentUrl ? (rij[o.documentUrl] || "") : "",
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

/**
 * Werkt een dossier bij in Dynamics (PATCH). Ondersteunt de door medewerkers bewerkbare velden:
 *   - status      : nieuwe cr283_statusaangifte (optionset-nummer)
 *   - documentUrl : cr283_urluitgaandedocumenten
 * Geeft niets terug; gooit bij een fout.
 */
async function werkDossierBij(resource, token, soort, id, velden) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const body = {};
  if (velden.status !== undefined && velden.status !== null && velden.status !== "") {
    body[STATUS_VELD] = Number(velden.status);
  }
  if (velden.documentUrl !== undefined) {
    body[soort.optioneel.documentUrl] = velden.documentUrl ? String(velden.documentUrl).slice(0, 2000) : null;
  }
  if (Object.keys(body).length === 0) return;
  const res = await fetch(`${resource}/api/data/v9.2/${entitySet}(${id})`, {
    method: "PATCH",
    headers: { ...HEADERS(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bijwerken ${soort.key} mislukt (${res.status}): ${await res.text()}`);
}

module.exports = { SOORTEN, haalDossiersVoorSoort, haalEenDossier, werkDossierBij };
