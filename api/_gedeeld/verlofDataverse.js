/**
 * Datalaag voor verlofaanvragen (interne urenregistratie) — op Dataverse, tabel cr283_verlofaanvraag
 * (zie api/uren-schema-setup). Zelfde stijl en lage-niveau Dataverse-helpers als urenDataverse.js
 * (bewust hier herhaald i.p.v. cross-required, om een circulaire require tussen de twee modules te
 * vermijden — dienWeekIn blijft in urenDataverse.js ongewijzigd; de materialisatie van goedgekeurd
 * verlof gebeurt vanuit de API-laag, vóórdat dienWeekIn wordt aangeroepen, zie mw-uren-boekingen).
 *
 * Kernidee — "niets telt vóór goedkeuring" (het bestaande principe van deze module) blijft intact:
 *   - De GOEDKEURING van een verlofaanvraag door de leidinggevende is de enige, echte goedkeuring.
 *     Zodra een aanvraag op 'goedgekeurd' staat, telt hij mee in het verlofsaldo (opgenomen uren) en
 *     verschijnt hij meteen in het vakantieoverzicht — ongeacht of de betrokken weekstaten al zijn
 *     ingediend.
 *   - De weekstaat-boekingen die uit het verlof voortkomen (soort 'verlof', zodat de bestaande
 *     40-uur-eis en Bezetting het gewoon meetellen) worden — precies als de vaste (contract)uren —
 *     pas VIRTUEEL getoond in "Uren schrijven" en pas ECHT vastgelegd op het moment dat de
 *     medewerker die week indient. Zo blokkeert een goedgekeurde vakantiedag nooit de rest van een
 *     nog-lopende weekstaat (die pas bij het indienen als geheel naar 'ingediend' gaat).
 */
const { haalDynamicsToken } = require("./identiteit");
const uren = require("./urenDataverse");
const vasteUrenStore = require("./vasteUrenStore");
const verlofInstellingen = require("./verlofInstellingen");
const verlofCorrectieStore = require("./verlofCorrectieStore");

const P = "cr283";
const AANVRAAG = `${P}_verlofaanvraag`;

const STATUSSEN = ["aangevraagd", "goedgekeurd", "afgewezen", "ingetrokken"];
const STANDAARD_DAG = uren.WEEK_UREN_EIS / 5; // 8 uur — zelfde fulltime-norm als de rest van de module

