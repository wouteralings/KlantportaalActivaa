import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Search, CheckCircle2, X, ExternalLink, Loader2, Link2, Pencil, RefreshCw } from "lucide-react";

/** Zelfde palet als de rest van het medewerkersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const PER_PAGINA_OPTIES = [25, 50, 100, 250, 500, "alle"];
// Postboek-rol → veld in het klant-object (uit /api/beheer-klanten) — spiegelt TEAM_BRON in MedewerkerPortaal.jsx.
const ROL_BRON = { manager: "manager", accountant: "accountantPersoon", assistent: "assistent", fiscaal: "fiscaalMedewerker", loon: "loonadministratie", backup: "backup" };
const ROL_LABEL = { manager: "Manager", accountant: "Accountant", assistent: "Assistent", fiscaal: "Fiscaal medewerker", loon: "Loonadministratie", backup: "Back-up" };

const knop = (actief) => ({ padding: "6px 12px", borderRadius: 8, border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`, background: actief ? KLEUR.lichtblauw : "#fff", color: actief ? KLEUR.blauw : KLEUR.subtekst, fontSize: 12.5, fontWeight: 600, cursor: "pointer" });
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", background: "#fff" };

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

export default function PostboekModule() {
  const [posten, setPosten] = useState(null); // null = laden
  const [bereik, setBereik] = useState("mijn"); // mijn | kantoor
  const [statusFilter, setStatusFilter] = useState("open"); // alle | open | afgehandeld
  const [rubriekFilter, setRubriekFilter] = useState("alle"); // alle | <rubriek>
  const [perPagina, setPerPagina] = useState(50);
  const [pagina, setPagina] = useState(1);
  const [laadFout, setLaadFout] = useState("");

  const [soorten, setSoorten] = useState([]);
  const [klanten, setKlanten] = useState([]);

  const [sleep, setSleep] = useState(false);
  const inputRef = useRef(null);
  const [drop, setDrop] = useState(null); // { naam, base64, contentType } — geopende pop-up
  const [klantZoek, setKlantZoek] = useState("");
  const [klantId, setKlantId] = useState("");
  const [soortId, setSoortId] = useState("");
  const [verwerkBezig, setVerwerkBezig] = useState(false);
  const [modalFout, setModalFout] = useState("");
  const [melding, setMelding] = useState("");

  const [rijBezig, setRijBezig] = useState("");
  const [editId, setEditId] = useState("");
  const [editUrl, setEditUrl] = useState("");

  // Config (klanten + soorten) éénmalig.
  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-klanten").then((r) => (r.ok ? r.json() : {})).then((d) => { if (actief) setKlanten(Array.isArray(d.klanten) ? d.klanten : []); }).catch(() => {});
    fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).then((d) => { if (actief) setSoorten(Array.isArray(d.postboekSoorten) ? d.postboekSoorten : []); }).catch(() => {});
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
  useEffect(() => { laadPosten(); setPagina(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bereik]);

  const kies = async (file) => {
    if (!file) return;
    setModalFout(""); setMelding("");
    try {
      const base64 = await leesBase64(file);
      setDrop({ naam: file.name, base64, contentType: file.type || "application/octet-stream" });
      setKlantId(""); setKlantZoek(""); setSoortId(soorten.length === 1 ? soorten[0].id : "");
    } catch { setModalFout("Bestand kon niet worden gelezen."); }
  };

  const gekozenKlant = klanten.find((k) => k.accountId === klantId) || null;

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
    } catch (e) { setModalFout(e.message || "Verwerken is mislukt."); }
    finally { setVerwerkBezig(false); }
  };

  const zetStatus = async (post, status) => {
    setRijBezig(post.id);
    try {
      const r = await fetch("/api/medewerker-postboek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "status", id: post.id, status }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.post) setPosten((lijst) => (lijst || []).map((p) => (p.id === post.id ? d.post : p)));
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

  const klantMatches = (() => {
    const q = klantZoek.trim().toLowerCase();
    if (!q) return [];
    return klanten.filter((k) => `${k.klantnaam || ""} ${k.klantnummer || ""}`.toLowerCase().includes(q)).slice(0, 40);
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

  const gefilterd = (posten || []).filter((p) =>
    (statusFilter === "alle" || (p.status || "open") === statusFilter) &&
    (rubriekFilter === "alle" || rubriekVanPost(p) === rubriekFilter)
  );
  const totaal = gefilterd.length;
  const alle = perPagina === "alle";
  const perN = alle ? totaal || 1 : Number(perPagina);
  const maxPagina = Math.max(1, Math.ceil(totaal / perN));
  const huidigePagina = Math.min(pagina, maxPagina);
  const zichtbaar = alle ? gefilterd : gefilterd.slice((huidigePagina - 1) * perN, huidigePagina * perN);

  const cel = { padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };
  const kop = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "left", borderBottom: `1px solid ${KLEUR.rand}` };

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Postboek — inkomende post</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 720 }}>
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

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setBereik("mijn")} style={knop(bereik === "mijn")}>Mijn postboek</button>
        <button onClick={() => setBereik("kantoor")} style={knop(bereik === "kantoor")}>Kantoorbreed</button>
        <span style={{ width: 1, height: 20, background: KLEUR.rand, margin: "0 4px" }} />
        {[["open", "Open"], ["afgehandeld", "Afgehandeld"], ["alle", "Alle"]].map(([k, l]) => (
          <button key={k} onClick={() => { setStatusFilter(k); setPagina(1); }} style={knop(statusFilter === k)}>{l}</button>
        ))}
        {rubrieken.length > 0 && (
          <>
            <span style={{ width: 1, height: 20, background: KLEUR.rand, margin: "0 4px" }} />
            <label style={{ fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Rubriek
              <select value={rubriekFilter} onChange={(e) => { setRubriekFilter(e.target.value); setPagina(1); }} style={{ ...veld, padding: "6px 8px" }}>
                <option value="alle">Alle</option>
                {rubrieken.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={laadPosten} title="Vernieuwen" style={{ ...knop(false), display: "inline-flex", alignItems: "center", gap: 6 }}><RefreshCw size={13} /> Vernieuwen</button>
        <label style={{ fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Per pagina
          <select value={String(perPagina)} onChange={(e) => { setPerPagina(e.target.value === "alle" ? "alle" : Number(e.target.value)); setPagina(1); }} style={{ ...veld, padding: "6px 8px" }}>
            {PER_PAGINA_OPTIES.map((o) => <option key={String(o)} value={String(o)}>{o === "alle" ? "Alle" : o}</option>)}
          </select>
        </label>
      </div>

      {laadFout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{laadFout}</div>}

      {/* Tabel */}
      {posten === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst, padding: "10px 0" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Postboek laden…</div>
      ) : totaal === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "10px 0" }}>Geen post gevonden voor deze weergave.</div>
      ) : (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#FbFcFa" }}>
              <tr>
                <th style={kop}>Datum</th>
                <th style={kop}>Klant</th>
                <th style={kop}>Soort</th>
                <th style={kop}>Bestand</th>
                <th style={kop}>Naar</th>
                <th style={kop}>Status</th>
                <th style={{ ...kop, textAlign: "right" }}>Actie</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((p) => {
                const afgehandeld = (p.status || "open") === "afgehandeld";
                const bezig = rijBezig === p.id;
                return (
                  <tr key={p.id}>
                    <td style={{ ...cel, whiteSpace: "nowrap", color: KLEUR.subtekst }}>{formatMoment(p.aangemaaktOp)}</td>
                    <td style={cel}>
                      <div style={{ fontWeight: 600, color: KLEUR.tekst }}>{p.klantnaam || "—"}</div>
                      {p.klantnummer ? <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{p.klantnummer}</div> : null}
                    </td>
                    <td style={cel}>
                      <div>{p.soortLabel || "—"}</div>
                      {rubriekVanPost(p) ? <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "1px 8px", display: "inline-block", marginTop: 3 }}>{rubriekVanPost(p)}</div> : null}
                    </td>
                    <td style={cel}>
                      {editId === p.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://…" style={{ ...veld, width: 220, padding: "5px 8px" }} />
                          <button onClick={() => bewaarDoc(p)} disabled={bezig} style={{ ...knop(true), padding: "5px 9px" }}>Opslaan</button>
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
                    <td style={cel}>
                      <div style={{ color: KLEUR.tekst }}>{p.naarNaam || p.naarEmail || (p.naarType === "rol" && p.naarRol ? ROL_LABEL[p.naarRol] || p.naarRol : "—")}</div>
                      {p.naarType === "rol" && p.naarRol ? <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{ROL_LABEL[p.naarRol] || p.naarRol}</div> : null}
                    </td>
                    <td style={cel}>
                      {afgehandeld ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.groen, background: "#E9F4EE", borderRadius: 999, padding: "2px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> Afgehandeld</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.goud, background: "#FaF3E6", borderRadius: 999, padding: "2px 9px" }}>Open</span>
                      )}
                      {afgehandeld && p.afgehandeldOp ? <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 3 }}>{p.afgehandeldDoor || ""}{p.afgehandeldOp ? ` · ${formatMoment(p.afgehandeldOp)}` : ""}</div> : null}
                    </td>
                    <td style={{ ...cel, textAlign: "right", whiteSpace: "nowrap" }}>
                      {afgehandeld ? (
                        <button onClick={() => zetStatus(p, "open")} disabled={bezig} style={{ ...knop(false), padding: "5px 10px" }}>Heropenen</button>
                      ) : (
                        <button onClick={() => zetStatus(p, "afgehandeld")} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer" }}><CheckCircle2 size={13} /> Afhandelen</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginering */}
      {posten !== null && totaal > 0 && !alle && maxPagina > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>{(huidigePagina - 1) * perN + 1}–{Math.min(huidigePagina * perN, totaal)} van {totaal}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={huidigePagina <= 1} style={{ ...knop(false), opacity: huidigePagina <= 1 ? 0.5 : 1 }}>Vorige</button>
            <span style={{ fontSize: 12, color: KLEUR.subtekst }}>{huidigePagina} / {maxPagina}</span>
            <button onClick={() => setPagina((p) => Math.min(maxPagina, p + 1))} disabled={huidigePagina >= maxPagina} style={{ ...knop(false), opacity: huidigePagina >= maxPagina ? 0.5 : 1 }}>Volgende</button>
          </div>
        </div>
      )}

      {/* Pop-up na droppen: klant + soort kiezen */}
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

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 }}>Soort</div>
                <select value={soortId} onChange={(e) => setSoortId(e.target.value)} style={{ ...veld, width: "100%" }}>
                  <option value="">— kies een soort —</option>
                  {soorten.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                {soorten.length === 0 && <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>Nog geen soorten ingesteld (Beheer → Postboek).</div>}
              </div>

              {modalFout && <div style={{ fontSize: 12.5, color: KLEUR.rood }}>{modalFout}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 16px", borderTop: `1px solid ${KLEUR.rand}` }}>
              <button onClick={() => !verwerkBezig && setDrop(null)} style={{ ...knop(false) }}>Annuleren</button>
              <button onClick={verwerk} disabled={verwerkBezig || !klantId || !soortId} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", background: verwerkBezig || !klantId || !soortId ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: verwerkBezig || !klantId || !soortId ? "default" : "pointer" }}>
                {verwerkBezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />} {verwerkBezig ? "Verwerken…" : "Verwerken"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
