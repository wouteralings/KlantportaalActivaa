/**
 * /api/dossier-lookup-zoeken?doel=account|contact|systemuser&q=... — zoekt records van de doel-entiteit
 * van een dossier-lookupveld, voor de zoek-kiezer in het medewerkersdossier (een via Beheer → Dossiers
 * "Bestaande kolom toevoegen" opgenomen lookup, bv. voorzitter/notulist/aandeelhouder). Alleen de
 * gangbare doelen (account/contact/systemuser) zijn toegestaan — géén vrije entiteit-query.
 *
 *   GET → { doel, resultaten: [{ id, naam }] }
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalRollenUitPrincipal, haalDynamicsToken } = require("../_gedeeld/identiteit");

// Toegestane doel-entiteiten met hun verzamelnaam, weergavenaam-veld, id-veld en actief-filter.
const DOELEN = {
  account:    { set: "accounts",    naam: "name",     id: "accountid",    filter: "statecode eq 0" },
  contact:    { set: "contacts",    naam: "fullname", id: "contactid",    filter: "statecode eq 0" },
  systemuser: { set: "systemusers", naam: "fullname", id: "systemuserid", filter: "isdisabled eq false" },
};

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const doelKey = (req.query && req.query.doel) || "";
  const cfg = DOELEN[doelKey];
  if (!cfg) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekend of niet-ondersteund doel (alleen account/contact/systemuser)." } }; return; }

  // Zoekterm: single quotes verdubbelen (OData-escape), lengte begrensd.
  const q = String((req.query && req.query.q) || "").trim().slice(0, 100).replace(/'/g, "''");

  try {
    const token = await haalDynamicsToken();
    const filters = [cfg.filter];
    if (q) filters.push(`contains(${cfg.naam},'${q}')`);
    const url = `${resource}/api/data/v9.2/${cfg.set}?$select=${cfg.naam}&$filter=${encodeURIComponent(filters.join(" and "))}&$orderby=${cfg.naam}&$top=25`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!res.ok) throw new Error(`Zoeken mislukt (${res.status}): ${await res.text()}`);
    const rijen = (await res.json()).value || [];
    const resultaten = rijen.map((r) => ({ id: r[cfg.id], naam: r[cfg.naam] || "" })).filter((r) => r.id);
    context.res = { headers: { "Content-Type": "application/json" }, body: { doel: doelKey, resultaten } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Zoeken is mislukt.", detail: String(err.message || err) } };
  }
};
