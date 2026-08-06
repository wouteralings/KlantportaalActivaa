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

  // RGS samenvoegen: het saldo van een code met 'samenvoegNaar' wordt opgeteld bij de doelcode (binnen
  // dezelfde rapportage + categorie) en de bronregel verdwijnt. Ketens worden tot de wortel gevolgd.
  // De categorietotalen (omzet/kosten/activa/passiva) blijven ongewijzigd — samenvoegen is puur presentatie.
  const codePerCode = new Map(codes.map((c) => [c.rgsCode, c]));
  const wortelVan = (code) => {
    let cur = code, guard = 0;
    while (cur && cur.samenvoegNaar && guard++ < 50) {
      const doel = codePerCode.get(cur.samenvoegNaar);
      if (doel && doel.rgsCode !== cur.rgsCode && doel.rapportage === code.rapportage && doel.categorie === code.categorie) cur = doel;
      else break;
    }
    return cur;
  };
  const effSaldo = {};
  const samengevoegd = new Set();
  for (const c of codes) {
    const wortel = wortelVan(c);
    if (wortel.rgsCode !== c.rgsCode) samengevoegd.add(c.rgsCode);
    effSaldo[wortel.rgsCode] = (effSaldo[wortel.rgsCode] || 0) + (saldi[c.rgsCode] || 0);
  }

  const naarRegels = (rapportage, categorie) =>
    codes
      .filter((c) => c.rapportage === rapportage && c.categorie === categorie && !samengevoegd.has(c.rgsCode))
      .map((c) => ({ rgsCode: c.rgsCode, naam: c.naam, groep: c.groep, volgorde: c.volgorde, saldo: effSaldo[c.rgsCode] || 0 }));

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
