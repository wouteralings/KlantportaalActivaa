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
  const [tarievenOpen, setTarievenOpen] = useState(true);

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
        <div onClick={() => setTarievenOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: tarievenOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
          Tarieven & deadline per medewerker
        </div>
        {tarievenOpen && (
          <>
            <div style={{ position: "relative", maxWidth: 320, margin: "12px 0 10px" }}>
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
            {medewerkers && gefilterd.length > 0 && <div style={{ marginTop: 10 }}><Paginatie totaal={gefilterd.length} getoond={zichtbaar.length} toonAantal={toonAantal} setToonAantal={setToonAantal} /></div>}
          </>
        )}
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
  const [open, setOpen] = useState(true);
  const [actief, setActief] = useState(!!begin.herinneringActief);
  const [weekdag, setWeekdag] = useState(begin.herinneringWeekdag || 5);
  const [minuren, setMinuren] = useState(begin.herinneringMinuren ?? 40);
  const [webhook, setWebhook] = useState(begin.herinneringWebhook || "");
  const [tekst, setTekst] = useState(begin.herinneringTekst || "");
  // Tweede, onafhankelijke herinnering.
  const [actief2, setActief2] = useState(!!begin.herinnering2Actief);
  const [weekdag2, setWeekdag2] = useState(begin.herinnering2Weekdag || 1);
  const [minuren2, setMinuren2] = useState(begin.herinnering2Minuren ?? 40);
  const [webhook2, setWebhook2] = useState(begin.herinnering2Webhook || "");
  const [tekst2, setTekst2] = useState(begin.herinnering2Tekst || "");
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);

  const opslaan = async () => {
    setBezig(true); setOk(false); onFout("");
    try {
      const res = await fetch("/api/beheer-uren-tarieven", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actie: "instellingen",
          herinnering_actief: actief, herinnering_weekdag: Number(weekdag), herinnering_minuren: Number(minuren), herinnering_webhook: webhook.trim() || null, herinnering_tekst: tekst.trim() || null,
          herinnering2_actief: actief2, herinnering2_weekdag: Number(weekdag2), herinnering2_minuren: Number(minuren2), herinnering2_webhook: webhook2.trim() || null, herinnering2_tekst: tekst2.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOk(true); setTimeout(() => setOk(false), 1800);
    } catch (e) { onFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const blok = (opts) => (
    <div style={{ borderTop: opts.tweede ? `1px solid ${KLEUR.rand}` : "none", paddingTop: opts.tweede ? 14 : 0, marginTop: opts.tweede ? 14 : 0 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: opts.tweede ? 700 : 400, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={opts.actief} onChange={(e) => opts.setActief(e.target.checked)} /> {opts.titel}
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>{opts.tweede ? "Herinneringsdag" : "Deadline-dag"}</span>
          <select value={opts.weekdag} onChange={(e) => opts.setWeekdag(e.target.value)} style={{ ...veld, width: 150 }}>
            {WEEKDAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Minimum uren/week</span>
          <input value={opts.minuren} onChange={(e) => opts.setMinuren(e.target.value)} inputMode="decimal" style={{ ...veld, width: 110 }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        <span style={lbl}>Webhook-URL{opts.tweede ? " (leeg = zelfde als eerste)" : " (Teams / Power Automate)"}</span>
        <input value={opts.webhook} onChange={(e) => opts.setWebhook(e.target.value)} placeholder={opts.tweede ? "leeg laten = webhook van de eerste herinnering" : "https://…"} style={{ ...veld, width: "100%" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={lbl}>Herinneringstekst</span>
        <textarea value={opts.tekst} onChange={(e) => opts.setTekst(e.target.value)} rows={2} placeholder={opts.tweede ? "Laatste herinnering: je uren zijn nog niet volledig." : "Vergeet niet je uren voor deze week volledig te schrijven."} style={{ ...veld, width: "100%", resize: "vertical" }} />
      </div>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, maxWidth: 640 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
        <Bell size={16} color={KLEUR.blauw} /> Herinneringsflow
      </div>
      {open && (
        <>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "8px 0 14px" }}>
            Op de ingestelde dag krijgen medewerkers die deze week minder dan het minimum aantal uren hebben geschreven een
            herinnering via de webhook (bijv. Teams/Power Automate). Je kunt een tweede herinnering instellen op een andere dag
            (bijv. een strengere reminder). De dagelijkse aanroep loopt via <code>/api/verwerk-uren-herinneringen</code>.
          </div>
          {blok({ titel: "Eerste herinnering inschakelen", actief, setActief, weekdag, setWeekdag, minuren, setMinuren, webhook, setWebhook, tekst, setTekst, tweede: false })}
          {blok({ titel: "Tweede herinnering inschakelen", actief: actief2, setActief: setActief2, weekdag: weekdag2, setWeekdag: setWeekdag2, minuren: minuren2, setMinuren: setMinuren2, webhook: webhook2, setWebhook: setWebhook2, tekst: tekst2, setTekst: setTekst2, tweede: true })}
          <button onClick={opslaan} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", marginTop: 16, background: ok ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={14} /> : <Save size={14} />} {ok ? "Opgeslagen" : "Instellingen opslaan"}
          </button>
        </>
      )}
    </div>
  );
}

const lbl = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" };
const uur = (n) => (n == null || isNaN(n) ? "0" : Number(n).toLocaleString("nl-NL", { maximumFractionDigits: 2 }));

const CAT_LABEL = { abonnement: "Abonnement", uxt: "UXT", indirect: "Indirect", kantoor: "Kantoor" };

const VASTE_DAGEN = [[1, "Ma"], [2, "Di"], [3, "Wo"], [4, "Do"], [5, "Vr"]];
const STANDAARD_DAG = 8;        // uren per werkdag → 5 × 8 = 40 uur/week
const WEEK_DOEL = STANDAARD_DAG * VASTE_DAGEN.length;
const clamp8 = (n) => Math.max(0, Math.min(STANDAARD_DAG, n));

/**
 * Werkrooster per medewerker — rijen = medewerkers, kolommen = Ma t/m Vr. De beheerder vult per dag de
 * GEWERKTE uren in. Elke dag onder 8 uur wordt automatisch aangevuld met parttime-uren tot 8 uur, zodat
 * iedereen op 40 uur/week uitkomt. Die parttime-aanvulling wordt als vaste uren vastgelegd (gekozen
 * urencode, bijv. "Parttime") en verschijnt vergrendeld in de weekstaat van de medewerker.
 *
 * Opslag: alleen de parttime-aanvulling wordt bewaard (uren = 8 − gewerkt per dag). Het rooster wordt
 * bij het openen exact teruggerekend (gewerkt = 8 − opgeslagen parttime), dus er is geen aparte
 * rooster-opslag nodig en de weekstaat-kant blijft ongewijzigd. In-/uitklapbaar, met zoek + paginatie.
 * Weekend-slots (za/zo) en slots van andere codes blijven behouden.
 */
function VasteUren({ medewerkers, vasteUrenMap, onFout }) {
  const [open, setOpen] = useState(true);
  const [codes, setCodes] = useState([]);
  const [codeNaam, setCodeNaam] = useState("");
  const [zoek, setZoek] = useState("");
  const [toonAantal, setToonAantal] = useState(50);
  const [grid, setGrid] = useState({});        // { emailLower: { 1:"8", 2:"", … } } — GEWERKTE uren
  const [rijBezig, setRijBezig] = useState(""); // e-mail die wordt opgeslagen
  const [rijOk, setRijOk] = useState("");       // e-mail net opgeslagen

  useEffect(() => {
    fetch("/api/beheer-urencodes").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const nd = (d.codes || []).filter((c) => c.actief !== false && (c.categorie === "indirect" || c.categorie === "kantoor"));
        setCodes(nd);
        setCodeNaam((huidig) => huidig || (nd.find((c) => /part\s*time|parttime/i.test(c.naam)) || nd[0])?.naam || "");
      })
      .catch(() => setCodes([]));
  }, []);

  // Rooster terugrekenen uit de opgeslagen parttime-uren: gewerkt = 8 − parttime (geen slot = 8 = volle werkdag).
  useEffect(() => {
    if (!codeNaam) { setGrid({}); return; }
    const g = {};
    for (const m of (medewerkers || [])) {
      if (!m.email) continue;
      const el = m.email.toLowerCase();
      const slots = (vasteUrenMap && vasteUrenMap[el]) || [];
      const row = {};
      for (const [n] of VASTE_DAGEN) {
        const s = slots.find((x) => x.urencode === codeNaam && Number(x.weekdag) === n);
        const parttime = s ? Number(s.uren) || 0 : 0;
        const gewerkt = clamp8(STANDAARD_DAG - parttime);
        row[n] = gewerkt > 0 ? String(gewerkt) : ""; // leeg = vrije dag (volledig parttime)
      }
      g[el] = row;
    }
    setGrid(g);
  }, [codeNaam, vasteUrenMap, medewerkers]);

  const cel = (el, n, val) => setGrid((g) => ({ ...g, [el]: { ...(g[el] || {}), [n]: val } }));
  const gewerktVan = (el, n) => clamp8(Number(String(grid[el]?.[n] ?? "").replace(",", ".")) || 0);
  const parttimeVan = (el, n) => STANDAARD_DAG - gewerktVan(el, n);
  const rijGewerkt = (el) => VASTE_DAGEN.reduce((s, [n]) => s + gewerktVan(el, n), 0);
  const rijParttime = (el) => VASTE_DAGEN.reduce((s, [n]) => s + parttimeVan(el, n), 0);

  const opslaanRij = async (m) => {
    const el = m.email.toLowerCase();
    setRijBezig(el); setRijOk(""); onFout("");
    try {
      const bestaand = (vasteUrenMap && vasteUrenMap[el]) || [];
      // Behoud slots van ándere codes én eventuele weekend-slots (za/zo) van deze code.
      const behoud = bestaand.filter((s) => s.urencode !== codeNaam || Number(s.weekdag) > 5);
      // Parttime-aanvulling per dag = 8 − gewerkt (alleen bewaren als er iets aan te vullen valt).
      const nieuw = VASTE_DAGEN
        .map(([n]) => ({ urencode: codeNaam, weekdag: n, uren: parttimeVan(el, n) }))
        .filter((s) => s.uren > 0);
      const res = await fetch("/api/beheer-uren-tarieven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "vaste_uren", email: m.email, slots: behoud.concat(nieuw) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setRijOk(el); setTimeout(() => setRijOk((x) => (x === el ? "" : x)), 1500);
    } catch (e) { onFout("Vaste uren opslaan mislukt: " + String(e.message || e)); }
    finally { setRijBezig(""); }
  };

  const gefilterd = (medewerkers || []).filter((m) => m.email).filter((m) => { const q = zoek.trim().toLowerCase(); return !q || `${m.naam} ${m.email} ${m.functie}`.toLowerCase().includes(q); });
  const zichtbaar = toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal);
  const celStijl = { ...veld, width: 52, textAlign: "center", padding: "6px 4px" };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
        <Clock size={16} color={KLEUR.blauw} /> Werkrooster & parttime per medewerker
      </div>
      {open && (
        <>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "8px 0 12px" }}>
            Vul per medewerker per dag de <strong>gewerkte uren</strong> in. Elke dag onder de 8 uur wordt automatisch aangevuld met
            parttime-uren tot 8, zodat iedereen op <strong>40 uur/week</strong> uitkomt. De <span style={{ background: "#FBF3E4", color: KLEUR.goud, fontWeight: 700, padding: "0 5px", borderRadius: 4 }}>gouden</span> vakjes tonen de parttime-aanvulling;
            die verschijnt vergrendeld in de weekstaat van de medewerker. Laat een dag leeg voor een volledig vrije (parttime) dag.
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={lbl}>Parttime-urencode</span>
              <select value={codeNaam} onChange={(e) => setCodeNaam(e.target.value)} style={{ ...veld, width: 220 }}>
                {codes.length === 0 && <option value="">— geen niet-declarabele code —</option>}
                {codes.map((c) => <option key={c.id} value={c.naam}>{c.naam} ({CAT_LABEL[c.categorie] || c.categorie})</option>)}
              </select>
            </div>
            <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
              <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
              <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker…" style={{ ...veld, width: "100%", padding: "8px 9px 8px 28px" }} />
            </div>
          </div>

          {codes.length === 0 ? (
            <div style={{ fontSize: 12, color: KLEUR.goud }}>Er zijn nog geen niet-declarabele urencodes (indirect/kantoor). Maak er hierboven eerst een aan, bijv. “Parttime” of “Verlof”.</div>
          ) : (
            <>
              <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "#FBFBF9" }}>
                      <th style={th}>Medewerker</th>
                      {VASTE_DAGEN.map(([n, l]) => <th key={n} style={{ ...th, textAlign: "center" }}>{l}</th>)}
                      <th style={{ ...th, textAlign: "center" }}>Gewerkt · Parttime</th>
                      <th style={{ ...th, textAlign: "center" }}>Totaal</th>
                      <th style={{ ...th, width: 1 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gefilterd.length === 0 ? (
                      <tr><td style={{ ...td, color: KLEUR.mutedTekst }} colSpan={VASTE_DAGEN.length + 4}>Geen medewerkers gevonden.</td></tr>
                    ) : zichtbaar.map((m) => {
                      const el = m.email.toLowerCase();
                      const gewerkt = rijGewerkt(el);
                      const parttime = rijParttime(el);
                      const totaal = gewerkt + parttime;
                      return (
                        <tr key={el}>
                          <td style={td}><div style={{ fontWeight: 600 }}>{m.naam}</div><div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{m.functie || m.email}</div></td>
                          {VASTE_DAGEN.map(([n]) => {
                            const pt = parttimeVan(el, n);
                            return (
                              <td key={n} style={{ ...td, textAlign: "center", background: pt > 0 ? "#FBF3E4" : "transparent" }}>
                                <input value={grid[el]?.[n] ?? ""} onChange={(e) => cel(el, n, e.target.value)} inputMode="decimal" placeholder="0" title={pt > 0 ? `${pt} u parttime automatisch aangevuld` : "Volle werkdag"} style={celStijl} />
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: KLEUR.goud, marginTop: 2, height: 11 }}>{pt > 0 ? `+${uur(pt)} pt` : ""}</div>
                              </td>
                            );
                          })}
                          <td style={{ ...td, textAlign: "center", fontSize: 11.5, whiteSpace: "nowrap" }}>
                            <span style={{ fontWeight: 700, color: KLEUR.blauw }}>{uur(gewerkt)}</span>
                            <span style={{ color: KLEUR.mutedTekst }}> · </span>
                            <span style={{ fontWeight: 700, color: KLEUR.goud }}>{uur(parttime)}</span>
                          </td>
                          <td style={{ ...td, textAlign: "center", fontWeight: 700, color: totaal === WEEK_DOEL ? KLEUR.groen : KLEUR.rood }}>{uur(totaal)} u</td>
                          <td style={td}>
                            <button onClick={() => opslaanRij(m)} disabled={rijBezig === el} title="Deze rij opslaan" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", background: rijOk === el ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              {rijBezig === el ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : rijOk === el ? <CheckCircle2 size={13} /> : <Save size={13} />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {gefilterd.length > 0 && <Paginatie totaal={gefilterd.length} getoond={zichtbaar.length} toonAantal={toonAantal} setToonAantal={setToonAantal} />}
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
                Elke dag telt als 8 uur (werk + parttime). Een volle werkdag = 8, een vrije dag laat je leeg (→ 8 u parttime). Klik op het
                opslaan-icoon achter de rij. Iemand die meer dan 8 uur op een dag werkt, valt buiten deze standaard — die regel je met losse uren.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Urencodes({ onFout }) {
  const [open, setOpen] = useState(true);
  const [codes, setCodes] = useState(null);
  const [categorieen, setCategorieen] = useState(["abonnement", "uxt", "indirect", "kantoor"]);
  const [nieuw, setNieuw] = useState({ naam: "", categorie: "kantoor" });
  const [bezig, setBezig] = useState(false);
  const [toonAantal, setToonAantal] = useState(50);

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
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
        <Tag size={16} color={KLEUR.blauw} /> Urencodes
      </div>
      {open && (
        <>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "8px 0 12px", maxWidth: 720 }}>
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
        </>
      )}
    </div>
  );
}
