/**
 * /api/medewerker-liquidatie-opslaan — een in het portaal opgesteld liquidatiestuk vastleggen.
 * (Medewerkersportaal → Klantoverzicht → Liquidatiestukken → "Liquidatiestuk opstellen" → "Opslaan".)
 *
 * Eén-op-één de tegenhanger van api/medewerker-notulen-opslaan; het stuk IS immers een notulen van de
 * AvA, met daarachter het cijferdeel van het ontbindingsrapport (balans + resultatenrekening). Die
 * cijfers gaan als gewone dossiervelden mee naar Dynamics — de kolommen bestonden al — en de totalen
 * worden hier altijd HERREKEND met _gedeeld/liquidatieCijfers.js, nooit klakkeloos overgenomen van de
 * browser.
 *
 * Waar komt wat terecht — bewust dezelfde weg als de brieven:
 *   1. de PDF  → de SharePoint-map van de cliënt, submap "Liquidatie" (map altijd server-side uit
 *                Dynamics afgeleid op accountId, nooit uit iets wat de browser meestuurt);
 *   2. de gegevens → een liquidatiedossier in Dynamics (cr283_liquidatie): cliënt, datums, KvK, de cijfers,
 *                percentage, toelichting, de aandeel-percentages en de SharePoint-link (URL dossier);
 *   3. de invulgegevens (waaronder de NAMEN van de aandeelhouders, waar Dynamics alleen lookups
 *                voor heeft) → liquidatie-opgesteld.json in Blob Storage, zodat je het stuk later kunt
 *                heropenen en bijwerken. Zie _gedeeld/liquidatieStore.js voor het waarom.
 *
 *   GET  ?accountId=<guid>   → { liquidatie: [...] }  opgestelde liquidatiestukken van deze cliënt
 *   GET  ?dossierId=<guid>   → { liquidatie: {...} }  één opgesteld stuk (om te heropenen)
 *   POST { accountId, dossierId?, modelNaam, datum, velden, aandeelhouders, blokken, tekst,
 *          bestandsnaamBasis }
 *        → { ok, dossierId, dossier, pdfUrl, sharepoint: { gedaan, reden } }
 *
 * Best-effort waar het kan: lukt de SharePoint-upload niet (map niet ingesteld, geen app-toegang),
 * dan is het dossier tóch aangemaakt en krijgt de medewerker de reden te zien — beter dan alles
 * terugdraaien en het ingevulde stuk kwijt zijn.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, maakDossier, werkDossierBij, verwijderDossier, metAangepasteVelden } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand, verwijderBestandViaUrl } = require("../_gedeeld/sharepointUpload");
const { blokkenNaarPdf } = require("../_gedeeld/notulenRenderer");
const { berekenCijfers, TOTAALSLEUTELS, INVULSLEUTELS } = require("../_gedeeld/liquidatieCijfers");
const { haalAlles, haalVoorDossier, haalVoorKlant, bewaar, verwijder } = require("../_gedeeld/liquidatieStore");
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
const SUBMAP_STANDAARD = "Liquidatie";
const PDF_TYPE = "application/pdf";

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

function veiligeBestandsnaam(basis) {
  const schoon = veiligeStr(basis)
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "Liquidatiestuk";
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
 * Zet het stuk in de SharePoint-map van de cliënt. De doelmap wordt ALTIJD server-side uit Dynamics
 * gehaald (cr283_sharepoint op de account) — zelfde beveiliging als bij /api/brieven.
 */
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
    // De submap uit Beheer mag een PAD zijn ("0. Correspondentie/0. Uitgaande documenten"): opsplitsen
    // in losse mapnamen, anders zou Graph één map met een schuine streep in de naam moeten maken — en
    // dat kan niet. Ontbrekende tussenmappen worden aangemaakt (ensureFolderPath).
    const segmenten = String(submap || SUBMAP_STANDAARD).split("/").map((s) => s.trim()).filter(Boolean);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, segmenten.length ? segmenten : [SUBMAP_STANDAARD]);
    const geupload = await uploadBestand(appToken, map.driveId, doelId, bestandsnaam, buffer, PDF_TYPE);
    return { gedaan: true, url: (geupload && geupload.webUrl) || "" };
  } catch (e) {
    const reden = e && e.code === "APP_TOKEN_MISLUKT"
      ? "Kon geen app-toegang tot SharePoint krijgen (Graph-applicatiepermissie/admin-consent controleren)."
      : String(e.message || e);
    return { gedaan: false, reden };
  }
}

