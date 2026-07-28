-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 001: kerntabellen voor klanten_klanten, artikelen_klanten en
-- facturen_klanten (+ nummerreeksen_klanten als noodzakelijke hulptabel).
--
-- Doel: een Azure SQL Database, LOS van Dataverse/Dynamics en los van de
-- bestaande Blob-opslag (container "portaalcontent"). Reden voor een aparte
-- database: de eigen klanten/producten van elke portaalklant horen niet thuis
-- in Activaa's Dynamics-omgeving (dat zou het CRM vervuilen met data van
-- bedrijven die niets met Activaa te maken hebben), maar facturen zelf worden
-- WEL ook naar Dataverse gesynchroniseerd (zie dynamics_record_id hieronder en
-- Context/Facturatiemodule.md) zodat Activaa ze kan terugzien/rapporteren.
--
-- Multi-tenancy: elke rij hoort bij precies één "klant" = een Dataverse
-- Account-id (dezelfde GUID als accountId uit api/_gedeeld/identiteit.js →
-- herleidAccounts()). ALLE queries vanuit de API filteren verplicht op
-- klant_account_id — zie api/_gedeeld/klantenKlanten.js, artikelenKlanten.js
-- en facturenKlanten.js. Dat is de enige plek waar de scheiding tussen
-- klanten wordt afgedwongen, dus wijzig die filters nooit zonder reden.
--
-- Uitvoeren: eenmalig tegen een nieuwe/lege Azure SQL Database, bijv. via
-- sqlcmd, Azure Data Studio, of de "Query editor" in de Azure Portal.
-- ============================================================================

SET NOCOUNT ON;
GO

-- ---------------------------------------------------------------------------
-- 1. klanten_klanten
--    De eigen (eind)klanten van een portaalklant — dus NIET de Activaa-klanten
--    uit Dynamics, maar de klanten van de klant (bijv. de klanten van
--    "Hoveniersbedrijf Jansen"). Elke portaalklant beheert zijn eigen lijst en
--    ziet nooit de klanten van een andere portaalklant.
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.klanten_klanten (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_klanten_klanten_id DEFAULT NEWID(),
    klant_account_id    UNIQUEIDENTIFIER NOT NULL,      -- Dataverse Account-id van de portaalklant (tenant-scope)
    naam                NVARCHAR(200)    NOT NULL,      -- bedrijfsnaam of "voornaam achternaam"
    contactpersoon      NVARCHAR(200)    NULL,
    email               NVARCHAR(320)    NULL,
    telefoon            NVARCHAR(50)     NULL,
    straat              NVARCHAR(150)    NULL,
    huisnummer          NVARCHAR(20)     NULL,
    toevoeging          NVARCHAR(20)     NULL,
    postcode            NVARCHAR(20)     NULL,
    plaats              NVARCHAR(100)    NULL,
    land                NVARCHAR(2)      NOT NULL CONSTRAINT DF_klanten_klanten_land DEFAULT 'NL',
    btw_nummer          NVARCHAR(30)     NULL,
    kvk_nummer          NVARCHAR(20)     NULL,
    iban                NVARCHAR(34)     NULL,
    opmerkingen         NVARCHAR(MAX)    NULL,
    actief              BIT              NOT NULL CONSTRAINT DF_klanten_klanten_actief DEFAULT 1,
    aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_klanten_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door     NVARCHAR(320)    NULL,           -- e-mail van de portaalgebruiker die de klant aanmaakte
    gewijzigd_op        DATETIME2(3)     NULL,
    gewijzigd_door      NVARCHAR(320)    NULL,
    CONSTRAINT PK_klanten_klanten PRIMARY KEY (id)
);
GO

CREATE INDEX IX_klanten_klanten_tenant ON dbo.klanten_klanten (klant_account_id, actief, naam);
GO

