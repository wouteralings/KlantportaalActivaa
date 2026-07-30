import { useEffect, useState } from "react";
import { User, Users } from "lucide-react";

const KLEUR = { blauw: "#1C5D8C", subtekst: "#5B6259", rand: "#E2E4DF", goud: "#B98237" };

/**
 * Haalt de naam van de ingelogde medewerker op (Dynamics systemuser fullname, via /api/mijn-naam).
 * Die naam is de basis voor de "Mijn cliënten"-filters (matcht met de klant-rolvelden).
 * Retourneert { mijnNaam, geladen }.
 */
export function useMijnNaam() {
  const [mijnNaam, setMijnNaam] = useState("");
  const [geladen, setGeladen] = useState(false);
  useEffect(() => {
    let actief = true;
    fetch("/api/mijn-naam")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) { setMijnNaam(d.naam || ""); setGeladen(true); } })
      .catch(() => { if (actief) setGeladen(true); });
    return () => { actief = false; };
  }, []);
  return { mijnNaam, geladen };
}

/** De namen van de betrokken medewerkers op een klant (voor het 'mijn cliënten'-filter). */
export function namenVanKlant(k) {
  const uit = new Set();
  const voegToe = (x) => { const n = (x && typeof x === "object" ? x.naam : x); if (n) uit.add(String(n).trim().toLowerCase()); };
  if (!k) return uit;
  voegToe(k.relatiebeheerder); voegToe(k.manager); voegToe(k.accountant); voegToe(k.accountantPersoon);
  voegToe(k.assistent); voegToe(k.fiscaalMedewerker); voegToe(k.loonadministratie);
  return uit;
}

/** True als de ingelogde medewerker (mijnNaam) betrokken is bij deze klant. */
export function isKlantVanMij(k, mijnNaam) {
  if (!mijnNaam) return false;
  return namenVanKlant(k).has(mijnNaam.trim().toLowerCase());
}

/**
 * De pill-schakelaar "Mijn cliënten / Kantoorbreed". Altijd klikbaar; bij een lege naam toont de
 * omringende lijst een hint (die geef je zelf mee via `hint`).
 */
export default function ScopeToggle({ scope, setScope }) {
  const knop = (waarde, Icon, label) => (
    <button
      onClick={() => setScope(waarde)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none",
        borderLeft: waarde === "alle" ? `1px solid ${KLEUR.rand}` : "none",
        cursor: "pointer", fontSize: 12.5, fontWeight: 600,
        background: scope === waarde ? KLEUR.blauw : "#fff", color: scope === waarde ? "#fff" : KLEUR.subtekst,
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      {knop("mijn", User, "Mijn cliënten")}
      {knop("alle", Users, "Kantoorbreed")}
    </div>
  );
}
