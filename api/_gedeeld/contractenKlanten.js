/**
 * CRUD voor dbo.contracten_klanten: de zelf geregistreerde doorlopende contracten van een
 * portaalklant (Contractenmodule) — verzekeringen, telefonie/internet, software, overig.
 *
 * BEWUST GEEN verwijderfunctie hier — besluit §5.7 van het contractmanagement-plan staat
 * verwijderen door de klant niet toe (audit-overweging); alleen toevoegen en aanpassen. Een
 * eventuele "archiveren"-optie is een latere, aparte afweging (nog niet gebouwd).
 *
 * GELDIGE_TYPES is de "vaste lijst" uit besluit §5.2 — bewust hier als JS-array i.p.v. een DB
 * CHECK-constraint, zodat Wouter de lijst later kan bijstellen zonder migratie. Pas deze lijst
 * aan zodra de definitieve typen zijn doorgegeven.
 */
const { sql, haalPool } = require("./facturatieDb");

const GELDIGE_TYPES = ["verzekering", "telefonie", "internet", "software", "lease", "overig"];
const GELDIGE_FREQUENTIES = ["maandelijks", "kwartaal", "jaarlijks", "eenmalig"];

function naarBuiten(row) {
  return {
    id: row.id,
    type: row.type,
    naam: row.naam,
    leverancier: row.leverancier || "",
    contractnummer: row.contractnummer || "",
    ingangsdatum: row.ingangsdatum,
    einddatum: row.einddatum,
    opzegtermijnDagen: row.opzegtermijn_dagen != null ? Number(row.opzegtermijn_dagen) : null,
    automatischeVerlenging: !!row.automatische_verlenging,
    frequentie: row.frequentie || "",
    bedrag: row.bedrag != null ? Number(row.bedrag) : null,
    opmerkingen: row.opmerkingen || "",
    laatsteReminderDagen: row.laatste_reminder_dagen != null ? Number(row.laatste_reminder_dagen) : null,
    laatsteReminderVerzondenOp: row.laatste_reminder_verzonden_op || null,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

function valideerType(waarde) {
  const v = String(waarde || "").trim();
  if (!GELDIGE_TYPES.includes(v)) {
    throw new Error(`VALIDATIE: type moet een van de volgende zijn: ${GELDIGE_TYPES.join(", ")}.`);
  }
  return v;
}

function valideerFrequentie(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const v = String(waarde);
  if (!GELDIGE_FREQUENTIES.includes(v)) {
    throw new Error(`VALIDATIE: frequentie moet een van de volgende zijn: ${GELDIGE_FREQUENTIES.join(", ")} (of leeg).`);
  }
  return v;
}

function valideerDatum(waarde, veldnaam) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const d = new Date(waarde);
  if (isNaN(d.getTime())) throw new Error(`VALIDATIE: ${veldnaam} is geen geldige datum.`);
  return d;
}

async function haalContracten(klantAccountId, { type = "", verlooptVoor = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (type) {
    request.input("type", sql.NVarChar(50), type);
    where += " AND type = @type";
  }
  if (verlooptVoor) {
    request.input("verlooptVoor", sql.Date, new Date(verlooptVoor));
    where += " AND einddatum IS NOT NULL AND einddatum <= @verlooptVoor";
  }
  const result = await request.query(
    `SELECT * FROM dbo.contracten_klanten WHERE ${where} ORDER BY (einddatum IS NULL), einddatum ASC, aangemaakt_op DESC`
  );
  return result.recordset.map(naarBuiten);
}

function naarBuitenMetAccount(row) {
  return { ...naarBuiten(row), klantAccountId: row.klant_account_id };
}

/**
 * Alle contracten (over ALLE klantaccounts heen) met een einddatum die nog niet verstreken is —
 * voor de dagelijkse verloopherinneringen-job (Stap 5, zie api/_gedeeld/contractenReminders.js
 * en api/contracten-reminders). Bewust geen klantAccountId-filter (dit is geen klant-gerichte
 * aanroep) en bewust alleen nog-niet-verlopen contracten (een reeds verlopen contract heeft
 * niets meer aan een "verloopt binnenkort"-herinnering).
 */
async function haalTeControlererenVoorReminders() {
  const pool = await haalPool();
  const result = await pool.request().query(
    "SELECT * FROM dbo.contracten_klanten WHERE einddatum IS NOT NULL AND einddatum >= CAST(SYSUTCDATETIME() AS DATE) ORDER BY einddatum ASC"
  );
  return result.recordset.map(naarBuitenMetAccount);
}

/** Legt vast dat er zojuist een herinnering is verstuurd voor deze drempel (dagenVoorEinddatum),
 * zodat dezelfde of een grotere drempel niet nogmaals verstuurd wordt (zie contractenReminders.js). */
async function markeerReminderVerzonden(id, dagenVoorEinddatum) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("dagen", sql.Int, dagenVoorEinddatum);
  await request.query(
    "UPDATE dbo.contracten_klanten SET laatste_reminder_dagen = @dagen, laatste_reminder_verzonden_op = SYSUTCDATETIME() WHERE id = @id"
  );
}

async function haalContract(klantAccountId, id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.contracten_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakContract(klantAccountId, data, email) {
  if (!data) throw new Error("VALIDATIE: geen gegevens meegegeven.");
  if (!String(data.naam || "").trim()) throw new Error("VALIDATIE: naam is verplicht.");

  const type = valideerType(data.type);
  const frequentie = valideerFrequentie(data.frequentie);
  const ingangsdatum = valideerDatum(data.ingangsdatum, "ingangsdatum");
  const einddatum = valideerDatum(data.einddatum, "einddatum");
  if (ingangsdatum && einddatum && einddatum < ingangsdatum) {
    throw new Error("VALIDATIE: einddatum kan niet vóór de ingangsdatum liggen.");
  }

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("type", sql.NVarChar(50), type);
  request.input("naam", sql.NVarChar(200), String(data.naam).trim().slice(0, 200));
  request.input("leverancier", sql.NVarChar(200), data.leverancier ? String(data.leverancier).trim().slice(0, 200) : null);
  request.input("contractnummer", sql.NVarChar(100), data.contractnummer ? String(data.contractnummer).trim().slice(0, 100) : null);
  request.input("ingangsdatum", sql.Date, ingangsdatum);
  request.input("einddatum", sql.Date, einddatum);
  request.input("opzegtermijnDagen", sql.Int, data.opzegtermijnDagen != null && data.opzegtermijnDagen !== "" ? Number(data.opzegtermijnDagen) : null);
  request.input("automatischeVerlenging", sql.Bit, data.automatischeVerlenging === false ? 0 : 1);
  request.input("frequentie", sql.VarChar(12), frequentie);
  request.input("bedrag", sql.Decimal(12, 2), data.bedrag != null && data.bedrag !== "" ? Number(data.bedrag) : null);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen ? String(data.opmerkingen) : null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.contracten_klanten
      (klant_account_id, type, naam, leverancier, contractnummer, ingangsdatum, einddatum,
       opzegtermijn_dagen, automatische_verlenging, frequentie, bedrag, opmerkingen, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @type, @naam, @leverancier, @contractnummer, @ingangsdatum, @einddatum,
       @opzegtermijnDagen, @automatischeVerlenging, @frequentie, @bedrag, @opmerkingen, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/** Aanpassen — bewust geen verwijderen (zie bestandskop). Alleen meegegeven velden wijzigen;
 * de rest blijft staan zoals het was (zelfde partial-update-stijl als wijzigRit). */
async function wijzigContract(klantAccountId, id, data, email) {
  const bestaand = await haalContract(klantAccountId, id);
  if (!bestaand) return null;

  const type = data.type !== undefined ? valideerType(data.type) : bestaand.type;
  const frequentie = data.frequentie !== undefined ? valideerFrequentie(data.frequentie) : (bestaand.frequentie || null);
  const ingangsdatum = data.ingangsdatum !== undefined ? valideerDatum(data.ingangsdatum, "ingangsdatum") : (bestaand.ingangsdatum ? new Date(bestaand.ingangsdatum) : null);
  const einddatum = data.einddatum !== undefined ? valideerDatum(data.einddatum, "einddatum") : (bestaand.einddatum ? new Date(bestaand.einddatum) : null);
  if (ingangsdatum && einddatum && einddatum < ingangsdatum) {
    throw new Error("VALIDATIE: einddatum kan niet vóór de ingangsdatum liggen.");
  }
  const naam = data.naam !== undefined ? String(data.naam).trim() : bestaand.naam;
  if (!naam) throw new Error("VALIDATIE: naam is verplicht.");

  // Verandert de einddatum, dan is een eerder verstuurde reminder niet meer betrouwbaar
  // gekoppeld aan de (nieuwe) verloopdatum — reset 'm, zodat Stap 5 opnieuw kan beoordelen of
  // er een herinnering nodig is.
  const einddatumGewijzigd = data.einddatum !== undefined && String(data.einddatum || "") !== String(bestaand.einddatum || "");

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("type", sql.NVarChar(50), type);
  request.input("naam", sql.NVarChar(200), naam.slice(0, 200));
  request.input("leverancier", sql.NVarChar(200), (data.leverancier !== undefined ? data.leverancier : bestaand.leverancier) ? String(data.leverancier !== undefined ? data.leverancier : bestaand.leverancier).trim().slice(0, 200) : null);
  request.input("contractnummer", sql.NVarChar(100), (data.contractnummer !== undefined ? data.contractnummer : bestaand.contractnummer) ? String(data.contractnummer !== undefined ? data.contractnummer : bestaand.contractnummer).trim().slice(0, 100) : null);
  request.input("ingangsdatum", sql.Date, ingangsdatum);
  request.input("einddatum", sql.Date, einddatum);
  request.input("opzegtermijnDagen", sql.Int, data.opzegtermijnDagen !== undefined ? (data.opzegtermijnDagen != null && data.opzegtermijnDagen !== "" ? Number(data.opzegtermijnDagen) : null) : bestaand.opzegtermijnDagen);
  request.input("automatischeVerlenging", sql.Bit, data.automatischeVerlenging !== undefined ? (data.automatischeVerlenging ? 1 : 0) : (bestaand.automatischeVerlenging ? 1 : 0));
  request.input("frequentie", sql.VarChar(12), frequentie);
  request.input("bedrag", sql.Decimal(12, 2), data.bedrag !== undefined ? (data.bedrag != null && data.bedrag !== "" ? Number(data.bedrag) : null) : bestaand.bedrag);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), (data.opmerkingen !== undefined ? data.opmerkingen : bestaand.opmerkingen) || null);
  request.input("email", sql.NVarChar(320), email || null);
  request.input("resetReminderDagen", sql.Int, einddatumGewijzigd ? null : bestaand.laatsteReminderDagen);
  request.input("resetReminderOp", sql.DateTime2, einddatumGewijzigd ? null : bestaand.laatsteReminderVerzondenOp);
  const result = await request.query(`
    UPDATE dbo.contracten_klanten SET
      type = @type, naam = @naam, leverancier = @leverancier, contractnummer = @contractnummer,
      ingangsdatum = @ingangsdatum, einddatum = @einddatum, opzegtermijn_dagen = @opzegtermijnDagen,
      automatische_verlenging = @automatischeVerlenging, frequentie = @frequentie, bedrag = @bedrag,
      opmerkingen = @opmerkingen, laatste_reminder_dagen = @resetReminderDagen,
      laatste_reminder_verzonden_op = @resetReminderOp,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

module.exports = {
  GELDIGE_TYPES,
  GELDIGE_FREQUENTIES,
  haalContracten,
  haalContract,
  maakContract,
  wijzigContract,
  haalTeControlererenVoorReminders,
  markeerReminderVerzonden,
};
