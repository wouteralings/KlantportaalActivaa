const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalGelezenVoorEmail, markeerGelezen, verwijderGelezen } = require("../_gedeeld/nieuwsgelezen");

/**
 * Bijhouden welke nieuws-/blogberichten de ingelogde klant heeft gelezen.
 *
 * GET   → { gelezen: ["url", …] } voor de ingelogde gebruiker.
 * POST  body { url, gelezen?: true }  → markeer als gelezen (of, met gelezen:false, weer ongelezen).
 */
module.exports = async function (context, req) {
  const email = haalEmailUitPrincipal(req);
  if (!email) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen identiteit." } };
    return;
  }

  try {
    if (req.method === "GET") {
      const gelezen = await haalGelezenVoorEmail(email).catch(() => []);
      context.res = { headers: { "Content-Type": "application/json" }, body: { gelezen } };
      return;
    }

    if (req.method === "POST") {
      const url = (req.body?.url || "").toString().trim();
      if (!url) {
        context.res = { status: 400, body: { error: "Geef de URL van het bericht mee." } };
        return;
      }
      const gelezen =
        req.body?.gelezen === false
          ? await verwijderGelezen(email, url)
          : await markeerGelezen(email, url);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, gelezen } };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het bijwerken van de leesstatus.", detail: String(err) },
    };
  }
};
