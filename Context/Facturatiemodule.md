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

## Bedrijfsgegevens via CRM-prefill + wijzigingsverzoek, prijs instelbaar (28-07-2026, vervolgsessie)

Twee opeenvolgende verzoeken van Wouter, beide over "Bedrijfsgegevens & logo":

- **Voorinvullen vanuit Dynamics, wijzigen via goedkeuring.** Bedrijfsnaam, adres en
  KvK-nummer worden nu voorgevuld vanuit Dynamics zodra het eigen veld nog leeg is (velden die
  nergens bekend zijn — BTW-nummer, IBAN, tenaamstelling — blijven gewoon leeg). Een wijziging
  door de klant gaat niet meer direct in de database, maar via een wijzigingsverzoek dat een
  beheerder moet goedkeuren, net als bij de NAW-gegevens:
  - Wijzigingsverzoeken (`api/_gedeeld/wijzigingen.js`) hebben nu een `type`-veld
    (`"naw"` vs `"bedrijfsgegevens_facturatie"`, oude records vallen terug op `"naw"`) zodat
    opslag/indienen/goedkeuren generiek werken voor beide soorten aanvragen.
  - `/api/bedrijfsgegevens-klanten` staat geen directe PUT meer toe (405, alleen nog GET) —
    wijzigen kan alleen via `POST /api/wijzigingsverzoek`. De goedkeuring
    (`api/beheer-wijzigingen`) roept bij dit type `zetGegevens()` rechtstreeks aan i.p.v.
    `verwerkInDynamics()`.
  - `/api/bedrijfsgegevens-logo` uitgebreid met een `actie: "verwijderen"`-body, zodat logo
    verwijderen zelf-service blijft (geen goedkeuring nodig) ondanks de geblokkeerde PUT
    hierboven — dit was het enige stuk dat anders stilzwijgend zou breken.
  - Medewerkersportaal (`WIJZIG_VELD_LABELS`, `WijzigingsverzoekBeheer`): veldlabels
    uitgebreid met de nieuwe bedrijfsgegevens-velden, en de teksten die specifiek "Dynamics"
    noemden zijn gegeneraliseerd (dit aanvraagtype schrijft naar de eigen SQL-tabel, niet naar
    Dynamics).
  - Klantportaal: de "openstaand verzoek"-check in "Mijn gegevens" is nu per `type`
    gefilterd — anders zou een lopende facturatie-bedrijfsgegevens-aanvraag de losstaande
    NAW-sectie onterecht blokkeren.
- **Prijs van de facturatiemodule instelbaar.** Was hardcoded "€ 5,- per maand" in de
  aanvraagkaart; staat nu in de algemene instellingen (`facturatiemodulePrijs`, blob
  `instellingen.json`, default 5) en is aanpasbaar in Beheer → Facturatie (bovenaan de
  rubriek "Facturatiemodule — per klant aan/uit"). Het klantportaal haalt de waarde op via
  het publieke `/api/instellingen`-endpoint en toont hem met `Intl.NumberFormat` (bijv.
  "€ 5,00").
- **Facturatiemodule-tab in het klantportaal: Actief/Niet actief-secties.** Bij meerdere
  gekoppelde klantaccounts (bijv. Alings-groep) toont de tab "Facturen" nu twee secties i.p.v.
  één platte lijst — net als eerder al bij Klanten/Producten. De uitleg + prijs van de module
  staat nu één keer bovenaan de sectie "Niet actief" (`FacturatiemoduleUitlegBanner`) i.p.v.
  herhaald per account; het per-account aanvraagformulier (`FacturatieNietActief`) toont bij
  meerdere accounts alleen nog de aanvraagknop/status (`toonUitleg={false}`), bij een enkel
  account nog steeds de volledige uitleg zoals voorheen.
- Alles geverifieerd met `npx vite build` en `npx oxlint` (geen nieuwe waarschuwingen).
  Gecommit op de machine (bedrijfsgegevens-wijziging als `7fb23d3`); Wouter moet `git push`
  zelf uitvoeren (netwerktoegang tot GitHub is vanuit deze sessie niet beschikbaar).

  **Let op — deze BTW-nummer-conclusie is inmiddels achterhaald.** Wouter gaf later aan dat het
  BTW-nummer wél in Dataverse staat; zie de sectie "BTW-nummer-prefill, logo als apart blok, één
  factuurscherm" verderop in dit document voor de daadwerkelijke BTW-nummer-prefill.

## Leveringsperiode, terugkerende facturen (abonnementen), echte PDF + e-mail (28-07-2026, vervolgsessie)

Verzoek van Wouter (met 3 screenshots als voorbeeld): *"Tevens wil ik bij een factuur opnemen
van en tot en met datum zoals plaatje en ik zou een abonnement willen instellen op de factuur,
frequentie opties: Wekelijks, Maandelijks, Per kwartaal, Jaarlijks. En ik wil factuur zo zien
als voorbeeld."* Dit is de grootste uitbreiding van de facturatiemodule tot nu toe en raakt
vrijwel elke laag (database, backend-modules, twee nieuwe endpoints, groot deel van
`FacturatieModule.jsx`). Architectuurkeuzes zijn expliciet met Wouter afgestemd (zie hieronder)
in plaats van zelf ingevuld.

- **Leveringsperiode i.p.v. één leverdatum** — `dbo.facturen_klanten.leverdatum` (migratie 004)
  is vervangen door een echte periode: `leveringsperiode_start`/`leveringsperiode_eind`
  (migratie `005_leveringsperiode_en_terugkerend.sql`). De oude `leverdatum`-kolom blijft
  ongebruikt in de database staan (bewust geen destructieve wijziging) — API en UI lezen/
  schrijven 'm gewoon niet meer. Ook per factuurregel is een optionele afwijkende
  leveringsperiode mogelijk (bijv. één maandtermijn binnen een jaarfactuur met meerdere
  regels) — dit zit gewoon in het bestaande vrije `regels_json`-veld, dus geen aparte kolom
  nodig.
