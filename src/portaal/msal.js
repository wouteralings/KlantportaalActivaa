import { PublicClientApplication } from "@azure/msal-browser";

// Deze twee komen uit een NIEUWE, eigen App Registration (zie eerdere uitleg in de chat) —
// niet dezelfde als de Dynamics-koppeling. Zet ze als Vite build-variabelen:
//   VITE_AAD_CLIENT_ID=...
//   VITE_AAD_TENANT_ID=...
export const AAD_CLIENT_ID = import.meta.env.VITE_AAD_CLIENT_ID;
export const AAD_TENANT_ID = import.meta.env.VITE_AAD_TENANT_ID;
export const API_SCOPE = `api://${AAD_CLIENT_ID}/access_as_user`;

const msalConfig = {
  auth: {
    clientId: AAD_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AAD_TENANT_ID}`,
    // Lege redirect-pagina i.p.v. de app-root: voorkomt dat de React-app in de popup
    // opnieuw laadt en de auth-hash wist (hash_empty_error). Registreer deze URL ook
    // als SPA-redirect-URI in de App Registration (bijv. https://mijn.activaa.nl/blank.html).
    redirectUri: `${window.location.origin}/blank.html`,
  },
  cache: { cacheLocation: "sessionStorage" },
};

let instance = null;

/** Eén gedeelde, lazy-geïnitialiseerde MSAL-instance voor de hele portaalsessie. */
export async function haalMsalInstance() {
  if (!instance) {
    instance = new PublicClientApplication(msalConfig);
    await instance.initialize();
  }
  return instance;
}

function vertaalMsalFout(err) {
  if (err?.errorCode === "user_cancelled" || err?.errorCode === "popup_window_error") {
    return new Error(
      "Het inlogvenster is gesloten voordat het inloggen was afgerond. Controleer of pop-ups " +
      "voor dit portaal zijn toegestaan in de browser, en probeer het opnieuw."
    );
  }
  if (err?.errorCode === "interaction_in_progress") {
    return new Error(
      "Er loopt al een inlogpoging. Wacht dit even af (of ververs de pagina als dit blijft " +
      "hangen) en probeer het daarna opnieuw."
    );
  }
  return null;
}

// Zorgt dat er nooit twee interactieve MSAL-aanvragen tegelijk starten (bijv. door dubbel
// klikken) — dat is precies wat 'interaction_in_progress' veroorzaakt. Een tweede aanroep
// terwijl de eerste nog loopt wacht gewoon op diezelfde lopende aanvraag.
let lopendeAanvraag = null;

/** Haalt (indien nodig via popup-login) een Graph-scope-token op voor de OBO-uitwisseling. */
export async function haalApiToken() {
  if (lopendeAanvraag) return lopendeAanvraag;

  lopendeAanvraag = (async () => {
    const client = await haalMsalInstance();
    let account = client.getAllAccounts()[0];

    try {
      if (!account) {
        const result = await client.loginPopup({ scopes: [API_SCOPE] });
        account = result.account;
      }

      try {
        const result = await client.acquireTokenSilent({ scopes: [API_SCOPE], account });
        return result.accessToken;
      } catch {
        const result = await client.acquireTokenPopup({ scopes: [API_SCOPE], account });
        return result.accessToken;
      }
    } catch (err) {
      const nette = vertaalMsalFout(err);
      if (nette) {
        nette.code = "INLOG_PROBLEEM";
        throw nette;
      }
      throw err;
    }
  })();

  try {
    return await lopendeAanvraag;
  } finally {
    lopendeAanvraag = null;
  }
}
