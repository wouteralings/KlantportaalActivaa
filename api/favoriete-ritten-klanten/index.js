/**
 * /api/favoriete-ritten-klanten — CRUD voor opgeslagen rit-sjablonen (dbo.favoriete_ritten_klanten).
 *
 *   GET    ?accountId=...          → { favorieteRitten: [...] }
 *   GET    ?accountId=...&id=...   → één sjabloon
 *   POST   body { accountId, naam, ... }  → nieuw
 *   PUT    body { accountId, id, ... }    → wijzigen
 *   DELETE ?accountId=...&id=...          → verwijderen
 */
const { controleerRittenToegang, afhandelFout } = require("../_gedeeld/rittenToegang");
const {
  haalFavorieteRitten,
  haalFavorieteRit,
  maakFavorieteRit,
  wijzigFavorieteRit,
  verwijderFavorieteRit,
} = require("../_gedeeld/favorieteRittenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerRittenToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const favoriet = await haalFavorieteRit(accountId, req.query.id);
        if (!favoriet) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: favoriet };
        return;
      }
      const favorieteRitten = await haalFavorieteRitten(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: { favorieteRitten } };
      return;
    }

    if (req.method === "POST") {
      const favoriet = await maakFavorieteRit(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: favoriet };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const favoriet = await wijzigFavorieteRit(accountId, id, req.body || {}, email);
      if (!favoriet) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: favoriet };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderFavorieteRit(accountId, id);
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
