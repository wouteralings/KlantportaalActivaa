const { haalDynamicsToken } = require("../_gedeeld/identiteit");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Levert de keuzelijst-opties (optie-waarde + label) van de bewerkbare classificatievelden op
 * Account, zodat het medewerkersportaal die als dropdown kan tonen bij het wijzigen.
 * GET → { clienttype:[{value,label}], status:[...], team:[...], kantoor:[...] }
 */
const VELDEN = {
  clienttype: process.env.DYNAMICS_KLANT_CLIENTTYPE_VELD || "businesstypecode",
  status: process.env.DYNAMICS_KLANT_STATUS_VELD || "cr283_clienttype",
  team: process.env.DYNAMICS_KLANT_TEAM_VELD || "cr283_team",
  kantoor: process.env.DYNAMICS_KLANT_KANTOOR_VELD || "cr283_kantoor",
};

async function haalOpties(resource, token, veld) {
  const url = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='account')/Attributes(LogicalName='${veld}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet,GlobalOptionSet`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!r.ok) return [];
  const j = await r.json();
  const os = j.OptionSet || j.GlobalOptionSet || {};
  return (os.Options || []).map((o) => ({
    value: o.Value,
    label: (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value),
  }));
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }
  try {
    const token = await haalDynamicsToken();
    const uit = {};
    for (const [key, veld] of Object.entries(VELDEN)) {
      uit[key] = veld ? await haalOpties(resource, token, veld).catch(() => []) : [];
    }
    context.res = { headers: { "Content-Type": "application/json" }, body: uit };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de keuzelijsten niet ophalen.", detail: String(err) } };
  }
};
