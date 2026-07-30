/**
 * /api/dossiers — de fiscale dossiers (Inkomstenbelasting + Vennootschapsbelasting) van de
 * ingelogde portaalklant, rechtstreeks uit Dynamics (cr283_inkomstenbelasting /
 * cr283_vennootschapsbelasting). Alleen-lezen (GET).
 *
 * Koppeling klant → dossier: het veld cr283_client op het dossier wijst naar het Account
 * ("Cliënten" = de standaard account-tabel). We filteren dus op _cr283_client_value = één van de
 * accounts van de ingelogde gebruiker (zelfde herleidAccounts()-model als api/taken en
 * api/mijn-gegevens). Geen aparte toegangsadministratie nodig.
 *
 * Status is een lokale keuzelijst (cr283_statusaangifte) waarvan de opties én nummerwaarden per
 * tabel verschillen — we lezen daarom het LABEL uit Dynamics (FormattedValue), niet de nummers.
 *
 * Robuustheid: alleen id + client + status zijn hard nodig; alle overige velden zijn optioneel en
 * worden bij een onbekende veldnaam automatisch uit de $select weggelaten en de query opnieuw
 * geprobeerd (zelfde defensieve terugval als haalAccountOpId in identiteit.js). Zo breekt een
 * (nog) niet exact bevestigde logische veldnaam nooit de hele lijst.
 */
const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");

const FV = "@OData.Community.Display.V1.FormattedValue";
const STATUS_VELD = "cr283_statusaangifte";
const CLIENT_VALUE = "_cr283_client_value";

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  // Geeft naast de ruwe waarde ook het leesbare label mee (status, accountant/assistent-naam).
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
});

/**
 * Config per dossiersoort. `optioneel` bevat logische veldnamen die weggelaten mogen worden als
 * ze (nog) niet exact kloppen. De VPB-reactieveldnaam is nog niet 100% bevestigd (weergavenaam
 * "Review notitie - reactie") — dankzij de terugval breekt dat niets.
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
// pluraliseren onvoorspelbaar), dus opzoeken via de metadata en cachen — zelfde aanpak als
// haalEntitySetNaam in api/_gedeeld/offertesOnboarding.js.
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

async function haalDossiersVoorSoort(resource, token, soort, accountIds) {
  const entitySet = await haalEntitySetNaam(resource, soort.entiteit, token);
  const filter = accountIds.map((id) => `${CLIENT_VALUE} eq ${id}`).join(" or ");
  const verplicht = [soort.idVeld, CLIENT_VALUE, STATUS_VELD];
  let optioneleVelden = Object.values(soort.optioneel);

  let poging = 0;
  const maxPogingen = optioneleVelden.length + 1;
  while (poging <= maxPogingen) {
    const select = [...verplicht, ...optioneleVelden].join(",");
    const url = `${resource}/api/data/v9.2/${entitySet}?$select=${select}&$filter=(${filter})`;
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

function naarBuiten(rij, soort, klantnaamPerAccount) {
  const o = soort.optioneel;
  const accountId = rij[CLIENT_VALUE] || null;
  return {
    id: rij[soort.idVeld],
    soort: soort.key,
    soortLabel: soort.label,
    accountId,
    klantnaam: rij[CLIENT_VALUE + FV] || klantnaamPerAccount[accountId] || "",
    // Periode: IB heeft een jaar, VPB een boekjaar (begin/eind).
    jaar: o.jaar ? (rij[o.jaar] ?? null) : null,
    begindatum: o.begindatum ? (rij[o.begindatum] || null) : null,
    einddatum: o.einddatum ? (rij[o.einddatum] || null) : null,
    // Status: label uit Dynamics (nummers verschillen per tabel, dus niet hardcoderen).
    status: rij[STATUS_VELD] ?? null,
    statusLabel: rij[STATUS_VELD + FV] || "",
    accountant: o.accountant ? (rij[o.accountant + FV] || "") : "",
    assistent: o.assistent ? (rij[o.assistent + FV] || "") : "",
    reviewNotitie: o.reviewnotitie ? (rij[o.reviewnotitie] || "") : "",
    reactie: o.reactie ? (rij[o.reactie] || "") : "",
    documentUrl: o.documentUrl ? (rij[o.documentUrl] || "") : "",
  };
}

function sorteerSleutel(d) {
  // Nieuwste eerst: op jaar (IB) of begindatum (VPB).
  if (d.jaar != null) return Number(d.jaar) || 0;
  if (d.begindatum) return new Date(d.begindatum).getTime() || 0;
  return 0;
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);
    const accountIds = accounts.map((a) => a.accountId).filter(Boolean);
    const klantnaamPerAccount = Object.fromEntries(accounts.map((a) => [a.accountId, a.klantnaam || (a.account && a.account.name) || ""]));

    if (accountIds.length === 0) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { dossiers: [] } };
      return;
    }

    const perSoort = await Promise.all(
      SOORTEN.map(async (soort) => {
        try {
          const rijen = await haalDossiersVoorSoort(resource, token, soort, accountIds);
          return rijen.map((rij) => naarBuiten(rij, soort, klantnaamPerAccount));
        } catch (err) {
          // Eén soort die (nog) niet lukt (bv. onbekende tabel) mag de rest niet blokkeren.
          context.log.error(`Dossiers ${soort.key} ophalen mislukt:`, err);
          return [];
        }
      })
    );

    const dossiers = perSoort.flat().sort((a, b) => {
      if (a.soort !== b.soort) return a.soort < b.soort ? -1 : 1;
      return sorteerSleutel(b) - sorteerSleutel(a);
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: { dossiers } };
  } catch (err) {
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Er ging iets mis bij het ophalen van je dossiers.", detail: String(err.message || err) } };
  }
};
