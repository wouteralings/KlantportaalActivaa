/**
 * /api/brieven — genereren, mailen en in het klantdossier opslaan van een standaardbrief
 * (medewerkersportaal → Klantoverzicht → Brieven). Rol beheerder + medewerker (zie
 * staticwebapp.config.json).
 *
 * De frontend (BrievenOverzicht.jsx) heeft de gekozen sjabloontekst al met de Dynamics-gegevens
 * van de klant ingevuld en stuurt een kant-en-klaar `brief`-object mee (zie briefRenderer.js voor
 * de vorm). Dit endpoint rendert dat naar PDF/Word en verstuurt/archiveert het.
 *
 *   POST { actie: "genereer", formaat: "pdf"|"docx", brief, bestandsnaamBasis }
 *        → { bestandsnaam, contentType, base64 }
 *
 *   POST { actie: "mail", brief, naar, cc, bestandsnaamBasis }
 *        → { verzonden: true, van }          (PDF als bijlage + de brieftekst in de mail zelf)
 *
 *   POST { actie: "dossier", accountId, formaat: "pdf"|"docx", brief, bestandsnaamBasis }
 *        → { gedaan: true } of { gedaan: false, reden }   (kopie in de SharePoint-map van de klant)
 *
 * Beveiliging: bij "dossier" wordt de doelmap ALTIJD server-side uit Dynamics afgeleid op basis van
 * accountId (cr283_sharepoint) — nooit uit iets wat de browser meestuurt (zie graphApp.js).
 */
const { genereerBriefPdf, genereerBriefDocx } = require("../_gedeeld/briefRenderer");
const { vulBriefpapier } = require("../_gedeeld/briefWordpapier");
const { verstuurMailMetBijlage } = require("../_gedeeld/mail");
const { haalConfig } = require("../_gedeeld/briefSjablonen");
const { haalAfbeelding } = require("../_gedeeld/media");
const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";

const PDF_TYPE = "application/pdf";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function veiligeBestandsnaam(basis, ext) {
  const schoon = String(basis || "Brief")
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Brief";
  return `${schoon}.${ext}`;
}

const MAX_BIJLAGE_BYTES = 20 * 1024 * 1024; // 20 MB (voor het dossier); e-mail is in de praktijk kleiner begrensd

/** Saniteert de originele bestandsnaam van een bijlage (extensie behouden). */
function veiligeBijlageNaam(naam) {
  return String(naam || "bijlage")
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "bijlage";
}

/**
 * Leest een door de medewerker meegestuurde bijlage `{ naam, dataUrl }` (zoals een klant een PDF
 * uploadt: als data-URL) om naar `{ naam, contentType, buffer }`. Geeft null bij geen/ongeldige
 * bijlage; gooit BIJLAGE_TE_GROOT als het bestand groter is dan MAX_BIJLAGE_BYTES.
 */
function leesBijlage(bijlage) {
  if (!bijlage || typeof bijlage !== "object") return null;
  const dataUrl = String(bijlage.dataUrl || "");
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const contentType = (m[1] || "").trim() || "application/octet-stream";
  const buffer = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  if (!buffer || buffer.length === 0) return null;
  if (buffer.length > MAX_BIJLAGE_BYTES) { const e = new Error("BIJLAGE_TE_GROOT"); e.code = "BIJLAGE_TE_GROOT"; throw e; }
  return { naam: veiligeBijlageNaam(bijlage.naam), contentType, buffer };
}

async function rennerVoorFormaat(formaat, brief) {
  if (formaat === "docx") {
    // Is er een Word-briefpapier ingesteld? Dan de brief in dát briefpapier zetten (huisstijl 1-op-1).
    // Best-effort: mislukt dat, dan de standaard docx-generatie.
    const viaPapier = await vulBriefpapier(brief).catch(() => null);
    if (viaPapier) return { buffer: viaPapier, contentType: DOCX_TYPE, ext: "docx" };
    return { buffer: await genereerBriefDocx(brief), contentType: DOCX_TYPE, ext: "docx" };
  }
  return { buffer: await genereerBriefPdf(brief), contentType: PDF_TYPE, ext: "pdf" };
}

/** Haalt de blob-basisnaam uit een media-URL (/api/media/<naam>?v=...), zoals facturenPdf. */
function basisnaamUitMediaUrl(url) {
  const m = /\/api\/media\/([a-z0-9_-]+)/i.exec(url || "");
  return m ? m[1] : null;
}

/**
 * Laadt (best-effort) de logo-bytes voor het briefpapier op basis van brief.logoUrl en hangt ze aan
 * het brief-object (brief.logo = { buffer, contentType }). Een ontbrekend/onleesbaar logo mag de
 * brief nooit laten mislukken — dan wordt gewoon zonder logo gerenderd.
 */