- **Terugkerende facturen (abonnementen)** — nieuwe tabel `dbo.facturen_terugkerend` (zelfde
  migratie 005): een "sjabloon" per klant met frequentie (`wekelijks`/`maandelijks`/`kwartaal`/
  `jaarlijks`), start-/einddatum, `volgende_factuurdatum`, een eigen leveringsperiode die elke
  cyclus meeschuift, `automatisch_verzenden`, en de factuurregels. CRUD + datumlogica in
  `api/_gedeeld/facturenTerugkerend.js` (`voegFrequentieToe()` rekent UTC-veilig, om
  tijdzone-drift op DATE-only-kolommen te voorkomen).
  - **Aanmaken gaat via het factuurformulier**: bij een nieuwe factuur is er een "Dit is een
    terugkerende factuur (abonnement)"-schakelaar met Frequentie/Startdatum/Einddatum/
    Automatisch verzenden — aanzetten maakt in plaats van een eenmalige conceptfactuur een
    sjabloon aan.
  - **Beheren gaat via de nieuwe sub-tab "Abonnementen"** in het klantportaal: overzicht met
    klant, frequentie, volgende factuurdatum, aantal al gegenereerd, en pauzeren/hervatten/
    verwijderen.
  - **Genereren gebeurt door een nieuw, extern getriggerd endpoint**: `POST
    /api/verwerk-terugkerende-facturen`. **Azure Static Web Apps' managed functions ondersteunen
    geen tijdklok-/timer-trigger** — dit is expliciet met Wouter besproken (vraag: "Hoe werkt een
    Extern schema? Of moeten we dat met power automate triggeren?", antwoord/akkoord: "laten we
    dat zo bouwen dan"). Het endpoint moet dus periodiek (bijv. dagelijks) aangeroepen worden
    door een **externe scheduler — een Power Automate "geplande cloudflow"** (Recurrence-trigger
    → HTTP-actie, POST, geen body nodig). Beveiliging: het endpoint staat in
    `staticwebapp.config.json` op `allowedRoles: ["anonymous"]` (Power Automate logt niet in bij
    deze tenant), en controleert zelf een geheime sleutel — header `x-verwerk-sleutel` of
    querystring `?sleutel=` — tegen de **nieuwe Application Setting `TERUGKEREND_TRIGGER_SECRET`**
    (nog in te stellen op de Static Web App in Azure; zonder deze setting weigert het endpoint
    altijd met 501, geen "open" fallback).
- **Echte factuur-PDF** — `api/_gedeeld/facturenPdf.js` (`genereerFactuurPdf()`), gebouwd met
  **pdf-lib** (was al dependency, bewezen patroon via `api/taken-ondertekenen/index.js` en de
  offertetool) — dus geen headless-browser nodig, prima geschikt voor het huidige
  Consumption-hostingplan. Layout volgt het aangeleverde voorbeeld: afzender linksboven,
  documenttitel + metagegevens rechtsboven, "[Type] AAN"-blok, betaalbanner, regeltabel (met
  per-regel leveringsperiode-vermelding), subtotaal/btw-per-tarief/totaal, en onderaan
  betaalinstructies + een echte scanbare **SEPA-betaal-QR-code** (EPC069-12-standaard, zie
  `api/_gedeeld/qrBetaling.js`, nieuwe dependency `qrcode`). Downloaden kan via **"Download PDF"**
  op elk document (`GET /api/facturen-klanten?...&formaat=pdf`, binaire PDF-response). Het
  scherm-voorbeeld (`DocumentVoorbeeld`) is bewust een *benadering* (geen echte QR-afbeelding
  client-side) — de PDF is het canonieke, exacte eindresultaat.
- **Echte e-mailverzending met PDF-bijlage** — nieuwe `verstuurMailMetBijlage()` in
  `api/_gedeeld/mail.js` (losse functie náást de bestaande `verstuurMail`, om niets te breken
  voor de huidige aanroepers zoals reviews/wijzigingsverzoeken), zelfde Graph-`sendMail`-met-
  HTML-en-bijlage-patroon als de offertetool. Bij **"Versturen"** van een factuur/offerte/
  creditnota wordt nu, best-effort, ook echt een e-mail met de PDF als bijlage verstuurd naar
  het e-mailadres van de `klant_klant` — mislukt dat (geen e-mailadres bekend, Graph-fout), dan
  blijft het document gewoon 'verzonden' (het nummer is al toegekend); de klant-facing
  detailweergave toont expliciet of de e-mail gelukt is.
- **Herontworpen factuurweergave** (`DocumentVoorbeeld`) — dynamisch "AAN"-label per
  documenttype, betaalbanner ("€ X te betalen op datum", alleen bij factuur/creditnota, niet bij
  offerte), leveringsperiode zowel op documentniveau als (indien afwijkend) per regel, en een
  duidelijkere betaalinstructie-sectie onderaan.
- **Nieuwe/gewijzigde bestanden**: migratie `005_leveringsperiode_en_terugkerend.sql`;
  `api/_gedeeld/facturenTerugkerend.js`, `qrBetaling.js`, `facturenPdf.js` (nieuw);
  `api/_gedeeld/facturenKlanten.js`, `mail.js` (uitgebreid); `api/facturen-klanten/index.js`
  (uitgebreid: `?formaat=pdf`, echte e-mail bij versturen); `api/facturen-terugkerend/index.js`,
  `api/verwerk-terugkerende-facturen/index.js` (nieuw); `api/package.json` (`qrcode`-dependency
  toegevoegd); `staticwebapp.config.json` (route voor het nieuwe trigger-endpoint);
  `src/portaal/FacturatieModule.jsx` (grootste wijziging: `DocumentVoorbeeld` herontworpen,
  `DocumentFormulier` uitgebreid met leveringsperiode + terugkerend-sectie, nieuwe
  `AbonnementenTab`/`useTerugkerend`, `DocumentDetail` met "Download PDF" + e-mailstatus).
- Alles geverifieerd: `node --check` op alle nieuwe/gewijzigde backend-bestanden, de PDF-
  generator is ook echt uitgevoerd (met test-data) en visueel gecontroleerd (inclusief een
  laag-in-de-code gevonden en gefixte opmaakbug: de documenttitel overlapte de metaregels), en
  `npx vite build` + `npx oxlint` op de volledige frontend (geen nieuwe waarschuwingen).

### Nog te doen vóór dit werkend is op klantportaalactivaa zelf

1. ~~Migratie 005 tegen de live database draaien~~ — **afgerond**: door Wouter uitgevoerd
   (bevestigd: "005 met succes doorgevoerd"). `leveringsperiode_start`/`_eind` staan op
   `dbo.facturen_klanten`, en `dbo.facturen_terugkerend` bestaat.
2. **`TERUGKEREND_TRIGGER_SECRET` instellen** als Application Setting op de Static Web App —
   verzin een lange willekeurige waarde, zonder deze setting blijft het trigger-endpoint uit.
3. **De Power Automate "geplande cloudflow" inrichten**: Recurrence-trigger (bijv. dagelijks
   's nachts) → HTTP-actie, POST naar `https://<domein>/api/verwerk-terugkerende-facturen`, met
   header `x-verwerk-sleutel: <dezelfde waarde als TERUGKEREND_TRIGGER_SECRET>`.
4. **`npm install` in `api/`** — nieuwe `qrcode`-dependency moet meegenomen worden (gebeurt
   automatisch via de GitHub Actions-build, maar check dat 'm ook echt meekomt).
5. `git add`/`git commit`/`git push` — zie onderaan dit document voor de status van eerdere,
   nog niet gepushte commits.

## BTW-nummer-prefill, logo als apart blok, één factuurscherm (28-07-2026, vervolgsessie)

Feedback van Wouter op de nieuwe factuurschermen, in twee berichten: *"BTW-nummer staat in
Datavers en ingevuld. Deze kunnen dus meegenomen worden. Kan je logo lostrekken in apart blok
zodat duidelijk is wat je wijzigd. Ik mis knop opslaan en versturen factuur."* — gevolgd door
*"Ik mis de volgende zaken: terugkerende factuur (abonnement) automatisch versturen optie.
Leveringsperiode staat bovenin dubbel Betalingstermijn mag (Dagen) (dagen) weg."* Voor het
"knop opslaan en versturen"-punt is expliciet doorgevraagd (AskUserQuestion) — Wouter koos
**"Eén scherm met alle knoppen samen"**: Opslaan, Download PDF en Versturen altijd samen
zichtbaar, zonder eerst te hoeven navigeren.

- **BTW-nummer nu ook vanuit Dynamics voor-ingevuld.** Zelfde patroon als bedrijfsnaam/adres/
  KvK-nummer. Nieuw veld `BTW_VELD` in `api/_gedeeld/identiteit.js`
  (`process.env.DYNAMICS_BTW_VELD || "sk_btwnummer"` — een **inschatting** o.b.v. de
  naamgevingsconventie die elders in de code al voorkwam als voorbeeld, dus niet 100% zeker of
  dit exact zo heet in Datavers). Om te voorkomen dat een verkeerde veldnaam de hele
  Dynamics-koppeling (voor alle klanten!) zou breken, doet `herleidAccounts()` eerst een poging
  mét dit veld in de `$select`; faalt die specifiek op dit veld (400 met de veldnaam in de
  foutmelding), dan valt hij automatisch terug op dezelfde query zónder dat veld — de rest
  blijft dan gewoon werken, alleen het BTW-nummer blijft leeg totdat de juiste schemanaam is
  ingesteld via de Application Setting `DYNAMICS_BTW_VELD`. `api/mijn-gegevens/index.js` geeft
  het nu door als `btwNummer`; `BedrijfsgegevensKaart` in `FacturatieModule.jsx` vult het aan
  zodra het eigen veld nog leeg is (nooit een al opgeslagen waarde overschrijven, zelfde regel
  als bij KvK). **Check aanbevolen**: als het BTW-nummer na deze wijziging niet verschijnt,
  klopt `sk_btwnummer` niet als schemanaam — dan de echte naam opzoeken in Dataverse en instellen
  via `DYNAMICS_BTW_VELD`.
- **Logo losgetrokken in een apart blok.** `BedrijfsgegevensKaart` was één kaart met zowel de
  (via wijzigingsverzoek goedgekeurde) bedrijfsgegevens als het (direct, zonder goedkeuring)
  logo. Nu twee losse kaarten — "Bedrijfsgegevens" en "Logo" — elk met een eigen, kortere
  uitleg die het verschil in goedkeuringsstatus benoemt. Achterliggende state/logica ongewijzigd,
  puur een visuele/structurele knip.
- **Eén scherm: Opslaan, Download PDF en Versturen samen.** Vóór deze wijziging kon een
  *concept*-factuur alleen bereikt worden via "bewerken" (potlood-icoon in de lijst) — en dat
  scherm (`DocumentFormulier`) had geen Download PDF/Versturen. Die knoppen zaten alleen in
  `DocumentDetail`, dat voor concepten via de lijst nooit bereikbaar was (alleen "Bekijken" voor
  niet-conceptstatussen). Concepten hadden dus feitelijk geen route naar downloaden/versturen —
  dat was de daadwerkelijke oorzaak achter "ik mis de knop". Opgelost door `DocumentFormulier`
  zelf Download PDF/Versturen te laten tonen zodra er een opgeslagen document is:
  - Nieuw: `opgeslagenDocument`-state (start op `bestaand`, of leeg bij een nieuw document).
    Na de eerste "Opslaan als concept" blijft het scherm nu gewoon staan (i.p.v. terug naar het
    overzicht) en verschijnen Download PDF en (bij status concept) Versturen ernaast. De
    Opslaan-knop wisselt dan naar "Wijzigingen opslaan"; Annuleren wisselt naar "Terug naar
    overzicht".
  - De create/update-keuze (POST vs. PUT) is verplaatst van de oorspronkelijke `bestaand`-prop
    naar deze `opgeslagenDocument`-state — anders zou een tweede keer opslaan van een net
    aangemaakt (voorheen "nieuw") document per ongeluk weer een POST doen en een dubbel document
    aanmaken.
  - Na "Versturen" (vanuit dit ene scherm) schakelt `DocumentenTab` door naar de bestaande
    detailweergave (`onVerstuurd`-prop) — die blijft verantwoordelijk voor de acties ná
    versturen (betaald/annuleren, accepteren/afwijzen bij een offerte), dat viel buiten de scope
    van dit verzoek.
  - "Terugkerende factuur (abonnement)"/"automatisch verzenden" (uit het tweede bericht) stond
    al langer in `DocumentFormulier` bij een nieuwe factuur — met dit scherm nu ineens
    zichtbaar naast Opslaan/Download PDF/Versturen was het waarschijnlijk vooral de eerdere
    onbereikbaarheid van dat hele scherm die de indruk van "ontbreekt" gaf. Om te voorkomen dat
    iemand een al opgeslagen eenmalige factuur alsnog per ongeluk als abonnement probeert op te
    slaan (zou een verweesd concept + los abonnement opleveren), verdwijnt de
    terugkerend-optie zodra het document al (eenmalig) is opgeslagen.
- **"Leveringsperiode staat bovenin dubbel"** — geen dubbele render-bug: het formulier heeft één
  invoerveld "Leveringsperiode (optioneel)", en het live voorbeeld ernaast toont diezelfde waarde
  nogmaals als onderdeel van de factuur-preview (bewust — dat ís het doel van een live
  voorbeeld). Bij smallere schermen staan formulier en voorbeeld onder elkaar, wat het beeld
  van een letterlijke dubbeling kan geven. Als concrete verbetering: de voorbeeld-kop
  ("Voorbeeld") is vervangen door een duidelijker, blauw gekleurde kop met oog-icoon: "Zo ziet
  je factuur eruit (voorbeeld, wordt live bijgewerkt)" — zodat in één oogopslag duidelijk is dat
  het een weergave is, geen tweede invoerveld.
- **"Betalingstermijn (dagen)" → "Betalingstermijn"** — het label toonde de eenheid twee keer
  (het label zelf "(DAGEN)" én elke keuze-optie als "30 dagen"). Alleen het label ingekort;
  de opties zelf ("7 dagen", "14 dagen", ...) zijn al duidelijk genoeg.
- Alles geverifieerd met `npx vite build` (1913 modules, geen nieuwe fouten) en `npx oxlint`
  (geen nieuwe waarschuwingen t.o.v. de bestaande) en `node --check` op de gewijzigde
  backend-bestanden (`identiteit.js`, `mijn-gegevens/index.js`). Nog niet gecommit/gepusht.

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
3. ~~Terugkerende facturen~~ — **afgerond (28-07-2026)**. Zie "Leveringsperiode, terugkerende
   facturen (abonnementen), echte PDF + e-mail" hierboven. Anders dan hier oorspronkelijk
   geschetst geen Azure Function timer-trigger (bestaat niet voor managed functions op Static
   Web Apps), maar een extern getriggerd, sleutel-beveiligd endpoint.
4. **Herinneringen** — de e-mailsjablonen bestaan al (Beheer → Instellingen →
   E-mailsjablonen, zie screenshot "Eerste herinnering"/"Laatste aanmaning"); er is nog geen
   job die verlopen facturen signaleert en op basis daarvan automatisch een herinnering
   verstuurt via die sjablonen.
5. ~~Logo + eigen factuurgegevens~~ — **afgerond (28-07-2026)**. Via een eigen tabel
   (`dbo.bedrijfsgegevens_klanten`), zie "Bedrijfsgegevens & logo + aanvraagflow" hierboven.
   Inclusief Dynamics-prefill en een "Logo verwijderen"-knop. **Let op, deze regel was hier
   verouderd**: het logo blijft direct te wijzigen zonder goedkeuring, maar de tekstvelden
   (bedrijfsnaam/adres/KvK/BTW/IBAN) lopen sinds de sectie "Bedrijfsgegevens via CRM-prefill +
   wijzigingsverzoek" hieronder wél via een wijzigingsverzoek dat Activaa moet goedkeuren — zie
   ook de sectie "Melding bij ontbrekende/in-behandeling eigen bedrijfsgegevens" verderop.
6. **Mollie-koppeling** — nog steeds een "nog niet gebouwd"-kaart in de Instellingen-sub-tab
   (BTW-tarieven, standaardartikelen én bedrijfsgegevens/logo zijn inmiddels wél gebouwd — zie
   hierboven).
7. ~~PDF-generatie~~ — **afgerond (28-07-2026)**. Zie "Leveringsperiode, terugkerende facturen
   (abonnementen), echte PDF + e-mail" hierboven — `api/_gedeeld/facturenPdf.js`, downloadbaar
   via "Download PDF" en meegestuurd als bijlage bij het versturen van een factuur/offerte/
   creditnota.

## Melding bij ontbrekende/in-behandeling eigen bedrijfsgegevens, bedragnotatie, terugkerend bij bewerken (29-07-2026, vervolgsessie)

Feedback van Wouter, met screenshots van een "Concept-factuur bewerken"-scherm (klant Activaa
Group B.V.) en het Bedrijfsgegevens-scherm (account JOWO Holding B.V., volledig ingevuld):
*"Ik mis de volgende zaken nog in facturatie: Ik mis eigen gevens op de factuur als: Naam,
adres postcode plaats, BTW nummer, kvk nummer — bedrijfsgevens staan onder instellingen.
Bedrag prijs mist een punt. ik mis verder nog dat ik hem terugkerend kan maken. Graag met een
vink optie. Daarnaast ook een optie voor automatisch verzenden ja nee. en dan datum."*

- **Eigen bedrijfsgegevens ontbraken zonder uitleg op de factuur.** Geen databug: de
  Instellingen-schermwaarden die Wouter zag waren (deels) de Dynamics-prefill in het formulier
  zelf, niet per se al goedgekeurde waarden in `dbo.bedrijfsgegevens_klanten` — sinds de
  wijzigingsverzoek-gate (zie hierboven) staat een ingediende wijziging pas ná goedkeuring door
  Activaa (via `PATCH /api/beheer-wijzigingen`) echt in die tabel, en dus pas dán op de factuur/
  PDF. Vóór die goedkeuring bleef `DocumentVoorbeeld` dus terecht leeg — alleen zonder enige
  aanwijzing waarom. Fix: `DocumentFormulier` toont nu een melding zodra de eigen gegevens niet
  compleet zijn (naam/straat/huisnr/postcode/plaats + KvK- of BTW-nummer), met een directe link
  naar de tab Instellingen; staat er een open wijzigingsverzoek voor dit account, dan toont hij
  in plaats daarvan dat de wijziging nog op goedkeuring wacht. Hiervoor is
  `useEigenWijzigingsverzoeken()` (voorheen alleen lokaal in `BedrijfsgegevensKaart` aangeroepen)
  opgetild naar `FacturatieAccountInhoud`, zodat zowel de facturen-/offertetab als de
  Instellingen-tab dezelfde data gebruiken.
- **"Bedrag prijs mist een punt."** De Aantal-/Prijs-invoervelden in de regeltabel waren kale
  `<input type="number">`s zonder opmaak (bijv. "10250"), terwijl de berekende kolommen
  (Bedrag/Subtotaal/Totaal) wel al Nederlandse notatie gebruikten. Nieuw: `BedragInput` — toont
  tijdens het bewerken de ruwe waarde (typen blijft prettig), en zodra je het veld verlaat de
  nl-NL-opmaak (bijv. "10.250,00"). De onderliggende waarde/opslag/berekening is ongewijzigd,
  alleen de weergave is nieuw.
- **Terugkerend maken van een al opgeslagen concept.** De hele UI (vinkje, frequentie,
  automatisch verzenden, datum) bestond al, maar was bewust verborgen zodra een document al
  (eenmalig) was opgeslagen — zie de vorige sessie's toelichting hierboven. Wouter gaf aan dit
  ook te willen bij het bewerken van een bestaand concept; op de vraag wat er dan bij opslaan
  moet gebeuren koos hij voor: **wijzigingen aan het concept blijven bewaard, én er wordt
  daarnaast een nieuw abonnement aangemaakt** (met de huidige regels als sjabloon) — het concept
  blijft verder gewoon een losse eenmalige factuur. Zo geïmplementeerd: `kanTerugkerend` is niet
  langer beperkt tot nieuwe documenten; `opslaan()` maakt bij een aangevinkt abonnement eerst het
  abonnement aan (`POST /api/facturen-terugkerend`), en valt dan — alleen als het document al
  bestond — door naar de normale concept-opslag i.p.v. daar te stoppen. Het vinkje wordt na
  succes weer uitgezet (voorkomt een dubbel abonnement bij een volgende "Wijzigingen opslaan"),
  met een groene bevestiging ("Abonnement aangemaakt — te beheren via de tab 'Abonnementen'.").
- Alles geverifieerd met `npx vite build` (1913 modules, geen nieuwe fouten) en `npx oxlint`
  (enige waarschuwing is een pre-existing, ongerelateerde `no-unused-vars` in `BedrijfsgegevensKaart`).
  Gecommit als `631503b`. Nog niet gepusht (moet handmatig door Wouter, `git push` heeft vanuit
  de sandbox geen netwerktoegang).
- Apart, niet-code-gerelateerd probleem dat Wouter tegenkwam tijdens het testen van het
  opslaan van een abonnement: een CORS-foutmelding in de console
  (`identity.7.azurestaticapps.net/.redirect/aad?...` geblokkeerd) — dit is een verlopen
  inlogsessie: Azure Static Web Apps zet een 401 (via `responseOverrides` in
  `staticwebapp.config.json`) om in een redirect naar de Microsoft-inlogpagina, en een
  `fetch()`-aanroep (i.p.v. een paginanavigatie) mag zo'n cross-origin redirect niet volgen
  (CORS) — dus faalt het opslaan stil. Oplossing: pagina verversen (logt opnieuw in) en opnieuw
  proberen. Geen codewijziging voor gedaan; eventueel later een dupliceerbare, duidelijkere
  in-app melding voor verlopen sessies overwegen (raakt alle `fetch()`-aanroepen in de app, dus
  een bredere wijziging dan dit moment aankon).

### Vervolg dezelfde dag: "Dat is gek, want deze gegevens heb ik niet gewijzigd"

Wouter's reactie op de "wacht op goedkeuring"-melding hierboven: hij had de BTW-/KvK-gegevens
van JOWO Holding B.V. niet zelf aangepast (die kwamen gewoon uit Dynamics-prefill), en wilde
dat goedkeuring **alleen nog nodig is bij een echte (handmatige) wijziging**.

Onderzoek wees een echte bug uit in `api/wijzigingsverzoek/index.js`: het "huidig"-object
(waartegen een ingediend voorstel vergeleken wordt om te bepalen of er iets gewijzigd is)
gebruikte `account.klantadres`, `account.kvkNummer` en `account.btwNummer` — maar
`herleidAccounts()` (in `identiteit.js`) geeft die velden helemaal niet terug; die verrijkte
vorm bestaat alléén in de aparte mapping van `/api/mijn-gegevens` (en wordt daarvandaan ook
gebruikt om het front-end formulier voor te vullen). Op de server waren die velden dus altijd
`undefined` → "huidig" was voor bedrijfsadres/KvK/BTW feitelijk altijd leeg, ongeacht wat er al
via Dynamics bekend was. Elke keer dat een klant "Wijziging indienen" klikte — zelfs zonder ook
maar één letter aan te passen — week het (Dynamics-voorgevulde) formulier dus af van dat lege
"huidig", en ontstond er een overbodig wijzigingsverzoek dat op goedkeuring bleef wachten.

Fix (`api/wijzigingsverzoek/index.js`): "huidig" wordt nu op dezelfde manier opgebouwd als
`/api/mijn-gegevens` en de front-end — rechtstreeks vanaf `account.account` (het ruwe
Dynamics-account), met `DYNAMICS_KVK_VELD`/`DYNAMICS_BTW_VELD` voor KvK/BTW. Blijkt er ná deze
correctie nog steeds geen echt verschil te zijn tussen het voorstel en "huidig" (dus de klant
heeft feitelijk niets zelf gewijzigd), dan wordt er geen wijzigingsverzoek meer aangemaakt —
in plaats daarvan wordt "huidig" direct weggeschreven naar `dbo.bedrijfsgegevens_klanten` (via
`zetGegevens`), zonder goedkeuring, mits dat nog niet zo was opgeslagen. Zo verschijnt een
BTW-/KvK-nummer dat alleen uit Dynamics kwam gewoon op de factuur, zonder tussenkomst van
Activaa. Wijkt het voorstel wél af van wat al bekend is (bijv. een zelf ingevuld IBAN, of een
bewuste correctie van adres/naam), dan loopt dat gewoon via een wijzigingsverzoek zoals bedoeld
— geverifieerd met een korte Node-simulatie van alle drie de scenario's (ongewijzigd/IBAN
toegevoegd/postcode gecorrigeerd).

`BedrijfsgegevensKaart` (front-end) verwerkt de nieuwe `{ geenWijziging: true }`-respons met
een groene bevestiging ("Opgeslagen — geen goedkeuring nodig...") in plaats van de "wacht op
goedkeuring"-melding, en ververst meteen de bedrijfsgegevens zodat het scherm de nu echt
opgeslagen waarden weerspiegelt.

Geverifieerd met `npx vite build`, `npx oxlint` (geen nieuwe waarschuwingen) en `node --check`
op het gewijzigde backend-bestand. Gecommit als `e2fc3df`. Nog niet gepusht.

**Waar keur je een wijzigingsverzoek goed/af?** Beheer → Wijzigingsverzoeken (voor zowel de
gewone NAW-verzoeken als de facturatiemodule-bedrijfsgegevens — beide staan in dezelfde lijst,
te herkennen aan het type).

## IBAN/tenaamstelling via Dynamics (sk_iban / cr283_ibannaamstelling), 29-07-2026, vervolgsessie

Na het goedkeuren van een echt gewijzigd IBAN-wijzigingsverzoek (JOWO Holding B.V., nr 1023)
gaf het scherm: *"Goedgekeurd, maar automatisch verwerken in de database lukte niet
(waarschijnlijk onvoldoende schrijfrechten/verbinding)."* — het IBAN kwam dus niet bij de klant
terecht. Onderzoek van de Azure-infrastructuur (firewall, App Insights, app settings) leverde
geen concrete oorzaak op voor de onderliggende SQL-schrijffout naar `dbo.bedrijfsgegevens_klanten`
(nog steeds niet opgelost — zie "Nog open" hieronder). Wouter gaf vervolgens aan dat Dataverse
hier al langer eigen velden voor heeft: **`sk_iban`** en **`cr283_ibannaamstelling`** op Account
— dus is de voorvul- én wegschrijf-koppeling die al voor KvK/BTW bestond, nu ook naar deze twee
velden uitgebreid, met als concreet doel: *"dus wegschrijven en ophalen zou moeten lukken"*.

- **Lezen/voorvullen** — zelfde patroon als KvK/BTW:
  - `api/_gedeeld/identiteit.js`: nieuwe constanten `IBAN_VELD`
    (`DYNAMICS_IBAN_VELD || "sk_iban"`) en `IBAN_TENAAMSTELLING_VELD`
    (`DYNAMICS_IBAN_TENAAMSTELLING_VELD || "cr283_ibannaamstelling"`), geëxporteerd voor
    hergebruik elders. De defensieve val-terug-logica (was: één `metBtw`-boolean) is
    gegeneraliseerd naar een lijst `OPTIONELE_VELDEN` (nu BTW + IBAN + tenaamstelling) met een
    retry-lus: gaat de Dynamics-query mis op een veldnaam die niet blijkt te bestaan, dan wordt
    precies dát veld verwijderd en de query opnieuw geprobeerd — tot alle optionele velden zijn
    uitgeput. Zo breekt een verkeerde/ontbrekende schemanaam nooit de hele koppeling.
  - `api/mijn-gegevens/index.js`: response per account heeft nu ook `iban`/`ibanTenaamstelling`
    (uit `account[IBAN_VELD]`/`account[IBAN_TENAAMSTELLING_VELD]`).
  - `FacturatieModule.jsx` (`BedrijfsgegevensKaart`): de voorvul-`useEffect` vult nu ook
    `iban`/`ibanTenaamstelling` aan vanuit `account?.iban`/`account?.ibanTenaamstelling` zodra
    het eigen veld nog leeg is (nooit een al opgeslagen waarde overschrijven — zelfde regel als
    KvK/BTW). Uitlegtekst bijgewerkt ("... KvK-nummer, BTW-nummer en IBAN zijn al ingevuld...").
  - `api/wijzigingsverzoek/index.js`: de `huidig`-berekening (zie de bugfix hierboven) heeft nu
    ook een Dynamics-terugval voor `iban`/`ibanTenaamstelling`, zodat een IBAN dat alleen uit
    Dataverse komt niet langer als "gewijzigd" wordt gezien als de klant niets zelf aanpast.
- **Wegschrijven na goedkeuring** — `api/beheer-wijzigingen/index.js`: nieuwe functie
  `verwerkIbanInDynamics()` schrijft bij een goedgekeurd `bedrijfsgegevens_facturatie`-verzoek
  de gewijzigde IBAN/tenaamstelling ook naar het Account in Dynamics (PATCH, zelfde
  `DYN_HEADERS`/patroon als de bestaande NAW-verwerking). Dit gebeurt **naast** (niet in plaats
  van) de bestaande `zetGegevens()`-SQL-schrijfactie:
  - Beide lukken → niets aan de hand, verzoek is verwerkt.
  - SQL mislukt, maar IBAN is gewijzigd én de Dynamics-schrijfactie lukt → verzoek wordt tóch als
    "verwerkt" beschouwd (geen `verwerkingsfout`): de koppeling haalt het IBAN er via
    `mijn-gegevens`/het formulier vanzelf weer bij, net als bij KvK/BTW. De SQL-fout wordt wel
    gelogd, voor als het onderliggende databaseprobleem ooit opgelost wordt.
  - SQL mislukt én de Dynamics-schrijfactie mislukt ook (of er was geen IBAN-wijziging in dit
    verzoek, dus geen Dynamics-vangnet) → verzoek blijft op `verwerkingsfout` staan zoals
    voorheen, met een gecombineerde foutmelding (database + Dynamics) als beide faalden.
  - SQL lukt, maar de (best-effort) Dynamics-schrijfactie mislukt → geen harde fout: de klant
    ziet de waarde toch al via de succesvolle SQL-opslag, dus dit wordt alleen gelogd.
  - Praktisch gevolg: het openstaande JOWO Holding-verzoek (nr 1023) kan na deze deploy gewoon
    via de bestaande "Opnieuw verwerken"-knop (Beheer → Wijzigingsverzoeken) opnieuw goedgekeurd
    worden — dat roept dezelfde `PATCH /api/beheer-wijzigingen`-code aan, dus zou dit keer via
    het Dynamics-pad moeten slagen ook al blijft de onderliggende SQL-fout (nog) bestaan.
- **Nog open, mogelijk nog relevant**: de eigenlijke oorzaak van de `zetGegevens()`/
  `dbo.bedrijfsgegevens_klanten`-SQL-schrijffout is niet gevonden (Azure-infrastructuur leek in
  orde: firewall correct, geen Application Insights gevonden in de bereikbare subscription — wat
  Wouter tegensprak, dus mogelijk een andere subscription/tenant). Dit raakt in principe ook
  andere bedrijfsgegevens-velden (bedrijfsnaam/adres/KvK/BTW) die nog wél alleen naar de SQL-tabel
  schrijven — voor die velden bestaat vooralsnog geen Dynamics-vangnet zoals nu voor IBAN. Zodra
  er tijd/aanleiding is: verder uitzoeken waarom de SQL-verbinding vanuit de Function faalt
  (schrijfrechten? connection string? firewall voor een ander IP-bereik?).
- Geverifieerd met `npx vite build` (1913 modules, geen nieuwe fouten) en `node --check` op alle
  vier gewijzigde backend-bestanden.

## CC-mailadres, ontbrekende gegevens op het voorbeeld, valse "niet compleet"-melding, leveringsperiode eraf (29-07-2026, vervolgsessie)

Feedback van Wouter, met twee screenshots (de "niet compleet"-melding, en het document-niveau
"Leveringsperiode"-invoerveld): *"Ik zou nog graag een eigen CC mailadres willen invullen. Dit
zodat men weet of een factuur is aangekomen. Daarnaast mis ik op voorbeeld factuur nog de
volgende gegevens: Bedrijfsnaam Adres Plaats Postcode BTW nummer Kvk-nummer Betaaltermijn. Kan
je dat erop opnemen. ik heb tevens de melding dat gegevens niet compleet zijn, maar dat is wel
zo. deze leveringsperiode mag eraf."*

- **CC-mailadres bij versturen.** Nieuw veld `cc_email` op `dbo.bedrijfsgegevens_klanten`
  (migratie `006_bedrijfsgegevens_cc_email.sql`) — een eigen, optioneel e-mailadres dat als CC
  meegaat bij het versturen van een factuur/offerte/creditnota (`verstuurDocumentPerEmail()` in
  `facturenKlanten.js`, via het al bestaande `cc`-argument van `verstuurMailMetBijlage()`). Net
  als het logo is dit **geen verificatiegegeven** (geen naam/adres/KvK/BTW/IBAN), dus rechtstreeks
  door de klant zelf te wijzigen zonder goedkeuring: `/api/bedrijfsgegevens-klanten` heeft nu een
  smalle `PUT` die uitsluitend `ccEmail` accepteert (met een simpele e-mailformaat-check), naast
  de bestaande GET — de overige tekstvelden blijven wél achter de wijzigingsverzoek-gate. Nieuwe
  kaart "CC bij versturen" in `BedrijfsgegevensKaart` (`FacturatieModule.jsx`), met eigen
  save-knop/status, los van de "Wijziging indienen"-flow.
- **Ontbrekende bedrijfsnaam/adres/KvK/BTW/betaaltermijn op het voorbeeld + valse "niet
  compleet"-melding — zelfde onderliggende oorzaak.** `DocumentenTab`/`DocumentFormulier`/
  `DocumentVoorbeeld` kregen tot nu toe de **rauwe** `dbo.bedrijfsgegevens_klanten`-rij
  (`bedrijfsgegevensData.data`) — dat is NIET hetzelfde als wat de Instellingen-kaart laat zien,
  want die vult zelf al aan met Dynamics-bekende waarden (KvK/BTW/adres/IBAN) zodra het eigen
  veld nog leeg is. Voor een klant die Instellingen nog nooit heeft opgeslagen (het staat er al
  "compleet" uit dankzij die voorvulling, dus er lijkt niets te "wijzigen") bleef de rauwe tabel
  dus leeg, en zag de factuur/melding een andere, incompletere versie dan wat de klant zelf op
  het scherm zag staan. Fix, in `FacturatieModule.jsx`:
  - Nieuwe gedeelde helper `vulBedrijfsgegevensAanMetCrm(data, account)` (bovenaan het bestand) —
    dezelfde aanvul-logica die al in `BedrijfsgegevensKaart` zat, nu ook herbruikt.
  - `FacturatieAccountInhoud` berekent nu `effectieveBedrijfsgegevens` (de aangevulde versie) en
    geeft die door aan `DocumentenTab` voor zowel Facturen als Offertes (i.p.v. de rauwe
    `bedrijfsgegevensData.data`) — dit lost de melding + het voorbeeld direct op, zonder dat er
    ooit een wijzigingsverzoek is ingediend.
  - **Ook echt weggeschreven, niet alleen op het scherm opgelost**: de PDF/e-mail die Activaa
    daadwerkelijk verstuurt (`verstuurDocumentPerEmail()`/`genereerFactuurPdf()`) lezen de
    bedrijfsgegevens rechtstreeks via `haalBedrijfsgegevens()` op de server — dus zonder
    Dynamics-aanvulling. Puur het scherm repareren zou dus een mismatch hebben gelaten
    (voorbeeld ziet er compleet uit, de echte PDF nog niet). Daarom stuurt `FacturatieAccountInhoud`
    nu ook, stil op de achtergrond (best-effort, één keer per keer dat het scherm laadt), dezelfde
    aanvulling als `voorstel` naar `POST /api/wijzigingsverzoek` — dat komt altijd uit op de
    bestaande `geenWijziging`-tak (want het voorstel ís exact wat de server zelf als "huidig"
    berekent), en schrijft dus zonder enige goedkeuring de CRM-waarden ook echt naar de eigen
    tabel weg. Zo hoeft een klant niet meer eerst naar Instellingen te gaan en daar handmatig op
    te slaan voordat KvK/BTW/adres/IBAN/bedrijfsnaam ook echt op de verstuurde factuur/PDF
    verschijnen.
  - **Betaaltermijn op het voorbeeld.** Stond al in het formulier maar werd nooit meegegeven aan
    het live voorbeeld-object (`voorbeeldDocument` in `DocumentFormulier`); nu toegevoegd
    (`betalingstermijnDagen`) en getoond in `DocumentVoorbeeld` als "Betalingstermijn: X dagen",
    naast Nummer/Datum/Vervaldatum (niet bij offertes, net als vervaldatum).
- **Leveringsperiode-invoerveld op documentniveau verwijderd.** Het "Leveringsperiode
  (optioneel)"-invoerveld (twee datumvelden naast Betalingstermijn) is uit `DocumentFormulier`
  gehaald. De onderliggende state/logica is bewust **niet** verwijderd: een al bestaand concept
  met een eerder ingevulde periode behoudt die waarde gewoon bij het opnieuw opslaan (hij wordt
  nergens meer overschreven, want er is geen invoerveld meer dat 'm kan wijzigen); een nieuw
  document krijgt er simpelweg nooit meer een. De optionele leveringsperiode **per factuurregel**
  (verderop in de regeltabel) is ongemoeid gelaten — daar is niet naar gevraagd.
- Alles geverifieerd met `npx vite build` (1913 modules, geen nieuwe fouten) en `npx oxlint`
  (geen nieuwe waarschuwingen t.o.v. de bestaande) en `node --check` op alle gewijzigde
  backend-bestanden.
- **Nog te doen vóór dit werkend is**: migratie `006_bedrijfsgegevens_cc_email.sql` tegen de
  live database draaien (voegt `cc_email` toe aan `dbo.bedrijfsgegevens_klanten`) — zonder deze
  migratie faalt de nieuwe CC-mailadres-functionaliteit met een SQL-fout ("Invalid column
  name 'cc_email'"), al de rest van deze wijziging (voorbeeld/melding/betaaltermijn/
  leveringsperiode) hangt er niet van af en werkt al zonder de migratie.

## Abonnementen nu ook te bewerken (29-07-2026, vervolgsessie)

Feedback van Wouter: *"ik wil abonnementen nog kunnen bewerken. Nu kan ik alleen pauzeren of
verwijderen."* De backend (`PATCH /api/facturen-terugkerend` → `wijzigTerugkerend()` in
`api/_gedeeld/facturenTerugkerend.js`) ondersteunde bewerken van vrijwel elk veld al volledig —
alleen de frontend (`AbonnementenTab` in `FacturatieModule.jsx`) bood tot nu toe enkel pauzeren/
hervatten (`actief`) en verwijderen aan.

- **Nieuw component `AbonnementFormulier`** (`FacturatieModule.jsx`, vlak vóór
  `AbonnementenTab`) — een volwaardig bewerkformulier voor een bestaand abonnement:
  frequentie, betalingstermijn, einddatum (optioneel), automatisch verzenden, leveringsperiode
  (start/eind — deze schuift zelf een frequentie-stap op bij elke nieuw gegenereerde factuur,
  zie `voegFrequentieToe()`/`verwerkGegenereerd()`), de volledige regeltabel (artikel/
  omschrijving/aantal/prijs/btw, met een optionele afwijkende leveringsperiode per regel,
  regels toevoegen/verwijderen) en opmerkingen. Bewust **niet** editable, in lijn met wat
  `wijzigTerugkerend()` server-side toestaat: de klant (`klantKlantId`) en de startdatum — die
  liggen vast zodra het abonnement is aangemaakt; getoond als alleen-lezen info bovenaan het
  formulier.
- De regel-editor (artikel-select, BTW-tarief-select, regels toevoegen/verwijderen,
  per-regel-leveringsperiode) is bewust een eigen kopie van dezelfde JSX/logica die al in
  `DocumentFormulier` zit, in plaats van een gedeeld component — zo hoefde dat grotere, al goed
  geteste onderdeel niet aangeraakt te worden voor deze losstaande toevoeging.
- `AbonnementenTab` kreeg een nieuwe "Bewerken"-knop (potlood-icoon) naast pauzeren/hervatten/
  verwijderen in de actiekolom (die kolom is iets verbreed, 90px → 116px, om drie iconen te
  laten passen) en een `weergave`-state ("lijst" | "bewerken") — zelfde patroon als
  `KlantenTab`/`ProductenTab`. Ontvangt nu ook `artikelen`/`tarieven` als props (nodig voor de
  regel-editor), doorgegeven vanuit `FacturatieAccountInhoud` (`alleArtikelen` resp.
  `btwTarievenData.items`, dezelfde data die de facturen/offertes-tabs al gebruiken).
- Opslaan gaat via de bestaande `PATCH /api/facturen-terugkerend` met `{ accountId, id, ...}` —
  geen backend-wijziging nodig geweest.
- Geverifieerd met `npx vite build` (1913 modules, geen nieuwe fouten) en `npx oxlint` (enige
  waarschuwing is een pre-existing ongebruikte catch-parameter elders in het bestand, niet
  door deze wijziging geïntroduceerd).

## Voorbeeld toonde gegevens die op de echte PDF ontbraken (29-07-2026, vervolgsessie)

Feedback van Wouter: *"Voorbeeld factuur bevat gegevens die niet op de daadwerkelijke factuur
komen. Kan je die er ook op zetten?"* Het scherm-voorbeeld (`DocumentVoorbeeld` in
`FacturatieModule.jsx`) en de echte, gegenereerde/verstuurde PDF (`genereerFactuurPdf` in
`api/_gedeeld/facturenPdf.js`) zijn twee losse implementaties die zoveel mogelijk gelijk
proberen te lopen — maar drie dingen die al wel op het scherm stonden, waren nooit aan de
PDF-generator toegevoegd:

- **Logo.** Stond nergens op de PDF, ook niet als er wel een logo was geüpload. Nu: de PDF laadt
  de blob rechtstreeks via de al bestaande `haalAfbeelding()` (`media.js`, geen extra HTTP-call
  nodig want de Functions-app draait al in hetzelfde proces) en leidt de blobnaam af uit de
  opgeslagen `logoUrl` (`/api/media/klantlogo-<accountId>?v=...`). Best-effort: pdf-lib kan alleen
  PNG/JPEG embedden, terwijl de upload zelf elk `image/*`-type toestaat (`accept="image/*"` in
  `BedrijfsgegevensKaart`) — een niet-ondersteund formaat, of een inmiddels verwijderde blob, laat
  de rest van de PDF gewoon doorgaan (het logo wordt dan simpelweg overgeslagen, geen throw).
  Positionering: boven de bedrijfsnaam in de linkerkolom, net als op het scherm; de rechterkolom
  (documenttitel) blijft bovenaan uitgelijnd, ook als er links een logo bij komt (zelfde
  `alignItems: "flex-start"`-gedrag als de flex-rij in `DocumentVoorbeeld`).
- **Betalingstermijn.** Werd vorige sessie wél aan het scherm-voorbeeld toegevoegd
  (`voorbeeldDocument`/`DocumentVoorbeeld`), maar nooit aan de PDF's metaregels
  (nummer/datum/vervaldatum/leveringsperiode, rechtsboven). Nu ook op de PDF, met dezelfde
  voorwaarde als op het scherm (niet bij een offerte).
- **BTW-/KvK-nummer van de klant zelf.** Het "Factuur/Offerte/Creditnota aan"-blok op de PDF
  toonde alleen naam, adres en e-mailadres van de klant — het scherm toont daar ook diens
  BTW-/KvK-nummer (indien bekend). Nu ook op de PDF, in dezelfde volgorde (BTW, dan KvK).
- Geverifieerd met een los testscript (`node`, media.js gemockt om geen echte Azure Blob
  Storage-verbinding nodig te hebben) dat `genereerFactuurPdf()` in vijf scenario's aanroept
  (zonder logo, met een geldig PNG-logo, met een verwijderde blob, met een niet-ondersteund
  beeldformaat, en als offerte) zonder te crashen, plus `pdftotext -layout` op de resulterende
  PDF's om te bevestigen dat "Betalingstermijn: 14 dagen" en de klant-BTW/KvK er echt op staan
  (en bij een offerte terecht ontbreken/wél staan, naar wat van toepassing is). Ook `npx oxlint`
  op het gewijzigde bestand: geen waarschuwingen.
- Bewust niet gewijzigd: de betaalinstructie/QR-code-banner blijft alleen verschijnen als
  `bedrijfsgegevens.iban` bekend is (net als voorheen) — het scherm toont 'm ook als alléén de
  tenaamstelling bekend is, maar zonder IBAN kan er toch geen betaal-QR gegenereerd worden, dus
  dat verschil is bewust ongemoeid gelaten.

## Eigen bedrijfsgegevens/IBAN ontbraken alsnog op de echte PDF — dieper zittende oorzaak (29-07-2026, vervolgsessie)

Na de vorige fix (logo/betalingstermijn/klant-BTW-KvK) meldde Wouter met screenshots dat er op
de écht gedownloade PDF nóg meer ontbrak: de EIGEN bedrijfsnaam/adres/KvK/BTW (kop en voettekst)
en de IBAN-betaalinstructie/QR — terwijl het scherm-voorbeeld die wél toont.

Oorzaak was dieper dan de vorige fix: het scherm-voorbeeld (`effectieveBedrijfsgegevens` in
`FacturatieModule.jsx`) combineert de opgeslagen SQL-rij (`dbo.bedrijfsgegevens_klanten`) met een
Dynamics-terugval voor lege velden (`vulBedrijfsgegevensAanMetCrm`) — maar `genereerFactuurPdf`
las via `haalBedrijfsgegevens()` altijd **alleen** de ruwe SQL-rij, zonder die Dynamics-terugval.
Staat de achtergrond-synchronisatie (het automatische `wijzigingsverzoek` bij het openen van de
Facturatiemodule, zie eerdere sessie) voor een account nog niet (volledig) in SQL — bijvoorbeeld
door de nog steeds niet volledig verklaarde incidentele schrijffout op
`dbo.bedrijfsgegevens_klanten` (zie eerdere aantekening, account JOWO Holding B.V. — exact het
account uit de screenshots) — dan mist de PDF dus gegevens die het scherm wél toont.

**Fix: dezelfde SQL-eerst/Dynamics-terugval-logica die het bedrijfsgegevens-formulier zelf al
gebruikt (`api/wijzigingsverzoek/index.js`, type `bedrijfsgegevens_facturatie`) nu ook
toegepast vlak vóór het genereren van een PDF/e-mail:**

- **`api/_gedeeld/identiteit.js`** — nieuwe `haalAccountOpId(accountId, token)`: haalt één
  Account rechtstreeks op zijn `accountid` op bij Dynamics, zonder de ingelogde gebruiker (`req`)
  nodig te hebben — in tegenstelling tot het bestaande `herleidAccounts(req, token)`, dat een
  e-mailadres uit de sessie nodig heeft. Nodig omdat `verstuurDocumentPerEmail()` (versturen per
  e-mail) geen `req` binnenkrijgt. Gebruikt dezelfde optionele-velden-terugval als
  `herleidAccounts` (BTW-/IBAN-/IBAN-tenaamstelling-veld bestaat niet → dat veld weglaten en
  opnieuw proberen) en geeft `null` terug bij elke fout (ontbrekende configuratie, netwerkfout,
  onbekend account) — puur best-effort, mag PDF/e-mail nooit blokkeren.
- **`api/_gedeeld/bedrijfsgegevensKlanten.js`** — nieuwe `haalGegevensMetCrmAanvulling(accountId)`:
  haalt eerst de SQL-rij op (`haalGegevens`), en als daar iets essentieels in ontbreekt
  (bedrijfsnaam, straat, postcode, plaats, kvkNummer, btwNummer, iban, ibanTenaamstelling) wordt
  best-effort aangevuld vanuit Dynamics — exact dezelfde velden/veldnamen-logica als
  `wijzigingsverzoek/index.js`'s `huidig`-berekening. Faalt de Dynamics-aanroep (geen config,
  geen netwerk, onbekend account), dan wordt gewoon de eigen — mogelijk onvolledige — SQL-rij
  teruggegeven, nooit een throw.
