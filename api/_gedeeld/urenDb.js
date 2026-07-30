/**
 * Gedeelde datalaag voor de INTERNE urenregistratie (medewerkers-tijdschrijven).
 *
 * Hergebruikt de bestaande Azure SQL-pool van de facturatiemodule (facturatieDb.haalPool /
 * FACTURATIE_SQL_CONNECTIONSTRING) — dezelfde database, eigen tabellen mw_uren_* (zie
 * db/migrations/008_urenregistratie.sql). Bewust losgekoppeld van Dataverse en van de
 * klantgerichte "urenmodule" (dat is een product per cliënt); dit gaat over de uren die het
 * eigen kantoor schrijft.
 *
 * Alle bedrijfsregels (declarabel-afleiding, tarief-snapshot, controle, OHW/facturatie) staan
 * hier op één plek zodat de Functions dun blijven.
 */
const { sql, haalPool } = require("./facturatieDb");

// Welke soorten declarabel zijn (tellen mee voor OHW/facturatie en declarabel-%).
const SOORTEN = ["abonnement", "uxt", "indirect", "kantoor"];
const DECLARABELE_SOORTEN = new Set(["abonnement", "uxt"]);
const isDeclarabel = (soort) => DECLARABELE_SOORTEN.has(String(soort || "").toLowerCase());

const TARIEF_SOORTEN = ["normaal", "hoog", "laag"];

// ---------------------------------------------------------------------------
// Hulp: maandag van de week + 'YYYY-MM' van een datum (in Europe/Amsterdam-neutrale, pure
// datumrekenkunde op basis van de kale datumstring).
// ---------------------------------------------------------------------------
function maandagVan(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  const dag = d.getUTCDay(); // 0 = zo ... 6 = za
  const verschil = dag === 0 ? -6 : 1 - dag; // naar maandag
  d.setUTCDate(d.getUTCDate() + verschil);
  return d.toISOString().slice(0, 10);
}
function maandVan(datumStr) {
  return String(datumStr).slice(0, 7);
}

// ===========================================================================
// Tarieven
// ===========================================================================
async function haalTarief(email) {
  if (!email) return null;
  const pool = await haalPool();
  const r = await pool.request().input("email", sql.NVarChar(256), email)
    .query("SELECT * FROM dbo.mw_uren_tarieven WHERE medewerker_email = @email");
  return r.recordset[0] || null;
}

async function lijstTarieven() {
  const pool = await haalPool();
  const r = await pool.request().query("SELECT * FROM dbo.mw_uren_tarieven ORDER BY medewerker_naam, medewerker_email");
  return r.recordset;
}

/** Voegt een tarief-rij toe of werkt hem bij (MERGE op e-mail). */
async function zetTarief(email, velden, door) {
  const pool = await haalPool();
  await pool.request()
    .input("email", sql.NVarChar(256), email)
    .input("naam", sql.NVarChar(256), velden.naam ?? null)
    .input("normaal", sql.Decimal(9, 2), velden.tarief_normaal ?? null)
    .input("hoog", sql.Decimal(9, 2), velden.tarief_hoog ?? null)
    .input("laag", sql.Decimal(9, 2), velden.tarief_laag ?? null)
    .input("doel", sql.Decimal(5, 2), velden.declarabel_doel ?? null)
    .input("actief", sql.Bit, velden.actief == null ? 1 : (velden.actief ? 1 : 0))
    .input("door", sql.NVarChar(256), door ?? null)
    .query(`
      MERGE dbo.mw_uren_tarieven AS d
      USING (SELECT @email AS medewerker_email) AS s
      ON (d.medewerker_email = s.medewerker_email)
      WHEN MATCHED THEN UPDATE SET
        medewerker_naam = COALESCE(@naam, d.medewerker_naam),
        tarief_normaal = @normaal, tarief_hoog = @hoog, tarief_laag = @laag,
        declarabel_doel = @doel, actief = @actief,
        gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @door
      WHEN NOT MATCHED THEN INSERT
        (medewerker_email, medewerker_naam, tarief_normaal, tarief_hoog, tarief_laag, declarabel_doel, actief, gewijzigd_op, gewijzigd_door)
        VALUES (@email, @naam, @normaal, @hoog, @laag, @doel, @actief, SYSUTCDATETIME(), @door);
    `);
  return haalTarief(email);
}

