/**
 * /api/medewerker-dossier — één fiscaal dossier (IB/VPB) ophalen of bewerken vanuit het
 * medewerkersportaal. Elke medewerker/beheerder mag bewerken; een dossier dat in Dynamics op
 * Inactief (statecode) staat is alleen-lezen.
 *
 *   - GET  ?soort=ib|vpb&id=<guid>
 *       → { dossier, statusOpties, catalogus, secties, verborgen, voorwaarden, alleenLezen,
 *           picklistOpties, gekoppeldeUitvragen, gekoppeldeLijstId, onderwerpId, defaultContact,
 *           sjabloon }   (sjabloon = { sjablonen: [{ id, naam, tekst }] } — de voorbeeld-document-
 *           sjablonen voor notulen/dividend uit Beheer → Dossiers; lege lijst voor andere soorten.
 *           Zie haalSjabloonVoor().)
 *         (catalogus bevat naast de vrije catalogus ook de "vaste" velden __status/__urlDossier/
 *         __documentUrl (zie vasteVeldenVoorSoort() in dossierVelden.js) en eventuele door Wouter
 *         zelf via Beheer → Dossiers aangemaakte extra velden (dossierIndeling.<soort>.
 *         aangepasteVelden — zie api/dossier-kolom-aanmaken), met eventuele eigen labels
 *         (dossierIndeling.<soort>.labels) al toegepast; secties/subsecties zijn voor soorten
 *         zonder eigen vrije catalogus — momenteel alleen "ib" heeft die — beperkt tot één
 *         "Algemeen"-sectie met alleen die vaste velden. gekoppeldeUitvragen = de aanleververzoeken
 *         ("uitvraaglijsten", zie api/_gedeeld/aanleververzoeken.js) van deze cliënt die bij het aan
 *         deze dossiersoort gekoppelde onderwerp (dossierIndeling.<soort>.onderwerpId, door Wouter
 *         ingesteld via Beheer → Dossiers) en, indien het dossier een jaar heeft, hetzelfde jaar
 *         horen — leeg als er geen onderwerp gekoppeld is. Elk item is het volledige, verrijkte
 *         verzoek (zelfde vorm/verrijkVerzoek() als het Vragenlijsten-werkoverzicht — documenten,
 *         vragen, voortgang), zodat het medewerkersportaal de vragenlijst rechtstreeks in het
 *         dossier kan tonen én laten beantwoorden (VragenlijstDetail-component). Zie
 *         gekoppeldeUitvragenVoorDossier() hieronder. gekoppeldeLijstId = de standaard-aanleverlijst
 *         van datzelfde gekoppelde onderwerp (onderwerp.standaardLijstId) — gebruikt om de ingebedde
 *         "Vaste uitvragen" (klantkaart) in het dossier op voor te sorteren (die lijst bovenaan en
 *         opengeklapt); leeg zonder gekoppeld onderwerp of standaardlijst. Zie
 *         gekoppeldeLijstIdVoorDossier() hieronder. onderwerpId = het aan deze dossiersoort
 *         gekoppelde onderwerp zelf (indeling.onderwerpId, leeg zonder koppeling) — meegegeven zodat
 *         een vanuit dit dossier uitgezette "Vaste uitvraag" (ingebedde KlantVasteUitvragen) meteen
 *         met dit onderwerp getagd wordt en dus zelf ook als gekoppeldeUitvragen terugkomt, zonder
 *         dat de medewerker de lijst zelf hoeft te "raden" via de standaardLijstId-fallback in
 *         api/medewerker-aanleververzoeken. defaultContact = { id, naam } van de primaire
 *         contactpersoon van de cliënt (Dynamics account.primarycontactid), of null — vult de
 *         contactpersoon in de ingebedde "Vaste uitvragen" voor, net als op de klantkaart zelf. Zie
 *         haalPrimairContactVoorDossier() hieronder.)
 *   - POST { soort, id, status?, urlDossier?, documentUrl?, velden? }  → bijwerken (weigert bij
 *         inactief). "velden" is de vrije bag met catalogussleutels, bijv. { loon: true }.
 *         Velden die in Beheer → Dossiers op alleen-lezen staan worden hier genegeerd, ook al
 *         staan ze in de request-body (server-side afdwingen, niet alleen in het scherm).
 *   - POST { soort, id, actie: "verwijderen" }  → dossier DEFINITIEF uit Dynamics verwijderen
 *         (geen terugweg). Gate: Azure-rol 'beheerder', of het verwijder-recht voor deze soort
 *         (magVerwijderIb/magVerwijderVpb, zie api/_gedeeld/wijzigrechten.js — in te stellen via
 *         Beheer → Medewerkers). Werkt ongeacht of het dossier inactief staat.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, werkDossierBij, verwijderDossier, haalDynamischePicklistOpties, metAangepasteVelden } = require("../_gedeeld/dossiers");
const { haalInstellingen, resolveBijlageConfig } = require("../_gedeeld/instellingen");
const { standaardIndelingIB, standaardIndelingVPB, standaardIndelingDividend, standaardIndelingNotulen, standaardIndelingOverig, vasteVeldenVoorSoort, metLabels } = require("../_gedeeld/dossierVelden");
const { haalVoorAccounts, haalLaatstGezien, verrijkVerzoek } = require("../_gedeeld/aanleververzoeken");
const { haalOnderwerpen } = require("../_gedeeld/aanleveronderwerpen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { magVerwijderIb, magVerwijderVpb } = require("../_gedeeld/wijzigrechten");
const { magSubBulkVerwijderen } = require("../_gedeeld/rollenConfig");
const { haalSystemuser } = require("../_gedeeld/takenGedeeld");
// Deze drie zijn "extra's" bovenop het dossier zelf (review, voorlopige aangifte, taakketen). Bewust
// defensief inladen: ontbreekt er één na een deploy waarin niet alle bestanden zijn meegegaan, dan
// mag dat nooit het hele dossierscherm platleggen — de betreffende knop verdwijnt dan gewoon.
function optioneel(pad) {
  try { return require(pad); } catch { return null; }
}
const dossierReview = optioneel("../_gedeeld/dossierReview") || {};
const dossierVoorlopig = optioneel("../_gedeeld/dossierVoorlopig") || {};
const dossierTaakketen = optioneel("../_gedeeld/dossierTaakketen") || {};
const heeftReview = typeof dossierReview.instellingenVoorSoort === "function";
const heeftVoorlopig = typeof dossierVoorlopig.instellingenVoorSoort === "function";

/** Haalt de (door Beheer → Dossiers ingestelde) indeling van een soort op — secties (met
 * eventuele subrubrieken), verborgen velden, tonen-alleen-als-voorwaarden, alleen-lezen velden,
 * eigen labels en zelf aangemaakte extra velden — met een standaardindeling als terugval zolang
 * er nog niets eigens is opgeslagen. Soorten zonder eigen vrije catalogus (vooralsnog VPB)
 * krijgen een minimale standaardindeling met alleen de vaste velden (Status/links), zodat die
 * blijven verschijnen ook zonder Beheer-indeling. */
