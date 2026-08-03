/**
 * /api/mw-verlof-aanvraag — verlof aanvragen (medewerker) + eigen verlofsaldo.
 *
 *   - GET                                    → { aanvragen, saldo, verloftypen }
 *   - POST { verloftype, startdatum, einddatum, toelichting? } → nieuwe aanvraag (status 'aangevraagd')
 *   - DELETE ?id=  (of body { id })           → eigen, nog niet afgehandelde aanvraag intrekken
 *
 * Het aantal uren wordt server-side berekend uit het eigen werkrooster (vasteUrenStore) — de
 * medewerker geeft alleen de periode + het verloftype op. Goedkeuring gebeurt door de
 * leidinggevende via /api/mw-verlof-goedkeuren; "niets telt vóór goedkeuring" — pas een
 * goedgekeurde aanvraag telt mee in het saldo (opgenomen) en het vakantieoverzicht.
 * Route beveiligd via staticwebapp.config.json (medewerker/beheerder).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");
const verlof = require("../_gedeeld/verlofDataverse");
const verlofInstellingen = require("../_gedeeld/verlofInstellingen");

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
  if (!email) return json(context, 401, { error: "Kon geen e-mailadres uit de ingelogde gebruiker halen." });
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const [aanvragen, saldo, verloftypen] = await Promise.all([
        verlof.aanvragenVanMedewerker(email),
        verlof.berekenSaldo(email),
        verlofInstellingen.haalActieveVerloftypen(),
      ]);
      return json(context, 200, { aanvragen, saldo, verloftypen });
    }

    if (methode === "POST") {
      const b = req.body || {};
      if (!b.verloftype || !(await verlofInstellingen.magSleutel(b.verloftype))) return json(context, 400, { error: "Kies een geldig verloftype." });
      if (!b.startdatum || !/^\d{4}-\d{2}-\d{2}$/.test(b.startdatum)) return json(context, 400, { error: "Geef een geldige startdatum (YYYY-MM-DD)." });
      if (!b.einddatum || !/^\d{4}-\d{2}-\d{2}$/.test(b.einddatum)) return json(context, 400, { error: "Geef een geldige einddatum (YYYY-MM-DD)." });
      if (b.einddatum < b.startdatum) return json(context, 400, { error: "De einddatum kan niet vóór de startdatum liggen." });

      const naam = await mijnNaam(req, email);
      const tarief = await uren.haalTarief(email);
      const leidinggevendeNaam = tarief ? tarief.leidinggevende : "";

      const aanvraag = await verlof.maakAanvraag({
        email, naam, verloftype: b.verloftype, startdatum: b.startdatum, einddatum: b.einddatum,
        toelichting: b.toelichting, leidinggevendeNaam,
      });
      return json(context, 200, { ok: true, aanvraag });
    }

    if (methode === "DELETE") {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return json(context, 400, { error: "Geef een id mee." });
      const r = await verlof.trekAanvraagIn(id, email);
      if (r.fout === "NIET_GEVONDEN") return json(context, 404, { error: "Aanvraag niet gevonden." });
      if (r.fout === "AL_AFGEHANDELD") return json(context, 409, { error: "Deze aanvraag is al afgehandeld en kan niet meer worden ingetrokken." });
      return json(context, 200, { ok: true });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    if (String(err.message || "").startsWith("VALIDATIE")) return json(context, 400, { error: String(err.message).replace(/^VALIDATIE:\s*/, "") });
    context.log.error(err);
    return json(context, 500, { error: "Kon de verlofaanvraag niet verwerken.", detail: String(err.message || err) });
  }
};
