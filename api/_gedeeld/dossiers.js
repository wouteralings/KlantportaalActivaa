/**
 * Gedeelde leeslogica voor de fiscale dossiers (Inkomstenbelasting + Vennootschapsbelasting) uit
 * Dynamics — gebruikt door zowel /api/dossiers (klant: alleen de eigen accounts) als
 * /api/medewerker-dossiers (medewerker/beheerder: alle cliënten). Zo staan de logische veldnamen
 * en de status-/label-afhandeling op ÉÉN plek — corrigeer je een veldnaam, dan klopt hij meteen
 * voor beide schermen.
 *
 * Zie het projectdoc "Dossiers (IB-VPB) — Dynamics-schema" voor de volledige veldenlijst.
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

/**
 * Config per dossiersoort. Alleen id + client + status zijn hard nodig; de `optioneel`-velden
 * worden bij een onbekende logische naam automatisch uit de $select weggelaten (defensieve
 * terugval), zodat een (nog) niet exact bevestigde veldnaam nooit de hele lijst breekt.
 * De VPB-reactieveldnaam (`cr283_reviewnotitiereactie`, weergavenaam "Review notitie - reactie")
 * is nog te bevestigen.
 */
const SOORTEN = [
  {
    key: "ib",
    label: "Inkomstenbelasting",
    entiteit: "cr283_inkomstenbelasting",
    idVeld: "cr283_inkomstenbelastingid",
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

// De OData-verzamelingsnaam (meervoud) wordt door Dataverse zelf bepaald (Nederlandse namen
// pluraliseren onvoorspelbaar) — opzoeken via de metadata en cachen, zoals haalEntitySetNaam in
// api/_gedeeld/offertesOnboarding.js.
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

// "Kernnaam" van een select-veld om het in een Dynamics-foutmelding te herkennen (een lookup
// heet in de fout meestal cr283_accountant, niet _cr283_accountant_value).
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
  const verplicht = [soort.idVeld, CLIENT_VALUE, STATUS_VELD];
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

module.exports = { SOORTEN, haalDossiersVoorSoort };
