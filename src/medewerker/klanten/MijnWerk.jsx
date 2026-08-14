/**
 * "Mijn werk" — de ingelogde medewerker tekent zíjn eigen toegewezen werk af, nu als matrix:
 * klanten in de rijen, hoofdtaken (hoofdactiviteiten) in de kolommen, met een statuskleur per cel
 * (open / bezig / gereed). Filteren kan op klant, klantgroep en taak. Klik een cel om de deelstappen
 * van die hoofdtaak voor die klant af te tekenen; alle deelstappen af → de cel is "Gereed".
 *
 * Toont alleen de hoofdactiviteiten (uit de per-klant planning-configuratie) die in de gekozen periode
 * aan JOU zijn toegewezen — als vaste toewijzing (toegewezenAan) of via je rol op de klant.
 *
 * Data + opslaan via /api/mw-planning-deelactiviteiten (zelfde als het Afwikkeling-scherm).
 */
import { useState, useEffect, useMemo } from "react";
import { ClipboardCheck, ChevronLeft, ChevronRight, CheckSquare, Square, CheckCircle2, Loader2, Search, X } from "lucide-react";
import { useMijnNaam } from "../MijnFilter";
import UrenSchrijvenPanel from "../UrenSchrijvenPanel";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", roodBg: "#FBEAEA", roodRand: "#EAC4C4",
  groen: "#2E7D46", groenBg: "#E7F3EB", groenRand: "#BFE3C9",
  amber: "#A9660C", amberBg: "#FFF4E5", amberRand: "#F2D9A8", lichtblauw: "#EAF2F8",
};
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const pad = (n) => String(n).padStart(2, "0");
const datumKort = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL"); };

function teamPersoon(klant, rol) {
  if (!klant || !rol) return "";
  switch (rol) {
    case "assistent": return klant.assistent?.naam || "";
    case "manager": return klant.manager?.naam || klant.relatiebeheerder || "";
    case "accountant": return klant.accountantPersoon?.naam || klant.accountant || "";
    case "fiscaal": return klant.fiscaalMedewerker?.naam || "";
    case "loonadministratie": return klant.loonadministratie?.naam || "";
    case "backup": return klant.backup?.naam || "";
    default: return "";
  }
}
function valtInMaand(r, maand1) {
  if (r.frequentie === "maandelijks") return true;
  if (r.frequentie === "kwartaal") return [1, 4, 7, 10].includes(maand1);
  if (r.frequentie === "jaarlijks" || r.frequentie === "eenmalig") return Number(r.uitvoerMaand) === maand1;
  return false;
}

// Statuskleur van één cel (hoofdtaak × klant).
function celStatus(item) {
  if (!item) return null;
  if (item.gereed) return { kind: "gereed", label: item.total ? `${item.done}/${item.total}` : "Gereed", bg: KLEUR.groenBg, kleur: KLEUR.groen, rand: KLEUR.groenRand };
  if (item.done > 0) return { kind: "bezig", label: `${item.done}/${item.total}`, bg: KLEUR.amberBg, kleur: KLEUR.amber, rand: KLEUR.amberRand };
  return { kind: "open", label: item.total ? `0/${item.total}` : "Open", bg: KLEUR.roodBg, kleur: KLEUR.rood, rand: KLEUR.roodRand };
}

