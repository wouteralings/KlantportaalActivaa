/**
 * /api/beheer-rollen — beheer van de rollen & toegang (Beheer → Medewerkers → "Rollen & toegang").
 * Rollen bepalen welke tabs een medewerker in het medewerkers-/beheerdersportaal ziet en welke functies
 * hij mag; elke medewerker krijgt één rol. Zie api/_gedeeld/rollenConfig.js.
 *
 *   GET → { rollen:[...], toewijzingen:{email:rolsleutel}, medewerkerTabs:[{key,label}],
 *           beheerTabs:[{key,label}], functies:[{key,label}] }
 *   PUT body { rollen:[...], toewijzingen:{...} } → overschrijft (genormaliseerd)
 *
 * Route beveiligd via staticwebapp.config.json (alleen rol 'beheerder'); extra rolcheck hier.
 */
const { haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalRollenConfig, zetRollenConfig, MEDEWERKER_TABS, BEHEER_TABS, FUNCTIES, MEDEWERKER_SUBTABS } = require("../_gedeeld/rollenConfig");

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

module.exports = async function (context, req) {
  if (!haalRollenUitPrincipal(req).includes("beheerder")) { context.res = json(403, { error: "Alleen beheerders mogen rollen beheren." }); return; }
  try {
    if (req.method === "GET") {
      const cfg = await haalRollenConfig();
      context.res = json(200, { ...cfg, medewerkerTabs: MEDEWERKER_TABS, beheerTabs: BEHEER_TABS, functies: FUNCTIES, medewerkerSubTabs: MEDEWERKER_SUBTABS });
      return;
    }
    if (req.method === "PUT") {
      const rollen = (req.body && req.body.rollen) || [];
      const toewijzingen = (req.body && req.body.toewijzingen) || {};
      if (!Array.isArray(rollen)) { context.res = json(400, { error: "Geef 'rollen' als lijst mee." }); return; }
      const opgeslagen = await zetRollenConfig({ rollen, toewijzingen });
      context.res = json(200, { ...opgeslagen, medewerkerTabs: MEDEWERKER_TABS, beheerTabs: BEHEER_TABS, functies: FUNCTIES, medewerkerSubTabs: MEDEWERKER_SUBTABS });
      return;
    }
    context.res = json(405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = json(501, { error: "Opslag is nog niet geconfigureerd (STORAGE_CONNECTION_STRING)." }); return; }
    context.log && context.log.error && context.log.error(err);
    context.res = json(500, { error: "Onverwachte fout bij de rollen.", detail: String(err.message || err) });
  }
};
