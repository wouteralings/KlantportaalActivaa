/**
 * Planning — maandplanning & bezetting (Stap 3b + 3c).
 *
 * Leidt de maandplanning af uit de per-klant configuratie (/api/mw-planning-config zonder accountId
 * = alle klanten): welke activiteiten vallen in de gekozen maand, wie doet ze (team of afwijkende
 * toewijzing) en hoeveel indicatie-uren.
 *   - maandelijks telt elke maand; kwartaal in jan/apr/jul/okt; jaar-/eenmalige taken vallen in de
 *     op de klantkaart ingestelde UITVOERMAAND (Stap 3c) — is die niet gezet, dan staan ze onderaan
 *     apart met een "stel een maand in"-signaal.
 *
 * De bezetting per medewerker komt uit /api/mw-planning-capaciteit (Stap 3c): het WERKROOSTER
 * (parttime-factor) en het DECLARABEL-DOEL % (allebei apart aan/uit te zetten), minus GOEDGEKEURD
 * verlof, met AANGEVRAAGD verlof ernaast zodat je vakantieaanvragen tegen de bezetting kunt beoordelen.
 */
import { useState, useEffect, useMemo } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, AlertTriangle, Plane } from "lucide-react";
import { ScopeKnoppen, ToggleKnop, Paginatie, pagineer, getoondAantal } from "./PlanningUI";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

// Rolpersoon van de klant (uit Dynamics). Geeft NAAM + E-MAIL terug: op e-mail koppelen we hierna aan
// het rooster, zodat een afwijkende schrijfwijze van de naam (bv. de "AA"-titel erachter) geen
// "buiten rooster" meer oplevert. De klant-rolpersonen dragen { naam, email, id } vanuit beheer-klanten.
function teamPersoonInfo(klant, rol) {
  const leeg = { naam: "", email: "", id: "" };
  if (!klant || !rol) return leeg;
  const uit = (o, naamFallback) => ({ naam: (o && o.naam) || naamFallback || "", email: (o && o.email) || "", id: (o && o.id) || "" });
  switch (rol) {
    case "assistent": return uit(klant.assistent);
    case "manager": return uit(klant.manager, klant.relatiebeheerder);
    case "accountant": return uit(klant.accountantPersoon, klant.accountant);
    case "fiscaal": return uit(klant.fiscaalMedewerker);
    case "loonadministratie": return uit(klant.loonadministratie);
    case "backup": return uit(klant.backup);
    default: return leeg;
  }
}
function urenTekst(n) {
  if (n == null || n === "") return "—";
  return `${Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} u`;
}
function valtInMaand(r, maand1) {
  if (r.frequentie === "maandelijks") return true;
  if (r.frequentie === "kwartaal") return [1, 4, 7, 10].includes(maand1);
  if (r.frequentie === "jaarlijks" || r.frequentie === "eenmalig") return Number(r.uitvoerMaand) === maand1;
  return false;
}
const doelFactor = (doel) => (doel == null ? 1 : (doel > 1 ? doel / 100 : doel));

