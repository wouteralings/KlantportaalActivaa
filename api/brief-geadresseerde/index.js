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
 * adresvelden er heuristisch uit (standaard address1_*-velden óf afwijkende/custom veldnamen).
 *
 *   GET ?accountId=<guid>
 *     → { gekoppeld: true, naam, adres: { straat, huisnummer, toevoeging, postcode, plaats } }
 *       of { gekoppeld: false }
 *
 * App Setting: DYNAMICS_KLANT_BELASTINGKANTOOR_VELD (default `cr283_belastingkantoor`).
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");

const ATTR = process.env.DYNAMICS_KLANT_BELASTINGKANTOOR_VELD || "cr283_belastingkantoor";
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

/** Pikt adresvelden uit een record: eerst de standaard address1_*-velden, anders heuristisch. */
function leesAdres(rec) {
  const keys = Object.keys(rec).filter((k) => !k.includes("@") && !k.startsWith("_") && !/_value$/.test(k) && typeof rec[k] !== "object");
  const vind = (exacte, patronen, uitsluit = []) => {
    for (const e of exacte) if (rec[e] != null && String(rec[e]).trim() !== "") return String(rec[e]).trim();
    for (const k of keys) {
      const lk = k.toLowerCase();
      if (uitsluit.some((u) => lk.includes(u))) continue;
      if (patronen.some((p) => lk.includes(p)) && rec[k] != null && String(rec[k]).trim() !== "") return String(rec[k]).trim();
    }
    return "";
  };
  return {
    straat: vind(["address1_line1"], ["straat", "street", "line1", "adresregel"], ["email", "web"]),
    huisnummer: vind(["cr283_huisnummer"], ["huisnummer", "housenumber", "huisnr"]),
    toevoeging: vind(["cr283_huisnummertoevoeging"], ["toevoeging"]),
    postcode: vind(["address1_postalcode"], ["postcode", "postalcode", "postal", "zip"]),
    plaats: vind(["address1_city"], ["city", "plaats", "woonplaats", "stad"], ["postal"]),
  };
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

  try {
    const token = await haalDynamicsToken();

    // 1) Lookup-waarde + doeltabel (lookuplogicalname) + leesbare naam (FormattedValue) van de klant.
    const res1 = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=_${ATTR}_value`, { headers: baseHeaders(token, true) });
    if (!res1.ok) throw new Error(`Ophalen klant mislukt (${res1.status}): ${await res1.text()}`);
    const acc = await res1.json();
    const kantoorId = acc[`_${ATTR}_value`];
    if (!kantoorId) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { gekoppeld: false } };
      return;
    }
    const doelEntiteit = acc[`_${ATTR}_value${LLN}`] || "";
    const naamFallback = acc[`_${ATTR}_value${FV}`] || "";

    // 2) Collectienaam + primaire naam van de doeltabel opzoeken.
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

    // 3) Het belastingkantoor-record volledig ophalen en adres eruit lezen.
    const resR = await fetch(`${resource}/api/data/v9.2/${entitySet}(${kantoorId})`, { headers: baseHeaders(token, false) });
    if (!resR.ok) throw new Error(`Ophalen belastingkantoor mislukt (${resR.status}): ${await resR.text()}`);
    const rec = await resR.json();
    const naam = (primaryName && rec[primaryName]) || rec.name || naamFallback || "";
    const adres = leesAdres(rec);

    context.res = { headers: { "Content-Type": "application/json" }, body: { gekoppeld: true, naam, adres } };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Kon het belastingkantoor niet ophalen. Controleer of de app leesrechten op de belastingkantoren-tabel heeft en of DYNAMICS_KLANT_BELASTINGKANTOOR_VELD klopt.", detail: String(err) },
    };
  }
};
