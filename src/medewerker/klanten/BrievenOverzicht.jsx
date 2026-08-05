import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, FileText, Download, FolderInput, Mail, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, X, ChevronDown, Database, PenLine,
} from "lucide-react";

/**
 * Brieven — medewerkersportaal → Klantoverzicht → Brieven (gebouwd 05-08-2026).
 *
 * Twee manieren om een brief te maken:
 *   1. "Standaardbrief uit Dynamics" — kies een klant en een brief-record (cr283_brief). De
 *      ja/nee-velden en optielijsten op dat record bepalen, via de in Beheer → Brieven ingestelde
 *      regels, welke standaardparagrafen in de brief komen (regels-engine, client-side).
 *   2. "Vrije brief" — kies een los sjabloon en pas 'm vrij aan.
 *
 * In beide gevallen worden de klantgegevens uit Dynamics (NAW, contactpersoon, relatiebeheerder,
 * belastingkantoor, …) in de {{merge-velden}} ingevuld, staat het voorbeeld altijd rechts in beeld,
 * en kan de brief als PDF/Word gedownload, in het SharePoint-dossier opgeslagen en gemaild worden.
 *
 * Databronnen: /api/beheer-klanten (klanten + NAW), /api/brief-sjablonen (afzender + sjablonen +
 * paragraaf-regels), /api/brief-records (de brief-records van een klant met hun veldwaarden),
 * /api/brieven (genereren/mailen/dossier).
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", papier: "#FFFFFF",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function samenAdres(a) { a = a || {}; return [a.straat, a.huisnummer, a.toevoeging].map(veiligeStr).filter(Boolean).join(" "); }
function postcodePlaats(a) { a = a || {}; return [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join("  "); }
function vandaagLang() { try { return new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); } catch { return new Date().toISOString().slice(0, 10); } }
function kortDatum(d) { if (!d) return ""; const t = new Date(d); return isNaN(t.getTime()) ? "" : t.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" }); }
function beleefdeAchternaam(c) { c = c || {}; return [veiligeStr(c.tussenvoegsel), veiligeStr(c.achternaam)].filter(Boolean).join(" ") || veiligeStr(c.naam); }

/** Merge-velden voor {{...}} uit een klant + afzender. */
function veldenVan(klant, afzender) {
  const k = klant || {}, c = k.contact || {}, bezoek = k.adres || {}, contactAdres = c.adres || {};
  const adresBron = samenAdres(bezoek) ? bezoek : contactAdres;
  return {
    klantnaam: veiligeStr(k.klantnaam), klantnummer: veiligeStr(k.klantnummer), groepsnaam: veiligeStr(k.groepsnaam),
    kvk: veiligeStr(k.kvk), belastingkantoor: veiligeStr(k.belastingkantoor),
    relatiebeheerder: veiligeStr(k.relatiebeheerder), accountant: veiligeStr(k.accountant),
    contactpersoon: veiligeStr(c.naam), voornaam: veiligeStr(c.voornaam), achternaam: beleefdeAchternaam(c),
    functietitel: veiligeStr(c.functietitel), email: veiligeStr(c.email) || veiligeStr(k.emailKlant),
    telefoon: veiligeStr(c.telefoon) || veiligeStr(k.telefoonKlant),
    adresregel: samenAdres(adresBron), postcode: veiligeStr(adresBron.postcode), plaats: veiligeStr(adresBron.plaats),
    postcodeplaats: postcodePlaats(adresBron), datum: vandaagLang(),
    afzendernaam: veiligeStr(afzender && afzender.bedrijfsnaam) || "Activaa", afzenderplaats: veiligeStr(afzender && afzender.plaats),
  };
}
function vulIn(sjabloontekst, velden) {
  return String(sjabloontekst || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, sleutel) => {
    const key = String(sleutel).toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.prototype.hasOwnProperty.call(velden, key) ? velden[key] : "";
  });
}

// ── Regels-engine (client-side): welke paragrafen komen mee bij een brief-record ──
function recordWaarde(waarden, veld) { const w = waarden && waarden[veld]; return w ? w.waarde : undefined; }
function gelijk(a, b) { if (typeof b === "boolean") return Boolean(a) === b; if (a == null) return false; return String(a) === String(b); }
function voorwaardeKlopt(vw, waarden) {
  if (!vw || vw.modus !== "veld") return true; // "altijd"
  const w = recordWaarde(waarden, vw.veld);
  const leeg = w == null || w === "";
  if (vw.operator === "ingevuld") return !leeg;
  if (vw.operator === "leeg") return leeg;
  if (vw.operator === "isNiet") return !gelijk(w, vw.waarde);
  return gelijk(w, vw.waarde); // "is"
}
function assembleerBody(paragrafen, waarden, velden) {
  return (paragrafen || [])
    .filter((p) => p.actief !== false && voorwaardeKlopt(p.voorwaarde, waarden))
    .map((p) => vulIn(p.tekst, velden).trim())
    .filter(Boolean)
    .join("\n\n");
}

