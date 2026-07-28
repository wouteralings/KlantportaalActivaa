/**
 * POST /api/bedrijfsgegevens-logo  body { accountId, dataUrl }
 *
 * Eigen logo van een portaalklant uploaden, voor gebruik op zijn eigen facturen/offertes
 * (Facturatiemodule → Instellingen → Bedrijfsgegevens & logo). Direct zelf te doen, geen
 * goedkeuring door Activaa nodig (in tegenstelling tot bedrijfs-/contactgegevens uit
 * Dynamics, die via een wijzigingsverzoek lopen — dit hier is puur voor de klant zelf).
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
