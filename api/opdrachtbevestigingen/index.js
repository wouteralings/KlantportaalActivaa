const { metOffertesRecht } = require("../_gedeeld/offertesRecht");
const { lijstRuweOpdrachtbevestigingen } = require("../_gedeeld/offertesOpslag");
const { verwerkVerlopenTarieven } = require("../_gedeeld/offertesOnboarding");

const handler = async function (context, req) {
  try {
    const alle = await lijstRuweOpdrachtbevestigingen();

    // Automatisch verlopen tarieven (data.tariefEinddatum in het verleden) omzetten naar een
    // concept-vervolg-opdrachtbevestiging + evt. Dynamics-taak — piggybackt bewust op deze toch
    // al volledige lijst-ophaal-actie i.p.v. een apart, extern getriggerd endpoint (zie
    // verwerkVerlopenTarieven in api/_gedeeld/offertesOnboarding.js en README, sectie "Automatisch
    // concept na einddatum tarieven"). Draait dus mee zodra iemand dit overzicht opent; idempotent,
    // dus nooit een probleem als meerdere collega's op dezelfde dag het overzicht openen. Een
    // mislukking hier mag het overzicht zelf nooit blokkeren.
    let nieuweConcepten = [];
    try {
      nieuweConcepten = await verwerkVerlopenTarieven(alle, (bericht) => context.log(bericht));
    } catch (e) {
      context.log.error("Verlopen-tarieven-verwerking mislukt:", e);
    }

    const samenvattingen = [];
    for (const record of [...alle, ...nieuweConcepten]) {
      try {
        // Alleen de samenvatting teruggeven voor het overzicht — niet de volledige
        // inhoud (diensten, prijzen, paragraafteksten), die is alleen nodig bij het
        // daadwerkelijk openen van één specifieke opdrachtbevestiging.
        const bekekenEvents = (record.logboek || []).filter((e) => e.gebeurtenis === "geopend");
        const laatsteBekeken = bekekenEvents.length > 0 ? bekekenEvents[bekekenEvents.length - 1] : null;

        samenvattingen.push({
          id: record.id,
          klantNamen: record.klantNamen || [],
          klantGroepen: record.klantGroepen || [],
          opdrachttypeId: record.opdrachttypeId || null,
          opdrachttypeNaam: record.opdrachttypeNaam || "",
          status: record.status || "in_bewerking",
          aangemaaktOp: record.aangemaaktOp,
          aangemaaktDoor: record.aangemaaktDoor,
          gewijzigdOp: record.gewijzigdOp,
          gewijzigdDoor: record.gewijzigdDoor,
          aantalBekeken: bekekenEvents.length,
          laatstBekekenOp: laatsteBekeken?.op || null,
          laatstBekekenIp: laatsteBekeken?.ip || null,
          // Zie verwerkVerlopenTarieven — markeert een concept dat automatisch is aangemaakt na
          // een verstreken tarieven-einddatum, i.p.v. handmatig door een collega gestart, zodat
          // het overzicht dit apart kan tonen.
          automatischGegenereerd: !!record.automatischGegenereerd,
        });
      } catch (e) {
        // Eén corrupte/onleesbare opdrachtbevestiging mag de rest van het overzicht
        // niet blokkeren.
        context.log.error(`Kon opdrachtbevestiging ${record.id} niet verwerken:`, e);
      }
    }

    samenvattingen.sort((a, b) => new Date(b.gewijzigdOp) - new Date(a.gewijzigdOp));

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: samenvattingen,
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "Opslag is nog niet geconfigureerd (ontbrekende STORAGE_CONNECTION_STRING)." },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Er ging iets mis. Probeer het later opnieuw." },
    };
  }
};

// Alleen bereikbaar voor medewerkers met het offertes-recht (en voor beheerders) — zie
// api/_gedeeld/offertesRecht.js. Het verbergen van de tab in het portaal is cosmetisch;
// dit is de plek waar het daadwerkelijk wordt tegengehouden.
module.exports = metOffertesRecht(handler);
