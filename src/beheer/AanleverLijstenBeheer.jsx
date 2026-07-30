import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, ListChecks, FileText } from "lucide-react";

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
const legeRegel = () => ({ id: nieuwId(), naam: "", bestandsnaam: "", toelichting: "", verplicht: true });
const legeLijst = () => ({ id: nieuwId(), naam: "", omschrijving: "", regels: [legeRegel()] });

const invoerStijl = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" };
const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 };

/**
 * Beheer van de aanleverlijsten (herbruikbare sjablonen van uit te vragen documenten). Vrij samen te
 * stellen: per lijst een naam + omschrijving en een reeks regels, waarbij elke regel om één document
 * vraagt met een vaste bestandsnaam-structuur. Deze lijsten worden later uitgezet als aanlever-
 * verzoek naar een klant (fase 3). Opslag via /api/beheer-aanleverlijsten.
 */
export default function AanleverLijstenBeheer() {
  const [lijsten, setLijsten] = useState(null); // null = laden
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [vuil, setVuil] = useState(false); // onopgeslagen wijzigingen

  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-aanleverlijsten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setLijsten(d.lijsten || []); })
      .catch(() => { if (actief) { setLijsten([]); setFout("Kon de aanleverlijsten niet laden."); } });
    return () => { actief = false; };
  }, []);

  const wijzig = (fn) => { setLijsten((h) => fn(h || [])); setVuil(true); setStatus("rust"); };
  const updateLijst = (id, patch) => wijzig((h) => h.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const verwijderLijst = (id) => wijzig((h) => h.filter((l) => l.id !== id));
  const voegLijstToe = () => wijzig((h) => [...h, legeLijst()]);
  const updateRegel = (lijstId, regelId, patch) =>
    wijzig((h) => h.map((l) => (l.id === lijstId ? { ...l, regels: l.regels.map((r) => (r.id === regelId ? { ...r, ...patch } : r)) } : l)));
  const voegRegelToe = (lijstId) =>
    wijzig((h) => h.map((l) => (l.id === lijstId ? { ...l, regels: [...l.regels, legeRegel()] } : l)));
  const verwijderRegel = (lijstId, regelId) =>
    wijzig((h) => h.map((l) => (l.id === lijstId ? { ...l, regels: l.regels.filter((r) => r.id !== regelId) } : l)));

  const opslaan = async () => {
    setStatus("bezig");
    setFout("");
    try {
      const r = await fetch("/api/beheer-aanleverlijsten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lijsten: lijsten || [] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setLijsten(d.lijsten || []);
      setStatus("opgeslagen");
      setVuil(false);
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  if (lijsten === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Aanleverlijsten ophalen…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <ListChecks size={17} color={KLEUR.blauw} /> Aanleverlijsten
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 720 }}>
            Herbruikbare lijsten van documenten die je bij een klant kunt uitvragen. Per regel vraag je
            één document op, met een vaste bestandsnaam. Je zet een lijst later uit als aanlever-verzoek;
            de klant levert dan per regel het bestand aan.
          </div>
        </div>
        <button onClick={voegLijstToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> Nieuwe lijst
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, margin: "8px 0" }}>{fout}</div>}

      {lijsten.length === 0 && (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: 24, textAlign: "center", margin: "12px 0" }}>
          Nog geen aanleverlijsten. Klik op <strong>Nieuwe lijst</strong> om er een in te richten.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
        {lijsten.map((lijst) => (
          <div key={lijst.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
              <div>
                <div style={labelStijl}>Naam van de lijst</div>
                <input value={lijst.naam} onChange={(e) => updateLijst(lijst.id, { naam: e.target.value })} placeholder="bv. Jaarwerk IB" style={invoerStijl} />
              </div>
              <div>
                <div style={labelStijl}>Omschrijving (optioneel)</div>
                <input value={lijst.omschrijving} onChange={(e) => updateLijst(lijst.id, { omschrijving: e.target.value })} placeholder="Korte toelichting" style={invoerStijl} />
              </div>
              <button onClick={() => verwijderLijst(lijst.id)} title="Lijst verwijderen" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36 }}>
                <Trash2 size={13} /> Lijst
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>
                <FileText size={13} /> Uit te vragen documenten ({lijst.regels.length})
              </div>

              {lijst.regels.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1.6fr auto auto", gap: 8, padding: "0 2px 4px", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
                  <div>Document</div>
                  <div>Vaste bestandsnaam</div>
                  <div>Toelichting voor klant</div>
                  <div style={{ textAlign: "center" }}>Verplicht</div>
                  <div />
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lijst.regels.map((regel) => (
                  <div key={regel.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1.6fr auto auto", gap: 8, alignItems: "center" }}>
                    <input value={regel.naam} onChange={(e) => updateRegel(lijst.id, regel.id, { naam: e.target.value })} placeholder="bv. Aangifte IB 2025" style={invoerStijl} />
                    <input value={regel.bestandsnaam} onChange={(e) => updateRegel(lijst.id, regel.id, { bestandsnaam: e.target.value })} placeholder="bv. IB-2025 (leeg = documentnaam)" style={invoerStijl} />
                    <input value={regel.toelichting} onChange={(e) => updateRegel(lijst.id, regel.id, { toelichting: e.target.value })} placeholder="Optioneel" style={invoerStijl} />
                    <label style={{ display: "flex", justifyContent: "center", cursor: "pointer" }} title="Verplicht aan te leveren">
                      <input type="checkbox" checked={regel.verplicht !== false} onChange={(e) => updateRegel(lijst.id, regel.id, { verplicht: e.target.checked })} />
                    </label>
                    <button onClick={() => verwijderRegel(lijst.id, regel.id)} title="Regel verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, cursor: "pointer" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={() => voegRegelToe(lijst.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "6px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={13} /> Regel toevoegen
              </button>
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
