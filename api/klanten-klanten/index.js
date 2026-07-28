/**
 * /api/klanten-klanten — CRUD voor de eigen (eind)klanten van de ingelogde portaalklant
 * (dbo.klanten_klanten). Verwacht altijd ?accountId=<Dataverse Account-id> (GET/DELETE) of
 * accountId in de body (POST/PUT) — zie api/_gedeeld/facturatieToegang.js.
 *
 *   GET    /api/klanten-klanten?accountId=...            → { klanten: [...] }
 *   GET    /api/klanten-klanten?accountId=...&id=...      → één klant
 *   GET    ...&zoek=tekst&alles=1                         → zoeken / ook inactieve tonen
 *   POST   /api/klanten-klanten            body { accountId, naam, ... }
 *   PUT    /api/klanten-klanten            body { accountId, id, ... }
 *   DELETE /api/klanten-klanten?accountId=...&id=...      → zachte verwijdering (actief = 0)
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalKlanten, haalKlant, maakKlant, wijzigKlant, verwijderKlant } = require("../_gedeeld/klantenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const klant = await haalKlant(accountId, req.query.id);
        if (!klant) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: klant };
        return;
      }
      const klanten = await haalKlanten(accountId, {
        alleenActief: req.query.alles !== "1",
        zoek: req.query.zoek || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { klanten } };
      return;
    }

    if (req.method === "POST") {
      const klant = await maakKlant(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: klant };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const klant = await wijzigKlant(accountId, id, req.body || {}, email);
      if (!klant) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: klant };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderKlant(accountId, id, email);
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
