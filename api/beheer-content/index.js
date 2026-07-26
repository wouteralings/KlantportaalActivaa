const { haalItems, voegItemToe, werkItemBij, verwijderItem, herschikItems } = require("../_gedeeld/content");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 * Ken die rol toe aan jullie eigen medewerkers via Static Web Apps > Role management.
 *
 * GET    ?type=programma|mededeling|faq        → lijst
 * POST   body: { type, ... } → aanmaken (zie veldeisen hieronder)
 * PUT    body: { type, id, ... } → bijwerken
 * DELETE ?type=...&id=...                            → verwijderen
 *
 * Veldeisen per type: programma → titel + url, mededeling → titel + tekst, faq → vraag + antwoord.
 * klantcategorieen is een array van labels zoals ze in Dataverse staan (bijv. ["Zorg", "Bouw"]).
 * Leeg of weggelaten = zichtbaar voor alle klanten.
 */
module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const type = req.query.type;
      if (!type) {
        context.res = { status: 400, body: { error: "Geef 'type' mee: programma of mededeling." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: await haalItems(type) };
      return;
    }

    if (req.method === "POST") {
      const { type, ...velden } = req.body || {};
      const verplichtOntbreekt =
        !type || !(
          (type === "programma" && velden.titel && velden.url) ||
          (type === "mededeling" && velden.titel && velden.tekst) ||
          (type === "faq" && velden.vraag && velden.antwoord)
        );
      if (verplichtOntbreekt) {
        context.res = {
          status: 400,
          body: {
            error:
              "Verplicht per type: programma → titel + url, mededeling → titel + tekst, faq → vraag + antwoord.",
          },
        };
        return;
      }
      const nieuw = await voegItemToe(type, velden);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: nieuw };
      return;
    }

    if (req.method === "PUT") {
      const { type, id, ...velden } = req.body || {};
      if (!type || !id) {
        context.res = { status: 400, body: { error: "Geef zowel 'type' als 'id' mee." } };
        return;
      }
      const bijgewerkt = await werkItemBij(type, id, velden);
      if (!bijgewerkt) {
        context.res = { status: 404, body: { error: "Item niet gevonden." } };
        return;
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: bijgewerkt };
      return;
    }

    if (req.method === "PATCH") {
      const { type, volgorde } = req.body || {};
      if (!type || !Array.isArray(volgorde)) {
        context.res = { status: 400, body: { error: "Geef 'type' en 'volgorde' (array van id's) mee." } };
        return;
      }
      const geordend = await herschikItems(type, volgorde);
      context.res = { headers: { "Content-Type": "application/json" }, body: geordend };
      return;
    }

    if (req.method === "DELETE") {
      const { type, id } = req.query;
      if (!type || !id) {
        context.res = { status: 400, body: { error: "Geef zowel 'type' als 'id' mee." } };
        return;
      }
      const verwijderd = await verwijderItem(type, id);
      context.res = { headers: { "Content-Type": "application/json" }, body: { verwijderd } };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    if (err.code === "ONGELDIG_TYPE") {
      context.res = { status: 400, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij contentbeheer.", detail: String(err) },
    };
  }
};