export default function MijnWerk() {
  const nu = new Date();
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const [type, setType] = useState("maand"); // maand | jaar
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [status, setStatus] = useState({});            // { "acc|act|deel": { gereed, wie, datum } }
  const [klantDeelstappen, setKlantDeelstappen] = useState({}); // { "acc|act": [ {sleutel,label} ] }
  const [bezig, setBezig] = useState("");              // key die nu wordt opgeslagen
  const [fout, setFout] = useState("");

  // Filters + actieve cel (uitgeklapte deelstappen).
  const [klantZoek, setKlantZoek] = useState("");
  const [groepFilter, setGroepFilter] = useState("");
  const [verborgenTaken, setVerborgenTaken] = useState(() => new Set()); // hoofdtaken (kolommen) die verborgen zijn
  const [alleenOpen, setAlleenOpen] = useState(false);
  const [actieveCel, setActieveCel] = useState(null);  // { acc, actSleutel } of null

  const periode = type === "maand" ? `${jaar}-${pad(maand)}` : `${jaar}`;
  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);
  const activiteitOrder = useMemo(() => Object.fromEntries(activiteiten.map((a, i) => [a.sleutel, i])), [activiteiten]);
  const mijnLc = String(mijnNaam || "").trim().toLowerCase();

  useEffect(() => {
    fetch("/api/mw-planning-config").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setConfig(d.config || [])).catch(() => { setConfig([]); setFout("Configuratie kon niet worden geladen."); });
    fetch("/api/mw-planning-overzicht").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setActiviteiten(d.activiteiten || [])).catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten?alle=1").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const b = {}; (d.klanten || []).forEach((k) => { b[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(b); }).catch(() => setKlantenMap({}));
  }, []);

  useEffect(() => {
    setActieveCel(null);
    fetch(`/api/mw-planning-deelactiviteiten?periode=${periode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setStatus(d.status || {}); setKlantDeelstappen(d.klantDeelstappen || {}); })
      .catch(() => { setStatus({}); setKlantDeelstappen({}); });
  }, [periode]);

  const effDeelstappen = (acc, actSleutel) => {
    const ov = klantDeelstappen[`${acc}|${actSleutel}`];
    return Array.isArray(ov) && ov.length ? ov : (activiteitById[actSleutel]?.deelstappen || []);
  };
  const stFor = (acc, actSleutel, deelSleutel) => status[`${acc}|${actSleutel}|${deelSleutel}`] || null;

  // Alleen de aan mij toegewezen hoofdactiviteiten in deze periode → per (klant × hoofdtaak) één item.
  const items = useMemo(() => {
    if (!config || !mijnLc) return [];
    const seen = new Set();
    const rijen = [];
    for (const r of config) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act || (act.type || "maand") !== type) continue;
      // "Vanaf" (maand/jaar) — per klant ingesteld (Planning → configuratie per klant): de activiteit
      // wordt voor deze klant pas vanaf dat moment in de planning/Mijn werk opgenomen.
      if (r.vanaf) {
        if (type === "maand") { if (`${jaar}-${pad(maand)}` < r.vanaf) continue; }
        else if (jaar < Number(String(r.vanaf).slice(0, 4))) continue;
      }
      if (type === "maand" && !valtInMaand(r, maand)) continue;
      const acc = String(r.klantAccountId || "").toLowerCase();
      const klant = klantenMap[acc] || null;
      const wie = (r.toegewezenAan || "").trim() || teamPersoon(klant, act.rol);
      if (String(wie || "").trim().toLowerCase() !== mijnLc) continue;
      const dubbelKey = `${acc}|${act.sleutel}`;
      if (seen.has(dubbelKey)) continue;
      seen.add(dubbelKey);
      const eff = effDeelstappen(acc, act.sleutel);
      const total = eff.length;
      const done = total ? eff.filter((d) => stFor(acc, act.sleutel, d.sleutel)?.gereed).length : 0;
      const gereed = total ? done === total : !!stFor(acc, act.sleutel, "__hoofd__")?.gereed;
      rijen.push({
        key: dubbelKey, acc, accountId: klant?.accountId || r.klantAccountId || "", actSleutel: act.sleutel, act, eff, done, total, gereed,
        klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "", klantgroep: klant?.groepsnaam || "",
      });
    }
    return rijen;
  }, [config, activiteitById, klantenMap, klantDeelstappen, status, type, maand, mijnLc]);

  // Kolommen: de hoofdtaken die in mijn werk voorkomen (op definitie-volgorde).
  const alleTaken = useMemo(() => {
    const perSleutel = new Map();
    for (const it of items) if (!perSleutel.has(it.actSleutel)) perSleutel.set(it.actSleutel, { sleutel: it.actSleutel, label: it.act.label });
    return [...perSleutel.values()].sort((a, b) => (activiteitOrder[a.sleutel] ?? 999) - (activiteitOrder[b.sleutel] ?? 999) || String(a.label).localeCompare(String(b.label), "nl"));
  }, [items, activiteitOrder]);
  const zichtbareTaken = alleTaken.filter((t) => !verborgenTaken.has(t.sleutel));

  // Rijen: per klant, met een map hoofdtaak→item.
  const klantRijen = useMemo(() => {
    const perKlant = new Map();
    for (const it of items) {
      if (!perKlant.has(it.acc)) perKlant.set(it.acc, { acc: it.acc, accountId: it.accountId, klantnaam: it.klantnaam, klantnummer: it.klantnummer, klantgroep: it.klantgroep, taken: {} });
      perKlant.get(it.acc).taken[it.actSleutel] = it;
    }
    return [...perKlant.values()].sort((a, b) => String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
  }, [items]);

  const groepen = useMemo(() => [...new Set(klantRijen.map((k) => k.klantgroep).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")), [klantRijen]);

  const zichtbareRijen = useMemo(() => {
    const q = klantZoek.trim().toLowerCase();
    return klantRijen.filter((k) => {
      if (q && !`${k.klantnaam} ${k.klantnummer}`.toLowerCase().includes(q)) return false;
      if (groepFilter && k.klantgroep !== groepFilter) return false;
      if (alleenOpen) {
        const relevante = zichtbareTaken.map((t) => k.taken[t.sleutel]).filter(Boolean);
        if (relevante.length && relevante.every((it) => it.gereed)) return false;
      }
      return true;
    });
  }, [klantRijen, klantZoek, groepFilter, alleenOpen, zichtbareTaken]);

  const totaalCellen = items.length;
  const gereedCellen = items.filter((i) => i.gereed).length;

  // De aangeklikte cel (voor de aftekenen-popup) — live afgeleid, zodat de status meebeweegt met afvinken.
  const actieveRij = actieveCel ? klantRijen.find((r) => r.acc === actieveCel.acc) : null;
  const actiefItem = actieveRij ? actieveRij.taken[actieveCel.actSleutel] : null;
  const actieveStatus = actiefItem ? celStatus(actiefItem) : null;
  const STATUS_LABEL = { open: "Open", bezig: "Bezig", gereed: "Gereed" };

  const afvink = async (acc, actSleutel, deelSleutel, gereed) => {
    setFout("");
    const key = `${acc}|${actSleutel}|${deelSleutel}`;
    setBezig(key);
    const vorigeStatus = status;
    setStatus((p) => { const n = { ...p }; if (gereed) n[key] = { gereed: true, wie: mijnNaam || "(jij)", datum: new Date().toISOString() }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "afvink", accountId: acc, activiteit: actSleutel, periode, deelstap: deelSleutel, gereed }),
      });
      if (!res.ok) {
        const msg = res.status === 403 ? "Je hebt (nog) geen recht om af te tekenen." : ((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        throw new Error(msg);
      }
      const d = await res.json().catch(() => ({}));
      setStatus((p) => { const n = { ...p }; if (gereed && d.status) n[key] = d.status; else if (!gereed) delete n[key]; return n; });
    } catch (e) { setStatus(vorigeStatus); setFout(e.message || "Aftekenen mislukt."); } finally { setBezig(""); }
  };

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const toggleTaak = (sleutel) => setVerborgenTaken((s) => { const n = new Set(s); if (n.has(sleutel)) n.delete(sleutel); else n.add(sleutel); return n; });
  const filterActief = !!klantZoek.trim() || !!groepFilter || verborgenTaken.size > 0 || alleenOpen;

  const laden = config === null || !naamGeladen;

  const kop = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const cel = { padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <ClipboardCheck size={17} color={KLEUR.blauw} /> Mijn werk{mijnNaam ? <span style={{ fontSize: 12.5, fontWeight: 500, color: KLEUR.mutedTekst }}>· {mijnNaam}</span> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: type === "maand" ? 150 : 60, textAlign: "center" }}>{type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : jaar}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Bovenbalk: periode-type + filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={klantZoek} onChange={(e) => setKlantZoek(e.target.value)} placeholder="Zoek op klant of klantnummer…" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }} />
        </div>
        <label style={{ fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Klantgroep
          <select value={groepFilter} onChange={(e) => setGroepFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: "#fff", cursor: "pointer" }}>
            <option value="">Alle</option>
            {groepen.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: KLEUR.subtekst }}>
          <input type="checkbox" checked={alleenOpen} onChange={(e) => setAlleenOpen(e.target.checked)} /> Alleen openstaand
        </label>
        {filterActief && <button onClick={() => { setKlantZoek(""); setGroepFilter(""); setVerborgenTaken(new Set()); setAlleenOpen(false); }} style={{ padding: "6px 10px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Filters wissen</button>}
      </div>

      {/* Taak-filter (kolommen aan/uit) + statuslegenda */}
      {alleTaken.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", marginRight: 2 }}>Taken:</span>
          {alleTaken.map((t) => {
            const aan = !verborgenTaken.has(t.sleutel);
            return (
              <button key={t.sleutel} onClick={() => toggleTaak(t.sleutel)} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`, background: aan ? KLEUR.lichtblauw : "#fff", color: aan ? KLEUR.blauw : KLEUR.mutedTekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t.label}</button>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 11.5, color: KLEUR.subtekst }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: KLEUR.roodBg, border: `1px solid ${KLEUR.roodRand}` }} /> Open</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}` }} /> Bezig</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: KLEUR.groenBg, border: `1px solid ${KLEUR.groenRand}` }} /> Gereed</span>
          </span>
        </div>
      )}

      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 10 }}>
        <strong style={{ color: KLEUR.tekst }}>{zichtbareRijen.length}</strong> {zichtbareRijen.length === 1 ? "klant" : "klanten"} · {gereedCellen}/{totaalCellen} taken gereed
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>{fout}</div>}

      {laden ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Laden…</div>
      ) : !mijnNaam ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Je naam kon niet worden bepaald, dus je toegewezen werk kan niet worden getoond. Log opnieuw in of neem contact op met beheer.</div>
      ) : klantRijen.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Er is voor deze periode niets aan jou toegewezen.</div>
      ) : zichtbareRijen.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Geen klanten voor deze filters.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ ...kop, position: "sticky", left: 0, background: "#fff", zIndex: 2, minWidth: 200 }}>Klant</th>
                {zichtbareTaken.map((t) => <th key={t.sleutel} style={{ ...kop, textAlign: "center" }}>{t.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {zichtbareRijen.map((rij) => {
                const celOpen = actieveCel && actieveCel.acc === rij.acc;
                return (
                  <tr key={rij.acc}>
                    <td style={{ ...cel, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>{rij.klantnaam}</div>
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{rij.klantnummer ? `${rij.klantnummer}` : ""}{rij.klantnummer && rij.klantgroep ? " · " : ""}{rij.klantgroep || ""}</div>
                    </td>
                    {zichtbareTaken.map((t) => {
                      const it = rij.taken[t.sleutel];
                      const st = celStatus(it);
                      if (!st) return <td key={t.sleutel} style={{ ...cel, textAlign: "center", color: KLEUR.rand }}>—</td>;
                      const isActief = celOpen && actieveCel.actSleutel === t.sleutel;
                      return (
                        <td key={t.sleutel} style={{ ...cel, textAlign: "center" }}>
                          <button
                            onClick={() => setActieveCel({ acc: rij.acc, actSleutel: t.sleutel })}
                            title={`${t.label} — ${rij.klantnaam} · aftekenen`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 62, justifyContent: "center", padding: "4px 10px", borderRadius: 20, background: st.bg, color: st.kleur, border: `1px solid ${isActief ? st.kleur : st.rand}`, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                          >
                            {st.kind === "gereed" ? <CheckCircle2 size={12} /> : null}{st.label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 10, lineHeight: 1.5 }}>
        Klanten in de rijen, jouw hoofdtaken in de kolommen. De kleur toont de status: <span style={{ color: KLEUR.rood, fontWeight: 700 }}>open</span>, <span style={{ color: KLEUR.amber, fontWeight: 700 }}>bezig</span> of <span style={{ color: KLEUR.groen, fontWeight: 700 }}>gereed</span>. Klik een cel om af te tekenen; is alles gereed, dan schrijf je gelijk je uren op de klant.
      </div>

      {/* Aftekenen-popup: deelstappen + status per taak; is de taak gereed, dan gelijk uren schrijven */}
      {actieveCel && actieveRij && actiefItem && (
        <div onClick={() => setActieveCel(null)} style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${KLEUR.rand}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: KLEUR.tekst }}>{actiefItem.act.label}</div>
                <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{actieveRij.klantnaam}{actieveRij.klantnummer ? ` · ${actieveRij.klantnummer}` : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {actieveStatus && <span style={{ fontSize: 11, fontWeight: 700, color: actieveStatus.kleur, background: actieveStatus.bg, border: `1px solid ${actieveStatus.rand}`, borderRadius: 999, padding: "2px 10px" }}>{STATUS_LABEL[actieveStatus.kind]}{actiefItem.total ? ` · ${actiefItem.done}/${actiefItem.total}` : ""}</span>}
                <button onClick={() => setActieveCel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2, display: "inline-flex" }}><X size={18} /></button>
              </div>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Deelstappen</div>
              {(actiefItem.total === 0 ? [{ sleutel: "__hoofd__", label: `${actiefItem.act.label} afgewikkeld` }] : actiefItem.eff).map((d) => {
                const s = stFor(actieveRij.acc, actiefItem.actSleutel, d.sleutel);
                const gereed = !!s?.gereed;
                const key = `${actieveRij.acc}|${actiefItem.actSleutel}|${d.sleutel}`;
                return (
                  <div key={d.sleutel} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: `1px solid ${KLEUR.rand}55`, borderLeft: d.kleur ? `3px solid ${d.kleur}` : "3px solid transparent", paddingLeft: 8 }}>
                    <button disabled={bezig === key} onClick={() => afvink(actieveRij.acc, actiefItem.actSleutel, d.sleutel, !gereed)} style={{ background: "none", border: "none", cursor: bezig === key ? "default" : "pointer", color: gereed ? KLEUR.groen : KLEUR.mutedTekst, padding: 0, display: "inline-flex" }}>
                      {gereed ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                    {d.kleur ? <span style={{ width: 10, height: 10, borderRadius: 3, background: d.kleur, flexShrink: 0 }} /> : null}
                    <span style={{ flex: 1, fontSize: 13.5, color: KLEUR.tekst, fontWeight: gereed ? 600 : 400 }}>{d.label}</span>
                    {gereed
                      ? <span style={{ fontSize: 11, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>{s?.wie || ""}{s?.datum ? ` · ${datumKort(s.datum)}` : ""}</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, borderRadius: 999, padding: "1px 8px" }}>open</span>}
                  </div>
                );
              })}

              {actiefItem.gereed && (
                <div style={{ marginTop: 16 }}>
                  {actieveRij.accountId ? (
                    <UrenSchrijvenPanel
                      key={`${actieveRij.acc}|${actiefItem.actSleutel}`}
                      accountId={actieveRij.accountId}
                      klantnaam={actieveRij.klantnaam}
                      voorgesteldeUren=""
                      omschrijving={actiefItem.act.label}
                      onGeboekt={() => {}}
                      onOverslaan={() => setActieveCel(null)}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen cliënt gekoppeld, dus er kunnen geen uren worden geschreven.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
