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
const { haalDynamicsToken, haalAccountOpId, IBAN_VELD, IBAN_TENAAMSTELLING_VELD, CC_EMAIL_VELD } = require("./identiteit");

// Zelfde veldnamen als wijzigingsverzoek/index.js gebruikt voor het bedrijfsgegevens-formulier
// (type bedrijfsgegevens_facturatie) — bewust hier opnieuw gedefinieerd i.p.v. geïmporteerd,
// dat bestand doet dat ook zo (elke Dynamics-veldnaam is los overschrijfbaar via zijn eigen
// Application Setting).
const KVK_VELD_NAAM = process.env.DYNAMICS_KVK_VELD || "accountnumber";
const BTW_VELD_NAAM = process.env.DYNAMICS_BTW_VELD || "sk_btwnummer";

// Als één van deze velden leeg is in dbo.bedrijfsgegevens_klanten, vullen we best-effort aan
// vanuit Dynamics — zelfde velden als het bedrijfsgegevens-formulier zelf als "aan te vullen"
// beschouwt.
const AAN_TE_VULLEN_VELDEN = [
  "bedrijfsnaam", "straat", "postcode", "plaats", "kvkNummer", "btwNummer", "iban", "ibanTenaamstelling",
];

const LEEG = {
  bedrijfsnaam: "", straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "", land: "NL",
  kvkNummer: "", btwNummer: "", iban: "", ibanTenaamstelling: "", logoUrl: "", ccEmail: "",
  standaardBetalingstermijn: null, standaardBtwCode: "", standaardFactuurtekst: "",
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
    // sinds 29-07-2026 een eigen voorkeur, direct zelf te wijzigen (geen goedkeuring nodig); sinds
    // 29-07-2026 (later die dag) ook best-effort naar Dynamics geschreven als vangnet
    // (cr283_ccbijversturen, zie identiteit.js/CC_EMAIL_VELD) — de terugval daarvandaan gebeurt
    // in haalGegevensMetCrmAanvulling hieronder, niet hier (dit is de kale SQL-rij).
    ccEmail: row.cc_email || "",
    // Standaardwaarden voor een NIEUWE factuur/offerte (migratie 007, 29-07-2026) — vullen alleen
    // het formulier voor, ze zijn geen verificatiegegeven en hebben dus ook geen Dynamics-
    // tegenhanger. `standaardBetalingstermijn` blijft bewust `null` (i.p.v. 0) als er niets is
    // ingesteld, zodat het front-end verschil kan maken tussen "geen voorkeur" en "0 dagen".
    standaardBetalingstermijn: row.standaard_betalingstermijn ?? null,
    standaardBtwCode: row.standaard_btw_code || "",
    standaardFactuurtekst: row.standaard_factuurtekst || "",
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
 * Zelfde als haalGegevens(), maar vult ontbrekende velden best-effort aan vanuit Dynamics —
 * exact dezelfde SQL-eerst/Dynamics-terugval-logica als het bedrijfsgegevens-formulier zelf
 * gebruikt (zie api/wijzigingsverzoek/index.js, type bedrijfsgegevens_facturatie).
 *
 * Nodig omdat het genereren van de ECHTE factuur/offerte-PDF (en de bijbehorende e-mail) tot nu
 * toe alleen de ruwe SQL-rij las, terwijl het scherm-voorbeeld in de Facturatiemodule deze
 * Dynamics-aanvulling al wél toepaste — zie Context/Facturatiemodule.md (29-07-2026): eigen
 * bedrijfsnaam/adres/KvK/BTW en IBAN-betaalgegevens ontbraken op de gedownloade PDF terwijl het
 * voorbeeld ze wel toonde, omdat de achtergrond-synchronisatie naar SQL voor dit account
 * (nog) niet volledig was gelukt.
 *
 * Faalt de Dynamics-aanroep om wat voor reden dan ook (config, netwerk, onbekend account, ...),
 * dan wordt gewoon de eigen (mogelijk onvolledige) SQL-rij teruggegeven — dit mag het genereren
 * van een PDF/e-mail nooit blokkeren.
 */
async function haalGegevensMetCrmAanvulling(klantAccountId) {
  const opgeslagen = await haalGegevens(klantAccountId);
  const ontbreektIets = AAN_TE_VULLEN_VELDEN.some((veld) => !opgeslagen[veld]);
  if (!ontbreektIets) return opgeslagen;

  try {
    const token = await haalDynamicsToken();
    const raw = await haalAccountOpId(klantAccountId, token);
    if (!raw) return opgeslagen;

    return {
      ...opgeslagen,
      bedrijfsnaam: opgeslagen.bedrijfsnaam || raw.name || "",
      straat: opgeslagen.straat || raw.address1_line1 || "",
      huisnummer: opgeslagen.huisnummer || raw.cr283_huisnummer || "",
      toevoeging: opgeslagen.toevoeging || raw.cr283_huisnummertoevoeging || "",
      postcode: opgeslagen.postcode || raw.address1_postalcode || "",
      plaats: opgeslagen.plaats || raw.address1_city || "",
      land: opgeslagen.land || raw.address1_country || "NL",
      kvkNummer: opgeslagen.kvkNummer || (raw[KVK_VELD_NAAM] || "").toString().trim(),
      btwNummer: opgeslagen.btwNummer || (raw[BTW_VELD_NAAM] || "").toString().trim(),
      iban: opgeslagen.iban || (raw[IBAN_VELD] || "").toString().trim(),
      ibanTenaamstelling: opgeslagen.ibanTenaamstelling || (raw[IBAN_TENAAMSTELLING_VELD] || "").toString().trim(),
      // ccEmail zit bewust niet in AAN_TE_VULLEN_VELDEN hierboven (het ontbreken ervan is de
      // normale situatie voor de meeste klanten, dus geen reden om altijd een Dynamics-aanroep
      // te doen) — maar gebeurt die aanroep al vanwege een ander ontbrekend veld, dan vullen we
      // 'm hier gratis mee aan als vangnet tegen dezelfde SQL-schrijfbug.
      ccEmail: opgeslagen.ccEmail || (raw[CC_EMAIL_VELD] || "").toString().trim(),
    };
  } catch {
    return opgeslagen;
  }
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
  // Standaardwaarden (migratie 007) — standaardBetalingstermijn mag écht `null` zijn (= geen
  // voorkeur ingesteld, front-end valt dan zelf terug op 30 dagen); vandaar hier bewust geen
  // `|| null` (dat zou ook 0 tot null maken) maar een expliciete undefined/null-check.
  const standaardBetalingstermijnWaarde = veld("standaardBetalingstermijn", null);
  request.input("standaardBetalingstermijn", sql.Int, standaardBetalingstermijnWaarde === "" || standaardBetalingstermijnWaarde == null ? null : Number(standaardBetalingstermijnWaarde));
  request.input("standaardBtwCode", sql.NVarChar(20), veld("standaardBtwCode") || null);
  request.input("standaardFactuurtekst", sql.NVarChar(sql.MAX), veld("standaardFactuurtekst") || null);
  request.input("email", sql.NVarChar(320), email || null);

  if (bestaand) {
    const result = await request.query(`
      UPDATE dbo.bedrijfsgegevens_klanten SET
        bedrijfsnaam = @bedrijfsnaam, straat = @straat, huisnummer = @huisnummer, toevoeging = @toevoeging,
        postcode = @postcode, plaats = @plaats, land = @land, kvk_nummer = @kvkNummer, btw_nummer = @btwNummer,
        iban = @iban, iban_tenaamstelling = @ibanTenaamstelling, logo_url = @logoUrl, cc_email = @ccEmail,
        standaard_betalingstermijn = @standaardBetalingstermijn, standaard_btw_code = @standaardBtwCode,
        standaard_factuurtekst = @standaardFactuurtekst,
        gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
      OUTPUT INSERTED.*
      WHERE klant_account_id = @klantAccountId
    `);
    return naarBuiten(result.recordset[0]);
  }

  const result = await request.query(`
    INSERT INTO dbo.bedrijfsgegevens_klanten
      (klant_account_id, bedrijfsnaam, straat, huisnummer, toevoeging, postcode, plaats, land,
       kvk_nummer, btw_nummer, iban, iban_tenaamstelling, logo_url, cc_email,
       standaard_betalingstermijn, standaard_btw_code, standaard_factuurtekst, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @bedrijfsnaam, @straat, @huisnummer, @toevoeging, @postcode, @plaats, @land,
       @kvkNummer, @btwNummer, @iban, @ibanTenaamstelling, @logoUrl, @ccEmail,
       @standaardBetalingstermijn, @standaardBtwCode, @standaardFactuurtekst, @email)
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
    standaardBetalingstermijn: "standaard_betalingstermijn", standaardBtwCode: "standaard_btw_code",
    standaardFactuurtekst: "standaard_factuurtekst",
  };
  return MAP[naam] || naam;
}

module.exports = { haalGegevens, zetGegevens, haalGegevensMetCrmAanvulling };
