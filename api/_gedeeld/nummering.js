/**
 * Automatische, doorlopende nummering per portaalklant + documenttype (factuur / offerte /
 * creditnota), zoals in Beheer → Instellingen → Standaardwaarden (prefix + startnummer,
 * bijv. "F" → volgende F0001). Elke klant heeft zijn eigen reeks; die staat in de tabel
 * dbo.nummerreeksen_klanten (zie db/migrations/001_facturatiemodule.sql).
 *
 * Een nummer wordt pas toegekend bij het VERSTUREN van een document (niet bij het aanmaken
 * van een concept) — zo ontstaan er geen gaten in de reeks door weggegooide concepten.
 *
 * De rij wordt met UPDLOCK+HOLDLOCK binnen een transactie gelezen en verhoogd, zodat twee
 * gelijktijdige "versturen"-aanvragen (bijv. twee tabbladen) nooit hetzelfde nummer krijgen.
 */
const { sql, haalPool } = require("./facturatieDb");

const STANDAARD_PER_TYPE = {
  factuur: { prefix: "F", start: 1 },
  offerte: { prefix: "OFF", start: 1 },
  creditnota: { prefix: "C", start: 1 },
};

/** Haalt (indien nodig aangemaakt op basis van de standaardwaarden) prefix + eerstvolgend
 * nummer op, hoogt de teller met 1 op, en geeft het opgemaakte nummer terug (bijv. "F0001"). */
async function volgendNummer(klantAccountId, documenttype) {
  const standaard = STANDAARD_PER_TYPE[documenttype];
  if (!standaard) throw new Error(`Onbekend documenttype voor nummering: ${documenttype}`);

  const pool = await haalPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const leesRequest = new sql.Request(transaction);
    leesRequest.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
    leesRequest.input("documenttype", sql.VarChar(20), documenttype);
    const huidig = await leesRequest.query(`
      SELECT prefix, volgend_nummer
      FROM dbo.nummerreeksen_klanten WITH (UPDLOCK, HOLDLOCK)
      WHERE klant_account_id = @klantAccountId AND documenttype = @documenttype
    `);

    let prefix;
    let volgnummer;

    if (huidig.recordset.length === 0) {
      prefix = standaard.prefix;
      volgnummer = standaard.start;
      const insertRequest = new sql.Request(transaction);
      insertRequest.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
      insertRequest.input("documenttype", sql.VarChar(20), documenttype);
      insertRequest.input("prefix", sql.NVarChar(20), prefix);
      insertRequest.input("volgend", sql.Int, volgnummer + 1);
      await insertRequest.query(`
        INSERT INTO dbo.nummerreeksen_klanten (klant_account_id, documenttype, prefix, volgend_nummer)
        VALUES (@klantAccountId, @documenttype, @prefix, @volgend)
      `);
    } else {
      prefix = huidig.recordset[0].prefix;
      volgnummer = huidig.recordset[0].volgend_nummer;
      const updateRequest = new sql.Request(transaction);
      updateRequest.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
      updateRequest.input("documenttype", sql.VarChar(20), documenttype);
      updateRequest.input("volgend", sql.Int, volgnummer + 1);
      await updateRequest.query(`
        UPDATE dbo.nummerreeksen_klanten SET volgend_nummer = @volgend
        WHERE klant_account_id = @klantAccountId AND documenttype = @documenttype
      `);
    }

    await transaction.commit();
    return `${prefix}${String(volgnummer).padStart(4, "0")}`;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/** Voor Beheer → Instellingen → Standaardwaarden: huidig prefix + eerstvolgend nummer per type
 * (zonder er een te verbruiken), met terugval op de standaardwaarden als er nog geen reeks is. */
async function haalReeksen(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query(`
    SELECT documenttype, prefix, volgend_nummer
    FROM dbo.nummerreeksen_klanten
    WHERE klant_account_id = @klantAccountId
  `);
  const bestaand = Object.fromEntries(result.recordset.map((r) => [r.documenttype, r]));
  return Object.entries(STANDAARD_PER_TYPE).map(([documenttype, standaard]) => {
    const rij = bestaand[documenttype];
    return {
      documenttype,
      prefix: rij ? rij.prefix : standaard.prefix,
      volgendNummer: rij ? rij.volgend_nummer : standaard.start,
    };
  });
}

module.exports = { volgendNummer, haalReeksen, STANDAARD_PER_TYPE };
