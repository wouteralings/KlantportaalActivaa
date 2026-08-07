/**
 * /api/mijn-aanleververzoeken — de aanlever-verzoeken van de INGELOGDE klant, en het uploaden van
 * de gevraagde bestanden. Alleen zichtbaar/bruikbaar voor een contactpersoon met het recht
 * 'aanleveren'. De upload gaat app-only (via de portaal-identiteit) naar de 'Aanleveren'-map van de
 * cliënt in SharePoint, met de vaste bestandsnaam uit de regel; elke aanlevering wordt gelogd.
 *
 *   - GET → { verzoeken: [...] }  (alleen de eigen, waar recht 'aanleveren' geldt; elk verzoek krijgt
 *            een 'heeftNieuweActiviteit'-vlag: heeft een medewerker hier iets gevraagd/gereageerd of
 *            een document heropend sinds de klant hier voor het laatst keek — voor het rode bolletje)
 *   - POST { actie:"upload", verzoekId, regelId, origineleNaam, contentBase64, contentType } → upload
 *   - POST { actie:"gezien" } → markeert alle vragenlijsten als gezien voor deze klant (rode bolletje weg)
 */
const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalVoorContact } = require("../_gedeeld/documentrechten");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { AANLEVEREN_MAP } = require("../_gedeeld/documentmappen");
const verzoeken = require("../_gedeeld/aanleververzoeken");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { schrijfAntwoordNaarDynamics } = require("../_gedeeld/dynamicsAntwoordWriteback");

