/**
 * Planning (hoofdtabblad) — wrapper met twee weergaven:
 *   • Overzicht        — alle losse planningsregels (Stap 2, PlanningOverzicht).
 *   • Per klant        — de configuratie "wat doen we voor deze klant" (Stap 3a, PlanningConfigPerKlant).
 * De maandplanning-weergave (afgeleid uit de configuratie + rooster) komt hier later als derde tab bij.
 */
import { useState } from "react";
import { List, Users } from "lucide-react";
import PlanningOverzicht from "./PlanningOverzicht";
import PlanningConfigPerKlant from "./PlanningConfigPerKlant";

const KLEUR = { blauw: "#1C5D8C", subtekst: "#5B6259", rand: "#E2E4DF" };

const SUBTABS = [
  { key: "overzicht", label: "Overzicht", icon: List },
  { key: "config", label: "Per klant", icon: Users },
];

export default function PlanningModule() {
  const [sub, setSub] = useState("overzicht");
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {SUBTABS.map((s) => {
          const aan = s.key === sub;
          const Icon = s.icon;
          return (
            <button key={s.key} onClick={() => setSub(s.key)} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20,
              border: "none", background: aan ? KLEUR.blauw : "transparent", color: aan ? "#fff" : KLEUR.blauw,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>
      {sub === "overzicht" && <PlanningOverzicht />}
      {sub === "config" && <PlanningConfigPerKlant />}
    </div>
  );
}
