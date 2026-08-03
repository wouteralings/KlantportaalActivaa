/**
 * CRUD voor dbo.contracten_klanten: de zelf geregistreerde doorlopende contracten van een
 * portaalklant (Contractenmodule) — verzekeringen, telefonie/internet, software, overig.
 *
 * BEWUST GEEN verwijderfunctie hier — besluit §5.7 van het contractmanagement-plan staat
 * verwijderen door de klant niet toe (audit-overweging); alleen toevoegen en aanpassen. Een
 * eventuele "archiveren"-optie is een latere, aparte afweging (nog niet gebouwd).
 *
 * Contracttypes waren aanvankelijk een vaste, hardcoded JS-array (GELDIGE_TYPES) — sinds
 * 04-08-2026 op verzoek van Wouter ("Type contract zou ik graag uitbreiden. En willen kunnen
 * uitbreiden in beheer.") vervangen door een in Beheer bewerkbare lijst, zie
 * api/_gedeeld/contractenTypes.js. valideerType() is daardoor nu async (vraagt de actuele lijst
 * op) — alle aanroepers hieronder waren al async, dus dat vereist verder geen aanpassingen.
 */
const { sql, haalPool } = require("./facturatieDb");
const { magSleutel, maakSleutel } = require("./contractenTypes");

const GELDIGE_FREQUENTIES = ["maandelijks", "kwartaal", "jaarlijks", "eenmalig"];

function naarBuiten(row) {
  return {
    id: row.id,
    type: row.type,
    naam: row.naam,
    leverancier: row.leverancier || "",
    contractnummer: row.contractnummer || "",
    ingangsdatum: row.ingangsdatum,
    einddatum: row.einddatum,
    opzegtermijnDagen: row.opzegtermijn_dagen != null ? Number(row.opzegtermijn_dagen) : null,
    automatischeVerlenging: !!row.automatische_verlenging,
    frequentie: row.frequentie || "",
    bedrag: row.bedrag != null ? Number(row.bedrag) : null,
    opmerkingen: row.opmerkingen || "",
    laatsteReminderDagen: row.laatste_reminder_dagen != null ? Number(row.laatste_reminder_dagen) : null,
    laatsteReminderVerzondenOp: row.laatste_reminder_verzonden_op || null,
    aangemaaktOp: row.aangemaakt_op,
    // Stonden al in het schema (migratie 011) en werden al gevuld bij het aanmaken (zie
    // maakContract hieronder), maar waren tot 04-08-2026 nooit naar buiten toe blootgesteld —
    // Wouter vroeg in het medewerkersoverzicht te kunnen zien "wie heeft ingevoerd".
    aangemaaktDoor: row.aangemaakt_door || "",
    gewijzigdOp: row.gewijzigd_op,
    gewijzigdDoor: row.gewijzigd_door || "",
  };
}

async function valideerType(waarde) {
  const v = String(waarde || "").trim();
  if (!(await magSleutel(v))) {
    throw new Error(`VALIDATIE: onbekend contracttype ('${v}'). Ga naar Beheer → Facturatie → Contracttypes om typen toe te voegen.`);
  }
  return maakSleutel(v) || v;
}

function valideerFrequentie(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const v = String(waarde);
  if (!GELDIGE_FREQUENTIES.includes(v)) {
    throw new Error(`VALIDATIE: frequentie moet een van de volgende zijn: ${GELDIGE_FREQUENTIES.join(", ")} (of leeg).`);
  }
  return v;
}

function valideerDatum(waarde, veldnaam) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const d = new Date(waarde);
  if (isNaN(d.getTime())) throw new Error(`VALIDATIE: ${veldnaam} is geen geldige datum.`);
  return d;
}

