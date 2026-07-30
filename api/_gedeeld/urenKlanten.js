/**
 * CRUD + facturatie-koppeling voor dbo.uren_klanten: de losse uren-/projecturenregistratie van
 * een portaalklant, vóór één van zijn eigen (eind)klanten (klanten_klanten). Tab "Uren" in de
 * Facturatiemodule.
 *
 * Zelfde tenant-regel als klantenKlanten.js/artikelenKlanten.js: klantAccountId is verplicht in
 * elke query. Elke registratie hoort VERPLICHT bij precies één klant_klant (klant_klant_id) en
 * optioneel bij een artikel (artikel_id) — dat artikel bepaalt het uurtarief bij het factureren.
 *
 * "Open" = factuur_id IS NULL (nog te factureren). Zodra de uren op een factuur/concept worden
 * gezet, wijst factuur_id naar dbo.facturen_klanten.id en staat gefactureerd op 1. Het koppelen/
 * ontkoppelen gebeurt vanuit api/_gedeeld/facturenKlanten.js (bij het opslaan/verwijderen van een
 * factuur) — zie koppelUrenAanFactuur / ontkoppelUrenVanFactuur / reconcileerUrenVoorFactuur.
 * Een reeds gefactureerde registratie kan niet meer gewijzigd of verwijderd worden zolang ze aan
 * een document hangt (maak eerst dat document/concept los of verwijder het).
 */
const { sql, haalPool } = require("./facturatieDb");
const { haalKlant } = require("./klantenKlanten");