-- ---------------------------------------------------------------------------
-- 2. artikelen_klanten
--    De eigen product-/dienstencatalogus per portaalklant. Komt terug in de
--    "Producten"-tab en als snelkeuze bij het opstellen van een factuurregel.
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.artikelen_klanten (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_artikelen_klanten_id DEFAULT NEWID(),
    klant_account_id    UNIQUEIDENTIFIER NOT NULL,
    omschrijving        NVARCHAR(300)    NOT NULL,
    eenheid             NVARCHAR(30)     NULL,           -- bijv. "stuk", "uur", "maand"
    prijs               DECIMAL(12,2)    NOT NULL CONSTRAINT DF_artikelen_klanten_prijs DEFAULT 0,
    btw_percentage      DECIMAL(5,2)     NOT NULL CONSTRAINT DF_artikelen_klanten_btw DEFAULT 21.00,
    actief              BIT              NOT NULL CONSTRAINT DF_artikelen_klanten_actief DEFAULT 1,
    aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_artikelen_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door     NVARCHAR(320)    NULL,
    gewijzigd_op        DATETIME2(3)     NULL,
    gewijzigd_door      NVARCHAR(320)    NULL,
    CONSTRAINT PK_artikelen_klanten PRIMARY KEY (id)
);
GO

CREATE INDEX IX_artikelen_klanten_tenant ON dbo.artikelen_klanten (klant_account_id, actief, omschrijving);
GO

-- ---------------------------------------------------------------------------
-- 3. nummerreeksen_klanten (hulptabel, niet expliciet gevraagd maar noodzakelijk)
--    Bewaart per portaalklant + documenttype het prefix en het eerstvolgende
--    nummer, zodat "automatisch doornummeren" concurrency-veilig is (twee
--    gelijktijdige aanvragen kunnen nooit hetzelfde nummer krijgen — zie
--    api/_gedeeld/nummering.js, dat deze rij met UPDLOCK+HOLDLOCK vergrendelt).
--    documenttype: 'factuur' | 'offerte' | 'creditnota' — elk zijn eigen reeks,
--    exact zoals in de "Standaardwaarden"-instellingen (prefix F/OFF/C, elk
--    startend bij 1).
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.nummerreeksen_klanten (
    klant_account_id    UNIQUEIDENTIFIER NOT NULL,
    documenttype        VARCHAR(20)      NOT NULL,
    prefix              NVARCHAR(20)     NOT NULL CONSTRAINT DF_nummerreeksen_prefix DEFAULT '',
    volgend_nummer      INT              NOT NULL CONSTRAINT DF_nummerreeksen_volgnr DEFAULT 1,
    CONSTRAINT PK_nummerreeksen_klanten PRIMARY KEY (klant_account_id, documenttype),
    CONSTRAINT CK_nummerreeksen_documenttype CHECK (documenttype IN ('factuur', 'offerte', 'creditnota'))
);
GO

