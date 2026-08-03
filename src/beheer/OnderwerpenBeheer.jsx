import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, Layers } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. AanleverLijstenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

const nieuwId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const legOnderwerp = () => ({ id: nieuwId(), naam: "", pad: "", standaardLijstId: "" });

const invoerStijl = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" };

/**
 * Beheer van de "onderwerpen" — bepaalt WAAR een uitvraag/aanlevering landt (het mappad onder de
 * SharePoint-map van de klant, met plaatshouders {jaar}/{onderwerp}) en welke aanleverlijst er
 * standaard bij hoort. Onderwerpen worden gebruikt bij het uitzetten van een aanlever-verzoek (kies
 * onderwerp + jaar) en om een uitvraaglijst automatisch aan een fiscaal dossier te koppelen (zie
 * Beheer → Dossiers → "Gekoppelde uitvraaglijst"). Opslag via /api/beheer-aanleveronderwerpen (zie
 * api/_gedeeld/aanleveronderwerpen.js).
 */
export default function OnderwerpenBeheer() {
  const [onderwerpen, setOnderwerpen] = useState(null); // null = laden
  const [lijsten, setLijsten] = useState([]); // voor de standaardLijstId-dropdown
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [vuil, setVuil] = useState(false);

  useEffect(() => {
    let actief = true;
    Promise.all([
      fetch("/api/beheer-aanleveronderwerpen").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/beheer-aanleverlijsten").then((r) => (r.ok ? r.json() : { lijsten: [] })).catch(() => ({ lijsten: [] })),
    ])
      .then(([onderwerpenData, lijstenData]) => {
        if (!actief) return;
        setOnderwerpen(onderwerpenData.onderwerpen || []);
        setLijsten(lijstenData.lijsten || []);
      })
      .catch(() => { if (actief) { setOnderwerpen([]); setFout("Kon de onderwerpen niet laden."); } });
    return () => { actief = false; };
  }, []);

  const wijzig = (fn) => { setOnderwerpen((h) => fn(h || [])); setVuil(true); setStatus("rust"); };
  const updateOnderwerp = (id, patch) => wijzig((h) => h.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const verwijderOnderwerp = (id) => wijzig((h) => h.filter((o) => o.id !== id));
  const voegOnderwerpToe = () => wijzig((h) => [...h, legOnderwerp()]);

  const opslaan = async () => {
    setStatus("bezig");
    setFout("");
    try {
      const r = await fetch("/api/beheer-aanleveronderwerpen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onderwerpen: onderwerpen || [] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setOnderwerpen(d.onderwerpen || []);
      setStatus("opgeslagen");
      setVuil(false);
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  if (onderwerpen === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Onderwerpen ophalen…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <Layers size={17} color={KLEUR.blauw} /> Onderwerpen
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 720 }}>
            Een onderwerp bepaalt waar een uitvraag landt (het mappad in SharePoint) en welke
            aanleverlijst er standaard bij hoort. Kies je een onderwerp bij het uitzetten van een
            aanlever-verzoek, dan wordt het pad hieronder gebruikt — en via hetzelfde onderwerp kun je
            in Beheer → Dossiers een uitvraaglijst automatisch aan een fiscaal dossier koppelen.
          </div>
        </div>
        <button onClick={voegOnderwerpToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> Nieuw onderwerp
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, margin: "8px 0" }}>{fout}</div>}

      {onderwerpen.length === 0 && (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: 24, textAlign: "center", margin: "12px 0" }}>
          Nog geen onderwerpen. Klik op <strong>Nieuw onderwerp</strong> om er een in te richten (bv. "Inkomstenbelasting").
        </div>
      )}

      {onderwerpen.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.2fr auto", gap: 8, padding: "10px 2px 4px", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Naam</div>
          <div>Opslaglocatie (mappad)</div>
          <div>Standaard aanleverlijst</div>
          <div />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {onderwerpen.map((o) => (
          <div key={o.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.2fr auto", gap: 8, alignItems: "start" }}>
            <div>
              <input value={o.naam} onChange={(e) => updateOnderwerp(o.id, { naam: e.target.value })} placeholder="bv. Inkomstenbelasting" style={invoerStijl} />
            </div>
            <div>
              <input value={o.pad} onChange={(e) => updateOnderwerp(o.id, { pad: e.target.value })} placeholder="bv. Aanleveren/{onderwerp}/{jaar}" style={invoerStijl} />
              <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 3 }}>
                Gebruik <strong>{"{jaar}"}</strong> en <strong>{"{onderwerp}"}</strong> als plaatshouders. Leeg = de vaste <em>Aanleveren</em>-map.
              </div>
            </div>
            <div>
              <select value={o.standaardLijstId || ""} onChange={(e) => updateOnderwerp(o.id, { standaardLijstId: e.target.value })} style={invoerStijl}>
                <option value="">— geen —</option>
                {lijsten.map((l) => <option key={l.id} value={l.id}>{l.naam || "Naamloze lijst"}</option>)}
              </select>
            </div>
            <button onClick={() => verwijderOnderwerp(o.id)} title="Onderwerp verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, cursor: "pointer" }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
        <button onClick={opslaan} disabled={status === "bezig" || !vuil} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: vuil ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: vuil ? "pointer" : "default" }}>
          <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && !vuil && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
        {vuil && status !== "bezig" && <span style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Niet-opgeslagen wijzigingen.</span>}
      </div>
    </div>
  );
}
