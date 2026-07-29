/**
 * CRUD + statusflow voor dbo.facturen_klanten: facturen, offertes én creditnota's van een
 * portaalklant aan één van zijn eigen klanten_klanten (documenttype onderscheidt ze).
 *
 * Statusflow:
 *   offerte:    concept → verzonden → geaccepteerd | afgewezen
 *               (bij 'geaccepteerd' wordt automatisch een nieuwe factuur (concept) aangemaakt,
 *                zie accepteerOfferte hieronder — "Bij akkoord automatisch omzetten naar factuur")
 *   factuur:    concept → verzonden → betaald | verlopen | geannuleerd
 *   creditnota: concept → verzonden
 *
 * Een nummer (F0001 / OFF0001 / C0001) wordt pas toegekend bij "versturen", via
 * api/_gedeeld/nummering.js — niet bij het aanmaken van het concept.
 *
 * BELANGRIJK: klantAccountId (tenant) staat op elke rij en is verplicht filter in elke query.
 * regels/subtotaal/btw/totaal worden ALTIJD server-side herberekend uit de aangeleverde
 * regels — een door de klant meegestuurd totaal wordt nooit vertrouwd of overgenomen.
 *
 * Synchronisatie naar de aparte Dynamics-tabel (dynamics_record_id / dynamics_sync_status)
 * is hier bewust nog niet geïmplementeerd — zie Context/Facturatiemodule.md voor de
 * openstaande stappen (custom tabel + relatie aanmaken in Dataverse, dan een sync-functie
 * hierop aanhaken).
 */
const { sql, haalPool } = require("./facturatieDb");
const { volgendNummer } = require("./nummering");
const { haalKlant } = require("./klantenKlanten");
const { haalGegevens: haalBedrijfsgegevens } = require("./bedrijfsgegevensKlanten");
const { genereerFactuurPdf } = require("./facturenPdf");
const { verstuurMailMetBijlage } = require("./mail");

const GELDIGE_DOCUMENTTYPES = ["factuur", "offerte", "creditnota"];
const NAAM_PER_TYPE = { factuur: "factuur", offerte: "offerte", creditnota: "creditnota" };

function rond(bedrag) {
  return Math.round((Number(bedrag) + Number.EPSILON) * 100) / 100;
}

/** Valideert en normaliseert de regels van een factuur/offerte, en berekent
 * subtotaal/btw_bedrag/totaal. Nooit een door de klant aangeleverd totaal overnemen. */
function berekenTotalen(regelsInvoer) {
  const regels = (Array.isArray(regelsInvoer) ? regelsInvoer : []).map((r) => {
    const aantal = Number(r.aantal) || 0;
    const prijs = Number(r.prijs) || 0;
    const btwPercentage = r.btwPercentage != null ? Number(r.btwPercentage) : 21;
    const bedrag = rond(aantal * prijs);
    return {
      omschrijving: String(r.omschrijving || "").slice(0, 300),
      artikelId: r.artikelId || null,
      aantal,
      prijs,
      // btwCode is puur informatief (welke BTW-categorie was gekozen in de keuzelijst) —
      // de berekening zelf blijft op btwPercentage draaien, ook voor oudere regels die nog
      // geen code hebben.
      btwCode: r.btwCode || null,
      btwPercentage,
      bedrag,
      // Optionele afwijkende leveringsperiode voor déze regel (bijv. één maandtermijn binnen
      // een jaarfactuur met meerdere regels) — leeg = geldt de leveringsperiode van het document.
      leveringsperiodeStart: r.leveringsperiodeStart || null,
      leveringsperiodeEind: r.leveringsperiodeEind || null,
    };
  });
  if (regels.length === 0) throw new Error("VALIDATIE: minimaal één factuurregel is verplicht.");

  const subtotaal = rond(regels.reduce((som, r) => som + r.bedrag, 0));
  const btwBedrag = rond(regels.reduce((som, r) => som + r.bedrag * (r.btwPercentage / 100), 0));
  const totaal = rond(subtotaal + btwBedrag);
  return { regels, subtotaal, btwBedrag, totaal };
}

