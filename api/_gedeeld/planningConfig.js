/**
 * CRUD voor dbo.planning_config_klanten: de per-klant planning-configuratie ("wat doen we voor deze
 * klant") — Planningsmodule Stap 3a. Elke rij = activiteit + frequentie + indicatie-uren voor één
 * klant. De toewijzing volgt standaard het TEAM van de klant (de rol die in Beheer aan de activiteit
 * hangt → de persoon op de klant in Dynamics); `toegewezen_aan` is een optionele afwijking daarvan.
 *
 * Medewerker-breed (net als planningKlanten.js): geen per-klant aan/uit-schakelaar, toegang via het
 * magPlanning-recht (planningRecht.js). De klant-account-id wordt door de UI meegegeven.
 */
const { sql, haalPool } = require("./facturatieDb");
const { magActiviteit, maakSleutel } = require("./planningInstellingen");

const GELDIGE_FREQUENTIES = ["maandelijks", "kwartaal", "jaarlijks", "eenmalig"];

function naarBuiten(row) {
  return {
    id: row.id,
    klantAccountId: String(row.klant_account_id || "").toLowerCase(),
    activiteit: row.activiteit || "",
    frequentie: row.frequentie || "maandelijks",
    indicatieUren: row.indicatie_uren != null ? Number(row.indicatie_uren) : null,
    // Urencode waarop de uren van deze activiteit voor DEZE klant geschreven worden. Leeg = erf de
    // standaard-urencode van de activiteit (Beheer → Planning). Zelfde erf-patroon als indicatieUren.
    urencode: row.urencode || "",
    toegewezenAan: row.toegewezen_aan || "",
    uitvoerMaand: row.uitvoer_maand != null ? Number(row.uitvoer_maand) : null,
    vanaf: row.vanaf ? String(row.vanaf).trim() : "",
    actief: !!row.actief,
    opmerkingen: row.opmerkingen || "",
    aangemaaktOp: row.aangemaakt_op,
    aangemaaktDoor: row.aangemaakt_door || "",
    gewijzigdOp: row.gewijzigd_op,
    gewijzigdDoor: row.gewijzigd_door || "",
  };
}

function valideerFrequentie(waarde) {
  const v = String(waarde || "maandelijks").trim().toLowerCase();
  if (!GELDIGE_FREQUENTIES.includes(v)) {
    throw new Error(`VALIDATIE: frequentie moet een van de volgende zijn: ${GELDIGE_FREQUENTIES.join(", ")}.`);
  }
  return v;
}

function valideerUren(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = Number(waarde);
  if (isNaN(n) || n < 0) throw new Error("VALIDATIE: indicatie-uren moet een getal ≥ 0 zijn.");
  return Math.round(n * 100) / 100;
}

function valideerMaand(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = Number(waarde);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error("VALIDATIE: uitvoermaand moet 1 t/m 12 zijn (of leeg).");
  return n;
}

// "Vanaf"-moment per klant: een maand/jaar "YYYY-MM" of null (= altijd). Vóór dit moment wordt de
// activiteit voor deze klant niet in de planning/Mijn werk opgenomen. Per klant ingesteld (Planning →
// configuratie per klant), i.p.v. globaal op de activiteit.
// Urencode = de NAAM van een urencode uit Beheer → Uren (zie urencodesStore). Leeg = erf de
// standaard-urencode van de activiteit. Bewust niet hard gevalideerd tegen de codelijst: een code
// hernoemen/uitzetten mag een bestaande planningsregel niet onopslaanbaar maken (net als bij
// cr283_urenboeking.urencode, die ook gewoon de naam bewaart).
function valideerUrencode(waarde) {
  if (waarde === undefined || waarde === null) return null;
  const s = String(waarde).trim().slice(0, 100);
  return s || null;
}

function valideerMaandJaar(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const s = String(waarde).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new Error("VALIDATIE: 'vanaf' moet formaat JJJJ-MM hebben (of leeg).");
  return s;
}

