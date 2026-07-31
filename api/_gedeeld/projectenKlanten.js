/**
 * CRUD voor dbo.projecten_klanten: projecten van een portaalklant, elk verplicht onder één
 * eigen (eind)klant (dbo.klanten_klanten). Gedeeld tussen de Rittenregistratie en — indien de
 * projectenGekoppeld-instelling voor dat account aan staat — de Uren-module.
 *
 * BELANGRIJK: elke functie hier neemt klantAccountId (de Dataverse Account-id van de ingelogde
 * portaalklant, uit herleidAccounts()) als verplicht filter/kolom, zelfde regel als
 * klantenKlanten.js/artikelenKlanten.js — laat dit nooit weg bij nieuwe query's.
 */
const { sql, haalPool } = require("./facturatieDb");
const { haalKlant } = require("./klantenKlanten");

function naarBuiten(row) {
  return {
    id: row.id,
    klantKlantId: row.klant_klant_id,
    naam: row.naam,
    omschrijving: row.omschrijving || "",
    actief: !!row.actief,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

/** Projecten van één klant-account, optioneel gefilterd op eindklant en zoekterm. */
async function haalProjecten(klantAccountId, { klantKlantId = "", alleenActief = true, zoek = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (klantKlantId) {
    request.input("klantKlantId", sql.UniqueIdentifier, klantKlantId);
    where += " AND klant_klant_id = @klantKlantId";
  }
  if (alleenActief) where += " AND actief = 1";
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND naam LIKE @zoek";
  }
  const result = await request.query(`SELECT * FROM dbo.projecten_klanten WHERE ${where} ORDER BY naam`);
  return result.recordset.map(naarBuiten);
}

async function haalProject(klantAccountId, id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.projecten_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakProject(klantAccountId, data, email) {
  if (!data || !String(data.naam || "").trim()) throw new Error("VALIDATIE: naam is verplicht.");
  if (!data.klantKlantId) throw new Error("VALIDATIE: kies een klant voor dit project.");
  const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
  if (!klantKlant) throw new Error("VALIDATIE: onbekende klant (of hoort bij een ander account).");

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId);
  request.input("naam", sql.NVarChar(200), String(data.naam).trim().slice(0, 200));
  request.input("omschrijving", sql.NVarChar(sql.MAX), data.omschrijving || null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.projecten_klanten
      (klant_account_id, klant_klant_id, naam, omschrijving, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES (@klantAccountId, @klantKlantId, @naam, @omschrijving, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

async function wijzigProject(klantAccountId, id, data, email) {
  const bestaand = await haalProject(klantAccountId, id);
  if (!bestaand) return null;

  let klantKlantId = bestaand.klantKlantId;
  if (data.klantKlantId && data.klantKlantId !== bestaand.klantKlantId) {
    const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
    if (!klantKlant) throw new Error("VALIDATIE: onbekende klant (of hoort bij een ander account).");
    klantKlantId = data.klantKlantId;
  }

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("klantKlantId", sql.UniqueIdentifier, klantKlantId);
  request.input("naam", sql.NVarChar(200), data.naam !== undefined ? String(data.naam).trim().slice(0, 200) : bestaand.naam);
  request.input("omschrijving", sql.NVarChar(sql.MAX), data.omschrijving !== undefined ? data.omschrijving : bestaand.omschrijving);
  request.input("actief", sql.Bit, data.actief !== undefined ? (data.actief ? 1 : 0) : (bestaand.actief ? 1 : 0));
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.projecten_klanten SET
      klant_klant_id = @klantKlantId, naam = @naam, omschrijving = @omschrijving, actief = @actief,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Zachte verwijdering (actief = 0) — een project kan al aan ritten/uren gekoppeld zijn. */
async function verwijderProject(klantAccountId, id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.projecten_klanten SET actief = 0, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

module.exports = { haalProjecten, haalProject, maakProject, wijzigProject, verwijderProject };
