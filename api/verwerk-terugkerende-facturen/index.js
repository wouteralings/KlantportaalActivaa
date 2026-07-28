/**
 * POST /api/verwerk-terugkerende-facturen — genereert voor elk vervallen sjabloon in
 * dbo.facturen_terugkerend (over ALLE klantaccounts heen) een nieuwe conceptfactuur, verstuurt
 * 'm meteen (mét e-mail+PDF) als "automatisch verzenden" aanstaat, en schuift de sjabloon dan
 * een frequentie-stap door (zie verwerkGegenereerd in facturenTerugkerend.js).
 *
 * Bedoeld om periodiek aangeroepen te worden door een EXTERN schema — Azure Static Web Apps'
 * managed functions ondersteunen zelf geen tijdklok-trigger (Timer-binding), dus dit endpoint
 * wordt aangeroepen door bijv. een dagelijkse Power Automate "geplande cloudflow"
 * (Recurrence-trigger → HTTP-actie POST naar dit endpoint). Zie README/Context/Facturatiemodule.md
 * voor de instructies om die flow in te richten.
 *
 * BEVEILIGING: dit endpoint staat in staticwebapp.config.json bewust op "anonymous" (Power
 * Automate logt niet in met een Microsoft-account van deze tenant), dus de controle hier ís de
 * enige poort: een geheime sleutel, meegegeven als header 'x-verwerk-sleutel' of als
 * querystring '?sleutel=...', die moet overeenkomen met de omgevingsvariabele
 * TERUGKEREND_TRIGGER_SECRET. Zonder die omgevingsvariabele (nog) ingesteld weigert dit
 * endpoint altijd (501) — er is dan bewust geen "open" fallback.
 */
const { haalVervallenSjablonen, verwerkGegenereerd } = require("../_gedeeld/facturenTerugkerend");
const { maakFactuur, verstuurFactuur } = require("../_gedeeld/facturenKlanten");

const SYSTEEM_EMAIL = "systeem (terugkerende facturen)";

module.exports = async function (context, req) {
  const verwachteSleutel = process.env.TERUGKEREND_TRIGGER_SECRET;
  if (!verwachteSleutel) {
    context.res = {
      status: 501,
      headers: { "Content-Type": "application/json" },
      body: { error: "TERUGKEREND_TRIGGER_SECRET is nog niet geconfigureerd — dit endpoint staat uit." },
    };
    return;
  }

  const meegegevenSleutel = req.headers?.["x-verwerk-sleutel"] || req.query?.sleutel || "";
  if (meegegevenSleutel !== verwachteSleutel) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldige of ontbrekende sleutel." } };
    return;
  }

  try {
    const sjablonen = await haalVervallenSjablonen();
    const resultaten = [];

    for (const sjabloon of sjablonen) {
      try {
        const nieuweFactuur = await maakFactuur(sjabloon.klantAccountId, {
          documenttype: "factuur",
          klantKlantId: sjabloon.klantKlantId,
          regels: sjabloon.regels,
          betalingstermijnDagen: sjabloon.betalingstermijnDagen,
          leveringsperiodeStart: sjabloon.leveringsperiodeStart,
          leveringsperiodeEind: sjabloon.leveringsperiodeEind,
          opmerkingen: sjabloon.opmerkingen,
          terugkerendId: sjabloon.id,
        }, SYSTEEM_EMAIL);

        let verzonden = null;
        if (sjabloon.automatischVerzenden) {
          verzonden = await verstuurFactuur(sjabloon.klantAccountId, nieuweFactuur.id, SYSTEEM_EMAIL, context);
        }

        // Pas ná succesvol aanmaken (en evt. versturen) de sjabloon doorschuiven — mislukt er
        // iets hierboven, dan blijft de sjabloon op dezelfde volgende_factuurdatum staan en
        // wordt er bij de eerstvolgende run opnieuw geprobeerd i.p.v. stilzwijgend overgeslagen.
        await verwerkGegenereerd(sjabloon);

        resultaten.push({
          terugkerendId: sjabloon.id,
          klantAccountId: sjabloon.klantAccountId,
          factuurId: nieuweFactuur.id,
          nummer: verzonden ? verzonden.nummer : null,
          verzonden: !!verzonden,
          emailVerzonden: verzonden ? verzonden.emailVerzonden : null,
          emailFout: verzonden ? verzonden.emailFout : null,
        });
      } catch (err) {
        context.log.error(`verwerk-terugkerende-facturen: sjabloon ${sjabloon.id} mislukt:`, err);
        resultaten.push({
          terugkerendId: sjabloon.id,
          klantAccountId: sjabloon.klantAccountId,
          fout: String(err.message || err),
        });
      }
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        verwerkt: resultaten.length,
        mislukt: resultaten.filter((r) => r.fout).length,
        resultaten,
      },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het verwerken van terugkerende facturen.", detail: String(err.message || err) },
    };
  }
};
