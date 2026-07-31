/**
 * Toegangscontrole voor /api/projecten-klanten — gedeeld tussen Ritten en Uren, dus toegestaan
 * zodra ÉÉN van beide voor dit account aan staat: de Rittenregistratie (rittenInstellingen.js)
 * OF de Uren-projectenkoppeling (projectenInstellingen.js). Zie het plan/de skill
 * "rittenregistratie" — een account kan het één zonder het ander hebben.
 */
const { haalDynamicsToken, herleidAccounts } = require("./identiteit");
const { isIngeschakeld: isRittenIngeschakeld } = require("./rittenInstellingen");
const { isGekoppeld: isProjectenGekoppeld } = require("./projectenInstellingen");

async function controleerProjectenToegang(req) {
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
  const [rittenAan, projectenAan] = await Promise.all([
    isRittenIngeschakeld(accountId),
    isProjectenGekoppeld(accountId),
  ]);
  if (!rittenAan && !projectenAan) {
    const fout = new Error("Projecten zijn voor dit klantaccount niet beschikbaar (Ritten en de Uren-projectkoppeling staan beide uit).");
    fout.code = "PROJECTEN_UITGESCHAKELD";
    throw fout;
  }
  return { email, accountId };
}

function afhandelFout(context, err) {
  if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.code === "GEEN_ACCOUNT_ID" || err.code === "GEEN_TOEGANG" || err.code === "PROJECTEN_UITGESCHAKELD") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.message === "MISSING_CONFIG") {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De opslag is nog niet volledig geconfigureerd." } };
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

module.exports = { controleerProjectenToegang, afhandelFout };
