-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 009: Rittenregistratie (projecten_klanten, voertuigen_klanten, ritten_klanten,
-- favoriete_ritten_klanten) + gedeelde Projecten-koppeling voor de bestaande uren_klanten +
-- nieuwe instellingen op bedrijfsgegevens_klanten.
--
-- Achtergrond: zie project-doc "Rittenregistratie — plan.md" / de skill
-- "rittenregistratie" voor het volledige ontwerp en de afgestemde keuzes met Wouter
-- (31-07-2026).
--
-- Uitvoeren in de Query-editor van de Azure Portal (tegen de bestaande "facturatie"-database,
-- zelfde server als migratie 001 t/m 008). Geen "GO" gebruiken — de portal-Query-editor
-- ondersteunt dat niet, statements los aanleveren, gescheiden door een puntkomma.
--
-- Idempotent: elke CREATE TABLE staat achter een IF OBJECT_ID(...) IS NULL-check en elke
-- ALTER TABLE ADD COLUMN achter een IF COL_LENGTH(...) IS NULL-check — veilig opnieuw te
-- draaien, zelfde afspraak als migratie 007/008.
-- ============================================================================

SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- 1. projecten_klanten
--    Gedeeld tussen Ritten en de bestaande Uren-module: een project hoort verplicht bij
--    één eindklant (klanten_klanten). Klanten kunnen hierop straks zowel ritten als (indien
--    de projectenGekoppeld-instelling voor hun account aan staat) uren schrijven.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.projecten_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.projecten_klanten (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_projecten_klanten_id DEFAULT NEWID(),
        klant_account_id    UNIQUEIDENTIFIER NOT NULL,      -- tenant-scope (Dataverse Account-id)
        klant_klant_id      UNIQUEIDENTIFIER NOT NULL,       -- eindklant (dbo.klanten_klanten) waar dit project onder valt
        naam                NVARCHAR(200)    NOT NULL,
        omschrijving        NVARCHAR(MAX)    NULL,
        actief              BIT              NOT NULL CONSTRAINT DF_projecten_klanten_actief DEFAULT 1,
        aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_projecten_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door     NVARCHAR(320)    NULL,
        gewijzigd_op        DATETIME2(3)     NULL,
        gewijzigd_door      NVARCHAR(320)    NULL,
        CONSTRAINT PK_projecten_klanten PRIMARY KEY (id)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_projecten_klanten_tenant' AND object_id = OBJECT_ID('dbo.projecten_klanten'))
BEGIN
    CREATE INDEX IX_projecten_klanten_tenant ON dbo.projecten_klanten (klant_account_id, klant_klant_id, actief);
END;

-- ---------------------------------------------------------------------------
-- 2. voertuigen_klanten
--    De eigen voertuigenlijst van een portaalklant (Ritten → Instellingen → Voertuigen).
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.voertuigen_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.voertuigen_klanten (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_voertuigen_klanten_id DEFAULT NEWID(),
        klant_account_id    UNIQUEIDENTIFIER NOT NULL,
        merk                NVARCHAR(100)    NOT NULL,
        model               NVARCHAR(100)    NULL,
        kenteken            NVARCHAR(20)     NULL,
        cataloguswaarde     DECIMAL(12,2)    NOT NULL CONSTRAINT DF_voertuigen_klanten_cataloguswaarde DEFAULT 0,
        prive_of_zakelijk   VARCHAR(10)      NOT NULL CONSTRAINT DF_voertuigen_klanten_pz DEFAULT 'prive',
        favoriet            BIT              NOT NULL CONSTRAINT DF_voertuigen_klanten_favoriet DEFAULT 0,
        in_gebruik          BIT              NOT NULL CONSTRAINT DF_voertuigen_klanten_ingebruik DEFAULT 1,
        aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_voertuigen_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door     NVARCHAR(320)    NULL,
        gewijzigd_op        DATETIME2(3)     NULL,
        gewijzigd_door      NVARCHAR(320)    NULL,
        CONSTRAINT PK_voertuigen_klanten PRIMARY KEY (id),
        CONSTRAINT CK_voertuigen_klanten_pz CHECK (prive_of_zakelijk IN ('prive', 'zakelijk'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_voertuigen_klanten_tenant' AND object_id = OBJECT_ID('dbo.voertuigen_klanten'))
BEGIN
    CREATE INDEX IX_voertuigen_klanten_tenant ON dbo.voertuigen_klanten (klant_account_id, in_gebruik, merk);
END;

-- ---------------------------------------------------------------------------
-- 3. ritten_klanten
--    De kilometerregistraties zelf. klant_klant_id is een rechtstreeks, optioneel veld (los
--    van project_id) — of het verplicht is, bepaalt de instelling ritten_klant_verplicht op
--    bedrijfsgegevens_klanten (zie onderaan), serverside afgedwongen in api/_gedeeld/rittenKlanten.js.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.ritten_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ritten_klanten (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ritten_klanten_id DEFAULT NEWID(),
        klant_account_id    UNIQUEIDENTIFIER NOT NULL,
        klant_klant_id      UNIQUEIDENTIFIER NULL,          -- → klanten_klanten, rechtstreeks te kiezen
        project_id          UNIQUEIDENTIFIER NULL,          -- → projecten_klanten, geen harde FK (zelfde stijl als artikel_id op uren_klanten)
        voertuig_id         UNIQUEIDENTIFIER NULL,          -- → voertuigen_klanten
        datum               DATE             NOT NULL,
        van_adres           NVARCHAR(300)    NOT NULL,
        naar_adres          NVARCHAR(300)    NOT NULL,
        afstand_km          DECIMAL(9,1)     NULL,
        prive_rit           BIT              NOT NULL CONSTRAINT DF_ritten_klanten_prive DEFAULT 0,
        woon_werk_rit       BIT              NOT NULL CONSTRAINT DF_ritten_klanten_woonwerk DEFAULT 0,
        omschrijving        NVARCHAR(500)    NULL,
        declarabel_type     VARCHAR(10)      NOT NULL CONSTRAINT DF_ritten_klanten_decltype DEFAULT 'per_km',
        declarabel_tarief   DECIMAL(9,2)     NULL,
        declarabel_bedrag   DECIMAL(12,2)    NULL,
        retour_van_id       UNIQUEIDENTIFIER NULL,          -- zelf-verwijzing naar de heenrit, gezet op de retourrit-rij
        aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_ritten_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door     NVARCHAR(320)    NULL,
        gewijzigd_op        DATETIME2(3)     NULL,
        gewijzigd_door      NVARCHAR(320)    NULL,
        CONSTRAINT PK_ritten_klanten PRIMARY KEY (id),
        CONSTRAINT CK_ritten_klanten_decltype CHECK (declarabel_type IN ('per_km', 'per_keer'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ritten_klanten_datum' AND object_id = OBJECT_ID('dbo.ritten_klanten'))
BEGIN
    CREATE INDEX IX_ritten_klanten_datum ON dbo.ritten_klanten (klant_account_id, datum);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ritten_klanten_project' AND object_id = OBJECT_ID('dbo.ritten_klanten'))
BEGIN
    CREATE INDEX IX_ritten_klanten_project ON dbo.ritten_klanten (klant_account_id, project_id);
END;

-- ---------------------------------------------------------------------------
-- 4. favoriete_ritten_klanten
--    Opgeslagen rit-sjablonen (Ritten → Instellingen → Favoriete ritten) voor één-klik
--    hergebruik van een hele rit.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.favoriete_ritten_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.favoriete_ritten_klanten (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_favoriete_ritten_klanten_id DEFAULT NEWID(),
        klant_account_id    UNIQUEIDENTIFIER NOT NULL,
        naam                NVARCHAR(150)    NOT NULL,
        van_adres           NVARCHAR(300)    NULL,
        naar_adres          NVARCHAR(300)    NULL,
        voertuig_id         UNIQUEIDENTIFIER NULL,
        klant_klant_id      UNIQUEIDENTIFIER NULL,
        project_id          UNIQUEIDENTIFIER NULL,
        omschrijving        NVARCHAR(500)    NULL,
        prive_rit           BIT              NOT NULL CONSTRAINT DF_favoriete_ritten_klanten_prive DEFAULT 0,
        woon_werk_rit       BIT              NOT NULL CONSTRAINT DF_favoriete_ritten_klanten_woonwerk DEFAULT 0,
        declarabel_type     VARCHAR(10)      NOT NULL CONSTRAINT DF_favoriete_ritten_klanten_decltype DEFAULT 'per_km',
        declarabel_tarief   DECIMAL(9,2)     NULL,
        aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_favoriete_ritten_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door     NVARCHAR(320)    NULL,
        gewijzigd_op        DATETIME2(3)     NULL,
        gewijzigd_door      NVARCHAR(320)    NULL,
        CONSTRAINT PK_favoriete_ritten_klanten PRIMARY KEY (id),
        CONSTRAINT CK_favoriete_ritten_klanten_decltype CHECK (declarabel_type IN ('per_km', 'per_keer'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_favoriete_ritten_klanten_tenant' AND object_id = OBJECT_ID('dbo.favoriete_ritten_klanten'))
BEGIN
    CREATE INDEX IX_favoriete_ritten_klanten_tenant ON dbo.favoriete_ritten_klanten (klant_account_id, naam);
END;

-- ---------------------------------------------------------------------------
-- 5. uren_klanten — projectkoppeling (optioneel, per account uit te zetten via de nieuwe
--    projectenGekoppeld-blobinstelling in api/_gedeeld/urenInstellingen.js). klant_klant_id
--    blijft verplicht en leidend zolang de koppeling voor een account uit staat.
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.uren_klanten', 'project_id') IS NULL
    ALTER TABLE dbo.uren_klanten ADD project_id UNIQUEIDENTIFIER NULL;

-- ---------------------------------------------------------------------------
-- 6. bedrijfsgegevens_klanten — nieuwe, door de klant zelf te wijzigen instellingen voor
--    Ritten (geen goedkeuring nodig, zelfde categorie als cc_email/standaardwaarden uit
--    migratie 006/007).
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'standaard_km_tarief') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD standaard_km_tarief DECIMAL(9,2) NULL;

IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'standaard_km_tarief_type') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD standaard_km_tarief_type VARCHAR(10) NULL;

IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'ritten_klant_verplicht') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD ritten_klant_verplicht BIT NOT NULL CONSTRAINT DF_bedrijfsgegevens_klanten_rittenklantverplicht DEFAULT 0;
