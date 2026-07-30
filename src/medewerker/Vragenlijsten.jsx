import { Fragment, useEffect, useMemo, useState } from "react";
import { ClipboardList, Search, MessageCircle, ChevronDown, Send, RefreshCw, Users, User, CheckCircle2, Circle, FileText } from "lucide-react";

/** Zelfde palet als de rest van het medewerkersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
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

const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

function tijd(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Verzamelt de namen van betrokken medewerkers op een klant (voor het 'mijn cliënten'-filter). */
function namenVanKlant(k) {
  const uit = new Set();
  const voegToe = (x) => { const n = (x && typeof x === "object" ? x.naam : x); if (n) uit.add(String(n).trim().toLowerCase()); };
  voegToe(k.relatiebeheerder); voegToe(k.manager); voegToe(k.accountant); voegToe(k.accountantPersoon);
  voegToe(k.assistent); voegToe(k.fiscaalMedewerker); voegToe(k.loonadministratie);
  return uit;
}

const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "7px 10px", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "9px 10px", borderTop: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

/**
 * Werkoverzicht 'Vragenlijsten' voor medewerkers: alle openstaande vragenlijsten met voortgang, of er
 * klantvragen zijn, en de mogelijkheid die vragen direct te beantwoorden (de klant ziet het antwoord
 * bij zijn vragenlijst). Leest via /api/medewerker-vragenlijsten; het 'mijn cliënten'-filter gebruikt
 * /api/beheer-klanten om te bepalen wie mijn cliënten zijn.
 */
