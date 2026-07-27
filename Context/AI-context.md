# Klantportaal Activaa — AI-context

Kort, feitelijk naslagdocument voor AI-assistenten en nieuwe sessies. Bevat architectuur, koppelingen, bestandsstructuur, functies en configuratie. **Geen geheimen** (secrets/wachtwoorden staan hier bewust niet in).

## Wat het is
Klantportaal voor Activaa Accountants en Adviseurs: een **Azure Static Web App** (frontend, Vite/React) met **Azure Functions** (`/api`, Node 20). Klanten loggen in met hun Microsoft-account (gast in de Activaa-tenant) en zien hun eigen gegevens, documenten, taken, nieuws, FAQ. Daarnaast een beveiligde beheeromgeving (`/beheer`, rol `beheerder`).

- Repo: GitHub `wouteralings/KlantportaalActivaa`, branch `main`. Push naar `main` → GitHub Actions bouwt en deployt automatisch.
- Lokale werkkopie (device): `C:\Projecten\KlantportaalActivaa`.

## Azure-omgeving
- Subscription: **OfferteTool** (`2e890a71-592f-4cb8-a7cf-bab59d980232`)
- Resourcegroep: **`klantportaal-rg`**
- Static Web App: **`klantportaal-activaa`** (SKU Free), URL **`https://blue-tree-084d8b510.7.azurestaticapps.net`**
- Entra-tenant (Activaa): **`a7b1bd7a-fc04-41b0-97d3-be7577d96616`** (domein `activaa.nl`, regio EU)

## Dynamics 365 (CRM_Activaa)
- Web-API: `https://orgf897f431.api.crm4.dynamics.com/api/data/v9.2`
- Koppeling app→Dynamics: app-only (client credentials) via `DYNAMICS_*`-instellingen.
- **Klant-herleiding:** het portaal zoekt alle **Accounts waarvan `primarycontactid.emailaddress1` = het e-mailadres van de ingelogde gebruiker**. Die accounts (+ gegevens/taken) ziet de klant. Geen aparte toegangsadministratie.
- Belangrijke velden op Account: `sk_clientnummer` (cliëntnummer), `accountnumber` (KvK; gevuld = bedrijfsadres read-only), `sk_Groepsnaam`→`sk_name` (groep), `cr283_Manager` (relatiebeheerder), `sk_Accountant` (accountant).
- **Taken (entiteit `task`):**
  - Koppeling taak→klant via het eigen veld **"Cliënt" = `sk_client`** (lookup naar account/contact), **NIET** via standaard `regardingobjectid` (dat is vaak leeg). `api/taken` filtert op `sk_client` met `regardingobjectid` als terugval.
  - "Soort" = keuzelijst **`cr283_soortactiecategorie`** (formulierlabel "Soort actie"). Opties o.a.: `8006`=In afwachting reactie client, `8017`=SignNow, `8004`=Controleren.

## Frontend — Klantportaal (`src/portaal/KlantPortaal.jsx`)
- **Home**: openstaande taken (gefilterd op soort via Beheer→Taken), snellinks, mededelingen, nieuws.
  - Taken: soort-badge; upload-knop bij upload-link; **Akkoord geven** (groen, met bevestiging) en **Niet akkoord** (rood, verplicht tekstveld) bij soorten met "mag goedkeuren"; na reactie verdwijnt de taak en komt in het **inklapbare** blok "Akkoord gegeven".
  - Nieuws: per bericht **Markeer als gelezen**; gelezen berichten in een **ingeklapte** sectie (terug op ongelezen kan).
- **Mijn gegevens**: bedrijfs-/contactgegevens; wijzigen loopt via goedkeuringsproces (wijzigingsverzoeken).
- **Documenten**: SharePoint/OneDrive via Microsoft Graph **on-behalf-of** (MSAL). Toont `me/drive/sharedWithMe` + **doorklikbare mappen** (breadcrumb, `drives/{driveId}/items/{itemId}/children`). Graph past de echte permissies van de klant toe.
- **Veelgestelde vragen**: FAQ + AI-assistent (Copilot Studio) + Teams/WhatsApp.
- **Review geven**: sterren; 5★ → Google-review; <5★ → meldingsmail + Power Automate webhook.

