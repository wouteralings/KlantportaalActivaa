/**
 * CRUD voor dbo.artikelen_klanten: de eigen product-/dienstencatalogus per portaalklant
 * (tab "Producten"). Wordt als snelkeuze gebruikt bij het samenstellen van factuurregels
 * in api/_gedeeld/facturenKlanten.js.
 *
 * Zelfde tenant-regel als klantenKlanten.js: klantAccountId is verplicht in elke query.
 */
const { sql, haalPool } = require("./facturatieDb");

function naarBuiten(row) {
  return {
    id: row.id,
    omschrijving: row.omschrijving,
    eenheid: row.eenheid || "",
    prijs: Number(row.prijs),
    btwPercentage: Number(row.btw_percentage),
    actief: !!row.actief,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

async function haalArtikelen(klantAccountId, { alleenActief = true, zoek = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (alleenActief) where += " AND actief = 1";
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND omschrijving LIKE @zoek";
  }
  const result = await request.query(`SELECT * FROM dbo.artikelen_klanten WHERE ${where} ORDER BY omschrijving`);
  return result.recordset.map(naarBuiten);
}

async function haalArtikel(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.artikelen_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakArtikel(klantAccountId, data, email) {
  if (!data || !String(data.omschrijving || "").trim()) {
    throw new Error("VALIDATIE: omschrijving is verplicht.");
  }
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("omschrijving", sql.NVarChar(300), String(data.omschrijving).trim());
  request.input("eenheid", sql.NVarChar(30), data.eenheid || null);
  request.input("prijs", sql.Decimal(12, 2), Number(data.prijs) || 0);
  request.input("btwPercentage", sql.Decimal(5, 2), data.btwPercentage != null ? Number(data.btwPercentage) : 21);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.artikelen_klanten
      (klant_account_id, omschrijving, eenheid, prijs, btw_percentage, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES (@klantAccountId, @omschrijving, @eenheid, @prijs, @btwPercentage, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

async function wijzigArtikel(klantAccountId, id, data, email) {
  const bestaand = await haalArtikel(klantAccountId, id);
  if (!bestaand) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("omschrijving", sql.NVarChar(300), String(data.omschrijving ?? bestaand.omschrijving).trim());
  request.input("eenheid", sql.NVarChar(30), data.eenheid ?? bestaand.eenheid ?? null);
  request.input("prijs", sql.Decimal(12, 2), data.prijs != null ? Number(data.prijs) : bestaand.prijs);
  request.input(
    "btwPercentage",
    sql.Decimal(5, 2),
    data.btwPercentage != null ? Number(data.btwPercentage) : bestaand.btwPercentage
  );
  request.input("actief", sql.Bit, (data.actief ?? bestaand.actief) ? 1 : 0);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.artikelen_klanten SET
      omschrijving = @omschrijving, eenheid = @eenheid, prijs = @prijs,
      btw_percentage = @btwPercentage, actief = @actief,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Zachte verwijdering — een artikel kan al op bestaande factuurregels staan. */
async function verwijderArtikel(klantAccountId, id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.artikelen_klanten SET actief = 0, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

module.exports = { haalArtikelen, haalArtikel, maakArtikel, wijzigArtikel, verwijderArtikel };
