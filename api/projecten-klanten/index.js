/**
 * /api/projecten-klanten — CRUD voor dbo.projecten_klanten, gedeeld tussen Ritten en (indien
 * gekoppeld) Uren. Toegang via api/_gedeeld/projectenToegang.js — zie daar voor de "één van
 * beide moet aan staan"-regel.
 *
 *   GET    ?accountId=...&klantKlantId=...&alles=1&zoek=...   → { projecten: [...] }
 *   GET    ?accountId=...&id=...                              → één project
 *   POST   body { accountId, klantKlantId, naam, ... }        → nieuw
 *   PUT    body { accountId, id, ... }                        → wijzigen
 *   DELETE ?accountId=...&id=...                              → zachte verwijdering (actief = 0)
 */
const { controleerProjectenToegang, afhandelFout } = require("../_gedeeld/projectenToegang");
const {
  haalProjecten,
  haalProject,
  maakProject,
  wijzigProject,
  verwijderProject,
} = require("../_gedeeld/projectenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerProjectenToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const project = await haalProject(accountId, req.query.id);
        if (!project) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: project };
        return;
      }
      const projecten = await haalProjecten(accountId, {
        klantKlantId: req.query.klantKlantId || "",
        alleenActief: req.query.alles !== "1",
        zoek: req.query.zoek || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { projecten } };
      return;
    }

    if (req.method === "POST") {
      const project = await maakProject(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: project };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const project = await wijzigProject(accountId, id, req.body || {}, email);
      if (!project) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: project };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderProject(accountId, id, email);
      context.res = {
        status: gelukt ? 200 : 404,
        headers: { "Content-Type": "application/json" },
        body: gelukt ? { verwijderd: true } : { error: "Niet gevonden." },
      };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
