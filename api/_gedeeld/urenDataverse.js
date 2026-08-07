/**
 * Datalaag voor de interne urenregistratie — nu op DATAVERSE (i.p.v. Azure SQL).
 * Twee tabellen (zie api/uren-schema-setup): cr283_urenboeking + cr283_urentarief.
 *
 * Alle bedrijfsregels (declarabel-afleiding, tarief-snapshot, controle, OHW/facturatie) staan hier
 * op één plek. Gebruikt de app-only token uit identiteit.js (zelfde als dossiers.js). De
 * herinnering-instellingen staan NIET in Dataverse maar in Blob (urenInstellingenIntern.js) — dat
 * is app-configuratie, geen urendata.
 *
 * 03-08-2026: SOORTEN uitgebreid met 'verlof' (niet-declarabel) t.b.v. de verlofmodule
 * (api/_gedeeld/verlofDataverse.js). Verlof-boekingen worden nooit handmatig gekozen door de
 * medewerker — ze worden automatisch aangemaakt (vast=true) op basis van een goedgekeurde
 * verlofaanvraag, zodra de betreffende week wordt ingediend (zelfde materialisatiemoment als de
 * vaste/contract-uren, zie vasteUrenSlots hieronder — nu ook geëxporteerd zodat verlofDataverse.js
 * 'm kan hergebruiken voor het berekenen van de "normaal te werken uren op deze dag").
 */
const { haalDynamicsToken } = require("./identiteit");
const vasteUrenStore = require("./vasteUrenStore");
const urencodesStore = require("./urencodesStore");

// Iedere medewerker moet per week op precies dit aantal uren uitkomen voordat de weekstaat ingediend
// mag worden (parttimers vullen aan met hun vaste uren).
const WEEK_UREN_EIS = 40;

const P = "cr283";
const FV = "@OData.Community.Display.V1.FormattedValue";
const BOEKING = `${P}_urenboeking`;
const TARIEF = `${P}_urentarief`;
const CLIENT_VALUE = `_${P}_client_value`;

const SOORTEN = ["abonnement", "uxt", "indirect", "kantoor", "verlof"];
const DECLARABELE_SOORTEN = new Set(["abonnement", "uxt"]);
const isDeclarabel = (s) => DECLARABELE_SOORTEN.has(String(s || "").toLowerCase());
const TARIEF_SOORTEN = ["normaal", "hoog", "laag"];

// Weekstaat-status: concept → ingediend → goedgekeurd → gefactureerd. "open" is de legacy-waarde en
// wordt als concept behandeld. Concept = de medewerker mag nog bewerken/verwijderen/indienen.
const isConcept = (s) => !s || s === "concept" || s === "open";
const normStatus = (s) => (isConcept(s) ? "concept" : s);

function esc(s) { return String(s == null ? "" : s).replace(/'/g, "''"); }
function maandagVan(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  const dag = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dag === 0 ? -6 : 1 - dag));
  return d.toISOString().slice(0, 10);
}
function maandVan(datumStr) { return String(datumStr).slice(0, 7); }
function maandRange(maand) {
  const [j, m] = maand.split("-").map(Number);
  const eerste = new Date(Date.UTC(j, m - 1, 1)).toISOString().slice(0, 10);
  const laatste = new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
  return { eerste, laatste };
}

function leesHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };
}
function schrijfHeaders(token, representation) {
  const h = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json; charset=utf-8", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
  if (representation) h.Prefer = 'return=representation,odata.include-annotations="OData.Community.Display.V1.FormattedValue"';
  return h;
}

// EntitySetName (meervoud) opzoeken + cachen.
const setCache = {};
async function entitySet(resource, token, logicalName) {
  if (setCache[logicalName]) return setCache[logicalName];
  const res = await fetch(`${resource}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Kon tabelnaam niet opzoeken voor ${logicalName} (${res.status}): ${await res.text()}`);
  setCache[logicalName] = (await res.json()).EntitySetName;
  return setCache[logicalName];
}

// systemuserid op e-mail (voor de medewerker-lookup), gecachet.
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

