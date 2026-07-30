import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

/** Zelfde palet als het medewerkersportaal — bewust hier herhaald zodat dit bestand
 *  op zichzelf staat. Wijzigt de huisstijl, pas dan beide plekken aan. */
const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
};

/**
 * Alle kolommen van het contactpersonen-overzicht. `standaard: false` betekent: bestaat wel,
 * maar staat standaard uit — aan te zetten via "Kolommen". `num: true` sorteert numeriek.
 */
const KOLOMMEN = [
  { key: "naam", label: "Naam", waarde: (c) => c.naam, standaard: true },
  { key: "voornaam", label: "Voornaam", waarde: (c) => c.voornaam },
  { key: "tussenvoegsel", label: "Tussenvoegsel", waarde: (c) => c.tussenvoegsel },
  { key: "achternaam", label: "Achternaam", waarde: (c) => c.achternaam },
  { key: "aanhef", label: "Aanhef", waarde: (c) => c.aanhef },
  { key: "functie", label: "Functie", waarde: (c) => c.functie, standaard: true },
  { key: "email", label: "E-mail", waarde: (c) => c.email, standaard: true, soort: "email" },
  { key: "mobiel", label: "Mobiel", waarde: (c) => c.mobiel, standaard: true, soort: "tel" },
  { key: "telefoon", label: "Telefoon", waarde: (c) => c.telefoon, soort: "tel" },
  { key: "klantnamen", label: "Cliënt(en)", waarde: (c) => c.klantnamen, standaard: true },
  { key: "klantnummers", label: "Cliëntnr", waarde: (c) => c.klantnummers },
  { key: "rollen", label: "Rol", waarde: (c) => c.rollen, standaard: true },
  { key: "plaats", label: "Plaats", waarde: (c) => c.plaats, standaard: true },
  { key: "postcode", label: "Postcode", waarde: (c) => c.postcode },
  { key: "straat", label: "Straat", waarde: (c) => [c.straat, c.huisnummer, c.toevoeging].filter(Boolean).join(" ") },
  { key: "land", label: "Land", waarde: (c) => c.land },
  { key: "geboortedatum", label: "Geboortedatum", waarde: (c) => (c.geboortedatum ? new Date(c.geboortedatum).toLocaleDateString("nl-NL") : "") },
];

const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

/**
 * Contactpersonen-overzicht: dezelfde opzet als het klantoverzicht (zoeken, kolommen kiezen,
 * sorteren door op een kop te klikken, per kolom filteren en het aantal regels kiezen), maar op
 * de Dataverse-tabel `contacts`. Zie api/beheer-contactpersonen voor waar de gegevens vandaan
 * komen en waarom de cliënt-kolom via de accounts wordt bepaald en niet via het contact zelf.
 */
