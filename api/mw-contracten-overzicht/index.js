/**
 * /api/mw-contracten-overzicht — het medewerkerskant "mini-dashboard voor relatiebeheerders" uit
 * het contractmanagement-plan (Stap 6): alle zelf-geregistreerde contracten over ALLE
 * klantaccounts heen, zodat een medewerker in één scherm ziet welke contracten binnenkort
 * verlopen. Geeft bewust alleen de contracten terug (met klant_account_id) — de klantnaam/
 * klantnummer worden aan de voorkant erbij gezocht via het al bestaande /api/beheer-klanten
 * (zelfde join-patroon als BeheerPortaal.jsx al gebruikt voor de module-statustabel), zodat hier
 * geen dure/complexe Dynamics-accountquery gedupliceerd hoeft te worden.
 *
 * Beveiligd via staticwebapp.config.json (rol 'beheerder' of 'medewerker') én, fijnmaziger, via
 * het granulaire "Contracten"-recht (metContractenRecht, zie api/_gedeeld/contractenRecht.js) —
 * exact hetzelfde tweelaagse patroon als de offertetool.
 *
 * GET → { contracten: [{ id, klantAccountId, type, naam, einddatum, ... }, ...] }
 */
const { metContractenRecht } = require("../_gedeeld/contractenRecht");
const { haalAlleContractenVoorOverzicht } = require("../_gedeeld/contractenKlanten");

module.exports = metContractenRecht(async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const contracten = await haalAlleContractenVoorOverzicht();
    context.res = { headers: { "Content-Type": "application/json" }, body: { contracten } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "FACTURATIE_SQL_CONNECTIONSTRING ontbreekt." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van het contractenoverzicht.", detail: String(err.message || err) },
    };
  }
});
