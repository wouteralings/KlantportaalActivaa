import { useEffect, useMemo, useRef, useState } from "react";
import { Search, RefreshCw, Loader2, FileText, AlertTriangle, Plus, ChevronUp, ChevronDown, Star } from "lucide-react";
import ScopeToggle, { useMijnNaam, isKlantVanMij } from "../MijnFilter";

/**
 * Brievenlogboek — medewerkersportaal → Klantoverzicht → Brieven.
 * Eén centraal, filterbaar overzicht van álle verstuurde brieven (uit /api/brief-log), met dezelfde
 * look-and-feel als de dossieroverzichten (IB/VPB): "Mijn cliënten / Kantoorbreed", zoeken, zelf
 * kolommen kiezen + volgorde, opgeslagen weergaven, sorteren/filteren via het kolomkop-menu,
 * filter-chips en paginering 25/50/100/250/500/Alle. De link opent de brief in het SharePoint-dossier.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const ACTIE_LABEL = { mail: "Gemaild", dossier: "In dossier", backoffice: "Backoffice" };
const SCHERM = "brieven-log"; // eigen namespace voor opgeslagen weergaven (zie api/_gedeeld/weergaven.js)

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function briefDatum(iso) { try { return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } }

// Kolommen van het logboek. `cel` levert de tekst voor tonen/filteren; `sortCel` (optioneel) de
// waarde waarop gesorteerd wordt (bij de datum de ruwe ISO-string, zodat chronologisch i.p.v. op
// de geformatteerde tekst gesorteerd wordt).
const KOLOMMEN = [
  { key: "datum", label: "Datum", cel: (b) => briefDatum(b.verzondenOp), sortCel: (b) => String(b.verzondenOp || "") },
  { key: "kenmerk", label: "Kenmerk", cel: (b) => veiligeStr(b.kenmerk) },
  { key: "klantnaam", label: "Cliënt", cel: (b) => veiligeStr(b.klantnaam) },
  { key: "klantnummer", label: "Cliëntnr.", cel: (b) => veiligeStr(b.klantnummer) },
  { key: "onderwerp", label: "Onderwerp", cel: (b) => veiligeStr(b.betreft) || veiligeStr(b.sjabloonnaam) },
  { key: "ontvanger", label: "Ontvanger", cel: (b) => veiligeStr(b.ontvangerNaam) || veiligeStr(b.naar) },
  { key: "wijze", label: "Wijze", cel: (b) => ACTIE_LABEL[b.actie] || veiligeStr(b.actie) },
  { key: "door", label: "Door", cel: (b) => veiligeStr(b.medewerker) },
];
const KOLOMMEN_STANDAARD_VERBORGEN = []; // alle kolommen standaard zichtbaar
const kolomVan = (key) => KOLOMMEN.find((c) => c.key === key);
const alleKeys = KOLOMMEN.map((c) => c.key);

export default function BrievenLogboek({ onNieuweBrief }) {
  const [brieven, setBrieven] = useState(null); // null = laden
  const [klantMap, setKlantMap] = useState(null); // accountId(lowercase) → klant (voor "Mijn cliënten")
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [zoek, setZoek] = useState("");
  const [kolomFilters, setKolomFilters] = useState({}); // { kolomKey: waarde | {bevat} }
  const [sortKey, setSortKey] = useState("datum");
  const [sortDir, setSortDir] = useState("desc"); // nieuwste eerst
  const [toonAantal, setToonAantal] = useState(50);
  const [zichtbareKolommen, setZichtbareKolommen] = useState(null); // null = standaard
  const [kolomVolgorde, setKolomVolgorde] = useState(null); // null = standaard KOLOMMEN-volgorde
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [menu, setMenu] = useState(null); // { key, x, y } — geopend kolomkop-menu
  const [menuZoek, setMenuZoek] = useState("");
  const [weergaven, setWeergaven] = useState([]); // [{ naam, config }]
  const [actieveWeergave, setActieveWeergave] = useState("");
  const [weergaveFout, setWeergaveFout] = useState(false);
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const [scope, setScope] = useState("mijn"); // "mijn" | "alle"
  const geladenRef = useRef(false);
  const autoOpslaanTimerRef = useRef(null);

  async function laad() {
    setBezig(true); setFout("");
    try {
      const res = await fetch("/api/brief-log");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Kon het logboek niet laden (${res.status}).`);
      setBrieven(Array.isArray(d.brieven) ? d.brieven : []);
    } catch (e) { setBrieven([]); setFout(String(e.message || e)); }
    finally { setBezig(false); }
  }

  useEffect(() => {
    laad();
    // Klanten ophalen voor het "Mijn cliënten"-filter: brieven dragen alleen accountId, de rolvelden
    // (accountant/assistent/…) staan op de klant. We koppelen op accountId (lowercase).
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const map = new Map();
        for (const k of d.klanten || []) {
          const id = String(k.accountId || k.id || "").trim().toLowerCase();
          if (id) map.set(id, k);
        }
        setKlantMap(map);
      })
      .catch(() => setKlantMap(new Map()));
    // Opgeslagen weergaven + laatste stand ophalen (per-scherm namespace).
    fetch(`/api/medewerker-weergaven?scherm=${encodeURIComponent(SCHERM)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const views = d.views || [];
        setWeergaven(views);
        const standaard = views.find((v) => v.config && v.config.standaard);
        if (standaard) { setActieveWeergave(standaard.naam); pasWeergaveToe(standaard.config); }
        else if (d.laatst) pasWeergaveToe(d.laatst);
      })
      .catch(() => setWeergaven([]))
      .finally(() => { geladenRef.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setZichtbareKolommen((huidig) => huidig || new Set(alleKeys.filter((key) => !KOLOMMEN_STANDAARD_VERBORGEN.includes(key))));
  }, []);
  const zichtbareSet = zichtbareKolommen || new Set(alleKeys.filter((key) => !KOLOMMEN_STANDAARD_VERBORGEN.includes(key)));

  // Volgorde waarin kolommen getoond worden (kolomkiezer + tabel): eigen volgorde (indien gezet) +
  // eventuele nog niet gerangschikte kolommen erachter, zodat een oude weergave niets laat verdwijnen.
  const geordendeKolommen = useMemo(() => {
    const basis = (kolomVolgorde || []).filter((k) => alleKeys.includes(k));
    const missend = alleKeys.filter((k) => !basis.includes(k));
    return [...basis, ...missend].map((k) => kolomVan(k)).filter(Boolean);
  }, [kolomVolgorde]);
  const verplaatsKolom = (key, richting) => {
    const basis = geordendeKolommen.map((k) => k.key);
    const i = basis.indexOf(key);
    const j = i + richting;
    if (i === -1 || j < 0 || j >= basis.length) return;
    const nieuw = [...basis];
    [nieuw[i], nieuw[j]] = [nieuw[j], nieuw[i]];
    setKolomVolgorde(nieuw);
  };

  // Auto-opslaan van de niet-benoemde stand (kolommen/volgorde/filters/sortering/aantal), gedebiseerd.
  useEffect(() => {
    if (!geladenRef.current) return;
    clearTimeout(autoOpslaanTimerRef.current);
    autoOpslaanTimerRef.current = setTimeout(() => {
      fetch("/api/medewerker-weergaven", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scherm: SCHERM, laatst: { kolommen: [...zichtbareSet], volgorde: geordendeKolommen.map((k) => k.key), filters: kolomFilters, sortKey, sortDir, toonAantal } }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(autoOpslaanTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zichtbareKolommen, kolomVolgorde, kolomFilters, sortKey, sortDir, toonAantal]);

  useEffect(() => { setToonAantal((n) => n); }, [zoek]); // zoek reset niet de paginering (dossiers-stijl gebruikt "toon N")

  const lijst = brieven || [];
  const term = zoek.trim().toLowerCase();
  const mijnLc = mijnNaam.trim().toLowerCase();
  const isBriefVanMij = (b) => {
    if (!mijnLc || !klantMap) return false;
    const k = klantMap.get(String(b.accountId || "").trim().toLowerCase());
    return !!k && isKlantVanMij(k, mijnNaam);
  };
  const gefilterd = lijst.filter((b) => {
    if (scope === "mijn" && mijnNaam && !isBriefVanMij(b)) return false;
    for (const [key, val] of Object.entries(kolomFilters)) {
      if (!val) continue;
      const kol = kolomVan(key);
      if (!kol) continue;
      const cel = kol.cel(b);
      if (typeof val === "object" && val.bevat) {
        if (!String(cel).toLowerCase().includes(val.bevat.toLowerCase())) return false;
      } else if (cel !== val) {
        return false;
      }
    }
    if (term) {
      const raak = KOLOMMEN.map((k) => k.cel(b)).filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
      if (!raak) return false;
    }
    return true;
  });
  const filterActief = Object.values(kolomFilters).some(Boolean) || !!term;

  const sortKol = kolomVan(sortKey) || kolomVan("datum");
  const sortWaarde = (b) => (sortKol.sortCel ? sortKol.sortCel(b) : sortKol.cel(b));
  const gesorteerd = [...gefilterd].sort((x, y) => {
    const c = String(sortWaarde(x)).localeCompare(String(sortWaarde(y)), "nl", { numeric: true, sensitivity: "base" });
    return sortDir === "asc" ? c : -c;
  });
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const zichtbaar = gesorteerd.slice(0, toonAantal);
  const zichtKols = geordendeKolommen.filter((c) => zichtbareSet.has(c.key));

  const openKopMenu = (e, key) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuZoek("");
    setMenu((m) => (m && m.key === key ? null : { key, x: r.left, y: r.bottom }));
  };
  const wisAllesFilters = () => { setKolomFilters({}); setZoek(""); };

  // Opgeslagen weergaven (persoonlijk): kolommen + volgorde + filters + sortering + aantal regels.
  const huidigeConfig = () => ({ kolommen: [...zichtbareSet], volgorde: geordendeKolommen.map((k) => k.key), filters: kolomFilters, sortKey, sortDir, toonAantal });
  function pasWeergaveToe(cfg) {
    if (!cfg) return;
    if (Array.isArray(cfg.kolommen)) setZichtbareKolommen(new Set(cfg.kolommen));
    if (Array.isArray(cfg.volgorde)) setKolomVolgorde(cfg.volgorde);
    setKolomFilters(cfg.filters || {});
    if (cfg.sortKey) setSortKey(cfg.sortKey);
    if (cfg.sortDir) setSortDir(cfg.sortDir);
    if (cfg.toonAantal) setToonAantal(cfg.toonAantal);
  }
  const bewaarWeergaven = (nieuweLijst) => {
    setWeergaven(nieuweLijst);
    setWeergaveFout(false);
    fetch("/api/medewerker-weergaven", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scherm: SCHERM, views: nieuweLijst }) })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => setWeergaveFout(true));
  };
  const opslaanAlsWeergave = () => {
    const naam = (window.prompt("Naam van de weergave:") || "").trim();
    if (!naam) return;
    bewaarWeergaven([...weergaven.filter((v) => v.naam !== naam), { naam, config: huidigeConfig() }]);
    setActieveWeergave(naam);
  };
  const kiesWeergave = (naam) => {
    setActieveWeergave(naam);
    const v = weergaven.find((w) => w.naam === naam);
    if (v) pasWeergaveToe(v.config);
  };
  const verwijderWeergave = () => {
    if (!actieveWeergave) return;
    if (!window.confirm(`Weergave "${actieveWeergave}" verwijderen?`)) return;
    bewaarWeergaven(weergaven.filter((v) => v.naam !== actieveWeergave));
    setActieveWeergave("");
  };
  const huidigeIsStandaard = !!weergaven.find((v) => v.naam === actieveWeergave)?.config?.standaard;
  const zetStandaardWeergave = () => {
    if (!actieveWeergave) return;
    const nieuw = weergaven.map((v) => ({ ...v, config: { ...(v.config || {}), standaard: v.naam === actieveWeergave ? !huidigeIsStandaard : false } }));
    bewaarWeergaven(nieuw);
  };

  const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
  const menuItem = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, color: KLEUR.tekst };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  const celInhoud = (kol, b) => {
    if (kol.key === "kenmerk") return <span style={{ fontWeight: 600, color: KLEUR.blauw }}>{kol.cel(b) || "—"}</span>;
    if (kol.key === "klantnaam") return <span style={{ fontWeight: 600 }}>{kol.cel(b) || "—"}</span>;
    if (kol.key === "datum") return <span style={{ color: KLEUR.subtekst }}>{kol.cel(b) || "—"}</span>;
    if (kol.key === "door") return <span style={{ color: KLEUR.subtekst }}>{kol.cel(b) || "—"}</span>;
    return kol.cel(b) || "—";
  };

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 24px 40px" }}>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
        Alle verstuurde brieven. Filter op "Mijn cliënten" of kantoorbreed, zoek en sorteer net als bij de dossiers. De link opent de brief in het SharePoint-dossier.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <ScopeToggle scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op cliënt, kenmerk, onderwerp of ontvanger…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
          />
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 250, maxHeight: 320, overflowY: "auto" }}>
                {geordendeKolommen.map((kol, i) => (
                  <div key={kol.key} style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer", flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={zichtbareSet.has(kol.key)}
                        onChange={() => setZichtbareKolommen(() => { const n = new Set(zichtbareSet); if (n.has(kol.key)) n.delete(kol.key); else n.add(kol.key); return n; })}
                      />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kol.label}</span>
                    </label>
                    <button onClick={() => verplaatsKolom(kol.key, -1)} disabled={i === 0} title="Kolom naar links" style={{ background: "none", border: "none", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={14} /></button>
                    <button onClick={() => verplaatsKolom(kol.key, 1)} disabled={i === geordendeKolommen.length - 1} title="Kolom naar rechts" style={{ background: "none", border: "none", color: i === geordendeKolommen.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === geordendeKolommen.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <select value={actieveWeergave} onChange={(e) => kiesWeergave(e.target.value)} style={selectStijl} title="Opgeslagen weergave">
          <option value="">Weergave…</option>
          {weergaven.map((v) => <option key={v.naam} value={v.naam}>{v.naam}</option>)}
        </select>
        {actieveWeergave && (
          <button
            onClick={zetStandaardWeergave}
            title={huidigeIsStandaard ? "Dit is je standaardweergave — klik om uit te zetten" : "Als mijn standaardweergave instellen (laadt automatisch)"}
            style={{ background: "none", border: "none", cursor: "pointer", color: huidigeIsStandaard ? KLEUR.goud : KLEUR.mutedTekst, padding: 4, display: "flex" }}
          >
            <Star size={16} fill={huidigeIsStandaard ? "currentColor" : "none"} />
          </button>
        )}
        <button onClick={opslaanAlsWeergave} style={selectStijl} title="Huidige indeling opslaan als weergave">Opslaan als…</button>
        {actieveWeergave && (
          <button onClick={verwijderWeergave} style={{ ...selectStijl, color: KLEUR.rood }} title="Verwijder deze weergave">Verwijderen</button>
        )}
        {weergaveFout && (
          <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan van de weergave is mislukt — probeer het nog eens.</span>
        )}
        {filterActief && (
          <button onClick={wisAllesFilters} style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Filters wissen
          </button>
        )}
        <button onClick={laad} style={knopLicht} title="Vernieuwen">{bezig ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Vernieuwen</button>
        {onNieuweBrief && (
          <button
            onClick={onNieuweBrief}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nieuwe brief
          </button>
        )}
      </div>

      {Object.entries(kolomFilters).filter(([, v]) => v).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {Object.entries(kolomFilters).filter(([, v]) => v).map(([key, v]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
              {(kolomVan(key)?.label || key)}{typeof v === "object" && v.bevat ? ` bevat "${v.bevat}"` : `: ${v}`}
              <button onClick={() => setKolomFilters((h) => { const n = { ...h }; delete n[key]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {scope === "mijn" && naamGeladen && !mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8 }}>Je naam kon niet automatisch worden bepaald; gebruik <strong>Kantoorbreed</strong>.</div>
      )}

      {fout && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: "#FBECEC", color: KLEUR.rood, border: "1px solid #F0C9C9", marginBottom: 12 }}>
          <AlertTriangle size={15} /> <span>{fout}</span>
        </div>
      )}

      {brieven === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst, padding: "16px 2px" }}>
          <Loader2 size={14} className="spin" /> Logboek laden…
        </div>
      ) : gefilterd.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "16px 2px" }}>
          {filterActief || (scope === "mijn" && mijnNaam) ? "Geen brieven gevonden voor deze selectie." : "Er zijn nog geen verstuurde brieven gelogd."}
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(560, zichtKols.length * 120), background: "#fff" }}>
              <thead>
                <tr>
                  {zichtKols.map((kol) => {
                    const kolActief = sortKey === kol.key || kolomFilters[kol.key];
                    return (
                      <th
                        key={kol.key}
                        onClick={(e) => openKopMenu(e, kol.key)}
                        title="Klik om te sorteren of filteren"
                        style={{ ...th, cursor: "pointer", userSelect: "none", color: kolActief ? KLEUR.blauw : th.color }}
                      >
                        {kol.label}{pijl(kol.key)}{kolomFilters[kol.key] ? " •" : ""} <span style={{ color: KLEUR.mutedTekst }}>▾</span>
                      </th>
                    );
                  })}
                  <th style={{ ...th, width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((b) => (
                  <tr
                    key={b.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FBFBF9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {zichtKols.map((kol) => (
                      <td key={kol.key} style={td}>{celInhoud(kol, b)}</td>
                    ))}
                    <td style={{ ...td, textAlign: "right" }}>
                      {veiligeStr(b.pdfUrl) ? (
                        <a href={b.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...knopLicht, padding: "5px 9px", textDecoration: "none" }}>
                          <FileText size={13} /> Bekijk
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{Math.min(toonAantal, gefilterd.length)} van {gefilterd.length} getoond</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
              {[[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]].map(([n, lbl]) => (
                <button
                  key={lbl}
                  onClick={() => setToonAantal(n)}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`,
                    background: toonAantal === n ? KLEUR.blauw : "#fff",
                    color: toonAantal === n ? "#fff" : KLEUR.subtekst,
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {menu && (() => {
        const kol = kolomVan(menu.key);
        if (!kol) return null;
        const waarden = [...new Set(lijst.map(kol.cel).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "nl"))
          .filter((v) => !menuZoek || v.toLowerCase().includes(menuZoek.toLowerCase()));
        return (
          <>
            <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
            <div style={{ position: "fixed", left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 260), top: menu.y + 4, width: 240, maxHeight: 360, overflowY: "auto", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", zIndex: 51, padding: 8 }}>
              <button onClick={() => { setSortKey(kol.key); setSortDir("asc"); setMenu(null); }} style={menuItem}>↑ Sorteer A→Z</button>
              <button onClick={() => { setSortKey(kol.key); setSortDir("desc"); setMenu(null); }} style={menuItem}>↓ Sorteer Z→A</button>
              <div style={{ height: 1, background: KLEUR.rand, margin: "6px 0" }} />
              <input
                value={menuZoek}
                onChange={(e) => setMenuZoek(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && menuZoek.trim()) {
                    setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } }));
                    setMenu(null);
                  }
                }}
                placeholder="Typ en Enter = bevat…"
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 12.5 }}
              />
              {menuZoek.trim() && (
                <button onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } })); setMenu(null); }} style={{ ...menuItem, color: KLEUR.blauw, fontWeight: 600 }}>
                  Filter op: bevat "{menuZoek.trim()}"
                </button>
              )}
              <button onClick={() => { setKolomFilters((h) => { const n = { ...h }; delete n[kol.key]; return n; }); setMenu(null); }} style={{ ...menuItem, fontWeight: kolomFilters[kol.key] ? 400 : 700 }}>Alles tonen</button>
              {waarden.map((v) => (
                <button key={v} onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: v })); setMenu(null); }} style={{ ...menuItem, color: kolomFilters[kol.key] === v ? KLEUR.blauw : KLEUR.tekst, fontWeight: kolomFilters[kol.key] === v ? 700 : 400 }}>{v}</button>
              ))}
              {waarden.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Geen waarden</div>}
            </div>
          </>
        );
      })()}

      <style>{`@keyframes blogspin{to{transform:rotate(360deg)}} .spin{animation:blogspin 1s linear infinite}`}</style>
    </div>
  );
}
