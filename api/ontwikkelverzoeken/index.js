/**
 * /api/ontwikkelverzoeken — intern bord voor bugmeldingen en functionaliteitsverzoeken van
 * medewerkers. Gedeeld (iedere medewerker ziet alles); alleen beheerders zetten status, wijzigen
 * prioriteit en plaatsen reacties. Medewerkers kunnen stemmen. Route: medewerker/beheerder.
 *
 *   GET                         → { verzoeken, isBeheerder, mijnEmail }
 *   GET ?afbeelding=<id>        → streamt de screenshot van dat verzoek
 *   POST { type, titel, omschrijving, prioriteit, afbeeldingData? }  → nieuw verzoek
 *   PATCH { id, actie:"stem" }                                       → stem toggelen (medewerker)
 *   PATCH { id, actie:"status"|"prioriteit"|"bewerk"|"reactie", ... } → beheerder
 *   DELETE ?id=                 → verwijderen (beheerder)
 */
const { haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const store = require("../_gedeeld/ontwikkelverzoekenStore");

function json(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json" }, body }; }

// Verwijdert interne velden (blob-naam) en voegt afgeleide velden toe voor de frontend.
function naarBuiten(v, email) {
  const e = String(email || "").toLowerCase();
  const stemmen = (v.stemmen || []).map((x) => String(x).toLowerCase());
  return {
    id: v.id, type: v.type, titel: v.titel, omschrijving: v.omschrijving,
    prioriteit: v.prioriteit, status: v.status,
    indienerEmail: v.indienerEmail, indienerNaam: v.indienerNaam,
    aangemaaktOp: v.aangemaaktOp, gewijzigdOp: v.gewijzigdOp, afgehandeldDoor: v.afgehandeldDoor || "",
    stemmen: stemmen.length,
    ikStem: !!e && stemmen.includes(e),
    reacties: v.reacties || [],
    heeftAfbeelding: !!(v.afbeelding && v.afbeelding.blob),
  };
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  const isBeheerder = rollen.includes("beheerder");
  if (!(isBeheerder || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });
  const email = haalEmailUitPrincipal(req);
  if (!email) return json(context, 401, { error: "Kon geen e-mailadres uit de ingelogde gebruiker halen." });
  const naam = haalNaamUitPrincipal(req) || email;
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      // Screenshot streamen.
      const afbId = req.query && req.query.afbeelding;
      if (afbId) {
        const alle = await store.haalAlle();
        const v = alle.find((x) => x.id === afbId);
        if (!v || !v.afbeelding || !v.afbeelding.blob) return json(context, 404, { error: "Geen afbeelding." });
        const afb = await store.haalAfbeelding(v.afbeelding.blob);
        if (!afb) return json(context, 404, { error: "Afbeelding niet gevonden." });
        context.res = {
          status: 200,
          isRaw: true,
          headers: { "Content-Type": afb.contentType, "Cache-Control": "private, max-age=3600" },
          body: afb.buffer,
        };
        return;
      }
      const verzoeken = (await store.haalAlle()).map((v) => naarBuiten(v, email));
      return json(context, 200, { verzoeken, isBeheerder, mijnEmail: email.toLowerCase() });
    }

    if (methode === "POST") {
      const b = req.body || {};
      if (!b.titel || !String(b.titel).trim()) return json(context, 400, { error: "Geef een titel op." });
      if (!store.TYPES.includes(String(b.type))) return json(context, 400, { error: "Kies bug of functionaliteit." });
      const v = await store.voegToe({
        type: b.type, titel: b.titel, omschrijving: b.omschrijving, prioriteit: b.prioriteit,
        indienerEmail: email, indienerNaam: naam, afbeeldingData: b.afbeeldingData,
      });
      return json(context, 200, { ok: true, verzoek: naarBuiten(v, email) });
    }

    if (methode === "PATCH") {
      const b = req.body || {};
      if (!b.id) return json(context, 400, { error: "Geef een id mee." });
      const actie = String(b.actie || "");

      if (actie === "stem") {
        const v = await store.stemToggle(b.id, email);
        if (!v) return json(context, 404, { error: "Verzoek niet gevonden." });
        return json(context, 200, { ok: true, verzoek: naarBuiten(v, email) });
      }

      // Overige acties zijn alleen voor beheerders.
      if (!isBeheerder) return json(context, 403, { error: "Alleen een beheerder kan dit wijzigen." });

      if (actie === "reactie") {
        const v = await store.voegReactieToe(b.id, { door: naam, email, tekst: b.tekst });
        if (!v) return json(context, 404, { error: "Verzoek niet gevonden." });
        return json(context, 200, { ok: true, verzoek: naarBuiten(v, email) });
      }

      // status / prioriteit / bewerk (titel/omschrijving/type).
      const velden = {};
      if (b.status) velden.status = b.status;
      if (b.prioriteit) velden.prioriteit = b.prioriteit;
      if (b.type) velden.type = b.type;
      if (typeof b.titel === "string") velden.titel = b.titel;
      if (typeof b.omschrijving === "string") velden.omschrijving = b.omschrijving;
      const v = await store.werkBij(b.id, velden, naam);
      if (!v) return json(context, 404, { error: "Verzoek niet gevonden." });
      return json(context, 200, { ok: true, verzoek: naarBuiten(v, email) });
    }

    if (methode === "DELETE") {
      if (!isBeheerder) return json(context, 403, { error: "Alleen een beheerder kan een verzoek verwijderen." });
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return json(context, 400, { error: "Geef een id mee." });
      const weg = await store.verwijder(id);
      return json(context, 200, { ok: weg });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "Opslag is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon het ontwikkelverzoek niet verwerken.", detail: String(err.message || err) });
  }
};
