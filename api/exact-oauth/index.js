/**
 * /api/exact-oauth — verbinden met Exact Online (OAuth2) en de verbindingsstatus. Beheerder-only.
 *
 *   - GET ?actie=status              → { geconfigureerd, verbonden, division, verlooptOp }
 *   - GET ?actie=start               → { url }  (frontend stuurt de browser hierheen om toegang te geven)
 *   - GET ?code=...                  → callback vanaf Exact: wisselt de code in en stuurt terug naar /beheer
 *
 * EXACT_REDIRECT_URI moet naar dit endpoint wijzen (…/api/exact-oauth).
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const exact = require("../_gedeeld/exact");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) return json(context, 403, { error: "Geen toegang." });

  try {
    // Callback vanaf Exact (browser-redirect met ?code=).
    if (req.query && req.query.code) {
      try {
        const r = await exact.wisselCodeIn(req.query.code);
        context.res = { status: 302, headers: { Location: `/beheer?exact=verbonden&division=${encodeURIComponent(r.division || "")}` } };
      } catch (e) {
        context.res = { status: 302, headers: { Location: `/beheer?exact=fout&detail=${encodeURIComponent(String(e.message || e).slice(0, 200))}` } };
      }
      return;
    }

    const actie = (req.query && req.query.actie) || "status";
    if (actie === "start") {
      if (!exact.isGeconfigureerd()) return json(context, 501, { error: "Exact is nog niet geconfigureerd (EXACT_CLIENT_ID/SECRET/REDIRECT_URI ontbreken)." });
      return json(context, 200, { url: exact.authorizeUrl("klantportaal") });
    }
    return json(context, 200, await exact.status());
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "Opslag is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Exact-actie mislukt.", detail: String(err.message || err) });
  }
};
