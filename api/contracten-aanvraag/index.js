const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { zetAanvraag } = require("../_gedeeld/contractenInstellingen");

/**
 * POST /api/contracten-aanvraag  body { accountId }
 *
 * Zelfde opzet als api/bezittingen-aanvraag — legt alleen de aanvraag vast, zet niets aan.
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
