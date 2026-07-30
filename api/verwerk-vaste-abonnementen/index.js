/**
 * POST /api/verwerk-vaste-abonnementen — zet de vervallen abonnementen op vaste uitvragen klaar.
 * De kernlogica zit in _gedeeld/abonnementenVerwerker.js en wordt óók door de dagelijkse
 * /api/verwerk-periodieke-uitvragen aangeroepen, zodat één dagelijkse HTTP-aanroep volstaat. Dit losse
 * endpoint is handig om de verwerking los te testen/handmatig te draaien.
 *
 * BEVEILIGING: "anonymous" met een geheime sleutel in header 'x-verwerk-sleutel' of '?sleutel=' die
 * moet overeenkomen met TERUGKEREND_TRIGGER_SECRET (dezelfde als de andere terugkerende verwerkers).
 */
const { verwerkAbonnementen } = require("../_gedeeld/abonnementenVerwerker");

module.exports = async function (context, req) {
  const verwachteSleutel = process.env.TERUGKEREND_TRIGGER_SECRET;
  if (!verwachteSleutel) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "TERUGKEREND_TRIGGER_SECRET is nog niet geconfigureerd — dit endpoint staat uit." } };
    return;
  }
  const meegegeven = (req.headers && req.headers["x-verwerk-sleutel"]) || (req.query && req.query.sleutel) || "";
  if (meegegeven !== verwachteSleutel) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldige of ontbrekende sleutel." } };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  try {
    const samenvatting = await verwerkAbonnementen(resource);
    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, ...samenvatting } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag/Dynamics is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Verwerken van abonnementen mislukt.", detail: String(err.message || err) } };
  }
};
