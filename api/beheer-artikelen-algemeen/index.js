/**
 * /api/beheer-artikelen-algemeen — CRUD voor de centraal beheerde artikelen die voor
 * elke klant beschikbaar zijn (dbo.artikelen_algemeen). Route is beveiligd via
 * staticwebapp.config.json (alleen rol 'beheerder').
 *
 *   GET    /api/beheer-artikelen-algemeen                → { artikelen: [...] } (incl. inactieve)
 *   GET    /api/beheer-artikelen-algemeen?id=...          → één artikel
 *   POST   /api/beheer-artikelen-algemeen  body { omschrijving, eenheid, prijs, btwCode }
 *   PUT    /api/beheer-artikelen-algemeen  body { id, ... }
 *   DELETE /api/beheer-artikelen-algemeen?id=...          → zachte verwijdering (actief = 0)
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const {
  haalArtikelenAlgemeen,
  haalArtikelAlgemeen,
  maakArtikelAlgemeen,
  wijzigArtikelAlgemeen,
  verwijderArtikelAlgemeen,
} = require("../_gedeeld/artikelenAlgemeen");

module.exports = async function (context, req) {
  try {
    const email = haalEmailUitPrincipal(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const artikel = await haalArtikelAlgemeen(req.query.id);
        if (!artikel) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: artikel };
        return;
      }
      const artikelen = await haalArtikelenAlgemeen({ alleenActief: false, zoek: req.query.zoek || "" });
      context.res = { headers: { "Content-Type": "application/json" }, body: { artikelen } };
      return;
    }

    if (req.method === "POST") {
      const artikel = await maakArtikelAlgemeen(req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: artikel };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const artikel = await wijzigArtikelAlgemeen(id, req.body || {}, email);
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
      const gelukt = await verwijderArtikelAlgemeen(id, email);
      context.res = {
        status: gelukt ? 200 : 404,
        headers: { "Content-Type": "application/json" },
        body: gelukt ? { verwijderd: true } : { error: "Niet gevonden." },
      };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (typeof err.message === "string" && err.message.startsWith("VALIDATIE")) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "De facturatiemodule is nog niet geconfigureerd (FACTURATIE_SQL_CONNECTIONSTRING ontbreekt)." },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het beheren van algemene artikelen.", detail: String(err.message || err) },
    };
  }
};
