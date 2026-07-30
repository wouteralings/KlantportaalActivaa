import { useState } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import AanleverLijstenBeheer from "./AanleverLijstenBeheer";
import AbonnementenOverzicht from "./AbonnementenOverzicht";

const KLEUR = { blauw: "#1C5D8C", subtekst: "#5B6259", rand: "#E2E4DF" };

const SUBS = [
  ["lijsten", "Lijsten", ListChecks],
  ["abonnementen", "Abonnementen", RefreshCw],
];

/**
 * Beheer-tab "Uitvraag": bundelt de aanleverlijsten (sjablonen van uit te vragen documenten) en het
 * overzicht van de abonnementen op die lijsten, onder één tab met een sub-navigatie.
 */
export default function UitvraagBeheer() {
  const [sub, setSub] = useState("lijsten");
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap", borderBottom: `1px solid ${KLEUR.rand}` }}>
        {SUBS.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 13px", background: "none", border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, marginBottom: -1,
              color: sub === k ? KLEUR.blauw : KLEUR.subtekst,
              borderBottom: `2px solid ${sub === k ? KLEUR.blauw : "transparent"}`,
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {sub === "lijsten" && <AanleverLijstenBeheer />}
      {sub === "abonnementen" && <AbonnementenOverzicht />}
    </div>
  );
}
