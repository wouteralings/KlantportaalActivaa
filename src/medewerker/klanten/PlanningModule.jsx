/**
 * Planning (hoofdtabblad) — wrapper met de weergaven:
 *   • Maandplanning    — afgeleid uit de configuratie + rooster/bezetting (Stap 3b/3c, PlanningMaand).
 *   • Jaarplanning     — klant × activiteit per maand over 12 maanden (PlanningJaar).
 *   • Per klant        — de configuratie "wat doen we voor deze klant" (Stap 3a, PlanningConfigPerKlant).
 *   • Losse regels     — alle losse planningsregels (Stap 2, PlanningOverzicht).
 */
import { useState, useEffect } from "react";
import { List, Users, CalendarRange, CalendarDays, ListChecks } from "lucide-react";
import PlanningOverzicht from "./PlanningOverzicht";
import PlanningConfigPerKlant from "./PlanningConfigPerKlant";
import PlanningMaand from "./PlanningMaand";
import PlanningJaar from "./PlanningJaar";
import Deelactiviteiten from "./Deelactiviteiten";

const KLEUR = { blauw: "#1C5D8C", subtekst: "#5B6259", rand: "#E2E4DF" };

const SUBTABS = [
  { key: "maand", label: "Maandplanning", icon: CalendarRange },
  { key: "jaar", label: "Jaarplanning", icon: CalendarDays },
  { key: "deel", label: "Deelactiviteiten", icon: ListChecks },
  { key: "config", label: "Per klant", icon: Users },
  { key: "overzicht", label: "Losse regels", icon: List },
];

export default function PlanningModule({ subRechten = null }) {
  const [sub, setSub] = useState("maand");
  const zicht = subRechten ? subRechten.zien : () => true;
  const zichtbareSubs = SUBTABS.filter((s) => zicht(s.key));
  // Vanuit de Jaarplanning kan een klant worden aangeklikt om 'm meteen in te stellen: schakel naar
  // "Per klant" en geef de gekozen klant-account-id door (PlanningConfigPerKlant selecteert 'm dan).
  const [instelKlant, setInstelKlant] = useState("");
  const gaInstellen = (accountId) => { setInstelKlant(accountId || ""); setSub("config"); };
  // Actieve sub niet zichtbaar (rol verbergt 'm)? Spring naar de eerste zichtbare.
  useEffect(() => { if (zichtbareSubs.length && !zichtbareSubs.find((s) => s.key === sub)) setSub(zichtbareSubs[0].key); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [subRechten]);
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {zichtbareSubs.map((s) => {
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
      {zicht(sub) && sub === "maand" && <PlanningMaand />}
      {zicht(sub) && sub === "jaar" && <PlanningJaar onInstellen={gaInstellen} />}
      {zicht(sub) && sub === "deel" && <Deelactiviteiten />}
      {zicht(sub) && sub === "config" && <PlanningConfigPerKlant initieelAccountId={instelKlant} />}
      {zicht(sub) && sub === "overzicht" && <PlanningOverzicht />}
    </div>
  );
}
