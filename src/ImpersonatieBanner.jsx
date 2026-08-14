/**
 * Banner die bovenaan het medewerkers- of beheerdersportaal verschijnt zodra een beheerder "kijkt als
 * rol" (impersonatie, zie /api/impersonatie + /api/mijn-toegang). Altijd zichtbaar en met een
 * Stop-knop — ook wanneer de nagebootste rol zelf geen enkel tabblad zou tonen — zodat de beheerder
 * nooit vastloopt in de voorbeeldweergave.
 *
 * De harde beveiliging blijft altijd op de echte identiteit van de beheerder; dit stuurt enkel de UI.
 */
import { useState } from "react";
import { Eye, X } from "lucide-react";

const linkKnop = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
  background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.4)",
  borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
};

export default function ImpersonatieBanner({ impersonatie, huidigPortaal }) {
  const [bezig, setBezig] = useState(false);
  if (!impersonatie || !impersonatie.actief) return null;

  const stop = async () => {
    setBezig(true);
    try {
      await fetch("/api/impersonatie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "stop" }),
      });
    } catch {
      /* Herladen toont sowieso weer de eigen weergave; de serverstatus is dan hooguit nog even actief. */
    }
    window.location.reload();
  };

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 9999, display: "flex", alignItems: "center", flexWrap: "wrap",
      gap: 10, padding: "9px 14px", marginBottom: 16, background: "#8A4B00", color: "#fff",
      borderRadius: 8, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13,
      boxShadow: "0 2px 8px rgba(0,0,0,.16)",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
        <Eye size={16} />
        Je kijkt als rol: {impersonatie.rolNaam || "onbekend"}
      </span>
      <span style={{ opacity: 0.85, fontSize: 12, fontWeight: 400 }}>
        Voorbeeld — dit toont wat deze rol ziet en kan.
      </span>
      <span style={{ flex: 1 }} />
      {huidigPortaal !== "medewerker" && (
        <button type="button" onClick={() => window.location.assign("/medewerker")} style={linkKnop}>Medewerkersportaal</button>
      )}
      {huidigPortaal !== "beheer" && (
        <button type="button" onClick={() => window.location.assign("/beheer")} style={linkKnop}>Beheerdersportaal</button>
      )}
      <button
        type="button" onClick={stop} disabled={bezig}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
          background: "#fff", color: "#8A4B00", border: "none", borderRadius: 6,
          fontSize: 12.5, fontWeight: 700, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.7 : 1,
        }}
      >
        <X size={14} /> {bezig ? "Stoppen…" : "Stop met kijken"}
      </button>
    </div>
  );
}
