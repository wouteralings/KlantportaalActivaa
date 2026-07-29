const { isBeheerder, maakTariefKolommenVoorDienst } = require("../_gedeeld/offertesOnboarding");

// Op verzoek (knop "Kolom aanmaken in Dataverse" bij "Tarieven — kolom-koppeling" in
// Instellingen) een eigen bedrag- en omschrijvingkolom aanmaken op cr283_tarief voor één
// dienst — zie maakTariefKolommenVoorDienst in api/_gedeeld/offertesOnboarding.js voor de
// daadwerkelijke Metadata-API-aanroepen. Beheerders-only (zie isBeheerder): dit vereist
// dat de Application User permanent de systeemrol "System Customizer" (of hoger) heeft,
// een bredere/standing bevoegdheid dan voor gewoon dagelijks gebruik nodig is — vandaar
// de extra toegangsdrempel bovenop de normale "authenticated"-routeregel.
module.exports = async function (context, req) {
  // CSRF-drempel, zelfde patroon als bij api/instellingen en api/dataverse-schema-setup.
  if (req.headers["x-requested-with"] !== "offertetool") {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldig verzoek." } };
    return;
  }

  try {
    if (!(await isBeheerder(req))) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { ok: false, error: "Alleen beheerders kunnen kolommen aanmaken in Dataverse." },
      };
      return;
    }

    const dienstNaam = (req.body?.dienstNaam || "").trim();
    if (!dienstNaam) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { ok: false, error: "Veld 'dienstNaam' ontbreekt in de request body." },
      };
      return;
    }

    const { bedragKolom, omschrijvingKolom } = await maakTariefKolommenVoorDienst(dienstNaam);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, bedragKolom, omschrijvingKolom },
    };
  } catch (err) {
    context.log.error(err);
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { ok: false, error: "Dynamics-koppeling is nog niet geconfigureerd (ontbrekende Application Settings)." },
      };
      return;
    }
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { ok: false, error: err.message || "Aanmaken van de kolommen is mislukt. Probeer het later opnieuw." },
    };
  }
};
