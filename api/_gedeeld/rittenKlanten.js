/**
 * CRUD voor dbo.ritten_klanten: de kilometerregistraties van een portaalklant (Rittenregistratie-
 * module). Elke rit hoort optioneel bij een eindklant (klant_klant_id, rechtstreeks te kiezen)
 * en/of een project (project_id, dat zelf weer verplicht bij een eindklant hoort) en/of een
 * voertuig — geen van drieën is een harde FK, zelfde stijl als artikel_id op uren_klanten.
 *
 * "Klant verplicht op een rit" is een instelling die de klant zelf zet (bedrijfsgegevens_klanten.
 * ritten_klant_verplicht) — zie haalRittenInstellingen() hieronder, gebruikt bij het valideren.
 *
 * Retourrit: "Boek ook de retourrit" bij het aanmaken maakt een TWEEDE, losse rij aan met
 * van/naar omgedraaid en verder identieke gegevens; retour_van_id op die tweede rij wijst naar
 * de eerste. Beide rijen blijven daarna onafhankelijk van elkaar te bewerken/verwijderen.
 */
const { sql, haalPool } = require("./facturatieDb");
const { haalKlant } = require("./klantenKlanten");
const { haalProject } = require("./projectenKlanten");

function naarBuiten(row) {
  return {
    id: row.id,
    klantKlantId: row.klant_klant_id || null,
    projectId: row.project_id || null,
    voertuigId: row.voertuig_id || null,
    datum: row.datum,
    vanAdres: row.van_adres,
    naarAdres: row.naar_adres,
    afstandKm: row.afstand_km != null ? Number(row.afstand_km) : null,
    priveRit: !!row.prive_rit,
    woonWerkRit: !!row.woon_werk_rit,
    omschrijving: row.omschrijving || "",
    declarabelType: row.declarabel_type,
    declarabelTarief: row.declarabel_tarief != null ? Number(row.declarabel_tarief) : null,
    declarabelBedrag: row.declarabel_bedrag != null ? Number(row.declarabel_bedrag) : null,
    retourVanId: row.retour_van_id || null,
    aangemaaktOp: row.aangemaakt_op,
    gewijzigdOp: row.gewijzigd_op,
  };
}

/** Leest de zelf-in-te-stellen ritten-instellingen van bedrijfsgegevens_klanten. Gebruikt een
 * losstaande, minimale query (niet de volledige haalGegevens() uit bedrijfsgegevensKlanten.js)
 * om geen circulaire afhankelijkheid met die module te introduceren. */
async function haalRittenInstellingen(klantAccountId) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const result = await request.query(`
    SELECT standaard_km_tarief, standaard_km_tarief_type, ritten_klant_verplicht
    FROM dbo.bedrijfsgegevens_klanten WHERE klant_account_id = @klantAccountId
  `);
  const row = result.recordset[0];
  return {
    standaardKmTarief: row && row.standaard_km_tarief != null ? Number(row.standaard_km_tarief) : null,
    standaardKmTariefType: (row && row.standaard_km_tarief_type) || "per_km",
    klantVerplicht: !!(row && row.ritten_klant_verplicht),
  };
}

function valideerDeclarabelType(waarde) {
  const v = String(waarde || "per_km");
  if (v !== "per_km" && v !== "per_keer") throw new Error("VALIDATIE: declarabel-type moet 'per_km' of 'per_keer' zijn.");
  return v;
}

/** Server-side berekend, nooit los door de klant aan te passen: afstand × tarief (per_km) of
 * gewoon het tarief zelf (per_keer, "vast bedrag per keer"). */
function berekenDeclarabelBedrag(declarabelType, declarabelTarief, afstandKm) {
  if (declarabelTarief == null) return null;
  if (declarabelType === "per_keer") return Math.round(Number(declarabelTarief) * 100) / 100;
  const km = Number(afstandKm) || 0;
  return Math.round(Number(declarabelTarief) * km * 100) / 100;
}

