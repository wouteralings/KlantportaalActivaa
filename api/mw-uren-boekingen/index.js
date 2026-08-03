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
 * soort ∈ abonnement|uxt|indirect|kantoor|verlof. Voor declarabele soorten (abonnement/uxt) is een
 * cliënt (accountId) vereist; het uurtarief en de cliënt-/manager-naam worden server-side als
 * snapshot vastgelegd. Route beveiligd via staticwebapp.config.json (medewerker/beheerder).
 *
 * 03-08-2026: bij "indienen" wordt eerst goedgekeurd-maar-nog-niet-vastgelegd verlof voor die week
 * gematerialiseerd (zelfde moment als de vaste/contract-uren) — zie verlofDataverse.js.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");
const urencodes = require("../_gedeeld/urencodesStore");
const verlof = require("../_gedeeld/verlofDataverse");

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
      // Vaste (contract)uren + goedgekeurd (nog niet vastgelegd) verlof voor deze week: virtuele
      // boekingen die nog niet zijn vastgelegd. Alleen relevant als er een volledige week wordt
      // opgevraagd (Schrijven vraagt precies één week op).
      let vasteUren = [];
      let verlofUren = [];
      if (vanaf && tot) {
        const weekStart = uren.maandagVan(vanaf);
        try { vasteUren = await uren.vasteUrenVirtueel(email, weekStart, boekingen); } catch { vasteUren = []; }
        try { verlofUren = await verlof.virtueleRijenVoorWeek(email, weekStart, boekingen); } catch { verlofUren = []; }
      }
      return json(context, 200, {
        boekingen,
        vasteUren,
        verlofUren,
        weekUrenEis: uren.WEEK_UREN_EIS,
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
        // Eerst goedgekeurd verlof voor deze week vastleggen (idempotent), zodat de 40-uur-eis het meetelt.
        await verlof.materialiseerVoorWeek(email, b.weekStart);
        const r = await uren.dienWeekIn(email, b.weekStart);
        if (r.fout === "NIET_COMPLEET") {
          const u = Number(r.urenTotaal || 0).toLocaleString("nl-NL", { maximumFractionDigits: 2 });
          return json(context, 409, { error: `Je weekstaat telt nu ${u} uur. Insturen kan pas bij precies ${r.eis} uur — vul aan of pas je uren aan.`, urenTotaal: r.urenTotaal, eis: r.eis });
        }
        if (r.fout === "GEEN_CONCEPT") return json(context, 409, { error: "Er zijn geen in te dienen (concept) boekingen in deze week." });
        return json(context, 200, { ok: true, ...r });
      }

      const soort = String(b.soort || "").toLowerCase();
      if (!uren.SOORTEN.includes(soort)) return json(context, 400, { error: "Ongeldige urensoort." });
      // Eén of meerdere dagen: 'datums' (array) heeft voorrang, anders de losse 'datum'.
      const datums = Array.isArray(b.datums) && b.datums.length ? b.datums : (b.datum ? [b.datum] : []);
      if (datums.length === 0 || datums.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return json(context, 400, { error: "Geef één of meer geldige datums (YYYY-MM-DD)." });
      const aantalUren = Number(b.uren);
      if (!(aantalUren > 0)) return json(context, 400, { error: "Geef een aantal uren groter dan 0." });
      let klantMeta = null;
      if (uren.isDeclarabel(soort)) {
        if (!b.accountId) return json(context, 400, { error: "Kies een cliënt voor declarabele uren (abonnement/UXT)." });
        const token = await haalDynamicsToken();
        klantMeta = await uren.haalKlantMeta(process.env.DYNAMICS_RESOURCE_URL, token, b.accountId);
      }
      const naam = await mijnNaam(req, email);
      const boekingen = [];
      for (const datum of datums) {
        boekingen.push(await uren.maakBoeking({
          email, naam, datum, soort, accountId: b.accountId, omschrijving: b.omschrijving,
          uren: aantalUren, tariefSoort: b.tariefSoort, urencode: b.urencode,
        }, klantMeta));
      }
      return json(context, 200, { ok: true, boeking: boekingen[0], boekingen });
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
      if (res.fout === "VAST") return json(context, 409, { error: "Dit zijn vaste (contract)uren die door beheer zijn vastgezet; die kun je niet zelf wijzigen." });
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
