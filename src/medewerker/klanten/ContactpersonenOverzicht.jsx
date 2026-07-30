import { useEffect, useMemo, useState } from "react";
import { Search, ArrowLeft, Pencil, Link2, Unlink, AlertTriangle, CheckCircle2, X, Plus, Trash2 } from "lucide-react";
import Logboek from "./Logboek";

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
  groen: "#2E7D46",
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

/** Velden die in bulk (op meerdere contactpersonen tegelijk) gewijzigd kunnen worden. `key` = het
 *  weergaveveld in het overzicht-object, `dyn` = de Dynamics-veldnaam die de backend verwacht. */
const BULK_VELDEN = [
  { key: "functie", dyn: "jobtitle", label: "Functie" },
  { key: "straat", dyn: "address1_line1", label: "Straat" },
  { key: "huisnummer", dyn: "cr283_huisnummer", label: "Huisnummer" },
  { key: "toevoeging", dyn: "cr283_huisnummertoevoeging", label: "Toevoeging" },
  { key: "postcode", dyn: "address1_postalcode", label: "Postcode" },
  { key: "plaats", dyn: "address1_city", label: "Plaats" },
];

/** Herberekent de platgeslagen cliënt-kolommen (voor tabel: zoeken/sorteren/filteren) nadat de
 *  koppelingen van een contactpersoon veranderd zijn. Module-niveau zodat het veilig in
 *  setState-updaters gebruikt kan worden. */
function herbereken(contact, klanten) {
  const klantnamen = klanten.map((k) => k.klantnaam).filter(Boolean).join(", ");
  const klantnummers = klanten.map((k) => k.klantnummer).filter(Boolean).join(", ");
  const rollen = [...new Set(klanten.map((k) => k.rol))].filter(Boolean).join(", ");
  return { ...contact, klanten, klantnamen, klantnummers, rollen };
}

