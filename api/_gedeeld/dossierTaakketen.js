/**
 * Dossier-taakketen: de weg die een dossier aflegt ná "aangifte/document versturen naar de cliënt".
 *
 *   1) Versturen        → taak bij de cliënt  + dossierstatus "verzonden naar client"
 *   2) Cliënt akkoord   → interne VERVOLGTAAK + dossierstatus "te versturen naar Belastingdienst"
 *   3) Vervolgtaak klaar→ dossierstatus "verzonden naar Belastingdienst" + dossier op INACTIEF
 *
 * Elke stap is per dossiersoort in te stellen bij Beheer → Dossiers (instellingen-sleutel
 * `dossierAkkoord`). Laat je een taaksoort of status leeg, dan gebeurt die stap gewoon niet — de
 * keten is dus overal optioneel.
 *
 * Hoe weet een taak bij welk dossier hij hoort? Via een onzichtbare markering in de omschrijving:
 *
 *     [dossier-ref: ib:<guid>|akkoord]
 *
 * Die stond er voor IB al (api/medewerker-aangifte-versturen schreef 'm), alleen werd hij nergens
 * teruggelezen — het commentaar daar beloofde een automatische statuswijziging bij ondertekening
 * die in de code nooit heeft bestaan. Deze module maakt die belofte alsnog waar, instelbaar, en voor
 * alle dossiersoorten. De markering wordt overal weggefilterd vóór een omschrijving in beeld komt
 * (verbergRef hieronder; api/taken en api/mw-taken deden dat al met hun eigen kopie).
 *
 * Bewust géén losse blob-opslag zoals bij de review: de koppeling zit al in de taak zelf, dus een
 * taak die via een andere weg is aangemaakt of gekopieerd houdt zijn dossierkoppeling vanzelf.
 */
const { haalInstellingen } = require("./instellingen");
const { SOORTEN, haalEenDossier, werkDossierBij, haalNavigatieNaam } = require("./dossiers");

const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";
const RELATIEBEHEERDER_VELD = process.env.DYNAMICS_RELATIEBEHEERDER_VELD || "cr283_manager";

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
});

// "akkoord"    = de taak bij de cliënt na het versturen
// "vervolg"    = de interne vervolgtaak daarna
// "voorlopig"  = de herzieningstaak van een voorlopige aangifte (zie api/_gedeeld/dossierVoorlopig.js)
const GELDIGE_FASEN = ["akkoord", "vervolg", "voorlopig"];
const tekst = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);

// ── De onzichtbare dossierkoppeling in de taak-omschrijving ─────────────────
/**
 * `[dossier-ref: <soort>:<guid>|<fase>]`, en met een afsluitende `|v` als het om een VOORLOPIGE
 * aangifte gaat. Die vlag reist zo de hele keten mee: de taak bij de cliënt, de vervolgtaak daarna
 * en elke statuswijziging weten daardoor dat ze de voorlopige variant moeten gebruiken.
 */
function maakRef(soortKey, dossierId, fase, voorlopig) {
  const s = String(soortKey || "").toLowerCase();
  const id = String(dossierId || "").trim();
  if (!s || !id) return "";
  const f = GELDIGE_FASEN.includes(fase) ? fase : "akkoord";
  return `\n\n[dossier-ref: ${s}:${id}|${f}${voorlopig ? "|v" : ""}]`;
}

/** Leest de koppeling uit een omschrijving: { soort, id, fase, voorlopig } of null. */
function leesRef(omschrijving) {
  const m = /\[dossier-ref:\s*([a-z]+):([^\]|\s]+)(?:\|([a-z]+))?(?:\|(v))?\s*\]/i.exec(String(omschrijving || ""));
  if (!m) return null;
  const soort = String(m[1] || "").toLowerCase();
  const id = String(m[2] || "").trim();
  if (!soort || !id) return null;
  // Zonder fase is het een oude markering uit de tijd dat alleen IB-versturen 'm schreef: dat was
  // altijd de taak bij de cliënt.
  const fase = GELDIGE_FASEN.includes(String(m[3] || "").toLowerCase()) ? String(m[3]).toLowerCase() : "akkoord";
  return { soort, id, fase, voorlopig: String(m[4] || "").toLowerCase() === "v" };
}

/**
 * Vult de plaatshouder {voorlopig} in een sjabloon: "voorlopige " bij een voorlopige aangifte, en
 * anders niets. Zo werkt één sjabloon voor beide varianten — "Aangifte {voorlopig}inkomstenbelasting
 * {jaar}" wordt "Aangifte voorlopige inkomstenbelasting 2025" of "Aangifte inkomstenbelasting 2025".
 * De spatie zit in de vervanging, zodat je 'm in het sjabloon direct tegen het woord aan kunt zetten.
 */
