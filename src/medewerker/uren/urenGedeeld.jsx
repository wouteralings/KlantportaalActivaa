/**
 * Gedeelde bouwstenen voor de interne urenregistratie-module (medewerkersportaal).
 * Bewust één klein bestand zodat de losse schermen (Schrijven/Controle/Rapportage/Facturatie)
 * dezelfde stijl, soort-definities en formatteringen delen.
 */
import { useEffect, useState } from "react";

export const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
  goud: "#B98237",
};

// De vier urensoorten. declarabel = telt mee voor OHW/facturatie en het declarabel-%.
export const SOORTEN = [
  { key: "abonnement", label: "Abonnement", declarabel: true, kleur: KLEUR.groen, uitleg: "Standaard diensten binnen het abonnement" },
  { key: "uxt", label: "UXT", declarabel: true, kleur: KLEUR.blauw, uitleg: "Meerwerk / uitloop — apart te factureren" },
  { key: "indirect", label: "Indirect", declarabel: false, kleur: KLEUR.goud, uitleg: "Indirecte (niet-declarabele) uren" },
  { key: "kantoor", label: "Kantoor", declarabel: false, kleur: KLEUR.mutedTekst, uitleg: "Kantooruren (verlof, opleiding, overig)" },
];
export const soortVan = (key) => SOORTEN.find((s) => s.key === key) || { key, label: key, declarabel: false, kleur: KLEUR.mutedTekst };
export const isDeclarabel = (key) => key === "abonnement" || key === "uxt";

export const TARIEF_SOORTEN = [
  { key: "normaal", label: "Normaal" },
  { key: "hoog", label: "Hoog" },
  { key: "laag", label: "Laag" },
];

export const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

export const euro = (n) => (n == null || isNaN(n) ? "—" : "€ " + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const uur = (n) => (n == null || isNaN(n) ? "0" : Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

export function datumNL(d) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function tijdNL(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];
export const WEEKDAG_VOL = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

// Datum-rekenkunde op kale YYYY-MM-DD (UTC-neutraal).
export function isoVan(d) { return d.toISOString().slice(0, 10); }
export function maandagVan(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  const dag = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dag === 0 ? -6 : 1 - dag));
  return isoVan(d);
}
export function voegDagenToe(datumStr, n) {
  const d = new Date(datumStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoVan(d);
}
export function vandaagIso() { return isoVan(new Date()); }
export function maandVanNu() { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
export function maandLabel(maand) {
  if (!maand) return "";
  const [j, m] = maand.split("-").map(Number);
  const namen = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  return `${namen[m - 1] || m} ${j}`;
}
export function verschuifMaand(maand, n) {
  const [j, m] = maand.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Haalt de cliëntenlijst (voor de klant-picker) + het 'mijn cliënten'-filter uit /api/beheer-klanten. */
export function useKlanten() {
  const [klanten, setKlanten] = useState(null);
  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setKlanten((d.klanten || []).filter((k) => k.accountId).map((k) => ({ accountId: k.accountId, klantnaam: k.klantnaam || "", klantnummer: k.klantnummer == null ? "" : String(k.klantnummer) }))); })
      .catch(() => { if (actief) setKlanten([]); });
    return () => { actief = false; };
  }, []);
  return klanten;
}

export const knopStijl = (actief) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
  background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst,
});

export const veldStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 9px", fontSize: 12.5, background: "#fff", outline: "none" };
export const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "7px 10px", whiteSpace: "nowrap" };
export const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "9px 10px", borderTop: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

/** Kleine soort-badge. */
export function SoortBadge({ soort }) {
  const s = soortVan(soort);
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: s.kleur + "1A", color: s.kleur, whiteSpace: "nowrap" }}>{s.label}</span>;
}

/** Zoekbare cliënt-picker (typeahead). */
export function KlantPicker({ klanten, waarde, onKies, placeholder = "Zoek cliënt…" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const gekozen = klanten && waarde ? klanten.find((k) => k.accountId === waarde) : null;
  const lijst = (klanten || []).filter((k) => {
    const s = (q || "").toLowerCase();
    return !s || `${k.klantnaam} ${k.klantnummer}`.toLowerCase().includes(s);
  }).slice(0, 30);
  return (
    <div style={{ position: "relative", minWidth: 200 }}>
      <input
        value={open ? q : (gekozen ? `${gekozen.klantnaam}${gekozen.klantnummer ? ` (${gekozen.klantnummer})` : ""}` : q)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={{ ...veldStijl, width: "100%" }}
      />
      {open && (klanten || []).length > 0 && (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, marginTop: 2, maxHeight: 230, overflowY: "auto", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.08)" }}>
          {lijst.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: KLEUR.mutedTekst }}>Geen cliënt gevonden.</div>
          ) : lijst.map((k) => (
            <div key={k.accountId} onMouseDown={() => { onKies(k); setOpen(false); }} style={{ padding: "7px 10px", fontSize: 12.5, cursor: "pointer", borderBottom: `1px solid ${KLEUR.rand}` }}>
              <span style={{ fontWeight: 600 }}>{k.klantnaam}</span>{k.klantnummer ? <span style={{ color: KLEUR.mutedTekst }}> · {k.klantnummer}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
