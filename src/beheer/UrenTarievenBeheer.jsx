import { useEffect, useState } from "react";
import { Clock, Save, Loader2, Search, Bell, CheckCircle2, Database, Link2, ExternalLink, AlertCircle, Tag, Plus, Trash2, ChevronDown } from "lucide-react";

/** Zelfde palet als de rest van het beheerportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237" };
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff", outline: "none" };
const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "7px 10px", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "8px 10px", borderTop: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };
const WEEKDAGEN = [[1, "Maandag"], [2, "Dinsdag"], [3, "Woensdag"], [4, "Donderdag"], [5, "Vrijdag"], [6, "Zaterdag"], [7, "Zondag"]];
const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

function Paginatie({ totaal, getoond, toonAantal, setToonAantal }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 10, fontSize: 12, flexWrap: "wrap" }}>
      <span style={{ color: KLEUR.mutedTekst, marginRight: "auto" }}>{totaal} totaal{getoond !== totaal ? ` · ${getoond} getoond` : ""}</span>
      <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
      {AANTALLEN.map(([n, l]) => (
        <button key={l} onClick={() => setToonAantal(n)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`, background: toonAantal === n ? KLEUR.blauw : "#fff", color: toonAantal === n ? "#fff" : KLEUR.subtekst }}>{l}</button>
      ))}
    </div>
  );
}

/**
 * Beheer van de interne urenregistratie: per medewerker de uurtarieven (normaal/hoog/laag) en het
 * declarabel-doel(%), plus de herinneringsflow (deadline-weekdag, minimum uren, webhook, tekst).
 */
export default function UrenTarievenBeheer() {
  const [medewerkers, setMedewerkers] = useState(null);
  const [instellingen, setInstellingen] = useState(null);
  const [vasteUren, setVasteUren] = useState({});
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [toonAantal, setToonAantal] = useState(50);
  const [tarievenOpen, setTarievenOpen] = useState(false);

  const laad = () => {
    setMedewerkers(null); setFout("");
    fetch("/api/beheer-uren-tarieven")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMedewerkers(d.medewerkers || []); setInstellingen(d.instellingen || null); setVasteUren(d.vasteUren || {}); })
      .catch(() => { setMedewerkers([]); setFout("Kon het tariefbeheer niet laden. Controleer of de database-koppeling is ingesteld."); });
  };
  useEffect(() => { laad(); }, []);

  const gefilterd = (medewerkers || []).filter((m) => { const q = zoek.trim().toLowerCase(); return !q || `${m.naam} ${m.email} ${m.functie}`.toLowerCase().includes(q); });
  const zichtbaar = toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal);
  const alleNamen = [...new Set((medewerkers || []).map((m) => m.naam).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <Clock size={17} color={KLEUR.blauw} /> Urenregistratie — tarieven & herinneringen
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 760 }}>
        Stel per medewerker het normale, hoge en lage uurtarief, het declarabel-doel(%) en de leidinggevende in
        (die keurt de indirecte + kantooruren goed). Onderaan richt je de wekelijkse herinnering in voor
        medewerkers die hun uren nog niet volledig hebben geschreven.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <Koppelingen onFout={setFout} />

      <Urencodes onFout={setFout} />

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <button
          onClick={() => setTarievenOpen((v) => !v)}
          aria-expanded={tarievenOpen}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: tarievenOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Tarieven & deadline per medewerker</span>
        </button>
        {tarievenOpen && (<>
        <div style={{ position: "relative", maxWidth: 320, margin: "10px 0" }}>
          <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker…" style={{ ...veld, width: "100%", padding: "8px 9px 8px 28px" }} />
        </div>

        {medewerkers === null ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Medewerkers ophalen…</div>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "#FBFBF9" }}>
                  <th style={th}>Medewerker</th><th style={th}>Normaal €/u</th><th style={th}>Hoog €/u</th><th style={th}>Laag €/u</th>
                  <th style={th}>Declarabel-doel %</th><th style={th}>Leidinggevende</th><th style={th}>Deadline</th><th style={th}>Actief</th><th style={{ ...th, width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.length === 0 ? (
                  <tr><td style={{ ...td, color: KLEUR.mutedTekst }} colSpan={9}>Geen medewerkers gevonden.</td></tr>
                ) : zichtbaar.map((m) => <TariefRij key={m.email} m={m} namen={alleNamen} />)}
              </tbody>
            </table>
          </div>
        )}
        {medewerkers && gefilterd.length > 0 && <Paginatie totaal={gefilterd.length} getoond={zichtbaar.length} toonAantal={toonAantal} setToonAantal={setToonAantal} />}
        </>)}
      </div>

      {medewerkers && <VasteUren medewerkers={medewerkers} vasteUrenMap={vasteUren} onFout={setFout} onOpgeslagen={laad} />}

      {instellingen && <Herinneringen begin={instellingen} onFout={setFout} />}
    </div>
  );
}

