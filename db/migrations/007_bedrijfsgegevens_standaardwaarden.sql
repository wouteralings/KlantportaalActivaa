-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 007: standaardwaarden voor nieuwe facturen/offertes op
-- bedrijfsgegevens_klanten — standaard betalingstermijn (dagen), standaard BTW-code voor
-- nieuwe factuurregels, en een standaard factuurtekst (vult het "Opmerkingen"-veld voor). Alle
-- drie optioneel; leeg = de bestaande hardgecodeerde standaarden blijven gelden (30 dagen,
-- "hoog", geen tekst). Rechtstreeks door de klant zelf te wijzigen (geen goedkeuring nodig —
-- puur een eigen voorkeur, geen verificatiegegeven zoals naam/adres/KvK/BTW/IBAN, zelfde
-- categorie als cc_email uit migratie 006).
--
-- Uitvoeren in de Query-editor van de Azure Portal. Geen "GO" nodig.
--
-- Idempotent (elke kolom apart achter een COL_LENGTH-check): veilig opnieuw te draaien als
-- (een deel van) deze migratie al eerder is uitgevoerd — bijvoorbeeld per ongeluk dubbel
-- gedraaid, of handmatig al gedeeltelijk toegepast. Zonder deze check faalt een kale
-- "ALTER TABLE ... ADD kolom" met "Column name '...' is specified more than once" zodra één
-- van de drie kolommen al bestaat (29-07-2026, live database).
-- ============================================================================

SET NOCOUNT ON;

IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'standaard_betalingstermijn') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD standaard_betalingstermijn INT NULL;

IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'standaard_btw_code') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD standaard_btw_code NVARCHAR(20) NULL;

IF COL_LENGTH('dbo.bedrijfsgegevens_klanten', 'standaard_factuurtekst') IS NULL
    ALTER TABLE dbo.bedrijfsgegevens_klanten ADD standaard_factuurtekst NVARCHAR(MAX) NULL;
