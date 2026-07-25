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
    redirectUri: window.location.origin,
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

/** Haalt (indien nodig via popup-login) een Graph-scope-token op voor de OBO-uitwisseling. */
export async function haalApiToken() {
  const client = await haalMsalInstance();
  let account = client.getAllAccounts()[0];

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
}
