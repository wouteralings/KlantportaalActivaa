/**
 * /api/medewerker-notulen-opslaan — een in het portaal opgestelde notulen vastleggen.
 * (Medewerkersportaal → Klantoverzicht → Notulen → "Notulen opstellen" → knop "Opslaan".)
 *
 * Waar komt wat terecht — bewust dezelfde weg als de brieven:
 *   1. de PDF  → de SharePoint-map van de cliënt, submap "Notulen" (map altijd server-side uit
 *                Dynamics afgeleid op accountId, nooit uit iets wat de browser meestuurt);
 *   2. de gegevens → een notulendossier in Dynamics (cr283_notulen): cliënt, vergaderdatum, bedrag,
 *                percentage, toelichting, de aandeel-percentages en de SharePoint-link (URL dossier);
 *   3. de invulgegevens (waaronder de NAMEN van de aandeelhouders, waar Dynamics alleen lookups
 *                voor heeft) → notulen-opgesteld.json in Blob Storage, zodat je het stuk later kunt
 *                heropenen en bijwerken. Zie _gedeeld/notulenStore.js voor het waarom.
 *
 *   GET  ?accountId=<guid>   → { notulen: [...] }   opgestelde notulen van deze cliënt
 *   GET  ?dossierId=<guid>   → { notulen: {...} }   één opgestelde notulen (om te heropenen)
 *   POST { accountId, dossierId?, modelNaam, datum, velden, aandeelhouders, blokken, tekst,
 *          bestandsnaamBasis }
 *        → { ok, dossierId, dossier, pdfUrl, sharepoint: { gedaan, reden } }
 *
 * Best-effort waar het kan: lukt de SharePoint-upload niet (map niet ingesteld, geen app-toegang),
 * dan is het dossier tóch aangemaakt en krijgt de medewerker de reden te zien — beter dan alles
 * terugdraaien en de ingevulde notulen kwijt zijn.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, maakDossier, werkDossierBij, verwijderDossier, metAangepasteVelden } = require("../_gedeeld/dossiers");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { blokkenNaarPdf } = require("../_gedeeld/notulenRenderer");
const { haalAlles, haalVoorDossier, haalVoorKlant, bewaar, verwijder } = require("../_gedeeld/notulenStore");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const SUBMAP_STANDAARD = "Notulen";
const PDF_TYPE = "application/pdf";

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

function veiligeBestandsnaam(basis) {
  const schoon = veiligeStr(basis)
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "Notulen";
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
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, [submap || SUBMAP_STANDAARD]);
    const geupload = await uploadBestand(appToken, map.driveId, doelId, bestandsnaam, buffer, PDF_TYPE);
    return { gedaan: true, url: (geupload && geupload.webUrl) || "" };
  } catch (e) {
    const reden = e && e.code === "APP_TOKEN_MISLUKT"
      ? "Kon geen app-toegang tot SharePoint krijgen (Graph-applicatiepermissie/admin-consent controleren)."
      : String(e.message || e);
    return { gedaan: false, reden };
  }
}

/** De notulen-soort met de door Beheer zelf aangemaakte extra velden erbij. */
async function haalNotulenSoort() {
  const soort = SOORTEN.find((s) => s.key === "notulen");
  if (!soort) return null;
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling.notulen;
    const aangepast = eigen && Array.isArray(eigen.aangepasteVelden) ? eigen.aangepasteVelden : [];
    return metAangepasteVelden(soort, aangepast);
  } catch {
    return soort;
  }
}

/** De submap in SharePoint waar notulen landen — instelbaar via Beheer (instellingen.notulenMap). */
async function haalSubmap() {
  try {
    const inst = await haalInstellingen();
    return veiligeStr(inst && inst.notulenMap) || SUBMAP_STANDAARD;
  } catch {
    return SUBMAP_STANDAARD;
  }
}

