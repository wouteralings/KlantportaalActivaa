/**
 * CRUD voor dbo.voertuigen_klanten: de eigen voertuigenlijst van een portaalklant
 * (Ritten → Instellingen → Voertuigen). Precies één voertuig kan "favoriet" zijn per account —
 * dat wordt hier afgedwongen (het aanzetten van een nieuw favoriet-voertuig zet het vorige
 * automatisch uit), zodat het rit-formulier altijd een eenduidig standaardvoertuig heeft.
 */
const { sql, haalPool } = require("./facturatieDb");

function naarBuiten(row) {
  return {
    id: row.id,
    merk: row.merk,
    model: row.model || "",
    kenteken: row.kenteken || "",
    cataloguswaarde: Number(row.cataloguswaarde) || 0,
    priveOfZakelijk: row.prive_of_zakelijk,
    // Migratie 010 — auto/motor/fiets. Bestaande rijen (vóór deze migratie) zijn allemaal
    // 'auto' door de DEFAULT op de nieuwe kolom.
    voertuigType: row.voertuig_type || "auto",
    favoriet: !!row.favoriet,
    inGebruik: !!row.in_gebruik,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

async function haalVoertuigen(klantAccountId, { alleenInGebruik = false, zoek = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (alleenInGebruik) where += " AND in_gebruik = 1";
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND (merk LIKE @zoek OR model LIKE @zoek OR kenteken LIKE @zoek)";
  }
  const result = await request.query(
    `SELECT * FROM dbo.voertuigen_klanten WHERE ${where} ORDER BY favoriet DESC, merk`
  );
  return result.recordset.map(naarBuiten);
}

async function haalVoertuig(klantAccountId, id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.voertuigen_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

function valideerPriveOfZakelijk(waarde) {
  const v = String(waarde || "prive").toLowerCase();
  if (v !== "prive" && v !== "zakelijk") throw new Error("VALIDATIE: privé of zakelijk moet 'prive' of 'zakelijk' zijn.");
  return v;
}

function valideerVoertuigType(waarde) {
  const v = String(waarde || "auto").toLowerCase();
  if (v !== "auto" && v !== "motor" && v !== "fiets") throw new Error("VALIDATIE: voertuigtype moet 'auto', 'motor' of 'fiets' zijn.");
  return v;
}

/** Zet exact één favoriet per account — ontzet eerst alle andere. Binnen dezelfde transactie
 * als de aanroepende insert/update opgeroepen zou moeten worden, maar voor deze eenvoudige
 * masterdata-tabel is een best-effort volgorde (eerst ontzetten, dan zetten) voldoende. */
async function ontzetOverigeFavorieten(pool, klantAccountId, behalveId) {
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("behalveId", sql.UniqueIdentifier, behalveId || null);
  await request.query(`
    UPDATE dbo.voertuigen_klanten SET favoriet = 0
    WHERE klant_account_id = @klantAccountId AND (@behalveId IS NULL OR id <> @behalveId)
  `);
}

async function maakVoertuig(klantAccountId, data, email) {
  if (!data || !String(data.merk || "").trim()) throw new Error("VALIDATIE: merk is verplicht.");
  const voertuigType = valideerVoertuigType(data.voertuigType);
  // Cataloguswaarde is voor auto/motor verplicht (bijtelling); voor een fiets is dat geen
  // relevant gegeven, dus daar valt hij terug op 0 als niet meegegeven.
  const cataloguswaardeRuw = data.cataloguswaarde === "" || data.cataloguswaarde == null ? (voertuigType === "fiets" ? 0 : NaN) : Number(data.cataloguswaarde);
  if (!Number.isFinite(cataloguswaardeRuw) || cataloguswaardeRuw < 0) {
    throw new Error("VALIDATIE: cataloguswaarde is verplicht en moet 0 of hoger zijn.");
  }
  const cataloguswaarde = cataloguswaardeRuw;
  const priveOfZakelijk = valideerPriveOfZakelijk(data.priveOfZakelijk);

  const pool = await haalPool();
  if (data.favoriet) await ontzetOverigeFavorieten(pool, klantAccountId, null);

  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("merk", sql.NVarChar(100), String(data.merk).trim().slice(0, 100));
  request.input("model", sql.NVarChar(100), data.model ? String(data.model).trim().slice(0, 100) : null);
  request.input("kenteken", sql.NVarChar(20), data.kenteken ? String(data.kenteken).trim().slice(0, 20) : null);
  request.input("cataloguswaarde", sql.Decimal(12, 2), cataloguswaarde);
  request.input("priveOfZakelijk", sql.VarChar(10), priveOfZakelijk);
  request.input("voertuigType", sql.VarChar(10), voertuigType);
  request.input("favoriet", sql.Bit, data.favoriet ? 1 : 0);
  request.input("inGebruik", sql.Bit, data.inGebruik === false ? 0 : 1);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.voertuigen_klanten
      (klant_account_id, merk, model, kenteken, cataloguswaarde, prive_of_zakelijk, voertuig_type, favoriet, in_gebruik, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES (@klantAccountId, @merk, @model, @kenteken, @cataloguswaarde, @priveOfZakelijk, @voertuigType, @favoriet, @inGebruik, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

async function wijzigVoertuig(klantAccountId, id, data, email) {
  const bestaand = await haalVoertuig(klantAccountId, id);
  if (!bestaand) return null;

  const pool = await haalPool();
  if (data.favoriet && !bestaand.favoriet) await ontzetOverigeFavorieten(pool, klantAccountId, id);

  const voertuigType = data.voertuigType !== undefined ? valideerVoertuigType(data.voertuigType) : bestaand.voertuigType;
  const cataloguswaarde = data.cataloguswaarde !== undefined ? Number(data.cataloguswaarde) : bestaand.cataloguswaarde;
  if (!Number.isFinite(cataloguswaarde) || cataloguswaarde < 0) {
    throw new Error("VALIDATIE: cataloguswaarde moet 0 of hoger zijn.");
  }

  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("merk", sql.NVarChar(100), data.merk !== undefined ? String(data.merk).trim().slice(0, 100) : bestaand.merk);
  request.input("model", sql.NVarChar(100), data.model !== undefined ? (data.model ? String(data.model).trim().slice(0, 100) : null) : (bestaand.model || null));
  request.input("kenteken", sql.NVarChar(20), data.kenteken !== undefined ? (data.kenteken ? String(data.kenteken).trim().slice(0, 20) : null) : (bestaand.kenteken || null));
  request.input("cataloguswaarde", sql.Decimal(12, 2), cataloguswaarde);
  request.input("priveOfZakelijk", sql.VarChar(10), data.priveOfZakelijk !== undefined ? valideerPriveOfZakelijk(data.priveOfZakelijk) : bestaand.priveOfZakelijk);
  request.input("voertuigType", sql.VarChar(10), voertuigType);
  request.input("favoriet", sql.Bit, data.favoriet !== undefined ? (data.favoriet ? 1 : 0) : (bestaand.favoriet ? 1 : 0));
  request.input("inGebruik", sql.Bit, data.inGebruik !== undefined ? (data.inGebruik ? 1 : 0) : (bestaand.inGebruik ? 1 : 0));
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.voertuigen_klanten SET
      merk = @merk, model = @model, kenteken = @kenteken, cataloguswaarde = @cataloguswaarde,
      prive_of_zakelijk = @priveOfZakelijk, voertuig_type = @voertuigType, favoriet = @favoriet, in_gebruik = @inGebruik,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Zachte verwijdering (in_gebruik = 0) — een voertuig kan al aan ritten gekoppeld zijn, dus we
 * verwijderen nooit hard (net als klanten_klanten/verwijderKlant). */
async function verwijderVoertuig(klantAccountId, id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.voertuigen_klanten SET in_gebruik = 0, favoriet = 0, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

module.exports = { haalVoertuigen, haalVoertuig, maakVoertuig, wijzigVoertuig, verwijderVoertuig };
