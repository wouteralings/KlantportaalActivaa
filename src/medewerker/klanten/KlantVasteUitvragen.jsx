import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Trash2, Send, CheckCircle2, Search, ChevronDown, User, Clock, ShieldAlert, ShieldCheck } from "lucide-react";

/** Zelfde palet als het medewerkersportaal (bewust hier herhaald zodat dit bestand op zichzelf staat). */
const KLEUR = {
  blauw: "#1C5D8C",
  goud: "#B98237",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

const rid = () => Math.random().toString(36).slice(2, 9);

const datum = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

/**
 * Klantkaart-blok "Vaste uitvragen": richt per klant een aanleverlijst in (eventueel aangepaste
 * documentregels + een toegewezen contactpersoon met aanleveren-recht). De uitvraag blijft bewaard,
 * zodat je hem het jaar erop met één klik (alleen het jaar aanpassen) opnieuw uitzet. Achter elke
 * uitvraag zie je wie hem laatst bewerkte en wanneer. Leest/schrijft via
 * /api/medewerker-klant-vaste-uitvragen; uitzetten via /api/medewerker-aanleververzoeken.
 */
export default function KlantVasteUitvragen({ accountId, klantnaam, defaultContact, magWijzigen }) {
  const [data, setData] = useState(null); // { lijsten, vaste } | null = laden
  const [werk, setWerk] = useState({}); // lijstId -> item (bewerkbaar)
  const [status, setStatus] = useState({}); // lijstId -> 'rust'|'bezig'|'opgeslagen'|'fout'
  const [fout, setFout] = useState({}); // lijstId -> tekst
  const [open, setOpen] = useState(() => new Set());
  const [zoekVoor, setZoekVoor] = useState(""); // lijstId waarvoor de contact-zoeker open staat
  const [cTerm, setCTerm] = useState("");
  const [cRes, setCRes] = useState([]);
  const [recht, setRecht] = useState({}); // contactId -> { aanleveren } (cache)
  const [jaar, setJaar] = useState({}); // lijstId -> jaar (voor uitzetten)
  const [uitzetInfo, setUitzetInfo] = useState({}); // lijstId -> melding na uitzetten

  const laad = () =>
    fetch("/api/medewerker-klant-vaste-uitvragen?accountId=" + encodeURIComponent(accountId))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData({ lijsten: d.lijsten || [], vaste: d.vaste || {} }); setWerk({ ...(d.vaste || {}) }); })
      .catch(() => setData({ lijsten: [], vaste: {} }));

  useEffect(() => { setData(null); setWerk({}); laad(); /* eslint-disable-next-line */ }, [accountId]);

  useEffect(() => {
    if (!zoekVoor || cTerm.trim().length < 2) { setCRes([]); return; }
    let a = true;
    fetch("/api/klant-contacten?zoek=" + encodeURIComponent(cTerm.trim()))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (a) setCRes(d.contacten || []); })
      .catch(() => { if (a) setCRes([]); });
    return () => { a = false; };
  }, [cTerm, zoekVoor]);

  const toggle = (id) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ingericht = (id) => !!werk[id];
  const zetItem = (id, patch) => { setWerk((w) => ({ ...w, [id]: { ...(w[id] || {}), ...patch } })); setStatus((s) => ({ ...s, [id]: "rust" })); setFout((f) => ({ ...f, [id]: "" })); };
  const effRegels = (lijst) => (Array.isArray(werk[lijst.id] && werk[lijst.id].regels) ? werk[lijst.id].regels : (lijst.regels || []));

  const checkRecht = async (contactId) => {
    if (!contactId || recht[contactId]) return;
    try {
      const r = await fetch("/api/medewerker-contactpersoon?documentrechten=" + encodeURIComponent(contactId));
      const d = await r.json();
      setRecht((h) => ({ ...h, [contactId]: d.documentrechten || {} }));
    } catch { /* stil: badge blijft dan onbekend */ }
  };

  const inrichten = (lijst) => {
    const c = defaultContact || { id: "", naam: "" };
    zetItem(lijst.id, { regels: null, contactId: c.id || "", contactNaam: c.naam || "", notitie: "" });
    setOpen((o) => new Set(o).add(lijst.id));
    if (c.id) checkRecht(c.id);
  };

  const kiesContact = (lijstId, c) => { zetItem(lijstId, { contactId: c.id, contactNaam: c.naam }); setZoekVoor(""); setCTerm(""); setCRes([]); checkRecht(c.id); };

  const opslaan = async (lijst) => {
    const item = werk[lijst.id];
    setStatus((s) => ({ ...s, [lijst.id]: "bezig" })); setFout((f) => ({ ...f, [lijst.id]: "" }));
    try {
      const r = await fetch("/api/medewerker-klant-vaste-uitvragen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, lijstId: lijst.id, item }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setWerk((w) => ({ ...w, [lijst.id]: d.item }));
      setStatus((s) => ({ ...s, [lijst.id]: "opgeslagen" }));
    } catch (e) {
      setFout((f) => ({ ...f, [lijst.id]: e.message || "Opslaan mislukt." }));
      setStatus((s) => ({ ...s, [lijst.id]: "fout" }));
    }
  };

  const verwijder = async (lijst) => {
    if (!window.confirm(`De vaste uitvraag "${lijst.naam}" voor deze klant verwijderen?`)) return;
    await fetch("/api/medewerker-klant-vaste-uitvragen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "verwijderen", accountId, lijstId: lijst.id }) }).catch(() => {});
    setWerk((w) => { const n = { ...w }; delete n[lijst.id]; return n; });
    setStatus((s) => ({ ...s, [lijst.id]: "rust" }));
  };

  const uitzetten = async (lijst) => {
    const item = werk[lijst.id] || {};
    if (!item.contactId) { setFout((f) => ({ ...f, [lijst.id]: "Kies eerst een contactpersoon." })); return; }
    setStatus((s) => ({ ...s, [lijst.id]: "uitzetten" })); setFout((f) => ({ ...f, [lijst.id]: "" })); setUitzetInfo((u) => ({ ...u, [lijst.id]: "" }));
    try {
      const r = await fetch("/api/medewerker-aanleververzoeken", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "uitzetten", accountId, contactId: item.contactId, lijstId: lijst.id, jaar: jaar[lijst.id] || "", regels: effRegels(lijst), notitie: item.notitie || "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setUitzetInfo((u) => ({ ...u, [lijst.id]: `Uitgezet naar ${item.contactNaam || "de contactpersoon"}${jaar[lijst.id] ? ` (${jaar[lijst.id]})` : ""}.` }));
    } catch (e) {
      setFout((f) => ({ ...f, [lijst.id]: e.message || "Uitzetten mislukt." }));
    } finally { setStatus((s) => ({ ...s, [lijst.id]: "rust" })); }
  };

  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 12.5, background: "#fff" };
  const mini = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "5px 7px", fontSize: 12, background: "#fff" };

  if (data === null) return <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}`, fontSize: 12.5, color: KLEUR.mutedTekst }}>Vaste uitvragen ophalen…</div>;

  return (
    <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <ClipboardCheck size={15} color={KLEUR.blauw} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>Vaste uitvragen</span>
      </div>
      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10 }}>
        Richt een aanleverlijst voor deze klant in: pas de documenten aan waar nodig en koppel een
        contactpersoon (met aanleveren-recht). De uitvraag blijft bewaard, dus het jaar erop zet je hem
        met één klik opnieuw uit — alleen het jaar aanpassen.
      </div>

      {data.lijsten.length === 0 && (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Er zijn nog geen aanleverlijsten (Beheer → Aanleverlijsten).</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.lijsten.map((lijst) => {
          const item = werk[lijst.id];
          const isIngericht = ingericht(lijst.id);
          const isOpen = open.has(lijst.id);
          const aangepast = !!(item && Array.isArray(item.regels));
          const regels = effRegels(lijst);
          const contactRecht = item && item.contactId ? recht[item.contactId] : null;
          const st = status[lijst.id] || "rust";
          return (
            <div key={lijst.id} style={{ border: `1px solid ${isIngericht ? KLEUR.blauw : KLEUR.rand}`, borderRadius: 8, background: isIngericht ? "#fff" : "#FBFBF9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px" }}>
                <button onClick={() => toggle(lijst.id)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                  <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lijst.naam || "Naamloze lijst"}</span>
                  {isIngericht && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: KLEUR.lichtblauw, color: KLEUR.blauw, flexShrink: 0 }}>Ingericht</span>}
                  {aangepast && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#FBF3E4", color: KLEUR.goud, flexShrink: 0 }}>Aangepast</span>}
                </button>
                {item && item.contactNaam && !isOpen && <span style={{ fontSize: 11, color: KLEUR.mutedTekst, display: "inline-flex", alignItems: "center", gap: 4 }}><User size={12} />{item.contactNaam}</span>}
              </div>

              {isOpen && (
                <div style={{ padding: "0 12px 12px" }}>
                  {!isIngericht ? (
                    <div style={{ fontSize: 12, color: KLEUR.subtekst }}>
                      {(lijst.regels || []).length} document(en){lijst.pad ? <> · map <span style={{ color: KLEUR.mutedTekst }}>{lijst.pad}</span></> : null}
                      {magWijzigen && (
                        <div style={{ marginTop: 8 }}>
                          <button onClick={() => inrichten(lijst)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Plus size={13} /> Inrichten voor deze klant</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Contactpersoon */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Contactpersoon</div>
                        {zoekVoor === lijst.id ? (
                          <div>
                            <div style={{ position: "relative" }}>
                              <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
                              <input autoFocus value={cTerm} onChange={(e) => setCTerm(e.target.value)} placeholder="Zoek contactpersoon…" style={{ ...veld, paddingLeft: 28 }} />
                            </div>
                            {cRes.length > 0 && (
                              <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, marginTop: 4, maxHeight: 160, overflowY: "auto", background: "#fff" }}>
                                {cRes.map((c) => (
                                  <button key={c.id} onClick={() => kiesContact(lijst.id, c)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 9px", fontSize: 12.5, cursor: "pointer" }}>
                                    {c.naam}{c.email ? <span style={{ color: KLEUR.mutedTekst }}>{" · " + c.email}</span> : null}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button onClick={() => { setZoekVoor(""); setCTerm(""); }} style={{ fontSize: 11.5, color: KLEUR.subtekst, background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0 }}>annuleren</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: item.contactId ? KLEUR.tekst : KLEUR.mutedTekst }}>{item.contactNaam || "— geen contactpersoon —"}</span>
                            {item.contactId && contactRecht && (contactRecht.aanleveren
                              ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#E7F2EA", color: KLEUR.groen, display: "inline-flex", alignItems: "center", gap: 3 }}><ShieldCheck size={11} /> aanleveren-recht</span>
                              : <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#F6E4E4", color: KLEUR.rood, display: "inline-flex", alignItems: "center", gap: 3 }}><ShieldAlert size={11} /> geen aanleveren-recht</span>)}
                            {magWijzigen && <button onClick={() => { setZoekVoor(lijst.id); setCTerm(""); setCRes([]); }} style={{ fontSize: 11.5, color: KLEUR.blauw, background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>wijzigen</button>}
                          </div>
                        )}
                      </div>

                      {/* Documenten */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 4 }}>
                        Documenten ({regels.length}){lijst.pad ? <span style={{ fontWeight: 400 }}> · map {lijst.pad}</span> : null}
                      </div>
                      {aangepast ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {regels.map((r) => (
                            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1.4fr auto auto", gap: 6, alignItems: "center" }}>
                              <input value={r.naam} disabled={!magWijzigen} onChange={(e) => zetItem(lijst.id, { regels: regels.map((x) => (x.id === r.id ? { ...x, naam: e.target.value } : x)) })} placeholder="Document" style={{ ...mini, width: "100%" }} />
                              <input value={r.bestandsnaam} disabled={!magWijzigen} onChange={(e) => zetItem(lijst.id, { regels: regels.map((x) => (x.id === r.id ? { ...x, bestandsnaam: e.target.value } : x)) })} placeholder="Vaste bestandsnaam" style={{ ...mini, width: "100%" }} />
                              <input value={r.toelichting} disabled={!magWijzigen} onChange={(e) => zetItem(lijst.id, { regels: regels.map((x) => (x.id === r.id ? { ...x, toelichting: e.target.value } : x)) })} placeholder="Toelichting" style={{ ...mini, width: "100%" }} />
                              <label style={{ display: "flex", justifyContent: "center" }} title="Verplicht"><input type="checkbox" checked={r.verplicht !== false} disabled={!magWijzigen} onChange={(e) => zetItem(lijst.id, { regels: regels.map((x) => (x.id === r.id ? { ...x, verplicht: e.target.checked } : x)) })} /></label>
                              <button onClick={() => zetItem(lijst.id, { regels: regels.filter((x) => x.id !== r.id) })} disabled={!magWijzigen} title="Regel verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, cursor: magWijzigen ? "pointer" : "default" }}><Trash2 size={12} /></button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {regels.length === 0 ? <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten in deze lijst.</div>
                            : regels.map((r, i) => <div key={r.id || i} style={{ fontSize: 12.5 }}>• {r.naam}{r.verplicht === false ? <span style={{ color: KLEUR.mutedTekst }}> · optioneel</span> : null}</div>)}
                        </div>
                      )}

                      {magWijzigen && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {aangepast ? (
                            <>
                              <button onClick={() => zetItem(lijst.id, { regels: [...regels, { id: rid(), naam: "", bestandsnaam: "", toelichting: "", verplicht: true }] })} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}><Plus size={12} /> Regel toevoegen</button>
                              <button onClick={() => zetItem(lijst.id, { regels: null })} style={{ padding: "5px 10px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Terug naar lijst uit beheer</button>
                            </>
                          ) : (
                            <button onClick={() => zetItem(lijst.id, { regels: (lijst.regels || []).map((r) => ({ ...r, id: rid() })) })} style={{ padding: "5px 10px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Aanpassen voor deze klant</button>
                          )}
                        </div>
                      )}

                      {/* Notitie */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Notitie voor de klant (optioneel)</div>
                        <input value={item.notitie || ""} disabled={!magWijzigen} onChange={(e) => zetItem(lijst.id, { notitie: e.target.value })} placeholder="bv. Graag vóór 1 april aanleveren" style={veld} />
                      </div>

                      {/* Audit + acties */}
                      {(item.bewerktDoor || item.bewerktOp) && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: KLEUR.mutedTekst, marginTop: 10 }}>
                          <Clock size={12} /> Laatst bewerkt door {item.bewerktDoor || "onbekend"}{item.bewerktOp ? ` op ${datum(item.bewerktOp)}` : ""}
                        </div>
                      )}

                      {fout[lijst.id] && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 8 }}>{fout[lijst.id]}</div>}
                      {uitzetInfo[lijst.id] && <div style={{ fontSize: 12, color: KLEUR.groen, marginTop: 8 }}>{uitzetInfo[lijst.id]}</div>}

                      {magWijzigen && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button onClick={() => opslaan(lijst)} disabled={st === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                            <CheckCircle2 size={13} /> {st === "bezig" ? "Opslaan…" : "Opslaan"}
                          </button>
                          {st === "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.groen }}>Opgeslagen.</span>}

                          <span style={{ width: 1, height: 20, background: KLEUR.rand, margin: "0 2px" }} />

                          <input value={jaar[lijst.id] || ""} onChange={(e) => setJaar((j) => ({ ...j, [lijst.id]: e.target.value }))} placeholder="Jaar" style={{ ...mini, width: 70 }} />
                          <button onClick={() => uitzetten(lijst)} disabled={st === "uitzetten"} title="Nu als aanlever-verzoek uitzetten" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                            <Send size={13} /> {st === "uitzetten" ? "Uitzetten…" : "Uitzetten"}
                          </button>

                          <button onClick={() => verwijder(lijst)} title="Vaste uitvraag verwijderen" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 11px", marginLeft: "auto", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Trash2 size={13} /> Verwijderen</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
