/**
 * dbo.bedrijfsgegevens_klanten — de eigen afzendergegevens (+ logo) van een portaalklant:
 * bedrijfsnaam, adres, KvK-/BTW-nummer, IBAN en logo. Dit zijn de gegevens die straks
 * bovenaan facturen/offertes komen te staan die de klant aan zijn EIGEN (eind)klanten
 * stuurt ("Van:") — dus iets anders dan dbo.klanten_klanten (de eindklanten zelf).
 *
 * Eén rij per klant_account_id: haalGegevens/zetGegevens doen zelf de upsert, de rest van
 * de app hoeft nooit met een id te werken.
 */
const { sql, haalPool } = require("./facturatieDb");

const LEEG = {
  bedrijfsnaam: "", straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "", land: "NL",
  kvkNummer: "", btwNummer: "", iban: "", ibanTenaamstelling: "", logoUrl: "", ccEmail: "",
};

function naarBuiten(row) {
  if (!row) return { ...LEEG };
  return {
    bedrijfsnaam: row.bedrijfsnaam || "",
    straat: row.straat || "",
    huisnummer: row.huisnummer || "",
    toevoeging: row.toevoeging || "",
    postcode: row.postcode || "",
    plaats: row.plaats || "",
    land: row.land || "NL",
    kvkNummer: row.kvk_nummer || "",
    btwNummer: row.btw_nummer || "",
    iban: row.iban || "",
    ibanTenaamstelling: row.iban_tenaamstelling || "",
    logoUrl: row.logo_url || "",
    // Eigen CC-mailadres bij versturen (bevestiging dat een factuur/offerte is verstuurd) —
    // sinds 29-07-2026, puur een eigen voorkeur, geen Dynamics-tegenhanger.
    ccEmail: row.cc_email || "",
    gewijzigdOp: row.gewijzigd_op || row.aangemaakt_op || null,
  };
}

async function haalRij(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query("SELECT * FROM dbo.bedrijfsgegevens_klanten WHERE klant_account_id = @klantAccountId");
  return result.recordset[0] || null;
}

/** De bedrijfsgegevens voor één klant-account, of lege standaardwaarden als er nog niets is opgeslagen. */
async function haalGegevens(klantAccountId) {
  return naarBuiten(await haalRij(klantAccountId));
}

/**
 * Slaat (een deel van) de bedrijfsgegevens op — upsert. Alleen de meegegeven velden
 * worden gewijzigd, de rest blijft staan (zo kan bijv. alleen het logo bijgewerkt worden
 * zonder de rest van het formulier opnieuw mee te sturen).
 */
async function zetGegevens(klantAccountId, data, email) {
  const bestaand = await haalRij(klantAccountId);
  const veld = (naam, terugval = "") => (data && data[naam] !== undefined ? data[naam] : (bestaand ? bestaand[terugvalKolom(naam)] : terugval));

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("bedrijfsnaam", sql.NVarChar(300), String(veld("bedrijfsnaam")).trim());
  request.input("straat", sql.NVarChar(200), veld("straat") || null);
  request.input("huisnummer", sql.NVarChar(20), veld("huisnummer") || null);
  request.input("toevoeging", sql.NVarChar(20), veld("toevoeging") || null);
  request.input("postcode", sql.NVarChar(20), veld("postcode") || null);
  request.input("plaats", sql.NVarChar(150), veld("plaats") || null);
  request.input("land", sql.NVarChar(80), veld("land") || "NL");
  request.input("kvkNummer", sql.NVarChar(20), veld("kvkNummer") || null);
  request.input("btwNummer", sql.NVarChar(30), veld("btwNummer") || null);
  request.input("iban", sql.NVarChar(34), veld("iban") || null);
  request.input("ibanTenaamstelling", sql.NVarChar(200), veld("ibanTenaamstelling") || null);
  request.input("logoUrl", sql.NVarChar(500), veld("logoUrl") || null);
  request.input("ccEmail", sql.NVarChar(320), veld("ccEmail") || null);
  request.input("email", sql.NVarChar(320), email || null);

  if (bestaand) {
    const result = await request.query(`
      UPDATE dbo.bedrijfsgegevens_klanten SET
        bedrijfsnaam = @bedrijfsnaam, straat = @straat, huisnummer = @huisnummer, toevoeging = @toevoeging,
        postcode = @postcode, plaats = @plaats, land = @land, kvk_nummer = @kvkNummer, btw_nummer = @btwNummer,
        iban = @iban, iban_tenaamstelling = @ibanTenaamstelling, logo_url = @logoUrl, cc_email = @ccEmail,
        gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
      OUTPUT INSERTED.*
      WHERE klant_account_id = @klantAccountId
    `);
    return naarBuiten(result.recordset[0]);
  }

  const result = await request.query(`
    INSERT INTO dbo.bedrijfsgegevens_klanten
      (klant_account_id, bedrijfsnaam, straat, huisnummer, toevoeging, postcode, plaats, land,
       kvk_nummer, btw_nummer, iban, iban_tenaamstelling, logo_url, cc_email, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @bedrijfsnaam, @straat, @huisnummer, @toevoeging, @postcode, @plaats, @land,
       @kvkNummer, @btwNummer, @iban, @ibanTenaamstelling, @logoUrl, @ccEmail, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

// Map van de camelCase-veldnamen (zoals in de API/front-end) naar hun SQL-kolomnaam, voor
// het terugvallen op de bestaande waarde als een veld niet is meegegeven in zetGegevens().
function terugvalKolom(naam) {
  const MAP = {
    bedrijfsnaam: "bedrijfsnaam", straat: "straat", huisnummer: "huisnummer", toevoeging: "toevoeging",
    postcode: "postcode", plaats: "plaats", land: "land", kvkNummer: "kvk_nummer", btwNummer: "btw_nummer",
    iban: "iban", ibanTenaamstelling: "iban_tenaamstelling", logoUrl: "logo_url", ccEmail: "cc_email",
  };
  return MAP[naam] || naam;
}

module.exports = { haalGegevens, zetGegevens };
