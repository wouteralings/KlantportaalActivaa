/**
 * /api/mw-uren-bezetting — bezetting per medewerker per maand: hoeveel uur staat er al ingepland/
 * geboekt (alle soorten en statussen samen) t.o.v. de beschikbare capaciteit die maand (werkdagen ×
 * 8 uur, de fulltime-norm). Voor capaciteitsplanning: wie heeft deze maand nog weinig ingepland
 * staan, wie zit al (bijna) vol.
 *
 *   - GET ?maand=YYYY-MM[&scope=alle] → { maand, eerste, laatste, werkdagen, beschikbaar,
 *                                          medewerkers:[{email,naam,leidinggevende,ingepland,vast,
 *                                          beschikbaar,bezettingPct,weken:[{weekStart,ingepland,
 *                                          boekingen:[...]}]}], mijnNaam, magAlles, scope }
 *
 * Scoping: net als bij /api/mw-uren-weekstaten — een medewerker ziet standaard alleen wie hém/haar
 * als leidinggevende heeft (uit het uurtarief, Beheer → Uren); een beheerder kan met ?scope=alle
 * iedereen zien. Standaardmaand = lopende maand. Route: medewerker/beheerder.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
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
    } catch { /* val terug op de naam uit de principal */ }
  }
  return naam;
}

function maandVanNu() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });
  const email = haalEmailUitPrincipal(req);
  if (!email) return json(context, 401, { error: "Geen identiteit." });
  const isBeheerder = rollen.includes("beheerder");

  try {
    const naam = await mijnNaam(req, email);
    const maand = (req.query && req.query.maand) || maandVanNu();
    const wilAlles = (req.query && req.query.scope) === "alle" && isBeheerder;
    const data = await uren.bezettingPerMaand({ maand, leidinggevendeNaam: naam, alle: wilAlles });
    return json(context, 200, { ...data, mijnNaam: naam, magAlles: isBeheerder, scope: wilAlles ? "alle" : "mijn" });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de bezetting niet opbouwen.", detail: String(err.message || err) });
  }
};
