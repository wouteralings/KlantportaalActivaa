/**
 * /api/brief-log — het logboek van verstuurde brieven, voor het medewerkersportaal.
 * Rol beheerder + medewerker (route in staticwebapp.config.json).
 *
 *   GET                      → { brieven: [...] }   (alle, nieuwste eerst — voor het centrale logboek)
 *   GET ?accountId=<guid>    → { brieven: [...] }   (alleen die klant — voor de tab in het briefscherm)
 */
const { haalAlleBrieven, haalBrievenVoorKlant, verwijderBrief } = require("../_gedeeld/briefLog");
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();

  // Een regel uit het logboek halen — alleen voor beheerders. De PDF in de SharePoint-map van de
  // cliënt blijft staan; hier verdwijnt alleen de vermelding uit het overzicht.
  if (methode === "DELETE" || (methode === "POST" && req.body && req.body.actie === "verwijderen")) {
    if (!haalRollenUitPrincipal(req).includes("beheerder")) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen een beheerder kan brieven uit het logboek verwijderen." } };
      return;
    }
    const id = String((req.query && req.query.id) || (req.body && req.body.id) || "").trim();
    if (!id) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen id meegegeven." } };
      return;
    }
    try {
      const gedaan = await verwijderBrief(id);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, gedaan } };
    } catch (err) {
      context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de brief niet uit het logboek verwijderen.", detail: String(err) } };
    }
    return;
  }

  if (methode !== "GET") {
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
