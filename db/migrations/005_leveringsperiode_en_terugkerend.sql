-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 005: leveringsperiode (start + eind i.p.v. één datum) en terugkerende
-- facturen (abonnementen).
--
-- Leveringsperiode: de wettelijk verplichte "periode van levering" mag óók een periode
-- zijn i.p.v. één datum (bijv. "juli 2026" bij een maandelijkse managementfee). De oude
-- kolom `leverdatum` (migratie 004) blijft ongebruikt staan — bewust geen destructieve
-- wijziging, de UI/API lezen/schrijven 'm gewoon niet meer.
--
-- Terugkerende facturen: dbo.facturen_terugkerend is het "sjabloon" waaruit periodiek een
-- concrete rij in dbo.facturen_klanten wordt aangemaakt door api/verwerk-terugkerende-
-- facturen (aangeroepen via een extern schema, bijv. een dagelijkse Power Automate-flow).
-- De kolom `terugkerend_id` op dbo.facturen_klanten bestond al (migratie 001, destijds nog
-- als "later te bouwen" aangemerkt) en wordt vanaf nu gevuld.
--
-- Uitvoeren in de Query-editor van de Azure Portal.
-- LET OP: geen "GO" gebruiken — de portal-Query-editor ondersteunt dat niet, geef elk
-- statement gewoon los mee, gescheiden door een puntkomma (zelfde afspraak als de vorige
-- migraties).
-- ============================================================================

SET NOCOUNT ON;

-- 1) Leveringsperiode op documentniveau (per-regel-override staat al gewoon in regels_json,
--    dat is een vrij JSON-veld en heeft dus geen kolomwijziging nodig).
ALTER TABLE dbo.facturen_klanten
    ADD leveringsperiode_start DATE NULL,
        leveringsperiode_eind  DATE NULL;

-- 2) Terugkerende facturen (abonnementen).
CREATE TABLE dbo.facturen_terugkerend (
    id                       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_facturen_terugkerend_id DEFAULT NEWID(),
    klant_account_id         UNIQUEIDENTIFIER NOT NULL,          -- tenant-scope (Dataverse Account-id)
    klant_klant_id           UNIQUEIDENTIFIER NOT NULL,          -- eigen debiteur (dbo.klanten_klanten)
    frequentie               VARCHAR(20)      NOT NULL CONSTRAINT CK_facturen_terugkerend_frequentie
                                 CHECK (frequentie IN ('wekelijks', 'maandelijks', 'kwartaal', 'jaarlijks')),
    startdatum               DATE             NOT NULL,          -- eerste keer factureren vanaf deze datum
    einddatum                DATE             NULL,              -- leeg = loopt door totdat gepauzeerd/verwijderd
    volgende_factuurdatum    DATE             NOT NULL,          -- wanneer de eerstvolgende factuur aangemaakt wordt
    leveringsperiode_start   DATE             NULL,              -- schuift elke cyclus mee op met de frequentie
    leveringsperiode_eind    DATE             NULL,
    automatisch_verzenden    BIT              NOT NULL CONSTRAINT DF_facturen_terugkerend_autoverzenden DEFAULT 0,
    betalingstermijn_dagen   INT              NOT NULL CONSTRAINT DF_facturen_terugkerend_betalingstermijn DEFAULT 30,
    regels_json              NVARCHAR(MAX)    NOT NULL,          -- zelfde vorm als facturen_klanten.regels_json
    opmerkingen              NVARCHAR(MAX)    NULL,
    actief                   BIT              NOT NULL CONSTRAINT DF_facturen_terugkerend_actief DEFAULT 1,
    aantal_gegenereerd       INT              NOT NULL CONSTRAINT DF_facturen_terugkerend_aantal DEFAULT 0,
    laatst_gegenereerd_op    DATETIME2        NULL,
    aangemaakt_op            DATETIME2        NOT NULL CONSTRAINT DF_facturen_terugkerend_aangemaakt_op DEFAULT SYSUTCDATETIME(),
    aangemaakt_door          NVARCHAR(320)    NULL,
    gewijzigd_op             DATETIME2        NOT NULL CONSTRAINT DF_facturen_terugkerend_gewijzigd_op DEFAULT SYSUTCDATETIME(),
    gewijzigd_door           NVARCHAR(320)    NULL,
    CONSTRAINT PK_facturen_terugkerend PRIMARY KEY (id)
);

CREATE INDEX IX_facturen_terugkerend_account ON dbo.facturen_terugkerend(klant_account_id);
CREATE INDEX IX_facturen_terugkerend_vervallen ON dbo.facturen_terugkerend(actief, volgende_factuurdatum);
