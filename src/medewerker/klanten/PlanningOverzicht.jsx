/**
 * Planning — medewerkersoverzicht (hoofdtabblad "Planning", tussen Taken en Vragenlijsten).
 *
 * Planningsmodule Stap 2: het echte scherm. Een simpele, eigen maand-/jaarplanning per klant —
 * geen koppeling met Offsoo. Per planningsregel: klant, activiteit (maand/jaar), periode, deadline,
 * toegewezen medewerker, status (zelf te beheren in Beheer → Planning) en een INDICATIE van de
 * werkzaamheden in uren (inschatting werklast, los van de echte urenmodule).
 *
 * Regels komen uit /api/mw-planning-overzicht (beveiligd met planningRecht.js) + de klantnaam/
 * -nummer/-groep uit /api/beheer-klanten (zelfde join-patroon als ContractenOverzicht.jsx, incl.
 * de .toLowerCase()-normalisatie van het account-id). Toevoegen/bewerken/verwijderen via
 * /api/mw-planning-klanten. De tabel/bovenbalk/"Mijn cliënten"-schakelaar volgen ContractenOverzicht.
 */
import { useState, useEffect, useMemo } from "react";
import { CalendarClock, Search, ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import MedewerkerKiezer from "./MedewerkerKiezer";
import ScopeToggle, { useMijnNaam, isKlantVanMij } from "../MijnFilter";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };
const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };
const labelStijl = { fontSize: 11.5, fontWeight: 600, color: KLEUR.subtekst, marginBottom: 4, display: "block" };

const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

