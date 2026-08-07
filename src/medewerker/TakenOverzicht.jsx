/**
 * Medewerkerskant "Taken" — een kantoorbreed overzicht van de Dynamics-taken (los tabblad in het
 * medewerkersportaal, zie MedewerkerPortaal.jsx). In tegenstelling tot de KLANTkant (src/portaal,
 * /api/taken: alleen de eigen accounts van de klant en alleen de zichtbaar gezette soorten) toont
 * dit ALLE taken, met dezelfde look-and-feel als de fiscale dossieroverzichten (Inkomsten-/
 * Vennootschapsbelasting): een scope-schakelaar, zoekveld, kolomkiezer met volgorde, opgeslagen
 * weergaven (persoonlijk, per medewerker), sorteren/filteren per kolom en paginering.
 *
 * Twee sub-tabbladen:
 *   - Openstaand  (/api/mw-taken?status=open)        — statecode 0 (Actief).
 *   - Afgehandeld (/api/mw-taken?status=afgehandeld) — statecode 1 (Voltooid).
 *
 * Drie filters (scope):
 *   - Mijn taken     — taken waarvan de ingelogde medewerker eigenaar is (Dynamics owner).
 *   - Mijn cliënten  — taken van cliënten waar de medewerker aan gekoppeld is (relatiebeheerder/
 *                      accountant/assistent/…) — zelfde match als MijnFilter.jsx elders.
 *   - Kantoorbreed   — alles.
 *
 * Kolom "Afwikkeling": "Automatisch" = de cliënt handelt de taak zelf af (akkoord geven of
 * ondertekenen, waarna Dynamics 'm automatisch afrondt); "Handmatig" = een medewerker moet 'm
 * aftekenen. Afgeleid uit de taaksoort-instellingen in Beheer → Taken (server-side, zie
 * api/_gedeeld/takenGedeeld.js). Een openstaande taak kan vanuit de detailweergave met één knop
 * als afgehandeld worden gemarkeerd (verhuist dan naar het tabblad Afgehandeld).
 *
 * De klantnaam/-nummer/groep en de rol-koppeling (voor "Mijn cliënten") worden aan de voorkant
 * erbij gejoind via /api/beheer-klanten — zelfde patroon als ContractenOverzicht.jsx, zodat hier
 * geen tweede Dynamics-accountquery nodig is.
 */
import { useEffect, useRef, useState } from "react";
import { Search, ChevronRight, ChevronUp, ChevronDown, ArrowLeft, Loader2, Star, User, Users, Building2, CheckCircle2, ExternalLink } from "lucide-react";
import { useMijnNaam, isKlantVanMij } from "./MijnFilter";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
  amber: "#A9660C", amberBg: "#FFF4E5", groenBg: "#E7F3EA",
};

const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

function datum(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("nl-NL");
}
function tijd(ms) {
  const dt = new Date(ms);
  return isNaN(dt.getTime()) ? 0 : dt.getTime();
}

// ── Kolomdefinities ──────────────────────────────────────────────────────────
// `cel` levert de zichtbare tekst; optioneel `sortVal` voor een chronologische/andere sortering
// (data zouden anders alfabetisch op de nl-NL-tekst sorteren). `geenFilter`/`geenSort` sluiten
// die opties uit in het kolomkop-menu.
function TAKEN_KOLOMMEN(modus) {
  const basis = [
    { key: "klantnaam", label: "Cliënt", cel: (t) => t.klantnaam || (t.klant && t.klant.klantnaam) || "", soort: "klant" },
    { key: "onderwerp", label: "Onderwerp", cel: (t) => t.onderwerp || "" },
    { key: "soort", label: "Soort", cel: (t) => t.soort || "" },
    { key: "afwikkeling", label: "Afwikkeling", cel: (t) => (t.afwikkeling === "automatisch" ? "Automatisch" : "Handmatig"), soort: "afwikkeling" },
    { key: "eigenaar", label: "Eigenaar", cel: (t) => t.eigenaar || "" },
    { key: "deadline", label: "Deadline", cel: (t) => datum(t.deadline), sortVal: (t) => tijd(t.deadline) },
    { key: "prioriteit", label: "Prioriteit", cel: (t) => t.prioriteit || "" },
    { key: "klantnummer", label: "Cliëntnr", cel: (t) => (t.klant && (t.klant.klantnummer ?? "") !== "" ? String(t.klant.klantnummer) : "") },
    { key: "groepsnaam", label: "Groep", cel: (t) => (t.klant && t.klant.groepsnaam) || "" },
  ];
  if (modus === "afgehandeld") {
    basis.push({ key: "afgehandeldOp", label: "Afgehandeld op", cel: (t) => datum(t.afgehandeldOp), sortVal: (t) => tijd(t.afgehandeldOp) });
    basis.push({ key: "status", label: "Status", cel: (t) => t.statusLabel || "" });
  } else {
    basis.push({ key: "aangemaakt", label: "Aangemaakt", cel: (t) => datum(t.aangemaakt), sortVal: (t) => tijd(t.aangemaakt) });
  }
  return basis;
}
const STANDAARD_VERBORGEN = {
  open: ["prioriteit", "klantnummer", "groepsnaam"],
  afgehandeld: ["prioriteit", "klantnummer", "groepsnaam", "afwikkeling"],
};

