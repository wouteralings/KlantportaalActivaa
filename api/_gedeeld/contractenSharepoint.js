/**
 * Optionele archiefkopie van een contractdocument in het SharePoint-klantdossier — sinds
 * 04-08-2026 op verzoek van Wouter ("de contracten als bijlage in klantdossier willen opbergen
 * net als met uitvraag documenten. Dit willen we kunnen instellen."). Instelbaar via
 * Beheer → Facturatie (contractenSharepointOpslag aan/uit + contractenSharepointMap, zie
 * api/_gedeeld/instellingen.js) — standaard UIT.
 *
 * BEWUST een aanvulling op, niet een vervanging van, de bestaande Blob-opslag in
 * contractenDocumenten.js: die blijft de bron voor de documentenlijst/-download in het portaal
 * zelf (zie de toelichting daar voor waarom); dit is puur een extra kopie in het klantdossier,
 * zodat medewerkers die gewend zijn de SharePoint-map van een klant te doorzoeken (net als bij
 * aanlever-uitvragen, api/mijn-aanleververzoeken) contractdocumenten daar ook terugvinden.
 *
 * Zelfde app-only Graph-mechanisme als api/document-aanleveren en api/mijn-aanleververzoeken
 * (haalAppGraphToken + resolveFolder/ensureFolderPath/uploadBestand uit sharepointUpload.js) —
 * LET OP: gebruikt bewust de naam haalAppGraphToken (de daadwerkelijke export van graphApp.js).
 * Een aantal andere bestanden (mijn-aanleververzoeken/mijn-documenten/mijn-document-inhoud)
 * importeren abusievelijk 'haalGraphAppToken' (omgedraaid), wat een ReferenceError/TypeError zou
 * geven zodra dat codepad daadwerkelijk wordt aangeroepen — zie de aparte melding hierover; dat is
 * bestaand werk en bewust niet in deze wijziging meegenomen (buiten scope van "contracten").
 *
 * Best-effort: als dit misgaat (geen SharePoint-map bij de klant, Graph-permissie ontbreekt, etc.)
 * gooit dit GEEN fout die de hoofdupload (naar de eigen Blob-opslag) laat mislukken — de aanroeper
 * (api/contracten-documenten) slaat het resultaat op als {gedaan, reden} in de response, zodat de
 * klant een duidelijke (niet-blokkerende) melding kan zien.
 */
const { haalDynamicsToken } = require("./identiteit");
const { haalAppGraphToken } = require("./graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("./sharepointUpload");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";

function veiligeMapnaam(naam) {
  return String(naam || "")
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Contract";
}

/**
 * Kopieert één contractdocument naar <basismap-klant>/<submap>/<contractnaam>/<bestandsnaam>.
 * Geeft { gedaan: true } bij succes, of { gedaan: false, reden } als het (om een niet-fatale
 * reden) niet lukte.
 */
async function kopieerNaarDossier({ accountId, contract, bestandsnaam, buffer, contentType, submap }) {
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
    const contractMapNaam = veiligeMapnaam(`${contract.naam}${contract.leverancier ? " - " + contract.leverancier : ""}`);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, [submap || "Contracten", contractMapNaam]);
    await uploadBestand(appToken, map.driveId, doelId, bestandsnaam, buffer, contentType);
    return { gedaan: true };
  } catch (e) {
    const reden = e && e.code === "APP_TOKEN_MISLUKT"
      ? "Kon geen app-toegang tot SharePoint krijgen (Graph-applicatiepermissie/admin-consent controleren)."
      : String(e.message || e);
    return { gedaan: false, reden };
  }
}

module.exports = { kopieerNaarDossier };
