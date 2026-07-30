const { metOffertesRecht } = require("../_gedeeld/offertesRecht");
const { haalDataverseToken } = require("../_gedeeld/offertesOnboarding.js");

// ---------------------------------------------------------------------------
// Haalt de daadwerkelijke, actuele waarden van het Dynamics-optionset
// "cr283_soortactiecategorie" (op de entiteit "task") live op bij Dataverse — in
// plaats van de eerder hardcoded, mogelijk onvolledige lijst (TAAK_CATEGORIE_OPTIES
// in App.jsx, die als terugvaloptie blijft dienen als deze aanroep mislukt of de
// Dynamics-koppeling nog niet is geconfigureerd).
// ---------------------------------------------------------------------------
const handler = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "Dynamics-koppeling is nog niet geconfigureerd." },
    };
    return;
  }

  try {
    const token = await haalDataverseToken();

    const query =
      `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='task')` +
      `/Attributes(LogicalName='cr283_soortactiecategorie')` +
      `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet,GlobalOptionSet`;

    const res = await fetch(query, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
    });

    if (!res.ok) {
      const tekst = await res.text();
      context.log.error("Dataverse-fout bij ophalen taakcategorieën:", tekst);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: { error: "Ophalen van de taakcategorieën bij Dynamics is mislukt." },
      };
      return;
    }

    const data = await res.json();
    // Zowel een lokaal als een globaal (gedeeld) optionset kan hier terechtkomen — OptionSet
    // bevat in beide gevallen de opgeloste, actuele lijst met waarden.
    const opties = data.OptionSet?.Options || data.GlobalOptionSet?.Options || [];
    const categorieen = opties
      .map((o) => ({
        code: o.Value,
        label: o.Label?.UserLocalizedLabel?.Label || o.Label?.LocalizedLabels?.[0]?.Label || String(o.Value),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "nl"));

    context.res = { headers: { "Content-Type": "application/json" }, body: categorieen };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Er ging iets mis. Probeer het later opnieuw." },
    };
  }
};

// Alleen bereikbaar voor medewerkers met het offertes-recht (en voor beheerders) — zie
// api/_gedeeld/offertesRecht.js. Het verbergen van de tab in het portaal is cosmetisch;
// dit is de plek waar het daadwerkelijk wordt tegengehouden.
module.exports = metOffertesRecht(handler);
