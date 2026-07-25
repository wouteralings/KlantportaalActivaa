# Klantportaal

Azure Static Web App (React-frontend + Azure Functions-API) waarmee klanten, ingelogd
als gastgebruiker (Azure AD B2B) in jullie eigen tenant, hun eigen gegevens zien:

- **Home** — openstaande taken staan meteen bij het inloggen op het scherm.
- **Mededelingen** — programma-links + mededelingen door jullie beheerd.
- **Nieuws & blog** — automatisch via RSS van activaa.nl, eigen tab.
- **Mijn gegevens** — NAW, relatiegegevens én de persoonlijke adviseur (accounteigenaar in
  Dataverse) per klantnummer.
- **Documenten** — alles wat in SharePoint met de klant is gedeeld; de klant kan zelf een
  label én een klant-entiteit aan elk document koppelen (bij meerdere klantnummers per login).
- **Review geven** — 5 sterren stuurt door naar jullie Google Bedrijfsprofiel, lager wordt
  een interne escalatietaak in Dynamics.
- **Veelgestelde vragen** — door jullie beheerd, met een knop naar een Copilot-assistent in
  Microsoft Teams voor wat niet in de FAQ staat.

Losstaand van de interne offertetool — dit project bevat alleen het klantportaal.

---

## Architectuur in het kort

```
Klant (gastgebruiker)
       │  1. login via Static Web Apps ingebouwde AAD-auth
       ▼
Portal frontend (React, deze repo)
       │  2a. /api/mijn-gegevens, /api/taken  → x-ms-client-principal (e-mail)
       │  2b. /api/documenten                  → los MSAL-token (On-Behalf-Of)
       ▼
Azure Functions (api/)
       │
       ├─► Dataverse Web API   (NAW, relatiegegevens, taken)
       └─► Microsoft Graph     (SharePoint-documenten, via OBO)
```

Er zijn twee aparte identiteits-mechanismen in gebruik, met elk hun eigen doel:

1. **`x-ms-client-principal`** — de header die Static Web Apps automatisch meestuurt na
   inloggen. Hiermee wordt het e-mailadres van de klant herleid naar zijn Contact/Account(s)
   in Dataverse. Gebruikt door `/api/mijn-gegevens`, `/api/taken` en `/api/mijn-labels`.
2. **MSAL.js + On-Behalf-Of** — voor de documenten-tab. Dit geeft een Graph-token dat de
   *echte* SharePoint-rechten van de ingelogde klant respecteert (via `/me/drive/sharedWithMe`).
   Er is dus geen eigen toegangsadministratie: wie een map in SharePoint deelt met de
   gastgebruiker, ziet die vanzelf in het portaal verschijnen.

Waarom twee mechanismen? De ingebouwde AAD-auth van Static Web Apps geeft geen bruikbaar
Graph-token door aan de backend — dat vraagt een eigen App Registration met een OBO-flow.
Voor Dataverse (waar we zelf met een app-only token werken) is dat niet nodig.

---

## Eén keer instellen

### 1. Dynamics/Dataverse-koppeling

1. App Registration aanmaken in Entra ID (of hergebruiken als je die al hebt).
2. In Dataverse: een **Application User** aanmaken gekoppeld aan deze App Registration,
   met een security role die leesrechten geeft op Contact, Account en Task.
3. Zorg dat elke klant die het portaal mag gebruiken een **Contact-record** heeft met:
   - `emailaddress1` = het e-mailadres waarmee die persoon als gastgebruiker inlogt.
   - `parentcustomerid` = de gekoppelde Account.
   - Eén persoon met toegang tot **meerdere** klanten? Maak dan gewoon meerdere
     Contact-records aan met hetzelfde e-mailadres, elk gekoppeld aan een andere Account.
     Er is verder niets te configureren — het portaal leest deze koppeling automatisch.
4. **Persoonlijke adviseur**: het portaal toont bij "Mijn gegevens" de eigenaar (`ownerid`)
   van het Account als persoonlijke adviseur/contactpersoon van de klant. Is de accounteigenaar
   bij jullie niet de juiste persoon hiervoor (bijv. een apart lookup-veld voor "adviseur"),
   pas dan de `$expand=ownerid(...)` aan in `api/_gedeeld/identiteit.js`.
5. Zet `DYNAMICS_TENANT_ID`, `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET` en
   `DYNAMICS_RESOURCE_URL` als Application Settings op de Static Web App.

### 2. Portaal-login (Azure AD B2B guest access)

1. In Entra ID: External Collaboration Settings controleren/instellen (wie mag
   gastgebruikers uitnodigen, welke domeinen zijn toegestaan).
2. Klanten uitnodigen als gastgebruiker in jullie tenant (of self-service sign-up via
   een user flow, als dat gewenst is).
