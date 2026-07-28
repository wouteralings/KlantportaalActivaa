/**
 * /api/facturen-terugkerend — beheer van terugkerende-facturen-sjablonen ("abonnementen") van
 * de ingelogde portaalklant (dbo.facturen_terugkerend). Zelfde accountId-afspraak als de
 * andere facturatie-endpoints, zie api/_gedeeld/facturatieToegang.js.
 *
 * Dit endpoint beheert alleen de sjablonen zelf; het daadwerkelijk genereren van de concrete
 * facturen gebeurt periodiek door /api/verwerk-terugkerende-facturen (aangeroepen via een
 * extern schema), niet hier.
 *
 *   GET    ?accountId=...                         → { terugkerend: [...] } (alle sjablonen, actief eerst)
 *   GET    ?accountId=...&id=...                   → één sjabloon
 *   POST   body { accountId, klantKlantId, frequentie, startdatum, regels: [...], ... }  → nieuw sjabloon
 *   PATCH  body { accountId, id, ... }             → sjabloon bewerken (incl. pauzeren/hervatten via actief)
 *   DELETE ?accountId=...&id=...                   → sjabloon verwijderen
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const {
  haalTerugkerendVoorAccount,
  haalTerugkerend,
  maakTerugkerend,
  wijzigTerugkerend,
  verwijderTerugkerend,
} = require("../_gedeeld/facturenTerugkerend");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const sjabloon = await haalTerugkerend(accountId, req.query.id);
        if (!sjabloon) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: sjabloon };
        return;
      }
      const terugkerend = await haalTerugkerendVoorAccount(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: { terugkerend } };
      return;
    }

    if (req.method === "POST") {
      const sjabloon = await maakTerugkerend(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: sjabloon };
      return;
    }

    if (req.method === "PATCH") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const sjabloon = await wijzigTerugkerend(accountId, id, req.body || {}, email);
      if (!sjabloon) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: sjabloon };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderTerugkerend(accountId, id);
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
