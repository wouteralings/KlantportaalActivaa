/**
 * /api/beheer-btw-tarieven — beheer van BTW-tarieven met geldigheidsperiode.
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 *   GET  /api/beheer-btw-tarieven                → { tarieven: [...] } (volledige historie, alle codes)
 *   POST /api/beheer-btw-tarieven  body { code, label, percentage, geldigVanaf }
 *        → nieuw tarief; sluit automatisch het vorige tarief van diezelfde code af.
 *   PUT  /api/beheer-btw-tarieven  body { id, ...wijzigingen }
 *        → corrigeert een reeds ingevoerd tarief (bijv. typefout in percentage of datum).
 */
const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalAlleTarieven, maakTarief, wijzigTarief } = require("../_gedeeld/btwTarieven");

module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const tarieven = await haalAlleTarieven();
      context.res = { headers: { "Content-Type": "application/json" }, body: { tarieven } };
      return;
    }

    if (req.method === "POST") {
      const email = haalEmailUitPrincipal(req);
      const tarief = await maakTarief(req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: tarief };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const tarief = await wijzigTarief(id, req.body || {});
      if (!tarief) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: tarief };
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
      body: { error: "Onverwachte fout bij het beheren van BTW-tarieven.", detail: String(err.message || err) },
    };
  }
};