- De twee plekken die de PDF genereren zijn omgezet van `haalGegevens` naar
  `haalGegevensMetCrmAanvulling` (alleen de import-alias gewijzigd, verder niets aan de
  aanroepende code): `verstuurDocumentPerEmail()` in `api/_gedeeld/facturenKlanten.js`, en de
  GET `?formaat=pdf`-route in `api/facturen-klanten/index.js`. Andere plekken die
  `haalGegevens`/`zetGegevens` gebruiken (het bedrijfsgegevens-instellingenscherm zelf,
  logo-upload) deden al hun eigen Dynamics-aanvulling of hebben dat niet nodig, en zijn
  ongemoeid gelaten.
- Dit is een verdedigingslinie bovenop de nog steeds niet opgeloste onderliggende schrijffout op
  `dbo.bedrijfsgegevens_klanten` — lost die schrijffout zelf niet op, maar zorgt dat de PDF/
  e-mail ook zonder een geslaagde achtergrond-sync de juiste gegevens toont.
- Geverifieerd met een los testscript (`node`, `facturatieDb`/SQL en `identiteit`/Dynamics beide
  gemockt) dat vijf scenario's doorloopt: SQL-rij compleet (geen Dynamics-aanroep nodig), SQL-rij
  volledig leeg + Dynamics succesvol (alles aangevuld), SQL-rij deels gevuld — bijv. logo/
  CC-mailadres al wel opgeslagen — (alleen de ontbrekende velden aangevuld, eigen velden niet
  overschreven), Dynamics-configuratie ontbreekt (nette terugval, geen throw), en account
  onbekend bij Dynamics (nette terugval, geen throw). Alle vijf slagen. Ook `npx oxlint` op de
  vier gewijzigde bestanden: geen waarschuwingen.