function Koppelingen({ onFout }) {
  const [schemaBezig, setSchemaBezig] = useState(false);
  const [schemaKlaar, setSchemaKlaar] = useState("");
  const [exact, setExact] = useState(null);

  const laadExact = () => fetch("/api/exact-oauth?actie=status").then((r) => (r.ok ? r.json() : null)).then(setExact).catch(() => setExact(null));
  useEffect(() => { laadExact(); }, []);

  const maakSchema = async () => {
    setSchemaBezig(true); setSchemaKlaar(""); onFout("");
    try {
      const res = await fetch("/api/uren-schema-setup?bevestig=ja", { method: "POST", headers: { "x-requested-with": "klantportaal" } });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setSchemaKlaar("Dataverse-tabellen aangemaakt/gecontroleerd.");
    } catch (e) { onFout("Schema aanmaken mislukt: " + String(e.message || e)); }
    finally { setSchemaBezig(false); }
  };

  const verbindExact = async () => {
    onFout("");
    try {
      const res = await fetch("/api/exact-oauth?actie=start");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      window.location.href = d.url;
    } catch (e) { onFout("Exact verbinden mislukt: " + String(e.message || e)); }
  };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div style={{ flex: "1 1 300px", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 4 }}><Database size={15} color={KLEUR.blauw} /> Dataverse-tabellen</div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10 }}>Eenmalig de tabellen <code>cr283_urenboeking</code> en <code>cr283_urentarief</code> aanmaken in Dynamics. Vereist tijdelijk de rol System Customizer op de app-gebruiker.</div>
        <button onClick={maakSchema} disabled={schemaBezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {schemaBezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Database size={13} />} Dataverse-schema aanmaken
        </button>
        {schemaKlaar && <div style={{ fontSize: 11.5, color: KLEUR.groen, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={12} /> {schemaKlaar}</div>}
      </div>

      <div style={{ flex: "1 1 300px", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 4 }}><Link2 size={15} color={KLEUR.blauw} /> Exact Online</div>
        {exact == null ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Status ophalen…</div>
        ) : !exact.geconfigureerd ? (
          <div style={{ fontSize: 12, color: KLEUR.goud, display: "flex", gap: 6, alignItems: "flex-start" }}><AlertCircle size={13} style={{ marginTop: 1 }} /> Nog niet geconfigureerd. Zet EXACT_CLIENT_ID, EXACT_CLIENT_SECRET en EXACT_REDIRECT_URI als Application Settings.</div>
        ) : exact.verbonden ? (
          <>
            <div style={{ fontSize: 12, color: KLEUR.groen, display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}><CheckCircle2 size={13} /> Verbonden{exact.division ? ` · administratie ${exact.division}` : ""}</div>
            <button onClick={verbindExact} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><ExternalLink size={12} /> Opnieuw verbinden</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10 }}>Geconfigureerd maar nog niet gekoppeld. Geef eenmalig toegang; daarna gaan goedgekeurde UXT-uren automatisch als verkoopfactuur naar Exact.</div>
            <button onClick={verbindExact} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><ExternalLink size={13} /> Verbinden met Exact</button>
          </>
        )}
      </div>
    </div>
  );
}

