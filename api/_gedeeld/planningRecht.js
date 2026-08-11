/**
 * Serverkant-slot voor de Planning-medewerkerskant (mw-planning-*) — Planningsmodule, Stap 1.
 *
 * Wie de Planning mag zien/gebruiken wordt beheerd in het beheerdersportaal (Beheer → Medewerkers →
 * "Medewerkers — wijzig-rechten", kolom "Planning") en opgeslagen in wijzigrechten.json — zie
 * api/_gedeeld/wijzigrechten.js (`planning`-lijst + magPlanning). Exact hetzelfde patroon als
 * offertesRecht.js / contractenRecht.js. Het verbergen van de sub-tab "Planning" in het
 * medewerkersportaal (KlantenModule in MedewerkerPortaal.jsx) is alleen een weergave-keuze; de echte
 * grens ligt hier, want een verborgen tab houdt niemand tegen die het API-pad kent.
 *
 * Gebruik in een Function:
 *
 *     const { metPlanningRecht } = require("../_gedeeld/planningRecht");
 *     const handler = async function (context, req) { ... };
 *     module.exports = metPlanningRecht(handler);
 *
 * De Azure-rol 'beheerder' komt er altijd door, net als bij de andere rechten.
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("./identiteit");
const { magPlanning } = require("./wijzigrechten");

/** Mag deze aanvraag de Planning-medewerkerskant gebruiken (muteren)? Beheerders altijd; medewerkers als ze het recht hebben. */
async function magPlanningGebruiken(req) {
  const rollen = haalRollenUitPrincipal(req);
  if (rollen.includes("beheerder")) return true;
  return magPlanning(haalEmailUitPrincipal(req), false);
}

/**
 * Mag deze aanvraag de Planning LEZEN / eigen werk aftekenen? Elke ingelogde MEDEWERKER (of beheerder)
 * — dit is bewust ruimer dan het granulaire Planning-recht, zodat een medewerker zijn eigen werk kan
 * aftekenen ("Mijn werk"). KLANT-gastgebruikers hebben de rol 'medewerker' niet en vallen dus buiten
 * de boot (naast de SWA-route-regel die klanten al op /api/mw-planning-* weert).
 */
function magPlanningLezen(req) {
  const rollen = haalRollenUitPrincipal(req);
  return rollen.includes("medewerker") || rollen.includes("beheerder");
}

/** Wikkelt een Function-handler in de rechtencontrole hierboven. */
function metPlanningRecht(handler) {
  return async function (context, req) {
    let mag = false;
    try {
      mag = await magPlanningGebruiken(req);
    } catch (err) {
      // Kan de rechtenopslag niet gelezen worden, dan weigeren we — een fout mag nooit stilzwijgend
      // uitmonden in toegang voor iedereen.
      if (context && context.log && context.log.error) context.log.error(err);
      mag = false;
    }
    if (!mag) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: {
          error:
            "Je hebt geen recht om de Planning te bekijken. " +
            "Vraag een beheerder om dit recht toe te kennen via Beheer → Medewerkers.",
        },
      };
      return;
    }
    return handler(context, req);
  };
}

module.exports = { magPlanningGebruiken, magPlanningLezen, metPlanningRecht };
