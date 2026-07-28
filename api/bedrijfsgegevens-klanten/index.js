/**
 * /api/bedrijfsgegevens-klanten — de eigen afzendergegevens (+ logo) van de ingelogde
 * portaalklant, per gekoppeld klant-account (dbo.bedrijfsgegevens_klanten). Zelfde
 * accountId-afspraak als /api/klanten-klanten, zie api/_gedeeld/facturatieToegang.js.
 * Alleen bereikbaar als de facturatiemodule voor dat account aan staat.
 *
 *   GET /api/bedrijfsgegevens-klanten?accountId=...  → de opgeslagen gegevens
 *
 * Sinds 28-07-2026 is er GEEN directe PUT meer voor de klant: een wijziging van deze
 * tekstvelden loopt via een wijzigingsverzoek (POST /api/wijzigingsverzoek met
 * type "bedrijfsgegevens_facturatie"), dat een beheerder moet goedkeuren — pas dan wordt
 * `zetGegevens()` hier aangeroepen, rechtstreeks vanuit api/beheer-wijzigingen/index.js
 * (geen HTTP-endpoint nodig voor die kant). Het logo blijft wél direct zelf te wijzigen,
 * zie /api/bedrijfsgegevens-logo.
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalGegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

module.exports = async function (context, req) {
  try {
    const { accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      const gegevens = await haalGegevens(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: gegevens };
      return;
    }

    context.res = {
      status: 405,
      headers: { "Content-Type": "application/json" },
      body: { error: "Wijzigen kan alleen via een wijzigingsverzoek (POST /api/wijzigingsverzoek)." },
    };
  } catch (err) {
    afhandelFout(context, err);
  }
};