3. De ingebouwde AAD-provider van Static Web Apps werkt hiervoor out-of-the-box — geen
   extra App Registration nodig voor het inloggen zelf.

### 3. SharePoint-documenten (Microsoft Graph, On-Behalf-Of)

1. **Nieuwe, eigen App Registration** aanmaken (niet dezelfde als bij Dynamics).
2. Onder **"Expose an API"**: een scope toevoegen, bijv. `access_as_user`.
3. Onder **"API permissions"**: Microsoft Graph → **Delegated** → `Files.Read` →
   admin consent geven.
4. Client secret aanmaken.
5. Redirect URI's instellen (type "Single-page application") voor de URL van de
   Static Web App, bijv. `https://<jouw-app>.azurestaticapps.net`.
6. Zet `AAD_TENANT_ID`, `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET` als Application Settings
   op de Static Web App (backend), en `VITE_AAD_CLIENT_ID` / `VITE_AAD_TENANT_ID` als
   build-variabelen voor de frontend (zie `.env.example`).
7. Verder hoeft er niets in SharePoint geconfigureerd te worden — wie een map of
   bestand deelt met de gastgebruiker (zoals je dat al gewend bent), ziet die
   vanzelf in het portaal. Er is geen aparte toegangsadministratie.

### 4. Documentlabels en klant-koppeling

De klant kan aan een gedeeld document een eigen, herkenbare naam geven, én aangeven bij welke
klant (entiteit) het hoort als hij toegang heeft tot meerdere klantnummers. Beide worden apart
opgeslagen (niet in SharePoint zelf) in Azure Blob Storage.

1. Een Storage Account (kan een bestaand account zijn).
2. `STORAGE_CONNECTION_STRING` als Application Setting op de Static Web App.
3. De container `documentlabels` wordt automatisch aangemaakt bij het eerste gebruik.

### 5. Mededelingen, programma-links en klantcategorieën

1. Zorg dat het klantcategorie-veld op Account bekend is; standaard wordt `new_klantcategorie`
   verwacht. Heet het veld bij jullie anders? Zet dan `DYNAMICS_KLANTCATEGORIE_VELD` als
   Application Setting op de logische naam van dat veld.
2. Er is geen beheerscherm — content beheer je via `/api/beheer-content` (alleen bereikbaar
   met de rol **beheerder**, ken die toe via Static Web Apps > Role management):
   - `POST` met `{ type: "mededeling", titel, tekst, klantcategorieen: ["Zorg"] }`
   - `POST` met `{ type: "programma", titel, url, klantcategorieen: [] }` (leeg = voor iedereen)
   - `PUT`/`DELETE` om te wijzigen of te verwijderen.
3. De waarden in `klantcategorieen` moeten letterlijk overeenkomen met het leesbare label van
   de optieset-waarde in Dataverse (bijv. "Zorg", niet de onderliggende code).
4. Gebruikt dezelfde `portaalcontent`-container in het Storage Account als hierboven —
   geen extra configuratie nodig.

### 6. Nieuws & blog van activaa.nl

Geen configuratie nodig — `/api/nieuws` haalt automatisch de RSS-feeds van de categorieën
"blog" en "nieuws" op activaa.nl op (15 minuten gecached). Wijzigt de site van RSS-locatie,
pas dan de `FEEDS`-lijst aan in `api/_gedeeld/nieuws.js`.

### 7. Reviews

1. Zoek de "Schrijf een review"-link van jullie Google Bedrijfsprofiel op (via Google Maps:
   het bedrijf opzoeken → Reviews → "Schrijf een review" → link kopiëren, of via de
   Business Profile-manager).
2. Zet die via `PUT /api/beheer-instellingen` (alleen rol `beheerder`):
   `{ "googleReviewUrl": "https://g.page/r/.../review" }` — geen Azure-instelling nodig,
   dit kan op elk moment aangepast worden zonder her-deployen.
3. Bij 5 sterren wordt eerst expliciet gevraagd of de klant dit als review op Google wil
   delen — pas na "Ja, graag" gaat de link open.
4. Bij 4 sterren of lager wordt automatisch een **Task** aangemaakt in Dataverse (regarding
   de klant-Account, prioriteit hoog) zodat het via jullie bestaande Dynamics-workflow wordt
   opgepakt — er is geen apart notificatiekanaal nodig.

> **Let op:** dit patroon (alleen tevreden klanten doorsturen naar een openbare review) heet
> "review gating" en is in strijd met Google's richtlijnen voor Bedrijfsprofielen. Het is
> gebouwd zoals gevraagd, maar weeg dat risico zelf af.

### 8. Veelgestelde vragen (FAQ)

Beheer je via hetzelfde `/api/beheer-content`-endpoint als mededelingen/programma's, met
`type: "faq"`:

