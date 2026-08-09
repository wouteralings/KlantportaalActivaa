/**
 * Planning — Deelactiviteiten (Stap: deelstappen afwikkelen vóór de hoofdactiviteit).
 *
 * Per HOOFDACTIVITEIT (keuze bovenin): de klanten die die activiteit in hun configuratie hebben,
 * met de deelstappen als KOLOMMEN. Elke cel is afvinkbaar (gereed/niet) en legt vast WIE en WANNEER.
 * De hoofdactiviteit kan pas op "gereed" als alle deelstappen van die klant gereed zijn.
 *
 * Apart overzicht per MAAND en per JAAR (maandactiviteiten vs. jaaractiviteiten). Filter bovenin op
 * medewerker, klant, klantgroep, team (afdeling) en de soort hoofdactiviteit.
 *
 * Deelstappen-sjabloon komt uit Beheer → Planning (per activiteit); per klant aan te passen
 * (⚙ per rij). Status + per-klant-aanpassingen via /api/mw-planning-deelactiviteiten.
 */
import { useState, useEffect, useMemo } from "react";
import { ListChecks, ChevronLeft, ChevronRight, Search, CheckSquare, Square, Settings2, Plus, Trash2, X, RotateCcw } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "7px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const pad = (n) => String(n).padStart(2, "0");

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
const datumKort = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL"); };