async function haalContracten(klantAccountId, { type = "", verlooptVoor = "" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (type) {
    request.input("type", sql.NVarChar(50), type);
    where += " AND type = @type";
  }
  if (verlooptVoor) {
    request.input("verlooptVoor", sql.Date, new Date(verlooptVoor));
    where += " AND einddatum IS NOT NULL AND einddatum <= @verlooptVoor";
  }
  // LET OP: "ORDER BY (einddatum IS NULL)" is geldige syntax in Postgres/MySQL maar NIET in
  // SQL Server/Azure SQL — T-SQL staat een los IS NULL-predicaat niet toe als scalaire waarde
  // zonder CASE WHEN (Msg 4145, "expression of non-boolean type ... near IS"). Dat gaf hier een
  // query-fout zodra deze functie voor het eerst met echte data werd aangeroepen (Stap 6).
  const result = await request.query(
    `SELECT * FROM dbo.contracten_klanten WHERE ${where} ORDER BY CASE WHEN einddatum IS NULL THEN 1 ELSE 0 END, einddatum ASC, aangemaakt_op DESC`
  );
  return result.recordset.map(naarBuiten);
}

function naarBuitenMetAccount(row) {
  // .toLowerCase(): de mssql-driver geeft een UNIQUEIDENTIFIER-kolom terug als hoofdletter-GUID,
  // terwijl Dynamics/Dataverse GUID's (bijv. accountId uit api/beheer-klanten) kleine letters
  // gebruikt — een simpele object-key-lookup zoals klanten[c.klantAccountId] in
  // ContractenOverzicht.jsx matcht dan NOOIT (JS-stringvergelijking is hoofdlettergevoelig), met
  // als zichtbaar symptoom dat de klantnaam in het medewerkersoverzicht niet verscheen ("Onbekende
  // klant"). Hier normaliseren i.p.v. alleen aan de UI-kant, zodat elke toekomstige consument van
  // deze functie (nu ook api/mw-contracten-document) hetzelfde, consistente formaat krijgt.
  return { ...naarBuiten(row), klantAccountId: String(row.klant_account_id || "").toLowerCase() };
}

/**
 * Alle contracten (over ALLE klantaccounts heen) met een einddatum die nog niet verstreken is —
 * voor de dagelijkse verloopherinneringen-job (Stap 5, zie api/_gedeeld/contractenReminders.js
 * en api/contracten-reminders). Bewust geen klantAccountId-filter (dit is geen klant-gerichte
 * aanroep) en bewust alleen nog-niet-verlopen contracten (een reeds verlopen contract heeft
 * niets meer aan een "verloopt binnenkort"-herinnering).
 */
async function haalTeControlererenVoorReminders() {
  const pool = await haalPool();
  const result = await pool.request().query(
    "SELECT * FROM dbo.contracten_klanten WHERE einddatum IS NOT NULL AND einddatum >= CAST(SYSUTCDATETIME() AS DATE) ORDER BY einddatum ASC"
  );
  return result.recordset.map(naarBuitenMetAccount);
}

/**
 * Alle contracten over ALLE klantaccounts heen, voor het medewerkersoverzicht (Stap 6, zie
 * api/mw-contracten-overzicht en src/medewerker/ContractenOverzicht.jsx) — het "mini-dashboard
 * voor relatiebeheerders" uit het contractmanagement-plan. In tegenstelling tot
 * haalTeControlererenVoorReminders() hierboven (alleen nog-niet-verlopen contracten, voor de
 * dagelijkse herinneringenjob) geeft deze functie ALLES terug, inclusief al verlopen contracten
 * en contracten zonder einddatum — een relatiebeheerder moet ook een net verlopen contract nog
 * kunnen terugvinden. Sortering: contracten zonder einddatum laatst, daarna oplopend op
 * einddatum (dus de eerstvolgende afloop bovenaan).
 */
async function haalAlleContractenVoorOverzicht() {
  const pool = await haalPool();
  // Zelfde T-SQL-kanttekening als bij haalContracten() hierboven: CASE WHEN i.p.v. een los
  // IS NULL-predicaat als sorteerwaarde.
  const result = await pool.request().query(
    "SELECT * FROM dbo.contracten_klanten ORDER BY CASE WHEN einddatum IS NULL THEN 1 ELSE 0 END, einddatum ASC, aangemaakt_op DESC"
  );
  return result.recordset.map(naarBuitenMetAccount);
}

/** Legt vast dat er zojuist een herinnering is verstuurd voor deze drempel (dagenVoorEinddatum),
 * zodat dezelfde of een grotere drempel niet nogmaals verstuurd wordt (zie contractenReminders.js). */
async function markeerReminderVerzonden(id, dagenVoorEinddatum) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("dagen", sql.Int, dagenVoorEinddatum);
  await request.query(
    "UPDATE dbo.contracten_klanten SET laatste_reminder_dagen = @dagen, laatste_reminder_verzonden_op = SYSUTCDATETIME() WHERE id = @id"
  );
}

