/**
 * Planning (hoofdtabblad) — wrapper met de weergaven:
 *   • Maandplanning    — afgeleid uit de configuratie + rooster/bezetting (Stap 3b/3c, PlanningMaand).
 *   • Jaarplanning     — klant × activiteit per maand over 12 maanden (PlanningJaar).
 *   • Per klant        — de configuratie "wat doen we voor deze klant" (Stap 3a, PlanningConfigPerKlant).
 *   • Losse regels     — alle losse planningsregels (Stap 2, PlanningOverzicht).
 */
import { useState } from "react";
import { List, Users, CalendarRange, CalendarDays } from "lucide-react";
import PlanningOverzicht from "./PlanningOverzicht";
import PlanningConfigPerKlant from "./PlanningConfigPerKlant";
import PlanningMaand from "./PlanningMaand";
import PlanningJaar from "./PlanningJaar";

const KLEUR = { blauw: "#1C5D8C", subtekst: "#5B6259", rand: "#E2E4DF" };

const SUBTABS = [
  { key: "maand", label: "Maandplanning", icon: CalendarRange },
  { key: "jaar", label: "Jaarplanning", icon: CalendarDays },
  { key: "config", label: "Per klant", icon: Users },
  { key: "overzicht", label: "Losse regels", icon: List },
];

export default function PlanningModule() {
  const [sub, setSub] = useState("maand");
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
      {sub === "maand" && <PlanningMaand />}
      {sub === "jaar" && <PlanningJaar />}
      {sub === "config" && <PlanningConfigPerKlant />}
      {sub === "overzicht" && <PlanningOverzicht />}
    </div>
  );
}
