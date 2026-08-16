/**
 * /api/mw-planning-overzicht — het medewerkersoverzicht van de Planningsmodule (Stap 2): alle
 * planningsregels over ALLE klantaccounts heen, plus de actieve activiteiten- en statuslijsten
 * (zodat de UI labels/kleuren en de keuzelijsten heeft). De klantnaam/-nummer worden aan de
 * voorkant erbij gezocht via /api/beheer-klanten (zelfde join-patroon als ContractenOverzicht.jsx).
 *
 * Beveiligd via staticwebapp.config.json (rol 'beheerder'/'medewerker') én, fijnmaziger, via het
 * granulaire "Planning"-recht (metPlanningRecht, zie api/_gedeeld/planningRecht.js).
 *
 * GET → { regels: [...], activiteiten: [...], statussen: [...], setjes: [...], urencodes: [...] }
 *
 * `urencodes` = de actieve urencodes uit Beheer → Uren. Die staan hier bij zodat de planningsschermen
 * (configuratie per klant, Mijn werk) een urencode-keuzelijst kunnen tonen en de gekoppelde
 * urenboeking kunnen voorvullen, zonder een tweede, zwaardere call naar /api/mw-uren-boekingen.
 */
const { magPlanningLezen } = require("../_gedeeld/planningRecht");
const { haalAlleVoorOverzicht } = require("../_gedeeld/planningKlanten");
const { haalActieveActiviteiten, haalActieveStatussen, haalSetjes } = require("../_gedeeld/planningInstellingen");
const urencodesStore = require("../_gedeeld/urencodesStore");

// Alleen-lezen overzicht: elke ingelogde medewerker (voor "Mijn werk"); klanten worden geweerd via de
// rol-check hieronder en de SWA-route-regel.
const verwerk = async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const [regels, activiteiten, statussen, setjes, urencodes] = await Promise.all([
      haalAlleVoorOverzicht(),
      haalActieveActiviteiten(),
      haalActieveStatussen(),
      haalSetjes(),
      // Best-effort: zonder urencodes werkt de planning gewoon door (alleen geen voorgevulde code).
      urencodesStore.haalCodes().then((c) => (c || []).filter((x) => x.actief !== false)).catch(() => []),
    ]);
    context.res = { headers: { "Content-Type": "application/json" }, body: { regels, activiteiten, statussen, setjes, urencodes } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "FACTURATIE_SQL_CONNECTIONSTRING of STORAGE_CONNECTION_STRING ontbreekt." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de planning.", detail: String(err.message || err) },
    };
  }
};

module.exports = async function (context, req) {
  if (!magPlanningLezen(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang tot de planning." } };
    return;
  }
  return verwerk(context, req);
};