function TariefRij({ m, namen }) {
  const t = m.tarief || {};
  const [normaal, setNormaal] = useState(t.normaal ?? "");
  const [hoog, setHoog] = useState(t.hoog ?? "");
  const [laag, setLaag] = useState(t.laag ?? "");
  const [doel, setDoel] = useState(t.declarabelDoel ?? "");
  const [leidinggevende, setLeidinggevende] = useState(t.leidinggevende ?? "");
  const [deadline, setDeadline] = useState(t.deadlineWeekdag ?? "");
  const [actief, setActief] = useState(t.actief !== false);
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);
  const [fout, setFout] = useState("");

  const opslaan = async () => {
    setBezig(true); setOk(false); setFout("");
    try {
      const res = await fetch("/api/beheer-uren-tarieven", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "tarief", email: m.email, naam: m.naam, tarief_normaal: normaal, tarief_hoog: hoog, tarief_laag: laag, declarabel_doel: doel, leidinggevende, deadline_weekdag: deadline, actief }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOk(true); setTimeout(() => setOk(false), 1800);
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const num = { ...veld, width: 78 };
  return (
    <tr>
      <td style={td}><div style={{ fontWeight: 600 }}>{m.naam}</div><div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{m.functie || m.email}</div>{fout && <div style={{ fontSize: 10.5, color: KLEUR.rood }}>{fout}</div>}</td>
      <td style={td}><input value={normaal} onChange={(e) => setNormaal(e.target.value)} inputMode="decimal" placeholder="—" style={num} /></td>
      <td style={td}><input value={hoog} onChange={(e) => setHoog(e.target.value)} inputMode="decimal" placeholder="—" style={num} /></td>
      <td style={td}><input value={laag} onChange={(e) => setLaag(e.target.value)} inputMode="decimal" placeholder="—" style={num} /></td>
      <td style={td}><input value={doel} onChange={(e) => setDoel(e.target.value)} inputMode="decimal" placeholder="—" style={{ ...veld, width: 64 }} /></td>
      <td style={td}>
        <select value={leidinggevende} onChange={(e) => setLeidinggevende(e.target.value)} title="Keurt indirecte + kantooruren van deze medewerker goed" style={{ ...veld, width: 150 }}>
          <option value="">— geen —</option>
          {(namen || []).map((n) => <option key={n} value={n}>{n}</option>)}
          {leidinggevende && !(namen || []).includes(leidinggevende) && <option value={leidinggevende}>{leidinggevende}</option>}
        </select>
      </td>
      <td style={td}>
        <select value={deadline} onChange={(e) => setDeadline(e.target.value)} title="Uiterlijke weekdag om de weekstaat in te dienen" style={{ ...veld, width: 120 }}>
          <option value="">— geen —</option>
          {WEEKDAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
        </select>
      </td>
      <td style={td}><label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} /></label></td>
      <td style={td}>
        <button onClick={opslaan} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", background: ok ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={13} /> : <Save size={13} />} {ok ? "Opgeslagen" : "Opslaan"}
        </button>
      </td>
    </tr>
  );
}

function Herinneringen({ begin, onFout }) {
  const [actief, setActief] = useState(!!begin.herinneringActief);
  const [weekdag, setWeekdag] = useState(begin.herinneringWeekdag || 5);
  const [minuren, setMinuren] = useState(begin.herinneringMinuren ?? 40);
  const [webhook, setWebhook] = useState(begin.herinneringWebhook || "");
  const [tekst, setTekst] = useState(begin.herinneringTekst || "");
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);

  const opslaan = async () => {
    setBezig(true); setOk(false); onFout("");
    try {
      const res = await fetch("/api/beheer-uren-tarieven", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "instellingen", herinnering_actief: actief, herinnering_weekdag: Number(weekdag), herinnering_minuren: Number(minuren), herinnering_webhook: webhook.trim() || null, herinnering_tekst: tekst.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOk(true); setTimeout(() => setOk(false), 1800);
    } catch (e) { onFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 4 }}><Bell size={16} color={KLEUR.blauw} /> Herinneringsflow</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12 }}>
        Op de ingestelde deadline-dag krijgen medewerkers die deze week minder dan het minimum aantal uren hebben geschreven een
        herinnering via de webhook (bijv. Teams/Power Automate). De dagelijkse aanroep loopt via <code>/api/verwerk-uren-herinneringen</code>.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} /> Herinneringen inschakelen
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Deadline-dag</span>
          <select value={weekdag} onChange={(e) => setWeekdag(e.target.value)} style={{ ...veld, width: 150 }}>
            {WEEKDAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Minimum uren/week</span>
          <input value={minuren} onChange={(e) => setMinuren(e.target.value)} inputMode="decimal" style={{ ...veld, width: 110 }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        <span style={lbl}>Webhook-URL (Teams / Power Automate)</span>
        <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" style={{ ...veld, width: "100%" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
        <span style={lbl}>Herinneringstekst</span>
        <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} placeholder="Vergeet niet je uren voor deze week volledig te schrijven." style={{ ...veld, width: "100%", resize: "vertical" }} />
      </div>
      <button onClick={opslaan} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", background: ok ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={14} /> : <Save size={14} />} {ok ? "Opgeslagen" : "Instellingen opslaan"}
      </button>
    </div>
  );
}

