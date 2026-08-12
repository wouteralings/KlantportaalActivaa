/**
 * Planning — Deelactiviteiten / afwikkeling (medewerkersportaal).
 *
 * Overzicht: rijen = KLANTEN, kolommen = HOOFDACTIVITEITEN (van het gekozen type maand/jaar in de
 * gekozen periode). Klik op een cel (hoofdactiviteit van een klant) → je tekent de DEELSTAPPEN af
 * (met wie + datum). Zijn alle deelstappen van die hoofdactiviteit af, dan wordt de cel GROEN.
 * Zijn ALLE hoofdactiviteiten van een klant groen, dan verhuist de klant naar het tabblad
 * "Afgewikkeld". Filter bovenin op medewerker/klant/klantgroep, team (afdeling) en hoofdactiviteit.
 *
 * Deelstappen-sjabloon komt uit Beheer → Planning; per klant aanpasbaar (⚙ in de aftekenpopup).
 * Status + per-klant-aanpassingen via /api/mw-planning-deelactiviteiten.
 */
import { useState, useEffect, useMemo } from "react";
import { ListChecks, ChevronLeft, ChevronRight, Search, CheckSquare, Square, Settings2, Plus, Trash2, X, RotateCcw, CheckCircle2, User, Users, Building2 } from "lucide-react";
import { useMijnNaam } from "../MijnFilter";
import { Paginatie, pagineer, getoondAantal } from "./PlanningUI";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", groenBg: "#E7F3EB", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
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
  const [tab, setTab] = useState("openstaand"); // openstaand | afgewikkeld
  const [zoek, setZoek] = useState("");
  const [teamFilter, setTeamFilter] = useState("alle");
  const [activiteitFilter, setActiviteitFilter] = useState("alle"); // welke hoofdactiviteit-kolommen

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [status, setStatus] = useState({});           // { "acc|act|deel": { gereed, wie, datum } }
  const [klantDeelstappen, setKlantDeelstappen] = useState({}); // { "acc|act": [ {sleutel,label} ] }
  const [fout, setFout] = useState("");
  const [openCel, setOpenCel] = useState(null);       // { acc, actSleutel } → aftekenpopup
  const { mijnNaam } = useMijnNaam();
  const [scope, setScope] = useState("kantoor"); // mijzelf | team | kantoor — welke uitvoerders tonen
  const [teamNamen, setTeamNamen] = useState(() => new Set()); // "mijn team" (uit de capaciteits-scope)
  const [toon, setToon] = useState(25); // paginagrootte

  const periode = type === "maand" ? `${jaar}-${pad(maand)}` : `${jaar}`;
  const mijnLc = String(mijnNaam || "").trim().toLowerCase();
  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);

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

  // "Mijn team" = de medewerkers uit de capaciteits-scope (jouw leidinggevende-team + jezelf) — voor de
  // scope-knop. Alleen zichtbaar op dit Planning-scherm (planning-recht), dus deze fetch mag hier.
  useEffect(() => {
    const q = type === "maand" ? `maand=${jaar}-${pad(maand)}` : `jaar=${jaar}`;
    fetch(`/api/mw-planning-capaciteit?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTeamNamen(new Set((d.medewerkers || []).map((m) => String(m.naam || "").trim().toLowerCase()).filter(Boolean))))
      .catch(() => setTeamNamen(new Set()));
  }, [type, jaar, maand]);

  const maandActs = useMemo(() => activiteiten.filter((a) => (a.type || "maand") === "maand" && a.actief !== false), [activiteiten]);
  const jaarActs = useMemo(() => activiteiten.filter((a) => (a.type || "maand") === "jaar" && a.actief !== false), [activiteiten]);
  // Kiest de gebruiker een activiteit van het andere type, dan schakelen we automatisch mee.
  const kiesActiviteitFilter = (v) => { setActiviteitFilter(v); if (v !== "alle") { const t = activiteitById[v]?.type; if (t && t !== type) setType(t); } };
  // Bij handmatig wisselen van maand/jaar: een niet-passende activiteitfilter terug op "alle".
  useEffect(() => {
    if (activiteitFilter !== "alle" && activiteitById[activiteitFilter] && (activiteitById[activiteitFilter].type || "maand") !== type) setActiviteitFilter("alle");
    /* eslint-disable-next-line */
  }, [type]);

  const teams = useMemo(() => [...new Set(Object.values(klantenMap).map((k) => k.team).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")), [klantenMap]);

  const effDeelstappen = (acc, actSleutel) => {
    const ov = klantDeelstappen[`${acc}|${actSleutel}`];
    return Array.isArray(ov) && ov.length ? ov : (activiteitById[actSleutel]?.deelstappen || []);
  };
  const stGereed = (acc, actSleutel, deelSleutel) => !!status[`${acc}|${actSleutel}|${deelSleutel}`]?.gereed;

  // Per klant: welke hoofdactiviteiten (van dit type, deze periode) + hun voortgang/afronding.
  const perKlant = useMemo(() => {
    if (!config) return [];
    const map = new Map();
    for (const r of config) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act) continue;
      // Per maand: ALLES wat déze maand afmoet (maandelijks/kwartaal in de maand; jaar-/eenmalige taken
      // in hun uitvoermaand) — ongeacht het activiteit-type, zodat je ook een jaartaak die deze maand
      // valt hier kunt aftekenen. Per jaar: de jaar-activiteiten (het jaaroverzicht).
      if (type === "maand") { if (!valtInMaand(r, maand)) continue; }
      else if ((act.type || "maand") !== "jaar") continue;
      const acc = String(r.klantAccountId || "").toLowerCase();
      if (!map.has(acc)) map.set(acc, { acc, acts: new Map(), uitvoerders: new Set() });
      const e = map.get(acc);
      if (!e.acts.has(act.sleutel)) e.acts.set(act.sleutel, act);
      const wie = (r.toegewezenAan || "").trim() || teamPersoon(klantenMap[acc], act.rol);
      if (wie) e.uitvoerders.add(wie);
    }
    const rijen = [];
    for (const e of map.values()) {
      const klant = klantenMap[e.acc] || null;
      const perAct = {};
      let alles = true;
      for (const act of e.acts.values()) {
        const eff = effDeelstappen(e.acc, act.sleutel);
        let done = 0, total = eff.length, gereed;
        if (total) { done = eff.filter((d) => stGereed(e.acc, act.sleutel, d.sleutel)).length; gereed = done === total; }
        else { gereed = stGereed(e.acc, act.sleutel, "__hoofd__"); }
        if (!gereed) alles = false;
        perAct[act.sleutel] = { act, eff, done, total, gereed };
      }
      rijen.push({
        acc: e.acc, klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "",
        klantgroep: klant?.groepsnaam || "", team: klant?.team || "", uitvoerders: [...e.uitvoerders],
        perAct, afgewikkeld: alles && Object.keys(perAct).length > 0,
      });
    }
    return rijen;
  }, [config, activiteitById, klantenMap, klantDeelstappen, status, type, maand]);

  const kolommen = useMemo(() => {
    const set = new Map();
    for (const row of perKlant) for (const s of Object.keys(row.perAct)) if (!set.has(s)) set.set(s, activiteitById[s]);
    let cols = [...set.values()].filter(Boolean);
    if (activiteitFilter !== "alle") cols = cols.filter((a) => a.sleutel === activiteitFilter);
    const order = new Map(activiteiten.map((a, i) => [a.sleutel, i]));
    return cols.sort((a, b) => (order.get(a.sleutel) ?? 999) - (order.get(b.sleutel) ?? 999));
  }, [perKlant, activiteitFilter, activiteiten, activiteitById]);

  const gefilterd = useMemo(() => {
    const zl = zoek.trim().toLowerCase();
    return perKlant.filter((row) => {
      if (teamFilter !== "alle" && row.team !== teamFilter) return false;
      if (activiteitFilter !== "alle" && !row.perAct[activiteitFilter]) return false;
      if (scope !== "kantoor") {
        const namen = row.uitvoerders.map((n) => String(n).trim().toLowerCase());
        if (scope === "mijzelf" && (!mijnLc || !namen.includes(mijnLc))) return false;
        if (scope === "team" && !namen.some((n) => teamNamen.has(n))) return false;
      }
      if (zl) { const hooi = `${row.klantnummer} ${row.klantnaam} ${row.klantgroep} ${row.uitvoerders.join(" ")}`.toLowerCase(); if (!hooi.includes(zl)) return false; }
      return true;
    });
  }, [perKlant, teamFilter, activiteitFilter, zoek, scope, mijnLc, teamNamen]);

  const openstaand = gefilterd.filter((r) => !r.afgewikkeld);
  const afgewikkeld = gefilterd.filter((r) => r.afgewikkeld);
  const zichtbaar = tab === "afgewikkeld" ? afgewikkeld : openstaand;

  const afvink = async (acc, actSleutel, deelSleutel, gereed) => {
    setFout("");
    const key = `${acc}|${actSleutel}|${deelSleutel}`;
    const vorige = status;
    setStatus((p) => { const n = { ...p }; if (gereed) n[key] = { gereed: true, wie: "(jij)", datum: new Date().toISOString() }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "afvink", accountId: acc, activiteit: actSleutel, periode, deelstap: deelSleutel, gereed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const d = await res.json().catch(() => ({}));
      setStatus((p) => { const n = { ...p }; if (gereed && d.status) n[key] = d.status; else if (!gereed) delete n[key]; return n; });
    } catch (e) { setStatus(vorige); setFout(e.message || "Afvinken mislukt."); }
  };

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };

  const cel = (row, act) => {
    const p = row.perAct[act.sleutel];
    if (!p) return <span style={{ color: KLEUR.rand }}>·</span>;
    if (p.gereed) {
      return <button onClick={() => setOpenCel({ acc: row.acc, actSleutel: act.sleutel })} title="Gereed — klik om te bekijken/wijzigen" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: KLEUR.groenBg, border: `1px solid ${KLEUR.groen}55`, color: KLEUR.groen, borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}><CheckCircle2 size={13} /> Gereed</button>;
    }
    return <button onClick={() => setOpenCel({ acc: row.acc, actSleutel: act.sleutel })} title="Klik om deelstappen af te tekenen" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${KLEUR.rand}`, color: KLEUR.subtekst, borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{p.total ? `${p.done}/${p.total}` : "aftekenen"}</button>;
  };

  const laden = config === null;
  const celRow = openCel ? perKlant.find((r) => r.acc === openCel.acc) : null;
  const celAct = openCel ? activiteitById[openCel.actSleutel] : null;

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <ListChecks size={17} color={KLEUR.blauw} /> Afwikkeling
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: type === "maand" ? 150 : 60, textAlign: "center" }}>{type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : jaar}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
        {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
          <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "8px 0 12px" }}>
        <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${KLEUR.rand}` }}>
          {[["mijzelf", "Mijzelf", User], ["team", "Mijn team", Users], ["kantoor", "Kantoorbreed", Building2]].map(([val, label, Icon], i) => (
            <button key={val} onClick={() => setScope(val)} title={val === "team" ? "Werk van jouw team (leidinggevende-scope)" : val === "mijzelf" ? "Alleen aan jou toegewezen werk" : "Iedereen (kantoorbreed)"} style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "none", borderLeft: i ? `1px solid ${KLEUR.rand}` : "none",
              background: scope === val ? KLEUR.blauw : "#fff", color: scope === val ? "#fff" : KLEUR.subtekst,
            }}><Icon size={13} /> {label}</button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "3px 8px", background: "#fff" }}>
          <Search size={13} color={KLEUR.mutedTekst} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker, klant of groep…" style={{ border: "none", outline: "none", fontSize: 12, width: 190 }} />
        </label>
        {teams.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: KLEUR.subtekst }}>Afdeling:
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "4px 8px", fontSize: 12, background: "#fff" }}>
              <option value="alle">alle</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: KLEUR.subtekst }}>Hoofdactiviteit:
          <select value={activiteitFilter} onChange={(e) => kiesActiviteitFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "4px 8px", fontSize: 12, background: "#fff", minWidth: 180 }}>
            <option value="alle">alle activiteiten</option>
            <optgroup label="Maandactiviteiten">{maandActs.map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}</optgroup>
            <optgroup label="Jaaractiviteiten">{jaarActs.map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}</optgroup>
          </select>
        </label>
      </div>

      {/* Tabs Openstaand / Afgewikkeld */}
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${KLEUR.rand}`, marginBottom: 12 }}>
        {[["openstaand", "Openstaand", openstaand.length], ["afgewikkeld", "Afgewikkeld", afgewikkeld.length]].map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: tab === k ? KLEUR.blauw : KLEUR.subtekst, borderBottom: tab === k ? `2px solid ${KLEUR.blauw}` : "2px solid transparent", marginBottom: -1 }}>{label} ({n})</button>
        ))}
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>{fout}</div>}

      {laden ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Laden…</div>
      ) : kolommen.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Geen {type}activiteiten in de planning voor deze periode.</div>
      ) : (
        <>
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr>
              <th style={{ ...th, position: "sticky", left: 0, background: "#fff", zIndex: 1, minWidth: 210, boxShadow: `1px 0 0 ${KLEUR.rand}` }}>Klant</th>
              {kolommen.map((a) => <th key={a.sleutel} style={{ ...th, minWidth: 96 }}>{a.label}</th>)}
            </tr></thead>
            <tbody>
              {pagineer(zichtbaar, toon).map((row) => (
                <tr key={row.acc}>
                  <td style={{ ...td, position: "sticky", left: 0, background: "#fff", zIndex: 1, boxShadow: `1px 0 0 ${KLEUR.rand}` }}>
                    <div style={{ fontWeight: 600 }}>{row.klantnummer}{row.afgewikkeld && <CheckCircle2 size={13} color={KLEUR.groen} style={{ marginLeft: 6, verticalAlign: "middle" }} />}</div>
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{row.klantnaam}{row.klantgroep ? ` · ${row.klantgroep}` : ""}{row.team ? ` · ${row.team}` : ""}</div>
                  </td>
                  {kolommen.map((a) => <td key={a.sleutel} style={td}>{cel(row, a)}</td>)}
                </tr>
              ))}
              {zichtbaar.length === 0 && <tr><td colSpan={kolommen.length + 1} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 22 }}>{tab === "afgewikkeld" ? "Nog geen volledig afgewikkelde klanten in deze periode." : "Geen openstaande klanten (met deze filter)."}</td></tr>}
            </tbody>
          </table>
        </div>
        {zichtbaar.length > 0 && <Paginatie totaal={zichtbaar.length} getoond={getoondAantal(zichtbaar.length, toon)} grootte={toon} setGrootte={setToon} eenheid="klanten" />}
        </>
      )}

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, lineHeight: 1.5 }}>
        Klik een cel om de deelstappen van die hoofdactiviteit af te tekenen (met wie/datum). Alle deelstappen af → cel <span style={{ color: KLEUR.groen, fontWeight: 700 }}>groen</span>. Alle hoofdactiviteiten van een klant groen → de klant staat onder <strong>Afgewikkeld</strong>.
      </div>

      {openCel && celRow && celAct && (
        <AftekenPopup
          acc={openCel.acc} klantnaam={celRow.klantnaam} activiteit={celAct}
          eff={effDeelstappen(openCel.acc, openCel.actSleutel)}
          status={status}
          onAfvink={(deelSleutel, gereed) => afvink(openCel.acc, openCel.actSleutel, deelSleutel, gereed)}
          heeftOverride={Array.isArray(klantDeelstappen[`${openCel.acc}|${openCel.actSleutel}`])}
          onStappenOpgeslagen={(lijst) => { setKlantDeelstappen((p) => { const n = { ...p }; const key = `${openCel.acc}|${openCel.actSleutel}`; if (lijst && lijst.length) n[key] = lijst; else delete n[key]; return n; }); }}
          onSluit={() => setOpenCel(null)}
        />
      )}
    </div>
  );
}