- **Blauwe balken die wit worden** (tweede deel van Wouters melding) — kon dit keer niet
  onderzoeken: de kleurwaarde van de PDF (`KLEUR.lichtblauw = rgb(0.92, 0.95, 0.97)`) is
  rekenkundig vrijwel identiek aan de schermkleur (`#EAF2F8` = rgb(0.918, 0.949, 0.973)), dus een
  simpele fout in de kleurwaarde zelf lijkt uitgesloten. Om dit echt te kunnen vaststellen is de
  daadwerkelijk gedownloade PDF nodig (niet het scherm-voorbeeld) — nog navragen bij Wouter welke
  specifieke balk het betreft (betaalbanner, tabelkop, of iets anders) en idealiter de PDF zelf.

## CC-mailadres: "Geef accountId mee"-fout + Dynamics-vangnet toegevoegd (29-07-2026, vervolgsessie)

Wouter meldde dat opslaan van het CC-mailadres (Instellingen → Bedrijfsgegevens) mislukte met
`{"error": "Geef accountId (het klant-account waarvoor je werkt) mee."}` — dat is exact de
foutmelding van `controleerToegang()` in `api/_gedeeld/facturatieToegang.js`. De frontend-code
(`opslaanCcEmail` in `FacturatieModule.jsx`) stuurt `accountId` echter al wél netjes mee in de
PUT-body, en dat is ook altijd al zo geweest sinds deze knop in commit `572a728` is toegevoegd —
er zit dus geen fout in de huidige broncode die deze specifieke melding zou veroorzaken. Meest
waarschijnlijke verklaring: de site die Wouter gebruikte draaide (nog) niet de nieuwste versie
(gecachte/oude frontend-bundle, of een GitHub Actions-deploy die nog niet (helemaal) was
doorgekomen) — dit kon ik vanuit deze sessie niet verifiëren (geen toegang tot de GitHub
Actions-run-status of de live site). Nog te doen: navragen of een harde refresh + controle van
de laatste Actions-run dit oplost.

