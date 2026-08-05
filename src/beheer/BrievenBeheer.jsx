import { useEffect, useState } from "react";
import { Plus, Save, Trash2, ArrowUp, ArrowDown, CheckCircle2, XCircle, Mail, ChevronDown, ChevronRight, X } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. ContractenTypesBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
const knopLichtStijl = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

// Vaste merge-placeholders (klantgegevens). Daarnaast bestaan er beheerbare invulvelden (briefvelden).
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
 * Beheer van de Brieven-module. Sinds 05-08-2026 (herzien): briefpapier (logo + achtergrond),
 * afzendergegevens, een beheerbare set **invulvelden** (briefvelden, bijv. periode = maand/kwartaal/
 * jaar) waaruit elke standaardbrief kiest, en de standaardbrieven zelf (inklapbaar + paginering).
 * De Dynamics-regels-engine is eruit (op verzoek: "vergeet Dynamics in de brieven"). Opslag via
 * /api/beheer-briefsjablonen; logo/achtergrond via /api/beheer-brieflogo resp. /api/beheer-briefachtergrond.
 */
export default function BrievenBeheer() {
  const [config, setConfig] = useState(null); // { afzender, sharepointMap, sjablonen, briefvelden }
  const [status, setStatus] = useState("rust");
  const [fout, setFout] = useState("");
  const [logoBezig, setLogoBezig] = useState(false);
  const [logoFout, setLogoFout] = useState("");
  const [achtBezig, setAchtBezig] = useState(false);
  const [achtFout, setAchtFout] = useState("");
  const [brievenOpen, setBrievenOpen] = useState(false);
  const [aantal, setAantal] = useState(25);
  const [veldenOpen, setVeldenOpen] = useState(false);
  const [veldAantal, setVeldAantal] = useState(25);

  useEffect(() => {
    fetch("/api/beheer-briefsjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig({
        afzender: d.afzender || {},
        sharepointMap: d.sharepointMap || "Brieven",
        sjablonen: Array.isArray(d.sjablonen) ? d.sjablonen : [],
        briefvelden: Array.isArray(d.briefvelden) ? d.briefvelden : [],
      }))
      .catch(() => { setConfig({ afzender: {}, sharepointMap: "Brieven", sjablonen: [], briefvelden: [] }); setFout("De briefsjablonen konden niet worden geladen."); });
  }, []);

  const zetAfzender = (key, val) => setConfig((c) => ({ ...c, afzender: { ...c.afzender, [key]: val } }));

  function uploadAfbeelding(bestand, endpoint, veld, setBezig, setUploadFout) {
    if (!bestand) return;
    if (!/^image\//.test(bestand.type)) { setUploadFout("Kies een afbeelding (PNG of JPG)."); return; }
    if (bestand.size > 6 * 1024 * 1024) { setUploadFout("Maximaal 6 MB."); return; }
    setUploadFout(""); setBezig(true);
    const lezer = new FileReader();
    lezer.onload = async () => {
      try {
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: lezer.result }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Uploaden mislukt.");
        zetAfzender(veld, d[veld]);
      } catch (e) { setUploadFout(String(e.message || e)); }
      finally { setBezig(false); }
    };
    lezer.onerror = () => { setBezig(false); setUploadFout("Kon het bestand niet lezen."); };
    lezer.readAsDataURL(bestand);
  }

  // Standaardbrieven
  const zetSjabloon = (i, key, val) => setConfig((c) => { const s = c.sjablonen.slice(); s[i] = { ...s[i], [key]: val }; return { ...c, sjablonen: s }; });
  const verplaatsSjabloon = (i, r) => setConfig((c) => { const j = i + r; if (j < 0 || j >= c.sjablonen.length) return c; const s = c.sjablonen.slice(); [s[i], s[j]] = [s[j], s[i]]; return { ...c, sjablonen: s }; });
  const verwijderSjabloon = (i) => setConfig((c) => ({ ...c, sjablonen: c.sjablonen.filter((_, idx) => idx !== i) }));
  const nieuwSjabloon = () => setConfig((c) => ({ ...c, sjablonen: [...c.sjablonen, { id: "", naam: "Nieuwe brief", onderwerp: "", tekst: "", actief: true, velden: [] }] }));
  const toggleSjabloonVeld = (i, sleutel) => setConfig((c) => {
    const s = c.sjablonen.slice(); const huidig = Array.isArray(s[i].velden) ? s[i].velden : [];
    s[i] = { ...s[i], velden: huidig.includes(sleutel) ? huidig.filter((x) => x !== sleutel) : [...huidig, sleutel] };
    return { ...c, sjablonen: s };
  });

  // Briefvelden (invulvelden)
  const zetVeld = (i, key, val) => setConfig((c) => {
    const v = c.briefvelden.slice();
    v[i] = { ...v[i], [key]: val };
    if (key === "label" && !v[i].sleutelHandmatig) v[i].sleutel = slug(val);
    return { ...c, briefvelden: v };
  });
  const zetVeldSleutel = (i, val) => setConfig((c) => { const v = c.briefvelden.slice(); v[i] = { ...v[i], sleutel: slug(val), sleutelHandmatig: true }; return { ...c, briefvelden: v }; });
  const verwijderVeld = (i) => setConfig((c) => ({ ...c, briefvelden: c.briefvelden.filter((_, idx) => idx !== i) }));
  const nieuwVeld = () => setConfig((c) => ({ ...c, briefvelden: [...c.briefvelden, { sleutel: "", label: "", type: "tekst", opties: [] }] }));
  const zetOptie = (vi, oi, label) => setConfig((c) => { const v = c.briefvelden.slice(); const o = (v[vi].opties || []).slice(); o[oi] = { sleutel: slug(label), label }; v[vi] = { ...v[vi], opties: o }; return { ...c, briefvelden: v }; });
  const nieuweOptie = (vi) => setConfig((c) => { const v = c.briefvelden.slice(); v[vi] = { ...v[vi], opties: [...(v[vi].opties || []), { sleutel: "", label: "" }] }; return { ...c, briefvelden: v }; });
  const verwijderOptie = (vi, oi) => setConfig((c) => { const v = c.briefvelden.slice(); v[vi] = { ...v[vi], opties: (v[vi].opties || []).filter((_, idx) => idx !== oi) }; return { ...c, briefvelden: v }; });

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const res = await fetch("/api/beheer-briefsjablonen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setConfig({ afzender: d.afzender || {}, sharepointMap: d.sharepointMap || "Brieven", sjablonen: d.sjablonen || [], briefvelden: d.briefvelden || [] });
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  if (config === null) return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>Brieven-instellingen laden…</div>;

  const a = config.afzender || {};
  const veld = (key, titel, opts = {}) => (
    <div style={{ flex: opts.flex || "1 1 200px", minWidth: opts.minWidth || 160 }}>
      <span style={labelStijl}>{titel}</span>
      <input value={a[key] || ""} onChange={(e) => zetAfzender(key, e.target.value)} placeholder={opts.placeholder || ""} style={invoerStijl} />
    </div>
  );
  const zichtbareSjablonen = aantal === Infinity ? config.sjablonen : config.sjablonen.slice(0, aantal);
  const zichtbareVelden = veldAantal === Infinity ? config.briefvelden : config.briefvelden.slice(0, veldAantal);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Mail size={17} color={KLEUR.blauw} /><h3 style={{ margin: 0, fontSize: 15, color: KLEUR.tekst }}>Brieven</h3>
      </div>
      <p style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "0 0 18px", maxWidth: 760 }}>
        Briefpapier (logo of volledige achtergrond), afzendergegevens, invulvelden en standaardbrieven
        voor de tab Klantoverzicht → Brieven. In de tekst kun je {"{{merge-velden}}"} gebruiken.
      </p>

      {/* Briefpapier: logo + achtergrond */}
      <Rubriek titel="Briefpapier">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <AfbeeldingBlok
            titel="Logo" url={a.logoUrl} bezig={logoBezig} fout={logoFout}
            onKies={(f) => uploadAfbeelding(f, "/api/beheer-brieflogo", "logoUrl", setLogoBezig, setLogoFout)}
            onVerwijder={() => zetAfzender("logoUrl", "")}
          >
            <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <div><span style={labelStijl}>Uitlijning</span>
                <select value={a.logoUitlijning || "links"} onChange={(e) => zetAfzender("logoUitlijning", e.target.value)} style={invoerStijl}>
                  <option value="links">Links</option><option value="midden">Midden</option><option value="rechts">Rechts</option>
                </select>
              </div>
              <div><span style={labelStijl}>Grootte</span>
                <select value={a.logoGrootte || "normaal"} onChange={(e) => zetAfzender("logoGrootte", e.target.value)} style={invoerStijl}>
                  <option value="klein">Klein</option><option value="normaal">Normaal</option><option value="groot">Groot</option>
                </select>
              </div>
            </div>
          </AfbeeldingBlok>

          <AfbeeldingBlok
            titel="Achtergrond (volledig briefpapier)" url={a.achtergrondUrl} bezig={achtBezig} fout={achtFout} groot
            onKies={(f) => uploadAfbeelding(f, "/api/beheer-briefachtergrond", "achtergrondUrl", setAchtBezig, setAchtFout)}
            onVerwijder={() => zetAfzender("achtergrondUrl", "")}
          >
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 10 }}>
              Een geüploade achtergrond wordt als volledige A4-afbeelding achter de brief getoond. Zit je
              logo/adres al ín het briefpapier, dan laat het portaal de eigen kop en voetnoot automatisch weg.
              PNG of JPG op A4-verhouding, max 6 MB.
            </div>
          </AfbeeldingBlok>
        </div>
      </Rubriek>

      {/* Afzendergegevens */}
      <Rubriek titel="Afzendergegevens">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {veld("bedrijfsnaam", "Bedrijfsnaam", { flex: "1 1 260px" })}{veld("kvk", "KvK-nummer", { flex: "1 1 160px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("adres", "Adres (straat + nr)", { flex: "2 1 260px" })}{veld("postcode", "Postcode", { flex: "1 1 120px" })}{veld("plaats", "Plaats", { flex: "1 1 160px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("telefoon", "Telefoon", { flex: "1 1 160px" })}{veld("email", "E-mail", { flex: "1 1 200px" })}{veld("website", "Website", { flex: "1 1 200px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
          {veld("afsluiting", "Afsluiting", { flex: "1 1 220px", placeholder: "Met vriendelijke groet," })}
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <span style={labelStijl}>Wie ondertekent standaard</span>
            <select value={a.ondertekenaarBron || "relatiebeheerder"} onChange={(e) => zetAfzender("ondertekenaarBron", e.target.value)} style={invoerStijl}>
              <option value="relatiebeheerder">Relatiebeheerder van de klant</option>
              <option value="accountant">Accountant van de klant</option>
              <option value="vast">Vaste ondertekenaar</option>
            </select>
          </div>
          {a.ondertekenaarBron === "vast" && (
            <div style={{ flex: "1 1 200px", minWidth: 160 }}>
              <span style={labelStijl}>Vaste ondertekenaar</span>
              <input value={a.ondertekenaarVast || ""} onChange={(e) => zetAfzender("ondertekenaarVast", e.target.value)} style={invoerStijl} />
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={labelStijl}>Voetnoot</span>
          <input value={a.voetnoot || ""} onChange={(e) => zetAfzender("voetnoot", e.target.value)} placeholder="Leeg = automatisch (bedrijfsnaam · KvK · e-mail · website)" style={invoerStijl} />
        </div>
      </Rubriek>

      {/* SharePoint-map */}
      <Rubriek titel="Opslaan in klantdossier">
        <div style={{ maxWidth: 320 }}>
          <span style={labelStijl}>SharePoint-submap</span>
          <input value={config.sharepointMap} onChange={(e) => setConfig((c) => ({ ...c, sharepointMap: e.target.value }))} placeholder="Brieven" style={invoerStijl} />
        </div>
      </Rubriek>

      {/* Invulvelden (briefvelden) — inklapbaar + paginering */}
      <div style={{ marginBottom: 22 }}>
        <button onClick={() => setVeldenOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "6px 0", fontSize: 13, fontWeight: 700, color: KLEUR.tekst }}>
          {veldenOpen ? <ChevronDown size={16} color={KLEUR.subtekst} /> : <ChevronRight size={16} color={KLEUR.subtekst} />}
          Invulvelden ({config.briefvelden.length})
        </button>
        {veldenOpen && (<div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 12, color: KLEUR.subtekst, margin: "0 0 12px", maxWidth: 720 }}>
          Een vaste set velden die je per standaardbrief kunt aanzetten. De medewerker vult/kiest ze bij het
          maken van de brief; ze vullen {"{{sleutel}}"} in onderwerp/tekst. Type "keuze" toont een keuzelijst.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: KLEUR.subtekst }}>
          <span>Toon:</span>
          {AANTAL_KEUZES.map(([w, l]) => (
            <button key={l} onClick={() => setVeldAantal(w)} style={{ border: `1px solid ${veldAantal === w ? KLEUR.blauw : KLEUR.rand}`, background: veldAantal === w ? KLEUR.lichtblauw : "#fff", color: veldAantal === w ? KLEUR.blauw : KLEUR.subtekst, borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {zichtbareVelden.map((v, i) => (
            <div key={i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <span style={labelStijl}>Label</span>
                  <input value={v.label || ""} onChange={(e) => zetVeld(i, "label", e.target.value)} placeholder="bijv. Periode" style={invoerStijl} />
                </div>
                <div style={{ flex: "0 1 180px" }}>
                  <span style={labelStijl}>Sleutel ({"{{...}}"})</span>
                  <input value={v.sleutel || ""} onChange={(e) => zetVeldSleutel(i, e.target.value)} placeholder="periode" style={{ ...invoerStijl, fontFamily: "monospace" }} />
                </div>
                <div style={{ flex: "0 1 140px" }}>
                  <span style={labelStijl}>Type</span>
                  <select value={v.type || "tekst"} onChange={(e) => zetVeld(i, "type", e.target.value)} style={invoerStijl}>
                    <option value="tekst">Vrije tekst</option>
                    <option value="keuze">Keuzelijst</option>
                  </select>
                </div>
                <button onClick={() => verwijderVeld(i)} title="Veld verwijderen" style={{ ...pijlStijl(false), color: KLEUR.rood }}><Trash2 size={15} /></button>
              </div>
              {v.type === "keuze" && (
                <div style={{ marginTop: 10, paddingLeft: 2 }}>
                  <span style={labelStijl}>Opties</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(v.opties || []).map((o, oi) => (
                      <div key={oi} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "3px 6px 3px 9px", background: KLEUR.lichtblauw }}>
                        <input value={o.label || ""} onChange={(e) => zetOptie(i, oi, e.target.value)} placeholder="optie" style={{ border: "none", background: "transparent", outline: "none", fontSize: 12.5, width: 100, color: KLEUR.tekst }} />
                        <button onClick={() => verwijderOptie(i, oi)} style={{ border: "none", background: "none", cursor: "pointer", color: KLEUR.mutedTekst, display: "flex" }}><X size={13} /></button>
                      </div>
                    ))}
                    <button onClick={() => nieuweOptie(i)} style={{ ...knopLichtStijl, padding: "5px 9px", fontSize: 12 }}><Plus size={13} /> optie</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={nieuwVeld} style={{ ...knopLichtStijl, marginTop: 12 }}><Plus size={15} /> Nieuw veld</button>
        </div>)}
      </div>

      {/* Standaardbrieven — inklapbaar + paginering */}
      <div style={{ marginBottom: 22 }}>
        <button onClick={() => setBrievenOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "6px 0", fontSize: 13, fontWeight: 700, color: KLEUR.tekst }}>
          {brievenOpen ? <ChevronDown size={16} color={KLEUR.subtekst} /> : <ChevronRight size={16} color={KLEUR.subtekst} />}
          Standaardbrieven ({config.sjablonen.length})
        </button>
        {brievenOpen && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: KLEUR.subtekst }}>
              <span>Toon:</span>
              {AANTAL_KEUZES.map(([w, l]) => (
                <button key={l} onClick={() => setAantal(w)} style={{ border: `1px solid ${aantal === w ? KLEUR.blauw : KLEUR.rand}`, background: aantal === w ? KLEUR.lichtblauw : "#fff", color: aantal === w ? KLEUR.blauw : KLEUR.subtekst, borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {zichtbareSjablonen.map((s, i) => (
                <div key={i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, background: s.actief === false ? "#F7F7F5" : "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input value={s.naam || ""} onChange={(e) => zetSjabloon(i, "naam", e.target.value)} placeholder="Naam van de brief" style={{ ...invoerStijl, fontWeight: 700, flex: 1 }} />
                    <button onClick={() => zetSjabloon(i, "actief", !(s.actief !== false))} title={s.actief === false ? "Inactief" : "Actief"} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: s.actief === false ? KLEUR.mutedTekst : KLEUR.groen, cursor: "pointer" }}>
                      {s.actief === false ? <XCircle size={14} /> : <CheckCircle2 size={14} />} {s.actief === false ? "Inactief" : "Actief"}
                    </button>
                    <button onClick={() => verplaatsSjabloon(i, -1)} disabled={i === 0} title="Omhoog" style={pijlStijl(i === 0)}><ArrowUp size={15} /></button>
                    <button onClick={() => verplaatsSjabloon(i, 1)} disabled={i === zichtbareSjablonen.length - 1} title="Omlaag" style={pijlStijl(i === zichtbareSjablonen.length - 1)}><ArrowDown size={15} /></button>
                    <button onClick={() => verwijderSjabloon(i)} title="Verwijderen" style={{ ...pijlStijl(false), color: KLEUR.rood }}><Trash2 size={15} /></button>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <span style={labelStijl}>Onderwerp</span>
                    <input value={s.onderwerp || ""} onChange={(e) => zetSjabloon(i, "onderwerp", e.target.value)} placeholder="Betreft…" style={invoerStijl} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <span style={labelStijl}>Tekst</span>
                    <textarea value={s.tekst || ""} onChange={(e) => zetSjabloon(i, "tekst", e.target.value)} rows={6} style={{ ...invoerStijl, resize: "vertical", minHeight: 120, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Inhoud… (lege regel = nieuwe alinea, gebruik {{merge-velden}} en {{invulvelden}})" />
                  </div>
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
              ))}
            </div>
            <button onClick={nieuwSjabloon} style={{ ...knopLichtStijl, marginTop: 12 }}><Plus size={15} /> Nieuwe brief</button>
          </div>
        )}
      </div>

      {/* Merge-velden overzicht */}
      <Rubriek titel="Beschikbare klant-merge-velden">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PLACEHOLDERS.map(([code, uitleg]) => (
            <span key={code} title={uitleg} style={{ fontSize: 11.5, background: KLEUR.lichtblauw, color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "3px 7px", fontFamily: "monospace" }}>{code}</span>
          ))}
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

function AfbeeldingBlok({ titel, url, bezig, fout, onKies, onVerwijder, groot, children }) {
  return (
    <div style={{ flex: groot ? "1 1 320px" : "1 1 240px", minWidth: 220 }}>
      <span style={labelStijl}>{titel}</span>
      <div style={{ border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: 14, background: "#FBFBF9", textAlign: "center" }}>
        {url ? (
          <img src={url} alt={titel} style={{ maxWidth: "100%", maxHeight: groot ? 150 : 90, height: "auto", display: "inline-block" }} />
        ) : (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "18px 8px" }}>Nog geen afbeelding</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
          <label style={{ ...knopLichtStijl, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.6 : 1 }}>
            {bezig ? "Uploaden…" : (url ? "Vervangen" : "Uploaden")}
            <input type="file" accept="image/png,image/jpeg" style={{ display: "none" }} disabled={bezig} onChange={(e) => { onKies(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          </label>
          {url && <button onClick={onVerwijder} style={{ ...knopLichtStijl, color: KLEUR.rood }}>Verwijderen</button>}
        </div>
        {fout && <div style={{ fontSize: 11.5, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}
      </div>
      {children}
    </div>
  );
}

function pijlStijl(uit) {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, color: uit ? KLEUR.rand : KLEUR.subtekst, cursor: uit ? "default" : "pointer" };
}
function Rubriek({ titel, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst, marginBottom: 10 }}>{titel}</div>
      {children}
    </div>
  );
}