function vulVoorlopigIn(sjabloon, voorlopig) {
  const s = String(sjabloon == null ? "" : sjabloon);
  if (!s.includes("{voorlopig}")) {
    // Geen plaatshouder in het sjabloon: bij een voorlopige aangifte plakken we het er zelf voor,
    // zodat bestaande sjablonen zonder aanpassing tóch "Voorlopig" tonen.
    return voorlopig && s.trim() ? `Voorlopig — ${s}` : s;
  }
  return s.replaceAll("{voorlopig}", voorlopig ? "voorlopige " : "").replace(/\s{2,}/g, " ");
}

/** Haalt de markering uit een tekst — nooit tonen aan cliënt of medewerker. */
function verbergRef(tekst) {
  return String(tekst || "").replace(/\n*\[dossier-ref:[^\]]*\]/g, "").trimEnd();
}

// ── Beheer-instellingen per dossiersoort ────────────────────────────────────
const STANDAARD_KETEN = {
  // Stap 1 — bij het versturen naar de cliënt.
  statusVersturen: null,
  // Stap 2 — zodra de cliënt akkoord geeft of ondertekent.
  akkoordTaakSoort: null,
  akkoordTaakOnderwerp: "Versturen naar Belastingdienst: {soort} {periode} — {klant}",
  akkoordTaakRubriek: null,
  statusAkkoord: null,
  // Stap 3 — zodra die vervolgtaak is afgerond.
  statusVervolgKlaar: null,
  inactiefNaVervolg: false,
  // Dezelfde drie stappen, maar voor een VOORLOPIGE aangifte (zie api/_gedeeld/dossierVoorlopig.js).
  // Zelfde taken en teksten, alleen andere dossierstatussen — de IB-optieset kent voor elke stap een
  // "voorlopige" tegenhanger. Leeg = die stap de status niet laten wijzigen. Bewust géén
  // "inactief na vervolg" bij voorlopig: een voorlopige aangifte moet juist open blijven staan tot
  // de herziening is gedaan.
  voorlopigStatusVersturen: null,
  voorlopigStatusAkkoord: null,
  voorlopigStatusVervolgKlaar: null,
};

function getalOfNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normaliseerKetenConfig(ruw) {
  const r = ruw && typeof ruw === "object" ? ruw : {};
  return {
    statusVersturen: getalOfNull(r.statusVersturen),
    akkoordTaakSoort: getalOfNull(r.akkoordTaakSoort),
    akkoordTaakOnderwerp: tekst(r.akkoordTaakOnderwerp, 300) || STANDAARD_KETEN.akkoordTaakOnderwerp,
    akkoordTaakRubriek: getalOfNull(r.akkoordTaakRubriek),
    statusAkkoord: getalOfNull(r.statusAkkoord),
    statusVervolgKlaar: getalOfNull(r.statusVervolgKlaar),
    inactiefNaVervolg: r.inactiefNaVervolg === true,
    voorlopigStatusVersturen: getalOfNull(r.voorlopigStatusVersturen),
    voorlopigStatusAkkoord: getalOfNull(r.voorlopigStatusAkkoord),
    voorlopigStatusVervolgKlaar: getalOfNull(r.voorlopigStatusVervolgKlaar),
  };
}

/**
 * De statussen van de keten voor deze variant: bij een voorlopige aangifte de "voorlopig"-set, en
 * anders de gewone. Eén plek waar die keuze valt, zodat de drie inhaakpunten hem niet elk apart
 * hoeven te maken.
 */
function statussenVoor(cfg, voorlopig) {
  return voorlopig
    ? {
        versturen: cfg.voorlopigStatusVersturen,
        akkoord: cfg.voorlopigStatusAkkoord,
        vervolgKlaar: cfg.voorlopigStatusVervolgKlaar,
        // Een voorlopige aangifte niet afsluiten: de herziening moet nog komen.
        inactief: false,
      }
    : {
        versturen: cfg.statusVersturen,
        akkoord: cfg.statusAkkoord,
        vervolgKlaar: cfg.statusVervolgKlaar,
        inactief: cfg.inactiefNaVervolg,
      };
}

function normaliseerAlleKetenConfig(ruw) {
  const uit = {};
  for (const [soort, cfg] of Object.entries(ruw && typeof ruw === "object" ? ruw : {})) {
    const key = tekst(soort, 20).toLowerCase();
    if (key) uit[key] = normaliseerKetenConfig(cfg);
  }
  return uit;
}

