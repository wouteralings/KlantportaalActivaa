const { metOffertesRecht } = require("../_gedeeld/offertesRecht");
/**
 * Haalt een app-only toegangstoken op bij Entra ID (client credentials flow),
 * met de App Registration die rechten heeft op de Dynamics 365 Web API.
 * Vereist Application Settings (Omgevingsvariabelen) in Azure:
 *   DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET, DYNAMICS_RESOURCE_URL
 */
async function haalDynamicsToken() {
  const tenantId = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const clientSecret = process.env.DYNAMICS_CLIENT_SECRET;
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!tenantId || !clientId || !clientSecret || !resource) {
    throw new Error("MISSING_CONFIG");
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: `${resource}/.default`,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const tekst = await res.text();
    throw new Error(`Token ophalen mislukt (${res.status}): ${tekst}`);
  }

  const data = await res.json();
  return data.access_token;
}

const handler = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = {
      status: 501,
      body: {
        error: "Dynamics-koppeling is nog niet geconfigureerd. Zie README voor de benodigde Application Settings.",
      },
    };
    return;
  }

  try {
    const token = await haalDynamicsToken();

    const zoekterm = (req.query.zoek || "").trim();

    if (zoekterm.length > 100) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "Zoekterm te lang." },
      };
      return;
    }

    // Enkele aanhalingstekens moeten verdubbeld worden binnen een OData-tekstwaarde.
    const veilig = zoekterm.replace(/'/g, "''");

    let filterDeel = "";
    if (veilig) {
      filterDeel =
        `&$filter=contains(name,'${veilig}') or contains(address1_city,'${veilig}') or ` +
        `contains(address1_postalcode,'${veilig}') or contains(sk_Groepsnaam/sk_name,'${veilig}')`;
    }

    // LET OP: de velden hieronder zijn gebaseerd op wat is opgegeven voor deze omgeving.
    // Klopt een veldnaam niet, pas 'm hieronder aan in zowel de $select/$filter/$expand als
    // de mapping verderop. We halen er 11 op (i.p.v. 10) om te kunnen zien of er nog meer zijn.
    const query =
      `${resource}/api/data/v9.2/accounts` +
      `?$select=accountid,name,address1_line1,address1_postalcode,address1_city,` +
      `cr283_huisnummer,cr283_huisnummertoevoeging,emailaddress1` +
      `&$expand=primarycontactid($select=fullname,emailaddress1),sk_Groepsnaam` +
      filterDeel +
      `&$orderby=name asc` +
      `&$top=11`;

    const dynamicsRes = await fetch(query, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
    });

    if (!dynamicsRes.ok) {
      const tekst = await dynamicsRes.text();
      context.log.error("Dynamics-fout:", tekst);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: { error: "Ophalen bij Dynamics is mislukt." },
      };
      return;
    }

    const data = await dynamicsRes.json();
    const klanten = (data.value || []).map((rij) => {
      const groep = rij.sk_Groepsnaam;
      const klantgroep = groep?.groepsnaam || groep?.sk_name || groep?.name || groep?.cr283_naam || "";

      return {
        id: rij.accountid,
        naam: rij.name || "(naam onbekend)",
        straat: rij.address1_line1 || "",
        huisnummer: rij.cr283_huisnummer || "",
        huisnummertoevoeging: rij.cr283_huisnummertoevoeging || "",
        postcode: rij.address1_postalcode || "",
        plaats: rij.address1_city || "",
        contact: rij.primarycontactid?.fullname || "",
        email: rij.primarycontactid?.emailaddress1 || rij.emailaddress1 || "",
        segment: klantgroep,
      };
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: klanten };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "Dynamics-koppeling is nog niet volledig geconfigureerd." },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Er ging iets mis. Probeer het later opnieuw." },
    };
  }
};

// Alleen bereikbaar voor medewerkers met het offertes-recht (en voor beheerders) — zie
// api/_gedeeld/offertesRecht.js. Het verbergen van de tab in het portaal is cosmetisch;
// dit is de plek waar het daadwerkelijk wordt tegengehouden.
module.exports = metOffertesRecht(handler);
