/**
 * Gedeelde toegangscontrole + foutafhandeling voor de facturatie-endpoints
 * (klanten-klanten, artikelen-klanten, facturen-klanten).
 *
 * Een portaalgebruiker kan aan meerdere Dataverse-Accounts gekoppeld zijn (zie
 * herleidAccounts() in identiteit.js); elke aanroep moet daarom expliciet aangeven vóór
 * welk klant-account (accountId) hij werkt, en we controleren dat die accountId ook
 * echt bij de ingelogde gebruiker hoort — anders zou een klant met toegang tot meerdere
 * accounts data van een ander account kunnen opvragen door simpelweg een andere
 * accountId mee te sturen.
 */
const { haalDynamicsToken, herleidAccounts } = require("./identiteit");
const { isIngeschakeld } = require("./facturatieInstellingen");

async function controleerToegang(req) {
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
  // Een beheerder moet de module eerst per klant aanzetten (beheerdersportaal, tab
  // "Facturatie") voordat dit klant-account de facturatie-endpoints mag gebruiken.
  if (!(await isIngeschakeld(accountId))) {
    const fout = new Error("De facturatiemodule staat voor dit klantaccount nog niet aan.");
    fout.code = "MODULE_UITGESCHAKELD";
    throw fout;
  }
  return { email, accountId };
}

/** Zet een gevangen fout om in een passende HTTP-response, consistent met de rest van api/. */
function afhandelFout(context, err) {
  if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.code === "GEEN_ACCOUNT_ID" || err.code === "GEEN_TOEGANG" || err.code === "MODULE_UITGESCHAKELD" || err.code === "UREN_MODULE_UITGESCHAKELD") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.message === "MISSING_CONFIG") {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "De facturatiemodule is nog niet geconfigureerd (FACTURATIE_SQL_CONNECTIONSTRING ontbreekt)." },
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
    body: { error: "Onverwachte fout in de facturatiemodule.", detail: String(err.message || err) },
  };
}

module.exports = { controleerToegang, afhandelFout };
