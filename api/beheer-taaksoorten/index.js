const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * Haalt de optieset-waarden van het "Soort"-veld op Task op via de Dataverse-metadata, zodat de
 * beheerder per soort kan aanvinken of klanten hem zien én mogen goedkeuren — i.p.v. veldnamen
 * met de hand over te typen. Geeft ook de huidige opgeslagen configuratie mee.
 *
 * Zet de logische veldnaam van het soort-veld in Application Setting DYNAMICS_TAAK_SOORT_VELD
 * (bijv. "sk_soort" of "cr283_soort").
 */
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";

async function haalOpties(resource, token) {
  const basis = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='task')/Attributes(LogicalName='${SOORT_VELD}')`;
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

/**
 * Hoeveel OPENSTAANDE taken (statecode 0 = Open) er per soort zijn, kantoorbreed. Eén aggregatie-
 * query op Dataverse i.p.v. alle taken ophalen. Best-effort: lukt het niet (soort-veld is een
 * multiselect, of de aggregatie loopt tegen de 50.000-recordgrens), dan geven we {} terug en toont
 * het beheerscherm gewoon geen tellers — de rest van het scherm blijft werken.
 */
async function haalOpenAantallen(resource, token) {
  const url = `${resource}/api/data/v9.2/tasks?$apply=filter(statecode eq 0)/groupby((${SOORT_VELD}),aggregate($count as aantal))`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "odata.maxpagesize=5000",
    },
  });
  if (!res.ok) throw new Error(`Tellen mislukt: ${await res.text()}`);
  const data = await res.json();
  const uit = {};
  for (const rij of data.value || []) {
    const soort = rij && rij[SOORT_VELD];
    if (soort === null || soort === undefined || soort === "") continue;
    uit[String(soort)] = (uit[String(soort)] || 0) + (Number(rij.aantal) || 0);
  }
  return uit;
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  if (!SOORT_VELD) {
    // Zonder geconfigureerd veld kunnen we geen soorten tonen; het portaal toont dan (bewust)
    // geen taken. Geef dit expliciet terug zodat de beheerder ziet wat er nog moet gebeuren.
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { configuratieNodig: true, opties: [], config: {}, veld: "" },
    };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const opties = await haalOpties(resource, token);
    const instellingen = await haalInstellingen().catch(() => ({}));
    // Tellers zijn een extraatje: nooit de hele lijst laten vallen als de aggregatie faalt.
    let openAantallen = {};
    let aantallenFout = "";
    try {
      openAantallen = await haalOpenAantallen(resource, token);
    } catch (e) {
      aantallenFout = String((e && e.message) || e).slice(0, 300);
      context.log && context.log.warn && context.log.warn("Taaksoort-aantallen niet gelukt:", aantallenFout);
    }
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        configuratieNodig: false,
        veld: SOORT_VELD,
        opties,
        config: instellingen.taaksoorten || {},
        openAantallen,
        aantallenFout,
      },
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
          "Kon taaksoorten niet ophalen. Controleer of DYNAMICS_TAAK_SOORT_VELD de juiste logische veldnaam is.",
        detail: String(err),
      },
    };
  }
};
