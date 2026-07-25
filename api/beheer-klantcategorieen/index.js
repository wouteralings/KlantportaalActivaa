const { haalDynamicsToken, KLANTCATEGORIE_VELD } = require("../_gedeeld/identiteit");

/**
 * Haalt de echte optieset-waarden van het klantcategorie-veld op Account op via de
 * Dataverse-metadata, zodat het beheerdersportaal een keuzelijst kan tonen in plaats van
 * dat iemand de categorienaam met de hand moet overtypen (en typefouten kan maken die de
 * filtering in het klantportaal stilletjes laten mislukken).
 *
 * Werkt voor zowel een gewone optieset (Picklist) als een multiselect-optieset.
 */
async function haalOpties(resource, token) {
  const basis = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='account')/Attributes(LogicalName='${KLANTCATEGORIE_VELD}')`;
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

  const opties = (data.OptionSet?.Options || []).map((optie) => ({
    waarde: optie.Value,
    label: optie.Label?.UserLocalizedLabel?.Label || String(optie.Value),
  }));

  return { veld: KLANTCATEGORIE_VELD, meerkeuze: AttributeType === "MultiSelectPicklist", opties };
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const resultaat = await haalOpties(resource, token);
    context.res = { headers: { "Content-Type": "application/json" }, body: resultaat };
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
          "Kon klantcategorieën niet ophalen. Controleer of DYNAMICS_KLANTCATEGORIE_VELD de juiste logische veldnaam is.",
        detail: String(err),
      },
    };
  }
};
