-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 004: leverdatum op facturen/offertes/creditnota's — de wettelijk verplichte
-- "datum van levering of uitvoering van de dienst, als deze afwijkt van de factuurdatum"
-- (zie de factuurvereisten van de Belastingdienst). Optioneel: leeg = gelijk aan de
-- factuurdatum, dus alleen invullen als het écht een andere datum is.
--
-- Uitvoeren in de Query-editor van de Azure Portal. Eén statement, geen "GO" nodig.
-- ============================================================================

SET NOCOUNT ON;

ALTER TABLE dbo.facturen_klanten
    ADD leverdatum DATE NULL;