async function haalIndeling(soort) {
  const standaard = soort.key === "ib" ? standaardIndelingIB()
    : soort.key === "vpb" ? standaardIndelingVPB()
    : soort.key === "dividend" ? standaardIndelingDividend()
    : soort.key === "notulen" ? standaardIndelingNotulen()
    : standaardIndelingOverig(soort);
  try {
    const { dossierIndeling } = await haalInstellingen();
    const eigen = dossierIndeling && dossierIndeling[soort.key];
    const secties = eigen && Array.isArray(eigen.secties) && eigen.secties.length ? eigen.secties : standaard.secties;
    const verborgen = eigen && Array.isArray(eigen.verborgen) ? eigen.verborgen : standaard.verborgen;
    const voorwaarden = eigen && eigen.voorwaarden && typeof eigen.voorwaarden === "object" ? eigen.voorwaarden : standaard.voorwaarden;
    const alleenLezen = eigen && Array.isArray(eigen.alleenLezen) ? eigen.alleenLezen : standaard.alleenLezen;
    const labels = eigen && eigen.labels && typeof eigen.labels === "object" ? eigen.labels : standaard.labels;
    const aangepasteVelden = eigen && Array.isArray(eigen.aangepasteVelden) ? eigen.aangepasteVelden : standaard.aangepasteVelden;
    const onderwerpId = eigen && typeof eigen.onderwerpId === "string" ? eigen.onderwerpId : standaard.onderwerpId;
    return { secties, verborgen, voorwaarden, alleenLezen, labels, aangepasteVelden, onderwerpId };
  } catch {
    return standaard;
  }
}

/** Zoekt de aanleververzoeken ("uitvraaglijsten") die bij dit dossier horen — zelfde cliënt
 * (accountId), gekoppeld onderwerp (Beheer → Dossiers stelt per dossiersoort in welk onderwerp uit
 * Beheer → Onderwerpen erbij hoort) en, als het dossier een jaar heeft, ook hetzelfde jaar. Geeft de
 * volledige, verrijkte verzoeken terug (zelfde vorm als het Vragenlijsten-werkoverzicht: documenten,
 * vragen, voortgang, activiteit — via de gedeelde verrijkVerzoek()) zodat een medewerker de
 * vragenlijst rechtstreeks vanuit het dossier kan doorlopen en beantwoorden (VragenlijstDetail-
 * component, ook gebruikt door Vragenlijsten.jsx) zonder naar het tabblad Vragenlijsten te hoeven.
 * Best-effort: als de aanleververzoeken-opslag niet gelezen kan worden, blokkeert dat het dossier
 * niet (lege lijst). Zonder gekoppeld onderwerp (onderwerpId leeg) meteen een lege lijst terug. */
async function gekoppeldeUitvragenVoorDossier(dossier, onderwerpId) {
  if (!onderwerpId || !dossier || !dossier.accountId) return [];
  try {
    const [alle, laatstGezien] = await Promise.all([
      haalVoorAccounts([dossier.accountId]),
      haalLaatstGezien().catch(() => null),
    ]);
    const jaarDossier = dossier.jaar != null && dossier.jaar !== "" ? String(dossier.jaar) : "";
    const gefilterd = alle.filter((v) => v.onderwerpId === onderwerpId && (!jaarDossier || !v.jaar || v.jaar === jaarDossier));
    gefilterd.sort((a, b) => String(b.aangemaaktOp || "").localeCompare(String(a.aangemaaktOp || "")));
    return gefilterd.map((v) => verrijkVerzoek(v, laatstGezien));
  } catch {
    return [];
  }
}

