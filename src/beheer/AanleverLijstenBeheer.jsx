import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, CheckCircle2, ListChecks, FileText, ChevronDown, Search } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
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

const nieuwId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const legeRegel = () => ({ id: nieuwId(), type: "document", naam: "", bestandsnaam: "", toelichting: "", verplicht: true, opties: [] });
const legeLijst = () => ({ id: nieuwId(), naam: "", omschrijving: "", pad: "", regels: [legeRegel()] });

// Vraagtypen per regel. "document" = het huidige upload-gedrag; de overige typen zijn echte vragen
// die de klant in de uitvraag beantwoordt (Fase A). Fase B koppelt een antwoord aan een Dynamics-
// tabel+kolom en schrijft het daarheen weg; Fase C maakt vervolgvragen conditioneel (skip-logica).
// Beide bouwen voort op dit type-veld, dus bestaande lijsten (zonder type) gedragen zich als
// "document" en blijven werken.
const VRAAGTYPES = [
  ["document", "Document (upload)"],
  ["janee", "Ja / nee"],
  ["open", "Open tekst"],
  ["keuze", "Keuzelijst"],
  ["getal", "Getal"],
  ["datum", "Datum"],
];

const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

const invoerStijl = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" };
const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 };

/**
 * Beheer van de aanleverlijsten (herbruikbare sjablonen van uit te vragen documenten). Vrij samen te
 * stellen: per lijst een naam + omschrijving en een reeks regels, waarbij elke regel om één document
 * vraagt met een vaste bestandsnaam-structuur. Deze lijsten worden later uitgezet als aanlever-
 * verzoek naar een klant (fase 3). Opslag via /api/beheer-aanleverlijsten.
 */
