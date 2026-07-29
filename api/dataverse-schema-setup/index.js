const { haalDataverseToken } = require("../_gedeeld/offertesOnboarding");

// ---------------------------------------------------------------------------
// Eenmalige (maar veilig herhaalbaar) opzet van de Dataverse-tabellen voor de
// tarieven-registratie: "Opdrachtbevestiging" (cr283_opdrachtbevestiging) en
// "Tarief" (cr283_tarief), zie de toelichting in het Offertetool-projectdocument
// (paragraaf "Tarieven-registratie in Dataverse") voor de volledige achtergrond
// en het schema-overzicht.
//
// Dit endpoint gebruikt dezelfde app-registratie/Application User als de rest
// van de tool (haalDataverseToken() uit ../_gedeeld/offertesOnboarding.js), maar het
// aanmaken van tabellen/kolommen/relaties vereist een bredere bevoegdheid dan
// waar die Application User tot nu toe voor is ingericht (lezen van Account +
// aanmaken van Task) — namelijk de systeemrol "System Customizer" (of hoger).
// Zie README.md, sectie "Tarieven-registratie in Dataverse opzetten" voor de
// stappen om die rol tijdelijk toe te kennen.
//
// Elke stap controleert eerst of het onderdeel al bestaat (op naam) voordat
// het wordt aangemaakt — dit endpoint is dus veilig meerdere keren aan te
// roepen (bijv. na een mislukte eerdere poging door ontbrekende rechten).
// Er wordt nooit iets verwijderd of overschreven.
// ---------------------------------------------------------------------------

const PREFIX = "cr283";
const TAAL = 1033; // Nederlands zou 1043 zijn, maar de rest van de omgeving (cr283_*) gebruikt
// doorgaans Engels/neutraal in de metadata-labels; de labels hieronder zijn gewoon Nederlands
// ingevuld, de taalcode bepaalt alleen onder welke taalvariant dat label wordt opgeslagen.

function label(tekst, beschrijving) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [
      {
        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
        Label: beschrijving ? beschrijving : tekst,
        LanguageCode: TAAL,
      },
    ],
  };
}

async function dv(token, resource, pad, opties = {}) {
  const res = await fetch(`${resource}/api/data/v9.2${pad}`, {
    ...opties,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...(opties.headers || {}),
    },
  });
  return res;
}

function verwerkFout(res, tekst) {
  if (res.status === 403) {
    return new Error(
      `Geen rechten (403) — de Application User heeft waarschijnlijk niet de systeemrol "System ` +
        `Customizer" (of hoger). Zie README.md voor de stappen om die tijdelijk toe te kennen. ` +
        `Details: ${tekst}`
    );
  }
  return new Error(`${tekst}`);
}

async function entiteitBestaat(token, resource, logicalName) {
  const res = await dv(
    token,
    resource,
    `/EntityDefinitions?$select=LogicalName&$filter=LogicalName eq '${logicalName}'`
  );
  if (!res.ok) throw verwerkFout(res, await res.text());
  const data = await res.json();
  return (data.value || []).length > 0;
}