async function verrijkMetLogo(brief) {
  const logoNaam = basisnaamUitMediaUrl(brief && brief.logoUrl);
  if (logoNaam) {
    try {
      const afb = await haalAfbeelding(logoNaam);
      if (afb && afb.buffer) brief.logo = { buffer: afb.buffer, contentType: afb.contentType };
    } catch { /* zonder logo verder */ }
  }
  const achtergrondNaam = basisnaamUitMediaUrl(brief && brief.achtergrondUrl);
  if (achtergrondNaam) {
    try {
      const afb = await haalAfbeelding(achtergrondNaam);
      if (afb && afb.buffer) brief.achtergrond = { buffer: afb.buffer, contentType: afb.contentType };
    } catch { /* zonder achtergrond verder */ }
  }
  return brief;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Bouwt een leesbare HTML-mailtekst uit het brief-object (de brief staat óók als PDF in de bijlage). */
function mailHtmlVan(brief) {
  const b = brief || {};
  const alineas = String(b.tekst || "")
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((a) => escapeHtml(a).replace(/\n/g, "<br>"))
    .filter((a) => a.trim() !== "")
    .map((a) => `<p style="margin:0 0 12px">${a}</p>`)
    .join("");
  const onderteken = (b.ondertekenaarRegels || []).map((r) => escapeHtml(r)).join("<br>");
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1C2321;line-height:1.5">
    ${b.onderwerp ? `<p style="margin:0 0 12px"><strong>Betreft: ${escapeHtml(b.onderwerp)}</strong></p>` : ""}
    ${b.aanhef ? `<p style="margin:0 0 12px">${escapeHtml(b.aanhef)}</p>` : ""}
    ${alineas}
    ${b.afsluiting ? `<p style="margin:16px 0 0">${escapeHtml(b.afsluiting)}</p>` : ""}
    ${onderteken ? `<p style="margin:24px 0 0">${onderteken}</p>` : ""}
  </div>`;
}

/** Kopieert een gegenereerde brief (en optioneel een bijlage) naar
 *  <SharePoint-map van de klant>/<submap>/. */
async function naarDossier({ accountId, submap, bestandsnaam, buffer, contentType, bijlage }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) return { gedaan: false, reden: "Dynamics-koppeling is nog niet geconfigureerd." };

  let basisUrl = "";
  try {
    const dynToken = await haalDynamicsToken();
    const res = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=${SHAREPOINT_VELD}`, {
      headers: { Authorization: `Bearer ${dynToken}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    });
    if (res.ok) basisUrl = (await res.json())[SHAREPOINT_VELD] || "";
  } catch (e) {
    return { gedaan: false, reden: `Kon de SharePoint-map van deze klant niet opzoeken: ${String(e.message || e)}` };
  }
  if (!basisUrl) return { gedaan: false, reden: `Voor deze klant is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD}).` };

  try {
    const appToken = await haalAppGraphToken();
    const map = await resolveFolder(appToken, basisUrl);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, [submap || "Brieven"]);
    await uploadBestand(appToken, map.driveId, doelId, bestandsnaam, buffer, contentType);
    if (bijlage && bijlage.buffer) await uploadBestand(appToken, map.driveId, doelId, bijlage.naam, bijlage.buffer, bijlage.contentType);
    return { gedaan: true };
  } catch (e) {
    const reden = e && e.code === "APP_TOKEN_MISLUKT"
      ? "Kon geen app-toegang tot SharePoint krijgen (Graph-applicatiepermissie/admin-consent controleren)."
      : String(e.message || e);
    return { gedaan: false, reden };
  }
}

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const body = req.body || {};
  const actie = String(body.actie || "").toLowerCase();
  const brief = body.brief || {};
  if (!brief || typeof brief !== "object") {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen brief meegegeven." } };
    return;
  }

  try {
    // Briefpapier-logo (best-effort) aan het brief-object hangen vóór het renderen/versturen.
    await verrijkMetLogo(brief);
    // Optionele bijlage die de medewerker meestuurt (gaat mee bij mailen en in het dossier).
    const bijlage = leesBijlage(body.bijlage);

    if (actie === "genereer") {
      const formaat = body.formaat === "docx" ? "docx" : "pdf";
      const { buffer, contentType, ext } = await rennerVoorFormaat(formaat, brief);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: {
          bestandsnaam: veiligeBestandsnaam(body.bestandsnaamBasis, ext),
          contentType,
          base64: Buffer.from(buffer).toString("base64"),
        },
      };
      return;
    }

    if (actie === "mail") {
      const naar = String(body.naar || "").trim();
      if (!naar) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen e-mailadres van de ontvanger meegegeven." } };
        return;
      }
      const pdf = await genereerBriefPdf(brief);
      const bijlagen = [{ naam: veiligeBestandsnaam(body.bestandsnaamBasis, "pdf"), contentType: PDF_TYPE, inhoud: pdf }];
      if (bijlage) bijlagen.push({ naam: bijlage.naam, contentType: bijlage.contentType, inhoud: bijlage.buffer });
      const resultaat = await verstuurMailMetBijlage({
        naar,
        cc: Array.isArray(body.cc) ? body.cc : (body.cc ? [body.cc] : []),
        onderwerp: brief.onderwerp || "Brief van Activaa",
        html: mailHtmlVan(brief),
        bijlagen,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { verzonden: true, van: resultaat.van } };
      return;
    }

    if (actie === "dossier") {
      const accountId = String(body.accountId || "").trim();
      if (!accountId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen accountId meegegeven." } };
        return;
      }
      const formaat = body.formaat === "docx" ? "docx" : "pdf";
      const { buffer, contentType, ext } = await rennerVoorFormaat(formaat, brief);
      const config = await haalConfig().catch(() => ({ sharepointMap: "Brieven" }));
      const resultaat = await naarDossier({
        accountId,
        submap: config.sharepointMap || "Brieven",
        bestandsnaam: veiligeBestandsnaam(body.bestandsnaamBasis, ext),
        buffer,
        contentType,
        bijlage,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: resultaat };
      return;
    }

    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie. Kies 'genereer', 'mail' of 'dossier'." } };
  } catch (err) {
    if (err.code === "BIJLAGE_TE_GROOT") {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "De bijlage is te groot (maximaal 20 MB)." } };
      return;
    }
    if (err.message === "MISSING_MAIL_SENDER") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "E-mailverzending is nog niet geconfigureerd (GRAPH_MAIL_SENDER ontbreekt)." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij het verwerken van de brief.", detail: String(err) } };
  }
};
