/**
 * /api/medewerker-dividend-opslaan — een in het portaal opgesteld dividendstuk vastleggen.
 * (Medewerkersportaal → Klantoverzicht → Dividenduitkeringen → "Dividendstuk opstellen".)
 *
 * Losse tegenhanger van api/medewerker-notulen-opslaan: dezelfde werkwijze, maar op de soort
 * Dividenduitkering (cr283_dividenduitkering) en met een eigen logboek-blob. Bewust een kopie en
 * geen gedeelde module, zodat een wijziging aan het ene stuk het andere nooit raakt.
 *
 * Waar komt wat terecht:
 *   1. de PDF  → de SharePoint-map van de cliënt, submap uit Beheer → Dividend (map altijd
 *                server-side uit Dynamics afgeleid op accountId, nooit uit iets wat de browser stuurt);
 *   2. de gegevens → een dividenddossier in Dynamics: cliënt, jaar, datum dividend, bedrag, de
 *                aandeel-percentages en de SharePoint-link (URL dossier);
 *   3. de invulgegevens (waaronder de NAMEN van de aandeelhouders, waar Dynamics alleen lookups
 *                voor heeft) → dividend-opgesteld.json in Blob Storage, zodat je het stuk later kunt
 *                heropenen en bijwerken. Zie _gedeeld/dividendStore.js voor het waarom.
 *
 *   GET  ?accountId=<guid>   → { stukken: [...] }   opgestelde stukken van deze cliënt
 *   GET  ?dossierId=<guid>   → { stukken: {...} }   één opgesteld stuk (om te heropenen)
 *   GET  (zonder query)      → { stukken: [...] }   het hele dividendlogboek
 *   POST { accountId, dossierId?, modelNaam, datum, velden, aandeelhouders, blokken, tekst,
 *          bestandsnaamBasis }
 *        → { ok, dossierId, dossier, pdfUrl, sharepoint: { gedaan, reden } }
 *
 * Best-effort waar het kan: lukt de SharePoint-upload niet (map niet ingesteld, geen app-toegang),
 * dan is het dossier tóch aangemaakt en krijgt de medewerker de reden te zien.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, maakDossier, werkDossierBij, verwijderDossier, metAangepasteVelden } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand, verwijderBestandViaUrl, haalBestandViaUrl } = require("../_gedeeld/sharepointUpload");
const { blokkenNaarPdf } = require("../_gedeeld/notulenRenderer");
const { haalAlles, haalVoorDossier, haalVoorKlant, bewaar, verwijder } = require("../_gedeeld/dividendStore");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { magSubVerwijderen } = require("../_gedeeld/rollenConfig");
const { verstuurMailMetBijlage } = require("../_gedeeld/mail");
const { haalNavigatieNaam } = require("../_gedeeld/dossiers");
const { splitsDocumentLinks, voegDocumentLinksSamen } = require("../_gedeeld/taakDocumenten");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
// Taakvelden — zelfde Application Settings als _gedeeld/vervolgtaak.js en api/taken.
const TAAK_KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const TAAK_SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const TAAK_RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";
// Kolom op Task waarin de documentlink staat; die kolom laat het klantportaal het stuk zien en
// (bij een taaksoort met "vereist handtekening") ondertekenen. Zie api/taken + api/taken-ondertekenen.
const TAAK_DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";
const SUBMAP_STANDAARD = "Dividenduitkeringen";
const PDF_TYPE = "application/pdf";

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

function veiligeBestandsnaam(basis) {
  const schoon = veiligeStr(basis)
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "Dividenduitkering";
  return `${schoon}.pdf`;
}

/** Getal uit een ingetypte waarde ("1.250,50" / "50" / ""), of null als het niets voorstelt. */
function getal(v) {
  const s = veiligeStr(v);
  if (!s) return null;
  const n = Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Zet één of meer bestanden in de SharePoint-map van de cliënt. De doelmap wordt ALTIJD server-side
 * uit Dynamics gehaald (cr283_sharepoint op de account) — zelfde beveiliging als bij /api/brieven.
 *
 * "bestanden" is [{ naam, buffer, contentType? }]; het eerste bestand is het stuk zelf, daarna komt
 * eventueel de aangifte dividendbelasting. Ze gaan naar DEZELFDE map, zodat de twee documenten in het
 * dossier bij elkaar blijven staan. Geeft { gedaan, reden, url (van het eerste bestand), urls }.
 */
async function naarSharepoint({ accountId, submap, bestanden }) {
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
    // De submap uit Beheer mag een PAD zijn ("0. Correspondentie/0. Uitgaande documenten"): opsplitsen
    // in losse mapnamen, anders zou Graph één map met een schuine streep in de naam moeten maken — en
    // dat kan niet. Ontbrekende tussenmappen worden aangemaakt (ensureFolderPath).
    const segmenten = String(submap || SUBMAP_STANDAARD).split("/").map((s) => s.trim()).filter(Boolean);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, segmenten.length ? segmenten : [SUBMAP_STANDAARD]);
    const urls = [];
    for (const b of (bestanden || [])) {
      if (!b || !b.naam || !b.buffer) continue;
      const geupload = await uploadBestand(appToken, map.driveId, doelId, b.naam, b.buffer, b.contentType || PDF_TYPE);
      urls.push({ naam: b.naam, url: (geupload && geupload.webUrl) || "" });
    }
    return { gedaan: urls.length > 0, url: (urls[0] && urls[0].url) || "", urls };
  } catch (e) {
    const reden = e && e.code === "APP_TOKEN_MISLUKT"
      ? "Kon geen app-toegang tot SharePoint krijgen (Graph-applicatiepermissie/admin-consent controleren)."
      : String(e.message || e);
    return { gedaan: false, reden };
  }
}

