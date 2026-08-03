/**
 * POST /api/contracten-reminders — verstuurt voor elk contract (over ALLE klantaccounts heen)
 * dat een verloopdrempel heeft bereikt een herinneringsmail aan de klant zelf, zie
 * api/_gedeeld/contractenReminders.js voor de volledige drempel-logica.
 *
 * Bedoeld om dagelijks aangeroepen te worden door een EXTERN schema — Azure Static Web Apps'
 * managed functions ondersteunen zelf geen tijdklok-trigger, dus dit endpoint wordt aangeroepen
 * door bijv. een dagelijkse Power Automate "geplande cloudflow" (Recurrence-trigger →
 * HTTP-actie POST naar dit endpoint), zelfde patroon als /api/verwerk-terugkerende-facturen.
 *
 * BEVEILIGING: net als verwerk-terugkerende-facturen staat dit endpoint bewust op "anonymous"
 * in staticwebapp.config.json — de controle hier ís de enige poort: een geheime sleutel,
 * meegegeven als header 'x-verwerk-sleutel' of als querystring '?sleutel=...', die moet
 * overeenkomen met de omgevingsvariabele CONTRACTEN_REMINDER_SECRET (een EIGEN sleutel, los van
 * TERUGKEREND_TRIGGER_SECRET, zodat de twee schema's onafhankelijk in- en uitgeschakeld kunnen
 * worden). Zonder die omgevingsvariabele (nog) ingesteld weigert dit endpoint altijd (501).
 */
const { verwerkReminders } = require("../_gedeeld/contractenReminders");

module.exports = async function (context, req) {
  const verwachteSleutel = process.env.CONTRACTEN_REMINDER_SECRET;
  if (!verwachteSleutel) {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "CONTRACTEN_REMINDER_SECRET is nog niet geconfigureerd — dit endpoint staat uit." },
    };
    return;
  }

  const meegegevenSleutel = req.headers?.["x-verwerk-sleutel"] || req.query?.sleutel || "";
  if (meegegevenSleutel !== verwachteSleutel) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldige of ontbrekende sleutel." } };
    return;
  }

  try {
    const resultaten = await verwerkReminders();
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        verwerkt: resultaten.length,
        verzonden: resultaten.filter((r) => r.verzonden).length,
        overgeslagen: resultaten.filter((r) => !r.verzonden && !r.fout).length,
        mislukt: resultaten.filter((r) => r.fout).length,
        resultaten,
      },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het verwerken van de contracten-verloopherinneringen.", detail: String(err.message || err) },
    };
  }
};
