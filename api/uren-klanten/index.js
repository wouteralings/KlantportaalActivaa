/**
 * /api/uren-klanten — uren-/projecturenregistratie van de ingelogde portaalklant
 * (dbo.uren_klanten). Zelfde accountId-afspraak als de andere facturatie-endpoints, zie
 * api/_gedeeld/facturatieToegang.js.
 *
 *   GET    ?accountId=...&klantKlantId=...&status=open|gefactureerd|alle&zoek=...  → { uren: [...] }
 *   GET    ?accountId=...&id=...                                                   → één registratie
 *   POST   body { accountId, klantKlantId, datum, aantalUren, omschrijving, artikelId }  → nieuw
 *   PUT    body { accountId, id, ... }                                            → wijzigen (alleen zolang nog niet gefactureerd)
 *   DELETE ?accountId=...&id=...                                                  → verwijderen (alleen zolang nog niet gefactureerd)
 *
 * Het daadwerkelijk op een factuur zetten van open uren gebeurt niet hier, maar in het
 * factuurscherm ("Openstaande uren ophalen") + api/_gedeeld/facturenKlanten.js, dat de uren aan
 * de factuur koppelt (factuur_id) zodra die wordt opgeslagen.
 */
const { controleerUrenToegang, afhandelFout } = require("../_gedeeld/urenToegang");
const {
  haalUren,
  haalUur,
  maakUur,
  wijzigUur,
  verwijderUur,
} = require("../_gedeeld/urenKlanten");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerUrenToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const uur = await haalUur(accountId, req.query.id);
        if (!uur) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: uur };
        return;
      }
      const uren = await haalUren(accountId, {
        klantKlantId: req.query.klantKlantId || "",
        status: req.query.status || "alle",
        zoek: req.query.zoek || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { uren } };
      return;
    }

    if (req.method === "POST") {
      const uur = await maakUur(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: uur };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const uur = await wijzigUur(accountId, id, req.body || {}, email);
      if (!uur) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: uur };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderUur(accountId, id);
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