function naarBuiten(row) {
  return {
    id: row.id,
    klantKlantId: row.klant_klant_id,
    artikelId: row.artikel_id || null,
    datum: row.datum,
    omschrijving: row.omschrijving || "",
    aantalUren: Number(row.aantal_uren),
    factuurId: row.factuur_id || null,
    gefactureerd: !!row.gefactureerd,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

/**
 * Uren van één klant-account, optioneel gefilterd op eindklant en op status.
 *   status: "open" (factuur_id IS NULL) | "gefactureerd" | "alle" (standaard)
 */
async function haalUren(klantAccountId, { klantKlantId = "", status = "alle", zoek = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (klantKlantId) {
    request.input("klantKlantId", sql.UniqueIdentifier, klantKlantId);
    where += " AND klant_klant_id = @klantKlantId";
  }
  if (status === "open") where += " AND factuur_id IS NULL";
  else if (status === "gefactureerd") where += " AND factuur_id IS NOT NULL";
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND omschrijving LIKE @zoek";
  }
  const result = await request.query(
    `SELECT * FROM dbo.uren_klanten WHERE ${where} ORDER BY datum DESC, aangemaakt_op DESC`
  );
  return result.recordset.map(naarBuiten);
}

async function haalUur(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.uren_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

function valideerAantal(waarde) {
  const aantal = Number(waarde);
  if (!Number.isFinite(aantal) || aantal <= 0) {
    throw new Error("VALIDATIE: het aantal uren moet groter dan 0 zijn.");
  }
  return Math.round(aantal * 100) / 100;
}

async function maakUur(klantAccountId, data, email) {
  if (!data || !data.klantKlantId) throw new Error("VALIDATIE: kies een klant voor deze uren.");
  const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
  if (!klantKlant) throw new Error("VALIDATIE: onbekende klant (of hoort bij een ander account).");
  const aantalUren = valideerAantal(data.aantalUren);
  const datum = data.datum ? new Date(data.datum) : new Date();

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId);
  request.input("artikelId", sql.UniqueIdentifier, data.artikelId || null);
  request.input("datum", sql.Date, datum);
  request.input("omschrijving", sql.NVarChar(500), data.omschrijving ? String(data.omschrijving).slice(0, 500) : null);
  request.input("aantalUren", sql.Decimal(9, 2), aantalUren);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.uren_klanten
      (klant_account_id, klant_klant_id, artikel_id, datum, omschrijving, aantal_uren, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES (@klantAccountId, @klantKlantId, @artikelId, @datum, @omschrijving, @aantalUren, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

async function wijzigUur(klantAccountId, id, data, email) {
  const bestaand = await haalUur(klantAccountId, id);
  if (!bestaand) return null;
  if (bestaand.factuurId) {
    throw new Error("VALIDATIE: deze uren staan al op een factuur en kunnen niet meer gewijzigd worden.");
  }
  if (data.klantKlantId && data.klantKlantId !== bestaand.klantKlantId) {
    const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
    if (!klantKlant) throw new Error("VALIDATIE: onbekende klant (of hoort bij een ander account).");
  }
  const aantalUren = data.aantalUren != null ? valideerAantal(data.aantalUren) : bestaand.aantalUren;

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId || bestaand.klantKlantId);
  request.input("artikelId", sql.UniqueIdentifier, data.artikelId !== undefined ? (data.artikelId || null) : (bestaand.artikelId || null));
  request.input("datum", sql.Date, data.datum ? new Date(data.datum) : new Date(bestaand.datum));
  request.input("omschrijving", sql.NVarChar(500), (data.omschrijving !== undefined ? data.omschrijving : bestaand.omschrijving) ? String(data.omschrijving !== undefined ? data.omschrijving : bestaand.omschrijving).slice(0, 500) : null);
  request.input("aantalUren", sql.Decimal(9, 2), aantalUren);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.uren_klanten SET
      klant_klant_id = @klantKlantId, artikel_id = @artikelId, datum = @datum,
      omschrijving = @omschrijving, aantal_uren = @aantalUren,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id AND factuur_id IS NULL
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Harde verwijdering — maar alleen zolang de uren nog niet aan een factuur hangen. */
async function verwijderUur(klantAccountId, id) {
  const bestaand = await haalUur(klantAccountId, id);
  if (!bestaand) return false;
  if (bestaand.factuurId) {
    throw new Error("VALIDATIE: deze uren staan al op een factuur en kunnen niet verwijderd worden.");
  }
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    DELETE FROM dbo.uren_klanten OUTPUT DELETED.id
    WHERE klant_account_id = @klantAccountId AND id = @id AND factuur_id IS NULL
  `);
  return result.recordset.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Koppeling met de facturatie (aangeroepen vanuit facturenKlanten.js)         */
/* -------------------------------------------------------------------------- */

/** Zet factuur_id + gefactureerd=1 op de opgegeven uren — maar alleen op uren die nog vrij zijn
 * (of al aan déze factuur hangen, zodat opnieuw koppelen idempotent is) én die bij dezelfde
 * eindklant horen als de factuur. Zo kan een klant nooit per ongeluk de uren van een ándere
 * eindklant, of al elders gefactureerde uren, op deze factuur zetten. */
async function koppelUrenAanFactuur(klantAccountId, factuurId, klantKlantId, urenIds) {
  const lijst = [...new Set((urenIds || []).filter(Boolean))];
  if (lijst.length === 0) return 0;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("factuurId", sql.UniqueIdentifier, factuurId);
  request.input("klantKlantId", sql.UniqueIdentifier, klantKlantId);
  const params = lijst.map((id, i) => {
    request.input(`u${i}`, sql.UniqueIdentifier, id);
    return `@u${i}`;
  });
  const result = await request.query(`
    UPDATE dbo.uren_klanten SET factuur_id = @factuurId, gefactureerd = 1
    OUTPUT INSERTED.id
    WHERE klant_account_id = @klantAccountId
      AND klant_klant_id = @klantKlantId
      AND id IN (${params.join(", ")})
      AND (factuur_id IS NULL OR factuur_id = @factuurId)
  `);
  return result.recordset.length;
}

/** Maak alle uren die aan deze factuur hangen weer vrij (factuur_id NULL, gefactureerd 0). */
async function ontkoppelUrenVanFactuur(klantAccountId, factuurId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("factuurId", sql.UniqueIdentifier, factuurId);
  await request.query(`
    UPDATE dbo.uren_klanten SET factuur_id = NULL, gefactureerd = 0
    WHERE klant_account_id = @klantAccountId AND factuur_id = @factuurId
  `);
}

/** Breng de uren-koppeling van een factuur in lijn met de opgegeven set uren-ids: eerst alles
 * van deze factuur losmaken, dan de nieuwe set koppelen. Zo worden uren die van een concept
 * verwijderd zijn weer vrijgegeven, en nieuw toegevoegde uren gekoppeld — bij elke keer opslaan.
 * Idempotent. */
async function reconcileerUrenVoorFactuur(klantAccountId, factuurId, klantKlantId, urenIds) {
  await ontkoppelUrenVanFactuur(klantAccountId, factuurId);
  await koppelUrenAanFactuur(klantAccountId, factuurId, klantKlantId, urenIds);
}

module.exports = {
  haalUren,
  haalUur,
  maakUur,
  wijzigUur,
  verwijderUur,
  koppelUrenAanFactuur,
  ontkoppelUrenVanFactuur,
  reconcileerUrenVoorFactuur,
};
