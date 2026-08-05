/**
 * /api/brief-records?accountId=<guid> — de Brieven-records (cr283_brief) van één klant, met de
 * waarden van alle ja/nee-velden en optielijsten (raw + leesbaar label). De medewerker kiest in de
 * Brieven-tab een klant en daarna een van deze records; de engine bepaalt op basis van deze waarden
 * welke standaardparagrafen in de brief komen. Rol beheerder + medewerker (route in
 * staticwebapp.config.json).
 *
 * De tabel + velden + het klant-lookupveld worden automatisch uit de Dataverse-metadata gehaald
 * (briefDynamics.haalSchema — gecachet). Het klant-lookupveld: App Setting DYNAMICS_BRIEF_KLANT_VELD
 * of automatisch de lookup met doel 'account'.
 *
 *   GET ?accountId=<guid>[&entiteit=cr283_brief]
 *     → { entiteit, klantVeld, velden: { booleans[], optielijsten[] }, records: [ { id, naam, datum, waarden } ] }
 *       waarden = { <veld>: { waarde, tekst } }   (waarde = raw; tekst = FormattedValue-label)
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalSchema } = require("../_gedeeld/briefDynamics");

const FV = "@OData.Community.Display.V1.FormattedValue";
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

module.exports = async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }
  const accountId = String((req.query && req.query.accountId) || "").trim();
  if (!GUID.test(accountId)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldige accountId mee." } };
    return;
  }

  try {
    const schema = await haalSchema((req.query && req.query.entiteit) || "");
    const klantVeld = (process.env.DYNAMICS_BRIEF_KLANT_VELD || "").trim().toLowerCase() || schema.klantVeldVoorstel;
    if (!schema.entitySet) throw new Error("Kon de collectienaam (EntitySetName) van de Brieven-tabel niet bepalen.");
    if (!klantVeld) {
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: { error: "Geen klant-lookupveld gevonden op de Brieven-tabel. Zet DYNAMICS_BRIEF_KLANT_VELD op de logische naam van de lookup naar 'account'." },
      };
      return;
    }

    const boolNamen = schema.booleans.map((b) => b.naam);
    const optNamen = schema.optielijsten.map((o) => o.naam);
    const selectVelden = [schema.primaryId, schema.primaryName, "createdon", ...boolNamen, ...optNamen].filter(Boolean);

    const token = await haalDynamicsToken();
    const url =
      `${resource}/api/data/v9.2/${schema.entitySet}` +
      `?$select=${[...new Set(selectVelden)].join(",")}` +
      `&$filter=_${klantVeld}_value eq ${accountId}` +
      `&$orderby=createdon desc`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) throw new Error(`Ophalen brief-records mislukt (${res.status}): ${await res.text()}`);
    const data = await res.json();

    const alleVelden = [...boolNamen, ...optNamen];
    const records = (data.value || []).map((rij) => {
      const waarden = {};
      for (const veld of alleVelden) {
        waarden[veld] = { waarde: rij[veld] != null ? rij[veld] : null, tekst: rij[veld + FV] != null ? rij[veld + FV] : "" };
      }
      return {
        id: rij[schema.primaryId] || "",
        naam: (schema.primaryName && rij[schema.primaryName]) || "",
        datum: rij.createdon || "",
        waarden,
      };
    });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        entiteit: schema.entiteit,
        klantVeld,
        velden: { booleans: schema.booleans, optielijsten: schema.optielijsten },
        records,
      },
    };
  } catch (err) {
    if (err.code === "MISSING_DYNAMICS" || err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Kon de brief-records niet ophalen. Controleer DYNAMICS_BRIEF_ENTITEIT/DYNAMICS_BRIEF_KLANT_VELD en de leesrechten van de app op de Brieven-tabel.", detail: String(err) },
    };
  }
};