```json
POST /api/beheer-content
{ "type": "faq", "vraag": "Hoe dien ik een declaratie in?", "antwoord": "...", "klantcategorieen": [] }
```

Klanten zien dit als een inklapbare lijst onder "Veelgestelde vragen". Net als bij
mededelingen: lege `klantcategorieen` = zichtbaar voor iedereen.

### 9. Copilot-assistent via Microsoft Teams

Dit gaat grotendeels buiten deze codebase om — het is Copilot Studio- en Teams-configuratie,
niet iets wat vanuit de portal-code aangestuurd wordt. Wat de portal wél doet: een
"Chat in Teams"-knop tonen zodra jullie de link hebben ingesteld.

**Stappen die jullie zelf doorlopen (niet door mij te doen zonder toegang tot je tenant):**

1. **Agent bouwen in Copilot Studio** (voorheen Power Virtual Agents), binnen jullie eigen
   tenant. Grond de agent bijvoorbeeld op de FAQ-inhoud — makkelijkste weg is de FAQ-vragen
   en -antwoorden ook los te documenteren (of te exporteren) naar een SharePoint-lijst of
   Word/PDF-bestand, want dat zijn de kennisbrontypen die Copilot Studio native ondersteunt.
   Wil je de agent rechtstreeks laten lezen uit dezelfde data als de portal, dan kan dat via
   een Power Automate-flow die `/api/mijn-content` of `/api/beheer-content?type=faq` aanroept
   vanuit een topic in de agent — dat is meer maatwerk.
2. **Publiceren naar Teams**: in Copilot Studio onder "Channels" → Microsoft Teams inschakelen
   en publiceren. Omdat de agent in jullie eigen tenant staat, kunnen gastgebruikers die al
   toegang hebben tot Teams in jullie tenant de agent daar terugvinden en mee chatten — geen
   aparte licentie voor hen nodig buiten wat ze al hebben als gast.
3. **Chatlink verkrijgen**: na publiceren geeft Teams een deeplink naar de bot-chat (via de
   "Get link to chat"-optie op de bot, of `https://teams.microsoft.com/l/chat/0/0?users=<bot-app-id>`).
4. Zet die link via `PUT /api/beheer-instellingen`: `{ "teamsChatUrl": "https://teams.microsoft.com/l/chat/..." }`.
   De "Chat in Teams"-knop bij de FAQ-tab verschijnt dan automatisch.

Gastgebruikers moeten voor deze stap toegang hebben tot Teams binnen jullie tenant — dat is
niet automatisch hetzelfde als toegang tot dit portaal; check dat apart bij de B2B-instellingen.

---

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env               # VITE_AAD_CLIENT_ID / VITE_AAD_TENANT_ID invullen
npm run dev

cd api
npm install
cp local.settings.json.example local.settings.json   # invullen
func start                          # vereist Azure Functions Core Tools
```

## Endpoints (api/)

| Endpoint | Methode | Doel |
|---|---|---|
| `/api/mijn-gegevens` | GET | NAW + relatiegegevens per gekoppeld klantnummer |
| `/api/taken` | GET | Openstaande taken, gegroepeerd per klantnummer |
| `/api/taken?id=...` | PATCH | Taak markeren als afgehandeld |
| `/api/documenten` | GET | Gedeelde SharePoint-documenten (vereist MSAL-token, zie boven) |
| `/api/mijn-labels?id=...` | PATCH | Eigen label en/of klant-entiteit zetten op een document: `{ label?, entiteit? }` |
| `/api/mijn-content` | GET | Mededelingen + programma-links, gefilterd op eigen klantcategorie(ën) |
| `/api/beheer-content` | GET/POST/PUT/DELETE | Mededelingen/programma's beheren (alleen rol `beheerder`) |
| `/api/nieuws` | GET | Laatste blog- en nieuwsposts van activaa.nl (RSS, gecached) |
| `/api/reviews` | POST | Review indienen: `{ sterren: 1-5, opmerking? }` |
| `/api/beheer-instellingen` | GET/PUT | Portaalbrede instellingen zoals de Google-reviewlink en Teams-chatlink (alleen rol `beheerder`) |
| `/api/instellingen` | GET | Dezelfde instellingen, read-only, voor elke ingelogde klant (o.a. de Teams-chatlink) |

## Bekende openstaande punten

- Er is nog geen geautomatiseerde test-suite.
- De documenten-login (MSAL popup) is een aparte stap t.o.v. de hoofd-login — dat kan in de
  toekomst gladgestreken worden door de hoofd-login zelf via MSAL.js te laten lopen met een
  custom AAD-provider in `staticwebapp.config.json`, in plaats van de ingebouwde AAD-provider.
