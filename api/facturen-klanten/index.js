/**
 * /api/facturen-klanten — facturen, offertes én creditnota's van de ingelogde portaalklant
 * (dbo.facturen_klanten). Zelfde accountId-afspraak als de andere facturatie-endpoints, zie
 * api/_gedeeld/facturatieToegang.js.
 *
 *   GET    ?accountId=...&documenttype=factuur&status=concept&zoek=...   → { facturen: [...] }
 *   GET    ?accountId=...&id=...                                        → één document
 *   GET    ?accountId=...&id=...&formaat=pdf                            → PDF-download van dat document
 *   POST   body { accountId, documenttype, klantKlantId, regels: [...], ... }  → nieuw concept
 *   PUT    body { accountId, id, regels: [...], ... }                   → concept bijwerken
 *   PATCH  body { accountId, id, actie }                                → statusovergang, zie hieronder
 *   DELETE ?accountId=...&id=...                                        → concept verwijderen
 *
 * PATCH-acties (body.actie):
 *   "versturen"   concept → verzonden (kent het volgende nummer toe, alle documenttypes, en
 *                 verstuurt best-effort een échte e-mail met de PDF als bijlage — zie
 *                 verstuurFactuur/verstuurDocumentPerEmail in facturenKlanten.js)
 *   "accepteren"  offerte: verzonden → geaccepteerd; maakt automatisch een nieuwe factuur (concept) aan
 *   "afwijzen"    offerte: verzonden → afgewezen
 *   "betaald"     factuur: → betaald
 *   "crediteren"  factuur (verzonden of betaald): maakt een CONCEPT-creditnota aan met alle
 *                 regels negatief, gedateerd op vandaag — de factuur zelf gaat pas naar
 *                 'geannuleerd' zodra die creditnota daadwerkelijk verstuurd wordt (zie
 *                 crediteerFactuur/verstuurFactuur in facturenKlanten.js)
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const {
  haalFacturen,
  haalFactuur,
  maakFactuur,
  wijzigFactuur,
  verstuurFactuur,
  accepteerOfferte,
  wijsOfferteAf,
  markeerBetaald,
  crediteerFactuur,
  verwijderFactuur,
} = require("../_gedeeld/facturenKlanten");
const { haalKlant } = require("../_gedeeld/klantenKlanten");
const { haalGegevensMetCrmAanvulling: haalBedrijfsgegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");
const { genereerFactuurPdf } = require("../_gedeeld/facturenPdf");

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      if (req.query.id) {
        const factuur = await haalFactuur(accountId, req.query.id);
        if (!factuur) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
          return;
        }
        if ((req.query.formaat || "").toLowerCase() === "pdf") {
          const [klant, bedrijfsgegevens] = await Promise.all([
            haalKlant(accountId, factuur.klantKlantId),
            haalBedrijfsgegevens(accountId),
          ]);
          const pdfBuffer = await genereerFactuurPdf({
            document: factuur, klant, bedrijfsgegevens, documenttype: factuur.documenttype,
          });
          const bestandsnaam = `${factuur.documenttype}-${factuur.nummer || "concept"}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
          context.res = {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${bestandsnaam}"`,
              "Cache-Control": "private, no-store",
            },
            body: pdfBuffer,
            isRaw: true,
          };
          return;
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: factuur };
        return;
      }
      const facturen = await haalFacturen(accountId, {
        documenttype: req.query.documenttype,
        status: req.query.status,
        zoek: req.query.zoek || "",
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { facturen } };
      return;
    }

    if (req.method === "POST") {
      const factuur = await maakFactuur(accountId, req.body || {}, email);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: factuur };
      return;
    }

    if (req.method === "PUT") {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const factuur = await wijzigFactuur(accountId, id, req.body || {}, email);
      if (!factuur) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: factuur };
      return;
    }

    if (req.method === "PATCH") {
      const id = (req.body && req.body.id) || req.query.id;
      const actie = req.body && req.body.actie;
      if (!id || !actie) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id en actie zijn verplicht." } };
        return;
      }
      let resultaat;
      if (actie === "versturen") resultaat = await verstuurFactuur(accountId, id, email, context);
      else if (actie === "accepteren") resultaat = await accepteerOfferte(accountId, id, email);
      else if (actie === "afwijzen") resultaat = await wijsOfferteAf(accountId, id, email);
      else if (actie === "betaald") resultaat = await markeerBetaald(accountId, id, email);
      else if (actie === "crediteren") resultaat = await crediteerFactuur(accountId, id, email);
      else {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: `Onbekende actie: ${actie}` } };
        return;
      }
      if (!resultaat) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: resultaat };
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "id is verplicht." } };
        return;
      }
      const gelukt = await verwijderFactuur(accountId, id);
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