async function instellingenVoorSoort(soortKey) {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const alle = normaliseerAlleKetenConfig(instellingen && instellingen.dossierAkkoord);
  return alle[String(soortKey || "").toLowerCase()] || { ...STANDAARD_KETEN };
}

// ── Hulp ────────────────────────────────────────────────────────────────────
/** Leesbare periode van een dossier: jaar, boekjaar ("2025–2026") of datum (notulen). */
function periodeTekst(dossier) {
  if (!dossier) return "";
  if (dossier.jaar !== null && dossier.jaar !== undefined && dossier.jaar !== "") return String(dossier.jaar);
  const jaarVan = (x) => { const d = x ? new Date(x) : null; return d && !isNaN(d.getTime()) ? d.getFullYear() : null; };
  const van = jaarVan(dossier.begindatum);
  const tot = jaarVan(dossier.einddatum);
  if (van && tot) return van === tot ? String(van) : `${van}–${tot}`;
  const datum = dossier.begindatum || dossier.einddatum || "";
  if (!datum) return "";
  const d = new Date(datum);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL");
}

function vulSjabloonIn(sjabloon, velden) {
  let uit = String(sjabloon || "").trim();
  for (const [k, v] of Object.entries(velden || {})) uit = uit.replaceAll(`{${k}}`, v == null ? "" : String(v));
  return uit.replace(/\s{2,}/g, " ").replace(/\s+—\s*$/, "").trim();
}

const soortVan = (key) => SOORTEN.find((s) => s.key === String(key || "").toLowerCase()) || null;

// ── Stap 2: de cliënt gaf akkoord / ondertekende ────────────────────────────
/**
 * Roep dit aan zodra een cliënt een taak accordeert of ondertekent. Hangt aan die taak een
 * dossierkoppeling, dan wordt (indien ingesteld) de interne vervolgtaak aangemaakt en de
 * dossierstatus bijgewerkt.
 *
 * Best-effort: gooit nooit door — het akkoord van de cliënt zelf mag hier nooit op stuklopen.
 *
 * @param {{ description: string, accountId: string, subject: string }} taak
 * @returns {Promise<{ gedaan: boolean, vervolgTaakId?: string, soort?: string }>}
 */
