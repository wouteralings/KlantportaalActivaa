/**
 * /api/medewerker-dossier-bijlage — bijlagen bij een dividend- of notulendossier: uploaden naar,
 * opsommen uit, downloaden van én mailen vanuit de SharePoint-map van de cliënt.
 *
 * In een dividenddossier verschijnt het sleepvak zodra "Dividendbelasting" op Ja staat; in een
 * notulendossier staat het er altijd (zie DossierBijlageKaart in MedewerkerPortaal.jsx). Een geüpload
 * bestand wordt via app-only Graph opgeslagen in de SharePoint-map van de klant (cr283_sharepoint), in
 * een per-soort instelbare submap (Beheer → Dossiers: dividendBijlageMap / notulenBijlageMap; standaard
 * "Dividendbelasting" resp. "Notulen"). Per bestand kan de medewerker het "Versturen": het wordt als
 * bijlage gemaild naar één ontvanger (+ optioneel cc), met onderwerp/tekst die vooraf te controleren/
 * aanpassen zijn en vanaf een per-soort ingesteld afzenderadres (dividendMail / notulenMail =
 * { afzender, onderwerp, tekst }). Daarnaast kan een SharePoint-bestand in de Brieven-module als bijlage
 * worden gekozen (accountId-modus — gebruikt de dividend-submap).
 *
 *   Dossier-modus (sleepvak + versturen in het dossier):
 *     GET  ?soort=dividend|notulen&id=<dossier-guid>
 *          → { map, bestanden:[...], ontvanger:{naam,email}, mailDefaults:{afzender,onderwerp,tekst} }
 *     POST { soort, id, bestandsnaam, bestandBase64, contentType? }                        → { ok, bestandsnaam, webUrl }
 *     POST { soort, id, actie:"versturen", bestandNaam, ontvanger, cc?, onderwerp, tekst }  → { ok, verzonden, naar, cc }
 *
 *   Cliënt-modus (Brieven-module — bestanden van de klant zelf, dividend-submap):
 *     GET  ?accountId=<account-guid>                               → { map, bestanden:[...] }
 *     GET  ?accountId=<account-guid>&bestandNaam=<naam>&download=1  → { naam, contentType, grootte, dataUrl }
 *
 * App-only upload/download (Files.ReadWrite.All via haalAppGraphToken) en mail (Mail.Send via mail.js).
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, haalNavigatieNaam } = require("../_gedeeld/dossiers");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { haalInstellingen, resolveBijlageConfig } = require("../_gedeeld/instellingen");
const { logGebeurtenis, haalLog } = require("../_gedeeld/klantlog");
const { verstuurMailMetBijlage } = require("../_gedeeld/mail");
const dossierTaakketen = require("../_gedeeld/dossierTaakketen");

const GRAPH = "https://graph.microsoft.com/v1.0";
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — kleine-bestand-upload/download via Graph (:/content)
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Velden voor de klant-taak "voor akkoord" (zelfde als api/medewerker-aangifte-versturen). De taak wordt
// bij het versturen aangemaakt als dat in Beheer → Dossiers is aangezet (<soort>Taak.aan), met het
// (optioneel) meegemailde SharePoint-document als documentlink, zodat de klant het via het portaal kan
// inzien en op de taak akkoord kan geven.
const TAAK_KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const TAAK_SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const TAAK_RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";
const TAAK_DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";

// Standaard SharePoint-submap + terugval-mailteksten per soort (als er in Beheer → Dossiers nog niets is ingesteld).
const STANDAARD_MAP_PER_SOORT = { dividend: "Dividendbelasting", notulen: "Notulen" };
const STANDAARD_MAIL_PER_SOORT = {
  dividend: {
    onderwerp: "Aangifte dividendbelasting{{jaar}}",
    tekst: "Beste {{klantnaam}},\n\nBijgaand ontvangt u de aangifte dividendbelasting{{jaar}}.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\nActivaa Accountants en Adviseurs",
  },
  notulen: {
    onderwerp: "Notulen algemene vergadering",
    tekst: "Beste {{klantnaam}},\n\nBijgaand ontvangt u de notulen.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\nActivaa Accountants en Adviseurs",
  },
};
function standaardMapVoor(soortKey) { return STANDAARD_MAP_PER_SOORT[soortKey] || "Dividendbelasting"; }

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

function veiligeBestandsnaam(naam) {
  let n = String(naam || "").replace(/[\\/:*?"<>|]/g, "-").trim();
  n = n.replace(/^\.+/, "").slice(0, 180);
  return n || "bijlage";
}

// Splitst een bestandsnaam in { basis, ext } (ext incl. punt, of "" zonder extensie). Alleen een
// "echte" extensie (1–8 letters/cijfers ná een punt, niet aan het begin) wordt afgesplitst.
function splitsNaamExt(naam) {
  const n = String(naam || "");
  const m = n.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
  if (m && m[1]) return { basis: m[1], ext: m[2] };
  return { basis: n, ext: "" };
}

// Plaatshouders in de (in Beheer ingestelde) bestandsnaam invullen. Anders dan bij de mailteksten wordt
// {{jaar}} hier als de kale jaartal-waarde ingevuld (geen voorloopspatie), zodat "Aangifte {{jaar}}" →
// "Aangifte 2024" wordt. Daarna nog niet saneren — dat gebeurt met veiligeBestandsnaam().
function vulBestandsnaamIn(sjabloon, { klantnaam, jaar, datum }) {
  return String(sjabloon || "")
    .replace(/\{\{\s*klantnaam\s*\}\}/gi, klantnaam || "")
    .replace(/\{\{\s*jaar\s*\}\}/gi, jaar != null && jaar !== "" ? String(jaar) : "")
    .replace(/\{\{\s*datum\s*\}\}/gi, datum || "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Bepaalt de definitieve bestandsnaam voor een geüpload bestand: de in Beheer ingestelde naam (met
// plaatshouders) + de extensie van het originele bestand. Is er geen naam ingesteld, dan blijft de
// originele naam behouden. Bestaat de naam al in de map, dan komt er " (2)", " (3)" … achter (het
// oorspronkelijke bestand wordt zo nooit overschreven — de klant vraagt "bij meerdere een volgnummer").
function bepaalDoelBestandsnaam(sjabloon, origineleNaam, mergeCtx, bestaandeNamenLower) {
  const origineel = veiligeBestandsnaam(origineleNaam);
  let basis, ext;
  const ingesteld = vulBestandsnaamIn(sjabloon, mergeCtx);
  if (ingesteld) {
    const origSplit = splitsNaamExt(origineel);
    const inSplit = splitsNaamExt(ingesteld);
    // Als in de ingestelde naam al een extensie staat, die gebruiken; anders die van het bronbestand.
    ext = inSplit.ext || origSplit.ext;
    basis = veiligeBestandsnaam(inSplit.ext ? inSplit.basis : ingesteld).replace(/\.+$/, "").trim() || "bijlage";
  } else {
    const s = splitsNaamExt(origineel);
    basis = s.basis || "bijlage";
    ext = s.ext;
  }
  let kandidaat = `${basis}${ext}`;
  if (!bestaandeNamenLower.has(kandidaat.toLowerCase())) return kandidaat;
  let n = 2;
  while (bestaandeNamenLower.has(`${basis} (${n})${ext}`.toLowerCase())) n += 1;
  return `${basis} (${n})${ext}`;
}

// Submap-sjabloon (uit Beheer) → schone mapsegmenten voor ensureFolderPath. Valt terug op de
// soort-standaard zodat een bijlage nooit in de wortel van het klantdossier belandt.
function mapSegmentenVan(sjabloon, standaard) {
  const segmenten = String(sjabloon == null || sjabloon === "" ? standaard : sjabloon)
    .split(/[\\/]+/)
    .map((deel) => deel.replace(/[\\/:*?"<>|]/g, "-").trim())
    .filter(Boolean);
  return segmenten.length ? segmenten : [standaard];
}

// De bijlage-dropzone wordt per rubriek ingesteld (Beheer → Dossiers, in het indeling-paneel): elke
// rubriek in dossierIndeling.<soort>.secties kan een eigen bijlage-config { aan, trigger, submap,
// bestandsnaam } hebben. Zoekt die config op via de rubriek-sleutel; geeft null als de rubriek (of zijn
// config) niet bestaat, zodat de aanroeper op de per-soort-instelling terugvalt.
function resolveSectieBijlage(instellingen, soortKey, sectieSleutel) {
  if (!sectieSleutel) return null;
  const ind = instellingen && instellingen.dossierIndeling && instellingen.dossierIndeling[soortKey];
  const secties = ind && Array.isArray(ind.secties) ? ind.secties : [];
  const sectie = secties.find((s) => s && s.sleutel === sectieSleutel);
  return (sectie && sectie.bijlage && typeof sectie.bijlage === "object") ? sectie.bijlage : null;
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

/**
 * De VOORNAAM uit de naam van de contactpersoon, om de klant persoonlijk aan te kunnen schrijven
 * ("Beste Wouter,"). Het eerste woord is de voornaam — behalve als dat een initiaal is ("J. de Vries",
 * "W.A. Alings"): dan is er geen voornaam bekend en gebruiken we de hele naam, want "Beste J.," leest
 * als een fout. Zonder contactpersoon valt hij terug op de cliëntnaam, zodat de aanhef nooit leeg is.
 */
