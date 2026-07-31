/**
 * /api/mw-uren-facturatie — onderhanden werk (OHW) en facturatie-overzicht van de declarabele
 * uren, GESPLITST in UXT en abonnement (zoals gevraagd). Toont per cliënt de nog te factureren en
 * reeds gefactureerde waarde, zodat je ziet of alles gefactureerd is. Manager ziet zijn eigen
 * cliënten; een beheerder kan met ?scope=alle het hele kantoor zien.
 *
 *   - GET  ?maand=YYYY-MM (optioneel)[&scope=alle]  → { totaal:{uxt,abonnement,teFactureren,gefactureerd}, klanten:[...] }
 *   - POST { ids:[...], factuurRef? }               → markeer die boekingen als gefactureerd
 *
 * Route beveiligd via staticwebapp.config.json (medewerker/beheerder).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
}

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
  const isBeheerder = rollen.includes("beheerder");
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const maand = (req.query && req.query.maand) || null;
      const wilAlles = (req.query && req.query.scope) === "alle" && isBeheerder;
      const naam = await mijnNaam(req, email);
      const overzicht = await uren.ohwEnFacturatie({ maand, managerNaam: naam, alle: wilAlles });
      return json(context, 200, { maand: maand || "", scope: wilAlles ? "alle" : "manager", magAlles: isBeheerder, ...overzicht });
    }

    if (methode === "POST" || methode === "PATCH") {
      const b = req.body || {};
      const ids = Array.isArray(b.ids) ? b.ids : (b.id ? [b.id] : []);
      if (ids.length === 0) return json(context, 400, { error: "Geef één of meer boekingen (ids) mee." });
      const naam = await mijnNaam(req, email);
      const aantal = await uren.markeerGefactureerd(ids, b.factuurRef, naam || email);
      return json(context, 200, { ok: true, aantal });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon het facturatie-overzicht niet verwerken.", detail: String(err.message || err) });
  }
};
