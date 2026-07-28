const { haalDynamicsToken } = require("../_gedeeld/identiteit");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 * Zoekt contactpersonen op naam voor het kiezen van een primaire/secundaire contactpersoon.
 * GET ?zoek=<term> → { contacten: [{ id, naam, email }] } (max 20).
 */
module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }
  try {
    const zoek = (req.query.zoek || "").trim();
    if (zoek.length < 2) { context.res = { headers: { "Content-Type": "application/json" }, body: { contacten: [] } }; return; }
    const token = await haalDynamicsToken();
    const veilig = zoek.replace(/'/g, "''");
    const url = `${resource}/api/data/v9.2/contacts?$select=contactid,fullname,emailaddress1&$filter=contains(fullname,'${encodeURIComponent(veilig)}') and statecode eq 0&$top=20&$orderby=fullname asc`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!r.ok) throw new Error(`Contacten zoeken mislukt (${r.status}): ${await r.text()}`);
    const d = await r.json();
    const contacten = (d.value || []).map((c) => ({ id: c.contactid, naam: c.fullname || "", email: c.emailaddress1 || "" }));
    context.res = { headers: { "Content-Type": "application/json" }, body: { contacten } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon contacten niet zoeken.", detail: String(err) } };
  }
};
