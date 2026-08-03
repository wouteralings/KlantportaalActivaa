/**
 * Medewerkerskant van de Contractenmodule — spiegelt ContractenModule.jsx (klantkant, zie
 * src/portaal/), maar bewust een ander bestand/andere naam om botsing met de klantversie te
 * voorkomen (zie het contractmanagement-plan, §3 "Naamsbotsing voorkomen").
 *
 * Stap 6: het echte "mini-dashboard voor relatiebeheerders" — alle zelf-geregistreerde
 * contracten over ALLE klantaccounts heen (waar de ingelogde medewerker toegang toe heeft, d.w.z.
 * beheerder of het granulaire "Contracten"-recht), gesorteerd op eerstvolgende afloop. Haalt de
 * contracten op bij /api/mw-contracten-overzicht (beveiligd met contractenRecht.js, zelfde
 * tweelaagse patroon als offertesRecht.js) en de klantnaam/-nummer bij het al bestaande
 * /api/beheer-klanten — bewust GEEN eigen Dynamics-accountquery hier (zie de toelichting in
 * api/mw-contracten-overzicht/index.js).
 *
 * Sinds Stap 3 is de tab niet meer alleen voor beheerders: een medewerker met het granulaire
 * "Contracten"-recht (Beheer → Medewerkers → "Medewerkers — wijzig-rechten", kolom "Contracten";
 * zelfde opzet als het bestaande "Offertes"-recht in api/_gedeeld/wijzigrechten.js) ziet hem ook,
 * zie MedewerkerPortaal.jsx. Sinds Stap 6 wordt dat recht ook op de server afgedwongen
 * (api/_gedeeld/contractenRecht.js), niet meer alleen als weergave-keuze.
 *
 * Uitgebreid 04-08-2026 (op verzoek van Wouter): zoeken op klantgroep/klant, standaard scope
 * "Mijn cliënten" (zelfde ScopeToggle-patroon als bij Inkomstenbelasting/Dossiers, MijnFilter.jsx)
 * met een "Kantoorbreed"-knop, doorklikbare rijen met volledige contractdetails + documentenlijst
 * (met downloadlink), en dezelfde 25/50/100/250/500/Alle-paginering als de rest van het
 * beheer-/medewerkersportaal. Tegelijk gefixt: de klantnaam verscheen niet in de rij — de
 * contracten-tabel gaf het klant-account-id terug zoals SQL Server het opslaat (hoofdletters),
 * terwijl /api/beheer-klanten Dynamics-GUID's in kleine letters teruggeeft; een kale
 * object-key-lookup matchte daardoor nooit. Genormaliseerd met .toLowerCase() aan beide kanten
 * (ook al normaliseert de API dit sinds kort zelf ook al, zie contractenKlanten.js).
 *
 * Bovenbalk (04-08-2026, later die dag) — op verzoek van Wouter gelijkgetrokken met de bovenbalk
 * van het klantenoverzicht "Contactpersonen" (src/medewerker/klanten/ContactpersonenOverzicht.jsx):
 * een "Kolommen ▾"-knop om optionele velden in de rij aan/uit te zetten (i.p.v. altijd alles
 * tonen) en een "Filters ▾"-knop die de statusfilter (Alles/Binnenkort/Verlopen) en het
 * groepsfilter bundelt in één paneel, plus een "Filters wissen"-knop en een telregel ("X
 * contracten") — zelfde stijlpatroon (selectStijl, overlay-paneel) als dat bestand, hier bewust
 * herhaald i.p.v. geïmporteerd (dit bestand staat op zichzelf, net als de rest van de module).
 * Bewust GEEN volledige, generieke sorteerbare tabel zoals Contactpersonen — de contractenlijst
 * blijft de doorklikbare kaartenlijst (past beter bij de wisselende hoeveelheid details +
 * documenten per contract dan een vaste tabel-kolomindeling).
 */
import { useState, useEffect, useMemo } from "react";
import { FileText, Search, AlertTriangle, ChevronDown, Paperclip, Loader2, Download } from "lucide-react";
import ScopeToggle, { useMijnNaam, isKlantVanMij } from "./MijnFilter";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };
// Zelfde stijl als de "Kolommen ▾"/"Filters ▾"-knoppen in ContactpersonenOverzicht.jsx.
const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };

const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

/** Zelfde "Toon: 25/50/.../Alle"-kiezer als elders in het beheer-/medewerkersportaal (bewust hier
 *  herhaald — standalone bestand). */
