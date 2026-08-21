/**
 * /api/medewerker-formulier — een toegevoegd PDF-formulier invullen voor een cliënt
 * (Medewerkersportaal → Klantoverzicht → Brieven → Formulieren).
 *
 *   GET                        → { formulieren: [{ id, naam, omschrijving, aantalPaginas }] }
 *   GET  ?id=<id>              → { formulier }  met de velden en de instellingen, om het scherm te bouwen
 *   POST { id, antwoorden, accountId?, klantnaam?, klantnummer?, opslaan? }
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

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const SUBMAP_STANDAARD = "Correspondentie";
const PDF_TYPE = "application/pdf";

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });
const veiligeStr = (v) => String(v == null ? "" : v).trim();

/** Waar ingevulde formulieren landen — instelbaar via Beheer (instellingen.formulierenMap). */
async function haalSubmap() {
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

    const klantnaam = veiligeStr(body.klantnaam);
    const datum = new Date().toISOString().slice(0, 10);
    const bestandsnaam = bestandsnaamVoor(formulier.naam, klantnaam, datum);

    let sharepoint;
    const accountId = veiligeStr(body.accountId);
    if (body.opslaan === true && accountId) {
      sharepoint = await naarSharepoint({ accountId, submap: await haalSubmap(), bestandsnaam, buffer: pdf });
      await logGebeurtenis({
        door: haalEmailUitPrincipal(req) || "onbekend",
        actie: "brief", accountId, accountIds: [accountId], klantnaam,
        tekst: `Formulier "${formulier.naam}" ingevuld${sharepoint.gedaan ? " en in SharePoint gezet" : ` (opslaan mislukt: ${sharepoint.reden})`}.`,
      }).catch(() => {});
    }

    // In het brievenlogboek zetten. Best-effort: het formulier zelf is al klaar en mag niet
    // sneuvelen op een logboek dat even niet bereikbaar is.
    await voegBriefToe({
      soort: "formulier",
      actie: sharepoint && sharepoint.gedaan ? "formulier-dossier" : "formulier",
      accountId: accountId || null,
      klantnummer: body.klantnummer ?? null,
      klantnaam,
      sjabloonnaam: formulier.naam,
      betreft: bestandsnaam,
      medewerker: haalEmailUitPrincipal(req) || "",
      pdfUrl: (sharepoint && sharepoint.url) || "",
    }).catch((e) => { if (context.log) context.log.warn("Formulier niet in het logboek gezet:", String((e && e.message) || e)); });

    context.res = json(200, { ok: true, bestandsnaam, pdf: pdf.toString("base64"), ...(sharepoint ? { sharepoint } : {}) });
  } catch (err) {
    if (err && err.message === "MISSING_CONFIG") { context.res = json(501, { error: "De opslag is nog niet geconfigureerd." }); return; }
    if (context.log) context.log.error("medewerker-formulier:", err);
    context.res = json(500, { error: "Kon het formulier niet invullen.", detail: String((err && err.message) || err) });
  }
};
