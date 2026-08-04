const { haalRechten, zetRechten } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET → { niveaus: { "<email>": "manager"|"beheerder" }, bulk: ["<email>"],
 *          alsKlant: ["<email>"], offertes: ["<email>"], contracten: ["<email>"],
 *          verwijderIb: ["<email>"], verwijderVpb: ["<email>"],
 *          verwijderContactpersonen: ["<email>"], verwijderDividendbelasting: ["<email>"] }
 *       medewerker = standaard (niet opgeslagen).
 * PUT body { niveaus: {...}, bulk: [...], alsKlant: [...], offertes: [...], contracten: [...],
 *            verwijderIb: [...], verwijderVpb: [...], verwijderContactpersonen: [...],
 *            verwijderDividendbelasting: [...] }
 *      → overschrijft de rechten.
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const { niveaus, bulk, alsKlant, offertes, contracten, verwijderIb, verwijderVpb, verwijderContactpersonen, verwijderDividendbelasting } = await haalRechten();
      context.res = { headers: { "Content-Type": "application/json" }, body: { niveaus, bulk, alsKlant, offertes, contracten, verwijderIb, verwijderVpb, verwijderContactpersonen, verwijderDividendbelasting } };
      return;
    }
    if (req.method === "PUT") {
      const niveaus = (req.body && req.body.niveaus) || {};
      const bulk = (req.body && req.body.bulk) || [];
      const alsKlant = (req.body && req.body.alsKlant) || [];
      const offertes = (req.body && req.body.offertes) || [];
      const contracten = (req.body && req.body.contracten) || [];
      const verwijderIb = (req.body && req.body.verwijderIb) || [];
      const verwijderVpb = (req.body && req.body.verwijderVpb) || [];
      const verwijderContactpersonen = (req.body && req.body.verwijderContactpersonen) || [];
      const verwijderDividendbelasting = (req.body && req.body.verwijderDividendbelasting) || [];
      if (typeof niveaus !== "object" || Array.isArray(niveaus)) {
        context.res = { status: 400, body: { error: "Geef 'niveaus' (object van e-mail → niveau) mee." } };
        return;
      }
      if (!Array.isArray(bulk)) {
        context.res = { status: 400, body: { error: "Geef 'bulk' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(alsKlant)) {
        context.res = { status: 400, body: { error: "Geef 'alsKlant' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(offertes)) {
        context.res = { status: 400, body: { error: "Geef 'offertes' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(contracten)) {
        context.res = { status: 400, body: { error: "Geef 'contracten' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(verwijderIb)) {
        context.res = { status: 400, body: { error: "Geef 'verwijderIb' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(verwijderVpb)) {
        context.res = { status: 400, body: { error: "Geef 'verwijderVpb' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(verwijderContactpersonen)) {
        context.res = { status: 400, body: { error: "Geef 'verwijderContactpersonen' (lijst met e-mailadressen) mee." } };
        return;
      }
      if (!Array.isArray(verwijderDividendbelasting)) {
        context.res = { status: 400, body: { error: "Geef 'verwijderDividendbelasting' (lijst met e-mailadressen) mee." } };
        return;
      }
      const opgeslagen = await zetRechten({
        niveaus, bulk, alsKlant, offertes, contracten,
        verwijderIb, verwijderVpb, verwijderContactpersonen, verwijderDividendbelasting,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: opgeslagen };
      return;
    }
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij wijzigrechten.", detail: String(err) } };
  }
};
