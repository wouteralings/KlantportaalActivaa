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
      context.res = { headers: { "Content-Type": "application/json" }, body: { verzoeken: lijst } };
      return;
    }

    if (methode !== "POST" && methode !== "PATCH") {
      context.res = { status: 405, body: { error: "Methode niet toegestaan." } };
      return;
    }

    const { actie, id, accountId, contactId, lijstId, regels, notitie } = req.body || {};

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
      // Regels: uit een gekozen lijst, of vrij meegegeven.
      let bronRegels = Array.isArray(regels) ? regels : [];
      let lijstNaam = "";
      if (lijstId) {
        const lijsten = await haalLijsten();
        const lijst = lijsten.find((l) => l.id === lijstId);
        if (!lijst) { context.res = { status: 404, body: { error: "Gekozen aanleverlijst niet gevonden." } }; return; }
        lijstNaam = lijst.naam;
        if (bronRegels.length === 0) bronRegels = lijst.regels;
      }
      if (!bronRegels.length) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Kies een lijst of geef minimaal één regel mee." } };
        return;
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
        notitie: notitie || "",
        regels: bronRegels,
        aangemaaktDoor: email || "onbekend",
      });
      await verzoeken.voegToe(verzoek);

      await logGebeurtenis({
        door: email || "onbekend",
        actie: "aanleververzoek",
        accountId,
        accountIds: [accountId],
        klantnaam: verzoek.klantnaam,
        klantnummer: verzoek.klantnummer,
        contactId,
        contactNaam,
        tekst: `Aanlever-verzoek uitgezet naar ${contactNaam || "de contactpersoon"}${lijstNaam ? ` (lijst: ${lijstNaam})` : ""} — ${verzoek.regels.length} document(en) gevraagd.`,
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