function voornaamUit(volledigeNaam, klantnaam) {
  const naam = String(volledigeNaam || "").trim().replace(/\s+/g, " ");
  if (!naam) return String(klantnaam || "").trim();
  // "Alings, Wouter" → de voornaam staat achter de komma.
  if (naam.includes(",")) {
    const achterKomma = naam.split(",")[1];
    if (achterKomma && achterKomma.trim()) return voornaamUit(achterKomma.trim(), klantnaam);
  }
  const eerste = naam.split(" ")[0];
  const isInitiaal = eerste.includes(".") || /^[A-Z]{1,3}$/.test(eerste);
  return isInitiaal ? naam : eerste;
}

// Plaatshouders in mailonderwerp/-tekst — bewust een kleine, vaste set (server-side gevuld). {{jaar}}
// wordt als " <jaar>" ingevuld (of leeg), en dubbele spaties opgeschoond. {{voornaam}} is de voornaam
// van de contactpersoon (zie voornaamUit), {{contactpersoon}} zijn volledige naam.
function vulMailIn(sjabloon, { klantnaam, jaar, datum, contactpersoon, voornaam }) {
  const jaarDeel = jaar != null && jaar !== "" ? ` ${jaar}` : "";
  return String(sjabloon || "")
    .replace(/\{\{\s*klantnaam\s*\}\}/gi, klantnaam || "")
    .replace(/\{\{\s*voornaam\s*\}\}/gi, voornaam || "")
    .replace(/\{\{\s*contactpersoon\s*\}\}/gi, contactpersoon || "")
    .replace(/\{\{\s*jaar\s*\}\}/gi, jaarDeel)
    .replace(/\{\{\s*datum\s*\}\}/gi, datum || "")
    .replace(/[ \t]{2,}/g, " ");
}

