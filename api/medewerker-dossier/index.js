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
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { standaardIndelingIB, standaardIndelingVPB, standaardIndelingDividend, standaardIndelingNotulen, standaardIndelingOverig, vasteVeldenVoorSoort, metLabels } = require("../_gedeeld/dossierVelden");
const { haalVoorAccounts, haalLaatstGezien, verrijkVerzoek } = require("../_gedeeld/aanleververzoeken");
const { haalOnderwerpen } = require("../_gedeeld/aanleveronderwerpen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { magVerwijderIb, magVerwijderVpb } = require("../_gedeeld/wijzigrechten");

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
      const [gekoppeldeUitvragen, gekoppeldeLijstId, defaultContact, sjabloon] = await Promise.all([
        gekoppeldeUitvragenVoorDossier(dossier, indeling.onderwerpId),
        gekoppeldeLijstIdVoorDossier(indeling.onderwerpId),
        haalPrimairContactVoorDossier(resource, token, dossier.accountId),
        haalSjabloonVoor(soort.key),
      ]);
      context.res = { headers: { "Content-Type": "application/json" }, body: { dossier, statusOpties: soort.statusOpties, catalogus, secties: indeling.secties, verborgen: indeling.verborgen, voorwaarden: indeling.voorwaarden, alleenLezen: indeling.alleenLezen, picklistOpties, gekoppeldeUitvragen, gekoppeldeLijstId, onderwerpId: indeling.onderwerpId || "", defaultContact, sjabloon } };
      return;
    }

    if (methode === "POST" || methode === "PATCH") {
      const { soort: soortKey, id, actie, status, urlDossier, documentUrl, velden: veldenBag, fiscaalPartnerAccountId } = req.body || {};
      const soort = soortVan(soortKey);
      if (!soort || !id) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort' (ib/vpb) en 'id' mee." } }; return; }

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
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het dossier niet verwerken.", detail: String(err.message || err) } };
  }
};
