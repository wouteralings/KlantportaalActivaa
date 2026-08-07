/**
 * /api/beheer-dynamics-metadata — leest de Dataverse-metadata voor het koppelen van een
 * uitvraag-vraag aan een Dynamics-tabel + kolom (Uitvraag Fase B). Beheerder-only (route in
 * staticwebapp.config.json).
 *
 *   GET                       → { tabellen: [{ logicalName, entitySet, label }] }
 *   GET ?tabel=<logicalName>  → { kolommen: [{ logicalName, label, type, vraagtype }] }
 *   GET ?tabel=..&kolom=..    → { opties: [{ waarde, label }] }   (voor een keuzelijst-kolom)
 *
 * De metadata verandert zelden; de beheer-UI vraagt tabellen 1× op en kolommen per gekozen tabel.
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalTabellen, haalKolommen, haalKolomOpties } = require("../_gedeeld/dynamicsMetadata");

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd.", configuratieNodig: true } };
    return;
  }
  try {
    const token = await haalDynamicsToken();
    const tabel = req.query && req.query.tabel;
    const kolom = req.query && req.query.kolom;

    if (tabel && kolom) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { opties: await haalKolomOpties(resource, token, tabel, kolom) } };
      return;
    }
    if (tabel) {
      context.res = { headers: { "Content-Type": "application/json" }, body: { kolommen: await haalKolommen(resource, token, tabel) } };
      return;
    }
    context.res = { headers: { "Content-Type": "application/json" }, body: { tabellen: await haalTabellen(resource, token) } };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Kon de Dynamics-metadata niet ophalen.", detail: String(err.message || err) },
    };
  }
};
