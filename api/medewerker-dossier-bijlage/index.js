/**
 * /api/medewerker-dossier-bijlage — bijlagen bij een dividenddossier: uploaden naar, opsommen uit en
 * downloaden van de SharePoint-map van de cliënt.
 *
 * Zodra "Dividendbelasting" in het dividenddossier op Ja staat, verschijnt een sleepvak (zie
 * DividendBijlageKaart in MedewerkerPortaal.jsx) waarmee de medewerker een bestand (alle typen)
 * uploadt. Dat wordt via app-only Graph opgeslagen in de SharePoint-map van de klant
 * (cr283_sharepoint), in een submap die instelbaar is via Beheer → Dossiers (instelling
 * dividendBijlageMap, standaard "Dividendbelasting"). In de Brieven-module (BrievenOverzicht.jsx) kan
 * de medewerker zo'n bestand vervolgens via een keuzelijst als bijlage kiezen en meemailen — daarvoor
 * dienen de accountId-modus (opsommen) en de download-modus (bestand als data-URL terug).
 *
 *   Dossier-modus (voor het sleepvak in het dividenddossier):
 *     GET  ?soort=dividend&id=<dossier-guid>                       → { map, bestanden: [...] }
 *     POST { soort:"dividend", id, bestandsnaam, bestandBase64, contentType? } → { ok, bestandsnaam, webUrl }
 *
 *   Cliënt-modus (voor de Brieven-module — bestanden van de klant zelf):
 *     GET  ?accountId=<account-guid>                               → { map, bestanden: [{naam,webUrl,grootte,gewijzigd}] }
 *     GET  ?accountId=<account-guid>&bestandNaam=<naam>&download=1  → { naam, contentType, grootte, dataUrl }
 *
 * App-only upload/download (Files.ReadWrite.All via haalAppGraphToken): de klant hoeft zelf geen
 * SharePoint-rechten op deze map te hebben. Route beveiligd via staticwebapp.config.json (rol
 * 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier } = require("../_gedeeld/dossiers");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

const GRAPH = "https://graph.microsoft.com/v1.0";
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — kleine-bestand-upload/download via Graph (:/content)
const STANDAARD_MAP = "Dividendbelasting";
const TOEGESTANE_SOORTEN = new Set(["dividend"]); // alleen dividend heeft (voorlopig) dit sleepvak
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

function veiligeBestandsnaam(naam) {
  let n = String(naam || "").replace(/[\\/:*?"<>|]/g, "-").trim();
  n = n.replace(/^\.+/, "").slice(0, 180);
  return n || "bijlage";
}

// Submap-sjabloon (uit Beheer) → schone mapsegmenten voor ensureFolderPath. Valt terug op
// ["Dividendbelasting"] zodat een bijlage nooit in de wortel van het klantdossier belandt.
function mapSegmentenVan(sjabloon) {
  const segmenten = String(sjabloon == null || sjabloon === "" ? STANDAARD_MAP : sjabloon)
    .split(/[\\/]+/)
    .map((deel) => deel.replace(/[\\/:*?"<>|]/g, "-").trim())
    .filter(Boolean);
  return segmenten.length ? segmenten : [STANDAARD_MAP];
}

function decodeer(bestandBase64) {
  const kaal = String(bestandBase64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!kaal) return { fout: "Geen bestand meegestuurd." };
  let buffer;
  try { buffer = Buffer.from(kaal, "base64"); } catch { return { fout: "Bestand kon niet worden gelezen." }; }
  if (!buffer.length) return { fout: "Bestand is leeg." };
  if (buffer.length > MAX_BYTES) return { fout: `Bestand is te groot (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` };
  return { buffer };
}

// SharePoint-basismap (cr283_sharepoint) van een cliënt (op accountId) ophalen.
async function basisUrlVoorAccount(resource, token, accountId, valNaam) {
  const accRes = await fetch(
    `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${SHAREPOINT_VELD}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!accRes.ok) return { fout: `Ophalen cliënt mislukt: ${await accRes.text()}` };
  const acc = await accRes.json();
  const basisUrl = acc[SHAREPOINT_VELD];
  if (!basisUrl) return { fout: `Voor ${acc.name || valNaam || "deze cliënt"} is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD} in Dynamics).` };
  return { basisUrl, naam: acc.name || valNaam || "de cliënt" };
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = json(501, { error: "Dynamics-koppeling is nog niet geconfigureerd." }); return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) { context.res = json(403, { error: "Geen toegang." }); return; }
  const email = haalEmailUitPrincipal(req);
  const methode = (req.method || "GET").toUpperCase();

  const accountIdQ = String((req.query && req.query.accountId) || "");
  const soortKey = String((req.query && req.query.soort) || (req.body && req.body.soort) || "");
  const id = (req.query && req.query.id) || (req.body && req.body.id) || "";

  try {
    const token = await haalDynamicsToken();

    // Cliënt bepalen: rechtstreeks via accountId (Brieven-module) of via een dividenddossier (soort+id).
    let accountId = "", klantnaam = "", dossier = null;
    if (accountIdQ) {
      if (!GUID.test(accountIdQ)) { context.res = json(400, { error: "Ongeldig accountId." }); return; }
      accountId = accountIdQ;
    } else {
      if (!TOEGESTANE_SOORTEN.has(soortKey)) { context.res = json(400, { error: "Geef 'accountId', of 'soort=dividend' + 'id' mee." }); return; }
      const soort = SOORTEN.find((s) => s.key === soortKey);
      if (!soort || !id) { context.res = json(400, { error: "Geef 'soort=dividend' en 'id' mee." }); return; }
      dossier = await haalEenDossier(resource, token, soort, id);
      if (!dossier) { context.res = json(404, { error: "Dossier niet gevonden." }); return; }
      accountId = dossier.accountId;
      klantnaam = dossier.klantnaam || "";
      if (!accountId) { context.res = json(409, { error: "Dit dossier heeft geen gekoppelde cliënt." }); return; }
    }

    const basis = await basisUrlVoorAccount(resource, token, accountId, klantnaam);
    if (basis.fout) { context.res = json(409, { error: basis.fout }); return; }

    const instellingen = await haalInstellingen().catch(() => ({}));
    const segmenten = mapSegmentenVan(instellingen.dividendBijlageMap);

    const appToken = await haalAppGraphToken();
    const map = await resolveFolder(appToken, basis.basisUrl);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, segmenten);

    if (methode === "GET") {
      const download = String((req.query && req.query.download) || "");
      const bestandNaam = String((req.query && req.query.bestandNaam) || "");

      // Download-modus: één bestand als data-URL terug (voor de bijlage in de Brieven-module).
      if (download === "1" && bestandNaam) {
        const dl = await fetch(
          `${GRAPH}/drives/${map.driveId}/items/${doelId}:/${encodeURIComponent(bestandNaam)}:/content`,
          { headers: { Authorization: `Bearer ${appToken}` } }
        );
        if (dl.status === 404) { context.res = json(404, { error: "Bestand niet gevonden in de SharePoint-map." }); return; }
        if (!dl.ok) throw new Error(`Bestand ophalen mislukt (${dl.status}): ${await dl.text()}`);
        const buffer = Buffer.from(await dl.arrayBuffer());
        if (buffer.length > MAX_BYTES) { context.res = json(400, { error: `Bestand is te groot om als bijlage te gebruiken (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` }); return; }
        const contentType = dl.headers.get("content-type") || "application/octet-stream";
        context.res = json(200, { naam: bestandNaam, contentType, grootte: buffer.length, dataUrl: `data:${contentType};base64,${buffer.toString("base64")}` });
        return;
      }

      // Lijst-modus.
      const res = await fetch(
        `${GRAPH}/drives/${map.driveId}/items/${doelId}/children?$select=name,webUrl,size,lastModifiedDateTime,file&$top=200`,
        { headers: { Authorization: `Bearer ${appToken}`, Accept: "application/json" } }
      );
      if (!res.ok) throw new Error(`Bestanden ophalen mislukt (${res.status}): ${await res.text()}`);
      const items = (await res.json()).value || [];
      const bestanden = items
        .filter((i) => i.file)
        .map((i) => ({ naam: i.name, webUrl: i.webUrl, grootte: i.size, gewijzigd: i.lastModifiedDateTime }))
        .sort((a, b) => String(b.gewijzigd || "").localeCompare(String(a.gewijzigd || "")));
      context.res = json(200, { map: segmenten.join("/"), bestanden });
      return;
    }

    if (methode === "POST") {
      const { bestandsnaam, bestandBase64, contentType } = req.body || {};
      const { buffer, fout } = decodeer(bestandBase64);
      if (fout) { context.res = json(400, { error: fout }); return; }
      const veiligeNaam = veiligeBestandsnaam(bestandsnaam);
      const upload = await uploadBestand(appToken, map.driveId, doelId, veiligeNaam, buffer, contentType || "application/octet-stream");
      await logGebeurtenis({
        door: email || "onbekend", actie: "dossier", accountId, accountIds: [accountId],
        klantnaam: klantnaam || basis.naam,
        tekst: `Bijlage "${veiligeNaam}" toegevoegd aan dividenddossier${dossier && dossier.jaar ? ` ${dossier.jaar}` : ""} (SharePoint: ${segmenten.join("/")}).`,
      }).catch(() => {});
      context.res = json(200, { ok: true, bestandsnaam: veiligeNaam, webUrl: (upload && upload.webUrl) || "" });
      return;
    }

    context.res = json(405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = json(501, { error: "Koppeling is nog niet volledig geconfigureerd." }); return; }
    context.log.error(err);
    context.res = json(500, { error: "Kon de bijlage niet verwerken.", detail: String(err.message || err) });
  }
};
