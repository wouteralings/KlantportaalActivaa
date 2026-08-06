/**
 * /api/medewerker-aangifte-versturen — verwerkt het daadwerkelijk "droppen" van een aangifte
 * inkomstenbelasting (cliënt of diens fiscaal partner) vanuit het IB-dossier in het
 * medewerkersportaal (zie AangifteVersturenModal in MedewerkerPortaal.jsx, en de voorbereidende
 * stap GET /api/medewerker-aangifte-ontvanger):
 *
 *   1. Uploadt de PDF via app-only Graph naar de submap uit Beheer → Dossiers (standaard
 *      "Correspondentie", instelbaar via aangiftePadTemplate — mag submappen met "/" en de
 *      plaatshouders {klant}/{jaar} bevatten) in het SharePoint-dossier van de ontvanger
 *      (cr283_sharepoint op het account) — bestandsnaam volgens het sjabloon uit Beheer → Dossiers
 *      (evt. hier al ingevuld/aangepast door de medewerker).
 *   2. Maakt een Dynamics-taak gekoppeld aan de ontvanger, met de geüploade PDF als documentlink
 *      (zodat de klant 'm via /api/taken-document kan inzien). Onderwerp en soort (optiesetwaarde op
 *      cr283_soortactiecategorie, standaard 8006 "In afwachting reactie client") zijn óók instelbaar
 *      via Beheer → Dossiers (aangifteTaakOnderwerpTemplate / aangifteTaakSoort).
 *   3. Verstuurt een mail vanaf het vaste afzenderadres correspondentie@activaa.nl (zelfde opzet
 *      als /api/offertes-verstuur-mail) met de door de medewerker gecontroleerde/bewerkte tekst.
 *   4. Logt de actie bij de cliënt (klantlog).
 *
 *   POST { soort:"ib", id:<dossier-guid>, doelgroep:"client"|"partner", bestandsnaam,
 *          bestandBase64, mailOnderwerp, mailTekst }
 *     → { ok:true, taakId, bestandsnaam, mailVerzonden, mailFout?, waarschuwing? }
 *
 * Mail-fout ná upload/taak wordt bewust NIET als harde fout teruggegeven (ok:true blijft, met
 * mailVerzonden:false) — anders zou een medewerker het opnieuw proberen en per ongeluk een tweede
 * upload/taak aanmaken voor hetzelfde bestand.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { SOORTEN, haalEenDossier, haalNavigatieNaam, werkDossierBij } = require("../_gedeeld/dossiers");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { haalGraphToken } = require("../_gedeeld/mail");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { haalInstellingen } = require("../_gedeeld/instellingen");

const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";
// "In afwachting reactie client" — bestaande optiesetwaarde op Task.cr283_soortactiecategorie
// (of het veld dat via DYNAMICS_TAAK_SOORT_VELD is ingesteld), al elders in gebruik. Dient nu als
// terugval als er in Beheer → Dossiers (aangifteTaakSoort) nog niets is ingesteld.
const SOORT_WAARDE_IN_AFWACHTING = 8006;
// Terugval-onderwerp voor de taak als er in Beheer → Dossiers nog geen aangifteTaakOnderwerpTemplate is.
const STANDAARD_TAAK_ONDERWERP = "Aangifte inkomstenbelasting {jaar} klaar ter beoordeling";

// Optiesetwaarde op cr283_statusaangifte (IB) voor "Aangifte verzonden naar client" — zie
// STATUS_OPTIES_IB in api/_gedeeld/dossiers.js. Deze route behandelt alleen soort "ib" (zie de
// 400-check verderop), dus alleen de IB-waarde is hier nodig. Wordt gezet ongeacht doelgroep
// (cliënt of fiscaal partner) — er is geen aparte status "verzonden naar fiscaal partner", en in
// beide gevallen is de aangifte feitelijk de deur uit.
const STATUS_AANGIFTE_VERZONDEN_NAAR_CLIENT = 601280003;

const AFZENDER_MAILBOX = "correspondentie@activaa.nl";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — ruim voldoende voor een aangifte-PDF

function veiligeBestandsnaam(naam) {
  let n = String(naam || "").replace(/[\\/:*?"<>|]/g, "-").trim();
  n = n.replace(/^\.+/, "").slice(0, 150);
  if (!n) n = "Aangifte inkomstenbelasting.pdf";
  if (!/\.pdf$/i.test(n)) n += ".pdf";
  return n;
}

// Vult {klant}/{jaar} in een sjabloon (taak-onderwerp of pad-segment) en ruimt dubbele/rand-spaties
// op — zodat een lege {jaar} niet "inkomstenbelasting  klaar" oplevert.
function vulSjabloonIn(sjabloon, { klant, jaar }) {
  return String(sjabloon || "")
    .replaceAll("{klant}", klant || "")
    .replaceAll("{jaar}", jaar != null ? String(jaar) : "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Zet het in Beheer → Dossiers ingestelde pad-sjabloon (bijv. "Correspondentie" of
// "Correspondentie/{jaar}") om naar een lijst schone mapsegmenten voor ensureFolderPath: splitst op
// / en \, vult {klant}/{jaar} in, verwijdert ongeldige tekens en lege segmenten. Valt terug op
// ["Correspondentie"] als er niets bruikbaars overblijft (zodat een aangifte nooit in de wortel belandt).
function bepaalMapSegmenten(sjabloon, { klant, jaar }) {
  const segmenten = String(sjabloon == null || sjabloon === "" ? "Correspondentie" : sjabloon)
    .split(/[\\/]+/)
    .map((deel) => vulSjabloonIn(deel, { klant, jaar }).replace(/[\\/:*?"<>|]/g, "-").trim())
    .filter(Boolean);
  return segmenten.length ? segmenten : ["Correspondentie"];
}

function escapeHtml(tekst) {
  return String(tekst || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Zelfde opzet als offertes-verstuur-mail: platte (evt. bewerkte) tekst → simpele HTML, met
// klikbare links en expliciete inline kleuren (voorkomt onzichtbare tekst in dark-mode mailclients).
function tekstNaarHtml(tekst) {
  const geescaped = escapeHtml(tekst);
  const metLinks = geescaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#1C5D8C; text-decoration:underline;">${url}</a>`
  );
  return metLinks.replace(/\n/g, "<br/>");
}

function decodeerPdf(bestandBase64) {
  const kaal = String(bestandBase64 || "").replace(/^data:application\/pdf;base64,/, "").trim();
  if (!kaal) return { fout: "Geen bestand meegestuurd." };
  let buffer;
  try {
    buffer = Buffer.from(kaal, "base64");
  } catch {
    return { fout: "Bestand kon niet worden gelezen." };
  }
  if (buffer.length === 0) return { fout: "Bestand is leeg." };
  if (buffer.length > MAX_BYTES) return { fout: `Bestand is te groot (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` };
  if (buffer.slice(0, 4).toString("latin1") !== "%PDF") return { fout: "Alleen PDF-bestanden zijn toegestaan." };
  return { buffer };
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }
  if (req.method !== "POST") { context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } }; return; }
  const email = haalEmailUitPrincipal(req);

  const { soort: soortKey, id: dossierId, doelgroep, bestandsnaam, bestandBase64, mailOnderwerp, mailTekst } = req.body || {};
  if (soortKey !== "ib" || !dossierId || !["client", "partner"].includes(doelgroep)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'soort=ib', 'id' en 'doelgroep' (client/partner) mee." } };
    return;
  }
  const onderwerp = String(mailOnderwerp || "").trim();
  const tekst = String(mailTekst || "").trim();
  if (!onderwerp || !tekst) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Mailonderwerp en -tekst zijn verplicht." } };
    return;
  }
  const { buffer, fout: bestandFout } = decodeerPdf(bestandBase64);
  if (bestandFout) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: bestandFout } }; return; }
  const veiligeNaam = veiligeBestandsnaam(bestandsnaam);

  try {
    const token = await haalDynamicsToken();
    const soort = SOORTEN.find((s) => s.key === "ib");
    const dossier = await haalEenDossier(resource, token, soort, dossierId);
    if (!dossier) { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Dossier niet gevonden." } }; return; }

    const accountId = doelgroep === "partner" ? dossier.fiscaalPartnerAccountId : dossier.accountId;
    if (!accountId) {
      context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: doelgroep === "partner" ? "Bij dit dossier is geen fiscaal partner ingevuld." : "Dit dossier heeft geen gekoppelde cliënt." } };
      return;
    }

    const accRes = await fetch(
      `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${SHAREPOINT_VELD}&$expand=primarycontactid($select=emailaddress1,fullname)`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (!accRes.ok) throw new Error(`Ophalen ontvanger mislukt: ${await accRes.text()}`);
    const acc = await accRes.json();
    const naam = acc.name || (doelgroep === "partner" ? dossier.fiscaalPartnerNaam : dossier.klantnaam) || "de cliënt";
    const ontvangerEmail = (acc.primarycontactid || {}).emailaddress1 || "";
    const basisUrl = acc[SHAREPOINT_VELD];
    if (!basisUrl) { context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Voor ${naam} is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD} in Dynamics).` } }; return; }
    if (!ontvangerEmail) { context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Voor ${naam} is geen e-mailadres bekend bij de hoofdcontactpersoon in Dynamics.` } }; return; }

    // Instelbare waarden uit Beheer → Dossiers (pad, taak-onderwerp, taak-soort) — met terugval op de
    // oude, hardcoded standaarden zodat het ook werkt vóórdat er iets is ingesteld.
    const instellingen = await haalInstellingen().catch(() => ({}));
    const mapSegmenten = bepaalMapSegmenten(instellingen.aangiftePadTemplate, { klant: naam, jaar: dossier.jaar });
    const taakOnderwerp =
      vulSjabloonIn(instellingen.aangifteTaakOnderwerpTemplate || STANDAARD_TAAK_ONDERWERP, { klant: naam, jaar: dossier.jaar }) ||
      vulSjabloonIn(STANDAARD_TAAK_ONDERWERP, { klant: naam, jaar: dossier.jaar });
    const soortInstelling = Number(instellingen.aangifteTaakSoort);
    const taakSoortWaarde = Number.isFinite(soortInstelling) && soortInstelling > 0 ? soortInstelling : SOORT_WAARDE_IN_AFWACHTING;

    // ── 1. Uploaden naar SharePoint (app-only — de klant hoeft zelf geen SharePoint-rechten te
    // hebben op deze map; het portaal toont het bestand straks via de eigen, gecontroleerde
    // /api/taken-document i.p.v. een rechtstreekse SharePoint-link). ──
    const appToken = await haalAppGraphToken();
    const map = await resolveFolder(appToken, basisUrl);
    const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, mapSegmenten);
    const upload = await uploadBestand(appToken, map.driveId, doelId, veiligeNaam, buffer, "application/pdf");

    // ── 2. Dynamics-taak aanmaken ──
    const waarschuwingen = [];
    if (!SOORT_VELD) waarschuwingen.push("Application Setting DYNAMICS_TAAK_SOORT_VELD is niet ingesteld — de taak krijgt geen 'soort' mee en wordt daardoor mogelijk niet aan de cliënt getoond.");
    if (!DOCUMENT_VELD) waarschuwingen.push("Application Setting DYNAMICS_TAAK_DOCUMENT_VELD is niet ingesteld — de cliënt kan de aangifte dan niet vanuit de taak inzien.");

    // De cliënt-lookup op de taak (sk_client) koppelen via @odata.bind vereist de NAVIGATIE-
    // eigenschapsnaam, niet de logische kolomnaam — uit de metadata halen (zie haalNavigatieNaam),
    // anders 0x80048d19 "undeclared property 'sk_client'".
    const klantNav = await haalNavigatieNaam(resource, "task", KLANT_VELD, token);
    const taakBody = {
      subject: taakOnderwerp,
      description: `Aangifte inkomstenbelasting${dossier.jaar ? ` ${dossier.jaar}` : ""} van ${naam} is via het klantportaal verstuurd naar ${ontvangerEmail} op ${new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })} door ${email || "onbekend"}.`,
      [`${klantNav}@odata.bind`]: `/accounts(${accountId})`,
    };
    if (SOORT_VELD) taakBody[SOORT_VELD] = taakSoortWaarde;
    if (DOCUMENT_VELD) taakBody[DOCUMENT_VELD] = upload.webUrl || null;

    const taakRes = await fetch(`${resource}/api/data/v9.2/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: "return=representation",
      },
      body: JSON.stringify(taakBody),
    });
    if (!taakRes.ok) throw new Error(`Aanmaken taak mislukt: ${await taakRes.text()}`);
    const taak = await taakRes.json();
    const taakId = taak.activityid;

    // ── 3. Mail versturen (best-effort ná dit punt — upload + taak staan al vast, dus een
    // mailfout hier mag niet als harde fout terugkomen, anders wordt bij een retry per ongeluk
    // een tweede upload/taak aangemaakt voor hetzelfde bestand). ──
    let mailVerzonden = false;
    let mailFout = "";
    try {
      const graphToken = await haalGraphToken();
      const htmlBody = `<div style="color:#1C2321; background-color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:14px;">${tekstNaarHtml(tekst)}</div>`;
      const mailRes = await fetch(`https://graph.microsoft.com/v1.0/users/${AFZENDER_MAILBOX}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: onderwerp,
            body: { contentType: "HTML", content: htmlBody },
            toRecipients: [{ emailAddress: { address: ontvangerEmail } }],
          },
          saveToSentItems: true,
        }),
      });
      if (!mailRes.ok) throw new Error(`Graph sendMail mislukt (${mailRes.status}): ${await mailRes.text()}`);
      mailVerzonden = true;
    } catch (e) {
      mailFout = e.message || "Versturen van de mail is mislukt.";
      context.log.error("medewerker-aangifte-versturen: mail versturen mislukt (upload/taak zijn al aangemaakt):", e);
    }

    // ── 4. Dossierstatus bijwerken naar "Aangifte verzonden naar client" (best-effort — net als
    // de mail hierboven mag een fout hier de al geslaagde upload/taak niet ongedaan maken; de
    // medewerker kan de status zo nodig ook gewoon handmatig terugzetten in het dossier). ──
    try {
      await werkDossierBij(resource, token, soort, dossierId, { status: STATUS_AANGIFTE_VERZONDEN_NAAR_CLIENT });
    } catch (e) {
      context.log.error("medewerker-aangifte-versturen: status bijwerken mislukt (upload/taak/mail zijn al verwerkt):", e);
    }

    // ── 5. Loggen bij de cliënt (best-effort). Naast de leesbare `tekst` (voor het algemene
    // logboek, zie Logboek.jsx) ook een paar losse velden erbij, zodat de "Eerder verstuurde
    // aangiftes"-lijst direct onder de dropzones (AangifteLog in MedewerkerPortaal.jsx) niet uit
    // de zin hoeft te parsen — bestandsnaam/doelgroep/ontvanger blijven zo ook bruikbaar als de
    // tekst hierboven ooit verandert. `documentUrl` is de rechtstreekse SharePoint-link (dezelfde
    // die ook op de Dynamics-taak staat, zie DOCUMENT_VELD hierboven) — bewust de échte
    // SharePoint-url en niet de /api/taken-document-proxy: die proxy is voor de klant (die zelf
    // geen SharePoint-toegang tot deze map heeft), een medewerker mag/kan het bestand gewoon
    // rechtstreeks openen. ──
    await logGebeurtenis({
      door: email || "onbekend", actie: "aangifte", accountId, accountIds: [accountId],
      klantnaam: naam,
      bestandsnaam: veiligeNaam, doelgroep, ontvangerEmail, mailVerzonden, documentUrl: upload.webUrl || null,
      tekst: `Aangifte inkomstenbelasting${dossier.jaar ? ` ${dossier.jaar}` : ""} verstuurd naar ${doelgroep === "partner" ? "fiscaal partner" : "cliënt"} ${naam} (${ontvangerEmail}) — bestand "${veiligeNaam}" opgeslagen in ${mapSegmenten.join("/")}, taak aangemaakt${mailVerzonden ? ", mail verzonden vanaf " + AFZENDER_MAILBOX : " — mail versturen is mislukt"}.`,
    });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, taakId, bestandsnaam: veiligeNaam, mailVerzonden, mailFout: mailFout || undefined, waarschuwing: waarschuwingen.length ? waarschuwingen.join(" ") : undefined },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics/Graph-koppeling is nog niet volledig geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Versturen van de aangifte is mislukt.", detail: String(err.message || err) } };
  }
};