function aanhefVan(klant) { const a = beleefdeAchternaam(klant && klant.contact); return a ? `Geachte heer/mevrouw ${a},` : "Geachte heer, mevrouw,"; }
function ontvangerRegelsVan(klant) {
  const k = klant || {}, c = k.contact || {}, bezoek = k.adres || {};
  const adresBron = samenAdres(bezoek) ? bezoek : (c.adres || {});
  const r = [];
  if (veiligeStr(k.klantnaam)) r.push(veiligeStr(k.klantnaam));
  if (veiligeStr(c.naam)) r.push(`T.a.v. ${veiligeStr(c.naam)}`);
  const adr = samenAdres(adresBron); if (adr) r.push(adr);
  const pcp = postcodePlaats(adresBron); if (pcp) r.push(pcp);
  return r.length ? r : ["(kies een klant)"];
}
function afzenderRegelsVan(afzender) {
  const a = afzender || {}, r = [];
  if (veiligeStr(a.adres)) r.push(veiligeStr(a.adres));
  const pcp = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join("  "); if (pcp) r.push(pcp);
  if (veiligeStr(a.telefoon)) r.push(`T ${veiligeStr(a.telefoon)}`);
  const contact = [veiligeStr(a.email), veiligeStr(a.website)].filter(Boolean).join("  ·  "); if (contact) r.push(contact);
  return r;
}
function voetnootVan(afzender) {
  const a = afzender || {};
  if (veiligeStr(a.voetnoot)) return veiligeStr(a.voetnoot);
  return [veiligeStr(a.bedrijfsnaam) || "Activaa", veiligeStr(a.kvk) ? `KvK ${veiligeStr(a.kvk)}` : "", veiligeStr(a.email), veiligeStr(a.website)].filter(Boolean).join("  ·  ");
}
function ondertekenaarDefault(klant, afzender) {
  const a = afzender || {};
  if (a.ondertekenaarBron === "accountant") return veiligeStr(klant && klant.accountant);
  if (a.ondertekenaarBron === "vast") return veiligeStr(a.ondertekenaarVast);
  return veiligeStr(klant && klant.relatiebeheerder);
}

