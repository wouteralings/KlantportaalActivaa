import { useEffect, useRef, useState } from "react";
import { FileText, Save, ChevronDown, ChevronRight, Info } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. DossierIndelingBeheer.jsx/BrievenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };

/**
 * Beheer → Dossiers → "Voorbeelddocumenten (notulen & dividenduitkering)".
 *
 * Hier stelt Wouter per dossiersoort (notulen / dividenduitkering) de tekst in van het "Voorbeeld"-
 * document dat een medewerker vanuit het dossier kan openen (blanco A4, zie DossierVoorbeeldModal in
 * MedewerkerPortaal.jsx). Per soort:
 *   - één STANDAARDTEKST (geldt voor elk dossier van die soort), en
 *   - per keuzelijst-optie van "Soort notulen" / "Soort dividenduitkering" een EXTRA tekst.
 * In de standaardtekst mag {{soorttekst}} staan op de plek waar die extra (per-soort) tekst hoort;
 * staat die plaatshouder er niet, dan komt de extra tekst onder de standaardtekst.
 *
 * Overal mogen merge-velden ({{...}}) worden gebruikt — de gewone klant-/dossiergegevens plus elk
 * veld uit de veldencatalogus van die soort. Die worden bij het openen van het voorbeeld ingevuld
 * met de waarden van het geopende dossier.
 *
 * Opslag: het generieke /api/beheer-instellingen (PUT { dossierSjablonen: { notulen, dividend } }) —
 * geen eigen endpoint nodig. De keuzelijst-opties + veldencatalogus komen uit /api/dossier-velden.
 */
const SOORTEN = [
  { key: "notulen", label: "Notulen", keuzeVeld: "soortnotulen", keuzeLabel: "Soort notulen" },
  { key: "dividend", label: "Dividenduitkeringen", keuzeVeld: "soortdividenduitkering", keuzeLabel: "Soort dividenduitkering" },
];

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

