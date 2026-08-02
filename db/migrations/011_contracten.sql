-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 011: Contractmanagement (dbo.contracten_klanten) — zelf geregistreerde doorlopende
-- contracten (verzekeringen, telefonie, overig) van een portaalklant, met het oog op
-- automatische verloopherinneringen (Stap 5 van het contractmanagement-plan, nog te bouwen).
--
-- Achtergrond / afgestemde keuzes met Wouter (02-08-2026, zie project-doc
-- "Klantportaal — overzicht en status.md", sectie "Contractmanagement"):
--   - Contracttypes: een vaste lijst, maar BEWUST NIET als DB CHECK-constraint afgedwongen
--     (in tegenstelling tot bijv. voertuig_type op voertuigen_klanten) — de lijst staat als
--     GELDIGE_TYPES in api/_gedeeld/contractenKlanten.js en is dus zonder migratie aan te
--     passen zodra Wouter de definitieve typen doorgeeft. `type` is hier dus gewoon
--     NVARCHAR(50) NOT NULL, met de validatie in de applicatielaag.
--   - Reminder-drempels (welke dagen vóór einddatum): volgen in Stap 5; dit schema legt alleen
--     de einddatum vast plus twee kolommen om te onthouden welke drempel al eens is verstuurd
--     (laatste_reminder_dagen/laatste_reminder_verzonden_op), zodat de herinneringsjob
--     (nog te bouwen) niet twee keer dezelfde herinnering stuurt.
--   - Verwijderen door de klant is NIET toegestaan (audit-overweging, besluit §5.7) — er is dus
--     bewust GEEN eigen "verwijderd/gearchiveerd"-kolom of DELETE-pad in dit schema; alleen
--     toevoegen en aanpassen. Een eventuele "archiveren"-optie is een latere, aparte afweging.
--   - Storage: dezelfde Azure SQL-database als Facturatie/Uren/Ritten (FACTURATIE_SQL_CONNECTIONSTRING)
--     — geen nieuwe, eigen database. Zelfde tenant-regel: elke rij hoort bij precies één
--     klant_account_id (Dataverse Account-GUID uit herleidAccounts()), alle queries filteren
--     daar verplicht op.
--
-- Uitvoeren in de Query-editor van de Azure Portal (tegen de bestaande "facturatie"-database,
-- zelfde server als migratie 001 t/m 010). Geen "GO" gebruiken — de portal-Query-editor
-- ondersteunt dat niet, statements los aanleveren, gescheiden door een puntkomma.
--
-- Idempotent: de tabel staat achter een IF OBJECT_ID(...) IS NULL-check — veilig opnieuw te
-- draaien, zelfde afspraak als migratie 007 t/m 010.
-- ============================================================================

SET NOCOUNT ON;

IF OBJECT_ID('dbo.contracten_klanten', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.contracten_klanten (
        id                          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_contracten_klanten_id DEFAULT NEWID(),
        klant_account_id            UNIQUEIDENTIFIER NOT NULL,      -- tenant-scope (Dataverse Account-id van de portaalklant)
        type                        NVARCHAR(50)     NOT NULL,      -- vaste lijst, zie GELDIGE_TYPES in contractenKlanten.js (bewust geen CHECK-constraint)
        naam                        NVARCHAR(200)    NOT NULL,      -- eigen omschrijving, bijv. "Bedrijfsaansprakelijkheidsverzekering"
        leverancier                 NVARCHAR(200)    NULL,          -- verzekeraar/provider/leverancier
        contractnummer              NVARCHAR(100)    NULL,
        ingangsdatum                DATE             NULL,
        einddatum                   DATE             NULL,          -- "verloopdatum" — leidend voor de verloopherinneringen (Stap 5)
        opzegtermijn_dagen          INT              NULL,           -- aantal dagen vóór einddatum dat opgezegd moet zijn
        automatische_verlenging     BIT              NOT NULL CONSTRAINT DF_contracten_klanten_autoverlenging DEFAULT 1,
        frequentie                  VARCHAR(12)      NULL,          -- 'maandelijks' | 'kwartaal' | 'jaarlijks' | 'eenmalig' (zelfde codes als facturen_terugkerend waar van toepassing)
        bedrag                      DECIMAL(12, 2)   NULL,          -- premie/kosten per frequentie-periode
        opmerkingen                 NVARCHAR(MAX)    NULL,
        laatste_reminder_dagen      INT              NULL,          -- welke drempel (bijv. 30/60/90) het laatst is verstuurd — voorkomt dubbele mails (Stap 5)
        laatste_reminder_verzonden_op DATETIME2(3)   NULL,
        aangemaakt_op               DATETIME2(3)     NOT NULL CONSTRAINT DF_contracten_klanten_aangemaakt DEFAULT SYSUTCDATETIME(),
        aangemaakt_door             NVARCHAR(320)    NULL,
        gewijzigd_op                DATETIME2(3)     NULL,
        gewijzigd_door              NVARCHAR(320)    NULL,
        CONSTRAINT PK_contracten_klanten PRIMARY KEY (id)
    );
END;

-- Snel de contractenlijst per klantaccount opvragen, gesorteerd op verloopdatum (de "Contracten"-
-- tab toont standaard eerst wat het eerst verloopt).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contracten_klanten_tenant' AND object_id = OBJECT_ID('dbo.contracten_klanten'))
BEGIN
    CREATE INDEX IX_contracten_klanten_tenant ON dbo.contracten_klanten (klant_account_id, einddatum);
END;

-- Voor de toekomstige, over ALLE klantaccounts heen draaiende herinneringsjob (Stap 5): snel
-- alle contracten vinden die binnen een bepaalde termijn verlopen, ongeacht klantaccount.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contracten_klanten_einddatum' AND object_id = OBJECT_ID('dbo.contracten_klanten'))
BEGIN
    CREATE INDEX IX_contracten_klanten_einddatum ON dbo.contracten_klanten (einddatum) INCLUDE (klant_account_id, laatste_reminder_dagen);
END;