// ===========================================================================
// Instellingen (herinneringsflow) — één rij (id = 1)
// ===========================================================================
async function haalInstellingen() {
  const pool = await haalPool();
  const r = await pool.request().query("SELECT * FROM dbo.mw_uren_instellingen WHERE id = 1");
  return r.recordset[0] || { id: 1, herinnering_actief: false, herinnering_weekdag: 5, herinnering_minuren: 40, herinnering_webhook: null, herinnering_tekst: null, laatste_run: null };
}

async function zetInstellingen(velden) {
  const pool = await haalPool();
  await pool.request()
    .input("actief", sql.Bit, velden.herinnering_actief ? 1 : 0)
    .input("weekdag", sql.TinyInt, velden.herinnering_weekdag ?? 5)
    .input("minuren", sql.Decimal(6, 2), velden.herinnering_minuren ?? 40)
    .input("webhook", sql.NVarChar(1000), velden.herinnering_webhook ?? null)
    .input("tekst", sql.NVarChar(sql.MAX), velden.herinnering_tekst ?? null)
    .query(`
      UPDATE dbo.mw_uren_instellingen
      SET herinnering_actief = @actief, herinnering_weekdag = @weekdag, herinnering_minuren = @minuren,
          herinnering_webhook = @webhook, herinnering_tekst = @tekst
      WHERE id = 1;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.mw_uren_instellingen (id, herinnering_actief, herinnering_weekdag, herinnering_minuren, herinnering_webhook, herinnering_tekst)
        VALUES (1, @actief, @weekdag, @minuren, @webhook, @tekst);
    `);
  return haalInstellingen();
}

// ===========================================================================
// Klant-meta uit Dynamics (cliëntnaam + manager) — voor de snapshot bij het boeken.
// In-memory gecachet per Function-instance (managers wisselen zelden).
// ===========================================================================
const klantMetaCache = new Map(); // accountId -> { klantnaam, managerNaam }
// De manager-lookup op Account (schemanaam), zelfde default als in identiteit.js.
const MANAGER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";

