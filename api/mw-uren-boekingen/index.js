/**
 * /api/mw-uren-boekingen — de eigen urenboekingen van de ingelogde medewerker (intern
 * tijdschrijven). Elke medewerker/beheerder schrijft en beheert ALLEEN zijn eigen uren;
 * bewerken/verwijderen kan zolang de boeking nog niet is gecontroleerd (status 'open').
 *
 *   - GET  ?vanaf=YYYY-MM-DD&tot=YYYY-MM-DD   → { boekingen, tarief, soorten }
 *   - POST { datum, soort, accountId?, omschrijving?, uren, tariefSoort? } → nieuwe boeking
 *   - PATCH { id, ...velden }                 → eigen open boeking bijwerken
 *   - DELETE ?id=  (of body { id })           → eigen open boeking verwijderen
 *
 * soort ∈ abonnement|uxt|indirect|kantoor. Voor declarabele soorten (abonnement/uxt) is een
 * cliënt (accountId) vereist; het uurtarief en de cliënt-/manager-naam worden server-side als
 * snapshot vastgelegd. Route beveiligd via staticwebapp.config.json (medewerker/beheerder).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");
const urencodes = require("../_gedeeld/urencodesStore");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
}

async function mijnNaam(req, email) {
  // Zelfde bron als /api/mijn-naam: Dynamics systemuser fullname (valt terug op token-naam).
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
      const vanaf = (req.query && req.query.vanaf) || null;
      const tot = (req.query && req.query.tot) || null;
      const [boekingen, tarief, codes] = await Promise.all([
        uren.boekingenVanMedewerker(email, { vanaf, tot }),
        uren.haalTarief(email),
        urencodes.haalCodes().catch(() => []),
      ]);
      return json(context, 200, {
        boekingen,
        soorten: uren.SOORTEN,
        urencodes: (codes || []).filter((c) => c.actief !== false),
        tarief: tarief ? {
          normaal: tarief.tarief_normaal == null ? null : Number(tarief.tarief_normaal),
          hoog: tarief.tarief_hoog == null ? null : Number(tarief.tarief_hoog),
          laag: tarief.tarief_laag == null ? null : Number(tarief.tarief_laag),
          declarabelDoel: tarief.declarabel_doel == null ? null : Number(tarief.declarabel_doel),
          deadlineWeekdag: tarief.deadline_weekdag == null ? null : Number(tarief.deadline_weekdag),
        } : null,
      });
    }

    if (methode === "POST") {
      const b = req.body || {};

      // Weekstaat indienen: alle concept-boekingen van die week → 'ingediend' (wacht op leidinggevende).
      if (b.actie === "indienen") {
        if (!b.weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(b.weekStart)) return json(context, 400, { error: "Geef een geldige weekStart (maandag) mee." });
        const r = await uren.dienWeekIn(email, b.weekStart);
        if (r.aantal === 0) return json(context, 409, { error: "Er zijn geen in te dienen (concept) boekingen in deze week." });
        return json(context, 200, { ok: true, ...r });
      }

      const soort = String(b.soort || "").toLowerCase();
      if (!uren.SOORTEN.includes(soort)) return json(context, 400, { error: "Ongeldige urensoort." });
      if (!b.datum || !/^\d{4}-\d{2}-\d{2}$/.test(b.datum)) return json(context, 400, { error: "Geef een geldige datum (YYYY-MM-DD)." });
      const aantalUren = Number(b.uren);
      if (!(aantalUren > 0)) return json(context, 400, { error: "Geef een aantal uren groter dan 0." });
      let klantMeta = null;
      if (uren.isDeclarabel(soort)) {
        if (!b.accountId) return json(context, 400, { error: "Kies een cliënt voor declarabele uren (abonnement/UXT)." });
        const token = await haalDynamicsToken();
        klantMeta = await uren.haalKlantMeta(process.env.DYNAMICS_RESOURCE_URL, token, b.accountId);
      }
      const naam = await mijnNaam(req, email);
      const boeking = await uren.maakBoeking({
        email, naam, datum: b.datum, soort, accountId: b.accountId, omschrijving: b.omschrijving,
        uren: aantalUren, tariefSoort: b.tariefSoort, urencode: b.urencode,
      }, klantMeta);
      return json(context, 200, { ok: true, boeking });
    }

    if (methode === "PATCH") {
      const b = req.body || {};
      if (!b.id) return json(context, 400, { error: "Geef een id mee." });
      const soort = b.soort ? String(b.soort).toLowerCase() : null;
      if (soort && !uren.SOORTEN.includes(soort)) return json(context, 400, { error: "Ongeldige urensoort." });
      if (b.uren !== undefined && !(Number(b.uren) > 0)) return json(context, 400, { error: "Geef een aantal uren groter dan 0." });
      let klantMeta = null;
      if (soort && uren.isDeclarabel(soort) && b.accountId) {
        const token = await haalDynamicsToken();
        klantMeta = await uren.haalKlantMeta(process.env.DYNAMICS_RESOURCE_URL, token, b.accountId);
      }
      const res = await uren.werkBoekingBij(b.id, email, {
        soort, datum: b.datum, accountId: b.accountId, urencode: b.urencode,
        omschrijving: b.omschrijving, uren: b.uren !== undefined ? Number(b.uren) : undefined, tariefSoort: b.tariefSoort,
      }, klantMeta);
      if (res.fout === "NIET_GEVONDEN") return json(context, 404, { error: "Boeking niet gevonden." });
      if (res.fout === "AL_GECONTROLEERD") return json(context, 409, { error: "Deze boeking is al gecontroleerd en kan niet meer worden gewijzigd." });
      return json(context, 200, { ok: true, boeking: res.boeking });
    }

    if (methode === "DELETE") {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return json(context, 400, { error: "Geef een id mee." });
      const weg = await uren.verwijderBoeking(id, email);
      if (!weg) return json(context, 409, { error: "Kon de boeking niet verwijderen (bestaat niet of is al gecontroleerd)." });
      return json(context, 200, { ok: true });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de urenboeking niet verwerken.", detail: String(err.message || err) });
  }
};