/**
 * Bouwt de velden voor het notulendossier. Basis is wat het opstel-scherm meestuurt: de velden uit de
 * veldencatalogus van de soort Notulen, zoals in Beheer → Dossiers ingedeeld (`dossierVelden`) — dus
 * ook zelf aangemaakte velden. Alleen sleutels die écht in de catalogus staan gaan mee; lookups slaan
 * we over (die koppelen aan een Dynamics-record en lopen via het dossier zelf).
 *
 * Daar bovenop zet dit endpoint wat het scherm apart beheert: de vergaderdatum als "Datum actie" en
 * de aandeel-percentages uit de aandeelhoudersrijen (cr283_aandeelhouders1..5).
 *
 * De NAMEN van de aandeelhouders gaan hier bewust NIET in: cr283_aandeelhouder1..5 zijn lookups naar
 * relaties, en een aandeelhouder in de notulen hoeft geen relatie in Dynamics te zijn. De namen
 * staan in het stuk zelf en in notulen-opgesteld.json (zie _gedeeld/notulenStore.js).
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
  if (datum) uit.datumactie = datum;
  // Aandeel-percentages: cr283_aandeelhouders1..5 (de catalogus kent er vijf).
  (Array.isArray(aandeelhouders) ? aandeelhouders : []).slice(0, 5).forEach((r, i) => {
    const pct = getal(r && r.percentage);
    if (pct !== null) uit[`aandeelhouders${i + 1}`] = pct;
  });
  return uit;
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
        context.res = { headers: { "Content-Type": "application/json" }, body: { notulen: await haalVoorDossier(dossierId) } };
        return;
      }
      const accountId = veiligeStr(req.query && req.query.accountId);
      if (accountId) {
        context.res = { headers: { "Content-Type": "application/json" }, body: { notulen: await haalVoorKlant(accountId) } };
        return;
      }
      // Zonder cliënt: álle opgestelde notulen, nieuwste eerst — het notulenlogboek (zelfde idee als
      // /api/brief-log zonder accountId).
      const alle = await haalAlles();
      const lijst = Object.values(alle || {})
        .filter(Boolean)
        .sort((a, b) => String(b.opgesteldOp || "").localeCompare(String(a.opgesteldOp || "")));
      context.res = { headers: { "Content-Type": "application/json" }, body: { notulen: lijst } };
    } catch (err) {
      // Zonder (leesbare) opslag gewoon een lege lijst: het opstellen zelf moet blijven werken.
      context.res = { headers: { "Content-Type": "application/json" }, body: { notulen: veiligeStr(req.query && req.query.dossierId) ? null : [] } };
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

  // ── actie "aanmaken": meteen een lege notulenrij in Dynamics ──────────────────────────────────
  // Zodra de medewerker in "Notulen opstellen" een cliënt kiest, ontstaat het notulendossier al —
  // dan staat het meteen in het overzicht en heeft het stuk vanaf het begin een dossier om aan te
  // hangen. Het vullen gebeurt daarna met "Opslaan" op dezelfde rij.
  if (actie === "aanmaken") {
    if (!accountId) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies eerst een cliënt." } };
      return;
    }
    try {
      const soort = await haalNotulenSoort();
      const token = await haalDynamicsToken();
      const datumNieuw = veiligeStr(body.datum).slice(0, 10) || null;
      const dossierId = await maakDossier(resource, token, soort, { accountId, begindatum: datumNieuw, velden: {} });
      const dossier = await haalEenDossier(resource, token, soort, dossierId).catch(() => null);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, dossierId, dossier } };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het notulendossier niet aanmaken.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  // ── actie "verwijderen": een zojuist automatisch aangemaakte, nog lege rij weer opruimen ──────
  // Gebeurt als de medewerker van cliënt wisselt zonder iets te hebben opgeslagen; zonder dit zou
  // elke wissel een lege notulenrij achterlaten.
  if (actie === "verwijderen") {
    const teVerwijderen = veiligeStr(body.dossierId);
    if (!teVerwijderen) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen dossierId meegegeven." } };
      return;
    }
    try {
      const soort = await haalNotulenSoort();
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

  // ── actie "logboek-verwijderen": een regel uit het notulenlogboek halen (alleen beheerder) ─────
  // Het stuk in SharePoint en het notulendossier in Dynamics blijven staan; alleen de vermelding in
  // het overzicht verdwijnt — zelfde afspraak als bij het brievenlogboek.
  if (actie === "logboek-verwijderen") {
    if (!rollen.includes("beheerder")) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen een beheerder kan notulen uit het logboek verwijderen." } };
      return;
    }
    const teVerwijderen = veiligeStr(body.dossierId);
    if (!teVerwijderen) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen dossierId meegegeven." } };
      return;
    }
    try {
      const gedaan = await verwijder(teVerwijderen);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, gedaan } };
    } catch (err) {
      if (context.log) context.log.error(err);
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de notulen niet uit het logboek verwijderen.", detail: String((err && err.message) || err) } };
    }
    return;
  }

  if (!accountId) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies eerst een cliënt." } };
    return;
  }
  if (!blokken.length) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Er is geen notulentekst meegestuurd." } };
    return;
  }

  const email = haalEmailUitPrincipal(req);
  const klantnaam = veiligeStr(body.klantnaam);
  const modelNaam = veiligeStr(body.modelNaam) || "Notulen";
  const datum = veiligeStr(body.datum).slice(0, 10) || null;

  try {
    const soort = await haalNotulenSoort();
    if (!soort) {
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "De notulen-dossiersoort is niet gevonden." } };
      return;
    }
    const token = await haalDynamicsToken();

    // 1. Dossier: bestaand bijwerken (opnieuw opslaan) of een nieuw notulendossier aanmaken.
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
        begindatum: datum, // cr283_datum — de vergaderdatum is de periode van een notulendossier
        velden: dossierVelden,
      });
    }

    // 2. PDF renderen en in de SharePoint-map van de cliënt zetten.
    const pdf = await blokkenNaarPdf(blokken, null);
    const bestandsnaam = veiligeBestandsnaam(body.bestandsnaamBasis || `${modelNaam}${klantnaam ? " - " + klantnaam : ""}${datum ? " - " + datum : ""}`);
    const submap = await haalSubmap();
    const sharepoint = await naarSharepoint({ accountId, submap, bestandsnaam, buffer: pdf });

    // 3. De link naar het stuk op het dossier zetten (URL dossier — cr283_urlnotulen).
    if (sharepoint.gedaan && sharepoint.url) {
      try {
        await werkDossierBij(resource, token, soort, dossierId, { urlDossier: sharepoint.url });
      } catch (e) {
        // Best-effort: het stuk staat er, alleen de link op het dossier ontbreekt.
        if (context.log) context.log.error("URL op notulendossier zetten mislukt:", e);
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
        besluit: veiligeStr(body.besluit),
        pdfUrl: sharepoint.url || "",
        bestandsnaam,
        opgesteldDoor: email || "",
      });
    } catch (e) {
      if (context.log) context.log.error("Notulen-invulgegevens bewaren mislukt:", e);
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
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de notulen niet opslaan.", detail: String((err && err.message) || err) } };
  }
};
