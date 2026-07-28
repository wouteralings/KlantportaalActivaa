/**
 * CRUD voor dbo.klanten_klanten: de eigen (eind)klanten van een portaalklant — dus NIET de
 * Activaa-klanten uit Dynamics, maar bijv. de klanten van "Hoveniersbedrijf Jansen".
 *
 * BELANGRIJK: elke functie hier neemt klantAccountId (de Dataverse Account-id van de
 * ingelogde portaalklant, uit herleidAccounts()) als verplicht filter/kolom. Dat is de
 * enige plek waar wordt afgedwongen dat een klant nooit de klanten van een andere
 * portaalklant ziet — laat dit nooit weg bij nieuwe query's.
 */
const { sql, haalPool } = require("./facturatieDb");

function naarBuiten(row) {
  return {
    id: row.id,
    naam: row.naam,
    contactpersoon: row.contactpersoon || "",
    email: row.email || "",
    telefoon: row.telefoon || "",
    adres: {
      straat: row.straat || "",
      huisnummer: row.huisnummer || "",
      toevoeging: row.toevoeging || "",
      postcode: row.postcode || "",
      plaats: row.plaats || "",
      land: row.land || "NL",
    },
    btwNummer: row.btw_nummer || "",
    kvkNummer: row.kvk_nummer || "",
    iban: row.iban || "",
    opmerkingen: row.opmerkingen || "",
    actief: !!row.actief,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

async function haalKlanten(klantAccountId, { alleenActief = true, zoek = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (alleenActief) where += " AND actief = 1";
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND (naam LIKE @zoek OR email LIKE @zoek OR contactpersoon LIKE @zoek)";
  }
  const result = await request.query(`SELECT * FROM dbo.klanten_klanten WHERE ${where} ORDER BY naam`);
  return result.recordset.map(naarBuiten);
}

async function haalKlant(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.klanten_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakKlant(klantAccountId, data, email) {
  if (!data || !String(data.naam || "").trim()) throw new Error("VALIDATIE: naam is verplicht.");
  const adres = data.adres || {};
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("naam", sql.NVarChar(200), String(data.naam).trim());
  request.input("contactpersoon", sql.NVarChar(200), data.contactpersoon || null);
  request.input("email", sql.NVarChar(320), data.email || null);
  request.input("telefoon", sql.NVarChar(50), data.telefoon || null);
  request.input("straat", sql.NVarChar(150), adres.straat || null);
  request.input("huisnummer", sql.NVarChar(20), adres.huisnummer || null);
  request.input("toevoeging", sql.NVarChar(20), adres.toevoeging || null);
  request.input("postcode", sql.NVarChar(20), adres.postcode || null);
  request.input("plaats", sql.NVarChar(100), adres.plaats || null);
  request.input("land", sql.NVarChar(2), adres.land || "NL");
  request.input("btwNummer", sql.NVarChar(30), data.btwNummer || null);
  request.input("kvkNummer", sql.NVarChar(20), data.kvkNummer || null);
  request.input("iban", sql.NVarChar(34), data.iban || null);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen || null);
  request.input("email2", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.klanten_klanten
      (klant_account_id, naam, contactpersoon, email, telefoon, straat, huisnummer, toevoeging,
       postcode, plaats, land, btw_nummer, kvk_nummer, iban, opmerkingen, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @naam, @contactpersoon, @email, @telefoon, @straat, @huisnummer, @toevoeging,
       @postcode, @plaats, @land, @btwNummer, @kvkNummer, @iban, @opmerkingen, @email2)
  `);
  return naarBuiten(result.recordset[0]);
}

async function wijzigKlant(klantAccountId, id, data, email) {
  const bestaand = await haalKlant(klantAccountId, id);
  if (!bestaand) return null;
  const adres = data.adres || {};
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("naam", sql.NVarChar(200), String(data.naam ?? bestaand.naam).trim());
  request.input("contactpersoon", sql.NVarChar(200), data.contactpersoon ?? bestaand.contactpersoon ?? null);
  request.input("email", sql.NVarChar(320), data.email ?? bestaand.email ?? null);
  request.input("telefoon", sql.NVarChar(50), data.telefoon ?? bestaand.telefoon ?? null);
  request.input("straat", sql.NVarChar(150), adres.straat ?? bestaand.adres.straat ?? null);
  request.input("huisnummer", sql.NVarChar(20), adres.huisnummer ?? bestaand.adres.huisnummer ?? null);
  request.input("toevoeging", sql.NVarChar(20), adres.toevoeging ?? bestaand.adres.toevoeging ?? null);
  request.input("postcode", sql.NVarChar(20), adres.postcode ?? bestaand.adres.postcode ?? null);
  request.input("plaats", sql.NVarChar(100), adres.plaats ?? bestaand.adres.plaats ?? null);
  request.input("land", sql.NVarChar(2), adres.land ?? bestaand.adres.land ?? "NL");
  request.input("btwNummer", sql.NVarChar(30), data.btwNummer ?? bestaand.btwNummer ?? null);
  request.input("kvkNummer", sql.NVarChar(20), data.kvkNummer ?? bestaand.kvkNummer ?? null);
  request.input("iban", sql.NVarChar(34), data.iban ?? bestaand.iban ?? null);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen ?? bestaand.opmerkingen ?? null);
  request.input("actief", sql.Bit, data.actief ?? bestaand.actief ? 1 : 0);
  request.input("email2", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.klanten_klanten SET
      naam = @naam, contactpersoon = @contactpersoon, email = @email, telefoon = @telefoon,
      straat = @straat, huisnummer = @huisnummer, toevoeging = @toevoeging, postcode = @postcode,
      plaats = @plaats, land = @land, btw_nummer = @btwNummer, kvk_nummer = @kvkNummer,
      iban = @iban, opmerkingen = @opmerkingen, actief = @actief,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email2
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Zachte verwijdering (actief = 0) — een klant_klant kan al aan facturen gekoppeld zijn, dus
 * we verwijderen nooit hard. */
async function verwijderKlant(klantAccountId, id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.klanten_klanten SET actief = 0, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

module.exports = { haalKlanten, haalKlant, maakKlant, wijzigKlant, verwijderKlant };
