/**
 * Gedeelde toegangscontrole + foutafhandeling voor de Bezittingen-endpoints. Zelfde opzet als
 * rapportagesToegang.js/facturatieToegang.js — standalone, niet afhankelijk van een andere module.
 */
const { haalDynamicsToken, herleidAccounts } = require("./identiteit");
const { isIngeschakeld } = require("./bezittingenInstellingen");

async function controleerBezittingenToegang(req) {
  const token = await haalDynamicsToken();
  const { email, accounts } = await herleidAccounts(req, token);
  const accountId = (req.query && req.query.accountId) || (req.body && req.body.accountId);

  if (!accountId) {
    const fout = new Error("Geef accountId (het klant-account waarvoor je werkt) mee.");
    fout.code = "GEEN_ACCOUNT_ID";
    throw fout;
  }
  const account = accounts.find((a) => a.accountId === accountId);
  if (!account) {
    const fout = new Error("Geen toegang tot dit klantaccount.");
    fout.code = "GEEN_TOEGANG";
    throw fout;
  }
  if (!(await isIngeschakeld(accountId))) {
    const fout = new Error("De Bezittingenmodule staat voor dit klantaccount nog niet aan.");
    fout.code = "BEZITTINGEN_MODULE_UITGESCHAKELD";
    throw fout;
  }
  return { email, accountId, account };
}

function afhandelFout(context, err) {
  if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.code === "GEEN_ACCOUNT_ID" || err.code === "GEEN_TOEGANG" || err.code === "BEZITTINGEN_MODULE_UITGESCHAKELD") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.message === "MISSING_CONFIG") {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "De Bezittingenmodule is nog niet geconfigureerd." },
    };
    return;
  }
  if (typeof err.message === "string" && err.message.startsWith("VALIDATIE")) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  context.log.error(err);
  context.res = {
    status: 500,
    headers: { "Content-Type": "application/json" },
    body: { error: "Onverwachte fout in de Bezittingenmodule.", detail: String(err.message || err) },
  };
}

module.exports = { controleerBezittingenToegang, afhandelFout };
