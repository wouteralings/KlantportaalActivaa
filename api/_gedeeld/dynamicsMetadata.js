/**
 * Leest Dataverse-metadata (tabellen, kolommen, optieset-opties) voor de "Koppel een uitvraag-vraag
 * aan een Dynamics-tabel + kolom"-functie (Uitvraag Fase B). Gebruikt door /api/beheer-dynamics-
 * metadata (beheerder kiest tabel/kolom) en gespiegeld door de writeback (dynamicsAntwoordWriteback.js).
 *
 * Zelfde token/headers als de rest van de Dynamics-koppeling (haalDynamicsToken).
 */

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  "Content-Type": "application/json",
});

// AttributeType (Dataverse) → vraagtype in de uitvraag. Alleen deze typen ondersteunen we voor
// wegschrijven; overige (lookups, uniqueidentifier, virtuele velden, multiselect) laten we bewust
// weg uit de kolomkeuze zodat je niet iets kunt kiezen dat we (nog) niet betrouwbaar kunnen vullen.
const TYPE_NAAR_VRAAGTYPE = {
  String: "open",
  Memo: "open",
  Boolean: "janee",
  Integer: "getal",
  BigInt: "getal",
  Decimal: "getal",
  Double: "getal",
  Money: "getal",
  DateTime: "datum",
  Picklist: "keuze",
};

/** Alle niet-private tabellen met een leesbaar label — voor de tabel-dropdown. */
async function haalTabellen(resource, token) {
  const url =
    `${resource}/api/data/v9.2/EntityDefinitions` +
    `?$select=LogicalName,EntitySetName,DisplayName&$filter=IsPrivate eq false`;
  const res = await fetch(url, { headers: HEADERS(token) });
  if (!res.ok) throw new Error(`Tabellen ophalen mislukt: ${await res.text()}`);
  const data = await res.json();
  return (data.value || [])
    .map((e) => ({
      logicalName: e.LogicalName,
      entitySet: e.EntitySetName || "",
      label: (e.DisplayName && e.DisplayName.UserLocalizedLabel && e.DisplayName.UserLocalizedLabel.Label) || "",
    }))
    .filter((e) => e.label && e.entitySet)
    .sort((a, b) => a.label.localeCompare(b.label, "nl", { sensitivity: "base" }));
}

/** De schrijfbare kolommen van één tabel die we ondersteunen, met hun afgeleide vraagtype. */
async function haalKolommen(resource, token, tabel) {
  const veilig = String(tabel).replace(/'/g, "''");
  const url =
    `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(veilig)}')/Attributes` +
    `?$select=LogicalName,DisplayName,AttributeType,IsValidForUpdate`;
  const res = await fetch(url, { headers: HEADERS(token) });
  if (!res.ok) throw new Error(`Kolommen ophalen mislukt: ${await res.text()}`);
  const data = await res.json();
  return (data.value || [])
    .filter((a) => TYPE_NAAR_VRAAGTYPE[a.AttributeType])
    .filter((a) => !a.IsValidForUpdate || a.IsValidForUpdate.Value !== false)
    .map((a) => ({
      logicalName: a.LogicalName,
      label: (a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label) || a.LogicalName,
      type: a.AttributeType,
      vraagtype: TYPE_NAAR_VRAAGTYPE[a.AttributeType],
    }))
    .filter((a) => a.label)
    .sort((a, b) => a.label.localeCompare(b.label, "nl", { sensitivity: "base" }));
}

/** De opties (waarde + label) van een keuzelijst-kolom (Picklist). */
async function haalKolomOpties(resource, token, tabel, kolom) {
  const veilig = String(tabel).replace(/'/g, "''");
  const veiligK = String(kolom).replace(/'/g, "''");
  const basis = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(veilig)}')/Attributes(LogicalName='${encodeURIComponent(veiligK)}')`;
  const url = `${basis}/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet`;
  const res = await fetch(url, { headers: HEADERS(token) });
  if (!res.ok) throw new Error(`Opties ophalen mislukt: ${await res.text()}`);
  const data = await res.json();
  return ((data.OptionSet && data.OptionSet.Options) || []).map((o) => ({
    waarde: o.Value,
    label: (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value),
  }));
}

module.exports = { HEADERS, TYPE_NAAR_VRAAGTYPE, haalTabellen, haalKolommen, haalKolomOpties };
