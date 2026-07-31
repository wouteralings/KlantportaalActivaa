/**
 * /api/beheer-urencodes — onderhoud van de urencodes (beheerder-only). Elke code hoort bij één
 * categorie (abonnement/uxt/indirect/kantoor).
 *
 *   - GET                                            → { codes:[...], categorieen:[...] }
 *   - POST { id?, naam, categorie, actief, volgorde } → toevoegen/bijwerken
 *   - DELETE ?id=  (of body { id })                   → verwijderen
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const codes = require("../_gedeeld/urencodesStore");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) return json(context, 403, { error: "Geen toegang." });
  if (!haalEmailUitPrincipal(req)) return json(context, 401, { error: "Geen identiteit." });
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      return json(context, 200, { codes: await codes.haalCodes(), categorieen: codes.CATEGORIEEN });
    }
    if (methode === "POST" || methode === "PATCH") {
      const b = req.body || {};
      if (!b.naam || !String(b.naam).trim()) return json(context, 400, { error: "Geef een naam voor de urencode." });
      const opgeslagen = await codes.zetCode({ id: b.id, naam: b.naam, categorie: b.categorie, actief: b.actief, volgorde: b.volgorde });
      return json(context, 200, { ok: true, code: opgeslagen });
    }
    if (methode === "DELETE") {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return json(context, 400, { error: "Geef een id mee." });
      const weg = await codes.verwijderCode(id);
      return json(context, 200, { ok: weg });
    }
    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "Opslag is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de urencodes niet verwerken.", detail: String(err.message || err) });
  }
};
