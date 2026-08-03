/**
 * /api/contracten-documenten — documenten (bijlagen) bij een eigen contract van de ingelogde
 * portaalklant (Contractmanagement-plan, Stap 4). Opslag in een eigen Blob-container "contracten",
 * zie api/_gedeeld/contractenDocumenten.js voor de achtergrond waarom dit geen SharePoint/Graph is.
 *
 *   GET  ?accountId=...&contractId=...              → { documenten: [...] } (lijst, zonder inhoud)
 *   GET  ?accountId=...&contractId=...&id=...        → downloadt dat ene bestand (binaire response)
 *   POST body { accountId, contractId, bestandsnaam, dataUrl } → nieuw document
 *   DELETE ?accountId=...&contractId=...&id=...      → verwijdert dat document (mag wél, in
 *          tegenstelling tot het contract zelf — zie het besluit in contractenDocumenten.js)
 *
 * Elke aanroep gaat eerst langs controleerContractenToegang (hoort accountId bij de ingelogde
 * gebruiker + staat de module aan) en controleert daarna dat het contract zelf ook echt bij dat
 * account hoort (haalContract), zodat een documentId van klant A niet via een geraden contractId
 * van klant B benaderd kan worden.
 */
const { controleerContractenToegang, afhandelFout } = require("../_gedeeld/contractenToegang");
const { haalContract } = require("../_gedeeld/contractenKlanten");
const { uploadDocument, haalDocumenten, haalDocument, verwijderDocument } = require("../_gedeeld/contractenDocumenten");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { kopieerNaarDossier } = require("../_gedeeld/contractenSharepoint");

async function controleerContract(accountId, contractId) {
  if (!contractId) {
    const fout = new Error("Geef contractId mee.");
    fout.code = "GEEN_ACCOUNT_ID";
    throw fout;
  }
  const contract = await haalContract(accountId, contractId);
  if (!contract) {
    const fout = new Error("Dit contract bestaat niet (of hoort niet bij dit klantaccount).");
    fout.code = "GEEN_TOEGANG";
    throw fout;
  }
  return contract;
}

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerContractenToegang(req);
    const contractId = (req.query && req.query.contractId) || (req.body && req.body.contractId);

    if (req.method === "GET") {
      await controleerContract(accountId, contractId);
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
          headers: {
            "Content-Type": document.contentType,
            "Content-Disposition": `attachment; filename="${veiligeBestandsnaam}"`,
          },
          body: document.buffer,
          isRaw: true,
        };
        return;
      }
      const documenten = await haalDocumenten(accountId, contractId);
      context.res = { headers: { "Content-Type": "application/json" }, body: { documenten } };
      return;
    }

    if (req.method === "POST") {
      const contract = await controleerContract(accountId, contractId);
      const { bestandsnaam, dataUrl } = req.body || {};
      const document = await uploadDocument(accountId, contractId, dataUrl, bestandsnaam, email);

      // Optionele archiefkopie in het SharePoint-klantdossier (Beheer → Facturatie, standaard
      // uit) — best-effort: als dit misgaat blijft het document gewoon in de eigen Blob-opslag
      // staan (die hierboven al is gelukt); we melden alleen of de dossierkopie ook is gelukt.
      let sharepoint = { gedaan: false };
      try {
        const instellingen = await haalInstellingen();
        if (instellingen.contractenSharepointOpslag) {
          const match = /^data:([^;]*);base64,(.+)$/.exec(dataUrl || "");
          if (match) {
            sharepoint = await kopieerNaarDossier({
              accountId,
              contract,
              bestandsnaam: document.bestandsnaam,
              buffer: Buffer.from(match[2], "base64"),
              contentType: match[1] || "application/octet-stream",
              submap: instellingen.contractenSharepointMap || "Contracten",
            });
          }
        }
      } catch (e) {
        sharepoint = { gedaan: false, reden: String((e && e.message) || e) };
      }

      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { ...document, dossierkopie: sharepoint } };
      return;
    }

    if (req.method === "DELETE") {
      await controleerContract(accountId, contractId);
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef id mee." } };
        return;
      }
      const verwijderd = await verwijderDocument(accountId, contractId, id);
      if (!verwijderd) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Document niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
