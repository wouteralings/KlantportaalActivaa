/**
 * /api/medewerker-dossiers?soort=ib|vpb — alle fiscale dossiers van één soort over ALLE cliënten,
 * voor het medewerkersportaal (Klantoverzicht → tab Inkomstenbelasting / Vennootschapsbelasting).
 *
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder'). Geen
 * klant-filter: een medewerker ziet in één lijst per soort wat er open staat en bij wie het ligt.
 * Deelt de query/veldnamen met de klantweergave via api/_gedeeld/dossiers.js. Stuurt ook de
 * status-keuzelijst (statusOpties) mee, zodat het bewerken van een dossier de juiste opties toont.
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { SOORTEN, haalDossiersVoorSoort } = require("../_gedeeld/dossiers");

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  const soortKey = (req.query && req.query.soort) || "";
  const soort = SOORTEN.find((s) => s.key === soortKey);
  if (!soort) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldige 'soort' mee (ib of vpb)." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    // Geen accountIds → alle cliënten.
    const dossiers = await haalDossiersVoorSoort(resource, token, soort, undefined);

    dossiers.sort((a, b) => {
      const sa = a.jaar != null && a.jaar !== "" ? Number(a.jaar) || 0 : (a.begindatum ? new Date(a.begindatum).getTime() || 0 : 0);
      const sb = b.jaar != null && b.jaar !== "" ? Number(b.jaar) || 0 : (b.begindatum ? new Date(b.begindatum).getTime() || 0 : 0);
      if (sb !== sa) return sb - sa; // nieuwste jaar/boekjaar eerst
      return (a.klantnaam || "").localeCompare(b.klantnaam || "");
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: { soort: soort.key, dossiers, statusOpties: soort.statusOpties } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Er ging iets mis bij het ophalen van de dossiers.", detail: String(err.message || err) } };
  }
};