/**
 * De aangifte dividendbelasting die bij dit stuk hoort, als { naam, buffer, contentType } of null.
 *
 * Twee wegen: het scherm stuurt het gesleepte bestand mee (dataUrl) — dat is het geval zolang het stuk
 * open staat — of, bij een heropend stuk, is alleen de SharePoint-link nog bekend en halen we de bytes
 * daar op. Zo blijft "mailen" ook werken op een stuk dat je morgen weer openklapt.
 */
async function haalAangifte(body, bewaard, context) {
  const meegestuurd = body && body.aangifte && typeof body.aangifte === "object" ? body.aangifte : null;
  const dataUrl = meegestuurd ? veiligeStr(meegestuurd.dataUrl) : "";
  if (dataUrl) {
    const komma = dataUrl.indexOf(",");
    const basis64 = komma >= 0 ? dataUrl.slice(komma + 1) : dataUrl;
    const type = (dataUrl.match(/^data:([^;,]+)/) || [])[1] || PDF_TYPE;
    try {
      return { naam: veiligeBestandsnaamVrij(meegestuurd.naam) || "Aangifte dividendbelasting.pdf", buffer: Buffer.from(basis64, "base64"), contentType: type };
    } catch (e) {
      if (context && context.log) context.log.error("Aangifte uit de browser kon niet worden gelezen:", e);
      return null;
    }
  }
  const bewaardeUrl = bewaard && bewaard.aangifte && veiligeStr(bewaard.aangifte.url);
  if (!bewaardeUrl) return null;
  try {
    const appToken = await haalAppGraphToken();
    const uit = await haalBestandViaUrl(appToken, bewaardeUrl);
    return { naam: veiligeStr(bewaard.aangifte.naam) || uit.naam, buffer: uit.buffer, contentType: uit.contentType };
  } catch (e) {
    if (context && context.log) context.log.error("Aangifte kon niet uit SharePoint worden gehaald:", e);
    return null;
  }
}

/** Bestandsnaam schoonmaken maar de eigen extensie behouden (de aangifte is niet altijd een PDF). */
function veiligeBestandsnaamVrij(naam) {
  const schoon = veiligeStr(naam).replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").slice(0, 160);
  return schoon.replace(/^\.+/, "");
}

/** De dividend-soort met de door Beheer zelf aangemaakte extra velden erbij. */
async function haalDividendSoort() {
  const soort = SOORTEN.find((s) => s.key === "dividend");
  if (!soort) return null;
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling.dividend;
    const aangepast = eigen && Array.isArray(eigen.aangepasteVelden) ? eigen.aangepasteVelden : [];
    return metAangepasteVelden(soort, aangepast);
  } catch {
    return soort;
  }
}

/** De submap in SharePoint waar dividendstukken landen — instelbaar via Beheer (instellingen.dividendMap). */
async function haalSubmap() {
  try {
    const inst = await haalInstellingen();
    return veiligeStr(inst && inst.dividendMap) || SUBMAP_STANDAARD;
  } catch {
    return SUBMAP_STANDAARD;
  }
}