const lbl = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" };

const CAT_LABEL = { abonnement: "Abonnement", uxt: "UXT", indirect: "Indirect", kantoor: "Kantoor" };

/**
 * Vaste (contract)uren per medewerker. De beheerder kiest een medewerker en legt vast welke uren elke
 * week automatisch klaarstaan (urencode + weekdag + uren) — bijvoorbeeld parttime-uren of een vaste
 * vrije dag — zodat de medewerker altijd op 40 uur uitkomt. De medewerker ziet deze uren, maar kan ze
 * niet zelf wijzigen. Alleen niet-declarabele codes (indirect/kantoor) zijn beschikbaar.
 */
function VasteUren({ medewerkers, vasteUrenMap, onFout, onOpgeslagen }) {
  const [gekozen, setGekozen] = useState("");
  const [slots, setSlots] = useState([]);
  const [codes, setCodes] = useState([]);
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/beheer-urencodes").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setCodes((d.codes || []).filter((c) => c.actief !== false))).catch(() => setCodes([]));
  }, []);

  useEffect(() => {
    if (!gekozen) { setSlots([]); return; }
    const bestaand = (vasteUrenMap && vasteUrenMap[gekozen.toLowerCase()]) || [];
    setSlots(bestaand.map((s) => ({ urencode: s.urencode || "", weekdag: s.weekdag || 5, uren: s.uren != null ? String(s.uren) : "" })));
    setOk(false);
  }, [gekozen, vasteUrenMap]);

  const nonDecl = codes.filter((c) => c.categorie === "indirect" || c.categorie === "kantoor");
  const gekozenNaam = (medewerkers || []).find((m) => m.email === gekozen)?.naam || gekozen;
  const totaalUren = slots.reduce((s, r) => s + (Number(String(r.uren).replace(",", ".")) || 0), 0);

  const voegToe = () => setSlots((s) => [...s, { urencode: nonDecl[0]?.naam || "", weekdag: 5, uren: "" }]);
  const wijzig = (i, veld, waarde) => setSlots((s) => s.map((r, j) => (j === i ? { ...r, [veld]: waarde } : r)));
  const verwijder = (i) => setSlots((s) => s.filter((_, j) => j !== i));

  const opslaan = async () => {
    if (!gekozen) return;
    setBezig(true); setOk(false); onFout("");
    try {
      const schoon = slots
        .map((r) => ({ urencode: r.urencode, weekdag: Number(r.weekdag), uren: Number(String(r.uren).replace(",", ".")) }))
        .filter((r) => r.urencode && r.uren > 0);
      const res = await fetch("/api/beheer-uren-tarieven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "vaste_uren", email: gekozen, slots: schoon }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOk(true); setTimeout(() => setOk(false), 1800);
      if (onOpgeslagen) onOpgeslagen();
    } catch (e) { onFout("Vaste uren opslaan mislukt: " + String(e.message || e)); }
    finally { setBezig(false); }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 24, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 4 }}><Clock size={16} color={KLEUR.blauw} /> Vaste uren per medewerker</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12 }}>
        Leg per medewerker de uren vast die elke week automatisch klaarstaan (bijv. parttime-uren of een vaste vrije dag). Zo komt
        iedereen op 40 uur uit. De medewerker ziet deze uren vergrendeld en kan ze niet zelf wijzigen. Alleen niet-declarabele codes.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14, maxWidth: 320 }}>
        <span style={lbl}>Medewerker</span>
        <select value={gekozen} onChange={(e) => setGekozen(e.target.value)} style={{ ...veld, width: "100%" }}>
          <option value="">Kies een medewerker…</option>
          {(medewerkers || []).filter((m) => m.email).map((m) => {
            const heeft = ((vasteUrenMap && vasteUrenMap[m.email.toLowerCase()]) || []).length;
            return <option key={m.email} value={m.email}>{m.naam}{heeft ? ` · ${heeft} vaste` : ""}</option>;
          })}
        </select>
      </div>

      {gekozen && (
        <div>
          {nonDecl.length === 0 && <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 10 }}>Er zijn nog geen niet-declarabele urencodes (indirect/kantoor). Maak er hierboven eerst een aan, bijv. “Parttime” of “Verlof”.</div>}
          {slots.length === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>Nog geen vaste uren voor {gekozenNaam}. Voeg een regel toe.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {slots.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={lbl}>Urencode</span>
                    <select value={r.urencode} onChange={(e) => wijzig(i, "urencode", e.target.value)} style={{ ...veld, width: 200 }}>
                      <option value="">Kies…</option>
                      {nonDecl.map((c) => <option key={c.id} value={c.naam}>{c.naam} ({CAT_LABEL[c.categorie] || c.categorie})</option>)}
                      {r.urencode && !nonDecl.some((c) => c.naam === r.urencode) && <option value={r.urencode}>{r.urencode}</option>}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={lbl}>Weekdag</span>
                    <select value={r.weekdag} onChange={(e) => wijzig(i, "weekdag", e.target.value)} style={{ ...veld, width: 130 }}>
                      {WEEKDAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={lbl}>Uren</span>
                    <input value={r.uren} onChange={(e) => wijzig(i, "uren", e.target.value)} inputMode="decimal" placeholder="0" style={{ ...veld, width: 70 }} />
                  </div>
                  <button onClick={() => verwijder(i)} title="Regel verwijderen" style={{ display: "inline-flex", padding: 8, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer" }}><Trash2 size={13} color={KLEUR.rood} /></button>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Totaal vaste uren per week: <strong>{totaalUren.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} u</strong></div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={voegToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Plus size={13} /> Regel toevoegen</button>
            <button onClick={opslaan} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: ok ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={13} /> : <Save size={13} />} {ok ? "Opgeslagen" : "Vaste uren opslaan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Urencodes({ onFout }) {
  const [codes, setCodes] = useState(null);
  const [categorieen, setCategorieen] = useState(["abonnement", "uxt", "indirect", "kantoor"]);
  const [nieuw, setNieuw] = useState({ naam: "", categorie: "kantoor" });
  const [bezig, setBezig] = useState(false);
  const [toonAantal, setToonAantal] = useState(50);
  const [open, setOpen] = useState(false);

  const laad = () => {
    fetch("/api/beheer-urencodes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setCodes(d.codes || []); if (d.categorieen) setCategorieen(d.categorieen); })
      .catch(() => setCodes([]));
  };
  useEffect(() => { laad(); }, []);

  const zet = async (code) => {
    try {
      const res = await fetch("/api/beheer-urencodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(code) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      laad();
    } catch (e) { onFout("Urencode opslaan mislukt: " + String(e.message || e)); }
  };
  const voegToe = async () => {
    if (!nieuw.naam.trim()) return;
    setBezig(true);
    await zet({ naam: nieuw.naam.trim(), categorie: nieuw.categorie, actief: true });
    setNieuw({ naam: "", categorie: nieuw.categorie });
    setBezig(false);
  };
  const verwijder = async (id) => {
    try { await fetch(`/api/beheer-urencodes?id=${encodeURIComponent(id)}`, { method: "DELETE" }); laad(); }
    catch (e) { onFout("Verwijderen mislukt: " + String(e.message || e)); }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
        <Tag size={16} color={KLEUR.blauw} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>Urencodes</span>
      </button>
      {open && (<>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "10px 0 12px", maxWidth: 720 }}>
        Codes waarop medewerkers uren schrijven (bijv. Verlof, Ziek, Opleiding, Reistijd, Jaarrekening). Elke code hoort bij één
        categorie; die bepaalt of hij declarabel is en hoe de facturatie/goedkeuring werkt. Zet <em>“Telt mee (declarabel-%)”</em>
        uit voor codes die het declarabel-doel niet mogen drukken, zoals verlof, overuren en parttime-uren.
      </div>

      {/* Nieuwe code */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Naam</span>
          <input value={nieuw.naam} onChange={(e) => setNieuw((n) => ({ ...n, naam: e.target.value }))} placeholder="bijv. Verlof" style={{ ...veld, width: 200 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Categorie</span>
          <select value={nieuw.categorie} onChange={(e) => setNieuw((n) => ({ ...n, categorie: e.target.value }))} style={{ ...veld, width: 150 }}>
            {categorieen.map((c) => <option key={c} value={c}>{CAT_LABEL[c] || c}</option>)}
          </select>
        </div>
        <button onClick={voegToe} disabled={bezig || !nieuw.naam.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />} Toevoegen
        </button>
      </div>

      {codes === null ? (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Urencodes ophalen…</div>
      ) : codes.length === 0 ? (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen urencodes. Voeg er hierboven een toe.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr style={{ background: "#FBFBF9" }}><th style={th}>Naam</th><th style={th}>Categorie</th><th style={th}>Telt mee (declarabel-%)</th><th style={th}>Actief</th><th style={{ ...th, width: 1 }}></th></tr></thead>
            <tbody>
              {(toonAantal === Infinity ? codes : codes.slice(0, toonAantal)).map((c) => (
                <tr key={c.id}>
                  <td style={td}><input defaultValue={c.naam} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.naam) zet({ ...c, naam: e.target.value.trim() }); }} style={{ ...veld, width: 200 }} /></td>
                  <td style={td}>
                    <select value={c.categorie} onChange={(e) => zet({ ...c, categorie: e.target.value })} style={{ ...veld, width: 150 }}>
                      {categorieen.map((cat) => <option key={cat} value={cat}>{CAT_LABEL[cat] || cat}</option>)}
                    </select>
                  </td>
                  <td style={td}><label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="Tellen deze uren mee in de noemer van het declarabel-%? Uit voor verlof/overuren/parttime."><input type="checkbox" checked={c.teltDeclarabelMee !== false} onChange={(e) => zet({ ...c, teltDeclarabelMee: e.target.checked })} /></label></td>
                  <td style={td}><input type="checkbox" checked={c.actief !== false} onChange={(e) => zet({ ...c, actief: e.target.checked })} /></td>
                  <td style={td}><button onClick={() => verwijder(c.id)} title="Verwijderen" style={{ display: "inline-flex", padding: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer" }}><Trash2 size={13} color={KLEUR.rood} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {codes && codes.length > 0 && <Paginatie totaal={codes.length} getoond={toonAantal === Infinity ? codes.length : Math.min(toonAantal, codes.length)} toonAantal={toonAantal} setToonAantal={setToonAantal} />}
      </>)}
    </div>
  );
}
