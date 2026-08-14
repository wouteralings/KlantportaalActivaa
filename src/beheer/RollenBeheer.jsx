/**
 * Beheer → Rollen & toegang. Maak rollen aan en bepaal per rol welke tabs (rubrieken) zichtbaar zijn in
 * het medewerkers- én beheerdersportaal en welke functies de rol mag. Wijs elke medewerker één rol toe.
 *
 * Fase 1: aanmaken + toewijzen (opslag via /api/beheer-rollen). Fase 2/3: tabs verbergen in beide
 * portalen + functies voeden. Fase 4: "kijken als rol" — met de knop per rol bekijkt de beheerder het
 * portaal precies zoals die rol het ziet en kan (server-ondersteund via /api/impersonatie).
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, CheckCircle2, ShieldCheck, Users, LayoutGrid, Eye } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff" };

function Vinkjes({ opties, geselecteerd, onToggle }) {
  const set = new Set(geselecteerd || []);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {opties.map((o) => {
        const aan = set.has(o.key);
        return (
          <button key={o.key} onClick={() => onToggle(o.key)} style={{ padding: "5px 10px", borderRadius: 20, border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`, background: aan ? KLEUR.lichtblauw : "#fff", color: aan ? KLEUR.blauw : KLEUR.mutedTekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {aan ? "✓ " : ""}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function RollenBeheer() {
  const [rollen, setRollen] = useState(null);
  const [toewijzingen, setToewijzingen] = useState({});
  const [medewerkerTabs, setMedewerkerTabs] = useState([]);
  const [beheerTabs, setBeheerTabs] = useState([]);
  const [functies, setFuncties] = useState([]);
  const [medewerkers, setMedewerkers] = useState([]);
  const [nieuweRol, setNieuweRol] = useState("");
  const [vuil, setVuil] = useState(false);
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");

  useEffect(() => {
    fetch("/api/beheer-rollen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setRollen(d.rollen || []); setToewijzingen(d.toewijzingen || {}); setMedewerkerTabs(d.medewerkerTabs || []); setBeheerTabs(d.beheerTabs || []); setFuncties(d.functies || []); })
      .catch(() => { setRollen([]); setFout("Kon de rollen niet laden."); });
    fetch("/api/beheer-medewerkers").then((r) => (r.ok ? r.json() : {})).then((d) => setMedewerkers(d.medewerkers || [])).catch(() => {});
  }, []);

  const merk = () => { setVuil(true); setStatus("rust"); };
  const opslaan = async () => {
    setStatus("bezig"); setFout("");
    try {
      const r = await fetch("/api/beheer-rollen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rollen, toewijzingen }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setRollen(d.rollen || rollen); setToewijzingen(d.toewijzingen || toewijzingen);
      setVuil(false); setStatus("opgeslagen"); setTimeout(() => setStatus((s) => (s === "opgeslagen" ? "rust" : s)), 2500);
    } catch (e) { setFout(e.message || "Opslaan mislukt."); setStatus("fout"); }
  };

  // "Kijken als rol" (fase 4): start server-side de impersonatie en ga naar het medewerkersportaal,
  // waar de banner bovenaan verschijnt. Alleen voor opgeslagen rollen en zonder open wijzigingen, zodat
  // de nagebootste rol overeenkomt met wat er is opgeslagen (en er geen werk verloren gaat bij navigeren).
  const bekijkAlsRol = async (sleutel) => {
    if (!sleutel || vuil) return;
    setFout("");
    try {
      const r = await fetch("/api/impersonatie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "start", rolSleutel: sleutel }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      window.location.assign("/medewerker");
    } catch (e) { setFout(e.message || "Kon 'kijken als rol' niet starten."); setStatus("fout"); }
  };

  const voegRolToe = () => { const naam = nieuweRol.trim(); if (!naam) return; setRollen((h) => [...(h || []), { naam, medewerkerTabs: [], beheerTabs: [], functies: {} }]); setNieuweRol(""); merk(); };
  const verwijderRol = (i) => { setRollen((h) => h.filter((_, idx) => idx !== i)); merk(); };
  const wijzigRolNaam = (i, naam) => { setRollen((h) => h.map((r, idx) => (idx === i ? { ...r, naam } : r))); merk(); };
  const toggleTab = (i, portaal, key) => { setRollen((h) => h.map((r, idx) => { if (idx !== i) return r; const veld = portaal === "beheer" ? "beheerTabs" : "medewerkerTabs"; const set = new Set(r[veld] || []); set.has(key) ? set.delete(key) : set.add(key); return { ...r, [veld]: [...set] }; })); merk(); };
  const toggleFunctie = (i, key) => { setRollen((h) => h.map((r, idx) => { if (idx !== i) return r; const f = { ...(r.functies || {}) }; f[key] ? delete f[key] : (f[key] = true); return { ...r, functies: f }; })); merk(); };
  const zetToewijzing = (email, sleutel) => { const laag = email.toLowerCase(); setToewijzingen((h) => { const n = { ...h }; if (sleutel) n[laag] = sleutel; else delete n[laag]; return n; }); merk(); };

  const rolNaam = (sleutel) => (rollen || []).find((r) => r.sleutel === sleutel)?.naam || "";
  const gefilterdeMedewerkers = medewerkers.filter((m) => { const q = zoek.trim().toLowerCase(); return !q || `${m.naam} ${m.email} ${m.functie || ""}`.toLowerCase().includes(q); });

  if (rollen === null) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Rollen laden…</div>;

  const sectiekop = (Icon, t) => <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "10px 0 6px" }}><Icon size={13} /> {t}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <ShieldCheck size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>Maak rollen aan en bepaal per rol welke tabs zichtbaar zijn (medewerkers- én beheerdersportaal) en welke functies de rol mag. Wijs onderaan elke medewerker één rol toe. De harde beveiliging (medewerker/beheerder) blijft altijd gelden — een rol verfijnt daarbinnen.</div>
      </div>

      {/* Rollen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rollen.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen rollen. Voeg er hieronder één toe.</div>}
        {rollen.map((rol, i) => (
          <div key={rol.sleutel || i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <input value={rol.naam} onChange={(e) => wijzigRolNaam(i, e.target.value)} placeholder="Naam van de rol" style={{ ...invoerStijl, flex: "0 1 320px", fontWeight: 700 }} />
              <span style={{ flex: 1 }} />
              <button
                onClick={() => bekijkAlsRol(rol.sleutel)}
                disabled={!rol.sleutel || vuil}
                title={!rol.sleutel ? "Sla eerst op om deze rol te kunnen bekijken" : vuil ? "Sla eerst je wijzigingen op" : "Bekijk het portaal als deze rol"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: (!rol.sleutel || vuil) ? "#F3F4F2" : "#fff", color: (!rol.sleutel || vuil) ? KLEUR.mutedTekst : KLEUR.blauw, fontSize: 12, fontWeight: 600, cursor: (!rol.sleutel || vuil) ? "default" : "pointer" }}
              ><Eye size={14} /> Bekijk als rol</button>
              <button onClick={() => verwijderRol(i)} title="Rol verwijderen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer" }}><Trash2 size={14} /></button>
            </div>
            {sectiekop(Users, "Medewerkersportaal — zichtbare tabs")}
            <Vinkjes opties={medewerkerTabs} geselecteerd={rol.medewerkerTabs} onToggle={(k) => toggleTab(i, "medewerker", k)} />
            {sectiekop(LayoutGrid, "Beheerdersportaal — zichtbare tabs")}
            <Vinkjes opties={beheerTabs} geselecteerd={rol.beheerTabs} onToggle={(k) => toggleTab(i, "beheer", k)} />
            {sectiekop(ShieldCheck, "Functies")}
            <Vinkjes opties={functies} geselecteerd={functies.filter((f) => rol.functies && rol.functies[f.key]).map((f) => f.key)} onToggle={(k) => toggleFunctie(i, k)} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={nieuweRol} onChange={(e) => setNieuweRol(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegRolToe(); } }} placeholder="Nieuwe rol, bijv. Assistent, Manager, Loonadministratie" style={{ ...invoerStijl, flex: "0 1 340px" }} />
          <button onClick={voegRolToe} disabled={!nieuweRol.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: nieuweRol.trim() ? KLEUR.blauw : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nieuweRol.trim() ? "pointer" : "default" }}><Plus size={14} /> Rol toevoegen</button>
        </div>
      </div>

      {/* Toewijzing per medewerker */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 8 }}><Users size={16} color={KLEUR.blauw} /> Rol per medewerker</div>
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een medewerker…" style={{ ...invoerStijl, width: "100%", maxWidth: 360, marginBottom: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
          {gefilterdeMedewerkers.map((m) => (
            <div key={m.email} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) 220px", gap: 10, alignItems: "center", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}55` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.naam}</div>
                <div style={{ fontSize: 11, color: KLEUR.mutedTekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}{m.functie ? ` · ${m.functie}` : ""}</div>
              </div>
              <select value={toewijzingen[m.email.toLowerCase()] || ""} onChange={(e) => zetToewijzing(m.email, e.target.value)} style={invoerStijl}>
                <option value="">— geen rol —</option>
                {rollen.filter((r) => r.sleutel).map((r) => <option key={r.sleutel} value={r.sleutel}>{r.naam}</option>)}
              </select>
            </div>
          ))}
          {gefilterdeMedewerkers.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "6px 2px" }}>{medewerkers.length === 0 ? "Medewerkers laden…" : "Geen medewerker gevonden."}</div>}
        </div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Nieuwe rollen verschijnen pas in deze lijst nadat je hebt opgeslagen.</div>
      </div>

      {/* Opslaan */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: status === "bezig" ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: status === "bezig" ? "default" : "pointer" }}>
          <Save size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {vuil && status !== "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Niet-opgeslagen wijzigingen.</span>}
        {status === "opgeslagen" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.groen }}><CheckCircle2 size={14} /> Opgeslagen</span>}
        {(status === "fout" || fout) && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout || "Opslaan mislukt."}</span>}
      </div>
    </div>
  );
}
