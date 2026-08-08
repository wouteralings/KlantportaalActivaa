import { useEffect, useState } from "react";
import { Plus, CheckCircle2, XCircle, CalendarClock, Tag, ArrowUp, ArrowDown } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. ContractenTypesBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none" };

/** De rollen waaraan een activiteit gekoppeld kan worden (moet in sync blijven met GELDIGE_ROLLEN in
 *  api/_gedeeld/planningInstellingen.js). De planning wijst standaard de persoon in deze rol toe,
 *  afgeleid uit de klantgegevens (Dynamics). */
const ROLLEN = [
  { key: "assistent", label: "Assistent" },
  { key: "manager", label: "Manager" },
  { key: "accountant", label: "Accountant" },
  { key: "fiscaal", label: "Fiscaal medewerker" },
  { key: "loonadministratie", label: "Loonadministratie" },
  { key: "backup", label: "Backup (assistent 2)" },
];

/**
 * Beheer van de Planningsmodule-lijsten: de activiteiten (maand-/jaaractiviteiten) en de statussen
 * (met kleur). Op verzoek van Wouter (07-08-2026) volledig zelf te beheren. Opslag via
 * /api/beheer-planning-instellingen (api/_gedeeld/planningInstellingen.js). Een item UITZETTEN i.p.v.
 * verwijderen — bestaande planningsregels met dat item blijven zo geldig en tonen hun label; alleen
 * de keuzelijst bij een nieuwe regel toont enkel de actieve items. De pijltjes bepalen de volgorde
 * in die keuzelijsten (de opslag bewaart de volgorde één-op-één).
 */
const ACTIEF_KNOP = (actief, onClick) => (
  <button
    onClick={onClick}
    title={actief ? "Uitzetten (blijft geldig voor bestaande regels)" : "Weer aanzetten"}
    style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6,
      fontSize: 11.5, fontWeight: 600, cursor: "pointer", flexShrink: 0,
      border: `1px solid ${actief ? KLEUR.groen : KLEUR.rand}`,
      background: actief ? "#EAF6EE" : "#F2F3F0",
      color: actief ? KLEUR.groen : KLEUR.mutedTekst,
    }}
  >
    {actief ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{actief ? "Actief" : "Uit"}
  </button>
);

