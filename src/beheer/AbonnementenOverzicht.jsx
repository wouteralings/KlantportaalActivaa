import { Fragment, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Save, Trash2, Filter, Check, X, ChevronDown, Pause, Play, CheckCircle2 } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
const KLEUR = {
  blauw: "#1C5D8C",
  goud: "#B98237",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

const FREQ_LABEL = { eenmalig: "Eenmalig", wekelijks: "Wekelijks", maandelijks: "Maandelijks", kwartaal: "Per kwartaal", halfjaarlijks: "Halfjaarlijks", jaarlijks: "Jaarlijks" };
const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];
const LEEG_FILTER = { zoek: "", frequentie: "", modus: "", email: "", actief: "aan" };

const invoer = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 12.5, outline: "none", background: "#fff" };
const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "8px 10px", borderTop: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

/**
 * Beheer-overzicht van alle abonnementen op vaste uitvragen (vragenlijsten): zoeken, filteren,
 * filters opslaan, en een aantal-per-pagina-keuze. Leest via /api/beheer-abonnementen.
 */
export default function AbonnementenOverzicht() {
  const [rijen, setRijen] = useState(null); // null = laden
  const [presets, setPresets] = useState([]);
  const [fout, setFout] = useState("");
  const [f, setF] = useState(LEEG_FILTER);
  const [toonAantal, setToonAantal] = useState(25);
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [opslaanOpen, setOpslaanOpen] = useState(false);
  const [openId, setOpenId] = useState(""); // accountId+lijstId van de opengeklapte rij
  const [werk, setWerk] = useState({}); // key -> bewerkbare abonnementvelden
  const [bezig, setBezig] = useState("");

  const laad = () => {
    setRijen(null); setFout("");
    fetch("/api/beheer-abonnementen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { setRijen(d.rijen || []); setPresets(d.filters || []); })
      .catch(() => { setRijen([]); setFout("Kon de abonnementen niet laden."); });
  };
  useEffect(() => { laad(); }, []);

  const zet = (patch) => setF((h) => ({ ...h, ...patch }));

  const gefilterd = useMemo(() => {
    const q = f.zoek.trim().toLowerCase();
    return (rijen || []).filter((r) => {
      if (f.actief === "aan" && !r.actief) return false;
      if (f.actief === "uit" && r.actief) return false;
      if (f.frequentie && r.frequentie !== f.frequentie) return false;
      if (f.modus && r.modus !== f.modus) return false;
      if (f.email === "aan" && !r.email) return false;
      if (f.email === "uit" && r.email) return false;
      if (q) {
        const hooi = `${r.klantnaam} ${r.klantnummer} ${r.lijstNaam} ${r.contactNaam}`.toLowerCase();
        if (!hooi.includes(q)) return false;
      }
      return true;
    });
  }, [rijen, f]);

  const zichtbaar = toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal);

  const sleutel = (r) => r.accountId + r.lijstId;
  const toggleRij = (r) => {
    const k = sleutel(r);
    if (openId === k) { setOpenId(""); return; }
    setWerk((h) => ({ ...h, [k]: { frequentie: r.frequentie, startDatum: r.startDatum || "", deadlineDagen: r.deadlineDagen, modus: r.modus, email: !!r.email } }));
    setOpenId(k);
  };
  const setW = (k, patch) => setWerk((h) => ({ ...h, [k]: { ...h[k], ...patch } }));

  const post = (body) => fetch("/api/beheer-abonnementen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (res) => { const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`); return d; });
  const werkRijBij = (r, ab) => setRijen((h) => (h || []).map((x) => (sleutel(x) === sleutel(r) ? { ...x, ...ab } : x)));

  const opslaan = async (r) => {
    const k = sleutel(r); const w = werk[k]; if (!w) return;
    setBezig(k);
    try { const d = await post({ actie: "abonnementBijwerken", accountId: r.accountId, lijstId: r.lijstId, patch: w }); werkRijBij(r, d.abonnement); setOpenId(""); }
    catch (e) { setFout(e.message || "Opslaan mislukt."); }
    finally { setBezig(""); }
  };
  const pauzeren = async (r, gepauzeerd) => {
    setBezig(sleutel(r));
    try { const d = await post({ actie: "abonnementPauzeren", accountId: r.accountId, lijstId: r.lijstId, gepauzeerd }); werkRijBij(r, d.abonnement); }
    catch (e) { setFout(e.message || "Pauzeren mislukt."); }
    finally { setBezig(""); }
  };
  const verwijderen = async (r) => {
    if (!window.confirm(`De automatische uitvraag "${r.lijstNaam}" voor ${r.klantnaam || r.accountId} verwijderen? De vragenlijst zelf blijft bestaan.`)) return;
    setBezig(sleutel(r));
    try { await post({ actie: "abonnementVerwijderen", accountId: r.accountId, lijstId: r.lijstId }); setRijen((h) => (h || []).filter((x) => sleutel(x) !== sleutel(r))); setOpenId(""); }
    catch (e) { setFout(e.message || "Verwijderen mislukt."); }
    finally { setBezig(""); }
  };

  const filterOpslaan = async () => {
    const naam = nieuweNaam.trim();
    if (!naam) return;
    try {
      const r = await fetch("/api/beheer-abonnementen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "filterOpslaan", naam, filter: { ...f, toonAantal: toonAantal === Infinity ? "alle" : toonAantal } }) });
      const d = await r.json();
      setPresets(d.filters || []); setNieuweNaam(""); setOpslaanOpen(false);
    } catch { setFout("Filter opslaan mislukt."); }
  };

  const presetToepassen = (p) => {
    const nf = { ...LEEG_FILTER, ...(p.filter || {}) };
    const ta = nf.toonAantal; delete nf.toonAantal;
    setF({ zoek: nf.zoek || "", frequentie: nf.frequentie || "", modus: nf.modus || "", email: nf.email || "", actief: nf.actief || "" });
    if (ta) setToonAantal(ta === "alle" ? Infinity : Number(ta) || 25);
  };

  const presetVerwijderen = async (id) => {
    try {
      const r = await fetch("/api/beheer-abonnementen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "filterVerwijderen", id }) });
      const d = await r.json();
      setPresets(d.filters || []);
    } catch { /* stil */ }
  };

  const badge = (tekst, kleur, bg) => <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: bg, color: kleur, whiteSpace: "nowrap" }}>{tekst}</span>;

  if (rijen === null) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Automatische uitvragen ophalen…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <RefreshCw size={17} color={KLEUR.blauw} /> Automatische uitvragen
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 760 }}>
            Alle automatische uitvragen (abonnementen) over alle cliënten. Klik een regel open om de
            uitvraag aan te passen, te pauzeren of te verwijderen. Zoek, filter en bewaar filters.
          </div>
        </div>
        <button onClick={laad} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 12px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <RefreshCw size={13} /> Vernieuwen
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 8 }}>{fout}</div>}

      {/* Filterbalk */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
          <input value={f.zoek} onChange={(e) => zet({ zoek: e.target.value })} placeholder="Zoek op cliënt, nummer, lijst of contactpersoon…" style={{ ...invoer, width: "100%", paddingLeft: 28 }} />
        </div>
        <select value={f.frequentie} onChange={(e) => zet({ frequentie: e.target.value })} style={invoer}>
          <option value="">Alle frequenties</option>
          {Object.entries(FREQ_LABEL).map(([w, l]) => <option key={w} value={w}>{l}</option>)}
        </select>
        <select value={f.modus} onChange={(e) => zet({ modus: e.target.value })} style={invoer}>
          <option value="">Concept & direct</option>
          <option value="concept">Concept</option>
          <option value="versturen">Direct zichtbaar</option>
        </select>
        <select value={f.email} onChange={(e) => zet({ email: e.target.value })} style={invoer}>
          <option value="">E-mail: alle</option>
          <option value="aan">E-mail: aan</option>
          <option value="uit">E-mail: uit</option>
        </select>
        <select value={f.actief} onChange={(e) => zet({ actief: e.target.value })} style={invoer}>
          <option value="aan">Actief</option>
          <option value="uit">Gestopt</option>
          <option value="">Alle statussen</option>
        </select>
        <button onClick={() => { setF(LEEG_FILTER); }} title="Filters wissen" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><X size={12} /> Wissen</button>
      </div>

      {/* Opgeslagen filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: KLEUR.mutedTekst, fontWeight: 700 }}><Filter size={12} /> Opgeslagen filters:</span>
        {presets.length === 0 && <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>nog geen</span>}
        {presets.map((p) => (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 10px", background: KLEUR.lichtblauw, borderRadius: 999, fontSize: 12, fontWeight: 600, color: KLEUR.blauw }}>
            <button onClick={() => presetToepassen(p)} style={{ background: "none", border: "none", color: KLEUR.blauw, cursor: "pointer", fontWeight: 600, padding: 0 }}>{p.naam}</button>
            <button onClick={() => presetVerwijderen(p.id)} title="Verwijderen" style={{ display: "inline-flex", background: "none", border: "none", color: KLEUR.blauw, cursor: "pointer", opacity: 0.6, padding: 2 }}><X size={12} /></button>
          </span>
        ))}
        {opslaanOpen ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input autoFocus value={nieuweNaam} onChange={(e) => setNieuweNaam(e.target.value)} onKeyDown={(e) => e.key === "Enter" && filterOpslaan()} placeholder="Naam van de filter" style={{ ...invoer, padding: "5px 8px" }} />
            <button onClick={filterOpslaan} title="Opslaan" style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" }}><Check size={13} /></button>
            <button onClick={() => { setOpslaanOpen(false); setNieuweNaam(""); }} style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, cursor: "pointer" }}><X size={13} /></button>
          </span>
        ) : (
          <button onClick={() => setOpslaanOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#fff", color: KLEUR.blauw, border: `1px dashed ${KLEUR.blauw}`, borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Save size={12} /> Huidige filter opslaan</button>
        )}
      </div>

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 6 }}>{gefilterd.length} automatische uitvra{gefilterd.length === 1 ? "ag" : "gen"}{gefilterd.length !== zichtbaar.length ? ` · ${zichtbaar.length} getoond` : ""}</div>

      {/* Tabel */}
      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#FBFBF9" }}>
              <th style={th}>Cliënt</th>
              <th style={th}>Vragenlijst</th>
              <th style={th}>Contactpersoon</th>
              <th style={th}>Frequentie</th>
              <th style={th}>Startdatum</th>
              <th style={th}>Deadline</th>
              <th style={th}>Bij start</th>
              <th style={th}>E-mail</th>
              <th style={th}>Eerstvolgende</th>
              <th style={th}>Status</th>
              <th style={{ ...th, width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {zichtbaar.length === 0 ? (
              <tr><td style={{ ...td, color: KLEUR.mutedTekst }} colSpan={11}>Geen automatische uitvragen die aan de filters voldoen.</td></tr>
            ) : zichtbaar.map((r) => {
              const k = sleutel(r);
              const open = openId === k;
              const w = werk[k] || {};
              const status = r.gepauzeerd ? badge("Gepauzeerd", KLEUR.goud, "#FBF3E4") : r.actief ? badge("Actief", KLEUR.groen, "#E7F2EA") : badge("Gestopt", KLEUR.mutedTekst, "#F0F0EC");
              return (
                <Fragment key={k}>
                  <tr onClick={() => toggleRij(r)} style={{ cursor: "pointer", background: open ? KLEUR.lichtblauw : "transparent" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.klantnaam || r.accountId}</div>
                      {r.klantnummer && <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{r.klantnummer}</div>}
                    </td>
                    <td style={td}>{r.lijstNaam}</td>
                    <td style={td}>{r.contactNaam || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{FREQ_LABEL[r.frequentie] || r.frequentie}</td>
                    <td style={td}>{r.startDatum || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{r.deadlineDagen ? `+${r.deadlineDagen} dg` : <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{r.modus === "versturen" ? badge("Direct", KLEUR.blauw, KLEUR.lichtblauw) : badge("Concept", KLEUR.goud, "#FBF3E4")}</td>
                    <td style={td}>{r.email ? badge("Aan", KLEUR.groen, "#E7F2EA") : <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{r.gepauzeerd ? <span style={{ color: KLEUR.mutedTekst }}>—</span> : (r.eerstvolgende || <span style={{ color: KLEUR.mutedTekst }}>—</span>)}</td>
                    <td style={td}>{status}</td>
                    <td style={td}><ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none" }} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td style={{ ...td, background: "#fff" }} colSpan={11}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, maxWidth: 760 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Frequentie</div>
                            <select value={w.frequentie} onChange={(e) => setW(k, { frequentie: e.target.value })} style={{ ...invoer, width: "100%" }}>
                              {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Startdatum</div>
                            <input type="date" value={w.startDatum || ""} onChange={(e) => setW(k, { startDatum: e.target.value })} style={{ ...invoer, width: "100%" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Deadline (dagen na start)</div>
                            <input type="number" min={0} value={w.deadlineDagen} onChange={(e) => setW(k, { deadlineDagen: e.target.value })} style={{ ...invoer, width: "100%" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Bij de startdatum</div>
                            <select value={w.modus} onChange={(e) => setW(k, { modus: e.target.value })} style={{ ...invoer, width: "100%" }}>
                              <option value="concept">Concept klaarzetten</option>
                              <option value="versturen">Direct zichtbaar</option>
                            </select>
                          </div>
                        </div>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.subtekst, marginTop: 10, cursor: "pointer" }}>
                          <input type="checkbox" checked={!!w.email} onChange={(e) => setW(k, { email: e.target.checked })} /> Ook een e-mail naar de contactpersoon sturen (bij “direct zichtbaar”)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          <button onClick={() => opslaan(r)} disabled={bezig === k} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><CheckCircle2 size={14} /> {bezig === k ? "Opslaan…" : "Opslaan"}</button>
                          {r.gepauzeerd
                            ? <button onClick={() => pauzeren(r, false)} disabled={bezig === k} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", color: KLEUR.groen, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Play size={13} /> Hervatten</button>
                            : <button onClick={() => pauzeren(r, true)} disabled={bezig === k} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", color: KLEUR.goud, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Pause size={13} /> Pauzeren</button>}
                          <button onClick={() => verwijderen(r)} disabled={bezig === k} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", marginLeft: "auto", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Trash2 size={13} /> Verwijderen</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Aantal per pagina */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 10, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTALLEN.map(([n, lbl]) => (
          <button key={lbl} onClick={() => setToonAantal(n)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`, background: toonAantal === n ? KLEUR.blauw : "#fff", color: toonAantal === n ? "#fff" : KLEUR.subtekst }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}
