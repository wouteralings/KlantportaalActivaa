const { haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magAlsKlant } = require("../_gedeeld/wijzigrechten");
const { haalLog, voegInzageToe } = require("../_gedeeld/klantInzageLog");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder'); de fijnere
 * scheiding (GET alleen beheerder, POST alleen met het als-klant-recht) gebeurt hieronder.
 *
 * GET  → (alleen beheerder) { log: [...] } — audit-log "wie keek wanneer als welke klant mee",
 *        nieuwste eerst. Zie Beheer → Medewerkers.
 * POST → body { accountId, klantnummer, klantnaam, contactEmail } — legt vast dat de ingelogde
 *        medewerker nu meekijkt namens deze klant (het daadwerkelijke meekijken zelf gebeurt via
 *        het klantportaal met de header x-meekijken-als-email, zie herleidAccounts() in
 *        _gedeeld/identiteit.js — dat is waar de autorisatie ook echt wordt afgedwongen; dit
 *        endpoint legt alleen het moment vast voor de audit-log).
 */
module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);
    const beheerder = haalRollenUitPrincipal(req).includes("beheerder");

    if (req.method === "GET") {
      if (!beheerder) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen beheerders mogen deze log inzien." } };
        return;
      }
      const log = await haalLog();
      context.res = { headers: { "Content-Type": "application/json" }, body: { log: [...log].reverse() } };
      return;
    }

    if (req.method === "POST") {
      const mag = await magAlsKlant(email, beheerder).catch(() => false);
      if (!mag) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen recht om als klant mee te kijken." } };
        return;
      }
      const { accountId, klantnummer, klantnaam, contactEmail } = req.body || {};
      if (!accountId || !contactEmail) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "accountId en contactEmail zijn verplicht." } };
        return;
      }
      await voegInzageToe({
        medewerkerEmail: email,
        medewerkerNaam: haalNaamUitPrincipal(req),
        klantAccountId: accountId,
        klantnummer,
        klantnaam,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout.", detail: String(err) } };
  }
};
