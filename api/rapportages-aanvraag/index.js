const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { zetAanvraag } = require("../_gedeeld/rapportagesInstellingen");

/**
 * POST /api/rapportages-aanvraag  body { accountId }
 *
 * Voor een klant die de Rapportagemodule voor één van zijn gekoppelde accounts nog niet heeft
 * (rapportagesIngeschakeld = false, zie mijn-gegevens) en op "Vraag aan" klikt. Zet géén toegang
 * aan — legt alleen vast wie wanneer heeft aangevraagd, zodat de beheerder dit terugziet in
 * Beheer → Rapportages en het (na het regelen van de betaling) zelf kan aanzetten.
 *
 * Zelfde opzet als api/facturatie-aanvraag en api/uren-aanvraag: bewust GEEN toegang-check (die
 * vereist juist dat de module al aan staat) — alleen de "hoort dit account bij de ingelogde
 * gebruiker"-check.
 */
module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const accountId = req.body && req.body.accountId;
  if (!accountId) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' mee." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { email, accounts } = await herleidAccounts(req, token);

    if (!accounts.some((a) => a.accountId === accountId)) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang tot dit klantaccount." } };
      return;
    }

    const opgeslagen = await zetAanvraag(accountId, email);
    context.res = { headers: { "Content-Type": "application/json" }, body: { accountId, ...opgeslagen } };
  } catch (err) {
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het indienen van de aanvraag.", detail: String(err.message || err) },
    };
  }
};
