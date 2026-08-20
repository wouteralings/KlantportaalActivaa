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
    const url = `${resource}/api/data/v9.2/contacts?$select=contactid,fullname,firstname,middlename,lastname,emailaddress1,address1_line1,cr283_huisnummer,cr283_huisnummertoevoeging,address1_postalcode,address1_city,address1_country&$filter=contains(fullname,'${encodeURIComponent(veilig)}') and statecode eq 0&$top=20&$orderby=fullname asc`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!r.ok) throw new Error(`Contacten zoeken mislukt (${r.status}): ${await r.text()}`);
    const d = await r.json();
    // Naam- en adresdelen gaan mee omdat een formulier ze soms apart uitvraagt — het KvK-formulier
    // 17a wil bijvoorbeeld achternaam, voornamen en woonadres los van elkaar. Voor schermen die
    // alleen de volledige naam gebruiken verandert er niets.
    const contacten = (d.value || []).map((c) => ({
      id: c.contactid,
      naam: c.fullname || "",
      voornaam: c.firstname || "",
      tussenvoegsel: c.middlename || "",
      achternaam: c.lastname || "",
      email: c.emailaddress1 || "",
      adres: {
        straat: c.address1_line1 || "",
        huisnummer: c.cr283_huisnummer || "",
        toevoeging: c.cr283_huisnummertoevoeging || "",
        postcode: c.address1_postalcode || "",
        plaats: c.address1_city || "",
        land: c.address1_country || "",
      },
    }));
    context.res = { headers: { "Content-Type": "application/json" }, body: { contacten } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon contacten niet zoeken.", detail: String(err) } };
  }
};
