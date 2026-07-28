/**
 * Centraal (niet per klant) beheer van BTW-tarieven met geldigheidsperiode
 * (dbo.btw_tarieven). Vier vaste categorieën: 'nul', 'laag', 'hoog', 'vrijgesteld'.
 *
 * Gebruikt door:
 *  - api/btw-tarieven (klant-facing, alleen de huidig geldige tarieven — voor de
 *    BTW-keuzelijst bij het aanmaken/bewerken van een artikel)
 *  - api/beheer-btw-tarieven (beheerder-only, volledige historie + nieuw tarief toevoegen)
 *  - api/_gedeeld/artikelenKlanten.js en artikelenAlgemeen.js (om het percentage bij
 *    een gekozen btw_code op te zoeken op het moment van opslaan)
 */
const { sql, haalPool } = require("./facturatieDb");

const GELDIGE_CODES = ["nul", "laag", "hoog", "vrijgesteld"];

function naarBuiten(row) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    percentage: Number(row.percentage),
    geldigVanaf: row.geldig_vanaf,
    geldigTot: row.geldig_tot,
  };
}

/** Alle tarieven, nieuwste eerst per code — voor het beheerscherm. */
async function haalAlleTarieven() {
  const pool = await haalPool();
  const result = await pool
    .request()
    .query("SELECT * FROM dbo.btw_tarieven ORDER BY code, geldig_vanaf DESC");
  return result.recordset.map(naarBuiten);
}

/** Het huidig geldige tarief per code, voor `datum` (standaard: vandaag). */
async function haalActueleTarieven(datum = null) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("datum", sql.Date, datum || new Date());
  const result = await request.query(`
    SELECT * FROM dbo.btw_tarieven
    WHERE geldig_vanaf <= @datum AND (geldig_tot IS NULL OR geldig_tot >= @datum)
    ORDER BY code
  `);
  return result.recordset.map(naarBuiten);
}

/** Het percentage voor één specifieke code, voor `datum` (standaard: vandaag).
 * Valt terug op 21 (hoog) als er onverhoopt geen geldig tarief gevonden wordt,
 * zodat een ontbrekend tarief nooit een factuur blokkeert. */
async function haalActueelPercentage(code, datum = null) {
  if (!GELDIGE_CODES.includes(code)) return 21;
  const tarieven = await haalActueleTarieven(datum);
  const gevonden = tarieven.find((t) => t.code === code);
  return gevonden ? gevonden.percentage : 21;
}

/**
 * Voegt een nieuw tarief toe voor `code`, geldig vanaf `geldigVanaf`. Sluit automatisch
 * het vorige, nog actieve tarief van diezelfde code af (geldig_tot = geldigVanaf - 1 dag),
 * zodat er nooit twee overlappende geldige tarieven voor dezelfde code bestaan.
 */
async function maakTarief({ code, label, percentage, geldigVanaf }, email) {
  if (!GELDIGE_CODES.includes(code)) {
    throw new Error("VALIDATIE: ongeldige btw-code.");
  }
  if (percentage == null || Number.isNaN(Number(percentage))) {
    throw new Error("VALIDATIE: percentage is verplicht.");
  }
  if (!geldigVanaf) {
    throw new Error("VALIDATIE: geldig-vanaf-datum is verplicht.");
  }
  const pool = await haalPool();

  // Vorige actieve tarief voor deze code afsluiten (indien aanwezig).
  const sluitRequest = pool.request();
  sluitRequest.input("code", sql.VarChar(20), code);
  sluitRequest.input("geldigVanaf", sql.Date, geldigVanaf);
  await sluitRequest.query(`
    UPDATE dbo.btw_tarieven
    SET geldig_tot = DATEADD(DAY, -1, @geldigVanaf)
    WHERE code = @code AND (geldig_tot IS NULL OR geldig_tot >= @geldigVanaf) AND geldig_vanaf < @geldigVanaf
  `);

  const request = pool.request();
  request.input("code", sql.VarChar(20), code);
  request.input("label", sql.NVarChar(50), label || code);
  request.input("percentage", sql.Decimal(5, 2), Number(percentage));
  request.input("geldigVanaf", sql.Date, geldigVanaf);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.btw_tarieven (code, label, percentage, geldig_vanaf, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES (@code, @label, @percentage, @geldigVanaf, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/** Corrigeert een reeds ingevoerd tarief (bijv. typefout in percentage of datum). */
async function wijzigTarief(id, data) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("label", sql.NVarChar(50), data.label || null);
  request.input("percentage", sql.Decimal(5, 2), data.percentage != null ? Number(data.percentage) : null);
  request.input("geldigVanaf", sql.Date, data.geldigVanaf || null);
  request.input("geldigTot", sql.Date, data.geldigTot || null);
  const result = await request.query(`
    UPDATE dbo.btw_tarieven SET
      label = COALESCE(@label, label),
      percentage = COALESCE(@percentage, percentage),
      geldig_vanaf = COALESCE(@geldigVanaf, geldig_vanaf),
      geldig_tot = @geldigTot
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

module.exports = {
  GELDIGE_CODES,
  haalAlleTarieven,
  haalActueleTarieven,
  haalActueelPercentage,
  maakTarief,
  wijzigTarief,
};
