/**
 * Planning — maandplanning & bezetting (Stap 3b).
 *
 * Leidt de maandplanning af uit de per-klant configuratie (Stap 3a, /api/mw-planning-config zonder
 * accountId = alle klanten): welke activiteiten vallen in de gekozen maand (op basis van hun
 * frequentie), wie doet ze (team-persoon uit de klantgegevens, of de afwijkende toewijzing) en
 * hoeveel indicatie-uren. Dat wordt per medewerker afgezet tegen het rooster/de beschikbare uren uit
 * de bestaande Uren-bezetting (/api/mw-uren-bezetting: werkdagen × norm, plus wat er al geboekt is).
 *
 * Frequentie-regel (v1): maandelijks telt elke maand; kwartaal in jan/apr/jul/okt; jaar-/eenmalige
 * taken hebben (nog) geen vaste maand en staan daarom apart, niet in de maand-capaciteit.
 */
import { useState, useEffect, useMemo } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

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
  if (n == null || n === "") return "—";
  return `${Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} u`;
}
function valtInMaand(frequentie, maand1) {
  if (frequentie === "maandelijks") return true;
  if (frequentie === "kwartaal") return [1, 4, 7, 10].includes(maand1);
  return false; // jaarlijks/eenmalig: apart getoond
}

export default function PlanningMaand() {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1); // 1-12
  const [alle, setAlle] = useState(false);

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [bezetting, setBezetting] = useState(null); // { medewerkers:[{naam,ingepland,beschikbaar}], ... }
  const [fout, setFout] = useState("");

  const maandStr = `${jaar}-${String(maand).padStart(2, "0")}`;
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

  useEffect(() => {
    setBezetting(null);
    fetch(`/api/mw-uren-bezetting?maand=${maandStr}${alle ? "&scope=alle" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBezetting(d))
      .catch(() => setBezetting({ medewerkers: [], beschikbaar: 0 }));
  }, [maandStr, alle]);

  // Afgeleide maand-items uit de config
  const { maanditems, jaaritems, perMedewerker } = useMemo(() => {
    const maanditems = [], jaaritems = [];
    const perMedewerker = {};
    for (const r of config || []) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act) continue;
      const klant = klantenMap[String(r.klantAccountId || "").toLowerCase()] || null;
      const override = (r.toegewezenAan || "").trim();
      const team = teamPersoon(klant, act.rol);
      const wie = override || team || "— niet toegewezen";
      const uren = Number(r.indicatieUren) || 0;
      const item = {
        id: r.id, klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "",
        activiteit: act.label, frequentie: r.frequentie, uren, wie, afwijkend: !!override && override.toLowerCase() !== (team || "").toLowerCase(),
      };
      if (valtInMaand(r.frequentie, maand)) {
        maanditems.push(item);
        perMedewerker[wie] = (perMedewerker[wie] || 0) + uren;
      } else {
        jaaritems.push(item);
      }
    }
    return { maanditems, jaaritems, perMedewerker };
  }, [config, activiteitById, klantenMap, maand]);

  // Bezettingstabel: rooster-medewerkers + eventuele planning-toewijzingen die niet in het rooster staan.
  const bezettingRijen = useMemo(() => {
    const beschikbaar = bezetting?.beschikbaar || 0;
    const rooster = (bezetting?.medewerkers || []);
    const byNaam = {};
    rooster.forEach((m) => { byNaam[(m.naam || "").toLowerCase()] = m; });
    const rijen = rooster.map((m) => ({
      naam: m.naam, beschikbaar: m.beschikbaar, geboekt: m.ingepland,
      planning: perMedewerker[m.naam] || Object.entries(perMedewerker).find(([n]) => n.toLowerCase() === (m.naam || "").toLowerCase())?.[1] || 0,
      inRooster: true,
    }));
    // Planning-toewijzingen die niet matchen met een rooster-medewerker (bv. vrije-tekst afwijking)
    for (const [naam, uren] of Object.entries(perMedewerker)) {
      if (naam === "— niet toegewezen") { rijen.push({ naam, beschikbaar: 0, geboekt: 0, planning: uren, inRooster: false }); continue; }
      if (!byNaam[naam.toLowerCase()]) rijen.push({ naam, beschikbaar: beschikbaar, geboekt: 0, planning: uren, inRooster: false });
    }
    return rijen.sort((a, b) => (b.planning - a.planning) || String(a.naam).localeCompare(String(b.naam), "nl"));
  }, [bezetting, perMedewerker]);

  const vorige = () => { if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };

  const totaalMaand = maanditems.reduce((s, i) => s + i.uren, 0);

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <CalendarClock size={17} color={KLEUR.blauw} /> Maandplanning & bezetting
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: 150, textAlign: "center" }}>{MAANDEN[maand - 1]} {jaar}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 820 }}>
        Afgeleid uit de configuratie per klant. <strong>{urenTekst(totaalMaand)}</strong> ingepland deze maand.
        Maandelijkse activiteiten tellen elke maand; kwartaal in jan/apr/jul/okt; jaar-/eenmalige taken staan onderaan apart.
        <label style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> Kantoorbreed (beheerder)
        </label>
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>{fout}</div>}

      {/* Bezetting per medewerker */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>Bezetting per medewerker</div>
      {bezetting === null || config === null ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Laden…</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr>
              <th style={th}>Medewerker</th><th style={th}>Planning (deze maand)</th><th style={th}>Reeds geboekt</th>
              <th style={th}>Beschikbaar</th><th style={th}>Bezetting</th>
            </tr></thead>
            <tbody>
              {bezettingRijen.map((m) => {
                const pct = m.beschikbaar ? Math.round((m.planning / m.beschikbaar) * 100) : 0;
                const barKleur = pct > 100 ? KLEUR.rood : pct >= 80 ? KLEUR.amber : KLEUR.groen;
                return (
                  <tr key={m.naam}>
                    <td style={td}>
                      {m.naam}
                      {!m.inRooster && m.naam !== "— niet toegewezen" && (
                        <span title="Niet gevonden in het rooster (mogelijk een afwijkende, vrije toewijzing)" style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberAchtergrond, padding: "1px 6px", borderRadius: 20 }}><AlertTriangle size={10} /> buiten rooster</span>
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{urenTekst(m.planning)}</td>
                    <td style={td}>{urenTekst(m.geboekt)}</td>
                    <td style={td}>{m.beschikbaar ? urenTekst(m.beschikbaar) : "—"}</td>
                    <td style={td}>
                      {m.beschikbaar ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ position: "relative", width: 120, height: 8, background: "#EEF0EC", borderRadius: 20, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(pct, 100)}%`, background: barKleur }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: barKleur }}>{pct}%</span>
                        </div>
                      ) : <span style={{ color: KLEUR.mutedTekst }}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {bezettingRijen.length === 0 && <tr><td colSpan={5} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 20 }}>Geen medewerkers/planning voor deze maand.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Ingeplande activiteiten deze maand */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>Ingeplande activiteiten ({maanditems.length})</div>
      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: jaaritems.length ? 20 : 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr>
            <th style={th}>Klant</th><th style={th}>Activiteit</th><th style={th}>Frequentie</th><th style={th}>Uitvoerder</th><th style={th}>Indicatie-uren</th>
          </tr></thead>
          <tbody>
            {maanditems.map((i) => (
              <tr key={i.id}>
                <td style={td}><div style={{ fontWeight: 600 }}>{i.klantnummer}</div><div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{i.klantnaam}</div></td>
                <td style={td}>{i.activiteit}</td>
                <td style={td}>{i.frequentie}</td>
                <td style={{ ...td, color: i.afwijkend ? KLEUR.amber : KLEUR.tekst, fontWeight: i.afwijkend ? 700 : 400 }}>{i.wie}{i.afwijkend ? " (afwijkend)" : ""}</td>
                <td style={td}>{urenTekst(i.uren)}</td>
              </tr>
            ))}
            {maanditems.length === 0 && <tr><td colSpan={5} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 20 }}>Niets ingepland deze maand (op basis van de configuratie).</td></tr>}
          </tbody>
        </table>
      </div>

      {jaaritems.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>Jaar- en eenmalige taken (geen vaste maand)</div>
          <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>
                <th style={th}>Klant</th><th style={th}>Activiteit</th><th style={th}>Frequentie</th><th style={th}>Uitvoerder</th><th style={th}>Indicatie-uren</th>
              </tr></thead>
              <tbody>
                {jaaritems.map((i) => (
                  <tr key={i.id}>
                    <td style={td}><div style={{ fontWeight: 600 }}>{i.klantnummer}</div><div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{i.klantnaam}</div></td>
                    <td style={td}>{i.activiteit}</td>
                    <td style={td}>{i.frequentie}</td>
                    <td style={{ ...td, color: i.afwijkend ? KLEUR.amber : KLEUR.tekst, fontWeight: i.afwijkend ? 700 : 400 }}>{i.wie}{i.afwijkend ? " (afwijkend)" : ""}</td>
                    <td style={td}>{urenTekst(i.uren)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