/**
 * Bouwt de velden voor het dividenddossier. Basis is wat het opstel-scherm meestuurt: de velden uit de
 * veldencatalogus van de soort Dividenduitkering, zoals in Beheer → Dossiers ingedeeld (`dossierVelden`) — dus
 * ook zelf aangemaakte velden. Alleen sleutels die écht in de catalogus staan gaan mee; lookups slaan
 * we over (die koppelen aan een Dynamics-record en lopen via het dossier zelf).
 *
 * Daar bovenop zet dit endpoint wat het scherm apart beheert: de gekozen datum als "Datum dividend" en
 * de aandeel-percentages uit de aandeelhoudersrijen (cr283_aandeelhouders1..7).
 *
 * De NAMEN van de aandeelhouders gaan hier bewust NIET in: cr283_aandeelhouder1..5 zijn lookups naar
 * relaties, en een aandeelhouder in het dividendstuk hoeft geen relatie in Dynamics te zijn. De namen
 * staan in het stuk zelf en in dividend-opgesteld.json (zie _gedeeld/dividendStore.js).
 */
function bouwDossierVelden({ soort, dossierVelden, zichtbareSleutels, aandeelhouders, datum }) {
  const uit = {};
  const catalogus = Array.isArray(soort && soort.catalogus) ? soort.catalogus : [];
  // Velden die de medewerker in het scherm ook echt zag: die mogen leeggemaakt worden. Een veld dat
  // niet getoond werd (verborgen, voorwaardelijk, of niet in een rubriek ingedeeld) laten we met rust
  // — anders zou opnieuw opslaan stilletjes gegevens wissen die je nooit onder ogen hebt gehad.
  const zichtbaar = new Set(Array.isArray(zichtbareSleutels) ? zichtbareSleutels : []);
  if (dossierVelden && typeof dossierVelden === "object") {
    for (const [key, waarde] of Object.entries(dossierVelden)) {
      if (!key || key.startsWith("__")) continue;
      const def = catalogus.find((v) => v.key === key);
      if (!def || def.type === "lookup") continue;
      const leeg = waarde === undefined || waarde === null || waarde === "";
      if (leeg) {
        // Leeg én zichtbaar geweest → bewust leeggemaakt, dus ook in Dynamics leegmaken.
        if (zichtbaar.has(key)) uit[key] = null;
        continue;
      }
      uit[key] = waarde;
    }
  }
  if (datum) uit.datumdividend = datum;
  // Aandeel-percentages: cr283_aandeelhouders1..7 (de dividendcatalogus kent er zeven).
  (Array.isArray(aandeelhouders) ? aandeelhouders : []).slice(0, 7).forEach((r, i) => {
    const pct = getal(r && r.percentage);
    if (pct !== null) uit[`aandeelhouders${i + 1}`] = pct;
  });
  return uit;
}

/** Plaatshouders in de mailteksten uit Beheer ({{klantnaam}}, {{datum}}, {{jaar}}). */
function vulMailIn(tekst, waarden) {
  return String(tekst || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, sleutel) => {
    const key = String(sleutel).toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.prototype.hasOwnProperty.call(waarden, key) ? String(waarden[key] ?? "") : "";
  });
}