/** De liquidatie-soort met de door Beheer zelf aangemaakte extra velden erbij. */
async function haalLiquidatieSoort() {
  const soort = SOORTEN.find((s) => s.key === "liquidatie");
  if (!soort) return null;
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling.liquidatie;
    const aangepast = eigen && Array.isArray(eigen.aangepasteVelden) ? eigen.aangepasteVelden : [];
    return metAangepasteVelden(soort, aangepast);
  } catch {
    return soort;
  }
}

/** De submap in SharePoint waar liquidatiestukken landen — instelbaar via Beheer (instellingen.liquidatieMap). */
async function haalSubmap() {
  try {
    const inst = await haalInstellingen();
    return veiligeStr(inst && inst.liquidatieMap) || SUBMAP_STANDAARD;
  } catch {
    return SUBMAP_STANDAARD;
  }
}

/**
 * Bouwt de velden voor het liquidatiedossier. Basis is wat het opstel-scherm meestuurt: de velden uit de
 * veldencatalogus van de soort Liquidatiestukken, zoals in Beheer → Dossiers ingedeeld (`dossierVelden`) — dus
 * ook zelf aangemaakte velden. Alleen sleutels die écht in de catalogus staan gaan mee; lookups slaan
 * we over (die koppelen aan een Dynamics-record en lopen via het dossier zelf).
 *
 * Daar bovenop zet dit endpoint wat het scherm apart beheert: de datum van ontbinding en de datum
 * van de notulen, het KvK-nummer, de aandeel-percentages (cr283_aandeelhouders1..7) en de cijfers van
 * balans en resultatenrekening — met de totalen server-side herrekend.
 *
 * De NAMEN van de aandeelhouders gaan hier bewust NIET in: cr283_aandeelhouder1..5 zijn lookups naar
 * relaties, en een aandeelhouder in het stuk hoeft geen relatie in Dynamics te zijn. De namen
 * staan in het stuk zelf en in liquidatie-opgesteld.json (zie _gedeeld/liquidatieStore.js).
 */
