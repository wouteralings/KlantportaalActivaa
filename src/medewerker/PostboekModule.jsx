import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Search, CheckCircle2, X, ExternalLink, Loader2, Link2, Pencil, RefreshCw, User, Building2, Trash2, Send, ArrowRightCircle } from "lucide-react";

/** Zelfde palet + look-and-feel als het Taken-overzicht (TakenOverzicht.jsx), zodat het Postboek er
 *  zo veel mogelijk hetzelfde uitziet: scope-schakelaar, status-pills, zoekveld, tabel en "Toon: N". */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
  amber: "#A9660C", amberBg: "#FFF4E5", groenBg: "#E7F3EA",
};
const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];
// Postboek-rol → veld in het klant-object (uit /api/beheer-klanten) — spiegelt TEAM_BRON in MedewerkerPortaal.jsx.
const ROL_BRON = { manager: "manager", accountant: "accountantPersoon", assistent: "assistent", fiscaal: "fiscaalMedewerker", loon: "loonadministratie", backup: "backup" };
const ROL_LABEL = { manager: "Manager", accountant: "Accountant", assistent: "Assistent", fiscaal: "Fiscaal medewerker", loon: "Loonadministratie", backup: "Back-up" };

const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", background: "#fff" };
const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };

function leesBase64(file) {
  return new Promise((resolve, reject) => {
    const lezer = new FileReader();
    lezer.onload = () => resolve(String(lezer.result).replace(/^data:.*;base64,/, ""));
    lezer.onerror = reject;
    lezer.readAsDataURL(file);
  });
}
function formatMoment(iso) {
  if (!iso) return "";
  try { const d = new Date(iso); if (isNaN(d.getTime())) return ""; return d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
function klantTeamVan(k) {
  const uit = {};
  for (const [rol, bron] of Object.entries(ROL_BRON)) {
    const p = k && k[bron];
    if (p && typeof p === "object") uit[rol] = { naam: p.naam || "", email: p.email || "" };
  }
  return uit;
}

// ── Scope-schakelaar (Mijn postboek / Kantoorbreed) — zelfde vorm als TakenScope ──
function PostboekScope({ bereik, setBereik }) {
  const knop = (waarde, Icon, label, eerste) => (
    <button
      onClick={() => setBereik(waarde)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none",
        borderLeft: eerste ? "none" : `1px solid ${KLEUR.rand}`, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
        background: bereik === waarde ? KLEUR.blauw : "#fff", color: bereik === waarde ? "#fff" : KLEUR.subtekst,
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      {knop("mijn", User, "Mijn postboek", true)}
      {knop("kantoor", Building2, "Kantoorbreed", false)}
    </div>
  );
}

export default function PostboekModule({ isBeheerder = false, onWijziging }) {
  const [posten, setPosten] = useState(null); // null = laden
  const [bereik, setBereik] = useState("mijn"); // mijn | kantoor
  const [statusFilter, setStatusFilter] = useState("open"); // alle | open | afgehandeld
  const [rubriekFilter, setRubriekFilter] = useState("alle"); // alle | <rubriek>
  const [zoek, setZoek] = useState("");
  const [toonAantal, setToonAantal] = useState(25);
  const [laadFout, setLaadFout] = useState("");

  const [soorten, setSoorten] = useState([]);
  const [klanten, setKlanten] = useState([]);
  const [medewerkers, setMedewerkers] = useState([]);
  const [taakSoortOpties, setTaakSoortOpties] = useState([]);
  const [taakRubriekOpties, setTaakRubriekOpties] = useState([]);

  // Doorzetten naar een medewerker (maakt een Dynamics-taak in diens Taken).
  const [doorzet, setDoorzet] = useState(null); // de post die je doorzet, of null
  const [dzZoek, setDzZoek] = useState("");
  const [dzEmail, setDzEmail] = useState("");
  const [dzNaam, setDzNaam] = useState("");
  const [dzOpmerking, setDzOpmerking] = useState("");
  const [dzUren, setDzUren] = useState("");
  const [dzSoort, setDzSoort] = useState("");
  const [dzRubriek, setDzRubriek] = useState("");
  const [dzBezig, setDzBezig] = useState(false);
  const [dzFout, setDzFout] = useState("");

  const [sleep, setSleep] = useState(false);
  const inputRef = useRef(null);
  const [drop, setDrop] = useState(null); // { naam, base64, contentType } — geopende pop-up
  const [klantZoek, setKlantZoek] = useState("");
  const [klantId, setKlantId] = useState("");
  const [rubriekKeuze, setRubriekKeuze] = useState(""); // gekozen rubriek in de pop-up (bepaalt welke soorten je ziet)
  const [soortId, setSoortId] = useState("");
  const [verwerkBezig, setVerwerkBezig] = useState(false);
  const [modalFout, setModalFout] = useState("");
  const [melding, setMelding] = useState("");

  const [rijBezig, setRijBezig] = useState("");
  const [editId, setEditId] = useState("");
  const [editUrl, setEditUrl] = useState("");

  // Config (klanten + soorten + medewerkers/taak-opties voor doorzetten) éénmalig.
  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-klanten").then((r) => (r.ok ? r.json() : {})).then((d) => { if (actief) setKlanten(Array.isArray(d.klanten) ? d.klanten : []); }).catch(() => {});
    fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).then((d) => { if (actief) setSoorten(Array.isArray(d.postboekSoorten) ? d.postboekSoorten : []); }).catch(() => {});
    fetch("/api/medewerker-postboek?config=1").then((r) => (r.ok ? r.json() : {})).then((d) => {
      if (!actief) return;
      setMedewerkers(Array.isArray(d.medewerkers) ? d.medewerkers : []);
      setTaakSoortOpties(Array.isArray(d.taakSoortOpties) ? d.taakSoortOpties : []);
      setTaakRubriekOpties(Array.isArray(d.taakRubriekOpties) ? d.taakRubriekOpties : []);
    }).catch(() => {});
    return () => { actief = false; };
  }, []);

  // Postboek-regels — opnieuw laden bij wisselen van bereik.
  const laadPosten = () => {
    setPosten(null); setLaadFout("");
    fetch(`/api/medewerker-postboek?bereik=${encodeURIComponent(bereik)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error((d && d.error) || `HTTP ${r.status}`)))))
      .then((d) => setPosten(Array.isArray(d.posten) ? d.posten : []))
      .catch((e) => { setPosten([]); setLaadFout(e.message || "Kon het postboek niet laden."); });
  };
  useEffect(() => { laadPosten(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bereik]);

  const kies = async (file) => {
    if (!file) return;
    setModalFout(""); setMelding("");
    try {
      const base64 = await leesBase64(file);
      setDrop({ naam: file.name, base64, contentType: file.type || "application/octet-stream" });
      setKlantId(""); setKlantZoek("");
      // Rubriek + soort resetten; bij precies één rubriek (en één soort) meteen voorinvullen.
      const rubs = rubriekenVanSoorten();
      const startRub = rubs.lijst.length === 1 && !rubs.zonder ? rubs.lijst[0] : "";
      setRubriekKeuze(startRub);
      const kandidaten = startRub ? soorten.filter((s) => String(s.rubriek || "").trim() === startRub) : soorten;
      setSoortId(kandidaten.length === 1 ? kandidaten[0].id : "");
    } catch { setModalFout("Bestand kon niet worden gelezen."); }
  };

  const gekozenKlant = klanten.find((k) => k.accountId === klantId) || null;

  // Rubrieken zoals ingesteld op de soorten — sturen de cascade in de pop-up (eerst rubriek, dan soort).
  function rubriekenVanSoorten() {
    const set = new Set(); let zonder = false;
    for (const s of soorten) { const r = String(s.rubriek || "").trim(); if (r) set.add(r); else zonder = true; }
    return { lijst: [...set].sort((a, b) => a.localeCompare(b, "nl")), zonder };
  }
  const rubriekPopOpties = rubriekenVanSoorten();
  const heeftRubrieken = rubriekPopOpties.lijst.length > 0;
  const soortenVoorKeuze = (() => {
    if (!heeftRubrieken) return soorten; // geen rubrieken ingesteld → gewoon alle soorten tonen
    if (!rubriekKeuze) return [];
    if (rubriekKeuze === "__zonder__") return soorten.filter((s) => !String(s.rubriek || "").trim());
    return soorten.filter((s) => String(s.rubriek || "").trim() === rubriekKeuze);
  })();
  const kiesRubriek = (waarde) => {
    setRubriekKeuze(waarde);
    const kandidaten = waarde === "__zonder__" ? soorten.filter((s) => !String(s.rubriek || "").trim()) : soorten.filter((s) => String(s.rubriek || "").trim() === waarde);
    setSoortId(kandidaten.length === 1 ? kandidaten[0].id : "");
  };

  const verwerk = async () => {
    if (!drop) return;
    if (!klantId) { setModalFout("Kies een klant."); return; }
    if (!soortId) { setModalFout("Kies een soort."); return; }
    setVerwerkBezig(true); setModalFout("");
    try {
      const k = gekozenKlant || {};
      const r = await fetch("/api/medewerker-postboek", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: klantId, soortId,
          klantnaam: k.klantnaam || "", klantnummer: k.klantnummer != null ? String(k.klantnummer) : "",
          klantTeam: klantTeamVan(k),
          bestandsnaam: drop.naam, bestandBase64: drop.base64, contentType: drop.contentType,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDrop(null);
      setMelding(`Toegevoegd: “${(d.post && d.post.bestand) || drop.naam}” voor ${k.klantnaam || "de klant"}.`);
      laadPosten();
      onWijziging && onWijziging();
    } catch (e) { setModalFout(e.message || "Verwerken is mislukt."); }
    finally { setVerwerkBezig(false); }
  };

  const zetStatus = async (post, status) => {
    setRijBezig(post.id);
    try {
      const r = await fetch("/api/medewerker-postboek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "status", id: post.id, status }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.post) { setPosten((lijst) => (lijst || []).map((p) => (p.id === post.id ? d.post : p))); onWijziging && onWijziging(); }
    } finally { setRijBezig(""); }
  };
  const bewaarDoc = async (post) => {
    setRijBezig(post.id);
    try {
      const r = await fetch("/api/medewerker-postboek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "documentlink", id: post.id, documentUrl: editUrl.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.post) { setPosten((lijst) => (lijst || []).map((p) => (p.id === post.id ? d.post : p))); setEditId(""); }
    } finally { setRijBezig(""); }
  };
  // Alleen beheerders: een poststuk uit het postboek verwijderen. Het document in SharePoint blijft staan.
  const verwijder = async (post) => {
    if (!window.confirm(`Poststuk "${post.bestand || ""}" uit het postboek verwijderen?\n\nHet document zelf blijft in SharePoint staan.`)) return;
    setRijBezig(post.id); setLaadFout("");
    try {
      const r = await fetch("/api/medewerker-postboek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "verwijder", id: post.id }) });
      if (r.ok) { setPosten((lijst) => (lijst || []).filter((p) => p.id !== post.id)); onWijziging && onWijziging(); }
      else { const d = await r.json().catch(() => ({})); setLaadFout(d.error || "Verwijderen is mislukt."); }
    } catch (e) { setLaadFout(e.message || "Verwijderen is mislukt."); }
    finally { setRijBezig(""); }
  };

  // Doorzet-venster openen — standaard taak-soort/rubriek uit de soort-config voorinvullen.
  const openDoorzet = (post) => {
    const cfg = soorten.find((s) => s.id === post.soortId) || {};
    setDoorzet(post);
    setDzZoek(""); setDzEmail(""); setDzNaam(""); setDzOpmerking(""); setDzUren("");
    setDzSoort(cfg.taakSoort != null ? String(cfg.taakSoort) : "");
    setDzRubriek(cfg.taakRubriek != null ? String(cfg.taakRubriek) : "");
    setDzFout("");
  };
  const doorzetten = async () => {
    if (!doorzet) return;
    if (!dzEmail) { setDzFout("Kies een medewerker."); return; }
    setDzBezig(true); setDzFout("");
    try {
      const r = await fetch("/api/medewerker-postboek", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "doorzetten", id: doorzet.id, naarEmail: dzEmail, opmerking: dzOpmerking.trim(), uren: dzUren, taakSoort: dzSoort, taakRubriek: dzRubriek }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (d.post) setPosten((lijst) => (lijst || []).map((p) => (p.id === doorzet.id ? d.post : p)));
      setDoorzet(null);
      setMelding(`Doorgezet naar ${dzNaam || dzEmail}${dzUren ? ` (${dzUren} u)` : ""} — de taak staat in zijn/haar Taken.`);
      onWijziging && onWijziging();
    } catch (e) { setDzFout(e.message || "Doorzetten is mislukt."); }
    finally { setDzBezig(false); }
  };

  const klantMatches = (() => {
    const q = klantZoek.trim().toLowerCase();
    if (!q) return [];
    return klanten.filter((k) => `${k.klantnaam || ""} ${k.klantnummer || ""}`.toLowerCase().includes(q)).slice(0, 40);
  })();
  const medewerkerMatches = (() => {
    const q = dzZoek.trim().toLowerCase();
    if (!q) return [];
    return medewerkers.filter((m) => `${m.naam || ""} ${m.email || ""}`.toLowerCase().includes(q)).slice(0, 40);
  })();

  // Rubriek van een poststuk: op de regel opgeslagen (nieuwere post), anders uit de soort-config afgeleid.
  const rubriekVanSoortId = (id) => { const s = soorten.find((x) => x.id === id); return s ? String(s.rubriek || "").trim() : ""; };
  const rubriekVanPost = (p) => String(p.rubriek || "").trim() || rubriekVanSoortId(p.soortId);
  const rubrieken = (() => {
    const set = new Set();
    for (const s of soorten) { const r = String(s.rubriek || "").trim(); if (r) set.add(r); }
    for (const p of (posten || [])) { const r = rubriekVanPost(p); if (r) set.add(r); }
    return [...set].sort((a, b) => a.localeCompare(b, "nl"));
  })();

  const naarTekstVan = (p) => p.naarNaam || p.naarEmail || (p.naarType === "rol" && p.naarRol ? ROL_LABEL[p.naarRol] || p.naarRol : "");
  const term = zoek.trim().toLowerCase();
  const gefilterd = (posten || []).filter((p) => {
    if (!(statusFilter === "alle" || (p.status || "open") === statusFilter)) return false;
    if (!(rubriekFilter === "alle" || rubriekVanPost(p) === rubriekFilter)) return false;
    if (term) {
      const raak = [p.klantnaam, p.klantnummer, p.soortLabel, rubriekVanPost(p), p.bestand, naarTekstVan(p)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
      if (!raak) return false;
    }
    return true;
  });
  const totaal = gefilterd.length;
  const zichtbaar = gefilterd.slice(0, toonAantal);
  const filterActief = statusFilter !== "open" || rubriekFilter !== "alle" || !!term;

  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

  // Status-pills (Open / Afgehandeld / Alle) — zelfde vorm als de Taken-subtabs.
  const statusPill = (waarde, label) => (
    <button onClick={() => setStatusFilter(waarde)} style={{
      padding: "7px 16px", background: statusFilter === waarde ? KLEUR.blauw : "#fff", color: statusFilter === waarde ? "#fff" : KLEUR.subtekst,
      border: `1px solid ${statusFilter === waarde ? KLEUR.blauw : KLEUR.rand}`, borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Postboek</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 760 }}>
        Sleep een binnengekomen brief hierheen (of klik om te kiezen); daarna koppel je 'm aan een klant en een soort.
        Op basis van de soort belandt het bestand in de juiste SharePoint-map en gaat de post naar de juiste persoon.
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setSleep(true); }}
        onDragLeave={() => setSleep(false)}
        onDrop={(e) => { e.preventDefault(); setSleep(false); kies(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current && inputRef.current.click()}
        style={{ border: `1.5px dashed ${sleep ? KLEUR.blauw : KLEUR.rand}`, borderRadius: 10, padding: "18px 14px", textAlign: "center", cursor: "pointer", background: sleep ? KLEUR.lichtblauw : "#FAFBF9", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 16 }}
      >
        <Upload size={18} color={KLEUR.mutedTekst} />
        <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>Sleep een brief hierheen, of klik om te kiezen</div>
        <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Alle bestandstypen · max. 20 MB</div>
        <input ref={inputRef} type="file" onChange={(e) => { kies(e.target.files && e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
      </div>

      {melding && <div style={{ fontSize: 12.5, color: KLEUR.groen, marginBottom: 12 }}>{melding}</div>}

      {/* Status-pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {statusPill("open", "Open")}
        {statusPill("doorgezet", "Doorgezet")}
        {statusPill("afgehandeld", "Afgehandeld")}
        {statusPill("alle", "Alle")}
      </div>

      {/* Toolbar: scope + zoek + rubriek + vernieuwen */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <PostboekScope bereik={bereik} setBereik={setBereik} />
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op klant, soort, bestand of ontvanger…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }} />
        </div>
        {rubrieken.length > 0 && (
          <label style={{ fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }}>
            Rubriek
            <select value={rubriekFilter} onChange={(e) => setRubriekFilter(e.target.value)} style={selectStijl}>
              <option value="alle">Alle</option>
              {rubrieken.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
        {filterActief && <button onClick={() => { setStatusFilter("open"); setRubriekFilter("alle"); setZoek(""); }} style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Filters wissen</button>}
        <button onClick={laadPosten} title="Vernieuwen" style={{ ...selectStijl, display: "inline-flex", alignItems: "center", gap: 6 }}><RefreshCw size={13} /> Vernieuwen</button>
      </div>

      {laadFout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{laadFout}</div>}

      {posten === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst, padding: "10px 0" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Postboek laden…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>{totaal} {totaal === 1 ? "poststuk" : "poststukken"}</div>

          {totaal === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "16px 2px" }}>Geen post gevonden voor deze weergave.</div>
          ) : (
            <>
              <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={th}>Datum</th>
                      <th style={th}>Klant</th>
                      <th style={th}>Soort</th>
                      <th style={th}>Bestand</th>
                      <th style={th}>Naar</th>
                      <th style={th}>Status</th>
                      <th style={{ ...th, textAlign: "right" }}>Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zichtbaar.map((p) => {
                      const stat = p.status || "open";
                      const afgehandeld = stat === "afgehandeld";
                      const doorgezet = stat === "doorgezet";
                      const bezig = rijBezig === p.id;
                      return (
                        <tr key={p.id}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#FBFBF9")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ ...td, whiteSpace: "nowrap", color: KLEUR.subtekst }}>{formatMoment(p.aangemaaktOp)}</td>
                          <td style={td}>
                            <div style={{ fontWeight: 600, color: KLEUR.tekst }}>{p.klantnaam || "—"}</div>
                            {p.klantnummer ? <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{p.klantnummer}</div> : null}
                          </td>
                          <td style={td}>
                            <div>{p.soortLabel || "—"}</div>
                            {rubriekVanPost(p) ? <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "1px 8px", display: "inline-block", marginTop: 3 }}>{rubriekVanPost(p)}</div> : null}
                          </td>
                          <td style={td}>
                            {editId === p.id ? (
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://…" style={{ ...veld, width: 220, padding: "5px 8px" }} />
                                <button onClick={() => bewaarDoc(p)} disabled={bezig} style={{ padding: "5px 9px", borderRadius: 8, border: `1px solid ${KLEUR.blauw}`, background: KLEUR.lichtblauw, color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Opslaan</button>
                                <button onClick={() => setEditId("")} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2 }}><X size={14} /></button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <FileText size={14} color={KLEUR.blauw} style={{ flexShrink: 0 }} />
                                {p.documentUrl
                                  ? <a href={p.documentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: KLEUR.blauw, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>{p.bestand || "openen"} <ExternalLink size={12} /></a>
                                  : <span style={{ fontSize: 12.5, color: KLEUR.tekst }}>{p.bestand || "—"}</span>}
                                <button onClick={() => { setEditId(p.id); setEditUrl(p.documentUrl || ""); }} title="Documentlink aanpassen" style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2 }}><Pencil size={12} /></button>
                              </div>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ color: KLEUR.tekst }}>{p.naarNaam || p.naarEmail || (p.naarType === "rol" && p.naarRol ? ROL_LABEL[p.naarRol] || p.naarRol : "—")}</div>
                            {p.naarType === "rol" && p.naarRol ? <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{ROL_LABEL[p.naarRol] || p.naarRol}</div> : null}
                          </td>
                          <td style={td}>
                            {afgehandeld ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.groen, background: KLEUR.groenBg, borderRadius: 999, padding: "2px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> Afgehandeld</span>
                            ) : doorgezet ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "2px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowRightCircle size={12} /> Doorgezet</span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, borderRadius: 999, padding: "2px 9px" }}>Open</span>
                            )}
                            {afgehandeld && p.afgehandeldOp ? <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 3 }}>{p.afgehandeldDoor || ""}{p.afgehandeldOp ? ` · ${formatMoment(p.afgehandeldOp)}` : ""}</div> : null}
                            {doorgezet && (p.doorgezetNaarNaam || p.doorgezetNaarEmail) ? <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 3 }}>naar {p.doorgezetNaarNaam || p.doorgezetNaarEmail}{p.doorgezetUren != null ? ` · ${p.doorgezetUren} u` : ""}{p.doorgezetOp ? ` · ${formatMoment(p.doorgezetOp)}` : ""}</div> : null}
                          </td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            <div style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                              {!afgehandeld && (
                                <button onClick={() => openDoorzet(p)} disabled={bezig} title="Doorzetten naar een medewerker" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer" }}><Send size={13} /> Doorzetten</button>
                              )}
                              {afgehandeld ? (
                                <button onClick={() => zetStatus(p, "open")} disabled={bezig} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer" }}>Heropenen</button>
                              ) : (
                                <button onClick={() => zetStatus(p, "afgehandeld")} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer" }}><CheckCircle2 size={13} /> Afhandelen</button>
                              )}
                              {isBeheerder && (
                                <button onClick={() => verwijder(p)} disabled={bezig} title="Poststuk verwijderen (beheerder)" style={{ display: "inline-flex", alignItems: "center", padding: 6, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, cursor: bezig ? "default" : "pointer" }}><Trash2 size={14} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginering — zelfde "Toon: N" als Taken */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{Math.min(toonAantal, totaal)} van {totaal} getoond</div>
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
        </>
      )}

      {/* Pop-up na droppen: klant + rubriek + soort kiezen */}
      {drop && (
        <div onClick={() => !verwerkBezig && setDrop(null)} style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${KLEUR.rand}` }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Inkomende post koppelen</div>
              <button onClick={() => !verwerkBezig && setDrop(null)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px" }}>
                <FileText size={15} color={KLEUR.blauw} /> <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{drop.naam}</span>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Klant</div>
                {gekozenKlant ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px" }}>
                    <div><span style={{ fontWeight: 600 }}>{gekozenKlant.klantnaam}</span>{gekozenKlant.klantnummer ? <span style={{ color: KLEUR.mutedTekst }}> · {gekozenKlant.klantnummer}</span> : null}</div>
                    <button onClick={() => { setKlantId(""); setKlantZoek(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 12, fontWeight: 600 }}>Wijzig</button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: "relative" }}>
                      <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: 10 }} />
                      <input value={klantZoek} onChange={(e) => setKlantZoek(e.target.value)} placeholder="Zoek op naam of cliëntnummer…" style={{ ...veld, width: "100%", paddingLeft: 28 }} autoFocus />
                    </div>
                    {klantZoek.trim() && (
                      <div style={{ border: `1px solid ${KLEUR.rand}`, borderTop: "none", borderRadius: "0 0 7px 7px", maxHeight: 220, overflow: "auto" }}>
                        {klantMatches.length === 0 ? (
                          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "8px 10px" }}>{klanten.length === 0 ? "Klanten laden…" : "Geen klant gevonden."}</div>
                        ) : klantMatches.map((k) => (
                          <button key={k.accountId} onClick={() => { setKlantId(k.accountId); setKlantZoek(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", borderTop: `1px solid ${KLEUR.rand}`, cursor: "pointer", fontSize: 12.5 }}>
                            <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{k.klantnaam}</span>{k.klantnummer ? <span style={{ color: KLEUR.mutedTekst }}> · {k.klantnummer}</span> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {heeftRubrieken && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Rubriek</div>
                  <select value={rubriekKeuze} onChange={(e) => kiesRubriek(e.target.value)} style={{ ...veld, width: "100%" }}>
                    <option value="">— kies een rubriek —</option>
                    {rubriekPopOpties.lijst.map((r) => <option key={r} value={r}>{r}</option>)}
                    {rubriekPopOpties.zonder && <option value="__zonder__">Zonder rubriek</option>}
                  </select>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Soort</div>
                <select value={soortId} onChange={(e) => setSoortId(e.target.value)} disabled={heeftRubrieken && !rubriekKeuze} style={{ ...veld, width: "100%", background: heeftRubrieken && !rubriekKeuze ? "#F4F5F2" : "#fff", cursor: heeftRubrieken && !rubriekKeuze ? "not-allowed" : "pointer" }}>
                  <option value="">{heeftRubrieken && !rubriekKeuze ? "— kies eerst een rubriek —" : "— kies een soort —"}</option>
                  {soortenVoorKeuze.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                {soorten.length === 0 && <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>Nog geen soorten ingesteld (Beheer → Postboek).</div>}
                {soorten.length > 0 && heeftRubrieken && rubriekKeuze && soortenVoorKeuze.length === 0 && <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>Geen soorten in deze rubriek.</div>}
              </div>

              {modalFout && <div style={{ fontSize: 12.5, color: KLEUR.rood }}>{modalFout}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 16px", borderTop: `1px solid ${KLEUR.rand}` }}>
              <button onClick={() => !verwerkBezig && setDrop(null)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
              <button onClick={verwerk} disabled={verwerkBezig || !klantId || !soortId} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", background: verwerkBezig || !klantId || !soortId ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: verwerkBezig || !klantId || !soortId ? "default" : "pointer" }}>
                {verwerkBezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />} {verwerkBezig ? "Verwerken…" : "Verwerken"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doorzet-venster: naar een medewerker (maakt een Dynamics-taak) */}
      {doorzet && (
        <div onClick={() => !dzBezig && setDoorzet(null)} style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${KLEUR.rand}` }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Doorzetten naar medewerker</div>
              <button onClick={() => !dzBezig && setDoorzet(null)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px" }}>
                <FileText size={15} color={KLEUR.blauw} /> <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{doorzet.bestand || "poststuk"}</span>{doorzet.klantnaam ? <span> · {doorzet.klantnaam}</span> : null}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Medewerker</div>
                {dzEmail ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px" }}>
                    <div><span style={{ fontWeight: 600 }}>{dzNaam || dzEmail}</span>{dzNaam && dzEmail ? <span style={{ color: KLEUR.mutedTekst }}> · {dzEmail}</span> : null}</div>
                    <button onClick={() => { setDzEmail(""); setDzNaam(""); setDzZoek(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 12, fontWeight: 600 }}>Wijzig</button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: "relative" }}>
                      <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: 10 }} />
                      <input value={dzZoek} onChange={(e) => setDzZoek(e.target.value)} placeholder="Zoek op naam of e-mailadres…" style={{ ...veld, width: "100%", paddingLeft: 28 }} autoFocus />
                    </div>
                    {dzZoek.trim() && (
                      <div style={{ border: `1px solid ${KLEUR.rand}`, borderTop: "none", borderRadius: "0 0 7px 7px", maxHeight: 220, overflow: "auto" }}>
                        {medewerkerMatches.length === 0 ? (
                          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "8px 10px" }}>{medewerkers.length === 0 ? "Medewerkers laden…" : "Geen medewerker gevonden."}</div>
                        ) : medewerkerMatches.map((m) => (
                          <button key={m.email || m.naam} onClick={() => { setDzEmail(m.email); setDzNaam(m.naam); setDzZoek(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", borderTop: `1px solid ${KLEUR.rand}`, cursor: "pointer", fontSize: 12.5 }}>
                            <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{m.naam}</span>{m.email ? <span style={{ color: KLEUR.mutedTekst }}> · {m.email}</span> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Opmerking (optioneel)</div>
                <textarea value={dzOpmerking} onChange={(e) => setDzOpmerking(e.target.value)} rows={3} placeholder="Korte toelichting voor de medewerker…" style={{ ...veld, width: "100%", resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: "0 0 130px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Uren-indicatie</div>
                  <input type="number" min="0" step="0.25" value={dzUren} onChange={(e) => setDzUren(e.target.value)} placeholder="uren" style={{ ...veld, width: "100%" }} />
                </div>
                {taakSoortOpties.length > 0 && (
                  <div style={{ flex: "1 1 160px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Taak-soort</div>
                    <select value={dzSoort} onChange={(e) => setDzSoort(e.target.value)} style={{ ...veld, width: "100%" }}>
                      <option value="">— geen —</option>
                      {taakSoortOpties.map((o) => <option key={String(o.waarde)} value={String(o.waarde)}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                {taakRubriekOpties.length > 0 && (
                  <div style={{ flex: "1 1 160px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Taak-rubriek</div>
                    <select value={dzRubriek} onChange={(e) => setDzRubriek(e.target.value)} style={{ ...veld, width: "100%" }}>
                      <option value="">— geen —</option>
                      {taakRubriekOpties.map((o) => <option key={String(o.waarde)} value={String(o.waarde)}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {dzFout && <div style={{ fontSize: 12.5, color: KLEUR.rood }}>{dzFout}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 16px", borderTop: `1px solid ${KLEUR.rand}` }}>
              <button onClick={() => !dzBezig && setDoorzet(null)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
              <button onClick={doorzetten} disabled={dzBezig || !dzEmail} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", background: dzBezig || !dzEmail ? "#9DB4A5" : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: dzBezig || !dzEmail ? "default" : "pointer" }}>
                {dzBezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />} {dzBezig ? "Doorzetten…" : "Doorzetten"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
