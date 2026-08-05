/**
 * /api/brief-geadresseerde?accountId=<guid> — het adres van het BELASTINGKANTOOR dat via de lookup
 * aan de klant hangt in Dynamics. Rol beheerder + medewerker (route in staticwebapp.config.json).
 *
 * De medewerker kan in de Brieven-tab bij de geadresseerde kiezen tussen "klant", "belastingkantoor"
 * of "overig". Voor "belastingkantoor" halen we het adres hier op: het lookup-veld op de klant
 * (standaard `cr283_belastingkantoor`) wijst naar een record met een adres; dat expanden we.
 *
 *   GET ?accountId=<guid>
 *     → { gekoppeld: true, naam, adres: { straat, huisnummer, toevoeging, postcode, plaats } }
 *       of { gekoppeld: false }   (dan is er nog geen belastingkantoor aan de klant gekoppeld)
 *
 * App Settings (met defaults): DYNAMICS_KLANT_BELASTINGKANTOOR_VELD (attribuut, `cr283_belastingkantoor`)
 * en DYNAMICS_BELASTINGKANTOOR_NAV (navigatie-eigenschap voor het expanden, `cr283_Belastingkantoor`).
 * De adresvelden worden defensief gelezen (expand zonder $select), zodat verschillen in het
 * doel-entiteitstype geen fout geven.
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");

const ATTR = process.env.DYNAMICS_KLANT_BELASTINGKANTOOR_VELD || "cr283_belastingkantoor";
const NAV = process.env.DYNAMICS_BELASTINGKANTOOR_NAV || "cr283_Belastingkantoor";
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
    const token = await haalDynamicsToken();
    const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=_${ATTR}_value&$expand=${NAV}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) throw new Error(`Ophalen belastingkantoor mislukt (${res.status}): ${await res.text()}`);
    const data = await res.json();

    if (!data[`_${ATTR}_value`]) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { gekoppeld: false } };
      return;
    }
    const bk = data[NAV] || {};
    const naam = bk.name || data[`_${ATTR}_value${FV}`] || "";
    const adres = {
      straat: bk.address1_line1 || "",
      huisnummer: bk.cr283_huisnummer || "",
      toevoeging: bk.cr283_huisnummertoevoeging || "",
      postcode: bk.address1_postalcode || "",
      plaats: bk.address1_city || "",
    };
    context.res = { headers: { "Content-Type": "application/json" }, body: { gekoppeld: true, naam, adres } };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Kon het belastingkantoor niet ophalen. Controleer DYNAMICS_KLANT_BELASTINGKANTOOR_VELD / DYNAMICS_BELASTINGKANTOOR_NAV.", detail: String(err) },
    };
  }
};
