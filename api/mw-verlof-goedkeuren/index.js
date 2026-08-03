/**
 * /api/mw-verlof-goedkeuren — goedkeuring van verlofaanvragen door de LEIDINGGEVENDE.
 * Toont de aanvragen ('aangevraagd') die op mijn goedkeuring wachten (op basis van 'leidinggevende'
 * per medewerker, zoals ingesteld bij Beheer → Uren). Dit IS de goedkeuring van het verlof zelf —
 * er is geen aparte, tweede weekstaat-goedkeuring nodig; de goedgekeurde dagen tellen meteen mee in
 * het verlofsaldo en het vakantieoverzicht, en verschijnen (vergrendeld) in de weekstaat van de
 * medewerker zodra die de betreffende week indient.
 *
 *   - GET  [?scope=alle]                                    → { aanvragen, aantalOpen, mijnNaam, magAlles }
 *   - POST { actie:"goedkeuren"|"afwijzen", id, reden? }     → één aanvraag goedkeuren/afwijzen
 *
 * Afwijzen vereist een reden (verplicht). Scoping: een aanvraag verschijnt bij de leidinggevende
 * van de medewerker (uit het uurtarief). Een beheerder kan met ?scope=alle alles zien.
 * Route: medewerker/beheerder.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const verlof = require("../_gedeeld/verlofDataverse");

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
      const aanvragen = await verlof.aanvragenVoorLeidinggevende({ leidinggevendeNaam: naam, alle: wilAlles });
      return json(context, 200, { aanvragen, aantalOpen: aanvragen.length, mijnNaam: naam, magAlles: isBeheerder, scope: wilAlles ? "alle" : "mijn" });
    }

    if (methode === "POST" || methode === "PATCH") {
      const b = req.body || {};
      if (!b.id) return json(context, 400, { error: "Geef een id mee." });

      if (b.actie === "afwijzen") {
        if (!b.reden || !String(b.reden).trim()) return json(context, 400, { error: "Geef een reden voor de afwijzing." });
        const r = await verlof.keurAanvraagAf(b.id, naam || email, b.reden);
        if (r.fout === "NIET_GEVONDEN") return json(context, 404, { error: "Aanvraag niet gevonden." });
        if (r.fout === "AL_AFGEHANDELD") return json(context, 409, { error: "Deze aanvraag is al afgehandeld." });
        await logGebeurtenis({ door: email, actie: "verlofafwijzen", tekst: `Verlofaanvraag ${b.id} afgewezen (${b.reden}).` }).catch(() => {});
        return json(context, 200, { ok: true });
      }

      // Standaard: goedkeuren.
      const r = await verlof.keurAanvraagGoed(b.id, naam || email);
      if (r.fout === "NIET_GEVONDEN") return json(context, 404, { error: "Aanvraag niet gevonden." });
      if (r.fout === "AL_AFGEHANDELD") return json(context, 409, { error: "Deze aanvraag is al afgehandeld." });
      await logGebeurtenis({ door: email, actie: "verlofgoedkeuring", tekst: `Verlofaanvraag ${b.id} goedgekeurd.` }).catch(() => {});
      return json(context, 200, { ok: true });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de verlofaanvragen niet verwerken.", detail: String(err.message || err) });
  }
};