/** Zoekt de standaard-aanleverlijst die bij het aan deze dossiersoort gekoppelde onderwerp hoort
 *  (Beheer → Dossiers → "Gekoppelde uitvraaglijst"). Gebruikt door het medewerkersportaal om de
 *  ingebedde "Vaste uitvragen" (zie DossierDetail/KlantVasteUitvragen in MedewerkerPortaal.jsx) op
 *  voor te sorteren, zodat de bij dit dossier horende lijst bovenaan staat en meteen opengeklapt is
 *  i.p.v. dat de medewerker tussen alle aanleverlijsten moet zoeken. Leeg zonder gekoppeld onderwerp,
 *  of als dat onderwerp (nog) geen standaardlijst heeft. Best-effort: faalt de onderwerpen-opslag,
 *  dan blokkeert dat het dossier niet. */
async function gekoppeldeLijstIdVoorDossier(onderwerpId) {
  if (!onderwerpId) return "";
  try {
    const onderwerp = (await haalOnderwerpen()).find((o) => o.id === onderwerpId);
    return (onderwerp && onderwerp.standaardLijstId) || "";
  } catch {
    return "";
  }
}

/** Voorbeeld-sjablonen (één of meer benoemde sjablonen) voor de "Voorbeeld"-knop in het notulen-/
 *  dividenddossier — ingesteld via Beheer → Dossiers, per soort onder de indelingskaart
 *  (DossierSjablonenPerSoort in DossierSjablonenBeheer.jsx), opgeslagen onder de generieke
 *  instellingen-sleutel dossierSjablonen[soort] = { sjablonen: [{ id, naam, tekst }] }. De medewerker
 *  kiest in het dossier welk sjabloon hij als voorbeeld op blanco A4 opent. Alleen zinvol voor
 *  notulen/dividend; andere soorten krijgen een lege lijst terug. Terugwaarts compatibel met de oude
 *  vorm { standaard, perSoort } (die wordt naar de sjablonen-lijst gemigreerd). Best-effort: zonder
 *  (leesbare) instellingen gewoon leeg — dat mag het openen van het dossier niet blokkeren. */
async function haalSjabloonVoor(soortKey) {
  if (soortKey !== "notulen" && soortKey !== "dividend") return { sjablonen: [] };
  try {
    const { dossierSjablonen } = await haalInstellingen();
    const eigen = dossierSjablonen && dossierSjablonen[soortKey];
    if (eigen && Array.isArray(eigen.sjablonen)) {
      const sjablonen = eigen.sjablonen
        .filter((s) => s && (s.naam != null || s.tekst != null))
        .map((s, i) => ({ id: s.id || `s${i}`, naam: String(s.naam || "Naamloos sjabloon"), tekst: String(s.tekst || "") }));
      return { sjablonen };
    }
    // Terugwaartse compat: oude vorm { standaard, perSoort } → één of meer sjablonen.
    const sjablonen = [];
    if (eigen && typeof eigen.standaard === "string" && eigen.standaard.trim()) sjablonen.push({ id: "standaard", naam: "Standaard", tekst: eigen.standaard });
    if (eigen && eigen.perSoort && typeof eigen.perSoort === "object") {
      for (const [k, v] of Object.entries(eigen.perSoort)) if (v && String(v).trim()) sjablonen.push({ id: `soort_${k}`, naam: `Soort ${k}`, tekst: String(v) });
    }
    return { sjablonen };
  } catch {
    return { sjablonen: [] };
  }
}

/** Haalt de primaire contactpersoon van de cliënt van dit dossier op (Dynamics account.
 *  primarycontactid) — gebruikt om de ingebedde "Vaste uitvragen" (zie KlantVasteUitvragen) in het
 *  dossier meteen op die contactpersoon voor te vullen, net als op de klantkaart zelf (daar komt
 *  hij uit dezelfde primarycontactid via /api/beheer-klanten). Eén lichte losse aanroep i.p.v. de
 *  hele klantenlijst erbij ophalen. Best-effort: zonder (leesbare) primaire contactpersoon null. */
