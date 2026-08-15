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
import { useState, useEffect, useMemo, useRef } from "react";
import { ClipboardCheck, ChevronLeft, ChevronRight, ChevronDown, CheckSquare, Square, CheckCircle2, Loader2, Search, X, Users, Building2 } from "lucide-react";
import { useMijnNaam } from "../MijnFilter";
import UrenSchrijvenPanel from "../UrenSchrijvenPanel";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", roodBg: "#FBEAEA", roodRand: "#EAC4C4",
  groen: "#2E7D46", groenBg: "#E7F3EB", groenRand: "#BFE3C9",
  amber: "#A9660C", amberBg: "#FFF4E5", amberRand: "#F2D9A8", lichtblauw: "#EAF2F8",
};
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
// De uit de deelstappen AFGELEIDE status (bepaalt ook de celkleur) — staat in het statusfilter boven
// de handmatige beheer-statussen. Sleutels moeten los blijven van de beheer-statussleutels.
const AFGELEIDE_STATUSSEN = [["open", "Open"], ["bezig", "Bezig"], ["gereed", "Gereed"]];
// Rij- en kopje-stijl in de "Werk van"-combobox.
const werkVanRij = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 12.5, cursor: "pointer", color: "#1C2321" };
const werkVanKopje = { padding: "8px 10px 3px", fontSize: 10.5, fontWeight: 700, color: "#8A9089", textTransform: "uppercase", letterSpacing: ".03em" };
const MAAND_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
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

