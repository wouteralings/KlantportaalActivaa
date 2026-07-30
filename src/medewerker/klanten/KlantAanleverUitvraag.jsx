import { useEffect, useState } from "react";
import { ClipboardList, Plus, Send, Trash2, ChevronDown, CheckCircle2, Search } from "lucide-react";

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

const rid = () => Math.random().toString(36).slice(2, 9);

/**
 * Aanlever-verzoeken vanaf de KLANTKAART: account vast, contactpersoon voorgevuld (de primaire
 * contactpersoon) maar wijzigbaar. Verder identiek aan de uitvraag vanuit de contactpersoon: kies
 * onderwerp (+ jaar → map), lijst voorgevuld (klant-specifiek/algemeen), plus vrije regels.
 */
export default function KlantAanleverUitvraag({ accountId, klantnaam, defaultContact, magWijzigen }) {
  const [verzoeken, setVerzoeken] = useState(null);
  const [klant, setKlant] = useState(null); // { onderwerpen, lijsten, config }
  const [nieuw, setNieuw] = useState(false);
  const [contact, setContact] = useState(defaultContact || { id: "", naam: "" });
  const [wijzigContact, setWijzigContact] = useState(false);
  const [cTerm, setCTerm] = useState("");
  const [cRes, setCRes] = useState([]);
  const [onderwerpId, setOnderwerpId] = useState("");
  const [lijstId, setLijstId] = useState("");
  const [jaar, setJaar] = useState("");
  const [gebruikAlgemeen, setGebruikAlgemeen] = useState(false);
  const [extraRegels, setExtraRegels] = useState([]);
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [openId, setOpenId] = useState("");

  const laad = () =>
    fetch("/api/medewerker-aanleververzoeken?accountId=" + encodeURIComponent(accountId))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setVerzoeken(d.verzoeken || []))
      .catch(() => setVerzoeken([]));

  useEffect(() => {
    let a = true;
    setVerzoeken(null); setKlant(null);
    laad();
    fetch("/api/medewerker-klant-onderwerpen?accountId=" + encodeURIComponent(accountId))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (a) setKlant({ onderwerpen: d.onderwerpen || [], lijsten: d.lijsten || [], config: d.config || {} }); })
      .catch(() => { if (a) setKlant({ onderwerpen: [], lijsten: [], config: {} }); });
    return () => { a = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => { setContact(defaultContact || { id: "", naam: "" }); }, [defaultContact && defaultContact.id]);

  useEffect(() => {
    if (!wijzigContact || cTerm.trim().length < 2) { setCRes([]); return; }
    let a = true;
    fetch("/api/klant-contacten?zoek=" + encodeURIComponent(cTerm.trim()))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (a) setCRes(d.contacten || []); })
      .catch(() => { if (a) setCRes([]); });
    return () => { a = false; };
  }, [cTerm, wijzigContact]);

  const onderwerp = klant ? (klant.onderwerpen || []).find((o) => o.id === onderwerpId) : null;
  const conf = klant && onderwerpId ? klant.config[onderwerpId] : null;
  const klantSpecifiek = !!(conf && Array.isArray(conf.regels));
  const gekozenLijst = klant && lijstId ? (klant.lijsten || []).find((l) => l.id === lijstId) : null;
  const bronLabel = gekozenLijst ? `de lijst "${gekozenLijst.naam}"` : (klantSpecifiek && !gebruikAlgemeen ? "de klant-specifieke lijst" : "de algemene lijst");
  const basisRegels = (() => {
    if (gekozenLijst) return gekozenLijst.regels || [];
    if (!onderwerp) return [];
    if (klantSpecifiek && !gebruikAlgemeen) return conf.regels || [];
    if (onderwerp.standaardLijstId) return ((klant.lijsten || []).find((l) => l.id === onderwerp.standaardLijstId) || {}).regels || [];
    return [];
  })();

  const uitzetten = async () => {
    if (!contact.id) { setFout("Kies een contactpersoon."); return; }
    const extra = extraRegels.filter((r) => r.naam.trim());
    const regels = [...basisRegels, ...extra];
    if (!onderwerpId && !lijstId && regels.length === 0) { setFout("Kies een onderwerp of lijst, of voeg minimaal één regel toe."); return; }
    setBezig(true); setFout("");
    try {
      const r = await fetch("/api/medewerker-aanleververzoeken", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "uitzetten", accountId, contactId: contact.id, onderwerpId, lijstId, jaar, gebruikAlgemeen, regels, notitie }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setNieuw(false); setOnderwerpId(""); setLijstId(""); setJaar(""); setExtraRegels([]); setNotitie(""); setGebruikAlgemeen(false);
      await laad();
    } catch (e) {
      setFout(e.message || "Uitzetten mislukt.");
    } finally { setBezig(false); }
  };

  const verwijder = async (id) => {
    if (!window.confirm("Dit aanlever-verzoek verwijderen?")) return;
    await fetch("/api/medewerker-aanleververzoeken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "verwijderen", id }) }).catch(() => {});
    laad();
  };

  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, background: "#fff" };
  const mini = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "5px 7px", fontSize: 12, background: "#fff" };

  return (
    <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={15} color={KLEUR.blauw} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Aanlever-verzoeken</span>
        </div>
        {!nieuw && magWijzigen && (
          <button onClick={() => { setNieuw(true); setFout(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={13} /> Verzoek uitzetten
          </button>
        )}
      </div>

      {nieuw && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 10, background: "#FBFBF9" }}>
          {/* Contactpersoon: voorgevuld met de primaire, wijzigbaar */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Contactpersoon</div>
            {!wijzigContact ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: contact.id ? KLEUR.tekst : KLEUR.mutedTekst }}>{contact.naam || "— geen contactpersoon —"}</span>
                <button onClick={() => { setWijzigContact(true); setCTerm(""); setCRes([]); }} style={{ fontSize: 11.5, color: KLEUR.blauw, background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>wijzigen</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative" }}>
                  <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
                  <input autoFocus value={cTerm} onChange={(e) => setCTerm(e.target.value)} placeholder="Zoek contactpersoon…" style={{ ...veld, paddingLeft: 28 }} />
                </div>
                {cRes.length > 0 && (
                  <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, marginTop: 4, maxHeight: 160, overflowY: "auto", background: "#fff" }}>
                    {cRes.map((c) => (
                      <button key={c.id} onClick={() => { setContact({ id: c.id, naam: c.naam }); setWijzigContact(false); }} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 9px", fontSize: 12.5, cursor: "pointer" }}>
                        {c.naam}{c.email ? <span style={{ color: KLEUR.mutedTekst }}>{" · " + c.email}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setWijzigContact(false)} style={{ fontSize: 11.5, color: KLEUR.subtekst, background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0 }}>annuleren</button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 0.6fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Onderwerp <span style={{ fontWeight: 400 }}>(map)</span></div>
              <select value={onderwerpId} onChange={(e) => { setOnderwerpId(e.target.value); setGebruikAlgemeen(false); }} disabled={!klant} style={veld}>
                <option value="">— geen / algemeen —</option>
                {(klant && klant.onderwerpen || []).map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Lijst <span style={{ fontWeight: 400 }}>(leeg = van onderwerp)</span></div>
              <select value={lijstId} onChange={(e) => setLijstId(e.target.value)} disabled={!klant} style={veld}>
                <option value="">{onderwerp ? "— lijst van het onderwerp —" : "— kies lijst —"}</option>
                {(klant && klant.lijsten || []).map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Jaar</div>
              <input value={jaar} onChange={(e) => setJaar(e.target.value)} placeholder="2025" style={veld} />
            </div>
          </div>

          {klant && (klant.onderwerpen || []).length === 0 && (
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Er zijn nog geen onderwerpen ingericht (Beheer → Onderwerpen). Je kunt hieronder wel losse regels toevoegen.</div>
          )}

          {(onderwerp || gekozenLijst) && (
            <div style={{ marginTop: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst }}>
                  Documenten uit {bronLabel} ({basisRegels.length})
                </span>
                {klantSpecifiek && !gekozenLijst && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: KLEUR.subtekst, cursor: "pointer" }}>
                    <input type="checkbox" checked={gebruikAlgemeen} onChange={(e) => setGebruikAlgemeen(e.target.checked)} /> Algemene lijst gebruiken
                  </label>
                )}
              </div>
              {basisRegels.length === 0
                ? <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten in deze lijst — voeg hieronder losse regels toe.</div>
                : basisRegels.map((r, i) => <div key={r.id || i} style={{ fontSize: 12.5 }}>• {r.naam}{r.verplicht === false ? <span style={{ color: KLEUR.mutedTekst }}> · optioneel</span> : null}</div>)}
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 4 }}>Extra losse documenten (optioneel)</div>
            {extraRegels.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr auto", gap: 6, marginBottom: 5 }}>
                <input value={r.naam} onChange={(e) => setExtraRegels((h) => h.map((x) => (x.id === r.id ? { ...x, naam: e.target.value } : x)))} placeholder="Document" style={{ ...mini, width: "100%" }} />
                <input value={r.bestandsnaam} onChange={(e) => setExtraRegels((h) => h.map((x) => (x.id === r.id ? { ...x, bestandsnaam: e.target.value } : x)))} placeholder="Vaste bestandsnaam (optioneel)" style={{ ...mini, width: "100%" }} />
                <button onClick={() => setExtraRegels((h) => h.filter((x) => x.id !== r.id))} title="Verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, cursor: "pointer" }}><Trash2 size={12} /></button>
              </div>
            ))}
            <button onClick={() => setExtraRegels((h) => [...h, { id: rid(), naam: "", bestandsnaam: "", toelichting: "", verplicht: true }])} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}><Plus size={12} /> Regel toevoegen</button>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Notitie voor de klant (optioneel)</div>
            <input value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="bv. Graag vóór 1 april aanleveren" style={veld} />
          </div>

          {fout && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={uitzetten} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <Send size={13} /> {bezig ? "Uitzetten…" : "Uitzetten"}
            </button>
            <button onClick={() => { setNieuw(false); setFout(""); }} style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
          </div>
        </div>
      )}

      {verzoeken === null ? (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Verzoeken ophalen…</div>
      ) : verzoeken.length === 0 ? (
        !nieuw && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen aanlever-verzoeken voor deze klant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {verzoeken.map((v) => {
            const klaar = v.regels.filter((r) => r.status === "aangeleverd").length;
            const open = openId === v.id;
            return (
              <div key={v.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 12px" }}>
                  <button onClick={() => setOpenId(open ? "" : v.id)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                    <ChevronDown size={14} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v.onderwerp || v.lijstNaam || "Aanlever-verzoek"}{v.jaar ? ` ${v.jaar}` : ""}</span>
                    <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{v.contactNaam}{" · "}{klaar}/{v.regels.length} aangeleverd</span>
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: v.status === "afgerond" ? "#E7F2EA" : KLEUR.lichtblauw, color: v.status === "afgerond" ? KLEUR.groen : KLEUR.blauw }}>{v.status === "afgerond" ? "Compleet" : "Openstaand"}</span>
                    {magWijzigen && <button onClick={() => verwijder(v.id)} title="Verwijderen" style={{ display: "inline-flex", background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer" }}><Trash2 size={14} /></button>}
                  </div>
                </div>
                {open && (
                  <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                    {v.notitie && <div style={{ fontSize: 11.5, color: KLEUR.subtekst, fontStyle: "italic" }}>{v.notitie}</div>}
                    {v.regels.map((r) => (
                      <div key={r.id} style={{ fontSize: 12, padding: "6px 9px", background: "#FBFBF9", border: `1px solid ${KLEUR.rand}`, borderRadius: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {r.status === "aangeleverd"
                            ? <CheckCircle2 size={13} color={KLEUR.groen} />
                            : <span style={{ width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${KLEUR.mutedTekst}`, display: "inline-block" }} />}
                          <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{r.naam}</span>
                          {r.status === "aangeleverd" && r.bestand && <span style={{ color: KLEUR.mutedTekst }}>· {r.bestand.naam}</span>}
                        </div>
                        {r.opmerking && <div style={{ marginLeft: 20, marginTop: 2, color: "#B98237" }}>Opmerking: {r.opmerking}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
