/**
 * /api/mw-planning-config — CRUD op de per-klant planning-configuratie (dbo.planning_config_klanten),
 * medewerkerskant (Planningsmodule Stap 3a). Beveiligd via staticwebapp.config.json (rol
 * 'beheerder'/'medewerker') én het granulaire "Planning"-recht (metPlanningRecht).
 *
 *   GET  ?accountId=...   → { config: [...] } (de configuratie van één klant)
 *   POST body { klantAccountId, activiteit, frequentie, indicatieUren, toegewezenAan?, opmerkingen? }
 *   PUT  body { id, ... } → gewijzigde regel
 *   DELETE ?id=...        → { verwijderd: true }
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { magPlanningLezen, magPlanningGebruiken } = require("../_gedeeld/planningRecht");
const { haalVoorKlant, haalAlle, maakRegel, wijzigRegel, verwijderRegel } = require("../_gedeeld/planningConfig");

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

const verwerk = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);

    if (req.method === "GET") {
      const accountId = req.query.accountId;
      // Zonder accountId: alle actieve configuratie over alle klanten heen (voor de maandplanning, Stap 3b).
      const config = accountId ? await haalVoorKlant(accountId) : await haalAlle();
      context.res = { headers: { "Content-Type": "application/json" }, body: { config } };
      return;
    }

    if (req.method === "POST") {
      const regel = await maakRegel(req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: regel };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } }; return; }
      const regel = await wijzigRegel(id, req.body || {}, email);
      if (!regel) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } }; return; }
      context.res = { headers: { "Content-Type": "application/json" }, body: regel };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } }; return; }
      const verwijderd = await verwijderRegel(id);
      if (!verwijderd) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } }; return; }
      context.res = { headers: { "Content-Type": "application/json" }, body: { verwijderd: true } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};

// Lezen (GET) mag elke medewerker — nodig voor "Mijn werk"; muteren (POST/PUT/DELETE) vereist het
// granulaire Planning-recht. Klanten hebben de rol 'medewerker' niet en worden hier (en via de
// SWA-route-regel) geweerd.
module.exports = async function (context, req) {
  if (!magPlanningLezen(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang tot de planning." } };
    return;
  }
  if (req.method !== "GET" && !(await magPlanningGebruiken(req))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen recht om de planning te wijzigen. Vraag een beheerder om het Planning-recht." } };
    return;
  }
  return verwerk(context, req);
};
