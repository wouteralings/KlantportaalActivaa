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
const { haalDynamicsToken, CC_EMAIL_VELD } = require("../_gedeeld/identiteit");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Schrijft het CC-mailadres best-effort ook naar Dynamics (cr283_ccbijversturen) — zelfde
 * vangnet-gedachte als IBAN/tenaamstelling (zie api/beheer-wijzigingen/index.js): mislukt het
 * wegschrijven naar de eigen SQL-tabel een keer (bekend, nog niet opgelost probleem), dan komt
 * de waarde via Dynamics alsnog terecht bij het versturen van een factuur/offerte/creditnota
 * (zie haalGegevensMetCrmAanvulling in bedrijfsgegevensKlanten.js). Mag het opslaan van het
 * cc-mailadres zelf nooit laten mislukken — vandaar dat de aanroeper dit los in een eigen
 * try/catch aanroept en de fout alleen logt.
 */
async function schrijfCcEmailNaarDynamics(accountId, ccEmail) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) return;
  const token = await haalDynamicsToken();
  const res = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "If-Match": "*",
    },
    body: JSON.stringify({ [CC_EMAIL_VELD]: ccEmail || null }),
  });
  if (!res.ok) throw new Error(`CC-mailadres bijwerken in Dynamics mislukt (${res.status}): ${await res.text()}`);
}

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
      try {
        await schrijfCcEmailNaarDynamics(accountId, ccEmail);
      } catch (dynFout) {
        context.log.error("CC-mailadres wegschrijven naar Dynamics (best effort) mislukt:", dynFout);
      }
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
