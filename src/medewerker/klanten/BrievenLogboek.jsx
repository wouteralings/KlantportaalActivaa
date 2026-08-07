import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Loader2, FileText, AlertTriangle, Plus } from "lucide-react";

/**
 * Brievenlogboek — medewerkersportaal → Klantoverzicht → Brievenlogboek.
 * Eén centraal, filterbaar overzicht van álle verstuurde brieven (uit /api/brief-log), met een link
 * naar de opgeslagen PDF in het SharePoint-dossier. Zoeken op klant/kenmerk/betreft/ontvanger en
 * paginering 25/50/100/250/500/alle. Per klant terugzoeken kan ook via het Brieven-scherm zelf.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const ACTIE_LABEL = { mail: "Gemaild", dossier: "In dossier", backoffice: "Backoffice" };
const PAGINA_OPTIES = [25, 50, 100, 250, 500, "alle"];

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function briefDatum(iso) { try { return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } }

export default function BrievenLogboek({ onNieuweBrief }) {
  const [brieven, setBrieven] = useState(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [zoek, setZoek] = useState("");
  const [perPagina, setPerPagina] = useState(50);
  const [pagina, setPagina] = useState(1);

  async function laad() {
    setBezig(true); setFout("");
    try {
      const res = await fetch("/api/brief-log");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Kon het logboek niet laden (${res.status}).`);
      setBrieven(Array.isArray(d.brieven) ? d.brieven : []);
    } catch (e) { setBrieven([]); setFout(String(e.message || e)); }
    finally { setBezig(false); }
  }
  useEffect(() => { laad(); }, []);

  const gefilterd = useMemo(() => {
    const lijst = brieven || [];
    const t = zoek.trim().toLowerCase();
    if (!t) return lijst;
    return lijst.filter((b) =>
      `${b.klantnaam || ""} ${b.klantnummer ?? ""} ${b.kenmerk || ""} ${b.betreft || ""} ${b.sjabloonnaam || ""} ${b.ontvangerNaam || ""} ${b.naar || ""} ${b.medewerker || ""}`
        .toLowerCase().includes(t)
    );
  }, [brieven, zoek]);

  const totaal = gefilterd.length;
  const alle = perPagina === "alle";
  const perN = alle ? totaal || 1 : perPagina;
  const maxPagina = Math.max(1, Math.ceil(totaal / perN));
  const huidigePagina = Math.min(pagina, maxPagina);
  const start = alle ? 0 : (huidigePagina - 1) * perN;
  const zichtbaar = alle ? gefilterd : gefilterd.slice(start, start + perN);

  useEffect(() => { setPagina(1); }, [zoek, perPagina]);

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 24px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, flex: "1 1 320px" }}>
          Alle verstuurde brieven, nieuwste eerst. Zoek op cliënt, kenmerk, onderwerp of ontvanger. De link opent de brief in het SharePoint-dossier.
        </div>
        {onNieuweBrief && (
          <button onClick={onNieuweBrief} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 8, border: "none", background: KLEUR.groen, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
            <Plus size={16} /> Nieuwe brief
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: "1 1 320px", minWidth: 220 }}>
          <span style={label}>Zoeken</span>
          <div style={{ position: "relative" }}>
            <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="cliënt, kenmerk, onderwerp, ontvanger…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
          </div>
        </div>
        <div>
          <span style={label}>Per pagina</span>
          <select value={String(perPagina)} onChange={(e) => setPerPagina(e.target.value === "alle" ? "alle" : Number(e.target.value))} style={{ ...input, width: "auto" }}>
            {PAGINA_OPTIES.map((o) => <option key={String(o)} value={String(o)}>{o === "alle" ? "Alle" : o}</option>)}
          </select>
        </div>
        <button onClick={laad} style={knopLicht} title="Vernieuwen">{bezig ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Vernieuwen</button>
      </div>

      {fout && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: "#FBECEC", color: KLEUR.rood, border: "1px solid #F0C9C9", marginBottom: 12 }}>
          <AlertTriangle size={15} /> <span>{fout}</span>
        </div>
      )}

      {brieven === null ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Logboek laden…</div>
      ) : totaal === 0 ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>{zoek.trim() ? "Geen brieven gevonden voor deze zoekopdracht." : "Er zijn nog geen verstuurde brieven gelogd."}</div>
      ) : (
        <>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
              <thead>
                <tr>
                  <th style={th}>Datum</th>
                  <th style={th}>Kenmerk</th>
                  <th style={th}>Cliënt</th>
                  <th style={th}>Onderwerp</th>
                  <th style={th}>Ontvanger</th>
                  <th style={th}>Wijze</th>
                  <th style={th}>Door</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((b) => (
                  <tr key={b.id}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: KLEUR.subtekst }}>{briefDatum(b.verzondenOp)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600, color: KLEUR.blauw }}>{veiligeStr(b.kenmerk)}</td>
                    <td style={td}>{veiligeStr(b.klantnaam)}{veiligeStr(b.klantnummer) ? <span style={{ color: KLEUR.mutedTekst }}> · {veiligeStr(b.klantnummer)}</span> : null}</td>
                    <td style={td}>{veiligeStr(b.betreft) || veiligeStr(b.sjabloonnaam)}</td>
                    <td style={td}>{veiligeStr(b.ontvangerNaam) || veiligeStr(b.naar)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{ACTIE_LABEL[b.actie] || veiligeStr(b.actie)}</td>
                    <td style={{ ...td, color: KLEUR.subtekst }}>{veiligeStr(b.medewerker)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{veiligeStr(b.pdfUrl) ? <a href={b.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...knopLicht, padding: "5px 9px", textDecoration: "none" }}><FileText size={13} /> Bekijk</a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>
              {alle ? `${totaal} brieven` : `${totaal === 0 ? 0 : start + 1}–${Math.min(start + perN, totaal)} van ${totaal}`}
            </div>
            {!alle && maxPagina > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={huidigePagina <= 1} style={{ ...knopLicht, opacity: huidigePagina <= 1 ? 0.5 : 1, cursor: huidigePagina <= 1 ? "not-allowed" : "pointer" }}>Vorige</button>
                <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Pagina {huidigePagina} / {maxPagina}</span>
                <button onClick={() => setPagina((p) => Math.min(maxPagina, p + 1))} disabled={huidigePagina >= maxPagina} style={{ ...knopLicht, opacity: huidigePagina >= maxPagina ? 0.5 : 1, cursor: huidigePagina >= maxPagina ? "not-allowed" : "pointer" }}>Volgende</button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes blogspin{to{transform:rotate(360deg)}} .spin{animation:blogspin 1s linear infinite}`}</style>
    </div>
  );
}
