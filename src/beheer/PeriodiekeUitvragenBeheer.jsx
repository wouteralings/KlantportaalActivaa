import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, CalendarClock } from "lucide-react";

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
const leegSchema = () => ({ id: nieuwId(), actief: true, naam: "", onderwerpId: "", frequentie: "jaarlijks", dag: 1, maand: 1, jaarLogica: "vorig", notitie: "", laatstePeriode: "" });
const MAANDEN = ["", "januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none", background: "#fff" };
const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 };

/**
 * Beheer van de periodieke (geautomatiseerde) aanlever-uitvragen. Per schema kies je een onderwerp
 * en een herhaling; de verwerker (/api/verwerk-periodieke-uitvragen, dagelijks aangeroepen door het
 * externe schema) zet dan automatisch verzoeken klaar bij de klanten waar het onderwerp van
 * toepassing is. Opslag via /api/beheer-periodieke-uitvragen.
 */
export default function PeriodiekeUitvragenBeheer() {
  const [schemas, setSchemas] = useState(null); // null = laden
  const [onderwerpen, setOnderwerpen] = useState([]);
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [vuil, setVuil] = useState(false);

  useEffect(() => {
    let a = true;
    fetch("/api/beheer-periodieke-uitvragen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (a) { setSchemas(d.schemas || []); setOnderwerpen(d.onderwerpen || []); } })
      .catch(() => { if (a) { setSchemas([]); setFout("Kon de periodieke uitvragen niet laden."); } });
    return () => { a = false; };
  }, []);

  const wijzig = (fn) => { setSchemas((h) => fn(h || [])); setVuil(true); setStatus("rust"); };
  const update = (id, patch) => wijzig((h) => h.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const verwijder = (id) => wijzig((h) => h.filter((s) => s.id !== id));
  const voegToe = () => wijzig((h) => [...h, leegSchema()]);

  const opslaan = async () => {
    setStatus("bezig"); setFout("");
    try {
      const r = await fetch("/api/beheer-periodieke-uitvragen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schemas: schemas || [] }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setSchemas(d.schemas || []); setStatus("opgeslagen"); setVuil(false);
    } catch (e) { setFout(e.message || "Opslaan mislukt."); setStatus("fout"); }
  };

  if (schemas === null) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Periodieke uitvragen ophalen…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <CalendarClock size={17} color={KLEUR.blauw} /> Periodieke uitvragen
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 760 }}>
            Zet automatisch aanlever-verzoeken klaar op een vaste herhaling, bij de klanten waar het
            onderwerp van toepassing is (klantkaart → Aanleveren per onderwerp). De uitvoering loopt via
            hetzelfde dagelijkse schema als de terugkerende facturen (een HTTP-aanroep naar
            <strong> /api/verwerk-periodieke-uitvragen</strong>).
          </div>
        </div>
        <button onClick={voegToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> Nieuwe herhaling
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, margin: "8px 0" }}>{fout}</div>}
      {onderwerpen.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Richt eerst onderwerpen in (tab Onderwerpen) voordat je een herhaling maakt.</div>}
      {schemas.length === 0 && (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: 24, textAlign: "center", margin: "12px 0" }}>
          Nog geen periodieke uitvragen. Klik op <strong>Nieuwe herhaling</strong>.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {schemas.map((s) => (
          <div key={s.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, opacity: s.actief ? 1 : 0.6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStijl}>Naam (optioneel)</div>
                <input value={s.naam} onChange={(e) => update(s.id, { naam: e.target.value })} placeholder="bv. BTW per kwartaal" style={invoerStijl} />
              </div>
              <div>
                <div style={labelStijl}>Onderwerp</div>
                <select value={s.onderwerpId} onChange={(e) => update(s.id, { onderwerpId: e.target.value })} style={invoerStijl}>
                  <option value="">— kies onderwerp —</option>
                  {onderwerpen.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStijl}>Frequentie</div>
                <select value={s.frequentie} onChange={(e) => update(s.id, { frequentie: e.target.value })} style={invoerStijl}>
                  <option value="maandelijks">Maandelijks</option>
                  <option value="kwartaal">Per kwartaal</option>
                  <option value="jaarlijks">Jaarlijks</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr 1.3fr", gap: 10, marginTop: 10, alignItems: "end" }}>
              <div>
                <div style={labelStijl}>Dag v/d maand</div>
                <input type="number" min={1} max={28} value={s.dag} onChange={(e) => update(s.id, { dag: e.target.value })} style={invoerStijl} />
              </div>
              <div>
                <div style={labelStijl}>Maand{s.frequentie === "jaarlijks" ? "" : " (n.v.t.)"}</div>
                <select value={s.maand} disabled={s.frequentie !== "jaarlijks"} onChange={(e) => update(s.id, { maand: e.target.value })} style={{ ...invoerStijl, background: s.frequentie === "jaarlijks" ? "#fff" : "#F4F4F1" }}>
                  {MAANDEN.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStijl}>Jaar in de map</div>
                <select value={s.jaarLogica} onChange={(e) => update(s.id, { jaarLogica: e.target.value })} style={invoerStijl}>
                  <option value="huidig">Huidig jaar</option>
                  <option value="vorig">Vorig jaar</option>
                </select>
              </div>
              <div>
                <div style={labelStijl}>Notitie voor de klant</div>
                <input value={s.notitie} onChange={(e) => update(s.id, { notitie: e.target.value })} placeholder="optioneel" style={invoerStijl} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.subtekst, cursor: "pointer" }}>
                <input type="checkbox" checked={s.actief} onChange={(e) => update(s.id, { actief: e.target.checked })} /> Actief
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {s.laatstePeriode && <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Laatst verwerkt: {s.laatstePeriode}</span>}
                <button onClick={() => verwijder(s.id)} title="Verwijderen" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Trash2 size={13} /> Verwijderen</button>
              </div>
            </div>
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
