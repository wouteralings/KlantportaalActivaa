/**
 * /api/mw-uren-rapportage — stuurinformatie op de urenregistratie: per medewerker het declarabel-%
 * (declarabele uren ÷ totaal), afgezet tegen het ingestelde doel, plus de opbouw abonnement/UXT/
 * indirect/kantoor. Voor het sturen op indirecte uren en declarabiliteit.
 *
 *   - GET ?vanaf=YYYY-MM-DD&tot=YYYY-MM-DD → { vanaf, tot, medewerkers:[...] }
 *
 * Standaardperiode = lopende maand als er niets is meegegeven. Route beveiligd via
 * staticwebapp.config.json (medewerker/beheerder).
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDb");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
}

function maandRange() {
  const nu = new Date();
  const j = nu.getUTCFullYear(), m = nu.getUTCMonth();
  const vanaf = new Date(Date.UTC(j, m, 1)).toISOString().slice(0, 10);
  const tot = new Date(Date.UTC(j, m + 1, 0)).toISOString().slice(0, 10);
  return { vanaf, tot };
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });
  if (!haalEmailUitPrincipal(req)) return json(context, 401, { error: "Geen identiteit." });

  try {
    const std = maandRange();
    const vanaf = (req.query && req.query.vanaf) || std.vanaf;
    const tot = (req.query && req.query.tot) || std.tot;
    const medewerkers = await uren.rapportageDeclarabel({ vanaf, tot });
    return json(context, 200, { vanaf, tot, medewerkers });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de rapportage niet opbouwen.", detail: String(err.message || err) });
  }
};
