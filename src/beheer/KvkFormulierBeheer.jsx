import { useEffect, useRef, useState } from "react";
import { Info, Loader2, AlertTriangle, CheckCircle2, ChevronDown, Eye, EyeOff } from "lucide-react";
import { SECTIES, GESPLITSTE_KEUZES } from "../medewerker/kvkFormulier17a";

/**
 * Beheer → Liquidatiestukken → het KvK-formulier (17a, ontbinding rechtspersoon).
 *
 * Anders dan de formulieren onder Brieven staat de vragenlijst van dit formulier in code. Dat is met
 * opzet: de sprongen zitten er diep in — bij een turboliquidatie vervalt de vereffenaar, bij baten
 * juist niet — en dat is te eigen aan dít formulier om in te stellen. Wat je hier wél aanpast is de
 * bovenlaag, en dat is in de praktijk waar het om gaat:
 *
 *   - een eigen, kortere vraagtekst
 *   - een vraag verbergen die jullie nooit invullen (hij wordt dan ook niet gevuld op papier)
 *   - een vast antwoord dat alvast klaarstaat, zodat je alleen de uitzonderingen nog omzet
 *
 * Opslag: instellingen.kvk17a = { "<vraag-id>": { label, verborgen, standaard } }, via
 * /api/beheer-instellingen. Het opstelscherm en de PDF-vuller lezen dezelfde sleutel.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

const SOORT_LABEL = { tekst: "Tekst", memo: "Tekst (lang)", datum: "Datum", keuze: "Keuze", vink: "Aankruisvak", bedrag: "Bedrag" };

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

/** De antwoordmogelijkheden van een keuzevraag, als leesbare labels op index. */
function keuzeLabels(vraag) {
  if (!vraag) return [];
  if (vraag.type === "vink") return ["Aangekruist"];
  const opties = vraag.opties || (GESPLITSTE_KEUZES && GESPLITSTE_KEUZES[vraag.id]) || [];
  return opties.map((o, i) => veiligeStr(typeof o === "string" ? o : (o && (o.tekst || o.label))) || `Optie ${i + 1}`);
}

/** Een vast antwoord instellen. Tekst krijgt een invoerveld, een keuze krijgt knopjes. */
function VastAntwoord({ vraag, eigen, onZet }) {
  const huidig = eigen ? eigen.standaard : undefined;
  const invoerje = { border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "3px 7px", fontSize: 11.5, fontFamily: "inherit", maxWidth: 260 };

  if (vraag.type === "vink") {
    return (
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: KLEUR.mutedTekst, cursor: "pointer" }}>
        <input type="checkbox" checked={huidig === true} onChange={(e) => onZet(e.target.checked ? true : undefined)} style={{ width: 13, height: 13 }} />
        Staat standaard aangekruist
      </label>
    );
  }

  if (vraag.type === "keuze") {
    // Let op: 0 is een geldige optie. Alleen undefined/null/"" telt als "niets vooraf".
    const gekozen = huidig === undefined || huidig === null || huidig === "" ? null : Number(huidig);
    return (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, fontSize: 10.5, color: KLEUR.mutedTekst }}>
        <span>Standaard</span>
        {keuzeLabels(vraag).map((label, i) => {
          const aan = gekozen === i;
          return (
            <button
              key={i}
              onClick={() => onZet(aan ? undefined : i)}
              title={label}
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                border: `1px solid ${aan ? KLEUR.groen : KLEUR.rand}`,
                background: aan ? KLEUR.groen : "#fff", color: aan ? "#fff" : KLEUR.subtekst,
              }}
            >
              {label}
            </button>
          );
        })}
        {gekozen === null && <span>— niets vooraf —</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: KLEUR.mutedTekst }}>
      <span>Standaard</span>
      <input
        value={huidig === undefined || huidig === null ? "" : String(huidig)}
        onChange={(e) => onZet(e.target.value || undefined)}
        placeholder="niets vooraf"
        style={invoerje}
      />
    </div>
  );
}