function tekstNaarHtml(tekst) {
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(tekst)
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#1C5D8C;text-decoration:underline;">${u}</a>`)
    .replace(/\n/g, "<br/>");
}

// Comma-/puntkomma-/regelgescheiden adressenlijst → schone array (leeg eruit).
function splitsAdressen(waarde) {
  return String(waarde || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

// SharePoint-basismap (cr283_sharepoint) + primaire contactpersoon van een cliënt (op accountId).
async function basisUrlVoorAccount(resource, token, accountId, valNaam) {
  const accRes = await fetch(
    `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${SHAREPOINT_VELD}&$expand=primarycontactid($select=emailaddress1,fullname)`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!accRes.ok) return { fout: `Ophalen cliënt mislukt: ${await accRes.text()}` };
  const acc = await accRes.json();
  const basisUrl = acc[SHAREPOINT_VELD];
  if (!basisUrl) return { fout: `Voor ${acc.name || valNaam || "deze cliënt"} is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD} in Dynamics).` };
  const c = acc.primarycontactid || {};
  return { basisUrl, naam: acc.name || valNaam || "de cliënt", contact: { naam: c.fullname || "", email: c.emailaddress1 || "" } };
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

    // Cliënt bepalen: rechtstreeks via accountId (Brieven-module) of via een dossier (soort+id).
    let accountId = "", klantnaam = "", dossier = null;
    if (accountIdQ) {
      if (!GUID.test(accountIdQ)) { context.res = json(400, { error: "Ongeldig accountId." }); return; }
      accountId = accountIdQ;
    } else {
      // De bijlage-dropzone is nu voor elke dossiersoort in Beheer → Dossiers in te schakelen (niet meer
      // alleen dividend/notulen); of hij daadwerkelijk verschijnt bepaalt de frontend op basis van de
      // <soort>Bijlage-config (aan + het gekozen ja/nee-veld). Hier accepteren we daarom elke geldige soort.
      const soort = SOORTEN.find((s) => s.key === soortKey);
      if (!soort || !id) { context.res = json(400, { error: "Geef 'accountId', of 'soort' + 'id' mee." }); return; }
      dossier = await haalEenDossier(resource, token, soort, id);
      if (!dossier) { context.res = json(404, { error: "Dossier niet gevonden." }); return; }
      accountId = dossier.accountId;
      klantnaam = dossier.klantnaam || "";
      if (!accountId) { context.res = json(409, { error: "Dit dossier heeft geen gekoppelde cliënt." }); return; }
    }

    const basis = await basisUrlVoorAccount(resource, token, accountId, klantnaam);
    if (basis.fout) { context.res = json(409, { error: basis.fout }); return; }

    // Submap + bestandsnaam: primair per rubriek (dossier-modus met een 'sectie'-sleutel), anders de
    // per-soort-instelling (accountId/Brieven-modus én terugval voor de legacy bottom-dropzone).
    const soortInst = dossier ? dossier.soort : "dividend";
    const sectieSleutel = String((req.query && req.query.sectie) || (req.body && req.body.sectie) || "");
    const instellingen = await haalInstellingen().catch(() => ({}));
    const bijlageCfg = resolveBijlageConfig(instellingen, soortInst);
    const sectieBijlage = (dossier && sectieSleutel) ? resolveSectieBijlage(instellingen, soortInst, sectieSleutel) : null;
    const submapBron = (sectieBijlage && typeof sectieBijlage.submap === "string" && sectieBijlage.submap.trim()) ? sectieBijlage.submap : bijlageCfg.map;
    const bestandsnaamBron = (sectieBijlage && typeof sectieBijlage.bestandsnaam === "string") ? sectieBijlage.bestandsnaam : bijlageCfg.bestandsnaam;
    const segmenten = mapSegmentenVan(submapBron, standaardMapVoor(soortInst));
    const soortMail = (instellingen[`${soortInst}Mail`] && typeof instellingen[`${soortInst}Mail`] === "object") ? instellingen[`${soortInst}Mail`] : {};

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
        `${GRAPH}/drives/${map.driveId}/items/${doelId}/children?$select=name,webUrl,size,lastModifiedDateTime,createdDateTime,file&$top=200`,
        { headers: { Authorization: `Bearer ${appToken}`, Accept: "application/json" } }
      );
      if (!res.ok) throw new Error(`Bestanden ophalen mislukt (${res.status}): ${await res.text()}`);
      const items = (await res.json()).value || [];
      const bestanden = items
        .filter((i) => i.file)
        .map((i) => ({ naam: i.name, webUrl: i.webUrl, grootte: i.size, gewijzigd: i.lastModifiedDateTime, geUploadOp: i.createdDateTime || i.lastModifiedDateTime || "", door: "" }))
        .sort((a, b) => String(b.gewijzigd || "").localeCompare(String(a.gewijzigd || "")));

      // Wie heeft welk bestand via het portaal geüpload en wanneer? Door de app-only upload kent
      // SharePoint alleen de app als 'gewijzigd door', dus de uploader komt uit ons eigen klantlog
      // (gebeurtenisType "bijlageUpload", met bestand + submap). Best-effort: zonder logregel valt het
      // terug op de SharePoint-aanmaakdatum (geUploadOp hierboven) en blijft 'door' leeg.
      try {
        const submapPad = segmenten.join("/");
        const uploads = (await haalLog({ accountId })).filter((e) => e && e.gebeurtenisType === "bijlageUpload" && e.submap === submapPad);
        for (const b of bestanden) {
          const hit = uploads.find((e) => e.bestand === b.naam); // haalLog is nieuwste-eerst → meest recente upload
          if (hit) { b.door = hit.door || ""; if (hit.tijd) b.geUploadOp = hit.tijd; }
        }
      } catch { /* best-effort: uploader-info is optioneel */ }

      // In dossier-modus ook de ontvanger (primaire contactpersoon) + de standaard mailgegevens
      // meesturen, zodat het "Versturen"-venster meteen voorgevuld is.
      if (dossier) {
        const std = STANDAARD_MAIL_PER_SOORT[soortInst] || STANDAARD_MAIL_PER_SOORT.dividend;
        const contactNaam = (basis.contact && basis.contact.naam) || "";
        const mergeCtx = {
          klantnaam: dossier.klantnaam || basis.naam,
          jaar: dossier.jaar,
          datum: new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }),
          contactpersoon: contactNaam,
          voornaam: voornaamUit(contactNaam, dossier.klantnaam || basis.naam),
        };
        // Per keuzelijst-optie een eigen mailtekst (Beheer → Dossiers, <soort>Mail.perOptie). De frontend
        // kiest op basis van de gekozen "Soort" (soortdividenduitkering/soortnotulen) de bijbehorende
        // tekst; ontbreekt die, dan valt hij terug op de algemene onderwerp/tekst hieronder.
        const perOptieRuw = (soortMail.perOptie && typeof soortMail.perOptie === "object") ? soortMail.perOptie : {};
        const perOptie = {};
        for (const [waarde, v] of Object.entries(perOptieRuw)) {
          if (!v || typeof v !== "object") continue;
          const ond = typeof v.onderwerp === "string" ? v.onderwerp.trim() : "";
          const tks = typeof v.tekst === "string" ? v.tekst.trim() : "";
          if (!ond && !tks) continue;
          perOptie[waarde] = { onderwerp: vulMailIn(ond, mergeCtx), tekst: vulMailIn(tks, mergeCtx) };
        }
        context.res = json(200, {
          map: segmenten.join("/"), bestanden,
          ontvanger: { naam: basis.contact.naam, email: basis.contact.email },
          mailDefaults: {
            afzender: typeof soortMail.afzender === "string" ? soortMail.afzender : "",
            onderwerp: vulMailIn(typeof soortMail.onderwerp === "string" && soortMail.onderwerp.trim() ? soortMail.onderwerp : std.onderwerp, mergeCtx),
            tekst: vulMailIn(typeof soortMail.tekst === "string" && soortMail.tekst.trim() ? soortMail.tekst : std.tekst, mergeCtx),
            perOptie,
          },
        });
        return;
      }
      context.res = json(200, { map: segmenten.join("/"), bestanden });
      return;
    }

    if (methode === "POST") {
      const actie = String((req.body && req.body.actie) || "");

      // ── Versturen: bestand uit SharePoint als bijlage mailen naar de klant (+ optioneel cc) ──
      if (actie === "versturen") {
        if (!dossier) { context.res = json(400, { error: "Versturen kan alleen vanuit een dossier (soort + id)." }); return; }
        const bestandNaam = String((req.body && req.body.bestandNaam) || "").trim(); // leeg = zonder bijlage
        const naar = String((req.body && req.body.ontvanger) || "").trim();
        const ccLijst = splitsAdressen(req.body && req.body.cc);
        const onderwerp = String((req.body && req.body.onderwerp) || "").trim();
        const tekst = String((req.body && req.body.tekst) || "").trim();
        if (!naar) { context.res = json(400, { error: "Geef een ontvanger (e-mailadres) mee." }); return; }
        if (!onderwerp || !tekst) { context.res = json(400, { error: "Mailonderwerp en -tekst zijn verplicht." }); return; }

        // Bijlage is optioneel: alleen ophalen als er een bestandNaam is meegegeven.
        const bijlagen = [];
        if (bestandNaam) {
          const dl = await fetch(
            `${GRAPH}/drives/${map.driveId}/items/${doelId}:/${encodeURIComponent(bestandNaam)}:/content`,
            { headers: { Authorization: `Bearer ${appToken}` } }
          );
          if (dl.status === 404) { context.res = json(404, { error: "Bestand niet gevonden in de SharePoint-map." }); return; }
          if (!dl.ok) throw new Error(`Bestand ophalen mislukt (${dl.status}): ${await dl.text()}`);
          const buffer = Buffer.from(await dl.arrayBuffer());
          const contentType = dl.headers.get("content-type") || "application/octet-stream";
          bijlagen.push({ naam: bestandNaam, contentType, inhoud: buffer });
        }
        const afzender = typeof soortMail.afzender === "string" ? soortMail.afzender.trim() : "";

        try {
          await verstuurMailMetBijlage({ naar, cc: ccLijst, onderwerp, html: tekstNaarHtml(tekst), bijlagen, afzender });
        } catch (e) {
          if (e.message === "MISSING_MAIL_SENDER") { context.res = json(409, { error: "Er is nog geen afzender-mailadres ingesteld (Beheer → Dossiers), en er is geen standaard postvak geconfigureerd." }); return; }
          if (e.message === "GEEN_ONTVANGERS") { context.res = json(400, { error: "Geen geldig ontvanger-e-mailadres." }); return; }
          throw e;
        }
        // ── Klant-taak "voor akkoord" — best-effort, ná de mail (die is al verstuurd; een taakfout mag
        // niet als harde fout terugkomen, anders wordt bij een retry per ongeluk een tweede mail
        // gestuurd). Alleen als aangezet in Beheer → Dossiers (<soort>Taak.aan). ──
        let taakWaarschuwing = "";
        const soortWoordTaak = soortInst === "notulen" ? "Notulen" : "Aangifte dividendbelasting";
        const taakBasis = (instellingen[`${soortInst}Taak`] && typeof instellingen[`${soortInst}Taak`] === "object") ? instellingen[`${soortInst}Taak`] : {};
        // De taak kan per situatie (wel/geen dividendbelasting voor dividend, of "Soort notulen") gesplitst
        // zijn: is er voor de meegestuurde soortWaarde een eigen taak-instelling (<soort>Taak.perOptie),
        // dan geldt die (incl. z'n eigen aan/uit); anders de standaardtaak hierboven.
        const taakOptWaarde = String((req.body && req.body.soortWaarde) || "");
        const taakPerOpt = (taakBasis.perOptie && typeof taakBasis.perOptie === "object" && taakOptWaarde && taakBasis.perOptie[taakOptWaarde] && typeof taakBasis.perOptie[taakOptWaarde] === "object") ? taakBasis.perOptie[taakOptWaarde] : null;
        const taakCfg = taakPerOpt || taakBasis;
        if (taakCfg.aan) {
          try {
            const mergeCtxTaak = { klantnaam: dossier.klantnaam || basis.naam, jaar: dossier.jaar, datum: new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) };
            const taakOnderwerp = vulMailIn(typeof taakCfg.onderwerp === "string" && taakCfg.onderwerp.trim() ? taakCfg.onderwerp : `${soortWoordTaak}{{jaar}} ter akkoord`, mergeCtxTaak).trim() || `${soortWoordTaak} ter akkoord`;
            // Document-webUrl van de (optionele) bijlage ophalen, voor de documentlink op de taak.
            let documentUrl = "";
            if (bestandNaam) {
              const metaRes = await fetch(`${GRAPH}/drives/${map.driveId}/items/${doelId}:/${encodeURIComponent(bestandNaam)}?$select=webUrl`, { headers: { Authorization: `Bearer ${appToken}` } });
              if (metaRes.ok) documentUrl = (await metaRes.json()).webUrl || "";
            }
            const klantNav = await haalNavigatieNaam(resource, "task", TAAK_KLANT_VELD, token);
            const taakBody = {
              subject: taakOnderwerp,
              // De onzichtbare dossierkoppeling erbij (zie api/_gedeeld/dossierTaakketen.js): zodra de
              // cliënt deze taak accordeert of ondertekent volgt daar de in Beheer → Dossiers ingestelde
              // vervolgtaak + dossierstatus uit. Wordt overal weggefilterd vóór hij in beeld komt.
              description: `${soortWoordTaak}${dossier.jaar ? ` ${dossier.jaar}` : ""} van ${dossier.klantnaam || basis.naam} is via het klantportaal gemaild naar ${naar}${bestandNaam ? ` (bijlage: ${bestandNaam})` : ""} door ${email || "onbekend"}.`
                + dossierTaakketen.maakRef(soortInst, dossier.id, "akkoord"),
              [`${klantNav}@odata.bind`]: `/accounts(${accountId})`,
            };
            const soortRaw = taakCfg.soort;
            if (TAAK_SOORT_VELD && soortRaw != null && soortRaw !== "" && Number.isFinite(Number(soortRaw))) taakBody[TAAK_SOORT_VELD] = Number(soortRaw);
            const rubriekRaw = taakCfg.rubriek;
            if (TAAK_RUBRIEK_VELD && rubriekRaw != null && rubriekRaw !== "" && Number.isFinite(Number(rubriekRaw))) taakBody[TAAK_RUBRIEK_VELD] = Number(rubriekRaw);
            if (TAAK_DOCUMENT_VELD && documentUrl) taakBody[TAAK_DOCUMENT_VELD] = documentUrl;
            const taakRes = await fetch(`${resource}/api/data/v9.2/tasks`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", Prefer: "return=representation" },
              body: JSON.stringify(taakBody),
            });
            if (!taakRes.ok) throw new Error(`Aanmaken taak mislukt (${taakRes.status}): ${await taakRes.text()}`);
          } catch (e) {
            context.log.error("medewerker-dossier-bijlage: klant-taak aanmaken mislukt (mail is al verstuurd):", e);
            taakWaarschuwing = "De mail is verstuurd, maar het aanmaken van de klant-taak is mislukt: " + String(e.message || e);
          }
        }

        await logGebeurtenis({
          door: email || "onbekend", actie: "dossier", accountId, accountIds: [accountId],
          klantnaam: klantnaam || basis.naam,
          tekst: `${soortInst === "notulen" ? "Notulen" : "Dividendbelasting"}-mail gestuurd naar ${naar}${ccLijst.length ? ` (cc: ${ccLijst.join(", ")})` : ""}${bestandNaam ? ` met bijlage "${bestandNaam}"` : " (zonder bijlage)"}${taakCfg.aan && !taakWaarschuwing ? " — klant-taak aangemaakt" : ""}.`,
        }).catch(() => {});
        context.res = json(200, { ok: true, verzonden: true, naar, cc: ccLijst, bijlage: bestandNaam || null, taakWaarschuwing: taakWaarschuwing || undefined });
        return;
      }

      // ── Upload (sleepvak) ──
      const { bestandsnaam, bestandBase64, contentType } = req.body || {};
      const { buffer, fout } = decodeer(bestandBase64);
      if (fout) { context.res = json(400, { error: fout }); return; }
      // Definitieve naam bepalen: de in Beheer ingestelde bestandsnaam (met plaatshouders) + extensie van
      // het bronbestand, of de originele naam als er niets is ingesteld. Bestaande namen in de doelmap
      // ophalen zodat een gelijknamig bestand een volgnummer krijgt i.p.v. het vorige te overschrijven.
      let bestaandeNamenLower = new Set();
      try {
        const lijstRes = await fetch(
          `${GRAPH}/drives/${map.driveId}/items/${doelId}/children?$select=name,file&$top=200`,
          { headers: { Authorization: `Bearer ${appToken}`, Accept: "application/json" } }
        );
        if (lijstRes.ok) {
          for (const i of ((await lijstRes.json()).value || [])) {
            if (i && i.file && i.name) bestaandeNamenLower.add(String(i.name).toLowerCase());
          }
        }
      } catch { /* best-effort: zonder lijst valt het terug op de kale naam (Graph overschrijft dan hooguit een gelijknamig bestand). */ }
      const mergeCtxBestand = { klantnaam: (dossier && dossier.klantnaam) || basis.naam, jaar: dossier && dossier.jaar, datum: new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) };
      const veiligeNaam = bepaalDoelBestandsnaam(bestandsnaamBron, bestandsnaam, mergeCtxBestand, bestaandeNamenLower);
      const upload = await uploadBestand(appToken, map.driveId, doelId, veiligeNaam, buffer, contentType || "application/octet-stream");
      await logGebeurtenis({
        door: email || "onbekend", actie: "dossier", accountId, accountIds: [accountId],
        klantnaam: klantnaam || basis.naam,
        // Structurele velden zodat de bijlage-lijst per bestand kan tonen wie uploadde en wanneer
        // (zie de GET-lijst hierboven). tijd (upload-moment) zet klantlog zelf op de gebeurtenis.
        gebeurtenisType: "bijlageUpload", bestand: veiligeNaam, submap: segmenten.join("/"), dossierSoort: soortInst,
        tekst: `Bijlage "${veiligeNaam}" toegevoegd aan ${soortInst}dossier${dossier && dossier.jaar ? ` ${dossier.jaar}` : ""} (SharePoint: ${segmenten.join("/")}).`,
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
