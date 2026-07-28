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

## Azure SQL Database + productie-config (28-07-2026, vervolgsessie)

De database is inmiddels geprovisioneerd (was nog niet gedaan toen bovenstaande sectie
geschreven werd): server `sql-klantportaal-activaa` (West-Europa, geo-redundante back-ups),
database `facturatie` (Basic-tier, ~€4,90/mnd), alle vier tabellen uit
`db/migrations/001_facturatiemodule.sql` succesvol aangemaakt via de Portal Query-editor (let
op: die ondersteunt geen `GO`-batchscheiding, statements los aanleveren). Verbinding loopt via
Microsoft Entra Service Principal-authenticatie (hergebruik van de bestaande Dataverse
app-registratie `DYNAMICS_CLIENT_ID`/`DYNAMICS_CLIENT_SECRET`/`DYNAMICS_TENANT_ID`, expliciet
gekozen boven een los SQL-wachtwoord — "lijkt mij veiliger"), met `db_datareader`/
`db_datawriter`-rechten toegekend via `CREATE USER ... FROM EXTERNAL PROVIDER`. De
connection string staat als Application Setting `FACTURATIE_SQL_CONNECTIONSTRING` op
`klantportaal-activaa`. **Twee productie-blockerende bugs zijn bij deze gelegenheid gevonden
en gefixt**: `mssql` ontbrak als dependency in `api/package.json` (elke facturatie-DB-call zou
"Cannot find module 'mssql'" gooien), en `staticwebapp.config.json` had geen route-restrictie
op `/api/beheer-facturatie-klanten` (elke ingelogde klant — niet alleen een beheerder — kon
'm aanroepen). Beide zijn gecorrigeerd.

**Nog belangrijker: de complete frontend-koppeling uit de vorige sectie ("Aan/uit per klant +
werkend klantportaal-scherm") stond alleen in een lokale werkmap en was nog nooit gecommit** —
`KlantPortaal.jsx` had geen "Facturen"-tab, `BeheerPortaal.jsx` geen "Facturatie"-tab, en
`facturatieToegang.js`/`mijn-gegevens/index.js` misten de `MODULE_UITGESCHAKELD`-check
respectievelijk `facturatieIngeschakeld`-flag. Die volledige koppeling is nu opnieuw
doorgevoerd (en ditmaal wél klaar om gecommit te worden — zie "Nog te doen" hieronder).

## Standaardartikelen + BTW-tarieven met geldigheidsperiode (28-07-2026, zelfde sessie)

Op verzoek ("kunnen we ook een paar artikelen maken die bij iedereen beschikbaar zijn... en
BTW-percentages die we met begin- en einddatum kunnen onderhouden") zijn twee dingen
toegevoegd, met als expliciete keuzes: één centraal beheerde artikellijst (niet per klant
instelbaar) en een direct werkend BTW-beheerscherm (niet uitgesteld):

- **`dbo.btw_tarieven`** (migratie `002_facturatiemodule_standaarden.sql`) — vier vaste
  categorieën (`nul`, `laag`, `hoog`, `vrijgesteld`), elk met `percentage` + `geldig_vanaf` +
  (optioneel) `geldig_tot`. Een nieuw tarief voor een code sluit automatisch het vorige tarief
  van diezelfde code af (`geldig_tot` = dag vóór de nieuwe `geldig_vanaf`) — zie
  `api/_gedeeld/btwTarieven.js`. Voorgevuld met de actuele Nederlandse tarieven (0% / 9% sinds
  2019 / 21% sinds 2012 / vrijgesteld). Al gemaakte facturen bevriezen het percentage op het
  moment van opstellen (`regels_json`), dus een latere tariefswijziging verandert nooit een
  bestaande factuur.
- **`dbo.artikelen_algemeen`** (zelfde migratie) — centraal (alleen via Beheer) beheerde
  artikelen, voor elke klant beschikbaar als keuze bij het opstellen van een factuur/offerte,
  zonder `klant_account_id`. Voorgevuld met Managementvergoeding / Huur (per maand) / Diensten
  (per uur), prijs bewust op € 0,00 — invullen via Beheer → Facturatie → Standaardartikelen.
  BTW-percentage wordt hier **niet opgeslagen maar live opgezocht** via `btw_code` bij elke
  ophaal-aanroep (`api/_gedeeld/artikelenAlgemeen.js`), dus volgt automatisch een latere
  tariefswijziging.
- **`dbo.artikelen_klanten`** (uitgebreid, zelfde migratie) — kreeg een `btw_code`-kolom erbij.
  `artikelenKlanten.js` accepteert nu `btwCode` i.p.v. een los percentage, zoekt het actuele
  percentage op en slaat beide op (**write-through**, dus wél bevroren totdat het artikel zelf
  opnieuw wordt opgeslagen) — dit is bewust anders dan `artikelen_algemeen` (dat altijd live
  opzoekt), omdat een klant zijn eigen artikel-percentage niet ongevraagd wil zien veranderen.
- **Nieuwe API-endpoints**: `/api/btw-tarieven` (klant-facing, GET, actuele tarieven),
  `/api/beheer-btw-tarieven` (beheerder-only, GET volledige historie + POST nieuw tarief),
  `/api/artikelen-algemeen` (klant-facing, GET), `/api/beheer-artikelen-algemeen`
  (beheerder-only, volledige CRUD) — alle vier met bijbehorende route-restrictie in
  `staticwebapp.config.json`.
- **`FacturatieModule.jsx`**: `ArtikelFormulier` heeft nu een BTW-keuzelijst (i.p.v. een los
  percentage-veld) gevuld vanuit `/api/btw-tarieven`; betalingstermijn is een keuzelijst
  geworden (7/14/21/30 dagen, met terugval op de bestaande waarde bij het bewerken van een
  ouder concept); de tab "Producten" toont naast de eigen catalogus ook een read-only sectie
  "Standaardartikelen van Activaa"; deze artikelen verschijnen ook gewoon als keuze bij het
  samenstellen van een factuur/offerte-regel.
- **`BeheerPortaal.jsx`**, tab "Facturatie": naast de bestaande klant-aan/uit-lijst nu ook twee
  nieuwe secties — "BTW-tarieven" (volledige historie + formulier om een nieuw tarief toe te
  voegen) en "Standaardartikelen" (lijst met inline bewerken/toevoegen/verwijderen).
- De "Standaardwaarden"-kaart in de klant-facing Instellingen-sub-tab blijft bewust op "nog
  niet gebouwd" staan — dat gaat over een klant die zíjn eigen standaardwaarden instelt, iets
  anders dan deze door Activaa centraal beheerde tarieven/artikelen.

## Bedrijfsgegevens & logo + aanvraagflow (28-07-2026, vervolgsessie)

Op verzoek ("Bedrijfsgegevens & Logo inclusief factuurgegevens... als ik meerdere klanten actief
heb als gebruiker moet het net als in beheersportaal zichtbaar zijn per clientnummer/naam en
dan dat je het dicht en open kan klappen") is de eigen-afzendergegevens-kaart gebouwd, plus de
mogelijkheid voor een klant om de facturatiemodule zelf aan te vragen als hij hem nog niet heeft:

- **`dbo.bedrijfsgegevens_klanten`** (migratie `003_bedrijfsgegevens_klanten.sql`) — één rij per
  `klant_account_id` (upsert): bedrijfsnaam, adres, KvK-/BTW-nummer, IBAN + tenaamstelling,
  logo-URL. Direct zelf te wijzigen door de klant, **geen goedkeuring nodig** (in tegenstelling
  tot bedrijfs-/contactgegevens uit Dynamics bij "Mijn gegevens", die wél via het
  wijzigingsverzoek-mechanisme lopen).
- **Nieuwe endpoints**: `/api/bedrijfsgegevens-klanten` (GET/PUT), `/api/bedrijfsgegevens-logo`
  (POST, los upload-endpoint dat naar blob-container `portaalmedia` wegschrijft als
  `klantlogo-{accountId}`), `/api/facturatie-aanvraag` (POST — een klant zonder de module kan
  hiermee een aanvraag indienen; valideert het account los van `controleerToegang()`, want de
  module staat per definitie nog uit).
- **`facturatieInstellingen.js`** uitgebreid: de bestaande aan/uit-blob (`facturatie-
  klanten.json`) bevat nu ook `aangevraagdOp`/`aangevraagdDoor` per account, gezet door
  `zetAanvraag()` en automatisch weer gewist zodra een beheerder de module aanzet.
- **`FacturatieModule.jsx`** volledig herbouwd van "één module voor het eerste account" naar
  een **per-klant inklapbare lijst** (zelfde patroon als "Mijn gegevens"): elk gekoppeld account
  krijgt een eigen kaart met cliëntnummer/naam, open/dicht te klappen. Staat de module voor dat
  account nog uit, dan toont de kaart een locked/pricing-kaart (€ 5,-/maand) met een
  "Vraag aan"-knop i.p.v. de volle module.
- **Beheerdersportaal**, tab "Facturatie": de klant-aan/uit-lijst sorteert accounts met een
  openstaande aanvraag automatisch bovenaan, met een blauw label "Aangevraagd op … door …".
- Commit `29b6fb1` (door Wouter zelf gepusht), migratie 003 tegen de live database gedraaid en
  bevestigd ("De query is uitgevoerd").

## BTW-codes, factuurvereisten Belastingdienst en admin-verfijningen (28-07-2026, vervolgsessie)

Op basis van een aantal opeenvolgende verzoeken, waaronder de letterlijke checklist van de
Belastingdienst voor de minimaal verplichte factuurgegevens ("Naam en adres van de leverancier
[...] Het btw-bedrag"), is de factuur/offerte-weergave en een aantal beheerschermen verder
afgewerkt:

- **BTW-code i.p.v. los percentage op factuurregels** — de klant kiest nu bij elke regel een
  BTW-code (nul/laag/hoog/vrijgesteld) uit een keuzelijst i.p.v. zelf een percentage te typen
  (bron van typefouten). `facturen_klanten.regels_json` bevat per regel nu ook `btwCode`
  (puur informatief — de berekening zelf blijft op het bevroren `btwPercentage` draaien).
- **`dbo.facturen_klanten.leverdatum`** (migratie `004_facturen_leverdatum.sql`, nullable) — de
  wettelijk verplichte "datum van levering, als deze afwijkt van de factuurdatum"; optioneel
  invulveld, alleen getoond op de factuur als hij ook echt gezet is.
- **`DocumentVoorbeeld` (in `FacturatieModule.jsx`) is geünificeerd** — zowel het live voorbeeld
  tijdens het invullen als de weergave van een al opgeslagen document gebruiken nu hetzelfde
  component, en tonen: het volledige adres van de afnemer (niet meer alleen de naam), de
  leverdatum (indien gezet), en het btw-bedrag **per toegepast tarief apart** zodra een document
  meerdere tarieven mengt (via een nieuwe `groepeerBtw()`-helper). Dit dekt de door Wouter
  aangeleverde Belastingdienst-checklist.
- **Bedrijfsgegevens & logo**: als er voor een account nog niets is opgeslagen (geen
  bedrijfsnaam, nooit gewijzigd), wordt het formulier voor-ingevuld met bedrijfsnaam, adres en
  KvK-nummer uit Dynamics (`kvkNummer` is hiervoor nu ook opgenomen in de `/api/mijn-gegevens`-
  response) — alleen als aanvulling, nooit als overschrijving van al opgeslagen gegevens. Plus
  een "Logo verwijderen"-knop (stuurt `logoUrl: ""` naar de bestaande PUT, wat de kolom leegt).
- **Klanten/Producten-tabs**: gesplitst in een "Actief"- en "Niet actief"-sectie i.p.v. één
  gedimde lijst, zodat het overzicht rustiger blijft.
- **Beheerdersportaal**: alle rubrieken (Huisstijl t/m Instellingen) staan nu standaard
  dichtgeklapt i.p.v. open.
- **BTW-tarieven-beheer herbouwd** als bewerkbare lijst, zelfde patroon als Standaardartikelen:
  elke bestaande rij is direct te bewerken (via `wijzigTarief`/PUT, die server-side al bestond
  maar nog geen UI had) i.p.v. alleen een nieuw tarief kunnen toevoegen; duidelijke
  "+ Nieuw tarief"-knop in de koptekst.
- **Facturatiemodule-klantenlijst in Beheer**: dezelfde 25/50/100/250/500/Alle-paginering als
  het Medewerkersportaal, i.p.v. een intern scrollend lijstje.
- **Rood badge met aantal**: de tab "Facturatie" in Beheer toont nu een rood rondje met het
  aantal openstaande aanvragen, zodat een beheerder dit niet over het hoofd ziet.
- Alles geverifieerd met `npx vite build` (production-bundle, 1913 modules) en `npx oxlint`
  (geen nieuwe waarschuwingen t.o.v. de bestaande). Gecommit op de machine als `945ac91`; de
  push liep tegen een tijdelijke proxy-403-foutmelding aan (bekend, intermitterend probleem
  deze sessie) — Wouter moet `git push` zelf nog eenmaal uitvoeren. Migratie 004 moet nog
  tegen de live database gedraaid worden.

## Nog te doen (bewust nog niet gebouwd, om scope behapbaar te houden)

1. ~~Committen + deployen~~ — **afgerond (28-07-2026)**. Commit `66cc80c` (standaardartikelen
   + BTW-tarieven) en `71e2bdb` (migratiebestand-fix, zie hieronder) zijn gecommit en gepusht.
   Migratie `002_facturatiemodule_standaarden.sql` is tegen de live database uitgevoerd:
   `dbo.btw_tarieven` (4 rijen), `dbo.artikelen_algemeen` (3 rijen) en de `btw_code`-kolom op
   `dbo.artikelen_klanten` staan er allemaal op (gecontroleerd via COUNT-query: 4 / 3 / 1).
   Let op: de Azure Portal Query-editor (preview) compileert een meerdere-statements-batch in
   zijn geheel — een los `ALTER TABLE ... ADD CONSTRAINT CHECK` op een kolom die eerder in
   dezelfde batch is toegevoegd faalt dan met "Invalid column name" vóórdat er iets uitvoert.
   Het migratiebestand is aangepast zodat kolom + CHECK-constraint in één statement staan
   (voorkomt dit bij een volgende run tegen een nieuwe/andere database).
   Nog open: prijzen van de drie standaardartikelen staan nog op €0,00 — invullen via
   **Beheer → Facturatie → Standaardartikelen**. En controleren dat `npm install` in `api/`
   de `mssql`-dependency heeft opgepikt (gebeurt automatisch via de GitHub Actions-build).
2. **Dynamics-koppeling voor facturen** — bewust uitgesteld (zie hierboven). Als dit alsnog
   gebouwd wordt: een custom tabel in Dataverse aanmaken (bijv. `cr283_factuur`) via de maker-
   portal (niet via SQL — dat kan niet), met een relatie naar Account, schrijfrechten voor
   `DYNAMICS_CLIENT_ID` op die tabel, en dan een sync-stap die na elke aanmaak/statuswijziging
   in `facturen_klanten` de rij wegschrijft/bijwerkt in die tabel (vult dan
   `dynamics_record_id`/`dynamics_sync_status`). De code-kant (een `syncNaarDynamics()`-functie
   aanroepen vanuit `facturenKlanten.js`) is nog niet gebouwd.
3. **Terugkerende facturen** — patroon (frequentie, volgende generatiedatum) + een
   tijdgestuurde Azure Function (timer trigger) die op basis daarvan automatisch nieuwe
   facturen aanmaakt. Nog geen tabel/code voor.
4. **Herinneringen** — de e-mailsjablonen bestaan al (Beheer → Instellingen →
   E-mailsjablonen, zie screenshot "Eerste herinnering"/"Laatste aanmaning"); er is nog geen
   job die verlopen facturen signaleert en op basis daarvan automatisch een herinnering
   verstuurt via die sjablonen.
5. ~~Logo + eigen factuurgegevens~~ — **afgerond (28-07-2026)**. Anders dan het oorspronkelijke
   plan loopt dit niet via het wijzigingsverzoek-mechanisme, maar via een eigen tabel
   (`dbo.bedrijfsgegevens_klanten`) die de klant direct zelf mag bewerken — zie "Bedrijfsgegevens
   & logo + aanvraagflow" hierboven. Inclusief Dynamics-prefill en een "Logo verwijderen"-knop.
6. **Mollie-koppeling** — nog steeds een "nog niet gebouwd"-kaart in de Instellingen-sub-tab
   (BTW-tarieven, standaardartikelen én bedrijfsgegevens/logo zijn inmiddels wél gebouwd — zie
   hierboven).
7. **PDF-generatie** — `pdf-lib` staat al als dependency in `api/package.json` (waarschijnlijk
   vanuit de vroegere offertetool); nog geen factuur-PDF-layout gebouwd op basis van
   `facturen_klanten`.