export default function Vragenlijsten() {
  const [rijen, setRijen] = useState(null); // null = laden
  const [mijnNaam, setMijnNaam] = useState("");
  const [klantNamen, setKlantNamen] = useState(null); // Map accountId -> Set(namen) | null = (nog) niet geladen
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [soort, setSoort] = useState(""); // filter op soort vragenlijst (lijstNaam)
  const [scope, setScope] = useState("mijn"); // "mijn" | "alle"
  const [toonAantal, setToonAantal] = useState(25);
  const [openId, setOpenId] = useState("");
  const [antwoord, setAntwoord] = useState({}); // verzoekId -> tekst
  const [bezig, setBezig] = useState("");

  const laad = () => {
    setRijen(null); setFout("");
    fetch("/api/medewerker-vragenlijsten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setRijen(d.rijen || []); setMijnNaam(d.mijnNaam || ""); if (!d.mijnNaam) setScope("alle"); })
      .catch(() => { setRijen([]); setFout("Kon de vragenlijsten niet laden."); });
  };
  useEffect(() => { laad(); }, []);

  // Klant→betrokkenen ophalen voor het 'mijn cliënten'-filter (best effort).
  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { const m = new Map(); (d.klanten || []).forEach((k) => m.set(k.accountId, namenVanKlant(k))); setKlantNamen(m); })
      .catch(() => setKlantNamen(new Map()));
  }, []);

  const isVanMij = (accountId) => {
    if (!mijnNaam || !klantNamen) return false;
    const set = klantNamen.get(accountId);
    return !!(set && set.has(mijnNaam.trim().toLowerCase()));
  };

  const soorten = useMemo(() => [...new Set((rijen || []).map((r) => r.lijstNaam).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rijen]);

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (rijen || []).filter((r) => {
      if (scope === "mijn" && !isVanMij(r.accountId)) return false;
      if (soort && r.lijstNaam !== soort) return false;
      if (q) {
        const hooi = `${r.klantnaam} ${r.klantnummer} ${r.lijstNaam} ${r.contactNaam}`.toLowerCase();
        if (!hooi.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rijen, zoek, soort, scope, mijnNaam, klantNamen]);

  const zichtbaar = toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal);
  const openVragenTotaal = (rijen || []).reduce((s, r) => s + (r.openVragen || 0), 0);

  const beantwoorden = async (r) => {
    const tekst = (antwoord[r.id] || "").trim();
    if (!tekst) return;
    setBezig(r.id);
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "antwoord", verzoekId: r.id, tekst }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setRijen((h) => (h || []).map((x) => (x.id === r.id ? d.verzoek : x)));
      setAntwoord((h) => ({ ...h, [r.id]: "" }));
    } catch { setFout("Antwoord versturen mislukt."); }
    finally { setBezig(""); }
  };

  const balk = (r) => {
    const frac = r.aantalDocumenten ? r.aangeleverd / r.aantalDocumenten : 0;
    const kleur = frac >= 1 ? KLEUR.groen : frac > 0 ? KLEUR.blauw : KLEUR.rand;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
        <div style={{ flex: 1, height: 8, background: "#EFEFEA", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(frac * 100)}%`, height: "100%", background: kleur, borderRadius: 999, transition: "width .2s" }} />
        </div>
        <span style={{ fontSize: 11.5, color: KLEUR.subtekst, fontWeight: 600, whiteSpace: "nowrap" }}>{r.aangeleverd}/{r.aantalDocumenten}</span>
      </div>
    );
  };

  if (rijen === null) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Vragenlijsten ophalen…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <ClipboardList size={17} color={KLEUR.blauw} /> Vragenlijsten
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 760 }}>
            Openstaande vragenlijsten met hun voortgang. Klantvragen staan bovenaan; beantwoord ze direct,
            de klant ziet je antwoord bij zijn vragenlijst.
          </div>
        </div>
        <button onClick={laad} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 12px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <RefreshCw size={13} /> Vernieuwen
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 8 }}>{fout}</div>}

      {/* Scope-schakelaar + zoeken */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
          <button onClick={() => setScope("mijn")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: scope === "mijn" ? KLEUR.blauw : "#fff", color: scope === "mijn" ? "#fff" : KLEUR.subtekst }}><User size={13} /> Mijn cliënten</button>
          <button onClick={() => setScope("alle")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", borderLeft: `1px solid ${KLEUR.rand}`, cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: scope === "alle" ? KLEUR.blauw : "#fff", color: scope === "alle" ? "#fff" : KLEUR.subtekst }}><Users size={13} /> Kantoorbreed</button>
        </div>
        <select value={soort} onChange={(e) => setSoort(e.target.value)} title="Filter op soort vragenlijst" style={{ boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 9px", fontSize: 12.5, background: "#fff", maxWidth: 240 }}>
          <option value="">Alle soorten vragenlijst</option>
          {soorten.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op cliënt, nummer, lijst of contactpersoon…" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 9px 8px 28px", fontSize: 12.5, outline: "none" }} />
        </div>
        {openVragenTotaal > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: KLEUR.rood, display: "inline-flex", alignItems: "center", gap: 5 }}><MessageCircle size={13} /> {openVragenTotaal} open vraag/vragen</span>}
      </div>

      {scope === "mijn" && klantNamen === null && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 6 }}>Cliëntkoppeling laden…</div>}
      {scope === "mijn" && klantNamen !== null && !mijnNaam && <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 6 }}>Je naam kon niet automatisch worden bepaald, dus we kunnen niet zien welke cliënten van jou zijn. Gebruik <strong>Kantoorbreed</strong>.</div>}
      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 6 }}>{gefilterd.length} vragenlijst{gefilterd.length === 1 ? "" : "en"}{gefilterd.length !== zichtbaar.length ? ` · ${zichtbaar.length} getoond` : ""}</div>

      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
          <thead>
            <tr style={{ background: "#FBFBF9" }}>
              <th style={th}>Vragenlijst</th>
              <th style={th}>Startdatum</th>
              <th style={th}>Einddatum</th>
              <th style={th}>Documenten</th>
              <th style={th}>Voortgang</th>
              <th style={th}>Vragen</th>
              <th style={{ ...th, width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {zichtbaar.length === 0 ? (
              <tr><td style={{ ...td, color: KLEUR.mutedTekst }} colSpan={7}>Geen openstaande vragenlijsten{scope === "mijn" ? " voor jouw cliënten" : ""}.</td></tr>
            ) : zichtbaar.map((r) => {
              const open = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr style={{ cursor: "pointer", background: open ? KLEUR.lichtblauw : "transparent" }} onClick={() => setOpenId(open ? "" : r.id)}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.lijstNaam}{r.jaar ? ` ${r.jaar}` : ""}{r.zichtbaar === false && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FBF3E4", color: KLEUR.goud }}>Concept</span>}</div>
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{r.klantnaam || r.accountId}{r.contactNaam ? ` · ${r.contactNaam}` : ""}</div>
                    </td>
                    <td style={td}>{r.startdatum || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{r.deadline || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{r.aantalDocumenten}</td>
                    <td style={td}>{balk(r)}</td>
                    <td style={td}>
                      {r.openVragen > 0
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F6E4E4", color: KLEUR.rood }}><MessageCircle size={11} /> {r.openVragen} open</span>
                        : r.heeftVragen
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#E7F2EA", color: KLEUR.groen }}>Beantwoord</span>
                          : <span style={{ color: KLEUR.mutedTekst }}>—</span>}
                    </td>
                    <td style={td}><ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none" }} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td style={{ ...td, background: "#fff" }} colSpan={7}>
                        {/* Inhoud van de vragenlijst: de gevraagde documenten */}
                        <div style={{ maxWidth: 720, marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>
                            <FileText size={14} /> Documenten ({r.aangeleverd}/{r.aantalDocumenten})
                          </div>
                          {r.notitie && <div style={{ fontSize: 12, color: KLEUR.subtekst, fontStyle: "italic", marginBottom: 6 }}>{r.notitie}</div>}
                          {(r.documenten || []).length === 0 ? (
                            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten in deze vragenlijst.</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {r.documenten.map((d) => {
                                const klaar = d.status === "aangeleverd";
                                return (
                                  <div key={d.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: "6px 9px", border: `1px solid ${klaar ? "#BFE0C8" : KLEUR.rand}`, borderRadius: 7, background: klaar ? "#F1F8F3" : "#fff" }}>
                                    {klaar ? <CheckCircle2 size={15} color={KLEUR.groen} style={{ flexShrink: 0, marginTop: 1 }} /> : <Circle size={15} color={KLEUR.mutedTekst} style={{ flexShrink: 0, marginTop: 1 }} />}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div><span style={{ fontWeight: 600 }}>{d.naam}</span>{d.verplicht === false && <span style={{ color: KLEUR.mutedTekst }}> · optioneel</span>}</div>
                                      {klaar && d.bestandNaam && <div style={{ fontSize: 11.5, color: KLEUR.groen }}>Aangeleverd: {d.bestandNaam}{d.aangeleverdOp ? ` · ${tijd(d.aangeleverdOp)}` : ""}</div>}
                                      {d.opmerking && <div style={{ fontSize: 11.5, color: KLEUR.goud }}>Opmerking klant: {d.opmerking}</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>
                          <MessageCircle size={14} /> Vragen
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 720 }}>
                          {(r.vragen || []).length === 0 ? (
                            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen vragen bij deze vragenlijst.</div>
                          ) : r.vragen.map((m) => (
                            <div key={m.id} style={{ alignSelf: m.rol === "klant" ? "flex-start" : "flex-end", maxWidth: "85%", background: m.rol === "klant" ? "#F4F1EA" : KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 10px" }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: m.rol === "klant" ? KLEUR.goud : KLEUR.blauw, marginBottom: 2 }}>
                                {m.rol === "klant" ? (m.auteur || r.contactNaam || "Klant") : (m.rol === "ai" ? "Assistent" : (m.auteur || "Medewerker"))}
                                <span style={{ color: KLEUR.mutedTekst, fontWeight: 400 }}>{m.tijd ? ` · ${tijd(m.tijd)}` : ""}</span>
                              </div>
                              <div style={{ fontSize: 12.5, color: KLEUR.tekst, whiteSpace: "pre-wrap" }}>{m.tekst}</div>
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <input
                              value={antwoord[r.id] || ""}
                              onChange={(e) => setAntwoord((h) => ({ ...h, [r.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") beantwoorden(r); }}
                              placeholder="Typ je antwoord aan de klant…"
                              style={{ flex: 1, boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 12.5, outline: "none" }}
                            />
                            <button onClick={() => beantwoorden(r)} disabled={bezig === r.id || !(antwoord[r.id] || "").trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                              <Send size={13} /> {bezig === r.id ? "Versturen…" : "Antwoord versturen"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 10, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTALLEN.map(([n, lbl]) => (
          <button key={lbl} onClick={() => setToonAantal(n)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`, background: toonAantal === n ? KLEUR.blauw : "#fff", color: toonAantal === n ? "#fff" : KLEUR.subtekst }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}
