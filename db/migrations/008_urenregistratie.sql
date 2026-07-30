-- ============================================================================
-- Interne urenregistratie (medewerkers) — Klantportaal Activaa
-- Migratie 008: het praktijk-tijdschrijven van het eigen kantoor. Losstaand van de
-- klantgerichte "urenmodule" (dat is een product dat je PER cliënt aanzet); dit zijn de
-- uren die je EIGEN medewerkers schrijven op cliënten. Daarom de tabelprefix mw_uren_
-- (mw = medewerker/intern), zodat het niet botst met de bestaande facturatie-/urenproduct-tabellen.
--
-- Bevat:
--   dbo.mw_uren_tarieven      — per medewerker: normaal/hoog/laag uurtarief + declarabel-doel(%)
--   dbo.mw_uren_boekingen     — de urenboekingen (soort, cliënt, uren, tarief-snapshot,
--                               controle-/afboek-/opboek-/factuurvelden)
--   dbo.mw_uren_instellingen  — één rij met de herinneringsflow-instellingen
--
-- Urensoorten (kolom soort): 'abonnement' | 'uxt' | 'indirect' | 'kantoor'.
--   abonnement = standaard diensten (binnen het abonnement), declarabel=1 (WOW/OHW, meestal
--                gedekt door de vaste vergoeding maar wel op OHW gewaardeerd)
--   uxt        = uitloop/meerwerk, declarabel=1 en apart te factureren
--   indirect   = indirecte (niet-declarabele) uren, declarabel=0 — voor sturing op declarabel%
--   kantoor    = kantooruren (verlof/opleiding/overig), declarabel=0
--
-- Uitvoeren in de Query-editor van de Azure Portal. Geen "GO" nodig. Idempotent: veilig opnieuw
-- te draaien (elke tabel achter een OBJECT_ID-check, elke later toegevoegde kolom achter COL_LENGTH).
-- ============================================================================

SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- 1) Tarieven per medewerker
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.mw_uren_tarieven', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.mw_uren_tarieven (
        medewerker_email   NVARCHAR(256) NOT NULL PRIMARY KEY,
        medewerker_naam    NVARCHAR(256) NULL,
        tarief_normaal     DECIMAL(9,2)  NULL,
        tarief_hoog        DECIMAL(9,2)  NULL,
        tarief_laag        DECIMAL(9,2)  NULL,
        declarabel_doel    DECIMAL(5,2)  NULL,   -- doel declarabel-% (bijv. 85.00)
        actief             BIT           NOT NULL DEFAULT 1,
        gewijzigd_op       DATETIME2     NULL,
        gewijzigd_door     NVARCHAR(256) NULL
    );
END;

-- ---------------------------------------------------------------------------
-- 2) Urenboekingen
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.mw_uren_boekingen', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.mw_uren_boekingen (
        id                 UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        medewerker_email   NVARCHAR(256) NOT NULL,
        medewerker_naam    NVARCHAR(256) NULL,
        datum              DATE          NOT NULL,
        week_start         DATE          NOT NULL,   -- maandag van de betreffende week
        maand              CHAR(7)       NOT NULL,   -- 'YYYY-MM' voor snelle maandcontrole
        soort              NVARCHAR(20)  NOT NULL,   -- abonnement|uxt|indirect|kantoor
        declarabel         BIT           NOT NULL,   -- afgeleid van soort
        account_id         NVARCHAR(60)  NULL,       -- Dynamics accountid (leeg bij indirect/kantoor)
        klant_naam         NVARCHAR(256) NULL,
        manager_naam       NVARCHAR(256) NULL,       -- snapshot: manager op de cliënt (voor controle-scoping)
        omschrijving       NVARCHAR(1000) NULL,
        uren               DECIMAL(6,2)  NOT NULL,    -- geschreven uren
        tarief_soort       NVARCHAR(10)  NULL,        -- normaal|hoog|laag (alleen declarabel)
        tarief_bedrag      DECIMAL(9,2)  NULL,        -- snapshot uurtarief bij het boeken
        status             NVARCHAR(20)  NOT NULL DEFAULT 'open',  -- open|goedgekeurd|afgeboekt|gefactureerd
        goedgekeurde_uren  DECIMAL(6,2)  NULL,        -- na controle: te erkennen/te factureren uren
        afboek_uren        DECIMAL(6,2)  NULL,        -- afgeboekte (niet-factureerbare) uren
        afboek_reden       NVARCHAR(500) NULL,
        extra_bedrag       DECIMAL(9,2)  NULL,        -- "opboeken": extra te factureren bedrag
        extra_reden        NVARCHAR(500) NULL,
        gecontroleerd_door NVARCHAR(256) NULL,
        gecontroleerd_op   DATETIME2     NULL,
        gefactureerd       BIT           NOT NULL DEFAULT 0,
        factuur_ref        NVARCHAR(200) NULL,
        gefactureerd_op    DATETIME2     NULL,
        gefactureerd_door  NVARCHAR(256) NULL,
        aangemaakt_op      DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        gewijzigd_op       DATETIME2     NULL
    );
    CREATE INDEX IX_mw_uren_boekingen_mw_week   ON dbo.mw_uren_boekingen (medewerker_email, week_start);
    CREATE INDEX IX_mw_uren_boekingen_mw_maand  ON dbo.mw_uren_boekingen (medewerker_email, maand);
    CREATE INDEX IX_mw_uren_boekingen_manager   ON dbo.mw_uren_boekingen (manager_naam, maand);
    CREATE INDEX IX_mw_uren_boekingen_klant      ON dbo.mw_uren_boekingen (account_id, soort);
    CREATE INDEX IX_mw_uren_boekingen_factuur    ON dbo.mw_uren_boekingen (declarabel, gefactureerd, status);
END;

-- ---------------------------------------------------------------------------
-- 3) Instellingen herinneringsflow (één rij, id = 1)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.mw_uren_instellingen', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.mw_uren_instellingen (
        id                    INT           NOT NULL PRIMARY KEY DEFAULT 1,
        herinnering_actief    BIT           NOT NULL DEFAULT 0,
        herinnering_weekdag   TINYINT       NOT NULL DEFAULT 5,   -- 1=ma ... 7=zo; deadline-/herinneringsdag
        herinnering_minuren   DECIMAL(6,2)  NOT NULL DEFAULT 40,  -- verwacht aantal uren per week
        herinnering_webhook   NVARCHAR(1000) NULL,                -- Teams/Power Automate webhook-URL
        herinnering_tekst     NVARCHAR(MAX) NULL,
        laatste_run           DATETIME2     NULL,
        CONSTRAINT CK_mw_uren_instellingen_id CHECK (id = 1)
    );
    INSERT INTO dbo.mw_uren_instellingen (id) VALUES (1);
END;
