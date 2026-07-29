/**
 * dbo.facturen_terugkerend — "sjablonen" voor terugkerende facturen (abonnementen), bijv.
 * een maandelijkse managementfee. Dit CRUD-bestand beheert alleen de sjablonen zelf; het
 * daadwerkelijk aanmaken (en evt. versturen) van de concrete facturen_klanten-rijen gebeurt
 * in api/verwerk-terugkerende-facturen (zie genereerVervallenFacturen hieronder), aangeroepen
 * via een extern schema (bijv. een dagelijkse Power Automate-flow) — Azure Static Web Apps'
 * managed functions ondersteunen zelf geen tijdklok-trigger.
 *
 * Elke cyclus schuiven zowel `volgende_factuurdatum` als de leveringsperiode
 * (`leveringsperiode_start`/`_eind`) een frequentie-stap op — zo toont bijv. een maandelijkse
 * factuur automatisch telkens de juiste maand als leveringsperiode, zonder dat iemand dat
 * handmatig hoeft bij te werken.
 */
const { sql, haalPool } = require("./facturatieDb");
const { haalKlant } = require("./klantenKlanten");
const { berekenTotalen } = require("./facturenKlanten");

const GELDIGE_FREQUENTIES = ["wekelijks", "maandelijks", "kwartaal", "jaarlijks"];

/** Telt één frequentie-stap op bij een datum (UTC, want het zijn DATE-kolommen zonder tijd —
 * lokale-tijdzone-rekenwerk zou hier per ongeluk een dag kunnen laten verspringen). */
function voegFrequentieToe(datumInvoer, frequentie, aantalStappen = 1) {
  const d = new Date(datumInvoer);
  switch (frequentie) {
    case "wekelijks":
      d.setUTCDate(d.getUTCDate() + 7 * aantalStappen);
      break;
    case "maandelijks":
      d.setUTCMonth(d.getUTCMonth() + aantalStappen);
      break;
    case "kwartaal":
      d.setUTCMonth(d.getUTCMonth() + 3 * aantalStappen);
      break;
    case "jaarlijks":
      d.setUTCFullYear(d.getUTCFullYear() + aantalStappen);
      break;
    default:
      throw new Error(`Onbekende frequentie: ${frequentie}`);
  }
  return d;
}

