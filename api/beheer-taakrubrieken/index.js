const { haalDynamicsToken } = require("../_gedeeld/identiteit");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * Haalt de optieset-waarden van het "Rubriek"-veld (cr283_rubriek) op Task op via de Dataverse-
 * metadata, zodat de beheerder een échte rubriek kan kiezen i.p.v. een nummer met de hand over te
 * typen — bijv. voor de backoffice-taak bij Brieven (zie BrievenBeheer.jsx, "Soort taak" ernaast).
 * Zelfde opzet als /api/beheer-taaksoorten, maar dan voor Rubriek i.p.v. Soort, en zonder de
 * per-waarde zichtbaarheids-configuratie (Rubriek wordt vooralsnog alleen gebruikt om aan een taak
 * mee te geven, niet om klant-zichtbaarheid mee te filteren).
 *
 * Zet de logische veldnaam via Application Setting DYNAMICS_TAAK_RUBRIEK_VELD — standaard
 * "cr283_rubriek" (Wouter, 07-08-2026), aanpasbaar mocht het bij jullie anders heten.
 */
const RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";

async function haalOpties(resource, token) {
  const basis = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='task')/Attributes(LogicalName='${RUBRIEK_VELD}')`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };

  // Eerst het AttributeType opvragen om te weten welk metadata-type we moeten casten.
  const typeRes = await fetch(`${basis}?$select=AttributeType`, { headers });
  if (!typeRes.ok) throw new Error(`Metadata opvragen mislukt: ${await typeRes.text()}`);
  const { AttributeType } = await typeRes.json();

  const metadataType =
    AttributeType === "MultiSelectPicklist"
      ? "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"
      : "Microsoft.Dynamics.CRM.PicklistAttributeMetadata";

  const optiesRes = await fetch(`${basis}/${metadataType}?$select=LogicalName&$expand=OptionSet`, { headers });
  if (!optiesRes.ok) throw new Error(`Optieset opvragen mislukt: ${await optiesRes.text()}`);
  const data = await optiesRes.json();

  return (data.OptionSet?.Options || []).map((optie) => ({
    waarde: optie.Value,
    label: optie.Label?.UserLocalizedLabel?.Label || String(optie.Value),
  }));
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  if (!RUBRIEK_VELD) {
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { configuratieNodig: true, opties: [], veld: "" },
    };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const opties = await haalOpties(resource, token);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { configuratieNodig: false, veld: RUBRIEK_VELD, opties },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error:
          "Kon rubrieken niet ophalen. Controleer of DYNAMICS_TAAK_RUBRIEK_VELD (standaard cr283_rubriek) de juiste logische veldnaam is.",
        detail: String(err),
      },
    };
  }
};
