/**
 * CRUD voor dbo.planning_klanten: de simpele, interne planning per klant (medewerkerskant) —
 * Planningsmodule Stap 2. Elke rij is één geplande activiteit voor één klant.
 *
 * In tegenstelling tot de contracten-/facturatie-datalaag is dit BEWUST medewerker-breed: de
 * planning is een intern hulpmiddel (geen per-klant aan/uit-schakelaar, geen klant-scoping). De
 * toegang loopt via het medewerkersrecht magPlanning (api/_gedeeld/planningRecht.js); de
 * klant-account-id wordt door de UI meegegeven (voor welke klant de regel is). Verwijderen mag hier
 * wél — dit is interne werkdata, geen door de klant zelf ingevoerde audit-gevoelige informatie.
 *
 * "Uren" is een INDICATIE van de werkzaamheden (inschatting werklast) die aan een regel wordt
 * meegegeven — géén echte urenregistratie (die zit in de aparte urenmodule). Vandaar indicatie_uren.
 *
 * Activiteit en status worden gevalideerd tegen de in Beheer bewerkbare lijsten
 * (api/_gedeeld/planningInstellingen.js). Type is "maand" of "jaar".
 */
const { sql, haalPool } = require("./facturatieDb");
const { magActiviteit, magStatus, maakSleutel } = require("./planningInstellingen");

function naarBuiten(row) {
  return {
    id: row.id,
    // .toLowerCase(): SQL Server geeft een UNIQUEIDENTIFIER in hoofdletters terug, terwijl
    // Dynamics/Dataverse GUID's (accountId uit /api/beheer-klanten) kleine letters gebruiken — een
    // kale object-key-lookup in de UI (klanten[r.klantAccountId]) matcht anders nooit. Zelfde
    // normalisatie als naarBuitenMetAccount in contractenKlanten.js.
    klantAccountId: String(row.klant_account_id || "").toLowerCase(),
    activiteit: row.activiteit || "",
    type: row.type || "maand",
    periode: row.periode || "",
    deadline: row.deadline,
    status: row.status || "",
    toegewezenAan: row.toegewezen_aan || "",
    indicatieUren: row.indicatie_uren != null ? Number(row.indicatie_uren) : null,
    opmerkingen: row.opmerkingen || "",
    aangemaaktOp: row.aangemaakt_op,
    aangemaaktDoor: row.aangemaakt_door || "",
    gewijzigdOp: row.gewijzigd_op,
    gewijzigdDoor: row.gewijzigd_door || "",
  };
}

function valideerType(waarde) {
  const v = String(waarde || "maand").trim().toLowerCase();
  return v === "jaar" ? "jaar" : "maand";
}

function valideerDatum(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const d = new Date(waarde);
  if (isNaN(d.getTime())) throw new Error("VALIDATIE: ongeldige datum voor deadline.");
  return d;
}

function valideerUren(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = Number(waarde);
  if (isNaN(n) || n < 0) throw new Error("VALIDATIE: indicatie-uren moet een getal ≥ 0 zijn.");
  return Math.round(n * 100) / 100;
}

async function valideerActiviteit(waarde) {
  const v = String(waarde || "").trim();
  if (!v) throw new Error("VALIDATIE: activiteit is verplicht.");
  if (!(await magActiviteit(v))) {
    throw new Error(`VALIDATIE: onbekende activiteit ('${v}'). Ga naar Beheer → Planning om activiteiten te beheren.`);
  }
  return maakSleutel(v) || v;
}

async function valideerStatus(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const v = String(waarde).trim();
  if (!(await magStatus(v))) {
    throw new Error(`VALIDATIE: onbekende status ('${v}'). Ga naar Beheer → Planning om statussen te beheren.`);
  }
  return maakSleutel(v) || v;
}

/** Alle planningsregels over ALLE klantaccounts heen — voor het medewerkersoverzicht. */
async function haalAlleVoorOverzicht() {
  const pool = await haalPool();
  const result = await pool.request().query(
    // Zelfde T-SQL-kanttekening als contractenKlanten.js: CASE WHEN i.p.v. een los IS NULL-predicaat.
    "SELECT * FROM dbo.planning_klanten ORDER BY CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline ASC, aangemaakt_op DESC"
  );
  return result.recordset.map(naarBuiten);
}

/** De planningsregels van één klantaccount. */
async function haalVoorKlant(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query(
    "SELECT * FROM dbo.planning_klanten WHERE klant_account_id = @klantAccountId ORDER BY CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline ASC, aangemaakt_op DESC"
  );
  return result.recordset.map(naarBuiten);
}

