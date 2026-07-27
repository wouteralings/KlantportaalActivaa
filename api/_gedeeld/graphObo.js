/**
 * On-Behalf-Of (OBO) flow: de frontend logt de gebruiker in via MSAL.js met de scope
 * "api://<AAD_CLIENT_ID>/access_as_user" (zie src/auth voor de frontend-kant) en stuurt
 * dat token mee als Authorization-header. Deze functie wisselt dat token bij Entra ID om
 * voor een Graph-token, MET de rechten van de ingelogde gebruiker zelf — dus Graph past
 * automatisch de echte SharePoint-permissies van die gebruiker toe.
 *
 * Benodigde Application Settings (dit is een NIEUWE, eigen App Registration —
 * niet dezelfde als de DYNAMICS_*-registratie):
 *   AAD_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET
 */

function haalGebruikersToken(req) {
  const header = req.headers["authorization"] || req.headers["Authorization"];
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

async function wisselVoorGraphToken(gebruikersToken, scope = "https://graph.microsoft.com/Files.Read offline_access") {
  const tenantId = process.env.AAD_TENANT_ID;
  const clientId = process.env.AAD_CLIENT_ID;
  const clientSecret = process.env.AAD_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MISSING_CONFIG");
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: gebruikersToken,
    scope,
    requested_token_use: "on_behalf_of",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const tekst = await res.text();
    const fout = new Error(`OBO-uitwisseling mislukt: ${tekst}`);
    fout.code = "OBO_MISLUKT";
    throw fout;
  }

  const data = await res.json();
  return data.access_token;
}

module.exports = { haalGebruikersToken, wisselVoorGraphToken };
