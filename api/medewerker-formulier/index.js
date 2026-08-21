/**
 * /api/medewerker-formulier — een toegevoegd PDF-formulier invullen voor een cliënt
 * (Medewerkersportaal → Klantoverzicht → Brieven → Formulieren).
 *
 *   GET                        → { formulieren: [{ id, naam, omschrijving, aantalPaginas }] }
 *   GET  ?id=<id>              → { formulier }  met de velden en de instellingen, om het scherm te bouwen
 *   POST { id, antwoorden, accountId?, klantnaam?, klantnummer?, actie?, zbs?, naar?, cc? }
 *
 * `actie` bepaalt wat er met het ingevulde formulier gebeurt — dezelfde vier als bij een brief:
 *   "maken"      → alleen de PDF terug (standaard)
 *   "dossier"    → ook in de SharePoint-map van de cliënt
 *   "backoffice" → in het dossier én een interne taak om te printen en te posten
 *   "mail"       → als bijlage naar de cliënt, en ook in het dossier
 * (`opslaan: true` blijft werken als synoniem voor actie "dossier".)
 *
 * Met `zbs: { adresRegels, regel }` komt er een voorblad op ons briefpapier vóór het formulier:
 * alleen het adres en één regel, zonder begeleidend schrijven. Zie _gedeeld/zbsVoorblad.js.
 *                              → { ok, bestandsnaam, pdf (base64), sharepoint? }
 *
 * Elk ingevuld formulier komt ook in het brievenlogboek (soort: "formulier"). Daar zie je terug wat
 * er is gemaakt en wanneer, en daar verwijder je het ook weer — inclusief het bestand in SharePoint,
 * met hetzelfde recht als voor brieven.
 *
 * Met `opslaan: true` gaat de ingevulde PDF ook naar de SharePoint-map van de cliënt, in dezelfde
 * submap als de brieven. De doelmap komt altijd server-side van het account (cr283_sharepoint) —
 * nooit uit de browser.
 */
