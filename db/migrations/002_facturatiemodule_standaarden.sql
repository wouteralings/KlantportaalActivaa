-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 002: BTW-tarieven met geldigheidsperiode, centraal beheerde
-- ("algemene") artikelen die voor elke klant beschikbaar zijn, en een
-- btw_code-kolom op de bestaande artikelen_klanten zodat ook eigen artikelen
-- via een categorie (in plaats van een los getal) een BTW-tarief kiezen.
--
-- Achtergrond: zie Context/Facturatiemodule.md en de toelichting bovenaan
-- 001_facturatiemodule.sql. Uitvoeren in de Query-editor van de Azure Portal
-- LET OP: geen "GO" gebruiken — de portal-Query-editor ondersteunt dat niet,
-- geef elk statement gewoon los mee, gescheiden door een puntkomma.
-- ============================================================================

SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- 1. btw_tarieven
--    Centraal (niet per klant) overzicht van BTW-categorieën en hun
--    percentage over de tijd. geldig_tot = NULL betekent "nog steeds geldig".
--    Een nieuw tarief voor een code sluit het vorige tarief van diezelfde
--    code af (geldig_tot wordt gezet) — zie api/_gedeeld/btwTarieven.js.
--    Facturen bevriezen het percentage dat gold op het moment van opstellen
--    in regels_json (regels_klanten.btwPercentage) — een latere tariefswijziging
--    verandert dus nooit een reeds gemaakte factuur, alleen nieuwe artikelen/
--    regels die vanaf dat moment worden aangemaakt.
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.btw_tarieven (
    id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_btw_tarieven_id DEFAULT NEWID(),
    code            VARCHAR(20)      NOT NULL,
    label           NVARCHAR(50)     NOT NULL,
    percentage      DECIMAL(5,2)     NOT NULL,
    geldig_vanaf    DATE             NOT NULL,
    geldig_tot      DATE             NULL,
    aangemaakt_op   DATETIME2(3)     NOT NULL CONSTRAINT DF_btw_tarieven_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door NVARCHAR(320)    NULL,
    CONSTRAINT PK_btw_tarieven PRIMARY KEY (id),
    CONSTRAINT CK_btw_tarieven_code CHECK (code IN ('nul', 'laag', 'hoog', 'vrijgesteld'))
);

CREATE INDEX IX_btw_tarieven_code_geldigheid ON dbo.btw_tarieven (code, geldig_vanaf, geldig_tot);

-- Startwaarden: de officiële Nederlandse tarieven, geldig sinds hun laatste wijziging.
INSERT INTO dbo.btw_tarieven (code, label, percentage, geldig_vanaf, geldig_tot) VALUES
    ('nul',         'Nultarief',           0.00, '2000-01-01', NULL),
    ('laag',        'Laag tarief',         9.00, '2019-01-01', NULL),
    ('hoog',        'Hoog tarief',        21.00, '2012-10-01', NULL),
    ('vrijgesteld', 'Vrijgesteld van btw', 0.00, '2000-01-01', NULL);

-- ---------------------------------------------------------------------------
-- 2. artikelen_algemeen
--    Centraal (door Activaa, via Beheer) beheerde artikelen die voor ELKE
--    klant beschikbaar zijn als keuze bij het opstellen van een factuur —
--    in tegenstelling tot artikelen_klanten (eigen catalogus per klant).
--    Wijzig jij hier bijvoorbeeld de prijs van "Huur", dan verandert dat
--    voor iedereen tegelijk (nieuwe factuurregels; bestaande regels blijven
--    ongewijzigd, want die hebben het bedrag al bevroren).
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.artikelen_algemeen (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_artikelen_algemeen_id DEFAULT NEWID(),
    omschrijving        NVARCHAR(300)    NOT NULL,
    eenheid             NVARCHAR(30)     NULL,
    prijs               DECIMAL(12,2)    NOT NULL CONSTRAINT DF_artikelen_algemeen_prijs DEFAULT 0,
    btw_code            VARCHAR(20)      NOT NULL CONSTRAINT DF_artikelen_algemeen_btwcode DEFAULT 'hoog',
    actief              BIT              NOT NULL CONSTRAINT DF_artikelen_algemeen_actief DEFAULT 1,
    aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_artikelen_algemeen_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door     NVARCHAR(320)    NULL,
    gewijzigd_op        DATETIME2(3)     NULL,
    gewijzigd_door      NVARCHAR(320)    NULL,
    CONSTRAINT PK_artikelen_algemeen PRIMARY KEY (id),
    CONSTRAINT CK_artikelen_algemeen_btwcode CHECK (btw_code IN ('nul', 'laag', 'hoog', 'vrijgesteld'))
);

-- Startset zoals gevraagd. Prijs staat op 0 — pas aan via Beheer → Facturatie → Standaardartikelen.
INSERT INTO dbo.artikelen_algemeen (omschrijving, eenheid, prijs, btw_code) VALUES
    ('Managementvergoeding', 'maand', 0.00, 'hoog'),
    ('Huur',                 'maand', 0.00, 'hoog'),
    ('Diensten',             'uur',   0.00, 'hoog');

-- ---------------------------------------------------------------------------
-- 3. artikelen_klanten uitbreiden met btw_code
--    Zodat ook eigen artikelen een BTW-categorie kiezen in plaats van een los
--    getal in te typen. btw_percentage blijft bestaan en wordt bij elke
--    aanmaak/wijziging opnieuw gevuld met het actuele percentage van de
--    gekozen code (zie api/_gedeeld/artikelenKlanten.js) — zo blijft de kolom
--    ook bruikbaar voor wie rechtstreeks op de database rapporteert.
-- ---------------------------------------------------------------------------
-- Let op: kolom + CHECK-constraint in ÉÉN statement. De Azure Portal Query
-- Editor (preview) compileert een batch in zijn geheel voordat hij hem
-- uitvoert; een los ALTER TABLE ... ADD CONSTRAINT CHECK in dezelfde batch
-- die verwijst naar een kolom die pas eerder in diezelfde batch is
-- toegevoegd, geeft dan "Invalid column name" en de hele batch draait niet.
ALTER TABLE dbo.artikelen_klanten
    ADD btw_code VARCHAR(20) NOT NULL
        CONSTRAINT DF_artikelen_klanten_btwcode DEFAULT 'hoog'
        CONSTRAINT CK_artikelen_klanten_btwcode CHECK (btw_code IN ('nul', 'laag', 'hoog', 'vrijgesteld'));