async function haalSharePointUrl(resource, dynToken, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=cr283_sharepoint`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${dynToken}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
  if (!res.ok) return "";
  return (await res.json()).cr283_sharepoint || "";
}

/** Maakt een veilige SharePoint-bestandsnaam: verboden tekens eruit, extensie behouden. */
function veiligeBestandsnaam(basis, origineleNaam) {
  const schoon = (s) => String(s || "").replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").trim();
  let naam = schoon(basis) || schoon(origineleNaam) || "aanlevering";
  const ext = (String(origineleNaam || "").match(/\.[A-Za-z0-9]{1,8}$/) || [""])[0];
  if (ext && !naam.toLowerCase().endsWith(ext.toLowerCase())) naam += ext;
  return naam.slice(0, 200);
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const methode = (req.method || "GET").toUpperCase();
  try {
    const dynToken = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, dynToken);

    // Map accountId → contactId (de ingelogde persoon per cliënt) en rechten.
    const perAccount = new Map();
    for (const a of accounts) perAccount.set(a.accountId, { contactId: a.contactId, klantnaam: a.klantnaam, klantnummer: a.klantnummer });

    if (methode === "GET") {
      const email = haalEmailUitPrincipal(req);
      const laatstGezien = await verzoeken.haalKlantLaatstGezien(email).catch(() => null);
      const alle = await verzoeken.haalVoorAccounts([...perAccount.keys()]);
      const zichtbaar = [];
      for (const v of alle) {
        const acc = perAccount.get(v.accountId);
        if (!acc) continue;
        if (v.zichtbaar === false) continue; // concept: nog niet vrijgegeven door een medewerker
        if (v.contactId && acc.contactId && v.contactId !== acc.contactId) continue; // niet aan mij gericht
        const rechten = await haalVoorContact(acc.contactId);
        if (!rechten.aanleveren) continue;
        zichtbaar.push({ ...v, heeftNieuweActiviteit: verzoeken.heeftMedewerkerActiviteitSinds(v, laatstGezien) });
      }
      zichtbaar.sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));
      context.res = { headers: { "Content-Type": "application/json" }, body: { verzoeken: zichtbaar } };
      return;
    }

    if (methode !== "POST") { context.res = { status: 405, body: { error: "Methode niet toegestaan." } }; return; }

    const b = req.body || {};
    const { actie, verzoekId, regelId } = b;

    // Markeert alles als gezien voor deze klant — los van een specifiek verzoek.
    if (actie === "gezien") {
      const moment = await verzoeken.zetKlantLaatstGezien(haalEmailUitPrincipal(req), new Date().toISOString());
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, laatstGezien: moment } };
      return;
    }

    if (actie !== "upload" && actie !== "opmerking" && actie !== "vraag" && actie !== "antwoord") { context.res = { status: 400, body: { error: "Onbekende of ontbrekende 'actie'." } }; return; }
    if (!verzoekId) { context.res = { status: 400, body: { error: "Geef 'verzoekId' mee." } }; return; }
    if ((actie === "upload" || actie === "opmerking" || actie === "antwoord") && !regelId) { context.res = { status: 400, body: { error: "Geef 'regelId' mee." } }; return; }

    // Verzoek ophalen + controleren dat het van deze ingelogde klant is.
    const alle = await verzoeken.haalAlle();
    const verzoek = alle.find((v) => v.id === verzoekId);
    if (!verzoek) { context.res = { status: 404, body: { error: "Verzoek niet gevonden." } }; return; }
    if (verzoek.zichtbaar === false) { context.res = { status: 404, body: { error: "Verzoek niet gevonden." } }; return; } // concept: nog niet vrijgegeven
    const acc = perAccount.get(verzoek.accountId);
    if (!acc) { context.res = { status: 403, body: { error: "Dit verzoek hoort niet bij jou." } }; return; }
    if (verzoek.contactId && acc.contactId && verzoek.contactId !== acc.contactId) {
      context.res = { status: 403, body: { error: "Dit verzoek is niet aan jou gericht." } };
      return;
    }
    const rechten = await haalVoorContact(acc.contactId);
    if (!rechten.aanleveren) { context.res = { status: 403, body: { error: "Je hebt geen recht om aan te leveren." } }; return; }

    // ── Een vraag/bericht plaatsen bij deze vragenlijst (verzoek-niveau) ──
    if (actie === "vraag") {
      const tekst = String(b.tekst || "").trim();
      if (!tekst) { context.res = { status: 400, body: { error: "Lege vraag." } }; return; }
      const bijgewerkt = await verzoeken.werkBij(verzoekId, (v) => {
        if (!Array.isArray(v.vragen)) v.vragen = [];
        v.vragen.push(verzoeken.maakBericht("klant", verzoek.contactNaam || acc.klantnaam || "Klant", tekst));
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: bijgewerkt } };
      return;
    }

    const regel = verzoek.regels.find((r) => r.id === regelId);
    if (!regel) { context.res = { status: 404, body: { error: "Regel niet gevonden." } }; return; }

    // ── Alleen een opmerking opslaan (zonder upload) ──
    // Een opmerking tekent de regel af zonder bestand (bv. "niet van toepassing"/"zit in de
    // bijlage"): staat er nog geen bestand op de regel, dan zet een ingevulde opmerking 'm op
    // 'afgemeld' (telt mee voor afronding); wordt de opmerking weer gewist, dan gaat 'ie terug naar
    // 'open'. Is er al een bestand aangeleverd, dan blijft die status leidend.
    if (actie === "opmerking") {
      const bijgewerkt = await verzoeken.werkBij(verzoekId, (v) => {
        const r = v.regels.find((x) => x.id === regelId);
        if (!r) return;
        const opmerkingTekst = String(b.opmerking || "").slice(0, 1000);
        r.opmerking = opmerkingTekst;
        if (!r.bestand) {
          if (opmerkingTekst) {
            r.status = "afgemeld";
            r.aangeleverdOp = new Date().toISOString();
            r.aangeleverdDoor = haalEmailUitPrincipal(req) || "";
          } else {
            r.status = "open";
            r.aangeleverdOp = null;
            r.aangeleverdDoor = null;
          }
        }
        verzoeken.herberekenStatus(v);
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: bijgewerkt } };
      return;
    }

    // ── Antwoord op een vraag-regel (ja/nee, open tekst, keuzelijst, getal, datum) ──
    // Een niet-leeg antwoord tekent de regel af (status 'beantwoord', telt mee voor afronding);
    // een leeg antwoord zet 'm terug op 'open'. Alleen zinvol bij een niet-document-regel; bij een
    // document-regel blijft de upload leidend (deze actie raakt alleen het antwoord-veld).
    if (actie === "antwoord") {
      const bijgewerkt = await verzoeken.werkBij(verzoekId, (v) => {
        const r = v.regels.find((x) => x.id === regelId);
        if (!r) return;
        const waarde = (b.antwoord == null ? "" : String(b.antwoord)).slice(0, 2000).trim();
        r.antwoord = waarde === "" ? null : waarde;
        if (r.antwoord != null) {
          r.status = "beantwoord";
          r.aangeleverdOp = new Date().toISOString();
          r.aangeleverdDoor = haalEmailUitPrincipal(req) || "";
        } else {
          r.status = "open";
          r.aangeleverdOp = null;
          r.aangeleverdDoor = null;
        }
        verzoeken.herberekenStatus(v);
      });

      // Best-effort: het antwoord ook wegschrijven naar het gekoppelde Dynamics-veld (Fase B).
      // Faalt dit (geen koppeling, geen schrijfrecht, niet-converteerbare waarde), dan blijft het
      // antwoord gewoon in het portaal staan — we blokkeren het opslaan nooit hierop.
      let dynamicsResultaat = null;
      try {
        const regelNa = bijgewerkt && bijgewerkt.regels.find((x) => x.id === regelId);
        if (regelNa && regelNa.dynamics && regelNa.dynamics.entitySet && regelNa.dynamics.kolom && regelNa.antwoord != null) {
          const recordId = regelNa.dynamics.record === "contact" ? verzoek.contactId : verzoek.accountId;
          dynamicsResultaat = await schrijfAntwoordNaarDynamics({ resource, token: dynToken, dynamics: regelNa.dynamics, recordId, antwoord: regelNa.antwoord });
          if (!dynamicsResultaat.geschreven) context.log.warn("Antwoord niet naar Dynamics geschreven:", dynamicsResultaat.reden);
        }
      } catch (schrijfFout) {
        context.log.error("Wegschrijven van antwoord naar Dynamics mislukt:", schrijfFout);
        dynamicsResultaat = { geschreven: false, reden: String(schrijfFout.message || schrijfFout) };
      }

      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: bijgewerkt, dynamics: dynamicsResultaat } };
      return;
    }

    // ── Upload ──
    if (!b.contentBase64) { context.res = { status: 400, body: { error: "Geef 'contentBase64' mee." } }; return; }
    let buffer;
    try { buffer = Buffer.from(String(b.contentBase64), "base64"); } catch { buffer = null; }
    if (!buffer || buffer.length === 0) { context.res = { status: 400, body: { error: "Leeg of ongeldig bestand." } }; return; }
    const doelnaam = veiligeBestandsnaam(regel.bestandsnaam || regel.naam, b.origineleNaam);

    // App-only upload naar <basismap>/Aanleveren.
    const appToken = await haalAppGraphToken();
    const spUrl = await haalSharePointUrl(resource, dynToken, verzoek.accountId);
    if (!spUrl) { context.res = { status: 404, body: { error: "Voor deze cliënt is geen documentmap ingesteld." } }; return; }
    const { driveId, itemId } = await resolveFolder(appToken, spUrl);
    // Doelmap: het pad van het verzoek (uit onderwerp + jaar); anders de vaste 'Aanleveren'-map.
    const segmenten = Array.isArray(verzoek.map) && verzoek.map.length ? verzoek.map : [AANLEVEREN_MAP];
    const doelmapId = await ensureFolderPath(appToken, driveId, itemId, segmenten);
    const geupload = await uploadBestand(appToken, driveId, doelmapId, doelnaam, buffer, b.contentType || "application/octet-stream");

    // Regel bijwerken + status herberekenen.
    const bijgewerkt = await verzoeken.werkBij(verzoekId, (v) => {
      const r = v.regels.find((x) => x.id === regelId);
      if (r) {
        r.status = "aangeleverd";
        r.aangeleverdOp = new Date().toISOString();
        r.aangeleverdDoor = haalEmailUitPrincipal(req) || "";
        r.bestand = { naam: doelnaam, url: (geupload && geupload.webUrl) || "", driveId, itemId: (geupload && geupload.id) || "" };
        if (b.opmerking != null) r.opmerking = String(b.opmerking).slice(0, 1000);
      }
      verzoeken.herberekenStatus(v);
    });

    // Loggen: wanneer + door wie een bestand is aangeleverd (bij de cliënt terug te zien).
    await logGebeurtenis({
      door: haalEmailUitPrincipal(req) || "onbekend",
      actie: "aanlevering",
      accountId: verzoek.accountId,
      accountIds: [verzoek.accountId],
      klantnaam: verzoek.klantnaam,
      klantnummer: verzoek.klantnummer,
      contactId: verzoek.contactId,
      contactNaam: verzoek.contactNaam,
      tekst: `Bestand aangeleverd: "${doelnaam}"${regel.naam ? ` voor "${regel.naam}"` : ""}${verzoek.lijstNaam ? ` (verzoek: ${verzoek.lijstNaam})` : ""}.`,
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: bijgewerkt } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "De koppeling is nog niet (volledig) geconfigureerd." } }; return; }
    if (err.code === "GRAPH_APP_TOKEN_MISLUKT") { context.res = { status: 501, body: { error: "De app-only SharePoint-toegang is nog niet actief (Sites.Selected ontbreekt)." } }; return; }
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Aanleveren is niet gelukt.", detail: String(err.message || err) } };
  }
};