// De kolommen 'vanaf' en 'urencode' zijn later toegevoegd. We schrijven ze ALLEEN weg als ze bestaan,
// en proberen ze eenmalig aan te maken. Zo blijft opslaan (uren, uitvoerder, frequentie, …) altijd
// werken — ook als de kolom nog niet bestaat of niet aangemaakt kan worden; de waarde wordt dan
// simpelweg (nog) niet bewaard. Lezen werkt sowieso: ontbreekt de kolom, dan is row.<kolom>
// undefined → "".
const kolomStatus = new Map(); // kolomnaam → true (aanwezig) | false (afwezig/niet aan te maken)
async function kolomAanwezig(pool, kolom, sqlType) {
  if (kolomStatus.has(kolom)) return kolomStatus.get(kolom);
  try {
    const check = await pool.request().query(`SELECT COL_LENGTH('dbo.planning_config_klanten','${kolom}') AS len`);
    if (check.recordset && check.recordset[0] && check.recordset[0].len != null) { kolomStatus.set(kolom, true); return true; }
  } catch {
    // Kon niet controleren; probeer de kolom hieronder toe te voegen, val anders terug op 'afwezig'.
  }
  try {
    await pool.request().query(`ALTER TABLE dbo.planning_config_klanten ADD ${kolom} ${sqlType} NULL;`);
    kolomStatus.set(kolom, true);
  } catch {
    kolomStatus.set(kolom, false); // geen rechten of andere reden — sla de waarde voorlopig niet op
  }
  return kolomStatus.get(kolom);
}
const vanafKolomAanwezig = (pool) => kolomAanwezig(pool, "vanaf", "CHAR(7)");
const urencodeKolomAanwezig = (pool) => kolomAanwezig(pool, "urencode", "NVARCHAR(100)");

async function valideerActiviteit(waarde) {
  const v = String(waarde || "").trim();
  if (!v) throw new Error("VALIDATIE: activiteit is verplicht.");
  if (!(await magActiviteit(v))) {
    throw new Error(`VALIDATIE: onbekende activiteit ('${v}'). Ga naar Beheer → Planning om activiteiten te beheren.`);
  }
  return maakSleutel(v) || v;
}

async function haalVoorKlant(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query(
    "SELECT * FROM dbo.planning_config_klanten WHERE klant_account_id = @klantAccountId ORDER BY aangemaakt_op ASC"
  );
  return result.recordset.map(naarBuiten);
}

/** Alle configuratieregels over ALLE klanten heen — voor het afleiden van de maandplanning (Stap 3b). */
async function haalAlle() {
  const pool = await haalPool();
  const result = await pool.request().query(
    "SELECT * FROM dbo.planning_config_klanten WHERE actief = 1 ORDER BY klant_account_id, aangemaakt_op ASC"
  );
  return result.recordset.map(naarBuiten);
}

async function haalRegel(id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query("SELECT * FROM dbo.planning_config_klanten WHERE id = @id");
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakRegel(data, email) {
  if (!data) throw new Error("VALIDATIE: geen gegevens meegegeven.");
  const klantAccountId = String(data.klantAccountId || data.accountId || "").trim();
  if (!klantAccountId) throw new Error("VALIDATIE: klant (accountId) is verplicht.");

  const activiteit = await valideerActiviteit(data.activiteit);
  const frequentie = valideerFrequentie(data.frequentie);
  const indicatieUren = valideerUren(data.indicatieUren);
  const uitvoerMaand = valideerMaand(data.uitvoerMaand);
  const vanaf = valideerMaandJaar(data.vanaf);

  const pool = await haalPool();
  const heeftVanaf = await vanafKolomAanwezig(pool);
  const heeftUrencode = await urencodeKolomAanwezig(pool);
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("activiteit", sql.NVarChar(100), activiteit);
  request.input("frequentie", sql.VarChar(12), frequentie);
  request.input("indicatieUren", sql.Decimal(6, 2), indicatieUren);
  request.input("uitvoerMaand", sql.TinyInt, uitvoerMaand);
  request.input("toegewezenAan", sql.NVarChar(320), data.toegewezenAan ? String(data.toegewezenAan).trim().slice(0, 320) : null);
  request.input("actief", sql.Bit, data.actief === false ? 0 : 1);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen ? String(data.opmerkingen) : null);
  request.input("email", sql.NVarChar(320), email || null);
  if (heeftVanaf) request.input("vanaf", sql.Char(7), vanaf);
  if (heeftUrencode) request.input("urencode", sql.NVarChar(100), valideerUrencode(data.urencode));
  const kolommen = ["klant_account_id", "activiteit", "frequentie", "indicatie_uren", "uitvoer_maand", "toegewezen_aan", "actief", "opmerkingen", "aangemaakt_door"];
  const waarden = ["@klantAccountId", "@activiteit", "@frequentie", "@indicatieUren", "@uitvoerMaand", "@toegewezenAan", "@actief", "@opmerkingen", "@email"];
  if (heeftVanaf) { kolommen.splice(5, 0, "vanaf"); waarden.splice(5, 0, "@vanaf"); }
  if (heeftUrencode) { kolommen.splice(5, 0, "urencode"); waarden.splice(5, 0, "@urencode"); }
  const result = await request.query(
    `INSERT INTO dbo.planning_config_klanten (${kolommen.join(", ")}) OUTPUT INSERTED.* VALUES (${waarden.join(", ")})`
  );
  return naarBuiten(result.recordset[0]);
}