const { haalDynamicsToken, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { haalFormulieren, haalFormulier, haalFormulierPdf } = require("../_gedeeld/formulieren");
const { vulFormulier, bestandsnaamVoor } = require("../_gedeeld/formulierVullen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { voegBriefToe } = require("../_gedeeld/briefLog");
const { maakZbsVoorblad, zetVoorbladVoor } = require("../_gedeeld/zbsVoorblad");
const { genereerKenmerk } = require("../_gedeeld/briefKenmerk");
const { verstuurMailMetBijlage } = require("../_gedeeld/mail");
const { maakBackofficeTaak } = require("../_gedeeld/backofficeTaak");
const { haalConfig } = require("../_gedeeld/briefSjablonen");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const SUBMAP_STANDAARD = "Correspondentie";
const PDF_TYPE = "application/pdf";

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Begeleidende mailtekst. Zonder eigen tekst een korte standaardzin — de PDF zit in de bijlage. */
function mailHtml(eigenTekst, formuliernaam, afzender) {
  const body = eigenTekst
    ? eigenTekst.replace(/\r\n/g, "\n").split(/\n[ \t]*\n/).filter((a) => a.trim())
      .map((a) => `<p style="margin:0 0 12px">${escapeHtml(a).replace(/\n/g, "<br>")}</p>`).join("")
    : `<p style="margin:0 0 12px">Bijgaand ontvangt u het formulier <strong>${escapeHtml(formuliernaam)}</strong>.</p>`;
  const groet = [String((afzender && afzender.afsluiting) || "Met vriendelijke groet,"), String((afzender && afzender.bedrijfsnaam) || "Activaa")]
    .map(escapeHtml).join("<br>");
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1C2321;line-height:1.5">${body}<p style="margin:16px 0 0">${groet}</p></div>`;
}
const veiligeStr = (v) => String(v == null ? "" : v).trim();

/**
 * Waar het ingevulde formulier in de SharePoint-map van de cliënt landt. Per formulier in te stellen
 * (Beheer → Formulieren); is dat leeg, dan de algemene map uit de instellingen, en anders
 * "Correspondentie". Een pad met schuine strepen mag: dan worden de submappen aangemaakt.
 */
async function haalSubmap(formulier) {
  const eigen = veiligeStr(formulier && formulier.map);
  if (eigen) return eigen;
  try {
    const inst = await haalInstellingen();
    return veiligeStr(inst && inst.formulierenMap) || SUBMAP_STANDAARD;
  } catch {
    return SUBMAP_STANDAARD;
  }
}

/** Best-effort upload naar de SharePoint-map van de cliënt. */
async function naarSharepoint({ accountId, submap, bestandsnaam, buffer }) {
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
    return { gedaan: false, reden: `Kon de SharePoint-map van deze cliënt niet opzoeken: ${String(e.message || e)}` };
  }
  if (!basisUrl) return { gedaan: false, reden: `Voor deze cliënt is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD}).` };
  try {
    const appToken = await haalAppGraphToken();
    const map = await resolveFolder(appToken, basisUrl);
    const segmenten = String(submap || SUBMAP_STANDAARD).split("/").map((s) => s.trim()).filter(Boolean);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, segmenten.length ? segmenten : [SUBMAP_STANDAARD]);
    const geupload = await uploadBestand(appToken, map.driveId, doelId, bestandsnaam, buffer, PDF_TYPE);
    return { gedaan: true, url: (geupload && geupload.webUrl) || "" };
  } catch (e) {
    return { gedaan: false, reden: `Opslaan in SharePoint mislukt: ${String(e.message || e)}` };
  }
}

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      const id = veiligeStr(req.query && req.query.id);
      if (id) {
        const formulier = await haalFormulier(id);
        if (!formulier) { context.res = json(404, { error: "Formulier niet gevonden." }); return; }
        context.res = json(200, { formulier });
        return;
      }
      // Alleen wat het scherm nodig heeft om een lijst te tonen — niet alle velden van elk formulier.
      const lijst = (await haalFormulieren()).map((f) => ({
        id: f.id, naam: f.naam, omschrijving: f.omschrijving, aantalPaginas: f.aantalPaginas,
        // Alleen wat je echt gevraagd wordt; velden die het formulier zelf invult tellen niet mee.
        aantalVelden: Array.isArray(f.velden) ? f.velden.filter((v) => !v.automatisch).length : 0,
      }));
      context.res = json(200, { formulieren: lijst });
      return;
    }

    if (methode !== "POST") { context.res = json(405, { error: "Methode niet ondersteund." }); return; }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const id = veiligeStr(body.id);
    if (!id) { context.res = json(400, { error: "Kies eerst een formulier." }); return; }
    const formulier = await haalFormulier(id);
    if (!formulier) { context.res = json(404, { error: "Formulier niet gevonden." }); return; }

    const pdfBlanco = await haalFormulierPdf(id);
    const pdf = await vulFormulier(pdfBlanco, {
      velden: formulier.velden,
      instellingen: formulier.instellingen,
      antwoorden: body.antwoorden,
    });

    // ZBS-voorblad ervoor, als het scherm daarom vraagt. Best-effort: gaat het renderen mis, dan
    // krijg je het formulier zonder voorblad plus de reden — beter dan helemaal niets.
    let pdfMetVoorblad = pdf;
    let zbs;
    const zbsWens = body.zbs && typeof body.zbs === "object" ? body.zbs : null;
    if (zbsWens && Array.isArray(zbsWens.adresRegels) && zbsWens.adresRegels.some((r) => veiligeStr(r))) {
      try {
        const voorblad = await maakZbsVoorblad({ adresRegels: zbsWens.adresRegels, regel: zbsWens.regel, kenmerk });
        pdfMetVoorblad = await zetVoorbladVoor(pdf, voorblad);
        zbs = { gedaan: true };
      } catch (e) {
        zbs = { gedaan: false, reden: String((e && e.message) || e) };
        if (context.log) context.log.warn("ZBS-voorblad maken mislukt:", zbs.reden);
      }
    } else if (zbsWens) {
      zbs = { gedaan: false, reden: "Er is geen adres voor het voorblad — kies een cliënt met een belastingkantoor, of vul een vast adres in bij Beheer." };
    }

    const klantnaam = veiligeStr(body.klantnaam);
    const accountId = veiligeStr(body.accountId);
    const email = haalEmailUitPrincipal(req) || "";
    const actie = veiligeStr(body.actie).toLowerCase() || (body.opslaan === true ? "dossier" : "maken");
    const bewaren = actie === "dossier" || actie === "backoffice" || actie === "mail";

    // Kenmerk uit dezelfde teller als de brieven, zodat brieven en formulieren samen doornummeren
    // per cliënt per jaar. Best-effort: zonder kenmerk gaat het formulier gewoon door.
    let kenmerk = "";
    try { kenmerk = await genereerKenmerk(body.klantnummer); } catch { kenmerk = ""; }

    const datum = new Date().toISOString().slice(0, 10);
    // Kenmerk in de bestandsnaam, net als bij brieven: twee formulieren van dezelfde soort op
    // dezelfde dag overschrijven elkaar dan niet in het dossier.
    const bestandsnaam = bestandsnaamVoor(formulier.naam, klantnaam, [datum, kenmerk].filter(Boolean).join(" - "));

    let sharepoint;
    if (bewaren && accountId) {
      sharepoint = await naarSharepoint({ accountId, submap: await haalSubmap(formulier), bestandsnaam, buffer: pdfMetVoorblad });
      await logGebeurtenis({
        door: email || "onbekend",
        actie: "brief", accountId, accountIds: [accountId], klantnaam,
        tekst: `Formulier "${formulier.naam}" ingevuld${sharepoint.gedaan ? " en in SharePoint gezet" : ` (opslaan mislukt: ${sharepoint.reden})`}.`,
      }).catch(() => {});
    } else if (bewaren && !accountId) {
      sharepoint = { gedaan: false, reden: "Kies eerst een cliënt om het formulier bij op te slaan." };
    }

    // Naar de backoffice: interne taak om te printen en per post te versturen.
    let backoffice;
    if (actie === "backoffice" && accountId) {
      const cfg = await haalConfig().catch(() => ({ afzender: {} }));
      const az = (cfg && cfg.afzender) || {};
      backoffice = await maakBackofficeTaak({
        context, accountId, klantnaam,
        onderwerp: `Formulier printen en versturen — ${formulier.naam}`,
        soortWaarde: Number(az.backofficeTaakSoort),
        rubriekWaarde: Number(az.backofficeTaakRubriek),
        dossierGelukt: !!(sharepoint && sharepoint.gedaan),
        submap: await haalSubmap(formulier),
        briefUrl: (sharepoint && sharepoint.url) || "",
        stuknaam: "formulier",
      });
    }

    // Mailen naar de cliënt, met het formulier als bijlage.
    let mail;
    if (actie === "mail") {
      const naar = veiligeStr(body.naar);
      if (!naar) {
        context.res = json(400, { error: "Geen e-mailadres van de ontvanger meegegeven." });
        return;
      }
      const cfg = await haalConfig().catch(() => ({ afzender: {} }));
      const az = (cfg && cfg.afzender) || {};
      const onderwerp = veiligeStr(body.mailOnderwerp) || `${formulier.naam}${klantnaam ? ` — ${klantnaam}` : ""}`;
      try {
        const uit = await verstuurMailMetBijlage({
          naar,
          cc: Array.isArray(body.cc) ? body.cc : (body.cc ? [body.cc] : []),
          onderwerp,
          html: mailHtml(veiligeStr(body.mailTekst), formulier.naam, az),
          bijlagen: [{ naam: bestandsnaam, contentType: PDF_TYPE, inhoud: pdfMetVoorblad }],
          afzender: az.mailAfzender || "",
        });
        mail = { verzonden: true, van: uit && uit.van };
      } catch (e) {
        mail = { verzonden: false, reden: String((e && e.message) || e) };
      }
    }

    // In het brievenlogboek zetten. Best-effort: het formulier zelf is al klaar en mag niet
    // sneuvelen op een logboek dat even niet bereikbaar is.
    await voegBriefToe({
      soort: "formulier",
      actie: mail && mail.verzonden ? "formulier-mail"
        : backoffice ? "formulier-backoffice"
        : (sharepoint && sharepoint.gedaan) ? "formulier-dossier"
        : "formulier",
      kenmerk,
      naar: mail ? veiligeStr(body.naar) : "",
      cc: mail && body.cc ? (Array.isArray(body.cc) ? body.cc.join(", ") : String(body.cc)) : "",
      accountId: accountId || null,
      klantnummer: body.klantnummer ?? null,
      klantnaam,
      sjabloonnaam: formulier.naam,
      betreft: bestandsnaam,
      medewerker: email,
      pdfUrl: (sharepoint && sharepoint.url) || "",
    }).catch((e) => { if (context.log) context.log.warn("Formulier niet in het logboek gezet:", String((e && e.message) || e)); });

    context.res = json(200, {
      ok: true, bestandsnaam, kenmerk, pdf: pdfMetVoorblad.toString("base64"),
      ...(sharepoint ? { sharepoint } : {}), ...(zbs ? { zbs } : {}),
      ...(backoffice ? { backoffice } : {}), ...(mail ? { mail } : {}),
    });
  } catch (err) {
    if (err && err.message === "MISSING_CONFIG") { context.res = json(501, { error: "De opslag is nog niet geconfigureerd." }); return; }
    if (context.log) context.log.error("medewerker-formulier:", err);
    context.res = json(500, { error: "Kon het formulier niet invullen.", detail: String((err && err.message) || err) });
  }
};
