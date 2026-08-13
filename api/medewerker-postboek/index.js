/**
 * /api/medewerker-postboek — het Postboek (inkomende post) in het medewerkersportaal.
 *
 *   GET  ?bereik=mijn|kantoor
 *        → { posten: [...] }  (nieuwste eerst; "mijn" = regels waar de ingelogde medewerker bij betrokken is)
 *   POST { accountId, soortId, klantnaam?, klantnummer?, klantTeam?, bestandsnaam, bestandBase64, contentType? }
 *        → { ok, post }       (bestand naar de SharePoint-submap van de soort in de klantmap + registratie)
 *   POST { actie:"status", id, status:"open"|"afgehandeld" }   → { ok, post }
 *   POST { actie:"documentlink", id, documentUrl }             → { ok, post }
 *
 * Verwerking van een gedropte brief: het bestand wordt via app-only Graph opgeslagen in de SharePoint-
 * map van de klant (cr283_sharepoint), in de per-soort ingestelde submap (Beheer → Postboek), onder de
 * standaard bestandsnaam van die soort. Er wordt géén Dynamics-taak gemaakt — alleen een postboek-regel.
 * De "naar wie" komt uit de soort: een vast persoon/postvak, of een rol van de klant (dan gebruikt het de
 * meegestuurde klantTeam-gegevens uit het klantoverzicht). Soorten met "direct afgehandeld" krijgen meteen
 * status "afgehandeld".
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { resolveFolder, ensureFolderPath, uploadBestand } = require("../_gedeeld/sharepointUpload");
const { haalAppGraphToken } = require("../_gedeeld/graphApp");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { haalPostboek, voegToe, werkBij } = require("../_gedeeld/postboek");

const GRAPH = "https://graph.microsoft.com/v1.0";
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — inkomende post is soms een gescande PDF
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROLLEN = new Set(["manager", "accountant", "assistent", "fiscaal", "loon", "backup"]);
const STANDAARD_SUBMAP = "Inkomende post";

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

function veiligeBestandsnaam(naam) {
  let n = String(naam || "").replace(/[\\/:*?"<>|]/g, "-").trim();
  n = n.replace(/^\.+/, "").slice(0, 180);
  return n || "bijlage";
}
function splitsNaamExt(naam) {
  const n = String(naam || "");
  const m = n.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
  if (m && m[1]) return { basis: m[1], ext: m[2] };
  return { basis: n, ext: "" };
}
function vulBestandsnaamIn(sjabloon, { klantnaam, soort, datum }) {
  return String(sjabloon || "")
    .replace(/\{\{\s*klantnaam\s*\}\}/gi, klantnaam || "")
    .replace(/\{\{\s*soort\s*\}\}/gi, soort || "")
    .replace(/\{\{\s*datum\s*\}\}/gi, datum || "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function bepaalDoelBestandsnaam(sjabloon, origineleNaam, mergeCtx, bestaandeNamenLower) {
  const origineel = veiligeBestandsnaam(origineleNaam);
  let basis, ext;
  const ingesteld = vulBestandsnaamIn(sjabloon, mergeCtx);
  if (ingesteld) {
    const origSplit = splitsNaamExt(origineel);
    const inSplit = splitsNaamExt(ingesteld);
    ext = inSplit.ext || origSplit.ext;
    basis = veiligeBestandsnaam(inSplit.ext ? inSplit.basis : ingesteld).replace(/\.+$/, "").trim() || "post";
  } else {
    const s = splitsNaamExt(origineel);
    basis = s.basis || "post";
    ext = s.ext;
  }
  let kandidaat = `${basis}${ext}`;
  if (!bestaandeNamenLower.has(kandidaat.toLowerCase())) return kandidaat;
  let n = 2;
  while (bestaandeNamenLower.has(`${basis} (${n})${ext}`.toLowerCase())) n += 1;
  return `${basis} (${n})${ext}`;
}
function mapSegmentenVan(sjabloon, standaard) {
  const segmenten = String(sjabloon == null || sjabloon === "" ? standaard : sjabloon)
    .split(/[\\/]+/)
    .map((deel) => deel.replace(/[\\/:*?"<>|]/g, "-").trim())
    .filter(Boolean);
  return segmenten.length ? segmenten : [standaard];
}
function decodeer(bestandBase64) {
  const kaal = String(bestandBase64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!kaal) return { fout: "Geen bestand meegestuurd." };
  let buffer;
  try { buffer = Buffer.from(kaal, "base64"); } catch { return { fout: "Bestand kon niet worden gelezen." }; }
  if (!buffer.length) return { fout: "Bestand is leeg." };
  if (buffer.length > MAX_BYTES) return { fout: `Bestand is te groot (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` };
  return { buffer };
}

// SharePoint-basismap + naam/nummer van een cliënt (op accountId).
async function haalAccount(resource, token, accountId) {
  const res = await fetch(
    `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${SHAREPOINT_VELD},${CLIENTNUMMER_VELD}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!res.ok) return { fout: `Ophalen cliënt mislukt: ${await res.text()}` };
  const acc = await res.json();
  return { naam: acc.name || "", nummer: acc[CLIENTNUMMER_VELD] != null ? String(acc[CLIENTNUMMER_VELD]) : "", basisUrl: acc[SHAREPOINT_VELD] || "" };
}

// Uit de (door de frontend meegestuurde) klant-team-gegevens de e-mailadressen halen.
function teamEmails(klantTeam) {
  const t = klantTeam && typeof klantTeam === "object" ? klantTeam : {};
  return [...ROLLEN].map((r) => (t[r] && typeof t[r] === "object" ? String(t[r].email || "").trim() : "")).filter(Boolean);
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = json(501, { error: "Dynamics-koppeling is nog niet geconfigureerd." }); return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) { context.res = json(403, { error: "Geen toegang." }); return; }
  const email = (haalEmailUitPrincipal(req) || "").trim();
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const bereik = String((req.query && req.query.bereik) || "kantoor");
      let posten = await haalPostboek();
      posten = posten.slice().sort((a, b) => String(b.aangemaaktOp || "").localeCompare(String(a.aangemaaktOp || "")));
      if (bereik === "mijn" && email) {
        const mij = email.toLowerCase();
        posten = posten.filter((p) => {
          const betrokken = Array.isArray(p.betrokkenEmails) ? p.betrokkenEmails.map((e) => String(e || "").toLowerCase()) : [];
          return betrokken.includes(mij) || String(p.naarEmail || "").toLowerCase() === mij || String(p.door || "").toLowerCase() === mij;
        });
      }
      context.res = json(200, { posten });
      return;
    }

    if (methode === "POST") {
      const actie = String((req.body && req.body.actie) || "");

      // ── Status wijzigen (afhandelen / heropenen) ──
      if (actie === "status") {
        const id = String((req.body && req.body.id) || "");
        const status = String((req.body && req.body.status) || "");
        if (!id || !["open", "afgehandeld"].includes(status)) { context.res = json(400, { error: "Geef 'id' en een geldige status mee." }); return; }
        const bijgewerkt = await werkBij(id, {
          status,
          afgehandeldDoor: status === "afgehandeld" ? (email || "onbekend") : "",
          afgehandeldOp: status === "afgehandeld" ? new Date().toISOString() : "",
        });
        if (!bijgewerkt) { context.res = json(404, { error: "Postboek-regel niet gevonden." }); return; }
        context.res = json(200, { ok: true, post: bijgewerkt });
        return;
      }

      // ── Documentlink zetten/aanpassen ──
      if (actie === "documentlink") {
        const id = String((req.body && req.body.id) || "");
        const documentUrl = String((req.body && req.body.documentUrl) || "").trim();
        if (!id) { context.res = json(400, { error: "Geef 'id' mee." }); return; }
        const bijgewerkt = await werkBij(id, { documentUrl });
        if (!bijgewerkt) { context.res = json(404, { error: "Postboek-regel niet gevonden." }); return; }
        context.res = json(200, { ok: true, post: bijgewerkt });
        return;
      }

      // ── Nieuwe brief verwerken (upload + registratie) ──
      const accountId = String((req.body && req.body.accountId) || "");
      const soortId = String((req.body && req.body.soortId) || "");
      if (!GUID.test(accountId)) { context.res = json(400, { error: "Ongeldige of ontbrekende klant (accountId)." }); return; }
      if (!soortId) { context.res = json(400, { error: "Kies een soort." }); return; }

      const instellingen = await haalInstellingen().catch(() => ({}));
      const soorten = Array.isArray(instellingen.postboekSoorten) ? instellingen.postboekSoorten : [];
      const soort = soorten.find((s) => s && s.id === soortId);
      if (!soort) { context.res = json(400, { error: "Onbekende soort — is die (nog) in Beheer → Postboek ingesteld?" }); return; }

      const { buffer, fout } = decodeer(req.body && req.body.bestandBase64);
      if (fout) { context.res = json(400, { error: fout }); return; }

      const token = await haalDynamicsToken();
      const acc = await haalAccount(resource, token, accountId);
      if (acc.fout) { context.res = json(409, { error: acc.fout }); return; }
      if (!acc.basisUrl) { context.res = json(409, { error: `Voor ${acc.naam || "deze cliënt"} is nog geen SharePoint-map ingesteld (${SHAREPOINT_VELD} in Dynamics).` }); return; }
      const klantnaam = String((req.body && req.body.klantnaam) || acc.naam || "");

      // SharePoint: submap van de soort onder de klantmap.
      const appToken = await haalAppGraphToken();
      const map = await resolveFolder(appToken, acc.basisUrl);
      const segmenten = mapSegmentenVan(soort.submap, STANDAARD_SUBMAP);
      const doelId = await ensureFolderPath(appToken, map.driveId, map.itemId, segmenten);

      // Bestaande namen ophalen zodat een gelijknamig bestand een volgnummer krijgt.
      const bestaandeNamenLower = new Set();
      try {
        const lijstRes = await fetch(`${GRAPH}/drives/${map.driveId}/items/${doelId}/children?$select=name,file&$top=200`, { headers: { Authorization: `Bearer ${appToken}`, Accept: "application/json" } });
        if (lijstRes.ok) for (const i of ((await lijstRes.json()).value || [])) { if (i && i.file && i.name) bestaandeNamenLower.add(String(i.name).toLowerCase()); }
      } catch { /* best-effort */ }

      const datum = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
      const veiligeNaam = bepaalDoelBestandsnaam(soort.bestandsnaam, (req.body && req.body.bestandsnaam) || "", { klantnaam, soort: soort.label, datum }, bestaandeNamenLower);
      const upload = await uploadBestand(appToken, map.driveId, doelId, veiligeNaam, buffer, (req.body && req.body.contentType) || "application/octet-stream");
      const documentUrl = (upload && upload.webUrl) || "";

      // Naar wie: vast persoon/postvak, of de rol van de klant (uit het meegestuurde klantTeam).
      const klantTeam = (req.body && req.body.klantTeam && typeof req.body.klantTeam === "object") ? req.body.klantTeam : {};
      let naarNaam = "", naarEmail = "";
      if (soort.naarType === "persoon") {
        naarNaam = String(soort.naarNaam || "").trim();
        naarEmail = String(soort.naarEmail || "").trim();
      } else if (ROLLEN.has(soort.naarRol)) {
        const p = klantTeam[soort.naarRol];
        if (p && typeof p === "object") { naarNaam = String(p.naam || "").trim(); naarEmail = String(p.email || "").trim(); }
      }

      const betrokken = [...new Set([naarEmail, ...teamEmails(klantTeam)].map((e) => String(e || "").trim()).filter(Boolean))];
      const directAf = !!soort.directAfgehandeld;
      const post = await voegToe({
        door: email || "onbekend",
        accountId, klantnaam, klantnummer: acc.nummer,
        soortId, soortLabel: soort.label || "",
        bestand: veiligeNaam, documentUrl, submap: segmenten.join("/"),
        naarType: soort.naarType === "persoon" ? "persoon" : "rol",
        naarRol: soort.naarType === "persoon" ? "" : (soort.naarRol || ""),
        naarNaam, naarEmail, betrokkenEmails: betrokken,
        status: directAf ? "afgehandeld" : "open",
        afgehandeldDoor: directAf ? "automatisch (soort)" : "",
        afgehandeldOp: directAf ? new Date().toISOString() : "",
      });

      await logGebeurtenis({
        door: email || "onbekend", actie: "postboek", accountId, accountIds: [accountId], klantnaam,
        tekst: `Inkomende post "${veiligeNaam}" (${soort.label || "?"}) toegevoegd${naarNaam || naarEmail ? ` — naar ${naarNaam || naarEmail}` : ""} (SharePoint: ${segmenten.join("/")}).`,
      }).catch(() => {});

      context.res = json(200, { ok: true, post });
      return;
    }

    context.res = json(405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = json(501, { error: "Koppeling is nog niet volledig geconfigureerd." }); return; }
    context.log.error(err);
    context.res = json(500, { error: "Kon het postboek niet verwerken.", detail: String(err.message || err) });
  }
};