export default function AanleverLijstenBeheer() {
  const [lijsten, setLijsten] = useState(null); // null = laden
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [vuil, setVuil] = useState(false); // onopgeslagen wijzigingen
  const [open, setOpen] = useState(() => new Set()); // ingeklapte/uitgeklapte lijsten (id's die open zijn)
  const [toonAantal, setToonAantal] = useState(25);
  const [zoek, setZoek] = useState("");
  // Dynamics-metadata voor het koppelen van een vraag aan een tabel+kolom (Fase B).
  const [tabellen, setTabellen] = useState(null); // null = laden; [] = niet beschikbaar
  const [kolommenCache, setKolommenCache] = useState({}); // { tabelLogicalName: [{ logicalName, label, type, vraagtype }] }
  const kolomFetchRef = useRef(new Set()); // tabellen waarvoor de kolommen al opgehaald (worden)

  // Kolommen van één tabel ophalen (1× per tabel; ref voorkomt dubbele calls).
  const laadKolommen = useCallback((tabel) => {
    if (!tabel || kolomFetchRef.current.has(tabel)) return;
    kolomFetchRef.current.add(tabel);
    fetch(`/api/beheer-dynamics-metadata?tabel=${encodeURIComponent(tabel)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKolommenCache((c) => ({ ...c, [tabel]: d.kolommen || [] })))
      .catch(() => setKolommenCache((c) => ({ ...c, [tabel]: [] })));
  }, []);

  const toggle = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const gefilterd = (lijsten || []).filter((l) => {
    const q = zoek.trim().toLowerCase();
    if (!q) return true;
    const hooi = `${l.naam} ${l.omschrijving || ""} ${l.pad || ""} ${(l.regels || []).map((r) => r.naam).join(" ")}`.toLowerCase();
    return hooi.includes(q);
  });

  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-aanleverlijsten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setLijsten(d.lijsten || []); })
      .catch(() => { if (actief) { setLijsten([]); setFout("Kon de aanleverlijsten niet laden."); } });
    // Dynamics-tabellen 1× ophalen voor de koppel-dropdowns (best-effort).
    fetch("/api/beheer-dynamics-metadata")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setTabellen(d.tabellen || []); })
      .catch(() => { if (actief) setTabellen([]); });
    return () => { actief = false; };
  }, []);

  // Zodra lijsten geladen/gewijzigd zijn: de kolommen voorladen van elke tabel die al aan een
  // vraag gekoppeld is (zodat de kolom-dropdown de opgeslagen keuze meteen kan tonen).
  useEffect(() => {
    (lijsten || []).forEach((l) => (l.regels || []).forEach((r) => { if (r.dynamics && r.dynamics.tabel) laadKolommen(r.dynamics.tabel); }));
  }, [lijsten, laadKolommen]);

  const wijzig = (fn) => { setLijsten((h) => fn(h || [])); setVuil(true); setStatus("rust"); };
  const updateLijst = (id, patch) => wijzig((h) => h.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const verwijderLijst = (id) => wijzig((h) => h.filter((l) => l.id !== id));
  const voegLijstToe = () => { const l = legeLijst(); wijzig((h) => [l, ...h]); setOpen((o) => new Set(o).add(l.id)); };
  const updateRegel = (lijstId, regelId, patch) =>
    wijzig((h) => h.map((l) => (l.id === lijstId ? { ...l, regels: l.regels.map((r) => (r.id === regelId ? { ...r, ...patch } : r)) } : l)));
  const voegRegelToe = (lijstId) =>
    wijzig((h) => h.map((l) => (l.id === lijstId ? { ...l, regels: [...l.regels, legeRegel()] } : l)));
  const verwijderRegel = (lijstId, regelId) =>
    wijzig((h) => h.map((l) => (l.id === lijstId ? { ...l, regels: l.regels.filter((r) => r.id !== regelId) } : l)));
  // Keuzelijst-opties per regel (alleen bij type "keuze").
  const wijzigRegelOpties = (lijstId, regelId, fn) =>
    wijzig((h) => h.map((l) => (l.id !== lijstId ? l : { ...l, regels: l.regels.map((r) => (r.id !== regelId ? r : { ...r, opties: fn(r.opties || []) })) })));
  const voegOptieToe = (lijstId, regelId) => wijzigRegelOpties(lijstId, regelId, (o) => [...o, ""]);
  const updateOptie = (lijstId, regelId, i, waarde) => wijzigRegelOpties(lijstId, regelId, (o) => o.map((x, idx) => (idx === i ? waarde : x)));
  const verwijderOptie = (lijstId, regelId, i) => wijzigRegelOpties(lijstId, regelId, (o) => o.filter((_, idx) => idx !== i));

  // Dynamics-koppeling per regel (Fase B): merge in regel.dynamics (of wis met null).
  const zetDynamics = (lijstId, regelId, patch) =>
    wijzig((h) => h.map((l) => (l.id !== lijstId ? l : { ...l, regels: l.regels.map((r) => (r.id !== regelId ? r : { ...r, dynamics: patch === null ? null : { ...(r.dynamics || {}), ...patch } })) })));
  // Tabel gekozen: koppeling (her)initialiseren en de kolommen laden.
  const kiesTabel = (lijstId, regelId, huidigeDyn, logicalName) => {
    const tab = (tabellen || []).find((t) => t.logicalName === logicalName);
    if (!tab) { zetDynamics(lijstId, regelId, null); return; }
    laadKolommen(tab.logicalName);
    zetDynamics(lijstId, regelId, { tabel: tab.logicalName, tabelLabel: tab.label, entitySet: tab.entitySet, kolom: "", kolomLabel: "", kolomType: "", vraagtype: "", opties: undefined, record: (huidigeDyn && huidigeDyn.record) || "account" });
  };
  // Kolom gekozen: type/vraagtype vastleggen en (bij een keuzelijst-kolom) de opties ophalen.
  const kiesKolom = (lijstId, regelId, tabel, logicalName) => {
    const kol = (kolommenCache[tabel] || []).find((k) => k.logicalName === logicalName);
    if (!kol) { zetDynamics(lijstId, regelId, { kolom: "", kolomLabel: "", kolomType: "", vraagtype: "", opties: undefined }); return; }
    zetDynamics(lijstId, regelId, { kolom: kol.logicalName, kolomLabel: kol.label, kolomType: kol.type, vraagtype: kol.vraagtype, opties: undefined });
    if (kol.type === "Picklist") {
      fetch(`/api/beheer-dynamics-metadata?tabel=${encodeURIComponent(tabel)}&kolom=${encodeURIComponent(kol.logicalName)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => zetDynamics(lijstId, regelId, { opties: d.opties || [] }))
        .catch(() => {});
    }
  };

  const opslaan = async () => {
    setStatus("bezig");
    setFout("");
    try {
      const r = await fetch("/api/beheer-aanleverlijsten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lijsten: lijsten || [] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setLijsten(d.lijsten || []);
      setStatus("opgeslagen");
      setVuil(false);
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  if (lijsten === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Aanleverlijsten ophalen…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <ListChecks size={17} color={KLEUR.blauw} /> Aanleverlijsten
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginTop: 4, maxWidth: 720 }}>
            Herbruikbare uitvraaglijsten. Per regel vraag je een <strong>document</strong> op (met vaste
            bestandsnaam) óf stel je een <strong>vraag</strong> — ja/nee, open tekst, keuzelijst, getal of
            datum. Je zet een lijst later uit als aanlever-verzoek; de klant levert dan per regel het
            bestand aan of beantwoordt de vraag.
          </div>
        </div>
        <button onClick={voegLijstToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> Nieuwe lijst
        </button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, margin: "8px 0" }}>{fout}</div>}

      {lijsten.length === 0 && (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: 24, textAlign: "center", margin: "12px 0" }}>
          Nog geen aanleverlijsten. Klik op <strong>Nieuwe lijst</strong> om er een in te richten.
        </div>
      )}

      {lijsten.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>{gefilterd.length} lijst{gefilterd.length === 1 ? "" : "en"}{gefilterd.length !== lijsten.length ? ` van ${lijsten.length}` : ""}</div>
          <div style={{ position: "relative", flex: "0 1 300px", minWidth: 180 }}>
            <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, omschrijving, map of document…" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px 7px 28px", fontSize: 12.5, outline: "none" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {gefilterd.length === 0 && lijsten.length > 0 && (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "8px 2px" }}>Geen lijsten die aan de zoekopdracht voldoen.</div>
        )}
        {(toonAantal === Infinity ? gefilterd : gefilterd.slice(0, toonAantal)).map((lijst) => {
          const isOpen = open.has(lijst.id);
          return (
          <div key={lijst.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: isOpen ? 16 : "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => toggle(lijst.id)} style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lijst.naam || "Naamloze lijst"}</span>
                <span style={{ fontSize: 12, color: KLEUR.mutedTekst, flexShrink: 0 }}>{lijst.regels.length} regel{lijst.regels.length === 1 ? "" : "s"}</span>
              </button>
              <button onClick={() => verwijderLijst(lijst.id)} title="Lijst verwijderen" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "7px 11px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Trash2 size={13} /> Lijst
              </button>
            </div>

            {isOpen && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                <div>
                  <div style={labelStijl}>Naam van de lijst</div>
                  <input value={lijst.naam} onChange={(e) => updateLijst(lijst.id, { naam: e.target.value })} placeholder="bv. Jaarwerk IB" style={invoerStijl} />
                </div>
                <div>
                  <div style={labelStijl}>Omschrijving (optioneel)</div>
                  <input value={lijst.omschrijving} onChange={(e) => updateLijst(lijst.id, { omschrijving: e.target.value })} placeholder="Korte toelichting" style={invoerStijl} />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={labelStijl}>Opslaglocatie (map in SharePoint)</div>
                <input value={lijst.pad || ""} onChange={(e) => updateLijst(lijst.id, { pad: e.target.value })} placeholder="bv. Aanleveren/{jaar} of Inkomstenbelasting/{jaar}" style={invoerStijl} />
                <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 3 }}>
                  Waar de aangeleverde documenten van deze lijst landen, onder de klantmap. Gebruik <strong>{"{jaar}"}</strong> en <strong>{"{lijst}"}</strong> als plaatshouders. Leeg = de vaste <em>Aanleveren</em>-map.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 8 }}>
                <FileText size={13} /> Vragen &amp; documenten ({lijst.regels.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lijst.regels.map((regel) => {
                  const type = regel.type || "document";
                  return (
                  <div key={regel.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, background: "#FBFBF9" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto auto", gap: 8, alignItems: "center" }}>
                      <select value={type} onChange={(e) => updateRegel(lijst.id, regel.id, { type: e.target.value })} style={{ ...invoerStijl, cursor: "pointer" }} title="Type vraag">
                        {VRAAGTYPES.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                      </select>
                      <input value={regel.naam} onChange={(e) => updateRegel(lijst.id, regel.id, { naam: e.target.value })} placeholder={type === "document" ? "bv. Aangifte IB 2025" : "bv. Heeft u een auto van de zaak?"} style={invoerStijl} />
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst, whiteSpace: "nowrap", cursor: "pointer" }} title="Verplicht">
                        <input type="checkbox" checked={regel.verplicht !== false} onChange={(e) => updateRegel(lijst.id, regel.id, { verplicht: e.target.checked })} /> Verplicht
                      </label>
                      <button onClick={() => verwijderRegel(lijst.id, regel.id)} title="Regel verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, cursor: "pointer", flexShrink: 0 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <input value={regel.toelichting || ""} onChange={(e) => updateRegel(lijst.id, regel.id, { toelichting: e.target.value })} placeholder="Toelichting voor de klant (optioneel)" style={invoerStijl} />
                    </div>

                    {type === "document" && (
                      <div style={{ marginTop: 8 }}>
                        <div style={labelStijl}>Vaste bestandsnaam</div>
                        <input value={regel.bestandsnaam || ""} onChange={(e) => updateRegel(lijst.id, regel.id, { bestandsnaam: e.target.value })} placeholder="bv. IB-2025 (leeg = documentnaam)" style={invoerStijl} />
                      </div>
                    )}

                    {type === "keuze" && (
                      <div style={{ marginTop: 8 }}>
                        <div style={labelStijl}>Keuze-opties</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(regel.opties || []).map((optie, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input value={optie} onChange={(e) => updateOptie(lijst.id, regel.id, i, e.target.value)} placeholder={`Optie ${i + 1}`} style={invoerStijl} />
                              <button onClick={() => verwijderOptie(lijst.id, regel.id, i)} title="Optie verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, cursor: "pointer", flexShrink: 0 }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                          {(regel.opties || []).length === 0 && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Nog geen opties toegevoegd.</div>}
                        </div>
                        <button onClick={() => voegOptieToe(lijst.id, regel.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "5px 9px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                          <Plus size={12} /> Optie toevoegen
                        </button>
                      </div>
                    )}

                    {(type === "janee" || type === "open" || type === "getal" || type === "datum") && (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                        {type === "janee" ? "De klant beantwoordt deze vraag met Ja of Nee."
                          : type === "open" ? "De klant vult een vrij tekstantwoord in."
                          : type === "getal" ? "De klant vult een getal in."
                          : "De klant kiest een datum."}
                      </div>
                    )}

                    {/* Koppel het antwoord aan een Dynamics-tabel + kolom (alleen voor vraag-regels). */}
                    {isVraag && (() => {
                      const dyn = regel.dynamics || {};
                      const kols = kolommenCache[dyn.tabel] || [];
                      return (
                        <div style={{ marginTop: 8, borderTop: `1px dashed ${KLEUR.rand}`, paddingTop: 8 }}>
                          <div style={labelStijl}>Koppel aan Dynamics — antwoord wordt hierheen weggeschreven (optioneel)</div>
                          {tabellen === null ? (
                            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Dynamics-tabellen laden…</div>
                          ) : tabellen.length === 0 ? (
                            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Dynamics-metadata is niet beschikbaar (controleer de koppeling).</div>
                          ) : (
                            <>
                              <div style={{ display: "grid", gridTemplateColumns: dyn.tabel ? "1fr 1fr 1fr" : "1fr", gap: 8 }}>
                                <select value={dyn.tabel || ""} onChange={(e) => kiesTabel(lijst.id, regel.id, dyn, e.target.value)} style={{ ...invoerStijl, cursor: "pointer" }} title="Dynamics-tabel">
                                  <option value="">— niet koppelen —</option>
                                  {tabellen.map((t) => <option key={t.logicalName} value={t.logicalName}>{t.label}</option>)}
                                </select>
                                {dyn.tabel && (
                                  <select value={dyn.kolom || ""} onChange={(e) => kiesKolom(lijst.id, regel.id, dyn.tabel, e.target.value)} style={{ ...invoerStijl, cursor: "pointer" }} title="Kolom (veld)">
                                    <option value="">{kolommenCache[dyn.tabel] ? "— kies kolom —" : "kolommen laden…"}</option>
                                    {kols.map((k) => <option key={k.logicalName} value={k.logicalName}>{k.label}</option>)}
                                  </select>
                                )}
                                {dyn.tabel && (
                                  <select value={dyn.record || "account"} onChange={(e) => zetDynamics(lijst.id, regel.id, { record: e.target.value })} style={{ ...invoerStijl, cursor: "pointer" }} title="Welk record wordt gevuld">
                                    <option value="account">Account van de klant</option>
                                    <option value="contact">Contactpersoon van de klant</option>
                                  </select>
                                )}
                              </div>
                              {dyn.tabel && dyn.kolom && dyn.vraagtype && dyn.vraagtype !== type && (
                                <div style={{ fontSize: 11, color: KLEUR.rood, marginTop: 4 }}>
                                  Let op: dit veld past het best bij een <strong>{dyn.vraagtype}</strong>-vraag, maar deze vraag is <strong>{type}</strong>. Het antwoord kan dan niet altijd worden weggeschreven.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  );
                })}
              </div>

              <button onClick={() => voegRegelToe(lijst.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={13} /> Vraag of document toevoegen
              </button>
            </div>
            )}
          </div>
          );
        })}
      </div>

      {lijsten.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 12, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
          {AANTALLEN.map(([n, lbl]) => (
            <button key={lbl} onClick={() => setToonAantal(n)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`, background: toonAantal === n ? KLEUR.blauw : "#fff", color: toonAantal === n ? "#fff" : KLEUR.subtekst }}>{lbl}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, position: "sticky", bottom: 0, background: "#fff", paddingTop: 8 }}>
        <button onClick={opslaan} disabled={status === "bezig" || !vuil} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: vuil ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: vuil ? "pointer" : "default" }}>
          <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && !vuil && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
        {vuil && status !== "bezig" && <span style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Niet-opgeslagen wijzigingen.</span>}
      </div>
    </div>
  );
}
