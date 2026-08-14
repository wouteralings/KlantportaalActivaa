import { useEffect, useState } from "react";
import { Inbox, Save, ChevronDown, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Info } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. DossierSjablonenBeheer.jsx/BrievenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };

// De rollen van een klant waarnaar een soort inkomende post gerouteerd kan worden. De sleutels
// spiegelen het team van de klant (manager/accountant/assistent/fiscaal medewerker/loonadministratie/
// back-up); de postboek-endpoint (fase 2) zoekt bij het verwerken de bijbehorende medewerker van díe klant.
const ROLLEN = [
  { key: "manager", label: "Manager" },
  { key: "accountant", label: "Accountant" },
  { key: "assistent", label: "Assistent" },
  { key: "fiscaal", label: "Fiscaal medewerker" },
  { key: "loon", label: "Loonadministratie" },
  { key: "backup", label: "Back-up" },
];

let teller = 0;
function nieuwId() { teller += 1; return `pbsoort_${teller}_${(typeof performance !== "undefined" && performance.now ? Math.floor(performance.now()) : teller)}`; }

// Ruwe opgeslagen soort → nette bewerk-vorm (met defaults, zodat oudere/onvolledige data niet breekt).
function naarSoort(s) {
  const o = s && typeof s === "object" ? s : {};
  const naarType = o.naarType === "persoon" ? "persoon" : "rol";
  return {
    id: o.id || nieuwId(),
    label: String(o.label || ""),
    // Vrij in te vullen rubriek/categorie voor het postboek (los van de Dynamics-taakrubriek). Hierop
    // kan in het medewerkers-postboek worden gefilterd.
    rubriek: typeof o.rubriek === "string" ? o.rubriek : "",
    naarType,
    naarRol: typeof o.naarRol === "string" ? o.naarRol : "accountant",
    naarNaam: typeof o.naarNaam === "string" ? o.naarNaam : "",
    naarEmail: typeof o.naarEmail === "string" ? o.naarEmail : "",
    submap: typeof o.submap === "string" ? o.submap : "",
    bestandsnaam: typeof o.bestandsnaam === "string" ? o.bestandsnaam : "",
    // Standaard taak-soort + rubriek (Dynamics-optieset) voor het "doorzetten" van een poststuk naar een
    // medewerker: de aangemaakte taak krijgt deze soort/rubriek. De medewerker mag ze bij het doorzetten
    // nog aanpassen. Leeg = geen standaard.
    taakSoort: o.taakSoort != null ? String(o.taakSoort) : "",
    taakRubriek: o.taakRubriek != null ? String(o.taakRubriek) : "",
    // Standaard uren-indicatie voor de doorgezette taak — wordt in het doorzet-venster voorgevuld. Leeg =
    // de standaardtijd van de taaksoort (Beheer → Taken).
    taakUren: o.taakUren != null ? String(o.taakUren) : "",
    // Sommige soorten hoeven niet afgehandeld te worden: dan wordt de postboek-regel meteen als
    // "Afgehandeld" aangemaakt i.p.v. "Open" (fase 2 honoreert dit bij het verwerken).
    directAfgehandeld: !!o.directAfgehandeld,
  };
}

/**
 * Beheer → Postboek: de soorten inkomende post. Per soort stelt Wouter in: het label, naar wie de
 * brief gaat (een rol van de klant óf een vaste persoon/postvak), in welke SharePoint-submap (onder de
 * klantmap) het bestand belandt, en de standaard bestandsnaam. Meerdere soorten, elk in/uitklapbaar,
 * toevoegen/verwijderen/verplaatsen.
 *
 * Opslag: /api/beheer-instellingen onder de sleutel postboekSoorten = [{ id, label, naarType,
 * naarRol|naarNaam+naarEmail, submap, bestandsnaam }]. De medewerker-Postboek-module (fase 2) gebruikt
 * dit om bij het droppen de klant-SharePoint-submap, de bestandsnaam en de ontvanger te bepalen.
 */
