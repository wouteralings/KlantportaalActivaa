-- ============================================================================
-- Klantportaal Activaa — Planningsmodule
-- Migratie 012: dbo.planning_klanten — een simpele, interne planning per klant
-- (medewerkerskant), als vervanging op hoofdlijnen van de maand-/jaarplanning uit
-- Offsoo. Elke rij is één geplande activiteit voor één klant.
--
-- Afgestemde keuzes met Wouter (07-08-2026):
--   - GEEN migratie/koppeling met Offsoo; een eigen, lichte planning.
--   - Uren = een INDICATIE van de werkzaamheden die we aan een planningsregel
--     meegeven (inschatting werklast), GEEN echte urenregistratie. Vandaar
--     `indicatie_uren` los van de bestaande urenmodule.
--   - Eén tabel, gekoppeld aan de klant via `klant_account_id` (Dataverse Account-
--     GUID uit herleidAccounts()). De planning is medewerker-breed: er is bewust
--     GEEN per-klant aan/uit-schakelaar (in tegenstelling tot Facturatie/Contracten)
--     — de toegang loopt via het medewerkersrecht `magPlanning` (zie
--     api/_gedeeld/planningRecht.js), niet via een klant-toggle.
--   - Activiteiten en statussen zijn vrije tekst (NVARCHAR), gevalideerd in de
--     applicatielaag tegen een in Beheer beheerbare lijst (volgende stap) — bewust
--     GEEN CHECK-constraint, zodat de lijst zonder migratie aan te passen is
--     (zelfde afspraak als `type` op contracten_klanten).
--
-- Storage: dezelfde Azure SQL-database als Facturatie/Uren/Ritten/Contracten
-- (FACTURATIE_SQL_CONNECTIONSTRING) — geen nieuwe, eigen database.
--
-- Uitvoeren in de Query-editor van de Azure Portal (tegen de "facturatie"-database,
-- zelfde server als migratie 001 t/m 011). Geen "GO" gebruiken; statements los,
-- gescheiden door een puntkomma.
--
-- Idempotent: tabel + indexen staan achter IF ... IS NULL/NOT EXISTS-checks — veilig
-- opnieuw te draaien, zelfde afspraak als migratie 007 t/m 011.
-- ============================================================================

SET NOCOUNT ON;

IF OBJECT_ID('dbo.planning_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.planning_klanten (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_planning_klanten_id DEFAULT NEWID(),
        klant_account_id    UNIQUEIDENTIFIER NOT NULL,      -- tenant-scope (Dataverse Account-id van de klant)
        activiteit          NVARCHAR(100)    NOT NULL,      -- bv. Administratie / Omzetbelasting / Jaarrekening (beheerbare lijst, geen CHECK)
        type                VARCHAR(10)      NOT NULL CONSTRAINT DF_planning_klanten_type DEFAULT 'maand',  -- 'maand' | 'jaar' (voor de twee overzichten)
        periode             NVARCHAR(20)     NULL,          -- bv. '2026-07' (maand) of '2026' (boekjaar)
        deadline            DATE             NULL,
        status              NVARCHAR(60)     NULL,          -- beheerbare statuslijst (bv. Te doen / Bezig / Gereed)
        toegewezen_aan      NVARCHAR(320)    NULL,          -- e-mail/naam van de medewerker
        indicatie_uren      DECIMAL(6, 2)    NULL,          -- INDICATIE van de werkzaamheden (inschatting werklast), geen echte uren
        opmerkingen         NVARCHAR(MAX)    NULL,
        aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_planning_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door     NVARCHAR(320)    NULL,
        gewijzigd_op        DATETIME2(3)     NULL,
        gewijzigd_door      NVARCHAR(320)    NULL,
        CONSTRAINT PK_planning_klanten PRIMARY KEY (id)
    );
END;

-- Snel de planningsregels per klantaccount opvragen, gesorteerd op deadline.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_planning_klanten_tenant' AND object_id = OBJECT_ID('dbo.planning_klanten'))
BEGIN
    CREATE INDEX IX_planning_klanten_tenant ON dbo.planning_klanten (klant_account_id, deadline);
END;

-- Voor het medewerkersoverzicht over ALLE klanten heen: filteren op type/periode/deadline.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_planning_klanten_overzicht' AND object_id = OBJECT_ID('dbo.planning_klanten'))
BEGIN
    CREATE INDEX IX_planning_klanten_overzicht ON dbo.planning_klanten (type, periode, deadline) INCLUDE (klant_account_id, status, toegewezen_aan);
END;
