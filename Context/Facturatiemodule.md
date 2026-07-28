# Facturatiemodule — status en vervolgstappen

> Zie ook `Klantportaal — overzicht en status.md` voor het bredere portaal; dit document is de
> diepgaande status van specifiek de facturatiemodule.

Kort naslagdocument (zelfde opzet als `Context/AI-context.md`) over de nieuwe facturatiemodule
in het klantportaal: klanten kunnen zelf facturen, offertes en creditnota's opstellen aan hun
eigen klanten, met een eigen productencatalogus en automatische nummering.

## Architectuurkeuze: een aparte Azure SQL Database

Bewust NIET in Dataverse: de eigen klanten (`klanten_klanten`) en producten
(`artikelen_klanten`) van een portaalklant horen niet in Activaa's Dynamics-omgeving thuis —
dat zou het CRM vervuilen met bedrijven die niets met Activaa te maken hebben, en kost
Dataverse-opslagcapaciteit per klant.

**Facturen (`facturen_klanten`) staan bewust óók in deze SQL-database, niet rechtstreeks in
Dataverse — expliciet zo besloten met Wouter (28-07-2026), dus niet opnieuw ter discussie
stellen zonder aanleiding.** Reden: Dataverse's SQL-toegang (de "Dataverse SQL"/TDS-endpoint)
is alleen-lezen — er kan geen tabel mee aangemaakt of data mee weggeschreven worden. Facturen
in Dataverse krijgen zou dus altijd vereisen dat (1) iemand met maker-rechten een custom tabel
aanmaakt via de Power Apps maker-portal, en (2) de app-gebruiker (`DYNAMICS_CLIENT_ID`, die nu
alleen leesrechten heeft op Contact/Account/Task) schrijfrechten krijgt op die nieuwe tabel via
een security role — en dat is voor nu bewust uitgesteld. Facturen worden wél ook richting
Dynamics gesynchroniseerd zodra die tabel er is (zie "Nog te doen" hieronder) zodat Activaa ze
kan terugzien/rapporteren — vandaar de kolommen `dynamics_record_id` / `dynamics_sync_status`,
die al wel klaarstaan.

Multi-tenancy: elke rij hoort bij precies één `klant_account_id` (dezelfde Dataverse
Account-GUID als `accountId` uit `herleidAccounts()` in `api/_gedeeld/identiteit.js`). Alle
queries filteren hier verplicht op — zie `api/_gedeeld/facturatieToegang.js`, dat vóór elke
aanvraag controleert dat de ingelogde gebruiker ook echt bij de opgegeven `accountId` hoort.

## Wat er nu is (deze wijziging)

- **Schema**: `db/migrations/001_facturatiemodule.sql` — vier tabellen:
  - `klanten_klanten` — de eigen (eind)klanten van een portaalklant.
  - `artikelen_klanten` — de eigen product-/dienstencatalogus.
  - `facturen_klanten` — facturen, offertes én creditnota's (`documenttype`-kolom), met
    regels als JSON (`regels_json`) en server-side berekende `subtotaal`/`btw_bedrag`/`totaal`.
  - `nummerreeksen_klanten` — hulptabel (niet expliciet gevraagd, maar noodzakelijk) voor
    concurrency-veilige automatische doornummering per klant + documenttype.
- **Data access**: `api/_gedeeld/facturatieDb.js` (SQL-connectiepool), `nummering.js`
  (nummer toekennen), `klantenKlanten.js`, `artikelenKlanten.js`, `facturenKlanten.js`
  (CRUD + statusflow), `facturatieToegang.js` (toegangscontrole + foutafhandeling).
- **API-endpoints** (zelfde stijl als bestaande `/api`-functies, authLevel anonymous +
  beveiligd via de ingebouwde Static Web Apps-auth):
  - `/api/klanten-klanten` — GET/POST/PUT/DELETE
  - `/api/artikelen-klanten` — GET/POST/PUT/DELETE
  - `/api/facturen-klanten` — GET/POST/PUT/PATCH/DELETE. PATCH-acties: `versturen`,
    `accepteren` (offerte → automatisch een nieuwe conceptfactuur), `afwijzen`, `betaald`,
    `annuleren`.
  - Alle drie verwachten `accountId` (query bij GET/DELETE, body bij POST/PUT/PATCH) — dat
    is het Dataverse Account-id van de klant waarvoor gewerkt wordt.
