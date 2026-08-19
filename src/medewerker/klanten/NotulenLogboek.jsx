import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Loader2, FileText, AlertTriangle, Plus, Link2, Trash2, Check, Pencil } from "lucide-react";

/**
 * Notulenlogboek — medewerkersportaal → Klantoverzicht → Notulen → tabblad "Logboek".
 *
 * Eén centraal overzicht van álle opgestelde notulen over alle cliënten (uit
 * /api/medewerker-notulen-opslaan zonder accountId): datum, cliënt, model, wie het opstelde en een
 * link naar het stuk in SharePoint. Zelfde idee en dezelfde bediening als het brievenlogboek —
 * zoeken, paginering, "Bekijk" en een snellink om het adres te kopiëren; een beheerder kan een regel
 * uit het logboek halen (het stuk en het notulendossier blijven staan).
 *
 * Het Dynamics-dossieroverzicht blijft daarnaast bestaan: dáár staat de status en de behandelaar van
 * elk notulendossier. Dit logboek gaat over de stukken die in het portaal zijn opgemaakt.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const PAGINA_OPTIES = [25, 50, 100, 250, 500, "alle"];

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function korteDatum(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; }
}
function tijdstip(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
}

export default function NotulenLogboek({ onNieuweNotulen, onBewerken, isBeheerder = false, magVerwijderen = null }) {
  // Wie mag verwijderen komt uit Beheer → Rollen & toegang (de Verwijderen-schakelaar op deze
  // subpagina). Niets meegegeven = terugvallen op "alleen een beheerder", zoals het was.
  const magWeg = magVerwijderen === null ? isBeheerder : (magVerwijderen || isBeheerder);
  const [notulen, setNotulen] = useState(null); // null = laden
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [zoek, setZoek] = useState("");
  const [perPagina, setPerPagina] = useState(50);
  const [pagina, setPagina] = useState(1);
  const [gekopieerd, setGekopieerd] = useState("");
  const [verwijderBezig, setVerwijderBezig] = useState("");

  async function laad() {
    setBezig(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-notulen-opslaan");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Kon het logboek niet laden (${res.status}).`);
      setNotulen(Array.isArray(d.notulen) ? d.notulen : []);
    } catch (e) {
      setNotulen([]); setFout(String((e && e.message) || e));
    } finally {
      setBezig(false);
    }
  }
  useEffect(() => { laad(); }, []);

  const gefilterd = useMemo(() => {
    const lijst = notulen || [];
    const t = zoek.trim().toLowerCase();
    if (!t) return lijst;
    return lijst.filter((n) =>
      `${n.klantnaam || ""} ${n.modelNaam || ""} ${n.datum || ""} ${n.opgesteldDoor || ""} ${(n.aandeelhouders || []).map((a) => a.naam).join(" ")}`
        .toLowerCase().includes(t)
    );
  }, [notulen, zoek]);

  const totaal = gefilterd.length;
  const alle = perPagina === "alle";
  const perN = alle ? (totaal || 1) : perPagina;
  const maxPagina = Math.max(1, Math.ceil(totaal / perN));
  const huidigePagina = Math.min(pagina, maxPagina);
  const start = alle ? 0 : (huidigePagina - 1) * perN;
  const zichtbaar = alle ? gefilterd : gefilterd.slice(start, start + perN);

  async function kopieerLink(n) {
    try {
      await navigator.clipboard.writeText(veiligeStr(n.pdfUrl));
      setGekopieerd(n.dossierId);
      setTimeout(() => setGekopieerd((h) => (h === n.dossierId ? "" : h)), 2000);
    } catch {
      setFout("Kopiëren naar het klembord lukte niet in deze browser.");
    }
  }

  async function verwijderRegel(n) {
    const naam = `${veiligeStr(n.modelNaam) || "Notulen"} — ${veiligeStr(n.klantnaam)}`;
    if (typeof window !== "undefined" && !window.confirm(`"${naam}" verwijderen?\n\nDe regel verdwijnt uit het logboek ÉN het bestand wordt uit de SharePoint-map van de cliënt verwijderd.\n\nHet notulendossier in Dynamics blijft staan — dat is de administratie.\n\nDit kan niet ongedaan gemaakt worden.`)) return;
    setVerwijderBezig(n.dossierId); setFout("");
    try {
      const res = await fetch("/api/medewerker-notulen-opslaan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "logboek-verwijderen", dossierId: n.dossierId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Verwijderen mislukt (${res.status}).`);
      setNotulen((lijst) => (lijst || []).filter((x) => x.dossierId !== n.dossierId));
      // De regel is weg; lukte het opruimen in SharePoint niet, dan zeggen we dát erbij — anders denk
      // je dat het bestand ook verdwenen is terwijl het er nog staat.
      if (d.sharepoint && d.sharepoint.gedaan === false) {
        setFout(`De regel is verwijderd, maar het bestand staat nog in SharePoint: ${d.sharepoint.reden || "onbekende reden"}`);
      }
    } catch (e) {
      setFout(String((e && e.message) || e));
    } finally {
      setVerwijderBezig("");
    }
  }

  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12, fontWeight: 600, cursor: "pointer" };
  const th = { textAlign: "left", padding: "9px 12px", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 12px", fontSize: 12.5, color: KLEUR.tekst, borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 460 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => { setZoek(e.target.value); setPagina(1); }}
            placeholder="Zoek op cliënt, model, aandeelhouder of medewerker…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", background: "#fff", color: KLEUR.tekst }}
          />
        </div>
        <button onClick={laad} style={knopLicht} title="Vernieuwen">
          {bezig ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} Vernieuwen
        </button>
        {onNieuweNotulen && (
          <button
            onClick={onNieuweNotulen}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nieuwe notulen
          </button>
        )}
      </div>

      {fout && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: "#FBECEC", color: KLEUR.rood, border: "1px solid #F0C9C9", marginBottom: 10 }}>
          <AlertTriangle size={15} /> <span>{fout}</span>
        </div>
      )}

      {notulen === null ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>Notulenlogboek laden…</div>
      ) : totaal === 0 ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>
          {zoek.trim() ? "Geen notulen gevonden met deze zoekterm." : "Er zijn nog geen notulen opgesteld in het portaal."}
        </div>
      ) : (
        <>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FBFBF9" }}>
                  <th style={th}>Datum</th>
                  <th style={th}>Cliënt</th>
                  <th style={th}>Model</th>
                  <th style={th}>Aandeelhouders</th>
                  <th style={th}>Opgesteld door</th>
                  <th style={{ ...th, textAlign: "right" }} />
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((n) => (
                  <tr key={n.dossierId}>
                    <td style={td}>
                      <div>{korteDatum(n.datum) || "—"}</div>
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>vastgelegd {tijdstip(n.opgesteldOp)}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{veiligeStr(n.klantnaam) || "—"}</td>
                    <td style={td}>{veiligeStr(n.modelNaam) || "—"}</td>
                    <td style={{ ...td, fontSize: 12, color: KLEUR.subtekst }}>
                      {(n.aandeelhouders || []).filter((a) => veiligeStr(a.naam)).map((a, i) => (
                        <div key={i}>{veiligeStr(a.naam)}{veiligeStr(a.percentage) ? ` — ${veiligeStr(a.percentage)}%` : ""}</div>
                      ))}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: KLEUR.subtekst }}>{veiligeStr(n.opgesteldDoor) || "—"}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {veiligeStr(n.pdfUrl) && (
                        <>
                          <a href={n.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...knopLicht, textDecoration: "none" }}>
                            <FileText size={13} /> Bekijk
                          </a>
                          <button onClick={() => kopieerLink(n)} title="Kopieer de link naar dit stuk" style={{ ...knopLicht, marginLeft: 6 }}>
                            {gekopieerd === n.dossierId ? <><Check size={13} /> Gekopieerd</> : <><Link2 size={13} /> Snellink</>}
                          </button>
                        </>
                      )}
                      {onBewerken && (
                        <button onClick={() => onBewerken(n)} title="Openen in Notulen opstellen" style={{ ...knopLicht, marginLeft: 6 }}>
                          <Pencil size={13} /> Bewerken
                        </button>
                      )}
                      {magWeg && (
                        <button
                          onClick={() => verwijderRegel(n)}
                          disabled={verwijderBezig === n.dossierId}
                          title="Uit het logboek verwijderen (stuk en dossier blijven staan)"
                          style={{ ...knopLicht, marginLeft: 6, color: KLEUR.rood, borderColor: "#F0C9C9" }}
                        >
                          {verwijderBezig === n.dossierId ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{zichtbaar.length} van {totaal} getoond</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
              {PAGINA_OPTIES.map((n) => (
                <button
                  key={String(n)}
                  onClick={() => { setPerPagina(n); setPagina(1); }}
                  style={{ padding: "4px 9px", borderRadius: 7, border: `1px solid ${perPagina === n ? KLEUR.blauw : KLEUR.rand}`, background: perPagina === n ? KLEUR.blauw : "#fff", color: perPagina === n ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {n === "alle" ? "Alle" : n}
                </button>
              ))}
              {maxPagina > 1 && !alle && (
                <>
                  <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={huidigePagina === 1} style={{ ...knopLicht, opacity: huidigePagina === 1 ? 0.5 : 1 }}>Vorige</button>
                  <span style={{ color: KLEUR.mutedTekst }}>{huidigePagina} / {maxPagina}</span>
                  <button onClick={() => setPagina((p) => Math.min(maxPagina, p + 1))} disabled={huidigePagina === maxPagina} style={{ ...knopLicht, opacity: huidigePagina === maxPagina ? 0.5 : 1 }}>Volgende</button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes notlogspin{to{transform:rotate(360deg)}} .spin{animation:notlogspin 1s linear infinite}`}</style>
    </div>
  );
}
