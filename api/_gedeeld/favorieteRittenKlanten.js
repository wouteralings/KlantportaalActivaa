/**
 * CRUD voor dbo.favoriete_ritten_klanten: opgeslagen rit-sjablonen (Ritten → Instellingen →
 * Favoriete ritten) waarmee een klant een heel rit-formulier in één klik kan voorinvullen.
 * Losstaand van de "recente adressen/omschrijvingen"-suggesties in rittenKlanten.js
 * (haalRecenteSuggesties) — dit zijn twee complementaire mechanismes, zie het plan.
 */
const { sql, haalPool } = require("./facturatieDb");

function naarBuiten(row) {
  return {
    id: row.id,
    naam: row.naam,
    vanAdres: row.van_adres || "",
    naarAdres: row.naar_adres || "",
    voertuigId: row.voertuig_id || null,
    klantKlantId: row.klant_klant_id || null,
    projectId: row.project_id || null,
    omschrijving: row.omschrijving || "",
    priveRit: !!row.prive_rit,
    woonWerkRit: !!row.woon_werk_rit,
    declarabelType: row.declarabel_type,
    declarabelTarief: row.declarabel_tarief != null ? Number(row.declarabel_tarief) : null,
    aangemaaktOp: row.aangemaakt_op,
  };
}

async function haalFavorieteRitten(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query(
    "SELECT * FROM dbo.favoriete_ritten_klanten WHERE klant_account_id = @klantAccountId ORDER BY naam"
  );
  return result.recordset.map(naarBuiten);
}

async function haalFavorieteRit(klantAccountId, id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.favoriete_ritten_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakFavorieteRit(klantAccountId, data, email) {
  if (!data || !String(data.naam || "").trim()) throw new Error("VALIDATIE: naam is verplicht.");
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("naam", sql.NVarChar(150), String(data.naam).trim().slice(0, 150));
  request.input("vanAdres", sql.NVarChar(300), data.vanAdres ? String(data.vanAdres).trim().slice(0, 300) : null);
  request.input("naarAdres", sql.NVarChar(300), data.naarAdres ? String(data.naarAdres).trim().slice(0, 300) : null);
  request.input("voertuigId", sql.UniqueIdentifier, data.voertuigId || null);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId || null);
  request.input("projectId", sql.UniqueIdentifier, data.projectId || null);
  request.input("omschrijving", sql.NVarChar(500), data.omschrijving ? String(data.omschrijving).slice(0, 500) : null);
  request.input("priveRit", sql.Bit, data.priveRit ? 1 : 0);
  request.input("woonWerkRit", sql.Bit, data.woonWerkRit ? 1 : 0);
  request.input("declarabelType", sql.VarChar(10), data.declarabelType === "per_keer" ? "per_keer" : "per_km");
  request.input("declarabelTarief", sql.Decimal(9, 2), data.declarabelTarief != null ? Number(data.declarabelTarief) : null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.favoriete_ritten_klanten
      (klant_account_id, naam, van_adres, naar_adres, voertuig_id, klant_klant_id, project_id,
       omschrijving, prive_rit, woon_werk_rit, declarabel_type, declarabel_tarief, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @naam, @vanAdres, @naarAdres, @voertuigId, @klantKlantId, @projectId,
       @omschrijving, @priveRit, @woonWerkRit, @declarabelType, @declarabelTarief, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

async function wijzigFavorieteRit(klantAccountId, id, data, email) {
  const bestaand = await haalFavorieteRit(klantAccountId, id);
  if (!bestaand) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("naam", sql.NVarChar(150), data.naam !== undefined ? String(data.naam).trim().slice(0, 150) : bestaand.naam);
  request.input("vanAdres", sql.NVarChar(300), (data.vanAdres !== undefined ? data.vanAdres : bestaand.vanAdres) || null);
  request.input("naarAdres", sql.NVarChar(300), (data.naarAdres !== undefined ? data.naarAdres : bestaand.naarAdres) || null);
  request.input("voertuigId", sql.UniqueIdentifier, (data.voertuigId !== undefined ? data.voertuigId : bestaand.voertuigId) || null);
  request.input("klantKlantId", sql.UniqueIdentifier, (data.klantKlantId !== undefined ? data.klantKlantId : bestaand.klantKlantId) || null);
  request.input("projectId", sql.UniqueIdentifier, (data.projectId !== undefined ? data.projectId : bestaand.projectId) || null);
  request.input("omschrijving", sql.NVarChar(500), (data.omschrijving !== undefined ? data.omschrijving : bestaand.omschrijving) || null);
  request.input("priveRit", sql.Bit, (data.priveRit !== undefined ? data.priveRit : bestaand.priveRit) ? 1 : 0);
  request.input("woonWerkRit", sql.Bit, (data.woonWerkRit !== undefined ? data.woonWerkRit : bestaand.woonWerkRit) ? 1 : 0);
  request.input("declarabelType", sql.VarChar(10), (data.declarabelType !== undefined ? data.declarabelType : bestaand.declarabelType) === "per_keer" ? "per_keer" : "per_km");
  request.input("declarabelTarief", sql.Decimal(9, 2), data.declarabelTarief !== undefined ? (data.declarabelTarief != null ? Number(data.declarabelTarief) : null) : bestaand.declarabelTarief);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.favoriete_ritten_klanten SET
      naam = @naam, van_adres = @vanAdres, naar_adres = @naarAdres, voertuig_id = @voertuigId,
      klant_klant_id = @klantKlantId, project_id = @projectId, omschrijving = @omschrijving,
      prive_rit = @priveRit, woon_werk_rit = @woonWerkRit, declarabel_type = @declarabelType,
      declarabel_tarief = @declarabelTarief, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function verwijderFavorieteRit(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    DELETE FROM dbo.favoriete_ritten_klanten OUTPUT DELETED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

module.exports = {
  haalFavorieteRitten,
  haalFavorieteRit,
  maakFavorieteRit,
  wijzigFavorieteRit,
  verwijderFavorieteRit,
};
