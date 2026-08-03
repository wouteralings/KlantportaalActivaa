import { useEffect, useState } from "react";
import { Plus, CheckCircle2, XCircle, Tag } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. AanleverLijstenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none" };

/**
 * Beheer van de contracttype-lijst (Contractenmodule) — sinds 04-08-2026 op verzoek van Wouter
 * ("Type contract zou ik graag uitbreiden. En willen kunnen uitbreiden in beheer."). Opslag via
 * /api/beheer-contractentypes (api/_gedeeld/contractenTypes.js). Een type UITZETTEN i.p.v.
 * verwijderen — bestaande contracten met dat type blijven zo altijd geldig en tonen gewoon hun
 * label; alleen de keuzelijst bij een NIEUW contract toont enkel de actieve typen.
 */
export default function ContractenTypesBeheer() {
  const [types, setTypes] = useState(null); // null = laden
  const [nieuweLabel, setNieuweLabel] = useState("");
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");

  useEffect(() => {
    fetch("/api/beheer-contractentypes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTypes(d.types || []))
      .catch(() => { setTypes([]); setFout("Kon de contracttypes niet laden."); });
  }, []);

  const opslaan = async (volgende) => {
    setStatus("bezig");
    setFout("");
    try {
      const r = await fetch("/api/beheer-contractentypes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: volgende }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setTypes(d.types || volgende);
      setStatus("opgeslagen");
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  const voegToe = () => {
    const label = nieuweLabel.trim();
    if (!label) return;
    opslaan([...(types || []), { label, actief: true }]);
    setNieuweLabel("");
  };

  const zetActief = (sleutel, actief) => {
    opslaan((types || []).map((t) => (t.sleutel === sleutel ? { ...t, actief } : t)));
  };

  const wijzigLabel = (sleutel, label) => {
    setTypes((h) => (h || []).map((t) => (t.sleutel === sleutel ? { ...t, label } : t)));
  };

  const labelOpslaan = (sleutel) => {
    opslaan(types || []);
  };

  if (types === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Contracttypes ophalen…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
        <Tag size={16} color={KLEUR.blauw} /> Contracttypes
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12, maxWidth: 640 }}>
        De typen die klanten en medewerkers kunnen kiezen bij een contract. Een type uitzetten
        verwijdert het niet — bestaande contracten met dat type blijven gewoon geldig, alleen de
        keuzelijst bij een nieuw contract toont het dan niet meer.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {types.map((t) => (
          <div key={t.sleutel} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, opacity: t.actief ? 1 : 0.6 }}>
            <input
              value={t.label}
              onChange={(e) => wijzigLabel(t.sleutel, e.target.value)}
              onBlur={() => labelOpslaan(t.sleutel)}
              style={{ ...invoerStijl, flex: 1, minWidth: 0 }}
            />
            <span style={{ fontSize: 11, color: KLEUR.mutedTekst, fontFamily: "monospace" }}>{t.sleutel}</span>
            <button
              onClick={() => zetActief(t.sleutel, !t.actief)}
              title={t.actief ? "Uitzetten (blijft geldig voor bestaande contracten)" : "Weer aanzetten"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6,
                fontSize: 11.5, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                border: `1px solid ${t.actief ? KLEUR.groen : KLEUR.rand}`,
                background: t.actief ? "#EAF6EE" : "#F2F3F0",
                color: t.actief ? KLEUR.groen : KLEUR.mutedTekst,
              }}
            >
              {t.actief ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {t.actief ? "Actief" : "Uit"}
            </button>
          </div>
        ))}
        {types.length === 0 && (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "8px 2px" }}>Nog geen contracttypes.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={nieuweLabel}
          onChange={(e) => setNieuweLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegToe(); } }}
          placeholder="Nieuw type, bijv. Onderhoudscontract"
          style={{ ...invoerStijl, flex: "0 1 320px" }}
        />
        <button
          onClick={voegToe}
          disabled={!nieuweLabel.trim() || status === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
            background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8,
            fontSize: 12.5, fontWeight: 600, cursor: nieuweLabel.trim() ? "pointer" : "default",
            opacity: nieuweLabel.trim() ? 1 : 0.6,
          }}
        >
          <Plus size={14} /> Toevoegen
        </button>
        {status === "bezig" && <span style={{ fontSize: 12, color: KLEUR.mutedTekst, alignSelf: "center" }}>Opslaan…</span>}
        {status === "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.groen, alignSelf: "center" }}>Opgeslagen</span>}
      </div>
    </div>
  );
}
