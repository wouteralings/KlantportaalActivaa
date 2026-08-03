import { useEffect, useState } from "react";
import { CalendarDays, Save, Loader2, CheckCircle2, Plus, Trash2, ChevronDown, Search, Info, History } from "lucide-react";

/** Zelfde palet als de rest van het beheerportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, net als UrenTarievenBeheer.jsx). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237" };
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff", outline: "none" };
const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "7px 10px", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "8px 10px", borderTop: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };
const lbl = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" };
const uur = (n) => (n == null || isNaN(n) ? "0" : Number(n).toLocaleString("nl-NL", { maximumFractionDigits: 2 }));
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
function RubriekKop({ open, setOpen, icoon: Icoon, children }) {
  return (
    <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
      <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
      {Icoon && <Icoon size={16} color={KLEUR.blauw} />} {children}
    </div>
  );
}

/**
 * Beheer van de verlofmodule: het landelijke fulltime aantal verlofuren per jaar, de beheerbare
 * lijst verloftypen, en het verlofsaldo-overzicht per medewerker met handmatige correcties (met
 * verplichte toelichting en een niet-aan-te-passen logboek — Wouter, 03-08-2026).
 */
export default function VerlofBeheer() {
  const [openInstellingen, setOpenInstellingen] = useState(false);
  const [openSaldo, setOpenSaldo] = useState(false);
  const [instellingen, setInstellingen] = useState(null);
  const [fout, setFout] = useState("");

  const laadInstellingen = () => {
    fetch("/api/beheer-verlof-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInstellingen)
      .catch(() => setFout("Kon de verlofinstellingen niet laden."));
  };
  useEffect(() => { laadInstellingen(); }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <CalendarDays size={17} color={KLEUR.blauw} /> Verlof
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 760 }}>
        Stel het landelijke aantal fulltime verlofuren per jaar in en beheer de verloftypen. Het werkelijke
        tegoed per medewerker wordt automatisch pro rata berekend op basis van hun werkrooster (Werkrooster &amp;
        parttime hierboven) — daar hoef je dus niets extra's voor in te voeren. Correcties op het saldo van een
        individuele medewerker doe je hieronder bij het saldo-overzicht.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <RubriekKop open={openInstellingen} setOpen={setOpenInstellingen} icoon={CalendarDays}>Instellingen — fulltime verlofuren &amp; verloftypen</RubriekKop>
        {openInstellingen && instellingen && <Instellingen begin={instellingen} onOpgeslagen={laadInstellingen} onFout={setFout} />}
        {openInstellingen && !instellingen && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 10 }}>Instellingen ophalen…</div>}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
        <RubriekKop open={openSaldo} setOpen={setOpenSaldo} icoon={History}>Verlofsaldo per medewerker &amp; correcties</RubriekKop>
        {openSaldo && <SaldoOverzicht onFout={setFout} />}
      </div>
    </div>
  );
}

function Instellingen({ begin, onOpgeslagen, onFout }) {
  const [fulltime, setFulltime] = useState(begin.verlofUrenFulltime);
  const [bezigFulltime, setBezigFulltime] = useState(false);
  const [okFulltime, setOkFulltime] = useState(false);
  const [types, setTypes] = useState(begin.verloftypen || []);
  const [nieuw, setNieuw] = useState("");
  const [bezigTypes, setBezigTypes] = useState(false);

  const opslaanFulltime = async () => {
    setBezigFulltime(true); setOkFulltime(false); onFout("");
    try {
      const res = await fetch("/api/beheer-verlof-instellingen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verlofUrenFulltime: fulltime }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOkFulltime(true); setTimeout(() => setOkFulltime(false), 1800);
    } catch (e) { onFout("Opslaan mislukt: " + String(e.message || e)); }
    finally { setBezigFulltime(false); }
  };

  const opslaanTypes = async (nieuweLijst) => {
    setBezigTypes(true); onFout("");
    try {
      const res = await fetch("/api/beheer-verlof-instellingen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "verloftypen", verloftypen: nieuweLijst }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setTypes(d.verloftypen || nieuweLijst);
      if (onOpgeslagen) onOpgeslagen();
    } catch (e) { onFout("Verloftypen opslaan mislukt: " + String(e.message || e)); }
    finally { setBezigTypes(false); }
  };

  const voegToe = () => {
    if (!nieuw.trim()) return;
    const lijst = [...types, { label: nieuw.trim(), actief: true }];
    setNieuw("");
    opslaanTypes(lijst);
  };
  const zetActief = (i, actief) => {
    const lijst = types.map((t, idx) => (idx === i ? { ...t, actief } : t));
    setTypes(lijst);
    opslaanTypes(lijst);
  };
  const hernoem = (i, label) => {
    const lijst = types.map((t, idx) => (idx === i ? { ...t, label } : t));
    opslaanTypes(lijst);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 260, marginBottom: 18 }}>
        <span style={lbl}>Fulltime verlofuren per jaar</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={fulltime} onChange={(e) => setFulltime(e.target.value)} inputMode="decimal" style={{ ...veld, width: 100 }} />
          <button onClick={opslaanFulltime} disabled={bezigFulltime} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: okFulltime ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            {bezigFulltime ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : okFulltime ? <CheckCircle2 size={13} /> : <Save size={13} />} {okFulltime ? "Opgeslagen" : "Opslaan"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 2 }}>Bijv. 200 = 25 dagen × 8 uur. Een parttimer krijgt automatisch dit aantal × hun eigen parttime-factor.</div>
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 8 }}>Verloftypen</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder="Nieuw verloftype, bijv. Studieverlof" style={{ ...veld, width: 260 }} />
        <button onClick={voegToe} disabled={bezigTypes || !nieuw.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={13} /> Toevoegen
        </button>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
          <thead><tr style={{ background: "#FBFBF9" }}><th style={th}>Label</th><th style={th}>Actief (voor nieuwe aanvragen)</th></tr></thead>
          <tbody>
            {types.map((t, i) => (
              <tr key={t.sleutel || i}>
                <td style={td}><input defaultValue={t.label} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.label) hernoem(i, e.target.value.trim()); }} style={{ ...veld, width: 220 }} /></td>
                <td style={td}><input type="checkbox" checked={t.actief !== false} onChange={(e) => zetActief(i, e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <Info size={12} style={{ marginTop: 1, flexShrink: 0 }} /> Een type uitzetten i.p.v. verwijderen — bestaande aanvragen met dat type blijven geldig.
      </div>
    </div>
  );
}

function SaldoOverzicht({ onFout }) {
  const [medewerkers, setMedewerkers] = useState(null);
  const [zoek, setZoek] = useState("");
  const [toonAantal, setToonAantal] = useState(50);
  const [open, setOpen] = useState("");

  const laad = () => {
    setMedewerkers(null);
    fetch("/api/beheer-verlof-saldo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMedewerkers(d.medewerkers || []))
      .catch(() => { setMedewerkers([]); onFout("Kon het verlofsaldo-overzicht niet laden."); });
  };
  useEffect(() => { laad(); }, []);

  const gefilterd = (medewerkers || []).filter((m) => { const q = zoek.trim().toLowerCase(); return !q || `${m.naam} ${m.email}`.toLowerCase().includes(q); });
  const zichtbaar = toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ position: "relative", maxWidth: 320, marginBottom: 10 }}>
        <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker…" style={{ ...veld, width: "100%", padding: "8px 9px 8px 28px" }} />
      </div>
      {medewerkers === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Saldo's ophalen…</div>
      ) : gefilterd.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen medewerkers gevonden.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zichtbaar.map((m) => <MedewerkerSaldoRij key={m.email} m={m} open={open === m.email} onToggle={() => setOpen(open === m.email ? "" : m.email)} onGewijzigd={laad} onFout={onFout} />)}
        </div>
      )}
      {medewerkers && gefilterd.length > 0 && <Paginatie totaal={gefilterd.length} getoond={zichtbaar.length} toonAantal={toonAantal} setToonAantal={setToonAantal} />}
    </div>
  );
}

