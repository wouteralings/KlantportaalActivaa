/**
 * /api/beheer-verlof-saldo — verlofsaldo-overzicht per medewerker + handmatige correcties.
 *
 *   - GET                                            → { medewerkers: [{email, naam, saldo}] }
 *   - GET ?email=...                                 → { email, naam, saldo } (incl. correctieHistorie/log)
 *   - POST { email, uren, toelichting }               → correctie toevoegen (verplichte toelichting, wordt gelogd)
 *
 * De correctie is een append-only logboek (zie verlofCorrectieStore.js): elke correctie blijft
 * zichtbaar met wie hem invoerde, wanneer en met welke toelichting — er is bewust geen
 * bewerk/verwijder-functie (Wouter, 03-08-2026: "we kunnen zien wie dat heeft ingevoerd (log)").
 * Beheerder-only (route in staticwebapp.config.json).
 */
const { haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");
const verlof = require("../_gedeeld/verlofDataverse");
const verlofCorrectieStore = require("../_gedeeld/verlofCorrectieStore");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) return json(context, 403, { error: "Alleen beheerders hebben hier toegang toe." });
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const enkelEmail = req.query && req.query.email;
      if (enkelEmail) {
        const saldo = await verlof.berekenSaldo(enkelEmail);
        return json(context, 200, { email: enkelEmail, saldo });
      }
      const tarieven = (await uren.lijstTarieven()).filter((t) => t.actief);
      const medewerkers = [];
      for (const t of tarieven) {
        const saldo = await verlof.berekenSaldo(t.medewerker_email);
        medewerkers.push({ email: t.medewerker_email, naam: t.medewerker_naam || t.medewerker_email, saldo });
      }
      medewerkers.sort((a, b) => (a.naam || "").localeCompare(b.naam || ""));
      return json(context, 200, { medewerkers });
    }

    if (methode === "POST") {
      const b = req.body || {};
      if (!b.email) return json(context, 400, { error: "Geef een medewerker (email) mee." });
      const door = haalNaamUitPrincipal(req) || haalEmailUitPrincipal(req) || "onbekend";
      const regel = await verlofCorrectieStore.voegCorrectieToe(b.email, { uren: b.uren, toelichting: b.toelichting }, door);
      const saldo = await verlof.berekenSaldo(b.email);
      return json(context, 200, { ok: true, correctie: regel, saldo });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    if (String(err.message || "").startsWith("VALIDATIE")) return json(context, 400, { error: String(err.message).replace(/^VALIDATIE:\s*/, "") });
    context.log.error(err);
    return json(context, 500, { error: "Kon het verlofsaldo niet verwerken.", detail: String(err.message || err) });
  }
};