// ── Scope-schakelaar (3-weg) ─────────────────────────────────────────────────
function TakenScope({ scope, setScope }) {
  const knop = (waarde, Icon, label, eerste) => (
    <button
      onClick={() => setScope(waarde)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none",
        borderLeft: eerste ? "none" : `1px solid ${KLEUR.rand}`, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
        background: scope === waarde ? KLEUR.blauw : "#fff", color: scope === waarde ? "#fff" : KLEUR.subtekst,
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      {knop("mijn", User, "Mijn taken", true)}
      {knop("mijnclienten", Users, "Mijn cliënten", false)}
      {knop("alle", Building2, "Kantoorbreed", false)}
    </div>
  );
}

function AfwikkelingBadge({ waarde }) {
  const auto = waarde === "automatisch";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
      background: auto ? KLEUR.groenBg : KLEUR.amberBg, color: auto ? KLEUR.groen : KLEUR.amber,
    }}>
      {auto ? "Automatisch" : "Handmatig"}
    </span>
  );
}

// ── Detailweergave van één taak ──────────────────────────────────────────────
function TaakDetail({ taak, modus, appUrl, onTerug, onAfgehandeld }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const dynamicsLink = appUrl ? `${appUrl}/main.aspx?pagetype=entityrecord&etn=task&id=${taak.id}` : "";

  const rond = async () => {
    if (!window.confirm("Deze taak markeren als afgehandeld (voltooid)?")) return;
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/mw-taken", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taak.id, actie: "afronden" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onAfgehandeld(taak.id);
    } catch (e) {
      setFout(e.message || "Afronden mislukt.");
      setBezig(false);
    }
  };

  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 2 };
  const waarde = { fontSize: 13.5, color: KLEUR.tekst, marginBottom: 12 };
  const Rij = ({ l, children }) => (<div><div style={label}>{l}</div><div style={waarde}>{children || "—"}</div></div>);

  return (
    <div>
      <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 16 }}>
        <ArrowLeft size={15} /> Terug naar taken
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{taak.onderwerp || "(geen onderwerp)"}</div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst }}>{taak.klantnaam || (taak.klant && taak.klant.klantnaam) || "Geen cliënt gekoppeld"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {dynamicsLink && (
            <a href={dynamicsLink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
              <ExternalLink size={14} /> Open in Dynamics
            </a>
          )}
          {modus === "open" && (
            <button onClick={rond} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.7 : 1 }}>
              <CheckCircle2 size={14} /> {bezig ? "Bezig…" : "Markeer als afgehandeld"}
            </button>
          )}
        </div>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 12 }}>{fout}</div>}

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "16px 18px", maxWidth: 720 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
          <Rij l="Soort">{taak.soort}</Rij>
          <Rij l="Afwikkeling"><AfwikkelingBadge waarde={taak.afwikkeling} /></Rij>
          <Rij l="Eigenaar">{taak.eigenaar}</Rij>
          <Rij l="Prioriteit">{taak.prioriteit}</Rij>
          <Rij l="Deadline">{datum(taak.deadline)}</Rij>
          <Rij l="Aangemaakt">{datum(taak.aangemaakt)}</Rij>
          {modus === "afgehandeld" && <Rij l="Afgehandeld op">{datum(taak.afgehandeldOp)}</Rij>}
          {modus === "afgehandeld" && <Rij l="Status">{taak.statusLabel}</Rij>}
          {taak.klant && <Rij l="Cliëntnummer">{taak.klant.klantnummer}</Rij>}
          {taak.klant && <Rij l="Groep">{taak.klant.groepsnaam}</Rij>}
        </div>
        {taak.omschrijving && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>Omschrijving</div>
            <div style={{ fontSize: 13, color: KLEUR.tekst, whiteSpace: "pre-wrap" }}>{taak.omschrijving}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── De tabel voor één modus (open | afgehandeld) ─────────────────────────────
function TakenTabel({ modus }) {
  const [taken, setTaken] = useState(null); // null = laden
  const [fout, setFout] = useState(false);
  const [configNodig, setConfigNodig] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [klantenMap, setKlantenMap] = useState({});
  const [zoek, setZoek] = useState("");
  const [kolomFilters, setKolomFilters] = useState({});
  const [sortKey, setSortKey] = useState(modus === "afgehandeld" ? "afgehandeldOp" : "aangemaakt");
  const [sortDir, setSortDir] = useState("desc");
  const [toonAantal, setToonAantal] = useState(25);
  const [zichtbareKolommen, setZichtbareKolommen] = useState(null);
  const [kolomVolgorde, setKolomVolgorde] = useState(null);
  const [weergaven, setWeergaven] = useState([]);
  const [actieveWeergave, setActieveWeergave] = useState("");
  const [weergaveFout, setWeergaveFout] = useState(false);
  const [menu, setMenu] = useState(null);
  const [menuZoek, setMenuZoek] = useState("");
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [scope, setScope] = useState("mijn");
  const [detailId, setDetailId] = useState(null);
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const geladenRef = useRef(false);
  const autoOpslaanTimerRef = useRef(null);

  const scherm = "taken-" + modus;
  const statusParam = modus === "afgehandeld" ? "afgehandeld" : "open";
  const KOLOMMEN = TAKEN_KOLOMMEN(modus);
  const alleKeys = KOLOMMEN.map((c) => c.key);
  const kolomVan = (key) => KOLOMMEN.find((c) => c.key === key);

  useEffect(() => {
    let actief = true;
    setTaken(null); setFout(false);
    geladenRef.current = false;
    // Klanten (voor de join + "Mijn cliënten"-scope) — best-effort.
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!actief) return; const bij = {}; (d.klanten || []).forEach((k) => { bij[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(bij); })
      .catch(() => {});
    fetch(`/api/mw-taken?status=${statusParam}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!actief) return; setTaken(d.taken || []); setAppUrl(d.appUrl || ""); setConfigNodig(!!d.configuratieNodig); })
      .catch(() => { if (actief) { setTaken([]); setFout(true); } });
    fetch(`/api/medewerker-weergaven?scherm=${encodeURIComponent(scherm)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!actief) return;
        const views = d.views || [];
        setWeergaven(views);
        const standaard = views.find((v) => v.config && v.config.standaard);
        if (standaard) { setActieveWeergave(standaard.naam); pasWeergaveToe(standaard.config); }
        else if (d.laatst) pasWeergaveToe(d.laatst);
      })
      .catch(() => { if (actief) setWeergaven([]); })
      .finally(() => { if (actief) geladenRef.current = true; });
    return () => { actief = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modus]);

  useEffect(() => {
    setZichtbareKolommen((huidig) => huidig || new Set(alleKeys.filter((key) => !(STANDAARD_VERBORGEN[modus] || []).includes(key))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modus]);

  const zichtbareSet = zichtbareKolommen || new Set(alleKeys.filter((key) => !(STANDAARD_VERBORGEN[modus] || []).includes(key)));
  const geordendeKolommen = (() => {
    const basis = (kolomVolgorde || []).filter((k) => alleKeys.includes(k));
    const missend = alleKeys.filter((k) => !basis.includes(k));
    return [...basis, ...missend].map((k) => kolomVan(k)).filter(Boolean);
  })();
  const verplaatsKolom = (key, richting) => {
    const basis = geordendeKolommen.map((k) => k.key);
    const i = basis.indexOf(key); const j = i + richting;
    if (i === -1 || j < 0 || j >= basis.length) return;
    const nieuw = [...basis]; [nieuw[i], nieuw[j]] = [nieuw[j], nieuw[i]];
    setKolomVolgorde(nieuw);
  };

  // Auto-opslaan van de huidige (niet-benoemde) stand — gedebounced, pas ná het eerste laden.
  useEffect(() => {
    if (!geladenRef.current) return;
    clearTimeout(autoOpslaanTimerRef.current);
    autoOpslaanTimerRef.current = setTimeout(() => {
      fetch("/api/medewerker-weergaven", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scherm, laatst: { kolommen: [...zichtbareSet], volgorde: geordendeKolommen.map((k) => k.key), filters: kolomFilters, sortKey, sortDir, toonAantal } }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(autoOpslaanTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zichtbareKolommen, kolomVolgorde, kolomFilters, sortKey, sortDir, toonAantal, scherm]);

  // Klant-info bij elke taak joinen (klantnaam-fallback, klantnummer, groep, rolvelden).
  const verrijkt = (taken || []).map((t) => ({ ...t, klant: klantenMap[t.klantAccountId] || null }));

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
  const bewaarWeergaven = (lijst) => {
    setWeergaven(lijst); setWeergaveFout(false);
    fetch("/api/medewerker-weergaven", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scherm, views: lijst }) })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => setWeergaveFout(true));
  };
  const opslaanAlsWeergave = () => {
    const naam = (window.prompt("Naam van de weergave:") || "").trim();
    if (!naam) return;
    bewaarWeergaven([...weergaven.filter((v) => v.naam !== naam), { naam, config: huidigeConfig() }]);
    setActieveWeergave(naam);
  };
  const kiesWeergave = (naam) => { setActieveWeergave(naam); const v = weergaven.find((w) => w.naam === naam); if (v) pasWeergaveToe(v.config); };
  const verwijderWeergave = () => {
    if (!actieveWeergave) return;
    if (!window.confirm(`Weergave "${actieveWeergave}" verwijderen?`)) return;
    bewaarWeergaven(weergaven.filter((v) => v.naam !== actieveWeergave)); setActieveWeergave("");
  };
  const huidigeIsStandaard = !!weergaven.find((v) => v.naam === actieveWeergave)?.config?.standaard;
  const zetStandaardWeergave = () => {
    if (!actieveWeergave) return;
    bewaarWeergaven(weergaven.map((v) => ({ ...v, config: { ...(v.config || {}), standaard: v.naam === actieveWeergave ? !huidigeIsStandaard : false } })));
  };

  const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
  const menuItem = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, color: KLEUR.tekst };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };

  // Detailweergave (open één taak).
  if (detailId) {
    const taak = verrijkt.find((t) => t.id === detailId);
    if (taak) {
      return (
        <TaakDetail
          taak={taak}
          modus={modus}
          appUrl={appUrl}
          onTerug={() => setDetailId(null)}
          onAfgehandeld={(id) => { setTaken((h) => (h || []).filter((x) => x.id !== id)); setDetailId(null); }}
        />
      );
    }
  }

  if (taken === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Taken ophalen…
      </div>
    );
  }

  const term = zoek.trim().toLowerCase();
  const mijnLc = mijnNaam.trim().toLowerCase();
  const isVanMij = (t) => t.eigenaarVanMij || (!!mijnLc && String(t.eigenaar || "").trim().toLowerCase() === mijnLc);
  const gefilterd = verrijkt.filter((t) => {
    if (scope === "mijn" && !isVanMij(t)) return false;
    if (scope === "mijnclienten") { if (!isKlantVanMij(t.klant, mijnNaam)) return false; }
    for (const [key, val] of Object.entries(kolomFilters)) {
      if (!val) continue;
      const kol = kolomVan(key); if (!kol) continue;
      const cel = kol.cel(t);
      if (typeof val === "object" && val.bevat) { if (!String(cel).toLowerCase().includes(val.bevat.toLowerCase())) return false; }
      else if (cel !== val) return false;
    }
    if (term) {
      const raak = [t.onderwerp, t.klantnaam, t.soort, t.eigenaar, t.klant && t.klant.groepsnaam]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
      if (!raak) return false;
    }
    return true;
  });
  const filterActief = Object.values(kolomFilters).some(Boolean) || !!term;

  const sortKol = kolomVan(sortKey) || kolomVan("onderwerp");
  const gesorteerd = [...gefilterd].sort((x, y) => {
    if (sortKol.sortVal) { const c = sortKol.sortVal(x) - sortKol.sortVal(y); return sortDir === "asc" ? c : -c; }
    const c = String(sortKol.cel(x)).localeCompare(String(sortKol.cel(y)), "nl", { sensitivity: "base" });
    return sortDir === "asc" ? c : -c;
  });
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const zichtbaar = gesorteerd.slice(0, toonAantal);
  const zichtKols = geordendeKolommen.filter((c) => zichtbareSet.has(c.key));

  const openKopMenu = (e, key) => { const r = e.currentTarget.getBoundingClientRect(); setMenuZoek(""); setMenu((m) => (m && m.key === key ? null : { key, x: r.left, y: r.bottom })); };
  const wisAllesFilters = () => { setKolomFilters({}); setZoek(""); };

  return (
    <div>
      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 12 }}>Er ging iets mis bij het ophalen van de taken. Controleer de Dynamics-instellingen.</div>}
      {configNodig && !fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          Het taaksoort-veld is nog niet ingesteld (Application Setting <strong>DYNAMICS_TAAK_SOORT_VELD</strong>). De taken worden getoond, maar de kolom "Soort"/"Afwikkeling" blijft leeg tot dit is ingevuld.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <TakenScope scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op cliënt, onderwerp, soort of eigenaar…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }} />
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
                      <input type="checkbox" checked={zichtbareSet.has(kol.key)}
                        onChange={() => setZichtbareKolommen(() => { const n = new Set(zichtbareSet); if (n.has(kol.key)) n.delete(kol.key); else n.add(kol.key); return n; })} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kol.label}</span>
                    </label>
                    <button onClick={() => verplaatsKolom(kol.key, -1)} disabled={i === 0} title="Naar links" style={{ background: "none", border: "none", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={14} /></button>
                    <button onClick={() => verplaatsKolom(kol.key, 1)} disabled={i === geordendeKolommen.length - 1} title="Naar rechts" style={{ background: "none", border: "none", color: i === geordendeKolommen.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === geordendeKolommen.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={14} /></button>
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
          <button onClick={zetStandaardWeergave} title={huidigeIsStandaard ? "Standaardweergave — klik om uit te zetten" : "Als mijn standaardweergave instellen"} style={{ background: "none", border: "none", cursor: "pointer", color: huidigeIsStandaard ? KLEUR.goud : KLEUR.mutedTekst, padding: 4, display: "flex" }}>
            <Star size={16} fill={huidigeIsStandaard ? "currentColor" : "none"} />
          </button>
        )}
        <button onClick={opslaanAlsWeergave} style={selectStijl} title="Huidige indeling opslaan als weergave">Opslaan als…</button>
        {actieveWeergave && <button onClick={verwijderWeergave} style={{ ...selectStijl, color: KLEUR.rood }} title="Verwijder deze weergave">Verwijderen</button>}
        {weergaveFout && <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan van de weergave is mislukt — probeer het nog eens.</span>}
        {filterActief && <button onClick={wisAllesFilters} style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Filters wissen</button>}
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

      {scope !== "alle" && naamGeladen && !mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8 }}>Je naam kon niet automatisch worden bepaald; gebruik <strong>Kantoorbreed</strong>.</div>
      )}

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>{gefilterd.length} {gefilterd.length === 1 ? "taak" : "taken"}</div>

      {gefilterd.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "16px 2px" }}>
          {modus === "afgehandeld" ? "Geen afgehandelde taken gevonden." : "Geen openstaande taken gevonden."}
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(560, zichtKols.length * 120) }}>
              <thead>
                <tr>
                  {zichtKols.map((kol) => {
                    const kolActief = sortKey === kol.key || kolomFilters[kol.key];
                    return (
                      <th key={kol.key} onClick={(e) => openKopMenu(e, kol.key)} title="Klik om te sorteren of filteren" style={{ ...th, cursor: "pointer", userSelect: "none", color: kolActief ? KLEUR.blauw : th.color }}>
                        {kol.label}{pijl(kol.key)}{kolomFilters[kol.key] ? " •" : ""} <span style={{ color: KLEUR.mutedTekst }}>▾</span>
                      </th>
                    );
                  })}
                  <th style={{ ...th, width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((t) => (
                  <tr key={t.id} onClick={() => setDetailId(t.id)} title="Open taak" style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FBFBF9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {zichtKols.map((kol) => (
                      <td key={kol.key} style={td}>
                        {kol.key === "klantnaam" ? (
                          <span style={{ fontWeight: 600 }}>{kol.cel(t) || "—"}</span>
                        ) : kol.key === "onderwerp" ? (
                          <span title={t.onderwerp || ""} style={{ display: "inline-block", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{t.onderwerp || "—"}</span>
                        ) : kol.key === "afwikkeling" ? (
                          <AfwikkelingBadge waarde={t.afwikkeling} />
                        ) : (
                          kol.cel(t) || "—"
                        )}
                      </td>
                    ))}
                    <td style={{ ...td, color: KLEUR.mutedTekst, textAlign: "right" }}><ChevronRight size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{Math.min(toonAantal, gefilterd.length)} van {gefilterd.length} getoond</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
              {AANTAL_KEUZES.map(([n, lbl]) => (
                <button key={lbl} onClick={() => setToonAantal(n)} style={{
                  padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`,
                  background: toonAantal === n ? KLEUR.blauw : "#fff", color: toonAantal === n ? "#fff" : KLEUR.subtekst,
                }}>{lbl}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {menu && (() => {
        const kol = kolomVan(menu.key);
        if (!kol) return null;
        const waarden = [...new Set(verrijkt.map(kol.cel).filter(Boolean))]
          .sort((a, b) => String(a).localeCompare(String(b), "nl"))
          .filter((v) => !menuZoek || String(v).toLowerCase().includes(menuZoek.toLowerCase()));
        return (
          <>
            <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
            <div style={{ position: "fixed", left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 260), top: menu.y + 4, width: 240, maxHeight: 360, overflowY: "auto", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", zIndex: 51, padding: 8 }}>
              <button onClick={() => { setSortKey(kol.key); setSortDir("asc"); setMenu(null); }} style={menuItem}>↑ Sorteer oplopend</button>
              <button onClick={() => { setSortKey(kol.key); setSortDir("desc"); setMenu(null); }} style={menuItem}>↓ Sorteer aflopend</button>
              <div style={{ height: 1, background: KLEUR.rand, margin: "6px 0" }} />
              <input value={menuZoek} onChange={(e) => setMenuZoek(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && menuZoek.trim()) { setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } })); setMenu(null); } }}
                placeholder="Typ en Enter = bevat…"
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 12.5 }} />
              {menuZoek.trim() && <button onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } })); setMenu(null); }} style={{ ...menuItem, color: KLEUR.blauw, fontWeight: 600 }}>Filter op: bevat "{menuZoek.trim()}"</button>}
              <button onClick={() => { setKolomFilters((h) => { const n = { ...h }; delete n[kol.key]; return n; }); setMenu(null); }} style={{ ...menuItem, fontWeight: kolomFilters[kol.key] ? 400 : 700 }}>Alles tonen</button>
              {waarden.map((v) => (
                <button key={v} onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: v })); setMenu(null); }} style={{ ...menuItem, color: kolomFilters[kol.key] === v ? KLEUR.blauw : KLEUR.tekst, fontWeight: kolomFilters[kol.key] === v ? 700 : 400 }}>{v}</button>
              ))}
              {waarden.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Geen waarden</div>}
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ── Hoofdcomponent: sub-tabbladen Openstaand / Afgehandeld ────────────────────
export default function TakenOverzicht() {
  const [modus, setModus] = useState("open");
  const subTab = (waarde, label) => (
    <button onClick={() => setModus(waarde)} style={{
      padding: "7px 16px", background: modus === waarde ? KLEUR.blauw : "#fff", color: modus === waarde ? "#fff" : KLEUR.subtekst,
      border: `1px solid ${modus === waarde ? KLEUR.blauw : KLEUR.rand}`, borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    }}>{label}</button>
  );
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Taken</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
        Kantoorbreed overzicht van de taken uit Dynamics. Filter op je eigen taken, je cliënten of kantoorbreed, en handel openstaande taken af.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {subTab("open", "Openstaand")}
        {subTab("afgehandeld", "Afgehandeld")}
      </div>
      <TakenTabel key={modus} modus={modus} />
    </div>
  );
}