async function valideerKoppelingen(klantAccountId, data, { klantVerplicht }) {
  let klantKlantId = data.klantKlantId || null;

  if (data.projectId) {
    const project = await haalProject(klantAccountId, data.projectId);
    if (!project) throw new Error("VALIDATIE: onbekend project (of hoort bij een ander account).");
    // Een project hoort zelf al bij een klant — is er geen expliciete klant meegegeven, dan
    // leiden we 'm af van het project; is er wél een klant meegegeven, dan moet die matchen.
    if (klantKlantId && klantKlantId !== project.klantKlantId) {
      throw new Error("VALIDATIE: het gekozen project hoort niet bij de gekozen klant.");
    }
    klantKlantId = project.klantKlantId;
  }

  if (klantVerplicht && !klantKlantId) {
    throw new Error("VALIDATIE: kies een klant voor deze rit (verplicht via Ritten-instellingen).");
  }
  if (klantKlantId) {
    const klant = await haalKlant(klantAccountId, klantKlantId);
    if (!klant) throw new Error("VALIDATIE: onbekende klant (of hoort bij een ander account).");
  }
  return klantKlantId;
}

async function haalRitten(klantAccountId, { vanaf = "", tot = "", voertuigId = "", projectId = "", klantKlantId = "", type = "alle" } = {}) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  let where = "klant_account_id = @klantAccountId";
  if (vanaf) {
    request.input("vanaf", sql.Date, new Date(vanaf));
    where += " AND datum >= @vanaf";
  }
  if (tot) {
    request.input("tot", sql.Date, new Date(tot));
    where += " AND datum <= @tot";
  }
  if (voertuigId) {
    request.input("voertuigId", sql.UniqueIdentifier, voertuigId);
    where += " AND voertuig_id = @voertuigId";
  }
  if (projectId) {
    request.input("projectId", sql.UniqueIdentifier, projectId);
    where += " AND project_id = @projectId";
  }
  if (klantKlantId) {
    request.input("klantKlantId", sql.UniqueIdentifier, klantKlantId);
    where += " AND klant_klant_id = @klantKlantId";
  }
  if (type === "zakelijk") where += " AND prive_rit = 0";
  else if (type === "prive") where += " AND prive_rit = 1";
  else if (type === "woon_werk") where += " AND woon_werk_rit = 1";

  const result = await request.query(
    `SELECT * FROM dbo.ritten_klanten WHERE ${where} ORDER BY datum DESC, aangemaakt_op DESC`
  );
  return result.recordset.map(naarBuiten);
}