-- ---------------------------------------------------------------------------
-- 4. facturen_klanten
--    Facturen, offertes én creditnota's van een portaalklant aan één van zijn
--    eigen klanten_klanten — onderscheiden via 'documenttype'.
--
--    Statusflow:
--      offerte:  concept → verzonden → geaccepteerd | afgewezen
--                (bij 'geaccepteerd' maakt de API automatisch een nieuwe rij
--                 met documenttype 'factuur' aan, offerte_id = deze rij)
--      factuur:  concept → verzonden → betaald | verlopen | geannuleerd
--      creditnota: concept → verzonden
--
--    Regels (factuurregels) staan bewust als JSON in regels_json, niet in een
--    aparte tabel — consistent met hoe deze repo elders opgeslagen structuren
--    behandelt (zie taak-akkoorden.json, wijzigingsverzoeken.json in Blob
--    Storage). subtotaal/btw_bedrag/totaal worden server-side berekend uit die
--    regels (nooit vertrouwen op een door de klant aangeleverd totaal).
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.facturen_klanten (
    id                          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_facturen_klanten_id DEFAULT NEWID(),
    klant_account_id            UNIQUEIDENTIFIER NOT NULL,          -- tenant-scope (Dataverse Account-id)
    klant_klant_id              UNIQUEIDENTIFIER NOT NULL,          -- FK -> klanten_klanten.id (aan wie gericht)
    documenttype                VARCHAR(20)      NOT NULL,          -- 'factuur' | 'offerte' | 'creditnota'
    status                      VARCHAR(20)      NOT NULL CONSTRAINT DF_facturen_klanten_status DEFAULT 'concept',
    nummer                      NVARCHAR(30)     NULL,               -- pas toegekend bij "versturen", niet bij concept
    offerte_id                  UNIQUEIDENTIFIER NULL,               -- gezet op de factuur die uit een offerte is omgezet
    terugkerend_id              UNIQUEIDENTIFIER NULL,               -- gezet als deze factuur automatisch is gegenereerd (later te bouwen)
    referentie_factuur_id       UNIQUEIDENTIFIER NULL,               -- bij documenttype 'creditnota': welke factuur wordt gecrediteerd
    factuurdatum                DATE             NOT NULL CONSTRAINT DF_facturen_klanten_factuurdatum DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    vervaldatum                 DATE             NULL,
    betalingstermijn_dagen      INT              NOT NULL CONSTRAINT DF_facturen_klanten_termijn DEFAULT 30,
    regels_json                 NVARCHAR(MAX)    NOT NULL,           -- array van {omschrijving, artikelId, aantal, prijs, btwPercentage}
    subtotaal                   DECIMAL(12,2)    NOT NULL CONSTRAINT DF_facturen_klanten_subtotaal DEFAULT 0,
    btw_bedrag                  DECIMAL(12,2)    NOT NULL CONSTRAINT DF_facturen_klanten_btw DEFAULT 0,
    totaal                      DECIMAL(12,2)    NOT NULL CONSTRAINT DF_facturen_klanten_totaal DEFAULT 0,
    taal                        VARCHAR(5)       NOT NULL CONSTRAINT DF_facturen_klanten_taal DEFAULT 'nl',
    opmerkingen                 NVARCHAR(MAX)    NULL,
    dynamics_record_id          UNIQUEIDENTIFIER NULL,               -- id van de gesynchroniseerde rij in de Dynamics-tabel (later te bouwen)
    dynamics_sync_status        VARCHAR(20)      NOT NULL CONSTRAINT DF_facturen_klanten_syncstatus DEFAULT 'nog_niet',
    verzonden_op                DATETIME2(3)     NULL,
    betaald_op                  DATETIME2(3)     NULL,
    aangemaakt_op                DATETIME2(3)    NOT NULL CONSTRAINT DF_facturen_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door              NVARCHAR(320)   NULL,
    gewijzigd_op                 DATETIME2(3)    NULL,
    gewijzigd_door               NVARCHAR(320)   NULL,
    CONSTRAINT PK_facturen_klanten PRIMARY KEY (id),
    CONSTRAINT FK_facturen_klanten_klant FOREIGN KEY (klant_klant_id) REFERENCES dbo.klanten_klanten (id),
    CONSTRAINT CK_facturen_klanten_documenttype CHECK (documenttype IN ('factuur', 'offerte', 'creditnota')),
    CONSTRAINT CK_facturen_klanten_status CHECK (status IN ('concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'betaald', 'verlopen', 'geannuleerd'))
);
GO

CREATE INDEX IX_facturen_klanten_tenant ON dbo.facturen_klanten (klant_account_id, documenttype, status, factuurdatum DESC);
GO

-- Nummer moet uniek zijn per klant + documenttype, maar concepten hebben nog geen nummer
-- (NULL) — een filtered unique index staat meerdere NULLs toe en bewaakt alleen de
-- toegekende nummers.
CREATE UNIQUE INDEX UX_facturen_klanten_nummer
    ON dbo.facturen_klanten (klant_account_id, documenttype, nummer)
    WHERE nummer IS NOT NULL;
GO
