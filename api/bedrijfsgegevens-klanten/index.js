/**
 * /api/bedrijfsgegevens-klanten — de eigen afzendergegevens (+ logo) van de ingelogde
 * portaalklant, per gekoppeld klant-account (dbo.bedrijfsgegevens_klanten). Zelfde
 * accountId-afspraak als /api/klanten-klanten, zie api/_gedeeld/facturatieToegang.js.
 * Alleen bereikbaar als de facturatiemodule voor dat account aan staat.
 *
 *   GET /api/bedrijfsgegevens-klanten?accountId=...        → de opgeslagen gegevens
 *   PUT /api/bedrijfsgegevens-klanten  body { accountId, ccEmail } → alleen het cc-mailadres zetten
 *
 * Sinds 28-07-2026 is er GEEN directe PUT meer voor de klant voor de verificatiegegevens
 * (naam/adres/KvK/BTW/IBAN): een wijziging daarvan loopt via een wijzigingsverzoek (POST
 * /api/wijzigingsverzoek met type "bedrijfsgegevens_facturatie"), dat een beheerder moet
 * goedkeuren — pas dan wordt `zetGegevens()` hier aangeroepen, rechtstreeks vanuit
 * api/beheer-wijzigingen/index.js (geen HTTP-endpoint nodig voor die kant). Het logo blijft
 * wél direct zelf te wijzigen, zie /api/bedrijfsgegevens-logo. Sinds 29-07-2026 geldt hetzelfde
 * voor het cc-mailadres (via de PUT hierboven) — geen verificatiegegeven, dus geen goedkeuring
 * nodig, net als het logo.
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalGegevens, zetGegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      const gegevens = await haalGegevens(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: gegevens };
      return;
    }

    if (req.method === "PUT") {
      const ccEmail = typeof req.body?.ccEmail === "string" ? req.body.ccEmail.trim() : "";
      if (ccEmail && !EMAIL_REGEX.test(ccEmail)) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "Vul een geldig e-mailadres in (of laat het veld leeg)." },
        };
        return;
      }
      const opgeslagen = await zetGegevens(accountId, { ccEmail }, email);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ccEmail: opgeslagen.ccEmail } };
      return;
    }

    context.res = {
      status: 405,
      headers: { "Content-Type": "application/json" },
      body: { error: "Alleen het cc-mailadres kan hier direct gewijzigd worden (PUT); de rest via een wijzigingsverzoek." },
    };
  } catch (err) {
    afhandelFout(context, err);
  }
};
