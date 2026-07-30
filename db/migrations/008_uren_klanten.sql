-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 008: uren-/projecturenregistratie.
--
-- Twee onderdelen:
--   1. dbo.uren_klanten — losse uren die een portaalklant registreert vóór één van zijn
--      eigen (eind)klanten (klanten_klanten). Elke registratie hoort VERPLICHT bij precies
--      één eindklant (klant_klant_id) en optioneel bij een artikel uit de eigen catalogus
--      (artikel_id) — dat artikel bepaalt straks het uurtarief bij het factureren. Zolang
--      factuur_id NULL is, is de registratie "open" (nog te factureren); zodra de uren op een
--      factuur/concept worden gezet, wijst factuur_id naar dbo.facturen_klanten en staat
--      gefactureerd op 1. Wordt dat conceptdocument later verwijderd, dan komen de uren weer
--      vrij (factuur_id terug op NULL) — zie api/_gedeeld/facturenKlanten.js.
--
--   2. Kolom standaard_uur_artikel_id op dbo.bedrijfsgegevens_klanten — het standaard
--      uur-artikel dat een nieuwe uren-registratie voorinvult (Facturatie → Instellingen →
--      Standaardwaarden). Puur een eigen voorkeur, geen verificatiegegeven — zelfde categorie
--      als de standaardwaarden uit migratie 007.
--
-- Zelfde tenant-regel als de rest van de facturatiemodule: elke rij hoort bij precies één
-- klant_account_id (de Dataverse Account-GUID uit herleidAccounts()); alle queries filteren
-- daar verplicht op. Bewust GEEN foreign keys naar facturen_klanten/klanten_klanten/artikelen:
-- consistent met de bestaande facturatie-tabellen (die koppelen ook op GUID zonder harde FK),
-- en omdat artikel_id zowel naar dbo.artikelen_klanten als naar dbo.artikelen_algemeen kan
-- verwijzen (de gecombineerde artikelkeuze in het factuurscherm).
--
-- Uitvoeren in de Query-editor van de Azure Portal. Geen "GO" gebruiken — de portal-Query-
-- editor ondersteunt dat niet; geef elk statement los mee, gescheiden door een puntkomma.
--
-- Idempotent: veilig opnieuw te draaien (tabel achter een OBJECT_ID-check, de kolom achter een
-- COL_LENGTH-check) — zelfde aanpak als migratie 007, zodat een reeds (gedeeltelijk) uitgevoerde
-- migratie niet met een "already exists"-fout afbreekt.
-- ============================================================================

SET NOCOUNT ON;

-- 1. uren_klanten -------------------------------------------------------------
IF OBJECT_ID('dbo.uren_klanten', 'U') IS NULL
CREATE TABLE dbo.uren_klanten (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_uren_klanten_id DEFAULT NEWID(),
    klant_account_id    UNIQUEIDENTIFIER NOT NULL,      -- tenant-scope (Dataverse Account-id van de portaalklant)
    klant_klant_id      UNIQUEIDENTIFIER NOT NULL,      -- verplicht: voor welke eigen (eind)klant zijn deze uren
    artikel_id          UNIQUEIDENTIFIER NULL,          -- optioneel: artikel dat het uurtarief bepaalt (klanten- of algemeen)
    datum               DATE             NOT NULL,      -- datum waarop de uren zijn gewerkt
    omschrijving        NVARCHAR(500)    NULL,          -- wat er is gedaan
    aantal_uren         DECIMAL(9, 2)    NOT NULL CONSTRAINT DF_uren_klanten_aantal DEFAULT 0,
    factuur_id          UNIQUEIDENTIFIER NULL,          -- gezet zodra de uren op een factuur/concept staan (dbo.facturen_klanten.id); NULL = open
    gefactureerd        BIT              NOT NULL CONSTRAINT DF_uren_klanten_gefactureerd DEFAULT 0,  -- spiegelt factuur_id IS NOT NULL, voor rapportage/filters
    aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_uren_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door     NVARCHAR(320)    NULL,
    gewijzigd_op        DATETIME2(3)     NULL,
    gewijzigd_door      NVARCHAR(320)    NULL,
    CONSTRAINT PK_uren_klanten PRIMARY KEY (id)
);

-- Snel de open/gefactureerde uren per klant + eindklant opvragen (de "Uren"-tab en het
-- ophalen van openstaande uren bij het opstellen van een factuur).
IF OBJECT_ID('dbo.uren_klanten', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_uren_klanten_tenant' AND object_id = OBJECT_ID('dbo.uren_klanten'))
CREATE INDEX IX_uren_klanten_tenant ON dbo.uren_klanten (klant_account_id, klant_klant_id, gefactureerd, datum);

-- Snel alle uren van één factuur terugvinden (bij het opnieuw opslaan/verwijderen van een concept).
IF OBJECT_ID('dbo.uren_klanten', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_uren_klanten_factuur' AND object_id = OBJECT_ID('dbo.uren_klanten'))
CREATE INDEX IX_uren_klanten_factuur ON dbo.uren_klanten (klant_account_id, factuur_id);

-- 2. standaard uur-artikel op bedrijfsgegevens_klanten ------------------------
IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'standaard_uur_artikel_id') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD standaard_uur_artikel_id UNIQUEIDENTIFIER NULL;
