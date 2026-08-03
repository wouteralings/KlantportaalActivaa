/**
 * POST /api/bezittingen-status  body { accountId, bezittingId, nietMeerInBezit, datum?, opmerking? }
 *
 * Legt vast (of maakt ongedaan) dat een klant heeft aangegeven dat één bezitting niet meer in
 * zijn bezit is — zie bezittingenStatus.js voor de opslag. Zelfde toegangscontrole als
 * api/bezittingen (accountId hoort bij de ingelogde gebruiker + module staat aan voor dat
 * account) via controleerBezittingenToegang, die ook automatisch een "meekijken als klant"-sessie
 * (alleen-lezen) weigert — zie identiteit.js.
 *
 * bezittingId wordt gevalideerd tegen de daadwerkelijk gegenereerde lijst van dit account, zodat
 * er geen status voor een niet-bestaand of bij een ander account horend id kan worden opgeslagen.
 *
 * Bij het (opnieuw) melden van "niet meer in bezit" wordt er, op verzoek van Wouter, ook een
 * wijzigingsverzoek aangemaakt (type "bezitting_niet_meer_in_bezit") — zo ziet een medewerker dit
 * in de bestaande "Wijzigingsverzoeken"-lijst in het medewerkersportaal en weet hij dat de
 * bezitting handmatig verwerkt moet worden (bijv. afgevoerd in Exact Online). Er is voor dit type
 * geen geautomatiseerd doelsysteem om naar weg te schrijven bij goedkeuren — zie de dispatch in
 * api/beheer-wijzigingen/index.js, die voor dit type simpelweg niets extra's doet.
 */
const { controleerBezittingenToegang, afhandelFout } = require("../_gedeeld/bezittingenToegang");
const { genereerDemoBezittingen } = require("../_gedeeld/bezittingenData");
const { zetStatus } = require("../_gedeeld/bezittingenStatus");
const { voegVerzoekToe } = require("../_gedeeld/wijzigingen");

module.exports = async function (context, req) {
  try {
    const { email, accountId, account } = await controleerBezittingenToegang(req);

    if (req.method !== "POST") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }

    const bezittingId = req.body && req.body.bezittingId;
    if (!bezittingId) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'bezittingId' mee." } };
      return;
    }
    const bezitting = genereerDemoBezittingen(accountId).find((b) => b.id === bezittingId);
    if (!bezitting) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende bezitting voor dit klantaccount." } };
      return;
    }

    const nietMeerInBezit = !!(req.body && req.body.nietMeerInBezit);
    const datum = req.body && req.body.datum;
    if (nietMeerInBezit && datum && isNaN(new Date(datum).getTime())) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldige datum." } };
      return;
    }
    const opmerking = req.body && req.body.opmerking;

    const status = await zetStatus(accountId, bezittingId, { nietMeerInBezit, datum, opmerking }, email);

    if (nietMeerInBezit) {
      // Best effort: als het aanmaken van het wijzigingsverzoek faalt (bijv. opslag niet
      // geconfigureerd), mag dat de eigenlijke statuswijziging — die al is opgeslagen — niet
      // laten mislukken.
      try {
        await voegVerzoekToe({
          type: "bezitting_niet_meer_in_bezit",
          accountId,
          klantnummer: account?.klantnummer,
          klantnaam: account?.klantnaam,
          aanvragerEmail: email,
          huidig: { bezitting: `${bezitting.omschrijving} — in bezit` },
          voorstel: {
            bezitting: `${bezitting.omschrijving} — niet meer in bezit${status?.datum ? ` sinds ${status.datum}` : ""}`,
            reden: (status && status.opmerking) || "",
          },
        });
      } catch (verzoekFout) {
        context.log.error("Aanmaken wijzigingsverzoek voor 'niet meer in bezit' mislukt:", verzoekFout);
      }
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { bezittingId, status: status || { nietMeerInBezit: false } } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