// Cliënt-meta (naam + manager) voor de snapshot bij het boeken, gecachet.
const klantMetaCache = new Map();
const MANAGER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
async function haalKlantMeta(resource, token, accountId) {
  if (!accountId) return { klantnaam: "", managerNaam: "" };
  if (klantMetaCache.has(accountId)) return klantMetaCache.get(accountId);
  let meta = { klantnaam: "", managerNaam: "" };
  try {
    const res = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=name&$expand=${MANAGER_NAV}($select=fullname)`, { headers: leesHeaders(token) });
    if (res.ok) { const d = await res.json(); meta = { klantnaam: d.name || "", managerNaam: (d[MANAGER_NAV] && d[MANAGER_NAV].fullname) || "" }; klantMetaCache.set(accountId, meta); }
  } catch { /* best effort */ }
  return meta;
}

// ---------------------------------------------------------------------------
// Mapping Dataverse-rij → portaal-vorm
// ---------------------------------------------------------------------------
function boekingNaarBuiten(r) {
  const n = (v) => (v == null ? null : Number(v));
  return {
    id: r[`${P}_urenboekingid`],
    medewerkerEmail: r[`${P}_medewerkeremail`] || "",
    medewerkerNaam: r[`${P}_medewerkernaam`] || "",
    datum: r[`${P}_datum`] ? String(r[`${P}_datum`]).slice(0, 10) : "",
    weekStart: r[`${P}_datum`] ? maandagVan(String(r[`${P}_datum`]).slice(0, 10)) : "",
    soort: r[`${P}_soort`] || "",
    declarabel: !!r[`${P}_declarabel`],
    accountId: r[CLIENT_VALUE] || "",
    klantnaam: r[CLIENT_VALUE + FV] || "",
    managerNaam: r[`${P}_managernaam`] || "",
    goedkeurderNaam: r[`${P}_goedkeurdernaam`] || "",
    urencode: r[`${P}_urencode`] || "",
    jaar: n(r[`${P}_jaar`]),
    vast: !!r[`${P}_vast`],
    omschrijving: r[`${P}_omschrijving`] || "",
    uren: n(r[`${P}_uren`]) || 0,
    tariefSoort: r[`${P}_tariefsoort`] || "",
    tariefBedrag: n(r[`${P}_tariefbedrag`]),
    status: normStatus(r[`${P}_status`]),
    goedgekeurdeUren: n(r[`${P}_goedgekeurdeuren`]),
    afboekUren: n(r[`${P}_afboekuren`]),
    afboekReden: r[`${P}_afboekreden`] || "",
    extraBedrag: n(r[`${P}_extrabedrag`]),
    extraReden: r[`${P}_extrareden`] || "",
    gecontroleerdDoor: r[`${P}_gecontroleerddoor`] || "",
    gecontroleerdOp: r[`${P}_gecontroleerdop`] || null,
    gefactureerd: !!r[`${P}_gefactureerd`],
    factuurRef: r[`${P}_exactfactuur`] || "",
    exactStatus: r[`${P}_exactstatus`] || "",
    gefactureerdOp: null,
  };
}
function tariefNaarBuiten(r) {
  if (!r) return null;
  const n = (v) => (v == null ? null : Number(v));
  return {
    id: r[`${P}_urentariefid`],
    medewerker_email: r[`${P}_medewerkeremail`] || "",
    medewerker_naam: r[`${P}_medewerkernaam`] || "",
    tarief_normaal: n(r[`${P}_tariefnormaal`]),
    tarief_hoog: n(r[`${P}_tariefhoog`]),
    tarief_laag: n(r[`${P}_tarieflaag`]),
    declarabel_doel: n(r[`${P}_declarabeldoel`]),
    leidinggevende: r[`${P}_leidinggevendenaam`] || "",
    deadline_weekdag: r[`${P}_deadlineweekdag`] == null ? null : Number(r[`${P}_deadlineweekdag`]),
    indiensttredingsdatum: r[`${P}_indiensttredingsdatum`] ? String(r[`${P}_indiensttredingsdatum`]).slice(0, 10) : null,
    actief: r[`${P}_actief`] == null ? true : !!r[`${P}_actief`],
    gewijzigd_op: r.modifiedon || null,
  };
}

// ===========================================================================
// Tarieven
// ===========================================================================
async function haalTariefRij(resource, token, email) {
  const set = await entitySet(resource, token, TARIEF);
  const res = await fetch(`${resource}/api/data/v9.2/${set}?$filter=${P}_medewerkeremail eq '${esc(email)}'&$top=1`, { headers: leesHeaders(token) });
  if (!res.ok) throw new Error(`Tarief ophalen mislukt: ${await res.text()}`);
  return (await res.json()).value[0] || null;
}
async function haalTarief(email) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const r = await haalTariefRij(resource, token, email);
  return tariefNaarBuiten(r);
}
async function lijstTarieven() {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, TARIEF);
  const res = await fetch(`${resource}/api/data/v9.2/${set}?$select=${P}_medewerkeremail,${P}_medewerkernaam,${P}_tariefnormaal,${P}_tariefhoog,${P}_tarieflaag,${P}_declarabeldoel,${P}_leidinggevendenaam,${P}_deadlineweekdag,${P}_indiensttredingsdatum,${P}_actief`, { headers: leesHeaders(token) });
  if (!res.ok) throw new Error(`Tarieven ophalen mislukt: ${await res.text()}`);
  return (await res.json()).value.map(tariefNaarBuiten);
}
async function zetTarief(email, velden, door) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, TARIEF);
  const bestaand = await haalTariefRij(resource, token, email);
  const body = {
    [`${P}_medewerkeremail`]: email,
    [`${P}_medewerkernaam`]: velden.naam ?? (bestaand ? bestaand[`${P}_medewerkernaam`] : null),
    [`${P}_tariefnormaal`]: velden.tarief_normaal ?? null,
    [`${P}_tariefhoog`]: velden.tarief_hoog ?? null,
    [`${P}_tarieflaag`]: velden.tarief_laag ?? null,
    [`${P}_declarabeldoel`]: velden.declarabel_doel ?? null,
    [`${P}_leidinggevendenaam`]: velden.leidinggevende ?? (bestaand ? bestaand[`${P}_leidinggevendenaam`] : null),
    [`${P}_deadlineweekdag`]: velden.deadline_weekdag ?? (bestaand ? bestaand[`${P}_deadlineweekdag`] : null),
    [`${P}_indiensttredingsdatum`]: velden.indiensttredingsdatum ?? (bestaand ? bestaand[`${P}_indiensttredingsdatum`] : null),
    [`${P}_actief`]: velden.actief == null ? true : !!velden.actief,
  };
  const suId = await haalSystemuserId(resource, token, email);
  if (suId) body[`${P}_Medewerker@odata.bind`] = `/systemusers(${suId})`;
  if (bestaand) {
    const res = await fetch(`${resource}/api/data/v9.2/${set}(${bestaand[`${P}_urentariefid`]})`, { method: "PATCH", headers: schrijfHeaders(token, true), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Tarief bijwerken mislukt (${res.status}): ${await res.text()}`);
    return tariefNaarBuiten(await res.json());
  }
  const res = await fetch(`${resource}/api/data/v9.2/${set}`, { method: "POST", headers: schrijfHeaders(token, true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Tarief aanmaken mislukt (${res.status}): ${await res.text()}`);
  return tariefNaarBuiten(await res.json());
}

// ===========================================================================
// Boekingen — eigen (medewerker)
// ===========================================================================
async function boekingSelect() {
  return [
    `${P}_urenboekingid`, `${P}_medewerkeremail`, `${P}_medewerkernaam`, `${P}_datum`, `${P}_soort`,
    `${P}_declarabel`, `${P}_omschrijving`, `${P}_uren`, `${P}_tariefsoort`, `${P}_tariefbedrag`, `${P}_status`,
    `${P}_goedgekeurdeuren`, `${P}_afboekuren`, `${P}_afboekreden`, `${P}_extrabedrag`, `${P}_extrareden`,
    `${P}_gecontroleerddoor`, `${P}_gecontroleerdop`, `${P}_gefactureerd`, `${P}_exactfactuur`, `${P}_exactstatus`,
    `${P}_managernaam`, `${P}_goedkeurdernaam`, `${P}_urencode`, `${P}_vast`, CLIENT_VALUE,
  ].join(",");
}
async function haalBoekingen(resource, token, filter, orderby) {
  const set = await entitySet(resource, token, BOEKING);
  const sel = await boekingSelect();
  const url = `${resource}/api/data/v9.2/${set}?$select=${sel}${filter ? `&$filter=${encodeURIComponent(filter)}` : ""}${orderby ? `&$orderby=${orderby}` : ""}`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) throw new Error(`Boekingen ophalen mislukt (${res.status}): ${await res.text()}`);
  const alles = [];
  let data = await res.json();
  alles.push(...(data.value || []));
  // paging
  let next = data["@odata.nextLink"];
  while (next && alles.length < 5000) {
    const r2 = await fetch(next, { headers: leesHeaders(token) });
    if (!r2.ok) break;
    data = await r2.json();
    alles.push(...(data.value || []));
    next = data["@odata.nextLink"];
  }
  return alles.map(boekingNaarBuiten);
}
async function haalBoekingRuw(resource, token, id) {
  const set = await entitySet(resource, token, BOEKING);
  const sel = await boekingSelect();
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})?$select=${sel}`, { headers: leesHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Boeking ophalen mislukt (${res.status}): ${await res.text()}`);
  return await res.json();
}

async function boekingenVanMedewerker(email, { vanaf, tot } = {}) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  let f = `${P}_medewerkeremail eq '${esc(email)}'`;
  if (vanaf) f += ` and ${P}_datum ge ${vanaf}`;
  if (tot) f += ` and ${P}_datum le ${tot}`;
  return haalBoekingen(resource, token, f, `${P}_datum desc`);
}

async function maakBoeking({ email, naam, datum, soort, accountId, omschrijving, uren, tariefSoort, urencode, jaar, vast }, klantMeta) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const decl = isDeclarabel(soort);
  // Tarief altijd ophalen: bij declarabel voor het uurtarief, bij indirect/kantoor voor de
  // leidinggevende (die keurt niet-cliënturen goed).
  const t = tariefNaarBuiten(await haalTariefRij(resource, token, email));
  let gekozenTariefSoort = null, tariefBedrag = null;
  if (decl) {
    gekozenTariefSoort = TARIEF_SOORTEN.includes(tariefSoort) ? tariefSoort : "normaal";
    if (t) tariefBedrag = { normaal: t.tarief_normaal, hoog: t.tarief_hoog, laag: t.tarief_laag }[gekozenTariefSoort];
  }
  // Goedkeurder: cliënturen → manager op de cliënt; niet-cliënturen → leidinggevende van de medewerker.
  const goedkeurder = decl ? (klantMeta?.managerNaam || null) : (t && t.leidinggevende ? t.leidinggevende : null);
  const body = {
    [`${P}_medewerkeremail`]: email, [`${P}_medewerkernaam`]: naam ?? null,
    [`${P}_datum`]: datum, [`${P}_soort`]: soort, [`${P}_declarabel`]: decl,
    [`${P}_omschrijving`]: omschrijving ?? null, [`${P}_uren`]: Number(uren),
    [`${P}_tariefsoort`]: gekozenTariefSoort, [`${P}_tariefbedrag`]: tariefBedrag ?? null,
    [`${P}_status`]: "concept", [`${P}_gefactureerd`]: false,
    [`${P}_managernaam`]: decl ? (klantMeta?.managerNaam || null) : null,
    [`${P}_goedkeurdernaam`]: goedkeurder,
    [`${P}_urencode`]: urencode ?? null,
    [`${P}_vast`]: !!vast,
  };
  // Jaar (bij een abonnement verplicht, zie mw-uren-boekingen). Alleen meesturen als het is
  // meegegeven, zodat andere soorten onveranderd blijven.
  if (jaar != null && jaar !== "") body[`${P}_jaar`] = Number(jaar);
  if (decl && accountId) body[`${P}_Client@odata.bind`] = `/accounts(${accountId})`;
  const suId = await haalSystemuserId(resource, token, email);
  if (suId) body[`${P}_Medewerker@odata.bind`] = `/systemusers(${suId})`;
  const res = await postMetJaarTerugval(resource, token, `${resource}/api/data/v9.2/${set}`, "POST", body);
  if (!res.ok) throw new Error(`Boeking aanmaken mislukt (${res.status}): ${await res.text()}`);
  return boekingNaarBuiten(await res.json());
}

/**
 * Doet een POST/PATCH; als die faalt omdat het (nieuwe) veld cr283_jaar nog niet bestaat (schema-
 * setup nog niet gedraaid), wordt de aanvraag één keer opnieuw geprobeerd zónder dat veld. Zo breekt
 * het uren schrijven nooit op een ontbrekende kolom — het jaar wordt dan gewoon (nog) niet bewaard.
 */
async function postMetJaarTerugval(resource, token, url, methode, body) {
  const doe = (b) => fetch(url, { method: methode, headers: schrijfHeaders(token, true), body: JSON.stringify(b) });
  let res = await doe(body);
  if (!res.ok && Object.prototype.hasOwnProperty.call(body, `${P}_jaar`)) {
    const tekst = await res.clone().text().catch(() => "");
    if (/cr283_jaar/i.test(tekst) || /jaar/i.test(tekst)) {
      const { [`${P}_jaar`]: _weg, ...zonder } = body;
      res = await doe(zonder);
    }
  }
  return res;
}

async function werkBoekingBij(id, email, velden, klantMeta) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const huidig = await haalBoekingRuw(resource, token, id);
  if (!huidig) return { fout: "NIET_GEVONDEN" };
  if ((huidig[`${P}_medewerkeremail`] || "").toLowerCase() !== String(email).toLowerCase()) return { fout: "NIET_GEVONDEN" };
  if (huidig[`${P}_vast`]) return { fout: "VAST" };
  if (!isConcept(huidig[`${P}_status`])) return { fout: "AL_GECONTROLEERD" };

  const nieuwSoort = velden.soort ?? huidig[`${P}_soort`];
  const decl = isDeclarabel(nieuwSoort);
  const t = tariefNaarBuiten(await haalTariefRij(resource, token, email));
  const body = {
    [`${P}_soort`]: nieuwSoort, [`${P}_declarabel`]: decl,
    [`${P}_datum`]: velden.datum ?? (huidig[`${P}_datum`] ? String(huidig[`${P}_datum`]).slice(0, 10) : null),
    [`${P}_omschrijving`]: velden.omschrijving ?? huidig[`${P}_omschrijving`] ?? null,
    [`${P}_uren`]: velden.uren !== undefined ? Number(velden.uren) : huidig[`${P}_uren`],
    [`${P}_managernaam`]: decl ? (klantMeta ? klantMeta.managerNaam : huidig[`${P}_managernaam`]) : null,
    [`${P}_goedkeurdernaam`]: decl ? (klantMeta ? klantMeta.managerNaam : huidig[`${P}_goedkeurdernaam`]) : (t && t.leidinggevende ? t.leidinggevende : null),
    [`${P}_urencode`]: velden.urencode ?? huidig[`${P}_urencode`] ?? null,
  };
  // Jaar (abonnement): meegestuurde waarde overneemt; bij een niet-abonnement wordt het jaar gewist.
  if (velden.jaar !== undefined) {
    body[`${P}_jaar`] = velden.jaar != null && velden.jaar !== "" ? Number(velden.jaar) : null;
  } else if (nieuwSoort !== "abonnement") {
    body[`${P}_jaar`] = null;
  }
  if (decl) {
    const tSoort = TARIEF_SOORTEN.includes(velden.tariefSoort) ? velden.tariefSoort : (huidig[`${P}_tariefsoort`] || "normaal");
    body[`${P}_tariefsoort`] = tSoort;
    body[`${P}_tariefbedrag`] = t ? ({ normaal: t.tarief_normaal, hoog: t.tarief_hoog, laag: t.tarief_laag }[tSoort] ?? null) : null;
    const acc = velden.accountId ?? huidig[CLIENT_VALUE];
    if (acc) body[`${P}_Client@odata.bind`] = `/accounts(${acc})`;
  } else {
    body[`${P}_tariefsoort`] = null; body[`${P}_tariefbedrag`] = null;
    // cliënt loskoppelen bij een niet-declarabele soort
    const res0 = await fetch(`${resource}/api/data/v9.2/${set}(${id})/${P}_Client/$ref`, { method: "DELETE", headers: schrijfHeaders(token, false) }).catch(() => null);
    void res0;
  }
  const res = await postMetJaarTerugval(resource, token, `${resource}/api/data/v9.2/${set}(${id})`, "PATCH", body);
  if (!res.ok) throw new Error(`Boeking bijwerken mislukt (${res.status}): ${await res.text()}`);
  return { boeking: boekingNaarBuiten(await res.json()) };
}

async function verwijderBoeking(id, email) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const huidig = await haalBoekingRuw(resource, token, id);
  if (!huidig) return false;
  if ((huidig[`${P}_medewerkeremail`] || "").toLowerCase() !== String(email).toLowerCase()) return false;
  if (huidig[`${P}_vast`]) return false; // vaste uren zijn door beheer vastgezet
  if (!isConcept(huidig[`${P}_status`])) return false;
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "DELETE", headers: schrijfHeaders(token, false) });
  return res.ok;
}

// ===========================================================================
// Facturatiecontrole (manager op de cliënt) — tweede laag, ná de weekgoedkeuring.
// Werkt op declarabele cliënturen die door de leidinggevende al zijn goedgekeurd; hier boekt de
// manager af/op en gaat UXT naar Exact.
// ===========================================================================
async function boekingenVoorControle({ maand, managerNaam, alle }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const { eerste, laatste } = maandRange(maand);
  let f = `${P}_declarabel eq true and ${CLIENT_VALUE} ne null and (${P}_status eq 'goedgekeurd' or ${P}_status eq 'gefactureerd') and ${P}_datum ge ${eerste} and ${P}_datum le ${laatste}`;
  if (!alle) f += ` and ${P}_managernaam eq '${esc(managerNaam || " ")}'`;
  return haalBoekingen(resource, token, f, `${P}_datum asc`);
}

// ===========================================================================
// Weekstaat: indienen (medewerker) + weekgoedkeuring (leidinggevende)
// ===========================================================================
async function boekingenInWeek(resource, token, email, weekStart) {
  const tot = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const f = `${P}_medewerkeremail eq '${esc(email)}' and ${P}_datum ge ${weekStart} and ${P}_datum le ${tot}`;
  return haalBoekingen(resource, token, f, `${P}_datum asc`);
}
async function zetStatus(resource, token, set, id, status, door) {
  const body = { [`${P}_status`]: status };
  if (door !== undefined) { body[`${P}_gecontroleerddoor`] = door ?? null; body[`${P}_gecontroleerdop`] = door ? new Date().toISOString() : null; }
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, false), body: JSON.stringify(body) });
  return res.ok;
}

/**
 * De vaste (contract)uren van een medewerker, omgezet naar concrete dag-slots binnen één week.
 * Elke slot verwijst naar een urencode; de categorie van die code bepaalt de soort.
 */
// 2-wekelijkse cyclus (1 of 2) van een week, t.o.v. een vaste referentie-maandag (1 jan 2024).
// Zo weet de weekstaat welk van de twee roosters (om-en-om) deze week geldt.
function tweeWekelijkseCyclus(weekStart) {
  const ref = Date.UTC(2024, 0, 1); // maandag
  const weken = Math.round((new Date(weekStart + "T00:00:00Z").getTime() - ref) / (7 * 86400000));
  return (((weken % 2) + 2) % 2) === 0 ? 1 : 2;
}

async function vasteUrenSlots(email, weekStart) {
  const [alle, codes] = await Promise.all([
    vasteUrenStore.haalVoor(email).catch(() => []),
    urencodesStore.haalCodes().catch(() => []),
  ]);
  const catVan = new Map((codes || []).map((c) => [c.naam, c.categorie]));
  // Ongetagde slots gelden elke week; week-getagde slots alleen in hun eigen cyclus (om-en-om).
  const cyclus = tweeWekelijkseCyclus(weekStart);
  const slots = (alle || []).filter((s) => s.week == null || Number(s.week) === cyclus);
  return (slots || []).map((s) => {
    const datum = new Date(new Date(weekStart + "T00:00:00Z").getTime() + (s.weekdag - 1) * 86400000).toISOString().slice(0, 10);
    return { slotId: s.id, datum, weekdag: s.weekdag, urencode: s.urencode, uren: s.uren, soort: catVan.get(s.urencode) || "kantoor" };
  });
}

/** Virtuele vaste-uren-boekingen voor de week: de slots die nog niet als echte boeking bestaan. */
async function vasteUrenVirtueel(email, weekStart, bestaandeBoekingen) {
  const slots = await vasteUrenSlots(email, weekStart);
  const bestaat = (s) => (bestaandeBoekingen || []).some((b) => b.vast && b.datum === s.datum && (b.urencode || "") === s.urencode);
  return slots.filter((s) => !bestaat(s)).map((s) => ({
    id: `vast:${s.slotId}:${s.datum}`, datum: s.datum, weekStart, soort: s.soort, urencode: s.urencode,
    uren: s.uren, declarabel: isDeclarabel(s.soort), vast: true, virtueel: true, status: "concept", omschrijving: "",
  }));
}

/**
 * Medewerker dient zijn weekstaat in. Eerst worden de vaste (contract)uren als echte boekingen
 * vastgelegd; daarna moet de week op precies WEEK_UREN_EIS (40) uur uitkomen; pas dan gaan alle
 * concept-boekingen → 'ingediend'.
 */
async function dienWeekIn(email, weekStart) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);

  // 1) Vaste uren materialiseren (alleen wat nog niet bestaat).
  const slots = await vasteUrenSlots(email, weekStart);
  let boekingen = await boekingenInWeek(resource, token, email, weekStart);
  if (slots.length) {
    const naam = boekingen[0]?.medewerkerNaam || (tariefNaarBuiten(await haalTariefRij(resource, token, email))?.medewerker_naam) || "";
    for (const s of slots) {
      const bestaat = boekingen.some((b) => b.vast && b.datum === s.datum && (b.urencode || "") === s.urencode);
      if (!bestaat) await maakBoeking({ email, naam, datum: s.datum, soort: s.soort, omschrijving: null, uren: s.uren, urencode: s.urencode, vast: true });
    }
    boekingen = await boekingenInWeek(resource, token, email, weekStart);
  }

  // 2) 40-uur-eis: de week moet precies kloppen.
  const urenTotaal = Math.round(boekingen.reduce((sum, b) => sum + (b.uren || 0), 0) * 100) / 100;
  if (Math.abs(urenTotaal - WEEK_UREN_EIS) > 0.001) return { fout: "NIET_COMPLEET", urenTotaal, eis: WEEK_UREN_EIS };

  // 3) Indienen.
  const teDoen = boekingen.filter((b) => b.status === "concept");
  if (teDoen.length === 0) return { fout: "GEEN_CONCEPT", urenTotaal };
  let aantal = 0;
  for (const b of teDoen) { if (await zetStatus(resource, token, set, b.id, "ingediend")) aantal++; }
  return { aantal, totaal: boekingen.length, urenTotaal };
}

/** Beheerder verwijdert een hele weekstaat (alle boekingen van die medewerker+week). Reeds
 *  gefactureerde boekingen blijven staan (factuurintegriteit). */
async function verwijderWeek(medewerkerEmail, weekStart) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const boekingen = await boekingenInWeek(resource, token, medewerkerEmail, weekStart);
  let verwijderd = 0, overgeslagen = 0;
  for (const b of boekingen) {
    if (b.gefactureerd || b.status === "gefactureerd") { overgeslagen++; continue; }
    const res = await fetch(`${resource}/api/data/v9.2/${set}(${b.id})`, { method: "DELETE", headers: schrijfHeaders(token, false) });
    if (res.ok) verwijderd++;
  }
  return { verwijderd, overgeslagen };
}

/**
 * Ingediende weekstaten die wachten op goedkeuring, gegroepeerd per medewerker + week. De
 * goedkeurder is de leidinggevende van de medewerker (uit het uurtarief). Een beheerder ziet alles.
 */
async function weekstatenVoorLeidinggevende({ leidinggevendeNaam, alle }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const boekingen = await haalBoekingen(resource, token, `${P}_status eq 'ingediend'`, `${P}_datum asc`);
  const tarieven = await lijstTarieven();
  const leidingVan = new Map(tarieven.map((t) => [String(t.medewerker_email).toLowerCase(), t.leidinggevende || ""]));
  const mij = String(leidinggevendeNaam || "").trim().toLowerCase();
  const perWeek = new Map();
  for (const b of boekingen) {
    const email = (b.medewerkerEmail || "").toLowerCase();
    const leiding = leidingVan.get(email) || "";
    if (!alle && leiding.trim().toLowerCase() !== mij) continue;
    const key = `${email}|${b.weekStart}`;
    if (!perWeek.has(key)) perWeek.set(key, { medewerkerEmail: b.medewerkerEmail, medewerkerNaam: b.medewerkerNaam || b.medewerkerEmail, leidinggevende: leiding, weekStart: b.weekStart, totaal: 0, declarabel: 0, boekingen: [] });
    const w = perWeek.get(key);
    w.totaal += b.uren; if (b.declarabel) w.declarabel += b.uren;
    w.boekingen.push(b);
  }
  return [...perWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1) || (a.medewerkerNaam || "").localeCompare(b.medewerkerNaam || ""));
}

/** Leidinggevende keurt de hele weekstaat goed: alle 'ingediend'-boekingen → 'goedgekeurd'. */
async function keurWeekGoed(medewerkerEmail, weekStart, door) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const boekingen = await boekingenInWeek(resource, token, medewerkerEmail, weekStart);
  const teDoen = boekingen.filter((b) => b.status === "ingediend");
  let aantal = 0;
  for (const b of teDoen) { if (await zetStatus(resource, token, set, b.id, "goedgekeurd", door || "onbekend")) aantal++; }
  return { aantal };
}

/** Leidinggevende keurt de weekstaat af: alle 'ingediend'-boekingen terug naar 'concept'. */
async function keurWeekAf(medewerkerEmail, weekStart) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const boekingen = await boekingenInWeek(resource, token, medewerkerEmail, weekStart);
  const teDoen = boekingen.filter((b) => b.status === "ingediend");
  let aantal = 0;
  for (const b of teDoen) { if (await zetStatus(resource, token, set, b.id, "concept")) aantal++; }
  return { aantal };
}

async function controleActie(id, { goedgekeurdeUren, afboekUren, afboekReden, extraBedrag, extraReden }, door) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const huidig = await haalBoekingRuw(resource, token, id);
  if (!huidig) return null;
  const body = {
    [`${P}_goedgekeurdeuren`]: goedgekeurdeUren ?? null,
    [`${P}_afboekuren`]: afboekUren ?? null,
    [`${P}_afboekreden`]: afboekReden ?? null,
    [`${P}_extrabedrag`]: extraBedrag ?? null,
    [`${P}_extrareden`]: extraReden ?? null,
    [`${P}_gecontroleerddoor`]: door ?? null,
    [`${P}_gecontroleerdop`]: new Date().toISOString(),
  };
  if (!huidig[`${P}_gefactureerd`]) body[`${P}_status`] = "goedgekeurd";
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Controle bijwerken mislukt (${res.status}): ${await res.text()}`);
  return boekingNaarBuiten(await res.json());
}

// ===========================================================================
// OHW / facturatie
// ===========================================================================
function boekingWaarde(b) {
  const u = b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren;
  return (b.tariefBedrag || 0) * (u || 0) + (b.extraBedrag || 0);
}
async function ohwEnFacturatie({ maand, managerNaam, alle }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  // Alleen goedgekeurde (of al gefactureerde) declarabele cliënturen tellen mee in OHW/facturatie.
  let f = `${P}_declarabel eq true and ${CLIENT_VALUE} ne null and (${P}_status eq 'goedgekeurd' or ${P}_status eq 'gefactureerd')`;
  if (maand) { const { eerste, laatste } = maandRange(maand); f += ` and ${P}_datum ge ${eerste} and ${P}_datum le ${laatste}`; }
  if (!alle) f += ` and ${P}_managernaam eq '${esc(managerNaam || " ")}'`;
  const boekingen = await haalBoekingen(resource, token, f, `${P}_datum asc`);
  const perKlant = new Map();
  const totaal = { uxt: { uren: 0, waarde: 0 }, abonnement: { uren: 0, waarde: 0 }, gefactureerd: 0, teFactureren: 0 };
  for (const b of boekingen) {
    const key = b.accountId || b.klantnaam || "?";
    if (!perKlant.has(key)) perKlant.set(key, { accountId: b.accountId, klantnaam: b.klantnaam, managerNaam: b.managerNaam, uxt: { uren: 0, waarde: 0 }, abonnement: { uren: 0, waarde: 0 }, teFactureren: 0, gefactureerd: 0, boekingen: [] });
    const k = perKlant.get(key);
    const w = boekingWaarde(b);
    const urenErkend = b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren;
    const bak = b.soort === "uxt" ? "uxt" : "abonnement";
    k[bak].uren += urenErkend; k[bak].waarde += w; totaal[bak].uren += urenErkend; totaal[bak].waarde += w;
    if (b.gefactureerd) { k.gefactureerd += w; totaal.gefactureerd += w; } else { k.teFactureren += w; totaal.teFactureren += w; }
    k.boekingen.push(b);
  }
  return { totaal, klanten: [...perKlant.values()] };
}

async function markeerGefactureerd(ids, factuurRef, door) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  let aantal = 0;
  for (const id of ids) {
    const body = { [`${P}_gefactureerd`]: true, [`${P}_status`]: "gefactureerd" };
    if (factuurRef) body[`${P}_exactfactuur`] = String(factuurRef).slice(0, 100);
    const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, false), body: JSON.stringify(body) });
    if (res.ok) aantal++;
  }
  return aantal;
}

