/**
 * /api/contracten-klanten — CRUD voor de zelf geregistreerde doorlopende contracten van de
 * ingelogde portaalklant (dbo.contracten_klanten). Zelfde accountId-afspraak als de
 * facturatie-/ritten-endpoints, via api/_gedeeld/contractenToegang.js.
 *
 * BEWUST GEEN DELETE — besluit §5.7 van het contractmanagement-plan staat verwijderen door de
 * klant niet toe (audit-overweging); zie ook de function.json (methods bevat geen "delete") en
 * de bestandskop van contractenKlanten.js.
 *
 *   GET  ?accountId=...[&type=...][&verlooptVoor=YYYY-MM-DD]  → { contracten: [...] }
 *   GET  ?accountId=...&id=...                                → één contract
 *   POST body { accountId, type, naam, ... }                  → nieuw contract
 *   PUT  body { accountId, id, ... }                          → gewijzigd contract
 */
const { controleerContractenToegang, afhandelFout } = require("../_gedeeld/contractenToegang");
const { haalContracten, haalContract, maakContract, wijzigContract } = require("../_gedeeld/contractenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerContractenToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const contract = await haalContract(accountId, req.query.id);
        if (!contract) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: contract };
        return;
      }
      const contracten = await haalContracten(accountId, {
        type: req.query.type || "",
        verlooptVoor: req.query.verlooptVoor || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { contracten } };
      return;
    }

    if (req.method === "POST") {
      const contract = await maakContract(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: contract };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const contract = await wijzigContract(accountId, id, req.body || {}, email);
      if (!contract) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: contract };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