export default function KvkFormulierBeheer() {
  const [cfg, setCfg] = useState(null); // null = laden
  const [open, setOpen] = useState(false);
  const [melding, setMelding] = useState(null);
  const [bezig, setBezig] = useState(false);
  const levend = useRef(true);
  const geladen = useRef(false);
  useEffect(() => () => { levend.current = false; }, []);

  useEffect(() => {
    fetch("/api/beheer-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) { setCfg((d && d.kvk17a) || {}); geladen.current = true; } })
      .catch(() => { if (levend.current) { setCfg({}); geladen.current = true; } });
  }, []);

  /** Opslaan gaat per wijziging; het scherm loopt vooruit, de server erachteraan. */
  async function bewaar(nieuw) {
    setCfg(nieuw);
    if (!geladen.current) return;
    setBezig(true);
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kvk17a: nieuw }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Opslaan mislukt.");
      if (levend.current) setMelding({ type: "ok", tekst: "Opgeslagen." });
    } catch (e) {
      if (levend.current) setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) setBezig(false);
    }
  }

  const zet = (id, wijziging) => {
    const eigen = { ...((cfg || {})[id] || {}), ...wijziging };
    // Lege waarden niet bewaren: dan blijft de opslag klein en leesbaar.
    for (const sleutel of Object.keys(eigen)) {
      const w = eigen[sleutel];
      if (w === undefined || w === "" || w === false) delete eigen[sleutel];
    }
    const nieuw = { ...(cfg || {}) };
    if (Object.keys(eigen).length) nieuw[id] = eigen; else delete nieuw[id];
    bewaar(nieuw);
  };

  const aantalVerborgen = Object.values(cfg || {}).filter((v) => v && v.verborgen).length;
  const aantalVast = Object.values(cfg || {}).filter((v) => v && v.standaard !== undefined).length;
  const invoer = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 9px", fontSize: 12.5, fontFamily: "inherit" };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst }}>KvK-formulier 17a — ontbinding rechtspersoon</div>
          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
            {SECTIES.reduce((n, s) => n + s.vragen.length, 0)} vragen
            {aantalVerborgen ? ` · ${aantalVerborgen} verborgen` : ""}
            {aantalVast ? ` · ${aantalVast} met vast antwoord` : ""}
            {bezig ? " · opslaan…" : ""}
          </div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}
        >
          <ChevronDown size={14} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} /> Vragen
        </button>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${KLEUR.rand}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 11px", marginBottom: 12 }}>
            <Info size={14} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Geef een vraag een kortere tekst, verberg wat je nooit invult, of zet een vast antwoord
              klaar. Een verborgen vraag wordt ook <strong>niet op papier gezet</strong> en telt niet
              mee bij "wat mist er nog". De vragen zelf en de sprongen tussen de secties liggen vast —
              die volgen het formulier van de Kamer van Koophandel.
            </div>
          </div>

          {cfg === null ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}><Loader2 size={13} className="spin" /> Instellingen ophalen…</div>
          ) : (
            SECTIES.map((sectie) => (
              <div key={sectie.sleutel} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.blauw, marginBottom: 4 }}>{sectie.titel}</div>
                {sectie.vragen.map((v) => {
                  const eigen = (cfg || {})[v.id] || {};
                  const verborgen = eigen.verborgen === true;
                  return (
                    <div key={v.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderTop: `1px solid ${KLEUR.rand}`, opacity: verborgen ? 0.55 : 1 }}>
                      <div style={{ width: 48, flexShrink: 0, fontSize: 11, color: KLEUR.mutedTekst, paddingTop: 7 }}>{v.id}</div>
                      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                        <input
                          value={eigen.label !== undefined ? eigen.label : ""}
                          onChange={(e) => zet(v.id, { label: e.target.value })}
                          placeholder={v.vraag}
                          style={invoer}
                        />
                        <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {SOORT_LABEL[v.type] || v.type}
                          {v.verplicht ? " · verplicht" : ""}
                          {v.gekoppeld ? ` · komt uit ${v.gekoppeld}` : ""}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <VastAntwoord vraag={v} eigen={eigen} onZet={(standaard) => zet(v.id, { standaard })} />
                        </div>
                      </div>
                      <button
                        onClick={() => zet(v.id, { verborgen: !verborgen })}
                        title={verborgen ? "Nu verborgen — klik om te tonen" : "Zichtbaar — klik om te verbergen"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, marginTop: 4 }}
                      >
                        {verborgen ? <EyeOff size={15} color={KLEUR.mutedTekst} /> : <Eye size={15} color={KLEUR.blauw} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {melding && (
            <div style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 8, fontSize: 12,
              background: melding.type === "ok" ? "#EAF6EE" : "#FDF2F2",
              border: `1px solid ${melding.type === "ok" ? "#BFE0CB" : KLEUR.rood}`,
              color: melding.type === "ok" ? KLEUR.groen : KLEUR.rood }}>
              {melding.type === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{melding.tekst}</span>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes kvkspin{to{transform:rotate(360deg)}} .spin{animation:kvkspin 1s linear infinite}`}</style>
    </div>
  );
}