async function haalKlantMeta(resource, token, accountId) {
  if (!accountId) return { klantnaam: "", managerNaam: "" };
  if (klantMetaCache.has(accountId)) return klantMetaCache.get(accountId);
  let meta = { klantnaam: "", managerNaam: "" };
  try {
    const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=name&$expand=${MANAGER_NAV}($select=fullname)`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (res.ok) {
      const d = await res.json();
      meta = { klantnaam: d.name || "", managerNaam: (d[MANAGER_NAV] && d[MANAGER_NAV].fullname) || "" };
      klantMetaCache.set(accountId, meta);
    }
  } catch { /* best effort */ }
  return meta;
}

// ===========================================================================
// Boekingen — medewerker (eigen uren)
// ===========================================================================
function rijNaarBuiten(r) {
  return {
    id: r.id,
    medewerkerEmail: r.medewerker_email,
    medewerkerNaam: r.medewerker_naam || "",
    datum: r.datum instanceof Date ? r.datum.toISOString().slice(0, 10) : String(r.datum).slice(0, 10),
    weekStart: r.week_start instanceof Date ? r.week_start.toISOString().slice(0, 10) : String(r.week_start).slice(0, 10),
    maand: r.maand,
    soort: r.soort,
    declarabel: !!r.declarabel,
    accountId: r.account_id || "",
    klantnaam: r.klant_naam || "",
    managerNaam: r.manager_naam || "",
    omschrijving: r.omschrijving || "",
    uren: r.uren == null ? 0 : Number(r.uren),
    tariefSoort: r.tarief_soort || "",
    tariefBedrag: r.tarief_bedrag == null ? null : Number(r.tarief_bedrag),
    status: r.status,
    goedgekeurdeUren: r.goedgekeurde_uren == null ? null : Number(r.goedgekeurde_uren),
    afboekUren: r.afboek_uren == null ? null : Number(r.afboek_uren),
    afboekReden: r.afboek_reden || "",
    extraBedrag: r.extra_bedrag == null ? null : Number(r.extra_bedrag),
    extraReden: r.extra_reden || "",
    gecontroleerdDoor: r.gecontroleerd_door || "",
    gecontroleerdOp: r.gecontroleerd_op || null,
    gefactureerd: !!r.gefactureerd,
    factuurRef: r.factuur_ref || "",
    gefactureerdOp: r.gefactureerd_op || null,
  };
}

async function boekingenVanMedewerker(email, { vanaf, tot } = {}) {
  const pool = await haalPool();
  const req = pool.request().input("email", sql.NVarChar(256), email);
  let where = "medewerker_email = @email";
  if (vanaf) { req.input("vanaf", sql.Date, vanaf); where += " AND datum >= @vanaf"; }
  if (tot) { req.input("tot", sql.Date, tot); where += " AND datum <= @tot"; }
  const r = await req.query(`SELECT * FROM dbo.mw_uren_boekingen WHERE ${where} ORDER BY datum DESC, aangemaakt_op DESC`);
  return r.recordset.map(rijNaarBuiten);
}

/**
 * Maakt een boeking. Leidt declarabel af uit soort, snapshot het uurtarief uit de medewerker-
 * tarieventabel (alleen bij declarabele soorten) en de cliënt-meta (naam + manager) uit Dynamics.
 */
async function maakBoeking({ email, naam, datum, soort, accountId, omschrijving, uren, tariefSoort }, klantMeta) {
  const pool = await haalPool();
  const decl = isDeclarabel(soort);
  let tariefBedrag = null;
  let gekozenTariefSoort = null;
  if (decl) {
    gekozenTariefSoort = TARIEF_SOORTEN.includes(tariefSoort) ? tariefSoort : "normaal";
    const tarief = await haalTarief(email);
    if (tarief) {
      const kol = { normaal: "tarief_normaal", hoog: "tarief_hoog", laag: "tarief_laag" }[gekozenTariefSoort];
      tariefBedrag = tarief[kol] == null ? null : Number(tarief[kol]);
    }
  }
  const r = await pool.request()
    .input("email", sql.NVarChar(256), email)
    .input("naam", sql.NVarChar(256), naam ?? null)
    .input("datum", sql.Date, datum)
    .input("week", sql.Date, maandagVan(datum))
    .input("maand", sql.Char(7), maandVan(datum))
    .input("soort", sql.NVarChar(20), soort)
    .input("decl", sql.Bit, decl ? 1 : 0)
    .input("account", sql.NVarChar(60), decl ? (accountId || null) : null)
    .input("klant", sql.NVarChar(256), decl ? (klantMeta?.klantnaam || null) : null)
    .input("manager", sql.NVarChar(256), decl ? (klantMeta?.managerNaam || null) : null)
    .input("oms", sql.NVarChar(1000), omschrijving ?? null)
    .input("uren", sql.Decimal(6, 2), uren)
    .input("tsoort", sql.NVarChar(10), gekozenTariefSoort)
    .input("tbedrag", sql.Decimal(9, 2), tariefBedrag)
    .query(`
      INSERT INTO dbo.mw_uren_boekingen
        (medewerker_email, medewerker_naam, datum, week_start, maand, soort, declarabel,
         account_id, klant_naam, manager_naam, omschrijving, uren, tarief_soort, tarief_bedrag)
      OUTPUT INSERTED.*
      VALUES (@email, @naam, @datum, @week, @maand, @soort, @decl,
              @account, @klant, @manager, @oms, @uren, @tsoort, @tbedrag);
    `);
  return rijNaarBuiten(r.recordset[0]);
}

/** Werkt een EIGEN, nog niet gecontroleerde boeking bij (uren, omschrijving, tariefSoort). */
async function werkBoekingBij(id, email, velden, klantMeta) {
  const pool = await haalPool();
  const huidig = await pool.request().input("id", sql.UniqueIdentifier, id).input("email", sql.NVarChar(256), email)
    .query("SELECT * FROM dbo.mw_uren_boekingen WHERE id = @id AND medewerker_email = @email");
  const rij = huidig.recordset[0];
  if (!rij) return { fout: "NIET_GEVONDEN" };
  if (rij.status !== "open") return { fout: "AL_GECONTROLEERD" };

  const nieuwSoort = velden.soort ?? rij.soort;
  const decl = isDeclarabel(nieuwSoort);
  const nieuwDatum = velden.datum ?? (rij.datum instanceof Date ? rij.datum.toISOString().slice(0, 10) : String(rij.datum).slice(0, 10));
  let tariefSoort = rij.tarief_soort;
  let tariefBedrag = rij.tarief_bedrag;
  if (decl) {
    tariefSoort = TARIEF_SOORTEN.includes(velden.tariefSoort) ? velden.tariefSoort : (rij.tarief_soort || "normaal");
    const tarief = await haalTarief(email);
    const kol = { normaal: "tarief_normaal", hoog: "tarief_hoog", laag: "tarief_laag" }[tariefSoort];
    tariefBedrag = tarief && tarief[kol] != null ? Number(tarief[kol]) : null;
  } else {
    tariefSoort = null; tariefBedrag = null;
  }

  const r = await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("datum", sql.Date, nieuwDatum)
    .input("week", sql.Date, maandagVan(nieuwDatum))
    .input("maand", sql.Char(7), maandVan(nieuwDatum))
    .input("soort", sql.NVarChar(20), nieuwSoort)
    .input("decl", sql.Bit, decl ? 1 : 0)
    .input("account", sql.NVarChar(60), decl ? (velden.accountId ?? rij.account_id ?? null) : null)
    .input("klant", sql.NVarChar(256), decl ? (klantMeta ? klantMeta.klantnaam : rij.klant_naam) : null)
    .input("manager", sql.NVarChar(256), decl ? (klantMeta ? klantMeta.managerNaam : rij.manager_naam) : null)
    .input("oms", sql.NVarChar(1000), velden.omschrijving ?? rij.omschrijving)
    .input("uren", sql.Decimal(6, 2), velden.uren ?? rij.uren)
    .input("tsoort", sql.NVarChar(10), tariefSoort)
    .input("tbedrag", sql.Decimal(9, 2), tariefBedrag)
    .query(`
      UPDATE dbo.mw_uren_boekingen SET
        datum=@datum, week_start=@week, maand=@maand, soort=@soort, declarabel=@decl,
        account_id=@account, klant_naam=@klant, manager_naam=@manager,
        omschrijving=@oms, uren=@uren, tarief_soort=@tsoort, tarief_bedrag=@tbedrag,
        gewijzigd_op=SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id=@id;
    `);
  return { boeking: rijNaarBuiten(r.recordset[0]) };
}

async function verwijderBoeking(id, email) {
  const pool = await haalPool();
  const r = await pool.request().input("id", sql.UniqueIdentifier, id).input("email", sql.NVarChar(256), email)
    .query("DELETE FROM dbo.mw_uren_boekingen WHERE id=@id AND medewerker_email=@email AND status='open'");
  return r.rowsAffected[0] > 0;
}

// ===========================================================================
// Controle (manager) — boekingen per maand, gescoped op manager of alles (beheerder)
// ===========================================================================
async function boekingenVoorControle({ maand, managerNaam, alle }) {
  const pool = await haalPool();
  const req = pool.request().input("maand", sql.Char(7), maand);
  // Alleen declarabele boekingen op cliënten zijn te controleren/factureren.
  let where = "maand = @maand AND declarabel = 1 AND account_id IS NOT NULL";
  if (!alle) { req.input("mgr", sql.NVarChar(256), managerNaam || " "); where += " AND manager_naam = @mgr"; }
  const r = await req.query(`SELECT * FROM dbo.mw_uren_boekingen WHERE ${where} ORDER BY klant_naam, medewerker_naam, datum`);
  return r.recordset.map(rijNaarBuiten);
}

/** Eén controle-actie op een boeking: goedkeuren / afboeken / opboeken (extra factureren). */
async function controleActie(id, { goedgekeurdeUren, afboekUren, afboekReden, extraBedrag, extraReden }, door) {
  const pool = await haalPool();
  const r = await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("gk", sql.Decimal(6, 2), goedgekeurdeUren ?? null)
    .input("afu", sql.Decimal(6, 2), afboekUren ?? null)
    .input("afr", sql.NVarChar(500), afboekReden ?? null)
    .input("eb", sql.Decimal(9, 2), extraBedrag ?? null)
    .input("er", sql.NVarChar(500), extraReden ?? null)
    .input("door", sql.NVarChar(256), door ?? null)
    .query(`
      UPDATE dbo.mw_uren_boekingen SET
        goedgekeurde_uren=@gk, afboek_uren=@afu, afboek_reden=@afr,
        extra_bedrag=@eb, extra_reden=@er,
        status = CASE WHEN gefactureerd = 1 THEN status ELSE 'goedgekeurd' END,
        gecontroleerd_door=@door, gecontroleerd_op=SYSUTCDATETIME(), gewijzigd_op=SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id=@id AND declarabel=1;
    `);
  return r.recordset[0] ? rijNaarBuiten(r.recordset[0]) : null;
}

// ===========================================================================
// OHW / facturatie
// ===========================================================================
/** Waarde van een boeking = erkende uren × uurtarief + eventueel extra opgeboekt bedrag. */
function boekingWaarde(b) {
  const urenTeFactureren = b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren;
  const uurdeel = (b.tariefBedrag || 0) * (urenTeFactureren || 0);
  return uurdeel + (b.extraBedrag || 0);
}

/**
 * OHW-/facturatiepositie: alle declarabele boekingen die nog niet gefactureerd zijn, gesplitst
 * per soort (uxt vs abonnement) en per cliënt, plus de reeds gefactureerde ter controle.
 */
async function ohwEnFacturatie({ maand, managerNaam, alle }) {
  const pool = await haalPool();
  const req = pool.request();
  let where = "declarabel = 1 AND account_id IS NOT NULL";
  if (maand) { req.input("maand", sql.Char(7), maand); where += " AND maand = @maand"; }
  if (!alle) { req.input("mgr", sql.NVarChar(256), managerNaam || " "); where += " AND manager_naam = @mgr"; }
  const r = await req.query(`SELECT * FROM dbo.mw_uren_boekingen WHERE ${where} ORDER BY klant_naam, soort, datum`);
  const boekingen = r.recordset.map(rijNaarBuiten);

  const perKlant = new Map();
  const totaal = { uxt: { uren: 0, waarde: 0 }, abonnement: { uren: 0, waarde: 0 }, gefactureerd: 0, teFactureren: 0 };
  for (const b of boekingen) {
    const key = b.accountId || b.klantnaam || "?";
    if (!perKlant.has(key)) perKlant.set(key, { accountId: b.accountId, klantnaam: b.klantnaam, managerNaam: b.managerNaam, uxt: { uren: 0, waarde: 0 }, abonnement: { uren: 0, waarde: 0 }, teFactureren: 0, gefactureerd: 0, boekingen: [] });
    const k = perKlant.get(key);
    const w = boekingWaarde(b);
    const urenErkend = b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren;
    const bak = b.soort === "uxt" ? "uxt" : "abonnement";
    k[bak].uren += urenErkend; k[bak].waarde += w;
    totaal[bak].uren += urenErkend; totaal[bak].waarde += w;
    if (b.gefactureerd) { k.gefactureerd += w; totaal.gefactureerd += w; }
    else { k.teFactureren += w; totaal.teFactureren += w; }
    k.boekingen.push(b);
  }
  return { totaal, klanten: [...perKlant.values()] };
}

async function markeerGefactureerd(ids, factuurRef, door) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const pool = await haalPool();
  const req = pool.request().input("ref", sql.NVarChar(200), factuurRef ?? null).input("door", sql.NVarChar(256), door ?? null);
  const params = ids.map((id, i) => { req.input("id" + i, sql.UniqueIdentifier, id); return "@id" + i; });
  const r = await req.query(`
    UPDATE dbo.mw_uren_boekingen SET
      gefactureerd = 1, status = 'gefactureerd', factuur_ref = @ref,
      gefactureerd_op = SYSUTCDATETIME(), gefactureerd_door = @door, gewijzigd_op = SYSUTCDATETIME()
    WHERE declarabel = 1 AND id IN (${params.join(",")});
  `);
  return r.rowsAffected[0];
}

// ===========================================================================
// Rapportage — declarabel% per medewerker + indirect/kantoor, binnen een periode.
// ===========================================================================
async function rapportageDeclarabel({ vanaf, tot }) {
  const pool = await haalPool();
  const req = pool.request();
  let where = "1=1";
  if (vanaf) { req.input("vanaf", sql.Date, vanaf); where += " AND datum >= @vanaf"; }
  if (tot) { req.input("tot", sql.Date, tot); where += " AND datum <= @tot"; }
  const r = await req.query(`
    SELECT medewerker_email, MAX(medewerker_naam) AS naam,
      SUM(uren) AS totaal,
      SUM(CASE WHEN declarabel = 1 THEN uren ELSE 0 END) AS declarabel_uren,
      SUM(CASE WHEN soort = 'abonnement' THEN uren ELSE 0 END) AS abonnement,
      SUM(CASE WHEN soort = 'uxt' THEN uren ELSE 0 END) AS uxt,
      SUM(CASE WHEN soort = 'indirect' THEN uren ELSE 0 END) AS indirect,
      SUM(CASE WHEN soort = 'kantoor' THEN uren ELSE 0 END) AS kantoor
    FROM dbo.mw_uren_boekingen
    WHERE ${where}
    GROUP BY medewerker_email
    ORDER BY naam;
  `);
  const tarieven = await lijstTarieven();
  const doelVan = new Map(tarieven.map((t) => [t.medewerker_email, t.declarabel_doel]));
  return r.recordset.map((x) => {
    const totaal = Number(x.totaal) || 0;
    const decl = Number(x.declarabel_uren) || 0;
    return {
      email: x.medewerker_email, naam: x.naam || x.medewerker_email,
      totaal, declarabelUren: decl,
      declarabelPct: totaal ? Math.round((decl / totaal) * 1000) / 10 : 0,
      doel: doelVan.get(x.medewerker_email) == null ? null : Number(doelVan.get(x.medewerker_email)),
      abonnement: Number(x.abonnement) || 0, uxt: Number(x.uxt) || 0,
      indirect: Number(x.indirect) || 0, kantoor: Number(x.kantoor) || 0,
    };
  });
}

/** Medewerkers met te weinig geschreven uren in de opgegeven week (voor de herinneringsflow). */
async function medewerkersOnderMinuren(weekStart, minuren) {
  const pool = await haalPool();
  const r = await pool.request()
    .input("week", sql.Date, weekStart)
    .input("min", sql.Decimal(6, 2), minuren)
    .query(`
      SELECT t.medewerker_email AS email, t.medewerker_naam AS naam,
             COALESCE(b.geschreven, 0) AS geschreven
      FROM dbo.mw_uren_tarieven t
      LEFT JOIN (
        SELECT medewerker_email, SUM(uren) AS geschreven
        FROM dbo.mw_uren_boekingen WHERE week_start = @week GROUP BY medewerker_email
      ) b ON b.medewerker_email = t.medewerker_email
      WHERE t.actief = 1 AND COALESCE(b.geschreven, 0) < @min
      ORDER BY t.medewerker_naam;
    `);
  return r.recordset.map((x) => ({ email: x.email, naam: x.naam || x.email, geschreven: Number(x.geschreven) || 0 }));
}

async function zetLaatsteRun() {
  const pool = await haalPool();
  await pool.request().query("UPDATE dbo.mw_uren_instellingen SET laatste_run = SYSUTCDATETIME() WHERE id = 1");
}

module.exports = {
  SOORTEN, DECLARABELE_SOORTEN, isDeclarabel, TARIEF_SOORTEN, maandagVan, maandVan, boekingWaarde,
  haalTarief, lijstTarieven, zetTarief,
  haalInstellingen, zetInstellingen,
  haalKlantMeta,
  boekingenVanMedewerker, maakBoeking, werkBoekingBij, verwijderBoeking,
  boekingenVoorControle, controleActie,
  ohwEnFacturatie, markeerGefactureerd,
  rapportageDeclarabel, medewerkersOnderMinuren, zetLaatsteRun,
};