/** Idem voor de losse planningsregels: { "<activiteit-sleutel>": aantal }. */
async function telGebruikPerActiviteit() {
  const pool = await haalPool();
  const result = await pool.request().query(
    "SELECT activiteit, COUNT(*) AS aantal FROM dbo.planning_klanten GROUP BY activiteit"
  );
  const uit = {};
  for (const r of result.recordset) uit[String(r.activiteit || "")] = Number(r.aantal) || 0;
  return uit;
}

async function haalRegel(id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query("SELECT * FROM dbo.planning_klanten WHERE id = @id");
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakRegel(data, email) {
  if (!data) throw new Error("VALIDATIE: geen gegevens meegegeven.");
  const klantAccountId = String(data.klantAccountId || data.accountId || "").trim();
  if (!klantAccountId) throw new Error("VALIDATIE: klant (accountId) is verplicht.");

  const activiteit = await valideerActiviteit(data.activiteit);
  const type = valideerType(data.type);
  const status = await valideerStatus(data.status);
  const deadline = valideerDatum(data.deadline);
  const indicatieUren = valideerUren(data.indicatieUren);

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("activiteit", sql.NVarChar(100), activiteit);
  request.input("type", sql.VarChar(10), type);
  request.input("periode", sql.NVarChar(20), data.periode ? String(data.periode).trim().slice(0, 20) : null);
  request.input("deadline", sql.Date, deadline);
  request.input("status", sql.NVarChar(60), status);
  request.input("toegewezenAan", sql.NVarChar(320), data.toegewezenAan ? String(data.toegewezenAan).trim().slice(0, 320) : null);
  request.input("indicatieUren", sql.Decimal(6, 2), indicatieUren);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen ? String(data.opmerkingen) : null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.planning_klanten
      (klant_account_id, activiteit, type, periode, deadline, status, toegewezen_aan, indicatie_uren, opmerkingen, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @activiteit, @type, @periode, @deadline, @status, @toegewezenAan, @indicatieUren, @opmerkingen, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/** Aanpassen — alleen meegegeven velden wijzigen (partial update), de rest blijft staan. */
async function wijzigRegel(id, data, email) {
  const bestaand = await haalRegel(id);
  if (!bestaand) return null;

  const activiteit = data.activiteit !== undefined ? await valideerActiviteit(data.activiteit) : bestaand.activiteit;
  const type = data.type !== undefined ? valideerType(data.type) : bestaand.type;
  const status = data.status !== undefined ? await valideerStatus(data.status) : (bestaand.status || null);
  const deadline = data.deadline !== undefined ? valideerDatum(data.deadline) : (bestaand.deadline ? new Date(bestaand.deadline) : null);
  const indicatieUren = data.indicatieUren !== undefined ? valideerUren(data.indicatieUren) : bestaand.indicatieUren;
  const periode = data.periode !== undefined ? (data.periode ? String(data.periode).trim().slice(0, 20) : null) : (bestaand.periode || null);
  const toegewezenAan = data.toegewezenAan !== undefined ? (data.toegewezenAan ? String(data.toegewezenAan).trim().slice(0, 320) : null) : (bestaand.toegewezenAan || null);
  const opmerkingen = data.opmerkingen !== undefined ? (data.opmerkingen ? String(data.opmerkingen) : null) : (bestaand.opmerkingen || null);

  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("activiteit", sql.NVarChar(100), activiteit);
  request.input("type", sql.VarChar(10), type);
  request.input("periode", sql.NVarChar(20), periode);
  request.input("deadline", sql.Date, deadline);
  request.input("status", sql.NVarChar(60), status);
  request.input("toegewezenAan", sql.NVarChar(320), toegewezenAan);
  request.input("indicatieUren", sql.Decimal(6, 2), indicatieUren);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), opmerkingen);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.planning_klanten
       SET activiteit = @activiteit, type = @type, periode = @periode, deadline = @deadline,
           status = @status, toegewezen_aan = @toegewezenAan, indicatie_uren = @indicatieUren,
           opmerkingen = @opmerkingen, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
     OUTPUT INSERTED.*
     WHERE id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function verwijderRegel(id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query("DELETE FROM dbo.planning_klanten WHERE id = @id");
  return result.rowsAffected[0] > 0;
}

module.exports = {
  haalAlleVoorOverzicht, haalVoorKlant, haalRegel, maakRegel, wijzigRegel, verwijderRegel, telGebruikPerActiviteit,
};
