/**
 * /api/bedrijfsgegevens-klanten — de eigen afzendergegevens (+ logo) van de ingelogde
 * portaalklant, per gekoppeld klant-account (dbo.bedrijfsgegevens_klanten). Zelfde
 * accountId-afspraak als /api/klanten-klanten, zie api/_gedeeld/facturatieToegang.js.
 * Alleen bereikbaar als de facturatiemodule voor dat account aan staat.
 *
 *   GET /api/bedrijfsgegevens-klanten?accountId=...        → de opgeslagen gegevens
 *   PUT /api/bedrijfsgegevens-klanten body { accountId, ... }  → opslaan (upsert)
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalGegevens, zetGegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      const gegevens = await haalGegevens(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: gegevens };
      return;
    }

    if (req.method === "PUT") {
      const opgeslagen = await zetGegevens(accountId, req.body || {}, email);
      context.res = { headers: { "Content-Type": "application/json" }, body: opgeslagen };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
