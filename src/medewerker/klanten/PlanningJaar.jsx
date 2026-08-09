/**
 * Planning — jaarplanning.
 *
 * Twee weergaven, om te wisselen bovenaan:
 *  - "Kalender": één jaarraster (klant × 12 maanden) afgeleid uit de per-klant configuratie
 *    (/api/mw-planning-config): maandelijks valt elke maand, kwartaal in jan/apr/jul/okt, jaar-/
 *    eenmalige taken in de ingestelde uitvoermaand. Toont de spreiding van indicatie-uren.
 *  - "Groeperen op Medewerker / Klant / Klantgroep": de losse jaarplanningsregels (de regels met
 *    type "jaar" uit /api/mw-planning-overzicht, die WÉL een status hebben) gegroepeerd in een
 *    uitklapbare, geneste boom — per groep het aantal, de status-verdeling en de totaal-uren, voor
 *    snel inzicht. Bij Medewerker en Klantgroep eerst de klanten (elk uitklapbaar), bij Klant direct
 *    de regels.
 *
 * Indicatie-uren = effectief: de per-klant/per-regel waarde als die gezet is, anders de standaard-uren
 * van de activiteit (Beheer → Planning). Filterbaar op team (A&R/FS) en op klant/medewerker (zoek).
 */
import { useState, useEffect, useMemo } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, AlertTriangle, Search, ClipboardList } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12, padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };
const leafTd = { fontSize: 12, padding: "5px 8px", borderBottom: `1px solid ${KLEUR.rand}55` };

const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WEERGAVEN = [["kalender", "Kalender"], ["medewerker", "Per medewerker"], ["klant", "Per klant"], ["klantgroep", "Per klantgroep"], ["bezetting", "Bezetting"]];

function teamPersoon(klant, rol) {
  if (!klant || !rol) return "";
  switch (rol) {
    case "assistent": return klant.assistent?.naam || "";
    case "manager": return klant.manager?.naam || klant.relatiebeheerder || "";
    case "accountant": return klant.accountantPersoon?.naam || klant.accountant || "";
    case "fiscaal": return klant.fiscaalMedewerker?.naam || "";
    case "loonadministratie": return klant.loonadministratie?.naam || "";
    case "backup": return klant.backup?.naam || "";
    // 'backoffice' heeft geen vaste rol-persoon per klant → handmatig toegewezen.
    default: return "";
  }
}
function urenTekst(n) {
  if (!n) return "—";
  return `${Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} u`;
}
function valtInMaand(r, maand1) {
  if (r.frequentie === "maandelijks") return true;
  if (r.frequentie === "kwartaal") return [1, 4, 7, 10].includes(maand1);
  if (r.frequentie === "jaarlijks" || r.frequentie === "eenmalig") return Number(r.uitvoerMaand) === maand1;
  return false;
}

