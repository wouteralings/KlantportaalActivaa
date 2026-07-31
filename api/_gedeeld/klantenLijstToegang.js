/**
 * Toegangscontrole voor /api/klanten-klanten (dbo.klanten_klanten — de gedeelde eindklanten-lijst
 * van een portaalklant). Tot migratie 009 was deze lijst ALLEEN bereikbaar als de Facturatiemodule
 * aan stond (via facturatieToegang.controleerToegang) — dat klopt niet meer nu Ritten een eigen,
 * onafhankelijke module is die ook aan deze eindklanten koppelt (en de Uren-projectkoppeling via
 * projectenGekoppeld evenzeer). Toegestaan zodra MINSTENS ÉÉN van de volgende voor dit account aan
 * staat: Facturatie, Ritten, of de Uren-projectkoppeling.
 *
 * BELANGRIJK (zie PATCHES/klanten-klanten-index.js.patch-instructies.md): api/klanten-klanten/
 * index.js moet zijn import van facturatieToegang vervangen door deze module — anders blijft een
 * klant met alleen Ritten (geen Facturatie) buitengesloten van zijn eigen eindklantenlijst.
 */
const { haalDynamicsToken, herleidAccounts } = require("./identiteit");
const { isIngeschakeld: isFacturatieIngeschakeld } = require("./facturatieInstellingen");
const { isIngeschakeld: isRittenIngeschakeld } = require("./rittenInstellingen");
const { isGekoppeld: isProjectenGekoppeld } = require("./projectenInstellingen");

async function controleerKlantenLijstToegang(req) {
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
  const [facturatieAan, rittenAan, projectenAan] = await Promise.all([
    isFacturatieIngeschakeld(accountId),
    isRittenIngeschakeld(accountId),
    isProjectenGekoppeld(accountId),
  ]);
  if (!facturatieAan && !rittenAan && !projectenAan) {
    const fout = new Error("Geen van de modules die eindklanten gebruiken (Facturatie, Ritten) staat aan voor dit klantaccount.");
    fout.code = "MODULE_UITGESCHAKELD";
    throw fout;
  }
  return { email, accountId };
}

/** Zelfde foutafhandeling als facturatieToegang.afhandelFout, zodat api/klanten-klanten/index.js
 * verder ongewijzigd kan blijven. */
function afhandelFout(context, err) {
  if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.code === "GEEN_ACCOUNT_ID" || err.code === "GEEN_TOEGANG" || err.code === "MODULE_UITGESCHAKELD") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
    return;
  }
  if (err.message === "MISSING_CONFIG") {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "De module is nog niet volledig geconfigureerd (FACTURATIE_SQL_CONNECTIONSTRING ontbreekt)." },
    };
    return;
  }
  context.log && context.log.error && context.log.error(err);
  context.res = {
    status: 500,
    headers: { "Content-Type": "application/json" },
    body: { error: "Er ging iets mis. Probeer het later opnieuw.", detail: String(err.message || err) },
  };
}

module.exports = { controleerKlantenLijstToegang, afhandelFout };