## Frontend — Beheer (`src/beheer/BeheerPortaal.jsx`)
Tabs: **Uitstraling** (logo/favicon), **Content** (snellinks [inklapbaar, URL's afgekapt], mededelingen, FAQ), **Taken** (per soort: *Zichtbaar* + *Mag goedkeuren* [inklapbaar + zoek]; en **log** van klantreacties [zoekbaar]), **Reviews** (dashboard + uitnodigen), **Wijzigingsverzoeken** (goedkeuren/afwijzen → Dynamics), **Instellingen** (Webhooks [taak-afwijzing + review], Copilot/WhatsApp/Google/Teams-links, wijzigingsformulier-links).

## API (`/api`, Azure Functions)
Gedeeld in `api/_gedeeld/`: `identiteit.js` (token + `herleidAccounts` + `haalEmailUitPrincipal`), `instellingen.js` (blob `instellingen.json`), `graphObo.js` (OBO-uitwisseling), `wijzigingen.js`, `taakakkoorden.js` (blob `taak-akkoorden.json`), `nieuwsgelezen.js` (blob `nieuws-gelezen.json`), `reviewopslag.js`, `nieuws.js` (RSS activaa.nl), `mail.js` (Graph Mail.Send), `labels.js`, `content.js`, `media.js`.
Endpoints o.a.: `taken` (GET/PATCH: akkoord/niet-akkoord), `documenten` (GET, mapnavigatie), `nieuws`, `nieuws-gelezen` (GET/POST), `reviews` (POST), `wijzigingsverzoek`, `mijn-gegevens`, `instellingen`; beheer: `beheer-taaksoorten`, `beheer-taakakkoorden`, `beheer-wijzigingen`, `beheer-instellingen`, `beheer-content`, `beheer-klanten`, `beheer-tellingen`, enz. Routes beveiligd in `staticwebapp.config.json` (`/api/beheer-*` = rol `beheerder`; `/*` = authenticated).

Blob-opslag (container `portaalcontent`): `instellingen.json`, `taak-akkoorden.json` (beslissing akkoord/niet_akkoord + bericht), `nieuws-gelezen.json` (per e-mail), `wijzigingsverzoeken.json`, reviews.

## Configuratie (Application Settings / secrets)
Static Web App app-settings (Configuration): `DYNAMICS_TENANT_ID/CLIENT_ID/CLIENT_SECRET/RESOURCE_URL`, `DYNAMICS_TAAK_SOORT_VELD=cr283_soortactiecategorie`, `DYNAMICS_TAAK_KLANT_VELD` (standaard `sk_client`), `DYNAMICS_TAAK_UPLOADLINK_VELD`/`_VERLOOPDATUM_VELD` (optioneel), `AAD_TENANT_ID`/`AAD_CLIENT_ID`/`AAD_CLIENT_SECRET` (documenten-OBO), `GRAPH_MAIL_SENDER`, `STORAGE_CONNECTION_STRING`, `REVIEW_INFO_EMAIL`, optioneel `TAAK_AFWIJZING_WEBHOOK_URL`/`REVIEW_WEBHOOK_URL`, `PORTAL_URL`.
GitHub repo-secrets (build): `VITE_AAD_CLIENT_ID`, `VITE_AAD_TENANT_ID` (worden via `env:` in de workflow ingebakken door Vite), plus de SWA deploy-token.

**Documenten/SharePoint-registratie:** hergebruikt de bestaande app-registratie **"OfferteTool Activaa - login"** (`849f36ae-fe65-432f-99fb-4777738278cf`). Vereist op die registratie: SPA-redirect = portaal-URL, Expose an API `api://<clientid>/access_as_user`, gedelegeerde Graph `Files.Read` (+ evt. `Files.Read.All`/`Sites.Read.All`) met admin consent. **`VITE_AAD_CLIENT_ID`, `AAD_CLIENT_ID` en deze registratie moeten dezelfde client id zijn** (OBO vereist dat).

## Deploy & aandachtspunten
- Deploy = `git push` naar `main` → GitHub Actions (`.github/workflows/azure-static-web-apps-blue-tree-084d8b510.yml`).
- Frontend-variabelen (`VITE_*`) worden **tijdens de build** ingebakken; wijzig je ze, dan is een nieuwe build/push nodig.
- Portaal vereist login (Static Web App EasyAuth, AAD); daarnaast een aparte MSAL-popup voor documenten (OBO).
- Zonder `DYNAMICS_TAAK_SOORT_VELD` + ingeschakelde soorten in Beheer→Taken toont het portaal **geen** taken (uit voorzorg).
