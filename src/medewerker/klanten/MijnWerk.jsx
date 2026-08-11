/**
 * "Mijn werk" — de ingelogde medewerker tekent zíjn eigen toegewezen werk af.
 *
 * Toont alleen de hoofdactiviteiten (uit de per-klant planning-configuratie) die in de gekozen
 * periode aan JOU zijn toegewezen — als vaste toewijzing (toegewezenAan) of via je rol op de klant
 * (accountant/manager/assistent/…). Per hoofdactiviteit teken je de deelstappen af (met wie + datum);
 * alle deelstappen af → de activiteit is "Gereed". Zo hoeft een medewerker niet de hele
 * klant-matrix (Planning → Deelactiviteiten) door: dit is puur zijn eigen lijstje.
 *
 * Data + opslaan via /api/mw-planning-deelactiviteiten (zelfde als het Afwikkeling-scherm).
 * Bedoeld om buiten de Planning-tab te hangen, zichtbaar voor elke medewerker.
 */
import { useState, useEffect, useMemo } from "react";
import { ClipboardCheck, ChevronLeft, ChevronRight, CheckSquare, Square, CheckCircle2, Loader2 } from "lucide-react";
import { useMijnNaam } from "../MijnFilter";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", groenBg: "#E7F3EB", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
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

export default function MijnWerk() {
  const nu = new Date();
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const [type, setType] = useState("maand"); // maand | jaar
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);
  const [verberg, setVerberg] = useState(true); // afgeronde activiteiten verbergen

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [status, setStatus] = useState({});            // { "acc|act|deel": { gereed, wie, datum } }
  const [klantDeelstappen, setKlantDeelstappen] = useState({}); // { "acc|act": [ {sleutel,label} ] }
  const [open, setOpen] = useState(() => new Set());   // welke (acc|act) uitgeklapt
  const [bezig, setBezig] = useState("");              // key die nu wordt opgeslagen
  const [fout, setFout] = useState("");

  const periode = type === "maand" ? `${jaar}-${pad(maand)}` : `${jaar}`;
  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);
  const mijnLc = String(mijnNaam || "").trim().toLowerCase();

  useEffect(() => {
    fetch("/api/mw-planning-config").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setConfig(d.config || [])).catch(() => { setConfig([]); setFout("Configuratie kon niet worden geladen."); });
    fetch("/api/mw-planning-overzicht").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setActiviteiten(d.activiteiten || [])).catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten?alle=1").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const b = {}; (d.klanten || []).forEach((k) => { b[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(b); }).catch(() => setKlantenMap({}));
  }, []);

  useEffect(() => {
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

  // Alleen de aan mij toegewezen hoofdactiviteiten in deze periode.
  const items = useMemo(() => {
    if (!config || !mijnLc) return [];
    const seen = new Set();
    const rijen = [];
    for (const r of config) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act || (act.type || "maand") !== type) continue;
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
        key: dubbelKey, acc, actSleutel: act.sleutel, act, eff, done, total, gereed,
        klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "", klantgroep: klant?.groepsnaam || "",
      });
    }
    return rijen.sort((a, b) => (a.gereed - b.gereed) || String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
  }, [config, activiteitById, klantenMap, klantDeelstappen, status, type, maand, mijnLc]);

  const zichtbaar = verberg ? items.filter((i) => !i.gereed) : items;
  const openN = items.filter((i) => !i.gereed).length;
  const klaarN = items.length - openN;

  const toggle = (key) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const afvink = async (acc, actSleutel, deelSleutel, gereed) => {
    setFout("");
    const key = `${acc}|${actSleutel}|${deelSleutel}`;
    setBezig(key);
    const vorige = status;
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
    } catch (e) { setStatus(vorige); setFout(e.message || "Aftekenen mislukt."); } finally { setBezig(""); }
  };

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };

  const laden = config === null || !naamGeladen;

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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 12px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}><strong style={{ color: KLEUR.tekst }}>{openN}</strong> openstaand · {klaarN} gereed</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: KLEUR.subtekst, marginLeft: "auto" }}>
          <input type="checkbox" checked={verberg} onChange={(e) => setVerberg(e.target.checked)} /> Afgeronde verbergen
        </label>
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>{fout}</div>}

      {laden ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Laden…</div>
      ) : !mijnNaam ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Je naam kon niet worden bepaald, dus je toegewezen werk kan niet worden getoond. Log opnieuw in of neem contact op met beheer.</div>
      ) : zichtbaar.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>{items.length === 0 ? "Er is voor deze periode niets aan jou toegewezen." : "Alles afgerond voor deze periode. 🎉"}</div>
      ) : (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          {zichtbaar.map((it) => {
            const uit = open.has(it.key);
            return (
              <div key={it.key} style={{ borderBottom: `1px solid ${KLEUR.rand}` }}>
                <button onClick={() => toggle(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 12px", cursor: "pointer" }}>
                  <ChevronRight size={15} style={{ transform: uit ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} color={KLEUR.mutedTekst} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{it.act.label}</span>
                    <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}> · {it.klantnaam}{it.klantnummer ? ` (${it.klantnummer})` : ""}</span>
                  </span>
                  {it.gereed ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: KLEUR.groenBg, color: KLEUR.groen, borderRadius: 20, padding: "2px 9px", fontSize: 11.5, fontWeight: 700 }}><CheckCircle2 size={13} /> Gereed</span>
                  ) : (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 20, padding: "2px 9px" }}>{it.total ? `${it.done}/${it.total}` : "aftekenen"}</span>
                  )}
                </button>
                {uit && (
                  <div style={{ background: "#FbFcFb", padding: "2px 12px 10px 34px", borderTop: `1px solid ${KLEUR.rand}55` }}>
                    {(it.total === 0 ? [{ sleutel: "__hoofd__", label: `${it.act.label} afgewikkeld` }] : it.eff).map((d) => {
                      const s = stFor(it.acc, it.actSleutel, d.sleutel);
                      const gereed = !!s?.gereed;
                      const key = `${it.acc}|${it.actSleutel}|${d.sleutel}`;
                      return (
                        <div key={d.sleutel} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderBottom: `1px solid ${KLEUR.rand}55` }}>
                          <button disabled={bezig === key} onClick={() => afvink(it.acc, it.actSleutel, d.sleutel, !gereed)} style={{ background: "none", border: "none", cursor: bezig === key ? "default" : "pointer", color: gereed ? KLEUR.groen : KLEUR.mutedTekst, padding: 0, display: "inline-flex" }}>
                            {gereed ? <CheckSquare size={19} /> : <Square size={19} />}
                          </button>
                          <span style={{ flex: 1, fontSize: 13, color: KLEUR.tekst, fontWeight: gereed ? 600 : 400 }}>{d.label}</span>
                          {gereed && <span style={{ fontSize: 11, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>{s?.wie || ""}{s?.datum ? ` · ${datumKort(s.datum)}` : ""}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, lineHeight: 1.5 }}>
        Dit zijn de hoofdactiviteiten die deze periode aan jou zijn toegewezen. Vink de deelstappen af; alle stappen af → de activiteit is <span style={{ color: KLEUR.groen, fontWeight: 700 }}>gereed</span>.
      </div>
    </div>
  );
}
