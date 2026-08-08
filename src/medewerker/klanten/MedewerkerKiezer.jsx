/**
 * Herbruikbaar zoek-/kiesveld voor medewerkers — Planningsmodule Stap 3c ("medewerkers doorzoekbaar
 * net als klanten"). Een tekstveld met autocomplete: typ om te zoeken in de medewerkerslijst
 * (/api/mw-planning-medewerkers, uit de urentarieven), klik een naam om te kiezen. Vrije tekst blijft
 * toegestaan (voor een naam die niet in de lijst staat), zodat een afwijkende toewijzing altijd kan.
 *
 * Props: { waarde, onChange(nieuweWaarde), placeholder, stijl, klein }
 */
import { useState, useMemo } from "react";

const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8" };

// Module-brede cache zodat niet elk veld opnieuw de lijst ophaalt.
let _cache = null;
let _promise = null;
function useMedewerkers() {
  const [lijst, setLijst] = useState(_cache || []);
  if (!_cache && !_promise) {
    _promise = fetch("/api/mw-planning-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { _cache = d.medewerkers || []; return _cache; })
      .catch(() => { _cache = []; return _cache; });
  }
  if (!_cache && _promise) { _promise.then((l) => setLijst(l)); }
  return _cache || lijst;
}

export default function MedewerkerKiezer({ waarde = "", onChange, onCommit, placeholder = "Zoek medewerker…", stijl, klein = false }) {
  const medewerkers = useMedewerkers();
  const [open, setOpen] = useState(false);
  const basisStijl = stijl || { width: "100%", padding: klein ? "5px 8px" : "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: klein ? 12 : 13, color: KLEUR.tekst, boxSizing: "border-box" };

  const matches = useMemo(() => {
    const term = String(waarde || "").trim().toLowerCase();
    const bron = medewerkers || [];
    if (!term) return bron.slice(0, 8);
    return bron.filter((m) => String(m.naam || "").toLowerCase().includes(term) || String(m.email || "").toLowerCase().includes(term)).slice(0, 8);
  }, [medewerkers, waarde]);

  const exacteMatch = (medewerkers || []).some((m) => String(m.naam || "").toLowerCase() === String(waarde || "").trim().toLowerCase());

  return (
    <div style={{ position: "relative" }}>
      <input
        value={waarde}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); if (onCommit) onCommit(waarde); }, 150)}
        placeholder={placeholder}
        style={basisStijl}
      />
      {open && matches.length > 0 && !(exacteMatch && matches.length === 1) && (
        <div style={{ position: "absolute", top: "105%", left: 0, right: 0, zIndex: 50, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto" }}>
          {matches.map((m, i) => (
            <button
              key={m.email || m.naam}
              onMouseDown={(e) => { e.preventDefault(); onChange(m.naam); setOpen(false); if (onCommit) onCommit(m.naam); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: "#fff", border: "none", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, cursor: "pointer", fontSize: 12.5 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = KLEUR.lichtblauw)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {m.naam}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
