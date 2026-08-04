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
 *
 * `afzender` is optioneel en overschrijft, indien meegegeven, het standaard postvak
 * (Application Setting GRAPH_MAIL_SENDER) — bijv. het per-module instelbare afzenderadres van de
 * Contracten-verloopherinnering (zie ContractenMailInstellingen.jsx/contractenReminders.js). Moet,
 * net als de standaard afzender, een bestaand gelicentieerd postvak in de tenant zijn.
 */
async function verstuurMail({ ontvangers, onderwerp, tekst, afzender }) {
  const vanAdres = (afzender || "").trim() || process.env.GRAPH_MAIL_SENDER;
  if (!vanAdres) throw new Error("MISSING_MAIL_SENDER");

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
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(vanAdres)}/sendMail`,
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

  return { ontvangers: lijst, van: vanAdres };
}

/**
 * Verstuurt een HTML-e-mail met eventuele bijlagen (bijv. een factuur-PDF) naar één ontvanger,
 * met optioneel een cc-lijst. Losse functie naast `verstuurMail` (in plaats van 'm uit te
 * breiden) zodat bestaande aanroepen van `verstuurMail` (platte tekst, geen bijlage) ongewijzigd
 * blijven werken.
 *
 * bijlagen: array van { naam, contentType, inhoud } — `inhoud` is een Buffer (bijv. het
 * resultaat van `genereerFactuurPdf`).
 */
async function verstuurMailMetBijlage({ naar, cc, onderwerp, html, bijlagen }) {
  const afzender = process.env.GRAPH_MAIL_SENDER;
  if (!afzender) throw new Error("MISSING_MAIL_SENDER");

  const ontvanger = String(naar || "").trim();
  if (!ontvanger) throw new Error("GEEN_ONTVANGERS");

  const ccLijst = (Array.isArray(cc) ? cc : [])
    .map((e) => String(e || "").trim())
    .filter((e) => e && e.toLowerCase() !== ontvanger.toLowerCase());

  const token = await haalGraphToken();

  const bericht = {
    message: {
      subject: onderwerp,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: ontvanger } }],
    },
    saveToSentItems: true,
  };

  if (ccLijst.length > 0) {
    bericht.message.ccRecipients = ccLijst.map((adres) => ({ emailAddress: { address: adres } }));
  }

  if (Array.isArray(bijlagen) && bijlagen.length > 0) {
    bericht.message.attachments = bijlagen.map((b) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: b.naam,
      contentType: b.contentType || "application/octet-stream",
      contentBytes: Buffer.from(b.inhoud).toString("base64"),
    }));
  }

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

  return { verzonden: true, van: afzender };
}

module.exports = { verstuurMail, verstuurMailMetBijlage, haalGraphToken };