async function naAkkoordVanClient({ context, resource, token, taak, klantnaam }) {
  const log = (context && context.log && context.log.error) || (() => {});
  try {
    const ref = leesRef(taak && taak.description);
    if (!ref || ref.fase !== "akkoord") return { gedaan: false };
    const soort = soortVan(ref.soort);
    if (!soort) return { gedaan: false };
    const cfg = await instellingenVoorSoort(soort.key);
    const st = statussenVoor(cfg, ref.voorlopig);
    if (cfg.akkoordTaakSoort === null && st.akkoord === null) return { gedaan: false };

    const dossier = await haalEenDossier(resource, token, soort, ref.id).catch(() => null);
    if (!dossier) return { gedaan: false };

    // Vervolgtaak (intern) — eigenaar wordt de manager van het dossier, of anders die van het account.
    let vervolgTaakId = "";
    if (cfg.akkoordTaakSoort !== null) {
      const onderwerp = vulSjabloonIn(cfg.akkoordTaakOnderwerp, {
        klant: dossier.klantnaam || klantnaam || "",
        periode: periodeTekst(dossier),
        jaar: dossier.jaar || "",
        soort: soort.label,
      });
      const body = {
        subject: tekst(vulVoorlopigIn(onderwerp, ref.voorlopig), 400) || `Vervolgactie ${soort.label}`,
        description:
          `De cliënt heeft akkoord gegeven op "${(taak && taak.subject) || soort.label}".` +
          (ref.voorlopig ? `\nLet op: dit betreft een VOORLOPIGE aangifte.` : "") +
          `\nDossier: ${soort.label}${periodeTekst(dossier) ? ` ${periodeTekst(dossier)}` : ""} — ${dossier.klantnaam || "cliënt onbekend"}.` +
          `\nRond deze taak af zodra het is verstuurd; het dossier wordt dan automatisch bijgewerkt.` +
          maakRef(soort.key, ref.id, "vervolg", ref.voorlopig),
      };
      // Cliënt-lookup via de NAVIGATIE-eigenschapsnaam (uit de metadata, gecached) — met de logische
      // kolomnaam weigert Dynamics de taak met 0x80048d19 "undeclared property".
      if (dossier.accountId) {
        const klantNav = await haalNavigatieNaam(resource, "task", KLANT_VELD, token);
        body[`${klantNav}@odata.bind`] = `/accounts(${dossier.accountId})`;
      }
      if (SOORT_VELD) body[SOORT_VELD] = cfg.akkoordTaakSoort;
      if (RUBRIEK_VELD && cfg.akkoordTaakRubriek !== null) body[RUBRIEK_VELD] = cfg.akkoordTaakRubriek;

      let eigenaarId = dossier.managerId || "";
      if (!eigenaarId && dossier.accountId) {
        try {
          const accRes = await fetch(`${resource}/api/data/v9.2/accounts(${dossier.accountId})?$select=_${RELATIEBEHEERDER_VELD}_value`, { headers: HEADERS(token) });
          if (accRes.ok) eigenaarId = (await accRes.json())[`_${RELATIEBEHEERDER_VELD}_value`] || "";
        } catch { /* best-effort */ }
      }
      if (eigenaarId) body["ownerid@odata.bind"] = `/systemusers(${eigenaarId})`;

      const res = await fetch(`${resource}/api/data/v9.2/tasks`, {
        method: "POST",
        headers: { ...HEADERS(token), Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Aanmaken vervolgtaak mislukt (${res.status}): ${await res.text()}`);
      vervolgTaakId = (await res.json().catch(() => ({}))).activityid || "";
    }

    if (st.akkoord !== null) {
      await werkDossierBij(resource, token, soort, ref.id, { status: st.akkoord });
    }
    return { gedaan: true, vervolgTaakId, soort: soort.key, voorlopig: !!ref.voorlopig };
  } catch (err) {
    log("Dossier-taakketen na akkoord mislukt (het akkoord zelf is wél verwerkt):", err);
    return { gedaan: false };
  }
}

// ── Stap 3: de interne vervolgtaak is afgerond ──────────────────────────────
/**
 * Roep dit aan zodra een medewerker een taak afrondt. Is het de vervolgtaak van een dossier, dan
 * wordt (indien ingesteld) de dossierstatus bijgewerkt en het dossier op inactief gezet.
 *
 * Best-effort: gooit nooit door — het afronden zelf is al gelukt.
 *
 * @returns {Promise<{ gedaan: boolean, status?: number|null, inactief?: boolean, soort?: string }>}
 */
async function naVervolgtaakAfgerond({ context, resource, token, omschrijving }) {
  const log = (context && context.log && context.log.error) || (() => {});
  try {
    const ref = leesRef(omschrijving);
    if (!ref || ref.fase !== "vervolg") return { gedaan: false };
    const soort = soortVan(ref.soort);
    if (!soort) return { gedaan: false };
    const cfg = await instellingenVoorSoort(soort.key);
    const st = statussenVoor(cfg, ref.voorlopig);
    if (st.vervolgKlaar === null && !st.inactief) return { gedaan: false };

    // Bewust in TWEE stappen, status eerst: een deactivering die om wat voor reden ook faalt mag de
    // statuswijziging niet meesleuren, en een status zetten op een al gedeactiveerd (alleen-lezen)
    // record is in Dataverse een gok. Zo is de status altijd bijgewerkt, ook als het inactief zetten
    // misgaat — en dat laatste kan een medewerker desnoods handmatig doen.
    let statusGezet = false;
    if (st.vervolgKlaar !== null) {
      await werkDossierBij(resource, token, soort, ref.id, { status: st.vervolgKlaar });
      statusGezet = true;
    }
    let inactiefGezet = false;
    if (st.inactief) {
      try {
        await werkDossierBij(resource, token, soort, ref.id, { actief: false });
        inactiefGezet = true;
      } catch (e) {
        log("Dossier op inactief zetten mislukt (de status is wél bijgewerkt):", e);
      }
    }
    return { gedaan: statusGezet || inactiefGezet, status: statusGezet ? st.vervolgKlaar : null, inactief: inactiefGezet, soort: soort.key, voorlopig: !!ref.voorlopig };
  } catch (err) {
    log("Dossier-taakketen na afronden vervolgtaak mislukt (de taak is wél afgerond):", err);
    return { gedaan: false };
  }
}

module.exports = {
  STANDAARD_KETEN,
  maakRef, leesRef, verbergRef, vulVoorlopigIn, statussenVoor,
  normaliseerKetenConfig, normaliseerAlleKetenConfig, instellingenVoorSoort,
  periodeTekst, vulSjabloonIn,
  naAkkoordVanClient, naVervolgtaakAfgerond,
};