**Onafhankelijk daarvan**, op verzoek van Wouter: het CC-mailadres krijgt nu hetzelfde
Dynamics-vangnet als IBAN/tenaamstelling, met als doel: mislukt het wegschrijven naar de eigen
tabel (`dbo.bedrijfsgegevens_klanten`) een keer door het bekende, nog niet opgeloste
SQL-schrijfprobleem, dan komt de waarde via Dynamics alsnog terecht. Dynamics-veldnaam:
`cr283_ccbijversturen` (bevestigd door Wouter), overschrijfbaar via Application Setting
`DYNAMICS_CC_EMAIL_VELD`.

- **`api/_gedeeld/identiteit.js`** — nieuwe constante `CC_EMAIL_VELD`, toegevoegd aan
  `OPTIONELE_VELDEN` (dus met dezelfde ontbreekt-dit-veld-dan-toch-doorgaan-terugval als BTW/IBAN
  als het veld niet blijkt te bestaan), geëxporteerd.
- **`api/bedrijfsgegevens-klanten/index.js`** (PUT) — na het opslaan in de eigen tabel wordt
  best-effort ook een PATCH naar het Account in Dynamics gestuurd
  (`schrijfCcEmailNaarDynamics()`) — mislukt die aanroep (geen config, netwerkfout, ...), dan
  wordt dat alleen gelogd; het opslaan zelf (de HTTP-respons naar de klant) faalt hier nooit op.
