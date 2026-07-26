# Klantportaal Activaa — overzicht & status

Dit document beschrijft wat de tool doet, hoe de koppeling werkt, en welke configuratiestappen nog openstaan. Het is een momentopname; de code staat in dezelfde repository.

## In het kort

Een klantportaal (Azure Static Web App + Azure Functions) waarin klanten van Activaa met hun Microsoft-account (gastgebruiker) inloggen en hun eigen gegevens, documenten, taken, nieuws en FAQ zien. Daarnaast een beveiligde beheeromgeving (`/beheer`) voor Activaa-medewerkers met de rol `beheerder`.

## Hoe de koppeling werkt

- Een klant logt in met zijn Microsoft-account (gast in de Activaa-tenant).
- Het portaal zoekt in Dynamics alle **Accounts waarvan de "Primair contactpersoon" hetzelfde e-mailadres heeft** als de ingelogde gebruiker. Díe accounts (en hun gegevens/taken) ziet de klant. Er is geen aparte toegangsadministratie nodig.
- Per account worden opgehaald: cliëntnummer (`sk_clientnummer`), groepsnaam (`sk_Groepsnaam.sk_name`), bezoekadres, de contactpersoon (naam, aanhef, e-mail, mobiel, geboortedatum, privé-adres), en de relatiebeheerder (veld "Manager", `cr283_Manager`) + accountant (`sk_Accountant`).
- Het KvK-nummer staat in `accountnumber`; is dat gevuld, dan is het bedrijfsadres KvK-gesynchroniseerd (read-only).

## Klantportaal — tabbladen

- **Home** — openstaande taken (af te vinken), snellinks (knoppen) en mededelingen.
- **Mijn gegevens** — zoekbare, compacte lijst van gekoppelde klanten. Openklikken toont: bedrijfsgegevens (bezoekadres; read-only mét KvK-nummer, anders wijzigbaar), contactpersoon (wijzigbaar behalve "Functie rol"), en relatiebeheerder + accountant. Wijzigen gaat per sectie via een eigen knop en loopt via het goedkeuringsproces.
- **Documenten** — SharePoint-bestanden die met de klant zijn gedeeld (via Microsoft Graph, on-behalf-of). *Vereist nog configuratie — zie onderaan.*
- **Veelgestelde vragen** — FAQ met zoekfunctie, plus de AI-assistent (Copilot Studio) en knoppen voor Teams/WhatsApp.
- **Review geven** — sterbeoordeling. Bij 5 sterren doorsturen naar Google; bij minder een interne e-mailmelding. Elke review wordt vastgelegd.

## Beheeromgeving (`/beheer`) — tabbladen

- **Uitstraling** — logo en favicon uploaden.
- **Content** — snellinks (met rangschikken), mededelingen, en FAQ-vragen (toevoegen, rangschikken, zoeken, verwijderen). Alles optioneel te richten op klantgroepen.
- **Reviews** — dashboard met alle klantrelaties: zoeken/filteren (op relatiebeheerder, groep, reviewstatus), zien wie een review gaf en wanneer, en klanten uitnodigen voor een review per e-mail.
- **Wijzigingsverzoeken** — inkomende wijzigingen van klanten goedkeuren of afwijzen. Bij goedkeuring wordt het automatisch in Dynamics verwerkt (contactpersoon en/of bedrijfsadres). Met zoekfunctie, de beoordelaar wordt vastgelegd, en een "Opnieuw verwerken"-knop als verwerken eerder mislukte.
- **Instellingen** — AI-assistent-insluitlink (Copilot Studio), WhatsApp-nummer, Google-reviewlink, Teams-chatlink, en de (optionele) wijzigingsformulier-links.

## Wat werkt (na deploy)

- Inloggen en koppeling via primair contactpersoon.
- Mijn gegevens, taken, nieuws, snellinks, mededelingen, FAQ (met zoeken).
- Beheer: logo/favicon, content, reviewdashboard, wijzigingsverzoeken-overzicht, instellingen.
- Reviews vastleggen; 5-sterren doorsturen naar Google (mits reviewlink ingevuld).
- Wijzigingsverzoeken indienen én automatisch verwerken (app-gebruiker heeft schrijfrechten op Contact/Account via de rol "Activaa CRM – Bewerken").
- AI-assistent (Linda) op de FAQ-pagina, lazy geladen zodat het portaal snel blijft.

## Openstaande configuratie (geen code meer nodig)

1. **Mail.Send-beheerdersconsent** — op de app-registratie `klantportaal-dynamics` de Microsoft Graph **application permission `Mail.Send`** verlenen (admin consent), plus app-instelling `GRAPH_MAIL_SENDER` (bv. `automatisering@activaa.nl`). Nodig voor: review-meldingsmails, review-uitnodigingen, en de meldingsmail bij een nieuw wijzigingsverzoek. (De verzoeken/reviews zelf werken ook zonder mail; alleen de e-mails niet.)

2. **SharePoint / Documenten** — de code is compleet (Graph `me/drive/sharedWithMe`, on-behalf-of). Nog nodig: een eigen app-registratie met een `access_as_user`-scope en gedelegeerde Graph-permissie `Files.Read` (+ admin consent), SPA-redirect-URI's, de app-instellingen `AAD_TENANT_ID` / `AAD_CLIENT_ID` / `AAD_CLIENT_SECRET`, en de build-variabelen `VITE_AAD_CLIENT_ID` / `VITE_AAD_TENANT_ID` in de GitHub Actions-workflow.

3. **Optioneel** — `PORTAL_URL` (voor de link in review-uitnodigingen), en de Google-reviewlink invullen in Beheer voor de 5-sterrenflow.

## Handige app-instellingen (overschrijfbaar)

- `DYNAMICS_KVK_VELD` (standaard `accountnumber`), `DYNAMICS_CLIENTNUMMER_VELD` (`sk_clientnummer`), `DYNAMICS_RELATIEBEHEERDER_NAV` (`cr283_Manager`), `DYNAMICS_ACCOUNTANT_NAV` (`sk_Accountant`), `DYNAMICS_GROEPSNAAM_NAV` (`sk_Groepsnaam`), `REVIEW_INFO_EMAIL` (`info@activaa.nl`).
