import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Lightbulb, ThumbsUp, Plus, Loader2, Trash2, Image as ImageIcon, X, MessageSquare, Send, Paperclip, RefreshCw } from "lucide-react";

/**
 * Ontwikkelverzoeken — intern bord in het medewerkersportaal. Medewerkers melden bugs of stellen
 * nieuwe functionaliteit voor; iedereen ziet alle verzoeken en kan stemmen (👍). Alleen beheerders
 * zetten de status, wijzigen de prioriteit en plaatsen reacties. Screenshots kunnen worden meegestuurd.
 */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237", achtergrond: "#FBFBF9" };

const TYPES = [
  { key: "bug", label: "Bug", icoon: Bug, kleur: KLEUR.rood },
  { key: "functionaliteit", label: "Functionaliteit", icoon: Lightbulb, kleur: KLEUR.blauw },
];
const PRIORITEITEN = [["laag", "Laag", KLEUR.mutedTekst], ["midden", "Midden", KLEUR.goud], ["hoog", "Hoog", KLEUR.rood]];
const STATUSSEN = [["nieuw", "Nieuw", KLEUR.blauw], ["opgepakt", "Opgepakt", KLEUR.goud], ["afgerond", "Afgerond", KLEUR.groen], ["afgewezen", "Afgewezen", KLEUR.mutedTekst]];

const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff", outline: "none" };
const lbl = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" };
const knop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });

function datumNL(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" }); }
const typeVan = (k) => TYPES.find((t) => t.key === k) || TYPES[1];
const prioVan = (k) => PRIORITEITEN.find((p) => p[0] === k) || PRIORITEITEN[1];
const statusVan = (k) => STATUSSEN.find((s) => s[0] === k) || STATUSSEN[0];

const LEEG = { type: "bug", titel: "", omschrijving: "", prioriteit: "midden", afbeeldingData: "", afbeeldingNaam: "" };

export default function Ontwikkelverzoeken() {
  const [data, setData] = useState(null); // { verzoeken, isBeheerder, mijnEmail }
  const [fout, setFout] = useState("");
  const [form, setForm] = useState(LEEG);
  const [formOpen, setFormOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [rijBezig, setRijBezig] = useState("");
  const [typeFilter, setTypeFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("open"); // open = nieuw+opgepakt
  const [sorteer, setSorteer] = useState("stemmen"); // stemmen | nieuwste
  const [vergroot, setVergroot] = useState(null); // id van uitvergrote screenshot
  const [reactie, setReactie] = useState({}); // id -> tekst
  const fileRef = useRef(null);

  const laad = useCallback(() => {
    setData(null); setFout("");
    fetch("/api/ontwikkelverzoeken")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => { setData({ verzoeken: [], isBeheerder: false, mijnEmail: "" }); setFout("Kon de ontwikkelverzoeken niet laden."); });
  }, []);
  useEffect(() => { laad(); }, [laad]);

  const isBeheerder = !!data?.isBeheerder;
  const vervang = (verzoek) => setData((d) => ({ ...d, verzoeken: d.verzoeken.map((v) => (v.id === verzoek.id ? verzoek : v)) }));

  const kiesBestand = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setFout("Alleen afbeeldingen (screenshot) toegestaan."); return; }
    if (file.size > 8 * 1024 * 1024) { setFout("Afbeelding is te groot (max 8 MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, afbeeldingData: String(reader.result), afbeeldingNaam: file.name }));
    reader.readAsDataURL(file);
  };

  const indienen = async () => {
    setFout("");
    if (!form.titel.trim()) { setFout("Geef een titel op."); return; }
    setBezig(true);
    try {
      const res = await fetch("/api/ontwikkelverzoeken", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, titel: form.titel, omschrijving: form.omschrijving, prioriteit: form.prioriteit, afbeeldingData: form.afbeeldingData || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm(LEEG); setFormOpen(false); if (fileRef.current) fileRef.current.value = "";
      laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const patch = async (body, id) => {
    setRijBezig(id + (body.actie || "")); setFout("");
    try {
      const res = await fetch("/api/ontwikkelverzoeken", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      if (d.verzoek) vervang(d.verzoek);
    } catch (e) { setFout(String(e.message || e)); }
    finally { setRijBezig(""); }
  };
  const stem = (v) => patch({ id: v.id, actie: "stem" }, v.id);
  const zet = (v, velden) => patch({ id: v.id, ...velden }, v.id);
  const plaatsReactie = async (v) => {
    const tekst = (reactie[v.id] || "").trim();
    if (!tekst) return;
    await patch({ id: v.id, actie: "reactie", tekst }, v.id);
    setReactie((r) => ({ ...r, [v.id]: "" }));
  };
  const verwijder = async (v) => {
    if (!window.confirm(`Verzoek "${v.titel}" verwijderen?`)) return;
    setRijBezig(v.id + "del"); setFout("");
    try {
      const res = await fetch(`/api/ontwikkelverzoeken?id=${encodeURIComponent(v.id)}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      setData((d) => ({ ...d, verzoeken: d.verzoeken.filter((x) => x.id !== v.id) }));
    } catch (e) { setFout(String(e.message || e)); }
    finally { setRijBezig(""); }
  };

  const zichtbaar = useMemo(() => {
    let lijst = (data?.verzoeken || []).slice();
    if (typeFilter !== "alle") lijst = lijst.filter((v) => v.type === typeFilter);
    if (statusFilter === "open") lijst = lijst.filter((v) => v.status === "nieuw" || v.status === "opgepakt");
    else if (statusFilter !== "alle") lijst = lijst.filter((v) => v.status === statusFilter);
    if (sorteer === "stemmen") lijst.sort((a, b) => (b.stemmen - a.stemmen) || (new Date(b.aangemaaktOp) - new Date(a.aangemaaktOp)));
    else lijst.sort((a, b) => new Date(b.aangemaaktOp) - new Date(a.aangemaaktOp));
    return lijst;
  }, [data, typeFilter, statusFilter, sorteer]);

  const tellen = (data?.verzoeken || []);
  const aantalOpen = tellen.filter((v) => v.status === "nieuw" || v.status === "opgepakt").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <Lightbulb size={17} color={KLEUR.blauw} /> Ontwikkelverzoeken
          {aantalOpen > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: KLEUR.blauw, borderRadius: 999, padding: "1px 9px" }}>{aantalOpen} open</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={laad} style={{ ...knop(false), padding: "8px 10px" }}><RefreshCw size={13} /></button>
          <button onClick={() => setFormOpen((o) => !o)} style={knop(true)}><Plus size={14} /> Nieuw verzoek</button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 780 }}>
        Meld hier een bug of stel nieuwe functionaliteit voor. Iedereen ziet alle verzoeken en kan stemmen (👍) — populaire wensen komen bovenaan.
        De beheerder pakt ze op en houdt de status bij.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {formOpen && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 18, background: KLEUR.achtergrond }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {TYPES.map((t) => (
              <button key={t.key} onClick={() => setForm((f) => ({ ...f, type: t.key }))} style={{ ...knop(form.type === t.key), borderColor: form.type === t.key ? t.kleur : KLEUR.rand, background: form.type === t.key ? t.kleur : "#fff" }}>
                <t.icoon size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
            <span style={lbl}>Titel</span>
            <input value={form.titel} onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))} placeholder={form.type === "bug" ? "Korte omschrijving van de bug" : "Wat wil je kunnen?"} style={{ ...veld, width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
            <span style={lbl}>Omschrijving</span>
            <textarea value={form.omschrijving} onChange={(e) => setForm((f) => ({ ...f, omschrijving: e.target.value }))} rows={4} placeholder={form.type === "bug" ? "Wat ging er mis, en welke stappen leiden ertoe? Wat verwachtte je?" : "Beschrijf de gewenste functionaliteit en waarom die helpt."} style={{ ...veld, width: "100%", resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={lbl}>Prioriteit</span>
              <select value={form.prioriteit} onChange={(e) => setForm((f) => ({ ...f, prioriteit: e.target.value }))} style={{ ...veld, width: 130 }}>
                {PRIORITEITEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={lbl}>Screenshot (optioneel)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ ...knop(false), cursor: "pointer" }}>
                  <Paperclip size={13} /> Kies bestand
                  <input ref={fileRef} type="file" accept="image/*" onChange={kiesBestand} style={{ display: "none" }} />
                </label>
                {form.afbeeldingData && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst }}>
                    <ImageIcon size={13} /> {form.afbeeldingNaam || "afbeelding"}
                    <button onClick={() => { setForm((f) => ({ ...f, afbeeldingData: "", afbeeldingNaam: "" })); if (fileRef.current) fileRef.current.value = ""; }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "inline-flex" }}><X size={13} /></button>
                  </span>
                )}
              </div>
            </div>
          </div>
          {form.afbeeldingData && <img src={form.afbeeldingData} alt="voorbeeld" style={{ maxWidth: 240, maxHeight: 160, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, marginBottom: 12, display: "block" }} />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={indienen} disabled={bezig} style={{ ...knop(true), padding: "9px 16px" }}>{bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />} Indienen</button>
            <button onClick={() => { setForm(LEEG); setFormOpen(false); }} style={{ ...knop(false), padding: "9px 12px" }}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <FilterGroep label="Type" waarde={typeFilter} setWaarde={setTypeFilter} opties={[["alle", "Alle"], ["bug", "Bugs"], ["functionaliteit", "Functionaliteit"]]} />
        <FilterGroep label="Status" waarde={statusFilter} setWaarde={setStatusFilter} opties={[["open", "Open"], ["alle", "Alle"], ["nieuw", "Nieuw"], ["opgepakt", "Opgepakt"], ["afgerond", "Afgerond"], ["afgewezen", "Afgewezen"]]} />
        <FilterGroep label="Sorteer" waarde={sorteer} setWaarde={setSorteer} opties={[["stemmen", "Meeste stemmen"], ["nieuwste", "Nieuwste"]]} />
      </div>

      {data === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Verzoeken ophalen…</div>
      ) : zichtbaar.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: "24px", textAlign: "center" }}>Geen verzoeken in deze weergave. Dien er hierboven een in.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {zichtbaar.map((v) => {
            const t = typeVan(v.type), p = prioVan(v.prioriteit), s = statusVan(v.status);
            return (
              <div key={v.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, display: "flex", gap: 14 }}>
                {/* Stemknop */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <button onClick={() => stem(v)} disabled={rijBezig === v.id + "stem"} title={v.ikStem ? "Je stem intrekken" : "Stem op dit verzoek"} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${v.ikStem ? KLEUR.blauw : KLEUR.rand}`, background: v.ikStem ? KLEUR.lichtblauw : "#fff", color: v.ikStem ? KLEUR.blauw : KLEUR.subtekst, minWidth: 46 }}>
                    <ThumbsUp size={15} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{v.stemmen}</span>
                  </button>
                </div>

                {/* Inhoud */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.kleur + "1A", color: t.kleur }}><t.icoon size={11} /> {t.label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p[2] + "1A", color: p[2] }}>Prioriteit {p[1].toLowerCase()}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s[2] + "1A", color: s[2] }}>{s[1]}</span>
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>{v.titel}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 8 }}>{v.indienerNaam || v.indienerEmail} · {datumNL(v.aangemaaktOp)}</div>
                  {v.omschrijving && <div style={{ fontSize: 13, color: KLEUR.tekst, whiteSpace: "pre-wrap", marginBottom: 10 }}>{v.omschrijving}</div>}
                  {v.heeftAfbeelding && (
                    <img src={`/api/ontwikkelverzoeken?afbeelding=${encodeURIComponent(v.id)}`} alt="screenshot" onClick={() => setVergroot(v.id)} style={{ maxWidth: 220, maxHeight: 150, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, cursor: "zoom-in", display: "block", marginBottom: 10 }} />
                  )}

                  {/* Reacties */}
                  {(v.reacties || []).length > 0 && (
                    <div style={{ borderLeft: `2px solid ${KLEUR.rand}`, paddingLeft: 10, margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {v.reacties.map((r, i) => (
                        <div key={i} style={{ fontSize: 12.5 }}>
                          <span style={{ fontWeight: 700 }}>{r.door}</span> <span style={{ color: KLEUR.mutedTekst }}>· {datumNL(r.op)}</span>
                          <div style={{ color: KLEUR.tekst, whiteSpace: "pre-wrap" }}>{r.tekst}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Beheer-acties */}
                  {isBeheerder && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Status</span>
                        <select value={v.status} onChange={(e) => zet(v, { status: e.target.value })} style={{ ...veld, padding: "6px 8px", fontSize: 12 }}>
                          {STATUSSEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Prioriteit</span>
                        <select value={v.prioriteit} onChange={(e) => zet(v, { prioriteit: e.target.value })} style={{ ...veld, padding: "6px 8px", fontSize: 12 }}>
                          {PRIORITEITEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flex: "1 1 240px", minWidth: 200 }}>
                        <MessageSquare size={13} color={KLEUR.mutedTekst} />
                        <input value={reactie[v.id] || ""} onChange={(e) => setReactie((r) => ({ ...r, [v.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") plaatsReactie(v); }} placeholder="Reactie plaatsen…" style={{ ...veld, padding: "6px 8px", fontSize: 12, flex: 1 }} />
                        <button onClick={() => plaatsReactie(v)} disabled={rijBezig === v.id + "reactie"} style={{ ...knop(true), padding: "6px 9px" }}><Send size={12} /></button>
                      </div>
                      <button onClick={() => verwijder(v)} disabled={rijBezig === v.id + "del"} title="Verwijderen" style={{ ...knop(false), padding: "6px 8px", color: KLEUR.rood, borderColor: "#E7C9C9" }}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Uitvergrote screenshot */}
      {vergroot && (
        <div onClick={() => setVergroot(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
          <img src={`/api/ontwikkelverzoeken?afbeelding=${encodeURIComponent(vergroot)}`} alt="screenshot" style={{ maxWidth: "92%", maxHeight: "92%", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,.5)" }} />
          <button onClick={() => setVergroot(null)} style={{ position: "absolute", top: 18, right: 18, background: "#fff", border: "none", borderRadius: 999, width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
        </div>
      )}
    </div>
  );
}

function FilterGroep({ label, waarde, setWaarde, opties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst }}>{label}:</span>
      {opties.map(([k, l]) => (
        <button key={k} onClick={() => setWaarde(k)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${waarde === k ? KLEUR.blauw : KLEUR.rand}`, background: waarde === k ? KLEUR.blauw : "#fff", color: waarde === k ? "#fff" : KLEUR.subtekst }}>{l}</button>
      ))}
    </div>
  );
}