export default function DossierSjablonenBeheer() {
  const [open, setOpen] = useState(false); // hele paneel dichtgeklapt bij openen van de pagina
  const [geladen, setGeladen] = useState(false);
  const [meta, setMeta] = useState({ notulen: { catalogus: [], opties: [] }, dividend: { catalogus: [], opties: [] } });
  const [sjablonen, setSjablonen] = useState({ notulen: { standaard: "", perSoort: {} }, dividend: { standaard: "", perSoort: {} } });
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");

  // De laatst gefocuste tekstarea + welk veld dat is — zodat een klik op een merge-veld-chip de
  // plaatshouder op de cursorpositie in dat veld invoegt.
  const actiefRef = useRef(null); // { el, soort, veld } — veld = "standaard" of de optie-waarde (string)

  useEffect(() => {
    let actief = true;
    Promise.all([
      fetch("/api/dossier-velden?soort=notulen").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/dossier-velden?soort=dividend").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([n, d, inst]) => {
        if (!actief) return;
        setMeta({
          notulen: { catalogus: n.catalogus || [], opties: (n.picklistOpties && n.picklistOpties.soortnotulen) || [] },
          dividend: { catalogus: d.catalogus || [], opties: (d.picklistOpties && d.picklistOpties.soortdividenduitkering) || [] },
        });
        const ds = (inst && inst.dossierSjablonen) || {};
        setSjablonen({
          notulen: { standaard: (ds.notulen && typeof ds.notulen.standaard === "string" ? ds.notulen.standaard : ""), perSoort: (ds.notulen && ds.notulen.perSoort && typeof ds.notulen.perSoort === "object" ? ds.notulen.perSoort : {}) },
          dividend: { standaard: (ds.dividend && typeof ds.dividend.standaard === "string" ? ds.dividend.standaard : ""), perSoort: (ds.dividend && ds.dividend.perSoort && typeof ds.dividend.perSoort === "object" ? ds.dividend.perSoort : {}) },
        });
        setGeladen(true);
      })
      .catch(() => { if (actief) { setFout("De voorbeeld-sjablonen konden niet worden geladen."); setGeladen(true); } });
    return () => { actief = false; };
  }, []);

  const huidigeTekst = (soort, veld) =>
    veld === "standaard" ? sjablonen[soort].standaard : (sjablonen[soort].perSoort[veld] || "");
  const zetTekst = (soort, veld, waarde) =>
    setSjablonen((s) =>
      veld === "standaard"
        ? { ...s, [soort]: { ...s[soort], standaard: waarde } }
        : { ...s, [soort]: { ...s[soort], perSoort: { ...s[soort].perSoort, [veld]: waarde } } }
    );

  // Plaatshouder invoegen op de cursorpositie van het laatst gefocuste tekstveld (of aan het eind).
  const voegIn = (plaatshouder) => {
    const a = actiefRef.current;
    if (!a || !a.el) return;
    const el = a.el;
    const oud = huidigeTekst(a.soort, a.veld);
    const start = typeof el.selectionStart === "number" ? el.selectionStart : oud.length;
    const eind = typeof el.selectionEnd === "number" ? el.selectionEnd : oud.length;
    const nieuw = oud.slice(0, start) + plaatshouder + oud.slice(eind);
    zetTekst(a.soort, a.veld, nieuw);
    const nieuwePositie = start + plaatshouder.length;
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => { try { el.focus(); el.setSelectionRange(nieuwePositie, nieuwePositie); } catch { /* caret best-effort */ } });
    }
  };

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierSjablonen: sjablonen }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  const tekstArea = (soort, veld, placeholder) => (
    <textarea
      value={huidigeTekst(soort, veld)}
      onChange={(e) => zetTekst(soort, veld, e.target.value)}
      onFocus={(e) => { actiefRef.current = { el: e.target, soort, veld }; }}
      placeholder={placeholder}
      rows={veld === "standaard" ? 9 : 5}
      style={{ ...invoerStijl, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
    />
  );

  // Merge-veld-chips voor één soort: de vaste velden + elk (niet-vast) veld uit de catalogus.
  const plaatshoudersVoor = (soort) => {
    const catalogus = (meta[soort] && meta[soort].catalogus) || [];
    const uitCatalogus = catalogus
      .filter((v) => v && v.key && !String(v.key).startsWith("__"))
      .map((v) => ({ key: v.key, label: v.label || v.key }));
    return [...VASTE_PLAATSHOUDERS, ...uitCatalogus];
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {open ? <ChevronDown size={16} color={KLEUR.mutedTekst} /> : <ChevronRight size={16} color={KLEUR.mutedTekst} />}
        <FileText size={16} color={KLEUR.blauw} />
        <span style={{ fontSize: 14, fontWeight: 700, color: KLEUR.tekst }}>Voorbeelddocumenten — notulen &amp; dividenduitkering</span>
      </button>

      {open && (
        <div style={{ padding: "4px 16px 18px", borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", margin: "14px 0 18px" }}>
            <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Stel per soort de <strong>standaardtekst</strong> in en, per keuzelijst-optie, een <strong>extra tekst</strong>.
              Zet <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}` }}>{"{{soorttekst}}"}</code> in de standaardtekst op de plek waar die extra tekst hoort;
              laat je die weg, dan komt de extra tekst onder de standaardtekst. Merge-velden zoals
              <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, border: `1px solid ${KLEUR.rand}`, margin: "0 3px" }}>{"{{klantnaam}}"}</code>
              worden bij het openen van het voorbeeld met de dossiergegevens ingevuld. Klik een veld hieronder aan om het op de cursor in te voegen.
            </div>
          </div>

          {!geladen ? (
            <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "8px 0" }}>Voorbeeld-sjablonen laden…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {SOORTEN.map((s) => {
                const opties = (meta[s.key] && meta[s.key].opties) || [];
                const plaatshouders = plaatshoudersVoor(s.key);
                return (
                  <div key={s.key} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: KLEUR.blauw, marginBottom: 12 }}>{s.label}</div>

                    <div style={{ marginBottom: 8 }}>
                      <span style={labelStijl}>Standaardtekst</span>
                      {tekstArea(s.key, "standaard", "Bijv. Notulen van de algemene vergadering van {{klantnaam}} d.d. {{datum}}.\n\n{{soorttekst}}")}
                    </div>

                    <div style={{ margin: "16px 0 8px" }}>
                      <span style={labelStijl}>Extra tekst per {s.keuzeLabel.toLowerCase()}</span>
                      {opties.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "4px 0" }}>
                          Nog geen keuzelijst-opties gevonden voor "{s.keuzeLabel}" (Dynamics onbereikbaar of geen opties ingesteld). De standaardtekst werkt wel gewoon.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {opties.map((o) => (
                            <div key={o.waarde}>
                              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, marginBottom: 4 }}>{o.label}</span>
                              {tekstArea(s.key, String(o.waarde), `Extra tekst voor "${o.label}"…`)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 14 }}>
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
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button
              onClick={opslaan}
              disabled={status === "bezig" || !geladen}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: status === "bezig" || !geladen ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: status === "bezig" || !geladen ? "default" : "pointer" }}
            >
              <Save size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
            </button>
            {status === "opgeslagen" && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
            {status === "fout" && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout || "Opslaan mislukt."}</span>}
            {status !== "fout" && fout && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
