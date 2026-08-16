import { useEffect, useRef, useState } from "react";
import { FileText, Save, ChevronDown, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Info } from "lucide-react";
import { NOTULEN_SJABLONEN } from "./notulenSjablonen";

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
        setGeladen(true);
      })
      .catch(() => { if (actief) { setFout("De voorbeeld-sjablonen konden niet worden geladen."); setGeladen(true); } });
    return () => { actief = false; };
  }, [soort]);

  const toggleKaart = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const zet = (id, key, waarde) => setSjablonen((lijst) => lijst.map((s) => (s.id === id ? { ...s, [key]: waarde } : s)));
  const nieuw = () => { const id = nieuwSjabloonId(); setSjablonen((lijst) => [...lijst, { id, naam: "Nieuw sjabloon", tekst: "" }]); setOpenIds((s) => new Set([...s, id])); };
  // De vaste Activaa-notulen in één keer klaarzetten (overgezet uit de Word-modellen, zie
  // notulenSjablonen.js). Voegt alleen toe wat er nog niet staat — op naam — zodat je 'm veilig nog
  // eens kunt indrukken nadat je zelf iets hebt aangepast. Opslaan doe je daarna zelf.
  const voegStandaardNotulenToe = () => {
    setSjablonen((lijst) => {
      const bestaand = new Set(lijst.map((s) => String(s.naam || "").trim().toLowerCase()));
      const nieuweIds = [];
      const erbij = NOTULEN_SJABLONEN
        .filter((s) => !bestaand.has(s.naam.trim().toLowerCase()))
        .map((s) => { const id = nieuwSjabloonId(); nieuweIds.push(id); return { id, naam: s.naam, tekst: s.tekst }; });
      if (nieuweIds.length) setOpenIds((o) => new Set([...o, nieuweIds[0]]));
      return [...lijst, ...erbij];
    });
    setStatus("rust");
  };
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
      const res = await fetch("/api/beheer-instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dossierSjablonen: nieuweAlle }) });
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

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={nieuw} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={14} /> Nieuw sjabloon
                </button>
                {soort === "notulen" && (
                  <button
                    onClick={voegStandaardNotulenToe}
                    title="Zet de vijf vaste notulen klaar (dividenduitkering, dividendbeleid, agiostorting, benoeming en ontslag bestuurder). Wat al bestaat blijft ongemoeid; daarna nog opslaan."
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.tekst, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                  >
                    <Plus size={14} /> Standaard-notulen toevoegen ({NOTULEN_SJABLONEN.length})
                  </button>
                )}
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

// Standaard SharePoint-submap per soort (spiegelt STANDAARD_BIJLAGE_MAP in api/_gedeeld/instellingen.js).
const STANDAARD_BIJLAGE_MAP = { dividend: "Dividendbelasting", notulen: "Notulen", ib: "Bijlagen", vpb: "Bijlagen" };
const BIJLAGE_SOORT_LABEL = { ib: "Inkomstenbelasting", vpb: "Vennootschapsbelasting", dividend: "Dividenduitkeringen", notulen: "Notulen" };

/**
 * Beheer → Dossiers → per soort (onder de indelingskaart) het blok "Bijlage-dropzone".
 *
 * Hier zet Wouter per dossiersoort — IB, VPB, dividend én notulen — een bijlage-sleepvak aan en koppelt
 * het aan één ja/nee-veld uit de catalogus van die soort (leeg = altijd tonen). Verder kiest hij de
 * SharePoint-submap waarin de gedropte bestanden belanden en de bestandsnaam waaronder een gedropt
 * bestand wordt opgeslagen (plaatshouders {{klantnaam}}/{{jaar}}/{{datum}}; leeg = de originele naam;
 * bij meerdere bestanden komt er een volgnummer achter). In het dossier verschijnt de dropzone zodra het
 * gekozen ja/nee-veld op Ja staat en zijn de gedropte bestanden er als snellink te openen (zie
 * DossierBijlageKaart in MedewerkerPortaal.jsx + api/medewerker-dossier-bijlage / api/medewerker-dossier).
 *
 * Opslag: het generieke /api/beheer-instellingen onder de sleutel <soort>Bijlage =
 * { aan, trigger, map, bestandsnaam }. De ja/nee-velden komen (als type "boolean") uit /api/dossier-velden.
 */
export function DossierBijlagePerSoort({ soort }) {
  const soortLabel = BIJLAGE_SOORT_LABEL[soort] || "Dossier";
  const standaardMap = STANDAARD_BIJLAGE_MAP[soort] || "Bijlagen";
  const [open, setOpen] = useState(false); // dichtgeklapt bij openen van de pagina
  const [geladen, setGeladen] = useState(false);
  const [aan, setAan] = useState(false);
  const [trigger, setTrigger] = useState(""); // veld-key van het ja/nee-veld; "" = altijd tonen
  const [submap, setSubmap] = useState("");
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [jaNeeVelden, setJaNeeVelden] = useState([]); // [{ key, label }]
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");

  useEffect(() => {
    let actief = true;
    Promise.all([
      fetch(`/api/dossier-velden?soort=${encodeURIComponent(soort)}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([velden, inst]) => {
        if (!actief) return;
        // Alleen de ja/nee-velden (type "boolean") uit de catalogus kunnen als trigger dienen.
        const boolVelden = (velden.catalogus || [])
          .filter((v) => v && v.key && v.type === "boolean" && !String(v.key).startsWith("__"))
          .map((v) => ({ key: v.key, label: v.label || v.key }));
        setJaNeeVelden(boolVelden);
        const legacyMap = inst && typeof inst[`${soort}BijlageMap`] === "string" ? inst[`${soort}BijlageMap`].trim() : "";
        const raw = inst && inst[`${soort}Bijlage`];
        if (raw && typeof raw === "object") {
          setAan(!!raw.aan);
          setTrigger(typeof raw.trigger === "string" ? raw.trigger : "");
          setSubmap((typeof raw.map === "string" && raw.map.trim()) ? raw.map.trim() : (legacyMap || standaardMap));
          setBestandsnaam(typeof raw.bestandsnaam === "string" ? raw.bestandsnaam : "");
        } else if (soort === "dividend") {
          // Terugval op het huidige gedrag zolang er nog niets nieuws is opgeslagen.
          setAan(true); setTrigger("dividendbelasting"); setSubmap(legacyMap || standaardMap); setBestandsnaam("");
        } else if (soort === "notulen") {
          setAan(true); setTrigger(""); setSubmap(legacyMap || standaardMap); setBestandsnaam("");
        } else {
          setAan(false); setTrigger(""); setSubmap(standaardMap); setBestandsnaam("");
        }
        setGeladen(true);
      })
      .catch(() => { if (actief) { setFout("De bijlage-instellingen konden niet worden geladen."); setGeladen(true); } });
    return () => { actief = false; };
  }, [soort]);

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const body = { [`${soort}Bijlage`]: { aan, trigger, map: (submap.trim() || standaardMap), bestandsnaam: bestandsnaam.trim() } };
      const res = await fetch("/api/beheer-instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {open ? <ChevronDown size={16} color={KLEUR.mutedTekst} /> : <ChevronRight size={16} color={KLEUR.mutedTekst} />}
        <FileText size={16} color={KLEUR.blauw} />
        <span style={{ fontSize: 14, fontWeight: 700, color: KLEUR.tekst }}>Bijlage-dropzone — {soortLabel}</span>
        {geladen && aan && <span style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.groen, background: "#E9F4EE", borderRadius: 999, padding: "1px 9px" }}>aan</span>}
      </button>

      {open && (
        <div style={{ padding: "4px 16px 18px", borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", margin: "14px 0 16px" }}>
            <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Zet een bijlage-sleepvak aan in het {soortLabel.toLowerCase()}-dossier. Kies het ja/nee-veld dat het sleepvak laat
              verschijnen, de SharePoint-submap waarin de bestanden belanden en de naam waaronder een gedropt bestand wordt
              opgeslagen. Gedropte bestanden zijn in het dossier als snellink te openen.
            </div>
          </div>

          {!geladen ? (
            <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "8px 0" }}>Instellingen laden…</div>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 14 }}>
                <input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Bijlage-dropzone inschakelen voor {soortLabel.toLowerCase()}.</span>
              </label>

              {aan && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <span style={labelStijl}>Tonen zodra dit ja/nee-veld op Ja staat</span>
                    <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={{ ...invoerStijl, maxWidth: 360 }}>
                      <option value="">Altijd tonen</option>
                      {jaNeeVelden.map((v) => (
                        <option key={v.key} value={v.key}>{v.label}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                      Kies een ja/nee-veld uit de indeling van deze soort. “Altijd tonen” = het sleepvak staat er ongeacht een veld.
                    </div>
                  </div>
                  <div>
                    <span style={labelStijl}>SharePoint-submap</span>
                    <input value={submap} onChange={(e) => setSubmap(e.target.value)} placeholder={standaardMap} style={{ ...invoerStijl, maxWidth: 360 }} />
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                      Submap onder de SharePoint-map van de klant waarin een gedropt bestand belandt. Leeg = “{standaardMap}”.
                    </div>
                  </div>
                  <div>
                    <span style={labelStijl}>Bestandsnaam</span>
                    <input value={bestandsnaam} onChange={(e) => setBestandsnaam(e.target.value)} placeholder={soort === "notulen" ? "Notulen {{jaar}}" : soort === "dividend" ? "Aangifte dividendbelasting {{jaar}}" : "{{klantnaam}} {{jaar}}"} style={invoerStijl} />
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                      Naam waaronder een gedropt bestand wordt opgeslagen (de extensie van het bronbestand komt er automatisch achter).
                      Plaatshouders <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 4, border: `1px solid ${KLEUR.rand}` }}>{"{{klantnaam}}"}</code>,
                      <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, margin: "0 3px" }}>{"{{jaar}}"}</code> en
                      <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, marginLeft: 3 }}>{"{{datum}}"}</code> mogen.
                      Leeg = de originele bestandsnaam. Bij meerdere bestanden komt er automatisch een volgnummer achter.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                <button
                  onClick={opslaan}
                  disabled={status === "bezig"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: status === "bezig" ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: status === "bezig" ? "default" : "pointer" }}
                >
                  <Save size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
                </button>
                {status === "opgeslagen" && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
                {(status === "fout" || fout) && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout || "Opslaan mislukt."}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// VPB-achtige geblokte layout (lichtblauwe kaders met eigen Opslaan) van de kleine palette/stijlen.
const vakStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 18, background: KLEUR.lichtblauw };
const vakTitel = { fontSize: 13, fontWeight: 700, marginBottom: 4, color: KLEUR.tekst };
const vakUitleg = { fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 };
const veldLabel = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, display: "block" };
const witInvoer = { ...invoerStijl, background: "#fff" };
const opslaanKnop = (bezig) => ({ padding: "7px 14px", background: bezig ? "#9DB4A5" : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer" });

/**
 * Beheer → Dossiers → in het indeling-paneel van notulen/dividend: de blokken "Mail — versturen naar
 * klant" en "Taak — voor akkoord", in dezelfde geblokte layout als de IB/VPB "Aangifte versturen"-blokken.
 *
 * Wired op de bestaande sleutels <soort>Mail = { afzender, onderwerp, tekst, perOptie } en <soort>Taak =
 * { aan, onderwerp, soort, rubriek } — precies wat api/medewerker-dossier-bijlage leest bij het versturen
 * vanuit de bijlage-dropzone. Elk blok heeft een eigen Opslaan-knop. Plaatshouders in de mailteksten:
 * {{klantnaam}} / {{jaar}} / {{datum}}. De "Mailtekst per <keuze>" laat per keuzelijst-optie een eigen
 * onderwerp/tekst instellen (perOptie); leeg = de standaardtekst hierboven.
 */
// Dividend: de mailtekst wordt gekozen op wél/geen dividendbelasting (2 vaste opties), niet op de
// "Soort dividenduitkering"-keuzelijst. Notulen blijft op de "Soort notulen"-keuzelijst.
const DIVIDENDBELASTING_OPTIES = [
  { waarde: "ja", label: "Met dividendbelasting" },
  { waarde: "nee", label: "Zonder dividendbelasting" },
];

export function DossierMailTaakPerSoort({ soort }) {
  const isNotulen = soort === "notulen";
  const keuzeLabel = isNotulen ? "Soort notulen" : "wel/geen dividendbelasting";
  const woord = isNotulen ? "notulen" : "dividendbelasting";
  const [geladen, setGeladen] = useState(false);
  const [fout, setFout] = useState("");
  const [mailAfzender, setMailAfzender] = useState("");
  const [mailOnderwerp, setMailOnderwerp] = useState("");
  const [mailTekst, setMailTekst] = useState("");
  const [keuzeOpties, setKeuzeOpties] = useState([]); // [{ waarde, label }]
  const [mailPerOptie, setMailPerOptie] = useState({}); // { <optiewaarde>: { onderwerp, tekst } }
  const [mailStatus, setMailStatus] = useState("rust");
  const [taakAan, setTaakAan] = useState(false);
  const [taakOnderwerp, setTaakOnderwerp] = useState("");
  const [taakSoort, setTaakSoort] = useState("");
  const [taakRubriek, setTaakRubriek] = useState("");
  const [taakSoortOpties, setTaakSoortOpties] = useState([]); // [{ waarde, label }]
  const [taakRubriekOpties, setTaakRubriekOpties] = useState([]); // [{ waarde, label }]
  const [taakStatus, setTaakStatus] = useState("rust");
  // Taak per situatie (splitsen op wel/geen dividendbelasting of "Soort notulen"): per optiewaarde een
  // eigen taak-instelling { aan, onderwerp, soort, rubriek } die de standaardtaak overschrijft. Geen
  // entry = de standaardtaak geldt. Opgeslagen onder <soort>Taak.perOptie.
  const [taakPerOptie, setTaakPerOptie] = useState({});
  const [openTaakOpties, setOpenTaakOpties] = useState(() => new Set());
  const toggleTaakOptie = (w) => setOpenTaakOpties((s) => { const n = new Set(s); n.has(w) ? n.delete(w) : n.add(w); return n; });
  // Standaard SharePoint-submap van deze soort (sleutel <soort>BijlageMap) — de terugval-submap voor de
  // bijlage-dropzone als een rubriek zelf geen submap invult (rubriek gaat vóór). Samen met de taak bewaard.
  const standaardMap = STANDAARD_BIJLAGE_MAP[soort] || "Bijlagen";
  const [submap, setSubmap] = useState("");
  // Welke per-optie mailteksten opengeklapt zijn (standaard alles ingeklapt).
  const [openOpties, setOpenOpties] = useState(() => new Set());
  const toggleOptie = (w) => setOpenOpties((s) => { const n = new Set(s); n.has(w) ? n.delete(w) : n.add(w); return n; });

  useEffect(() => {
    let actief = true;
    Promise.all([
      fetch(`/api/dossier-velden?soort=${encodeURIComponent(soort)}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-taaksoorten").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-taakrubrieken").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([velden, inst, taaksoortenData, taakrubriekenData]) => {
        if (!actief) return;
        setKeuzeOpties(isNotulen ? ((velden.picklistOpties && velden.picklistOpties.soortnotulen) || []) : DIVIDENDBELASTING_OPTIES);
        const dm = (inst && inst[`${soort}Mail`] && typeof inst[`${soort}Mail`] === "object") ? inst[`${soort}Mail`] : {};
        setMailAfzender(typeof dm.afzender === "string" ? dm.afzender : "");
        setMailOnderwerp(typeof dm.onderwerp === "string" ? dm.onderwerp : "");
        setMailTekst(typeof dm.tekst === "string" ? dm.tekst : "");
        setMailPerOptie(dm.perOptie && typeof dm.perOptie === "object" ? dm.perOptie : {});
        const soortCfg = (taaksoortenData && taaksoortenData.config) || {};
        const soortOpties = (taaksoortenData && Array.isArray(taaksoortenData.opties)) ? taaksoortenData.opties : [];
        setTaakSoortOpties(soortOpties.filter((o) => !(soortCfg[String(o.waarde)] && soortCfg[String(o.waarde)].bevroren)));
        setTaakRubriekOpties((taakrubriekenData && Array.isArray(taakrubriekenData.opties)) ? taakrubriekenData.opties : []);
        const dt = (inst && inst[`${soort}Taak`] && typeof inst[`${soort}Taak`] === "object") ? inst[`${soort}Taak`] : {};
        setTaakAan(!!dt.aan);
        setTaakOnderwerp(typeof dt.onderwerp === "string" ? dt.onderwerp : "");
        setTaakSoort(dt.soort != null ? String(dt.soort) : "");
        setTaakRubriek(dt.rubriek != null ? String(dt.rubriek) : "");
        setTaakPerOptie(dt.perOptie && typeof dt.perOptie === "object" ? dt.perOptie : {});
        // Standaard-submap: eigen <soort>BijlageMap, anders de legacy <soort>Bijlage.map, anders de standaard.
        const bijl = (inst && inst[`${soort}Bijlage`] && typeof inst[`${soort}Bijlage`] === "object") ? inst[`${soort}Bijlage`] : {};
        const mapUitInst = (typeof inst[`${soort}BijlageMap`] === "string" && inst[`${soort}BijlageMap`].trim())
          ? inst[`${soort}BijlageMap`].trim()
          : ((typeof bijl.map === "string" && bijl.map.trim()) ? bijl.map.trim() : standaardMap);
        setSubmap(mapUitInst);
        setGeladen(true);
      })
      .catch(() => { if (actief) { setFout("De instellingen konden niet worden geladen."); setGeladen(true); } });
    return () => { actief = false; };
  }, [soort]);

  async function bewaarMail() {
    setMailStatus("bezig");
    try {
      const perOptieSchoon = {};
      for (const [w, v] of Object.entries(mailPerOptie || {})) {
        const ond = (v && typeof v.onderwerp === "string") ? v.onderwerp : "";
        const tks = (v && typeof v.tekst === "string") ? v.tekst : "";
        if (ond.trim() || tks.trim()) perOptieSchoon[w] = { onderwerp: ond, tekst: tks };
      }
      const body = { [`${soort}Mail`]: { afzender: mailAfzender.trim(), onderwerp: mailOnderwerp, tekst: mailTekst, perOptie: perOptieSchoon } };
      const res = await fetch("/api/beheer-instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Opslaan mislukt.");
      setMailStatus("opgeslagen"); setTimeout(() => setMailStatus("rust"), 2500);
    } catch { setMailStatus("fout"); }
  }

  async function bewaarOpslagTaak() {
    setTaakStatus("bezig");
    try {
      // Per-optie taken opschonen: alleen situaties met een eigen instelling bewaren.
      const taakPerOptieSchoon = {};
      for (const [w, v] of Object.entries(taakPerOptie || {})) {
        if (v && typeof v === "object") {
          taakPerOptieSchoon[w] = { aan: !!v.aan, onderwerp: String(v.onderwerp || "").trim(), soort: v.soort != null ? String(v.soort) : "", rubriek: v.rubriek != null ? String(v.rubriek) : "" };
        }
      }
      const body = {
        // Standaard-submap van de soort (terugval als een rubriek zelf geen submap invult).
        [`${soort}BijlageMap`]: (submap.trim() || standaardMap),
        [`${soort}Taak`]: { aan: taakAan, onderwerp: taakOnderwerp.trim(), soort: taakSoort, rubriek: taakRubriek, perOptie: taakPerOptieSchoon },
      };
      const res = await fetch("/api/beheer-instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Opslaan mislukt.");
      setTaakStatus("opgeslagen"); setTimeout(() => setTaakStatus("rust"), 2500);
    } catch { setTaakStatus("fout"); }
  }

  if (!geladen) {
    return <div style={{ ...vakStijl, color: KLEUR.mutedTekst, fontSize: 12.5 }}>{fout || "Instellingen laden…"}</div>;
  }

  return (
    <>
      {/* Mail — versturen naar klant */}
      <div style={vakStijl}>
        <div style={vakTitel}>Mail — versturen naar klant</div>
        <div style={vakUitleg}>
          Afzenderadres en standaardtekst voor het “Versturen” van een bijlage vanuit het {soort === "notulen" ? "notulen" : "dividend"}-dossier.
          De medewerker ziet dit als voorstel vlak vóór het versturen en kan ontvanger, cc, onderwerp en tekst per keer nog aanpassen.
          Plaatshouders <code>{"{{klantnaam}}"}</code>, <code>{"{{jaar}}"}</code> en <code>{"{{datum}}"}</code> worden bij het versturen ingevuld.
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={veldLabel}>Afzender-mailadres</span>
          <input value={mailAfzender} onChange={(e) => { setMailAfzender(e.target.value); setMailStatus("rust"); }} placeholder="bijv. correspondentie@activaa.nl" style={{ ...witInvoer, maxWidth: 420 }} />
          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>Moet een bestaand postvak in de tenant zijn. Leeg = het standaard postvak (GRAPH_MAIL_SENDER).</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={veldLabel}>Onderwerp</span>
          <input value={mailOnderwerp} onChange={(e) => { setMailOnderwerp(e.target.value); setMailStatus("rust"); }} placeholder={soort === "notulen" ? "Notulen algemene vergadering" : "Aangifte dividendbelasting {{jaar}}"} style={{ ...witInvoer, width: "100%", maxWidth: 560 }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={veldLabel}>Tekst</span>
          <textarea value={mailTekst} onChange={(e) => { setMailTekst(e.target.value); setMailStatus("rust"); }} rows={8} placeholder={soort === "notulen" ? "Beste {{klantnaam}},\n\nBijgaand ontvangt u de notulen.\n\n…" : "Beste {{klantnaam}},\n\nBijgaand ontvangt u de aangifte dividendbelasting {{jaar}}.\n\n…"} style={{ ...witInvoer, width: "100%", maxWidth: 560, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
        </div>

        {keuzeOpties.length > 0 && (
          <div style={{ marginTop: 6, marginBottom: 10 }}>
            <span style={veldLabel}>Mailtekst per {keuzeLabel}</span>
            <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginBottom: 8 }}>
              Optioneel: per {isNotulen ? "keuze" : "situatie"} een eigen onderwerp + tekst. In het dossier wordt automatisch de bijpassende tekst gekozen{isNotulen ? " op basis van de gekozen “Soort notulen”" : ", afhankelijk van of Dividendbelasting op Ja of Nee staat"}; laat je een optie leeg, dan geldt de standaardtekst hierboven.
            </div>
            {keuzeOpties.map((o) => {
              const w = String(o.waarde);
              const v = mailPerOptie[w] || {};
              const isOpen = openOpties.has(w);
              const ingevuld = !!((v.onderwerp && v.onderwerp.trim()) || (v.tekst && v.tekst.trim()));
              return (
                <div key={w} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, marginBottom: 8, background: "#fff", overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleOptie(w)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                    {isOpen ? <ChevronDown size={14} color={KLEUR.mutedTekst} /> : <ChevronRight size={14} color={KLEUR.mutedTekst} />}
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.blauw, flex: 1 }}>{o.label}</span>
                    {ingevuld && <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.groen, background: "#E9F4EE", borderRadius: 999, padding: "1px 8px" }}>ingevuld</span>}
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 10px 10px" }}>
                      <input value={v.onderwerp || ""} onChange={(e) => { setMailPerOptie((m) => ({ ...m, [w]: { ...m[w], onderwerp: e.target.value } })); setMailStatus("rust"); }} placeholder="Onderwerp (leeg = standaard)" style={{ ...witInvoer, marginBottom: 6 }} />
                      <textarea value={v.tekst || ""} onChange={(e) => { setMailPerOptie((m) => ({ ...m, [w]: { ...m[w], tekst: e.target.value } })); setMailStatus("rust"); }} rows={4} placeholder="Tekst (leeg = standaard)" style={{ ...witInvoer, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={bewaarMail} disabled={mailStatus === "bezig"} style={opslaanKnop(mailStatus === "bezig")}>{mailStatus === "bezig" ? "Opslaan…" : "Opslaan"}</button>
          {mailStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
          {mailStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
        </div>
      </div>

      {/* Opslag & taak — versturen */}
      <div style={vakStijl}>
        <div style={vakTitel}>Opslag & taak — versturen</div>
        <div style={vakUitleg}>
          Waar de gedropte bijlagen van deze soort in het SharePoint-dossier terechtkomen, en de (optionele)
          taak “voor akkoord” voor de klant. Plaatshouders <code>{"{{klantnaam}}"}</code> en <code>{"{{jaar}}"}</code> mogen in het taak-onderwerp.
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={veldLabel}>Submap in het SharePoint-dossier</span>
          <input value={submap} onChange={(e) => { setSubmap(e.target.value); setTaakStatus("rust"); }} placeholder={standaardMap} style={{ ...witInvoer, width: "100%", maxWidth: 420 }} />
          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>
            Standaard-submap onder de dossiermap van de klant (<code>cr283_sharepoint</code>) — met een <code>/</code> maak je submappen.
            Een rubriek met een eigen submap gaat hiervóór. Leeg = “{standaardMap}”.
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: taakAan ? 12 : 0, fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>
          <input type="checkbox" checked={taakAan} onChange={(e) => { setTaakAan(e.target.checked); setTaakStatus("rust"); }} />
          Taak voor de klant aanmaken bij het versturen
        </label>
        {taakAan && (
          <>
            <div style={{ marginBottom: 10 }}>
              <span style={veldLabel}>Onderwerp van de taak</span>
              <input value={taakOnderwerp} onChange={(e) => { setTaakOnderwerp(e.target.value); setTaakStatus("rust"); }} placeholder={soort === "notulen" ? "Notulen {{jaar}} ter akkoord" : "Aangifte dividendbelasting {{jaar}} ter akkoord"} style={{ ...witInvoer, width: "100%", maxWidth: 560 }} />
              <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>Leeg = een standaardonderwerp.</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={veldLabel}>Soort taak</span>
              <select value={taakSoort} onChange={(e) => { setTaakSoort(e.target.value); setTaakStatus("rust"); }} style={{ ...witInvoer, width: "100%", maxWidth: 420 }}>
                <option value="">— geen —</option>
                {taakSoortOpties.map((o) => <option key={String(o.waarde)} value={String(o.waarde)}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={veldLabel}>Rubriek</span>
              <select value={taakRubriek} onChange={(e) => { setTaakRubriek(e.target.value); setTaakStatus("rust"); }} style={{ ...witInvoer, width: "100%", maxWidth: 420 }}>
                <option value="">— geen —</option>
                {taakRubriekOpties.map((o) => <option key={String(o.waarde)} value={String(o.waarde)}>{o.label}</option>)}
              </select>
            </div>
          </>
        )}

        {keuzeOpties.length > 0 && (
          <div style={{ marginTop: 6, marginBottom: 12 }}>
            <span style={veldLabel}>Taak per {keuzeLabel}</span>
            <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginBottom: 8 }}>
              Optioneel: splits de taak per situatie. Geef een situatie een eigen taak-instelling (die de standaardtaak hierboven overschrijft) — zo maak je bijvoorbeeld wél een taak in de ene situatie en géén in de andere. Zonder eigen instelling geldt de standaardtaak.
            </div>
            {keuzeOpties.map((o) => {
              const w = String(o.waarde);
              const heeft = !!(taakPerOptie[w] && typeof taakPerOptie[w] === "object");
              const v = taakPerOptie[w] || {};
              const isOpen = openTaakOpties.has(w);
              return (
                <div key={w} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, marginBottom: 8, background: "#fff", overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleTaakOptie(w)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                    {isOpen ? <ChevronDown size={14} color={KLEUR.mutedTekst} /> : <ChevronRight size={14} color={KLEUR.mutedTekst} />}
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.blauw, flex: 1 }}>{o.label}</span>
                    {heeft && <span style={{ fontSize: 10.5, fontWeight: 700, color: v.aan ? KLEUR.groen : KLEUR.mutedTekst, background: v.aan ? "#E9F4EE" : "#F1F1EE", borderRadius: 999, padding: "1px 8px" }}>{v.aan ? "eigen taak: aan" : "eigen taak: uit"}</span>}
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 10px 10px" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: KLEUR.subtekst, marginBottom: heeft ? 10 : 0 }}>
                        <input type="checkbox" checked={heeft} onChange={(e) => { setTaakStatus("rust"); setTaakPerOptie((m) => { const n = { ...m }; if (e.target.checked) n[w] = n[w] || { aan: true, onderwerp: "", soort: taakSoort, rubriek: taakRubriek }; else delete n[w]; return n; }); }} />
                        Aparte taak-instelling voor deze situatie
                      </label>
                      {heeft && (
                        <>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, marginBottom: 10 }}>
                            <input type="checkbox" checked={!!v.aan} onChange={(e) => { setTaakStatus("rust"); setTaakPerOptie((m) => ({ ...m, [w]: { ...m[w], aan: e.target.checked } })); }} />
                            Taak aanmaken bij het versturen
                          </label>
                          {v.aan && (
                            <>
                              <div style={{ marginBottom: 8 }}>
                                <span style={veldLabel}>Onderwerp van de taak</span>
                                <input value={v.onderwerp || ""} onChange={(e) => { setTaakStatus("rust"); setTaakPerOptie((m) => ({ ...m, [w]: { ...m[w], onderwerp: e.target.value } })); }} placeholder="Leeg = een standaardonderwerp" style={{ ...witInvoer, width: "100%", maxWidth: 560 }} />
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <span style={veldLabel}>Soort taak</span>
                                <select value={v.soort || ""} onChange={(e) => { setTaakStatus("rust"); setTaakPerOptie((m) => ({ ...m, [w]: { ...m[w], soort: e.target.value } })); }} style={{ ...witInvoer, width: "100%", maxWidth: 420 }}>
                                  <option value="">— geen —</option>
                                  {taakSoortOpties.map((so) => <option key={String(so.waarde)} value={String(so.waarde)}>{so.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <span style={veldLabel}>Rubriek</span>
                                <select value={v.rubriek || ""} onChange={(e) => { setTaakStatus("rust"); setTaakPerOptie((m) => ({ ...m, [w]: { ...m[w], rubriek: e.target.value } })); }} style={{ ...witInvoer, width: "100%", maxWidth: 420 }}>
                                  <option value="">— geen —</option>
                                  {taakRubriekOpties.map((ro) => <option key={String(ro.waarde)} value={String(ro.waarde)}>{ro.label}</option>)}
                                </select>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: taakAan ? 0 : 12 }}>
          <button onClick={bewaarOpslagTaak} disabled={taakStatus === "bezig"} style={opslaanKnop(taakStatus === "bezig")}>{taakStatus === "bezig" ? "Opslaan…" : "Opslaan"}</button>
          {taakStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
          {taakStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
        </div>
      </div>
    </>
  );
}
