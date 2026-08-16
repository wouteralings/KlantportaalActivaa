/**
 * /api/uren-schema-setup?bevestig=ja — eenmalige (veilig herhaalbare) opzet van de Dataverse-
 * tabellen voor de interne urenregistratie:
 *   - cr283_urenboeking     (de urenboekingen; 1 rij per boeking)
 *   - cr283_urentarief      (uurtarieven + declarabel-doel per medewerker; 1 rij per medewerker)
 *   - cr283_verlofaanvraag  (verlofaanvragen; 1 rij per aanvraag — zie Verlofmodule, 03-08-2026)
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
 *
 * Performance (03-08-2026): de bestaan-checks per attribuut/relatie gebeuren niet meer één-voor-één
 * (dat waren tientallen losse round-trips naar Dataverse en liep tegen een timeout aan op de
 * West-Europa functie-app — "Backend call failure") maar met ÉÉN opvraging van alle bestaande
 * attributen per tabel / relaties in totaal, waarna de rest in-memory (een Set) wordt gecheckt.
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
/** Eén opvraging van alle bestaande attribuut-LogicalNames op een entiteit (i.p.v. per attribuut een losse check). */
async function haalBestaandeAttributen(token, resource, entity) {
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName`);
  if (!res.ok) throw verwerkFout(res, await res.text());
  return new Set(((await res.json()).value || []).map((a) => a.LogicalName));
}
async function maakAttribuut(token, resource, entity, attr, metadata, bestaandeSet) {
  if (bestaandeSet.has(attr)) return { actie: "bestond al", attribuut: attr };
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entity}')/Attributes`, { method: "POST", body: JSON.stringify(metadata) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  bestaandeSet.add(attr);
  return { actie: "aangemaakt", attribuut: attr };
}
/** Eén opvraging van alle bestaande relaties met onze prefix (i.p.v. per relatie een losse check).
 *  Metadata-entiteiten zoals RelationshipDefinitions ondersteunen geen OData-functies (startswith,
 *  contains, …) in $filter — alleen simpele "eq" — dus alles ophalen (alleen SchemaName, licht) en
 *  in-memory op prefix filteren, in plaats van te filteren met startswith() in de query zelf. */
async function haalBestaandeRelaties(token, resource, prefix) {
  const res = await dv(token, resource, `/RelationshipDefinitions?$select=SchemaName`);
  if (!res.ok) throw verwerkFout(res, await res.text());
  return new Set(((await res.json()).value || []).filter((r) => r.SchemaName && r.SchemaName.startsWith(prefix)).map((r) => r.SchemaName));
}
async function maakLookupRelatie(token, resource, { schemaName, referencedEntity, referencingEntity, lookupSchemaName, weergavenaam, beschrijving }, bestaandeSet) {
  if (bestaandeSet.has(schemaName)) return { actie: "bestond al", relatie: schemaName };
  const body = {
    SchemaName: schemaName, "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    ReferencedEntity: referencedEntity, ReferencingEntity: referencingEntity,
    Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", AttributeType: "Lookup", AttributeTypeName: { Value: "LookupType" }, SchemaName: lookupSchemaName, DisplayName: label(weergavenaam), Description: label(beschrijving) },
  };
  const res = await dv(token, resource, "/RelationshipDefinitions", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  bestaandeSet.add(schemaName);
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
const Int = (schema, naam) => ({ "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata", AttributeType: "Integer", AttributeTypeName: { Value: "IntegerType" }, SchemaName: schema, DisplayName: label(naam), RequiredLevel: req0, MinValue: 1900, MaxValue: 2100 });
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
      beschrijving: "Eén interne urenboeking van een medewerker (abonnement/UXT/indirect/kantoor/verlof).",
      primaireAttribuutSchemaName: `${PREFIX}_Kenmerk`, primaireAttribuutWeergavenaam: "Kenmerk",
      primaireAttribuutMaxLength: 100, autoNumberFormat: "UUR-{SEQNUM:000000}",
    }));
    const boekingBestaandeAttrs = await haalBestaandeAttributen(token, resource, B);
    const boekingAttrs = [
      [`${PREFIX}_datum`, DatumOnly(`${PREFIX}_Datum`, "Datum")],
      [`${PREFIX}_soort`, Str(`${PREFIX}_Soort`, "Soort", 20)],                 // abonnement|uxt|indirect|kantoor|verlof
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
      [`${PREFIX}_goedkeurdernaam`, Str(`${PREFIX}_Goedkeurdernaam`, "Goedkeurder (snapshot)", 256)],
      [`${PREFIX}_urencode`, Str(`${PREFIX}_Urencode`, "Urencode", 100)],
      [`${PREFIX}_jaar`, Int(`${PREFIX}_Jaar`, "Jaar (abonnement)")],           // verplicht in te vullen bij soort 'abonnement' (zie mw-uren-boekingen)
      [`${PREFIX}_vast`, Bool(`${PREFIX}_Vast`, "Vaste (contract)uren")],       // door beheer vastgezet, niet zelf te wijzigen
      // Bron van het gekoppelde urenschrijven: vanuit welke taak of planningstaak zijn deze uren
      // geschreven? bronsoort = 'taak' | 'planning'; bronid = de Dynamics-activityid (taak) of
      // "<accountId>|<activiteit>|<periode>" (planningstaak); bronlabel = leesbare omschrijving.
      [`${PREFIX}_bronsoort`, Str(`${PREFIX}_Bronsoort`, "Bron (soort)", 20)],
      [`${PREFIX}_bronid`, Str(`${PREFIX}_Bronid`, "Bron (sleutel)", 200)],
      [`${PREFIX}_bronlabel`, Str(`${PREFIX}_Bronlabel`, "Bron (omschrijving)", 300)],
    ];
    for (const [logisch, meta] of boekingAttrs) stappen.push(await maakAttribuut(token, resource, B, logisch, meta, boekingBestaandeAttrs));

    // ---- Tabel 2: Urentarief ----
    const T = `${PREFIX}_urentarief`;
    stappen.push(await maakEntiteit(token, resource, {
      logicalName: T, schemaName: `${PREFIX}_Urentarief`,
      weergavenaam: "Urentarief", weergavenaamMeervoud: "Urentarieven",
      beschrijving: "Uurtarieven (normaal/hoog/laag) en declarabel-doel per medewerker.",
      primaireAttribuutSchemaName: `${PREFIX}_Medewerkernaam`, primaireAttribuutWeergavenaam: "Medewerker",
      primaireAttribuutMaxLength: 256,
    }));
    const tariefBestaandeAttrs = await haalBestaandeAttributen(token, resource, T);
    const tariefAttrs = [
      [`${PREFIX}_medewerkeremail`, Str(`${PREFIX}_Medewerkeremail`, "Medewerker e-mail", 256)],
      [`${PREFIX}_tariefnormaal`, Dec(`${PREFIX}_Tariefnormaal`, "Uurtarief normaal")],
      [`${PREFIX}_tariefhoog`, Dec(`${PREFIX}_Tariefhoog`, "Uurtarief hoog")],
      [`${PREFIX}_tarieflaag`, Dec(`${PREFIX}_Tarieflaag`, "Uurtarief laag")],
      [`${PREFIX}_declarabeldoel`, Dec(`${PREFIX}_Declarabeldoel`, "Declarabel-doel (%)")],
      [`${PREFIX}_leidinggevendenaam`, Str(`${PREFIX}_Leidinggevendenaam`, "Leidinggevende (keurt weekstaat goed)", 256)],
      [`${PREFIX}_deadlineweekdag`, Dec(`${PREFIX}_Deadlineweekdag`, "Deadline weekdag (1=ma .. 7=zo)")],
      [`${PREFIX}_indiensttredingsdatum`, DatumOnly(`${PREFIX}_Indiensttredingsdatum`, "Datum in dienst")],
      [`${PREFIX}_actief`, Bool(`${PREFIX}_Actief`, "Actief")],
    ];
    for (const [logisch, meta] of tariefAttrs) stappen.push(await maakAttribuut(token, resource, T, logisch, meta, tariefBestaandeAttrs));

    // ---- Tabel 3: Verlofaanvraag (03-08-2026) ----
    const V = `${PREFIX}_verlofaanvraag`;
    stappen.push(await maakEntiteit(token, resource, {
      logicalName: V, schemaName: `${PREFIX}_Verlofaanvraag`,
      weergavenaam: "Verlofaanvraag", weergavenaamMeervoud: "Verlofaanvragen",
      beschrijving: "Eén verlofaanvraag van een medewerker (vakantie/ziek/bijzonder verlof/onbetaald).",
      primaireAttribuutSchemaName: `${PREFIX}_Kenmerk`, primaireAttribuutWeergavenaam: "Kenmerk",
      primaireAttribuutMaxLength: 100, autoNumberFormat: "VERLOF-{SEQNUM:000000}",
    }));
    const verlofBestaandeAttrs = await haalBestaandeAttributen(token, resource, V);
    const verlofAttrs = [
      [`${PREFIX}_medewerkeremail`, Str(`${PREFIX}_Medewerkeremail`, "Medewerker e-mail", 256)],
      [`${PREFIX}_medewerkernaam`, Str(`${PREFIX}_Medewerkernaam`, "Medewerker", 256)],
      [`${PREFIX}_verloftype`, Str(`${PREFIX}_Verloftype`, "Verloftype", 50)],   // sleutel: vakantie|ziek|bijzonder_verlof|onbetaald|...
      [`${PREFIX}_startdatum`, DatumOnly(`${PREFIX}_Startdatum`, "Startdatum")],
      [`${PREFIX}_einddatum`, DatumOnly(`${PREFIX}_Einddatum`, "Einddatum")],
      [`${PREFIX}_aantaluren`, Dec(`${PREFIX}_Aantaluren`, "Aantal verlofuren")],
      [`${PREFIX}_status`, Str(`${PREFIX}_Status`, "Status", 20)],               // aangevraagd|goedgekeurd|afgewezen|ingetrokken
      [`${PREFIX}_toelichting`, Memo(`${PREFIX}_Toelichting`, "Toelichting", 2000)],
      [`${PREFIX}_leidinggevendenaam`, Str(`${PREFIX}_Leidinggevendenaam`, "Leidinggevende (snapshot)", 256)],
      [`${PREFIX}_afgehandelddoor`, Str(`${PREFIX}_Afgehandelddoor`, "Afgehandeld door", 256)],
      [`${PREFIX}_afgehandeldop`, DatumTijd(`${PREFIX}_Afgehandeldop`, "Afgehandeld op")],
      [`${PREFIX}_afwijsreden`, Str(`${PREFIX}_Afwijsreden`, "Reden van afwijzing", 500)],
    ];
    for (const [logisch, meta] of verlofAttrs) stappen.push(await maakAttribuut(token, resource, V, logisch, meta, verlofBestaandeAttrs));

    // ---- Relaties (maken meteen de lookup-kolommen aan) ----
    const relatiesBestaand = await haalBestaandeRelaties(token, resource, `${PREFIX}_`);
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_account_urenboeking`, referencedEntity: "account", referencingEntity: B, lookupSchemaName: `${PREFIX}_Client`, weergavenaam: "Cliënt", beschrijving: "De cliënt (Dynamics-account) waarop deze uren zijn geschreven." }, relatiesBestaand));
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_systemuser_urenboeking`, referencedEntity: "systemuser", referencingEntity: B, lookupSchemaName: `${PREFIX}_Medewerker`, weergavenaam: "Medewerker", beschrijving: "De medewerker die deze uren heeft geschreven." }, relatiesBestaand));
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_systemuser_urentarief`, referencedEntity: "systemuser", referencingEntity: T, lookupSchemaName: `${PREFIX}_Medewerker`, weergavenaam: "Medewerker", beschrijving: "De medewerker bij dit uurtarief." }, relatiesBestaand));
    stappen.push(await maakLookupRelatie(token, resource, { schemaName: `${PREFIX}_systemuser_verlofaanvraag`, referencedEntity: "systemuser", referencingEntity: V, lookupSchemaName: `${PREFIX}_Medewerker`, weergavenaam: "Medewerker", beschrijving: "De medewerker van deze verlofaanvraag." }, relatiesBestaand));

    stappen.push(await publiceerAlles(token, resource));

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, stappen, volgende: [
      "Controleer in make.powerapps.com de tabellen 'Urenboeking', 'Urentarief' en 'Verlofaanvraag'.",
      "Zorg dat de Application User (DYNAMICS_CLIENT_ID) lees- en schrijfrechten (Aanmaken/Lezen/Bijwerken/Verwijderen) heeft op alle drie de nieuwe tabellen — anders faalt het wegschrijven van uren/verlof.",
      "Zet de rol 'System Customizer' van de Application User daarna weer terug naar de minimale rol.",
    ] } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { ok: false, error: err.message, tot_nu_toe: stappen } };
  }
};
