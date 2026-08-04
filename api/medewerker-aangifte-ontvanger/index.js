/**
 * /api/medewerker-aangifte-ontvanger — voorbereidende stap voor "Aangifte versturen" (de twee
 * dropzones in het IB-dossier, zie AangifteVersturenModal in MedewerkerPortaal.jsx): haalt op wie
 * de ontvanger is (cliënt zelf of diens fiscaal partner — allebei een eigen Dynamics-account),
 * met naam + e-mailadres (van de primaire contactpersoon van dat account) en de standaard
 * bestandsnaam + mail-onderwerp/-tekst (allemaal uit Beheer → Dossiers, plaatshouders {klant}/
 * {jaar}), zodat het medewerkersportaal vóór het daadwerkelijk versturen (POST
 * /api/medewerker-aangifte-versturen) een voorbeeldscherm kan tonen — zelfde opzet als het
 * mail-conceptscherm bij Offertes. De medewerker kan dit voorstel per verzending nog aanpassen.
 *
 *   GET ?soort=ib&id=<dossier-guid>&doelgroep=client|partner
 *     → { ontvanger: { accountId, naam, email }, bestandsnaamStandaard, mailOnderwerpStandaard,
 *         mailTekstStandaard, jaar, klaar, reden }
 *       klaar=false (met reden) als er geen SharePoint-map en/of geen e-mailadres bekend is bij
 *       de doelgroep — het versturen zelf (POST) controleert dit nogmaals server-side.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 * Alleen voor IB — VPB heeft geen fiscaal-partner-concept en dit is expliciet gevraagd voor de
 * aangifte inkomstenbelasting (Wouter, 04-08-2026).
 */
const { haalDynamicsToken, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";

function vulSjabloonIn(sjabloon, { klant, jaar }) {
  const basis = (sjabloon || "").trim() || "Aangifte inkomstenbelasting {jaar} - {klant}.pdf";
  const veiligeKlant = String(klant || "cliënt").replace(/[\\/:*?"<>|]/g, "-").trim();
  let naam = basis.replaceAll("{klant}", veiligeKlant).replaceAll("{jaar}", jaar != null ? String(jaar) : "");
  if (!/\.pdf$/i.test(naam)) naam += ".pdf";
  return naam;
}

// Zelfde plaatshouders als vulSjabloonIn hierboven, maar dan voor de mail-onderwerp/tekst-sjablonen
// (Beheer → Dossiers) — geen bestandsnaam-opmaak nodig, dus een eigen (simpelere) functie.
function vulMailSjabloonIn(sjabloon, { klant, jaar }) {
  return String(sjabloon || "").replaceAll("{klant}", klant || "cliënt").replaceAll("{jaar}", jaar != null ? String(jaar) : "");
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  const soortKey = (req.query && req.query.soort) || "";
  const dossierId = (req.query && req.query.id) || "";
  const doelgroep = (req.query && req.query.doelgroep) || "";
  if (soortKey !== "ib" || !dossierId || !["client", "partner"].includes(doelgroep)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort=ib', 'id' en 'doelgroep' (client/partner) mee." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const soort = SOORTEN.find((s) => s.key === "ib");
    const dossier = await haalEenDossier(resource, token, soort, dossierId);
    if (!dossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }

    const accountId = doelgroep === "partner" ? dossier.fiscaalPartnerAccountId : dossier.accountId;
    if (!accountId) {
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { klaar: false, reden: doelgroep === "partner" ? "Bij dit dossier is geen fiscaal partner ingevuld." : "Dit dossier heeft geen gekoppelde cliënt." },
      };
      return;
    }

    const accRes = await fetch(
      `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${SHAREPOINT_VELD}&$expand=primarycontactid($select=emailaddress1,fullname)`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (!accRes.ok) throw new Error(`Ophalen ontvanger mislukt: ${await accRes.text()}`);
    const acc = await accRes.json();
    const contact = acc.primarycontactid || {};
    const naam = acc.name || (doelgroep === "partner" ? dossier.fiscaalPartnerNaam : dossier.klantnaam) || "";
    const email = contact.emailaddress1 || "";
    const heeftSharepoint = !!acc[SHAREPOINT_VELD];

    let reden = "";
    if (!heeftSharepoint) reden = "Voor deze klant is nog geen SharePoint-map ingesteld (in Dynamics).";
    else if (!email) reden = "Voor deze klant is geen e-mailadres bekend bij de hoofdcontactpersoon in Dynamics.";

    const instellingen = await haalInstellingen().catch(() => ({}));
    const bestandsnaamStandaard = vulSjabloonIn(instellingen.aangifteBestandsnaamTemplate, { klant: naam, jaar: dossier.jaar });
    const mailOnderwerpStandaard = vulMailSjabloonIn(instellingen.aangifteMailOnderwerpTemplate, { klant: naam, jaar: dossier.jaar });
    const mailTekstStandaard = vulMailSjabloonIn(instellingen.aangifteMailTekstTemplate, { klant: naam, jaar: dossier.jaar });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        ontvanger: { accountId, naam, email },
        bestandsnaamStandaard,
        mailOnderwerpStandaard,
        mailTekstStandaard,
        jaar: dossier.jaar,
        klantnaamCliënt: dossier.klantnaam || "",
        klaar: heeftSharepoint && !!email,
        reden,
      },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de ontvanger niet ophalen.", detail: String(err.message || err) } };
  }
};
