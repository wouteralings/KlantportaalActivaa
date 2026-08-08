-- ============================================================================
-- Klantportaal Activaa — Planningsmodule
-- Migratie 014: uitvoermaand per configuratieregel (Stap 3c).
--
-- Bij een JAAR-/eenmalige activiteit stel je op de klantkaart in welke maand die uitgevoerd
-- moet worden (bijv. Jaarrekening = mei). De maandplanning plaatst de regel dan in díe maand,
-- i.p.v. in het aparte "geen vaste maand"-lijstje. 1 = januari .. 12 = december; NULL = geen
-- vaste maand.
--
-- Idempotent (kolom achter een COL_LENGTH-check), zelfde stijl als migratie 007 t/m 013.
-- Uitvoeren in de Azure Portal Query-editor (facturatie-database).
-- ============================================================================

SET NOCOUNT ON;

IF COL_LENGTH('dbo.planning_config_klanten', 'uitvoer_maand') IS NULL
BEGIN
    ALTER TABLE dbo.planning_config_klanten ADD uitvoer_maand TINYINT NULL;
END;
