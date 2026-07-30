/**
 * /api/medewerker-klant-onderwerpen — per klant instellen welke aanlever-onderwerpen van toepassing
 * zijn en, per onderwerp, of de algemene lijst geldt of een klant-specifieke lijst (voorrang).
 * Route beveiligd (medewerker/beheerder); wijzigen vereist het klant-wijzig-recht (magWijzigen).
 *
 *   - GET ?accountId= → { onderwerpen:[...], lijsten:[...], config:{ onderwerpId:{actief,regels|null} } }
 *   - PUT { accountId, config } → volledige onderwerp-config van de klant overschrijven
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen } = require("../_gedeeld/wijzigrechten");
const { haalOnderwerpen } = require("../_gedeeld/aanleveronderwerpen");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");
const klantonderwerpen = require("../_gedeeld/klantonderwerpen");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  const email = haalEmailUitPrincipal(req);
  const beheerder = haalRollenUitPrincipal(req).includes("beheerder");

  try {
    if (methode === "GET") {
      const accountId = (req.query.accountId || "").trim();
      if (!accountId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' mee." } }; return; }
      const [onderwerpen, lijsten, config] = await Promise.all([
        haalOnderwerpen(),
        haalLijsten(),
        klantonderwerpen.haalVoorKlant(accountId),
      ]);
      context.res = { headers: { "Content-Type": "application/json" }, body: { onderwerpen, lijsten, config } };
      return;
    }

    if (methode === "PUT" || methode === "POST") {
      if (!(await magWijzigen(email, beheerder))) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen rechten om dit te wijzigen." } };
        return;
      }
      const accountId = (req.body && req.body.accountId) || "";
      if (!accountId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' mee." } }; return; }
      const config = await klantonderwerpen.zetVoorKlant(accountId, (req.body && req.body.config) || {});
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, config } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de onderwerp-instellingen niet verwerken.", detail: String(err) } };
  }
};
