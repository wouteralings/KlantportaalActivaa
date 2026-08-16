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
 * Werkt voor IB én VPB (Wouter, 05-08-2026). VPB heeft geen fiscaal-partner-concept, dus daar geldt
 * alleen doelgroep "client". De sjablonen (bestandsnaam/mail/pad/taak) worden per soort apart
 * bewaard — IB op de bestaande sleutels, VPB op parallelle "_vpb"-sleutels (zie aangKey()).
 */
const { haalDynamicsToken, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const dossierVoorlopig = require("../_gedeeld/dossierVoorlopig");
const dossierTaakketen = require("../_gedeeld/dossierTaakketen");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";

// Per-soort instellingsleutel: IB houdt de bestaande (legacy) sleutels, VPB krijgt "_vpb".
function aangKey(basis, soortKey) {
  return soortKey === "ib" ? basis : `${basis}_${soortKey}`;
}

function vulSjabloonIn(sjabloon, { klant, jaar, soortWoord }) {
  const basis = (sjabloon || "").trim() || `Aangifte ${soortWoord || "aangifte"} {jaar} - {klant}.pdf`;
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

/**
 * Bestandsnaam van een VOORLOPIGE aangifte: "Voorlopig — " ervoor, of de plaatshouder {voorlopig}
 * als die in het sjabloon staat. De ".pdf" moet natuurlijk achteraan blijven staan, dus dat doen we
 * hier apart in plaats van met de generieke vulVoorlopigIn.
 */
function voorlopigeBestandsnaam(naam, voorlopig) {
  const s = String(naam || "");
  if (s.includes("{voorlopig}")) return s.replaceAll("{voorlopig}", voorlopig ? "voorlopige " : "").replace(/\s{2,}/g, " ");
  if (!voorlopig) return s;
  return `Voorlopig - ${s}`;
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
  const soort = SOORTEN.find((s) => s.key === soortKey);
  // VPB kent geen fiscaal partner — daar geldt alleen doelgroep "client".
  const geldigeDoelgroepen = soortKey === "ib" ? ["client", "partner"] : ["client"];
  if (!soort || !dossierId || !geldigeDoelgroepen.includes(doelgroep)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldige 'soort' (ib/vpb), 'id' en 'doelgroep' mee." } };
    return;
  }
  const soortWoord = soort.label.toLowerCase();

  try {
    const token = await haalDynamicsToken();
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
    // Staat dit dossier als VOORLOPIGE aangifte gemarkeerd? Dan draait hetzelfde verstuurproces,
    // maar met "voorlopig" in de bestandsnaam, het mailonderwerp en de mailtekst. Zet de
    // plaatshouder {voorlopig} in je sjablonen om zelf te bepalen wáár dat woord komt; zonder die
    // plaatshouder zetten we er "Voorlopig — " voor.
    const voorlopigNu = await dossierVoorlopig.haalVoorDossier(soortKey, dossierId).catch(() => null);
    const isVoorlopig = !!(voorlopigNu && voorlopigNu.status === "open");
    const vv = (s) => dossierTaakketen.vulVoorlopigIn(s, isVoorlopig);
    const bestandsnaamStandaard = voorlopigeBestandsnaam(
      vulSjabloonIn(instellingen[aangKey("aangifteBestandsnaamTemplate", soortKey)], { klant: naam, jaar: dossier.jaar, soortWoord }),
      isVoorlopig,
    );
    const mailOnderwerpStandaard = vv(vulMailSjabloonIn(instellingen[aangKey("aangifteMailOnderwerpTemplate", soortKey)], { klant: naam, jaar: dossier.jaar }));
    const mailTekstStandaard = vv(vulMailSjabloonIn(instellingen[aangKey("aangifteMailTekstTemplate", soortKey)], { klant: naam, jaar: dossier.jaar }));

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
        // Zodat het scherm er "voorlopige aangifte" van kan maken (kop, uitleg en verstuurknop).
        voorlopig: isVoorlopig,
        voorlopigReden: isVoorlopig ? (voorlopigNu.redenLabel || "") : "",
      },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de ontvanger niet ophalen.", detail: String(err.message || err) } };
  }
};