export default function ContactpersonenOverzicht() {
  const [contactpersonen, setContactpersonen] = useState(null); // null = laden
  const [afgekapt, setAfgekapt] = useState(false);
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [kolomFilters, setKolomFilters] = useState({}); // { kolomKey: "bevat-tekst" }
  const [filterRegel, setFilterRegel] = useState(false);
  const [sortKey, setSortKey] = useState("naam");
  const [sortDir, setSortDir] = useState("asc");
  const [toonAantal, setToonAantal] = useState(25);
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [zichtbaar, setZichtbaar] = useState(() => new Set(KOLOMMEN.filter((k) => k.standaard).map((k) => k.key)));

  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-contactpersonen")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!actief) return;
        setContactpersonen(d.contactpersonen || []);
        setAfgekapt(!!d.afgekapt);
      })
      .catch((e) => {
        if (!actief) return;
        setContactpersonen([]);
        setFout(e.message || "Onbekende fout");
      });
    return () => {
      actief = false;
    };
  }, []);

  const zichtKols = KOLOMMEN.filter((k) => zichtbaar.has(k.key));
  const kolomVan = (key) => KOLOMMEN.find((k) => k.key === key);

  const gefilterd = useMemo(() => {
    const lijst = contactpersonen || [];
    const term = zoek.trim().toLowerCase();
    return lijst.filter((c) => {
      if (term) {
        const raak = zichtKols.some((kol) => String(kol.waarde(c) || "").toLowerCase().includes(term));
        if (!raak) return false;
      }
      for (const [key, waarde] of Object.entries(kolomFilters)) {
        if (!waarde) continue;
        const kol = kolomVan(key);
        if (!kol) continue;
        if (!String(kol.waarde(c) || "").toLowerCase().includes(String(waarde).toLowerCase())) return false;
      }
      return true;
    });
  }, [contactpersonen, zoek, kolomFilters, zichtbaar]);

  const gesorteerd = useMemo(() => {
    const kol = kolomVan(sortKey) || KOLOMMEN[0];
    const richting = sortDir === "asc" ? 1 : -1;
    return [...gefilterd].sort((a, b) => {
      const wa = String(kol.waarde(a) || "");
      const wb = String(kol.waarde(b) || "");
      // Lege waarden altijd onderaan, ongeacht de sorteerrichting — anders vult een
      // aflopende sortering de eerste pagina met niets.
      if (!wa && wb) return 1;
      if (wa && !wb) return -1;
      return wa.localeCompare(wb, "nl", { numeric: true, sensitivity: "base" }) * richting;
    });
  }, [gefilterd, sortKey, sortDir]);

  const zichtbareRijen = gesorteerd.slice(0, toonAantal === Infinity ? undefined : toonAantal);
  const actieveFilters = Object.entries(kolomFilters).filter(([, v]) => v);

  const sorteerOp = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const cel = (kol, c) => {
    const waarde = kol.waarde(c) || "";
    if (!waarde) return <span style={{ color: KLEUR.mutedTekst }}>—</span>;
    if (kol.soort === "email") return <a href={`mailto:${waarde}`} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>;
    if (kol.soort === "tel") return <a href={`tel:${String(waarde).replace(/\s/g, "")}`} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>;
    return waarde;
  };

  if (contactpersonen === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "20px 0" }}>Contactpersonen ophalen…</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Contactpersonen</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
        Alle contactpersonen uit Dynamics. Bij welke cliënt iemand hoort wordt bepaald vanaf de
        cliënt (primaire en secundaire contactpersoon); staat een contactpersoon bij meerdere
        cliënten, dan staan ze er allemaal bij.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op naam, functie, e-mail, cliënt…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 220, maxHeight: 320, overflowY: "auto" }}>
                {KOLOMMEN.map((kol) => (
                  <label key={kol.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={zichtbaar.has(kol.key)}
                      onChange={() => setZichtbaar((h) => { const n = new Set(h); if (n.has(kol.key)) n.delete(kol.key); else n.add(kol.key); return n; })}
                    />
                    {kol.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => setFilterRegel((o) => !o)} style={{ ...selectStijl, color: filterRegel ? KLEUR.blauw : KLEUR.tekst, fontWeight: filterRegel ? 700 : 400 }}>
          Filters {filterRegel ? "▴" : "▾"}
        </button>

        {(actieveFilters.length > 0 || zoek) && (
          <button
            onClick={() => { setKolomFilters({}); setZoek(""); }}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Filters wissen
          </button>
        )}
      </div>

      {actieveFilters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {actieveFilters.map(([key, v]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
              {(kolomVan(key)?.label || key)} bevat "{v}"
              <button onClick={() => setKolomFilters((h) => { const n = { ...h }; delete n[key]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>
          De contactpersonen konden niet worden geladen ({fout}). Controleer de Dynamics-instellingen.
        </div>
      )}

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
        {gefilterd.length} contactperso{gefilterd.length === 1 ? "on" : "nen"}
        {afgekapt ? " · lijst afgekapt, verfijn je zoekopdracht" : ""}
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, zichtKols.length * 110) }}>
          <thead>
            <tr>
              {zichtKols.map((kol) => {
                const actief = sortKey === kol.key || kolomFilters[kol.key];
                return (
                  <th
                    key={kol.key}
                    onClick={() => sorteerOp(kol.key)}
                    title="Klik om te sorteren"
                    style={{ ...th, cursor: "pointer", userSelect: "none", color: actief ? KLEUR.blauw : th.color }}
                  >
                    {kol.label}{pijl(kol.key)}{kolomFilters[kol.key] ? " •" : ""}
                  </th>
                );
              })}
            </tr>
            {filterRegel && (
              <tr>
                {zichtKols.map((kol) => (
                  <th key={kol.key} style={{ ...th, padding: "4px 6px", textTransform: "none" }}>
                    <input
                      value={kolomFilters[kol.key] || ""}
                      onChange={(e) => setKolomFilters((h) => ({ ...h, [kol.key]: e.target.value }))}
                      placeholder="bevat…"
                      style={{ width: "100%", boxSizing: "border-box", padding: "5px 7px", fontSize: 12, fontWeight: 400, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, outline: "none" }}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {zichtbareRijen.map((c) => (
              <tr key={c.contactId}>
                {zichtKols.map((kol) => (
                  <td key={kol.key} style={td}>{cel(kol, c)}</td>
                ))}
              </tr>
            ))}
            {zichtbareRijen.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, zichtKols.length)} style={{ ...td, color: KLEUR.mutedTekst, whiteSpace: "normal" }}>
                  Geen contactpersonen gevonden met deze zoekopdracht of filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
          {Math.min(toonAantal === Infinity ? gefilterd.length : toonAantal, gefilterd.length)} van {gefilterd.length} getoond
          {afgekapt ? " · lijst afgekapt in Dynamics" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
          {AANTALLEN.map(([n, lbl]) => (
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
    </div>
  );
}
