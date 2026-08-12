/**
 * /api/dossier-kolommen-beschikbaar?soort=ib|vpb|dividend|notulen — de nog NIET gebruikte,
 * bewerkbare custom-kolommen van de Dynamics-tabel van een dossiersoort. Voor Beheer → Dossiers,
 * sectie "Bestaande kolom toevoegen": zo kan Wouter kolommen die al in Dynamics bestaan maar nog
 * niet in het dossier zitten, alsnog als (aangepast) veld toevoegen — zonder een nieuwe kolom te
 * maken. Het toevoegen zelf loopt gewoon via dossierIndeling.<soort>.aangepasteVelden (zie
 * DossierIndelingBeheer.jsx + metAangepasteVelden in dossiers.js) — dit endpoint LEEST alleen.
 *
 * "Gebruikt" = de vaste catalogus + periode/status/lookups/links (soort.optioneel), de status- en
 * id-kolom, de cliënt-lookup, de primaire naamkolom, statecode/statuscode, en de al toegevoegde
 * aangepasteVelden. Lookups, systeemvelden, basis-/gekoppelde velden (AttributeOf) en niet-
 * ondersteunde typen worden overgeslagen (die kan het dossierscherm nog niet tonen/bewerken).
 *
 *   GET → { soort, kolommen: [{ veld, label, type }] }   (type in ons catalogus-typesysteem)
 *
 * Route beveiligd via staticwebapp.config.json (rol 'beheerder'); extra rolcheck hier.
 */
const { haalRollenUitPrincipal, haalDynamicsToken } = require("../_gedeeld/identiteit");
const { SOORTEN } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");

// Dynamics AttributeType → ons catalogus-type. null = niet ondersteund (overslaan: Lookup/Customer/
// Owner, State/Status, Uniqueidentifier, Virtual/MultiSelectPicklist, PartyList, EntityName, enz.).
function mapType(t) {
  switch (t) {
    case "Boolean": return "boolean";
    case "Picklist": return "picklist";
    case "String": return "string";
    case "Memo": return "memo";
    case "DateTime": return "datetime";
    case "Decimal": case "Double": case "Money": return "decimal";
    case "Integer": case "BigInt": return "integer";
    default: return null;
  }
}

// "Kernnaam" van een (lookup)veld: _cr283_manager_value → cr283_manager.
function kernNaam(veld) {
  return String(veld || "").replace(/^_/, "").replace(/_value$/, "");
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }
  const soortKey = (req.query && req.query.soort) || "";
  const soort = SOORTEN.find((s) => s.key === soortKey);
  if (!soort) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldige 'soort' mee." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const [defRes, attrRes, instellingen] = await Promise.all([
      fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${soort.entiteit}')?$select=PrimaryNameAttribute,PrimaryIdAttribute`, { headers }),
      fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${soort.entiteit}')/Attributes?$select=LogicalName,AttributeType,DisplayName,IsCustomAttribute,AttributeOf`, { headers }),
      haalInstellingen().catch(() => ({})),
    ]);
    if (!attrRes.ok) throw new Error(`Kolommen ophalen mislukt (${attrRes.status}): ${await attrRes.text()}`);
    const def = defRes.ok ? await defRes.json() : {};
    const attrs = (await attrRes.json()).value || [];

    const eigen = instellingen && instellingen.dossierIndeling && instellingen.dossierIndeling[soortKey];
    const aangepast = (eigen && Array.isArray(eigen.aangepasteVelden)) ? eigen.aangepasteVelden : [];

    const gebruikt = new Set();
    for (const v of Object.values(soort.optioneel || {})) gebruikt.add(kernNaam(v));
    gebruikt.add(soort.idVeld);
    gebruikt.add(soort.statusVeld || "cr283_statusaangifte");
    gebruikt.add("cr283_client");
    if (def.PrimaryNameAttribute) gebruikt.add(def.PrimaryNameAttribute);
    if (def.PrimaryIdAttribute) gebruikt.add(def.PrimaryIdAttribute);
    gebruikt.add("statecode");
    gebruikt.add("statuscode");
    for (const a of aangepast) if (a && a.veld) gebruikt.add(a.veld);

    const kolommen = attrs
      // Alleen eigen kolommen (geen systeemvelden), geen basis-/gekoppelde velden (bv. money _base).
      .filter((a) => a.IsCustomAttribute === true && !a.AttributeOf)
      .filter((a) => !gebruikt.has(a.LogicalName))
      .map((a) => ({
        veld: a.LogicalName,
        type: mapType(a.AttributeType),
        label: (a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label) || a.LogicalName,
      }))
      .filter((a) => a.type) // alleen ondersteunde typen
      .sort((x, y) => String(x.label).localeCompare(String(y.label), "nl"));

    context.res = { headers: { "Content-Type": "application/json" }, body: { soort: soortKey, kolommen } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de beschikbare kolommen niet ophalen.", detail: String(err.message || err) } };
  }
};
