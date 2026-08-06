/**
 * /api/dossiers — de fiscale dossiers (Inkomstenbelasting + Vennootschapsbelasting) van de
 * INGELOGDE portaalklant, rechtstreeks uit Dynamics. Alleen-lezen (GET).
 *
 * Filtert op de accounts van de ingelogde gebruiker (herleidAccounts, zelfde model als api/taken
 * en api/mijn-gegevens). De daadwerkelijke query + veldnamen + status-labelafhandeling staan in
 * api/_gedeeld/dossiers.js, zodat ze gedeeld zijn met het medewerkerscherm (/api/medewerker-dossiers).
 */
const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { SOORTEN, haalDossiersVoorSoort } = require("../_gedeeld/dossiers");

function sorteerSleutel(d) {
  if (d.jaar != null && d.jaar !== "") return Number(d.jaar) || 0;
  if (d.begindatum) return new Date(d.begindatum).getTime() || 0;
  return 0;
}

// De klant ziet het dossier ALLEEN-LEZEN en beperkt: periode, behandelaars, status, de opmerking
// van de accountant (review-notitie), zijn eigen reactie en de documentlink. Bewust NIET alle
// interne dossiervelden (`velden`), permanente-dossier-URL's e.d. — die horen bij het
// medewerkersscherm. Daarom een expliciete projectie i.p.v. het hele naarBuiten()-object.
function naarKlant(d) {
  return {
    id: d.id,
    soort: d.soort,
    soortLabel: d.soortLabel,
    accountId: d.accountId,
    klantnaam: d.klantnaam,
    jaar: d.jaar,
    begindatum: d.begindatum,
    einddatum: d.einddatum,
    statusLabel: d.statusLabel,
    accountant: d.accountant,
    assistent: d.assistent,
    reviewNotitie: d.reviewNotitie,
    reactie: d.reactie,
    documentUrl: d.documentUrl,
  };
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

    if (accountIds.length === 0) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { dossiers: [] } };
      return;
    }

    const perSoort = await Promise.all(
      SOORTEN.map((soort) =>
        haalDossiersVoorSoort(resource, token, soort, accountIds).catch((err) => {
          // Eén soort die (nog) niet lukt mag de rest niet blokkeren.
          context.log.error(`Dossiers ${soort.key} ophalen mislukt:`, err);
          return [];
        })
      )
    );

    const dossiers = perSoort.flat().sort((a, b) => {
      if (a.soort !== b.soort) return a.soort < b.soort ? -1 : 1;
      return sorteerSleutel(b) - sorteerSleutel(a);
    }).map(naarKlant);

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