export default function PlanningJaar() {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [teamFilter, setTeamFilter] = useState("alle");
  const [zoek, setZoek] = useState("");
  const [weergave, setWeergave] = useState("kalender"); // kalender | medewerker | klant | klantgroep

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [regels, setRegels] = useState([]);        // losse planningsregels (met status), uit mw-planning-overzicht
  const [statussen, setStatussen] = useState([]);  // { sleutel, label, kleur, actief }
  const [klantenMap, setKlantenMap] = useState({});
  const [taken, setTaken] = useState([]);          // open taken (met effectieve indicatie-uren), uit mw-taken
  const [capaciteit, setCapaciteit] = useState(null); // { medewerkers: [...] } uit mw-planning-capaciteit?jaar
  const [fout, setFout] = useState("");

  const [openGroep, setOpenGroep] = useState(() => new Set());
  const [openSub, setOpenSub] = useState(() => new Set());
  const [openBez, setOpenBez] = useState(() => new Set());
  const toggleGroep = (k) => setOpenGroep((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleSub = (k) => setOpenSub((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleBez = (k) => setOpenBez((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);
  const statusInfo = useMemo(() => Object.fromEntries((statussen || []).map((s) => [s.sleutel, s])), [statussen]);

  useEffect(() => {
    fetch("/api/mw-planning-config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig(d.config || []))
      .catch((e) => { setConfig([]); setFout(e.message || "Configuratie kon niet worden opgehaald."); });
    fetch("/api/mw-planning-overzicht")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setActiviteiten(d.activiteiten || []); setRegels(d.regels || []); setStatussen(d.statussen || []); })
      .catch(() => { setActiviteiten([]); setRegels([]); setStatussen([]); });
    fetch("/api/beheer-klanten?alle=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { const bij = {}; (d.klanten || []).forEach((k) => { bij[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(bij); })
      .catch(() => setKlantenMap({}));
    // Open taken met hun effectieve indicatie-uren (Beheer → Taken standaard, per taak overschrijfbaar).
    fetch("/api/mw-taken?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTaken(d.taken || []))
      .catch(() => setTaken([]));
  }, []);

  // Beschikbare capaciteit per medewerker voor het gekozen jaar (rooster − goedgekeurd verlof).
  useEffect(() => {
    setCapaciteit(null);
    fetch(`/api/mw-planning-capaciteit?jaar=${jaar}&scope=alle`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCapaciteit(d && Array.isArray(d.medewerkers) ? d : { medewerkers: [] }))
      .catch(() => setCapaciteit({ medewerkers: [] }));
  }, [jaar]);

  const teams = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.team).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")),
    [klantenMap]
  );

  const zoekLaag = zoek.trim().toLowerCase();

  // ── Kalender-weergave: klant × 12 maanden, uit de per-klant configuratie ──
  const { rijen, maandTotalen, jaarTotaal } = useMemo(() => {
    const map = {};
    for (const r of config || []) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act) continue;
      const key = String(r.klantAccountId || "").toLowerCase();
      const klant = klantenMap[key] || null;
      if (teamFilter !== "alle" && (klant?.team || "") !== teamFilter) continue;
      if (zoekLaag) {
        const hooi = `${klant?.klantnummer || ""} ${klant?.klantnaam || ""}`.toLowerCase();
        if (!hooi.includes(zoekLaag)) continue;
      }
      const override = (r.toegewezenAan || "").trim();
      const team = teamPersoon(klant, act.rol);
      const wie = override || team || "— niet toegewezen";
      // Effectieve uren: per-klant override anders de standaard-uren van de activiteit.
      const uren = (r.indicatieUren != null ? Number(r.indicatieUren) : Number(act.standaardUren || 0)) || 0;
      const item = { activiteit: act.label, type: act.type, frequentie: r.frequentie, wie, uren,
        afwijkend: !!override && override.toLowerCase() !== (team || "").toLowerCase() };
      const entry = map[key] || (map[key] = {
        key, klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "",
        team: klant?.team || "", maanden: Array.from({ length: 12 }, () => []), zonderMaand: [], totaal: 0,
      });
      let geplaatst = false;
      for (let m = 1; m <= 12; m++) {
        if (valtInMaand(r, m)) { entry.maanden[m - 1].push(item); entry.totaal += uren; geplaatst = true; }
      }
      if (!geplaatst && (r.frequentie === "jaarlijks" || r.frequentie === "eenmalig") && !r.uitvoerMaand) {
        entry.zonderMaand.push(item);
      }
    }
    const rijen = Object.values(map).sort((a, b) => String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
    const maandTotalen = Array.from({ length: 12 }, (_, m) => rijen.reduce((s, rij) => s + rij.maanden[m].reduce((t, i) => t + i.uren, 0), 0));
    const jaarTotaal = rijen.reduce((s, rij) => s + rij.totaal, 0);
    return { rijen, maandTotalen, jaarTotaal };
  }, [config, activiteitById, klantenMap, teamFilter, zoekLaag]);

  // ── Groeperen-weergave: losse jaarregels (MET status), gegroepeerd + geneste boom ──
  const jaarRegels = useMemo(() => (regels || []).filter((r) => (r.type || "maand") === "jaar"), [regels]);

  const groepData = useMemo(() => {
    if (weergave === "kalender") return { groepen: [], aantal: 0, uren: 0 };
    const items = [];
    for (const r of jaarRegels) {
      const act = activiteitById[r.activiteit] || null;
      const key = String(r.klantAccountId || "").toLowerCase();
      const klant = klantenMap[key] || null;
      if (teamFilter !== "alle" && (klant?.team || "") !== teamFilter) continue;
      const wie = (r.toegewezenAan || "").trim() || (act ? teamPersoon(klant, act.rol) : "") || "— niet toegewezen";
      if (zoekLaag) {
        const hooi = `${klant?.klantnummer || ""} ${klant?.klantnaam || ""} ${wie} ${act?.label || r.activiteit}`.toLowerCase();
        if (!hooi.includes(zoekLaag)) continue;
      }
      const uren = (r.indicatieUren != null ? Number(r.indicatieUren) : Number(act?.standaardUren || 0)) || 0;
      items.push({
        regel: r, act, key,
        klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "",
        klantgroep: klant?.groepsnaam || "— geen groep —",
        wie, uren, statusKey: r.status || "",
      });
    }
    const vatSamen = (lijst) => {
      const telling = {};
      let uren = 0;
      for (const it of lijst) { telling[it.statusKey] = (telling[it.statusKey] || 0) + 1; uren += it.uren; }
      return { aantal: lijst.length, uren, telling };
    };
    const groepeerOp = weergave === "medewerker" ? (i) => i.wie : weergave === "klantgroep" ? (i) => i.klantgroep : (i) => i.klantnaam;
    const heeftSub = weergave !== "klant";

    const top = new Map();
    for (const it of items) {
      const gk = groepeerOp(it) || "—";
      if (!top.has(gk)) top.set(gk, []);
      top.get(gk).push(it);
    }
    const groepen = [...top.entries()].map(([naam, lijst]) => {
      const samenvatting = vatSamen(lijst);
      if (!heeftSub) return { key: naam, naam, ...samenvatting, leaves: lijst.slice().sort((a, b) => String(a.act?.label || a.regel.activiteit).localeCompare(String(b.act?.label || b.regel.activiteit), "nl")) };
      const subMap = new Map();
      for (const it of lijst) {
        const sk = it.key || it.klantnaam;
        if (!subMap.has(sk)) subMap.set(sk, { naam: it.klantnaam, nummer: it.klantnummer, lijst: [] });
        subMap.get(sk).lijst.push(it);
      }
      const subgroepen = [...subMap.entries()].map(([sk, s]) => ({ key: naam + "|" + sk, naam: s.naam, nummer: s.nummer, ...vatSamen(s.lijst), leaves: s.lijst }))
        .sort((a, b) => String(a.naam).localeCompare(String(b.naam), "nl"));
      return { key: naam, naam, ...samenvatting, subgroepen };
    }).sort((a, b) => String(a.naam).localeCompare(String(b.naam), "nl"));

    return { groepen, aantal: items.length, uren: items.reduce((s, i) => s + i.uren, 0) };
  }, [weergave, jaarRegels, activiteitById, klantenMap, teamFilter, zoekLaag]);

  // ── Bezetting: totale werklast (jaarconfig + maandconfig + taken) vs. beschikbare uren, per medewerker ──
  const bezetting = useMemo(() => {
    if (weergave !== "bezetting") return { rijen: [], totaal: { config: 0, taken: 0, beschikbaar: 0 } };
    const perNaam = new Map(); // naam(lc) → { naam, config, taken, takenLijst }
    const bucket = (naam) => {
      const schoon = (naam || "— niet toegewezen").trim() || "— niet toegewezen";
      const lc = schoon.toLowerCase();
      if (!perNaam.has(lc)) perNaam.set(lc, { naam: schoon, config: 0, taken: 0, takenLijst: [] });
      return perNaam.get(lc);
    };
    // 1) De per-klant configuratie (maand- én jaaractiviteiten), op jaarbasis, per uitvoerder.
    for (const r of config || []) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act) continue;
      const klant = klantenMap[String(r.klantAccountId || "").toLowerCase()] || null;
      if (teamFilter !== "alle" && (klant?.team || "") !== teamFilter) continue;
      const override = (r.toegewezenAan || "").trim();
      const wie = override || teamPersoon(klant, act.rol) || "— niet toegewezen";
      const eff = (r.indicatieUren != null ? Number(r.indicatieUren) : Number(act.standaardUren || 0)) || 0;
      let keer = 0;
      for (let m = 1; m <= 12; m++) if (valtInMaand(r, m)) keer++;
      if (keer === 0 && (r.frequentie === "jaarlijks" || r.frequentie === "eenmalig")) keer = 1;
      bucket(wie).config += eff * keer;
    }
    // 2) Open taken met hun effectieve indicatie-uren, per eigenaar.
    for (const t of taken || []) {
      const b = bucket(t.eigenaar || "— niet toegewezen");
      const u = Number(t.uren) || 0;
      b.taken += u;
      if (u > 0 || t.urenOverride != null) b.takenLijst.push(t);
    }
    // 3) Beschikbare uren per medewerker (rooster − goedgekeurd verlof) uit de capaciteit.
    const capMap = new Map((capaciteit?.medewerkers || []).map((m) => [String(m.naam || "").trim().toLowerCase(), m]));
    const alleNamen = new Set([...perNaam.keys(), ...capMap.keys()]);
    const zl = zoekLaag;
    const rijen = [];
    for (const lc of alleNamen) {
      const w = perNaam.get(lc) || { naam: (capMap.get(lc)?.naam) || lc, config: 0, taken: 0, takenLijst: [] };
      if (zl && !String(w.naam).toLowerCase().includes(zl)) continue;
      const cap = capMap.get(lc) || null;
      const beschikbaar = cap ? Math.max(0, Number(cap.roosterUren || 0) - Number(cap.verlofGoedgekeurd || 0)) : null;
      const werklast = w.config + w.taken;
      const pct = beschikbaar && beschikbaar > 0 ? Math.round((werklast / beschikbaar) * 100) : null;
      rijen.push({
        naam: w.naam, config: w.config, taken: w.taken, werklast, beschikbaar,
        roosterUren: cap ? Number(cap.roosterUren || 0) : null,
        verlof: cap ? Number(cap.verlofGoedgekeurd || 0) : null,
        pct, takenLijst: w.takenLijst.slice().sort((a, b) => (Number(b.uren) || 0) - (Number(a.uren) || 0)),
        heeftCap: !!cap,
      });
    }
    rijen.sort((a, b) => (b.werklast - a.werklast) || String(a.naam).localeCompare(String(b.naam), "nl"));
    const totaal = rijen.reduce((s, r) => ({ config: s.config + r.config, taken: s.taken + r.taken, beschikbaar: s.beschikbaar + (r.beschikbaar || 0) }), { config: 0, taken: 0, beschikbaar: 0 });
    return { rijen, totaal };
  }, [weergave, config, activiteitById, klantenMap, taken, capaciteit, teamFilter, zoekLaag]);

  const chip = (i, idx) => (
    <span key={idx} title={`${i.activiteit} · ${i.wie}${i.afwijkend ? " (afwijkend)" : ""} · ${urenTekst(i.uren)}`}
      style={{
        display: "block", fontSize: 10.5, lineHeight: 1.35, padding: "1px 5px", marginBottom: 2, borderRadius: 5,
        background: i.type === "jaar" ? KLEUR.amberAchtergrond : KLEUR.lichtblauw,
        color: i.type === "jaar" ? KLEUR.amber : KLEUR.blauw,
        border: i.afwijkend ? `1px solid ${KLEUR.amber}` : "1px solid transparent",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130,
      }}>{i.activiteit}</span>
  );

  const statusChip = (sleutel) => {
    if (!sleutel) return <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, fontWeight: 600 }}>Geen status</span>;
    const s = statusInfo[sleutel];
    const kleur = s?.kleur || KLEUR.mutedTekst;
    return <span style={{ fontSize: 10.5, fontWeight: 700, color: kleur, background: `${kleur}1A`, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{s?.label || sleutel}</span>;
  };
  const statusBalk = (telling) => {
    const paren = Object.entries(telling || {}).filter(([, n]) => n > 0);
    if (paren.length === 0) return null;
    return (
      <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {paren.map(([sl, n]) => {
          const s = statusInfo[sl];
          const kleur = sl ? (s?.kleur || KLEUR.mutedTekst) : KLEUR.mutedTekst;
          const label = sl ? (s?.label || sl) : "Geen status";
          return <span key={sl || "_leeg"} title={label} style={{ fontSize: 10.5, fontWeight: 700, color: kleur, background: `${kleur}1A`, padding: "1px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>{n} {label}</span>;
        })}
      </span>
    );
  };
  const groepKnop = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" };
  const leafTabel = (leaves) => (
    <div style={{ padding: "0 12px 10px 30px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <tbody>
          {leaves.map((it) => (
            <tr key={it.regel.id}>
              <td style={{ ...leafTd, fontWeight: 600 }}>{it.act?.label || it.regel.activiteit}</td>
              <td style={leafTd}>{statusChip(it.statusKey)}</td>
              <td style={{ ...leafTd, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>{it.regel.deadline ? new Date(it.regel.deadline).toLocaleDateString("nl-NL") : "—"}</td>
              <td style={leafTd}>{it.wie}</td>
              <td style={{ ...leafTd, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>{urenTekst(it.uren)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const stickyLinks = { position: "sticky", left: 0, zIndex: 1, background: "#fff", boxShadow: `1px 0 0 ${KLEUR.rand}` };
  const laden = config === null;
  const isBezetting = weergave === "bezetting";
  const isGroep = weergave === "medewerker" || weergave === "klant" || weergave === "klantgroep";

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <CalendarRange size={17} color={KLEUR.blauw} /> Jaarplanning
        </div>
        {(weergave === "kalender" || weergave === "bezetting") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setJaar((j) => j - 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
            <div style={{ fontSize: 14, fontWeight: 700, minWidth: 60, textAlign: "center" }}>{jaar}</div>
            <button onClick={() => setJaar((j) => j + 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {/* Weergave-schakelaar */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "10px 0 4px" }}>
        {WEERGAVEN.map(([k, label]) => (
          <button key={k} onClick={() => setWeergave(k)} style={{
            padding: "6px 12px", borderRadius: 20, border: `1px solid ${weergave === k ? KLEUR.blauw : KLEUR.rand}`,
            background: weergave === k ? KLEUR.blauw : "#fff", color: weergave === k ? "#fff" : KLEUR.subtekst,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "8px 0 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {isBezetting
          ? <span><strong>{bezetting.rijen.length}</strong> medewerker{bezetting.rijen.length === 1 ? "" : "s"} · werklast <strong>{urenTekst(bezetting.totaal.config + bezetting.totaal.taken)}</strong> · beschikbaar <strong>{urenTekst(bezetting.totaal.beschikbaar)}</strong></span>
          : isGroep
          ? <span><strong>{groepData.aantal}</strong> jaarregel{groepData.aantal === 1 ? "" : "s"} · <strong>{urenTekst(groepData.uren)}</strong> indicatie</span>
          : <span><strong>{rijen.length}</strong> klant{rijen.length === 1 ? "" : "en"} · <strong>{urenTekst(jaarTotaal)}</strong> indicatie over het jaar</span>}
        <span style={{ color: KLEUR.rand }}>|</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "3px 8px", background: "#fff" }}>
          <Search size={13} color={KLEUR.mutedTekst} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={isBezetting ? "Zoek medewerker…" : isGroep ? "Zoek klant of medewerker…" : "Zoek klant…"} style={{ border: "none", outline: "none", fontSize: 12, width: 160 }} />
        </label>
        {teams.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: KLEUR.subtekst }}>
            Team:
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "4px 8px", fontSize: 12, background: "#fff" }}>
              <option value="alle">alle</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>{fout}</div>}

      {weergave === "kalender" && (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: KLEUR.lichtblauw, display: "inline-block" }} /> maandactiviteit</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: KLEUR.amberAchtergrond, display: "inline-block" }} /> jaaractiviteit</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1px solid ${KLEUR.amber}`, display: "inline-block" }} /> afwijkend van team</span>
        </div>
      )}

      {laden ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Laden…</div>
      ) : weergave === "kalender" ? (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1180 }}>
            <thead><tr>
              <th style={{ ...th, ...stickyLinks, minWidth: 190 }}>Klant</th>
              {MAANDEN_KORT.map((m) => <th key={m} style={{ ...th, minWidth: 88, textAlign: "left" }}>{m}</th>)}
              <th style={{ ...th, minWidth: 78 }}>Totaal</th>
            </tr></thead>
            <tbody>
              {rijen.map((rij) => (
                <tr key={rij.key}>
                  <td style={{ ...td, ...stickyLinks }}>
                    <div style={{ fontWeight: 600 }}>{rij.klantnummer}</div>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{rij.klantnaam}</div>
                    {rij.zonderMaand.length > 0 && (
                      <span title={`Jaar-/eenmalige taken zonder uitvoermaand:\n${rij.zonderMaand.map((i) => "• " + i.activiteit).join("\n")}\n\nStel een uitvoermaand in bij Per klant.`}
                        style={{ marginTop: 3, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberAchtergrond, padding: "1px 6px", borderRadius: 20, cursor: "help" }}>
                        <AlertTriangle size={10} /> {rij.zonderMaand.length} zonder maand
                      </span>
                    )}
                  </td>
                  {rij.maanden.map((cel, mi) => (
                    <td key={mi} style={{ ...td, background: mi % 2 ? "#FbFcFb" : "#fff" }}>
                      {cel.length === 0 ? <span style={{ color: KLEUR.rand }}>·</span> : cel.map(chip)}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{urenTekst(rij.totaal)}</td>
                </tr>
              ))}
              {rijen.length === 0 && <tr><td colSpan={14} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 24 }}>Geen klanten met een planningconfiguratie{zoek || teamFilter !== "alle" ? " voor deze filter" : ""}.</td></tr>}
            </tbody>
            {rijen.length > 0 && (
              <tfoot><tr>
                <td style={{ ...td, ...stickyLinks, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}` }}>Totaal per maand</td>
                {maandTotalen.map((t, mi) => (
                  <td key={mi} style={{ ...td, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}`, color: t ? KLEUR.tekst : KLEUR.mutedTekst, background: mi % 2 ? "#FbFcFb" : "#fff", whiteSpace: "nowrap" }}>{urenTekst(t)}</td>
                ))}
                <td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}`, whiteSpace: "nowrap" }}>{urenTekst(jaarTotaal)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      ) : isBezetting ? (
        <div>
          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 10, lineHeight: 1.6 }}>
            Totale werklast = de per-klant configuratie (maand- én jaaractiviteiten, op jaarbasis) plus de open
            taken met hun indicatie-uren, per uitvoerder. Beschikbaar = rooster − goedgekeurd verlof voor {jaar}.
            Klik een medewerker open voor de taken die meetellen.{capaciteit === null ? " · beschikbare uren laden…" : ""}
          </div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
            {bezetting.rijen.length === 0 && (
              <div style={{ padding: 22, fontSize: 12.5, color: KLEUR.mutedTekst, textAlign: "center", lineHeight: 1.6 }}>
                Geen werklast of medewerkers{zoek || teamFilter !== "alle" ? " voor deze filter" : ""}.
              </div>
            )}
            {bezetting.rijen.map((r) => {
              const bopen = openBez.has(r.naam);
              const kleur = r.pct == null ? KLEUR.mutedTekst : r.pct > 100 ? KLEUR.rood : r.pct >= 85 ? KLEUR.amber : "#2E7D46";
              const heeftTaken = r.takenLijst.length > 0;
              return (
                <div key={r.naam} style={{ borderBottom: `1px solid ${KLEUR.rand}` }}>
                  <button onClick={() => heeftTaken && toggleBez(r.naam)} style={{ ...groepKnop, cursor: heeftTaken ? "pointer" : "default" }}>
                    <ChevronRight size={15} style={{ transform: bopen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0, opacity: heeftTaken ? 1 : 0.25 }} color={KLEUR.mutedTekst} />
                    <span style={{ fontWeight: 700, flex: "0 0 190px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.naam}</span>
                    <span style={{ display: "flex", gap: 12, flex: 1, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                      <span title="Configuratie (maand + jaar), op jaarbasis" style={{ fontSize: 11.5, color: KLEUR.subtekst, whiteSpace: "nowrap" }}>config {urenTekst(r.config)}</span>
                      <span title="Open taken" style={{ fontSize: 11.5, color: KLEUR.subtekst, whiteSpace: "nowrap" }}>taken {urenTekst(r.taken)}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{urenTekst(r.werklast)}</span>
                      <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>/ {r.beschikbaar != null ? urenTekst(r.beschikbaar) : "—"}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 150 }}>
                        <span style={{ position: "relative", flex: 1, height: 8, background: KLEUR.rand, borderRadius: 20, overflow: "hidden", minWidth: 80 }}>
                          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${r.pct != null ? Math.min(100, r.pct) : 0}%`, background: kleur }} />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: kleur, minWidth: 42, textAlign: "right" }}>{r.pct != null ? `${r.pct}%` : "—"}</span>
                      </span>
                    </span>
                  </button>
                  {bopen && heeftTaken && (
                    <div style={{ background: "#FbFcFb", padding: "4px 12px 10px 34px" }}>
                      {r.takenLijst.map((t) => (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11.5, padding: "3px 0", borderBottom: `1px solid ${KLEUR.rand}55` }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <ClipboardList size={12} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.onderwerp}{t.klantnaam ? ` · ${t.klantnaam}` : ""}</span>
                          </span>
                          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{urenTekst(t.uren)}{t.urenOverride != null ? "*" : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#2E7D46", display: "inline-block" }} /> ruim (&lt; 85%)</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: KLEUR.amber, display: "inline-block" }} /> vol (85–100%)</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: KLEUR.rood, display: "inline-block" }} /> overbezet (&gt; 100%)</span>
            <span>* = handmatig aangepaste taak-uren</span>
          </div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          {groepData.groepen.length === 0 && (
            <div style={{ padding: 22, fontSize: 12.5, color: KLEUR.mutedTekst, textAlign: "center", lineHeight: 1.6 }}>
              Geen jaarplanningsregels{zoek || teamFilter !== "alle" ? " voor deze filter" : ""}.<br />
              Deze weergave gebruikt de losse planningsregels met een status (type "jaar") — voeg ze toe via Planning → Overzicht of op de klantkaart.
            </div>
          )}
          {groepData.groepen.map((g) => {
            const gopen = openGroep.has(g.key);
            return (
              <div key={g.key} style={{ borderBottom: `1px solid ${KLEUR.rand}` }}>
                <button onClick={() => toggleGroep(g.key)} style={groepKnop}>
                  <ChevronRight size={15} style={{ transform: gopen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} color={KLEUR.mutedTekst} />
                  <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.naam}</span>
                  {statusBalk(g.telling)}
                  <span style={{ fontSize: 12, color: KLEUR.mutedTekst, whiteSpace: "nowrap", marginLeft: 4 }}>{g.aantal} · {urenTekst(g.uren)}</span>
                </button>
                {gopen && (g.subgroepen ? (
                  <div style={{ background: "#FbFcFb" }}>
                    {g.subgroepen.map((s) => {
                      const sopen = openSub.has(s.key);
                      return (
                        <div key={s.key} style={{ borderTop: `1px solid ${KLEUR.rand}` }}>
                          <button onClick={() => toggleSub(s.key)} style={{ ...groepKnop, padding: "7px 12px 7px 26px" }}>
                            <ChevronRight size={14} style={{ transform: sopen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} color={KLEUR.mutedTekst} />
                            <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.naam}{s.nummer ? <span style={{ color: KLEUR.mutedTekst, fontWeight: 400 }}> · {s.nummer}</span> : null}</span>
                            {statusBalk(s.telling)}
                            <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst, whiteSpace: "nowrap", marginLeft: 4 }}>{s.aantal} · {urenTekst(s.uren)}</span>
                          </button>
                          {sopen && <div style={{ background: "#fff" }}>{leafTabel(s.leaves)}</div>}
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{ background: "#FbFcFb" }}>{leafTabel(g.leaves)}</div>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
