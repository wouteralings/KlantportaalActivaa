/**
 * /api/beheer-verlof-instellingen — beheer van de verlofmodule-instellingen: het landelijke aantal
 * fulltime verlofuren per jaar, en de beheerbare lijst verloftypen (vakantie/ziek/bijzonder
 * verlof/onbetaald, uit te breiden zonder migratie — zelfde patroon als contractenTypes.js).
 *
 *   - GET                                          → { verlofUrenFulltime, verloftypen }
 *   - POST { actie:"fulltime", verlofUrenFulltime } → landelijk aantal fulltime verlofuren/jaar zetten
 *   - POST { actie:"verloftypen", verloftypen }     → hele verloftypen-lijst vervangen (toevoegen/bewerken/uitzetten)
 *
 * Beheerder-only (route in staticwebapp.config.json).
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const verlofInstellingen = require("../_gedeeld/verlofInstellingen");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) return json(context, 403, { error: "Alleen beheerders hebben hier toegang toe." });
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const instellingen = await verlofInstellingen.haalInstellingen();
      return json(context, 200, instellingen);
    }

    if (methode === "POST") {
      const b = req.body || {};
      if (b.actie === "verloftypen") {
        if (!Array.isArray(b.verloftypen)) return json(context, 400, { error: "Geef een lijst verloftypen mee." });
        const nieuw = await verlofInstellingen.zetVerloftypen(b.verloftypen);
        return json(context, 200, nieuw);
      }
      // Standaard: het landelijke fulltime-aantal.
      if (b.verlofUrenFulltime == null || isNaN(Number(b.verlofUrenFulltime))) return json(context, 400, { error: "Geef een geldig aantal fulltime verlofuren per jaar." });
      const nieuw = await verlofInstellingen.zetVerlofUrenFulltime(b.verlofUrenFulltime);
      return json(context, 200, nieuw);
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "Opslag is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de verlofinstellingen niet verwerken.", detail: String(err.message || err) });
  }
};
