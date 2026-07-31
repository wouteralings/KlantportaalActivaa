/**
 * /api/ritten-klanten — CRUD voor de kilometerregistraties van de ingelogde portaalklant
 * (dbo.ritten_klanten). Zelfde accountId-afspraak als de facturatie-endpoints, maar via
 * api/_gedeeld/rittenToegang.js (eigen, los van Facturatie te activeren schakelaar).
 *
 *   GET    ?accountId=...&vanaf=&tot=&voertuigId=&projectId=&klantKlantId=&type=zakelijk|prive|woon_werk|alle
 *                                                                          → { ritten: [...] }
 *   GET    ?accountId=...&id=...                                          → één rit
 *   GET    ?accountId=...&suggesties=1                                    → { adressen: [...], omschrijvingen: [...] }
 *   POST   body { accountId, vanAdres, naarAdres, datum, ..., boekOokRetour }
 *                                                                          → { heenrit, retourrit }
 *   PUT    body { accountId, id, ... }                                    → gewijzigde rit
 *   DELETE ?accountId=...&id=...                                          → { verwijderd: true }
 */
const { controleerRittenToegang, afhandelFout } = require("../_gedeeld/rittenToegang");
const {
  haalRitten,
  haalRit,
  maakRit,
  wijzigRit,
  verwijderRit,
  haalRecenteSuggesties,
} = require("../_gedeeld/rittenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerRittenToegang(req);

    if (req.method === "GET") {
      if (req.query.suggesties === "1") {
        const suggesties = await haalRecenteSuggesties(accountId);
        context.res = { headers: { "Content-Type": "application/json" }, body: suggesties };
        return;
      }
      if (req.query.id) {
        const rit = await haalRit(accountId, req.query.id);
        if (!rit) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: rit };
        return;
      }
      const ritten = await haalRitten(accountId, {
        vanaf: req.query.vanaf || "",
        tot: req.query.tot || "",
        voertuigId: req.query.voertuigId || "",
        projectId: req.query.projectId || "",
        klantKlantId: req.query.klantKlantId || "",
        type: req.query.type || "alle",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ritten } };
      return;
    }

    if (req.method === "POST") {
      const resultaat = await maakRit(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: resultaat };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const rit = await wijzigRit(accountId, id, req.body || {}, email);
      if (!rit) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: rit };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderRit(accountId, id);
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
