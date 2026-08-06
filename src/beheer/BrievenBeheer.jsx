import { useEffect, useState } from "react";
import { Plus, Save, Trash2, ArrowUp, ArrowDown, CheckCircle2, XCircle, Mail, ChevronDown, ChevronRight, X, Search } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. ContractenTypesBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
const knopLichtStijl = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

const PLACEHOLDERS = [
  ["{{klantnaam}}", "Bedrijfs-/cliëntnaam"], ["{{klantnummer}}", "Cliëntnummer"], ["{{groepsnaam}}", "Groepsnaam"],
  ["{{kvk}}", "KvK-nummer"], ["{{relatiebeheerder}}", "Relatiebeheerder"], ["{{accountant}}", "Accountant"],
  ["{{contactpersoon}}", "Contactpersoon"], ["{{achternaam}}", "Achternaam"], ["{{email}}", "E-mail contactpersoon"],
  ["{{adresregel}}", "Straat + huisnummer"], ["{{postcodeplaats}}", "Postcode + plaats"], ["{{datum}}", "Datum van vandaag"],
  ["{{afzendernaam}}", "Naam van Activaa"],
];

function slug(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

/**
 * Beheer van de Brieven-module (herzien 05-08-2026, en nogmaals op 05-08-2026 — reorganisatie op
 * verzoek van Wouter: "Tabblad brieven afzendergegevens verplaatsen naar instellingen. Logo van
 * brieven en achtergrond verwijderen. Word-briefpapier verhuizen naar huisstijl."). Dit scherm
 * toont nu alleen nog de SharePoint-opslagmap, de beheerbare invulvelden en de standaardbrieven.
 * De afzendergegevens en het Word-briefpapier zijn verplaatst naar Beheer → Instellingen (zie
 * BrievenAfzenderInstellingen.jsx — zelfde onderliggende configuratie/opslag, alleen elders
 * getoond). De losse Brieven-logo en -achtergrond (afbeelding-briefpapier) zijn op hetzelfde
 * verzoek volledig verwijderd — niet verplaatst; de backend-velden (`afzender.logoUrl`/
 * `achtergrondUrl`) en de bijbehorende endpoints (/api/beheer-brieflogo, /api/beheer-briefachtergrond)
 * bestaan nog (voor eventuele oude waarde/toekomstig hergebruik) maar zijn nergens meer in te
 * stellen. Zowel de invulvelden als de standaardbrieven zijn **per item inklapbaar** (standaard
 * dicht — je ziet alleen de naam/label) met de aantalkeuze onderaan (25/50/100/250/500/Alle),
 * zoals elders in het portaal. Opslag via /api/beheer-briefsjablonen.
 */
// Standaardteksten (spiegelen api/_gedeeld/briefSjablonen.js) — voorgevuld als de beheerder nog niks
// heeft ingesteld, zodat de mail/taak meteen bruikbaar is.
const STANDAARD_MAIL_TEKST =
  "Geachte heer/mevrouw,\n\n" +
  "Bijgaand ontvangt u een brief van {{afzendernaam}}. Wij verzoeken u vriendelijk kennis te nemen van de inhoud.\n\n" +
  "Heeft u vragen naar aanleiding van deze brief? Neem dan gerust contact met ons op.\n\n" +
  "Met vriendelijke groet,\n{{afzendernaam}}";
const STANDAARD_BACKOFFICE_ONDERWERP = "Brief printen en versturen — {{klantnaam}}";

export default function BrievenBeheer() {
  const [config, setConfig] = useState(null); // { afzender, sharepointMap, sjablonen, briefvelden }
  const [status, setStatus] = useState("rust");
  const [fout, setFout] = useState("");
  const [aantal, setAantal] = useState(25);
  const [veldAantal, setVeldAantal] = useState(25);
  const [openBrieven, setOpenBrieven] = useState(() => new Set()); // indices van opengeklapte brieven
  const [openVelden, setOpenVelden] = useState(() => new Set());   // indices van opengeklapte invulvelden
  const [zoek, setZoek] = useState(""); // zoekterm om tussen de standaardbrieven te filteren

  useEffect(() => {
    fetch("/api/beheer-briefsjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig({
        afzender: { ...(d.afzender || {}), mailTekst: (d.afzender && d.afzender.mailTekst) || STANDAARD_MAIL_TEKST, backofficeOnderwerp: (d.afzender && d.afzender.backofficeOnderwerp) || STANDAARD_BACKOFFICE_ONDERWERP },
        sharepointMap: d.sharepointMap || "Brieven",
        sjablonen: Array.isArray(d.sjablonen) ? d.sjablonen : [],
        briefvelden: Array.isArray(d.briefvelden) ? d.briefvelden : [],
      }))
      .catch(() => { setConfig({ afzender: {}, sharepointMap: "Brieven", sjablonen: [], briefvelden: [] }); setFout("De briefsjablonen konden niet worden geladen."); });
  }, []);

  // Open-set-hulpjes: bij verplaatsen/verwijderen schuiven de indices mee, zodat de juiste kaart open blijft.
  const toggleSet = (setFn, i) => setFn((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const naVerplaats = (setFn, i, j) => setFn((s) => { const n = new Set(s); const hi = s.has(i), hj = s.has(j); hj ? n.add(i) : n.delete(i); hi ? n.add(j) : n.delete(j); return n; });
  const naVerwijder = (setFn, i) => setFn((s) => { const n = new Set(); for (const x of s) { if (x < i) n.add(x); else if (x > i) n.add(x - 1); } return n; });
  const zetAfzender = (key, val) => setConfig((c) => ({ ...c, afzender: { ...c.afzender, [key]: val } }));

  // Standaardbrieven
  const zetSjabloon = (i, key, val) => setConfig((c) => { const s = c.sjablonen.slice(); s[i] = { ...s[i], [key]: val }; return { ...c, sjablonen: s }; });
  const verplaatsSjabloon = (i, r) => { const j = i + r; if (!config || j < 0 || j >= config.sjablonen.length) return; setConfig((c) => { const s = c.sjablonen.slice(); [s[i], s[j]] = [s[j], s[i]]; return { ...c, sjablonen: s }; }); naVerplaats(setOpenBrieven, i, j); };
  const verwijderSjabloon = (i) => { setConfig((c) => ({ ...c, sjablonen: c.sjablonen.filter((_, idx) => idx !== i) })); naVerwijder(setOpenBrieven, i); };
  const nieuwSjabloon = () => { const idx = config.sjablonen.length; setConfig((c) => ({ ...c, sjablonen: [...c.sjablonen, { id: "", naam: "Nieuwe brief", onderwerp: "", tekst: "", actief: true, velden: [] }] })); setOpenBrieven((s) => new Set([...s, idx])); };
  const toggleSjabloonVeld = (i, sleutel) => setConfig((c) => {
    const s = c.sjablonen.slice(); const huidig = Array.isArray(s[i].velden) ? s[i].velden : [];
    s[i] = { ...s[i], velden: huidig.includes(sleutel) ? huidig.filter((x) => x !== sleutel) : [...huidig, sleutel] };
    return { ...c, sjablonen: s };
  });

  // Invulvelden (briefvelden)
  const zetVeld = (i, key, val) => setConfig((c) => {
    const v = c.briefvelden.slice();
    v[i] = { ...v[i], [key]: val };
    if (key === "label" && !v[i].sleutelHandmatig) v[i].sleutel = slug(val);
    return { ...c, briefvelden: v };
  });
  const zetVeldSleutel = (i, val) => setConfig((c) => { const v = c.briefvelden.slice(); v[i] = { ...v[i], sleutel: slug(val), sleutelHandmatig: true }; return { ...c, briefvelden: v }; });
  const verplaatsVeld = (i, r) => { const j = i + r; if (!config || j < 0 || j >= config.briefvelden.length) return; setConfig((c) => { const v = c.briefvelden.slice(); [v[i], v[j]] = [v[j], v[i]]; return { ...c, briefvelden: v }; }); naVerplaats(setOpenVelden, i, j); };
  const verwijderVeld = (i) => { setConfig((c) => ({ ...c, briefvelden: c.briefvelden.filter((_, idx) => idx !== i) })); naVerwijder(setOpenVelden, i); };
  const nieuwVeld = () => { const idx = config.briefvelden.length; setConfig((c) => ({ ...c, briefvelden: [...c.briefvelden, { sleutel: "", label: "", type: "tekst", opties: [] }] })); setOpenVelden((s) => new Set([...s, idx])); };
  const zetOptie = (vi, oi, label) => setConfig((c) => { const v = c.briefvelden.slice(); const o = (v[vi].opties || []).slice(); o[oi] = { ...o[oi], sleutel: slug(label), label }; v[vi] = { ...v[vi], opties: o }; return { ...c, briefvelden: v }; });
  const zetOptieTekst = (vi, oi, tekst) => setConfig((c) => { const v = c.briefvelden.slice(); const o = (v[vi].opties || []).slice(); o[oi] = { ...o[oi], tekst }; v[vi] = { ...v[vi], opties: o }; return { ...c, briefvelden: v }; });
  const nieuweOptie = (vi) => setConfig((c) => { const v = c.briefvelden.slice(); v[vi] = { ...v[vi], opties: [...(v[vi].opties || []), { sleutel: "", label: "", tekst: "" }] }; return { ...c, briefvelden: v }; });
  const verwijderOptie = (vi, oi) => setConfig((c) => { const v = c.briefvelden.slice(); v[vi] = { ...v[vi], opties: (v[vi].opties || []).filter((_, idx) => idx !== oi) }; return { ...c, briefvelden: v }; });

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const res = await fetch("/api/beheer-briefsjablonen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setConfig({ afzender: { ...(d.afzender || {}), mailTekst: (d.afzender && d.afzender.mailTekst) || STANDAARD_MAIL_TEKST, backofficeOnderwerp: (d.afzender && d.afzender.backofficeOnderwerp) || STANDAARD_BACKOFFICE_ONDERWERP }, sharepointMap: d.sharepointMap || "Brieven", sjablonen: d.sjablonen || [], briefvelden: d.briefvelden || [] });
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  if (config === null) return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>Brieven-instellingen laden…</div>;

  const a = config.afzender || {};

  // Zoeken tussen de standaardbrieven (op naam/onderwerp/tekst), met behoud van de originele index
  // zodat bewerken/verplaatsen/verwijderen op de juiste brief blijft werken.
  const zoekTerm = zoek.trim().toLowerCase();
  const gefilterdeSjablonen = config.sjablonen
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !zoekTerm || `${s.naam || ""} ${s.onderwerp || ""} ${s.tekst || ""}`.toLowerCase().includes(zoekTerm));
  const zichtbareSjablonen = aantal === Infinity ? gefilterdeSjablonen : gefilterdeSjablonen.slice(0, aantal);
  const zichtbareVelden = veldAantal === Infinity ? config.briefvelden : config.briefvelden.slice(0, veldAantal);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Mail size={17} color={KLEUR.blauw} /><h3 style={{ margin: 0, fontSize: 15, color: KLEUR.tekst }}>Brieven</h3>
      </div>
      <p style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "0 0 18px", maxWidth: 760 }}>
        Opslagmap, invulvelden en standaardbrieven voor de tab Klantoverzicht → Brieven. In de tekst
        kun je {"{{merge-velden}}"} gebruiken. Briefpapier (Word-briefpapier voor de Word-download)
        en de afzendergegevens staan sinds kort bij <strong>Beheer → Instellingen</strong>.
      </p>

      {/* Standaardbrieven — per item inklapbaar + aantalkeuze onderaan */}
      <Rubriek titel={`Standaardbrieven (${config.sjablonen.length})`}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search size={15} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek tussen de voorbeeldbrieven (naam, onderwerp of tekst)…" style={{ ...invoerStijl, padding: "8px 10px 8px 32px" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zichtbareSjablonen.length === 0 && (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "10px 2px" }}>
              {zoekTerm ? `Geen voorbeeldbrieven gevonden voor “${zoek.trim()}”.` : "Nog geen standaardbrieven."}
            </div>
          )}
          {zichtbareSjablonen.map(({ s, i }) => {
            const open = openBrieven.has(i);
            return (
              <div key={i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden", background: s.actief === false ? "#F7F7F5" : "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                  <button onClick={() => toggleSet(setOpenBrieven, i)} style={kopKnop}>
                    {open ? <ChevronDown size={15} color={KLEUR.subtekst} /> : <ChevronRight size={15} color={KLEUR.subtekst} />}
                    <span style={{ fontWeight: 700, color: KLEUR.tekst }}>{s.naam || "(zonder naam)"}</span>
                    {s.actief === false && <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>· inactief</span>}
                  </button>
                  <button onClick={() => zetSjabloon(i, "actief", !(s.actief !== false))} title={s.actief === false ? "Inactief" : "Actief"} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: s.actief === false ? KLEUR.mutedTekst : KLEUR.groen, cursor: "pointer" }}>
                    {s.actief === false ? <XCircle size={14} /> : <CheckCircle2 size={14} />} {s.actief === false ? "Inactief" : "Actief"}
                  </button>
                  <button onClick={() => verplaatsSjabloon(i, -1)} disabled={i === 0 || !!zoekTerm} title={zoekTerm ? "Wis eerst de zoekterm om te verplaatsen" : "Omhoog"} style={pijlStijl(i === 0 || !!zoekTerm)}><ArrowUp size={15} /></button>
                  <button onClick={() => verplaatsSjabloon(i, 1)} disabled={i === config.sjablonen.length - 1 || !!zoekTerm} title={zoekTerm ? "Wis eerst de zoekterm om te verplaatsen" : "Omlaag"} style={pijlStijl(i === config.sjablonen.length - 1 || !!zoekTerm)}><ArrowDown size={15} /></button>
                  <button onClick={() => verwijderSjabloon(i)} title="Verwijderen" style={{ ...pijlStijl(false), color: KLEUR.rood }}><Trash2 size={15} /></button>
                </div>
                {open && (
                  <div style={{ padding: "12px", borderTop: `1px solid ${KLEUR.rand}` }}>
                    <div style={{ marginBottom: 10 }}><span style={labelStijl}>Naam</span><input value={s.naam || ""} onChange={(e) => zetSjabloon(i, "naam", e.target.value)} placeholder="Naam van de brief" style={{ ...invoerStijl, fontWeight: 700 }} /></div>
                    <div style={{ marginBottom: 10 }}><span style={labelStijl}>Onderwerp</span><input value={s.onderwerp || ""} onChange={(e) => zetSjabloon(i, "onderwerp", e.target.value)} placeholder="Betreft…" style={invoerStijl} /></div>
                    <div style={{ marginBottom: 10 }}><span style={labelStijl}>Tekst</span><textarea value={s.tekst || ""} onChange={(e) => zetSjabloon(i, "tekst", e.target.value)} rows={6} style={{ ...invoerStijl, resize: "vertical", minHeight: 120, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Inhoud… (lege regel = nieuwe alinea, gebruik {{merge-velden}} en {{invulvelden}})" /></div>
                    {config.briefvelden.length > 0 && (
                      <div>
                        <span style={labelStijl}>Invulvelden bij deze brief</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {config.briefvelden.map((v) => {
                            const aan = Array.isArray(s.velden) && s.velden.includes(v.sleutel);
                            return (
                              <button key={v.sleutel || v.label} onClick={() => toggleSjabloonVeld(i, v.sleutel)} style={{ border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`, background: aan ? KLEUR.lichtblauw : "#fff", color: aan ? KLEUR.blauw : KLEUR.subtekst, borderRadius: 20, padding: "4px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                {aan ? "✓ " : ""}{v.label || v.sleutel} <span style={{ fontFamily: "monospace", opacity: 0.7 }}>{`{{${v.sleutel}}}`}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button onClick={nieuwSjabloon} style={knopLichtStijl}><Plus size={15} /> Nieuwe brief</button>
          <AantalKiezer aantal={aantal} setAantal={setAantal} getoond={zichtbareSjablonen.length} totaal={gefilterdeSjablonen.length} />
        </div>
      </Rubriek>

      {/* SharePoint-map */}
      <Rubriek titel="Opslaan in klantdossier">
        <div style={{ maxWidth: 320 }}>
          <span style={labelStijl}>SharePoint-submap</span>
          <input value={config.sharepointMap} onChange={(e) => setConfig((c) => ({ ...c, sharepointMap: e.target.value }))} placeholder="Brieven" style={invoerStijl} />
        </div>
      </Rubriek>

      {/* Invulvelden — per item inklapbaar + aantalkeuze onderaan */}
      <Rubriek titel={`Invulvelden (${config.briefvelden.length})`}>
        <p style={{ fontSize: 12, color: KLEUR.subtekst, margin: "0 0 12px", maxWidth: 720 }}>
          Een vaste set velden die je per standaardbrief kunt aanzetten. De medewerker vult/kiest ze; ze vullen
          {" {{sleutel}} "} in onderwerp/tekst. Klik op een veld om het uit te klappen.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zichtbareVelden.map((v, i) => {
            const open = openVelden.has(i);
            return (
              <div key={i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: open ? "#FBFBF9" : "#fff" }}>
                  <button onClick={() => toggleSet(setOpenVelden, i)} style={kopKnop}>
                    {open ? <ChevronDown size={15} color={KLEUR.subtekst} /> : <ChevronRight size={15} color={KLEUR.subtekst} />}
                    <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{v.label || "(zonder label)"}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11.5, color: KLEUR.mutedTekst }}>{v.sleutel ? `{{${v.sleutel}}}` : ""}</span>
                    <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>· {v.type === "keuze" ? "keuzelijst" : v.type === "paragraaf" ? "alinea-keuze" : "vrije tekst"}</span>
                  </button>
                  <button onClick={() => verplaatsVeld(i, -1)} disabled={i === 0} title="Omhoog" style={pijlStijl(i === 0)}><ArrowUp size={15} /></button>
                  <button onClick={() => verplaatsVeld(i, 1)} disabled={i === zichtbareVelden.length - 1} title="Omlaag" style={pijlStijl(i === zichtbareVelden.length - 1)}><ArrowDown size={15} /></button>
                  <button onClick={() => verwijderVeld(i)} title="Verwijderen" style={{ ...pijlStijl(false), color: KLEUR.rood }}><Trash2 size={15} /></button>
                </div>
                {open && (
                  <div style={{ padding: "12px", borderTop: `1px solid ${KLEUR.rand}` }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 200px" }}><span style={labelStijl}>Label</span><input value={v.label || ""} onChange={(e) => zetVeld(i, "label", e.target.value)} placeholder="bijv. Periode" style={invoerStijl} /></div>
                      <div style={{ flex: "0 1 180px" }}><span style={labelStijl}>Sleutel ({"{{...}}"})</span><input value={v.sleutel || ""} onChange={(e) => zetVeldSleutel(i, e.target.value)} placeholder="periode" style={{ ...invoerStijl, fontFamily: "monospace" }} /></div>
                      <div style={{ flex: "0 1 140px" }}><span style={labelStijl}>Type</span>
                        <select value={v.type || "tekst"} onChange={(e) => zetVeld(i, "type", e.target.value)} style={invoerStijl}><option value="tekst">Vrije tekst</option><option value="keuze">Keuzelijst</option><option value="paragraaf">Paragraaf (alinea kiezen)</option></select>
                      </div>
                    </div>
                    {(v.type === "keuze" || v.type === "paragraaf") && (
                      <div style={{ marginTop: 10 }}>
                        <span style={labelStijl}>{v.type === "paragraaf" ? "Alinea-opties" : "Opties"}</span>
                        {v.type === "paragraaf" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {(v.opties || []).map((o, oi) => (
                              <div key={oi} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                  <input value={o.label || ""} onChange={(e) => zetOptie(i, oi, e.target.value)} placeholder="naam van de optie (bijv. Variant A)" style={{ ...invoerStijl, fontWeight: 600 }} />
                                  <button onClick={() => verwijderOptie(i, oi)} title="Verwijderen" style={{ border: "none", background: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }}><X size={15} /></button>
                                </div>
                                <textarea value={o.tekst || ""} onChange={(e) => zetOptieTekst(i, oi, e.target.value)} rows={4} placeholder="De alinea die in de brief komt als deze optie gekozen wordt…" style={{ ...invoerStijl, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
                              </div>
                            ))}
                            <button onClick={() => nieuweOptie(i)} style={{ ...knopLichtStijl, padding: "5px 9px", fontSize: 12, alignSelf: "flex-start" }}><Plus size={13} /> alinea-optie</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {(v.opties || []).map((o, oi) => (
                              <div key={oi} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "3px 6px 3px 9px", background: KLEUR.lichtblauw }}>
                                <input value={o.label || ""} onChange={(e) => zetOptie(i, oi, e.target.value)} placeholder="optie" style={{ border: "none", background: "transparent", outline: "none", fontSize: 12.5, width: 100, color: KLEUR.tekst }} />
                                <button onClick={() => verwijderOptie(i, oi)} style={{ border: "none", background: "none", cursor: "pointer", color: KLEUR.mutedTekst, display: "flex" }}><X size={13} /></button>
                              </div>
                            ))}
                            <button onClick={() => nieuweOptie(i)} style={{ ...knopLichtStijl, padding: "5px 9px", fontSize: 12 }}><Plus size={13} /> optie</button>
                          </div>
                        )}
                        {v.type === "paragraaf" && (
                          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6 }}>
                            Zet <span style={{ fontFamily: "monospace" }}>{`{{${v.sleutel || "sleutel"}}}`}</span> in de brieftekst; de medewerker kiest een optie en die alinea komt op die plek in de brief.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button onClick={nieuwVeld} style={knopLichtStijl}><Plus size={15} /> Nieuw veld</button>
          <AantalKiezer aantal={veldAantal} setAantal={setVeldAantal} getoond={zichtbareVelden.length} totaal={config.briefvelden.length} />
        </div>
      </Rubriek>

      {/* Merge-velden overzicht */}
      <Rubriek titel="Beschikbare klant-merge-velden">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PLACEHOLDERS.map(([code, uitleg]) => (
            <span key={code} title={uitleg} style={{ fontSize: 11.5, background: KLEUR.lichtblauw, color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "3px 7px", fontFamily: "monospace" }}>{code}</span>
          ))}
        </div>
      </Rubriek>

      {/* Begeleidende e-mail + backoffice-taak — instellingen voor het versturen, onderaan de Brieven-tab */}
      <Rubriek titel="E-mail & backoffice bij het versturen">
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "0 0 14px", maxWidth: 760 }}>
          Instellingen voor <strong>Mailen naar klant</strong> en <strong>Naar backoffice</strong> in Klantoverzicht → Brieven.
          In onderwerp/tekst mag je placeholders zoals <code>{"{{klantnaam}}"}</code>, <code>{"{{contactpersoon}}"}</code>,{" "}
          <code>{"{{relatiebeheerder}}"}</code> en <code>{"{{afzendernaam}}"}</code> gebruiken; die worden per klant ingevuld.
        </div>

        <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, margin: "4px 0 8px" }}>Begeleidende e-mail (bij “Mailen naar klant”)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 280px" }}><span style={labelStijl}>Versturen vanaf (e-mailadres)</span>
            <input value={a.mailAfzender || ""} onChange={(e) => zetAfzender("mailAfzender", e.target.value)} placeholder="bijv. brieven@activaa.nl" style={invoerStijl} /></div>
          <div style={{ flex: "2 1 320px" }}><span style={labelStijl}>Onderwerp van de e-mail</span>
            <input value={a.mailOnderwerp || ""} onChange={(e) => zetAfzender("mailOnderwerp", e.target.value)} placeholder="Leeg = onderwerp van de brief" style={invoerStijl} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={labelStijl}>Begeleidende tekst</span>
          <textarea value={a.mailTekst != null ? a.mailTekst : ""} onChange={(e) => zetAfzender("mailTekst", e.target.value)} rows={7} placeholder="Tekst die in de e-mail zelf komt te staan…" style={{ ...invoerStijl, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
        </div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, maxWidth: 760 }}>
          Versturen kan alleen vanaf een postvak waarvoor de portaal-app in Entra <strong>Mail.Send</strong>-rechten heeft. Leeg = het standaard-afzenderadres van het portaal.
        </div>

        <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, margin: "18px 0 8px", borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 16 }}>Backoffice-taak (bij “Naar backoffice”)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 280px" }}><span style={labelStijl}>Taak naar (e-mailadres backoffice)</span>
            <input value={a.backofficeEigenaarEmail || ""} onChange={(e) => zetAfzender("backofficeEigenaarEmail", e.target.value)} placeholder="bijv. backoffice@activaa.nl" style={invoerStijl} /></div>
          <div style={{ flex: "2 1 320px" }}><span style={labelStijl}>Onderwerp van de taak</span>
            <input value={a.backofficeOnderwerp || ""} onChange={(e) => zetAfzender("backofficeOnderwerp", e.target.value)} placeholder="Brief printen en versturen — {{klantnaam}}" style={invoerStijl} /></div>
        </div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, maxWidth: 760 }}>
          Bij <strong>Naar backoffice</strong> wordt de brief in het klantdossier gezet én een interne taak aangemaakt om te printen en per post te versturen. Leeg e-mailadres = de taak gaat naar de manager/relatiebeheerder van de klant.
        </div>
      </Rubriek>

      {/* Opslaan */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 16 }}>
        <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: status === "bezig" ? "default" : "pointer", opacity: status === "bezig" ? 0.7 : 1 }}>
          <Save size={16} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: KLEUR.groen, fontSize: 12.5, fontWeight: 600 }}><CheckCircle2 size={15} /> Opgeslagen</span>}
        {status === "fout" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: KLEUR.rood, fontSize: 12.5, fontWeight: 600 }}><XCircle size={15} /> {fout}</span>}
      </div>
    </div>
  );
}

const kopKnop = { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: KLEUR.tekst };

function AantalKiezer({ aantal, setAantal, getoond, totaal }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{Math.min(getoond, totaal)} van {totaal} getoond</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTALLEN.map(([n, lbl]) => (
          <button key={lbl} onClick={() => setAantal(n)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${aantal === n ? KLEUR.blauw : KLEUR.rand}`, background: aantal === n ? KLEUR.blauw : "#fff", color: aantal === n ? "#fff" : KLEUR.subtekst }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

function pijlStijl(uit) {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, color: uit ? KLEUR.rand : KLEUR.subtekst, cursor: uit ? "default" : "pointer", flexShrink: 0 };
}
function Rubriek({ titel, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst, marginBottom: 10 }}>{titel}</div>
      {children}
    </div>
  );
}