function MedewerkerSaldoRij({ m, open, onToggle, onGewijzigd, onFout }) {
  const s = m.saldo;
  const [correctieUren, setCorrectieUren] = useState("");
  const [toelichting, setToelichting] = useState("");
  const [bezig, setBezig] = useState(false);

  const voegCorrectieToe = async () => {
    const aantal = Number(String(correctieUren).replace(",", "."));
    if (!aantal) { onFout("Geef een aantal uren ongelijk aan 0 (positief = erbij, negatief = eraf)."); return; }
    if (!toelichting.trim()) { onFout("Een toelichting is verplicht bij een correctie."); return; }
    setBezig(true); onFout("");
    try {
      const res = await fetch("/api/beheer-verlof-saldo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: m.email, uren: aantal, toelichting: toelichting.trim() }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setCorrectieUren(""); setToelichting("");
      if (onGewijzigd) onGewijzigd();
    } catch (e) { onFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", background: "#FBFBF9", cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: open ? "none" : "rotate(-90deg)" }} />
          <div style={{ fontWeight: 600, fontSize: 13 }}>{m.naam}</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
          <span>Basis <strong>{uur(s.basis)} u</strong></span>
          {s.correcties !== 0 && <span style={{ color: s.correcties > 0 ? KLEUR.groen : KLEUR.rood }}>Correcties <strong>{s.correcties > 0 ? "+" : ""}{uur(s.correcties)} u</strong></span>}
          <span>Opgenomen <strong>{uur(s.opgenomen)} u</strong></span>
          <span style={{ color: KLEUR.blauw }}>Resterend <strong>{uur(s.resterend)} u</strong></span>
        </div>
      </div>
      {open && (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={lbl}>Correctie (uren, +/-)</span>
              <input value={correctieUren} onChange={(e) => setCorrectieUren(e.target.value)} placeholder="bijv. -8 of 16" inputMode="decimal" style={{ ...veld, width: 110 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 260px" }}>
              <span style={lbl}>Toelichting (verplicht)</span>
              <input value={toelichting} onChange={(e) => setToelichting(e.target.value)} placeholder="Waarom deze correctie?" style={{ ...veld, width: "100%" }} />
            </div>
            <button onClick={voegCorrectieToe} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />} Correctie toevoegen
            </button>
          </div>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>Logboek — eerdere correcties (niet aan te passen)</div>
          {(!s.correctieHistorie || s.correctieHistorie.length === 0) ? (
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen correcties voor deze medewerker.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                <thead><tr style={{ background: "#FBFBF9" }}><th style={th}>Datum</th><th style={th}>Door</th><th style={th}>Uren</th><th style={th}>Toelichting</th></tr></thead>
                <tbody>
                  {s.correctieHistorie.map((c) => (
                    <tr key={c.id}>
                      <td style={td}>{new Date(c.datum).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={td}>{c.door}</td>
                      <td style={{ ...td, color: c.uren > 0 ? KLEUR.groen : KLEUR.rood, fontWeight: 700 }}>{c.uren > 0 ? "+" : ""}{uur(c.uren)} u</td>
                      <td style={td}>{c.toelichting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
