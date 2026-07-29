-- ============================================================================
-- Facturatiemodule — Klantportaal Activaa
-- Migratie 006: cc-mailadres op bedrijfsgegevens_klanten — een optioneel eigen e-mailadres
-- dat wordt meegenomen als CC bij het versturen van een factuur/offerte/creditnota naar de
-- (eind)klant, zodat de portaalklant zelf ook een kopie krijgt (bevestiging dat 'm ook echt
-- verstuurd is). Rechtstreeks door de klant zelf te wijzigen (geen goedkeuring nodig — puur
-- een eigen voorkeur, geen verificatiegegeven zoals naam/adres/KvK/BTW/IBAN).
--
-- Uitvoeren in de Query-editor van de Azure Portal. Eén statement, geen "GO" nodig.
-- ============================================================================

SET NOCOUNT ON;

ALTER TABLE dbo.bedrijfsgegevens_klanten
    ADD cc_email NVARCHAR(320) NULL;
