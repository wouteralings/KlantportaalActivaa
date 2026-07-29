const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalGebruikersToken, wisselVoorGraphToken } = require("../_gedeeld/graphObo");
const { voegHandtekeningToe, bewaarPdfBlob } = require("../_gedeeld/handtekeningen");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const KLANT_VALUE = `_${KLANT_VELD}_value`;
const DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const FV = "@OData.Community.Display.V1.FormattedValue";
const WRITE_SCOPE = "https://graph.microsoft.com/Files.ReadWrite.All offline_access";

const DYN = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
});

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"] || "";
  return (xff.split(",")[0] || "").trim().replace(/:\d+$/, "") || "onbekend";
}

/** Bouwt de bewijs-PDF met naam, e-mail, toelichting, de getekende krabbel, tijdstip en IP. */
async function maakBewijsPdf({ taaktitel, documentUrl, naam, email, toelichting, stempel, ip, handtekeningDataUrl }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const marge = 56;
  let y = 786;
  const tekst = (t, { size = 11, f = font, kleur = rgb(0.11, 0.14, 0.13) } = {}) => {
    page.drawText(String(t == null ? "" : t), { x: marge, y, size, font: f, color: kleur });
    y -= size + 8;
  };
  tekst("Ondertekeningsbewijs", { size: 20, f: bold });
  y -= 6;
  tekst("Dit document bevestigt de digitale ondertekening via het klantportaal van Activaa.", { size: 10, kleur: rgb(0.36, 0.38, 0.35) });
  y -= 10;
  tekst("Taak", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) });
  tekst(taaktitel || "(taak)");
  if (documentUrl) { tekst("Document", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) }); tekst(documentUrl, { size: 9 }); }
  y -= 6;
  tekst("Naam", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) }); tekst(naam);
  tekst("E-mailadres", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) }); tekst(email || "-");
  tekst("Toelichting", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) }); tekst(toelichting || "(geen)");
  tekst("Ondertekend op", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) }); tekst(stempel);
  tekst("IP-adres", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) }); tekst(ip);
  y -= 14;
  tekst("Handtekening", { size: 9, f: bold, kleur: rgb(0.36, 0.38, 0.35) });
  try {
    const b64 = (handtekeningDataUrl || "").split(",")[1] || "";
    if (b64) {
      const png = await doc.embedPng(Buffer.from(b64, "base64"));
      const breedte = 260;
      const hoogte = (png.height / png.width) * breedte;
      page.drawRectangle({ x: marge, y: y - hoogte - 8, width: breedte + 16, height: hoogte + 16, borderColor: rgb(0.86, 0.87, 0.85), borderWidth: 1 });
      page.drawImage(png, { x: marge + 8, y: y - hoogte, width: breedte, height: hoogte });
      y -= hoogte + 24;
    }
  } catch { /* geen/onleesbare handtekening-afbeelding → sla het plaatje over */ }
  page.drawText("Vastgelegd inclusief tijdstip en IP-adres, als bewijs van deze ondertekening.", {
    x: marge, y: 48, size: 8, font, color: rgb(0.54, 0.56, 0.53),
  });
  return Buffer.from(await doc.save());
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }
  if (req.method !== "POST") { context.res = { status: 405, body: { error: "Methode niet ondersteund." } }; return; }

  try {
    const email = haalEmailUitPrincipal(req);
    if (!email) { context.res = { status: 403, body: { error: "Kon je identiteit niet bepalen." } }; return; }

    const taakId = req.body?.taakId || req.body?.id;
    const naam = (req.body?.naam || "").toString().trim();
    const opgegevenEmail = (req.body?.email || "").toString().trim();
    const toelichting = (req.body?.toelichting || "").toString().trim();
    const handtekeningDataUrl = req.body?.handtekening || "";
    if (!taakId || !naam || !handtekeningDataUrl) {
      context.res = { status: 400, body: { error: "Naam en handtekening zijn verplicht." } };
      return;
    }

    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);
    const accountIds = accounts.map((a) => a.accountId);

    // Taak ophalen + controleren dat hij bij de klant hoort en dat het soort een handtekening vereist.
    const select = `$select=subject,description,_regardingobjectid_value,${KLANT_VALUE}` +
      (SOORT_VELD ? "," + SOORT_VELD : "") + (DOCUMENT_VELD ? "," + DOCUMENT_VELD : "");
    const taakRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?${select}`, { headers: DYN(token) });
    if (!taakRes.ok) { context.res = { status: 404, body: { error: "Taak niet gevonden." } }; return; }
    const taak = await taakRes.json();
    const accountId = taak[KLANT_VALUE] || taak._regardingobjectid_value;
    if (!accountIds.includes(accountId)) { context.res = { status: 403, body: { error: "Deze taak hoort niet bij een van jouw accounts." } }; return; }

    const instellingen = await haalInstellingen().catch(() => ({}));
    const soortWaarde = SOORT_VELD ? taak[SOORT_VELD] : null;
    const soortCfg = (instellingen.taaksoorten || {})[String(soortWaarde)] || {};
    if (!soortCfg.vereistHandtekening) {
      context.res = { status: 403, body: { error: "Voor deze taak is geen handtekening nodig." } };
      return;
    }

    const account = accounts.find((a) => a.accountId === accountId) || {};
    const stempel = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
    const ip = clientIp(req);
    const documentUrl = DOCUMENT_VELD ? taak[DOCUMENT_VELD] || "" : "";

    // Bewijs-PDF genereren.
    const pdf = await maakBewijsPdf({
      taaktitel: taak.subject, documentUrl, naam, email: opgegevenEmail || email,
      toelichting, stempel, ip, handtekeningDataUrl,
    });
    const datumKort = new Date().toLocaleDateString("nl-NL").replace(/\//g, "-");
    const bestandsnaam = `${(taak.subject || "taak").replace(/[\\/:*?"<>|]+/g, " ").trim()} - ondertekend door ${naam} ${datumKort}.pdf`;

    // Naar SharePoint schrijven (best-effort; vereist Files.ReadWrite.All + admin-consent).
    let sharepointUrl = null;
    let sharepointFout = null;
    try {
      const gebruikersToken = haalGebruikersToken(req);
      if (!gebruikersToken) throw new Error("Geen gebruikerstoken (log opnieuw in).");
      // Basis-map van de klant ophalen (cr283_sharepoint op het account).
      const accRes = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=${SHAREPOINT_VELD}`, { headers: DYN(token) });
      const accData = accRes.ok ? await accRes.json() : {};
      const basisUrl = accData[SHAREPOINT_VELD];
      if (!basisUrl) throw new Error(`Geen ${SHAREPOINT_VELD} op de klant ingevuld.`);
      const graphToken = await wisselVoorGraphToken(gebruikersToken, WRITE_SCOPE);
      const map = await resolveFolder(graphToken, basisUrl);
      const doelId = await ensureFolderPath(graphToken, map.driveId, map.itemId, ["1. Intern", "0. Permanent dossier"]);
      const geupload = await uploadBestand(graphToken, map.driveId, doelId, bestandsnaam, pdf);
      sharepointUrl = geupload.webUrl || null;
    } catch (spFout) {
      sharepointFout = String(spFout.message || spFout);
      context.log.error("SharePoint-upload handtekening mislukt:", sharepointFout);
    }

    // Altijd een kopie in blob-opslag voor de beheer-log (downloadbaar), best-effort.
    let blobNaam = null;
    try { blobNaam = await bewaarPdfBlob(bestandsnaam, pdf); } catch (e) { context.log.error("Blob-kopie mislukt:", e); }

    // Vastleggen in de log.
    let record = null;
    try {
      record = await voegHandtekeningToe({
        taakId, accountId, klantnummer: account.klantnummer, klantnaam: account.klantnaam,
        taaktitel: taak.subject, soort: SOORT_VELD ? taak[SOORT_VELD + FV] || "" : "",
        aanvragerEmail: email, naam, opgegevenEmail: opgegevenEmail || email, toelichting,
        ip, bestandsnaam, sharepointUrl, sharepointFout, blobNaam,
      });
    } catch (e) { context.log.error("Handtekening-log mislukt:", e); }

    // Taak afronden in Dynamics + notitie.
    const notitie = `\n\n[Ondertekend door klant (${naam}, ${opgegevenEmail || email}) via het klantportaal op ${stempel}. IP: ${ip}.` +
      (sharepointUrl ? ` Bewijs: ${sharepointUrl}]` : "]");
    const updateBody = { statecode: 1, statuscode: 5, description: (taak.description || "") + notitie };
    const upd = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
      method: "PATCH", headers: DYN(token), body: JSON.stringify(updateBody),
    });
    if (!upd.ok) throw new Error(`Afronden taak mislukt: ${await upd.text()}`);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { ok: true, sharepointUrl, sharepointFout, record },
    };
  } catch (err) {
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = { status: 403, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij ondertekenen.", detail: String(err) } };
  }
};
