/**
 * /api/medewerker-postboek — het Postboek (inkomende post) in het medewerkersportaal.
 *
 *   GET  ?bereik=mijn|kantoor
 *        → { posten: [...] }  (nieuwste eerst; "mijn" = regels waar de ingelogde medewerker bij betrokken is)
 *   GET  ?config=1
 *        → { medewerkers:[{naam,email}], taakSoortOpties:[{waarde,label}], taakRubriekOpties:[...],
 *            standaardUrenPerSoort:{<taaksoort-waarde>:uren} } (voor het doorzet-venster + uren voorinvullen)
 *   POST { accountId, soortId, klantnaam?, klantnummer?, klantTeam?, bestandsnaam, bestandBase64, contentType? }
 *        → { ok, post }       (bestand naar de SharePoint-submap van de soort in de klantmap + registratie)
 *   POST { actie:"status", id, status:"open"|"afgehandeld" }   → { ok, post }
 *   POST { actie:"documentlink", id, documentUrl }             → { ok, post }
 *   POST { actie:"doorzetten", id, naarEmail, opmerking?, uren?, taakSoort?, taakRubriek?, meldingBijAfronden? }
 *        → { ok, post, taakId }  (maakt een Dynamics-taak voor de medewerker; poststuk → status "doorgezet")
 *   POST { actie:"accepteren", id }  → { ok, post }  (een "teaccepteren"-poststuk definitief afhandelen)
 *   POST { actie:"verwijder", id }  (alléén beheerders)        → { ok, verwijderd }
 *
 * Sync: bij het ophalen (GET) worden doorgezette poststukken waarvan de Dynamics-taak is afgetekend
 * (statecode 1) automatisch bijgewerkt: zonder gevraagde melding → "afgehandeld"; mét melding →
 * "teaccepteren" (de doorzetter krijgt het te zien en accepteert het via actie "accepteren").
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
const { haalPostboek, voegToe, werkBij, verwijder } = require("../_gedeeld/postboek");
const { haalNavigatieNaam } = require("../_gedeeld/dossiers");
const { haalSystemuser, haalStandaardUrenPerSoort } = require("../_gedeeld/takenGedeeld");
const { zetTijd } = require("../_gedeeld/takenTijd");
const { lijstTarieven } = require("../_gedeeld/urenDataverse");

const GRAPH = "https://graph.microsoft.com/v1.0";
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — inkomende post is soms een gescande PDF
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROLLEN = new Set(["manager", "accountant", "assistent", "fiscaal", "loon", "backup"]);
const STANDAARD_SUBMAP = "Inkomende post";
// Taak-velden (Dynamics) voor het doorzetten van een poststuk naar een medewerker — zelfde Application
// Settings als de dossier-taken (api/medewerker-dossier-bijlage).
const TAAK_KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const TAAK_SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const TAAK_RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";
const TAAK_DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";

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
function vulBestandsnaamIn(sjabloon, { klantnaam, soort, rubriek, datum }) {
  return String(sjabloon || "")
    .replace(/\{\{\s*klantnaam\s*\}\}/gi, klantnaam || "")
    .replace(/\{\{\s*soort\s*\}\}/gi, soort || "")
    .replace(/\{\{\s*rubriek\s*\}\}/gi, rubriek || "")
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

// Optieset-opties (waarde + label) van een keuzelijst-veld op Task ophalen via Dataverse-metadata —
// zelfde bron als /api/beheer-taaksoorten. Best-effort: [] bij een lege veldnaam of fout.
async function haalPicklistOpties(resource, token, veld) {
  if (!veld) return [];
  const basis = `${resource}/api/data/v9.2/EntityDefinitions(LogicalName='task')/Attributes(LogicalName='${veld}')`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
  try {
    const typeRes = await fetch(`${basis}?$select=AttributeType`, { headers });
    if (!typeRes.ok) return [];
    const { AttributeType } = await typeRes.json();
    const metadataType = AttributeType === "MultiSelectPicklist"
      ? "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"
      : "Microsoft.Dynamics.CRM.PicklistAttributeMetadata";
    const optiesRes = await fetch(`${basis}/${metadataType}?$select=LogicalName&$expand=OptionSet`, { headers });
    if (!optiesRes.ok) return [];
    const data = await optiesRes.json();
    return ((data.OptionSet && data.OptionSet.Options) || []).map((o) => ({ waarde: o.Value, label: (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value) }));
  } catch { return []; }
}

// Is de (doorgezette) Dynamics-taak afgetekend? statecode 1 = Voltooid. Best-effort: false bij fout.
async function taakIsAfgerond(resource, token, taakId) {
  if (!taakId) return false;
  try {
    const res = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?$select=statecode`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!res.ok) return false;
    const d = await res.json();
    return Number(d.statecode) === 1;
  } catch { return false; }
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
      // Config voor het doorzet-venster: medewerkerslijst + taak-soort/rubriek-opties.
      if (req.query && (req.query.config === "1" || req.query.config === "true")) {
        let medewerkers = [];
        try {
          const tarieven = await lijstTarieven();
          medewerkers = (Array.isArray(tarieven) ? tarieven : [])
            .filter((t) => t && t.actief !== false && (t.medewerker_naam || t.medewerker_email))
            .map((t) => ({ naam: t.medewerker_naam || t.medewerker_email, email: t.medewerker_email || "" }))
            .sort((a, b) => String(a.naam).localeCompare(String(b.naam), "nl"));
        } catch { /* best-effort */ }
        let taakSoortOpties = [], taakRubriekOpties = [];
        try {
          const token = await haalDynamicsToken();
          [taakSoortOpties, taakRubriekOpties] = await Promise.all([
            haalPicklistOpties(resource, token, TAAK_SOORT_VELD),
            haalPicklistOpties(resource, token, TAAK_RUBRIEK_VELD),
          ]);
        } catch { /* best-effort */ }
        // Standaardtijd per taaksoort (Beheer → Taken → "Std. uren") — voor het voorinvullen van de uren.
        let standaardUrenPerSoort = {};
        try { standaardUrenPerSoort = await haalStandaardUrenPerSoort(); } catch { standaardUrenPerSoort = {}; }
        // Bevroren taaksoorten (Beheer → Taken) uit de keuzelijst filteren.
        try {
          const inst = await haalInstellingen().catch(() => ({}));
          const bevroren = new Set(Object.entries(inst.taaksoorten || {}).filter(([, v]) => v && v.bevroren).map(([k]) => String(k)));
          if (bevroren.size) taakSoortOpties = taakSoortOpties.filter((o) => !bevroren.has(String(o.waarde)));
        } catch { /* best-effort */ }
        context.res = json(200, { medewerkers, taakSoortOpties, taakRubriekOpties, standaardUrenPerSoort });
        return;
      }

      const bereik = String((req.query && req.query.bereik) || "kantoor");
      let posten = await haalPostboek();
      // Reconcile: is de Dynamics-taak van een doorgezet poststuk afgetekend, dan gaat het poststuk mee.
      // Zonder gevraagde melding → meteen "afgehandeld"; mét melding → "teaccepteren" (de doorzetter accepteert).
      const doorgezetMetTaak = posten.filter((p) => p && p.status === "doorgezet" && p.taakId);
      if (doorgezetMetTaak.length) {
        let token = null;
        try { token = await haalDynamicsToken(); } catch { token = null; }
        if (token) {
          let veranderd = false;
          for (const p of doorgezetMetTaak) {
            if (await taakIsAfgerond(resource, token, p.taakId)) {
              const nu = new Date().toISOString();
              if (p.meldingBijAfronden) await werkBij(p.id, { status: "teaccepteren", taakAfgerondOp: nu });
              else await werkBij(p.id, { status: "afgehandeld", afgehandeldDoor: "taak afgerond", afgehandeldOp: nu, taakAfgerondOp: nu });
              veranderd = true;
            }
          }
          if (veranderd) posten = await haalPostboek();
        }
      }
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

      // ── Accepteren: een "te accepteren" poststuk (taak afgerond) definitief op afgehandeld zetten ──
      if (actie === "accepteren") {
        const id = String((req.body && req.body.id) || "");
        if (!id) { context.res = json(400, { error: "Geef 'id' mee." }); return; }
        const bijgewerkt = await werkBij(id, { status: "afgehandeld", afgehandeldDoor: email || "onbekend", afgehandeldOp: new Date().toISOString(), geaccepteerd: true });
        if (!bijgewerkt) { context.res = json(404, { error: "Postboek-regel niet gevonden." }); return; }
        context.res = json(200, { ok: true, post: bijgewerkt });
        return;
      }

      // ── Poststuk verwijderen (alléén beheerders) — verwijdert de registratie, niet het SharePoint-bestand ──
      if (actie === "verwijder") {
        if (!rollen.includes("beheerder")) { context.res = json(403, { error: "Alleen beheerders mogen poststukken verwijderen." }); return; }
        const id = String((req.body && req.body.id) || "");
        if (!id) { context.res = json(400, { error: "Geef 'id' mee." }); return; }
        const weg = await verwijder(id);
        if (!weg) { context.res = json(404, { error: "Postboek-regel niet gevonden." }); return; }
        await logGebeurtenis({
          door: email || "onbekend", actie: "postboek-verwijderd", accountId: weg.accountId || "", accountIds: weg.accountId ? [weg.accountId] : [], klantnaam: weg.klantnaam || "",
          tekst: `Poststuk "${weg.bestand || "?"}" (${weg.soortLabel || "?"}) uit het postboek verwijderd. Het SharePoint-document blijft staan.`,
        }).catch(() => {});
        context.res = json(200, { ok: true, verwijderd: id });
        return;
      }

      // ── Poststuk doorzetten naar een medewerker (maakt een Dynamics-taak in diens Taken) ──
      if (actie === "doorzetten") {
        const id = String((req.body && req.body.id) || "");
        const naarEmail = String((req.body && req.body.naarEmail) || "").trim();
        const opmerking = String((req.body && req.body.opmerking) || "").trim();
        const urenRaw = (req.body && req.body.uren);
        // Wil de doorzetter een melding als de taak is afgehandeld, zodat hij het poststuk zelf accepteert?
        const meldingBijAfronden = !!(req.body && req.body.meldingBijAfronden);
        // Optionele overschrijving van de standaard taak-soort/rubriek (Beheer → Postboek per soort).
        const soortOverride = (req.body && req.body.taakSoort);
        const rubriekOverride = (req.body && req.body.taakRubriek);
        if (!id) { context.res = json(400, { error: "Geef 'id' mee." }); return; }
        if (!naarEmail) { context.res = json(400, { error: "Kies een medewerker om naar door te zetten." }); return; }

        const lijst = await haalPostboek();
        const regel = lijst.find((e) => e && e.id === id);
        if (!regel) { context.res = json(404, { error: "Postboek-regel niet gevonden." }); return; }

        const token = await haalDynamicsToken();
        const doel = await haalSystemuser(resource, token, naarEmail);
        if (!doel.id) { context.res = json(409, { error: `Geen actieve Dynamics-medewerker gevonden voor ${naarEmail}.` }); return; }

        // Standaard taak-soort/rubriek uit de postboek-soort; de meegestuurde override wint.
        const instellingen = await haalInstellingen().catch(() => ({}));
        const soortCfg = (Array.isArray(instellingen.postboekSoorten) ? instellingen.postboekSoorten : []).find((s) => s && s.id === regel.soortId) || {};
        const soortWaarde = (soortOverride != null && soortOverride !== "") ? soortOverride : soortCfg.taakSoort;
        const rubriekWaarde = (rubriekOverride != null && rubriekOverride !== "") ? rubriekOverride : soortCfg.taakRubriek;

        const taakBody = {
          subject: `${regel.soortLabel || "Inkomende post"}${regel.klantnaam ? ` — ${regel.klantnaam}` : ""}`,
          description: `${opmerking ? opmerking + "\n\n" : ""}Doorgezet vanuit het postboek door ${email || "onbekend"}.${regel.bestand ? ` Bestand: ${regel.bestand}.` : ""}${regel.documentUrl ? `\n${regel.documentUrl}` : ""}`,
          "ownerid@odata.bind": `/systemusers(${doel.id})`,
        };
        if (GUID.test(String(regel.accountId || ""))) {
          try { const klantNav = await haalNavigatieNaam(resource, "task", TAAK_KLANT_VELD, token); if (klantNav) taakBody[`${klantNav}@odata.bind`] = `/accounts(${regel.accountId})`; } catch { /* zonder klant-koppeling doorgaan */ }
        }
        if (TAAK_SOORT_VELD && soortWaarde != null && soortWaarde !== "" && Number.isFinite(Number(soortWaarde))) taakBody[TAAK_SOORT_VELD] = Number(soortWaarde);
        if (TAAK_RUBRIEK_VELD && rubriekWaarde != null && rubriekWaarde !== "" && Number.isFinite(Number(rubriekWaarde))) taakBody[TAAK_RUBRIEK_VELD] = Number(rubriekWaarde);
        if (TAAK_DOCUMENT_VELD && regel.documentUrl) taakBody[TAAK_DOCUMENT_VELD] = regel.documentUrl;

        const taakRes = await fetch(`${resource}/api/data/v9.2/tasks`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", Prefer: "return=representation" },
          body: JSON.stringify(taakBody),
        });
        if (!taakRes.ok) { context.res = json(502, { error: `Aanmaken taak mislukt (${taakRes.status}): ${await taakRes.text()}` }); return; }
        const taak = await taakRes.json().catch(() => ({}));
        const taakId = taak.activityid || taak.taskid || "";

        // Indicatie-uren (planning/bezetting) op de taak zetten.
        let urenGezet = null;
        if (taakId && urenRaw != null && String(urenRaw).trim() !== "") {
          try { urenGezet = await zetTijd(taakId, urenRaw); } catch { /* uren niet blokkerend */ }
        }

        const betrokken = [...new Set([...(Array.isArray(regel.betrokkenEmails) ? regel.betrokkenEmails : []), naarEmail].map((e) => String(e || "").trim()).filter(Boolean))];
        const bijgewerkt = await werkBij(id, {
          status: "doorgezet",
          doorgezetNaarNaam: doel.naam || naarEmail,
          doorgezetNaarEmail: naarEmail,
          doorgezetOpmerking: opmerking,
          doorgezetUren: urenGezet,
          doorgezetOp: new Date().toISOString(),
          doorgezetDoor: email || "onbekend",
          meldingBijAfronden,
          taakId,
          betrokkenEmails: betrokken,
        });

        await logGebeurtenis({
          door: email || "onbekend", actie: "postboek-doorgezet", accountId: regel.accountId || "", accountIds: regel.accountId ? [regel.accountId] : [], klantnaam: regel.klantnaam || "",
          tekst: `Poststuk "${regel.bestand || "?"}" (${regel.soortLabel || "?"}) doorgezet naar ${doel.naam || naarEmail}${urenGezet != null ? ` (${urenGezet} u)` : ""}${opmerking ? ` — "${opmerking}"` : ""}.`,
        }).catch(() => {});

        context.res = json(200, { ok: true, post: bijgewerkt, taakId });
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
      const veiligeNaam = bepaalDoelBestandsnaam(soort.bestandsnaam, (req.body && req.body.bestandsnaam) || "", { klantnaam, soort: soort.label, rubriek: String(soort.rubriek || "").trim(), datum }, bestaandeNamenLower);
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
        soortId, soortLabel: soort.label || "", rubriek: String(soort.rubriek || "").trim(),
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