- **`api/_gedeeld/bedrijfsgegevensKlanten.js`** — `haalGegevensMetCrmAanvulling()` vult ccEmail
  nu ook aan vanuit Dynamics, maar bewust **niet** als reden om zelf een Dynamics-aanroep te
  triggeren (ccEmail leeg is voor de meeste klanten de normale situatie, dus geen reden om bij
  elke PDF/e-mail een extra Dynamics-round-trip te doen) — alleen als er toch al een aanroep
  gebeurt (omdat een ander kernveld ontbreekt) liften we ccEmail gratis mee.
- **`api/mijn-gegevens/index.js`** + **`FacturatieModule.jsx`**
  (`vulBedrijfsgegevensAanMetCrm`) — ccEmail wordt (kosteloos, via dezelfde al bestaande
  Dynamics-query) ook aan het scherm-voorbeeld in Instellingen voorgevuld, zodat een eventueel
  mislukte SQL-schrijfactie niet als "leeg/verdwenen" overkomt.
- **Bijgevangen, gerelateerde kleine bug**: bij het indienen van de hoofd-bedrijfsgegevens
  (`dienIn()`, de goedkeuring-vereisende "Wijziging indienen"-knop) werd `ccEmail` per ongeluk
  meegestuurd in de `voorstel`-payload naar `/api/wijzigingsverzoek` — dat veld hoort daar niet
  in thuis (het heeft zijn eigen, direct-opslaan-endpoint zonder goedkeuring). Nu expliciet
  uitgesloten, net als elders in het bestand al gebeurde voor de achtergrond-sync.
- Geverifieerd met een los testscript (SQL/Dynamics-token/`fetch` gemockt): kernvelden compleet
  + ccEmail leeg → geen Dynamics-aanroep; een kernveld ontbreekt + ccEmail leeg → ccEmail wordt
  gratis aangevuld; een kernveld ontbreekt + eigen ccEmail al gezet → eigen waarde blijft
  leidend; de PUT-handler zelf slaagt en stuurt de juiste waarde naar Dynamics; en de PUT-handler
  slaagt ook nog steeds als de Dynamics-PATCH faalt. Alle vijf slagen. Ook `npx vite build`
  (1913 modules, geen nieuwe fouten) en `npx oxlint` (geen nieuwe waarschuwingen).

## CC-mailadres: "Geef accountId mee" bleef terugkomen — accountId nu ook in de query (29-07-2026, vervolgsessie, later die dag)

Wouter meldde de exacte melding (`{"error": "Geef accountId (het klant-account waarvoor je werkt)
mee."}`) een tweede keer bij het opslaan van het CC-mailadres, ook ná de Dynamics-vangnet-fix
hierboven (die loste dit niet op — dat was een parallelle verbetering, geen fix van déze fout).
De frontend-code (`opslaanCcEmail`) stuurde `accountId` al wel correct mee in de PUT-body, en dat
klopt ook al sinds de knop bestaat (commit `572a728`) — een statische code-analyse liet geen
fout zien die deze melding zou verklaren.

**Toegepaste, defensieve fix**: `controleerToegang()` (`api/_gedeeld/facturatieToegang.js`) leest
sowieso al eerst `req.query.accountId`, en pas als terugval `req.body.accountId` — maar
`opslaanCcEmail` stuurde `accountId` tot nu toe alléén in de JSON-body mee, niet ook in de
query-string (in tegenstelling tot bijv. de GET-aanroepen naar hetzelfde endpoint, die dat wel
altijd deden). `opslaanCcEmail` stuurt `accountId` nu **ook** als query-parameter mee
(`?accountId=...`), naast de body — dit dekt de fout af, ongeacht of de precieze oorzaak in een
verouderde/gecachte frontend-bundle zat, of ergens in hoe de JSON-body de Azure Function bereikte
(dat laatste kon vanuit deze sessie niet geverifieerd worden — geen toegang tot productie-logs of
de GitHub Actions-deploygeschiedenis).

Extra: de generieke foutmelding bij het opslaan ("Opslaan mislukt, probeer het nog eens.") toont
nu ook de echte servermelding (`ccFoutmelding`-state) als die er is — zodat een volgende keer
meteen zichtbaar is wát er misging, zonder dat Wouter de melding apart uit de browser-devtools
hoeft te halen.

Geverifieerd met `npx vite build` (geen nieuwe fouten) en `npx oxlint` (geen nieuwe
waarschuwingen). Kon dit niet end-to-end tegen de echte, live Dynamics/SQL-omgeving testen —
alleen statisch (build/lint) en tegen de eerder gemockte scenario's.

## PDF: factuurgegevens (titel + metaregels) 2 regels lager (29-07-2026, vervolgsessie)

