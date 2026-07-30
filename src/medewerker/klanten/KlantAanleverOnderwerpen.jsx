import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, FolderTree } from "lucide-react";

/** Zelfde palet als het medewerkersportaal (bewust hier herhaald zodat dit bestand op zichzelf staat). */
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
const invoer = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", background: "#fff" };

/**
 * Klantkaart-sectie: per aanlever-onderwerp bepalen of het van toepassing is voor deze klant, en of
 * de algemene lijst geldt of een klant-specifieke lijst (die voorrang krijgt bij een uitvraag).
 * Leest/schrijft via /api/medewerker-klant-onderwerpen.
 */
export default function KlantAanleverOnderwerpen({ accountId, magWijzigen }) {
  const [data, setData] = useState(null); // { onderwerpen, lijsten } | null = laden
  const [config, setConfig] = useState({}); // { onderwerpId: { actief, regels|null } }
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [vuil, setVuil] = useState(false);
  const [fout, setFout] = useState("");

  useEffect(() => {
    let actief = true;
    setData(null);
    fetch("/api/medewerker-klant-onderwerpen?accountId=" + encodeURIComponent(accountId))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) { setData({ onderwerpen: d.onderwerpen || [], lijsten: d.lijsten || [] }); setConfig(d.config || {}); setVuil(false); } })
      .catch(() => { if (actief) { setData({ onderwerpen: [], lijsten: [] }); setFout("Kon de onderwerpen niet laden."); } });
    return () => { actief = false; };
  }, [accountId]);

  const standaardRegels = (onderwerp) => {
    const l = (data.lijsten || []).find((x) => x.id === onderwerp.standaardLijstId);
    return (l && l.regels) || [];
  };
  const confVan = (id) => config[id] || { actief: false, regels: null };
  const zet = (id, patch) => { setConfig((c) => ({ ...c, [id]: { ...confVan(id), ...patch } })); setVuil(true); setStatus("rust"); };

  const zetRegel = (id, regelId, patch) => zet(id, { regels: (confVan(id).regels || []).map((r) => (r.id === regelId ? { ...r, ...patch } : r)) });
  const voegRegel = (id) => zet(id, { regels: [...(confVan(id).regels || []), legeRegel()] });
  const verwijderRegel = (id, regelId) => zet(id, { regels: (confVan(id).regels || []).filter((r) => r.id !== regelId) });

  const opslaan = async () => {
    setStatus("bezig"); setFout("");
    try {
      const r = await fetch("/api/medewerker-klant-onderwerpen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, config }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setConfig(d.config || {});
      setStatus("opgeslagen"); setVuil(false);
    } catch (e) {
      setFout(e.message || "Opslaan mislukt."); setStatus("fout");
    }
  };

  if (data === null) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Onderwerpen ophalen…</div>;

  return (
    <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <FolderTree size={15} color={KLEUR.blauw} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>Aanleveren per onderwerp</span>
      </div>
      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10 }}>
        Vink aan welke onderwerpen voor deze klant van toepassing zijn. Per onderwerp geldt standaard de
        algemene lijst; pas je die aan, dan krijgt de klant-specifieke lijst voorrang bij een uitvraag.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 8 }}>{fout}</div>}
      {data.onderwerpen.length === 0 && (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Er zijn nog geen onderwerpen ingericht (Beheer → Onderwerpen).</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.onderwerpen.map((o) => {
          const c = confVan(o.id);
          const aangepast = Array.isArray(c.regels);
          const toonRegels = aangepast ? c.regels : standaardRegels(o);
          return (
            <div key={o.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, background: c.actief ? "#fff" : "#FBFBF9" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: magWijzigen ? "pointer" : "default" }}>
                <input type="checkbox" checked={!!c.actief} disabled={!magWijzigen} onChange={(e) => zet(o.id, { actief: e.target.checked })} />
                <span style={{ fontSize: 13, fontWeight: 700, color: KLEUR.tekst }}>{o.naam || "(naamloos onderwerp)"}</span>
                {c.actief && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: aangepast ? "#FBF3E4" : KLEUR.lichtblauw, color: aangepast ? "#B98237" : KLEUR.blauw }}>{aangepast ? "Aangepast" : "Algemene lijst"}</span>}
              </label>

              {c.actief && (
                <div style={{ marginTop: 10, marginLeft: 24 }}>
                  {toonRegels.length === 0 ? (
                    <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten in {aangepast ? "de aangepaste lijst" : "de algemene lijst"}.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {toonRegels.map((r) => (
                        aangepast ? (
                          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1.4fr auto auto", gap: 6, alignItems: "center" }}>
                            <input value={r.naam} onChange={(e) => zetRegel(o.id, r.id, { naam: e.target.value })} placeholder="Document" style={{ ...invoer, width: "100%" }} />
                            <input value={r.bestandsnaam} onChange={(e) => zetRegel(o.id, r.id, { bestandsnaam: e.target.value })} placeholder="Vaste bestandsnaam" style={{ ...invoer, width: "100%" }} />
                            <input value={r.toelichting} onChange={(e) => zetRegel(o.id, r.id, { toelichting: e.target.value })} placeholder="Toelichting" style={{ ...invoer, width: "100%" }} />
                            <label style={{ display: "flex", justifyContent: "center" }} title="Verplicht"><input type="checkbox" checked={r.verplicht !== false} onChange={(e) => zetRegel(o.id, r.id, { verplicht: e.target.checked })} /></label>
                            <button onClick={() => verwijderRegel(o.id, r.id)} title="Regel verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, cursor: "pointer" }}><Trash2 size={12} /></button>
                          </div>
                        ) : (
                          <div key={r.id} style={{ fontSize: 12.5, color: KLEUR.tekst }}>• {r.naam}{r.verplicht === false ? <span style={{ color: KLEUR.mutedTekst }}> · optioneel</span> : null}</div>
                        )
                      ))}
                    </div>
                  )}

                  {magWijzigen && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {aangepast ? (
                        <>
                          <button onClick={() => voegRegel(o.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}><Plus size={12} /> Regel toevoegen</button>
                          <button onClick={() => zet(o.id, { regels: null })} style={{ padding: "5px 10px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Terug naar algemene lijst</button>
                        </>
                      ) : (
                        <button onClick={() => zet(o.id, { regels: standaardRegels(o).map((r) => ({ ...r, id: nieuwId() })) })} style={{ padding: "5px 10px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Aanpassen voor deze klant</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {magWijzigen && data.onderwerpen.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button onClick={opslaan} disabled={status === "bezig" || !vuil} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", background: vuil ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: vuil ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          {status === "opgeslagen" && !vuil && <span style={{ fontSize: 12, color: KLEUR.groen }}>Opgeslagen.</span>}
          {vuil && status !== "bezig" && <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Niet-opgeslagen wijzigingen.</span>}
        </div>
      )}
    </div>
  );
}
