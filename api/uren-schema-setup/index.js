/**
 * /api/uren-schema-setup?bevestig=ja — eenmalige (veilig herhaalbare) opzet van de Dataverse-
 * tabellen voor de interne urenregistratie:
 *   - cr283_urenboeking  (de urenboekingen; 1 rij per boeking)
 *   - cr283_urentarief   (uurtarieven + declarabel-doel per medewerker; 1 rij per medewerker)
 *
 * Zelfde aanpak en helpers als api/dataverse-schema-setup (Opdrachtbevestiging/Tarief): elke stap
 * checkt eerst op bestaan, er wordt nooit iets verwijderd/overschreven, en na afloop wordt
 * gepubliceerd. Vereist dat de Application User de rol "System Customizer" (of hoger) heeft voor de
 * duur van deze opzet (zie de bestaande README-sectie).
 *
 * BEVEILIGING: beheerder-only (route in staticwebapp.config.json) + CSRF-drempel via de header
 * x-requested-with: 'klantportaal' + verplichte ?bevestig=ja.
 *
 * Keuzes: gecontroleerde tekstwaarden (soort/status/tariefsoort) als String-kolommen — zo bepaalt
 * de app de waarden en is er geen fragiele option-set-nummermapping nodig. Bedragen als Decimal
 * (geen Money) om de transactievaluta-eis bij het aanmaken te vermijden. Ja/nee als Boolean.
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");

const PREFIX = "cr283";
const TAAL = 1033;

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
  if (res.status === 403) return new Error(`Geen rechten (403) — de Application User mist waarschijnlijk de rol "System Customizer". Details: ${tekst}`);
  return new Error(tekst);
}
async function entiteitBestaat(token, resource, logicalName) {
  const res = await dv(token, resource, `/EntityDefinitions?$select=LogicalName&$filter=LogicalName eq '${logicalName}'`);
  if (!res.ok) throw verwerkFout(res, await res.text());
  return ((await res.json()).value || []).length > 0;
}
async function maakEntiteit(token, resource, { logicalName, schemaName, weergavenaam, weergavenaamMeervoud, beschrijving, primaireAttribuutSchemaName, primaireAttribuutWeergavenaam, autoNumberFormat, primaireAttribuutMaxLength }) {
  if (await entiteitBestaat(token, resource, logicalName)) return { actie: "bestond al", logicalName };
  const primair = {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    AttributeType: "String", AttributeTypeName: { Value: "StringType" },
    SchemaName: primaireAttribuutSchemaName, IsPrimaryName: true,
    RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    MaxLength: primaireAttribuutMaxLength || 100, FormatName: { Value: "Text" }, DisplayName: label(primaireAttribuutWeergavenaam),
  };
  if (autoNumberFormat) primair.AutoNumberFormat = autoNumberFormat;
  const body = {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata", SchemaName: schemaName, OwnershipType: "UserOwned",
    IsActivity: false, HasActivities: false, HasNotes: false,
    DisplayName: label(weergavenaam), DisplayCollectionName: label(weergavenaamMeervoud), Description: label(beschrijving),
    Attributes: [primair],
  };
  const res = await dv(token, resource, "/EntityDefinitions", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt", logicalName };
}
async function attribuutBestaat(token, resource, entity, attr) {
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName&$filter=LogicalName eq '${attr}'`);
  if (!res.ok) throw verwerkFout(res, await res.text());
  return ((await res.json()).value || []).length > 0;
}
async function maakAttribuut(token, resource, entity, attr, metadata) {
  if (await attribuutBestaat(token, resource, entity, attr)) return { actie: "bestond al", attribuut: attr };
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entity}')/Attributes`, { method: "POST", body: JSON.stringify(metadata) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt", attribuut: attr };
}
async function relatieBestaat(token, resource, schemaName) {
  const res = await dv(token, resource, `/RelationshipDefinitions?$select=SchemaName&$filter=SchemaName eq '${schemaName}'`);
  if (!res.ok) throw verwerkFout(res, await res.text());
  return ((await res.json()).value || []).length > 0;
}
async function maakLookupRelatie(token, resource, { schemaName, referencedEntity, referencingEntity, lookupSchemaName, weergavenaam, beschrijving }) {
  if (await relatieBestaat(token, resource, schemaName)) return { actie: "bestond al", relatie: schemaName };
  const body = {
    SchemaName: schemaName, "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    ReferencedEntity: referencedEntity, ReferencingEntity: referencingEntity,
    Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", AttributeType: "Lookup", AttributeTypeName: { Value: "LookupType" }, SchemaName: lookupSchemaName, DisplayName: label(weergavenaam), Description: label(beschrijving) },
  };
  const res = await dv(token, resource, "/RelationshipDefinitions", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt", relatie: schemaName };
}
async function publiceerAlles(token, resource) {
  const res = await dv(token, resource, "/PublishAllXml", { method: "POST", body: JSON.stringify({}) });
  return res.ok ? { actie: "gepubliceerd" } : { actie: "publiceren mislukt", details: await res.text() };
}

// --- Attribuut-metadata bouwers (compact) ---
const req0 = { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" };
const Str = (schema, naam, max = 200, fmt = "Text") => ({ "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", AttributeType: "String", AttributeTypeName: { Value: "StringType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MaxLength: max, FormatName: { Value: fmt } });
const Memo = (schema, naam, max = 2000) => ({ "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", AttributeType: "Memo", AttributeTypeName: { Value: "MemoType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MaxLength: max, Format: "TextArea" });
const Dec = (schema, naam) => ({ "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", AttributeType: "Decimal", AttributeTypeName: { Value: "DecimalType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MinValue: -1000000, MaxValue: 100000000, Precision: 2 });
const DatumOnly = (schema, naam) => ({ "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", AttributeType: "DateTime", AttributeTypeName: { Value: "DateTimeType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, Format: "DateOnly" });
const DatumTijd = (schema, naam) => ({ "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", AttributeType: "DateTime", AttributeTypeName: { Value: "DateTimeType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, Format: "DateAndTime" });
const Bool = (schema, naam) => ({ "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata", AttributeType: "Boolean", AttributeTypeName: { Value: "BooleanType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, OptionSet: { "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata", TrueOption: { Value: 1, Label: label("Ja") }, FalseOption: { Value: 0, Label: label("Nee") } } });

module.exports = async function (context, req) {
  if (req.headers["x-requested-with"] !== "klantportaal") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldig verzoek." } };
    return;
  }
  if (req.query.bevestig !== "ja") {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Voeg ?bevestig=ja toe om te bevestigen dat je het Dataverse-schema voor de urenregistratie wilt aanmaken." } };
    return;
  }
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const stappen = [];
  try {
    const token = await haalDynamicsToken();

    // ---- Tabel 1: Urenboeking ----
    const B = `${PREFIX}_urenboeking`;
    stappen.push(await maakEntiteit(token, resource, {
      logicalName: B, schemaName: `${PREFIX}_Urenboeking`,
      weergavenaam: "Urenboeking", weergavenaamMeervoud: "Urenboekingen",
      beschrijving: "Eén interne urenboeking van een medewerker (abonnement/UXT/indirect/kantoor).",
      primaireAttribuutSchemaName: `${PREFIX}_Kenmerk`, primaireAttribuutWeergavenaam: "Kenmerk",
      primaireAttribuutMaxLength: 100, autoNumberFormat: "UUR-{SEQNUM:000000}",
    }));
    const boekingAttrs = [
      [`${PREFIX}_datum`, DatumOnly(`${PREFIX}_Datum`, "Datum")],
      [`${PREFIX}_soort`, Str(`${PREFIX}_Soort`, "Soort", 20)],                 // abonnement|uxt|indirect|kantoor
      [`${PREFIX}_declarabel`, Bool(`${PREFIX}_Declarabel`, "Declarabel")],
      [`${PREFIX}_omschrijving`, Memo(`${PREFIX}_Omschrijving`, "Omschrijving", 2000)],
      [`${PREFIX}_uren`, Dec(`${PREFIX}_Uren`, "Uren")],
      [`${PREFIX}_tariefsoort`, Str(`${PREFIX}_Tariefsoort`, "Tariefsoort", 10)], // normaal|hoog|laag
      [`${PREFIX}_tariefbedrag`, Dec(`${PREFIX}_Tariefbedrag`, "Uurtarief (snapshot)")],
      [`${PREFIX}_status`, Str(`${PREFIX}_Status`, "Status", 20)],               // open|goedgekeurd|afgeboekt|gefactureerd
      [`${PREFIX}_goedgekeurdeuren`, Dec(`${PREFIX}_Goedgekeurdeuren`, "Goedgekeurde uren")],
      [`${PREFIX}_afboekuren`, Dec(`${PREFIX}_Afboekuren`, "Afgeboekte uren")],
      [`${PREFIX}_afboekreden`, Str(`${PREFIX}_Afboekreden`, "Afboekreden", 500)],
      [`${PREFIX}_extrabedrag`, Dec(`${PREFIX}_Extrabedrag`, "Extra te factureren bedrag")],
      [`${PREFIX}_extrareden`, Str(`${PREFIX}_Extrareden`, "Reden extra bedrag", 500)],
      [`${PREFIX}_gecontroleerddoor`, Str(`${PREFIX}_Gecontroleerddoor`, "Gecontroleerd door", 256)],
      [`${PREFIX}_gecontroleerdop`, DatumTijd(`${PREFIX}_Gecontroleerdop`, "Gecontroleerd op")],
      [`${PREFIX}_gefactureerd`, Bool(`${PREFIX}_Gefactureerd`, "Gefactureerd")],
      [`${PREFIX}_exactfactuur`, Str(`${PREFIX}_Exactfactuur`, "Exact-factuur", 100)],
      [`${PREFIX}_exactstatus`, Str(`${PREFIX}_Exactstatus`, "Exact-status", 400)],
      [`${PREFIX}_medewerkeremail`, Str(`${PREFIX}_Medewerkeremail`, "Medewerker e-mail", 256)],
      [`${PREFIX}_medewerkernaam`, Str(`${PREFIX}_Medewerkernaam`, "Medewerker", 256)],
      [`${PREFIX}_managernaam`, Str(`${PREFIX}_Managernaam`, "Manager (snapshot)", 256)],
    ];
    for (const [logisch, meta] of boekingAttrs) stappen.push(await maakAttribuut(token, resource, B, logisch, meta));

    // ---- Tabel 2: Urentarief ----
    const T = `${PREFIX}_urentarief`;
    stappen.push(await maakEntiteit(token, resource, {
      logicalName: T, schemaName: `${PREFIX}_Urentarief`,
      weergavenaam: "Urentarief", weergavenaamMeervoud: "Urentarieven",
      beschrijving: "Uurtarieven (normaal/hoog/laag) en declarabel-doel per medewerker.",
      primaireAttribuutSchemaName: `${PREFIX}_Medewerkernaam`, primaireAttribuutWeergavenaam: "Medewerker",
      primaireAttribuutMaxLength: 256,
    }));
    const tariefAttrs = [
      [`${PREFIX}_medewerkeremail`, Str(`${PREFIX}_Medewerkeremail`, "Medewerker e-mail", 256)],
      [`${PREFIX}_tariefnormaal`, Dec(`${PREFIX}_Tariefnormaal`, "Uurtarief normaal")],
      [`${PREFIX}_tariefhoog`, Dec(`${PREFIX}_Tariefhoog`, "Uurtarief hoog")],
      [`${PREFIX}_tarieflaag`, Dec(`${PREFIX}_Tarieflaag`, "Uurtarief laag")],
      [`${PREFIX}_declarabeldoel`, Dec(`${PREFIX}_Declarabeldoel`, "Declarabel-doel (%)")],
      [`${PREFIX}_actief`, Bool(`${PREFIX}_Actief`, "Actief")],
    ];
    for (const [logisch, meta] of tariefAttrs) stappen.push(await maakAttribuut(token, resource, T, logisch, meta));

    // ---- Relaties (maken meteen de lookup-kolommen aan) ----
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_account_urenboeking`, referencedEntity: "account", referencingEntity: B, lookupSchemaName: `${PREFIX}_Client`, weergavenaam: "Cliënt", beschrijving: "De cliënt (Dynamics-account) waarop deze uren zijn geschreven." }));
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_systemuser_urenboeking`, referencedEntity: "systemuser", referencingEntity: B, lookupSchemaName: `${PREFIX}_Medewerker`, weergavenaam: "Medewerker", beschrijving: "De medewerker die deze uren heeft geschreven." }));
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_systemuser_urentarief`, referencedEntity: "systemuser", referencingEntity: T, lookupSchemaName: `${PREFIX}_Medewerker`, weergavenaam: "Medewerker", beschrijving: "De medewerker bij dit uurtarief." }));

    stappen.push(await publiceerAlles(token, resource));

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, stappen, volgende: [
      "Controleer in make.powerapps.com de tabellen 'Urenboeking' en 'Urentarief'.",
      "Zorg dat de Application User (DYNAMICS_CLIENT_ID) lees- en schrijfrechten (Aanmaken/Lezen/Bijwerken/Verwijderen) heeft op beide nieuwe tabellen — anders faalt het wegschrijven van uren.",
      "Zet de rol 'System Customizer' van de Application User daarna weer terug naar de minimale rol.",
    ] } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { ok: false, error: err.message, tot_nu_toe: stappen } };
  }
};