async function wijzigRegel(id, data, email) {
  const bestaand = await haalRegel(id);
  if (!bestaand) return null;

  const activiteit = data.activiteit !== undefined ? await valideerActiviteit(data.activiteit) : bestaand.activiteit;
  const frequentie = data.frequentie !== undefined ? valideerFrequentie(data.frequentie) : bestaand.frequentie;
  const indicatieUren = data.indicatieUren !== undefined ? valideerUren(data.indicatieUren) : bestaand.indicatieUren;
  const uitvoerMaand = data.uitvoerMaand !== undefined ? valideerMaand(data.uitvoerMaand) : (bestaand.uitvoerMaand ?? null);
  const vanaf = data.vanaf !== undefined ? valideerMaandJaar(data.vanaf) : (bestaand.vanaf || null);
  const urencode = data.urencode !== undefined ? valideerUrencode(data.urencode) : (bestaand.urencode || null);
  const toegewezenAan = data.toegewezenAan !== undefined ? (data.toegewezenAan ? String(data.toegewezenAan).trim().slice(0, 320) : null) : (bestaand.toegewezenAan || null);
  const actief = data.actief !== undefined ? (data.actief === false ? 0 : 1) : (bestaand.actief ? 1 : 0);
  const opmerkingen = data.opmerkingen !== undefined ? (data.opmerkingen ? String(data.opmerkingen) : null) : (bestaand.opmerkingen || null);

  const pool = await haalPool();
  const heeftVanaf = await vanafKolomAanwezig(pool);
  const heeftUrencode = await urencodeKolomAanwezig(pool);
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("activiteit", sql.NVarChar(100), activiteit);
  request.input("frequentie", sql.VarChar(12), frequentie);
  request.input("indicatieUren", sql.Decimal(6, 2), indicatieUren);
  request.input("uitvoerMaand", sql.TinyInt, uitvoerMaand);
  request.input("toegewezenAan", sql.NVarChar(320), toegewezenAan);
  request.input("actief", sql.Bit, actief);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), opmerkingen);
  request.input("email", sql.NVarChar(320), email || null);
  if (heeftVanaf) request.input("vanaf", sql.Char(7), vanaf);
  if (heeftUrencode) request.input("urencode", sql.NVarChar(100), urencode);
  const setDelen = [
    "activiteit = @activiteit", "frequentie = @frequentie", "indicatie_uren = @indicatieUren",
    "uitvoer_maand = @uitvoerMaand", "toegewezen_aan = @toegewezenAan", "actief = @actief",
    "opmerkingen = @opmerkingen", "gewijzigd_op = SYSUTCDATETIME()", "gewijzigd_door = @email",
  ];
  if (heeftVanaf) setDelen.splice(4, 0, "vanaf = @vanaf");
  if (heeftUrencode) setDelen.splice(4, 0, "urencode = @urencode");
  const result = await request.query(
    `UPDATE dbo.planning_config_klanten SET ${setDelen.join(", ")} OUTPUT INSERTED.* WHERE id = @id`
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function verwijderRegel(id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query("DELETE FROM dbo.planning_config_klanten WHERE id = @id");
  return result.rowsAffected[0] > 0;
}

module.exports = {
  haalVoorKlant, haalAlle, haalRegel, maakRegel, wijzigRegel, verwijderRegel, GELDIGE_FREQUENTIES,
};