function naarBuiten(row) {
  return {
    id: row.id,
    // Alleen relevant voor de cross-tenant generator (haalVervallenSjablonen — zie onderaan
    // dit bestand); bij de per-account functies is dit altijd al de accountId die de
    // aanroeper zelf meegaf, dus geen extra informatie die kan lekken.
    klantAccountId: row.klant_account_id,
    klantKlantId: row.klant_klant_id,
    frequentie: row.frequentie,
    startdatum: row.startdatum,
    einddatum: row.einddatum || null,
    volgendeFactuurdatum: row.volgende_factuurdatum,
    leveringsperiodeStart: row.leveringsperiode_start || null,
    leveringsperiodeEind: row.leveringsperiode_eind || null,
    automatischVerzenden: !!row.automatisch_verzenden,
    betalingstermijnDagen: row.betalingstermijn_dagen,
    regels: JSON.parse(row.regels_json || "[]"),
    opmerkingen: row.opmerkingen || "",
    actief: !!row.actief,
    aantalGegenereerd: row.aantal_gegenereerd,
    laatstGegenereerdOp: row.laatst_gegenereerd_op || null,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

async function haalTerugkerendVoorAccount(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query(`
    SELECT * FROM dbo.facturen_terugkerend
    WHERE klant_account_id = @klantAccountId
    ORDER BY actief DESC, volgende_factuurdatum ASC
  `);
  return result.recordset.map(naarBuiten);
}

async function haalTerugkerend(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    SELECT * FROM dbo.facturen_terugkerend WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakTerugkerend(klantAccountId, data, email) {
  if (!data.klantKlantId) throw new Error("VALIDATIE: klantKlantId is verplicht.");
  const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
  if (!klantKlant) throw new Error("VALIDATIE: onbekende klant_klant (of hoort bij een andere account).");
  if (!GELDIGE_FREQUENTIES.includes(data.frequentie)) {
    throw new Error("VALIDATIE: frequentie moet wekelijks, maandelijks, kwartaal of jaarlijks zijn.");
  }
  if (!data.startdatum) throw new Error("VALIDATIE: startdatum is verplicht.");

  const { regels } = berekenTotalen(data.regels);
  const startdatum = new Date(data.startdatum);
  const einddatum = data.einddatum ? new Date(data.einddatum) : null;
  if (einddatum && einddatum < startdatum) {
    throw new Error("VALIDATIE: einddatum kan niet vóór de startdatum liggen.");
  }

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId);
  request.input("frequentie", sql.VarChar(20), data.frequentie);
  request.input("startdatum", sql.Date, startdatum);
  request.input("einddatum", sql.Date, einddatum);
  request.input("volgendeFactuurdatum", sql.Date, startdatum);
  request.input("leveringsperiodeStart", sql.Date, data.leveringsperiodeStart ? new Date(data.leveringsperiodeStart) : null);
  request.input("leveringsperiodeEind", sql.Date, data.leveringsperiodeEind ? new Date(data.leveringsperiodeEind) : null);
  request.input("automatischVerzenden", sql.Bit, !!data.automatischVerzenden);
  request.input("betalingstermijnDagen", sql.Int, Number(data.betalingstermijnDagen) || 30);
  request.input("regelsJson", sql.NVarChar(sql.MAX), JSON.stringify(regels));
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen || null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.facturen_terugkerend
      (klant_account_id, klant_klant_id, frequentie, startdatum, einddatum, volgende_factuurdatum,
       leveringsperiode_start, leveringsperiode_eind, automatisch_verzenden, betalingstermijn_dagen,
       regels_json, opmerkingen, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @klantKlantId, @frequentie, @startdatum, @einddatum, @volgendeFactuurdatum,
       @leveringsperiodeStart, @leveringsperiodeEind, @automatischVerzenden, @betalingstermijnDagen,
       @regelsJson, @opmerkingen, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/** Pauzeren/hervatten (actief) of de sjabloon zelf bewerken — een wijziging aan regels/
 * frequentie/etc. raakt alleen nog te genereren facturen, nooit al eerder aangemaakte.
 *
 * Startdatum is alleen zonder gevolgen aan te passen zolang er nog nooit een factuur uit dit
 * sjabloon is gegenereerd (aantalGegenereerd === 0): dan is startdatum nog hetzelfde moment als
 * volgendeFactuurdatum, dus schuift die automatisch mee. Is er al wél gegenereerd, dan is
 * startdatum alleen nog een historisch gegeven (wanneer het abonnement ooit inging) — de
 * eerstvolgende factuurdatum blijft dan onaangeroerd. */
async function wijzigTerugkerend(klantAccountId, id, data, email) {
  const bestaand = await haalTerugkerend(klantAccountId, id);
  if (!bestaand) return null;

  const frequentie = data.frequentie !== undefined ? data.frequentie : bestaand.frequentie;
  if (!GELDIGE_FREQUENTIES.includes(frequentie)) {
    throw new Error("VALIDATIE: frequentie moet wekelijks, maandelijks, kwartaal of jaarlijks zijn.");
  }
  const regelsBron = data.regels !== undefined ? data.regels : bestaand.regels;
  const { regels } = berekenTotalen(regelsBron);

  let startdatum = new Date(bestaand.startdatum);
  let volgendeFactuurdatum = new Date(bestaand.volgendeFactuurdatum);
  if (data.startdatum !== undefined) {
    if (!data.startdatum) throw new Error("VALIDATIE: startdatum is verplicht.");
    startdatum = new Date(data.startdatum);
    if (bestaand.aantalGegenereerd === 0) {
      volgendeFactuurdatum = startdatum;
    } else if (startdatum > volgendeFactuurdatum) {
      throw new Error("VALIDATIE: startdatum kan niet na de eerstvolgende factuurdatum liggen.");
    }
  }

  const einddatum = data.einddatum !== undefined ? (data.einddatum ? new Date(data.einddatum) : null) : (bestaand.einddatum ? new Date(bestaand.einddatum) : null);
  if (einddatum && einddatum < startdatum) {
    throw new Error("VALIDATIE: einddatum kan niet vóór de startdatum liggen.");
  }

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("frequentie", sql.VarChar(20), frequentie);
  request.input("startdatum", sql.Date, startdatum);
  request.input("volgendeFactuurdatum", sql.Date, volgendeFactuurdatum);
  request.input("einddatum", sql.Date, einddatum);
  request.input("leveringsperiodeStart", sql.Date, data.leveringsperiodeStart !== undefined ? (data.leveringsperiodeStart ? new Date(data.leveringsperiodeStart) : null) : bestaand.leveringsperiodeStart);
  request.input("leveringsperiodeEind", sql.Date, data.leveringsperiodeEind !== undefined ? (data.leveringsperiodeEind ? new Date(data.leveringsperiodeEind) : null) : bestaand.leveringsperiodeEind);
  request.input("automatischVerzenden", sql.Bit, data.automatischVerzenden !== undefined ? !!data.automatischVerzenden : bestaand.automatischVerzenden);
  request.input("betalingstermijnDagen", sql.Int, data.betalingstermijnDagen !== undefined ? Number(data.betalingstermijnDagen) || 30 : bestaand.betalingstermijnDagen);
  request.input("regelsJson", sql.NVarChar(sql.MAX), JSON.stringify(regels));
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen !== undefined ? data.opmerkingen : bestaand.opmerkingen);
  request.input("actief", sql.Bit, data.actief !== undefined ? !!data.actief : bestaand.actief);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.facturen_terugkerend SET
      frequentie = @frequentie, startdatum = @startdatum, volgende_factuurdatum = @volgendeFactuurdatum,
      einddatum = @einddatum, leveringsperiode_start = @leveringsperiodeStart,
      leveringsperiode_eind = @leveringsperiodeEind, automatisch_verzenden = @automatischVerzenden,
      betalingstermijn_dagen = @betalingstermijnDagen, regels_json = @regelsJson,
      opmerkingen = @opmerkingen, actief = @actief, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function verwijderTerugkerend(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    DELETE FROM dbo.facturen_terugkerend OUTPUT DELETED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

/** Alle actieve sjablonen die vandaag (of eerder) aan de beurt zijn — over ALLE accounts
 * heen, dus zonder klantAccountId-filter. Alleen gebruikt door de generator (verwerk-
 * terugkerende-facturen), nooit door een klant-facing endpoint. */
async function haalVervallenSjablonen() {
  const pool = await haalPool();
  const result = await pool.request().query(`
    SELECT * FROM dbo.facturen_terugkerend
    WHERE actief = 1 AND volgende_factuurdatum <= CAST(SYSUTCDATETIME() AS DATE)
    ORDER BY volgende_factuurdatum ASC
  `);
  return result.recordset.map(naarBuiten);
}

/** Na het aanmaken van de factuur voor deze cyclus: schuift volgende_factuurdatum en de
 * leveringsperiode een frequentie-stap op, en pauzeert (actief = 0) de sjabloon zodra de
 * volgende datum voorbij een eventuele einddatum zou vallen. */
async function verwerkGegenereerd(sjabloon) {
  const volgende = voegFrequentieToe(sjabloon.volgendeFactuurdatum, sjabloon.frequentie);
  const nieuweLeveringStart = sjabloon.leveringsperiodeStart
    ? voegFrequentieToe(sjabloon.leveringsperiodeStart, sjabloon.frequentie)
    : null;
  const nieuweLeveringEind = sjabloon.leveringsperiodeEind
    ? voegFrequentieToe(sjabloon.leveringsperiodeEind, sjabloon.frequentie)
    : null;
  const actief = sjabloon.einddatum ? volgende <= new Date(sjabloon.einddatum) : true;

  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, sjabloon.id);
  request.input("volgendeFactuurdatum", sql.Date, volgende);
  request.input("leveringsperiodeStart", sql.Date, nieuweLeveringStart);
  request.input("leveringsperiodeEind", sql.Date, nieuweLeveringEind);
  request.input("actief", sql.Bit, actief);
  await request.query(`
    UPDATE dbo.facturen_terugkerend SET
      volgende_factuurdatum = @volgendeFactuurdatum, leveringsperiode_start = @leveringsperiodeStart,
      leveringsperiode_eind = @leveringsperiodeEind, actief = @actief,
      aantal_gegenereerd = aantal_gegenereerd + 1, laatst_gegenereerd_op = SYSUTCDATETIME(),
      gewijzigd_op = SYSUTCDATETIME()
    WHERE id = @id
  `);
}

module.exports = {
  GELDIGE_FREQUENTIES,
  voegFrequentieToe,
  haalTerugkerendVoorAccount,
  haalTerugkerend,
  maakTerugkerend,
  wijzigTerugkerend,
  verwijderTerugkerend,
  haalVervallenSjablonen,
  verwerkGegenereerd,
};
