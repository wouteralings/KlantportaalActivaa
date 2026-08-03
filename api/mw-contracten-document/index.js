/**
 * /api/mw-contracten-document — documenten (bijlagen) bij een contract, bekeken vanuit het
 * MEDEWERKERSOVERZICHT (mw-contracten-overzicht / ContractenOverzicht.jsx), dus over ALLE
 * klantaccounts heen — in tegenstelling tot api/contracten-documenten (klantkant), dat alleen
 * documenten van de EIGEN account(s) van de ingelogde klant toont. Beveiligd met hetzelfde
 * magContracten-recht als het overzicht zelf (api/_gedeeld/contractenRecht.js), niet met
 * contractenToegang.js (die controleert immers of accountId bij de INGELOGDE KLANT hoort, en dat
 * is hier niet van toepassing — een medewerker met het Contracten-recht mag elk klantaccount zien).
 *
 *   GET ?accountId=...&contractId=...             → { documenten: [...] } (lijst, zonder inhoud)
 *   GET ?accountId=...&contractId=...&id=...        → downloadt dat ene bestand (binaire response)
 */
const { metContractenRecht } = require("../_gedeeld/contractenRecht");
const { haalContract } = require("../_gedeeld/contractenKlanten");
const { haalDocumenten, haalDocument } = require("../_gedeeld/contractenDocumenten");

module.exports = metContractenRecht(async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const accountId = req.query && req.query.accountId;
    const contractId = req.query && req.query.contractId;
    if (!accountId || !contractId) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef accountId en contractId mee." } };
      return;
    }
    const contract = await haalContract(accountId, contractId);
    if (!contract) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dit contract bestaat niet (of hoort niet bij deze klant)." } };
      return;
    }

    const id = req.query.id;
    if (id) {
      const document = await haalDocument(accountId, contractId, id);
      if (!document) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Document niet gevonden." } };
        return;
      }
      const veiligeBestandsnaam = document.bestandsnaam.replace(/["\r\n]/g, "");
      context.res = {
        status: 200,
        headers: { "Content-Type": document.contentType, "Content-Disposition": `attachment; filename="${veiligeBestandsnaam}"` },
        body: document.buffer,
        isRaw: true,
      };
      return;
    }

    const documenten = await haalDocumenten(accountId, contractId);
    context.res = { headers: { "Content-Type": "application/json" }, body: { documenten } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij het ophalen van de documenten.", detail: String(err.message || err) } };
  }
});
