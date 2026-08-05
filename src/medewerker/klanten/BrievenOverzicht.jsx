import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, FileText, Download, FolderInput, Mail, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, X, ChevronDown, Building2, User, Landmark,
} from "lucide-react";

/**
 * Brieven — medewerkersportaal → Klantoverzicht → Brieven (herzien 05-08-2026).
 *
 * De medewerker kiest een klant en een standaardbrief. De geadresseerde is te kiezen: het adres van
 * de klant zelf, het gekoppelde belastingkantoor (via Dynamics-lookup op de klant), of "overig"
 * (handmatig). Een standaardbrief kan invulvelden hebben (bijv. periode: maand/kwartaal/jaar) die de
 * medewerker hier invult; samen met de klant-merge-velden vullen ze {{...}} in onderwerp/tekst. Het
 * voorbeeld staat altijd rechts in beeld (met eventueel het geüploade briefpapier als achtergrond),
 * en de brief kan als PDF/Word gedownload, in het klantdossier opgeslagen en gemaild worden.
 *
 * (De eerdere "Standaardbrief uit Dynamics"-modus met cr283_brief-records + regels-engine is er op
 * verzoek uit — "vergeet Dynamics in de brieven". De klant wordt nog wel uit Dynamics gekozen.)
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237", papier: "#FFFFFF",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function samenAdres(a) { a = a || {}; return [a.straat, a.huisnummer, a.toevoeging].map(veiligeStr).filter(Boolean).join(" "); }
function postcodePlaats(a) { a = a || {}; return [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join("  "); }
function vandaagLang() { try { return new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); } catch { return new Date().toISOString().slice(0, 10); } }
function beleefdeAchternaam(c) { c = c || {}; return [veiligeStr(c.tussenvoegsel), veiligeStr(c.achternaam)].filter(Boolean).join(" ") || veiligeStr(c.naam); }

/** Klant-merge-velden voor {{...}}. */
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
  return String(sjabloontekst || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, sleutel) => {
    const key = String(sleutel).toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.prototype.hasOwnProperty.call(velden, key) ? velden[key] : "";
  });
}