async function haalPrimairContactVoorDossier(resource, token, accountId) {
  if (!accountId) return null;
  try {
    const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=accountid&$expand=primarycontactid($select=contactid,fullname)`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!r.ok) return null;
    const d = await r.json();
    const c = d.primarycontactid;
    if (!c || !c.contactid) return null;
    return { id: c.contactid, naam: c.fullname || "" };
  } catch {
    return null;
  }
}

/** De bijlage-dropzone-config van deze dossiersoort (Beheer → Dossiers, sleutel <soort>Bijlage) —
 *  { aan, trigger, map, bestandsnaam }. Het medewerkersportaal beslist hiermee of (en wanneer, op basis
 *  van het gekozen ja/nee-veld 'trigger') de bijlage-kaart in het dossier verschijnt. Best-effort:
 *  zonder (leesbare) instellingen valt het terug op de standaard van de soort. */
async function haalBijlageVoor(soortKey) {
  try { return resolveBijlageConfig(await haalInstellingen(), soortKey); }
  catch { return resolveBijlageConfig({}, soortKey); }
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  const email = haalEmailUitPrincipal(req);
  const methode = (req.method || "GET").toUpperCase();

  const soortVan = (k) => SOORTEN.find((s) => s.key === k);

  try {
    const token = await haalDynamicsToken();

    if (methode === "GET") {
      const soort = soortVan((req.query && req.query.soort) || "");
      const id = (req.query && req.query.id) || "";
      if (!soort || !id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort' (ib/vpb) en 'id' mee." } }; return; }
      const indeling = await haalIndeling(soort);
      // soortEffectief kent ook Wouters zelf aangemaakte extra velden (Dynamics-kolom + key),
      // zodat haalEenDossier/haalDynamischePicklistOpties die ook echt meeselecteren/ophalen.
      const soortEffectief = metAangepasteVelden(soort, indeling.aangepasteVelden);
      const [dossier, picklistOpties] = await Promise.all([
        haalEenDossier(resource, token, soortEffectief, id),
        haalDynamischePicklistOpties(resource, token, soortEffectief),
      ]);
      if (!dossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
      const catalogusRuw = [...vasteVeldenVoorSoort(soort), ...(soortEffectief.catalogus || [])];
      const catalogus = metLabels(catalogusRuw, indeling.labels);
      // Gekoppelde uitvraaglijst(en) (aanleververzoeken) — alleen als Wouter in Beheer → Dossiers
      // een onderwerp aan deze dossiersoort heeft gekoppeld (indeling.onderwerpId). Primaire
      // contactpersoon van de cliënt — voor het voorinvullen van de ingebedde "Vaste uitvragen".
      const [gekoppeldeUitvragen, gekoppeldeLijstId, defaultContact, sjabloon, bijlage, reviewCfg, reviewGeschiedenis, voorlopigCfg, voorlopigNu] = await Promise.all([
        gekoppeldeUitvragenVoorDossier(dossier, indeling.onderwerpId),
        gekoppeldeLijstIdVoorDossier(indeling.onderwerpId),
        haalPrimairContactVoorDossier(resource, token, dossier.accountId),
        haalSjabloonVoor(soort.key),
        haalBijlageVoor(soort.key),
        heeftReview ? dossierReview.instellingenVoorSoort(soort.key).catch(() => ({ aan: false })) : { aan: false },
        heeftReview ? dossierReview.haalVoorDossier(soort.key, id).catch(() => []) : [],
        heeftVoorlopig ? dossierVoorlopig.instellingenVoorSoort(soort.key).catch(() => ({ aan: false, redenen: [] })) : { aan: false, redenen: [] },
        heeftVoorlopig ? dossierVoorlopig.haalVoorDossier(soort.key, id).catch(() => null) : null,
      ]);
      // `review` vertelt het scherm of de knop "Review aanvragen" mag verschijnen (aan + een
      // gekoppelde taaksoort), of er al een review loopt, en wat de vorige rondes opleverden.
      const review = {
        aan: !!reviewCfg.aan && reviewCfg.taakSoort !== null && reviewCfg.taakSoort !== undefined,
        ingesteld: !!reviewCfg.aan,
        lopend: reviewGeschiedenis.find((r) => r.status === "open") || null,
        geschiedenis: reviewGeschiedenis.slice(0, 20),
      };
      // `voorlopig` stuurt de knop "Voorlopige aangifte": aan + een gekoppelde taaksoort + minstens
      // één actieve reden, en de eventueel al lopende registratie op dit dossier.
      const voorlopig = {
        aan: !!voorlopigCfg.aan && voorlopigCfg.taakSoort !== null && voorlopigCfg.taakSoort !== undefined
          && (voorlopigCfg.redenen || []).some((r) => r.actief !== false),
        ingesteld: !!voorlopigCfg.aan,
        redenen: (voorlopigCfg.redenen || []).filter((r) => r.actief !== false),
        standaardTermijnMaanden: voorlopigCfg.standaardTermijnMaanden || 6,
        huidig: voorlopigNu,
      };
      context.res = { headers: { "Content-Type": "application/json" }, body: { dossier, statusOpties: soort.statusOpties, catalogus, secties: indeling.secties, verborgen: indeling.verborgen, voorwaarden: indeling.voorwaarden, alleenLezen: indeling.alleenLezen, picklistOpties, gekoppeldeUitvragen, gekoppeldeLijstId, onderwerpId: indeling.onderwerpId || "", defaultContact, sjabloon, bijlage, review, voorlopig } };
      return;
    }

    if (methode === "POST" || methode === "PATCH") {
      const { soort: soortKey, id, actie, status, urlDossier, documentUrl, velden: veldenBag, fiscaalPartnerAccountId } = req.body || {};
      const soort = soortVan(soortKey);
      if (!soort) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort' (ib/vpb) mee." } }; return; }

      // ── Meerdere dossiers van deze soort in één keer definitief verwijderen ──
      //    Gate: BEHEERDER, of een rol met bulk-verwijderrecht op de bijbehorende subpagina
      //    (Beheer → Rollen & rechten → subpagina's → Bulk). Zelfde definitieve verwijdering per dossier.
      if (actie === "bulk-verwijderen") {
        const magBulkWeg = rollen.includes("beheerder") || (await magSubBulkVerwijderen(email, `klantoverzicht.${soort.key}`));
        if (!magBulkWeg) {
          context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: `Je rol mag ${soort.label.toLowerCase()}-dossiers niet in bulk verwijderen.` } };
          return;
        }
        const ids = Array.isArray(req.body && req.body.ids)
          ? [...new Set(req.body.ids.map((x) => String(x || "").trim()).filter(Boolean))]
          : [];
        if (!ids.length) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'ids' mee." } }; return; }
        if (ids.length > 100) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Maximaal 100 dossiers per keer." } }; return; }
        let gelukt = 0;
        const mislukt = [];
        for (const did of ids) {
          try {
            const huidig = await haalEenDossier(resource, token, soort, did);
            if (!huidig) { mislukt.push(did); continue; }
            await verwijderDossier(resource, token, soort, did);
            await logGebeurtenis({
              door: email || "onbekend", actie: "dossier", accountId: huidig.accountId, accountIds: [huidig.accountId],
              klantnaam: huidig.klantnaam,
              tekst: `Dossier ${soort.label}${huidig.jaar ? ` ${huidig.jaar}` : ""} van ${huidig.klantnaam || "de cliënt"} definitief verwijderd (bulk).`,
            }).catch(() => {});
            gelukt += 1;
          } catch (e) { mislukt.push(did); }
        }
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verwijderd: gelukt, mislukt } };
        return;
      }

      if (!id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'id' mee." } }; return; }

      // ── Dossier definitief verwijderen (gate: beheerder, of het verwijder-recht voor deze soort) ──
      if (actie === "verwijderen") {
        // Per soort een eigen verwijder-recht. Soorten zonder eigen recht (dividend/notulen) mogen
        // alleen door een beheerder verwijderd worden — nooit via het IB/VPB-recht.
        const rechthebbendeFunctie = soort.key === "vpb" ? magVerwijderVpb
          : soort.key === "ib" ? magVerwijderIb
          : (async (_email, isBeheerder) => isBeheerder);
        if (!(await rechthebbendeFunctie(email, rollen.includes("beheerder")))) {
          context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: `Je hebt geen rechten om ${soort.label.toLowerCase()}-dossiers te verwijderen. Vraag een beheerder om dit recht toe te kennen via Beheer → Medewerkers.` } };
          return;
        }
        const huidig = await haalEenDossier(resource, token, soort, id);
        if (!huidig) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
        await verwijderDossier(resource, token, soort, id);
        await logGebeurtenis({
          door: email || "onbekend", actie: "dossier", accountId: huidig.accountId, accountIds: [huidig.accountId],
          klantnaam: huidig.klantnaam,
          tekst: `Dossier ${soort.label}${huidig.jaar ? ` ${huidig.jaar}` : ""} van ${huidig.klantnaam || "de cliënt"} definitief verwijderd.`,
        });
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
        return;
      }

      // ── Voorlopige aangifte: markeren mét reden, toelichting én een ingeplande herziening ──
      //    Bewust drie verplichte velden: zonder reden/toelichting weet niemand later waaróm het
      //    voorlopig was, en zonder herzieningstaak blijft het dossier stil hangen.
      if (actie === "voorlopige-aangifte") {
        if (!heeftVoorlopig) {
          context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De module voor voorlopige aangiftes is nog niet uitgerold (api/_gedeeld/dossierVoorlopig.js ontbreekt op de server)." } };
          return;
        }
        const cfg = await dossierVoorlopig.instellingenVoorSoort(soort.key);
        if (!cfg.aan) {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `"Voorlopige aangifte" staat voor ${soort.label.toLowerCase()}-dossiers nog uit. Zet 'm aan bij Beheer → Dossiers → Voorlopige aangifte.` } };
          return;
        }
        if (cfg.taakSoort === null) {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: "Er is nog geen taaksoort gekoppeld aan de herzieningstaak. Stel die in bij Beheer → Dossiers → Voorlopige aangifte." } };
          return;
        }
        const redenSleutel = String((req.body && req.body.reden) || "").trim();
        const toelichting = String((req.body && req.body.toelichting) || "").trim();
        const reden = (cfg.redenen || []).find((r) => r.sleutel === redenSleutel && r.actief !== false);
        if (!reden) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies een geldige reden voor de voorlopige aangifte." } };
          return;
        }
        if (toelichting.length < 3) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Een toelichting is verplicht — leg kort vast waarom deze aangifte voorlopig is." } };
          return;
        }
        // De herzieningsdatum staat standaard op de jaarlijkse datum uit Beheer (standaard 1
        // december), zodat alle herzieningen op hetzelfde moment bij de cliënten worden uitgevraagd.
        // Wijkt een dossier af, dan mag de medewerker er een eigen datum voor in de plaats zetten —
        // die komt als deadline op de taak te staan en is daarna ook in de taak zelf nog te wijzigen.
        const standaardDatum = dossierVoorlopig.volgendeHerzieningsdatum(cfg);
        const eigenDatumRuw = String((req.body && req.body.herzienOp) || "").trim();
        let herzienDatum = standaardDatum;
        if (eigenDatumRuw) {
          const d = new Date(eigenDatumRuw);
          if (isNaN(d.getTime())) {
            context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "De herzieningsdatum is geen geldige datum." } };
            return;
          }
          const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
          if (d < vandaag) {
            context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "De herzieningsdatum ligt in het verleden. Kies een datum vanaf vandaag." } };
            return;
          }
          herzienDatum = d;
        }

        const huidigDossier = await haalEenDossier(resource, token, soort, id);
        if (!huidigDossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
        if (!huidigDossier.actief) {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: "Dit dossier staat op inactief; een voorlopige aangifte markeren kan alleen bij een actief dossier." } };
          return;
        }
        const lopend = await dossierVoorlopig.haalVoorDossier(soort.key, id).catch(() => null);
        if (lopend && lopend.status === "open") {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Dit dossier staat al als voorlopige aangifte gemarkeerd (herziening gepland op ${lopend.herzienOp ? new Date(lopend.herzienOp).toLocaleDateString("nl-NL") : "onbekend"}). Rond die herzieningstaak eerst af.` } };
          return;
        }

        const periode = dossierVoorlopig.periodeTekst(huidigDossier);
        const ikzelf = await haalSystemuser(resource, token, email).catch(() => null);
        // Herzieningstaak — bij de manager van het dossier, met de gekozen datum als deadline en de
        // dossierkoppeling erin zodat je er vanuit de taak meteen bij kunt.
        const taakId = await dossierVoorlopig.maakTaak(resource, token, {
          subject: dossierVoorlopig.vulSjabloonIn(cfg.taakOnderwerp, {
            klant: huidigDossier.klantnaam || "", periode, jaar: huidigDossier.jaar || "", soort: soort.label,
          }),
          // De taak is een UITVRAAG BIJ DE CLIËNT: is er iets gewijzigd waardoor de aangifte herzien
          // moet worden? De cliënt ziet 'm in het portaal (mits de taaksoort daar op "zichtbaar"
          // staat, zie Beheer → Taken); de omschrijving is dus in de je-vorm geschreven.
          description: [
            `Voor u is een voorlopige ${soort.label.toLowerCase()}${periode ? ` over ${periode}` : ""} ingediend.`,
            `\nReden dat deze voorlopig is: ${reden.label}`,
            `Toelichting van uw accountant: ${toelichting}`,
            `\nIs er inmiddels iets gewijzigd waardoor de aangifte herzien moet worden? Laat het ons via deze taak weten. Is er niets veranderd, dan kunt u de taak afronden.`,
          ].join("\n") + (typeof dossierTaakketen.maakRef === "function"
            ? dossierTaakketen.maakRef(soort.key, id, "voorlopig")
            : `\n\n[dossier-ref: ${soort.key}:${id}|voorlopig]`),
          accountId: huidigDossier.accountId,
          soortWaarde: cfg.taakSoort,
          rubriekWaarde: cfg.taakRubriek,
          eigenaarId: huidigDossier.managerId || (ikzelf && ikzelf.id) || "",
          deadline: herzienDatum.toISOString(),
        });

        await dossierVoorlopig.zetVoorlopig({
          dossierSoort: soort.key, dossierId: id,
          accountId: huidigDossier.accountId, klantnaam: huidigDossier.klantnaam, periode,
          redenSleutel: reden.sleutel, redenLabel: reden.label,
          toelichting, herzienOp: herzienDatum.toISOString(), taakId,
          doorEmail: email, doorNaam: (ikzelf && ikzelf.naam) || "",
        });

        // Dossierstatus meebewegen — best-effort, de taak en de registratie staan er al.
        if (cfg.status !== null) {
          try {
            const indelingNu = await haalIndeling(soort);
            if (!new Set(indelingNu.alleenLezen || []).has("__status")) {
              await werkDossierBij(resource, token, soort, id, { status: cfg.status });
            }
          } catch (e) {
            context.log.error("Dossierstatus na voorlopige aangifte bijwerken mislukt (de taak staat er wél):", e);
          }
        }

        await logGebeurtenis({
          door: email || "onbekend", actie: "dossier", accountId: huidigDossier.accountId, accountIds: [huidigDossier.accountId],
          klantnaam: huidigDossier.klantnaam,
          tekst: `Dossier ${soort.label}${periode ? ` ${periode}` : ""} gemarkeerd als voorlopige aangifte (${reden.label}); herziening gepland op ${herzienDatum.toLocaleDateString("nl-NL")}.`,
        }).catch(() => {});

        const dossierNa = await haalEenDossier(resource, token, soort, id).catch(() => null);
        const registratie = await dossierVoorlopig.haalVoorDossier(soort.key, id).catch(() => null);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, taakId, voorlopig: registratie, dossier: dossierNa } };
        return;
      }

      // ── Review aanvragen: leg dit dossier ter review bij een collega neer ──────────────────
      //    Maakt een REVIEWTAAK in Dynamics bij de gekozen reviewer, zet de dossierstatus op
      //    "gereed voor review" en legt vast wie de aanvrager was — die krijgt na het aftekenen de
      //    vervolgtaak terug (zie api/mw-taken, acties review-akkoord / review-aanpassen).
      if (actie === "review-aanvragen") {
        if (!heeftReview) {
          context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De reviewmodule is nog niet uitgerold (api/_gedeeld/dossierReview.js ontbreekt op de server)." } };
          return;
        }
        const cfg = await dossierReview.instellingenVoorSoort(soort.key);
        if (!cfg.aan) {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Review staat voor ${soort.label.toLowerCase()}-dossiers nog uit. Zet 'm aan bij Beheer → Dossiers → Review.` } };
          return;
        }
        if (cfg.taakSoort === null) {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: "Er is nog geen taaksoort gekoppeld aan de reviewtaak. Stel die in bij Beheer → Dossiers → Review." } };
          return;
        }
        // De reviewer komt óf als systemuser-id binnen (de manager van het dossier — die staat al als
        // Dynamics-lookup op het dossier, dus geen omweg via e-mail nodig), óf als e-mailadres (een
        // zelf opgezochte collega uit de medewerkerslijst).
        const reviewerSystemuserId = String((req.body && req.body.reviewerSystemuserId) || "").trim();
        const reviewerEmail = String((req.body && req.body.reviewerEmail) || "").trim().toLowerCase();
        const reviewerNaam = String((req.body && req.body.reviewerNaam) || "").trim();
        const toelichting = String((req.body && req.body.toelichting) || "").trim();
        if (!reviewerSystemuserId && !reviewerEmail) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies een reviewer." } };
          return;
        }
        const huidigDossier = await haalEenDossier(resource, token, soort, id);
        if (!huidigDossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
        if (!huidigDossier.actief) { context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: "Dit dossier staat op inactief en kan niet ter review worden gelegd." } }; return; }

        const alLopend = await dossierReview.haalOpenVoorDossier(soort.key, id).catch(() => null);
        if (alLopend) {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Er loopt al een review bij ${alLopend.reviewerNaam || alLopend.reviewerEmail}. Laat die eerst aftekenen.` } };
          return;
        }

        // Reviewer → systemuser (eigenaar van de taak). Zonder match kan de taak nergens heen.
        const reviewerUser = reviewerSystemuserId
          ? await dossierReview.haalSystemuserOpId(resource, token, reviewerSystemuserId).catch(() => null)
          : await haalSystemuser(resource, token, reviewerEmail).catch(() => null);
        if (!reviewerUser || !reviewerUser.id) {
          context.res = {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: {
              error: reviewerSystemuserId
                ? `De gekozen reviewer${reviewerNaam ? ` (${reviewerNaam})` : ""} is geen actieve Dynamics-gebruiker (meer). Kies iemand anders.`
                : `Geen actieve Dynamics-gebruiker gevonden voor ${reviewerEmail}. Controleer het e-mailadres bij Beheer → Uren → Tarieven.`,
            },
          };
          return;
        }
        const aanvrager = await haalSystemuser(resource, token, email).catch(() => null);
        // Niet bij jezelf neerleggen — nu op systemuser-id, want de manager komt zonder e-mail binnen.
        const eigenEmail = String(email || "").toLowerCase();
        const zelfGekozen = (aanvrager && aanvrager.id && String(reviewerUser.id).toLowerCase() === String(aanvrager.id).toLowerCase())
          || (!!reviewerUser.email && reviewerUser.email === eigenEmail)
          || (!!reviewerEmail && reviewerEmail === eigenEmail);
        if (zelfGekozen) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Je kunt de review niet bij jezelf neerleggen. Kies een collega." } };
          return;
        }

        const periode = dossierReview.periodeTekst(huidigDossier);
        const sjabloonVelden = {
          klant: huidigDossier.klantnaam || "",
          jaar: huidigDossier.jaar || "",
          // {periode} = jaar, of bij notulen de vergaderdatum — zo werkt één sjabloon voor elke soort.
          periode,
          soort: soort.label,
          aanvrager: (aanvrager && aanvrager.naam) || email || "",
          reviewer: reviewerUser.naam || reviewerNaam || reviewerEmail,
        };
        const omschrijving = [
          `Review aangevraagd door ${(aanvrager && aanvrager.naam) || email || "een collega"} op het dossier ${soort.label}${huidigDossier.jaar ? ` ${huidigDossier.jaar}` : ""} van ${huidigDossier.klantnaam || "de cliënt"}.`,
          toelichting ? `\nToelichting van de aanvrager:\n${toelichting}` : "",
          "\nTeken de review af in het Taken-overzicht met \"Akkoord\" of \"Aanpassen na review\"; je opmerking komt in de vervolgtaak terecht.",
        ].filter(Boolean).join("\n");

        const taakId = await dossierReview.maakTaak(resource, token, {
          subject: dossierReview.vulSjabloonIn(cfg.taakOnderwerp, sjabloonVelden),
          description: omschrijving,
          accountId: huidigDossier.accountId,
          soortWaarde: cfg.taakSoort,
          rubriekWaarde: cfg.taakRubriek,
          eigenaarId: reviewerUser.id,
        });

        await dossierReview.zetReview({
          taakId,
          dossierSoort: soort.key,
          dossierId: id,
          accountId: huidigDossier.accountId,
          klantnaam: huidigDossier.klantnaam,
          jaar: huidigDossier.jaar,
          periode,
          aanvragerEmail: email,
          aanvragerNaam: (aanvrager && aanvrager.naam) || "",
          reviewerEmail: reviewerUser.email || reviewerEmail,
          reviewerNaam: reviewerUser.naam || reviewerNaam,
          toelichting,
        });

        // Status + "Review door" op het dossier meebewegen — best-effort: de taak staat er al, die
        // mag niet sneuvelen op een dossierveld dat toevallig op alleen-lezen staat.
        try {
          const indelingNu = await haalIndeling(soort);
          const alleenLezenNu = new Set(indelingNu.alleenLezen || []);
          const teZetten = {};
          if (cfg.statusAanvraag !== null && !alleenLezenNu.has("__status")) teZetten.status = cfg.statusAanvraag;
          const catalogusKeys = new Set((soort.catalogus || []).map((v) => v.key));
          if (catalogusKeys.has("reviewdoor") && !alleenLezenNu.has("reviewdoor")) {
            teZetten.velden = { reviewdoor: (reviewerUser.naam || reviewerNaam || reviewerEmail).slice(0, 100) };
          }
          if (Object.keys(teZetten).length) await werkDossierBij(resource, token, soort, id, teZetten);
        } catch (e) {
          context.log.error("Dossierstatus na review-aanvraag bijwerken mislukt (de reviewtaak staat er wél):", e);
        }

        await logGebeurtenis({
          door: email || "onbekend", actie: "dossier", accountId: huidigDossier.accountId, accountIds: [huidigDossier.accountId],
          klantnaam: huidigDossier.klantnaam,
          tekst: `Dossier ${soort.label}${huidigDossier.jaar ? ` ${huidigDossier.jaar}` : ""} ter review neergelegd bij ${reviewerUser.naam || reviewerEmail}.`,
        }).catch(() => {});

        const dossierNa = await haalEenDossier(resource, token, soortVan(soort.key), id).catch(() => null);
        context.res = {
          headers: { "Content-Type": "application/json" },
          body: { ok: true, taakId, reviewer: { naam: reviewerUser.naam || reviewerNaam, email: reviewerUser.email || reviewerEmail }, dossier: dossierNa },
        };
        return;
      }

      // Indeling (incl. alleen-lezen én zelf aangemaakte extra velden) eerst ophalen — nodig
      // vóór het lezen/schrijven van het dossier zelf, zodat aangepaste velden ook echt
      // meeselecteren/terugschrijven (soortEffectief) en alleen-lezen server-side afgedwongen kan
      // worden (niet alleen de invoervelden in het scherm uitschakelen).
      const indeling = await haalIndeling(soort);
      const soortEffectief = metAangepasteVelden(soort, indeling.aangepasteVelden);

      // Actueel dossier ophalen om de status (inactief?) te controleren vóór het schrijven.
      const huidig = await haalEenDossier(resource, token, soortEffectief, id);
      if (!huidig) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }
      if (!huidig.actief) { context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: "Dit dossier staat op inactief en kan niet worden bewerkt." } }; return; }

      const alleenLezenSet = new Set(indeling.alleenLezen || []);

      const velden = {};
      if (status !== undefined && !alleenLezenSet.has("__status")) velden.status = status;
      if (urlDossier !== undefined && !alleenLezenSet.has("__urlDossier")) velden.urlDossier = urlDossier;
      if (documentUrl !== undefined && !alleenLezenSet.has("__documentUrl")) velden.documentUrl = documentUrl;
      if (veldenBag && typeof veldenBag === "object") {
        const gefilterdeBag = Object.fromEntries(Object.entries(veldenBag).filter(([k]) => !alleenLezenSet.has(k)));
        if (Object.keys(gefilterdeBag).length > 0) velden.velden = gefilterdeBag;
      }
      // Fiscaal partner (lookup) koppelen/loskoppelen — een accountId om te koppelen, of "" / null om
      // los te koppelen (enkelvoudige aangifte).
      if (fiscaalPartnerAccountId !== undefined) velden.fiscaalPartnerAccountId = fiscaalPartnerAccountId || null;
      if (Object.keys(velden).length === 0) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Niets om bij te werken." } }; return; }

      await werkDossierBij(resource, token, soortEffectief, id, velden);
      const bijgewerkt = await haalEenDossier(resource, token, soortEffectief, id);

      // Best-effort log bij de cliënt.
      if (bijgewerkt) {
        const aantalCatalogusVelden = veldenBag && typeof veldenBag === "object" ? Object.keys(veldenBag).length : 0;
        await logGebeurtenis({
          door: email || "onbekend", actie: "dossier", accountId: bijgewerkt.accountId, accountIds: [bijgewerkt.accountId],
          klantnaam: bijgewerkt.klantnaam,
          tekst: `Dossier ${soort.label}${bijgewerkt.jaar ? ` ${bijgewerkt.jaar}` : ""} bijgewerkt${status !== undefined ? ` — status: ${bijgewerkt.statusLabel || status}` : ""}${documentUrl !== undefined ? " — documentlink gewijzigd" : ""}${aantalCatalogusVelden ? ` — ${aantalCatalogusVelden} veld(en) gewijzigd` : ""}.`,
        });
      }

      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, dossier: bijgewerkt } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    // Detail + de eerste regel uit de stack die naar api/ wijst: zo is een 500 meteen te herleiden
    // zonder in de Azure-logs te hoeven duiken (het scherm toont deze tekst).
    const waar = String((err && err.stack) || "").split("\n").find((r) => r.includes("/api/") || r.includes("\\api\\")) || "";
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error: "Kon het dossier niet verwerken.",
        detail: `${err && err.name ? err.name + ": " : ""}${String((err && err.message) || err)}${waar ? ` — ${waar.trim()}` : ""}`,
      },
    };
  }
};