function naarBuiten(row) {
  return {
    id: row.id,
    klantKlantId: row.klant_klant_id,
    documenttype: row.documenttype,
    status: row.status,
    nummer: row.nummer || "",
    offerteId: row.offerte_id || null,
    terugkerendId: row.terugkerend_id || null,
    referentieFactuurId: row.referentie_factuur_id || null,
    factuurdatum: row.factuurdatum,
    vervaldatum: row.vervaldatum,
    // Wettelijk verplichte "periode van levering" (Belastingdienst-factuurvereisten) — een
    // periode i.p.v. één datum, bijv. "1 t/m 31 juli 2026" bij een maandelijkse dienst. De oude
    // kolom `leverdatum` (migratie 004) bestaat nog in de database maar wordt hier bewust niet
    // meer gelezen/geschreven (zie migratie 005).
    leveringsperiodeStart: row.leveringsperiode_start || null,
    leveringsperiodeEind: row.leveringsperiode_eind || null,
    betalingstermijnDagen: row.betalingstermijn_dagen,
    regels: JSON.parse(row.regels_json || "[]"),
    subtotaal: Number(row.subtotaal),
    btwBedrag: Number(row.btw_bedrag),
    totaal: Number(row.totaal),
    taal: row.taal,
    opmerkingen: row.opmerkingen || "",
    dynamicsRecordId: row.dynamics_record_id || null,
    dynamicsSyncStatus: row.dynamics_sync_status,
    verzondenOp: row.verzonden_op,
    betaaldOp: row.betaald_op,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

async function haalFacturen(klantAccountId, { documenttype, status, zoek } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (documenttype && GELDIGE_DOCUMENTTYPES.includes(documenttype)) {
    request.input("documenttype", sql.VarChar(20), documenttype);
    where += " AND documenttype = @documenttype";
  }
  if (status) {
    request.input("status", sql.VarChar(20), status);
    where += " AND status = @status";
  }
  if (zoek) {
    request.input("zoek", sql.NVarChar(200), `%${zoek}%`);
    where += " AND (nummer LIKE @zoek OR opmerkingen LIKE @zoek)";
  }
  const result = await request.query(
    `SELECT * FROM dbo.facturen_klanten WHERE ${where} ORDER BY aangemaakt_op DESC`
  );
  return result.recordset.map(naarBuiten);
}

async function haalFactuur(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.facturen_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function maakFactuur(klantAccountId, data, email) {
  const documenttype = data.documenttype;
  if (!GELDIGE_DOCUMENTTYPES.includes(documenttype)) {
    throw new Error("VALIDATIE: documenttype moet factuur, offerte of creditnota zijn.");
  }
  if (!data.klantKlantId) throw new Error("VALIDATIE: klantKlantId is verplicht.");
  const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
  if (!klantKlant) throw new Error("VALIDATIE: onbekende klant_klant (of hoort bij een andere account).");

  const { regels, subtotaal, btwBedrag, totaal } = berekenTotalen(data.regels);
  const betalingstermijnDagen = Number(data.betalingstermijnDagen) || 30;
  const factuurdatum = data.factuurdatum ? new Date(data.factuurdatum) : new Date();
  const vervaldatum = data.vervaldatum
    ? new Date(data.vervaldatum)
    : new Date(factuurdatum.getTime() + betalingstermijnDagen * 24 * 60 * 60 * 1000);

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId);
  request.input("documenttype", sql.VarChar(20), documenttype);
  request.input("offerteId", sql.UniqueIdentifier, data.offerteId || null);
  request.input("referentieFactuurId", sql.UniqueIdentifier, data.referentieFactuurId || null);
  request.input("factuurdatum", sql.Date, factuurdatum);
  request.input("vervaldatum", sql.Date, vervaldatum);
  request.input("leveringsperiodeStart", sql.Date, data.leveringsperiodeStart ? new Date(data.leveringsperiodeStart) : null);
  request.input("leveringsperiodeEind", sql.Date, data.leveringsperiodeEind ? new Date(data.leveringsperiodeEind) : null);
  request.input("terugkerendId", sql.UniqueIdentifier, data.terugkerendId || null);
  request.input("betalingstermijnDagen", sql.Int, betalingstermijnDagen);
  request.input("regelsJson", sql.NVarChar(sql.MAX), JSON.stringify(regels));
  request.input("subtotaal", sql.Decimal(12, 2), subtotaal);
  request.input("btwBedrag", sql.Decimal(12, 2), btwBedrag);
  request.input("totaal", sql.Decimal(12, 2), totaal);
  request.input("taal", sql.VarChar(5), data.taal || "nl");
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen || null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.facturen_klanten
      (klant_account_id, klant_klant_id, documenttype, offerte_id, referentie_factuur_id,
       factuurdatum, vervaldatum, leveringsperiode_start, leveringsperiode_eind, terugkerend_id,
       betalingstermijn_dagen, regels_json, subtotaal, btw_bedrag, totaal, taal, opmerkingen, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @klantKlantId, @documenttype, @offerteId, @referentieFactuurId,
       @factuurdatum, @vervaldatum, @leveringsperiodeStart, @leveringsperiodeEind, @terugkerendId,
       @betalingstermijnDagen, @regelsJson, @subtotaal, @btwBedrag, @totaal, @taal, @opmerkingen, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/** Concept bijwerken — alleen toegestaan zolang het document nog niet verstuurd is. */
async function wijzigFactuur(klantAccountId, id, data, email) {
  const bestaand = await haalFactuur(klantAccountId, id);
  if (!bestaand) return null;
  if (bestaand.status !== "concept") {
    throw new Error("VALIDATIE: alleen een concept kan nog gewijzigd worden.");
  }
  if (data.klantKlantId) {
    const klantKlant = await haalKlant(klantAccountId, data.klantKlantId);
    if (!klantKlant) throw new Error("VALIDATIE: onbekende klant_klant (of hoort bij een andere account).");
  }

  const { regels, subtotaal, btwBedrag, totaal } = berekenTotalen(data.regels ?? bestaand.regels);
  const betalingstermijnDagen = data.betalingstermijnDagen != null
    ? Number(data.betalingstermijnDagen)
    : bestaand.betalingstermijnDagen;
  const factuurdatum = data.factuurdatum ? new Date(data.factuurdatum) : new Date(bestaand.factuurdatum);
  const vervaldatum = data.vervaldatum
    ? new Date(data.vervaldatum)
    : new Date(factuurdatum.getTime() + betalingstermijnDagen * 24 * 60 * 60 * 1000);

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("klantKlantId", sql.UniqueIdentifier, data.klantKlantId || bestaand.klantKlantId);
  request.input("factuurdatum", sql.Date, factuurdatum);
  request.input("vervaldatum", sql.Date, vervaldatum);
  request.input("leveringsperiodeStart", sql.Date, data.leveringsperiodeStart !== undefined
    ? (data.leveringsperiodeStart ? new Date(data.leveringsperiodeStart) : null)
    : (bestaand.leveringsperiodeStart ? new Date(bestaand.leveringsperiodeStart) : null));
  request.input("leveringsperiodeEind", sql.Date, data.leveringsperiodeEind !== undefined
    ? (data.leveringsperiodeEind ? new Date(data.leveringsperiodeEind) : null)
    : (bestaand.leveringsperiodeEind ? new Date(bestaand.leveringsperiodeEind) : null));
  request.input("betalingstermijnDagen", sql.Int, betalingstermijnDagen);
  request.input("regelsJson", sql.NVarChar(sql.MAX), JSON.stringify(regels));
  request.input("subtotaal", sql.Decimal(12, 2), subtotaal);
  request.input("btwBedrag", sql.Decimal(12, 2), btwBedrag);
  request.input("totaal", sql.Decimal(12, 2), totaal);
  request.input("taal", sql.VarChar(5), data.taal || bestaand.taal);
  request.input("opmerkingen", sql.NVarChar(sql.MAX), data.opmerkingen ?? bestaand.opmerkingen ?? null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.facturen_klanten SET
      klant_klant_id = @klantKlantId, factuurdatum = @factuurdatum, vervaldatum = @vervaldatum,
      leveringsperiode_start = @leveringsperiodeStart, leveringsperiode_eind = @leveringsperiodeEind,
      betalingstermijn_dagen = @betalingstermijnDagen, regels_json = @regelsJson,
      subtotaal = @subtotaal, btw_bedrag = @btwBedrag, totaal = @totaal, taal = @taal,
      opmerkingen = @opmerkingen, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Concept → verzonden. Kent hier pas het volgende nummer uit de reeks van dit documenttype
 * toe (zie nummering.js) — zo blijft de reeks aaneengesloten voor wat écht verstuurd is.
 *
 * Verstuurt daarna best-effort ook een échte e-mail (met de factuur/offerte/creditnota als
 * PDF-bijlage) naar het e-mailadres van de klant_klant. Dit mag het "versturen" zelf nooit
 * blokkeren: ontbreekt er een e-mailadres, of mislukt het genereren/versturen, dan blijft het
 * document gewoon 'verzonden' (het nummer is al toegekend) — de aanroeper kan `emailVerzonden`/
 * `emailFout` in het resultaat gebruiken om dit aan de gebruiker te tonen. `context` is optioneel,
 * puur om een mislukte e-mail te loggen (Azure Functions context.log). */
async function verstuurFactuur(klantAccountId, id, email, context) {
  const bestaand = await haalFactuur(klantAccountId, id);
  if (!bestaand) return null;
  if (bestaand.status !== "concept") {
    throw new Error("VALIDATIE: dit document is al verstuurd (of heeft een andere status).");
  }
  const nummer = await volgendNummer(klantAccountId, bestaand.documenttype);

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("nummer", sql.NVarChar(30), nummer);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.facturen_klanten SET
      status = 'verzonden', nummer = @nummer, verzonden_op = SYSUTCDATETIME(),
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  if (!result.recordset[0]) return null;
  const document = naarBuiten(result.recordset[0]);

  const { emailVerzonden, emailFout } = await verstuurDocumentPerEmail(klantAccountId, document, context);
  return { ...document, emailVerzonden, emailFout };
}

/** Bouwt de PDF en verstuurt 'm als bijlage naar het e-mailadres van de klant_klant. Geeft
 * altijd een resultaat terug (nooit een throw) — de aanroeper beslist zelf wat 'best-effort'
 * betekent voor de rest van de statusflow. */
async function verstuurDocumentPerEmail(klantAccountId, document, context) {
  try {
    const [klant, bedrijfsgegevens] = await Promise.all([
      haalKlant(klantAccountId, document.klantKlantId),
      haalBedrijfsgegevens(klantAccountId),
    ]);
    if (!klant || !klant.email) {
      return { emailVerzonden: false, emailFout: "Geen e-mailadres bekend bij deze klant." };
    }

    const pdfBuffer = await genereerFactuurPdf({
      document, klant, bedrijfsgegevens, documenttype: document.documenttype,
    });
    const naamType = NAAM_PER_TYPE[document.documenttype] || "document";
    const onderwerp = `${bedrijfsgegevens.bedrijfsnaam || "Uw leverancier"} — ${naamType} ${document.nummer}`;
    const html = `
      <div style="color:#1C2321; background-color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:14px;">
        <p>Beste ${escapeHtml(klant.contactpersoon || klant.naam || "")},</p>
        <p>Hierbij ontvangt u ${naamType} <strong>${escapeHtml(document.nummer)}</strong> van
          ${escapeHtml(bedrijfsgegevens.bedrijfsnaam || "")}, ter waarde van
          <strong>€ ${Number(document.totaal).toFixed(2)}</strong>${document.vervaldatum
            ? ` (te voldoen vóór ${new Date(document.vervaldatum).toLocaleDateString("nl-NL")})`
            : ""}.
        </p>
        <p>Deze is als PDF-bijlage bij deze e-mail toegevoegd.</p>
        <p>Met vriendelijke groet,<br/>${escapeHtml(bedrijfsgegevens.bedrijfsnaam || "")}</p>
      </div>`;

    await verstuurMailMetBijlage({
      naar: klant.email,
      // Eigen CC-mailadres (Instellingen → "CC bij versturen") — optioneel, zodat de
      // portaalklant zelf een kopie krijgt als bevestiging dat het document is verstuurd.
      cc: bedrijfsgegevens.ccEmail ? [bedrijfsgegevens.ccEmail] : [],
      onderwerp,
      html,
      bijlagen: [{
        naam: `${naamType[0].toUpperCase()}${naamType.slice(1)} ${document.nummer}.pdf`,
        contentType: "application/pdf",
        inhoud: pdfBuffer,
      }],
    });
    return { emailVerzonden: true, emailFout: null };
  } catch (err) {
    if (context && context.log) context.log.error("verstuurFactuur: e-mail versturen mislukt:", err);
    return { emailVerzonden: false, emailFout: String(err.message || err) };
  }
}

function escapeHtml(tekst) {
  return String(tekst || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Offerte → geaccepteerd, en maakt automatisch een nieuwe factuur (concept) aan met dezelfde
 * klant_klant en regels, en offerte_id verwijzend naar deze offerte — "Bij akkoord automatisch
 * omzetten naar factuur". De nieuwe factuur blijft bewust een concept (geen nummer/verzending)
 * zodat er nog gecontroleerd kan worden vóór het echt versturen; wil je dat 'm meteen verstuurt,
 * roep na deze functie ook verstuurFactuur() aan met het teruggegeven factuur.id. */
async function accepteerOfferte(klantAccountId, id, email) {
  const offerte = await haalFactuur(klantAccountId, id);
  if (!offerte) return null;
  if (offerte.documenttype !== "offerte") throw new Error("VALIDATIE: dit document is geen offerte.");
  if (offerte.status !== "verzonden") {
    throw new Error("VALIDATIE: alleen een verstuurde offerte kan geaccepteerd worden.");
  }

  const pool = await haalPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const updateRequest = new sql.Request(transaction);
    updateRequest.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
    updateRequest.input("id", sql.UniqueIdentifier, id);
    updateRequest.input("email", sql.NVarChar(320), email || null);
    await updateRequest.query(`
      UPDATE dbo.facturen_klanten SET
        status = 'geaccepteerd', gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
      WHERE klant_account_id = @klantAccountId AND id = @id
    `);

    const insertRequest = new sql.Request(transaction);
    insertRequest.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
    insertRequest.input("klantKlantId", sql.UniqueIdentifier, offerte.klantKlantId);
    insertRequest.input("offerteId", sql.UniqueIdentifier, id);
    insertRequest.input("betalingstermijnDagen", sql.Int, offerte.betalingstermijnDagen);
    insertRequest.input(
      "vervaldatum",
      sql.Date,
      new Date(Date.now() + offerte.betalingstermijnDagen * 24 * 60 * 60 * 1000)
    );
    insertRequest.input("regelsJson", sql.NVarChar(sql.MAX), JSON.stringify(offerte.regels));
    insertRequest.input("subtotaal", sql.Decimal(12, 2), offerte.subtotaal);
    insertRequest.input("btwBedrag", sql.Decimal(12, 2), offerte.btwBedrag);
    insertRequest.input("totaal", sql.Decimal(12, 2), offerte.totaal);
    insertRequest.input("taal", sql.VarChar(5), offerte.taal);
    insertRequest.input("opmerkingen", sql.NVarChar(sql.MAX), offerte.opmerkingen || null);
    insertRequest.input("email2", sql.NVarChar(320), email || null);
    const nieuw = await insertRequest.query(`
      INSERT INTO dbo.facturen_klanten
        (klant_account_id, klant_klant_id, documenttype, offerte_id, betalingstermijn_dagen,
         vervaldatum, regels_json, subtotaal, btw_bedrag, totaal, taal, opmerkingen, aangemaakt_door)
      OUTPUT INSERTED.*
      VALUES
        (@klantAccountId, @klantKlantId, 'factuur', @offerteId, @betalingstermijnDagen,
         @vervaldatum, @regelsJson, @subtotaal, @btwBedrag, @totaal, @taal, @opmerkingen, @email2)
    `);

    await transaction.commit();
    return naarBuiten(nieuw.recordset[0]);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function wijsOfferteAf(klantAccountId, id, email) {
  const offerte = await haalFactuur(klantAccountId, id);
  if (!offerte) return null;
  if (offerte.documenttype !== "offerte") throw new Error("VALIDATIE: dit document is geen offerte.");
  if (offerte.status !== "verzonden") {
    throw new Error("VALIDATIE: alleen een verstuurde offerte kan afgewezen worden.");
  }
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.facturen_klanten SET
      status = 'afgewezen', gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function markeerBetaald(klantAccountId, id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.facturen_klanten SET
      status = 'betaald', betaald_op = SYSUTCDATETIME(),
      gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id AND documenttype = 'factuur'
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function annuleerFactuur(klantAccountId, id, email) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.facturen_klanten SET
      status = 'geannuleerd', gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id AND documenttype = 'factuur'
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Een concept mag hard verwijderd worden (heeft nog geen nummer verbruikt); alles daarna
 * moet via annuleren/crediteren, nooit weggegooid, om de nummerreeks en boekhouding kloppend
 * te houden. */
async function verwijderFactuur(klantAccountId, id) {
  const bestaand = await haalFactuur(klantAccountId, id);
  if (!bestaand) return false;
  if (bestaand.status !== "concept") {
    throw new Error("VALIDATIE: alleen een concept kan verwijderd worden — annuleer een verstuurd document in plaats daarvan.");
  }
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    DELETE FROM dbo.facturen_klanten OUTPUT DELETED.id
    WHERE klant_account_id = @klantAccountId AND id = @id AND status = 'concept'
  `);
  return result.recordset.length > 0;
}

module.exports = {
  berekenTotalen,
  haalFacturen,
  haalFactuur,
  maakFactuur,
  wijzigFactuur,
  verstuurFactuur,
  verstuurDocumentPerEmail,
  accepteerOfferte,
  wijsOfferteAf,
  markeerBetaald,
  annuleerFactuur,
  verwijderFactuur,
};
