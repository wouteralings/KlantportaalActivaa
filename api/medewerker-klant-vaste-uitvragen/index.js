/**
 * /api/medewerker-klant-vaste-uitvragen — per klant een aanleverlijst inrichten als "vaste uitvraag":
 * eventueel aangepaste documentregels + een toegewezen contactpersoon (mits die het aanleveren-recht
 * heeft). Zo staat de uitvraag klaar en is hij het jaar erop met één klik opnieuw uit te zetten.
 *
 *   - GET ?accountId=  → { lijsten:[{id,naam,omschrijving,pad,regels,aantalRegels}], vaste:{ lijstId: item } }
 *   - PUT { accountId, lijstId, item:{ regels|null, contactId, contactNaam, notitie } } → opslaan (audit)
 *   - POST { actie:"verwijderen", accountId, lijstId } → vaste uitvraag verwijderen
 *
 * Lezen mag medewerker + beheerder; wijzigen vereist het klant-wijzig-recht (magWijzigen).
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen } = require("../_gedeeld/wijzigrechten");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");
const documentrechten = require("../_gedeeld/documentrechten");
const vasteUitvragen = require("../_gedeeld/klantvasteuitvragen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

module.exports = async function (context, req) {
  const methode = (req.method || "GET").toUpperCase();
  const email = haalEmailUitPrincipal(req);
  const rollen = haalRollenUitPrincipal(req);
  const beheerder = rollen.includes("beheerder");
  const medewerker = beheerder || rollen.includes("medewerker");

  try {
    // Alleen medewerkers/beheerders; klanten (enkel 'authenticated') komen hier niet in.
    if (!medewerker) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
      return;
    }

    if (methode === "GET") {
      const accountId = (req.query.accountId || "").trim();
      if (!accountId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' mee." } }; return; }
      const [lijstenRuw, vaste] = await Promise.all([
        haalLijsten(),
        vasteUitvragen.haalVoorKlant(accountId),
      ]);
      const lijsten = lijstenRuw.map((l) => ({ id: l.id, naam: l.naam, omschrijving: l.omschrijving, pad: l.pad || "", regels: l.regels || [], aantalRegels: (l.regels || []).length }));
      context.res = { headers: { "Content-Type": "application/json" }, body: { lijsten, vaste } };
      return;
    }

    if (methode === "PUT") {
      if (!(await magWijzigen(email, beheerder))) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen rechten om dit te wijzigen." } };
        return;
      }
      const { accountId, lijstId, item } = req.body || {};
      if (!accountId || !lijstId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' en 'lijstId' mee." } }; return; }

      // De lijst moet bestaan (voorkomt vaste uitvragen op een verwijderde/onbekende lijst).
      const lijst = (await haalLijsten()).find((l) => l.id === lijstId);
      if (!lijst) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Gekozen aanleverlijst niet gevonden." } }; return; }

      // Contactpersoon toewijzen mag alleen als die het aanleveren-recht heeft.
      const contactId = (item && item.contactId) || "";
      if (contactId) {
        const rechten = await documentrechten.haalVoorContact(contactId);
        if (!rechten.aanleveren) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Deze contactpersoon heeft geen aanleveren-recht. Ken dat eerst toe bij de contactpersoon (Documentrechten → Aanleveren).", code: "GEEN_AANLEVEREN_RECHT" } };
          return;
        }
      }

      const opgeslagen = await vasteUitvragen.zetItem(accountId, lijstId, item || {}, { door: email || "onbekend" });

      await logGebeurtenis({
        door: email || "onbekend",
        actie: "vaste-uitvraag",
        accountId,
        accountIds: [accountId],
        contactId: opgeslagen.contactId || undefined,
        contactNaam: opgeslagen.contactNaam || undefined,
        tekst: `Vaste uitvraag "${lijst.naam}" ingericht${opgeslagen.contactNaam ? ` voor ${opgeslagen.contactNaam}` : ""} (${Array.isArray(opgeslagen.regels) ? opgeslagen.regels.length + " aangepaste documenten" : "lijst uit beheer"}).`,
      });

      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, item: opgeslagen } };
      return;
    }

    if (methode === "POST") {
      const { actie, accountId, lijstId } = req.body || {};
      if (actie !== "verwijderen") { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } }; return; }
      if (!(await magWijzigen(email, beheerder))) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen rechten om dit te wijzigen." } };
        return;
      }
      if (!accountId || !lijstId) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' en 'lijstId' mee." } }; return; }
      const weg = await vasteUitvragen.verwijderItem(accountId, lijstId);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: weg } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de vaste uitvragen niet verwerken.", detail: String(err.message || err) } };
  }
};