async function haalRit(klantAccountId, id) {
  if (!id) return null;
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(
    "SELECT * FROM dbo.ritten_klanten WHERE klant_account_id = @klantAccountId AND id = @id"
  );
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

async function voegRitToe(pool, klantAccountId, velden, email) {
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("klantKlantId", sql.UniqueIdentifier, velden.klantKlantId || null);
  request.input("projectId", sql.UniqueIdentifier, velden.projectId || null);
  request.input("voertuigId", sql.UniqueIdentifier, velden.voertuigId || null);
  request.input("datum", sql.Date, velden.datum);
  request.input("vanAdres", sql.NVarChar(300), velden.vanAdres);
  request.input("naarAdres", sql.NVarChar(300), velden.naarAdres);
  request.input("afstandKm", sql.Decimal(9, 1), velden.afstandKm != null ? velden.afstandKm : null);
  request.input("priveRit", sql.Bit, velden.priveRit ? 1 : 0);
  request.input("woonWerkRit", sql.Bit, velden.woonWerkRit ? 1 : 0);
  request.input("omschrijving", sql.NVarChar(500), velden.omschrijving || null);
  request.input("declarabelType", sql.VarChar(10), velden.declarabelType);
  request.input("declarabelTarief", sql.Decimal(9, 2), velden.declarabelTarief != null ? velden.declarabelTarief : null);
  request.input("declarabelBedrag", sql.Decimal(12, 2), velden.declarabelBedrag != null ? velden.declarabelBedrag : null);
  request.input("retourVanId", sql.UniqueIdentifier, velden.retourVanId || null);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    INSERT INTO dbo.ritten_klanten
      (klant_account_id, klant_klant_id, project_id, voertuig_id, datum, van_adres, naar_adres,
       afstand_km, prive_rit, woon_werk_rit, omschrijving, declarabel_type, declarabel_tarief,
       declarabel_bedrag, retour_van_id, aangemaakt_door)
    OUTPUT INSERTED.*
    VALUES
      (@klantAccountId, @klantKlantId, @projectId, @voertuigId, @datum, @vanAdres, @naarAdres,
       @afstandKm, @priveRit, @woonWerkRit, @omschrijving, @declarabelType, @declarabelTarief,
       @declarabelBedrag, @retourVanId, @email)
  `);
  return naarBuiten(result.recordset[0]);
}

/**
 * Maakt een nieuwe rit aan. Als data.boekOokRetour truthy is, wordt er direct een tweede rij
 * aangemaakt met van/naar omgedraaid (retour_van_id wijst naar de heenrit) — de aanroeper krijgt
 * dan { heenrit, retourrit } terug in plaats van alleen de heenrit.
 */
async function maakRit(klantAccountId, data, email) {
  if (!data) throw new Error("VALIDATIE: geen gegevens meegegeven.");
  if (!String(data.vanAdres || "").trim()) throw new Error("VALIDATIE: van-adres is verplicht.");
  if (!String(data.naarAdres || "").trim()) throw new Error("VALIDATIE: naar-adres is verplicht.");
  if (!data.datum) throw new Error("VALIDATIE: datum is verplicht.");

  const instellingen = await haalRittenInstellingen(klantAccountId);
  const klantKlantId = await valideerKoppelingen(klantAccountId, data, instellingen);
  const declarabelType = valideerDeclarabelType(data.declarabelType);
  const declarabelTarief = data.declarabelTarief != null ? Number(data.declarabelTarief) : null;
  const afstandKm = data.afstandKm != null ? Number(data.afstandKm) : null;
  const declarabelBedrag = berekenDeclarabelBedrag(declarabelType, declarabelTarief, afstandKm);

  const basisVelden = {
    klantKlantId,
    projectId: data.projectId || null,
    voertuigId: data.voertuigId || null,
    datum: new Date(data.datum),
    afstandKm,
    priveRit: !!data.priveRit,
    woonWerkRit: !!data.woonWerkRit,
    omschrijving: data.omschrijving ? String(data.omschrijving).slice(0, 500) : null,
    declarabelType,
    declarabelTarief,
    declarabelBedrag,
  };

  const pool = await haalPool();
  const heenrit = await voegRitToe(pool, klantAccountId, {
    ...basisVelden,
    vanAdres: String(data.vanAdres).trim().slice(0, 300),
    naarAdres: String(data.naarAdres).trim().slice(0, 300),
  }, email);

  if (!data.boekOokRetour) return { heenrit, retourrit: null };

  const retourrit = await voegRitToe(pool, klantAccountId, {
    ...basisVelden,
    vanAdres: String(data.naarAdres).trim().slice(0, 300),
    naarAdres: String(data.vanAdres).trim().slice(0, 300),
    retourVanId: heenrit.id,
  }, email);

  return { heenrit, retourrit };
}

async function wijzigRit(klantAccountId, id, data, email) {
  const bestaand = await haalRit(klantAccountId, id);
  if (!bestaand) return null;

  const instellingen = await haalRittenInstellingen(klantAccountId);
  const samengevoegd = {
    klantKlantId: data.klantKlantId !== undefined ? data.klantKlantId : bestaand.klantKlantId,
    projectId: data.projectId !== undefined ? data.projectId : bestaand.projectId,
  };
  const klantKlantId = await valideerKoppelingen(klantAccountId, samengevoegd, instellingen);

  const declarabelType = data.declarabelType !== undefined ? valideerDeclarabelType(data.declarabelType) : bestaand.declarabelType;
  const declarabelTarief = data.declarabelTarief !== undefined ? (data.declarabelTarief != null ? Number(data.declarabelTarief) : null) : bestaand.declarabelTarief;
  const afstandKm = data.afstandKm !== undefined ? (data.afstandKm != null ? Number(data.afstandKm) : null) : bestaand.afstandKm;
  const declarabelBedrag = berekenDeclarabelBedrag(declarabelType, declarabelTarief, afstandKm);

  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  request.input("klantKlantId", sql.UniqueIdentifier, klantKlantId || null);
  request.input("projectId", sql.UniqueIdentifier, samengevoegd.projectId || null);
  request.input("voertuigId", sql.UniqueIdentifier, data.voertuigId !== undefined ? (data.voertuigId || null) : (bestaand.voertuigId || null));
  request.input("datum", sql.Date, data.datum ? new Date(data.datum) : new Date(bestaand.datum));
  request.input("vanAdres", sql.NVarChar(300), data.vanAdres !== undefined ? String(data.vanAdres).trim().slice(0, 300) : bestaand.vanAdres);
  request.input("naarAdres", sql.NVarChar(300), data.naarAdres !== undefined ? String(data.naarAdres).trim().slice(0, 300) : bestaand.naarAdres);
  request.input("afstandKm", sql.Decimal(9, 1), afstandKm);
  request.input("priveRit", sql.Bit, data.priveRit !== undefined ? (data.priveRit ? 1 : 0) : (bestaand.priveRit ? 1 : 0));
  request.input("woonWerkRit", sql.Bit, data.woonWerkRit !== undefined ? (data.woonWerkRit ? 1 : 0) : (bestaand.woonWerkRit ? 1 : 0));
  request.input("omschrijving", sql.NVarChar(500), (data.omschrijving !== undefined ? data.omschrijving : bestaand.omschrijving) ? String(data.omschrijving !== undefined ? data.omschrijving : bestaand.omschrijving).slice(0, 500) : null);
  request.input("declarabelType", sql.VarChar(10), declarabelType);
  request.input("declarabelTarief", sql.Decimal(9, 2), declarabelTarief);
  request.input("declarabelBedrag", sql.Decimal(12, 2), declarabelBedrag);
  request.input("email", sql.NVarChar(320), email || null);
  const result = await request.query(`
    UPDATE dbo.ritten_klanten SET
      klant_klant_id = @klantKlantId, project_id = @projectId, voertuig_id = @voertuigId,
      datum = @datum, van_adres = @vanAdres, naar_adres = @naarAdres, afstand_km = @afstandKm,
      prive_rit = @priveRit, woon_werk_rit = @woonWerkRit, omschrijving = @omschrijving,
      declarabel_type = @declarabelType, declarabel_tarief = @declarabelTarief,
      declarabel_bedrag = @declarabelBedrag, gewijzigd_op = SYSUTCDATETIME(), gewijzigd_door = @email
    OUTPUT INSERTED.*
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset[0] ? naarBuiten(result.recordset[0]) : null;
}

/** Harde verwijdering — een rit heeft, anders dan uren, geen facturatiekoppeling die dat zou
 * blokkeren. Verwijdert bewust NIET de gekoppelde retour-/heenrit mee — dat blijft een losse,
 * eigen actie van de klant (zie plan: "beide regels blijven apart bewerkbaar/verwijderbaar"). */
async function verwijderRit(klantAccountId, id) {
  const pool = await haalPool();
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    DELETE FROM dbo.ritten_klanten OUTPUT DELETED.id
    WHERE klant_account_id = @klantAccountId AND id = @id
  `);
  return result.recordset.length > 0;
}

/** Meest recent gebruikte, unieke van/naar-adressen en omschrijvingen van dit account — voor de
 * "snel invullen"-suggesties in het rit-formulier (zie plan). */
async function haalRecenteSuggesties(klantAccountId, limiet = 8) {
  const pool = await haalPool();
  const top = Math.max(1, Math.min(Number(limiet) || 8, 25));
  const request = pool.request();
  request.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const adressenResult = await request.query(`
    SELECT TOP (${top}) adres, MAX(laatst) AS laatst FROM (
      SELECT van_adres AS adres, aangemaakt_op AS laatst FROM dbo.ritten_klanten WHERE klant_account_id = @klantAccountId
      UNION ALL
      SELECT naar_adres AS adres, aangemaakt_op AS laatst FROM dbo.ritten_klanten WHERE klant_account_id = @klantAccountId
    ) t
    GROUP BY adres
    ORDER BY MAX(laatst) DESC
  `);
  const omschrijvingenRequest = pool.request();
  omschrijvingenRequest.input("klantAccountId", sql.UniqueIdentifier, klantAccountId);
  const omschrijvingenResult = await omschrijvingenRequest.query(`
    SELECT TOP (${top}) omschrijving, MAX(aangemaakt_op) AS laatst FROM dbo.ritten_klanten
    WHERE klant_account_id = @klantAccountId AND omschrijving IS NOT NULL AND omschrijving <> ''
    GROUP BY omschrijving
    ORDER BY MAX(aangemaakt_op) DESC
  `);
  return {
    adressen: adressenResult.recordset.map((r) => r.adres),
    omschrijvingen: omschrijvingenResult.recordset.map((r) => r.omschrijving),
  };
}

module.exports = {
  haalRitten,
  haalRit,
  maakRit,
  wijzigRit,
  verwijderRit,
  haalRittenInstellingen,
  haalRecenteSuggesties,
};
