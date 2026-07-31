/**
 * Gedeelde toegangscontrole + foutafhandeling voor de Ritten-endpoints (ritten-klanten,
 * voertuigen-klanten, projecten-klanten, favoriete-ritten-klanten, ritten-afstand).
 *
 * Zelfde opzet als api/_gedeeld/facturatieToegang.js, maar BEWUST ZONDER de afhankelijkheid van
 * de Facturatiemodule — Rittenregistratie is een eigen, los te activeren module (zie het plan/
 * de skill "rittenregistratie"). Elke aanroep moet expliciet aangeven vóór welk klant-account
 * (accountId) hij werkt; we controleren dat die accountId ook echt bij de ingelogde gebruiker
 * hoort, en dat Ritten voor dat account is ingeschakeld.
 */
const { haalDynamicsToken, herleidAccounts } = require("./identiteit");
const { isIngeschakeld } = require("./rittenInstellingen");

async function controleerRittenToegang(req) {
  const token = await haalDynamicsToken();
  const { email, accounts } = await herleidAccounts(req, token);
  const accountId = (req.query && req.query.accountId) || (req.body && req.body.accountId);

  if (!accountId) {
    const fout = new Error("Geef accountId (het klant-account waarvoor je werkt) mee.");
    fout.code = "GEEN_ACCOUNT_ID";
    throw fout;
  }
  const magToegang = accounts.some((a) => a.accountId === accountId);
  if (!magToegang) {
    const fout = new Error("Geen toegang tot dit klantaccount.");
    fout.code = "GEEN_TOEGANG";
    throw fout;
  }
  if (!(await isIngeschakeld(accountId))) {
    const fout = new Error("De Rittenregistratie staat voor dit klantaccount nog niet aan.");
    fout.code = "RITTEN_MODULE_UITGESCHAKELD";
    throw fout;
  }
  return { email, accountId };
}

/** Zet een gevangen fout om in een passende HTTP-response, consistent met facturatieToegang.js. */
function afhandelFout(context, err) {
  if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.code === "GEEN_ACCOUNT_ID" || err.code === "GEEN_TOEGANG" || err.code === "RITTEN_MODULE_UITGESCHAKELD") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.message === "MISSING_CONFIG") {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "De Rittenregistratie is nog niet volledig geconfigureerd (FACTURATIE_SQL_CONNECTIONSTRING of STORAGE_CONNECTION_STRING ontbreekt)." },
    };
    return;
  }
  if (String(err.message || "").startsWith("VALIDATIE:")) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message.replace(/^VALIDATIE:\s*/, "") } };
    return;
  }
  context.log && context.log.error && context.log.error(err);
  context.res = {
    status: 500,
    headers: { "Content-Type": "application/json" },
    body: { error: "Er ging iets mis. Probeer het later opnieuw.", detail: String(err.message || err) },
  };
}

module.exports = { controleerRittenToegang, afhandelFout };