// ── Aftekenpopup: de deelstappen van één (klant × hoofdactiviteit) aftekenen ──
function AftekenPopup({ acc, klantnaam, activiteit, eff, status, onAfvink, heeftOverride, onStappenOpgeslagen, onSluit }) {
  const [stappenBewerken, setStappenBewerken] = useState(false);
  const stFor = (deelSleutel) => status[`${acc}|${activiteit.sleutel}|${deelSleutel}`] || null;
  const rij = (sleutel, label) => {
    const s = stFor(sleutel);
    const gereed = !!s?.gereed;
    return (
      <div key={sleutel} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 4px", borderBottom: `1px solid ${KLEUR.rand}55` }}>
        <button onClick={() => onAfvink(sleutel, !gereed)} style={{ background: "none", border: "none", cursor: "pointer", color: gereed ? KLEUR.groen : KLEUR.mutedTekst, padding: 0, display: "inline-flex" }}>
          {gereed ? <CheckSquare size={19} /> : <Square size={19} />}
        </button>
        <span style={{ flex: 1, fontSize: 13, color: KLEUR.tekst, fontWeight: gereed ? 600 : 400 }}>{label}</span>
        {gereed && <span style={{ fontSize: 11, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>{s?.wie || ""}{s?.datum ? ` · ${datumKort(s.datum)}` : ""}</span>}
      </div>
    );
  };
  const alle = eff.length > 0 && eff.every((d) => stFor(d.sleutel)?.gereed);

  return (
    <div onClick={onSluit} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{activiteit.label}</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{klantnaam}</div>
          </div>
          <button onClick={onSluit} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst }}><X size={18} /></button>
        </div>

        {alle && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: KLEUR.groenBg, color: KLEUR.groen, borderRadius: 20, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, margin: "6px 0 4px" }}><CheckCircle2 size={13} /> Alle deelstappen afgewikkeld</div>}

        <div style={{ margin: "10px 0" }}>
          {eff.length === 0 ? (
            <div>
              <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 8 }}>Deze hoofdactiviteit heeft geen deelstappen. Teken hem hieronder als geheel af.</div>
              {rij("__hoofd__", `${activiteit.label} afgewikkeld`)}
            </div>
          ) : eff.map((d) => rij(d.sleutel, d.label))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => setStappenBewerken(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Settings2 size={14} /> Deelstappen aanpassen</button>
          <button onClick={onSluit} style={{ padding: "8px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Klaar</button>
        </div>

        {stappenBewerken && (
          <DeelstappenEditor
            acc={acc} klantnaam={klantnaam} activiteit={activiteit} huidige={eff} heeftOverride={heeftOverride}
            onSluit={() => setStappenBewerken(false)}
            onOpgeslagen={(lijst) => { onStappenOpgeslagen(lijst); setStappenBewerken(false); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Modal: deelstappen van één klant aanpassen (override op het sjabloon) ─────
function DeelstappenEditor({ acc, klantnaam, activiteit, huidige, heeftOverride, onSluit, onOpgeslagen }) {
  const [stappen, setStappen] = useState(() => (huidige || []).map((d) => ({ ...d })));
  const [nieuw, setNieuw] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const inputStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: "#fff" };

  const bewaar = async (lijst) => {
    setBezig(true); setFout("");
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "klantstappen", accountId: acc, activiteit: activiteit.sleutel, deelstappen: lijst }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const d = await res.json().catch(() => ({}));
      onOpgeslagen(d.deelstappen || lijst);
    } catch (e) { setFout(e.message || "Opslaan mislukt."); setBezig(false); }
  };

  return (
    <div onClick={onSluit} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Deelstappen aanpassen</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{klantnaam} · {activiteit.label}</div>
          </div>
          <button onClick={onSluit} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, margin: "8px 0 12px" }}>Standaard gelden de stappen uit Beheer. Pas je ze hier aan, dan geldt jouw lijst alleen voor déze klant.</div>
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
