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
    const weekStart = huidigeWeekStart();
    const vandaag = vandaagWeekdag();

    // Twee onafhankelijke herinneringen. De tweede webhook valt terug op de eerste.
    const herinneringen = [
      { nr: 1, actief: !!inst.herinneringActief, weekdag: Number(inst.herinneringWeekdag), minuren: Number(inst.herinneringMinuren) || 40, webhook: inst.herinneringWebhook || "", tekst: inst.herinneringTekst || "" },
      { nr: 2, actief: !!inst.herinnering2Actief, weekdag: Number(inst.herinnering2Weekdag), minuren: Number(inst.herinnering2Minuren) || 40, webhook: inst.herinnering2Webhook || inst.herinneringWebhook || "", tekst: inst.herinnering2Tekst || "" },
    ];
    const teVuren = herinneringen.filter((h) => h.actief && (force || vandaag === h.weekdag));
    if (teVuren.length === 0) {
      return json(context, 200, { ok: true, overgeslagen: `geen herinnering ingepland voor vandaag (weekdag ${vandaag})` });
    }

    const resultaten = [];
    for (const h of teVuren) {
      const achterlopers = await uren.medewerkersOnderMinuren(weekStart, h.minuren);
      let verstuurd = false;
      if (!dryrun && h.webhook && achterlopers.length) {
        const tekst = h.tekst || `Herinnering: schrijf je uren voor deze week (minimaal ${h.minuren} uur) volledig.`;
        const payload = {
          herinnering: h.nr, tekst, weekStart, minuren: h.minuren,
          medewerkers: achterlopers.map((m) => ({ naam: m.naam, email: m.email, geschreven: m.geschreven, tekort: Math.round((h.minuren - m.geschreven) * 100) / 100 })),
        };
        try {
          const res = await fetch(h.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          verstuurd = res.ok;
          if (!res.ok) context.log.warn(`Herinnering ${h.nr}-webhook gaf ${res.status}`);
        } catch (e) { context.log.error(`Herinnering ${h.nr}-webhook mislukt`, e); }
      }
      resultaten.push({ herinnering: h.nr, minuren: h.minuren, aantalAchterlopers: achterlopers.length, verstuurd, achterlopers });
    }
    if (!dryrun) await instellingenStore.zetLaatsteRun();

    return json(context, 200, { ok: true, weekStart, dryrun: !!dryrun, resultaten });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de herinneringen niet verwerken.", detail: String(err.message || err) });
  }
};