function bouwDossierVelden({ soort, dossierVelden, zichtbareSleutels, aandeelhouders, datum, datumnotulen, kvknummer, cijfers }) {
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
  // De datum van ontbinding is de periode van het dossier én staat als kolom op het formulier.
  if (datum) uit.datumliquidatie = datum;
  // De datum van de vergadering staat er los naast — die twee hoeven niet gelijk te zijn.
  if (datumnotulen) uit.datumnotulen = datumnotulen;
  if (veiligeStr(kvknummer)) {
    const n = Number(String(kvknummer).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > 0) uit.kvknummer = n;
  }
  // Aandeel-percentages: cr283_aandeelhouders1..7 (de liquidatiecatalogus kent er zeven).
  (Array.isArray(aandeelhouders) ? aandeelhouders : []).slice(0, 7).forEach((r, i) => {
    const pct = getal(r && r.percentage);
    if (pct !== null) uit[`aandeelhouders${i + 1}`] = pct;
  });
  // Balans + resultatenrekening. De totalen komen NIET uit de browser maar worden hier herrekend —
  // zo kan er nooit een dossier ontstaan waarin het totaal niet bij de regels past. Alleen invullen
  // als er daadwerkelijk cijfers zijn meegestuurd; anders laten we de kolommen met rust.
  if (cijfers && typeof cijfers === "object" && Object.keys(cijfers).length) {
    const berekend = berekenCijfers(cijfers);
    for (const sleutel of [...INVULSLEUTELS, ...TOTAALSLEUTELS]) uit[sleutel] = berekend[sleutel];
  }
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
 * Maakt de taak waarmee de cliënt het liquidatiestuk kan ondertekenen. De taaksoort komt uit Beheer → Liquidatiestukken
 * ("Taak"): staat die soort daar op "vereist handtekening", dan biedt het klantportaal de
 * ondertekenknop aan bij deze taak (zie api/taken + api/taken-ondertekenen). De link naar het stuk
 * gaat mee in de documentkolom, zodat de cliënt het stuk kan inzien vóór ondertekenen.
 * Best-effort: mislukt de taak, dan is de mail wél verstuurd en krijgt de medewerker de reden te zien.
 */
async function maakOndertekentaak({ context, resource, token, accountId, klantnaam, cfg, onderwerp, documentUrl }) {
  try {
    const klantNav = await haalNavigatieNaam(resource, "task", TAAK_KLANT_VELD, token);
    const body = {
      subject: veiligeStr(onderwerp) || `Liquidatiestuk ondertekenen — ${veiligeStr(klantnaam)}`,
      description: "Het liquidatiestuk staat klaar om te ondertekenen.",
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
        context.res = { headers: { "Content-Type": "application/json" }, body: { liquidatie: await haalVoorDossier(dossierId) } };
        return;
      }
      const accountId = veiligeStr(req.query && req.query.accountId);
      if (accountId) {
        context.res = { headers: { "Content-Type": "application/json" }, body: { liquidatie: await haalVoorKlant(accountId) } };
        return;
      }
      // Zonder cliënt: alle opgestelde liquidatiestukken, nieuwste eerst — het liquidatielogboek (zelfde idee als
      // /api/brief-log zonder accountId).
      const alle = await haalAlles();
      const lijst = Object.values(alle || {})
        .filter(Boolean)
        .sort((a, b) => String(b.opgesteldOp || "").localeCompare(String(a.opgesteldOp || "")));
      context.res = { headers: { "Content-Type": "application/json" }, body: { liquidatie: lijst } };
    } catch (err) {
      // Zonder (leesbare) opslag gewoon een lege lijst: het opstellen zelf moet blijven werken.
      context.res = { headers: { "Content-Type": "application/json" }, body: { liquidatie: veiligeStr(req.query && req.query.dossierId) ? null : [] } };
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

  // ── actie "aanmaken": meteen een lege liquidatierij in Dynamics ──────────────────────────────────
  // Zodra de medewerker in "Liquidatiestuk opstellen" een cliënt kiest, ontstaat het liquidatiedossier al —
  // dan staat het meteen in het overzicht en heeft het stuk vanaf het begin een dossier om aan te
  // hangen. Het vullen gebeurt daarna met "Opslaan" op dezelfde rij.
  if (actie === "aanmaken") {
    if (!accountId) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies eerst een cliënt." } };
      return;
    }
    try {
      const soort = await haalLiquidatieSoort();
      const token = await haalDynamicsToken();
      const datumNieuw = veiligeStr(body.datum).slice(0, 10) || null;
      const dossierId = await maakDossier(resource, token, soort, { accountId, begindatum: datumNieuw, velden: {} });
      const dossier = await haalEenDossier(resource, token, soort, dossierId).catch(() => null);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, dossierId, dossier } };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het liquidatiedossier niet aanmaken.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  // ── actie "verwijderen": een zojuist automatisch aangemaakte, nog lege rij weer opruimen ──────
  // Gebeurt als de medewerker van cliënt wisselt zonder iets te hebben opgeslagen; zonder dit zou
  // elke wissel een lege liquidatierij achterlaten.
  if (actie === "verwijderen") {
    const teVerwijderen = veiligeStr(body.dossierId);
    if (!teVerwijderen) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen dossierId meegegeven." } };
      return;
    }
    try {
      const soort = await haalLiquidatieSoort();
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
  // "klantoverzicht.liquidatie" (dezelfde bron die het verwijderen van dossiers en contactpersonen al
  // gebruikt). Een beheerder (Azure-rol) mag altijd.
  //
  // Anders dan voorheen gaat het STUK IN SHAREPOINT nu mee de deur uit — dat was het verzoek: een regel
  // weghalen zonder het bestand op te ruimen laat losse documenten in het dossier van de cliënt achter.
  // Het dossier in Dynamics blijft wél staan: dat is de administratie, en die snijden we niet ongevraagd
  // aan. Het opruimen van het bestand is best-effort: lukt het niet, dan verdwijnt de regel toch en
  // krijgt de medewerker de reden te zien — anders zit je met een regel die je niet meer kwijt kunt.
  if (actie === "logboek-verwijderen") {
    const email = haalEmailUitPrincipal(req);
    const mag = rollen.includes("beheerder") || (await magSubVerwijderen(email, "klantoverzicht.liquidatie").catch(() => false));
    if (!mag) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je mag liquidatiestukken niet uit het logboek verwijderen. Dit recht staat bij Beheer → Rollen & toegang, met de Verwijderen-schakelaar op de subpagina." } };
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
        tekst: `Regel uit het liquidatie-logboek verwijderd${sharepoint.aantal ? ` (${sharepoint.aantal} bestand(en) uit SharePoint verwijderd)` : ""}${sharepoint.gedaan ? "" : ` — let op: ${sharepoint.reden}`}.`,
      }).catch(() => {});
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, gedaan, sharepoint } };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het liquidatiestuk niet uit het logboek verwijderen.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  // ── actie "versturen": het liquidatiestuk mailen, of ter ondertekening aanbieden via een taak ──────────
  // Twee varianten met eigen tekst uit Beheer → Liquidatiestukken:
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
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is geen tekst voor het liquidatiestuk meegestuurd." } };
      return;
    }
    try {
      const inst = await haalInstellingen().catch(() => ({}));
      const mailCfg = (inst && inst.liquidatieMail && typeof inst.liquidatieMail === "object") ? inst.liquidatieMail : {};
      const taakCfg = (inst && inst.liquidatieTaak && typeof inst.liquidatieTaak === "object") ? inst.liquidatieTaak : {};
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
      const onderwerp = veiligeStr(body.onderwerp) || vulMailIn(basisOnderwerp, plaatshouders) || `Liquidatiestuk ${klantnaamMail}`.trim();
      const tekst = veiligeStr(body.tekst) || vulMailIn(basisTekst, plaatshouders) || "Bijgaand ontvangt u de liquidatiestukken.";

      // Het stuk renderen en (opnieuw) in de SharePoint-map van de cliënt zetten, zodat de mail en de
      // taak naar hetzelfde document verwijzen als het logboek.
      const pdf = await blokkenNaarPdf(blokken, null);
      const bestandsnaam = veiligeBestandsnaam(body.bestandsnaamBasis || `Ontbindingsrapport${klantnaamMail ? " - " + klantnaamMail : ""}${datumMail ? " - " + datumMail : ""}`);
      const submap = await haalSubmap();
      const sharepoint = await naarSharepoint({ accountId, submap, bestandsnaam, buffer: pdf });

      let taak = { gedaan: false, reden: "" };
      if (variant === "ondertekenen") {
        const token = await haalDynamicsToken();
        taak = await maakOndertekentaak({
          context, resource, token, accountId, klantnaam: klantnaamMail, cfg: taakCfg,
          onderwerp: vulMailIn(veiligeStr(taakCfg.onderwerp), plaatshouders),
          documentUrl: sharepoint.url || "",
        });
      }

      const mail = await verstuurMailMetBijlage({
        naar,
        cc: Array.isArray(body.cc) ? body.cc : (veiligeStr(body.cc) ? [veiligeStr(body.cc)] : []),
        onderwerp,
        html: alsHtml(tekst),
        bijlagen: [{ naam: bestandsnaam, contentType: PDF_TYPE, inhoud: pdf }],
        afzender: veiligeStr(mailCfg.afzender),
      });

      // In het logboek bijhouden dat (en hoe) het stuk de deur uit is.
      if (veiligeStr(body.dossierId)) {
        try {
          await bewaar({
            dossierId: veiligeStr(body.dossierId),
            accountId, klantnaam: klantnaamMail,
            pdfUrl: sharepoint.url || "",
            verstuurd: { op: new Date().toISOString(), variant, naar, onderwerp, taakGedaan: taak.gedaan === true },
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
          ? `Liquidatiestuk ter ondertekening aangeboden aan ${naar}${taak.gedaan ? " (taak aangemaakt)" : " (taak mislukt)"}.`
          : `Liquidatiestuk gemaild naar ${naar}.`,
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
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is geen tekst voor het liquidatiestuk meegestuurd." } };
    return;
  }

  const email = haalEmailUitPrincipal(req);
  const klantnaam = veiligeStr(body.klantnaam);
  const modelNaam = veiligeStr(body.modelNaam) || "Liquidatiestuk";
  const datum = veiligeStr(body.datum).slice(0, 10) || null;              // datum van ontbinding
  const datumnotulen = veiligeStr(body.datumnotulen).slice(0, 10) || null; // datum van de vergadering
  const kvknummer = veiligeStr(body.kvknummer);
  const bewaarder = veiligeStr(body.bewaarder);
  const cijfers = body.cijfers && typeof body.cijfers === "object" ? body.cijfers : {};

  try {
    const soort = await haalLiquidatieSoort();
    if (!soort) {
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "De liquidatie-dossiersoort is niet gevonden." } };
      return;
    }
    const token = await haalDynamicsToken();

    // 1. Dossier: bestaand bijwerken (opnieuw opslaan) of een nieuw liquidatiedossier aanmaken.
    const dossierVelden = bouwDossierVelden({
      soort,
      dossierVelden: body.dossierVelden,
      zichtbareSleutels: body.zichtbareSleutels,
      aandeelhouders: body.aandeelhouders,
      datum, datumnotulen, kvknummer, cijfers,
    });
    let dossierId = veiligeStr(body.dossierId);
    if (dossierId) {
      await werkDossierBij(resource, token, soort, dossierId, { velden: dossierVelden });
    } else {
      dossierId = await maakDossier(resource, token, soort, {
        accountId,
        begindatum: datum, // cr283_datumliquidatie — de datum van ontbinding is de periode van een liquidatiedossier
        velden: dossierVelden,
      });
    }

    // 2. PDF renderen en in de SharePoint-map van de cliënt zetten.
    const pdf = await blokkenNaarPdf(blokken, null);
    const bestandsnaam = veiligeBestandsnaam(body.bestandsnaamBasis || `${modelNaam}${klantnaam ? " - " + klantnaam : ""}${datum ? " - " + datum : ""}`);
    const submap = await haalSubmap();
    const sharepoint = await naarSharepoint({ accountId, submap, bestandsnaam, buffer: pdf });

    // 3. De link naar het stuk op het dossier zetten (URL dossier — cr283_urlliquidatiestukken).
    if (sharepoint.gedaan && sharepoint.url) {
      try {
        await werkDossierBij(resource, token, soort, dossierId, { urlDossier: sharepoint.url });
      } catch (e) {
        // Best-effort: het stuk staat er, alleen de link op het dossier ontbreekt.
        if (context.log) context.log.error("URL op liquidatiedossier zetten mislukt:", e);
      }
    }

    // 4. Invulgegevens bewaren, zodat het stuk later te heropenen is.
    try {
      await bewaar({
        dossierId, accountId, klantnaam, modelNaam, datum,
        datumnotulen, kvknummer, bewaarder, cijfers,
        formulier: (body.formulier && typeof body.formulier === "object") ? body.formulier : {},
        velden: body.velden || {},
        dossierVelden: body.dossierVelden || {},
        invulwaarden: body.invulwaarden || {},
        aandeelhouders: Array.isArray(body.aandeelhouders) ? body.aandeelhouders : [],
        tekst: veiligeStr(body.tekst),
        besluit: veiligeStr(body.besluit),
        pdfUrl: sharepoint.url || "",
        bestandsnaam,
        opgesteldDoor: email || "",
      });
    } catch (e) {
      if (context.log) context.log.error("Liquidatie-invulgegevens bewaren mislukt:", e);
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
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het liquidatiestuk niet opslaan.", detail: String((err && err.message) || err) } };
  }
};
