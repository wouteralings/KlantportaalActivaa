/**
 * /api/bezittingen — activaregister + afschrijvingsstaat voor de ingelogde portaalklant.
 *
 *   GET ?accountId=...                     → { bezittingen: [...] }  (huidige boekwaarde per stuk)
 *   GET ?accountId=...&jaar=2026            → { bezittingen: [...] }  (elk item + afschrijving.<jaar>)
 *   GET ?accountId=...&formaat=csv[&jaar=]  → CSV-download
 *
 * TODO (Exact Online): zie bezittingenData.js — vervangt genereerDemoBezittingen() straks door
 * de echte activastaat uit Exact.
 */
const { controleerBezittingenToegang, afhandelFout } = require("../_gedeeld/bezittingenToegang");
const { genereerDemoBezittingen, afschrijvingInJaar } = require("../_gedeeld/bezittingenData");

function csvRegel(velden) {
  return velden.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";");
}

module.exports = async function (context, req) {
  try {
    const { accountId } = await controleerBezittingenToegang(req);

    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }

    const jaar = req.query.jaar ? parseInt(req.query.jaar, 10) : null;
    const bezittingen = genereerDemoBezittingen(accountId).map((b) => ({
      ...b,
      afschrijvingDitJaar: jaar ? afschrijvingInJaar(b, jaar) : null,
    }));

    if ((req.query.formaat || "").toLowerCase() === "csv") {
      const regels = [csvRegel(["Groep", "Omschrijving", "Aanschafdatum", "Aanschafwaarde", "Restwaarde", "Boekwaarde nu", "Status"])];
      for (const b of bezittingen) {
        regels.push(csvRegel([
          b.groepLabel, b.omschrijving, b.aanschafdatum, b.aanschafwaarde, b.restwaarde, b.boekwaardeNu,
          b.volledigAfgeschreven ? "Volledig afgeschreven" : "In gebruik",
        ]));
      }
      context.res = {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bezittingen.csv"' },
        body: regels.join("\r\n"),
      };
      return;
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { bezittingen } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