Feedback van Wouter: *"Factuurgegevens moeten 2 regels in z'n geheel naar beneden."* — de
rechterkolom op de PDF (documenttitel "Factuur"/"Offerte"/"Creditnota" + de metaregels
factuurnummer/-datum/vervaldatum/betalingstermijn/leveringsperiode) begon precies op de
bovenrand van de pagina, wat te krap oogde (o.a. tegen een eventueel logo in de linkerkolom aan).

In `api/_gedeeld/facturenPdf.js`: `yRechts` (de startpositie van dat hele blok) begint nu op
`kopStartY - 26` (2 regels van 13pt, dezelfde regelafstand die binnen het blok zelf al werd
gebruikt) in plaats van precies op `kopStartY`. Het blok schuift als geheel naar beneden — de
regelafstand tussen titel en metaregels, en tussen de metaregels onderling, blijft ongewijzigd.
Bewust alleen in de PDF aangepast, niet in het scherm-voorbeeld (`DocumentVoorbeeld`) — de
melding ging over de gedownloade PDF specifiek.

Geverifieerd met een los testscript (`genereerFactuurPdf` met een factuur, media.js gemockt) +
`pdftotext -layout` op het resultaat: de titel "Factuur" en de metaregels beginnen nu zichtbaar
lager, ter hoogte van de 3e regel van de afzenderkolom in plaats van de 1e. `npx oxlint`: geen
waarschuwingen.

## Logo en mailadres wijzigen deden het helemaal niet — migratie 006 stond nog niet op de live database (29-07-2026, vervolgsessie)

Wouter meldde dat zowel het CC-mailadres opslaan als het logo uploaden niet meer werkten voor een
specifiek account (`114943e7-...`), met als concreet bewijs een GET-response waarin `gewijzigdOp`
al ruim 24 uur stilstond op `2026-07-28T18:42:12.486Z` ondanks meerdere opslagpogingen — en alle
kernvelden (bedrijfsnaam, adres, KvK, BTW, IBAN) leeg. De twee eerdere fixes voor de
"Geef accountId mee"-melding (Dynamics-vangnet, daarna accountId ook in de query-string) hadden
dit dus niet opgelost — logisch, want het bleek een heel andere, onderliggende oorzaak te zijn.

**Root cause**: `zetGegevens()` (`api/_gedeeld/bedrijfsgegevensKlanten.js`) doet één UPDATE/INSERT
die **alle** kolommen in één keer zet, inclusief `cc_email` — ook als je alleen een logo of alleen
een adresveld wijzigt. De `cc_email`-kolom is toegevoegd via migratie
`db/migrations/006_bedrijfsgegevens_cc_email.sql`, die **handmatig** in de Azure Portal
Query-editor tegen de live database gedraaid moet worden (staat zo in het bestand zelf) — dat was
nog niet gebeurd. Zolang die kolom op de live database ontbrak, faalde dus *elke* opslag via
`zetGegevens()` met een SQL-fout ("Invalid column name 'cc_email'"), niet alleen een
CC-mailadres-wijziging maar ook een logo-upload of een gewone adreswijziging. Dat verklaarde in
één keer zowel de bevroren `gewijzigdOp` als het niet-werken van zowel mailadres als logo.

De fout kwam bij Wouter overigens niet als deze SQL-tekst binnen — `afhandelFout()`
(`facturatieToegang.js`) herkent alleen een paar specifieke foutcodes/-teksten en valt voor al het
overige terug op een generieke "Onverwachte fout in de facturatiemodule." (met de echte tekst wel
verborgen in een `detail`-veld in de response-body, dat de UI nu nog niet toont). Voor het
CC-mailadres liet de nieuwe `ccFoutmelding`-state dus alleen de generieke tekst zien (niet de
`detail`), voor het logo-uploaden zelfs helemaal niets (`uploadLogo`'s catch-blok toont geen
servertekst). Gediagnosticeerd door Wouter te laten checken of de kolom bestond
(`INFORMATION_SCHEMA.COLUMNS`) — die bleek er inderdaad nog niet te zijn.

**Fix**: geen code-wijziging nodig — Wouter heeft migratie 006 alsnog rechtstreeks tegen de live
database gedraaid (`ALTER TABLE dbo.bedrijfsgegevens_klanten ADD cc_email NVARCHAR(320) NULL;`).
Daarna werkten zowel logo-upload als CC-mailadres-opslaan meteen. Geen commit nodig voor de fix
zelf; wel voor deze log-aantekening.

**Nog openstaande verbetermogelijkheid (niet uitgevoerd)**: `uploadLogo`/`verwijderLogo` tonen bij
een fout geen servertekst (in tegenstelling tot `opslaanCcEmail`, die sinds de vorige fix wél
`e.message` toont) — een volgende keer dat een save om wat voor reden dan ook faalt, is dat voor
logo dus weer onzichtbaar. Zou op dezelfde manier verbeterd kunnen worden als bij ccEmail, en de
UI zou ook het `detail`-veld kunnen tonen i.p.v. alleen `error`, zodat toekomstige SQL-fouten
(zoals deze) meteen zichtbaar zijn zonder devtools nodig te hebben.

**Les voor de toekomst**: nieuwe migraties in `db/migrations/` moeten na het schrijven ervan ook
echt tegen de live database uitgevoerd worden — dat gebeurt niet automatisch bij een deploy. Zou
het overwegen waard zijn om hier een simpele checklist/reminder voor te hebben (bijv. een sectie
in dit bestand die per migratie bijhoudt of hij al gedraaid is), zodat dit niet nog een keer
onopgemerkt blijft staan.

## Conceptfacturen/-offertes verwijderen + logo op de PDF krijgt meer ruimte (29-07-2026, vervolgsessie)

Twee losse verzoeken van Wouter: *"Ik wil concept facturen ook kunnen verwijderen."* en
*"pdf factuur het logo meer ruimte geven, nu valt logo over bedrijfsnaam heen."*

**Concepten verwijderen**: de backend ondersteunde dit al volledig (`DELETE
/api/facturen-klanten?accountId=...&id=...` → `verwijderFactuur()` in `facturenKlanten.js`, met
een server-side guard die alleen `status === "concept"` toestaat en anders een
`VALIDATIE`-fout geeft) — er was alleen geen knop in de UI. Toegevoegd in `DocumentenTab`
(`FacturatieModule.jsx`): een rode prullenbak-knop naast het bewerk-potloodje, alleen zichtbaar
bij concepten, met een bevestigingsdialoog (`window.confirm`) — zelfde patroon als het al
bestaande "abonnement verwijderen" in `AbonnementenTab`. Geen backend-wijziging nodig.

**Logo over bedrijfsnaam heen op de PDF**: in `facturenPdf.js` liet de code na het tekenen van
het logo maar 8pt ruimte vóór de bedrijfsnaam-tekst (`y -= logoHoogte + 8`). Bij 13pt vetgedrukte
tekst steekt de ascender van de letters echter ~9-10pt boven de tekst-baseline uit — dus de
bedrijfsnaam kwam in de praktijk net ín het logo te hangen in plaats van eronder. Aangepast naar
`+ 16` (gelijk aan de regelafstand die verderop al tussen bedrijfsnaam en adres gebruikt wordt),
wat ruim voldoende lucht geeft.

Geverifieerd: `npx vite build` (1913 modules) en `npx oxlint` op beide bestanden, geen nieuwe
fouten/waarschuwingen. Voor het logo een los testscript met `media.js` gemockt (eerst een te
kleine 2×1-testafbeelding geprobeerd — te klein om iets te tonen — daarna een realistische
400×120 blauwe testafbeelding) + `pdftoppm` om de PDF naar een PNG te renderen en visueel te
controleren: met de oude `+8` hing de bedrijfsnaam zichtbaar tegen/in het logo, met de nieuwe
`+16` staat er duidelijke witruimte tussen logo en bedrijfsnaam.

## Terugkerende facturen: Power Automate-scheduler nu echt ingericht (29-07-2026, vervolgsessie)

Laatste openstaande configuratiestap voor abonnementen/terugkerende facturen: Wouter heeft een
geplande cloudflow in Power Automate aangemaakt die dagelijks een HTTP POST doet naar
`/api/verwerk-terugkerende-facturen` met header `x-verwerk-sleutel`. Twee losse fouten onderweg,
allebei door Wouter zelf opgelost na een korte aanwijzing:

1. **`HostNotFound: No such host is known`** — de ingevulde URI was
   `http://mijn.activaa.nll/...` (dubbele L, en `http` i.p.v. `https`). Hersteld naar
   `https://mijn.activaa.nl/api/verwerk-terugkerende-facturen`.
2. **HTTP 501 `TERUGKEREND_TRIGGER_SECRET is nog niet geconfigureerd`** — de sleutel stond wel al
   in de flow (header `x-verwerk-sleutel`), maar de bijbehorende App Setting ontbrak nog op de
   Static Web App zelf. Toegevoegd: Application Setting `TERUGKEREND_TRIGGER_SECRET` met dezelfde
   waarde als de header.

Na deze twee fixes gaf een handmatige testrun een 200 met `{"verwerkt": 0, "mislukt": 0,
"resultaten": []}` — verwacht resultaat zolang er nog geen abonnement met een vervallen
"volgende factuurdatum" is. Vanaf de eerstvolgende geplande run (dagelijks) worden vervallen
abonnementen automatisch verwerkt. **Hiermee is de laatste openstaande configuratiestap voor de
facturatiemodule afgerond** — geen codewijziging nodig geweest, puur Azure/Power
Automate-configuratie.

## Standaardwaarden voor nieuwe facturen: betalingstermijn, BTW-code, factuurtekst (29-07-2026, vervolgsessie)

