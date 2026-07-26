const { verstuurMail } = require("../_gedeeld/mail");
const { registreerUitnodigingen } = require("../_gedeeld/reviewopslag");

const MAX_PER_KEER = Number(process.env.REVIEW_UITNODIGING_MAX || 300);

// Basis-URL van het klantportaal voor de uitnodigingslink. Stel PORTAL_URL in als App Setting;
// anders leiden we 'm af uit de request-headers.
function portaalUrl(req) {
  if (process.env.PORTAL_URL) return process.env.PORTAL_URL.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  return host ? `https://${host}` : "";
}

module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const klanten = Array.isArray(req.body?.klanten) ? req.body.klanten : [];
  const geldig = klanten.filter((k) => k && /.+@.+\..+/.test(k.contactEmail || ""));

  if (geldig.length === 0) {
    context.res = { status: 400, body: { error: "Geen klanten met een geldig e-mailadres meegegeven." } };
    return;
  }

  const teVerwerken = geldig.slice(0, MAX_PER_KEER);
  const basis = portaalUrl(req);

  const gelukt = [];
  const mislukt = [];

  for (const klant of teVerwerken) {
    const naam = (klant.contactNaam || "").trim() || "beste klant";
    const onderwerp = "We horen graag je mening — Activaa Klantportaal";
    const tekst =
      `Beste ${naam},\n\n` +
      `We zijn benieuwd naar je ervaring met Activaa. Zou je een moment willen nemen om een korte ` +
      `review te geven? Dat kan in je klantportaal:\n\n` +
      `${basis || "(portaal-URL)"}\n\n` +
      `Log in met je Microsoft-account en ga naar "Review geven".\n\n` +
      `Alvast hartelijk dank!\n\nMet vriendelijke groet,\nActivaa`;

    try {
      await verstuurMail({ ontvangers: [klant.contactEmail], onderwerp, tekst });
      gelukt.push(klant.accountId);
    } catch (err) {
      context.log.error(`Uitnodiging mislukt voor ${klant.contactEmail}:`, err);
      mislukt.push({ accountId: klant.accountId, email: klant.contactEmail, reden: String(err) });
    }
  }

  // Alleen de succesvol verzonden uitnodigingen registreren.
  try {
    if (gelukt.length > 0) await registreerUitnodigingen(gelukt);
  } catch (err) {
    context.log.error("Registreren uitnodigingen mislukt:", err);
  }

  context.res = {
    headers: { "Content-Type": "application/json" },
    body: {
      verzonden: gelukt.length,
      mislukt: mislukt.length,
      overgeslagen: geldig.length - teVerwerken.length,
      details: mislukt,
    },
  };
};
