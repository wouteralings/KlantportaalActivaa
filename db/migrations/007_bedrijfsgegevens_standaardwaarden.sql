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
-- Uitvoeren in de Query-editor van de Azure Portal. Eén statement, geen "GO" nodig.
-- ============================================================================

SET NOCOUNT ON;

ALTER TABLE dbo.bedrijfsgegevens_klanten
    ADD standaard_betalingstermijn INT NULL,
        standaard_btw_code NVARCHAR(20) NULL,
        standaard_factuurtekst NVARCHAR(MAX) NULL;
