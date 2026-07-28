-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 003: bedrijfsgegevens_klanten — de eigen afzendergegevens (+ logo) van een
-- portaalklant, gebruikt als "Van:"-gegevens bovenaan facturen/offertes die die klant
-- aan zijn EIGEN (eind)klanten stuurt. Dit is dus iets anders dan dbo.klanten_klanten
-- (dat zijn de (eind)klanten van de portaalklant) — dit is de portaalklant zelf.
--
-- Achtergrond: zie Context/Facturatiemodule.md ("Bedrijfsgegevens & logo", voorheen de
-- NOG NIET GEBOUWD-kaart in Facturatie → Instellingen) en api/_gedeeld/bedrijfsgegevensKlanten.js.
-- Uitvoeren in de Query-editor van de Azure Portal.
-- LET OP: geen "GO" gebruiken — de portal-Query-editor ondersteunt dat niet, geef elk
-- statement gewoon los mee, gescheiden door een puntkomma.
-- ============================================================================

SET NOCOUNT ON;

CREATE TABLE dbo.bedrijfsgegevens_klanten (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_bedrijfsgegevens_klanten_id DEFAULT NEWID(),
    klant_account_id    UNIQUEIDENTIFIER NOT NULL,
    bedrijfsnaam        NVARCHAR(300)    NOT NULL CONSTRAINT DF_bedrijfsgegevens_klanten_naam DEFAULT '',
    straat              NVARCHAR(200)    NULL,
    huisnummer          NVARCHAR(20)     NULL,
    toevoeging          NVARCHAR(20)     NULL,
    postcode            NVARCHAR(20)     NULL,
    plaats              NVARCHAR(150)    NULL,
    land                NVARCHAR(80)     NOT NULL CONSTRAINT DF_bedrijfsgegevens_klanten_land DEFAULT 'NL',
    kvk_nummer          NVARCHAR(20)     NULL,
    btw_nummer          NVARCHAR(30)     NULL,
    iban                NVARCHAR(34)     NULL,
    iban_tenaamstelling NVARCHAR(200)    NULL,
    logo_url            NVARCHAR(500)    NULL,
    aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_bedrijfsgegevens_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
    aangemaakt_door     NVARCHAR(320)    NULL,
    gewijzigd_op        DATETIME2(3)     NULL,
    gewijzigd_door      NVARCHAR(320)    NULL,
    CONSTRAINT PK_bedrijfsgegevens_klanten PRIMARY KEY (id),
    -- Eén profiel per klant-account — het is dus altijd een insert-of-update (upsert), nooit
    -- meerdere rijen per klant. Zie zetGegevens() in bedrijfsgegevensKlanten.js.
    CONSTRAINT UQ_bedrijfsgegevens_klanten_account UNIQUE (klant_account_id)
);
