/**
 * /api/mw-uren-weekstaten — de wekelijkse goedkeuring van weekstaten door de LEIDINGGEVENDE.
 * De medewerker dient zijn weekstaat in (via /api/mw-uren-boekingen actie=indienen); hier ziet de
 * leidinggevende welke ingediende weekstaten nog op zijn goedkeuring wachten, en keurt hij een hele
 * week in één keer goed of af.
 *
 *   - GET  [?scope=alle]                                   → { weekstaten, aantalOpen, mijnNaam, magAlles }
 *   - POST { actie:"goedkeuren"|"afkeuren", medewerkerEmail, weekStart } → hele week goedkeuren/afkeuren
 *
 * Scoping: een weekstaat verschijnt bij de leidinggevende van de medewerker (uit het uurtarief).
 * Een beheerder kan met ?scope=alle alles zien. Route: medewerker/beheerder.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const uren = require("../_gedeeld/urenDataverse");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

async function mijnNaam(req, email) {
  let naam = haalNaamUitPrincipal(req) || "";
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (resource && email) {
    try {
      const token = await haalDynamicsToken();
      const veilig = String(email).replace(/'/g, "''");
      const res = await fetch(`${resource}/api/data/v9.2/systemusers?$select=fullname&$filter=internalemailaddress eq '${encodeURIComponent(veilig)}' and isdisabled eq false&$top=1`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
      if (res.ok) { const d = await res.json(); if (d.value && d.value[0] && d.value[0].fullname) naam = d.value[0].fullname; }
    } catch { /* val terug */ }
  }
  return naam;
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });
  const email = haalEmailUitPrincipal(req);
  if (!email) return json(context, 401, { error: "Geen identiteit." });
  const isBeheerder = rollen.includes("beheerder");
  const methode = (req.method || "GET").toUpperCase();

  try {
    const naam = await mijnNaam(req, email);

    if (methode === "GET") {
      const wilAlles = (req.query && req.query.scope) === "alle" && isBeheerder;
      const weekstaten = await uren.weekstatenVoorLeidinggevende({ leidinggevendeNaam: naam, alle: wilAlles });
      return json(context, 200, { weekstaten, aantalOpen: weekstaten.length, mijnNaam: naam, magAlles: isBeheerder, scope: wilAlles ? "alle" : "mijn" });
    }

    if (methode === "POST" || methode === "PATCH") {
      const b = req.body || {};
      if (!b.medewerkerEmail || !b.weekStart) return json(context, 400, { error: "Geef medewerkerEmail en weekStart mee." });
      if (b.actie === "afkeuren") {
        const r = await uren.keurWeekAf(b.medewerkerEmail, b.weekStart);
        return json(context, 200, { ok: true, afgekeurd: r.aantal });
      }
      // Standaard: goedkeuren.
      const r = await uren.keurWeekGoed(b.medewerkerEmail, b.weekStart, naam || email);
      await logGebeurtenis({ door: email, actie: "weekgoedkeuring", tekst: `Weekstaat ${b.weekStart} van ${b.medewerkerEmail} goedgekeurd (${r.aantal} boekingen).` }).catch(() => {});
      return json(context, 200, { ok: true, goedgekeurd: r.aantal });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de weekstaten niet verwerken.", detail: String(err.message || err) });
  }
};
