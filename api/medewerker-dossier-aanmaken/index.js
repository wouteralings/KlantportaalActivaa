/**
 * /api/medewerker-dossier-aanmaken (POST) — nieuw fiscaal dossier aanmaken vanuit het
 * medewerkersportaal: de knop "+ Nieuwe Inkomstenbelasting" in Klantoverzicht → Inkomstenbelasting,
 * of "Aangifte kopiëren naar volgend jaar" vanuit een geopend dossier zelf. Twee vormen:
 *
 *   1. Kopiëren van een bestaande aangifte ("vorig jaar"):
 *      { soort, kopieerVanId, jaar }
 *      — cliënt en fiscaal partner worden overgenomen van het brondossier (kopieerVanId); alle
 *      catalogusvelden worden meegekopieerd BEHALVE de Review-sectie (review-/reactienotities,
 *      "Opmerkingen", "Controle") — dat zijn per-jaar workflow-/notitievelden, geen
 *      cliëntgegevens. Toelichting-velden (Algemeen/Box I/II/III) zitten NIET in de Review-sectie
 *      en worden dus gewoon meegenomen, zoals gevraagd.
 *   2. Nieuwe, lege aangifte:
 *      { soort, accountId, jaar, fiscaalPartnerschap?, fiscaalPartnerAccountId? }
 *
 * Een nieuw dossier krijgt altijd status "In bewerking" (601280000). Voorkomt een dubbele aangifte
 * voor dezelfde cliënt+jaar (schema is 1 rij per cliënt per jaar, zie project-doc) — HTTP 409 als
 * die al bestaat. Alleen soorten met een eigen vrije veldencatalogus worden ondersteund
 * (vooralsnog alleen IB — VPB volgt later, zie project-doc "IB eerst").
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, maakDossier, bestaatDossierAl, metAangepasteVelden, haalDynamischePicklistOpties } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

/** Zelf aangemaakte extra velden (Beheer → Dossiers, "Nieuw veld aanmaken") van deze soort — nodig
 * zodat zo'n veld ook echt meegekopieerd/meegeselecteerd kan worden, precies als bij het gewone
 * ophalen/bewerken van een dossier (zie haalIndeling() in medewerker-dossier/index.js). */
async function haalAangepasteVelden(soortKey) {
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling[soortKey];
    return eigen && Array.isArray(eigen.aangepasteVelden) ? eigen.aangepasteVelden : [];
  } catch {
    return [];
  }
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  if ((req.method || "").toUpperCase() !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
    return;
  }

  const email = haalEmailUitPrincipal(req);
  const { soort: soortKey, kopieerVanId, accountId: accountIdIn, jaar, fiscaalPartnerschap, fiscaalPartnerAccountId, partnerSituatie } = req.body || {};
  const soort = SOORTEN.find((s) => s.key === soortKey);
  if (!soort) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldige 'soort' mee." } }; return; }
  if (!Array.isArray(soort.catalogus)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: `Nieuwe dossiers aanmaken wordt voor ${soort.label} nog niet ondersteund.` } };
    return;
  }
  const jaarGetal = Number(jaar);
  if (!Number.isInteger(jaarGetal) || jaarGetal < 2000 || jaarGetal > 2100) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een geldig jaartal (2000–2100) mee." } };
    return;
  }
  if (!kopieerVanId && !accountIdIn) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een cliënt mee, of een dossier om van te kopiëren." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const aangepasteVelden = await haalAangepasteVelden(soort.key);
    const soortEffectief = metAangepasteVelden(soort, aangepasteVelden);

    let kopieerVanDossier = null;
    let accountId = accountIdIn || null;
    if (kopieerVanId) {
      kopieerVanDossier = await haalEenDossier(resource, token, soortEffectief, kopieerVanId);
      if (!kopieerVanDossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Het te kopiëren dossier is niet gevonden." } }; return; }
      accountId = kopieerVanDossier.accountId;
    }
    if (!accountId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kon geen cliënt bepalen." } }; return; }

    if (await bestaatDossierAl(resource, token, soortEffectief, accountId, jaarGetal)) {
      context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Er bestaat al een ${soort.label.toLowerCase()}-dossier voor deze cliënt in ${jaarGetal}.` } };
      return;
    }

    const velden = {};
    if (fiscaalPartnerschap !== undefined) velden.fiscaalpartnerschap = !!fiscaalPartnerschap;

    // "Huidige situatie" (cr283_gezinssituatie) is bij het aanmaken verplicht. We leiden 'm af uit
    // de partnerkeuze uit het aanmaakscherm: géén fiscaal partner -> "Alleenstaand"; wél een partner
    // -> "Getrouwd/gehuwd" of "Samenwonend" (req.body.partnerSituatie: "gehuwd" | "samenwonend").
    // De optiewaarde halen we live uit Dynamics op (zoals elders voor deze keuzelijst), zodat er
    // geen nummer hardgecodeerd staat — we matchen hoofdletterongevoelig op de stam van het label.
    // Alleen bij een nieuwe (niet-gekopieerde) aangifte; bij kopiëren neemt maakDossier de
    // gezinssituatie van het brondossier over. Best-effort: lukt het opzoeken/matchen niet, dan
    // laten we het veld leeg (en meldt Dynamics het desnoods zelf weer).
    const heeftFiscaalPartner = !!(fiscaalPartnerAccountId || (kopieerVanDossier && kopieerVanDossier.fiscaalPartnerAccountId));
    if (!kopieerVanDossier && velden.gezinssituatie === undefined) {
      const zoekTermen = !heeftFiscaalPartner
        ? ["alleenstaand"]
        : partnerSituatie === "samenwonend"
          ? ["samenwon"]
          : ["gehuw", "getrouwd"]; // getrouwd/gehuwd — ook de terugval als er geen keuze is meegestuurd
      try {
        const picklistOpties = await haalDynamischePicklistOpties(resource, token, soortEffectief);
        const opties = picklistOpties.gezinssituatie || [];
        const match = opties.find((o) => zoekTermen.some((t) => String(o.label).toLowerCase().includes(t)));
        if (match) velden.gezinssituatie = match.waarde;
      } catch (e) {
        context.log.error("Kon de standaard gezinssituatie niet bepalen:", e);
      }
    }

    const nieuwId = await maakDossier(resource, token, soortEffectief, {
      accountId,
      jaar: jaarGetal,
      fiscaalPartnerAccountId: fiscaalPartnerAccountId || null,
      kopieerVanDossier,
      velden,
    });
    const nieuwDossier = await haalEenDossier(resource, token, soortEffectief, nieuwId);

    await logGebeurtenis({
      door: email || "onbekend",
      actie: "dossier",
      accountId,
      accountIds: [accountId],
      klantnaam: nieuwDossier ? nieuwDossier.klantnaam : "",
      tekst: `Nieuw dossier ${soort.label} ${jaarGetal} aangemaakt${kopieerVanDossier ? ` (gekopieerd van ${kopieerVanDossier.jaar || "vorig jaar"})` : ""}.`,
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, dossier: nieuwDossier } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het dossier niet aanmaken.", detail: String(err.message || err) } };
  }
};