export default function Deelactiviteiten() {
  const nu = new Date();
  const [type, setType] = useState("maand"); // maand | jaar
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);
  const [activiteitSleutel, setActiviteitSleutel] = useState("");
  const [zoek, setZoek] = useState("");
  const [teamFilter, setTeamFilter] = useState("alle");

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [status, setStatus] = useState({});           // { "acc|act|deel": { gereed, wie, datum } }
  const [klantDeelstappen, setKlantDeelstappen] = useState({}); // { "acc|act": [ {sleutel,label} ] }
  const [fout, setFout] = useState("");
  const [bewerkKlant, setBewerkKlant] = useState(null); // { accountId, klantnaam } waarvan we de stappen aanpassen

  const periode = type === "maand" ? `${jaar}-${pad(maand)}` : `${jaar}`;

  useEffect(() => {
    fetch("/api/mw-planning-config").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setConfig(d.config || [])).catch(() => { setConfig([]); setFout("Configuratie kon niet worden geladen."); });
    fetch("/api/mw-planning-overzicht").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setActiviteiten(d.activiteiten || [])).catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten?alle=1").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const b = {}; (d.klanten || []).forEach((k) => { b[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(b); }).catch(() => setKlantenMap({}));
  }, []);

  const laadStatus = () => {
    fetch(`/api/mw-planning-deelactiviteiten?periode=${periode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setStatus(d.status || {}); setKlantDeelstappen(d.klantDeelstappen || {}); })
      .catch(() => { setStatus({}); setKlantDeelstappen({}); });
  };
  useEffect(() => { laadStatus(); /* eslint-disable-next-line */ }, [periode]);

  const activiteitenVanType = useMemo(() => activiteiten.filter((a) => (a.type || "maand") === type), [activiteiten, type]);
  // Zorg dat er altijd een geldige activiteit gekozen is voor het huidige type.
  useEffect(() => {
    if (!activiteitenVanType.length) { if (activiteitSleutel) setActiviteitSleutel(""); return; }
    if (!activiteitenVanType.some((a) => a.sleutel === activiteitSleutel)) setActiviteitSleutel(activiteitenVanType[0].sleutel);
    /* eslint-disable-next-line */
  }, [activiteitenVanType]);

  const activiteit = useMemo(() => activiteiten.find((a) => a.sleutel === activiteitSleutel) || null, [activiteiten, activiteitSleutel]);

  const teams = useMemo(() => [...new Set(Object.values(klantenMap).map((k) => k.team).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")), [klantenMap]);

  // Effectieve deelstappen van een klant voor deze activiteit: per-klant override, anders het sjabloon.
  const effDeelstappen = (accountId) => {
    const ov = klantDeelstappen[`${accountId}|${activiteitSleutel}`];
    return Array.isArray(ov) && ov.length ? ov : (activiteit?.deelstappen || []);
  };

  const rijen = useMemo(() => {
    if (!config || !activiteit) return [];
    const zl = zoek.trim().toLowerCase();
    const uit = [];
    for (const r of config) {
      if (r.actief === false || r.activiteit !== activiteitSleutel) continue;
      if (type === "maand" && !valtInMaand(r, maand)) continue;
      const acc = String(r.klantAccountId || "").toLowerCase();
      const klant = klantenMap[acc] || null;
      if (teamFilter !== "alle" && (klant?.team || "") !== teamFilter) continue;
      const wie = (r.toegewezenAan || "").trim() || teamPersoon(klant, activiteit.rol) || "— niet toegewezen";
      if (zl) {
        const hooi = `${klant?.klantnummer || ""} ${klant?.klantnaam || ""} ${klant?.groepsnaam || ""} ${wie}`.toLowerCase();
        if (!hooi.includes(zl)) continue;
      }
      uit.push({
        accountId: acc, regelId: r.id,
        klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "",
        klantgroep: klant?.groepsnaam || "", team: klant?.team || "", wie,
        eff: effDeelstappen(acc),
      });
    }
    // ontdubbelen op klant (een klant kan de activiteit maar één keer in config hebben, maar voor de zekerheid)
    const gezien = new Set();
    return uit.filter((x) => (gezien.has(x.accountId) ? false : (gezien.add(x.accountId), true)))
      .sort((a, b) => String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
  }, [config, activiteit, activiteitSleutel, klantenMap, klantDeelstappen, type, maand, teamFilter, zoek]);

  // Kolommen = sjabloon-stappen + eventuele per-klant-extra's die in beeld zijn (in volgorde).
  const kolommen = useMemo(() => {
    const m = new Map();
    for (const d of activiteit?.deelstappen || []) if (!m.has(d.sleutel)) m.set(d.sleutel, d.label);
    for (const rij of rijen) for (const d of rij.eff) if (!m.has(d.sleutel)) m.set(d.sleutel, d.label);
    return [...m.entries()].map(([sleutel, label]) => ({ sleutel, label }));
  }, [activiteit, rijen]);

  const st = (accountId, deelSleutel) => status[`${accountId}|${activiteitSleutel}|${deelSleutel}`] || null;
  const alleGereed = (rij) => rij.eff.length > 0 && rij.eff.every((d) => st(rij.accountId, d.sleutel)?.gereed);

  const afvink = async (accountId, deelSleutel, gereed) => {
    setFout("");
    const key = `${accountId}|${activiteitSleutel}|${deelSleutel}`;
    const vorige = status;
    setStatus((p) => { const n = { ...p }; if (gereed) n[key] = { gereed: true, wie: "(jij)", datum: new Date().toISOString() }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "afvink", accountId, activiteit: activiteitSleutel, periode, deelstap: deelSleutel, gereed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const d = await res.json().catch(() => ({}));
      setStatus((p) => { const n = { ...p }; if (gereed && d.status) n[key] = d.status; else if (!gereed) delete n[key]; return n; });
    } catch (e) { setStatus(vorige); setFout(e.message || "Afvinken mislukt."); }
  };

  const vinkje = (accountId, deelSleutel, heeftStap, aan_of_uit_toestaan = true) => {
    if (!heeftStap) return <span style={{ color: KLEUR.rand }}>n.v.t.</span>;
    const s = st(accountId, deelSleutel);
    const gereed = !!s?.gereed;
    return (
      <button onClick={() => aan_of_uit_toestaan && afvink(accountId, deelSleutel, !gereed)} disabled={!aan_of_uit_toestaan}
        title={gereed ? `Gereed${s?.wie ? ` door ${s.wie}` : ""}${s?.datum ? ` op ${datumKort(s.datum)}` : ""}` : (aan_of_uit_toestaan ? "Markeer als gereed" : "Eerst alle deelstappen afwikkelen")}
        style={{ background: "none", border: "none", cursor: aan_of_uit_toestaan ? "pointer" : "not-allowed", padding: 2, display: "inline-flex", alignItems: "center", gap: 5, color: gereed ? KLEUR.groen : KLEUR.mutedTekst, opacity: aan_of_uit_toestaan ? 1 : 0.4 }}>
        {gereed ? <CheckSquare size={17} /> : <Square size={17} />}
        {gereed && s?.wie ? <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst }}>{s.wie}{s.datum ? ` · ${datumKort(s.datum)}` : ""}</span> : null}
      </button>
    );
  };

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };

  const laden = config === null;

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <ListChecks size={17} color={KLEUR.blauw} /> Deelactiviteiten
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: type === "maand" ? 150 : 60, textAlign: "center" }}>{type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : jaar}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Type-schakelaar + hoofdactiviteit + filters */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
        {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
          <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "8px 0 14px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: KLEUR.subtekst }}>
          Hoofdactiviteit:
          <select value={activiteitSleutel} onChange={(e) => setActiviteitSleutel(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "5px 8px", fontSize: 12.5, background: "#fff", minWidth: 200 }}>
            {activiteitenVanType.length === 0 && <option value="">— geen {type}activiteiten —</option>}
            {activiteitenVanType.map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "3px 8px", background: "#fff" }}>
          <Search size={13} color={KLEUR.mutedTekst} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker, klant of groep…" style={{ border: "none", outline: "none", fontSize: 12, width: 200 }} />
        </label>
        {teams.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: KLEUR.subtekst }}>
            Afdeling (team):
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "4px 8px", fontSize: 12, background: "#fff" }}>
              <option value="alle">alle</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>{fout}</div>}

      {laden ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Laden…</div>
      ) : !activiteit ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Geen {type}activiteiten. Voeg ze toe in Beheer → Planning.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr>
              <th style={{ ...th, position: "sticky", left: 0, background: "#fff", zIndex: 1, minWidth: 190, boxShadow: `1px 0 0 ${KLEUR.rand}` }}>Klant</th>
              <th style={th}>Uitvoerder</th>
              {kolommen.map((k) => <th key={k.sleutel} style={{ ...th, minWidth: 110 }}>{k.label}</th>)}
              <th style={{ ...th, minWidth: 120 }}>Hoofd gereed</th>
              <th style={{ ...th, width: 34 }}></th>
            </tr></thead>
            <tbody>
              {rijen.map((rij) => {
                const heeftStap = new Set(rij.eff.map((d) => d.sleutel));
                const klaar = alleGereed(rij);
                const hoofd = st(rij.accountId, "__hoofd__");
                return (
                  <tr key={rij.accountId}>
                    <td style={{ ...td, position: "sticky", left: 0, background: "#fff", zIndex: 1, boxShadow: `1px 0 0 ${KLEUR.rand}` }}>
                      <div style={{ fontWeight: 600 }}>{rij.klantnummer}</div>
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{rij.klantnaam}{rij.klantgroep ? ` · ${rij.klantgroep}` : ""}{rij.team ? ` · ${rij.team}` : ""}</div>
                    </td>
                    <td style={td}>{rij.wie}</td>
                    {kolommen.map((k) => <td key={k.sleutel} style={{ ...td, textAlign: "left" }}>{vinkje(rij.accountId, k.sleutel, heeftStap.has(k.sleutel))}</td>)}
                    <td style={td}>{vinkje(rij.accountId, "__hoofd__", true, klaar || !!hoofd?.gereed)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button onClick={() => setBewerkKlant({ accountId: rij.accountId, klantnaam: rij.klantnaam })} title="Deelstappen voor deze klant aanpassen" style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2 }}><Settings2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
              {rijen.length === 0 && <tr><td colSpan={kolommen.length + 4} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 22 }}>Geen klanten met "{activiteit.label}" in deze {type === "maand" ? "maand" : "periode"}{zoek || teamFilter !== "alle" ? " (met deze filter)" : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, lineHeight: 1.5 }}>
        Elke deelstap moet af (met wie/datum) voordat "Hoofd gereed" aangevinkt kan worden. Deelstappen komen uit Beheer → Planning; per klant aanpasbaar via het ⚙-icoon.
      </div>

      {bewerkKlant && (
        <DeelstappenEditor
          klant={bewerkKlant} activiteit={activiteit}
          huidige={effDeelstappen(bewerkKlant.accountId)}
          heeftOverride={Array.isArray(klantDeelstappen[`${bewerkKlant.accountId}|${activiteitSleutel}`])}
          onSluit={() => setBewerkKlant(null)}
          onOpgeslagen={(lijst) => {
            setKlantDeelstappen((p) => { const n = { ...p }; const key = `${bewerkKlant.accountId}|${activiteitSleutel}`; if (lijst && lijst.length) n[key] = lijst; else delete n[key]; return n; });
            setBewerkKlant(null);
          }}
        />
      )}
    </div>
  );
}

// ── Modal: deelstappen van één klant aanpassen (override op het sjabloon) ─────
function DeelstappenEditor({ klant, activiteit, huidige, heeftOverride, onSluit, onOpgeslagen }) {
  const [stappen, setStappen] = useState(() => (huidige || []).map((d) => ({ ...d })));
  const [nieuw, setNieuw] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const bewaar = async (lijst) => {
    setBezig(true); setFout("");
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "klantstappen", accountId: klant.accountId, activiteit: activiteit.sleutel, deelstappen: lijst }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const d = await res.json().catch(() => ({}));
      onOpgeslagen(d.deelstappen || lijst);
    } catch (e) { setFout(e.message || "Opslaan mislukt."); setBezig(false); }
  };

  const inputStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: "#fff" };

  return (
    <div onClick={onSluit} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Deelstappen aanpassen</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{klant.klantnaam} · {activiteit.label}</div>
          </div>
          <button onClick={onSluit} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, margin: "8px 0 12px" }}>
          Standaard gelden de stappen uit Beheer. Pas je ze hier aan, dan geldt jouw lijst alleen voor déze klant.
        </div>
        {fout && <div style={{ color: KLEUR.rood, fontSize: 12.5, marginBottom: 10 }}>{fout}</div>}

        {stappen.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: KLEUR.mutedTekst, fontSize: 11, width: 20, textAlign: "right" }}>{i + 1}.</span>
            <input value={d.label} onChange={(e) => setStappen((s) => s.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} style={{ ...inputStijl, flex: 1 }} />
            <button onClick={() => setStappen((s) => s.filter((_, idx) => idx !== i))} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood }}><Trash2 size={15} /></button>
          </div>
        ))}
        {stappen.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "4px 0 8px" }}>Nog geen stappen.</div>}

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = nieuw.trim(); if (t) { setStappen((s) => [...s, { label: t }]); setNieuw(""); } } }} placeholder="Nieuwe deelstap…" style={{ ...inputStijl, flex: 1 }} />
          <button onClick={() => { const t = nieuw.trim(); if (t) { setStappen((s) => [...s, { label: t }]); setNieuw(""); } }} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Plus size={14} /> Toevoegen</button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          {heeftOverride ? (
            <button onClick={() => bewaar([])} disabled={bezig} title="Terug naar het Beheer-sjabloon" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><RotateCcw size={14} /> Herstel naar sjabloon</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onSluit} style={{ padding: "8px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
            <button onClick={() => bewaar(stappen)} disabled={bezig} style={{ padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.7 : 1 }}>{bezig ? "Opslaan…" : "Opslaan"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
