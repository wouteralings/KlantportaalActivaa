/**
 * /api/brief-geadresseerde?accountId=<guid> — het adres van het BELASTINGKANTOOR dat via de lookup
 * aan de klant hangt in Dynamics. Rol beheerder + medewerker (route in staticwebapp.config.json).
 *
 * De medewerker kan in de Brieven-tab bij de geadresseerde kiezen tussen "klant", "belastingkantoor"
 * of "overig". Voor "belastingkantoor" halen we het adres hier op uit de belastingkantoren-tabel.
 *
 * Robuuste aanpak (geen navigatienaam nodig): we lezen op de klant het lookup-veld
 * (standaard `cr283_belastingkantoor`), volgen de `lookuplogicalname`-annotatie naar de doeltabel,
 * halen daarvan de collectienaam op via de metadata, lezen het record volledig en pikken de
 * adresvelden er heuristisch uit. Omdat de belastingkantoren-tabel een eigen tabel is met mogelijk
 * afwijkende kolomnamen, matchen we niet alleen op de technische veldnaam maar ook op het
 * NL-schermlabel (bv. "Straat", "Adres") dat we uit de attribuut-metadata ophalen.
 *
 *   GET ?accountId=<guid>
 *     → { gekoppeld: true, naam, adres: { straat, huisnummer, toevoeging, postcode, plaats } }
 *       of { gekoppeld: false }
 *   GET ?accountId=<guid>&debug=1
 *     → als boven, plus `_debug` met alle scalaire velden + labels van het kantoorrecord (om een
 *       afwijkende veldnaam op te sporen).
 *
 * App Setting: DYNAMICS_KLANT_BELASTINGKANTOOR_VELD (default `cr283_belastingkantoor`).
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");

const ATTR = process.env.DYNAMICS_KLANT_BELASTINGKANTOOR_VELD || "cr283_belastingkantoor";
// Adresveld waar het Belastingdienst-/antwoordadres als tekst in staat. Kan op de klant (account)
// staan of op het belastingkantoor-record; we proberen beide. Instelbaar via App Setting.
const ANTWOORD_VELD = process.env.DYNAMICS_ANTWOORDADRES_VELD || "cr283_antwoordadres";
const FV = "@OData.Community.Display.V1.FormattedValue";
const LLN = "@Microsoft.Dynamics.CRM.lookuplogicalname";
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function baseHeaders(token, annotaties) {
  const h = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
  if (annotaties) h.Prefer = 'odata.include-annotations="*"';
  return h;
}

/** Haalt per attribuut het (kleine-letter) NL-schermlabel op voor de doeltabel. Best-effort: bij
 *  een fout een lege map, dan matchen we alleen op technische veldnaam. */