/** Zet het resultaat van een Exact-push op een boeking. */
async function markeerExact(id, { exactfactuur, exactstatus, gefactureerd }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const set = await entitySet(resource, token, BOEKING);
  const body = {};
  if (exactfactuur !== undefined) body[`${P}_exactfactuur`] = exactfactuur ? String(exactfactuur).slice(0, 100) : null;
  if (exactstatus !== undefined) body[`${P}_exactstatus`] = exactstatus ? String(exactstatus).slice(0, 400) : null;
  if (gefactureerd !== undefined) { body[`${P}_gefactureerd`] = !!gefactureerd; if (gefactureerd) body[`${P}_status`] = "gefactureerd"; }
  const res = await fetch(`${resource}/api/data/v9.2/${set}(${id})`, { method: "PATCH", headers: schrijfHeaders(token, false), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Exact-resultaat opslaan mislukt (${res.status}): ${await res.text()}`);
}

/** Goedgekeurde UXT-boekingen die nog niet naar Exact zijn geschreven (optioneel voor één cliënt). */
async function uxtTeExporteren({ accountId } = {}) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  let f = `${P}_soort eq 'uxt' and ${P}_status eq 'goedgekeurd' and ${P}_gefactureerd eq false and ${CLIENT_VALUE} ne null and ${P}_exactfactuur eq null`;
  if (accountId) f += ` and ${CLIENT_VALUE} eq ${accountId}`;
  return haalBoekingen(resource, token, f, `${P}_datum asc`);
}

// ===========================================================================
// Rapportage + herinneringen
// ===========================================================================
async function rapportageDeclarabel({ vanaf, tot }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  // Rapportage toont ÁLLE uren (ook nog niet goedgekeurde), zodat je kunt inzien wie nog open uren
  // heeft. De open (niet-goedgekeurde) uren worden apart geteld.
  let f = "";
  if (vanaf) f += `${P}_datum ge ${vanaf}`;
  if (tot) f += `${f ? " and " : ""}${P}_datum le ${tot}`;
  const boekingen = await haalBoekingen(resource, token, f || null, `${P}_datum asc`);
  const tarieven = await lijstTarieven();
  const codes = await urencodesStore.haalCodes().catch(() => []);
  // Codes die NIET meetellen in de noemer van het declarabel-% (verlof, overuren, parttime, …).
  const teltNietMee = new Set((codes || []).filter((c) => c.teltDeclarabelMee === false).map((c) => c.naam));
  const doelVan = new Map(tarieven.map((t) => [String(t.medewerker_email).toLowerCase(), t.declarabel_doel]));
  const per = new Map();
  for (const b of boekingen) {
    const key = (b.medewerkerEmail || "?").toLowerCase();
    if (!per.has(key)) per.set(key, { email: b.medewerkerEmail, naam: b.medewerkerNaam || b.medewerkerEmail, totaal: 0, basis: 0, declarabelUren: 0, openUren: 0, goedgekeurdUren: 0, abonnement: 0, uxt: 0, indirect: 0, kantoor: 0, verlof: 0 });
    const r = per.get(key);
    // Verlof telt (net als vroeger de urencode-gebaseerde uitzondering voor verlof/overuren/parttime)
    // bewust NIET mee in de noemer van het declarabel-% — het is automatisch gematerialiseerd verlof,
    // geen keuze van de medewerker, en zou het declarabel-doel anders onterecht drukken.
    const meetelt = b.soort !== "verlof" && !(b.urencode && teltNietMee.has(b.urencode));
    r.totaal += b.uren;
    if (meetelt) r.basis += b.uren;                 // noemer voor het declarabel-%
    if (b.declarabel) r.declarabelUren += b.uren;
    // "Niet goedgekeurd" = nog concept of ingediend (leidinggevende heeft de week nog niet goedgekeurd).
    if (b.status === "goedgekeurd" || b.status === "gefactureerd") r.goedgekeurdUren += b.uren; else r.openUren += b.uren;
    if (r[b.soort] !== undefined) r[b.soort] += b.uren;
  }
  return [...per.values()].map((r) => ({
    ...r,
    declarabelPct: r.basis ? Math.round((r.declarabelUren / r.basis) * 1000) / 10 : 0,
    doel: doelVan.get((r.email || "").toLowerCase()) == null ? null : Number(doelVan.get((r.email || "").toLowerCase())),
  })).sort((a, b) => (a.naam || "").localeCompare(b.naam || ""));
}

/**
 * Bezetting per medewerker per maand: hoeveel uur staat er al ingepland/geboekt (alle soorten en
 * statussen samen — declarabel, indirect, kantoor én vast) t.o.v. de beschikbare capaciteit die
 * maand (werkdagen × 8 uur, dezelfde fulltime-norm als WEEK_UREN_EIS/5). Gegroepeerd per week
 * (met de losse boekingen erbij) zodat de leidinggevende/beheerder kan doorklikken tot op
 * boekingniveau. Scoping identiek aan weekstatenVoorLeidinggevende: standaard alleen je eigen
 * team (op naam uit het uurtarief), een beheerder kan met alle=true iedereen zien.
 */
async function bezettingPerMaand({ maand, leidinggevendeNaam, alle }) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const { eerste, laatste } = maandRange(maand);
  const boekingen = await haalBoekingen(resource, token, `${P}_datum ge ${eerste} and ${P}_datum le ${laatste}`, `${P}_datum asc`);
  const tarieven = await lijstTarieven();
  const leidingVan = new Map(tarieven.map((t) => [String(t.medewerker_email).toLowerCase(), t.leidinggevende || ""]));
  const mij = String(leidinggevendeNaam || "").trim().toLowerCase();

  let werkdagen = 0;
  for (let d = new Date(eerste + "T00:00:00Z"); d <= new Date(laatste + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const dag = d.getUTCDay();
    if (dag !== 0 && dag !== 6) werkdagen++;
  }
  const beschikbaar = Math.round(werkdagen * (WEEK_UREN_EIS / 5) * 100) / 100;

  const per = new Map();
  // Actieve medewerkers alvast opnemen, ook zonder boekingen deze maand — juist dan is de
  // bezetting (terecht) laag en dus interessant om te zien.
  for (const t of tarieven.filter((t) => t.actief)) {
    const email = String(t.medewerker_email).toLowerCase();
    if (!alle && (t.leidinggevende || "").trim().toLowerCase() !== mij) continue;
    per.set(email, { email: t.medewerker_email, naam: t.medewerker_naam || t.medewerker_email, leidinggevende: t.leidinggevende || "", ingepland: 0, vast: 0, weken: new Map() });
  }
  for (const b of boekingen) {
    const email = (b.medewerkerEmail || "").toLowerCase();
    if (!per.has(email)) {
      const leiding = leidingVan.get(email) || "";
      if (!alle && leiding.trim().toLowerCase() !== mij) continue;
      per.set(email, { email: b.medewerkerEmail, naam: b.medewerkerNaam || b.medewerkerEmail, leidinggevende: leiding, ingepland: 0, vast: 0, weken: new Map() });
    }
    const r = per.get(email);
    r.ingepland += b.uren;
    if (b.vast) r.vast += b.uren;
    if (!r.weken.has(b.weekStart)) r.weken.set(b.weekStart, { weekStart: b.weekStart, ingepland: 0, boekingen: [] });
    const w = r.weken.get(b.weekStart);
    w.ingepland += b.uren;
    w.boekingen.push(b);
  }

  const medewerkers = [...per.values()].map((r) => ({
    email: r.email, naam: r.naam, leidinggevende: r.leidinggevende,
    ingepland: Math.round(r.ingepland * 100) / 100,
    vast: Math.round(r.vast * 100) / 100,
    beschikbaar,
    bezettingPct: beschikbaar ? Math.round((r.ingepland / beschikbaar) * 1000) / 10 : 0,
    weken: [...r.weken.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)),
  })).sort((a, b) => (a.naam || "").localeCompare(b.naam || ""));

  return { maand, eerste, laatste, werkdagen, beschikbaar, medewerkers };
}

async function medewerkersOnderMinuren(weekStart, minuren) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const token = await haalDynamicsToken();
  const tot = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const boekingen = await haalBoekingen(resource, token, `${P}_datum ge ${weekStart} and ${P}_datum le ${tot}`, null);
  const som = new Map();
  for (const b of boekingen) { const k = (b.medewerkerEmail || "").toLowerCase(); som.set(k, (som.get(k) || 0) + b.uren); }
  const tarieven = (await lijstTarieven()).filter((t) => t.actief);
  return tarieven
    .map((t) => ({ email: t.medewerker_email, naam: t.medewerker_naam || t.medewerker_email, geschreven: som.get(String(t.medewerker_email).toLowerCase()) || 0 }))
    .filter((m) => m.geschreven < minuren)
    .sort((a, b) => (a.naam || "").localeCompare(b.naam || ""));
}

module.exports = {
  SOORTEN, DECLARABELE_SOORTEN, isDeclarabel, TARIEF_SOORTEN, WEEK_UREN_EIS, maandagVan, maandVan, boekingWaarde,
  haalKlantMeta,
  haalTarief, lijstTarieven, zetTarief,
  boekingenVanMedewerker, maakBoeking, werkBoekingBij, verwijderBoeking,
  vasteUrenSlots, vasteUrenVirtueel,
  dienWeekIn, weekstatenVoorLeidinggevende, keurWeekGoed, keurWeekAf, verwijderWeek,
  boekingenVoorControle, controleActie,
  ohwEnFacturatie, markeerGefactureerd, markeerExact, uxtTeExporteren,
  rapportageDeclarabel, medewerkersOnderMinuren, bezettingPerMaand,
};