- **Statusflow die al werkt**: offerte concept → verzonden → geaccepteerd/afgewezen (bij
  geaccepteerd: automatisch een nieuwe factuur-concept aangemaakt, regels + klant
  overgenomen); factuur concept → verzonden → betaald/geannuleerd. Nummering (F0001, OFF0001,
  C0001, elk met eigen doorlopende reeks) gebeurt pas bij "versturen", niet bij het aanmaken
  van een concept — zo blijft de reeks aaneengesloten.
- Nieuwe dependency: `mssql` toegevoegd aan `api/package.json` — **`npm install` in `api/`
  nog uitvoeren**.
- Nieuwe Application Setting: `FACTURATIE_SQL_CONNECTIONSTRING` (zie
  `api/local.settings.json.example` voor lokaal, en zet 'm ook op de Static Web App in
  Azure na deploy).

## Aan/uit per klant + werkend klantportaal-scherm (28-07-2026, vervolgsessie)

Op verzoek ("hoe krijgen we dit werkend? Ik wil deze optie in beheer aan en uit kunnen zetten
op klantniveau") is er een schakelaar per klant gebouwd, plus een eerste werkende (geen mockup)
implementatie van het portaal-gedeelte, zodat die schakelaar ook echt iets doet:

- **`api/_gedeeld/facturatieInstellingen.js`** (nieuw) — zelfde Blob-JSON-patroon als
  `wijzigrechten.js`: per `accountId` staat er `{ ingeschakeld, gewijzigdOp, gewijzigdDoor }`
  in blob `facturatie-klanten.json` (container `portaalcontent`). **Standaard staat elke klant
  op UIT** — een klant ziet de Facturen-tab pas nadat een beheerder 'm heeft aangezet. Bewust
  géén Dataverse-veld: geen maker-toegang nodig, werkt direct.
- **`/api/beheer-facturatie-klanten`** (nieuw, alleen rol `beheerder`) — GET geeft alle
  statussen, PUT `{ accountId, ingeschakeld }` zet er één.
- **`facturatieToegang.js`** (uitgebreid) — `controleerToegang()` gooit nu ook
  `MODULE_UITGESCHAKELD` (403) als het account niet is aangezet — dus zelfs een rechtstreekse
  aanroep van `/api/facturen-klanten` e.d. wordt geblokkeerd, niet alleen de UI.
- **`/api/mijn-gegevens`** (uitgebreid) — elk account in de response heeft nu
  `facturatieIngeschakeld: bool`, zodat het klantportaal in één bestaande call weet of het de
  tab moet tonen.
- **Beheerdersportaal** (`src/beheer/BeheerPortaal.jsx`) — nieuwe tab "Facturatie": een
  doorzoekbare lijst van alle klanten (uit `/api/beheer-klanten`) met een aan/uit-schakelaar
  per rij, direct opgeslagen (geen aparte "Opslaan"-knop), met optimistic update + terugdraaien
  bij een fout.
- **Klantportaal** (`src/portaal/KlantPortaal.jsx` + nieuw `src/portaal/FacturatieModule.jsx`)
  — de tab "Facturen" (met "Nieuw"-badge) verschijnt nu alleen als minstens één gekoppeld
  account is ingeschakeld, ná "Documenten" en vóór "Veelgestelde vragen". `FacturatieModule.jsx`
  is een **echte werkende React-implementatie** (geen HTML-mockup meer) met sub-tabbladen
  Facturen / Offertes / Klanten / Producten / Instellingen, rechtstreeks gekoppeld aan de al
  bestaande endpoints (`/api/facturen-klanten`, `/api/klanten-klanten`, `/api/artikelen-klanten`):
  lijst met filters + statistiektegels, concept aanmaken/bewerken met regeleditor, versturen/
  accepteren/afwijzen/betaald/annuleren, en volledige CRUD voor eigen klanten en producten. De
  Instellingen-sub-tab toont voor Bedrijfsgegevens & logo / Mollie & betalingen / Standaardwaarden
  / Herinneringen bewust nog steeds "NOG NIET GEBOUWD"-kaarten — die vier stukken (zie
  onderdelen 4, 6 hieronder en het logo/Mollie-gedeelte) bestaan nog niet.
- Alle nieuwe/gewijzigde bestanden zijn syntactisch gecontroleerd (`node --check` op de
  Functions, esbuild op de JSX) en weggeschreven naar de lokale werkmap; **nog niet gecommit**
  (zie hieronder).

### Belangrijk: nog niets van de facturatiemodule zit in git

`git status` in de werkmap laat zien dat alle facturatiemodule-bestanden (dit onderdeel én het
eerdere backend-fundament: `klantenKlanten.js`, `artikelenKlanten.js`, `facturenKlanten.js`,
`nummering.js`, `facturatieDb.js`, de vier API-folders, `db/migrations/…`, dit document) nog
als **ongetrackt (`??`)** te boek staan — er is dus nog nooit een `git add`/`git commit` op
gedaan, laat staan een push. Zolang dat niet gebeurt, verandert er niets aan de live Static Web
App (die draait op wat er bij de laatste push stond). Vóór dit werkend wordt op
klantportaalactivaa zelf, moet er dus nog: `npm install` in `api/` (voor de nieuwe `mssql`-
dependency), `git add` + `git commit` + `git push` (triggert de GitHub Actions-deploy).

## Nog te doen (bewust nog niet gebouwd, om scope behapbaar te houden)

1. **Committen + deployen** — zie hierboven: `npm install` in `api/`, dan committen en pushen.
2. **Azure SQL Database provisioneren** — er bestaat nog geen database. Server + database
   aanmaken (regio, pricing tier, firewall/Managed Identity), dan
   `db/migrations/001_facturatiemodule.sql` er één keer tegen uitvoeren, en de
   connection string in `FACTURATIE_SQL_CONNECTIONSTRING` zetten (lokaal én als Application
   Setting op de Static Web App in Azure). Er is in deze sessie Azure CLI-toegang aangetroffen
   tot de subscription "OfferteTool" — dit zou dus ook direct uitgevoerd kunnen worden, maar is
   bewust niet gedaan zonder expliciet akkoord (het is een nieuwe, betalende Azure-resource).
3. **Dynamics-koppeling voor facturen** — bewust uitgesteld (zie hierboven). Als dit alsnog
   gebouwd wordt: een custom tabel in Dataverse aanmaken (bijv. `cr283_factuur`) via de maker-
   portal (niet via SQL — dat kan niet), met een relatie naar Account, schrijfrechten voor
   `DYNAMICS_CLIENT_ID` op die tabel, en dan een sync-stap die na elke aanmaak/statuswijziging
   in `facturen_klanten` de rij wegschrijft/bijwerkt in die tabel (vult dan
   `dynamics_record_id`/`dynamics_sync_status`). De code-kant (een `syncNaarDynamics()`-functie
   aanroepen vanuit `facturenKlanten.js`) is nog niet gebouwd.
4. **Terugkerende facturen** — patroon (frequentie, volgende generatiedatum) + een
   tijdgestuurde Azure Function (timer trigger) die op basis daarvan automatisch nieuwe
   facturen aanmaakt. Nog geen tabel/code voor.
5. **Herinneringen** — de e-mailsjablonen bestaan al (Beheer → Instellingen →
   E-mailsjablonen, zie screenshot "Eerste herinnering"/"Laatste aanmaning"); er is nog geen
   job die verlopen facturen signaleert en op basis daarvan automatisch een herinnering
   verstuurt via die sjablonen.
6. **Logo + eigen factuurgegevens** — moet volgens de eis via het bestaande
   wijzigingsverzoek-mechanisme (`api/_gedeeld/wijzigingen.js`) lopen; nog niet aangesloten
   op facturatie-specifieke velden (bedrijfsnaam op de factuur, IBAN, BIC, logo-URL, enz.).
   Staat als "nog niet gebouwd"-kaart in de Instellingen-sub-tab.
7. **Mollie-koppeling & standaardwaarden** — eveneens nog "nog niet gebouwd"-kaarten in de
   Instellingen-sub-tab.
8. **PDF-generatie** — `pdf-lib` staat al als dependency in `api/package.json` (waarschijnlijk
   vanuit de vroegere offertetool); nog geen factuur-PDF-layout gebouwd op basis van
   `facturen_klanten`.