export default function PostboekSoortenBeheer() {
  const [geladen, setGeladen] = useState(false);
  const [soorten, setSoorten] = useState([]);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [taakSoortOpties, setTaakSoortOpties] = useState([]); // [{ waarde, label }]
  const [taakRubriekOpties, setTaakRubriekOpties] = useState([]);

  useEffect(() => {
    let actief = true;
    Promise.all([
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-taaksoorten").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-taakrubrieken").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([inst, soortenData, rubriekenData]) => {
        if (!actief) return;
        const lijst = Array.isArray(inst.postboekSoorten) ? inst.postboekSoorten.map(naarSoort) : [];
        setSoorten(lijst);
        // Bevroren taaksoorten (Beheer → Taken) niet aanbieden als keuze.
        const soortCfg = (soortenData && soortenData.config) || {};
        const opties = (soortenData && Array.isArray(soortenData.opties)) ? soortenData.opties : [];
        setTaakSoortOpties(opties.filter((o) => !(soortCfg[String(o.waarde)] && soortCfg[String(o.waarde)].bevroren)));
        setTaakRubriekOpties((rubriekenData && Array.isArray(rubriekenData.opties)) ? rubriekenData.opties : []);
        setGeladen(true);
      })
      .catch(() => { if (actief) { setFout("De postboek-soorten konden niet worden geladen."); setGeladen(true); } });
    return () => { actief = false; };
  }, []);

  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const zet = (id, key, waarde) => setSoorten((lijst) => lijst.map((s) => (s.id === id ? { ...s, [key]: waarde } : s)));
  const nieuw = () => { const id = nieuwId(); setSoorten((lijst) => [...lijst, naarSoort({ id, label: "Nieuwe soort", naarType: "rol", naarRol: "accountant" })]); setOpenIds((s) => new Set([...s, id])); };
  const verwijder = (id) => { setSoorten((lijst) => lijst.filter((s) => s.id !== id)); setOpenIds((s) => { const n = new Set(s); n.delete(id); return n; }); };
  const verplaats = (id, richting) => setSoorten((lijst) => {
    const i = lijst.findIndex((s) => s.id === id); const j = i + richting;
    if (i === -1 || j < 0 || j >= lijst.length) return lijst;
    const n = lijst.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const schoon = soorten.map((s) => ({
        id: s.id,
        label: String(s.label || "").trim() || "Naamloze soort",
        rubriek: String(s.rubriek || "").trim(),
        naarType: s.naarType === "persoon" ? "persoon" : "rol",
        naarRol: s.naarType === "persoon" ? "" : (s.naarRol || "accountant"),
        naarNaam: s.naarType === "persoon" ? String(s.naarNaam || "").trim() : "",
        naarEmail: s.naarType === "persoon" ? String(s.naarEmail || "").trim() : "",
        submap: String(s.submap || "").trim(),
        bestandsnaam: String(s.bestandsnaam || "").trim(),
        taakSoort: s.taakSoort != null ? String(s.taakSoort) : "",
        taakRubriek: s.taakRubriek != null ? String(s.taakRubriek) : "",
        taakUren: String(s.taakUren || "").trim(),
        directAfgehandeld: !!s.directAfgehandeld,
      }));
      const res = await fetch("/api/beheer-instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postboekSoorten: schoon }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          Beheer hier de soorten inkomende post. In het medewerkersportaal (Postboek) sleept een medewerker een
          brief naar binnen en kiest de klant + soort; op basis van de soort bepaalt het portaal waar het bestand
          in SharePoint belandt, onder welke naam, en naar wie de brief gaat. Plaatshouders voor de bestandsnaam:
          <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, margin: "0 3px" }}>{"{{klantnaam}}"}</code>,
          <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, marginRight: 3 }}>{"{{soort}}"}</code>,
          <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, marginRight: 3 }}>{"{{rubriek}}"}</code> en
          <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, marginLeft: 3 }}>{"{{datum}}"}</code>.
        </div>
      </div>

      {!geladen ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "8px 0" }}>Postboek-soorten laden…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {soorten.length === 0 && (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "2px 0 6px" }}>Nog geen soorten. Voeg er hieronder één toe.</div>
          )}
          {soorten.map((s, i) => {
            const isOpen = openIds.has(s.id);
            const naarTekst = s.naarType === "persoon" ? (s.naarNaam || s.naarEmail || "vast persoon") : (ROLLEN.find((r) => r.key === s.naarRol)?.label || "rol");
            return (
              <div key={s.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#FbFcFa" }}>
                  <button onClick={() => toggle(s.id)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", flex: 1, textAlign: "left", padding: 0 }}>
                    {isOpen ? <ChevronDown size={15} color={KLEUR.mutedTekst} /> : <ChevronRight size={15} color={KLEUR.mutedTekst} />}
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst }}>{s.label || "Naamloze soort"}</span>
                    {s.rubriek ? <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "1px 8px" }}>{s.rubriek}</span> : null}
                    <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>→ {naarTekst}</span>
                    {s.directAfgehandeld && <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.groen, background: "#E9F4EE", borderRadius: 999, padding: "1px 8px" }}>direct afgehandeld</span>}
                  </button>
                  <button onClick={() => verplaats(s.id, -1)} disabled={i === 0} title="Omhoog" style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.35 : 1, padding: 2 }}><ArrowUp size={15} color={KLEUR.mutedTekst} /></button>
                  <button onClick={() => verplaats(s.id, 1)} disabled={i === soorten.length - 1} title="Omlaag" style={{ background: "none", border: "none", cursor: i === soorten.length - 1 ? "default" : "pointer", opacity: i === soorten.length - 1 ? 0.35 : 1, padding: 2 }}><ArrowDown size={15} color={KLEUR.mutedTekst} /></button>
                  <button onClick={() => verwijder(s.id)} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Trash2 size={15} color={KLEUR.rood} /></button>
                </div>
                {isOpen && (
                  <div style={{ padding: 12, borderTop: `1px solid ${KLEUR.rand}`, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ flex: "1 1 260px" }}>
                        <span style={labelStijl}>Naam van de soort</span>
                        <input value={s.label} onChange={(e) => zet(s.id, "label", e.target.value)} placeholder="Bijv. Belastingdienst, Bank, Notaris…" style={invoerStijl} />
                      </div>
                      <div style={{ flex: "1 1 200px" }}>
                        <span style={labelStijl}>Rubriek</span>
                        <input value={s.rubriek} onChange={(e) => zet(s.id, "rubriek", e.target.value)} placeholder="Bijv. Fiscaal, Loon, Algemeen…" style={invoerStijl} />
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>Categorie waarop in het postboek gefilterd kan worden. Optioneel.</div>
                      </div>
                    </div>

                    <div>
                      <span style={labelStijl}>Naar wie gaat deze post?</span>
                      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: KLEUR.tekst }}>
                          <input type="radio" name={`naarType_${s.id}`} checked={s.naarType !== "persoon"} onChange={() => zet(s.id, "naarType", "rol")} /> Een rol van de klant
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: KLEUR.tekst }}>
                          <input type="radio" name={`naarType_${s.id}`} checked={s.naarType === "persoon"} onChange={() => zet(s.id, "naarType", "persoon")} /> Vast persoon/postvak
                        </label>
                      </div>
                      {s.naarType === "persoon" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <div>
                            <span style={labelStijl}>Naam (optioneel)</span>
                            <input value={s.naarNaam} onChange={(e) => zet(s.id, "naarNaam", e.target.value)} placeholder="Bijv. Backoffice" style={{ ...invoerStijl, width: 220 }} />
                          </div>
                          <div>
                            <span style={labelStijl}>E-mailadres</span>
                            <input value={s.naarEmail} onChange={(e) => zet(s.id, "naarEmail", e.target.value)} placeholder="bijv. post@activaa.nl" style={{ ...invoerStijl, width: 260 }} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span style={labelStijl}>Rol</span>
                          <select value={s.naarRol} onChange={(e) => zet(s.id, "naarRol", e.target.value)} style={{ ...invoerStijl, maxWidth: 300 }}>
                            {ROLLEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>De brief gaat naar wie deze rol bij de gekozen klant vervult.</div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <span style={labelStijl}>SharePoint-submap</span>
                        <input value={s.submap} onChange={(e) => zet(s.id, "submap", e.target.value)} placeholder="Inkomende post" style={{ ...invoerStijl, width: 260 }} />
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>Submap onder de SharePoint-map van de klant. Met een “/” maak je submappen.</div>
                      </div>
                      <div>
                        <span style={labelStijl}>Standaard bestandsnaam</span>
                        <input value={s.bestandsnaam} onChange={(e) => zet(s.id, "bestandsnaam", e.target.value)} placeholder="{{datum}} {{soort}}" style={{ ...invoerStijl, width: 320 }} />
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>Leeg = de originele bestandsnaam. Extensie komt er automatisch achter.</div>
                      </div>
                    </div>

                    <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 12 }}>
                      <span style={{ ...labelStijl, marginBottom: 2 }}>Doorzetten naar medewerker — standaardtaak</span>
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 8 }}>
                        Zet een medewerker het poststuk door naar een collega, dan krijgt de aangemaakte taak deze soort en rubriek.
                        De medewerker mag ze bij het doorzetten nog aanpassen. Leeg = geen standaard.
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <span style={labelStijl}>Taak-soort</span>
                          <select value={s.taakSoort} onChange={(e) => zet(s.id, "taakSoort", e.target.value)} style={{ ...invoerStijl, width: 260 }}>
                            <option value="">— geen —</option>
                            {taakSoortOpties.map((o) => <option key={String(o.waarde)} value={String(o.waarde)}>{o.label}</option>)}
                          </select>
                          {taakSoortOpties.length === 0 && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>Geen taak-soorten beschikbaar (controleer DYNAMICS_TAAK_SOORT_VELD).</div>}
                        </div>
                        <div>
                          <span style={labelStijl}>Taak-rubriek</span>
                          <select value={s.taakRubriek} onChange={(e) => zet(s.id, "taakRubriek", e.target.value)} style={{ ...invoerStijl, width: 260 }}>
                            <option value="">— geen —</option>
                            {taakRubriekOpties.map((o) => <option key={String(o.waarde)} value={String(o.waarde)}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <span style={labelStijl}>Standaard uren</span>
                          <input type="number" min="0" step="0.25" value={s.taakUren} onChange={(e) => zet(s.id, "taakUren", e.target.value)} placeholder="bijv. 0,5" style={{ ...invoerStijl, width: 130 }} />
                          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>Leeg = de standaardtijd van de taaksoort (Beheer → Taken).</div>
                        </div>
                      </div>
                    </div>

                    <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!s.directAfgehandeld} onChange={(e) => zet(s.id, "directAfgehandeld", e.target.checked)} style={{ marginTop: 2 }} />
                      <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
                        Meteen op “Afgehandeld” zetten — deze soort hoeft niet te worden afgehandeld en krijgt dus geen open-status.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <button onClick={nieuw} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={14} /> Nieuwe soort
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button
          onClick={opslaan}
          disabled={status === "bezig" || !geladen}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: status === "bezig" || !geladen ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: status === "bezig" || !geladen ? "default" : "pointer" }}
        >
          <Save size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
        {(status === "fout" || fout) && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout || "Opslaan mislukt."}</span>}
      </div>
    </div>
  );
}