function AantalKiezer({ aantal, setAantal, totaal }) {
  const getoond = Math.min(aantal === Infinity ? totaal : aantal, totaal);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{getoond} van {totaal} getoond</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTAL_KEUZES.map(([n, lbl]) => (
          <button
            key={lbl}
            onClick={() => setAantal(n)}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${aantal === n ? KLEUR.blauw : KLEUR.rand}`,
              background: aantal === n ? KLEUR.blauw : "#fff",
              color: aantal === n ? "#fff" : KLEUR.subtekst,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

// Terugval zolang /api/contracten-typeopties nog laadt of mislukt — moet in sync blijven met de
// standaardlijst in api/_gedeeld/contractenTypes.js (die zelf sinds 04-08-2026 beheerbaar is in
// Beheer → Facturatie → Contracttypes).
const TYPE_LABELS_FALLBACK = {
  verzekering: "Verzekering", telefonie: "Telefonie", internet: "Internet",
  software: "Software", lease: "Lease", overig: "Overig",
};

function useTypeLabels() {
  const [labels, setLabels] = useState(TYPE_LABELS_FALLBACK);
  useEffect(() => {
    let actief = true;
    fetch("/api/contracten-typeopties")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const bij = {};
        (d.typen || []).forEach((t) => { bij[t.sleutel] = t.label; });
        if (actief && Object.keys(bij).length) setLabels(bij);
      })
      .catch(() => {});
    return () => { actief = false; };
  }, []);
  return labels;
}

function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
function geld(n) {
  if (n == null || n === "") return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function grootteTekst(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function dagenTot(einddatum) {
  if (!einddatum) return null;
  const eind = new Date(einddatum);
  if (isNaN(eind.getTime())) return null;
  eind.setHours(0, 0, 0, 0);
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((eind.getTime() - vandaag.getTime()) / 86400000);
}
function verloopBadge(einddatum) {
  const dagen = dagenTot(einddatum);
  if (dagen == null) return { tekst: "Geen einddatum", kleur: KLEUR.mutedTekst, achtergrond: "#F2F3F0" };
  if (dagen < 0) return { tekst: `Verlopen (${Math.abs(dagen)} dagen geleden)`, kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 30) return { tekst: `Over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`, kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 90) return { tekst: `Over ${dagen} dagen`, kleur: KLEUR.amber, achtergrond: KLEUR.amberAchtergrond };
  return { tekst: `Over ${dagen} dagen`, kleur: KLEUR.groen, achtergrond: "#EAF6EE" };
}

const STATUS_FILTERS = [
  { key: "alles", label: "Alles" },
  { key: "binnenkort", label: "Verloopt binnen 90 dagen" },
  { key: "verlopen", label: "Verlopen" },
];
const STATUS_STANDAARD = "binnenkort";

// Optionele velden in de (ingeklapte) rij, aan/uit te zetten via "Kolommen ▾" — zelfde idee als
// de kolomkiezer in ContactpersonenOverzicht.jsx. Klant, type en de verloopbadge blijven altijd
// zichtbaar (de kernidentiteit van de rij).
const RIJ_VELDEN = [
  { key: "ingevoerdDoor", label: "Ingevoerd door" },
  { key: "waarde", label: "Waarde" },
  { key: "einddatum", label: "Einddatum" },
];
const RIJ_VELDEN_STANDAARD = new Set(["ingevoerdDoor", "waarde", "einddatum"]);

/** Documentenlijst van één contract, lazy geladen zodra de rij wordt opengeklapt
 *  (/api/mw-contracten-document, medewerker-scoped — zie de toelichting in dat bestand voor
 *  waarom dit een ander endpoint is dan de klantkant se /api/contracten-documenten). */
function ContractDocumentenLijst({ accountId, contractId }) {
  const [documenten, setDocumenten] = useState(null);
  const [fout, setFout] = useState("");

  useEffect(() => {
    let actief = true;
    setDocumenten(null);
    setFout("");
    fetch(`/api/mw-contracten-document?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (actief) setDocumenten(d.documenten || []); })
      .catch((e) => { if (actief) setFout(e.message || "Documenten konden niet worden opgehaald."); });
    return () => { actief = false; };
  }, [accountId, contractId]);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>
        Documenten
      </div>
      {documenten === null && !fout && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.mutedTekst }}>
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Documenten ophalen…
        </div>
      )}
      {fout && <div style={{ fontSize: 12, color: KLEUR.rood }}>{fout}</div>}
      {documenten && documenten.length === 0 && (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten bij dit contract.</div>
      )}
      {documenten && documenten.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {documenten.map((d) => (
            <a
              key={d.id}
              href={`/api/mw-contracten-document?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}&id=${encodeURIComponent(d.id)}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: KLEUR.blauw, textDecoration: "none", padding: "4px 0" }}
            >
              <Paperclip size={12} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.bestandsnaam}</span>
              <span style={{ color: KLEUR.mutedTekst, flexShrink: 0 }}>{grootteTekst(d.grootte)}</span>
              <Download size={12} style={{ flexShrink: 0 }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContractenOverzicht() {
  const { mijnNaam } = useMijnNaam();
  const [contracten, setContracten] = useState(null);
  const [klanten, setKlanten] = useState({});
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState(STATUS_STANDAARD);
  const [groepFilter, setGroepFilter] = useState("alle");
  const [scope, setScope] = useState("mijn"); // "mijn" | "alle" — zelfde als bij Dossiers/Inkomstenbelasting
  const [openIds, setOpenIds] = useState(() => new Set());
  const [toonAantal, setToonAantal] = useState(25);
  const [zichtbareVelden, setZichtbareVelden] = useState(RIJ_VELDEN_STANDAARD);
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const typeLabels = useTypeLabels();

  const toggleOpen = (id) => setOpenIds((h) => {
    const n = new Set(h);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleVeld = (key) => setZichtbareVelden((h) => {
    const n = new Set(h);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const bij = {};
        (d.klanten || []).forEach((k) => { bij[String(k.accountId || "").toLowerCase()] = k; });
        setKlanten(bij);
      })
      .catch(() => setKlanten({}));

    fetch("/api/mw-contracten-overzicht")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setContracten(d.contracten || []))
      .catch((err) => setFout(err.message || "Contracten konden niet worden opgehaald."));
  }, []);

  const rijen = useMemo(() => {
    if (!contracten) return [];
    return contracten.map((c) => {
      const klant = klanten[String(c.klantAccountId || "").toLowerCase()] || null;
      return {
        ...c,
        klant,
        klantnaam: klant?.klantnaam || "Onbekende klant",
        klantnummer: klant?.klantnummer || "",
        groepsnaam: klant?.groepsnaam || "",
        dagen: dagenTot(c.einddatum),
      };
    });
  }, [contracten, klanten]);

  const groepen = useMemo(
    () => [...new Set(Object.values(klanten).map((k) => k.groepsnaam).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl")),
    [klanten]
  );

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return rijen.filter((r) => {
      if (scope === "mijn" && mijnNaam && !isKlantVanMij(r.klant, mijnNaam)) return false;
      if (groepFilter !== "alle" && r.groepsnaam !== groepFilter) return false;
      if (term) {
        const raak = [r.klantnaam, r.klantnummer, r.naam, r.leverancier, r.groepsnaam].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
        if (!raak) return false;
      }
      if (filter === "binnenkort") return r.dagen != null && r.dagen <= 90;
      if (filter === "verlopen") return r.dagen != null && r.dagen < 0;
      return true;
    });
  }, [rijen, zoek, filter, groepFilter, scope, mijnNaam]);

  const zichtbaar = toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal);
  const filtersActief = filter !== STATUS_STANDAARD || groepFilter !== "alle";

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <FileText size={17} color={KLEUR.blauw} /> Contracten — overzicht alle klanten
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
        Zelf geregistreerde doorlopende contracten van klanten, gesorteerd op eerstvolgende afloop. Klik op een rij
        voor de volledige details en documenten.
      </div>

      {fout && (
        <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
          {fout}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <ScopeToggle scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op klant, klantgroep, contractnaam of leverancier…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 200 }}>
                {RIJ_VELDEN.map((v) => (
                  <label key={v.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={zichtbareVelden.has(v.key)} onChange={() => toggleVeld(v.key)} />
                    {v.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setFiltersOpen((o) => !o)} style={{ ...selectStijl, color: filtersActief ? KLEUR.blauw : KLEUR.tekst, fontWeight: filtersActief ? 700 : 400 }}>
            Filters {filtersOpen ? "▴" : "▾"}
          </button>
          {filtersOpen && (
            <>
              <div onClick={() => setFiltersOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 12, width: 260 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Status</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
                  {STATUS_FILTERS.map((f) => (
                    <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                      <input type="radio" name="contracten-status-filter" checked={filter === f.key} onChange={() => setFilter(f.key)} />
                      {f.label}
                    </label>
                  ))}
                </div>
                {groepen.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Klantgroep</div>
                    <select value={groepFilter} onChange={(e) => setGroepFilter(e.target.value)} style={{ ...inputStijl, fontSize: 12.5 }}>
                      <option value="alle">Alle groepen</option>
                      {groepen.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {(filtersActief || zoek) && (
          <button
            onClick={() => { setFilter(STATUS_STANDAARD); setGroepFilter("alle"); setZoek(""); }}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Filters wissen
          </button>
        )}
      </div>

      {scope === "mijn" && !mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 10 }}>
          Je naam kon niet bepaald worden — "Mijn cliënten" toont daarom voorlopig niemand. Klik op <strong>Kantoorbreed</strong> om alles te zien.
        </div>
      )}

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
        {gefilterd.length} contract{gefilterd.length === 1 ? "" : "en"}
      </div>

      {contracten === null && !fout && <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>Laden…</div>}

      {contracten !== null && gefilterd.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>
          {rijen.length === 0 ? "Nog geen contracten geregistreerd door klanten." : "Geen contracten gevonden voor dit filter."}
        </div>
      )}

      {zichtbaar.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          {zichtbaar.map((c, i) => {
            const badge = verloopBadge(c.einddatum);
            const open = openIds.has(c.id);
            return (
              <div key={c.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
                <button
                  onClick={() => toggleOpen(c.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", flexWrap: "wrap",
                    background: open ? KLEUR.lichtblauw : "#fff", border: "none", cursor: "pointer", textAlign: "left", color: KLEUR.tekst,
                  }}
                >
                  {c.dagen != null && c.dagen <= 30 && (
                    <AlertTriangle size={15} color={KLEUR.rood} style={{ flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 130, flexShrink: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.klantnummer || "—"}</div>
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.klantnaam}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw,
                    padding: "3px 8px", borderRadius: 5, flexShrink: 0,
                  }}>
                    {typeLabels[c.type] || c.type || "—"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.naam}{c.leverancier ? ` — ${c.leverancier}` : ""}
                  </div>
                  {zichtbareVelden.has("ingevoerdDoor") && (
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, flexShrink: 0, minWidth: 100, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.aangemaaktDoor || ""}>
                      {c.aangemaaktDoor || "—"}
                    </div>
                  )}
                  {zichtbareVelden.has("waarde") && (
                    <div style={{ fontSize: 12, color: KLEUR.subtekst, flexShrink: 0, minWidth: 70, textAlign: "right" }}>
                      {geld(c.bedrag)}
                    </div>
                  )}
                  {zichtbareVelden.has("einddatum") && (
                    <div style={{ fontSize: 12, color: KLEUR.subtekst, flexShrink: 0, minWidth: 80, textAlign: "right" }}>
                      {datum(c.einddatum)}
                    </div>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: badge.kleur, background: badge.achtergrond,
                    padding: "3px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap", minWidth: 90, textAlign: "center",
                  }}>
                    {badge.tekst}
                  </span>
                  <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }} />
                </button>
                {open && (
                  <div style={{ padding: "14px 16px", background: "#fff" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12.5 }}>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Contractnummer:</span> {c.contractnummer || "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Ingangsdatum:</span> {datum(c.ingangsdatum)}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Opzegtermijn:</span> {c.opzegtermijnDagen != null ? `${c.opzegtermijnDagen} dagen` : "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Automatische verlenging:</span> {c.automatischeVerlenging ? "Ja" : "Nee"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Frequentie:</span> {c.frequentie || "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Waarde:</span> {geld(c.bedrag)}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Ingevoerd door:</span> {c.aangemaaktDoor || "—"} op {datum(c.aangemaaktOp)}</div>
                      {c.gewijzigdOp && (
                        <div><span style={{ color: KLEUR.mutedTekst }}>Laatst gewijzigd door:</span> {c.gewijzigdDoor || "—"} op {datum(c.gewijzigdOp)}</div>
                      )}
                    </div>
                    {c.opmerkingen && (
                      <div style={{ fontSize: 12.5, marginTop: 8, whiteSpace: "pre-wrap" }}>
                        <span style={{ color: KLEUR.mutedTekst }}>Opmerkingen:</span> {c.opmerkingen}
                      </div>
                    )}
                    <ContractDocumentenLijst accountId={c.klantAccountId} contractId={c.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {gefilterd.length > 0 && <AantalKiezer aantal={toonAantal} setAantal={setToonAantal} totaal={gefilterd.length} />}
    </div>
  );
}
