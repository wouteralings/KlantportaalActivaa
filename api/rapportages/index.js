/**
 * /api/rapportages — W&V + Balans op basis van RGS 3.5 voor de ingelogde portaalklant.
 *
 *   GET ?accountId=...&jaar=2026[&vergelijkMet=2025][&formaat=csv]
 *     → { jaar, wv: { omzet: [...], kosten: [...], omzetTotaal, kostenTotaal, resultaat },
 *         balans: { activa: [...], passiva: [...], activaTotaal, passivaTotaal },
 *         vergelijkMet?: { ...zelfde vorm... } }
 *     formaat=csv → text/csv-download van dezelfde cijfers (W&V + Balans onder elkaar).
 *
 * TODO (Exact Online): haalt nu genereerDemoSaldi() (rgsData.js) op i.p.v. de echte cijfers.
 * Zodra de koppeling live is: geldigToken() uit api/_gedeeld/exact.js gebruiken om per RGS-code
 * het werkelijke saldo voor het gekozen jaar op te halen uit de Exact-"division" die bij dit
 * klantaccount hoort (die koppeling accountId → division moet dan nog vastgelegd worden).
 */
const { controleerRapportagesToegang, afhandelFout } = require("../_gedeeld/rapportagesToegang");
const { RGS_REFERENTIE, genereerDemoSaldi } = require("../_gedeeld/rgsData");
const { haalOverschrijvingen, pasToe } = require("../_gedeeld/rgsInstellingen");

function bouwRapportage(codes, jaar, accountId) {
  const { saldi, omzetTotaal, kostenTotaal, resultaat, activaTotaal, passivaTotaal } = genereerDemoSaldi(accountId, jaar);

  const naarRegels = (rapportage, categorie) =>
    codes
      .filter((c) => c.rapportage === rapportage && c.categorie === categorie)
      .map((c) => ({ rgsCode: c.rgsCode, naam: c.naam, groep: c.groep, volgorde: c.volgorde, saldo: saldi[c.rgsCode] || 0 }));

  return {
    jaar,
    wv: {
      omzet: naarRegels("wv", "omzet"),
      kosten: naarRegels("wv", "kosten"),
      omzetTotaal,
      kostenTotaal,
      resultaat,
    },
    balans: {
      activa: naarRegels("balans", "activa"),
      passiva: naarRegels("balans", "passiva"),
      activaTotaal,
      passivaTotaal,
    },
  };
}

function csvRegel(velden) {
  return velden.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";");
}

function naarCsv(rapportage) {
  const regels = [];
  regels.push(csvRegel(["Rapportage", "Groep", "RGS-code", "Naam", "Saldo", "Jaar"]));
  for (const r of rapportage.wv.omzet) regels.push(csvRegel(["W&V - Omzet", r.groep, r.rgsCode, r.naam, r.saldo, rapportage.jaar]));
  for (const r of rapportage.wv.kosten) regels.push(csvRegel(["W&V - Kosten", r.groep, r.rgsCode, r.naam, r.saldo, rapportage.jaar]));
  regels.push(csvRegel(["W&V - Resultaat", "", "", "Resultaat boekjaar", rapportage.wv.resultaat, rapportage.jaar]));
  for (const r of rapportage.balans.activa) regels.push(csvRegel(["Balans - Activa", r.groep, r.rgsCode, r.naam, r.saldo, rapportage.jaar]));
  for (const r of rapportage.balans.passiva) regels.push(csvRegel(["Balans - Passiva", r.groep, r.rgsCode, r.naam, r.saldo, rapportage.jaar]));
  return regels.join("\r\n");
}

module.exports = async function (context, req) {
  try {
    const { accountId } = await controleerRapportagesToegang(req);

    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }

    const huidigJaar = new Date().getFullYear();
    const jaar = parseInt(req.query.jaar, 10) || huidigJaar;
    const vergelijkMetJaar = req.query.vergelijkMet ? parseInt(req.query.vergelijkMet, 10) : null;

    const overschrijvingen = await haalOverschrijvingen();
    const codes = pasToe(RGS_REFERENTIE, overschrijvingen);

    const rapportage = bouwRapportage(codes, jaar, accountId);
    if (vergelijkMetJaar) rapportage.vergelijkMet = bouwRapportage(codes, vergelijkMetJaar, accountId);

    if ((req.query.formaat || "").toLowerCase() === "csv") {
      context.res = {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="rapportage-${jaar}.csv"`,
        },
        body: naarCsv(rapportage),
      };
      return;
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: rapportage };
  } catch (err) {
    afhandelFout(context, err);
  }
};
