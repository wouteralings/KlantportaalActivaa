/**
 * /api/artikelen-klanten — CRUD voor de eigen product-/dienstencatalogus van de ingelogde
 * portaalklant (dbo.artikelen_klanten). Zelfde accountId-afspraak als /api/klanten-klanten,
 * zie api/_gedeeld/facturatieToegang.js.
 *
 *   GET    /api/artikelen-klanten?accountId=...                → { artikelen: [...] }
 *   GET    /api/artikelen-klanten?accountId=...&id=...          → één artikel
 *   POST   /api/artikelen-klanten            body { accountId, omschrijving, prijs, ... }
 *   PUT    /api/artikelen-klanten            body { accountId, id, ... }
 *   DELETE /api/artikelen-klanten?accountId=...&id=...          → zachte verwijdering (actief = 0)
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const {
  haalArtikelen,
  haalArtikel,
  maakArtikel,
  wijzigArtikel,
  verwijderArtikel,
} = require("../_gedeeld/artikelenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const artikel = await haalArtikel(accountId, req.query.id);
        if (!artikel) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: artikel };
        return;
      }
      const artikelen = await haalArtikelen(accountId, {
        alleenActief: req.query.alles !== "1",
        zoek: req.query.zoek || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { artikelen } };
      return;
    }

    if (req.method === "POST") {
      const artikel = await maakArtikel(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: artikel };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const artikel = await wijzigArtikel(accountId, id, req.body || {}, email);
      if (!artikel) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: artikel };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderArtikel(accountId, id, email);
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
