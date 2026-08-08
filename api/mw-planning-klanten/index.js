/**
 * /api/mw-planning-klanten — CRUD op de planningsregels (dbo.planning_klanten), medewerkerskant
 * (Planningsmodule Stap 2). Beveiligd via staticwebapp.config.json (rol 'beheerder'/'medewerker')
 * én, fijnmaziger, via het granulaire "Planning"-recht (metPlanningRecht).
 *
 * De planning is medewerker-breed (geen per-klant aan/uit): de klant-account-id wordt in de body/
 * query meegegeven (voor welke klant de regel is). Verwijderen mag hier wél — interne werkdata.
 *
 *   GET  ?accountId=...            → { regels: [...] } (planning van één klant)
 *   POST body { klantAccountId, activiteit, type, periode, deadline, status, toegewezenAan, indicatieUren, opmerkingen }
 *   PUT  body { id, ... }          → gewijzigde regel
 *   DELETE ?id=... (of body { id })→ { verwijderd: true }
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { metPlanningRecht } = require("../_gedeeld/planningRecht");
const { haalVoorKlant, maakRegel, wijzigRegel, verwijderRegel } = require("../_gedeeld/planningKlanten");

function afhandelFout(context, err) {
  if (err.message === "MISSING_CONFIG") {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "FACTURATIE_SQL_CONNECTIONSTRING of STORAGE_CONNECTION_STRING ontbreekt." } };
    return;
  }
  if (String(err.message || "").startsWith("VALIDATIE:")) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message.replace(/^VALIDATIE:\s*/, "") } };
    return;
  }
  context.log && context.log.error && context.log.error(err);
  context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Er ging iets mis. Probeer het later opnieuw.", detail: String(err.message || err) } };
}

module.exports = metPlanningRecht(async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);

    if (req.method === "GET") {
      const accountId = req.query.accountId;
      if (!accountId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef accountId mee." } };
        return;
      }
      const regels = await haalVoorKlant(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: { regels } };
      return;
    }

    if (req.method === "POST") {
      const regel = await maakRegel(req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: regel };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const regel = await wijzigRegel(id, req.body || {}, email);
      if (!regel) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: regel };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const verwijderd = await verwijderRegel(id);
      if (!verwijderd) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: { verwijderd: true } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
});
