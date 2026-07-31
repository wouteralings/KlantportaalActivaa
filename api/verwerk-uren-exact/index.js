/**
 * POST /api/verwerk-uren-exact — schrijft alle nog niet geëxporteerde, goedgekeurde UXT-uren als
 * definitieve verkoopfacturen naar Exact Online (één per cliënt). Bedoeld als vangnet/periodieke
 * verwerker náást de directe push bij goedkeuren; dagelijks extern aan te roepen (Power Automate).
 *
 * BEVEILIGING: "anonymous" met geheime sleutel in header 'x-verwerk-sleutel' of '?sleutel=' die
 * moet overeenkomen met TERUGKEREND_TRIGGER_SECRET (zelfde als de andere verwerkers).
 */
const { pushAlleUxt } = require("../_gedeeld/exactUren");

module.exports = async function (context, req) {
  const verwachteSleutel = process.env.TERUGKEREND_TRIGGER_SECRET;
  if (!verwachteSleutel) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "TERUGKEREND_TRIGGER_SECRET is nog niet geconfigureerd — dit endpoint staat uit." } }; return; }
  const meegegeven = (req.headers && req.headers["x-verwerk-sleutel"]) || (req.query && req.query.sleutel) || "";
  if (meegegeven !== verwachteSleutel) { context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldige of ontbrekende sleutel." } }; return; }

  try {
    const resultaat = await pushAlleUxt();
    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, ...resultaat } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag/Dynamics is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Exact-verwerking mislukt.", detail: String(err.message || err) } };
  }
};