function aanhefVan(klant) { const a = beleefdeAchternaam(klant && klant.contact); return a ? `Geachte heer/mevrouw ${a},` : "Geachte heer, mevrouw,"; }
function ontvangerRegelsVanKlant(klant) {
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
  const [config, setConfig] = useState(null); // { afzender, sharepointMap, sjablonen, briefvelden }
  const [configFout, setConfigFout] = useState("");
  const [klanten, setKlanten] = useState(null);
  const [klantFout, setKlantFout] = useState("");

  const [zoek, setZoek] = useState("");
  const [klant, setKlant] = useState(null);
  const [sjabloonId, setSjabloonId] = useState("");

  // Geadresseerde
  const [geadType, setGeadType] = useState("klant"); // "klant" | "belastingkantoor" | "overig"
  const [bk, setBk] = useState({ status: "idle" }); // belastingkantoor: idle|laden|ok|niet|fout
  const [overig, setOverig] = useState({ naam: "", straat: "", huisnummer: "", postcode: "", plaats: "" });

  // Bewerkbare brief (onderwerp/tekst blijven "ruw" met {{...}}; resolven live in het voorbeeld/uitvoer)
  const [onderwerp, setOnderwerp] = useState("");
  const [aanhef, setAanhef] = useState("");
  const [tekst, setTekst] = useState("");
  const [afsluiting, setAfsluiting] = useState("");
  const [ondertekenaar, setOndertekenaar] = useState("");
  const [veldWaarden, setVeldWaarden] = useState({}); // sleutel → waarde (invulvelden)
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
  const briefvelden = (config && config.briefvelden) || [];
  const sjabloon = sjablonen.find((s) => s.id === sjabloonId) || null;
  const actieveVelddefs = useMemo(() => {
    const sleutels = (sjabloon && Array.isArray(sjabloon.velden)) ? sjabloon.velden : [];
    return sleutels.map((sl) => briefvelden.find((v) => v.sleutel === sl)).filter(Boolean);
  }, [sjabloon, briefvelden]);

  // Belastingkantoor-adres ophalen zodra dat gekozen wordt (en bij klantwissel).
  useEffect(() => {
    if (geadType !== "belastingkantoor" || !klant) { return; }
    setBk({ status: "laden" });
    fetch(`/api/brief-geadresseerde?accountId=${encodeURIComponent(klant.accountId)}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!levend.current) return;
        if (!ok) setBk({ status: "fout", fout: d.error || "Kon het belastingkantoor niet ophalen." });
        else if (!d.gekoppeld) setBk({ status: "niet" });
        else setBk({ status: "ok", naam: d.naam, adres: d.adres });
      })
      .catch((e) => { if (levend.current) setBk({ status: "fout", fout: String(e.message || e) }); });
  }, [geadType, klant]);

  // Sjabloon invullen bij keuze/klantwissel: ruwe onderwerp/tekst + defaults voor de invulvelden.
  useEffect(() => {
    if (!config || !sjabloon) return;
    setOnderwerp(sjabloon.onderwerp || "");
    setTekst(sjabloon.tekst || "");
    setAanhef(aanhefVan(klant));
    setAfsluiting(veiligeStr(afzender.afsluiting) || "Met vriendelijke groet,");
    setOndertekenaar(ondertekenaarDefault(klant, afzender));
    setNaar(veiligeStr(klant && klant.contact && klant.contact.email) || veiligeStr(klant && klant.emailKlant));
    // invulveld-defaults
    const start = {};
    for (const v of (Array.isArray(sjabloon.velden) ? sjabloon.velden : [])) {
      const def = briefvelden.find((x) => x.sleutel === v);
      if (!def) continue;
      start[v] = def.type === "keuze" && def.opties && def.opties[0] ? def.opties[0].label : "";
    }
    setVeldWaarden(start);
    setMelding(null);
  }, [sjabloonId, klant, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const gefilterd = useMemo(() => {
    const t = zoek.trim().toLowerCase(); const lijst = klanten || [];
    if (!t) return lijst.slice(0, 12);
    return lijst.filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""} ${k.groepsnaam ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [zoek, klanten]);

  const ontvangerRegels = useMemo(() => {
    if (geadType === "belastingkantoor") {
      if (bk.status !== "ok") return ["(belastingkantoor)"];
      return [veiligeStr(bk.naam) || "Belastingdienst", samenAdres(bk.adres), postcodePlaats(bk.adres)].filter(Boolean);
    }
    if (geadType === "overig") {
      const r = [];
      if (veiligeStr(overig.naam)) r.push(veiligeStr(overig.naam));
      const adr = [veiligeStr(overig.straat), veiligeStr(overig.huisnummer)].filter(Boolean).join(" "); if (adr) r.push(adr);
      const pcp = [veiligeStr(overig.postcode), veiligeStr(overig.plaats)].filter(Boolean).join("  "); if (pcp) r.push(pcp);
      return r.length ? r : ["(vul het adres in)"];
    }
    return ontvangerRegelsVanKlant(klant);
  }, [geadType, bk, overig, klant]);

  // Merge-map: klant-velden + invulvelden (sleutels genormaliseerd, net als vulIn).
  const mergeVelden = useMemo(() => {
    const m = veldenVan(klant, afzender);
    for (const [sleutel, waarde] of Object.entries(veldWaarden)) {
      m[String(sleutel).toLowerCase().replace(/[^a-z0-9]/g, "")] = veiligeStr(waarde);
    }
    return m;
  }, [klant, afzender, veldWaarden]);

  const plaatsBrief = veiligeStr(afzender.plaats) || veiligeStr(klant && klant.adres && klant.adres.plaats);
  const brief = useMemo(() => ({
    afzenderNaam: veiligeStr(afzender.bedrijfsnaam) || "Activaa",
    afzenderRegels: afzenderRegelsVan(afzender),
    plaatsDatum: plaatsBrief ? `${plaatsBrief}, ${vandaagLang()}` : vandaagLang(),
    ontvangerRegels,
    onderwerp: vulIn(onderwerp, mergeVelden),
    aanhef, tekst: vulIn(tekst, mergeVelden), afsluiting,
    ondertekenaarRegels: [ondertekenaar, veiligeStr(afzender.bedrijfsnaam) || "Activaa"].filter(Boolean),
    voetnoot: voetnootVan(afzender),
    logoUrl: veiligeStr(afzender.logoUrl), logoUitlijning: afzender.logoUitlijning || "links", logoGrootte: afzender.logoGrootte || "normaal",
    achtergrondUrl: veiligeStr(afzender.achtergrondUrl),
  }), [afzender, ontvangerRegels, onderwerp, aanhef, tekst, afsluiting, ondertekenaar, plaatsBrief, mergeVelden]);

  const bestandsnaamBasis = `${(sjabloon && sjabloon.naam) || "Brief"}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const geadresseerdeOk = geadType !== "belastingkantoor" || bk.status === "ok";
  const klaarVoorActie = !!klant && !!sjabloonId && geadresseerdeOk;

  async function doeActie(actie, fmt) {
    if (!klaarVoorActie) { setMelding({ type: "fout", tekst: "Kies eerst een klant, een brief en een geldige geadresseerde." }); return; }
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
        Kies een klant en een standaardbrief. Stel de geadresseerde in (de klant zelf, het gekoppelde
        belastingkantoor, of een handmatig adres) en vul eventuele invulvelden in. Het voorbeeld staat rechts.
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
                <button onClick={() => { setKlant(null); setZoek(""); setBk({ status: "idle" }); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
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

          {/* Sjabloon */}
          <div>
            <span style={label}>Standaardbrief</span>
            <div style={{ position: "relative" }}>
              <select value={sjabloonId} onChange={(e) => setSjabloonId(e.target.value)} style={{ ...input, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                <option value="">— Kies een sjabloon —</option>
                {sjablonen.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
              </select>
              <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
          </div>

          {/* Geadresseerde */}
          <div>
            <span style={label}>Geadresseerde</span>
            <div style={{ display: "flex", gap: 6, background: "#F2F3F0", borderRadius: 9, padding: 4 }}>
              {[["klant", "Klant", User], ["belastingkantoor", "Belastingkantoor", Landmark], ["overig", "Overig", Building2]].map(([k, t, Icon]) => (
                <button key={k} onClick={() => setGeadType(k)} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 8px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: geadType === k ? "#fff" : "transparent", color: geadType === k ? KLEUR.blauw : KLEUR.subtekst, boxShadow: geadType === k ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                  <Icon size={14} /> {t}
                </button>
              ))}
            </div>
            {geadType === "belastingkantoor" && (
              <div style={{ marginTop: 8 }}>
                {!klant ? <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Kies eerst een klant.</div>
                  : bk.status === "laden" ? <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}><Loader2 size={15} className="spin" /> Belastingkantoor ophalen…</div>
                  : bk.status === "ok" ? <div style={{ fontSize: 12.5, color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", background: "#FBFBF9" }}><strong style={{ color: KLEUR.tekst }}>{veiligeStr(bk.naam)}</strong><br />{samenAdres(bk.adres)}<br />{postcodePlaats(bk.adres)}</div>
                  : bk.status === "niet" ? <Banner type="fout" tekst="Aan deze klant is nog geen belastingkantoor gekoppeld in Dynamics. Koppel het belastingkantoor (met adres) aan de klant en probeer opnieuw." />
                  : <Banner type="fout" tekst={`Belastingkantoor kon niet worden opgehaald: ${bk.fout || ""}`} />}
              </div>
            )}
            {geadType === "overig" && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <input value={overig.naam} onChange={(e) => setOverig({ ...overig, naam: e.target.value })} placeholder="Naam / organisatie" style={{ ...input, flex: "1 1 100%" }} />
                <input value={overig.straat} onChange={(e) => setOverig({ ...overig, straat: e.target.value })} placeholder="Straat" style={{ ...input, flex: "2 1 160px" }} />
                <input value={overig.huisnummer} onChange={(e) => setOverig({ ...overig, huisnummer: e.target.value })} placeholder="Nr" style={{ ...input, flex: "0 1 80px" }} />
                <input value={overig.postcode} onChange={(e) => setOverig({ ...overig, postcode: e.target.value })} placeholder="Postcode" style={{ ...input, flex: "1 1 110px" }} />
                <input value={overig.plaats} onChange={(e) => setOverig({ ...overig, plaats: e.target.value })} placeholder="Plaats" style={{ ...input, flex: "1 1 140px" }} />
              </div>
            )}
          </div>

          {/* Invulvelden */}
          {actieveVelddefs.length > 0 && (
            <div>
              <span style={label}>Invulvelden</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {actieveVelddefs.map((v) => (
                  <div key={v.sleutel} style={{ flex: "1 1 180px", minWidth: 150 }}>
                    <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>{v.label}</div>
                    {v.type === "keuze" ? (
                      <select value={veldWaarden[v.sleutel] || ""} onChange={(e) => setVeldWaarden((w) => ({ ...w, [v.sleutel]: e.target.value }))} style={input}>
                        <option value="">—</option>
                        {(v.opties || []).map((o) => <option key={o.sleutel || o.label} value={o.label}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={veldWaarden[v.sleutel] || ""} onChange={(e) => setVeldWaarden((w) => ({ ...w, [v.sleutel]: e.target.value }))} style={input} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bewerkbare velden */}
          <div><span style={label}>Onderwerp</span><input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} style={input} placeholder="Betreft…" /></div>
          <div><span style={label}>Aanhef</span><input value={aanhef} onChange={(e) => setAanhef(e.target.value)} style={input} /></div>
          <div><span style={label}>Tekst</span><textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={11} style={{ ...input, resize: "vertical", minHeight: 200, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Inhoud van de brief… ({{velden}} worden live ingevuld)" /></div>
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

function Banner({ type, tekst }) {
  const ok = type === "ok";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: ok ? "#EAF6EE" : "#FBECEC", color: ok ? KLEUR.groen : KLEUR.rood, border: `1px solid ${ok ? "#BFE3CB" : "#F0C9C9"}` }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} <span>{tekst}</span>
    </div>
  );
}

/** Live weergave van de brief. Met een achtergrond (briefpapier) wordt die als A4-achtergrond
 *  getoond en vallen de eigen logo/afzenderkop + voetnoot weg (zit al in het briefpapier). */
function BriefVoorbeeld({ brief }) {
  const b = brief || {};
  const alineas = String(b.tekst || "").replace(/\r\n/g, "\n").split(/\n[ \t]*\n/);
  const heeftAcht = !!b.achtergrondUrl;
  const paginaStijl = {
    background: KLEUR.papier, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
    color: KLEUR.tekst, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 13, lineHeight: 1.5,
    aspectRatio: "1 / 1.414", position: "relative", overflow: "hidden",
    ...(heeftAcht
      ? { backgroundImage: `url("${b.achtergrondUrl}")`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", padding: "16% 12% 12%" }
      : { padding: "48px 52px" }),
  };
  return (
    <div style={paginaStijl}>
      {!heeftAcht && (
        <>
          {b.logoUrl ? (
            <div style={{ textAlign: b.logoUitlijning === "midden" ? "center" : b.logoUitlijning === "rechts" ? "right" : "left", marginBottom: 6 }}>
              <img src={b.logoUrl} alt="logo" style={{ width: ({ klein: 120, normaal: 170, groot: 230 })[b.logoGrootte] || 170, maxWidth: "100%", height: "auto", display: "inline-block" }} />
            </div>
          ) : (
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.01em" }}>{b.afzenderNaam}</div>
          )}
          <div style={{ marginTop: 4, color: KLEUR.mutedTekst, fontSize: 11.5, lineHeight: 1.45 }}>{(b.afzenderRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, margin: "16px 0 20px" }} />
        </>
      )}
      <div style={{ textAlign: "right", color: KLEUR.subtekst, marginBottom: 22 }}>{b.plaatsDatum}</div>
      <div style={{ marginBottom: 26 }}>{(b.ontvangerRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
      {b.onderwerp && <div style={{ fontWeight: 700, marginBottom: 18 }}>Betreft: {b.onderwerp}</div>}
      {b.aanhef && <div style={{ marginBottom: 14 }}>{b.aanhef}</div>}
      {alineas.map((a, i) => <div key={i} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>{a}</div>)}
      {b.afsluiting && <div style={{ marginTop: 20 }}>{b.afsluiting}</div>}
      <div style={{ height: 44 }} />
      <div>{(b.ondertekenaarRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
      {!heeftAcht && b.voetnoot && <div style={{ marginTop: 40, paddingTop: 12, borderTop: `1px solid ${KLEUR.rand}`, textAlign: "center", color: KLEUR.mutedTekst, fontSize: 10.5 }}>{b.voetnoot}</div>}
    </div>
  );
}