/**
 * Contactpersonen-overzicht: dezelfde opzet als het klantoverzicht (zoeken, kolommen kiezen,
 * sorteren door op een kop te klikken, per kolom filteren en het aantal regels kiezen), maar op
 * de Dataverse-tabel `contacts`. Klik op een regel om door te klikken naar de detailweergave, waar
 * de contactpersoon (met wijzig-recht) bewerkt kan worden en (als beheerder) aan cliënten gekoppeld.
 * Zie api/beheer-contactpersonen (lijst) en api/medewerker-contactpersoon (bewerken/koppelen).
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
  const [detail, setDetail] = useState(null); // gekozen contactpersoon → detailweergave
  const [magWijzigen, setMagWijzigen] = useState(false);
  const [magBulk, setMagBulk] = useState(false);
  const [isBeheerder, setIsBeheerder] = useState(false);
  const [selectie, setSelectie] = useState(() => new Set()); // geselecteerde contactId's voor bulk
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toevoegenOpen, setToevoegenOpen] = useState(false);

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

  // Rechten: mag deze medewerker contactgegevens wijzigen, en is hij beheerder (koppelen)?
  useEffect(() => {
    fetch("/api/medewerker-rechten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMagWijzigen(!!d.magWijzigen); setMagBulk(!!d.magBulk); })
      .catch(() => { setMagWijzigen(false); setMagBulk(false); });
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((d) => {
        const rollen = (d.clientPrincipal && d.clientPrincipal.userRoles) || [];
        setIsBeheerder(rollen.includes("beheerder"));
      })
      .catch(() => setIsBeheerder(false));
  }, []);

  // ── Lokale state bijwerken na een bewerking/koppeling (zonder de hele lijst opnieuw te laden) ──
  const naBewerken = (contactId, velden) => {
    setContactpersonen((huidig) => (huidig || []).map((c) => (c.contactId === contactId ? { ...c, ...velden } : c)));
    setDetail((huidig) => (huidig && huidig.contactId === contactId ? { ...huidig, ...velden } : huidig));
  };

  const naKoppelen = (contact, klant) => {
    setContactpersonen((huidig) => {
      const lijst = huidig || [];
      return lijst.map((c) => {
        // Deze contactpersoon: cliënt toevoegen/vervangen als Primair.
        if (c.contactId === contact.contactId) {
          const zonder = (c.klanten || []).filter((k) => k.accountId !== klant.accountId);
          return herbereken(c, [...zonder, { accountId: klant.accountId, klantnaam: klant.klantnaam, klantnummer: klant.klantnummer, rol: "Primair" }]);
        }
        // Vorige primaire contactpersoon (indien in de lijst): die verliest deze cliënt.
        const nieuweKlanten = (c.klanten || []).filter((k) => !(k.accountId === klant.accountId && k.rol === "Primair"));
        if (nieuweKlanten.length !== (c.klanten || []).length) return herbereken(c, nieuweKlanten);
        return c;
      });
    });
    setDetail((huidig) => {
      if (!huidig || huidig.contactId !== contact.contactId) return huidig;
      const zonder = (huidig.klanten || []).filter((k) => k.accountId !== klant.accountId);
      return herbereken(huidig, [...zonder, { accountId: klant.accountId, klantnaam: klant.klantnaam, klantnummer: klant.klantnummer, rol: "Primair" }]);
    });
  };

  const naOntkoppelen = (contact, accountId) => {
    const strip = (c) => herbereken(c, (c.klanten || []).filter((k) => !(k.accountId === accountId && k.rol === "Primair")));
    setContactpersonen((huidig) => (huidig || []).map((c) => (c.contactId === contact.contactId ? strip(c) : c)));
    setDetail((huidig) => (huidig && huidig.contactId === contact.contactId ? strip(huidig) : huidig));
  };

  const naToevoegen = (nieuw) => {
    const contact = {
      contactId: nieuw.contactId, naam: nieuw.naam || "",
      voornaam: nieuw.voornaam || "", tussenvoegsel: nieuw.tussenvoegsel || "", achternaam: nieuw.achternaam || "",
      functie: nieuw.functie || "", email: nieuw.email || "", mobiel: nieuw.mobiel || "", telefoon: "",
      aanhef: "", straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "", land: "",
      geboortedatum: "", aangemaakt: "", klanten: [], klantnamen: "", klantnummers: "", rollen: "",
    };
    setContactpersonen((huidig) => [contact, ...(huidig || [])]);
    setToevoegenOpen(false);
    setDetail(contact); // meteen openen zodat je kunt koppelen/aanvullen
  };

  const naVerwijderen = (contactId) => {
    setContactpersonen((huidig) => (huidig || []).filter((c) => c.contactId !== contactId));
    setSelectie((h) => { const n = new Set(h); n.delete(contactId); return n; });
    setDetail(null);
  };

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
      if (!wa && wb) return 1;
      if (wa && !wb) return -1;
      return wa.localeCompare(wb, "nl", { numeric: true, sensitivity: "base" }) * richting;
    });
  }, [gefilterd, sortKey, sortDir]);

  const zichtbareRijen = gesorteerd.slice(0, toonAantal === Infinity ? undefined : toonAantal);
  const actieveFilters = Object.entries(kolomFilters).filter(([, v]) => v);

  // ── Bulk-selectie (op contactId). "Alles" werkt op de gefilterde lijst. ──
  const gefilterdeIds = gefilterd.map((c) => c.contactId);
  const allesGeselecteerd = gefilterdeIds.length > 0 && gefilterdeIds.every((id) => selectie.has(id));
  const toggleSelectie = (id) => setSelectie((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAlles = () => setSelectie(() => (allesGeselecteerd ? new Set() : new Set(gefilterdeIds)));

  const bulkToepassen = async (veld, waarde) => {
    const ids = [...selectie];
    const res = await fetch("/api/medewerker-contactpersoon", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "bulk-bewerken", contactIds: ids, veld: veld.dyn, waarde }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const d = await res.json();
    const mislukteIds = new Set((d.mislukt || []).map((m) => m.contactId));
    const geluktIds = new Set(ids.filter((id) => !mislukteIds.has(id)));
    // Weergave lokaal bijwerken voor de gelukte contactpersonen.
    setContactpersonen((huidig) => (huidig || []).map((c) => (geluktIds.has(c.contactId) ? { ...c, [veld.key]: waarde } : c)));
    return d;
  };

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
    if (kol.soort === "email") return <a href={`mailto:${waarde}`} onClick={(e) => e.stopPropagation()} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>;
    if (kol.soort === "tel") return <a href={`tel:${String(waarde).replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>;
    return waarde;
  };

  if (detail) {
    return (
      <ContactpersoonDetail
        contact={detail}
        magWijzigen={magWijzigen}
        isBeheerder={isBeheerder}
        onTerug={() => setDetail(null)}
        onBewerkt={naBewerken}
        onKoppeld={naKoppelen}
        onOntkoppeld={naOntkoppelen}
        onVerwijderd={naVerwijderen}
      />
    );
  }

  if (contactpersonen === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "20px 0" }}>Contactpersonen ophalen…</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Contactpersonen</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
        Alle contactpersonen uit Dynamics. Klik op een regel om de gegevens te bekijken
        {magWijzigen ? ", te bewerken" : ""}{isBeheerder ? " en aan cliënten te koppelen" : ""}. Bij welke
        cliënt iemand hoort wordt bepaald vanaf de cliënt (primaire en secundaire contactpersoon).
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
        {isBeheerder && (
          <button onClick={() => setToevoegenOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={14} /> Nieuwe contactpersoon
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

      {magBulk && selectie.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10, padding: "8px 12px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: KLEUR.blauw }}>{selectie.size} geselecteerd</span>
          <button onClick={() => setBulkOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Pencil size={13} /> Bulk wijzigen
          </button>
          <button onClick={() => setSelectie(new Set())} style={{ padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Selectie wissen</button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, zichtKols.length * 110) }}>
          <thead>
            <tr>
              {magBulk && (
                <th style={{ ...th, width: 34, cursor: "default" }}>
                  <input type="checkbox" checked={allesGeselecteerd} onChange={toggleAlles} title="Alles op deze lijst selecteren" />
                </th>
              )}
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
                {magBulk && <th style={{ ...th, padding: "4px 6px", width: 34 }} />}
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
            {zichtbareRijen.map((c) => {
              const gekozen = selectie.has(c.contactId);
              return (
                <tr
                  key={c.contactId}
                  onClick={() => setDetail(c)}
                  title="Klik om te openen"
                  style={{ cursor: "pointer", background: gekozen ? KLEUR.lichtblauw : "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = KLEUR.lichtblauw)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = gekozen ? KLEUR.lichtblauw : "transparent")}
                >
                  {magBulk && (
                    <td style={{ ...td, width: 34 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={gekozen} onChange={() => toggleSelectie(c.contactId)} />
                    </td>
                  )}
                  {zichtKols.map((kol) => (
                    <td key={kol.key} style={td}>{cel(kol, c)}</td>
                  ))}
                </tr>
              );
            })}
            {zichtbareRijen.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, zichtKols.length + (magBulk ? 1 : 0))} style={{ ...td, color: KLEUR.mutedTekst, whiteSpace: "normal" }}>
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

      {bulkOpen && magBulk && (
        <BulkContactBewerken
          aantal={selectie.size}
          onKlaar={() => setBulkOpen(false)}
          onToepassen={bulkToepassen}
        />
      )}

      {toevoegenOpen && isBeheerder && (
        <ContactpersoonToevoegen onKlaar={() => setToevoegenOpen(false)} onToegevoegd={naToevoegen} />
      )}
    </div>
  );
}

/* ── Bulk-bewerken van meerdere contactpersonen: kies één veld + waarde en pas toe op de selectie ── */
function BulkContactBewerken({ aantal, onKlaar, onToepassen }) {
  const [veldKey, setVeldKey] = useState("");
  const [waarde, setWaarde] = useState("");
  const [leeg, setLeeg] = useState(false); // veld leegmaken i.p.v. een waarde zetten
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [resultaat, setResultaat] = useState(null); // { gelukt, mislukt }
  const veld = BULK_VELDEN.find((v) => v.key === veldKey) || null;
  const klaar = !!veld && (leeg || waarde.trim() !== "");
  const lbl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 6 };

  const toepassen = async () => {
    if (!klaar) return;
    const teZetten = leeg ? "" : waarde;
    const omschrijving = leeg ? "leegmaken" : `wijzigen naar "${teZetten}"`;
    if (!window.confirm(`Weet je zeker dat je "${veld.label}" bij ${aantal} contactperso${aantal === 1 ? "on" : "nen"} wilt ${omschrijving}?`)) return;
    setStatus("bezig");
    try {
      const d = await onToepassen(veld, teZetten);
      setResultaat(d);
      setStatus("invoer");
    } catch {
      setStatus("fout");
    }
  };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 420, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bulk-aanpassing contactpersonen</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14 }}>
          De gekozen waarde wordt toegepast op <strong>{aantal}</strong> geselecteerde contactperso{aantal === 1 ? "on" : "nen"}. Wijzigingen gaan rechtstreeks naar Dynamics en komen in het logboek.
        </div>

        <div style={lbl}>Veld</div>
        <select value={veldKey} onChange={(e) => { setVeldKey(e.target.value); setResultaat(null); }} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, marginBottom: 8, background: "#fff" }}>
          <option value="">— kies een veld —</option>
          {BULK_VELDEN.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>

        {veld && (
          <div>
            <div style={lbl}>Nieuwe waarde</div>
            <input
              value={leeg ? "" : waarde}
              disabled={leeg}
              onChange={(e) => setWaarde(e.target.value)}
              placeholder={leeg ? "(leegmaken)" : `Nieuwe ${veld.label.toLowerCase()}…`}
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, background: leeg ? "#F4F4F1" : "#fff" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12.5, color: KLEUR.subtekst, cursor: "pointer" }}>
              <input type="checkbox" checked={leeg} onChange={(e) => setLeeg(e.target.checked)} /> Veld leegmaken
            </label>
          </div>
        )}

        {resultaat && (
          <div style={{ fontSize: 12.5, marginTop: 10, color: resultaat.mislukt && resultaat.mislukt.length ? KLEUR.rood : KLEUR.groen }}>
            {resultaat.gelukt} gewijzigd{resultaat.mislukt && resultaat.mislukt.length ? ` · ${resultaat.mislukt.length} mislukt (mogelijk onvoldoende schrijfrechten in Dynamics)` : ""}.
          </div>
        )}
        {status === "fout" && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Bulk-aanpassing mislukt, probeer het nog eens.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={toepassen} disabled={!klaar || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaar ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaar ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Bezig…" : "Toepassen"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sluiten</button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Detailweergave ─────────────────────────── */

const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 2, marginTop: 10 };

function Veld({ label, waarde, soort }) {
  const leeg = waarde == null || waarde === "";
  return (
    <div>
      <div style={labelStijl}>{label}</div>
      {leeg ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst }}>—</div>
      ) : soort === "email" ? (
        <a href={`mailto:${waarde}`} style={{ fontSize: 13, color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>
      ) : soort === "tel" ? (
        <a href={`tel:${String(waarde).replace(/\s/g, "")}`} style={{ fontSize: 13, color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>
      ) : (
        <div style={{ fontSize: 13, color: KLEUR.tekst }}>{waarde}</div>
      )}
    </div>
  );
}

function ContactpersoonDetail({ contact, magWijzigen, isBeheerder, onTerug, onBewerkt, onKoppeld, onOntkoppeld, onVerwijderd }) {
  const [bewerken, setBewerken] = useState(false);
  const [koppelKlant, setKoppelKlant] = useState(null); // gekozen cliënt voor de dubbele bevestiging
  const [ontkoppelBezig, setOntkoppelBezig] = useState(""); // accountId dat bezig is
  const [fout, setFout] = useState("");
  const [verwijderBezig, setVerwijderBezig] = useState(false);
  const [logSleutel, setLogSleutel] = useState(0); // ophogen = logboek opnieuw laden na een actie

  const verwijder = async () => {
    const aantalKoppelingen = (contact.klanten || []).length;
    const extra = aantalKoppelingen > 0
      ? `\n\nLet op: deze persoon is gekoppeld aan ${aantalKoppelingen} cliënt(en). Die koppeling(en) worden verbroken en de portaal-toegang vervalt.`
      : "";
    if (!window.confirm(`Contactpersoon "${contact.naam || ""}" verwijderen?\n\nDe persoon wordt op inactief gezet en verdwijnt uit het portaal. Dit is terug te draaien in Dynamics.${extra}`)) return;
    setVerwijderBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "verwijderen", contactId: contact.contactId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onVerwijderd(contact.contactId);
    } catch (e) {
      setFout(e.message || "Verwijderen mislukt.");
      setVerwijderBezig(false);
    }
  };

  if (bewerken) {
    return (
      <ContactpersoonBewerken
        contact={contact}
        onKlaar={() => setBewerken(false)}
        onOpgeslagen={(velden) => { onBewerkt(contact.contactId, velden); setBewerken(false); setLogSleutel((n) => n + 1); }}
      />
    );
  }

  const adres = [contact.straat, contact.huisnummer, contact.toevoeging].filter(Boolean).join(" ");
  const adresRegel2 = [contact.postcode, contact.plaats].filter(Boolean).join("  ");
  const klanten = contact.klanten || [];

  const ontkoppel = async (klant) => {
    if (!window.confirm(`Koppeling verbreken?\n\n${contact.naam} verliest hiermee de toegang tot het portaal-dossier van ${klant.klantnaam}.`)) return;
    setOntkoppelBezig(klant.accountId);
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "ontkoppel", accountId: klant.accountId, contactId: contact.contactId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onOntkoppeld(contact, klant.accountId);
      setLogSleutel((n) => n + 1);
    } catch (e) {
      setFout(e.message || "Loskoppelen mislukt.");
    } finally {
      setOntkoppelBezig("");
    }
  };

  return (
    <div>
      <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={15} /> Terug naar contactpersonen
      </button>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{contact.naam || "—"}</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{contact.functie || "Geen functie bekend"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {magWijzigen && (
              <button
                onClick={() => setBewerken(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                <Pencil size={13} /> Bewerken
              </button>
            )}
            {isBeheerder && (
              <button
                onClick={verwijder}
                disabled={verwijderBezig}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                <Trash2 size={13} /> {verwijderBezig ? "Verwijderen…" : "Verwijderen"}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px", marginTop: 6 }}>
          <div>
            <Veld label="Aanhef" waarde={contact.aanhef} />
            <Veld label="Voornaam" waarde={contact.voornaam} />
            <Veld label="Tussenvoegsel" waarde={contact.tussenvoegsel} />
            <Veld label="Achternaam" waarde={contact.achternaam} />
            <Veld label="Functie" waarde={contact.functie} />
          </div>
          <div>
            <Veld label="E-mail" waarde={contact.email} soort="email" />
            <Veld label="Mobiel" waarde={contact.mobiel} soort="tel" />
            <Veld label="Telefoon" waarde={contact.telefoon} soort="tel" />
            <Veld label="Adres" waarde={[adres, adresRegel2].filter(Boolean).join(", ")} />
            <Veld label="Land" waarde={contact.land} />
          </div>
        </div>

        {/* ── Gekoppelde cliënten ── */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Gekoppelde cliënt(en)</div>
          {klanten.length === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze contactpersoon is nog niet aan een cliënt gekoppeld.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {klanten.map((k) => (
                <div key={k.accountId + k.rol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{k.klantnaam || "—"}</span>
                    {k.klantnummer ? <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Cliëntnr {k.klantnummer}</span> : null}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: k.rol === "Primair" ? KLEUR.lichtblauw : "#F1F1EE", color: k.rol === "Primair" ? KLEUR.blauw : KLEUR.subtekst }}>{k.rol}</span>
                  </div>
                  {isBeheerder && k.rol === "Primair" && (
                    <button
                      onClick={() => ontkoppel(k)}
                      disabled={ontkoppelBezig === k.accountId}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${KLEUR.rand}`, color: KLEUR.rood, borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      <Unlink size={13} /> {ontkoppelBezig === k.accountId ? "Bezig…" : "Loskoppelen"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}

          {isBeheerder && (
            <div style={{ marginTop: 12 }}>
              <KoppelZoeker
                onKies={(klant) => setKoppelKlant(klant)}
                huidigeAccountIds={new Set(klanten.map((k) => k.accountId))}
              />
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6 }}>
                Koppelen zet deze persoon als <strong>primaire contactpersoon</strong> op de cliënt en geeft
                daarmee toegang tot het volledige dossier. Een eventuele huidige primaire contactpersoon
                verliest die toegang.
              </div>
            </div>
          )}
        </div>

        <Logboek contactId={contact.contactId} sleutel={logSleutel} />
      </div>

      {koppelKlant && (
        <KoppelBevestiging
          contact={contact}
          klant={koppelKlant}
          onAnnuleer={() => setKoppelKlant(null)}
          onGekoppeld={(klant) => { onKoppeld(contact, klant); setKoppelKlant(null); setLogSleutel((n) => n + 1); }}
        />
      )}
    </div>
  );
}

/* ── Cliënt zoeken om aan te koppelen (dropdown, zoekt server-side) ── */
function KoppelZoeker({ onKies, huidigeAccountIds }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [res, setRes] = useState([]);
  const [laden, setLaden] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = term.trim();
    if (t.length < 2) { setRes([]); return; }
    let actief = true;
    setLaden(true);
    fetch("/api/medewerker-contactpersoon?zoekKlant=" + encodeURIComponent(t))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setRes(d.klanten || []); })
      .catch(() => { if (actief) setRes([]); })
      .finally(() => { if (actief) setLaden(false); });
    return () => { actief = false; };
  }, [term, open]);

  return (
    <div style={{ position: "relative", maxWidth: 460 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${KLEUR.blauw}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        <Link2 size={14} /> Koppelen aan cliënt
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 61, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", padding: 8, width: 420, maxWidth: "92vw", maxHeight: 320, overflowY: "auto" }}>
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Zoek cliënt op naam of cliëntnummer…"
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, marginBottom: 6 }}
            />
            {laden && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Zoeken…</div>}
            {!laden && term.trim().length >= 2 && res.length === 0 && (
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Geen cliënten gevonden.</div>
            )}
            {!laden && term.trim().length < 2 && (
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Typ minimaal 2 tekens…</div>
            )}
            {res.map((k) => {
              const alGekoppeld = huidigeAccountIds.has(k.accountId);
              return (
                <button
                  key={k.accountId}
                  disabled={alGekoppeld}
                  onClick={() => { onKies(k); setOpen(false); setTerm(""); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 8px", cursor: alGekoppeld ? "default" : "pointer", fontSize: 12.5, color: alGekoppeld ? KLEUR.mutedTekst : KLEUR.tekst, borderRadius: 6 }}
                >
                  <span style={{ fontWeight: 600 }}>{k.klantnaam}</span>
                  {k.klantnummer ? <span style={{ color: KLEUR.mutedTekst }}>{"  · Cliëntnr " + k.klantnummer}</span> : null}
                  {k.primairNaam ? <span style={{ color: KLEUR.mutedTekst, display: "block", fontSize: 11.5 }}>{"Nu primair: " + k.primairNaam}</span> : <span style={{ color: KLEUR.mutedTekst, display: "block", fontSize: 11.5 }}>Nog geen primaire contactpersoon</span>}
                  {alGekoppeld ? <span style={{ color: KLEUR.groen, display: "block", fontSize: 11.5 }}>Al gekoppeld</span> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Dubbele bevestiging bij koppelen: (1) waarschuwing dossier delen, (2) bewust akkoord ── */
function KoppelBevestiging({ contact, klant, onAnnuleer, onGekoppeld }) {
  const [stap, setStap] = useState(1);
  const [akkoord, setAkkoord] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const vervangtPrimair = klant.primairContactId && klant.primairContactId !== contact.contactId && klant.primairNaam;

  const bevestig = async () => {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "koppel", accountId: klant.accountId, contactId: contact.contactId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onGekoppeld(klant);
    } catch (e) {
      setFout(e.message || "Koppelen mislukt.");
      setBezig(false);
    }
  };

  const knop = { padding: "9px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none" };

  return (
    <>
      <div onClick={onAnnuleer} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 80 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 81, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.24)", padding: 24, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "#FBEDED", flexShrink: 0 }}>
            <AlertTriangle size={18} color={KLEUR.rood} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {stap === 1 ? "Dossier delen — weet je het zeker?" : "Bewust akkoord"}
          </div>
        </div>

        {stap === 1 ? (
          <div style={{ fontSize: 13.5, color: KLEUR.tekst, lineHeight: 1.5 }}>
            Je staat op het punt <strong>{contact.naam || "deze contactpersoon"}</strong> te koppelen aan cliënt{" "}
            <strong>{klant.klantnaam}</strong>{klant.klantnummer ? ` (cliëntnr ${klant.klantnummer})` : ""}.
            <div style={{ marginTop: 10 }}>
              Hiermee wordt het <strong>volledige klantportaal-dossier</strong> van deze cliënt met deze persoon
              gedeeld: documenten (SharePoint), NAW- en relatiegegevens, openstaande taken en facturen. De persoon
              kan hierna met dit e-mailadres inloggen en dit dossier inzien.
            </div>
            {vervangtPrimair && (
              <div style={{ marginTop: 10, padding: "9px 12px", background: "#FBEDED", border: `1px solid #F0D2D2`, borderRadius: 8, color: KLEUR.rood, fontSize: 12.5 }}>
                Let op: <strong>{klant.primairNaam}</strong> is nu de primaire contactpersoon en <strong>verliest hiermee
                de toegang</strong> tot dit dossier.
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: KLEUR.tekst, lineHeight: 1.5 }}>
            Bevestig deze koppeling bewust:
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, padding: "10px 12px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Ik begrijp dat het dossier van <strong>{klant.klantnaam}</strong> hiermee gedeeld wordt met{" "}
                <strong>{contact.naam || "deze contactpersoon"}</strong>
                {vervangtPrimair ? <> en dat <strong>{klant.primairNaam}</strong> de toegang verliest</> : null}.
              </span>
            </label>
          </div>
        )}

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>{fout}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          {stap === 1 ? (
            <>
              <button onClick={onAnnuleer} style={{ ...knop, background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` }}>Annuleren</button>
              <button onClick={() => setStap(2)} style={{ ...knop, background: KLEUR.blauw, color: "#fff" }}>Doorgaan</button>
            </>
          ) : (
            <>
              <button onClick={() => { setStap(1); setAkkoord(false); }} disabled={bezig} style={{ ...knop, background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` }}>Terug</button>
              <button
                onClick={bevestig}
                disabled={!akkoord || bezig}
                style={{ ...knop, display: "inline-flex", alignItems: "center", gap: 7, background: akkoord && !bezig ? KLEUR.rood : "#D9A9A9", color: "#fff", cursor: akkoord && !bezig ? "pointer" : "default" }}
              >
                <CheckCircle2 size={14} /> {bezig ? "Koppelen…" : "Definitief koppelen"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Nieuwe contactpersoon toevoegen (beknopt: naam + e-mail + mobiel + functie) ── */
function ContactpersoonToevoegen({ onKlaar, onToegevoegd }) {
  const [f, setF] = useState({ voornaam: "", tussenvoegsel: "", achternaam: "", functie: "", email: "", mobiel: "" });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [fout, setFout] = useState("");
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));
  const klaar = f.voornaam.trim() !== "" || f.achternaam.trim() !== "";
  const lbl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 8 };
  const inp = (waarde, onZet, extra) => (
    <input value={waarde} onChange={(e) => onZet(e.target.value)} {...(extra || {})}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" }} />
  );

  const opslaan = async () => {
    if (!klaar) return;
    setStatus("bezig");
    setFout("");
    try {
      const contact = {
        firstname: f.voornaam, middlename: f.tussenvoegsel, lastname: f.achternaam,
        jobtitle: f.functie, emailaddress1: f.email, mobilephone: f.mobiel,
      };
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "toevoegen", contact }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      const naam = [f.voornaam, f.tussenvoegsel, f.achternaam].filter(Boolean).join(" ").trim();
      onToegevoegd({ contactId: d.contactId, naam: d.naam || naam, voornaam: f.voornaam, tussenvoegsel: f.tussenvoegsel, achternaam: f.achternaam, functie: f.functie, email: f.email, mobiel: f.mobiel });
    } catch (e) {
      setFout(e.message || "Aanmaken mislukt.");
      setStatus("fout");
    }
  };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 460, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Nieuwe contactpersoon</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 10 }}>
          De persoon wordt in Dynamics aangemaakt. Koppelen aan een cliënt en de overige velden doe je daarna.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><div style={lbl}>Voornaam</div>{inp(f.voornaam, zet("voornaam"))}</div>
          <div><div style={lbl}>Achternaam</div>{inp(f.achternaam, zet("achternaam"))}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div><div style={lbl}>Tussenvoegsel</div>{inp(f.tussenvoegsel, zet("tussenvoegsel"))}</div>
          <div><div style={lbl}>Functie</div>{inp(f.functie, zet("functie"))}</div>
        </div>
        <div style={lbl}>E-mail</div>{inp(f.email, zet("email"), { type: "email" })}
        <div style={lbl}>Mobiel</div>{inp(f.mobiel, zet("mobiel"))}

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Aanmaken mislukt: {fout}</div>}
        {!klaar && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Vul minimaal een voor- of achternaam in.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={opslaan} disabled={!klaar || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaar ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaar ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Aanmaken…" : "Contactpersoon aanmaken"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
        </div>
      </div>
    </>
  );
}

/* ── Contactpersoon bewerken (schrijft rechtstreeks naar Dynamics via /api/medewerker-contactpersoon) ── */
function ContactpersoonBewerken({ contact, onKlaar, onOpgeslagen }) {
  const [f, setF] = useState({
    voornaam: contact.voornaam || "",
    tussenvoegsel: contact.tussenvoegsel || "",
    achternaam: contact.achternaam || "",
    functie: contact.functie || "",
    email: contact.email || "",
    mobiel: contact.mobiel || "",
    telefoon: contact.telefoon || "",
    straat: contact.straat || "",
    huisnummer: contact.huisnummer || "",
    toevoeging: contact.toevoeging || "",
    postcode: contact.postcode || "",
    plaats: contact.plaats || "",
    land: contact.land || "",
  });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [fout, setFout] = useState("");
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));

  const input = (waarde, onZet, extra) => (
    <input
      value={waarde}
      onChange={(e) => onZet(e.target.value)}
      {...(extra || {})}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" }}
    />
  );

  const opslaan = async () => {
    setStatus("bezig");
    setFout("");
    try {
      const contactBody = {
        firstname: f.voornaam, middlename: f.tussenvoegsel, lastname: f.achternaam,
        jobtitle: f.functie, emailaddress1: f.email, mobilephone: f.mobiel, telephone1: f.telefoon,
        address1_line1: f.straat, cr283_huisnummer: f.huisnummer, cr283_huisnummertoevoeging: f.toevoeging,
        address1_postalcode: f.postcode, address1_city: f.plaats, address1_country: f.land,
      };
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "bewerken", contactId: contact.contactId, contact: contactBody }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const naam = [f.voornaam, f.tussenvoegsel, f.achternaam].filter(Boolean).join(" ").trim();
      onOpgeslagen({
        naam: naam || contact.naam,
        voornaam: f.voornaam, tussenvoegsel: f.tussenvoegsel, achternaam: f.achternaam,
        functie: f.functie, email: f.email, mobiel: f.mobiel, telefoon: f.telefoon,
        straat: f.straat, huisnummer: f.huisnummer, toevoeging: f.toevoeging,
        postcode: f.postcode, plaats: f.plaats, land: f.land,
      });
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  return (
    <div>
      <button onClick={onKlaar} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={15} /> Terug
      </button>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Contactpersoon bewerken</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12 }}>
          Wijzigingen worden rechtstreeks in Dynamics opgeslagen.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
          <div>
            <div style={labelStijl}>Voornaam</div>{input(f.voornaam, zet("voornaam"))}
            <div style={labelStijl}>Tussenvoegsel</div>{input(f.tussenvoegsel, zet("tussenvoegsel"))}
            <div style={labelStijl}>Achternaam</div>{input(f.achternaam, zet("achternaam"))}
            <div style={labelStijl}>Functie</div>{input(f.functie, zet("functie"))}
            <div style={labelStijl}>E-mail</div>{input(f.email, zet("email"), { type: "email" })}
          </div>
          <div>
            <div style={labelStijl}>Mobiel</div>{input(f.mobiel, zet("mobiel"))}
            <div style={labelStijl}>Telefoon</div>{input(f.telefoon, zet("telefoon"))}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <div><div style={labelStijl}>Straat</div>{input(f.straat, zet("straat"))}</div>
              <div><div style={labelStijl}>Nr.</div>{input(f.huisnummer, zet("huisnummer"))}</div>
              <div><div style={labelStijl}>Toev.</div>{input(f.toevoeging, zet("toevoeging"))}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={labelStijl}>Postcode</div>{input(f.postcode, zet("postcode"))}</div>
              <div><div style={labelStijl}>Plaats</div>{input(f.plaats, zet("plaats"))}</div>
            </div>
            <div style={labelStijl}>Land</div>{input(f.land, zet("land"))}
          </div>
        </div>

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Opslaan mislukt: {fout}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
        </div>
      </div>
    </div>
  );
}
