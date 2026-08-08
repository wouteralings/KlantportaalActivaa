-- ============================================================================
-- Klantportaal Activaa — Planningsmodule
-- Migratie 013: dbo.planning_config_klanten — de per-klant planning-configuratie
-- ("wat doen we voor deze klant"), Planningsmodule Stap 3a.
--
-- Elke rij is één afspraak: activiteit + frequentie + indicatie-uren voor één klant. De
-- toewijzing komt standaard uit het TEAM van de klant (de rol die in Beheer → Planning aan de
-- activiteit hangt → de bijbehorende persoon op de klant in Dynamics: assistent/manager/
-- accountant/fiscaal/loon/backup). `toegewezen_aan` is een OPTIONELE afwijking van dat team; is
-- die gevuld, dan wordt de afwijking in de UI duidelijk gemarkeerd. Blijft leeg = volg het team.
--
-- Uit deze configuratie wordt (Stap 3b) de maandplanning afgeleid, afgezet tegen het rooster.
-- Los hiervan blijven de ad-hoc losse planningsregels (dbo.planning_klanten, Stap 2) gewoon
-- bestaan ("config + losse regels ernaast", afgestemd 08-08-2026).
--
-- Storage: dezelfde Azure SQL-database als de rest (FACTURATIE_SQL_CONNECTIONSTRING). Idempotent,
-- zelfde stijl als migratie 007 t/m 012. Uitvoeren in de Azure Portal Query-editor, statements los
-- gescheiden door een puntkomma (geen "GO").
-- ============================================================================

SET NOCOUNT ON;

IF OBJECT_ID('dbo.planning_config_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.planning_config_klanten (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_planning_config_id DEFAULT NEWID(),
        klant_account_id    UNIQUEIDENTIFIER NOT NULL,      -- tenant-scope (Dataverse Account-id van de klant)
        activiteit          NVARCHAR(100)    NOT NULL,      -- sleutel uit de beheerbare activiteitenlijst
        frequentie          VARCHAR(12)      NOT NULL CONSTRAINT DF_planning_config_freq DEFAULT 'maandelijks', -- maandelijks | kwartaal | jaarlijks | eenmalig
        indicatie_uren      DECIMAL(6, 2)    NULL,          -- INDICATIE van de werkzaamheden (inschatting werklast)
        toegewezen_aan      NVARCHAR(320)    NULL,          -- OPTIONELE afwijking van het team; leeg = volg het team (rol → Dynamics-persoon)
        actief              BIT              NOT NULL CONSTRAINT DF_planning_config_actief DEFAULT 1,
        opmerkingen         NVARCHAR(MAX)    NULL,
        aangemaakt_op       DATETIME2(3)     NOT NULL CONSTRAINT DF_planning_config_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door     NVARCHAR(320)    NULL,
        gewijzigd_op        DATETIME2(3)     NULL,
        gewijzigd_door      NVARCHAR(320)    NULL,
        CONSTRAINT PK_planning_config_klanten PRIMARY KEY (id)
    );
END;

-- Snel de configuratie per klantaccount opvragen.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_planning_config_tenant' AND object_id = OBJECT_ID('dbo.planning_config_klanten'))
BEGIN
    CREATE INDEX IX_planning_config_tenant ON dbo.planning_config_klanten (klant_account_id, actief);
END;

-- Voor het over-alle-klanten-heen afleiden van de maandplanning (Stap 3b): op activiteit.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_planning_config_activiteit' AND object_id = OBJECT_ID('dbo.planning_config_klanten'))
BEGIN
    CREATE INDEX IX_planning_config_activiteit ON dbo.planning_config_klanten (activiteit) INCLUDE (klant_account_id, frequentie, indicatie_uren);
END;
