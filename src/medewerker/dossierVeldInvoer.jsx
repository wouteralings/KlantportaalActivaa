import { useState } from "react";
import { CheckCircle2, XCircle, Lock, ExternalLink } from "lucide-react";

/**
 * Gedeelde besturingselementen voor dossiervelden — gebruikt door het dossierdetail in
 * MedewerkerPortaal.jsx én door "Notulen opstellen" (src/medewerker/klanten/NotulenOpstellen.jsx).
 * Hier apart gezet zodat een veld dat je in Beheer → Dossiers instelt in beide schermen precies
 * hetzelfde werkt en oogt: zelfde types, zelfde labels, zelfde zichtbaarheidsregels.
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", groen: "#2E7D46", rood: "#B23B3B",
};

/** Eén besturingselement in de dossiersecties, op basis van het veldtype uit de catalogus
 * (zie api/_gedeeld/dossierVelden.js). Ja/nee-velden (verreweg de meeste) als nette pil-toggle
 * i.p.v. een kale HTML-checkbox — dat leest sneller in een lange lijst en sluit aan bij de
 * toggle-stijl die de rest van het beheerportaal al gebruikt (bijv. ContractenTypesBeheer). */
export function VeldInvoer({ veldDef, waarde, onChange, picklistOpties, statusOpties, disabled, alleenLezen, stijlen }) {
  const { label, veld: veldStijl } = stijlen;
  const uitgeschakeld = disabled || alleenLezen;
  // Lokale bewerk-tekst voor getalvelden (integer): tijdens het typen precies wat de gebruiker intikt,
  // daarbuiten netjes geformatteerd met duizendtalscheiding (bijv. 10000 → "10.000"). null = niet aan het bewerken.
  const [getalTekst, setGetalTekst] = useState(null);
  const labelMetSlot = (
    <div style={{ ...label, display: "flex", alignItems: "center", gap: 5 }}>
      {veldDef.label}
      {alleenLezen && <Lock size={10} color={KLEUR.mutedTekst} title="Alleen-lezen" />}
    </div>
  );
  if (veldDef.type === "vast-status") {
    return (
      <div>
        {labelMetSlot}
        <select disabled={uitgeschakeld} value={waarde ?? ""} onChange={(e) => onChange(e.target.value)} style={veldStijl}>
          <option value="">— geen —</option>
          {(statusOpties || []).map((o) => <option key={o.waarde} value={String(o.waarde)}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (veldDef.type === "vast-url") {
    const heeftWaarde = !!(waarde && String(waarde).trim());
    const href = heeftWaarde ? (/^https?:\/\//i.test(waarde.trim()) ? waarde.trim() : `https://${waarde.trim()}`) : null;
    return (
      <div>
        {labelMetSlot}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input disabled={uitgeschakeld} value={waarde || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" style={{ ...veldStijl, flex: 1 }} />
          {heeftWaarde && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Openen in nieuw tabblad"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                width: 34, height: 34, borderRadius: 7, border: `1px solid ${KLEUR.rand}`,
                background: "#F2F3F0", color: KLEUR.tekst,
              }}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    );
  }
  if (veldDef.type === "boolean") {
    const aan = !!waarde;
    return (
      <div>
        {labelMetSlot}
        <button
          type="button"
          disabled={uitgeschakeld}
          onClick={() => onChange(!aan)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999,
            border: `1px solid ${aan ? KLEUR.groen : KLEUR.rand}`,
            background: aan ? "#EAF6EE" : "#F2F3F0",
            color: aan ? KLEUR.groen : KLEUR.mutedTekst,
            fontSize: 12.5, fontWeight: 600, cursor: uitgeschakeld ? "default" : "pointer", opacity: uitgeschakeld ? 0.7 : 1,
          }}
        >
          {aan ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {aan ? "Ja" : "Nee"}
        </button>
      </div>
    );
  }
  if (veldDef.type === "picklist") {
    const opties = (picklistOpties && picklistOpties[veldDef.key]) || [];
    return (
      <div>
        {labelMetSlot}
        <select disabled={uitgeschakeld} value={waarde ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} style={veldStijl}>
          <option value="">— geen —</option>
          {opties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (veldDef.type === "memo") {
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        {labelMetSlot}
        <textarea disabled={uitgeschakeld} value={waarde || ""} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...veldStijl, resize: "vertical", fontFamily: "inherit" }} />
      </div>
    );
  }
  if (veldDef.type === "datetime") {
    const datumWaarde = waarde ? String(waarde).slice(0, 10) : "";
    return (
      <div>
        {labelMetSlot}
        <input type="date" disabled={uitgeschakeld} value={datumWaarde} onChange={(e) => onChange(e.target.value || null)} style={veldStijl} />
      </div>
    );
  }
  if (veldDef.type === "integer") {
    // Bedrag-/getalvelden: getoond mét duizendtalscheiding (nl-NL), maar bewerkbaar als kaal getal.
    const getal = (waarde === "" || waarde === null || waarde === undefined) ? null : Number(waarde);
    const geformatteerd = getal !== null && Number.isFinite(getal) ? getal.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) : "";
    return (
      <div>
        {labelMetSlot}
        <input
          type="text"
          inputMode="numeric"
          disabled={uitgeschakeld}
          value={getalTekst !== null ? getalTekst : geformatteerd}
          onFocus={() => setGetalTekst(getal !== null && Number.isFinite(getal) ? String(getal) : "")}
          onBlur={() => setGetalTekst(null)}
          onChange={(e) => {
            const inp = e.target.value;
            setGetalTekst(inp);
            const schoon = inp.replace(/[^\d-]/g, "");
            if (schoon === "" || schoon === "-") { onChange(null); return; }
            const n = Number(schoon);
            onChange(Number.isFinite(n) ? n : null);
          }}
          style={veldStijl}
        />
      </div>
    );
  }
  if (veldDef.type === "decimal") {
    return (
      <div>
        {labelMetSlot}
        <input
          type="number"
          step="any"
          disabled={uitgeschakeld}
          value={waarde ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          style={veldStijl}
        />
      </div>
    );
  }
  // string
  return (
    <div>
      {labelMetSlot}
      <input disabled={uitgeschakeld} value={waarde || ""} onChange={(e) => onChange(e.target.value)} style={veldStijl} />
    </div>
  );
}

/**
 * Zichtbaarheid van velden volgens Beheer → Dossiers: verborgen velden (oog-icoon) nooit tonen, en
 * "Alleen tonen als"-voorwaarden toetsen aan de actuele waarden van dít formulier.
 * Vormen (voor terugwaartse compatibiliteit):
 *   - string parentKey                   → oud: parent is een ja/nee-veld; tonen zodra parent "Ja" is.
 *   - { veld, waarde, negatie? }         → één doelwaarde (ja/nee true/false of één keuzelijst-optie).
 *   - { veld, waarden: [...], negatie? } → tonen zodra de uitkomst ÉÉN van de gekozen antwoorden is.
 *   - { modus: "en"|"of", regels: [...] } → meerdere regels, gecombineerd met "en" of "of".
 */
export function maakZichtbaarheid({ verborgen, voorwaarden, veldenState }) {
  const verborgenSet = new Set(verborgen || []);
  const enkeleVervuld = (r) => {
    if (!r || !r.veld) return true;
    const actueelStr = String((veldenState || {})[r.veld] ?? "");
    const doelen = Array.isArray(r.waarden) ? r.waarden : (r.waarde !== undefined ? [r.waarde] : []);
    if (doelen.length === 0) return true; // geen antwoord gekozen = (nog) geen filter
    const gelijk = doelen.some((w) => String(w ?? "") === actueelStr);
    return r.negatie ? !gelijk : gelijk;
  };
  const voorwaardeVervuld = (cond) => {
    if (!cond) return true;
    if (typeof cond === "string") return !!(veldenState || {})[cond]; // oude ja/nee-vorm
    if (Array.isArray(cond.regels)) {
      const regels = cond.regels.filter((r) => r && r.veld);
      if (regels.length === 0) return true;
      return cond.modus === "en" ? regels.every(enkeleVervuld) : regels.some(enkeleVervuld);
    }
    return enkeleVervuld(cond);
  };
  const magTonen = (key) => {
    if (verborgenSet.has(key)) return false;
    return voorwaardeVervuld((voorwaarden || {})[key]);
  };
  /** De secties uit de indeling, met per sectie alleen de zichtbare velden; lege secties vallen weg. */
  const zichtbareSecties = (secties) => (secties || [])
    .map((s) => ({
      ...s,
      velden: (s.velden || []).filter(magTonen),
      subsecties: (s.subsecties || [])
        .map((sub) => ({ ...sub, velden: (sub.velden || []).filter(magTonen) }))
        .filter((sub) => sub.velden.length > 0),
    }))
    .filter((s) => s.velden.length > 0 || s.subsecties.length > 0);
  return { magTonen, zichtbareSecties };
}
