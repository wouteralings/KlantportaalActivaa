/**
 * App-only Microsoft Graph-token (client credentials) — "1 kantoor login op de achtergrond".
 * Anders dan graphObo.js (dat het token van de ingelogde gebruiker omwisselt en diens EIGEN
 * SharePoint-rechten toepast) draait dit op de identiteit van de portaal-app zelf. Daarmee bepaalt
 * het portaal — niet de klant — wie welke documenten mag; de klant heeft zelf geen SharePoint-
 * toegang meer nodig.
 *
 * Vereist dezelfde App Registration als graphObo (AAD_*), plus een Graph application-permissie
 * met een site-grant (Sites.Selected op de Klanten-site). Zie het projectdoc
 * "Entra — Sites.Selected voor app-only SharePoint (IT-stappen)".
 *
 * App Settings: AAD_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET.
 */
let cache = { token: null, verlooptOp: 0 };

async function haalGraphAppToken() {
  const nu = Date.now();
  if (cache.token && cache.verlooptOp > nu + 60_000) return cache.token;

  const tenantId = process.env.AAD_TENANT_ID;
  const clientId = process.env.AAD_CLIENT_ID;
  const clientSecret = process.env.AAD_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("MISSING_CONFIG");

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) {
    const fout = new Error(`App-only Graph-token ophalen mislukt (${res.status}): ${await res.text()}`);
    fout.code = "GRAPH_APP_TOKEN_MISLUKT";
    throw fout;
  }
  const data = await res.json();
  cache = { token: data.access_token, verlooptOp: nu + (Number(data.expires_in) || 3600) * 1000 };
  return cache.token;
}

module.exports = { haalGraphAppToken };