function base64Download(base64, bestandsnaam, contentType) {
  const bin = atob(base64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: contentType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = bestandsnaam || "brief";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function BrievenOverzicht() {
  const [config, setConfig] = useState(null); // { afzender, sharepointMap, sjablonen, paragrafen }
  const [configFout, setConfigFout] = useState("");
  const [klanten, setKlanten] = useState(null);
  const [klantFout, setKlantFout] = useState("");

  const [zoek, setZoek] = useState("");
  const [klant, setKlant] = useState(null);
  const [modus, setModus] = useState("dynamics"); // "dynamics" | "vrij"

  // Dynamics-brief (records + regels)
  const [records, setRecords] = useState(null); // null = nog niet geladen
  const [recordVelden, setRecordVelden] = useState(null);
  const [recordsFout, setRecordsFout] = useState("");
  const [recordsLaden, setRecordsLaden] = useState(false);
  const [recordId, setRecordId] = useState("");

  // Vrije brief (sjabloon)
  const [sjabloonId, setSjabloonId] = useState("");

  // Bewerkbare brief
  const [onderwerp, setOnderwerp] = useState("");
  const [aanhef, setAanhef] = useState("");
  const [tekst, setTekst] = useState("");
  const [afsluiting, setAfsluiting] = useState("");
  const [ondertekenaar, setOndertekenaar] = useState("");
  const [naar, setNaar] = useState("");
  const [cc, setCc] = useState("");
  const [formaat, setFormaat] = useState("pdf");

  const [bezig, setBezig] = useState("");
  const [melding, setMelding] = useState(null);

  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  useEffect(() => {
    fetch("/api/brief-sjablonen").then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setConfig(d); })
      .catch(() => { if (levend.current) setConfigFout("De briefsjablonen konden niet worden geladen."); });
    fetch("/api/beheer-klanten").then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(d.klanten || []); })
      .catch(() => { if (levend.current) { setKlanten([]); setKlantFout("De klantenlijst kon niet worden geladen."); } });
  }, []);

  const afzender = (config && config.afzender) || {};
  const sjablonen = (config && config.sjablonen) || [];
  const paragrafen = (config && config.paragrafen) || [];

  // Brief-records laden zodra een klant is gekozen (voor de Dynamics-modus).
  useEffect(() => {
    setRecords(null); setRecordId(""); setRecordsFout("");
    if (!klant) return;
    setRecordsLaden(true);
    fetch(`/api/brief-records?accountId=${encodeURIComponent(klant.accountId)}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Fout ${r.status}`); return d; })
      .then((d) => { if (!levend.current) return; setRecords(d.records || []); setRecordVelden(d.velden || null); })
      .catch((e) => { if (levend.current) { setRecords([]); setRecordsFout(String(e.message || e)); } })
      .finally(() => { if (levend.current) setRecordsLaden(false); });
  }, [klant]);

  // Vrije brief: sjabloon invullen bij klant/sjabloon-wissel.
  useEffect(() => {
    if (modus !== "vrij" || !config || !sjabloonId) return;
    const sjabloon = sjablonen.find((s) => s.id === sjabloonId);
    if (!sjabloon) return;
    const velden = veldenVan(klant, afzender);
    setOnderwerp(vulIn(sjabloon.onderwerp, velden));
    setTekst(vulIn(sjabloon.tekst, velden));
    vulBasisVelden();
  }, [klant, sjabloonId, config, modus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamics-brief: paragrafen samenstellen bij record-keuze.
  useEffect(() => {
    if (modus !== "dynamics" || !config || !recordId || !records) return;
    const record = records.find((r) => r.id === recordId);
    if (!record) return;
    const velden = veldenVan(klant, afzender);
    setOnderwerp(veiligeStr(record.naam));
    setTekst(assembleerBody(paragrafen, record.waarden, velden));
    vulBasisVelden();
  }, [recordId, records, config, modus]); // eslint-disable-line react-hooks/exhaustive-deps

  function vulBasisVelden() {
    setAanhef(aanhefVan(klant));
    setAfsluiting(veiligeStr(afzender.afsluiting) || "Met vriendelijke groet,");
    setOndertekenaar(ondertekenaarDefault(klant, afzender));
    setNaar(veiligeStr(klant && klant.contact && klant.contact.email) || veiligeStr(klant && klant.emailKlant));
    setMelding(null);
  }

  const opnieuwInvullen = () => {
    if (modus === "vrij") {
      const sjabloon = sjablonen.find((s) => s.id === sjabloonId); if (!sjabloon) return;
      const velden = veldenVan(klant, afzender);
      setOnderwerp(vulIn(sjabloon.onderwerp, velden)); setTekst(vulIn(sjabloon.tekst, velden));
    } else {
      const record = records && records.find((r) => r.id === recordId); if (!record) return;
      const velden = veldenVan(klant, afzender);
      setOnderwerp(veiligeStr(record.naam)); setTekst(assembleerBody(paragrafen, record.waarden, velden));
    }
    vulBasisVelden();
  };

  const gefilterd = useMemo(() => {
    const t = zoek.trim().toLowerCase(); const lijst = klanten || [];
    if (!t) return lijst.slice(0, 12);
    return lijst.filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""} ${k.groepsnaam ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [zoek, klanten]);

  const veldLabels = useMemo(() => {
    const m = {};
    if (recordVelden) {
      for (const b of (recordVelden.booleans || [])) m[b.naam] = b.label;
      for (const o of (recordVelden.optielijsten || [])) m[o.naam] = o.label;
    }
    return m;
  }, [recordVelden]);

  const plaatsBrief = veiligeStr(afzender.plaats) || veiligeStr(klant && klant.adres && klant.adres.plaats);
  const brief = useMemo(() => ({
    afzenderNaam: veiligeStr(afzender.bedrijfsnaam) || "Activaa",
    afzenderRegels: afzenderRegelsVan(afzender),
    plaatsDatum: plaatsBrief ? `${plaatsBrief}, ${vandaagLang()}` : vandaagLang(),
    ontvangerRegels: ontvangerRegelsVan(klant),
    onderwerp, aanhef, tekst, afsluiting,
    ondertekenaarRegels: [ondertekenaar, veiligeStr(afzender.bedrijfsnaam) || "Activaa"].filter(Boolean),
    voetnoot: voetnootVan(afzender),
    logoUrl: veiligeStr(afzender.logoUrl),
    logoUitlijning: afzender.logoUitlijning || "links",
    logoGrootte: afzender.logoGrootte || "normaal",
  }), [afzender, klant, onderwerp, aanhef, tekst, afsluiting, ondertekenaar, plaatsBrief]);

  const bronNaam = modus === "vrij"
    ? ((sjablonen.find((s) => s.id === sjabloonId) || {}).naam || "Brief")
    : ((records && records.find((r) => r.id === recordId) || {}).naam || "Brief");
  const bestandsnaamBasis = `${bronNaam}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const klaarVoorActie = !!klant && (modus === "vrij" ? !!sjabloonId : !!recordId);

  async function doeActie(actie, fmt) {
    if (!klaarVoorActie) { setMelding({ type: "fout", tekst: "Kies eerst een klant én een brief." }); return; }
    setMelding(null); setBezig(actie + (fmt || ""));
    try {
      const payload = { actie, brief, bestandsnaamBasis, formaat: fmt || formaat };
      if (actie === "dossier") payload.accountId = klant.accountId;
      if (actie === "mail") { payload.naar = naar.trim(); payload.cc = cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean); }
      const res = await fetch("/api/brieven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Er ging iets mis (${res.status}).`);
      if (actie === "genereer") { base64Download(data.base64, data.bestandsnaam, data.contentType); setMelding({ type: "ok", tekst: `${data.bestandsnaam} is gedownload.` }); }
      else if (actie === "mail") { setMelding({ type: "ok", tekst: `Brief gemaild naar ${naar.trim()}.` }); }
      else if (actie === "dossier") { if (data.gedaan) setMelding({ type: "ok", tekst: "Brief opgeslagen in het SharePoint-dossier van de klant." }); else setMelding({ type: "fout", tekst: data.reden || "Opslaan in het dossier is niet gelukt." }); }
    } catch (e) { setMelding({ type: "fout", tekst: String(e.message || e) }); }
    finally { if (levend.current) setBezig(""); }
  }

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  const knop = (kleur, aan = true) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${aan ? kleur : KLEUR.rand}`, background: aan ? kleur : "#F2F3F0", color: aan ? "#fff" : KLEUR.mutedTekst, fontSize: 12.5, fontWeight: 600, cursor: aan ? "pointer" : "not-allowed" });
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  if (config === null && klanten === null && !configFout && !klantFout) {
    return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Brieven laden…</div>;
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Kies een klant en een brief; de gegevens uit Dynamics worden automatisch ingevuld en het
        voorbeeld staat rechts altijd in beeld. Bij een standaardbrief uit Dynamics bepalen de
        ja/nee-velden en optielijsten van het brief-record welke paragrafen meegaan.
      </div>

      {configFout && <Banner type="fout" tekst={configFout} />}
      {klantFout && <Banner type="fout" tekst={klantFout} />}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── Linkerkolom ── */}
        <div style={{ flex: "1 1 460px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Klant */}
          <div>
            <span style={label}>Klant</span>
            {klant ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(klant.klantnaam)}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{veiligeStr(klant.klantnummer) && `nr ${veiligeStr(klant.klantnummer)}`}{veiligeStr(klant.groepsnaam) && `  ·  ${veiligeStr(klant.groepsnaam)}`}</div>
                </div>
                <button onClick={() => { setKlant(null); setZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, cliëntnummer of groep…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                {(zoek.trim() || (klanten || []).length > 0) && (
                  <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                    {gefilterd.length === 0 ? <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen klanten gevonden.</div> : gefilterd.map((k) => (
                      <button key={k.accountId} onClick={() => { setKlant(k); setMelding(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(k.klantnaam)}</span>
                        <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{veiligeStr(k.klantnummer) && `   nr ${veiligeStr(k.klantnummer)}`}{veiligeStr(k.groepsnaam) && `   ·   ${veiligeStr(k.groepsnaam)}`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modus-schakelaar */}
          <div style={{ display: "flex", gap: 6, background: "#F2F3F0", borderRadius: 9, padding: 4 }}>
            {[["dynamics", "Standaardbrief uit Dynamics", Database], ["vrij", "Vrije brief", PenLine]].map(([k, t, Icon]) => (
              <button key={k} onClick={() => { setModus(k); setMelding(null); }} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: modus === k ? "#fff" : "transparent", color: modus === k ? KLEUR.blauw : KLEUR.subtekst, boxShadow: modus === k ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                <Icon size={14} /> {t}
              </button>
            ))}
          </div>

          {/* Bronkeuze afhankelijk van modus */}
          {modus === "dynamics" ? (
            <div>
              <span style={label}>Brief-record (Dynamics)</span>
              {!klant ? (
                <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Kies eerst een klant.</div>
              ) : recordsLaden ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}><Loader2 size={15} className="spin" /> Brief-records laden…</div>
              ) : recordsFout ? (
                <Banner type="fout" tekst={`Brief-records konden niet geladen worden: ${recordsFout}`} />
              ) : (records || []).length === 0 ? (
                <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze klant heeft geen brief-records in Dynamics. Gebruik eventueel "Vrije brief".</div>
              ) : (
                <div style={{ position: "relative" }}>
                  <select value={recordId} onChange={(e) => setRecordId(e.target.value)} style={{ ...input, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                    <option value="">— Kies een brief-record —</option>
                    {records.map((r) => <option key={r.id} value={r.id}>{veiligeStr(r.naam) || "(zonder naam)"}{r.datum ? ` — ${kortDatum(r.datum)}` : ""}</option>)}
                  </select>
                  <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                </div>
              )}
              {recordId && <RecordWaarden record={(records || []).find((r) => r.id === recordId)} labels={veldLabels} />}
            </div>
          ) : (
            <div>
              <span style={label}>Vrij sjabloon</span>
              <div style={{ position: "relative" }}>
                <select value={sjabloonId} onChange={(e) => setSjabloonId(e.target.value)} style={{ ...input, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                  <option value="">— Kies een sjabloon —</option>
                  {sjablonen.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
                </select>
                <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </div>
            </div>
          )}

          {klaarVoorActie && (
            <button onClick={opnieuwInvullen} style={{ ...knopLicht, alignSelf: "flex-start", padding: "6px 10px", fontSize: 12 }}><RefreshCw size={13} /> Opnieuw invullen vanuit de bron</button>
          )}

          {/* Bewerkbare velden */}
          <div><span style={label}>Onderwerp</span><input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} style={input} placeholder="Betreft…" /></div>
          <div><span style={label}>Aanhef</span><input value={aanhef} onChange={(e) => setAanhef(e.target.value)} style={input} /></div>
          <div><span style={label}>Tekst</span><textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={12} style={{ ...input, resize: "vertical", minHeight: 220, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Inhoud van de brief… (lege regel = nieuwe alinea)" /></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}><span style={label}>Afsluiting</span><input value={afsluiting} onChange={(e) => setAfsluiting(e.target.value)} style={input} /></div>
            <div style={{ flex: "1 1 200px" }}><span style={label}>Ondertekenaar</span><input value={ondertekenaar} onChange={(e) => setOndertekenaar(e.target.value)} style={input} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}><span style={label}>E-mail ontvanger</span><input value={naar} onChange={(e) => setNaar(e.target.value)} style={input} placeholder="naam@bedrijf.nl" /></div>
            <div style={{ flex: "1 1 180px" }}><span style={label}>CC (optioneel)</span><input value={cc} onChange={(e) => setCc(e.target.value)} style={input} placeholder="cc@… (komma-gescheiden)" /></div>
          </div>

          {/* Acties */}
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={knop(KLEUR.blauw, klaarVoorActie)} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("genereer", "pdf")}>{bezig === "genereerpdf" ? <Loader2 size={15} className="spin" /> : <Download size={15} />} PDF downloaden</button>
              <button style={{ ...knopLicht, opacity: klaarVoorActie ? 1 : 0.5, cursor: klaarVoorActie ? "pointer" : "not-allowed" }} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("genereer", "docx")}>{bezig === "genereerdocx" ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} Word downloaden</button>
              <button style={{ ...knopLicht, opacity: klaarVoorActie ? 1 : 0.5, cursor: klaarVoorActie ? "pointer" : "not-allowed" }} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("dossier")}>{bezig === "dossier" ? <Loader2 size={15} className="spin" /> : <FolderInput size={15} />} In klantdossier</button>
              <button style={knop(KLEUR.groen, klaarVoorActie && !!naar.trim())} disabled={!klaarVoorActie || !naar.trim() || !!bezig} onClick={() => doeActie("mail")}>{bezig === "mail" ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Mailen naar klant</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst, display: "flex", alignItems: "center", gap: 8 }}>
              <span>Opslaan in dossier als:</span>
              {["pdf", "docx"].map((f) => (
                <label key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: formaat === f ? KLEUR.blauw : KLEUR.subtekst, fontWeight: formaat === f ? 700 : 500 }}>
                  <input type="radio" name="dossierformaat" checked={formaat === f} onChange={() => setFormaat(f)} /> {f === "pdf" ? "PDF" : "Word"}
                </label>
              ))}
            </div>
            {melding && <div style={{ marginTop: 12 }}><Banner type={melding.type} tekst={melding.tekst} /></div>}
          </div>
        </div>

        {/* ── Rechterkolom: voorbeeld ── */}
        <div style={{ flex: "1 1 520px", minWidth: 360, position: "sticky", top: 12 }}>
          <span style={{ ...label, marginBottom: 8 }}>Voorbeeld</span>
          <BriefVoorbeeld brief={brief} />
        </div>
      </div>

      <style>{`@keyframes briefspin{to{transform:rotate(360deg)}} .spin{animation:briefspin 1s linear infinite}`}</style>
    </div>
  );
}

/** Compacte weergave van de (niet-lege) veldwaarden van het gekozen brief-record. */
function RecordWaarden({ record, labels }) {
  if (!record || !record.waarden) return null;
  const rijen = Object.entries(record.waarden)
    .filter(([, w]) => w && w.tekst != null && String(w.tekst) !== "")
    .map(([veld, w]) => [labels[veld] || veld, w.tekst]);
  if (rijen.length === 0) return null;
  return (
    <div style={{ marginTop: 8, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", background: "#FBFBF9" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>Gegevens uit dit record</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px" }}>
        {rijen.map(([l, v], i) => <span key={i} style={{ fontSize: 11.5, color: KLEUR.subtekst }}><span style={{ color: KLEUR.mutedTekst }}>{l}:</span> <strong style={{ color: KLEUR.tekst, fontWeight: 600 }}>{String(v)}</strong></span>)}
      </div>
    </div>
  );
}

function Banner({ type, tekst }) {
  const ok = type === "ok";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: ok ? "#EAF6EE" : "#FBECEC", color: ok ? KLEUR.groen : KLEUR.rood, border: `1px solid ${ok ? "#BFE3CB" : "#F0C9C9"}` }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} <span>{tekst}</span>
    </div>
  );
}

function BriefVoorbeeld({ brief }) {
  const b = brief || {};
  const alineas = String(b.tekst || "").replace(/\r\n/g, "\n").split(/\n[ \t]*\n/);
  return (
    <div style={{ background: KLEUR.papier, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.07)", padding: "48px 52px", color: KLEUR.tekst, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 13, lineHeight: 1.5, minHeight: 640 }}>
      {b.logoUrl ? (
        <div style={{ textAlign: b.logoUitlijning === "midden" ? "center" : b.logoUitlijning === "rechts" ? "right" : "left", marginBottom: 6 }}>
          <img src={b.logoUrl} alt="logo" style={{ width: ({ klein: 120, normaal: 170, groot: 230 })[b.logoGrootte] || 170, maxWidth: "100%", height: "auto", display: "inline-block" }} />
        </div>
      ) : (
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.01em" }}>{b.afzenderNaam}</div>
      )}
      <div style={{ marginTop: 4, color: KLEUR.mutedTekst, fontSize: 11.5, lineHeight: 1.45 }}>{(b.afzenderRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, margin: "16px 0 20px" }} />
      <div style={{ textAlign: "right", color: KLEUR.subtekst, marginBottom: 22 }}>{b.plaatsDatum}</div>
      <div style={{ marginBottom: 26 }}>{(b.ontvangerRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
      {b.onderwerp && <div style={{ fontWeight: 700, marginBottom: 18 }}>Betreft: {b.onderwerp}</div>}
      {b.aanhef && <div style={{ marginBottom: 14 }}>{b.aanhef}</div>}
      {alineas.map((a, i) => <div key={i} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>{a}</div>)}
      {b.afsluiting && <div style={{ marginTop: 20 }}>{b.afsluiting}</div>}
      <div style={{ height: 44 }} />
      <div>{(b.ondertekenaarRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
      {b.voetnoot && <div style={{ marginTop: 40, paddingTop: 12, borderTop: `1px solid ${KLEUR.rand}`, textAlign: "center", color: KLEUR.mutedTekst, fontSize: 10.5 }}>{b.voetnoot}</div>}
    </div>
  );
}
