/**
 * POST /api/verwerk-uren-herinneringen — de herinneringsflow voor het intern tijdschrijven.
 * Bedoeld om DAGELIJKS extern te worden aangeroepen (Power Automate), net als de andere
 * terugkerende verwerkers. De flow zelf is instelbaar in Beheer → Uren:
 *   - alleen actief als herinnering_actief aanstaat;
 *   - vuurt alleen op de ingestelde weekdag (herinnering_weekdag, 1=ma … 7=zo) — de deadline waarop
 *     de week volledig geschreven moet zijn;
 *   - bepaalt welke actieve medewerkers deze week onder het ingestelde minimum (herinnering_minuren)
 *     zitten, en stuurt die lijst naar de ingestelde webhook (Teams/Power Automate).
 *
 * Met ?dryrun=1 (of body { dryrun:true }) wordt niets verstuurd maar wel de lijst teruggegeven —
 * handig om te testen. Met ?force=1 wordt de weekdag-check overgeslagen.
 *
 * BEVEILIGING: "anonymous" met geheime sleutel in header 'x-verwerk-sleutel' of '?sleutel=' die
 * moet overeenkomen met TERUGKEREND_TRIGGER_SECRET (zelfde als de andere terugkerende verwerkers).
 */
const uren = require("../_gedeeld/urenDataverse");
const instellingenStore = require("../_gedeeld/urenInstellingenIntern");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
}

// Maandag van de huidige week (UTC), als YYYY-MM-DD.
function huidigeWeekStart() {
  const d = new Date();
  const dag = d.getUTCDay(); // 0 = zo ... 6 = za
  const verschil = dag === 0 ? -6 : 1 - dag;
  d.setUTCDate(d.getUTCDate() + verschil);
  return d.toISOString().slice(0, 10);
}
// Weekdag 1=ma ... 7=zo van vandaag (UTC).
function vandaagWeekdag() {
  const dag = new Date().getUTCDay();
  return dag === 0 ? 7 : dag;
}

module.exports = async function (context, req) {
  const verwachteSleutel = process.env.TERUGKEREND_TRIGGER_SECRET;
  if (!verwachteSleutel) return json(context, 501, { error: "TERUGKEREND_TRIGGER_SECRET is nog niet geconfigureerd — dit endpoint staat uit." });
  const meegegeven = (req.headers && req.headers["x-verwerk-sleutel"]) || (req.query && req.query.sleutel) || "";
  if (meegegeven !== verwachteSleutel) return json(context, 401, { error: "Ongeldige of ontbrekende sleutel." });

  const dryrun = (req.query && (req.query.dryrun === "1" || req.query.dryrun === "true")) || (req.body && req.body.dryrun);
  const force = (req.query && (req.query.force === "1" || req.query.force === "true")) || (req.body && req.body.force);

  try {
    const inst = await instellingenStore.haalInstellingen();
    if (!inst.herinneringActief) return json(context, 200, { ok: true, overgeslagen: "herinneringen staan uit" });
    if (!force && vandaagWeekdag() !== Number(inst.herinneringWeekdag)) {
      return json(context, 200, { ok: true, overgeslagen: `vandaag (weekdag ${vandaagWeekdag()}) is niet de ingestelde herinneringsdag (${inst.herinneringWeekdag})` });
    }

    const weekStart = huidigeWeekStart();
    const minuren = Number(inst.herinneringMinuren) || 40;
    const achterlopers = await uren.medewerkersOnderMinuren(weekStart, minuren);

    let verstuurd = false;
    if (!dryrun && inst.herinneringWebhook && achterlopers.length) {
      const tekst = inst.herinneringTekst || `Herinnering: schrijf je uren voor deze week (minimaal ${minuren} uur) volledig.`;
      const payload = {
        tekst, weekStart, minuren,
        medewerkers: achterlopers.map((m) => ({ naam: m.naam, email: m.email, geschreven: m.geschreven, tekort: Math.round((minuren - m.geschreven) * 100) / 100 })),
      };
      try {
        const res = await fetch(inst.herinnering_webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        verstuurd = res.ok;
        if (!res.ok) context.log.warn(`Herinnering-webhook gaf ${res.status}`);
      } catch (e) { context.log.error("Herinnering-webhook mislukt", e); }
    }
    if (!dryrun) await instellingenStore.zetLaatsteRun();

    return json(context, 200, { ok: true, weekStart, minuren, aantalAchterlopers: achterlopers.length, verstuurd, dryrun: !!dryrun, achterlopers });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de herinneringen niet verwerken.", detail: String(err.message || err) });
  }
};