function AantalKiezer({ aantal, setAantal, totaal }) {
  const getoond = Math.min(aantal === Infinity ? totaal : aantal, totaal);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{getoond} van {totaal} getoond</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTAL_KEUZES.map(([n, lbl]) => (
          <button key={lbl} onClick={() => setAantal(n)} style={{
            padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${aantal === n ? KLEUR.blauw : KLEUR.rand}`,
            background: aantal === n ? KLEUR.blauw : "#fff", color: aantal === n ? "#fff" : KLEUR.subtekst,
          }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
function datumInput(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}
function urenTekst(n) {
  if (n == null || n === "") return "—";
  return `${Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} u`;
}
function dagenTot(deadline) {
  if (!deadline) return null;
  const eind = new Date(deadline);
  if (isNaN(eind.getTime())) return null;
  eind.setHours(0, 0, 0, 0);
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((eind.getTime() - vandaag.getTime()) / 86400000);
}
function deadlineKleur(deadline, statusSleutel) {
  if (statusSleutel === "gereed") return KLEUR.mutedTekst;
  const d = dagenTot(deadline);
  if (d == null) return KLEUR.tekst;
  if (d < 0) return KLEUR.rood;
  if (d <= 14) return KLEUR.amber;
  return KLEUR.tekst;
}

const KOLOM_DEFINITIES = [
  { key: "klant", label: "Klant", standaard: true },
  { key: "activiteit", label: "Activiteit", standaard: true },
  { key: "type", label: "Type", standaard: true },
  { key: "periode", label: "Periode", standaard: true },
  { key: "deadline", label: "Deadline", standaard: true },
  { key: "status", label: "Status", standaard: true },
  { key: "toegewezen", label: "Toegewezen", standaard: true },
  { key: "uren", label: "Indicatie-uren", standaard: true },
];

export default function PlanningOverzicht() {
  const { mijnNaam } = useMijnNaam();
  const [regels, setRegels] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [statussen, setStatussen] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [klantenLijst, setKlantenLijst] = useState([]);
  const [fout, setFout] = useState("");

  const [zoek, setZoek] = useState("");
  const [typeFilter, setTypeFilter] = useState("alle"); // alle | maand | jaar
  const [statusFilter, setStatusFilter] = useState("alle");
  const [groepFilter, setGroepFilter] = useState("alle");
  const [teamFilter, setTeamFilter] = useState("alle");
  const [scope, setScope] = useState("mijn");
  const [toonAantal, setToonAantal] = useState(50);
  const [sortKey, setSortKey] = useState("deadline");
  const [sortDir, setSortDir] = useState("asc");

  const [form, setForm] = useState(null); // null = geen formulier; anders het (nieuwe/te bewerken) record
  const [bezig, setBezig] = useState(false);
  const [formFout, setFormFout] = useState("");

  const activiteitLabel = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a.label])), [activiteiten]);
  const activiteitType = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a.type])), [activiteiten]);
  const statusMeta = useMemo(() => Object.fromEntries(statussen.map((s) => [s.sleutel, s])), [statussen]);

  const laad = () => {
    fetch("/api/mw-planning-overzicht")
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.json(); })
      .then((d) => { setRegels(d.regels || []); setActiviteiten(d.activiteiten || []); setStatussen(d.statussen || []); })
      .catch((e) => setFout(e.message || "Planning kon niet worden opgehaald."));
  };

  useEffect(() => {
    fetch("/api/beheer-klanten?alle=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const bij = {};
        (d.klanten || []).forEach((k) => { bij[String(k.accountId || "").toLowerCase()] = k; });
        setKlantenMap(bij);
        setKlantenLijst((d.klanten || []).slice().sort((a, b) => String(a.klantnaam || "").localeCompare(String(b.klantnaam || ""), "nl")));
      })
      .catch(() => { setKlantenMap({}); setKlantenLijst([]); });
    laad();
  }, []);

  const rijen = useMemo(() => {
    if (!regels) return [];
    return regels.map((r) => {
      const klant = klantenMap[String(r.klantAccountId || "").toLowerCase()] || null;
      return {
        ...r,
        klant,
        klantnaam: klant?.klantnaam || "Onbekende klant",
        klantnummer: klant?.klantnummer || "",
        groepsnaam: klant?.groepsnaam || "",
        activiteitLabel: activiteitLabel[r.activiteit] || r.activiteit || "",
        statusLabel: statusMeta[r.status]?.label || r.status || "",
        dagen: dagenTot(r.deadline),
      };
    });
  }, [regels, klantenMap, activiteitLabel, statusMeta]);

  const groepen = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.groepsnaam).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl")),
    [klantenMap]
  );
  const teams = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.team).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")),
    [klantenMap]
  );

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return rijen.filter((r) => {
      if (scope === "mijn" && mijnNaam && !isKlantVanMij(r.klant, mijnNaam)) return false;
      if (typeFilter !== "alle" && r.type !== typeFilter) return false;
      if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (groepFilter !== "alle" && r.groepsnaam !== groepFilter) return false;
      if (teamFilter !== "alle" && (r.klant?.team || "") !== teamFilter) return false;
      if (term) {
        const raak = [r.klantnaam, r.klantnummer, r.activiteitLabel, r.periode, r.toegewezenAan, r.groepsnaam]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
        if (!raak) return false;
      }
      return true;
    });
  }, [rijen, zoek, typeFilter, statusFilter, groepFilter, teamFilter, scope, mijnNaam]);

  const sorteerWaarde = (key, r) => {
    switch (key) {
      case "klant": return (r.klantnaam || "").toLowerCase();
      case "deadline": return r.deadline ? new Date(r.deadline).getTime() : Infinity;
      case "uren": return r.indicatieUren == null ? -1 : r.indicatieUren;
      case "activiteit": return (r.activiteitLabel || "").toLowerCase();
      case "status": return (r.statusLabel || "").toLowerCase();
      case "toegewezen": return (r.toegewezenAan || "").toLowerCase();
      case "periode": return (r.periode || "").toLowerCase();
      case "type": return r.type || "";
      default: return "";
    }
  };
  const gesorteerd = useMemo(() => {
    const richting = sortDir === "asc" ? 1 : -1;
    return [...gefilterd].sort((a, b) => {
      const va = sorteerWaarde(sortKey, a), vb = sorteerWaarde(sortKey, b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * richting;
      return String(va).localeCompare(String(vb), "nl", { numeric: true }) * richting;
    });
  }, [gefilterd, sortKey, sortDir]);

  const zichtbareRijen = toonAantal === Infinity ? gesorteerd : gesorteerd.slice(0, toonAantal);
  const sorteerOp = (key) => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("asc"); } };
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  // Indicatie-uren-optellingen (over de gefilterde regels): totaal, per medewerker, per periode.
  const totalen = useMemo(() => {
    let totaal = 0;
    const perMedewerker = {};
    const perPeriode = {};
    for (const r of gefilterd) {
      const u = Number(r.indicatieUren) || 0;
      totaal += u;
      const m = (r.toegewezenAan || "").trim() || "— niet toegewezen";
      perMedewerker[m] = (perMedewerker[m] || 0) + u;
      const p = (r.periode || "").trim() || "— geen periode";
      perPeriode[p] = (perPeriode[p] || 0) + u;
    }
    const sorteer = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return { totaal, perMedewerker: sorteer(perMedewerker), perPeriode: sorteer(perPeriode) };
  }, [gefilterd]);

  const filtersActief = typeFilter !== "alle" || statusFilter !== "alle" || groepFilter !== "alle" || teamFilter !== "alle";

  // ---- Formulier (nieuw/bewerken) ----
  const nieuweRegel = () => setForm({ nieuw: true, klantAccountId: "", activiteit: "", type: "maand", periode: "", deadline: "", status: "", toegewezenAan: "", indicatieUren: "", opmerkingen: "" });
  const bewerkRegel = (r) => setForm({
    nieuw: false, id: r.id, klantAccountId: r.klantAccountId, klantnaam: r.klantnaam, klantnummer: r.klantnummer,
    activiteit: r.activiteit, type: r.type || "maand", periode: r.periode || "", deadline: datumInput(r.deadline),
    status: r.status || "", toegewezenAan: r.toegewezenAan || "", indicatieUren: r.indicatieUren == null ? "" : String(r.indicatieUren),
    opmerkingen: r.opmerkingen || "",
  });
  const zetForm = (veld, waarde) => setForm((f) => {
    const n = { ...f, [veld]: waarde };
    if (veld === "activiteit" && activiteitType[waarde]) n.type = activiteitType[waarde]; // type volgt de activiteit
    return n;
  });

  const bewaar = async () => {
    if (!form) return;
    setBezig(true); setFormFout("");
    try {
      const body = {
        klantAccountId: form.klantAccountId, activiteit: form.activiteit, type: form.type,
        periode: form.periode, deadline: form.deadline || null, status: form.status,
        toegewezenAan: form.toegewezenAan, indicatieUren: form.indicatieUren === "" ? null : form.indicatieUren,
        opmerkingen: form.opmerkingen,
      };
      const url = "/api/mw-planning-klanten";
      const res = form.nieuw
        ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: form.id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setForm(null);
      laad();
    } catch (e) {
      setFormFout(e.message || "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  };

  const verwijder = async () => {
    if (!form || form.nieuw) return;
    if (!window.confirm("Deze planningsregel verwijderen?")) return;
    setBezig(true); setFormFout("");
    try {
      const res = await fetch(`/api/mw-planning-klanten?id=${encodeURIComponent(form.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setForm(null);
      laad();
    } catch (e) {
      setFormFout(e.message || "Verwijderen mislukt.");
    } finally {
      setBezig(false);
    }
  };

  // ---- Formulierweergave ----
  if (form) {
    const kanBewaren = form.klantAccountId && form.activiteit && !bezig;
    return (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, maxWidth: 720 }}>
        <button onClick={() => setForm(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 14 }}>
          <ArrowLeft size={15} /> Terug naar planning
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{form.nieuw ? "Nieuwe planningsregel" : "Planningsregel bewerken"}</div>

        {formFout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>{formFout}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStijl}>Klant *</label>
            {form.nieuw ? (
              <select value={form.klantAccountId} onChange={(e) => zetForm("klantAccountId", e.target.value)} style={inputStijl}>
                <option value="">— kies een klant —</option>
                {klantenLijst.map((k) => (
                  <option key={k.accountId} value={String(k.accountId).toLowerCase()}>
                    {(k.klantnummer ? k.klantnummer + " — " : "") + (k.klantnaam || "(naamloos)")}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 13.5, padding: "8px 0" }}>{form.klantnummer ? form.klantnummer + " — " : ""}{form.klantnaam}</div>
            )}
          </div>

          <div>
            <label style={labelStijl}>Activiteit *</label>
            <select value={form.activiteit} onChange={(e) => zetForm("activiteit", e.target.value)} style={inputStijl}>
              <option value="">— kies activiteit —</option>
              <optgroup label="Maandactiviteiten">
                {activiteiten.filter((a) => a.type === "maand").map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}
              </optgroup>
              <optgroup label="Jaaractiviteiten">
                {activiteiten.filter((a) => a.type === "jaar").map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}
              </optgroup>
            </select>
          </div>

          <div>
            <label style={labelStijl}>Type</label>
            <select value={form.type} onChange={(e) => zetForm("type", e.target.value)} style={inputStijl}>
              <option value="maand">Maand</option>
              <option value="jaar">Jaar</option>
            </select>
          </div>

          <div>
            <label style={labelStijl}>Periode</label>
            <input value={form.periode} onChange={(e) => zetForm("periode", e.target.value)} placeholder="bijv. 2026-07 of 2026" style={inputStijl} />
          </div>

          <div>
            <label style={labelStijl}>Deadline</label>
            <input type="date" value={form.deadline} onChange={(e) => zetForm("deadline", e.target.value)} style={inputStijl} />
          </div>

          <div>
            <label style={labelStijl}>Status</label>
            <select value={form.status} onChange={(e) => zetForm("status", e.target.value)} style={inputStijl}>
              <option value="">— geen —</option>
              {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStijl}>Toegewezen aan</label>
            <MedewerkerKiezer waarde={form.toegewezenAan} onChange={(v) => zetForm("toegewezenAan", v)} placeholder="zoek medewerker…" stijl={inputStijl} />
          </div>

          <div>
            <label style={labelStijl}>Indicatie-uren (inschatting werklast)</label>
            <input type="number" min="0" step="0.25" value={form.indicatieUren} onChange={(e) => zetForm("indicatieUren", e.target.value)} placeholder="bijv. 2.5" style={inputStijl} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStijl}>Opmerkingen</label>
            <textarea value={form.opmerkingen} onChange={(e) => zetForm("opmerkingen", e.target.value)} rows={3} style={{ ...inputStijl, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <button onClick={bewaar} disabled={!kanBewaren} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: KLEUR.blauw, color: "#fff",
            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: kanBewaren ? "pointer" : "default", opacity: kanBewaren ? 1 : 0.6,
          }}>
            {bezig && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />} Opslaan
          </button>
          <button onClick={() => setForm(null)} style={{ padding: "9px 16px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
          {!form.nieuw && (
            <button onClick={verwijder} disabled={bezig} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}55`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Trash2 size={14} /> Verwijderen
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <CalendarClock size={17} color={KLEUR.blauw} /> Planning — overzicht alle klanten
        </div>
        <button onClick={nieuweRegel} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> Nieuwe planningsregel
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
        De ingeplande activiteiten per klant, met status, toegewezen medewerker en indicatie-uren. Klik op een kolomkop om te sorteren, en op een rij om te bewerken.
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>{fout}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <ScopeToggle scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op klant, activiteit, periode of medewerker…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStijl}>
          <option value="alle">Alle types</option>
          <option value="maand">Maand</option>
          <option value="jaar">Jaar</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStijl}>
          <option value="alle">Alle statussen</option>
          {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
        </select>
        {groepen.length > 0 && (
          <select value={groepFilter} onChange={(e) => setGroepFilter(e.target.value)} style={selectStijl}>
            <option value="alle">Alle groepen</option>
            {groepen.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        {teams.length > 0 && (
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={selectStijl}>
            <option value="alle">Alle teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {(filtersActief || zoek) && (
          <button onClick={() => { setTypeFilter("alle"); setStatusFilter("alle"); setGroepFilter("alle"); setTeamFilter("alle"); setZoek(""); }}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Filters wissen
          </button>
        )}
      </div>

      {scope === "mijn" && !mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 10 }}>
          Je naam kon niet bepaald worden — "Mijn cliënten" toont daarom voorlopig niemand. Klik op <strong>Kantoorbreed</strong> om alles te zien.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
        <span>{gefilterd.length} planningsregel{gefilterd.length === 1 ? "" : "s"}</span>
        <span><strong style={{ color: KLEUR.tekst }}>{urenTekst(totalen.totaal)}</strong> totaal indicatie-uren</span>
      </div>

      {regels === null && !fout && <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>Laden…</div>}

      {regels !== null && gefilterd.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>
          {rijen.length === 0 ? "Nog geen planningsregels. Klik op “Nieuwe planningsregel” om te beginnen." : "Geen planningsregels gevonden voor dit filter."}
        </div>
      )}

      {zichtbareRijen.length > 0 && (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {KOLOM_DEFINITIES.filter((k) => k.standaard).map((kol) => {
                  const actief = sortKey === kol.key;
                  return <th key={kol.key} onClick={() => sorteerOp(kol.key)} title="Klik om te sorteren" style={{ ...th, cursor: "pointer", userSelect: "none", color: actief ? KLEUR.blauw : th.color }}>{kol.label}{pijl(kol.key)}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {zichtbareRijen.map((r) => {
                const sm = statusMeta[r.status];
                return (
                  <tr key={r.id} onClick={() => bewerkRegel(r)} title="Klik om te bewerken" style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = KLEUR.lichtblauw)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={td}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.klantnummer || "—"}</div>
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{r.klantnaam}</div>
                    </td>
                    <td style={td}>{r.activiteitLabel || "—"}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, padding: "3px 8px", borderRadius: 5 }}>{r.type === "jaar" ? "Jaar" : "Maand"}</span></td>
                    <td style={td}>{r.periode || "—"}</td>
                    <td style={{ ...td, color: deadlineKleur(r.deadline, r.status), fontWeight: r.deadline ? 600 : 400 }}>{datum(r.deadline)}</td>
                    <td style={td}>
                      {r.statusLabel ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: sm?.kleur || KLEUR.subtekst, background: `${sm?.kleur || "#8A9089"}1A`, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{r.statusLabel}</span>
                      ) : <span style={{ color: KLEUR.mutedTekst }}>—</span>}
                    </td>
                    <td style={td}>{r.toegewezenAan || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>{urenTekst(r.indicatieUren)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {gefilterd.length > 0 && <AantalKiezer aantal={toonAantal} setAantal={setToonAantal} totaal={gefilterd.length} />}

      {gefilterd.length > 0 && (totalen.perMedewerker.length > 0 || totalen.perPeriode.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 8 }}>Indicatie-uren per medewerker</div>
            {totalen.perMedewerker.map(([naam, u]) => (
              <div key={naam} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                <span>{naam}</span><span style={{ fontWeight: 600 }}>{urenTekst(u)}</span>
              </div>
            ))}
          </div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 8 }}>Indicatie-uren per periode</div>
            {totalen.perPeriode.map(([p, u]) => (
              <div key={p} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                <span>{p}</span><span style={{ fontWeight: 600 }}>{urenTekst(u)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
