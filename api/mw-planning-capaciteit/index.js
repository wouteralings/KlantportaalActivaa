/**
 * /api/mw-planning-capaciteit — de beschikbare capaciteit per medewerker per maand voor de
 * maandplanning-bezetting (Stap 3c). Combineert drie bronnen die al in het systeem staan:
 *   - het WERKROOSTER per medewerker → parttime-factor (verlofDataverse.berekenParttimeFactor:
 *     werkelijk gewerkte uren/week ÷ 40, ook voor een 2-wekelijks rooster);
 *   - het DECLARABEL-DOEL % per medewerker (urentarief cr283_urentarief, uren.lijstTarieven);
 *   - VERLOF (cr283_verlofaanvraag): goedgekeurd verlof (gaat van de capaciteit af) en aangevraagd
 *     verlof (getoond zodat je een vakantieaanvraag tegen de bezetting kunt beoordelen).
 *
 * De frontend beslist welke factoren meetellen (rooster/declarabel-doel apart aan/uit) — dit
 * endpoint geeft de losse bouwstenen terug, zodat beide combinaties mogelijk zijn zonder
 * herberekening op de server.
 *
 * GET ?maand=YYYY-MM[&scope=alle] → { maand, werkdagen, werkdagenResterend, vandaag, normPerDag,
 *   medewerkers: [{ email, naam, leidinggevende, parttimeFactor, roosterUren, declarabelDoel,
 *   verlofGoedgekeurd, verlofAangevraagd, beschikbaar, resterend: { werkdagen, roosterUren, verlof,
 *   beschikbaar } }] }
 *
 * `resterend` = het deel van de periode vanaf vandaag (nul als de periode al voorbij is), zodat een
 * scherm "nog te doen werk" tegen "nog beschikbare uren" kan zetten.
 *
 * Toegang & SCOPE:
 *   - LEZEN mag elke ingelogde medewerker (magPlanningLezen) — "Mijn werk" toont hiermee de eigen
 *     voortgang, en een LEIDINGGEVENDE die van zijn team. De scope hieronder is de echte grens.
 *   - Standaard krijg je jezelf + iedereen die jou in Beheer → Uren ("Tarieven & deadline per
 *     medewerker") als leidinggevende heeft staan.
 *   - Kantoorbreed (?scope=alle) is voor de beheerder of iemand met het granulaire Planning-recht.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magPlanningLezen, magPlanningGebruiken } = require("../_gedeeld/planningRecht");
const uren = require("../_gedeeld/urenDataverse");
const verlof = require("../_gedeeld/verlofDataverse");
const { haalUitgeslotenMedewerkers } = require("../_gedeeld/planningInstellingen");

const pad = (n) => String(n).padStart(2, "0");

// Verdeelt de uren van één goedgekeurd verlofrecord over de 12 maanden van `jaar`, naar rato van het
// aantal werkdagen (ma-vr) dat het verlof in elke maand valt. Zo krijgt de per-maand-bezetting het
// verlof in de juiste maand(en), ook bij een vakantie die twee maanden overlapt.
function verdeelVerlofOverMaanden(record, jaar) {
  const out = Array.from({ length: 12 }, () => 0);
  const urenTot = Number(record && record.aantalUren) || 0;
  if (!urenTot || !record) return out;
  const s = record.startdatum ? new Date(record.startdatum) : null;
  if (!s || isNaN(s.getTime())) return out;
  const eRaw = record.einddatum ? new Date(record.einddatum) : s;
  const e = eRaw && !isNaN(eRaw.getTime()) ? eRaw : s;
  const jaarStart = new Date(Date.UTC(jaar, 0, 1));
  const jaarEind = new Date(Date.UTC(jaar, 11, 31));
  let from = s < jaarStart ? jaarStart : s;
  const to = e > jaarEind ? jaarEind : e;
  from = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (from > to) return out;
  const perMaand = Array.from({ length: 12 }, () => 0);
  let totaal = 0;
  for (let dt = new Date(from); dt <= to; dt.setUTCDate(dt.getUTCDate() + 1)) {
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) { perMaand[dt.getUTCMonth()] += 1; totaal += 1; }
  }
  if (totaal === 0) { out[from.getUTCMonth()] = urenTot; return out; }
  for (let m = 0; m < 12; m++) out[m] = urenTot * (perMaand[m] / totaal);
  return out;
}

function maandVanNu() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Aantal werkdagen (ma-vr) tussen twee ISO-datums, beide inclusief. 0 als van ná tot ligt. */
function werkdagenTussen(vanISO, totISO) {
  if (!vanISO || !totISO || vanISO > totISO) return 0;
  const tot = new Date(`${totISO}T00:00:00Z`);
  let n = 0;
  for (let dt = new Date(`${vanISO}T00:00:00Z`); dt <= tot; dt.setUTCDate(dt.getUTCDate() + 1)) {
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/**
 * Het deel van de uren van één verlofrecord dat in [van, tot] valt, naar rato van de werkdagen —
 * zelfde pro-rata-aanpak als verdeelVerlofOverMaanden, maar dan voor een vrij venster (gebruikt voor
 * het RESTERENDE deel van de periode: van vandaag tot het einde van de maand/het jaar).
 */
function verlofUrenInVenster(record, vanISO, totISO) {
  const urenTot = Number(record && record.aantalUren) || 0;
  if (!urenTot) return 0;
  const s = String(record.startdatum || "").slice(0, 10);
  if (!s) return 0;
  const eRuw = String(record.einddatum || record.startdatum || "").slice(0, 10);
  const e = eRuw < s ? s : eRuw;
  const totaalDagen = werkdagenTussen(s, e);
  if (!totaalDagen) return 0;
  const van = s > vanISO ? s : vanISO;
  const tot = e < totISO ? e : totISO;
  const dagen = werkdagenTussen(van, tot);
  if (!dagen) return 0;
  return urenTot * (dagen / totaalDagen);
}

async function mijnNaam(req, email) {
  let naam = haalNaamUitPrincipal(req) || "";
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (resource && email) {
    try {
      const token = await haalDynamicsToken();
      const veilig = String(email).replace(/'/g, "''");
      const res = await fetch(`${resource}/api/data/v9.2/systemusers?$select=fullname&$filter=internalemailaddress eq '${encodeURIComponent(veilig)}' and isdisabled eq false&$top=1`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
      if (res.ok) { const d = await res.json(); if (d.value && d.value[0] && d.value[0].fullname) naam = d.value[0].fullname; }
    } catch { /* val terug op de principal-naam */ }
  }
  return naam;
}

const verwerk = async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const email = haalEmailUitPrincipal(req);
    const isBeheerder = haalRollenUitPrincipal(req).includes("beheerder");
    // Kantoorbreed (?scope=alle) mag een beheerder én iemand met het granulaire Planning-recht — dat
    // is de planner. Een leidinggevende zónder dat recht houdt zijn eigen team (de filter hieronder).
    const magAlles = isBeheerder || (await magPlanningGebruiken(req).catch(() => false));
    const alle = (req.query && req.query.scope) === "alle" && magAlles;
    const naam = await mijnNaam(req, email);

    // Periode: standaard één maand (YYYY-MM), of — voor de jaarplanning-bezetting — een heel jaar
    // (?jaar=YYYY). In beide gevallen tellen we de werkdagen (ma-vr) in de periode en berekenen we
    // per medewerker de roosteruren = werkdagen × normPerDag × parttime-factor.
    const jaarParam = req.query && req.query.jaar ? Number(req.query.jaar) : null;
    const heelJaar = !!(jaarParam && jaarParam >= 2000 && jaarParam <= 2100);
    let jaar, mnd, eerste, laatste, werkdagen = 0, periodeLabel;
    const werkdagenPerMaand = Array.from({ length: 12 }, () => 0); // alleen gevuld bij ?jaar
    if (heelJaar) {
      jaar = jaarParam; mnd = null;
      eerste = `${jaar}-01-01`;
      laatste = `${jaar}-12-31`;
      for (let m = 0; m < 12; m++) {
        const dagen = new Date(Date.UTC(jaar, m + 1, 0)).getUTCDate();
        for (let d = 1; d <= dagen; d++) {
          const dow = new Date(Date.UTC(jaar, m, d)).getUTCDay();
          if (dow !== 0 && dow !== 6) { werkdagen++; werkdagenPerMaand[m]++; }
        }
      }
      periodeLabel = String(jaar);
    } else {
      const maand = (req.query && req.query.maand) || maandVanNu();
      [jaar, mnd] = maand.split("-").map(Number);
      if (!jaar || !mnd || mnd < 1 || mnd > 12) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef maand als YYYY-MM of jaar als YYYY mee." } };
        return;
      }
      const laatsteDag = new Date(Date.UTC(jaar, mnd, 0)).getUTCDate();
      eerste = `${jaar}-${pad(mnd)}-01`;
      laatste = `${jaar}-${pad(mnd)}-${pad(laatsteDag)}`;
      for (let d = 1; d <= laatsteDag; d++) {
        const dow = new Date(Date.UTC(jaar, mnd - 1, d)).getUTCDay();
        if (dow !== 0 && dow !== 6) werkdagen++;
      }
      periodeLabel = `${jaar}-${pad(mnd)}`;
    }
    const normPerDag = uren.WEEK_UREN_EIS / 5;

    // Medewerkers (uit de urentarieven), gescoped op leidinggevende tenzij beheerder + scope=alle.
    // Uitgesloten medewerkers (Beheer → Planning, bijv. secretaresses/loonadministratie) vallen weg.
    const mij = String(naam || "").trim().toLowerCase();
    const mijnEmail = String(email || "").trim().toLowerCase();
    const uitgesloten = new Set((await haalUitgeslotenMedewerkers().catch(() => [])).map((u) => String(u.email || "").toLowerCase()));
    const tarieven = (await uren.lijstTarieven())
      .filter((t) => t.actief !== false && (t.medewerker_email || t.medewerker_naam))
      .filter((t) => !uitgesloten.has(String(t.medewerker_email || "").toLowerCase()))
      // Team-scope (op leidinggevende), maar toon de INGELOGDE medewerker altijd — ook z'n eigen bezetting,
      // zodat je je eigen planning niet als "buiten rooster" ziet als je zelf geen teamlid van jezelf bent.
      .filter((t) => alle || (t.leidinggevende || "").trim().toLowerCase() === mij || String(t.medewerker_email || "").trim().toLowerCase() === mijnEmail);

    // Verlof: goedgekeurd (overlap met de maand) en aangevraagd (nog te beoordelen), per e-mail opgeteld.
    const [goedgekeurd, aangevraagd] = await Promise.all([
      verlof.goedgekeurdVerlof({ vanaf: eerste, tot: laatste }).catch(() => []),
      verlof.aanvragenVoorLeidinggevende({ leidinggevendeNaam: naam, alle }).catch(() => []),
    ]);
    const somPerEmail = (lijst, filter) => {
      const m = {};
      for (const a of lijst) {
        if (filter && !filter(a)) continue;
        const e = String(a.medewerkerEmail || "").toLowerCase();
        if (!e) continue;
        m[e] = (m[e] || 0) + (Number(a.aantalUren) || 0);
      }
      return m;
    };
    const overlaptMaand = (a) => (a.startdatum || "") <= laatste && (a.einddatum || "") >= eerste;
    const goedPerEmail = somPerEmail(goedgekeurd, overlaptMaand);
    const aangePerEmail = somPerEmail(aangevraagd, overlaptMaand);

    // Bij een jaar-opvraag: goedgekeurd verlof per maand per medewerker, voor de per-maand-bezetting.
    const verlofMaandPerEmail = {};
    if (heelJaar) {
      for (const a of goedgekeurd) {
        if (!overlaptMaand(a)) continue;
        const e = String(a.medewerkerEmail || "").toLowerCase();
        if (!e) continue;
        const verdeeld = verdeelVerlofOverMaanden(a, jaar);
        if (!verlofMaandPerEmail[e]) verlofMaandPerEmail[e] = Array.from({ length: 12 }, () => 0);
        for (let m = 0; m < 12; m++) verlofMaandPerEmail[e][m] += verdeeld[m];
      }
    }

    // Rooster-factor per medewerker (parallel).
    const factoren = await Promise.all(tarieven.map((t) =>
      verlof.berekenParttimeFactor(t.medewerker_email).catch(() => 1)
    ));

    // RESTEREND deel van de periode: vanaf vandaag (of vanaf het begin als de periode nog moet
    // beginnen) tot het einde. Hiermee kan een scherm "nog te doen werk" tegen "nog beschikbare uren"
    // zetten. Ligt de periode helemaal in het verleden, dan is het resterende deel 0.
    const vandaag = new Date().toISOString().slice(0, 10);
    const restVanaf = vandaag > eerste ? vandaag : eerste;
    const werkdagenResterend = werkdagenTussen(restVanaf, laatste);

    const rond = (n) => Math.round(n * 100) / 100;
    const medewerkers = tarieven.map((t, i) => {
      const e = String(t.medewerker_email || "").toLowerCase();
      const factor = factoren[i];
      const roosterUren = rond(werkdagen * normPerDag * factor);
      const roosterResterend = rond(werkdagenResterend * normPerDag * factor);
      // Goedgekeurd verlof dat in het RESTERENDE deel van de periode valt (naar rato van de
      // werkdagen). Alleen goedgekeurd — een nog niet goedgekeurde aanvraag telt bewust niet mee.
      const verlofResterend = rond(goedgekeurd
        .filter((a) => String(a.medewerkerEmail || "").toLowerCase() === e && overlaptMaand(a))
        .reduce((som, a) => som + verlofUrenInVenster(a, restVanaf, laatste), 0));
      // Declarabel-doel = het deel van de rooster-uren dat declarabel (direct) is; de rest is
      // indirecte tijd. Zelfde omrekening als de maandplanning (doelFactor): 80 → 0,8, of 0,8 → 0,8.
      const doel = t.declarabel_doel != null ? Number(t.declarabel_doel) : null;
      const doelFactor = doel == null ? 1 : (doel > 1 ? doel / 100 : doel);
      // Per-maand-uitsplitsing (alleen bij ?jaar): (rooster × declarabel-doel) − goedgekeurd verlof.
      // Zo tellen de indirecte uren NIET mee in "beschikbaar", net als in de maandplanning.
      let maanden = null;
      if (heelJaar) {
        const verlofM = verlofMaandPerEmail[e] || null;
        maanden = werkdagenPerMaand.map((wd, m) => {
          const roosterBruto = rond(wd * normPerDag * factor);
          const roosterDeclarabel = rond(roosterBruto * doelFactor);
          const ver = rond((verlofM && verlofM[m]) || 0);
          return { rooster: roosterBruto, roosterDeclarabel, verlof: ver, beschikbaar: rond(Math.max(0, roosterDeclarabel - ver)) };
        });
      }
      return {
        email: t.medewerker_email || "",
        id: t.medewerker_id || "", // systemuser-GUID: hierop koppelt de bezetting aan de toewijzing
        naam: t.medewerker_naam || t.medewerker_email || "",
        leidinggevende: t.leidinggevende || "",
        parttimeFactor: Math.round(factor * 1000) / 1000,
        roosterUren,
        declarabelDoel: t.declarabel_doel != null ? Number(t.declarabel_doel) : null,
        verlofGoedgekeurd: rond(goedPerEmail[e] || 0),
        verlofAangevraagd: rond(aangePerEmail[e] || 0),
        // Productiviteit: het declarabel-doel% van deze medewerker als factor (1 = niet ingesteld).
        declarabelFactor: Math.round(doelFactor * 1000) / 1000,
        // BRUTO beschikbaar = rooster − goedgekeurd verlof (alle uren, ook indirecte tijd).
        // NETTO beschikbaar = daarvan het productieve deel: × het declarabel-doel. Dít is het getal
        // waar je planwerk (indicatie-uren op klanten) tegenaan legt — de rest van de week gaat op
        // aan indirecte/kantoortijd. Verlof gaat er dus vóór de productiviteitscorrectie af.
        beschikbaarBruto: rond(Math.max(0, roosterUren - (goedPerEmail[e] || 0))),
        beschikbaar: rond(Math.max(0, roosterUren - (goedPerEmail[e] || 0)) * doelFactor),
        resterend: {
          werkdagen: werkdagenResterend,
          roosterUren: roosterResterend,
          verlof: verlofResterend,
          beschikbaarBruto: rond(Math.max(0, roosterResterend - verlofResterend)),
          beschikbaar: rond(Math.max(0, roosterResterend - verlofResterend) * doelFactor),
        },
        maanden,
      };
    }).sort((a, b) => String(a.naam).localeCompare(String(b.naam), "nl"));

    context.res = { headers: { "Content-Type": "application/json" }, body: { periode: periodeLabel, maand: heelJaar ? null : periodeLabel, jaar: heelJaar ? jaar : null, werkdagen, werkdagenResterend, vandaag, normPerDag, medewerkers } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de capaciteit niet berekenen.", detail: String(err.message || err) } };
  }
};

module.exports = async function (context, req) {
  if (!magPlanningLezen(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang tot de planning." } };
    return;
  }
  return verwerk(context, req);
};