function alsHtml(tekst) {
  const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const alineas = String(tekst || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1C2321;line-height:1.55">${
    alineas.map((a) => `<p>${esc(a).replace(/\n/g, "<br>")}</p>`).join("")
  }</div>`;
}

/**
 * Maakt de taak waarmee de cliënt het dividendstuk kan ondertekenen. De taaksoort komt uit Beheer → Dividend
 * ("Taak"): staat die soort daar op "vereist handtekening", dan biedt het klantportaal de
 * ondertekenknop aan bij deze taak (zie api/taken + api/taken-ondertekenen). De link naar het stuk
 * gaat mee in de documentkolom, zodat de cliënt het stuk kan inzien vóór ondertekenen.
 * Best-effort: mislukt de taak, dan is de mail wél verstuurd en krijgt de medewerker de reden te zien.
 */
async function maakOndertekentaak({ context, resource, token, accountId, klantnaam, cfg, onderwerp, documentUrl }) {
  try {
    const klantNav = await haalNavigatieNaam(resource, "task", TAAK_KLANT_VELD, token);
    const body = {
      subject: veiligeStr(onderwerp) || `Dividendstuk ondertekenen — ${veiligeStr(klantnaam)}`,
      description: "Het dividendstuk staat klaar om te ondertekenen.",
      [`${klantNav}@odata.bind`]: `/accounts(${accountId})`,
    };
    if (TAAK_SOORT_VELD && cfg && cfg.soort !== undefined && cfg.soort !== "") {
      const n = Number(cfg.soort);
      if (Number.isFinite(n)) body[TAAK_SOORT_VELD] = n;
    }
    if (TAAK_RUBRIEK_VELD && cfg && cfg.rubriek !== undefined && cfg.rubriek !== "") {
      const n = Number(cfg.rubriek);
      if (Number.isFinite(n)) body[TAAK_RUBRIEK_VELD] = n;
    }
    if (TAAK_DOCUMENT_VELD && documentUrl) body[TAAK_DOCUMENT_VELD] = voegDocumentLinksSamen(splitsDocumentLinks(documentUrl));
    const res = await fetch(`${resource}/api/data/v9.2/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Aanmaken ondertekentaak mislukt (${res.status}): ${await res.text()}`);
    return { gedaan: true };
  } catch (e) {
    if (context && context.log) context.log.error("Ondertekentaak aanmaken mislukt:", e);
    return { gedaan: false, reden: String((e && e.message) || e) };
  }
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  const methode = (req.method || "GET").toUpperCase();

  if (methode === "GET") {
    try {
      const dossierId = veiligeStr(req.query && req.query.dossierId);
      if (dossierId) {
        context.res = { headers: { "Content-Type": "application/json" }, body: { stukken: await haalVoorDossier(dossierId) } };
        return;
      }
      const accountId = veiligeStr(req.query && req.query.accountId);
      if (accountId) {
        context.res = { headers: { "Content-Type": "application/json" }, body: { stukken: await haalVoorKlant(accountId) } };
        return;
      }
      // Zonder cliënt: álle opgestelhet dividendstuk, nieuwste eerst — het dividendlogboek (zelfde idee als
      // /api/brief-log zonder accountId).
      const alle = await haalAlles();
      const lijst = Object.values(alle || {})
        .filter(Boolean)
        .sort((a, b) => String(b.opgesteldOp || "").localeCompare(String(a.opgesteldOp || "")));
      context.res = { headers: { "Content-Type": "application/json" }, body: { stukken: lijst } };
    } catch (err) {
      // Zonder (leesbare) opslag gewoon een lege lijst: het opstellen zelf moet blijven werken.
      context.res = { headers: { "Content-Type": "application/json" }, body: { stukken: veiligeStr(req.query && req.query.dossierId) ? null : [] } };
    }
    return;
  }

  if (methode !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  const body = req.body || {};
  const accountId = veiligeStr(body.accountId);
  const blokken = Array.isArray(body.blokken) ? body.blokken : [];
  const actie = veiligeStr(body.actie) || "opslaan";

  // ── actie "aanmaken": meteen een lege dividendrij in Dynamics ──────────────────────────────────
  // Zodra de medewerker in "Dividendstuk opstellen" een cliënt kiest, ontstaat het dividenddossier al —
  // dan staat het meteen in het overzicht en heeft het stuk vanaf het begin een dossier om aan te
  // hangen. Het vullen gebeurt daarna met "Opslaan" op dezelfde rij.
  if (actie === "aanmaken") {
    if (!accountId) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies eerst een cliënt." } };
      return;
    }
    try {
      const soort = await haalDividendSoort();
      const token = await haalDynamicsToken();
      const datumNieuw = veiligeStr(body.datum).slice(0, 10) || null;
      // De periode van een dividenddossier is het JAAR (cr283_jaar), niet een datum zoals bij
      // notulen — de gekozen datum bepaalt dus alleen het jaar; de datum zelf gaat als "Datum
      // dividend" mee in de velden (zie bouwDossierVelden).
      const jaarNieuw = datumNieuw ? Number(datumNieuw.slice(0, 4)) : null;
      const dossierId = await maakDossier(resource, token, soort, { accountId, jaar: jaarNieuw, velden: {} });
      const dossier = await haalEenDossier(resource, token, soort, dossierId).catch(() => null);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, dossierId, dossier } };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het dividenddossier niet aanmaken.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  // ── actie "verwijderen": een zojuist automatisch aangemaakte, nog lege rij weer opruimen ──────
  // Gebeurt als de medewerker van cliënt wisselt zonder iets te hebben opgeslagen; zonder dit zou
  // elke wissel een lege dividendrij achterlaten.
  if (actie === "verwijderen") {
    const teVerwijderen = veiligeStr(body.dossierId);
    if (!teVerwijderen) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen dossierId meegegeven." } };
      return;
    }
    try {
      const soort = await haalDividendSoort();
      const token = await haalDynamicsToken();
      await verwijderDossier(resource, token, soort, teVerwijderen);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
    } catch (err) {
      // Best-effort: lukt het opruimen niet, dan blijft er een lege rij staan — dat mag het werken
      // van het scherm niet blokkeren.
      if (context.log) context.log.error(err);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: false, reden: String((err && err.message) || err) } };
    }
    return;
  }

  // ── actie "logboek-verwijderen": een regel uit het logboek halen ───────────────────────────────
  // Wie dit mag stel je in bij Beheer → Rollen & toegang: de Verwijderen-schakelaar op de subpagina
  // "klantoverzicht.dividend" (dezelfde bron die het verwijderen van dossiers en contactpersonen al
  // gebruikt). Een beheerder (Azure-rol) mag altijd.
  //
  // Anders dan voorheen gaat het STUK IN SHAREPOINT nu mee de deur uit — dat was het verzoek: een regel
  // weghalen zonder het bestand op te ruimen laat losse documenten in het dossier van de cliënt achter.
  // Het dossier in Dynamics blijft wél staan: dat is de administratie, en die snijden we niet ongevraagd
  // aan. Het opruimen van het bestand is best-effort: lukt het niet, dan verdwijnt de regel toch en
  // krijgt de medewerker de reden te zien — anders zit je met een regel die je niet meer kwijt kunt.
  if (actie === "logboek-verwijderen") {
    const email = haalEmailUitPrincipal(req);
    const mag = rollen.includes("beheerder") || (await magSubVerwijderen(email, "klantoverzicht.dividend").catch(() => false));
    if (!mag) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je mag dividendstukken niet uit het logboek verwijderen. Dit recht staat bij Beheer → Rollen & toegang, met de Verwijderen-schakelaar op de subpagina." } };
      return;
    }
    const teVerwijderen = veiligeStr(body.dossierId);
    if (!teVerwijderen) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen dossierId meegegeven." } };
      return;
    }
    try {
      const record = await haalVoorDossier(teVerwijderen);
      // Alle bestanden die bij dit stuk horen: het stuk zelf en (bij dividend) de aangifte.
      const links = [];
      if (record && veiligeStr(record.pdfUrl)) links.push({ wat: "het stuk", url: veiligeStr(record.pdfUrl) });
      if (record && record.aangifte && veiligeStr(record.aangifte.url)) links.push({ wat: "de aangifte dividendbelasting", url: veiligeStr(record.aangifte.url) });
      const sharepoint = { gedaan: links.length === 0, reden: "", aantal: 0 };
      if (links.length) {
        try {
          const appToken = await haalAppGraphToken();
          const uitkomsten = [];
          for (const l of links) uitkomsten.push({ ...l, ...(await verwijderBestandViaUrl(appToken, l.url)) });
          sharepoint.aantal = uitkomsten.filter((u) => u.gedaan).length;
          sharepoint.gedaan = uitkomsten.every((u) => u.gedaan);
          sharepoint.reden = uitkomsten.filter((u) => !u.gedaan).map((u) => `${u.wat}: ${u.reden}`).join("; ");
        } catch (e) {
          sharepoint.gedaan = false;
          sharepoint.reden = String((e && e.message) || e);
          if (context.log) context.log.error("Bestand(en) uit SharePoint verwijderen mislukt:", e);
        }
      }
      const gedaan = await verwijder(teVerwijderen);
      await logGebeurtenis({
        door: email || "onbekend",
        actie: "dossier",
        accountId: (record && record.accountId) || "",
        accountIds: (record && record.accountId) ? [record.accountId] : [],
        klantnaam: (record && record.klantnaam) || "",
        tekst: `Regel uit het dividend-logboek verwijderd${sharepoint.aantal ? ` (${sharepoint.aantal} bestand(en) uit SharePoint verwijderd)` : ""}${sharepoint.gedaan ? "" : ` — let op: ${sharepoint.reden}`}.`,
      }).catch(() => {});
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, gedaan, sharepoint } };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het dividendstuk niet uit het logboek verwijderen.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  // ── actie "versturen": het dividendstuk mailen, of ter ondertekening aanbieden via een taak ──────────
  // Twee varianten met eigen tekst uit Beheer → Dividend:
  //   "mail"        → gewoon mailen, met het stuk als PDF-bijlage.
  //   "ondertekenen" → mailen dat er iets klaarstaat én een taak voor de cliënt aanmaken; staat de
  //                   gekozen taaksoort in Beheer → Taken op "vereist handtekening", dan kan de
  //                   cliënt daar ondertekenen (bestaande keten, zie api/taken-ondertekenen).
  if (actie === "versturen") {
    const variant = veiligeStr(body.variant) === "ondertekenen" ? "ondertekenen" : "mail";
    const naar = veiligeStr(body.naar);
    if (!accountId) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies eerst een cliënt." } };
      return;
    }
    if (!naar) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Vul het e-mailadres van de ontvanger in." } };
      return;
    }
    if (!blokken.length) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is geen dividendstuktekst meegestuurd." } };
      return;
    }
    try {
      const inst = await haalInstellingen().catch(() => ({}));
      const mailCfg = (inst && inst.dividendMail && typeof inst.dividendMail === "object") ? inst.dividendMail : {};
      const taakCfg = (inst && inst.dividendTaak && typeof inst.dividendTaak === "object") ? inst.dividendTaak : {};
      const ondCfg = (mailCfg.ondertekening && typeof mailCfg.ondertekening === "object") ? mailCfg.ondertekening : {};

      const klantnaamMail = veiligeStr(body.klantnaam);
      const datumMail = veiligeStr(body.datum).slice(0, 10) || null;
      const plaatshouders = {
        klantnaam: klantnaamMail,
        datum: datumMail || "",
        jaar: datumMail ? datumMail.slice(0, 4) : "",
      };
      // De medewerker mag onderwerp/tekst in het verstuurvenster nog aanpassen; anders de tekst uit
      // Beheer (bij "ondertekenen" die van de ondertekenvariant, met de gewone tekst als terugval).
      const basisOnderwerp = variant === "ondertekenen" ? (veiligeStr(ondCfg.onderwerp) || veiligeStr(mailCfg.onderwerp)) : veiligeStr(mailCfg.onderwerp);
      const basisTekst = variant === "ondertekenen" ? (veiligeStr(ondCfg.tekst) || veiligeStr(mailCfg.tekst)) : veiligeStr(mailCfg.tekst);
      const onderwerp = veiligeStr(body.onderwerp) || vulMailIn(basisOnderwerp, plaatshouders) || `Dividenduitkering ${klantnaamMail}`.trim();
      const tekst = veiligeStr(body.tekst) || vulMailIn(basisTekst, plaatshouders) || "Bijgaand ontvangt u het dividendstuk.";

      // Het stuk renderen en (opnieuw) in de SharePoint-map van de cliënt zetten, zodat de mail en de
      // taak naar hetzelfde document verwijzen als het logboek.
      const pdf = await blokkenNaarPdf(blokken, null);
      const bestandsnaam = veiligeBestandsnaam(body.bestandsnaamBasis || `Dividenduitkering${klantnaamMail ? " - " + klantnaamMail : ""}${datumMail ? " - " + datumMail : ""}`);
      const submap = await haalSubmap();
      // Is er dividendbelasting verschuldigd, dan hóórt de aangifte erbij — hij gaat als tweede bijlage
      // mee en komt in dezelfde SharePoint-map. Ontbreekt hij, dan sturen we niets: liever een duidelijke
      // melding dan een halve verzending naar de cliënt.
      const bewaard = await haalVoorDossier(veiligeStr(body.dossierId));
      const aangifte = await haalAangifte(body, bewaard, context);
      if (body.dividendbelasting === true && !aangifte) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is dividendbelasting verschuldigd, maar de aangifte dividendbelasting ontbreekt. Sleep die eerst in het vak bij het stuk." } };
        return;
      }
      const sharepoint = await naarSharepoint({
        accountId, submap,
        bestanden: [{ naam: bestandsnaam, buffer: pdf, contentType: PDF_TYPE }, ...(aangifte ? [aangifte] : [])],
      });

      // Ter ondertekening: ÉÉN TAAK PER DOCUMENT — elk stuk wordt apart getekend, dus met een aangifte
      // erbij krijgt de cliënt twee taken. Aan élke taak hangen wél béide documenten: eerst het stuk
      // dat bij die taak getekend wordt, daarna de rest als meekijk-materiaal. Zo ziet de cliënt bij
      // het tekenen van de notulen ook de aangifte staan, en andersom (zie api/_gedeeld/taakDocumenten.js).
      let taak = { gedaan: false, reden: "" };
      let taken = [];
      if (variant === "ondertekenen") {
        const token = await haalDynamicsToken();
        const basisOnderwerpTaak = vulMailIn(veiligeStr(taakCfg.onderwerp), plaatshouders);
        const teTekenen = [{ label: "", url: sharepoint.url || "" }];
        if (aangifte) {
          const aangifteUrl = (sharepoint.urls || []).find((u) => u.naam === aangifte.naam);
          teTekenen.push({ label: "aangifte dividendbelasting", url: (aangifteUrl && aangifteUrl.url) || "" });
        }
        for (const doc of teTekenen) {
          // Eigen document eerst, de andere erachteraan — die volgorde bepaalt wat er getekend wordt.
          const andere = teTekenen.filter((d) => d !== doc).map((d) => d.url);
          const res = await maakOndertekentaak({
            context, resource, token, accountId, klantnaam: klantnaamMail, cfg: taakCfg,
            onderwerp: doc.label
              ? `${basisOnderwerpTaak || `Dividendstuk ondertekenen — ${veiligeStr(klantnaamMail)}`} — ${doc.label}`
              : basisOnderwerpTaak,
            documentUrl: voegDocumentLinksSamen([doc.url, ...andere]),
          });
          taken.push({ label: doc.label || "dividendstuk", ...res });
        }
        // Samengevat resultaat voor het scherm: alleen "gedaan" als álle taken er staan.
        taak = {
          gedaan: taken.length > 0 && taken.every((t) => t.gedaan),
          reden: taken.filter((t) => !t.gedaan).map((t) => `${t.label}: ${t.reden || "onbekende reden"}`).join("; "),
          aantal: taken.length,
        };
      }

      const mail = await verstuurMailMetBijlage({
        naar,
        cc: Array.isArray(body.cc) ? body.cc : (veiligeStr(body.cc) ? [veiligeStr(body.cc)] : []),
        onderwerp,
        html: alsHtml(tekst),
        bijlagen: [
          { naam: bestandsnaam, contentType: PDF_TYPE, inhoud: pdf },
          // De aangifte dividendbelasting gaat als tweede bijlage mee — de cliënt krijgt de twee
          // stukken dus in één mail, zoals afgesproken.
          ...(aangifte ? [{ naam: aangifte.naam, contentType: aangifte.contentType || PDF_TYPE, inhoud: aangifte.buffer }] : []),
        ],
        afzender: veiligeStr(mailCfg.afzender),
      });

      // In het logboek bijhouden dat (en hoe) het stuk de deur uit is.
      if (veiligeStr(body.dossierId)) {
        try {
          await bewaar({
            dossierId: veiligeStr(body.dossierId),
            accountId, klantnaam: klantnaamMail,
            pdfUrl: sharepoint.url || "",
            verstuurd: { op: new Date().toISOString(), variant, naar, onderwerp, taakGedaan: taak.gedaan === true, aantalTaken: taken.length || 0, metAangifte: !!aangifte },
            aangifte: aangifte
              ? { naam: aangifte.naam, url: ((sharepoint.urls || []).find((u) => u.naam === aangifte.naam) || {}).url || (bewaard && bewaard.aangifte && bewaard.aangifte.url) || "" }
              : (bewaard && bewaard.aangifte) || null,
          });
        } catch (e) {
          if (context.log) context.log.error("Verstuurgegevens bewaren mislukt:", e);
        }
      }

      await logGebeurtenis({
        door: haalEmailUitPrincipal(req) || "onbekend",
        actie: "dossier",
        accountId, accountIds: [accountId], klantnaam: klantnaamMail,
        tekst: variant === "ondertekenen"
          ? `Dividendstuk ter ondertekening aangeboden aan ${naar}${taak.gedaan ? " (taak aangemaakt)" : " (taak mislukt)"}.`
          : `Dividendstuk gemaild naar ${naar}.`,
      });

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: {
          ok: true, variant, verzonden: true, van: mail && mail.van,
          pdfUrl: sharepoint.url || "",
          sharepoint: { gedaan: !!sharepoint.gedaan, reden: sharepoint.reden || "" },
          taak,
        },
      };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Versturen mislukt.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  if (!accountId) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies eerst een cliënt." } };
    return;
  }
  if (!blokken.length) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is geen dividendstuktekst meegestuurd." } };
    return;
  }

  const email = haalEmailUitPrincipal(req);
  const klantnaam = veiligeStr(body.klantnaam);
  const modelNaam = veiligeStr(body.modelNaam) || "Dividenduitkering";
  const datum = veiligeStr(body.datum).slice(0, 10) || null;

  try {
    const soort = await haalDividendSoort();
    if (!soort) {
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "De dividend-dossiersoort is niet gevonden." } };
      return;
    }
    // Was er al eens opgeslagen op dit dossier? Dan weten we van de vorige keer welke aangifte erbij
    // hoort — nodig als het scherm de bytes niet opnieuw meestuurt (heropend stuk).
    const bestaandRecord = await haalVoorDossier(veiligeStr(body.dossierId));
    // Dividendbelasting verschuldigd zonder aangifte erbij: dat is de fout die we willen vóórkomen.
    // Server-side afdwingen, niet alleen in het scherm — zo kan het ook niet per ongeluk via een
    // herhaald verzoek langs de controle glippen.
    if (body.dividendbelasting === true && !(body.aangifte && veiligeStr(body.aangifte.dataUrl)) && !(bestaandRecord && bestaandRecord.aangifte && bestaandRecord.aangifte.url)) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is dividendbelasting verschuldigd, maar de aangifte dividendbelasting ontbreekt. Sleep die eerst in het vak bij het stuk." } };
      return;
    }
    const token = await haalDynamicsToken();

    // 1. Dossier: bestaand bijwerken (opnieuw opslaan) of een nieuw dividenddossier aanmaken.
    const dossierVelden = bouwDossierVelden({
      soort,
      dossierVelden: body.dossierVelden,
      zichtbareSleutels: body.zichtbareSleutels,
      aandeelhouders: body.aandeelhouders,
      datum,
    });
    let dossierId = veiligeStr(body.dossierId);
    if (dossierId) {
      await werkDossierBij(resource, token, soort, dossierId, { velden: dossierVelden });
    } else {
      dossierId = await maakDossier(resource, token, soort, {
        accountId,
        jaar: datum ? Number(datum.slice(0, 4)) : null, // cr283_jaar — de periode van een dividenddossier
        velden: dossierVelden,
      });
    }

    // 2. PDF renderen en in de SharePoint-map van de cliënt zetten — samen met de aangifte
    //    dividendbelasting als die erbij hoort, zodat de twee stukken in dezelfde map staan.
    const pdf = await blokkenNaarPdf(blokken, null);
    const bestandsnaam = veiligeBestandsnaam(body.bestandsnaamBasis || `${modelNaam}${klantnaam ? " - " + klantnaam : ""}${datum ? " - " + datum : ""}`);
    const submap = await haalSubmap();
    const aangifte = await haalAangifte(body, bestaandRecord, context);
    const sharepoint = await naarSharepoint({
      accountId, submap,
      bestanden: [{ naam: bestandsnaam, buffer: pdf, contentType: PDF_TYPE }, ...(aangifte ? [aangifte] : [])],
    });
    const aangifteUrl = aangifte
      ? (((sharepoint.urls || []).find((u) => u.naam === aangifte.naam) || {}).url
         || (bestaandRecord && bestaandRecord.aangifte && bestaandRecord.aangifte.url) || "")
      : "";

    // 3. De link naar het stuk op het dossier zetten (URL dossier — cr283_urldossier).
    if (sharepoint.gedaan && sharepoint.url) {
      try {
        await werkDossierBij(resource, token, soort, dossierId, { urlDossier: sharepoint.url });
      } catch (e) {
        // Best-effort: het stuk staat er, alleen de link op het dossier ontbreekt.
        if (context.log) context.log.error("URL op dividenddossier zetten mislukt:", e);
      }
    }

    // 4. Invulgegevens bewaren, zodat het stuk later te heropenen is.
    try {
      await bewaar({
        dossierId, accountId, klantnaam, modelNaam, datum,
        velden: body.velden || {},
        dossierVelden: body.dossierVelden || {},
        invulwaarden: body.invulwaarden || {},
        aandeelhouders: Array.isArray(body.aandeelhouders) ? body.aandeelhouders : [],
        tekst: veiligeStr(body.tekst),
        tussenstuk: veiligeStr(body.tussenstuk),
        pdfUrl: sharepoint.url || "",
        bestandsnaam,
        // De aangifte dividendbelasting die bij dit stuk hoort: naam + link, zodat het logboek hem als
        // snellink kan tonen en een later "mailen" hem alsnog uit SharePoint kan ophalen.
        dividendbelasting: body.dividendbelasting === true,
        uitkeringstest: body.uitkeringstest === true,
        aangifte: aangifte ? { naam: aangifte.naam, url: aangifteUrl } : ((bestaandRecord && bestaandRecord.aangifte) || null),
        opgesteldDoor: email || "",
      });
    } catch (e) {
      if (context.log) context.log.error("Dividend-invulgegevens bewaren mislukt:", e);
    }

    const dossier = await haalEenDossier(resource, token, soort, dossierId).catch(() => null);

    await logGebeurtenis({
      door: email || "onbekend",
      actie: "dossier",
      accountId,
      accountIds: [accountId],
      klantnaam: klantnaam || (dossier ? dossier.klantnaam : ""),
      tekst: `${modelNaam}${datum ? ` d.d. ${datum}` : ""} opgesteld en vastgelegd${sharepoint.gedaan ? " (stuk in SharePoint)" : ""}.`,
    });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, dossierId, dossier, pdfUrl: sharepoint.url || "", sharepoint: { gedaan: !!sharepoint.gedaan, reden: sharepoint.reden || "" } },
    };
  } catch (err) {
    if (err && err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De koppeling is nog niet volledig geconfigureerd." } };
      return;
    }
    if (context.log) context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het dividendstuk niet opslaan.", detail: String((err && err.message) || err) } };
  }
};
