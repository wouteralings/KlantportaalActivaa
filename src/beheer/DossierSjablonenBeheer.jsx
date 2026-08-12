import { useEffect, useRef, useState } from "react";
import { FileText, Save, ChevronDown, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Info } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. DossierIndelingBeheer.jsx/BrievenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };

/**
 * Beheer → Dossiers → per soort (onder de Notulen-/Dividend-kaart) het blok "Voorbeelddocumenten".
 *
 * Hier bouwt Wouter per dossiersoort (notulen / dividenduitkering) één of meer BENOEMDE voorbeeld-
 * sjablonen op — net als de standaardbrieven in de Brieven-module: elk sjabloon heeft een naam en een
 * tekst, en je kunt er zoveel toevoegen als je wilt (toevoegen/hernoemen/verwijderen/verplaatsen,
 * elk inklapbaar). In het dossier kiest de medewerker vervolgens welk sjabloon hij als voorbeeld op
 * blanco A4 wil openen (zie DossierVoorbeeldModal in MedewerkerPortaal.jsx).
 *
 * In de tekst mogen merge-velden ({{...}}) staan — de gewone klant-/dossiergegevens plus elk veld uit
 * de veldencatalogus van die soort. Die worden bij het openen van het voorbeeld ingevuld met de
 * waarden van het geopende dossier.
 *
 * Opslag: het generieke /api/beheer-instellingen onder de sleutel dossierSjablonen[soort] =
 * { sjablonen: [{ id, naam, tekst }] }. Omdat elk soort-blok apart opslaat, wordt bij het opslaan eerst
 * de actuele dossierSjablonen opgehaald en alleen de eigen soort daarin vervangen — zo blijft het
 * andere soort ongemoeid. De veldencatalogus komt uit /api/dossier-velden.
 */
const SOORT_LABEL = { notulen: "Notulen", dividend: "Dividenduitkeringen" };

// Vaste (niet uit de catalogus komende) merge-velden — spiegelen wat DossierVoorbeeldModal invult.
const VASTE_PLAATSHOUDERS = [
  { key: "klantnaam", label: "Cliënt-/bedrijfsnaam" },
  { key: "groepsnaam", label: "Groepsnaam" },
  { key: "accountant", label: "Accountant" },
  { key: "assistent", label: "Assistent" },
  { key: "manager", label: "Manager" },
  { key: "periode", label: "Periode (jaar/datum)" },
  { key: "datum", label: "Datum van vandaag" },
];

let sjabloonTeller = 0;
function nieuwSjabloonId() { sjabloonTeller += 1; return `sjabloon_${sjabloonTeller}_${(typeof performance !== "undefined" && performance.now ? Math.floor(performance.now()) : sjabloonTeller)}`; }

// Zet een opgeslagen soort-config (nieuw: {sjablonen:[…]}; oud: {standaard, perSoort}) om naar de
// bewerk-lijst [{ id, naam, tekst }]. De oude vorm wordt netjes gemigreerd zodat niets verloren gaat.
function naarLijst(eigen) {
  if (eigen && Array.isArray(eigen.sjablonen)) {
    return eigen.sjablonen
      .filter((s) => s && (s.naam != null || s.tekst != null))
      .map((s) => ({ id: s.id || nieuwSjabloonId(), naam: String(s.naam || "Naamloos sjabloon"), tekst: String(s.tekst || "") }));
  }
  const lijst = [];
  if (eigen && typeof eigen.standaard === "string" && eigen.standaard.trim()) lijst.push({ id: nieuwSjabloonId(), naam: "Standaard", tekst: eigen.standaard });
  if (eigen && eigen.perSoort && typeof eigen.perSoort === "object") {
    for (const [k, v] of Object.entries(eigen.perSoort)) if (v && String(v).trim()) lijst.push({ id: nieuwSjabloonId(), naam: `Soort ${k}`, tekst: String(v) });
  }
  return lijst;
}

