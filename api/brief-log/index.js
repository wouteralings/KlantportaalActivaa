/**
 * /api/brief-log — het logboek van verstuurde brieven, voor het medewerkersportaal.
 * Rol beheerder + medewerker (route in staticwebapp.config.json).
 *
 *   GET                      → { brieven: [...] }   (alle, nieuwste eerst — voor het centrale logboek)
 *   GET ?accountId=<guid>    → { brieven: [...] }   (alleen die klant — voor de tab in het briefscherm)
 */
const { haalAlleBrieven, haalBrievenVoorKlant, haalBrief, verwijderBrief } = require("../_gedeeld/briefLog");
const { haalRollenUitPrincipal, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { magSubVerwijderen } = require("../_gedeeld/rollenConfig");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { verwijderBestandViaUrl } = require("../_gedeeld/sharepointUpload");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();

  // Een regel uit het logboek halen. Wie dit mag stel je in bij Beheer → Rollen & toegang: de
  // Verwijderen-schakelaar op de subpagina "klantoverzicht.brieven" — dezelfde bron die het verwijderen
  // van dossiers, contactpersonen en de notulen-/dividendlogboeken al gebruikt. Beheerder mag altijd.
  //
  // Het BESTAND IN SHAREPOINT gaat mee de deur uit: een regel weghalen zonder de PDF op te ruimen laat
  // losse documenten in het dossier van de cliënt achter. Best-effort: mislukt het opruimen, dan
  // verdwijnt de regel tóch en krijgt de medewerker de reden te zien.
  if (methode === "DELETE" || (methode === "POST" && req.body && req.body.actie === "verwijderen")) {
    const email = haalEmailUitPrincipal(req);
    const mag = haalRollenUitPrincipal(req).includes("beheerder")
      || (await magSubVerwijderen(email, "klantoverzicht.brieven").catch(() => false));
    if (!mag) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je mag brieven niet uit het logboek verwijderen. Dit recht staat bij Beheer → Rollen & toegang, met de Verwijderen-schakelaar op de subpagina Brieven." } };
      return;
    }
    const id = String((req.query && req.query.id) || (req.body && req.body.id) || "").trim();
    if (!id) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen id meegegeven." } };
      return;
    }
    try {
      const brief = await haalBrief(id);
      const link = brief && String(brief.pdfUrl || "").trim();
      const sharepoint = { gedaan: !link, reden: "", aantal: 0 };
      if (link) {
        try {
          const appToken = await haalAppGraphToken();
          const uit = await verwijderBestandViaUrl(appToken, link);
          sharepoint.gedaan = !!uit.gedaan;
          sharepoint.reden = uit.reden || "";
          sharepoint.aantal = uit.gedaan ? 1 : 0;
        } catch (e) {
          sharepoint.gedaan = false;
          sharepoint.reden = String((e && e.message) || e);
          context.log.error("Brief uit SharePoint verwijderen mislukt:", e);
        }
      }
      const gedaan = await verwijderBrief(id);
      await logGebeurtenis({
        door: email || "onbekend",
        actie: "brief",
        accountId: (brief && brief.accountId) || "",
        accountIds: (brief && brief.accountId) ? [brief.accountId] : [],
        klantnaam: (brief && brief.klantnaam) || "",
        tekst: `Regel uit het brievenlogboek verwijderd${sharepoint.aantal ? " (bestand uit SharePoint verwijderd)" : ""}${sharepoint.gedaan ? "" : ` — let op: ${sharepoint.reden}`}.`,
      }).catch(() => {});
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, gedaan, sharepoint } };
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