export default function PlanningMaand() {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);
  const [alle, setAlle] = useState(false);
  const [roosterAan, setRoosterAan] = useState(true);
  const [doelAan, setDoelAan] = useState(true);
  const [teamFilter, setTeamFilter] = useState("alle");

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [statussen, setStatussen] = useState([]);     // beheer-statussen { sleutel, label, kleur }
  const [statusMap, setStatusMap] = useState({});     // handmatige status per periode: "acc|act|__status__" → { statusKey }
  const [statusBezig, setStatusBezig] = useState(null); // id van de regel waarvan de status wordt opgeslagen
  const [klantenMap, setKlantenMap] = useState({});
  const [capaciteit, setCapaciteit] = useState(null); // { werkdagen, normPerDag, medewerkers:[...] }
  const [alleMedewerkers, setAlleMedewerkers] = useState([]); // volledige lijst (niet gescoped) voor de verplaats-keuzelijst
  const [maandToewijzing, setMaandToewijzing] = useState({}); // { regelId: naam } — eenmalige verschuivingen deze maand
  const [toonAct, setToonAct] = useState(25); // paginagrootte "Ingeplande activiteiten"
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
      .then((d) => { setActiviteiten(d.activiteiten || []); setStatussen(d.statussen || []); })
      .catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten?alle=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { const bij = {}; (d.klanten || []).forEach((k) => { bij[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(bij); })
      .catch(() => setKlantenMap({}));
    // Volledige medewerkerslijst (alle actieve, niet gescoped op team) — voor de verplaats-keuzelijst,
    // zodat je altijd naar iedereen kunt verplaatsen, ook als de bezetting op jouw team gefilterd is.
    fetch("/api/mw-planning-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAlleMedewerkers(d.medewerkers || []))
      .catch(() => setAlleMedewerkers([]));
  }, []);

  useEffect(() => {
    setCapaciteit(null);
    fetch(`/api/mw-planning-capaciteit?maand=${maandStr}${alle ? "&scope=alle" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCapaciteit(d))
      .catch(() => setCapaciteit({ werkdagen: 0, normPerDag: 8, medewerkers: [] }));
  }, [maandStr, alle]);

  // Eenmalige (per-maand) verschuivingen ophalen voor de gekozen maand.
  useEffect(() => {
    fetch(`/api/mw-planning-maand-toewijzing?maand=${maandStr}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMaandToewijzing(d.toewijzingen || {}))
      .catch(() => setMaandToewijzing({}));
  }, [maandStr]);

  // Handmatige status per activiteit (deze maand) ophalen — voor het status-label/keuze in de tabel.
  useEffect(() => {
    fetch(`/api/mw-planning-deelactiviteiten?periode=${maandStr}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStatusMap(d.status || {}))
      .catch(() => setStatusMap({}));
  }, [maandStr]);
  const statusInfo = useMemo(() => Object.fromEntries((statussen || []).map((s) => [s.sleutel, s])), [statussen]);

  // Handmatige status van een config-regel zetten (deze maand), gekozen uit de beheer-statussen. "" wist.
  const zetItemStatus = async (i, statusKey) => {
    if (statusBezig) return;
    setStatusBezig(i.id);
    const key = `${i.acc}|${i.actSleutel}|__status__`;
    const vorige = statusMap;
    setStatusMap((p) => { const n = { ...p }; if (statusKey) n[key] = { statusKey }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "status", accountId: i.acc, activiteit: i.actSleutel, periode: maandStr, status: statusKey }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (e) { setStatusMap(vorige); setFout(e.message || "Status opslaan mislukt."); }
    finally { setStatusBezig(null); }
  };

  const { maanditems, zonderMaand, perMedewerker } = useMemo(() => {
    const maanditems = [], zonderMaand = [];
    const perMedewerker = {};
    // Rooster-index om een toewijzing te koppelen op systemuser-GUID (primair), anders e-mail, anders
    // naam. Zo landt "Wouter Alings AA" op dezelfde roosterregel als "Wouter Alings" — ongeacht een
    // afwijkende naam of e-mail — en verdwijnt "buiten rooster".
    const roosterOpId = new Map(), roosterOpEmail = new Map(), roosterOpNaam = new Map();
    for (const m of capaciteit?.medewerkers || []) {
      const idv = String(m.id || "").trim().toLowerCase();
      const em = String(m.email || "").trim().toLowerCase();
      const nm = String(m.naam || "").trim().toLowerCase();
      if (idv && !roosterOpId.has(idv)) roosterOpId.set(idv, m.naam || "");
      if (em && !roosterOpEmail.has(em)) roosterOpEmail.set(em, m.naam || "");
      if (nm && !roosterOpNaam.has(nm)) roosterOpNaam.set(nm, m.naam || "");
    }
    // Geef de canonieke roosternaam terug bij een match op GUID → e-mail → naam; zonder match de eigen
    // naam (die dan als 'buiten rooster' getoond wordt).
    const koppelAanRooster = (naam, email, id) => {
      const idv = String(id || "").trim().toLowerCase();
      if (idv && roosterOpId.has(idv)) return roosterOpId.get(idv);
      const em = String(email || "").trim().toLowerCase();
      if (em && roosterOpEmail.has(em)) return roosterOpEmail.get(em);
      const nm = String(naam || "").trim().toLowerCase();
      if (nm && roosterOpNaam.has(nm)) return roosterOpNaam.get(nm);
      return naam;
    };
    for (const r of config || []) {
      if (r.actief === false) continue;
      const act = activiteitById[r.activiteit];
      if (!act) continue;
      const klant = klantenMap[String(r.klantAccountId || "").toLowerCase()] || null;
      if (teamFilter !== "alle" && (klant?.team || "") !== teamFilter) continue;
      const override = (r.toegewezenAan || "").trim();
      const team = teamPersoonInfo(klant, act.rol); // { naam, email, id }
      // Rauwe (getoonde) naam + de GUID/e-mail die we kennen — alleen bij de Dynamics-rolpersoon, niet
      // bij een handmatig getypte override of eenmalige verschuiving (dat is vrije tekst zonder GUID).
      const vastNaamRauw = override || team.naam || "— niet toegewezen";
      const vastEmail = override ? "" : (team.email || "");
      const vastId = override ? "" : (team.id || "");
      const maandOverride = (maandToewijzing[r.id] || "").trim(); // eenmalige verschuiving deze maand
      const eenmalig = !!maandOverride;
      const rauweNaam = maandOverride || vastNaamRauw; // effectief deze maand: per-maand > vast > team
      const rauwEmail = maandOverride ? "" : vastEmail;
      const rauwId = maandOverride ? "" : vastId;
      // Identiteit waarop we optellen én die de bezettingsregel matcht: de roosternaam (op GUID/e-mail).
      const wie = koppelAanRooster(rauweNaam, rauwEmail, rauwId);
      const vastWie = koppelAanRooster(vastNaamRauw, vastEmail, vastId);
      const uren = Number(r.indicatieUren) || 0;
      const item = { id: r.id, acc: String(r.klantAccountId || "").toLowerCase(), actSleutel: r.activiteit,
        klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "",
        activiteit: act.label, frequentie: r.frequentie, uitvoerMaand: r.uitvoerMaand, indicatieUren: r.indicatieUren, uren, wie, vastWie, eenmalig,
        afwijkend: !!override && override.toLowerCase() !== (team.naam || "").toLowerCase() };
      if (valtInMaand(r, maand)) {
        maanditems.push(item);
        perMedewerker[wie] = (perMedewerker[wie] || 0) + uren;
      } else if ((r.frequentie === "jaarlijks" || r.frequentie === "eenmalig") && !r.uitvoerMaand) {
        zonderMaand.push(item);
      }
    }
    return { maanditems, zonderMaand, perMedewerker };
  }, [config, activiteitById, klantenMap, maand, teamFilter, maandToewijzing, capaciteit]);

  const teams = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.team).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")),
    [klantenMap]
  );

  const planningVoor = (naam) => {
    if (perMedewerker[naam] != null) return perMedewerker[naam];
    const laag = (naam || "").toLowerCase();
    const hit = Object.entries(perMedewerker).find(([n]) => n.toLowerCase() === laag);
    return hit ? hit[1] : 0;
  };

  const bezettingRijen = useMemo(() => {
    const werkdagen = capaciteit?.werkdagen || 0;
    const normPerDag = capaciteit?.normPerDag || 8;
    const mw = capaciteit?.medewerkers || [];
    const namenInRooster = new Set(mw.map((m) => (m.naam || "").toLowerCase()));
    const rijen = mw.map((m) => {
      const basis = roosterAan ? m.roosterUren : Math.round(werkdagen * normPerDag * 100) / 100;
      const naDoel = doelAan ? basis * doelFactor(m.declarabelDoel) : basis;
      const beschikbaar = Math.max(0, Math.round((naDoel - (m.verlofGoedgekeurd || 0)) * 100) / 100);
      return { naam: m.naam, beschikbaar, verlofGoedgekeurd: m.verlofGoedgekeurd || 0, verlofAangevraagd: m.verlofAangevraagd || 0,
        declarabelDoel: m.declarabelDoel, planning: planningVoor(m.naam), inRooster: true };
    });
    for (const [naam, uren] of Object.entries(perMedewerker)) {
      if (naam === "— niet toegewezen") { rijen.push({ naam, beschikbaar: 0, verlofGoedgekeurd: 0, verlofAangevraagd: 0, planning: uren, inRooster: false }); continue; }
      if (!namenInRooster.has(naam.toLowerCase())) rijen.push({ naam, beschikbaar: 0, verlofGoedgekeurd: 0, verlofAangevraagd: 0, planning: uren, inRooster: false });
    }
    return rijen.sort((a, b) => (b.planning - a.planning) || String(a.naam).localeCompare(String(b.naam), "nl"));
  }, [capaciteit, perMedewerker, roosterAan, doelAan]);

  // Uitklappen per medewerker + snel werk verplaatsen naar een andere medewerker.
  const [openMw, setOpenMw] = useState(() => new Set());
  const toggleMw = (naam) => setOpenMw((s) => { const n = new Set(s); if (n.has(naam)) n.delete(naam); else n.add(naam); return n; });
  const [verplaatsBezig, setVerplaatsBezig] = useState(null); // id van de regel die verplaatst wordt
  const [verplaatsFout, setVerplaatsFout] = useState("");
  const [regelBezig, setRegelBezig] = useState(null); // id van de regel die inline bewerkt wordt

  const medewerkerNamen = useMemo(() => {
    // Keuzelijst voor verplaatsen = ALLE actieve medewerkers (los van de team-scope), aangevuld met wie
    // in de bezetting/planning voorkomt. Zo kun je ook verplaatsen als je bezetting op je team staat.
    const s = new Set(alleMedewerkers.map((m) => m.naam).filter(Boolean));
    for (const m of capaciteit?.medewerkers || []) if (m.naam) s.add(m.naam);
    for (const r of bezettingRijen) if (r.naam && r.naam !== "— niet toegewezen") s.add(r.naam);
    return [...s].sort((a, b) => String(a).localeCompare(String(b), "nl"));
  }, [alleMedewerkers, capaciteit, bezettingRijen]);

  const itemsVoor = (naam) => {
    const lc = String(naam || "").toLowerCase();
    return maanditems.filter((i) => String(i.wie || "").toLowerCase() === lc);
  };

  // Zet de toegewezene van een config-regel om (""= terug naar het team). Optimistisch, met terugval.
  const verplaats = async (item, doelNaam) => {
    if (verplaatsBezig) return;
    const nieuwOverride = doelNaam || ""; // "" = terug naar team
    setVerplaatsBezig(item.id); setVerplaatsFout("");
    const vorigeConfig = config;
    setConfig((prev) => (prev || []).map((r) => (r.id === item.id ? { ...r, toegewezenAan: nieuwOverride } : r)));
    try {
      const res = await fetch("/api/mw-planning-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, toegewezenAan: nieuwOverride }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (e) {
      setConfig(vorigeConfig); // terugdraaien
      setVerplaatsFout(e.message || "Verplaatsen mislukt.");
    } finally {
      setVerplaatsBezig(null);
    }
  };

  // Een config-regel inline aanpassen (frequentie, uitvoermaand, indicatie-uren). Optimistisch, met
  // terugval. De maandplanning wordt hierna automatisch opnieuw afgeleid (een regel kan bv. door een
  // andere frequentie in/uit deze maand vallen).
  const wijzigConfigRegel = async (id, patch) => {
    if (regelBezig) return;
    setRegelBezig(id); setVerplaatsFout("");
    const vorigeConfig = config;
    setConfig((prev) => (prev || []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const res = await fetch("/api/mw-planning-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const bij = await res.json();
      setConfig((prev) => (prev || []).map((r) => (r.id === id ? bij : r)));
    } catch (e) {
      setConfig(vorigeConfig); // terugdraaien
      setVerplaatsFout(e.message || "Aanpassen mislukt.");
    } finally {
      setRegelBezig(null);
    }
  };

  // Eenmalig verschuiven: alleen voor DEZE maand, laat de vaste toewijzing ongemoeid. ""= herstel.
  const verplaatsEenmalig = async (item, doelNaam) => {
    if (verplaatsBezig) return;
    const naam = doelNaam || "";
    setVerplaatsBezig(item.id); setVerplaatsFout("");
    const vorige = maandToewijzing;
    setMaandToewijzing((prev) => { const n = { ...prev }; if (naam) n[item.id] = naam; else delete n[item.id]; return n; });
    try {
      const res = await fetch("/api/mw-planning-maand-toewijzing", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, maand: maandStr, naam }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (e) {
      setMaandToewijzing(vorige); // terugdraaien
      setVerplaatsFout(e.message || "Eenmalig verplaatsen mislukt.");
    } finally {
      setVerplaatsBezig(null);
    }
  };

  const vorige = () => { if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const totaalMaand = maanditems.reduce((s, i) => s + i.uren, 0);

  // Eén bewerkbare rij van de "Ingeplande activiteiten"-tabellen: frequentie, uitvoermaand (jaar/eenmalig),
  // uitvoerder (vast + eenmalig deze maand) en indicatie-uren allemaal inline aan te passen.
  const FREQ_OPTS = [["maandelijks", "Maandelijks"], ["kwartaal", "Per kwartaal"], ["jaarlijks", "Jaarlijks"], ["eenmalig", "Eenmalig"]];
  const kiesStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, background: "#fff", cursor: "pointer" };
  const rijBewerkbaar = (i) => {
    const jaarTaak = i.frequentie === "jaarlijks" || i.frequentie === "eenmalig";
    const bezigRij = regelBezig === i.id || verplaatsBezig === i.id;
    const anderen = medewerkerNamen.filter((n) => n.toLowerCase() !== String(i.wie || "").toLowerCase());
    return (
      <tr key={i.id} style={{ opacity: bezigRij ? 0.55 : 1 }}>
        <td style={td}><div style={{ fontWeight: 600 }}>{i.klantnummer}</div><div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{i.klantnaam}</div></td>
        <td style={td}>{i.activiteit}</td>
        <td style={td}>
          <select value={i.frequentie} disabled={bezigRij} onChange={(e) => wijzigConfigRegel(i.id, { frequentie: e.target.value })} style={kiesStijl}>
            {FREQ_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </td>
        <td style={td}>
          {jaarTaak ? (
            <select value={i.uitvoerMaand || ""} disabled={bezigRij} onChange={(e) => wijzigConfigRegel(i.id, { uitvoerMaand: e.target.value ? Number(e.target.value) : null })} style={kiesStijl}>
              <option value="">— kies —</option>
              {MAANDEN.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
            </select>
          ) : <span style={{ color: KLEUR.mutedTekst }}>n.v.t.</span>}
        </td>
        <td style={td}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div>
              <span style={{ color: i.afwijkend ? KLEUR.amber : KLEUR.tekst, fontWeight: i.afwijkend ? 700 : 400 }}>{i.wie}</span>
              {i.afwijkend && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: KLEUR.amber }}>afwijkend</span>}
              {i.eenmalig && <span title={`Vast toegewezen aan ${i.vastWie}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, padding: "1px 6px", borderRadius: 20 }}>eenmalig (vast: {i.vastWie})</span>}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ color: KLEUR.mutedTekst, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5 }} title="Verplaatst de vaste toewijzing — geldt elke maand.">
                vast →
                <select value="" disabled={bezigRij} onChange={(e) => { const v = e.target.value; if (v !== "") verplaats(i, v === "__team__" ? "" : v); }} style={kiesStijl}>
                  <option value="">verplaats…</option>
                  <option value="__team__">Team (standaard)</option>
                  {anderen.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={{ color: KLEUR.blauw, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5 }} title="Alleen voor de getoonde maand; de vaste toewijzing blijft ongewijzigd.">
                eenmalig →
                <select value="" disabled={bezigRij} onChange={(e) => { const v = e.target.value; if (v !== "") verplaatsEenmalig(i, v); }} style={kiesStijl}>
                  <option value="">deze maand…</option>
                  {anderen.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {i.eenmalig && <button onClick={() => verplaatsEenmalig(i, "")} disabled={bezigRij} title="Eenmalige verschuiving ongedaan maken (terug naar de vaste toewijzing)" style={{ background: "none", border: "none", color: KLEUR.blauw, fontSize: 11.5, cursor: "pointer" }}>↺ herstel</button>}
            </div>
          </div>
        </td>
        <td style={td}>
          <input type="number" min="0" step="0.25" defaultValue={i.indicatieUren == null ? "" : i.indicatieUren} disabled={bezigRij}
            key={`uren-${i.id}-${i.indicatieUren == null ? "" : i.indicatieUren}`}
            onBlur={(e) => { const v = e.target.value; if (String(v) !== String(i.indicatieUren ?? "")) wijzigConfigRegel(i.id, { indicatieUren: v === "" ? null : v }); }}
            title="Indicatie-uren voor deze regel" style={{ ...kiesStijl, width: 80, cursor: "text" }} />
        </td>
        <td style={td}>
          {statussen.length > 0 ? (() => {
            const sk = (statusMap[`${i.acc}|${i.actSleutel}|__status__`] || {}).statusKey || "";
            const si = sk ? statusInfo[sk] : null;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <select value={sk} disabled={statusBezig === i.id} onChange={(e) => zetItemStatus(i, e.target.value)} style={kiesStijl}>
                  <option value="">— geen —</option>
                  {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
                </select>
                {si && <span style={{ fontSize: 9.5, fontWeight: 700, color: si.kleur, background: `${si.kleur}18`, border: `1px solid ${si.kleur}55`, borderRadius: 20, padding: "1px 7px", whiteSpace: "nowrap", alignSelf: "flex-start" }}>{si.label}</span>}
              </div>
            );
          })() : <span style={{ color: KLEUR.mutedTekst }}>—</span>}
        </td>
      </tr>
    );
  };

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
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "8px 0 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span><strong>{urenTekst(totaalMaand)}</strong> ingepland deze maand</span>
        <span style={{ color: KLEUR.rand }}>|</span>
        {teams.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: KLEUR.subtekst }}>
            Team:
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "4px 8px", fontSize: 12, background: "#fff" }}>
              <option value="alle">alle</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        <ToggleKnop aan={roosterAan} setAan={setRoosterAan} label="Rooster" titel="Beschikbaar op basis van het werkrooster (parttime-factor) i.p.v. de volle norm" />
        <ToggleKnop aan={doelAan} setAan={setDoelAan} label="Declarabel-doel" titel="Beschikbaar × declarabel-doel % per medewerker" />
        <ScopeKnoppen kantoorbreed={alle} setKantoorbreed={setAlle} titel="Kantoorbreed: alle medewerkers i.p.v. alleen je eigen team (beheerder)" />
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>{fout}</div>}

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Bezetting per medewerker</span>
        <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>klik een medewerker open om zijn werk te zien en snel te verplaatsen</span>
      </div>
      {verplaatsFout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12.5 }}>Verplaatsen mislukt: {verplaatsFout}</div>}
      {capaciteit === null || config === null ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Laden…</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead><tr>
              <th style={th}>Medewerker</th><th style={th}>Planning (deze maand)</th><th style={th}>Beschikbaar</th>
              <th style={th}>Verlof goedgekeurd</th><th style={th}>Verlof aangevraagd</th><th style={th}>Bezetting</th>
            </tr></thead>
            <tbody>
              {bezettingRijen.flatMap((m) => {
                const pct = m.beschikbaar ? Math.round((m.planning / m.beschikbaar) * 100) : 0;
                const barKleur = pct > 100 ? KLEUR.rood : pct >= 80 ? KLEUR.amber : KLEUR.groen;
                const uitklapbaar = m.planning > 0;
                const open = openMw.has(m.naam);
                const rows = [
                  <tr key={m.naam} onClick={uitklapbaar ? () => toggleMw(m.naam) : undefined} style={{ cursor: uitklapbaar ? "pointer" : "default" }}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {uitklapbaar ? <ChevronRight size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} color={KLEUR.mutedTekst} /> : <span style={{ width: 14, display: "inline-block", flexShrink: 0 }} />}
                        <span>{m.naam}</span>
                        {!m.inRooster && m.naam !== "— niet toegewezen" && (
                          <span title="Niet gevonden in het rooster (mogelijk een afwijkende, vrije toewijzing)" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberAchtergrond, padding: "1px 6px", borderRadius: 20 }}><AlertTriangle size={10} /> buiten rooster</span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{urenTekst(m.planning)}</td>
                    <td style={td}>{m.inRooster ? urenTekst(m.beschikbaar) : "—"}{m.inRooster && m.declarabelDoel != null && doelAan ? <span style={{ color: KLEUR.mutedTekst, fontSize: 11 }}> ({Math.round(doelFactor(m.declarabelDoel) * 100)}%)</span> : null}</td>
                    <td style={td}>{m.verlofGoedgekeurd ? urenTekst(m.verlofGoedgekeurd) : "—"}</td>
                    <td style={td}>{m.verlofAangevraagd ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: KLEUR.amber, fontWeight: 600 }}><Plane size={12} /> {urenTekst(m.verlofAangevraagd)}</span> : "—"}</td>
                    <td style={td}>
                      {m.inRooster && m.beschikbaar ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ position: "relative", width: 120, height: 8, background: "#EEF0EC", borderRadius: 20, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(pct, 100)}%`, background: barKleur }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: barKleur }}>{pct}%</span>
                        </div>
                      ) : <span style={{ color: KLEUR.mutedTekst }}>—</span>}
                    </td>
                  </tr>,
                ];
                if (open) {
                  const items = itemsVoor(m.naam);
                  rows.push(
                    <tr key={m.naam + ":items"} style={{ background: "#FbFcFb" }}>
                      <td colSpan={6} style={{ padding: "4px 10px 12px 34px", borderBottom: `1px solid ${KLEUR.rand}` }}>
                        {items.length === 0 ? (
                          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "6px 0" }}>Geen activiteiten voor {m.naam} deze maand.</div>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              {items.map((it) => {
                                const kiesStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, background: "#fff", cursor: "pointer" };
                                return (
                                <tr key={it.id}>
                                  <td style={{ fontSize: 12, padding: "5px 8px", borderBottom: `1px solid ${KLEUR.rand}55` }}>
                                    <span style={{ fontWeight: 600 }}>{it.activiteit}</span>
                                    <span style={{ color: KLEUR.mutedTekst }}> · {it.klantnaam}{it.klantnummer ? ` (${it.klantnummer})` : ""}</span>
                                    {it.afwijkend && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: KLEUR.amber }}>afwijkend van team</span>}
                                    {it.eenmalig && <span title={`Vast toegewezen aan ${it.vastWie}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, padding: "1px 6px", borderRadius: 20 }}>eenmalig deze maand (vast: {it.vastWie})</span>}
                                  </td>
                                  <td style={{ fontSize: 12, padding: "5px 8px", borderBottom: `1px solid ${KLEUR.rand}55`, whiteSpace: "nowrap", textAlign: "right", fontWeight: 600, width: 70 }}>{urenTekst(it.uren)}</td>
                                  <td style={{ fontSize: 12, padding: "5px 8px", borderBottom: `1px solid ${KLEUR.rand}55`, whiteSpace: "nowrap", textAlign: "right" }}>
                                    <div style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                      <label style={{ color: KLEUR.mutedTekst, display: "inline-flex", alignItems: "center", gap: 4 }} title="Verplaatst de vaste toewijzing — geldt elke maand.">
                                        vast →
                                        <select value="" disabled={verplaatsBezig === it.id} onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => { const v = e.target.value; if (v !== "") verplaats(it, v === "__team__" ? "" : v); }} style={kiesStijl}>
                                          <option value="">verplaats…</option>
                                          <option value="__team__">Team (standaard)</option>
                                          {medewerkerNamen.filter((n) => n.toLowerCase() !== String(m.naam).toLowerCase()).map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                      </label>
                                      <label style={{ color: KLEUR.blauw, display: "inline-flex", alignItems: "center", gap: 4 }} title="Alleen voor deze maand; de vaste toewijzing blijft ongewijzigd.">
                                        eenmalig →
                                        <select value="" disabled={verplaatsBezig === it.id} onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => { const v = e.target.value; if (v !== "") verplaatsEenmalig(it, v); }} style={kiesStijl}>
                                          <option value="">deze maand…</option>
                                          {medewerkerNamen.filter((n) => n.toLowerCase() !== String(m.naam).toLowerCase()).map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                      </label>
                                      {it.eenmalig && <button onClick={(e) => { e.stopPropagation(); verplaatsEenmalig(it, ""); }} disabled={verplaatsBezig === it.id} title="Eenmalige verschuiving ongedaan maken (terug naar de vaste toewijzing)" style={{ background: "none", border: "none", color: KLEUR.blauw, fontSize: 11.5, cursor: "pointer" }}>↺ herstel</button>}
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
              {bezettingRijen.length === 0 && <tr><td colSpan={6} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 20 }}>Geen medewerkers/planning voor deze maand.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>Ingeplande activiteiten ({maanditems.length})</div>
      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: zonderMaand.length ? 20 : 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead><tr>
            <th style={th}>Klant</th><th style={th}>Activiteit</th><th style={th}>Frequentie</th><th style={th}>Uitvoermaand</th><th style={th}>Uitvoerder</th><th style={th}>Indicatie-uren</th><th style={th}>Status</th>
          </tr></thead>
          <tbody>
            {pagineer(maanditems, toonAct).map((i) => rijBewerkbaar(i))}
            {maanditems.length === 0 && <tr><td colSpan={7} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: 20 }}>Niets ingepland deze maand (op basis van de configuratie).</td></tr>}
          </tbody>
        </table>
      </div>
      {maanditems.length > 0 && <Paginatie totaal={maanditems.length} getoond={getoondAantal(maanditems.length, toonAct)} grootte={toonAct} setGrootte={setToonAct} eenheid="activiteiten" />}

      {zonderMaand.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px", color: KLEUR.amber }}>Jaar-/eenmalige taken zonder uitvoermaand ({zonderMaand.length})</div>
          <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 8 }}>Stel bij deze taken een uitvoermaand in op de klantkaart (Per klant), dan vallen ze automatisch in de juiste maand.</div>
          <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.amber}55`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
              <thead><tr>
                <th style={th}>Klant</th><th style={th}>Activiteit</th><th style={th}>Frequentie</th><th style={th}>Uitvoermaand</th><th style={th}>Uitvoerder</th><th style={th}>Indicatie-uren</th><th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {zonderMaand.map((i) => rijBewerkbaar(i))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
