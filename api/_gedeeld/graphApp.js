/**
 * App-only (client credentials) Microsoft Graph-token. Anders dan de OBO-flow (graphObo.js),
 * die met de rechten van de ingelogde klant werkt, gebruikt dit de rechten van de APP zelf.
 * Zo kan de app documenten in de SharePoint-map van een klant zetten/lezen ook als die klant
 * (bijv. een gastgebruiker) zelf geen SharePoint-rechten heeft.
 *
 * LET OP: de app kan hiermee potentieel veel in SharePoint. De toegangscontrole moet daarom
 * volledig in de code gebeuren: leid de doelmap altijd af uit de identiteit van de ingelogde
 * klant (via Dynamics), nooit uit iets wat de browser meestuurt.
 *
 * Vereist een Microsoft Graph APPLICATIE-permissie op de app-registratie (met admin-consent),
 * bijv. Sites.Selected (aanbevolen, beperkt tot gekozen sites) of Sites.ReadWrite.All /
 * Files.ReadWrite.All. Gebruikt dezelfde app-registratie/secret als de OBO-flow (AAD_*).
 */
let cache = { token: null, verlooptOp: 0 };

async function haalAppGraphToken() {
  const nu = Date.now();
  if (cache.token && nu < cache.verlooptOp - 60000) return cache.token;

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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const tekst = await res.text();
    const fout = new Error(`App-Graph-token ophalen mislukt: ${tekst}`);
    fout.code = "APP_TOKEN_MISLUKT";
    throw fout;
  }
  const data = await res.json();
  cache = { token: data.access_token, verlooptOp: nu + (Number(data.expires_in) || 3600) * 1000 };
  return cache.token;
}

module.exports = { haalAppGraphToken };
