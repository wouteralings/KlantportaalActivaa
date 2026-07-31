/**
 * /api/voertuigen-klanten — CRUD voor de voertuigenlijst van de ingelogde portaalklant
 * (dbo.voertuigen_klanten). Zie api/_gedeeld/voertuigenKlanten.js voor de favoriet-logica.
 *
 *   GET    ?accountId=...&alles=1&zoek=...   → { voertuigen: [...] }  (standaard alleen in_gebruik)
 *   GET    ?accountId=...&id=...             → één voertuig
 *   POST   body { accountId, merk, ... }     → nieuw
 *   PUT    body { accountId, id, ... }       → wijzigen
 *   DELETE ?accountId=...&id=...             → zachte verwijdering (in_gebruik = 0)
 */
const { controleerRittenToegang, afhandelFout } = require("../_gedeeld/rittenToegang");
const {
  haalVoertuigen,
  haalVoertuig,
  maakVoertuig,
  wijzigVoertuig,
  verwijderVoertuig,
} = require("../_gedeeld/voertuigenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerRittenToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const voertuig = await haalVoertuig(accountId, req.query.id);
        if (!voertuig) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: voertuig };
        return;
      }
      const voertuigen = await haalVoertuigen(accountId, {
        alleenInGebruik: req.query.alles !== "1",
        zoek: req.query.zoek || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { voertuigen } };
      return;
    }

    if (req.method === "POST") {
      const voertuig = await maakVoertuig(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: voertuig };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const voertuig = await wijzigVoertuig(accountId, id, req.body || {}, email);
      if (!voertuig) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: voertuig };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderVoertuig(accountId, id, email);
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