async function haalVeldLabels(resource, token, logicalName) {
  if (!logicalName) return {};
  try {
    const url = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,DisplayName`;
    const res = await fetch(url, { headers: baseHeaders(token, false) });
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const a of data.value || []) {
      const lbl = a && a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label;
      if (a && a.LogicalName) map[a.LogicalName] = String(lbl || "").trim().toLowerCase();
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Pikt de adresvelden uit een kantoorrecord. Per adresdeel proberen we een reeks matchers op
 * volgorde (eerst de standaard address1_*-velden, dan technische naam- én labelvarianten). We kijken
 * alleen naar gevulde, scalaire (tekst)velden en slaan e-mail/telefoon/land e.d. over.
 */
function leesAdres(rec, labels) {
  labels = labels || {};
  const velden = Object.keys(rec).filter(
    (k) =>
      !k.includes("@") &&
      !k.startsWith("_") &&
      !/_value$/.test(k) &&
      rec[k] != null &&
      typeof rec[k] !== "object" &&
      String(rec[k]).trim() !== ""
  );
  const waarde = (k) => String(rec[k]).trim();
  const labelVan = (k) => labels[k] || "";

  // Kies het eerste veld waarvoor één van de matchers waar is; sla velden met een verboden term
  // (in naam óf label) over. Matchers krijgen (technischeNaam, label), beide in kleine letters.
  const kies = (matchers, verboden = []) => {
    for (const match of matchers) {
      for (const k of velden) {
        const lk = k.toLowerCase();
        const lb = labelVan(k);
        if (verboden.some((v) => lk.includes(v) || lb.includes(v))) continue;
        if (match(lk, lb)) return waarde(k);
      }
    }
    return "";
  };
  const isVeld = (naam) => (lk) => lk === naam; // exacte technische veldnaam
  const labelIs = (s) => (_lk, lb) => lb === s; // exact schermlabel
  const bevat = (s) => (lk, lb) => lk.includes(s) || lb.includes(s); // in naam of label

  const nietStraat = ["postcode", "postal", "zip", "email", "e-mail", "mail", "web", "url", "land", "country", "telefoon", "phone", "kvk"];
  const nietPlaats = ["postcode", "postal", "zip"];

  return {
    straat: kies(
      [
        isVeld("address1_line1"),
        bevat("straat"),
        bevat("street"),
        labelIs("adres"),
        bevat("adresregel"),
        bevat("line1"),
        labelIs("bezoekadres"),
        labelIs("vestigingsadres"),
      ],
      nietStraat
    ),
    huisnummer: kies(
      [isVeld("cr283_huisnummer"), bevat("huisnummer"), bevat("huisnr"), bevat("housenumber")],
      ["toevoeging", "postcode", "postal"]
    ),
    toevoeging: kies([isVeld("cr283_huisnummertoevoeging"), bevat("toevoeging")]),
    postcode: kies([isVeld("address1_postalcode"), bevat("postcode"), bevat("postalcode"), bevat("postal"), bevat("zip")]),
    plaats: kies([isVeld("address1_city"), bevat("city"), bevat("plaats"), labelIs("stad"), bevat("gemeente")], nietPlaats),
  };
}

/** Leest (best-effort) het antwoordadres-tekstveld rechtstreeks van het account. Bestaat het veld
 *  niet (400) of is het leeg, dan een lege string. */
async function leesAntwoordadresVanAccount(resource, token, accountId) {
  try {
    const res = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=${ANTWOORD_VELD}`, { headers: baseHeaders(token, false) });
    if (!res.ok) return "";
    const j = await res.json();
    const v = j[ANTWOORD_VELD];
    return v == null ? "" : String(v).trim();
  } catch {
    return "";
  }
}

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
  const debug = String((req.query && req.query.debug) || "") === "1";

  try {
    const token = await haalDynamicsToken();

    // 1) Lookup-waarde + doeltabel (lookuplogicalname) + leesbare naam (FormattedValue) van de klant.
    const res1 = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=_${ATTR}_value`, { headers: baseHeaders(token, true) });
    if (!res1.ok) throw new Error(`Ophalen klant mislukt (${res1.status}): ${await res1.text()}`);
    const acc = await res1.json();

    // Staat het antwoordadres rechtstreeks als tekst op de klant? Dan is dát het Belastingdienst-adres
    // (ongeacht of er een belastingkantoor-lookup is). Als meerregelige tekst teruggegeven via adresTekst.
    const accountAntwoord = await leesAntwoordadresVanAccount(resource, token, accountId);
    if (accountAntwoord) {
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { gekoppeld: true, naam: acc[`_${ATTR}_value${FV}`] || "Belastingdienst", adresTekst: accountAntwoord, adres: { straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "" } },
      };
      return;
    }

    const kantoorId = acc[`_${ATTR}_value`];
    if (!kantoorId) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { gekoppeld: false } };
      return;
    }
    const doelEntiteit = acc[`_${ATTR}_value${LLN}`] || "";
    const naamFallback = acc[`_${ATTR}_value${FV}`] || "";

    // 2) Collectienaam + primaire naam van de doeltabel opzoeken, plus de veld-labels (best-effort).
    let entitySet = "", primaryName = "name";
    if (doelEntiteit) {
      const resM = await fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${doelEntiteit}')?$select=EntitySetName,PrimaryNameAttribute`, { headers: baseHeaders(token, false) });
      if (resM.ok) { const m = await resM.json(); entitySet = m.EntitySetName || ""; primaryName = m.PrimaryNameAttribute || "name"; }
    }
    if (!entitySet) {
      // Zonder collectienaam kunnen we het record niet ophalen; val terug op alleen de naam.
      context.res = { headers: { "Content-Type": "application/json" }, body: { gekoppeld: true, naam: naamFallback, adres: { straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "" } } };
      return;
    }
    const labels = await haalVeldLabels(resource, token, doelEntiteit);

    // 3) Het belastingkantoor-record volledig ophalen en adres eruit lezen.
    const resR = await fetch(`${resource}/api/data/v9.2/${entitySet}(${kantoorId})`, { headers: baseHeaders(token, false) });
    if (!resR.ok) throw new Error(`Ophalen belastingkantoor mislukt (${resR.status}): ${await resR.text()}`);
    const rec = await resR.json();
    const naam = (primaryName && rec[primaryName]) || rec.name || naamFallback || "";
    // Antwoordadres als tekstveld op het belastingkantoor-record? Dan dat gebruiken (via adresTekst).
    const antwoordVanKantoor = rec[ANTWOORD_VELD] != null ? String(rec[ANTWOORD_VELD]).trim() : "";
    const adres = leesAdres(rec, labels);

    const body = { gekoppeld: true, naam, adres };
    if (antwoordVanKantoor) body.adresTekst = antwoordVanKantoor;
    if (debug) {
      const scalair = {};
      for (const k of Object.keys(rec)) {
        if (!k.includes("@") && !/_value$/.test(k) && rec[k] != null && typeof rec[k] !== "object" && String(rec[k]).trim() !== "") {
          scalair[k] = { waarde: rec[k], label: labels[k] || "" };
        }
      }
      body._debug = { entiteit: doelEntiteit, entitySet, velden: scalair };
    }
    context.res = { headers: { "Content-Type": "application/json" }, body };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Kon het belastingkantoor niet ophalen. Controleer of de app leesrechten op de belastingkantoren-tabel heeft en of DYNAMICS_KLANT_BELASTINGKANTOOR_VELD klopt.", detail: String(err) },
    };
  }
};
