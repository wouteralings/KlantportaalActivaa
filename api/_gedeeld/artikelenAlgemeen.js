/**
 * CRUD voor dbo.artikelen_algemeen: centraal (door Activaa, via Beheer) beheerde
 * artikelen die voor ELKE klant beschikbaar zijn — in tegenstelling tot
 * artikelen_klanten (eigen catalogus per klant, zie artikelenKlanten.js).
 *
 * Het BTW-percentage wordt hier NIET opgeslagen maar bij elke ophaal-aanroep
 * live opgezocht via de btw_code (zie btwTarieven.js) — wijzigt het officiële
 * tarief, dan verandert het getoonde percentage van een algemeen artikel dus
 * vanzelf mee, zonder dat iemand het artikel zelf hoeft aan te passen.
 * Al gemaakte factuurregels blijven ongewijzigd (die bevriezen het percentage
 * op het moment van opstellen, zie facturenKlanten.js).
 */
const { sql, haalPool } = require("./facturatieDb");
const { haalActueleTarieven } = require("./btwTarieven");

function naarBuiten(row, tarievenPerCode) {
  const tarief = tarievenPerCode[row.btw_code];
  return {
    id: row.id,
    omschrijving: row.omschrijving,
    eenheid: row.eenheid || "",
    prijs: Number(row.prijs),
    btwCode: row.btw_code,
    btwPercentage: tarief ? tarief.percentage : 21,
    actief: !!row.actief,
    gedeeld: true, // markering voor de frontend: dit is een centraal beheerd artikel, niet van deze klant
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

async function haalTarievenPerCode() {
  const tarieven = await haalActueleTarieven();
  return Object.fromEntries(tarieven.map((t) => [t.code, t]));
}

async function haalArtikelenAlgemeen({ alleenActief = true, zoek = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  let where = "1 = 1";
  if (alleenActief) where += " AND actief = 1";
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND omschrijving LIKE @zoek";
  }
  const [result, tarievenPerCode] = await Promise.all([
    request.query(`SELECT * FROM dbo.artikelen_algemeen WHERE ${where} ORDER BY omschrijving`),
    haalTarievenPerCode(),
  ]);
  return result.recordset.map((row) => naarBuiten(row, tarievenPerCode));
}

async function haalArtikelAlgemeen(id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const [result, tarievenPerCode] = await Promise.all([
    request.query("SELECT * FROM dbo.artikelen_algemeen WHERE id = @id"),
    haalTarievenPerCode(),
  ]);
  return result.recordset[0] ? naarBuiten(result.recordset[0], tarievenPerCode) : null;
}

async function maakArtikelAlgemeen(data, email) {
  if (!data || !String(data.omschrijving || "").trim()) {
    throw new Error("VALIDATIE: omschrijving is verplicht.");
  }
  const pool = await haalPool();
  const request = pool.request();
  request.input("omschrijving", sql.NVarChar(300), String(data.omschrijving).trim());
  request.input("eenheid", sql.NVarChar(30), data.eenheid || null);
  request.input("prijs", sql.Decimal(12, 2), Number(data.prijs) || 0);
  request.input("btwCode", sql.VarChar(20), data.btwCode || "hoog");
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.artikelen_algemeen (omschrijving, eenheid, prijs, btw_code, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES (@omschrijving, @eenheid, @prijs, @btwCode, @email)
  `);
  const tarievenPerCode = await haalTarievenPerCode();
  return naarBuiten(result.recordset[0], tarievenPerCode);
}

async function wijzigArtikelAlgemeen(id, data, email) {
  const bestaand = await haalArtikelAlgemeen(id);
  if (!bestaand) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("omschrijving", sql.NVarChar(300), String(data.omschrijving ?? bestaand.omschrijving).trim());
  request.input("eenheid", sql.NVarChar(30), data.eenheid ?? bestaand.eenheid ?? null);
  request.input("prijs", sql.Decimal(12, 2), data.prijs != null ? Number(data.prijs) : bestaand.prijs);
  request.input("btwCode", sql.VarChar(20), data.btwCode || bestaand.btwCode);
  request.input("actief", sql.Bit, (data.actief ?? bestaand.actief) ? 1 : 0);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.artikelen_algemeen SET
      omschrijving = @omschrijving, eenheid = @eenheid, prijs = @prijs,
      btw_code = @btwCode, actief = @actief,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  if (!result.recordset[0]) return null;
  const tarievenPerCode = await haalTarievenPerCode();
  return naarBuiten(result.recordset[0], tarievenPerCode);
}

/** Zachte verwijdering — een algemeen artikel kan al op bestaande factuurregels staan. */
async function verwijderArtikelAlgemeen(id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.artikelen_algemeen SET actief = 0, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.id
    WHERE id = @id
  `);
  return result.recordset.length > 0;
}

module.exports = {
  haalArtikelenAlgemeen,
  haalArtikelAlgemeen,
  maakArtikelAlgemeen,
  wijzigArtikelAlgemeen,
  verwijderArtikelAlgemeen,
};