export default function PlanningInstellingenBeheer() {
  const [activiteiten, setActiviteiten] = useState(null);
  const [statussen, setStatussen] = useState(null);
  const [nieuweActiviteit, setNieuweActiviteit] = useState("");
  const [nieuweActiviteitType, setNieuweActiviteitType] = useState("maand");
  const [nieuweActiviteitRol, setNieuweActiviteitRol] = useState("assistent");
  const [nieuweStatus, setNieuweStatus] = useState("");
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");

  useEffect(() => {
    fetch("/api/beheer-planning-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setActiviteiten(d.activiteiten || []); setStatussen(d.statussen || []); })
      .catch(() => { setActiviteiten([]); setStatussen([]); setFout("Kon de planning-instellingen niet laden."); });
  }, []);

  const opslaan = async (nieuweActiviteiten, nieuweStatussen) => {
    setStatus("bezig"); setFout("");
    try {
      const r = await fetch("/api/beheer-planning-instellingen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activiteiten: nieuweActiviteiten, statussen: nieuweStatussen }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setActiviteiten(d.activiteiten || nieuweActiviteiten);
      setStatussen(d.statussen || nieuweStatussen);
      setStatus("opgeslagen");
    } catch (e) {
      setFout(e.message || "Opslaan mislukt."); setStatus("fout");
    }
  };

  // ---- Activiteiten ----
  const voegActiviteitToe = () => {
    const label = nieuweActiviteit.trim();
    if (!label) return;
    opslaan([...(activiteiten || []), { label, type: nieuweActiviteitType, rol: nieuweActiviteitRol, actief: true }], statussen || []);
    setNieuweActiviteit("");
  };
  const wijzigActiviteitLabel = (sleutel, label) => setActiviteiten((h) => (h || []).map((a) => (a.sleutel === sleutel ? { ...a, label } : a)));
  const wijzigActiviteitType = (sleutel, type) => opslaan((activiteiten || []).map((a) => (a.sleutel === sleutel ? { ...a, type } : a)), statussen || []);
  const wijzigActiviteitRol = (sleutel, rol) => opslaan((activiteiten || []).map((a) => (a.sleutel === sleutel ? { ...a, rol } : a)), statussen || []);
  const zetActiviteitActief = (sleutel, actief) => opslaan((activiteiten || []).map((a) => (a.sleutel === sleutel ? { ...a, actief } : a)), statussen || []);
  const verplaatsActiviteit = (i, richting) => {
    const doel = i + richting;
    if (!activiteiten || doel < 0 || doel >= activiteiten.length) return;
    const nieuw = [...activiteiten];
    [nieuw[i], nieuw[doel]] = [nieuw[doel], nieuw[i]];
    opslaan(nieuw, statussen || []);
  };

  // ---- Statussen ----
  const voegStatusToe = () => {
    const label = nieuweStatus.trim();
    if (!label) return;
    opslaan(activiteiten || [], [...(statussen || []), { label, kleur: "#1C5D8C", actief: true }]);
    setNieuweStatus("");
  };
  const wijzigStatusLabel = (sleutel, label) => setStatussen((h) => (h || []).map((s) => (s.sleutel === sleutel ? { ...s, label } : s)));
  const wijzigStatusKleur = (sleutel, kleur) => opslaan(activiteiten || [], (statussen || []).map((s) => (s.sleutel === sleutel ? { ...s, kleur } : s)));
  const zetStatusActief = (sleutel, actief) => opslaan(activiteiten || [], (statussen || []).map((s) => (s.sleutel === sleutel ? { ...s, actief } : s)));
  const verplaatsStatus = (i, richting) => {
    const doel = i + richting;
    if (!statussen || doel < 0 || doel >= statussen.length) return;
    const nieuw = [...statussen];
    [nieuw[i], nieuw[doel]] = [nieuw[doel], nieuw[i]];
    opslaan(activiteiten || [], nieuw);
  };

  const pijltjes = (i, lengte, verplaats) => (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button onClick={() => verplaats(i, -1)} disabled={i === 0} title="Omhoog" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: `1px solid ${KLEUR.rand}`, borderRadius: 5, background: "#fff", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer" }}><ArrowUp size={12} /></button>
      <button onClick={() => verplaats(i, 1)} disabled={i === lengte - 1} title="Omlaag" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: `1px solid ${KLEUR.rand}`, borderRadius: 5, background: "#fff", color: i === lengte - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === lengte - 1 ? "default" : "pointer" }}><ArrowDown size={12} /></button>
    </div>
  );

  const laadt = activiteiten === null || statussen === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, maxWidth: 760 }}>
        Beheer hier de <strong>activiteiten</strong> (maand- en jaaractiviteiten) en de <strong>statussen</strong> die
        medewerkers kunnen kiezen bij een planningsregel. Een item uitzetten verwijdert het niet —
        bestaande regels met dat item blijven geldig; alleen de keuzelijst bij een nieuwe regel toont
        het dan niet meer. De pijltjes bepalen de volgorde in de keuzelijst.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout}</div>}
      {status === "bezig" && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Opslaan…</div>}
      {status === "opgeslagen" && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.groen }}><CheckCircle2 size={13} /> Opgeslagen</div>}

      {laadt ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Planning-instellingen ophalen…</div>
      ) : (
        <>
          {/* Activiteiten */}
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              <CalendarClock size={16} color={KLEUR.blauw} /> Activiteiten <span style={{ fontSize: 12, fontWeight: 600, color: KLEUR.mutedTekst }}>({activiteiten.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {activiteiten.map((a, i) => (
                <div key={a.sleutel} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, opacity: a.actief ? 1 : 0.6 }}>
                  {pijltjes(i, activiteiten.length, verplaatsActiviteit)}
                  <input value={a.label} onChange={(e) => wijzigActiviteitLabel(a.sleutel, e.target.value)} onBlur={() => opslaan(activiteiten, statussen)} style={{ ...invoerStijl, flex: 1, minWidth: 0 }} />
                  <select value={a.type} onChange={(e) => wijzigActiviteitType(a.sleutel, e.target.value)} title="Maand- of jaaractiviteit" style={{ ...invoerStijl, flexShrink: 0 }}>
                    <option value="maand">Maand</option>
                    <option value="jaar">Jaar</option>
                  </select>
                  <select value={a.rol || ""} onChange={(e) => wijzigActiviteitRol(a.sleutel, e.target.value)} title="Rol die deze activiteit doet (team-toewijzing)" style={{ ...invoerStijl, flexShrink: 0 }}>
                    <option value="">— rol —</option>
                    {ROLLEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                  {ACTIEF_KNOP(a.actief, () => zetActiviteitActief(a.sleutel, !a.actief))}
                </div>
              ))}
              {activiteiten.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "8px 2px" }}>Nog geen activiteiten.</div>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={nieuweActiviteit} onChange={(e) => setNieuweActiviteit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegActiviteitToe(); } }} placeholder="Nieuwe activiteit, bijv. BTW-suppletie" style={{ ...invoerStijl, flex: "0 1 300px" }} />
              <select value={nieuweActiviteitType} onChange={(e) => setNieuweActiviteitType(e.target.value)} style={invoerStijl}>
                <option value="maand">Maand</option>
                <option value="jaar">Jaar</option>
              </select>
              <select value={nieuweActiviteitRol} onChange={(e) => setNieuweActiviteitRol(e.target.value)} title="Rol die deze activiteit doet" style={invoerStijl}>
                {ROLLEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <button onClick={voegActiviteitToe} disabled={!nieuweActiviteit.trim() || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nieuweActiviteit.trim() ? "pointer" : "default", opacity: nieuweActiviteit.trim() ? 1 : 0.6 }}><Plus size={14} /> Toevoegen</button>
            </div>
          </div>

          {/* Statussen */}
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              <Tag size={16} color={KLEUR.blauw} /> Statussen <span style={{ fontSize: 12, fontWeight: 600, color: KLEUR.mutedTekst }}>({statussen.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {statussen.map((s, i) => (
                <div key={s.sleutel} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, opacity: s.actief ? 1 : 0.6 }}>
                  {pijltjes(i, statussen.length, verplaatsStatus)}
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.kleur, background: `${s.kleur}1A`, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>{s.label || "—"}</span>
                  <input value={s.label} onChange={(e) => wijzigStatusLabel(s.sleutel, e.target.value)} onBlur={() => opslaan(activiteiten, statussen)} style={{ ...invoerStijl, flex: 1, minWidth: 0 }} />
                  <input type="color" value={s.kleur} onChange={(e) => wijzigStatusKleur(s.sleutel, e.target.value)} title="Kleur" style={{ width: 34, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", cursor: "pointer", flexShrink: 0, padding: 2 }} />
                  {ACTIEF_KNOP(s.actief, () => zetStatusActief(s.sleutel, !s.actief))}
                </div>
              ))}
              {statussen.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "8px 2px" }}>Nog geen statussen.</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nieuweStatus} onChange={(e) => setNieuweStatus(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegStatusToe(); } }} placeholder="Nieuwe status, bijv. Ter review" style={{ ...invoerStijl, flex: "0 1 300px" }} />
              <button onClick={voegStatusToe} disabled={!nieuweStatus.trim() || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nieuweStatus.trim() ? "pointer" : "default", opacity: nieuweStatus.trim() ? 1 : 0.6 }}><Plus size={14} /> Toevoegen</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
