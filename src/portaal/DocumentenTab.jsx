import { useCallback, useEffect, useState } from "react";
import { FileText, Folder, ChevronRight, ChevronDown, Circle, Download, Upload, CheckCircle2, Loader2, ArrowLeft, RefreshCw, X, ClipboardList } from "lucide-react";

/** Zelfde palet als het klantportaal (bewust hier herhaald zodat dit bestand op zichzelf staat). */
const KLEUR = {
  blauw: "#1C5D8C",
  goud: "#B98237",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

const OFFICE_EXT = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const extVan = (naam) => (String(naam || "").split(".").pop() || "").toLowerCase();

function leesBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function tijd(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Documenten-tab voor de klant, volledig via de app-only laag (/api/mijn-documenten) — de klant
 * heeft zelf geen SharePoint-toegang nodig; het portaal bepaalt op basis van de rechten wat zichtbaar
 * is (Documenten / Directie / Administratie). Onderaan staan de openstaande aanlever-verzoeken, waar
 * de klant per regel een bestand kan aanleveren (/api/mijn-aanleververzoeken).
 */
export default function DocumentenTab() {
  const [docStatus, setDocStatus] = useState("laden"); // laden | klaar | nogNietActief | fout | geenRecht
  const [accounts, setAccounts] = useState([]);
  const [nav, setNav] = useState(null); // { accountId, crumbs:[{naam,driveId,itemId}], items, laden, fout }
  const [viewer, setViewer] = useState(null); // { titel, blobUrl, laden, fout }
  const [verzoeken, setVerzoeken] = useState([]);
  const [bezigRegel, setBezigRegel] = useState("");
  const [openRegels, setOpenRegels] = useState(() => new Set());
  const [opmerkingDraft, setOpmerkingDraft] = useState({});
  const [bezigOpm, setBezigOpm] = useState("");

  const toggleRegel = (id) => setOpenRegels((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const laadDocumenten = useCallback(() => {
    setDocStatus("laden");
    fetch("/api/mijn-documenten")
      .then(async (r) => {
        if (r.status === 501) { setDocStatus("nogNietActief"); return null; }
        if (r.status === 403) { setDocStatus("geenRecht"); return null; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (d) { setAccounts(d.accounts || []); setDocStatus("klaar"); } })
      .catch(() => setDocStatus("fout"));
  }, []);

  const laadVerzoeken = useCallback(() => {
    fetch("/api/mijn-aanleververzoeken")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setVerzoeken(d.verzoeken || []))
      .catch(() => setVerzoeken([]));
  }, []);

  useEffect(() => { laadDocumenten(); laadVerzoeken(); }, [laadDocumenten, laadVerzoeken]);

  // ── Navigatie in mappen ──
  const laadMap = useCallback((accountId, crumbs) => {
    const laatste = crumbs[crumbs.length - 1];
    setNav({ accountId, crumbs, items: null, laden: true, fout: "" });
    fetch(`/api/mijn-documenten?accountId=${encodeURIComponent(accountId)}&driveId=${encodeURIComponent(laatste.driveId)}&itemId=${encodeURIComponent(laatste.itemId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setNav((n) => (n && n.accountId === accountId ? { ...n, items: d.items || [], laden: false } : n)))
      .catch(() => setNav((n) => (n ? { ...n, items: [], laden: false, fout: "Kon de map niet openen." } : n)));
  }, []);

  const openSectieMap = (accountId, sectie, item) =>
    laadMap(accountId, [{ naam: sectie.label, driveId: sectie.driveId, itemId: sectie.itemId }, { naam: item.naam, driveId: item.driveId, itemId: item.itemId }]);
  const openSubMap = (item) => nav && laadMap(nav.accountId, [...nav.crumbs, { naam: item.naam, driveId: item.driveId, itemId: item.itemId }]);
  const gaNaarCrumb = (i) => nav && laadMap(nav.accountId, nav.crumbs.slice(0, i + 1));

  // ── Document openen (blob via app-only) ──
  const openBestand = async (accountId, item) => {
    setViewer({ titel: item.naam, blobUrl: "", laden: true, fout: "" });
    try {
      const office = OFFICE_EXT.includes(extVan(item.naam));
      const qs = `accountId=${encodeURIComponent(accountId)}&driveId=${encodeURIComponent(item.driveId)}&itemId=${encodeURIComponent(item.itemId)}${office ? "&formaat=pdf" : ""}`;
      const r = await fetch(`/api/mijn-document-inhoud?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      setViewer({ titel: item.naam, blobUrl: URL.createObjectURL(blob), laden: false, fout: "" });
    } catch {
      setViewer({ titel: item.naam, blobUrl: "", laden: false, fout: "Kon dit document niet openen." });
    }
  };
  const sluitViewer = () => { setViewer((v) => { if (v && v.blobUrl) URL.revokeObjectURL(v.blobUrl); return null; }); };

  // ── Aanleveren (upload per regel) ──
  const uploadRegel = async (verzoek, regel, file) => {
    if (!file) return;
    setBezigRegel(regel.id);
    try {
      const contentBase64 = await leesBase64(file);
      const r = await fetch("/api/mijn-aanleververzoeken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "upload", verzoekId: verzoek.id, regelId: regel.id, origineleNaam: file.name, contentBase64, contentType: file.type }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      if (d.verzoek) setVerzoeken((huidig) => huidig.map((v) => (v.id === d.verzoek.id ? d.verzoek : v)));
    } catch (e) {
      alert("Aanleveren mislukt: " + (e.message || e));
    } finally {
      setBezigRegel("");
    }
  };

  const saveOpmerking = async (verzoek, regel) => {
    const opmerking = opmerkingDraft[regel.id] != null ? opmerkingDraft[regel.id] : (regel.opmerking || "");
    setBezigOpm(regel.id);
    try {
      const r = await fetch("/api/mijn-aanleververzoeken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "opmerking", verzoekId: verzoek.id, regelId: regel.id, opmerking }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      if (d.verzoek) setVerzoeken((huidig) => huidig.map((v) => (v.id === d.verzoek.id ? d.verzoek : v)));
    } catch (e) {
      alert("Opmerking opslaan mislukt: " + (e.message || e));
    } finally {
      setBezigOpm("");
    }
  };

  const kaart = { border: `1px solid ${KLEUR.rand}`, borderRadius: 12, padding: 18, marginBottom: 16 };
  const itemRij = (accountId, item) => (
    <button
      key={item.id}
      onClick={() => (item.type === "map" ? (nav ? openSubMap(item) : null) : openBestand(accountId, item))}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", marginBottom: 6 }}
    >
      {item.type === "map" ? <Folder size={16} color={KLEUR.goud} /> : <FileText size={16} color={KLEUR.blauw} />}
      <span style={{ flex: 1, fontSize: 13.5, color: KLEUR.tekst }}>{item.naam}</span>
      {item.type === "bestand" && item.grootteKb != null && <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{item.grootteKb} kB</span>}
      {item.type === "map" ? <ChevronRight size={15} color={KLEUR.mutedTekst} /> : <Download size={15} color={KLEUR.mutedTekst} />}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Documenten</div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst }}>Je documenten en aanlever-verzoeken. Je hoeft niet apart in te loggen bij SharePoint.</div>
        </div>
        <button onClick={() => { laadDocumenten(); laadVerzoeken(); setNav(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: KLEUR.subtekst, cursor: "pointer" }}>
          <RefreshCw size={14} /> Vernieuwen
        </button>
      </div>

      {/* ── Aanlever-verzoeken ── */}
      {verzoeken.length > 0 && (
        <div style={{ ...kaart, background: KLEUR.lichtblauw, borderColor: "#CFE0EF" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ClipboardList size={17} color={KLEUR.blauw} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>Aan te leveren documenten</span>
          </div>
          {verzoeken.map((v) => (
            <div key={v.id} style={{ background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{v.lijstNaam || "Aanlever-verzoek"}{v.klantnaam ? ` · ${v.klantnaam}` : ""}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {v.deadline && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F6E9E9", color: KLEUR.rood }}>Deadline {v.deadline}</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: v.status === "afgerond" ? "#E7F2EA" : "#FBF3E4", color: v.status === "afgerond" ? KLEUR.groen : KLEUR.goud }}>
                    {v.status === "afgerond" ? "Compleet" : "Openstaand"}
                  </span>
                </div>
              </div>
              {v.notitie && <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 8 }}>{v.notitie}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {v.regels.map((r) => {
                  const klaar = r.status === "aangeleverd";
                  const open = openRegels.has(r.id);
                  const opmWaarde = opmerkingDraft[r.id] != null ? opmerkingDraft[r.id] : (r.opmerking || "");
                  return (
                    <div key={r.id} style={{ border: `1px solid ${klaar ? "#BFE0C8" : KLEUR.rand}`, borderRadius: 8, background: klaar ? "#F1F8F3" : "#fff", overflow: "hidden" }}>
                      <button onClick={() => toggleRegel(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 12px", cursor: "pointer" }}>
                        {klaar ? <CheckCircle2 size={17} color={KLEUR.groen} /> : <Circle size={17} color={KLEUR.mutedTekst} />}
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>
                          {r.naam}{r.verplicht === false ? <span style={{ fontWeight: 400, color: KLEUR.mutedTekst }}> · optioneel</span> : null}
                        </span>
                        {klaar && <span style={{ fontSize: 11.5, color: KLEUR.groen, fontWeight: 700 }}>Aangeleverd</span>}
                        {!klaar && r.opmerking && <span style={{ fontSize: 11, color: KLEUR.goud, fontWeight: 600 }}>opmerking</span>}
                        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                      </button>
                      {open && (
                        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {r.toelichting && <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{r.toelichting}</div>}
                          {klaar && r.bestand && <div style={{ fontSize: 12, color: KLEUR.groen }}>Aangeleverd: {r.bestand.naam}{r.aangeleverdOp ? ` · ${tijd(r.aangeleverdOp)}` : ""}</div>}
                          <div>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: klaar ? "#fff" : KLEUR.blauw, color: klaar ? KLEUR.blauw : "#fff", border: klaar ? `1px solid ${KLEUR.blauw}` : "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                              {bezigRegel === r.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
                              {bezigRegel === r.id ? "Uploaden…" : (r.bestand ? "Vervangen" : "Bestand uploaden")}
                              <input type="file" style={{ display: "none" }} disabled={bezigRegel === r.id} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; uploadRegel(v, r, f); }} />
                            </label>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Opmerking (zichtbaar voor je accountant)</div>
                            <textarea
                              value={opmWaarde}
                              onChange={(e) => setOpmerkingDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                              rows={2}
                              placeholder="bv. zit in de bijlage / niet van toepassing"
                              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 12.5, resize: "vertical", outline: "none" }}
                            />
                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                              <button onClick={() => saveOpmerking(v, r)} disabled={bezigOpm === r.id} style={{ padding: "5px 11px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}>
                                {bezigOpm === r.id ? "Opslaan…" : "Opmerking opslaan"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Documentweergave ── */}
      {docStatus === "laden" && <div style={{ display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13 }}><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Documenten ophalen…</div>}
      {docStatus === "nogNietActief" && <div style={{ ...kaart, color: KLEUR.subtekst, fontSize: 13 }}>De documentweergave wordt binnenkort geactiveerd.</div>}
      {docStatus === "geenRecht" && <div style={{ ...kaart, color: KLEUR.subtekst, fontSize: 13 }}>Er zijn (nog) geen documenten voor je vrijgegeven.</div>}
      {docStatus === "fout" && <div style={{ ...kaart, color: KLEUR.rood, fontSize: 13 }}>De documenten konden niet worden geladen.</div>}

      {docStatus === "klaar" && !nav && accounts.length === 0 && (
        <div style={{ ...kaart, color: KLEUR.subtekst, fontSize: 13 }}>Er zijn (nog) geen documenten voor je vrijgegeven.</div>
      )}

      {/* Topniveau: per cliënt de secties */}
      {docStatus === "klaar" && !nav && accounts.map((acc) => (
        <div key={acc.accountId}>
          {accounts.length > 1 && <div style={{ fontSize: 14, fontWeight: 700, margin: "10px 0 6px" }}>{acc.klantnaam}</div>}
          {(acc.secties || []).length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>Geen documenten beschikbaar.</div>}
          {(acc.secties || []).map((sectie) => (
            <div key={sectie.key} style={kaart}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{sectie.label}</div>
              {sectie.items.length === 0 ? (
                <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze map is leeg.</div>
              ) : (
                sectie.items.map((item) =>
                  item.type === "map" ? (
                    <button key={item.id} onClick={() => openSectieMap(acc.accountId, sectie, item)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", marginBottom: 6 }}>
                      <Folder size={16} color={KLEUR.goud} />
                      <span style={{ flex: 1, fontSize: 13.5 }}>{item.naam}</span>
                      <ChevronRight size={15} color={KLEUR.mutedTekst} />
                    </button>
                  ) : itemRij(acc.accountId, item)
                )
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Navigatie in een map */}
      {nav && (
        <div style={kaart}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setNav(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
              <ArrowLeft size={14} /> Documenten
            </button>
            {nav.crumbs.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <ChevronRight size={13} color={KLEUR.mutedTekst} />
                <button onClick={() => gaNaarCrumb(i)} style={{ background: "none", border: "none", color: i === nav.crumbs.length - 1 ? KLEUR.tekst : KLEUR.blauw, fontWeight: i === nav.crumbs.length - 1 ? 700 : 600, fontSize: 12.5, cursor: "pointer", padding: 0 }}>{c.naam}</button>
              </span>
            ))}
          </div>
          {nav.laden ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13 }}><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Openen…</div>
          ) : nav.fout ? (
            <div style={{ color: KLEUR.rood, fontSize: 13 }}>{nav.fout}</div>
          ) : (nav.items || []).length === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze map is leeg.</div>
          ) : (
            nav.items.map((item) => itemRij(nav.accountId, item))
          )}
        </div>
      )}

      {/* Documentviewer */}
      {viewer && (
        <>
          <div onClick={sluitViewer} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 90 }} />
          <div style={{ position: "fixed", inset: "4vh 4vw", zIndex: 91, background: "#fff", borderRadius: 12, boxShadow: "0 12px 48px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${KLEUR.rand}` }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewer.titel}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {viewer.blobUrl && <a href={viewer.blobUrl} download={viewer.titel} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw, textDecoration: "none", fontWeight: 600 }}><Download size={14} /> Downloaden</a>}
                <button onClick={sluitViewer} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ flex: 1, background: "#f3f3f1" }}>
              {viewer.laden ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: KLEUR.mutedTekst, gap: 8 }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Openen…</div>
              ) : viewer.fout ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: KLEUR.rood }}>{viewer.fout}</div>
              ) : (
                <iframe title={viewer.titel} src={viewer.blobUrl} style={{ width: "100%", height: "100%", border: "none" }} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
