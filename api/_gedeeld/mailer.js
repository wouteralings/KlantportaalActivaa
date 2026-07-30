/**
 * E-mail versturen via Microsoft Graph (app-only, dezelfde app-registratie als de SharePoint-koppeling).
 *
 * CONFIG-GATED: verstuurt alleen als de Application Setting AANLEVER_MAIL_AFZENDER is gezet (het
 * mailadres/UPN van de postbus die als afzender dient, bv. no-reply@activaa.nl). Is die niet gezet,
 * dan doet dit niets en faalt het zacht ({ verstuurd: false, reden: "niet geconfigureerd" }) — het
 * onderliggende proces (bv. een aanlever-verzoek klaarzetten) gaat gewoon door.
 *
 * VEREIST in Entra: de app-registratie heeft de application-permission Microsoft Graph → Mail.Send
 * (met admin-consent). Zonder die toekenning geeft Graph een 403 en komt dat als reden terug.
 */
const { haalGraphAppToken } = require("./graphApp");

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * Verstuurt één e-mail. `naar` is een adres of array van adressen. Geeft altijd een object terug
 * (nooit een throw): { verstuurd: bool, reden?: string }.
 */
async function verstuurMail({ naar, onderwerp, tekst, html }) {
  const afzender = process.env.AANLEVER_MAIL_AFZENDER;
  if (!afzender) return { verstuurd: false, reden: "niet geconfigureerd" };

  const ontvangers = (Array.isArray(naar) ? naar : [naar])
    .map((a) => String(a || "").trim())
    .filter(Boolean)
    .map((a) => ({ emailAddress: { address: a } }));
  if (!ontvangers.length) return { verstuurd: false, reden: "geen ontvanger" };

  try {
    const token = await haalGraphAppToken();
    const body = {
      message: {
        subject: String(onderwerp || "").slice(0, 255),
        body: { contentType: html ? "HTML" : "Text", content: html || tekst || "" },
        toRecipients: ontvangers,
      },
      saveToSentItems: true,
    };
    const res = await fetch(`${GRAPH}/users/${encodeURIComponent(afzender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 202) return { verstuurd: true };
    const detail = await res.text().catch(() => "");
    return { verstuurd: false, reden: `Graph ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}` };
  } catch (err) {
    return { verstuurd: false, reden: String(err && err.message ? err.message : err) };
  }
}

/** Of e-mailen überhaupt is ingericht (afzender-postbus ingesteld). */
function mailIngericht() {
  return !!process.env.AANLEVER_MAIL_AFZENDER;
}

module.exports = { verstuurMail, mailIngericht };
