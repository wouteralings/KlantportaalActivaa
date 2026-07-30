/**
 * /api/medewerker-aanleververzoeken — medewerkers/beheerders zetten een aanleverlijst uit als
 * verzoek naar een cliënt/contactpersoon, en beheren de lopende verzoeken. Route is beveiligd via
 * staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 *
 *   - GET [?accountId=]                         → { verzoeken: [...] }
 *   - POST { actie:"uitzetten", accountId, contactId, lijstId?, regels?, notitie? } → nieuw verzoek
 *   - POST { actie:"verwijderen", id }          → verzoek verwijderen
 */
const { haalDynamicsToken, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");
const { haalOnderwerpen, resolvePad } = require("../_gedeeld/aanleveronderwerpen");
const klantonderwerpen = require("../_gedeeld/klantonderwerpen");
const verzoeken = require("../_gedeeld/aanleververzoeken");
const { logGebeurtenis } = require("../_gedeeld/klantlog");

const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";

function leesHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
}

async function haalAccount(resource, token, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${CLIENTNUMMER_VELD}`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const a = await res.json();
  const nummer = a[CLIENTNUMMER_VELD];
  return { klantnaam: a.name || "", klantnummer: nummer != null && nummer !== "" ? String(nummer) : "" };
}

async function haalContactNaam(resource, token, contactId) {
  const url = `${resource}/api/data/v9.2/contacts(${contactId})?$select=fullname`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return "";
  return (await res.json()).fullname || "";
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const email = haalEmailUitPrincipal(req);
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const accountId = (req.query.accountId || "").trim();
      let lijst = await verzoeken.haalAlle();
      if (accountId) lijst = lijst.filter((v) => v.accountId === accountId);
      lijst.sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));
      // Ook de beschikbare aanleverlijsten meesturen, zodat een medewerker (zonder beheerrecht op
      // /api/beheer-aanleverlijsten) een verzoek kan samenstellen.
      const lijsten = (await haalLijsten()).map((l) => ({ id: l.id, naam: l.naam, omschrijving: l.omschrijving, aantalRegels: (l.regels || []).length }));
      context.res = { headers: { "Content-Type": "application/json" }, body: { verzoeken: lijst, lijsten } };
      return;
    }

    if (methode !== "POST" && methode !== "PATCH") {
      context.res = { status: 405, body: { error: "Methode niet toegestaan." } };
      return;
    }

    const { actie, id, accountId, contactId, lijstId, onderwerpId, jaar, gebruikAlgemeen, regels, notitie } = req.body || {};

    if (actie === "verwijderen") {
      if (!id) { context.res = { status: 400, body: { error: "Geef 'id' mee." } }; return; }
      const weg = await verzoeken.verwijder(id);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: weg } };
      return;
    }

    if (actie === "uitzetten") {
      if (!accountId || !contactId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' en 'contactId' mee." } };
        return;
      }

      // Onderwerp bepaalt de opslagmap (via {jaar}/{onderwerp} in het pad).
      let onderwerp = null;
      let map = [];
      if (onderwerpId) {
        onderwerp = (await haalOnderwerpen()).find((o) => o.id === onderwerpId) || null;
        if (!onderwerp) { context.res = { status: 404, body: { error: "Gekozen onderwerp niet gevonden." } }; return; }
        map = resolvePad(onderwerp.pad, { jaar, onderwerp: onderwerp.naam });
      }

      // Regels: de frontend stuurt de effectieve lijst (voorgevuld + vrije regels). Ontbreekt die,
      // dan leiden we ze hier af: klant-specifiek (voorrang) of de algemene lijst van het onderwerp.
      let bronRegels = Array.isArray(regels) ? regels : [];
      let lijstNaam = onderwerp ? onderwerp.naam : "";
      if (!bronRegels.length && onderwerp) {
        const klantConfig = (await klantonderwerpen.haalVoorKlant(accountId))[onderwerpId];
        if (klantConfig && Array.isArray(klantConfig.regels) && !gebruikAlgemeen) {
          bronRegels = klantConfig.regels;
        } else if (onderwerp.standaardLijstId) {
          const lijst = (await haalLijsten()).find((l) => l.id === onderwerp.standaardLijstId);
          if (lijst) bronRegels = lijst.regels;
        }
      }
      if (!bronRegels.length && lijstId) {
        const lijst = (await haalLijsten()).find((l) => l.id === lijstId);
        if (!lijst) { context.res = { status: 404, body: { error: "Gekozen aanleverlijst niet gevonden." } }; return; }
        bronRegels = lijst.regels; lijstNaam = lijst.naam;
      }
      // De frontend stuurt vaak zelf de regels mee (bronRegels al gevuld); zet dan alsnog de
      // lijstnaam als er een lijst is gekozen maar (nog) geen onderwerp/naam bekend is.
      if (lijstId && !lijstNaam) {
        const lijst = (await haalLijsten()).find((l) => l.id === lijstId);
        if (lijst) lijstNaam = lijst.naam;
      }
      if (!bronRegels.length) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies een onderwerp of lijst, of geef minimaal één regel mee." } };
        return;
      }

      // Geen onderwerp maar wél een lijst? Dan bepaalt het mappad van de lijst de opslaglocatie
      // (plaatshouders {jaar} en {lijst}). Leeg pad → de vaste 'Aanleveren'-map (map blijft leeg).
      if (!map.length && lijstId) {
        const lijst = (await haalLijsten()).find((l) => l.id === lijstId);
        if (lijst && lijst.pad) map = resolvePad(lijst.pad, { jaar, lijst: lijst.naam, onderwerp: lijst.naam });
      }

      const token = await haalDynamicsToken();
      const [account, contactNaam] = await Promise.all([
        haalAccount(resource, token, accountId),
        haalContactNaam(resource, token, contactId),
      ]);

      const verzoek = verzoeken.maakVerzoek({
        accountId,
        klantnaam: account ? account.klantnaam : "",
        klantnummer: account ? account.klantnummer : "",
        contactId,
        contactNaam,
        lijstId: lijstId || "",
        lijstNaam,
        onderwerpId: onderwerpId || "",
        onderwerp: onderwerp ? onderwerp.naam : "",
        jaar,
        map,
        notitie: notitie || "",
        regels: bronRegels,
        aangemaaktDoor: email || "onbekend",
      });
      await verzoeken.voegToe(verzoek);

      const waar = onderwerp ? ` — onderwerp "${onderwerp.naam}"${jaar ? ` ${jaar}` : ""}` : (lijstNaam ? ` (lijst: ${lijstNaam})` : "");
      await logGebeurtenis({
        door: email || "onbekend",
        actie: "aanleververzoek",
        accountId,
        accountIds: [accountId],
        klantnaam: verzoek.klantnaam,
        klantnummer: verzoek.klantnummer,
        contactId,
        contactNaam,
        tekst: `Aanlever-verzoek uitgezet naar ${contactNaam || "de contactpersoon"}${waar} — ${verzoek.regels.length} document(en) gevraagd.`,
      });

      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek } };
      return;
    }

    context.res = { status: 400, body: { error: "Onbekende of ontbrekende 'actie'." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag/Dynamics is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon het aanlever-verzoek niet verwerken.", detail: String(err.message || err) } };
  }
};