async function maakEntiteit(token, resource, { logicalName, schemaName, weergavenaam, weergavenaamMeervoud, beschrijving, primaireAttribuutSchemaName, primaireAttribuutWeergavenaam, autoNumberFormat, primaireAttribuutMaxLength }) {
  if (await entiteitBestaat(token, resource, logicalName)) {
    return { actie: "bestond al", logicalName };
  }
  const primair = {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    AttributeType: "String",
    AttributeTypeName: { Value: "StringType" },
    SchemaName: primaireAttribuutSchemaName,
    IsPrimaryName: true,
    RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    MaxLength: primaireAttribuutMaxLength || 100,
    FormatName: { Value: "Text" },
    DisplayName: label(primaireAttribuutWeergavenaam),
  };
  if (autoNumberFormat) {
    primair.AutoNumberFormat = autoNumberFormat;
  }
  const body = {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: schemaName,
    OwnershipType: "UserOwned",
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    DisplayName: label(weergavenaam),
    DisplayCollectionName: label(weergavenaamMeervoud),
    Description: label(beschrijving),
    Attributes: [primair],
  };
  const res = await dv(token, resource, "/EntityDefinitions", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt", logicalName };
}

async function attribuutBestaat(token, resource, entityLogicalName, attributeLogicalName) {
  const res = await dv(
    token,
    resource,
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName&$filter=LogicalName eq '${attributeLogicalName}'`
  );
  if (!res.ok) throw verwerkFout(res, await res.text());
  const data = await res.json();
  return (data.value || []).length > 0;
}

async function maakAttribuut(token, resource, entityLogicalName, attributeLogicalName, metadata) {
  if (await attribuutBestaat(token, resource, entityLogicalName, attributeLogicalName)) {
    return { actie: "bestond al", attribuut: attributeLogicalName };
  }
  const res = await dv(token, resource, `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt", attribuut: attributeLogicalName };
}

async function relatieBestaat(token, resource, schemaName) {
  const res = await dv(
    token,
    resource,
    `/RelationshipDefinitions?$select=SchemaName&$filter=SchemaName eq '${schemaName}'`
  );
  if (!res.ok) throw verwerkFout(res, await res.text());
  const data = await res.json();
  return (data.value || []).length > 0;
}

// Maakt een N:1-lookup (met bijbehorende 1:N-relatie) van referencingEntity naar
// referencedEntity aan — dit maakt automatisch ook de lookup-kolom zelf aan.
async function maakLookupRelatie(token, resource, { schemaName, referencedEntity, referencingEntity, lookupSchemaName, weergavenaam, beschrijving }) {
  if (await relatieBestaat(token, resource, schemaName)) {
    return { actie: "bestond al", relatie: schemaName };
  }
  const body = {
    SchemaName: schemaName,
    "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    ReferencedEntity: referencedEntity,
    ReferencingEntity: referencingEntity,
    Lookup: {
      "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
      AttributeType: "Lookup",
      AttributeTypeName: { Value: "LookupType" },
      SchemaName: lookupSchemaName,
      DisplayName: label(weergavenaam),
      Description: label(beschrijving),
    },
  };
  const res = await dv(token, resource, "/RelationshipDefinitions", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw verwerkFout(res, await res.text());
  return { actie: "aangemaakt", relatie: schemaName };
}

async function publiceerAlles(token, resource) {
  const res = await dv(token, resource, "/PublishAllXml", { method: "POST", body: JSON.stringify({}) });
  if (!res.ok) {
    // Niet fataal voor de rest van de opzet — de tabellen/kolommen werken al via de API,
    // publiceren zorgt er alleen voor dat ze ook meteen overal in de maker-portal/UI
    // zichtbaar zijn. Wordt alleen gelogd, niet gegooid.
    return { actie: "publiceren mislukt", details: await res.text() };
  }
  return { actie: "gepubliceerd" };
}

module.exports = async function (context, req) {
  // CSRF-drempel, zelfde patroon als bij api/instellingen — voorkomt dat dit
  // (destructieve/structurele) endpoint via een cross-site formulier aangeroepen kan worden.
  if (req.headers["x-requested-with"] !== "offertetool") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldig verzoek." } };
    return;
  }
  // Extra, expliciete bevestiging vereist — dit endpoint wijzigt het Dataverse-schema
  // (nieuwe tabellen/kolommen/relaties). Nooit "per ongeluk" via alleen inloggen bereikbaar.
  if (req.query.bevestig !== "ja") {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Voeg ?bevestig=ja toe aan de aanroep om te bevestigen dat je het Dataverse-schema wilt aanmaken/bijwerken." },
    };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "Dynamics-koppeling is nog niet geconfigureerd (ontbrekende Application Settings)." },
    };
    return;
  }

  const stappen = [];
  try {
    const token = await haalDataverseToken();

    // ---- Tabel 1: Opdrachtbevestiging ----
    stappen.push(
      await maakEntiteit(token, resource, {
        logicalName: `${PREFIX}_opdrachtbevestiging`,
        schemaName: `${PREFIX}_Opdrachtbevestiging`,
        weergavenaam: "Opdrachtbevestiging",
        weergavenaamMeervoud: "Opdrachtbevestigingen",
        beschrijving: "Eén ondertekende opdrachtbevestiging per klant, met een uniek kenmerk — gebruikt om tarieven en herbevestigingen/tariefswijzigingen aan te koppelen.",
        primaireAttribuutSchemaName: `${PREFIX}_Kenmerk`,
        primaireAttribuutWeergavenaam: "Kenmerk",
        primaireAttribuutMaxLength: 100,
        autoNumberFormat: "OB-{SEQNUM:00000}",
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_opdrachtbevestiging`, `${PREFIX}_datum`, {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        AttributeType: "DateTime",
        AttributeTypeName: { Value: "DateTimeType" },
        SchemaName: `${PREFIX}_Datum`,
        DisplayName: label("Datum ondertekend"),
        Description: label("Datum waarop deze opdrachtbevestiging is ondertekend (akkoord)."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        Format: "DateOnly",
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_opdrachtbevestiging`, `${PREFIX}_opdrachttype`, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        AttributeType: "String",
        AttributeTypeName: { Value: "StringType" },
        SchemaName: `${PREFIX}_Opdrachttype`,
        DisplayName: label("Opdrachttype (NV COS)"),
        Description: label("Naam van het gekozen NV COS-opdrachttype."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        MaxLength: 200,
        FormatName: { Value: "Text" },
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_opdrachtbevestiging`, `${PREFIX}_omschrijving`, {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        AttributeType: "Memo",
        AttributeTypeName: { Value: "MemoType" },
        SchemaName: `${PREFIX}_Omschrijving`,
        DisplayName: label("Wat ze afnemen"),
        Description: label("Samengevoegde omschrijving van de gekozen diensten op deze opdrachtbevestiging."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        MaxLength: 4000,
        Format: "TextArea",
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_opdrachtbevestiging`, `${PREFIX}_totaalbedrag`, {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        AttributeType: "Money",
        AttributeTypeName: { Value: "MoneyType" },
        SchemaName: `${PREFIX}_Totaalbedrag`,
        DisplayName: label("Totaalbedrag (ex btw)"),
        Description: label("Som van alle tariefregels op deze opdrachtbevestiging, exclusief btw."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        PrecisionSource: 2,
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_opdrachtbevestiging`, `${PREFIX}_appid`, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        AttributeType: "String",
        AttributeTypeName: { Value: "StringType" },
        SchemaName: `${PREFIX}_Appid`,
        DisplayName: label("App-record-ID"),
        Description: label("Intern ID van het opdrachtbevestiging-record in de offertetool zelf (voor terugkoppeling)."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        MaxLength: 100,
        FormatName: { Value: "Text" },
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_opdrachtbevestiging`, `${PREFIX}_documenturl`, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        AttributeType: "String",
        AttributeTypeName: { Value: "StringType" },
        SchemaName: `${PREFIX}_Documenturl`,
        DisplayName: label("Link naar ondertekend document"),
        Description: label("SharePoint-link naar de ondertekende PDF, indien beschikbaar."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        MaxLength: 500,
        FormatName: { Value: "Url" },
      })
    );

    // ---- Tabel 2: Tarief ----
    stappen.push(
      await maakEntiteit(token, resource, {
        logicalName: `${PREFIX}_tarief`,
        schemaName: `${PREFIX}_Tarief`,
        weergavenaam: "Tarief",
        weergavenaamMeervoud: "Tarieven",
        beschrijving: "Eén tariefregel per gekozen dienst op een opdrachtbevestiging, met een eigen looptijd (van/tot en met).",
        primaireAttribuutSchemaName: `${PREFIX}_Dienstomschrijving`,
        primaireAttribuutWeergavenaam: "Dienstomschrijving",
        primaireAttribuutMaxLength: 200,
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_tarief`, `${PREFIX}_prijs`, {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        AttributeType: "Money",
        AttributeTypeName: { Value: "MoneyType" },
        SchemaName: `${PREFIX}_Prijs`,
        DisplayName: label("Prijs"),
        Description: label("Prijs van deze dienst op het moment van ondertekenen."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        PrecisionSource: 2,
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_tarief`, `${PREFIX}_eenheid`, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        AttributeType: "String",
        AttributeTypeName: { Value: "StringType" },
        SchemaName: `${PREFIX}_Eenheid`,
        DisplayName: label("Eenheid"),
        Description: label("Bijv. 'maand', 'traject', 'aangifte'."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        MaxLength: 100,
        FormatName: { Value: "Text" },
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_tarief`, `${PREFIX}_aantal`, {
        "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
        AttributeType: "Decimal",
        AttributeTypeName: { Value: "DecimalType" },
        SchemaName: `${PREFIX}_Aantal`,
        DisplayName: label("Aantal"),
        Description: label("Aantal/factor zoals gekozen op de opdrachtbevestiging."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        MinValue: 0,
        MaxValue: 999999,
        Precision: 2,
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_tarief`, `${PREFIX}_categorie`, {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        AttributeType: "Picklist",
        AttributeTypeName: { Value: "PicklistType" },
        SchemaName: `${PREFIX}_Categorie`,
        DisplayName: label("Categorie"),
        Description: label("Eenmalig of doorlopend, zoals in de dienstencatalogus."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        // Value bewust weggelaten (niet 0/1) — Dataverse wijst dan zelf een geldige waarde
        // toe binnen het juiste publisher-bereik, veiliger dan zelf een getal verzinnen.
        OptionSet: {
          "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
          IsGlobal: false,
          OptionSetType: "Picklist",
          Options: [{ Label: label("Eenmalig") }, { Label: label("Doorlopend") }],
        },
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_tarief`, `${PREFIX}_looptijdvan`, {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        AttributeType: "DateTime",
        AttributeTypeName: { Value: "DateTimeType" },
        SchemaName: `${PREFIX}_Looptijdvan`,
        DisplayName: label("Looptijd van"),
        Description: label("Eerste dag dat dit tarief geldt."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        Format: "DateOnly",
      })
    );
    stappen.push(
      await maakAttribuut(token, resource, `${PREFIX}_tarief`, `${PREFIX}_looptijdtotenmet`, {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        AttributeType: "DateTime",
        AttributeTypeName: { Value: "DateTimeType" },
        SchemaName: `${PREFIX}_Looptijdtotenmet`,
        DisplayName: label("Looptijd tot en met"),
        Description: label("Laatste dag dat dit tarief geldt — leeg = nog actief/geen einddatum."),
        RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
        Format: "DateOnly",
      })
    );

    // ---- Relaties (maken meteen ook de lookup-kolommen aan) ----
    stappen.push(
      await maakLookupRelatie(token, resource, {
        schemaName: `${PREFIX}_account_opdrachtbevestiging`,
        referencedEntity: "account",
        referencingEntity: `${PREFIX}_opdrachtbevestiging`,
        lookupSchemaName: `${PREFIX}_Klant`,
        weergavenaam: "Klant",
        beschrijving: "De klant (Dynamics-account) waarvoor deze opdrachtbevestiging is opgesteld.",
      })
    );
    stappen.push(
      await maakLookupRelatie(token, resource, {
        schemaName: `${PREFIX}_opdrachtbevestiging_herbevestigingvan`,
        referencedEntity: `${PREFIX}_opdrachtbevestiging`,
        referencingEntity: `${PREFIX}_opdrachtbevestiging`,
        lookupSchemaName: `${PREFIX}_Herbevestigingvan`,
        weergavenaam: "Herbevestiging van",
        beschrijving: "Verwijzing naar de vorige opdrachtbevestiging als dit een herbevestiging/tariefswijziging is.",
      })
    );
    stappen.push(
      await maakLookupRelatie(token, resource, {
        schemaName: `${PREFIX}_opdrachtbevestiging_tarief`,
        referencedEntity: `${PREFIX}_opdrachtbevestiging`,
        referencingEntity: `${PREFIX}_tarief`,
        lookupSchemaName: `${PREFIX}_Opdrachtbevestiging`,
        weergavenaam: "Opdrachtbevestiging",
        beschrijving: "De opdrachtbevestiging waar dit tarief bij hoort.",
      })
    );
    stappen.push(
      await maakLookupRelatie(token, resource, {
        schemaName: `${PREFIX}_account_tarief`,
        referencedEntity: "account",
        referencingEntity: `${PREFIX}_tarief`,
        lookupSchemaName: `${PREFIX}_Klant`,
        weergavenaam: "Klant",
        beschrijving: "Directe koppeling naar de klant, zodat 'actieve tarieven' rechtstreeks op het klant-formulier te bekijken zijn.",
      })
    );

    stappen.push(await publiceerAlles(token, resource));

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        ok: true,
        stappen,
        volgende: [
          "Open in de Power Apps-portal (make.powerapps.com) de tabel 'Opdrachtbevestiging' en 'Tarief' om te controleren.",
          "Voeg op het Account-formulier (klant) een subgrid/gerelateerde-records-weergave toe voor 'Tarieven' " +
            "— filter eventueel op 'Looptijd tot en met is leeg OF op/na vandaag' voor een 'actieve tarieven'-overzicht.",
          "Zet de systeemrol van de Application User terug naar de oorspronkelijke (minimale) rol, " +
            "System Customizer was alleen nodig voor deze eenmalige opzet.",
          "Zet in het Instellingen-scherm, sectie 'Opdrachtbevestiging — tarieven naar Dataverse', de schakelaar " +
            "'Tarieven wegschrijven bij ondertekening' aan.",
        ],
      },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { ok: false, error: err.message, tot_nu_toe: stappen },
    };
  }
};
