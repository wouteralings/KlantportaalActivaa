/**
 * POST /api/bedrijfsgegevens-logo  body { accountId, dataUrl }             → uploaden
 * POST /api/bedrijfsgegevens-logo  body { accountId, actie: "verwijderen" } → verwijderen
 *
 * Eigen logo van een portaalklant uploaden of verwijderen, voor gebruik op zijn eigen
 * facturen/offertes (Facturatiemodule → Instellingen → Bedrijfsgegevens & logo). Direct zelf
 * te doen, geen goedkeuring door Activaa nodig (in tegenstelling tot de overige
 * bedrijfsgegevens-tekstvelden, die sinds 28-07-2026 via een wijzigingsverzoek lopen — het
 * logo is puur voor de klant zelf, vandaar dit aparte endpoint dat blijft bestaan).
 * Zelfde toegangscontrole als /api/bedrijfsgegevens-klanten: alleen als de
 * facturatiemodule voor dit account aan staat.
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { slaKlantLogoOp } = require("../_gedeeld/media");
const { zetGegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }

  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.body && req.body.actie === "verwijderen") {
      const opgeslagen = await zetGegevens(accountId, { logoUrl: "" }, email);
      context.res = { headers: { "Content-Type": "application/json" }, body: { logoUrl: opgeslagen.logoUrl } };
      return;
    }

    const dataUrl = req.body && req.body.dataUrl;
    if (!dataUrl) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'dataUrl' mee." } };
      return;
    }

    const logoUrl = await slaKlantLogoOp(dataUrl, accountId);
    await zetGegevens(accountId, { logoUrl }, email);
    context.res = { headers: { "Content-Type": "application/json" }, body: { logoUrl } };
  } catch (err) {
    if (err.code === "ONGELDIGE_AFBEELDING") {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    afhandelFout(context, err);
  }
};
