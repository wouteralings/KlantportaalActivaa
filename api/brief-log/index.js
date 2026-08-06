/**
 * /api/brief-log — het logboek van verstuurde brieven, voor het medewerkersportaal.
 * Rol beheerder + medewerker (route in staticwebapp.config.json).
 *
 *   GET                      → { brieven: [...] }   (alle, nieuwste eerst — voor het centrale logboek)
 *   GET ?accountId=<guid>    → { brieven: [...] }   (alleen die klant — voor de tab in het briefscherm)
 */
const { haalAlleBrieven, haalBrievenVoorKlant } = require("../_gedeeld/briefLog");

module.exports = async function (context, req) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const accountId = String((req.query && req.query.accountId) || "").trim();
    let brieven;
    if (accountId) {
      brieven = await haalBrievenVoorKlant(accountId);
    } else {
      brieven = (await haalAlleBrieven()).sort((a, b) => String(b.verzondenOp).localeCompare(String(a.verzondenOp)));
    }
    context.res = { headers: { "Content-Type": "application/json" }, body: { brieven } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { brieven: [] } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het brievenlogboek niet ophalen.", detail: String(err) } };
  }
};