export default function MijnWerk({ isBeheerder = false, magAftekenen = true } = {}) {
  const nu = new Date();
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  // Beheerders mogen ook het werk van een ANDERE medewerker bekijken/aftekenen ("" = mijzelf).
  const [bekeken, setBekeken] = useState("");
  // Klantgroep-verfijning: beperkt het getoonde werk tot de klanten in die groep. Staat LOS van de
  // medewerker-keuze (ze zijn combineerbaar) en is voor iedereen beschikbaar — ook een gewone
  // medewerker mag zijn eigen werk tot één klantgroep beperken.
  const [bekekenGroep, setBekekenGroep] = useState("");
  const [medewerkerLijst, setMedewerkerLijst] = useState([]);
  // Type-to-search combobox voor "Werk van" (medewerkers + klantgroepen in één lijst).
  const [werkVanOpen, setWerkVanOpen] = useState(false);
  const [werkVanZoek, setWerkVanZoek] = useState("");
  const werkVanRef = useRef(null);
  const [type, setType] = useState("maand"); // maand | jaar
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);

  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [statussen, setStatussen] = useState([]);      // { sleutel, label, kleur } — beheer-statussen
  const [klantenMap, setKlantenMap] = useState({});
  const [status, setStatus] = useState({});            // { "acc|act|deel" of "acc|act|__status__": {...} }
  const [klantDeelstappen, setKlantDeelstappen] = useState({}); // { "acc|act": [ {sleutel,label} ] }
  const [bezig, setBezig] = useState("");              // key die nu wordt opgeslagen
  const [fout, setFout] = useState("");

  // Filters + actieve cel (uitgeklapte deelstappen).
  const [klantZoek, setKlantZoek] = useState("");
  // Statusfilter: "" = alles. Eén gecombineerde lijst — de afgeleide status uit de deelstappen
  // ("open"/"bezig"/"gereed"), de handmatige beheer-statussen (op sleutel), en "__geen__" voor taken
  // zónder handmatig statuslabel.
  const [statusFilter, setStatusFilter] = useState("");
  const [verborgenTaken, setVerborgenTaken] = useState(() => new Set()); // hoofdtaken (kolommen) die verborgen zijn
  const [alleenOpen, setAlleenOpen] = useState(false);
  const [actieveCel, setActieveCel] = useState(null);  // { acc, actSleutel } of null

  const periode = type === "maand" ? `${jaar}-${pad(maand)}` : `${jaar}`;
  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);
  const activiteitOrder = useMemo(() => Object.fromEntries(activiteiten.map((a, i) => [a.sleutel, i])), [activiteiten]);
  const statusInfo = useMemo(() => Object.fromEntries((statussen || []).map((s) => [s.sleutel, s])), [statussen]);
  // Wiens werk tonen we? Standaard mijzelf; een beheerder kan een andere medewerker kiezen.
  const bekekenNaam = isBeheerder && bekeken ? bekeken : (mijnNaam || "");
  const bekekenLc = String(bekekenNaam).trim().toLowerCase();
  // Klantgroep-verfijning actief? (Niet beheerder-gated: geldt voor iedereen.)
  const groepActief = !!bekekenGroep;

  useEffect(() => {
    fetch("/api/mw-planning-config").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setConfig(d.config || [])).catch(() => { setConfig([]); setFout("Configuratie kon niet worden geladen."); });
    fetch("/api/mw-planning-overzicht").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setActiviteiten(d.activiteiten || []); setStatussen(d.statussen || []); }).catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten?alle=1").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const b = {}; (d.klanten || []).forEach((k) => { b[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(b); }).catch(() => setKlantenMap({}));
    // Alleen beheerders: de medewerkerslijst voor de "werk van"-keuze.
    if (isBeheerder) {
      fetch("/api/mw-planning-medewerkers").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setMedewerkerLijst((d.medewerkers || []).map((m) => m.naam).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "nl")))).catch(() => setMedewerkerLijst([]));
    }
  }, [isBeheerder]);

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
    if (!config || !bekekenLc) return [];
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
      // Jaar-weergave: filter op de ingeplande maand (uitvoermaand) — net als de maand-weergave, maar dan
      // voor jaartaken. Taken zónder ingestelde uitvoermaand tonen we altijd (ze horen bij geen enkele
      // maand en zouden anders overal verdwijnen), gemarkeerd als "geen maand".
      if (type === "jaar" && r.uitvoerMaand && Number(r.uitvoerMaand) !== maand) continue;
      const acc = String(r.klantAccountId || "").toLowerCase();
      const klant = klantenMap[acc] || null;
      const wie = (r.toegewezenAan || "").trim() || teamPersoon(klant, act.rol);
      if (String(wie || "").trim().toLowerCase() !== bekekenLc) continue;
      // Klantgroep-verfijning: beperk hetzelfde werk tot de klanten in de gekozen groep.
      if (groepActief && (klant?.groepsnaam || "") !== bekekenGroep) continue;
      const dubbelKey = `${acc}|${act.sleutel}`;
      if (seen.has(dubbelKey)) continue;
      seen.add(dubbelKey);
      const eff = effDeelstappen(acc, act.sleutel);
      const total = eff.length;
      const done = total ? eff.filter((d) => stFor(acc, act.sleutel, d.sleutel)?.gereed).length : 0;
      const gereed = total ? done === total : !!stFor(acc, act.sleutel, "__hoofd__")?.gereed;
      const statusKey = (status[`${acc}|${act.sleutel}|__status__`] || {}).statusKey || "";
      if (statusFilter) {
        // Eén filter over twee soorten status: de afgeleide (uit de deelstappen) en de handmatige
        // (het beheer-statuslabel). "__geen__" = juist de taken zónder handmatig label.
        const afgeleid = gereed ? "gereed" : done > 0 ? "bezig" : "open";
        const past = statusFilter === "__geen__" ? !statusKey
          : AFGELEIDE_STATUSSEN.some(([k]) => k === statusFilter) ? afgeleid === statusFilter
          : statusKey === statusFilter;
        if (!past) continue;
      }
      rijen.push({
        key: dubbelKey, acc, accountId: klant?.accountId || r.klantAccountId || "", actSleutel: act.sleutel, act, eff, done, total, gereed, uitvoerMaand: r.uitvoerMaand,
        statusKey,
        klantnaam: klant?.klantnaam || "Onbekende klant", klantnummer: klant?.klantnummer || "", klantgroep: klant?.groepsnaam || "",
      });
    }
    return rijen;
  }, [config, activiteitById, klantenMap, klantDeelstappen, status, type, maand, bekekenLc, groepActief, bekekenGroep, statusFilter]);

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

  // Alle klantgroepen uit de KLANTENLIJST (niet uit de zichtbare rijen) — anders zou je alleen de
  // groepen kunnen kiezen die al in je eigen werk voorkomen.
  const alleKlantgroepen = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.groepsnaam).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")),
    [klantenMap]
  );

  // "Werk van"-combobox: medewerkers + klantgroepen, gefilterd op wat je typt.
  const werkVanFilter = werkVanZoek.trim().toLowerCase();
  const werkVanMedewerkers = useMemo(
    () => medewerkerLijst.filter((n) => n.toLowerCase() !== String(mijnNaam || "").toLowerCase() && (!werkVanFilter || n.toLowerCase().includes(werkVanFilter))),
    [medewerkerLijst, mijnNaam, werkVanFilter]
  );
  const werkVanGroepen = useMemo(
    () => alleKlantgroepen.filter((g) => !werkVanFilter || g.toLowerCase().includes(werkVanFilter)),
    [alleKlantgroepen, werkVanFilter]
  );
  // Persoon en klantgroep zijn twee losse assen die tegelijk actief mogen zijn ("werk van Jan, binnen
  // klantgroep X"). Het label toont beide; wie geen beheerder is, ziet alleen het groep-deel.
  const persoonLabel = bekeken || (isBeheerder ? `Mijzelf${mijnNaam ? ` (${mijnNaam})` : ""}` : "");
  const werkVanLabel = [persoonLabel, bekekenGroep].filter(Boolean).join(" · ") || "Alle klantgroepen";
  const kiesWerkVan = (soort, waarde) => {
    if (soort === "medewerker") setBekeken(waarde);      // "" = mijzelf
    else setBekekenGroep(waarde);                        // "" = alle klantgroepen
    setActieveCel(null);
    setWerkVanOpen(false);
    setWerkVanZoek("");
  };

  // Klik buiten de combobox = sluiten (en de typtekst wissen, zodat je bij heropenen alles ziet).
  useEffect(() => {
    if (!werkVanOpen) return;
    const buiten = (e) => { if (werkVanRef.current && !werkVanRef.current.contains(e.target)) { setWerkVanOpen(false); setWerkVanZoek(""); } };
    document.addEventListener("mousedown", buiten);
    return () => document.removeEventListener("mousedown", buiten);
  }, [werkVanOpen]);

  const zichtbareRijen = useMemo(() => {
    const q = klantZoek.trim().toLowerCase();
    return klantRijen.filter((k) => {
      if (q && !`${k.klantnaam} ${k.klantnummer}`.toLowerCase().includes(q)) return false;
      if (alleenOpen) {
        const relevante = zichtbareTaken.map((t) => k.taken[t.sleutel]).filter(Boolean);
        if (relevante.length && relevante.every((it) => it.gereed)) return false;
      }
      return true;
    });
  }, [klantRijen, klantZoek, alleenOpen, zichtbareTaken]);

  const totaalCellen = items.length;
  const gereedCellen = items.filter((i) => i.gereed).length;

  // De aangeklikte cel (voor de aftekenen-popup) — live afgeleid, zodat de status meebeweegt met afvinken.
  const actieveRij = actieveCel ? klantRijen.find((r) => r.acc === actieveCel.acc) : null;
  const actiefItem = actieveRij ? actieveRij.taken[actieveCel.actSleutel] : null;
  const actieveStatus = actiefItem ? celStatus(actiefItem) : null;
  const STATUS_LABEL = { open: "Open", bezig: "Bezig", gereed: "Gereed" };

  const afvink = async (acc, actSleutel, deelSleutel, gereed) => {
    // Alleen-lezen rol: hard blokkeren, niet alleen de knop uitzetten.
    if (!magAftekenen) return;
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

  // Handmatige status (extra label) zetten voor (klant × hoofdtaak × periode), gekozen uit de beheer-
  // statussen. Los van het afvinken van deelstappen; "" wist de status. Optimistisch, met terugval.
  const zetItemStatus = async (acc, actSleutel, statusKey) => {
    // Alleen-lezen rol: hard blokkeren, niet alleen de keuzelijst uitzetten.
    if (!magAftekenen) return;
    setFout("");
    const key = `${acc}|${actSleutel}|__status__`;
    const vorige = status;
    setStatus((p) => { const n = { ...p }; if (statusKey) n[key] = { statusKey, wie: mijnNaam || "(jij)", datum: new Date().toISOString() }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "status", accountId: acc, activiteit: actSleutel, periode, status: statusKey }),
      });
      if (!res.ok) { const msg = res.status === 403 ? "Je hebt (nog) geen recht om de planning bij te werken." : ((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); throw new Error(msg); }
    } catch (e) { setStatus(vorige); setFout(e.message || "Status opslaan mislukt."); }
  };

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const toggleTaak = (sleutel) => setVerborgenTaken((s) => { const n = new Set(s); if (n.has(sleutel)) n.delete(sleutel); else n.add(sleutel); return n; });
  const filterActief = !!klantZoek.trim() || !!bekekenGroep || verborgenTaken.size > 0 || alleenOpen || !!statusFilter;

  const laden = config === null || !naamGeladen;

  const kop = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const cel = { padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <ClipboardCheck size={17} color={KLEUR.blauw} /> {isBeheerder && bekeken ? "Werk van" : "Mijn werk"}{bekekenNaam ? <span style={{ fontSize: 12.5, fontWeight: 500, color: KLEUR.mutedTekst }}>· {bekekenNaam}</span> : null}{groepActief ? <span style={{ fontSize: 12.5, fontWeight: 500, color: KLEUR.mutedTekst }}> · {bekekenGroep}</span> : null}{isBeheerder && bekeken ? <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 20, padding: "2px 8px", marginLeft: 6 }}>als beheerder</span> : null}{!magAftekenen ? <span title="Je rol staat 'Mijn werk' op alleen-lezen; aftekenen is uitgeschakeld." style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, borderRadius: 20, padding: "2px 8px", marginLeft: 6 }}>alleen-lezen</span> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: type === "maand" ? 150 : 60, textAlign: "center" }}>{type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : jaar}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
          {type === "jaar" && (
            <select value={maand} onChange={(e) => setMaand(Number(e.target.value))} title="Filter op ingeplande maand (standaard: huidige maand)" style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: "#fff", cursor: "pointer" }}>
              {MAANDEN.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Bovenbalk: periode-type + filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        {/* Zoek-en-kies: klantgroep voor iedereen, medewerker-namen alleen voor beheerders. */}
        <div ref={werkVanRef} style={{ position: "relative", fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isBeheerder ? "Werk van" : "Klantgroep"}
            <button
              onClick={() => { setWerkVanOpen((o) => !o); setWerkVanZoek(""); }}
              title={isBeheerder ? "Kies een medewerker en/of een klantgroep — typ om te zoeken" : "Beperk je werk tot één klantgroep — typ om te zoeken"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 190, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: (bekeken || bekekenGroep) ? KLEUR.lichtblauw : "#fff", color: (bekeken || bekekenGroep) ? KLEUR.blauw : KLEUR.tekst, fontWeight: (bekeken || bekekenGroep) ? 700 : 400, cursor: "pointer", textAlign: "left" }}
            >
              {bekekenGroep ? <Building2 size={13} /> : bekeken ? <Users size={13} /> : null}
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{werkVanLabel}</span>
              <ChevronDown size={14} color={KLEUR.mutedTekst} />
            </button>
            {werkVanOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 62, zIndex: 30, width: 280, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.10)", overflow: "hidden" }}>
                <div style={{ position: "relative", padding: 8, borderBottom: `1px solid ${KLEUR.rand}` }}>
                  <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    autoFocus
                    value={werkVanZoek}
                    onChange={(e) => setWerkVanZoek(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setWerkVanOpen(false); setWerkVanZoek(""); } }}
                    placeholder={isBeheerder ? "Zoek medewerker of klantgroep…" : "Zoek klantgroep…"}
                    style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px 6px 26px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 7 }}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto", padding: 4 }}>
                  {/* Medewerker-deel: alleen voor beheerders. Klantgroep-deel: voor iedereen. */}
                  {isBeheerder && (
                    <>
                      <button onClick={() => kiesWerkVan("medewerker", "")} style={{ ...werkVanRij, fontWeight: !bekeken ? 700 : 400 }}>
                        Mijzelf{mijnNaam ? ` (${mijnNaam})` : ""}
                      </button>
                      {werkVanMedewerkers.length > 0 && <div style={werkVanKopje}>Medewerkers</div>}
                      {werkVanMedewerkers.map((n) => (
                        <button key={`mw-${n}`} onClick={() => kiesWerkVan("medewerker", n)} style={{ ...werkVanRij, fontWeight: bekeken === n ? 700 : 400, color: bekeken === n ? KLEUR.blauw : KLEUR.tekst }}>{n}</button>
                      ))}
                    </>
                  )}
                  <div style={werkVanKopje}>Klantgroepen</div>
                  <button onClick={() => kiesWerkVan("klantgroep", "")} style={{ ...werkVanRij, fontWeight: !bekekenGroep ? 700 : 400 }}>Alle klantgroepen</button>
                  {werkVanGroepen.map((g) => (
                    <button key={`gr-${g}`} onClick={() => kiesWerkVan("klantgroep", g)} style={{ ...werkVanRij, fontWeight: bekekenGroep === g ? 700 : 400, color: bekekenGroep === g ? KLEUR.blauw : KLEUR.tekst }}>{g}</button>
                  ))}
                  {werkVanGroepen.length === 0 && (isBeheerder ? werkVanMedewerkers.length === 0 : true) && (
                    <div style={{ padding: "8px 10px", fontSize: 12, color: KLEUR.mutedTekst }}>Niets gevonden.</div>
                  )}
                </div>
              </div>
            )}
        </div>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={klantZoek} onChange={(e) => setKlantZoek(e.target.value)} placeholder="Zoek op klant of klantnummer…" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }} />
        </div>
        <label style={{ fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }} title="Filter op status: bovenaan de status uit de deelstappen, daaronder de handmatige statuslabels uit Beheer → Planning">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: statusFilter ? KLEUR.lichtblauw : "#fff", color: statusFilter ? KLEUR.blauw : KLEUR.tekst, fontWeight: statusFilter ? 700 : 400, cursor: "pointer" }}>
            <option value="">Alle</option>
            <optgroup label="Voortgang">
              {AFGELEIDE_STATUSSEN.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </optgroup>
            {statussen.length > 0 && (
              <optgroup label="Statuslabel">
                {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
              </optgroup>
            )}
            <optgroup label="Overig">
              <option value="__geen__">— geen status —</option>
            </optgroup>
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: KLEUR.subtekst }}>
          <input type="checkbox" checked={alleenOpen} onChange={(e) => setAlleenOpen(e.target.checked)} /> Alleen openstaand
        </label>
        {filterActief && <button onClick={() => { setKlantZoek(""); setBekekenGroep(""); setVerborgenTaken(new Set()); setAlleenOpen(false); setStatusFilter(""); }} style={{ padding: "6px 10px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Filters wissen</button>}
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
      ) : !bekekenLc ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Je naam kon niet worden bepaald, dus je toegewezen werk kan niet worden getoond. Log opnieuw in of neem contact op met beheer.</div>
      ) : klantRijen.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Er is voor deze periode niets aan {isBeheerder && bekeken ? bekekenNaam : "jou"} toegewezen{groepActief ? ` binnen klantgroep ${bekekenGroep}` : ""}{statusFilter ? " met deze status" : ""}.</div>
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
                          {it.statusKey && statusInfo[it.statusKey] && (
                            <div style={{ marginTop: 3 }}>
                              <span style={{ display: "inline-block", fontSize: 9.5, fontWeight: 700, color: statusInfo[it.statusKey].kleur || KLEUR.mutedTekst, background: `${statusInfo[it.statusKey].kleur || KLEUR.mutedTekst}18`, border: `1px solid ${statusInfo[it.statusKey].kleur || KLEUR.rand}55`, borderRadius: 20, padding: "1px 7px", whiteSpace: "nowrap" }}>
                                {statusInfo[it.statusKey].label}
                              </span>
                            </div>
                          )}
                          {type === "jaar" && (
                            <div style={{ fontSize: 10, color: it.uitvoerMaand ? KLEUR.mutedTekst : KLEUR.amber, marginTop: 3, whiteSpace: "nowrap" }}>
                              {it.uitvoerMaand ? MAAND_KORT[it.uitvoerMaand - 1] : "geen maand"}
                            </div>
                          )}
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
        Klanten in de rijen, jouw hoofdtaken in de kolommen. De kleur toont de status: <span style={{ color: KLEUR.rood, fontWeight: 700 }}>open</span>, <span style={{ color: KLEUR.amber, fontWeight: 700 }}>bezig</span> of <span style={{ color: KLEUR.groen, fontWeight: 700 }}>gereed</span>. Klik een cel om af te tekenen; is alles gereed, dan schrijf je gelijk je uren op de klant. In de jaar-weergave filter je met de maand-keuze (standaard de huidige maand) op de ingeplande maand; jaartaken zonder ingestelde maand blijven altijd staan.
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
              {statussen.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${KLEUR.rand}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Status</span>
                  <select value={actiefItem.statusKey || ""} disabled={!magAftekenen} onChange={(e) => zetItemStatus(actieveRij.acc, actiefItem.actSleutel, e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, background: "#fff", cursor: magAftekenen ? "pointer" : "default", opacity: magAftekenen ? 1 : 0.6 }}>
                    <option value="">— geen (kleur volgt de deelstappen) —</option>
                    {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
                  </select>
                  {actiefItem.statusKey && statusInfo[actiefItem.statusKey] && (
                    <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, color: statusInfo[actiefItem.statusKey].kleur, background: `${statusInfo[actiefItem.statusKey].kleur}18`, border: `1px solid ${statusInfo[actiefItem.statusKey].kleur}55`, borderRadius: 20, padding: "2px 9px" }}>{statusInfo[actiefItem.statusKey].label}</span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Deelstappen</div>
              {(actiefItem.total === 0 ? [{ sleutel: "__hoofd__", label: `${actiefItem.act.label} afgewikkeld` }] : actiefItem.eff).map((d) => {
                const s = stFor(actieveRij.acc, actiefItem.actSleutel, d.sleutel);
                const gereed = !!s?.gereed;
                const key = `${actieveRij.acc}|${actiefItem.actSleutel}|${d.sleutel}`;
                return (
                  <div key={d.sleutel} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: `1px solid ${KLEUR.rand}55`, borderLeft: d.kleur ? `3px solid ${d.kleur}` : "3px solid transparent", paddingLeft: 8 }}>
                    <button disabled={bezig === key || !magAftekenen} onClick={() => afvink(actieveRij.acc, actiefItem.actSleutel, d.sleutel, !gereed)} title={!magAftekenen ? "Je mag hier alleen lezen" : undefined} style={{ background: "none", border: "none", cursor: (bezig === key || !magAftekenen) ? "default" : "pointer", color: gereed ? KLEUR.groen : KLEUR.mutedTekst, opacity: !magAftekenen ? 0.5 : 1, padding: 0, display: "inline-flex" }}>
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