async function haalContract(klantAccountId, id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.contracten_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakContract(klantAccountId, data, email) {
  if (!data) throw new Error("VALIDATIE: geen gegevens meegegeven.");
  if (!String(data.naam || "").trim()) throw new Error("VALIDATIE: naam is verplicht.");

  const type = await valideerType(data.type);
  const frequentie = valideerFrequentie(data.frequentie);
  const ingangsdatum = valideerDatum(data.ingangsdatum, "ingangsdatum");
  const einddatum = valideerDatum(data.einddatum, "einddatum");
  if (ingangsdatum && einddatum && einddatum < ingangsdatum) {
    throw new Error("VALIDATIE: einddatum kan niet vóór de ingangsdatum liggen.");
  }

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("type", sql.NVarChar(50), type);
  request.input("naam", sql.NVarChar(200), String(data.naam).trim().slice(0, 200));
  request.input("leverancier", sql.NVarChar(200), data.leverancier ? String(data.leverancier).trim().slice(0, 200) : null);
  request.input("contractnummer", sql.NVarChar(100), data.contractnummer ? String(data.contractnummer).trim().slice(0, 100) : null);
  request.input("ingangsdatum", sql.Date, ingangsdatum);
  request.input("einddatum", sql.Date, einddatum);
  request.input("opzegtermijnDagen", sql.Int, data.opzegtermijnDagen != null && data.opzegtermijnDagen !== "" ? Number(data.opzegtermijnDagen) : null);
  request.input("automatischeVerlenging", sql.Bit, data.automatischeVerlenging === false ? 0 : 1);
  request.input("frequentie", sql.VarChar(12), frequentie);
  request.input("bedrag", sql.Decimal(12, 2), data.bedrag != null && data.bedrag !== "" ? Number(data.bedrag) : null);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen ? String(data.opmerkingen) : null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.contracten_klanten
      (klant_account_id, type, naam, leverancier, contractnummer, ingangsdatum, einddatum,
       opzegtermijn_dagen, automatische_verlenging, frequentie, bedrag, opmerkingen, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @type, @naam, @leverancier, @contractnummer, @ingangsdatum, @einddatum,
       @opzegtermijnDagen, @automatischeVerlenging, @frequentie, @bedrag, @opmerkingen, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/** Aanpassen — bewust geen verwijderen (zie bestandskop). Alleen meegegeven velden wijzigen;
 * de rest blijft staan zoals het was (zelfde partial-update-stijl als wijzigRit). */
async function wijzigContract(klantAccountId, id, data, email) {
  const bestaand = await haalContract(klantAccountId, id);
  if (!bestaand) return null;

  const type = data.type !== undefined ? await valideerType(data.type) : bestaand.type;
  const frequentie = data.frequentie !== undefined ? valideerFrequentie(data.frequentie) : (bestaand.frequentie || null);
  const ingangsdatum = data.ingangsdatum !== undefined ? valideerDatum(data.ingangsdatum, "ingangsdatum") : (bestaand.ingangsdatum ? new Date(bestaand.ingangsdatum) : null);
  const einddatum = data.einddatum !== undefined ? valideerDatum(data.einddatum, "einddatum") : (bestaand.einddatum ? new Date(bestaand.einddatum) : null);
  if (ingangsdatum && einddatum && einddatum < ingangsdatum) {
    throw new Error("VALIDATIE: einddatum kan niet vóór de ingangsdatum liggen.");
  }
  const naam = data.naam !== undefined ? String(data.naam).trim() : bestaand.naam;
  if (!naam) throw new Error("VALIDATIE: naam is verplicht.");

  // Verandert de einddatum, dan is een eerder verstuurde reminder niet meer betrouwbaar
  // gekoppeld aan de (nieuwe) verloopdatum — reset 'm, zodat Stap 5 opnieuw kan beoordelen of
  // er een herinnering nodig is.
  const einddatumGewijzigd = data.einddatum !== undefined && String(data.einddatum || "") !== String(bestaand.einddatum || "");

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("type", sql.NVarChar(50), type);
  request.input("naam", sql.NVarChar(200), naam.slice(0, 200));
  request.input("leverancier", sql.NVarChar(200), (data.leverancier !== undefined ? data.leverancier : bestaand.leverancier) ? String(data.leverancier !== undefined ? data.leverancier : bestaand.leverancier).trim().slice(0, 200) : null);
  request.input("contractnummer", sql.NVarChar(100), (data.contractnummer !== undefined ? data.contractnummer : bestaand.contractnummer) ? String(data.contractnummer !== undefined ? data.contractnummer : bestaand.contractnummer).trim().slice(0, 100) : null);
  request.input("ingangsdatum", sql.Date, ingangsdatum);
  request.input("einddatum", sql.Date, einddatum);
  request.input("opzegtermijnDagen", sql.Int, data.opzegtermijnDagen !== undefined ? (data.opzegtermijnDagen != null && data.opzegtermijnDagen !== "" ? Number(data.opzegtermijnDagen) : null) : bestaand.opzegtermijnDagen);
  request.input("automatischeVerlenging", sql.Bit, data.automatischeVerlenging !== undefined ? (data.automatischeVerlenging ? 1 : 0) : (bestaand.automatischeVerlenging ? 1 : 0));
  request.input("frequentie", sql.VarChar(12), frequentie);
  request.input("bedrag", sql.Decimal(12, 2), data.bedrag !== undefined ? (data.bedrag != null && data.bedrag !== "" ? Number(data.bedrag) : null) : bestaand.bedrag);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), (data.opmerkingen !== undefined ? data.opmerkingen : bestaand.opmerkingen) || null);
  request.input("email", sql.NVarChar(320), email || null);
  request.input("resetReminderDagen", sql.Int, einddatumGewijzigd ? null : bestaand.laatsteReminderDagen);
  request.input("resetReminderOp", sql.DateTime2, einddatumGewijzigd ? null : bestaand.laatsteReminderVerzondenOp);
  const result = await request.query(`
    UPDATE dbo.contracten_klanten SET
      type = @type, naam = @naam, leverancier = @leverancier, contractnummer = @contractnummer,
      ingangsdatum = @ingangsdatum, einddatum = @einddatum, opzegtermijn_dagen = @opzegtermijnDagen,
      automatische_verlenging = @automatischeVerlenging, frequentie = @frequentie, bedrag = @bedrag,
      opmerkingen = @opmerkingen, laatste_reminder_dagen = @resetReminderDagen,
      laatste_reminder_verzonden_op = @resetReminderOp,
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

module.exports = {
  GELDIGE_FREQUENTIES,
  haalContracten,
  haalContract,
  maakContract,
  wijzigContract,
  haalTeControlererenVoorReminders,
  haalAlleContractenVoorOverzicht,
  markeerReminderVerzonden,
};
