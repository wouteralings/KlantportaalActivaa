/**
 * Verstuurt e-mail via Microsoft Graph met de bestaande app-registratie (client credentials).
 *
 * Vereist:
 *  - Dezelfde app-instellingen als de Dynamics-koppeling: DYNAMICS_TENANT_ID,
 *    DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET.
 *  - Op de app-registratie de APPLICATION-permission "Mail.Send" (Microsoft Graph) met
 *    admin-consent.
 *  - GRAPH_MAIL_SENDER: het postvak waarvandaan verstuurd wordt (bijv. automatisering@activaa.nl).
 *    Dit moet een bestaand, gelicentieerd postvak in de tenant zijn.
 */

async function haalGraphToken() {
  const tenantId = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const clientSecret = process.env.DYNAMICS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MISSING_CONFIG");
  }

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
    throw new Error(`Graph-token ophalen mislukt (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Verstuurt een platte-tekst e-mail naar één of meer ontvangers.
 * Dubbele/lege adressen worden er automatisch uitgefilterd.
 */
async function verstuurMail({ ontvangers, onderwerp, tekst }) {
  const afzender = process.env.GRAPH_MAIL_SENDER;
  if (!afzender) throw new Error("MISSING_MAIL_SENDER");

  // Normaliseer, filter lege waarden en ontdubbel op (kleine letters) e-mailadres.
  const gezien = new Set();
  const lijst = (Array.isArray(ontvangers) ? ontvangers : [ontvangers])
    .map((e) => (e || "").trim())
    .filter((e) => {
      if (!e) return false;
      const sleutel = e.toLowerCase();
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    });

  if (lijst.length === 0) throw new Error("GEEN_ONTVANGERS");

  const token = await haalGraphToken();

  const bericht = {
    message: {
      subject: onderwerp,
      body: { contentType: "Text", content: tekst },
      toRecipients: lijst.map((adres) => ({ emailAddress: { address: adres } })),
    },
    saveToSentItems: true,
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(afzender)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bericht),
    }
  );

  if (!res.ok) {
    throw new Error(`Versturen e-mail mislukt (${res.status}): ${await res.text()}`);
  }

  return { ontvangers: lijst };
}

module.exports = { verstuurMail, haalGraphToken };
