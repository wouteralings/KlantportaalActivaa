/**
 * /api/beheer-formulieren — PDF-formulieren toevoegen en beheren (Beheer → Brieven → Formulieren).
 * Beheerder-only (route in staticwebapp.config.json).
 *
 *   GET                      → { formulieren: [{ id, naam, omschrijving, aantalPaginas, velden, instellingen }] }
 *   POST { naam, omschrijving, dataUrl }
 *                            → { formulier }   nieuw formulier; de velden worden uit de PDF gelezen
 *   PUT  { id, naam?, omschrijving?, instellingen? }
 *                            → { formulier }   naam of veldinstellingen bijwerken
 *   DELETE ?id=<id>          → { ok, gedaan }
 *
 * Bij het uploaden lezen we meteen de invulbare velden uit. Levert dat niets op, dan is het geen
 * invulbaar formulier (een platte of gescande PDF) of een XFA-formulier van Adobe LiveCycle. In
 * beide gevallen weigeren we het: een formulier dat niet te vullen is hoort niet in de lijst te
 * staan alsof het wel werkt.
 */
const { haalFormulieren, voegFormulierToe, werkFormulierBij, verwijderFormulier, leesVelden } = require("../_gedeeld/formulieren");

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });
const veiligeStr = (v) => String(v == null ? "" : v).trim();

/** Eenvoudige, leesbare id uit de naam — met een teller erachter als die al bestaat. */
function maakId(naam, bestaand) {
  const basis = veiligeStr(naam).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "formulier";
  let id = basis;
  let n = 2;
  while (bestaand.some((f) => f.id === id)) { id = `${basis}-${n}`; n += 1; }
  return id;
}

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  try {
    if (methode === "GET") {
      context.res = json(200, { formulieren: await haalFormulieren() });
      return;
    }

    if (methode === "POST") {
      const body = (req.body && typeof req.body === "object") ? req.body : {};
      const naam = veiligeStr(body.naam);
      const dataUrl = veiligeStr(body.dataUrl);
      if (!naam) { context.res = json(400, { error: "Geef het formulier een naam." }); return; }
      const match = /^data:application\/pdf;base64,(.+)$/i.exec(dataUrl);
      if (!match) { context.res = json(400, { error: "Kies een PDF-bestand." }); return; }

      const pdfBuffer = Buffer.from(match[1], "base64");
      let uitgelezen;
      try {
        uitgelezen = await leesVelden(pdfBuffer);
      } catch (e) {
        context.res = json(400, { error: "Deze PDF kon niet gelezen worden.", detail: String((e && e.message) || e) });
        return;
      }
      if (uitgelezen.heeftXfa) {
        context.res = json(400, {
          error: "Dit is een XFA-formulier (gemaakt met Adobe LiveCycle). Zulke formulieren kunnen niet automatisch ingevuld worden. Vraag de uitgever om een gewone invulbare PDF, of vul dit formulier online in bij de uitgever zelf.",
        });
        return;
      }
      if (!uitgelezen.velden.some((v) => !v.automatisch)) {
        context.res = json(400, {
          error: "In deze PDF zitten geen invulbare velden. Waarschijnlijk is het een platte of gescande PDF. Alleen echte invulbare formulieren kunnen hier worden ingevuld.",
        });
        return;
      }

      const bestaand = await haalFormulieren();
      // Bestaat er al een formulier met exact deze naam, dan vervangen we de PDF daarvan — dat is wat
      // je wilt bij een nieuwe jaargang van hetzelfde formulier. De veldinstellingen blijven staan.
      const zelfdeNaam = bestaand.find((f) => f.naam.toLowerCase() === naam.toLowerCase());
      const id = zelfdeNaam ? zelfdeNaam.id : maakId(naam, bestaand);

      const formulier = await voegFormulierToe({
        id, naam, omschrijving: body.omschrijving,
        pdfBuffer, velden: uitgelezen.velden, aantalPaginas: uitgelezen.aantalPaginas,
      });
      context.res = json(200, { formulier, vervangen: !!zelfdeNaam });
      return;
    }

    if (methode === "PUT") {
      const body = (req.body && typeof req.body === "object") ? req.body : {};
      const id = veiligeStr(body.id);
      if (!id) { context.res = json(400, { error: "Geef 'id' mee." }); return; }
      const formulier = await werkFormulierBij(id, body);
      if (!formulier) { context.res = json(404, { error: "Formulier niet gevonden." }); return; }
      context.res = json(200, { formulier });
      return;
    }

    if (methode === "DELETE") {
      const id = veiligeStr(req.query && req.query.id);
      if (!id) { context.res = json(400, { error: "Geef 'id' mee." }); return; }
      context.res = json(200, { ok: true, gedaan: await verwijderFormulier(id) });
      return;
    }

    context.res = json(405, { error: "Methode niet ondersteund." });
  } catch (err) {
    if (err && err.message === "MISSING_CONFIG") {
      context.res = json(501, { error: "De opslag is nog niet geconfigureerd." });
      return;
    }
    if (context.log) context.log.error("beheer-formulieren:", err);
    context.res = json(500, { error: "Onverwachte fout bij de formulieren.", detail: String((err && err.message) || err) });
  }
};
