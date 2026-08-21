/**
 * /api/medewerker-liquidatie-formulier — KvK-formulier 17a ("Ontbinding melden van een
 * rechtspersoon") digitaal invullen vanuit het liquidatiedossier.
 *
 * Het formulier is een invulbaar PDF-formulier van KvK. We vullen de velden met de antwoorden uit
 * het opstelscherm — grotendeels al voorgevuld uit de klantkaart en het dossier — en geven de PDF
 * terug. De handtekening blijft handwerk: KvK eist een handtekening met pen, geen kopie of scan.
 * Vandaar de bedoeling: digitaal invullen, afdrukken, tekenen, opsturen.
 *
 *   POST { antwoorden, accountId?, klantnaam?, datum?, opslaan? }
 *     → { ok, bestandsnaam, pdf (base64), ontbrekend: [...], sharepoint?: { gedaan, reden, url } }
 *
 * `ontbrekend` blokkeert niets: je mag het formulier half ingevuld afdrukken en met pen afmaken.
 * Het scherm gebruikt het alleen om te laten zien wat er nog mist.
 *
 * Met `opslaan: true` gaat de PDF óók naar de SharePoint-map van de cliënt, in dezelfde submap als
 * de liquidatiestukken. De doelmap wordt altijd server-side uit het account gehaald (cr283_sharepoint)
 * en nooit uit de browser overgenomen.
 */
const { haalDynamicsToken, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { vulFormulier17a, bestandsnaamVoor } = require("../_gedeeld/kvkFormulierVullen");
const { ontbrekend } = require("../_gedeeld/kvkFormulier17a");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const SUBMAP_STANDAARD = "Liquidatie";
const PDF_TYPE = "application/pdf";

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });
const veiligeStr = (v) => String(v == null ? "" : v).trim();

/** De submap waar liquidatiestukken landen — dezelfde instelling als het stuk zelf. */
async function haalSubmap() {
  try {
    const inst = await haalInstellingen();
    return veiligeStr(inst && inst.liquidatieMap) || SUBMAP_STANDAARD;
  } catch {
    return SUBMAP_STANDAARD;
  }
}

/** Best-effort upload naar de SharePoint-map van de cliënt. Mislukt dit, dan blijft de PDF bruikbaar. */
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

/** De aanpassingen uit Beheer → Liquidatiestukken: eigen labels, verborgen vragen, vaste antwoorden. */
async function haalKvkCfg() {
  try {
    const inst = await haalInstellingen();
    return (inst && inst.kvk17a && typeof inst.kvk17a === "object") ? inst.kvk17a : {};
  } catch {
    return {};
  }
}

module.exports = async function (context, req) {
  // GET geeft alleen de instellingen terug, zodat het opstelscherm dezelfde labels en verborgen
  // vragen kan tonen als waarmee straks gevuld wordt. Bewust hier en niet in /api/instellingen:
  // dat endpoint is ook voor cliënten leesbaar en dit is intern.
  if (req.method === "GET") {
    context.res = json(200, { kvk17a: await haalKvkCfg() });
    return;
  }
  if (req.method !== "POST") {
    context.res = json(405, { error: "Methode niet ondersteund." });
    return;
  }

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const antwoorden = (body.antwoorden && typeof body.antwoorden === "object") ? body.antwoorden : {};
  const accountId = veiligeStr(body.accountId);
  const klantnaam = veiligeStr(body.klantnaam) || veiligeStr(antwoorden["1.1.1"]);
  const datum = veiligeStr(body.datum) || veiligeStr(antwoorden["2.1.1"]);

  try {
    const cfg = await haalKvkCfg();
    // Een verborgen vraag komt ook niet op papier: wat je niet in beeld hebt gehad, hoort er niet
    // te staan. Daarom eerst de antwoorden van verborgen vragen eruit.
    const zichtbaar = {};
    for (const [id, waarde] of Object.entries(antwoorden)) {
      if (cfg[id] && cfg[id].verborgen === true) continue;
      zichtbaar[id] = waarde;
    }
    const pdf = await vulFormulier17a(zichtbaar);
    const bestandsnaam = bestandsnaamVoor(klantnaam, datum);
    const mist = ontbrekend(zichtbaar, cfg);

    let sharepoint;
    if (body.opslaan === true && accountId) {
      const submap = await haalSubmap();
      sharepoint = await naarSharepoint({ accountId, submap, bestandsnaam, buffer: pdf });
      // Het klantlogboek bijhouden is bijzaak: lukt dat niet, dan is het formulier er nog steeds.
      await logGebeurtenis({
        door: haalEmailUitPrincipal(req) || "onbekend",
        actie: "dossier",
        accountId, accountIds: [accountId], klantnaam,
        tekst: `KvK-formulier 17a ingevuld${sharepoint.gedaan ? " en in SharePoint gezet" : ` (opslaan mislukt: ${sharepoint.reden})`}.`,
      }).catch(() => {});
    }

    context.res = json(200, {
      ok: true,
      bestandsnaam,
      pdf: pdf.toString("base64"),
      ontbrekend: mist,
      ...(sharepoint ? { sharepoint } : {}),
    });
  } catch (err) {
    if (context.log) context.log.error("KvK-formulier 17a vullen mislukt:", err);
    context.res = json(500, { error: "Kon het KvK-formulier niet invullen.", detail: String((err && err.message) || err) });
  }
};
