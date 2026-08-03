/**
 * /api/dossier-kolom-aanmaken (POST) — vanuit Beheer → Dossiers, knop "Nieuw veld aanmaken":
 * maakt een eigen, nieuwe kolom aan op de Dynamics-tabel van een dossiersoort (vooralsnog alleen
 * "ib" = cr283_inkomstenbelasting — VPB/Jaarwerk volgen later) en geeft de aangemaakte
 * kolomgegevens terug. De aanroeper (DossierIndelingBeheer.jsx) voegt het resultaat vervolgens
 * zelf toe aan dossierIndeling.ib.aangepasteVelden via de al bestaande PUT /api/beheer-
 * instellingen — dit endpoint schrijft zelf niets naar de instellingen-blob, het raakt alleen
 * Dynamics.
 *
 * Body: { soort?: "ib", key: string, label: string, type: "boolean"|"string"|"memo"|"decimal"|"datetime" }
 *   - "key" wordt door de aanroeper bepaald (al gededuplniceerd tegen de geladen catalogus) —
 *     dit endpoint vertaalt hem naar een Dataverse-logische-naam cr283_extra_<key> (idempotent:
 *     bestaat die kolom al, dan wordt hij hergebruikt i.p.v. opnieuw aangemaakt/overschreven).
 *   - Keuzelijst (picklist) wordt hier bewust NOG NIET ondersteund — dat vraagt ook eigen
 *     opties/optionset-beheer, een aparte, latere uitbreiding.
 *
 * BEVEILIGING: alleen beheerders (route in staticwebapp.config.json) + CSRF-drempel via de
 * header x-requested-with: 'klantportaal' — zelfde patroon als api/uren-schema-setup en
 * api/dataverse-kolom-aanmaken. Vereist dat de Application User (DYNAMICS_CLIENT_ID) de
 * systeemrol "System Customizer" (of hoger) heeft — zonder die rol geeft Dynamics een 403 terug
 * met een duidelijke toelichting (zie verwerkFout).
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { SOORTEN } = require("../_gedeeld/dossiers");

const TAAL = 1033;
const PREFIX = "cr283";

function label(tekst) {
  return { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: tekst, LanguageCode: TAAL }] };
}
async function dv(token, resource, pad, opties = {}) {
  return fetch(`${resource}/api/data/v9.2${pad}`, {
    ...opties,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json; charset=utf-8", "OData-MaxVersion": "4.0", "OData-Version": "4.0", ...(opties.headers || {}) },
  });
}
function verwerkFout(res, tekst) {
  if (res.status === 403) return new Error(`Geen rechten (403) — de Application User heeft waarschijnlijk niet (meer) de systeemrol "System Customizer". Details: ${tekst}`);
  return new Error(tekst);
}
async function attribuutBestaat(token, resource, entity, attr) {
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName&$filter=LogicalName eq '${attr}'`);
  if (!res.ok) throw verwerkFout(res, await res.text());
  return ((await res.json()).value || []).length > 0;
}
async function maakAttribuut(token, resource, entity, attr, metadata) {
  if (await attribuutBestaat(token, resource, entity, attr)) return { actie: "bestond al" };
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entity}')/Attributes`, { method: "POST", body: JSON.stringify(metadata) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt" };
}
async function publiceerAlles(token, resource) {
  const res = await dv(token, resource, "/PublishAllXml", { method: "POST", body: JSON.stringify({}) });
  return res.ok ? { actie: "gepubliceerd" } : { actie: "publiceren mislukt", details: await res.text() };
}

const req0 = { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" };
const METADATA_PER_TYPE = {
  boolean: (schema, naam) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata", AttributeType: "Boolean", AttributeTypeName: { Value: "BooleanType" },
    SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0,
    OptionSet: { "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata", TrueOption: { Value: 1, Label: label("Ja") }, FalseOption: { Value: 0, Label: label("Nee") } },
  }),
  string: (schema, naam) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", AttributeType: "String", AttributeTypeName: { Value: "StringType" },
    SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MaxLength: 500, FormatName: { Value: "Text" },
  }),
  memo: (schema, naam) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", AttributeType: "Memo", AttributeTypeName: { Value: "MemoType" },
    SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MaxLength: 4000, Format: "TextArea",
  }),
  decimal: (schema, naam) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", AttributeType: "Decimal", AttributeTypeName: { Value: "DecimalType" },
    SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MinValue: -100000000, MaxValue: 100000000, Precision: 2,
  }),
  datetime: (schema, naam) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", AttributeType: "DateTime", AttributeTypeName: { Value: "DateTimeType" },
    SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, Format: "DateOnly",
  }),
};

// Zelfde diakrieten-strip als elders in de app (bijv. offertesOnboarding.js), maar met de
// standaard, robuuste Unicode-range i.p.v. losse combining-characters in de regex zelf.
function maakSlug(tekst) {
  const basis = String(tekst || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  return basis || "veld";
}

module.exports = async function (context, req) {
  if (req.headers["x-requested-with"] !== "klantportaal") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldig verzoek." } };
    return;
  }
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  const { soort: soortKey, key: ruweKey, label: labelTekst, type } = req.body || {};
  const soort = SOORTEN.find((s) => s.key === (soortKey || "ib"));
  if (!soort) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende dossiersoort." } };
    return;
  }
  if (!METADATA_PER_TYPE[type]) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: `Onbekend of nog niet ondersteund veldtype '${type}'.` } };
    return;
  }
  const labelSchoon = String(labelTekst || "").trim().slice(0, 100);
  if (!labelSchoon) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een label/naam voor het nieuwe veld mee." } };
    return;
  }
  const slug = maakSlug(ruweKey || labelSchoon);
  const key = `extra_${slug}`;
  const veld = `${PREFIX}_extra_${slug}`;
  const schemaName = `${PREFIX}_Extra_${slug}`;

  try {
    const token = await haalDynamicsToken();
    const resultaat = await maakAttribuut(token, resource, soort.entiteit, veld, METADATA_PER_TYPE[type](schemaName, labelSchoon));
    await publiceerAlles(token, resource);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, key, veld, type, label: labelSchoon, actie: resultaat.actie },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { ok: false, error: err.message || "Aanmaken van de kolom is mislukt." } };
  }
};