export default function DossierSjablonenPerSoort({ soort }) {
  const soortLabel = SOORT_LABEL[soort] || "Dossier";
  const [open, setOpen] = useState(false); // dichtgeklapt bij openen van de pagina
  const [geladen, setGeladen] = useState(false);
  const [catalogus, setCatalogus] = useState([]);
  const [sjablonen, setSjablonen] = useState([]); // [{ id, naam, tekst }]
  const [openIds, setOpenIds] = useState(() => new Set()); // welke sjabloon-kaarten opengeklapt zijn
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  // Alleen dividend: SharePoint-submap voor de bijlagen die bij "Dividendbelasting = Ja" worden
  // geüpload (zie DividendBijlageKaart in MedewerkerPortaal.jsx + api/medewerker-dossier-bijlage).
  // Wordt met dezelfde "Opslaan"-knop bewaard (instellingen-sleutel dividendBijlageMap).
  const [bijlageMap, setBijlageMap] = useState("");

  // De laatst gefocuste tekstarea + welk sjabloon dat is — zodat een klik op een merge-veld-chip de
  // plaatshouder op de cursorpositie in dát sjabloon invoegt.
  const actiefRef = useRef(null); // { el, id }

  useEffect(() => {
    let actief = true;
    Promise.all([
      fetch(`/api/dossier-velden?soort=${encodeURIComponent(soort)}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([velden, inst]) => {
        if (!actief) return;
        setCatalogus(velden.catalogus || []);
        const eigen = inst && inst.dossierSjablonen && inst.dossierSjablonen[soort];
        setSjablonen(naarLijst(eigen));
        if (soort === "dividend") setBijlageMap(inst && typeof inst.dividendBijlageMap === "string" && inst.dividendBijlageMap.trim() ? inst.dividendBijlageMap : "Dividendbelasting");
        setGeladen(true);
      })
      .catch(() => { if (actief) { setFout("De voorbeeld-sjablonen konden niet worden geladen."); setGeladen(true); } });
    return () => { actief = false; };
  }, [soort]);

  const toggleKaart = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const zet = (id, key, waarde) => setSjablonen((lijst) => lijst.map((s) => (s.id === id ? { ...s, [key]: waarde } : s)));
  const nieuw = () => { const id = nieuwSjabloonId(); setSjablonen((lijst) => [...lijst, { id, naam: "Nieuw sjabloon", tekst: "" }]); setOpenIds((s) => new Set([...s, id])); };
  const verwijder = (id) => { setSjablonen((lijst) => lijst.filter((s) => s.id !== id)); setOpenIds((s) => { const n = new Set(s); n.delete(id); return n; }); };
  const verplaats = (id, richting) => setSjablonen((lijst) => {
    const i = lijst.findIndex((s) => s.id === id); const j = i + richting;
    if (i === -1 || j < 0 || j >= lijst.length) return lijst;
    const n = lijst.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const huidigeTekst = (id) => { const s = sjablonen.find((x) => x.id === id); return s ? s.tekst : ""; };
  const voegIn = (plaatshouder) => {
    const a = actiefRef.current;
    if (!a || !a.el) return;
    const el = a.el;
    const oud = huidigeTekst(a.id);
    const start = typeof el.selectionStart === "number" ? el.selectionStart : oud.length;
    const eind = typeof el.selectionEnd === "number" ? el.selectionEnd : oud.length;
    const nieuweTekst = oud.slice(0, start) + plaatshouder + oud.slice(eind);
    zet(a.id, "tekst", nieuweTekst);
    const pos = start + plaatshouder.length;
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => { try { el.focus(); el.setSelectionRange(pos, pos); } catch { /* caret best-effort */ } });
    }
  };

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      // Actuele dossierSjablonen ophalen en alleen déze soort vervangen — zo blijft het andere soort
      // (dat een eigen blok/instantie heeft) ongemoeid.
      const huidig = await fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      const alle = (huidig && huidig.dossierSjablonen && typeof huidig.dossierSjablonen === "object") ? huidig.dossierSjablonen : {};
      const schoon = sjablonen.map((s) => ({ id: s.id, naam: String(s.naam || "").trim() || "Naamloos sjabloon", tekst: String(s.tekst || "") }));
      const nieuweAlle = { ...alle, [soort]: { sjablonen: schoon } };
      const body = soort === "dividend"
        ? { dossierSjablonen: nieuweAlle, dividendBijlageMap: (bijlageMap.trim() || "Dividendbelasting") }
        : { dossierSjablonen: nieuweAlle };
      const res = await fetch("/api/beheer-instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  // Merge-veld-chips: de vaste velden + elk (niet-vast) veld uit de catalogus.
  const plaatshouders = [
    ...VASTE_PLAATSHOUDERS,
    ...(catalogus || []).filter((v) => v && v.key && !String(v.key).startsWith("__")).map((v) => ({ key: v.key, label: v.label || v.key })),
  ];

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {open ? <ChevronDown size={16} color={KLEUR.mutedTekst} /> : <ChevronRight size={16} color={KLEUR.mutedTekst} />}
        <FileText size={16} color={KLEUR.blauw} />
        <span style={{ fontSize: 14, fontWeight: 700, color: KLEUR.tekst }}>Voorbeelddocumenten — {soortLabel}</span>
        {geladen && sjablonen.length > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "1px 9px" }}>{sjablonen.length}</span>
        )}
      </button>

      {open && (
        <div style={{ padding: "4px 16px 18px", borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", margin: "14px 0 16px" }}>
            <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Bouw hier één of meer voorbeeld-sjablonen op voor {soortLabel.toLowerCase()}. In het dossier kiest de
              medewerker welk sjabloon hij als voorbeeld (blanco A4) opent. Merge-velden zoals
              <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, margin: "0 3px" }}>{"{{klantnaam}}"}</code>
              worden dan met de dossiergegevens ingevuld. Klik een veld in een sjabloon aan om het op de cursor in te voegen.
            </div>
          </div>

          {soort === "dividend" && (
            <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
              <span style={labelStijl}>SharePoint-submap voor dividendbelasting-bijlagen</span>
              <input value={bijlageMap} onChange={(e) => setBijlageMap(e.target.value)} placeholder="Dividendbelasting" style={{ ...invoerStijl, maxWidth: 360 }} />
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                Submap onder de SharePoint-map van de klant waarin een in het dividenddossier geüploade bijlage
                (zodra “Dividendbelasting” op Ja staat) belandt. Leeg = “Dividendbelasting”.
              </div>
            </div>
          )}

          {!geladen ? (
            <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "8px 0" }}>Voorbeeld-sjablonen laden…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sjablonen.length === 0 && (
                <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "2px 0 6px" }}>Nog geen sjablonen. Voeg er hieronder één toe.</div>
              )}
              {sjablonen.map((s, i) => {
                const isOpen = openIds.has(s.id);
                return (
                  <div key={s.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#FbFcFa" }}>
                      <button onClick={() => toggleKaart(s.id)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", flex: 1, textAlign: "left", padding: 0 }}>
                        {isOpen ? <ChevronDown size={15} color={KLEUR.mutedTekst} /> : <ChevronRight size={15} color={KLEUR.mutedTekst} />}
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst }}>{s.naam || "Naamloos sjabloon"}</span>
                      </button>
                      <button onClick={() => verplaats(s.id, -1)} disabled={i === 0} title="Omhoog" style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.35 : 1, padding: 2 }}><ArrowUp size={15} color={KLEUR.mutedTekst} /></button>
                      <button onClick={() => verplaats(s.id, 1)} disabled={i === sjablonen.length - 1} title="Omlaag" style={{ background: "none", border: "none", cursor: i === sjablonen.length - 1 ? "default" : "pointer", opacity: i === sjablonen.length - 1 ? 0.35 : 1, padding: 2 }}><ArrowDown size={15} color={KLEUR.mutedTekst} /></button>
                      <button onClick={() => verwijder(s.id)} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Trash2 size={15} color={KLEUR.rood} /></button>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "12px", borderTop: `1px solid ${KLEUR.rand}` }}>
                        <div style={{ marginBottom: 10 }}>
                          <span style={labelStijl}>Naam</span>
                          <input value={s.naam} onChange={(e) => zet(s.id, "naam", e.target.value)} placeholder="Bijv. Standaard notulen AvA" style={invoerStijl} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <span style={labelStijl}>Tekst</span>
                          <textarea
                            value={s.tekst}
                            onChange={(e) => zet(s.id, "tekst", e.target.value)}
                            onFocus={(e) => { actiefRef.current = { el: e.target, id: s.id }; }}
                            placeholder={"Bijv. Notulen van de algemene vergadering van {{klantnaam}} d.d. {{datum}}.\n\n…"}
                            rows={9}
                            style={{ ...invoerStijl, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
                          />
                        </div>
                        <div>
                          <span style={labelStijl}>Merge-velden — klik om in te voegen</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {plaatshouders.map((p) => (
                              <button
                                key={p.key}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()} /* focus op de tekstarea behouden */
                                onClick={() => voegIn(`{{${p.key}}}`)}
                                title={p.label}
                                style={{ border: `1px solid ${KLEUR.rand}`, background: "#F7F8F6", color: KLEUR.tekst, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                              >
                                {"{{" + p.key + "}}"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div>
                <button onClick={nieuw} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={14} /> Nieuw sjabloon
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
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
      )}
    </div>
  );
}
