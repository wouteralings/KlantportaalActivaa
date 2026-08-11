/**
 * Gedeelde UI-bouwstenen voor de Planningsmodule — zelfde look-and-feel als het Klantoverzicht:
 *   • ScopeKnoppen  — segmented schakelaar "Mijn team" ↔ "Kantoorbreed" (filtert de medewerkers/bezetting).
 *   • ToggleKnop    — een aan/uit-knop i.p.v. een vinkje (Rooster, Declarabel-doel, …).
 *   • Paginatie     — paginagrootte-keuze 25/50/100/250/500/Alle met "X van Y getoond".
 *   • pagineer()    — helper die een lijst op de gekozen grootte afsnijdt.
 */
import { Users, Building2, Check } from "lucide-react";

const KLEUR = { blauw: "#1C5D8C", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF" };

// Segmented schakelaar: "Mijn team" ↔ "Kantoorbreed" (welke medewerkers/bezetting je ziet).
export function ScopeKnoppen({ kantoorbreed, setKantoorbreed, mijnLabel = "Mijn team", titel }) {
  const knop = (actief, links) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12.5, fontWeight: 600,
    background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst, cursor: "pointer",
    border: "none", borderRight: links ? `1px solid ${KLEUR.rand}` : "none",
  });
  return (
    <div title={titel} style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${KLEUR.rand}` }}>
      <button type="button" onClick={() => setKantoorbreed(false)} style={knop(!kantoorbreed, true)}><Users size={13} /> {mijnLabel}</button>
      <button type="button" onClick={() => setKantoorbreed(true)} style={knop(kantoorbreed, false)}><Building2 size={13} /> Kantoorbreed</button>
    </div>
  );
}

// Aan/uit-knop i.p.v. een vinkje.
export function ToggleKnop({ aan, setAan, label, titel }) {
  return (
    <button type="button" onClick={() => setAan(!aan)} title={titel} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`, background: aan ? KLEUR.blauw : "#fff", color: aan ? "#fff" : KLEUR.subtekst,
    }}>
      <span style={{ width: 13, height: 13, borderRadius: 3, display: "inline-flex", alignItems: "center", justifyContent: "center", background: aan ? "#fff" : "transparent", border: `1.5px solid ${aan ? "#fff" : KLEUR.mutedTekst}` }}>
        {aan && <Check size={9} color={KLEUR.blauw} strokeWidth={3.5} />}
      </span>
      {label}
    </button>
  );
}

// Paginering: paginagrootte (25/50/100/250/500/Alle) + "X van Y getoond".
const PAGINA_OPTIES = [25, 50, 100, 250, 500];
export function Paginatie({ totaal, getoond, grootte, setGrootte, eenheid = "regels" }) {
  const knop = (actief) => ({
    padding: "3px 10px", borderRadius: 6, border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
    background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: KLEUR.mutedTekst }}>
      <span>{getoond} van {totaal} {eenheid} getoond</span>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>Toon:</span>
        {PAGINA_OPTIES.map((o) => <button key={o} type="button" onClick={() => setGrootte(o)} style={knop(grootte === o)}>{o}</button>)}
        <button type="button" onClick={() => setGrootte("alle")} style={knop(grootte === "alle")}>Alle</button>
      </div>
    </div>
  );
}

// Snijdt een lijst af op de gekozen paginagrootte ("alle" = alles).
export function pagineer(lijst, grootte) {
  if (grootte === "alle" || !Array.isArray(lijst)) return lijst || [];
  return lijst.slice(0, grootte);
}

// Aantal dat feitelijk getoond wordt bij een totaal + grootte.
export function getoondAantal(totaal, grootte) {
  return grootte === "alle" ? totaal : Math.min(totaal, grootte);
}
