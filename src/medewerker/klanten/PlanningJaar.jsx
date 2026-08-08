/**
 * Planning — jaarplanning (Klant × activiteit per maand).
 *
 * Eén jaarraster: per klant een rij, met 12 maandkolommen. In elke cel staan de activiteiten die
 * in die maand vallen (afgeleid uit de per-klant configuratie /api/mw-planning-config, dezelfde bron
 * als de maandplanning):
 *   - maandelijks valt elke maand; kwartaal in jan/apr/jul/okt; jaar-/eenmalige taken in de op de
 *     klantkaart ingestelde UITVOERMAAND. Jaar-/eenmalige taken zonder maand staan als los signaal
 *     bij de klant (klik-tooltip) zodat je ze alsnog kunt inplannen.
 *
 * Elke activiteit-chip toont bij hover de uitvoerder (team of afwijkend) en de indicatie-uren. Rechts
 * per klant en onderaan per maand de opgetelde indicatie-uren over het jaar, zodat je de spreiding ziet.
 * Filterbaar op team (A&R/FS) en op klant (zoek).
 */
import { useState, useEffect, useMemo } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, AlertTriangle, Search } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12, padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

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

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [fout, setFout] = useState("");

  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);

  useEffect(() => {
    fetch("/api/mw-planning-config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig(d.config || []))
      .catch((e) => { setConfig([]); setFout(e.message || "Configuratie kon niet worden opgehaald."); });
    fetch("/api/mw-planning-overzicht")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setActiviteiten(d.activiteiten || []))
      .catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { const bij = {}; (d.klanten || []).forEach((k) => { bij[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(bij); })
      .catch(() => setKlantenMap({}));
  }, []);

  const teams = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.team).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")),
    [klantenMap]
  );

  const zoekLaag = zoek.trim().toLowerCase();

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
      const uren = Number(r.indicatieUren) || 0;
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
    const rijen = Object.values(map).sort((a, b) =>
      String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
    const maandTotalen = Array.from({ length: 12 }, (_, m) =>
      rijen.reduce((s, rij) => s + rij.maanden[m].reduce((t, i) => t + i.uren, 0), 0));
    const jaarTotaal = rijen.reduce((s, rij) => s + rij.totaal, 0);
    return { rijen, maandTotalen, jaarTotaal };
  }, [config, activiteitById, klantenMap, teamFilter, zoekLaag]);

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

  const stickyLinks = { position: "sticky", left: 0, zIndex: 1, background: "#fff", boxShadow: `1px 0 0 ${KLEUR.rand}` };
  const laden = config === null;

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <CalendarRange size={17} color={KLEUR.blauw} /> Jaarplanning
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setJaar((j) => j - 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: 60, textAlign: "center" }}>{jaar}</div>
          <button onClick={() => setJaar((j) => j + 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "8px 0 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span><strong>{rijen.length}</strong> klant{rijen.length === 1 ? "" : "en"} · <strong>{urenTekst(jaarTotaal)}</strong> indicatie over het jaar</span>
        <span style={{ color: KLEUR.rand }}>|</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "3px 8px", background: "#fff" }}>
          <Search size={13} color={KLEUR.mutedTekst} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek klant…" style={{ border: "none", outline: "none", fontSize: 12, width: 140 }} />
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

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: KLEUR.lichtblauw, display: "inline-block" }} /> maandactiviteit</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: KLEUR.amberAchtergrond, display: "inline-block" }} /> jaaractiviteit</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1px solid ${KLEUR.amber}`, display: "inline-block" }} /> afwijkend van team</span>
      </div>

      {laden ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Laden…</div>
      ) : (
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
      )}
    </div>
  );
}