Verzoek van Wouter: *"Kan je nu standaardwaarden bouwen die de klant kan instellen. Dit moet
onthouden worden. Dus betalingstermijn btw code. Factuurteksten."* — dit was al een tijdje een
"NOG NIET GEBOUWD"-placeholderkaart bij Instellingen (`Sliders`-icoon, tekst "Standaard
betalingstermijn, btw-percentage en factuurteksten instellen"), nu echt gebouwd.

**Migratie 007** (`db/migrations/007_bedrijfsgegevens_standaardwaarden.sql`) voegt drie kolommen
toe aan `dbo.bedrijfsgegevens_klanten` (zelfde tabel als cc_email/logo — een eigen voorkeur, geen
verificatiegegeven, dus geen goedkeuring nodig): `standaard_betalingstermijn` (INT, NULL = geen
voorkeur), `standaard_btw_code` (NVARCHAR(20)), `standaard_factuurtekst` (NVARCHAR(MAX)). **Let
op: deze migratie moet nog handmatig tegen de live database gedraaid worden** (zelfde
"Uitvoeren in de Query-editor"-stap als migratie 006 — en gezien wat daar recent misging, dit
keer meteen even bevestigen dat de kolommen er staan voordat het als "klaar" wordt gemeld).

**Backend**: `bedrijfsgegevensKlanten.js` — `naarBuiten()`/`LEEG` geven de drie nieuwe velden nu
mee; `zetGegevens()` slaat ze op (met dezelfde partial-update-logica als de rest: alleen
meegegeven velden wijzigen, de rest blijft staan — inclusief een aparte terugval voor
`standaardBetalingstermijn` omdat `null` daar een geldige, betekenisvolle waarde is en niet als
"niet meegegeven" behandeld mag worden). `api/bedrijfsgegevens-klanten/index.js`'s PUT-handler
accepteert nu naast `ccEmail` ook `standaardBetalingstermijn`/`standaardBtwCode`/
`standaardFactuurtekst` — los of samen aan te roepen, met validatie (betalingstermijn 1-365 dagen
of leeg, factuurtekst max 4000 tekens).

**Frontend**: nieuwe kaart `StandaardwaardenKaart` in de Instellingen-tab (naast Bedrijfsgegevens
en vóór de nog-niet-gebouwde Mollie/Herinneringen-kaarten), met een dropdown voor de
betalingstermijn, een dropdown voor de standaard BTW-code (gevuld vanuit de al bestaande
BTW-tarievenlijst, dezelfde `tarieven`-prop als het factuurformulier), en een tekstveld voor de
standaard factuurtekst. Direct zelf op te slaan, zonder goedkeuring.

Deze standaardwaarden vullen alleen een NIEUW document voor (`DocumentFormulier`, dus zowel een
losse factuur/offerte als het aanmaken van een nieuw abonnement) — per document blijft alles
gewoon aan te passen, en een al bestaand concept behoudt zijn eigen eerder opgeslagen waarde
(fallback-volgorde: eigen waarde van het document → ingestelde standaardwaarde → hardgecodeerde
fallback zoals voorheen: 30 dagen / "hoog" / leeg). `LEGE_REGEL()` (de fabrieksfunctie voor een
nieuwe factuurregel) kreeg hiervoor een optioneel `(standaardBtwCode, tarieven)`-argument, met een
veilige terugval naar "hoog"/21% als er geen standaard is ingesteld of de ingestelde code niet
meer in de tarievenlijst voorkomt. Bewust NIET doorgevoerd in `AbonnementFormulier` (het bewerken
van een al bestaand abonnement) — dat is een edit-only formulier waar dit minder relevant is, en
het zou extra prop-doorgeefwerk vragen voor weinig winst.

Geverifieerd: een los testscript (SQL-pool gemockt) voor `zetGegevens()` — lege standaardwaarden
voor een vers account, opslaan zonder bestaande rij (INSERT-pad), een ongerelateerde wijziging
(bijv. bedrijfsnaam) die de standaardwaarden met rust laat (UPDATE-pad regressietest), en
`standaardBetalingstermijn` weer expliciet terug naar `null` zetten — alle vijf slagen. Een tweede
testscript voor de PUT-endpointvalidatie (accountId/toegang gemockt): alleen standaardwaarden
meegeven laat ccEmail met rust en omgekeerd, 0 of >365 dagen wordt geweigerd, een lege body wordt
geweigerd, een te lange factuurtekst wordt geweigerd — alle zes slagen. Losse Node-tests voor de
fallback-ketens van `betalingstermijnDagen`/`opmerkingen`/`LEGE_REGEL` (bestaand document >
standaardwaarde > hardgecodeerde fallback) — alle vijf slagen. `npx vite build` (1913 modules) en
`npx oxlint` op alle gewijzigde bestanden: geen nieuwe fouten/waarschuwingen.

## Beheerportaal: facturatie-filter, mededelingen bewerken+herschikken, FAQ bewerken (29-07-2026, vervolgsessie)

Verzoek van Wouter: filteren op aan/uit in de Facturatie-tab, mededelingen ook aan te passen en
in volgorde te wijzigen, FAQ ook aanpasbaar. Alle drie puur in `src/beheer/BeheerPortaal.jsx` —
`/api/beheer-content` (PUT voor bewerken, PATCH voor herschikken) ondersteunde dit voor
mededelingen/FAQ al, dus geen backend-wijziging nodig; alleen de UI ontbrak nog.

- **Facturatie-tab**: filterknoppen "Alle / Aan / Uit" naast het zoekveld, extra `.filter()`-stap
  in `gefilterdFacturatie` op `facturatieStatussen[accountId].ingeschakeld`.
- **Mededelingen**: Pencil-knop per mededeling opent een inline bewerk-formulier (titel, tekst,
  klantgroepen, zichtbaar-tot) — zelfde velden als "Mededeling versturen", opgeslagen via PUT.
  Herschikken (ArrowUp/ArrowDown) alleen binnen de *actieve* mededelingen — verlopen mededelingen
  hoeven niet herordend; de PATCH-volgorde bevat daarom alleen de actieve id's (het endpoint
  plakt de rest er zelf achteraan, zie `herschikItems` in `api/_gedeeld/content.js`).
- **FAQ**: zelfde Pencil-bewerkpatroon (vraag, antwoord, klantgroepen) naast de al bestaande
  toevoegen/herschikken/verwijderen.
- Geen migratie, geen nieuwe endpoints. Geverifieerd met `npx oxlint` en `npx vite build`
  (1913 modules, geen nieuwe fouten/waarschuwingen).

## Crediteren vervangt annuleren: automatische creditnota bij een verstuurde/betaalde factuur (29-07-2026, vervolgsessie)

Verzoek van Wouter: *"Ik wil factuurregels alleen kunnen crediteren. Dus annuleren moet worden
crediteren. Hier moet dan de nota exact opgemaakt worden met datum crederen en negatief."*
Vooraf via `AskUserQuestion` uitgevraagd (financiële/boekhoudkundige logica, dus bewust niet
geraden): altijd de hele factuur crediteren (geen regel-voor-regel selectie), de creditnota eerst
als concept (zelf controleren voor je 'm verstuurt), crediteren mag op zowel een verstuurde als
een al betaalde factuur, en bij volledige creditering gaat de factuur naar "Geannuleerd" — maar
pas op het moment dat de creditnota zelf ook echt verstuurd is (zie hieronder, om een kapotte
boekhoudkundige trail te voorkomen als iemand het concept weer weggooit).

- **`api/_gedeeld/facturenKlanten.js`**: `annuleerFactuur` (zette alleen de status om) vervangen
  door `crediteerFactuur(klantAccountId, id, email)` — valideert dat het om een `factuur` gaat met
  status `verzonden` of `betaald`, negeert alle regels (`aantal: -Math.abs(aantal)`, prijs
  ongewijzigd — bedrag/btw/totaal worden dus automatisch negatief via `berekenTotalen`), en maakt
  via het bestaande `maakFactuur()` een **concept**-creditnota aan (`documenttype: "creditnota"`,
  `referentieFactuurId` naar de originele factuur, `opmerkingen: "Creditnota voor factuur
  <nummer>."`). Bewust geen `factuurdatum` meegegeven — `maakFactuur()` valt dan terug op
  "vandaag", en dat is precies de datum van crediteren die vereist is, niet de oorspronkelijke
  factuurdatum.
- `verstuurFactuur()` kreeg een extra stap: wordt hier een creditnota verstuurd die een
  `referentieFactuurId` heeft, dan wordt nú pas (nieuwe helper `zetFactuurGeannuleerdDoorCreditnota`)
  de gecrediteerde factuur naar `geannuleerd` gezet — best-effort/stil, mag het versturen van de
  creditnota zelf nooit blokkeren.
- **`api/facturen-klanten/index.js`**: PATCH-actie `annuleren` → `crediteren`.
- **`src/portaal/FacturatieModule.jsx`**: de rode "Annuleren"-knop is nu "Crediteren" (icoon
  `Undo2`), zichtbaar bij zowel `verzonden` als `betaald`. Nieuwe sub-tab **"Creditnota's"**
  (hergebruikt de bestaande `DocumentenTab`/`DocumentFormulier`/`DocumentDetail`-componenten,
  alleen `documenttype="creditnota"` is nieuw) om concept-creditnota's te bekijken, te bewerken
  en zelf te versturen — exact dezelfde generieke concept→versturen-flow als facturen/offertes.
  `naam`/`naamMv`/`statussen` in `DocumentenTab` en `naam` in `DocumentFormulier` kregen een
  `creditnota`-tak voor correcte labels ("Nieuwe creditnota", "Concept-creditnota bewerken", enz.).
- **PDF (`facturenPdf.js`) + scherm-voorbeeld (`DocumentVoorbeeld`)**: de "€ X te betalen op
  datum"-banner, de Vervaldatum/Betalingstermijn-metaregels, én het betaal-QR-blok stonden allemaal
  aan bij "niet offerte" (dus ook bij creditnota) — dat is fout voor een negatief bedrag: je vraagt
  niemand om een negatief bedrag over te maken. Alle drie nu beperkt tot `documenttype === "factuur"`
  (dus wel bij een factuur, niet meer bij offerte óf creditnota).
- **Belangrijke bugfix in `rond()`** (afronding op 2 decimalen): `Math.round()` in JavaScript rondt
  exacte halve waarden altijd naar +Infinity af — voor een positief bedrag is dat "naar boven"
  (weg van nul), maar voor een negatief bedrag is dat "naar boven richting nul", dus een halve-cent-
  grensgeval rondde vóór deze fix niet symmetrisch: een factuur van bijv. €393,86 werd bij crediteren
  soms €-393,85 in plaats van het exacte €-393,86. `rond()` rondt nu de absolute waarde af en past
  daarna pas het teken toe (round-half-away-from-zero), zodat `rond(-x) === -rond(x)` altijd klopt.
  Dit was een latent probleem dat er al vanaf het begin in zat (annuleren/offerte/factuur waren tot
  nu toe altijd positief, dus het kwam nooit aan het licht) — nu voor het eerst relevant omdat een
  creditnota bewust negatieve regels heeft.

Geverifieerd: `berekenTotalen()` rechtstreeks getest met de exacte negatie-logica uit
`crediteerFactuur()` — subtotaal/btw/totaal van een creditnota zijn bit-exact het tegenovergestelde
van de originele factuur, plus een brute-force-test met 500 losse (aantal/prijs/btw%)-combinaties,
allemaal symmetrisch na de `rond()`-fix (vóór de fix faalden er twee van de drie kernchecks op het
eerste voorbeeld al). `npx vite build` (1913 modules) en `npx oxlint` op alle gewijzigde bestanden:
geen nieuwe fouten/waarschuwingen (op één bestaande, ongerelateerde waarschuwing in
`FacturatieModule.jsx` na).

**Nog niet gebouwd / bewust buiten scope**: regel-voor-regel (partieel) crediteren — dit gaat
altijd om de hele factuur; handmatig een "losse" creditnota aanmaken zonder gekoppelde factuur kan
technisch via de nieuwe "Creditnota's"-tab (de generieke formulieren staan dat toe), maar is niet
apart getest/ontworpen — de bedoelde weg is de "Crediteren"-knop op een factuur.
