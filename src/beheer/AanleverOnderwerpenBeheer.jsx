import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, FolderTree } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

const nieuwId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const leegOnderwerp = () => ({ id: nieuwId(), naam: "", pad: "", standaardLijstId: "" });

const invoerStijl = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none", background: "#fff" };
const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 };

/** Voorbeeld van het uiteindelijke pad (met een voorbeeldjaar), zodat de beheerder ziet waar het landt. */
function voorbeeldPad(pad, naam) {
  return String(pad || "")
    .split("/")
    .map((s) => s.replace(/\{jaar\}/gi, "2025").replace(/\{onderwerp\}/gi, naam || "Onderwerp"))
    .map((s) => s.trim())
    .filter(Boolean)
    .join("  /  ");
}

/**
 * Beheer van de onderwerpen + opslaglocaties voor aanlever-uitvragen. Een onderwerp bepaalt waar een
 * aanlevering in SharePoint landt (mappad onder de klant-basismap, met {jaar}/{onderwerp}) en welke
 * aanleverlijst er standaard bij hoort. Opslag via /api/beheer-aanleveronderwerpen.
 */
export default function AanleverOnderwerpenBeheer() {
  const [onderwerpen, setOnderwerpen] = useState(null); // null = laden
  const [lijsten, setLijsten] = useState([]);
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [vuil, setVuil] = useState(false);

  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-aanleveronderwerpen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setOnderwerpen(d.onderwerpen || []); })
      .catch(() => { if (actief) { setOnderwerpen([]); setFout("Kon de onderwerpen niet laden."); } });
    fetch("/api/beheer-aanleverlijsten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setLijsten(d.lijsten || []); })
      .catch(() => {});
    return () => { actief = false; };
  }, []);

  const wijzig = (fn) => { setOnderwerpen((h) => fn(h || [])); setVuil(true); setStatus("rust"); };
  const update = (id, patch) => wijzig((h) => h.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const verwijder = (id) => wijzig((h) => h.filter((o) => o.id !== id));
  const voegToe = () => wijzig((h) => [...h, leegOnderwerp()]);

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
            <FolderTree size={17} color={KLEUR.blauw} /> Onderwerpen &amp; opslaglocaties
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 760 }}>
            Een onderwerp bepaalt bij een uitvraag waar de aangeleverde bestanden landen in SharePoint
            (map onder de klant-basismap) en welke aanleverlijst standaard bij dat onderwerp hoort.
            Gebruik <strong>{"{jaar}"}</strong> en <strong>{"{onderwerp}"}</strong> als plaatshouders in het pad.
          </div>
        </div>
        <button onClick={voegToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> Nieuw onderwerp
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, margin: "8px 0" }}>{fout}</div>}

      {onderwerpen.length === 0 && (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: 24, textAlign: "center", margin: "12px 0" }}>
          Nog geen onderwerpen. Klik op <strong>Nieuw onderwerp</strong> om er een in te richten (bv. "Jaarwerk IB" → pad "Jaarwerk/{"{jaar}"}").
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {onderwerpen.map((o) => (
          <div key={o.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1.1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={labelStijl}>Onderwerp</div>
                <input value={o.naam} onChange={(e) => update(o.id, { naam: e.target.value })} placeholder="bv. Jaarwerk IB" style={invoerStijl} />
              </div>
              <div>
                <div style={labelStijl}>Opslagpad (onder klant-map)</div>
                <input value={o.pad} onChange={(e) => update(o.id, { pad: e.target.value })} placeholder="bv. Jaarwerk/{jaar}" style={invoerStijl} />
              </div>
              <div>
                <div style={labelStijl}>Standaard aanleverlijst</div>
                <select value={o.standaardLijstId} onChange={(e) => update(o.id, { standaardLijstId: e.target.value })} style={invoerStijl}>
                  <option value="">— geen —</option>
                  {lijsten.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                </select>
              </div>
              <button onClick={() => verwijder(o.id)} title="Onderwerp verwijderen" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36 }}>
                <Trash2 size={13} />
              </button>
            </div>
            {o.pad && (
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
                Voorbeeld: <span style={{ color: KLEUR.subtekst }}>[klant-map]</span>  /  {voorbeeldPad(o.pad, o.naam) || <em>—</em>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, position: "sticky", bottom: 0, background: "#fff", paddingTop: 8 }}>
        <button onClick={opslaan} disabled={status === "bezig" || !vuil} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: vuil ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: vuil ? "pointer" : "default" }}>
          <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && !vuil && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
        {vuil && status !== "bezig" && <span style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Niet-opgeslagen wijzigingen.</span>}
      </div>
    </div>
  );
}