function esc(s) { return String(s == null ? "" : s).replace(/'/g, "''"); }
function leesHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };
}
function schrijfHeaders(token, representation) {
  const h = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json; charset=utf-8", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
  if (representation) h.Prefer = 'return=representation,odata.include-annotations="OData.Community.Display.V1.FormattedValue"';
  return h;
}
const setCache = {};
async function entitySet(resource, token, logicalName) {
  if (setCache[logicalName]) return setCache[logicalName];
  const res = await fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Kon tabelnaam niet opzoeken voor ${logicalName} (${res.status}): ${await res.text()}`);
  setCache[logicalName] = (await res.json()).EntitySetName;
  return setCache[logicalName];
}
const userCache = new Map();
async function haalSystemuserId(resource, token, email) {
  if (!email) return null;
  const key = String(email).toLowerCase();
  if (userCache.has(key)) return userCache.get(key);
  let id = null;
  try {
    const res = await fetch(`${resource}/api/data/v9.2/systemusers?$select=systemuserid&$filter=internalemailaddress eq '${esc(email)}' and isdisabled eq false&$top=1`, { headers: leesHeaders(token) });
    if (res.ok) { const d = await res.json(); id = (d.value && d.value[0] && d.value[0].systemuserid) || null; }
  } catch { /* best effort */ }
  userCache.set(key, id);
  return id;
}

function aanvraagNaarBuiten(r) {
  const n = (v) => (v == null ? null : Number(v));
  return {
    id: r[`${P}_verlofaanvraagid`],
    medewerkerEmail: r[`${P}_medewerkeremail`] || "",
    medewerkerNaam: r[`${P}_medewerkernaam`] || "",
    verloftype: r[`${P}_verloftype`] || "",
    startdatum: r[`${P}_startdatum`] ? String(r[`${P}_startdatum`]).slice(0, 10) : "",
    einddatum: r[`${P}_einddatum`] ? String(r[`${P}_einddatum`]).slice(0, 10) : "",
    aantalUren: n(r[`${P}_aantaluren`]) || 0,
    status: STATUSSEN.includes(r[`${P}_status`]) ? r[`${P}_status`] : "aangevraagd",
    toelichting: r[`${P}_toelichting`] || "",
    leidinggevendeNaam: r[`${P}_leidinggevendenaam`] || "",
    afgehandeldDoor: r[`${P}_afgehandelddoor`] || "",
    afgehandeldOp: r[`${P}_afgehandeldop`] || null,
    afwijsReden: r[`${P}_afwijsreden`] || "",
    aangemaaktOp: r.createdon || null,
  };
}

async function select() {
  return [
    `${P}_verlofaanvraagid`, `${P}_medewerkeremail`, `${P}_medewerkernaam`, `${P}_verloftype`,
    `${P}_startdatum`, `${P}_einddatum`, `${P}_aantaluren`, `${P}_status`, `${P}_toelichting`,
    `${P}_leidinggevendenaam`, `${P}_afgehandelddoor`, `${P}_afgehandeldop`, `${P}_afwijsreden`, "createdon",
  ].join(",");
}
async function haalAanvragen(resource, token, filter, orderby) {
  const set = await entitySet(resource, token, AANVRAAG);
  const sel = await select();
  const url = `${resource}/api/data/v9.2/${set}?$select=${sel}${filter ? `&$filter=${encodeURIComponent(filter)}` : ""}${orderby ? `&$orderby=${orderby}` : ""}`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) throw new Error(`Verlofaanvragen ophalen mislukt (${res.status}): ${await res.text()}`);
  const alles = [];
  let data = await res.json();
  alles.push(...(data.value || []));
  let next = data["@odata.nextLink"];
  while (next && alles.length < 5000) {
    const r2 = await fetch(next, { headers: leesHeaders(token) });
    if (!r2.ok) break;
    data = await r2.json();
    alles.push(...(data.value || []));
    next = data["@odata.nextLink"];
  }
  return alles.map(aanvraagNaarBuiten);
}
async function haalAanvraagRuw(resource, token, id) {
  const set = await entitySet(resource, token, AANVRAAG);
  const sel = await select();
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})?$select=${sel}`, { headers: leesHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Verlofaanvraag ophalen mislukt (${res.status}): ${await res.text()}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
// Datum-/werkrooster-rekenwerk — hoeveel uur telt een gegeven kalenderdag mee als verlof? Precies
// het aantal uren dat de medewerker die dag normaal had gewerkt (0 op een dag die al parttime/vrij
// is volgens het werkrooster, 0 in het weekend).
// ---------------------------------------------------------------------------
function alleDagenTussen(startStr, eindStr) {
  const dagen = [];
  let d = new Date(startStr + "T00:00:00Z");
  const eind = new Date(eindStr + "T00:00:00Z");
  while (d <= eind && dagen.length < 366) {
    dagen.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return dagen;
}
function isoWeekdag(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  const g = d.getUTCDay();
  return g === 0 ? 7 : g; // 1=ma .. 7=zo
}

/** Verwachte (normaal te werken) uren van 'email' op 'datumStr' — 0 in het weekend of op een dag
 *  die al (deels) parttime/vrij is volgens het werkrooster. 'weekCache' (optioneel, per aanroepende
 *  functie) voorkomt dat dezelfde week (tot 5 werkdagen) telkens opnieuw uit Blob/Dataverse wordt
 *  opgehaald bij een meerdaagse aanvraag. */
async function verwachteUrenOpDag(email, datumStr, weekCache) {
  const weekdag = isoWeekdag(datumStr);
  if (weekdag > 5) return 0;
  const weekStart = uren.maandagVan(datumStr);
  let slots;
  if (weekCache) {
    const sleutel = `${email.toLowerCase()}|${weekStart}`;
    if (!weekCache.has(sleutel)) weekCache.set(sleutel, uren.vasteUrenSlots(email, weekStart));
    slots = await weekCache.get(sleutel);
  } else {
    slots = await uren.vasteUrenSlots(email, weekStart);
  }
  const parttime = slots.filter((s) => s.datum === datumStr).reduce((sum, s) => sum + (s.uren || 0), 0);
  return Math.max(0, Math.min(STANDAARD_DAG, STANDAARD_DAG - parttime));
}

/** Totaal aantal verlofuren voor een datumrange (som van verwachteUrenOpDag over alle dagen). */
async function berekenAantalUren(email, startdatum, einddatum) {
  const dagen = alleDagenTussen(startdatum, einddatum);
  const weekCache = new Map();
  let totaal = 0;
  for (const dag of dagen) totaal += await verwachteUrenOpDag(email, dag, weekCache);
  return Math.round(totaal * 100) / 100;
}

/** Parttime-factor (0..1) van een medewerker, afgeleid van hun eigen werkrooster: werkelijk
 *  gewerkte uren/week (fulltime-norm 40 als er geen rooster is ingesteld) t.o.v. 40. Bij een
 *  2-wekelijks (om-en-om) rooster wordt het gemiddelde van Week 1 en Week 2 genomen. */
async function berekenParttimeFactor(email) {
  const slots = (await vasteUrenStore.haalVoor(email)) || [];
  const weekdagen = [1, 2, 3, 4, 5];
  const isBiweek = slots.some((s) => weekdagen.includes(Number(s.weekdag)) && (Number(s.week) === 1 || Number(s.week) === 2));
  const gewerktVoorWeek = (weekTag) => {
    let som = 0;
    for (const n of weekdagen) {
      const s = slots.find((x) => Number(x.weekdag) === n && (weekTag == null ? x.week == null : Number(x.week) === weekTag));
      const parttime = s ? Number(s.uren) || 0 : 0;
      som += Math.max(0, Math.min(STANDAARD_DAG, STANDAARD_DAG - parttime));
    }
    return som;
  };
  const weekUren = isBiweek ? (gewerktVoorWeek(1) + gewerktVoorWeek(2)) / 2 : gewerktVoorWeek(null);
  return Math.max(0, Math.min(1, weekUren / uren.WEEK_UREN_EIS));
}

// ===========================================================================
// Aanvragen — medewerker
// ===========================================================================
async function aanvragenVanMedewerker(email) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  return haalAanvragen(resource, token, `${P}_medewerkeremail eq '${esc(email)}'`, `${P}_startdatum desc`);
}

/** Nieuwe verlofaanvraag indienen. Berekent zelf het aantal uren op basis van het werkrooster. */
async function maakAanvraag({ email, naam, verloftype, startdatum, einddatum, toelichting, leidinggevendeNaam }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, AANVRAAG);
  const aantalUren = await berekenAantalUren(email, startdatum, einddatum);
  if (aantalUren <= 0) throw new Error("VALIDATIE: deze periode bevat geen enkele werkdag volgens je werkrooster — er is niets om aan te vragen.");
  const body = {
    [`${P}_medewerkeremail`]: email, [`${P}_medewerkernaam`]: naam || null,
    [`${P}_verloftype`]: verloftype, [`${P}_startdatum`]: startdatum, [`${P}_einddatum`]: einddatum,
    [`${P}_aantaluren`]: aantalUren, [`${P}_status`]: "aangevraagd",
    [`${P}_toelichting`]: toelichting || null, [`${P}_leidinggevendenaam`]: leidinggevendeNaam || null,
  };
  const suId = await haalSystemuserId(resource, token, email);
  if (suId) body[`${P}_Medewerker@odata.bind`] = `/systemusers(${suId})`;
  const res = await fetch(`${resource}/api/data/v9.2/${set}`, { method: "POST", headers: schrijfHeaders(token, true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Verlofaanvraag aanmaken mislukt (${res.status}): ${await res.text()}`);
  return aanvraagNaarBuiten(await res.json());
}

/** Medewerker trekt een eigen, nog niet afgehandelde aanvraag in. */
async function trekAanvraagIn(id, email) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, AANVRAAG);
  const huidig = await haalAanvraagRuw(resource, token, id);
  if (!huidig) return { fout: "NIET_GEVONDEN" };
  if ((huidig[`${P}_medewerkeremail`] || "").toLowerCase() !== String(email).toLowerCase()) return { fout: "NIET_GEVONDEN" };
  if (huidig[`${P}_status`] !== "aangevraagd") return { fout: "AL_AFGEHANDELD" };
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, false), body: JSON.stringify({ [`${P}_status`]: "ingetrokken" }) });
  return { ok: res.ok };
}

// ===========================================================================
// Goedkeuring — leidinggevende
// ===========================================================================
/** Openstaande ('aangevraagd') verlofaanvragen die op mijn goedkeuring wachten. Beheerder kan met
 *  alle=true iedereen zien — zelfde scoping-aanpak als weekstatenVoorLeidinggevende. */
async function aanvragenVoorLeidinggevende({ leidinggevendeNaam, alle }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const aanvragen = await haalAanvragen(resource, token, `${P}_status eq 'aangevraagd'`, `${P}_startdatum asc`);
  const mij = String(leidinggevendeNaam || "").trim().toLowerCase();
  return aanvragen.filter((a) => alle || (a.leidinggevendeNaam || "").trim().toLowerCase() === mij);
}

async function keurAanvraagGoed(id, door) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, AANVRAAG);
  const huidig = await haalAanvraagRuw(resource, token, id);
  if (!huidig) return { fout: "NIET_GEVONDEN" };
  if (huidig[`${P}_status`] !== "aangevraagd") return { fout: "AL_AFGEHANDELD" };
  const body = { [`${P}_status`]: "goedgekeurd", [`${P}_afgehandelddoor`]: door || null, [`${P}_afgehandeldop`]: new Date().toISOString() };
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, false), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Verlofaanvraag goedkeuren mislukt (${res.status}): ${await res.text()}`);
  return { ok: true };
}
async function keurAanvraagAf(id, door, reden) {
  if (!reden || !String(reden).trim()) throw new Error("VALIDATIE: geef een reden voor de afwijzing.");
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, AANVRAAG);
  const huidig = await haalAanvraagRuw(resource, token, id);
  if (!huidig) return { fout: "NIET_GEVONDEN" };
  if (huidig[`${P}_status`] !== "aangevraagd") return { fout: "AL_AFGEHANDELD" };
  const body = { [`${P}_status`]: "afgewezen", [`${P}_afgehandelddoor`]: door || null, [`${P}_afgehandeldop`]: new Date().toISOString(), [`${P}_afwijsreden`]: String(reden).trim().slice(0, 500) };
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, false), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Verlofaanvraag afwijzen mislukt (${res.status}): ${await res.text()}`);
  return { ok: true };
}

// ===========================================================================
// Vakantieoverzicht — alle goedgekeurde verlof (bedrijfsbreed, voor iedereen zichtbaar: de hele
// bedoeling is dat collega's van elkaar kunnen zien wie wanneer vrij is).
// ===========================================================================
async function goedgekeurdVerlof({ vanaf, tot } = {}) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  let f = `${P}_status eq 'goedgekeurd'`;
  // Overlap met [vanaf, tot]: startdatum <= tot AND einddatum >= vanaf.
  if (tot) f += ` and ${P}_startdatum le ${tot}`;
  if (vanaf) f += ` and ${P}_einddatum ge ${vanaf}`;
  return haalAanvragen(resource, token, f, `${P}_startdatum asc`);
}

// ===========================================================================
// Materialisatie in de weekstaat (soort 'verlof') — zelfde aanpak als vaste (contract)uren:
// virtueel getoond vóór het indienen, pas echt vastgelegd bij het indienen van die week.
// ===========================================================================
/** Virtuele verlof-boekingen voor één week: dagen binnen een goedgekeurde aanvraag die nog niet als
 *  echte boeking bestaan. Zelfde vorm als uren.vasteUrenVirtueel, zodat de Schrijven-tab ze op
 *  identieke wijze (vergrendeld, "Vast") kan tonen en meetellen. */
async function virtueleRijenVoorWeek(email, weekStart, bestaandeBoekingen) {
  const weekEinde = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const aanvragen = (await aanvragenVanMedewerker(email)).filter((a) => a.status === "goedgekeurd" && a.startdatum <= weekEinde && a.einddatum >= weekStart);
  if (!aanvragen.length) return [];
  const labelCache = new Map();
  const labelVoor = async (type) => {
    if (!labelCache.has(type)) labelCache.set(type, await verlofInstellingen.labelVoor(type));
    return labelCache.get(type);
  };
  const weekCache = new Map();
  const rijen = [];
  for (const a of aanvragen) {
    const label = await labelVoor(a.verloftype);
    for (const datum of alleDagenTussen(a.startdatum, a.einddatum)) {
      if (datum < weekStart || datum > weekEinde) continue;
      const uur = await verwachteUrenOpDag(email, datum, weekCache);
      if (uur <= 0) continue;
      const bestaat = (bestaandeBoekingen || []).some((b) => b.vast && b.datum === datum && (b.urencode || "") === label);
      if (bestaat) continue;
      rijen.push({ id: `verlof:${a.id}:${datum}`, datum, weekStart, soort: "verlof", urencode: label, uren: uur, declarabel: false, vast: true, virtueel: true, status: "concept", omschrijving: label });
    }
  }
  return rijen;
}

/** Legt de virtuele verlofrijen van een week echt vast (soort 'verlof', vast=true) — aan te roepen
 *  vóórdat uren.dienWeekIn draait, zodat de 40-uur-eis ze meetelt. Idempotent: slaat dagen over die
 *  al bestaan. */
async function materialiseerVoorWeek(email, weekStart) {
  const weekEinde = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const bestaandeBoekingen = await uren.boekingenVanMedewerker(email, { vanaf: weekStart, tot: weekEinde });
  const virtueel = await virtueleRijenVoorWeek(email, weekStart, bestaandeBoekingen);
  if (!virtueel.length) return { aangemaakt: 0 };
  const naam = bestaandeBoekingen[0]?.medewerkerNaam || "";
  let aangemaakt = 0;
  for (const v of virtueel) {
    await uren.maakBoeking({ email, naam, datum: v.datum, soort: "verlof", omschrijving: v.omschrijving, uren: v.uren, urencode: v.urencode, vast: true });
    aangemaakt++;
  }
  return { aangemaakt };
}

// ===========================================================================
// Verlofsaldo — pro-rata basis (landelijk fulltime-aantal × parttime-factor) + correcties − opgenomen.
// ===========================================================================
async function berekenSaldo(email) {
  const [instellingen, parttimeFactor, correcties, aanvragen] = await Promise.all([
    verlofInstellingen.haalInstellingen(),
    berekenParttimeFactor(email),
    verlofCorrectieStore.haalCorrecties(email),
    aanvragenVanMedewerker(email),
  ]);
  const basis = Math.round(instellingen.verlofUrenFulltime * parttimeFactor * 100) / 100;
  const correctieTotaal = Math.round(correcties.reduce((s, c) => s + (c.uren || 0), 0) * 100) / 100;
  const opgenomen = Math.round(aanvragen.filter((a) => a.status === "goedgekeurd").reduce((s, a) => s + a.aantalUren, 0) * 100) / 100;
  const inBehandeling = Math.round(aanvragen.filter((a) => a.status === "aangevraagd").reduce((s, a) => s + a.aantalUren, 0) * 100) / 100;
  const resterend = Math.round((basis + correctieTotaal - opgenomen) * 100) / 100;
  return { basis, parttimeFactor: Math.round(parttimeFactor * 1000) / 1000, correcties: correctieTotaal, opgenomen, inBehandeling, resterend, correctieHistorie: correcties };
}

module.exports = {
  STATUSSEN,
  aanvragenVanMedewerker, maakAanvraag, trekAanvraagIn,
  aanvragenVoorLeidinggevende, keurAanvraagGoed, keurAanvraagAf,
  goedgekeurdVerlof,
  virtueleRijenVoorWeek, materialiseerVoorWeek,
  berekenParttimeFactor, berekenAantalUren, berekenSaldo,
};
