/**
 * /api/taken-document — geeft de INHOUD van het document dat bij een taak hoort terug aan een
 * ingelogde cliënt, GEPROXYD via app-only Microsoft Graph (in tegenstelling tot /api/document-inhoud,
 * dat on-behalf-of werkt met de échte SharePoint-rechten van de klant). Nodig omdat een via
 * "Aangifte versturen" (zie api/medewerker-aangifte-versturen) geüploade PDF in de map
 * "Correspondentie" van het SharePoint-klantdossier staat, waar de klant zelf geen (en ook geen
 * OBO-)toegang toe heeft — de enige poort is deze route, met de toegangscontrole hieronder.
 *
 * GET ?taakId=<task-guid>&index=<0-based, optioneel>
 *   → 200 met de PDF/documentinhoud (inline), of 403/404 als de taak niet bij de ingelogde
 *     cliënt hoort, niet zichtbaar is (Beheer → Taken), of geen documentlink heeft.
 *     Draagt de taak meerdere documenten (stuk + bijlage, zie api/_gedeeld/taakDocumenten.js), dan
 *     kiest `index` welke; zonder index krijg je het eerste.
 *
 * Toegangscontrole (in deze volgorde):
 *   1. herleidAccounts(req, token) — welke Dynamics-accounts horen bij de ingelogde cliënt.
 *   2. De taak moet via "Cliënt" (sk_client) of "Betreft" bij één van die accounts horen.
 *   3. De taak moet van een soort zijn die in Beheer → Taken op "zichtbaar" staat — anders zou
 *      een cliënt een document kunnen opvragen van een taaksoort die nooit aan hem getoond wordt.
 *   4. Er moet daadwerkelijk een documentlink op de taak staan (DYNAMICS_TAAK_DOCUMENT_VELD).
 * Pas als dit allemaal klopt wordt het bestand met de APP-rechten (niet de klant-rechten) bij
 * SharePoint opgehaald — zie de uitleg in api/_gedeeld/graphApp.js.
 */
const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { resolveFolder } = require("../_gedeeld/sharepointUpload");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { splitsDocumentLinks } = require("../_gedeeld/taakDocumenten");

const DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const KLANT_VALUE = `_${KLANT_VELD}_value`;
const GRAPH = "https://graph.microsoft.com/v1.0";

const DYNAMICS_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
});

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const taakId = (req.query && req.query.taakId) || "";
  if (!taakId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'taakId' mee." } }; return; }

  if (!DOCUMENT_VELD) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Documentweergave is niet geconfigureerd." } }; return; }

  try {
    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);
    const accountIds = accounts.map((a) => a.accountId);
    if (accountIds.length === 0) { context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } }; return; }

    const select = `$select=${KLANT_VALUE},_regardingobjectid_value,${DOCUMENT_VELD}${SOORT_VELD ? "," + SOORT_VELD : ""}`;
    const taakRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?${select}`, { headers: DYNAMICS_HEADERS(token) });
    if (!taakRes.ok) { context.res = { status: taakRes.status === 404 ? 404 : 502, headers: { "Content-Type": "application/json" }, body: { error: "Taak niet gevonden." } }; return; }
    const taak = await taakRes.json();

    const taakAccountId = taak[KLANT_VALUE] || taak._regardingobjectid_value;
    if (!accountIds.includes(taakAccountId)) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Deze taak hoort niet bij een van jouw accounts." } };
      return;
    }

    if (SOORT_VELD) {
      const instellingen = await haalInstellingen().catch(() => ({}));
      const soortConfig = instellingen.taaksoorten || {};
      const soortWaarde = taak[SOORT_VELD];
      const zichtbaar = soortWaarde != null && soortConfig[String(soortWaarde)]?.zichtbaar;
      if (!zichtbaar) { context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Deze taak is niet zichtbaar." } }; return; }
    }

    // Eén taak kan meerdere documenten dragen (stuk + bijlage, bijv. notulen + aangifte
    // dividendbelasting). ?index= kiest welke; zonder index krijg je het eerste — precies wat
    // bestaande links deden toen er nog maar één document per taak was.
    const links = splitsDocumentLinks(taak[DOCUMENT_VELD]);
    if (links.length === 0) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Geen document bij deze taak." } }; return; }
    const gevraagd = Number((req.query && req.query.index) || 0);
    const index = Number.isInteger(gevraagd) && gevraagd >= 0 && gevraagd < links.length ? gevraagd : 0;
    const documentUrl = links[index];

    const appToken = await haalAppGraphToken();
    const item = await resolveFolder(appToken, documentUrl);

    const inhoudRes = await fetch(`${GRAPH}/drives/${item.driveId}/items/${item.itemId}/content`, {
      headers: { Authorization: `Bearer ${appToken}` },
    });
    if (!inhoudRes.ok) {
      const detail = await inhoudRes.text().catch(() => "");
      context.res = { status: inhoudRes.status === 404 ? 404 : 502, headers: { "Content-Type": "application/json" }, body: { error: "Document ophalen bij SharePoint mislukt.", detail: detail.slice(0, 500) } };
      return;
    }

    const buffer = Buffer.from(await inhoudRes.arrayBuffer());
    const contentType = inhoudRes.headers.get("content-type") || "application/pdf";

    context.res = {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
      body: buffer,
      isRaw: true,
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics/Graph-koppeling is nog niet volledig geconfigureerd." } }; return; }
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij ophalen van het document.", detail: String(err) } };
  }
};
