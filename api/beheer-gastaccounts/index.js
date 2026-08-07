const { haalGastenPerEmail } = require("../_gedeeld/gastaccounts");
const { haalAlle: haalAlleDocumentrechten } = require("../_gedeeld/documentrechten");

/**
 * Totaaloverzicht gastaccounts — Beheer → Gastaccounts. Route is beveiligd via
 * staticwebapp.config.json (alleen rol 'beheerder').
 *
 * Geeft twee losse dingen terug die het beheerscherm client-side joint met de contactpersonen
 * uit /api/beheer-contactpersonen:
 *   - `gasten`: index van bestaande B2B-gasten op genormaliseerd e-mailadres (kan inloggen?);
 *   - `docRechten`: de portaal-documentrechten per contactId (wat mag hij zien?).
 * Bewust twee kolommen in de UI, want een gastaccount en documentrechten staan los van elkaar.
 *
 * GET              → { gasten: { "<email>": {id, displayName, accountEnabled, externalUserState, ...} },
 *                      docRechten: { "<contactId>": { inzien, aanleveren, ... } }, fout }
 * GET ?vernieuw=1  → leegt eerst de gastencache (na een wijziging in Entra).
 */
module.exports = async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
      return;
    }

    const ververs = !!(req.query && req.query.vernieuw);

    // De twee bronnen zijn onafhankelijk; faalt de Graph-kant (bijv. permissie nog niet toegekend),
    // dan willen we de documentrechten nog steeds kunnen tonen, met een duidelijke melding erbij.
    let gasten = {};
    let fout = "";
    try {
      const perEmail = await haalGastenPerEmail({ ververs });
      for (const [email, info] of perEmail) gasten[email] = info;
    } catch (e) {
      context.log.error(`Gasten ophalen mislukt: ${e}`);
      fout =
        "De gastaccounts konden niet worden opgehaald. Controleer of de app-registratie de permissies " +
        "User.Read.All (lezen) en User.Invite.All / User.ReadWrite.All (beheren) heeft met admin-consent.";
    }

    let docRechten = {};
    try {
      docRechten = await haalAlleDocumentrechten();
    } catch (e) {
      context.log.error(`Documentrechten ophalen mislukt: ${e}`);
    }

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { gasten, docRechten, fout },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De Entra-/Graph-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de gastaccounts.", detail: String(err) },
    };
  }
};
