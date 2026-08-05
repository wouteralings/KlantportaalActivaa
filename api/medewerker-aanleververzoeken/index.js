/**
 * /api/medewerker-aanleververzoeken — medewerkers/beheerders zetten een aanleverlijst uit als
 * verzoek naar een cliënt/contactpersoon, en beheren de lopende verzoeken. Route is beveiligd via
 * staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 *
 *   - GET [?accountId=]                         → { verzoeken: [...] }
 *   - POST { actie:"uitzetten", accountId, contactId, lijstId?, regels?, notitie? } → nieuw verzoek
 *   - POST { actie:"verwijderen", id }          → verzoek verwijderen
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");
const { haalOnderwerpen, resolvePad } = require("../_gedeeld/aanleveronderwerpen");
const { magBulk } = require("../_gedeeld/wijzigrechten");
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

async function haalAccountMetPrimair(resource, token, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${CLIENTNUMMER_VELD}&$expand=primarycontactid($select=contactid,fullname)`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const a = await res.json();
  const nummer = a[CLIENTNUMMER_VELD];
  const p = a.primarycontactid || null;
  return {
    klantnaam: a.name || "",
    klantnummer: nummer != null && nummer !== "" ? String(nummer) : "",
    contactId: p ? p.contactid : "",
    contactNaam: p ? p.fullname || "" : "",
  };
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

    // Een concept-verzoek (bv. door een abonnement klaargezet) vrijgeven → zichtbaar voor de klant.
    if (actie === "vrijgeven") {
      if (!id) { context.res = { status: 400, body: { error: "Geef 'id' mee." } }; return; }
      const v = await verzoeken.werkBij(id, (x) => { x.zichtbaar = true; });
      if (!v) { context.res = { status: 404, body: { error: "Verzoek niet gevonden." } }; return; }
      await logGebeurtenis({
        door: email || "onbekend", actie: "aanleververzoek", accountId: v.accountId, accountIds: [v.accountId],
        klantnaam: v.klantnaam, klantnummer: v.klantnummer, contactId: v.contactId, contactNaam: v.contactNaam,
        tekst: `Concept aanlever-verzoek vrijgegeven (nu zichtbaar voor ${v.contactNaam || "de klant"})${v.lijstNaam ? ` — ${v.lijstNaam}` : ""}.`,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: v } };
      return;
    }

    // Bulk: één vragenlijst in één keer naar meerdere cliënten (naar hun primaire contactpersoon).
    if (actie === "bulk-uitzetten") {
      const { accountIds, lijstId: bLijstId, jaar: bJaar, deadline: bDeadline, modus } = req.body || {};
      const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
      if (!(await magBulk(email, beheerder))) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen rechten om bulk-acties uit te voeren." } };
        return;
      }
      if (!Array.isArray(accountIds) || accountIds.length === 0 || !bLijstId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountIds' (niet leeg) en 'lijstId' mee." } };
        return;
      }
      const lijst = (await haalLijsten()).find((l) => l.id === bLijstId);
      if (!lijst) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Gekozen aanleverlijst niet gevonden." } }; return; }
      const bulkRegels = lijst.regels || [];
      if (!bulkRegels.length) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Deze lijst heeft geen documenten." } }; return; }

      const zichtbaar = modus === "versturen";
      const token = await haalDynamicsToken();
      const map = lijst.pad ? resolvePad(lijst.pad, { jaar: bJaar, lijst: lijst.naam, onderwerp: lijst.naam }) : [];
      // Bulk verstuurt altijd rechtstreeks een lijst (geen aparte onderwerp-keuze in dit formulier) —
      // is die lijst toevallig de standaardlijst van een onderwerp, dan het verzoek daar alsnog aan
      // koppelen, anders duikt het nooit op in het gekoppelde dossier (zie ook de "uitzetten"-actie
      // hierboven, waar dezelfde koppeling voor het per-cliënt-formulier gebeurt).
      const bulkOnderwerp = (await haalOnderwerpen()).find((o) => o.standaardLijstId === bLijstId) || null;
      let aangemaakt = 0;
      const mislukt = [];
      for (const accId of [...new Set(accountIds.filter(Boolean))]) {
        try {
          const acc = await haalAccountMetPrimair(resource, token, accId);
          if (!acc) { mislukt.push({ accountId: accId, reden: "cliënt niet gevonden" }); continue; }
          if (!acc.contactId) { mislukt.push({ accountId: accId, klantnaam: acc.klantnaam, reden: "geen primaire contactpersoon" }); continue; }
          const verzoek = verzoeken.maakVerzoek({
            accountId: accId, klantnaam: acc.klantnaam, klantnummer: acc.klantnummer,
            contactId: acc.contactId, contactNaam: acc.contactNaam,
            lijstId: bLijstId, lijstNaam: lijst.naam,
            onderwerpId: bulkOnderwerp ? bulkOnderwerp.id : "", onderwerp: bulkOnderwerp ? bulkOnderwerp.naam : "",
            jaar: bJaar, map, notitie: "",
            regels: bulkRegels, aangemaaktDoor: email || "onbekend",
            zichtbaar, deadline: bDeadline, bron: "bulk",
          });
          await verzoeken.voegToe(verzoek);
          aangemaakt++;
          await logGebeurtenis({
            door: email || "onbekend", actie: "aanleververzoek", accountId: accId, accountIds: [accId],
            klantnaam: acc.klantnaam, klantnummer: acc.klantnummer, contactId: acc.contactId, contactNaam: acc.contactNaam,
            tekst: `Bulk: aanlever-verzoek "${lijst.naam}"${bJaar ? ` ${bJaar}` : ""} ${zichtbaar ? "verstuurd (zichtbaar)" : "als concept klaargezet"}${bDeadline ? ` — deadline ${bDeadline}` : ""}.`,
          });
        } catch (e) {
          mislukt.push({ accountId: accId, reden: String(e && e.message ? e.message : e) });
        }
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, aangemaakt, mislukt } };
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
      } else if (lijstId) {
        // Geen onderwerp gekozen, maar wél rechtstreeks de lijst die toevallig de standaardlijst van
        // een onderwerp is (bv. omdat lijst en onderwerp per ongeluk dezelfde naam hebben en de
        // verkeerde van de twee dropdowns gekozen is) — dan alsnog aan dat onderwerp koppelen, anders
        // duikt dit verzoek nooit op in het gekoppelde dossier (zie "Gekoppelde uitvraaglijst" in
        // Beheer → Dossiers / gekoppeldeUitvragenVoorDossier in api/medewerker-dossier).
        onderwerp = (await haalOnderwerpen()).find((o) => o.standaardLijstId === lijstId) || null;
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
        // Bug (05-08-2026): dit gaf voorheen "onderwerpId || ''" — bij de lijstId-only-fallback
        // hierboven (geen onderwerpId meegegeven, maar de lijst is wél iemands standaardlijst) werd
        // "onderwerp" dan wél gevonden maar zijn id nooit op het verzoek gezet. Het verzoek dook
        // daardoor nooit op als "gekoppelde uitvraaglijst" in het bijbehorende dossier — precies wat
        // de comment hierboven beloofde te voorkomen. "onderwerp ? onderwerp.id : ''" dekt beide
        // paden (expliciet gekozen onderwerp én de lijstId-fallback) — zelfde patroon als de
        // bulk-uitzetten-actie hierboven, die dit al wél goed deed.
        onderwerpId: onderwerp ? onderwerp.id : "",
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
