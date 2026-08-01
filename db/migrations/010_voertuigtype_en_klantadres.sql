-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 010: voertuigtype (auto/motor/fiets) op voertuigen_klanten.
--
-- Achtergrond: Wouter gaf aan dat een voertuig ook een fiets of motor kan zijn, niet alleen
-- een auto — dit voegt een type-keuze toe zodat het formulier (en later eventueel een
-- bijtellingsberekening) daar rekening mee kan houden. Cataloguswaarde blijft bestaan maar is
-- voor een fiets niet verplicht (zie api/_gedeeld/voertuigenKlanten.js).
--
-- Uitvoeren in de Query-editor van de Azure Portal (tegen de bestaande "facturatie"-database,
-- zelfde server als migratie 001 t/m 009). Geen "GO" gebruiken.
--
-- Let op: de constraint-toevoeging staat in dynamische SQL (EXEC(...)). Dat is nodig omdat je
-- een kolom die je net met ALTER TABLE ADD hebt toegevoegd, niet in dezelfde batch mag
-- gebruiken zonder een "GO" ertussen — en de Azure Portal Query-editor ondersteunt geen "GO".
--
-- Idempotent: veilig opnieuw te draaien, zelfde afspraak als de eerdere migraties.
-- ============================================================================

SET NOCOUNT ON;

IF COL_LENGTH('dbo.voertuigen_klanten', 'voertuig_type') IS NULL
    ALTER TABLE dbo.voertuigen_klanten ADD voertuig_type VARCHAR(10) NOT NULL CONSTRAINT DF_voertuigen_klanten_type DEFAULT 'auto';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_voertuigen_klanten_type')
BEGIN
    EXEC('ALTER TABLE dbo.voertuigen_klanten ADD CONSTRAINT CK_voertuigen_klanten_type CHECK (voertuig_type IN (''auto'', ''motor'', ''fiets''))');
END;
