/**
 * Leest de Dataverse-metadata van de Dynamics-tabel "Brieven" (standaard logische naam
 * `cr283_brief`, overschrijfbaar via Application Setting DYNAMICS_BRIEF_ENTITEIT) — zodat de
 * Brieven-module weet welke ja/nee-velden en optielijsten er zijn, welke opties die hebben, en met
 * welk lookup-veld een brief-record aan de klant (account) hangt.
 *
 * Doel: op basis van deze velden bepaalt de beheerder per standaardparagraaf een voorwaarde
 * (veld = waarde / ja-nee), zonder veldnamen met de hand over te typen. Zelfde metadata-aanpak als
 * api/beheer-taaksoorten (EntityDefinitions(...)/Attributes gecast naar het juiste metadata-type),
 * maar dan voor álle relevante velden van de Brieven-tabel in één paar aanroepen.
 *
 * Vereist: de Dynamics-koppeling (DYNAMICS_RESOURCE_URL + app-registratie met leesrechten op de
 * Brieven-tabel; dezelfde token als beheer-klanten via haalDynamicsToken()).
 */
const { haalDynamicsToken } = require("./identiteit");

const STANDAARD_ENTITEIT = "cr283_brief";

function metaHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
}

function labelVan(displayName, terugval) {
  const l = displayName && displayName.UserLocalizedLabel && displayName.UserLocalizedLabel.Label;
  return l || terugval || "";
}

async function haalJson(url, token) {
  const res = await fetch(url, { headers: metaHeaders(token) });
  if (!res.ok) throw new Error(`Metadata opvragen mislukt (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Alleen echte, veilige logische namen doorlaten (voorkomt injectie in de metadata-URL). */
function veiligeEntiteit(naam) {
  const schoon = String(naam || "").trim().toLowerCase();
  return /^[a-z][a-z0-9_]{1,80}$/.test(schoon) ? schoon : STANDAARD_ENTITEIT;
}

// Lichte in-memory cache van het schema per entiteit — de tabelmetadata verandert bijna nooit, en
// zowel het beheer-leespunt als de record-lister (brief-records) vragen 'm op. TTL 10 min.
const schemaCache = new Map();
const SCHEMA_TTL_MS = 10 * 60 * 1000;

function optiesUit(optionSet) {
  return ((optionSet && optionSet.Options) || []).map((o) => ({
    waarde: o.Value,
    label: labelVan(o.Label, String(o.Value)),
  }));
}

/**
 * Haalt het volledige, voor de Brieven-module relevante schema van de tabel op:
 *   { entiteit, entitySet, primaryId, primaryName, booleans[], optielijsten[], lookups[], klantVeldVoorstel }
 */
async function haalSchema(entiteitInvoer, { cache = true } = {}) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    const e = new Error("MISSING_DYNAMICS");
    e.code = "MISSING_DYNAMICS";
    throw e;
  }
  const entiteit = veiligeEntiteit(entiteitInvoer || process.env.DYNAMICS_BRIEF_ENTITEIT || STANDAARD_ENTITEIT);
  if (cache) {
    const bewaard = schemaCache.get(entiteit);
    if (bewaard && Date.now() - bewaard.op < SCHEMA_TTL_MS) return bewaard.schema;
  }
  const token = await haalDynamicsToken();
  const basis = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${entiteit}')`;

  // 1) Entiteit-info (collectienaam + primaire velden).
  const info = await haalJson(`${basis}?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`, token);

  // 2) Ja/nee-velden (Boolean) — incl. de Ja/Nee-labels van hun OptionSet.
  const boolData = await haalJson(
    `${basis}/Attributes/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName,DisplayName,IsCustomAttribute&$expand=OptionSet`,
    token
  );
  const booleans = (boolData.value || [])
    .filter((a) => a.IsCustomAttribute)
    .map((a) => ({
      naam: a.LogicalName,
      label: labelVan(a.DisplayName, a.LogicalName),
      jaLabel: labelVan(a.OptionSet && a.OptionSet.TrueOption && a.OptionSet.TrueOption.Label, "Ja"),
      neeLabel: labelVan(a.OptionSet && a.OptionSet.FalseOption && a.OptionSet.FalseOption.Label, "Nee"),
    }))
    .sort((x, y) => x.label.localeCompare(y.label, "nl"));

  // 3) Optielijsten (Picklist + MultiSelectPicklist) — incl. hun opties.
  const [pickData, multiData] = await Promise.all([
    haalJson(`${basis}/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName,DisplayName,IsCustomAttribute&$expand=OptionSet`, token),
    haalJson(`${basis}/Attributes/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?$select=LogicalName,DisplayName,IsCustomAttribute&$expand=OptionSet`, token).catch(() => ({ value: [] })),
  ]);
  const optielijsten = [
    ...(pickData.value || []).map((a) => ({ a, multi: false })),
    ...(multiData.value || []).map((a) => ({ a, multi: true })),
  ]
    .filter(({ a }) => a.IsCustomAttribute)
    .map(({ a, multi }) => ({
      naam: a.LogicalName,
      label: labelVan(a.DisplayName, a.LogicalName),
      multi,
      opties: optiesUit(a.OptionSet),
    }))
    .sort((x, y) => x.label.localeCompare(y.label, "nl"));

  // 4) Lookups — om de klant-koppeling te vinden (Targets bevat 'account').
  const lookupData = await haalJson(
    `${basis}/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,DisplayName,Targets`,
    token
  );
  const lookups = (lookupData.value || [])
    .map((a) => ({ naam: a.LogicalName, label: labelVan(a.DisplayName, a.LogicalName), targets: a.Targets || [] }))
    .filter((l) => l.targets.length > 0);

  const ingesteldKlantVeld = (process.env.DYNAMICS_BRIEF_KLANT_VELD || "").trim().toLowerCase();
  const klantVeldVoorstel =
    (ingesteldKlantVeld && lookups.find((l) => l.naam === ingesteldKlantVeld) && ingesteldKlantVeld) ||
    (lookups.find((l) => l.targets.includes("account")) || {}).naam ||
    "";

  const schema = {
    entiteit,
    entitySet: info.EntitySetName || "",
    primaryId: info.PrimaryIdAttribute || "",
    primaryName: info.PrimaryNameAttribute || "",
    booleans,
    optielijsten,
    lookups,
    klantVeldVoorstel,
  };
  schemaCache.set(entiteit, { op: Date.now(), schema });
  return schema;
}

module.exports = { haalSchema, veiligeEntiteit, STANDAARD_ENTITEIT };
