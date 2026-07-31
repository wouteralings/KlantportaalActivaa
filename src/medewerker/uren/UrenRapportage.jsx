import { useCallback, useEffect, useState } from "react";
import { RefreshCw, BarChart3 } from "lucide-react";
import { KLEUR, uur, veldStijl, knopStijl, th, td } from "./urenGedeeld";

/**
 * Stuurrapportage: per medewerker het declarabel-% (declarabele uren ÷ totaal) t.o.v. het doel,
 * plus de opbouw abonnement/UXT/indirect/kantoor. Voor het sturen op declarabiliteit en indirecte uren.
 */
export default function UrenRapportage() {
  const nu = new Date();
  const eersteVanMaand = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const laatsteVanMaand = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const [vanaf, setVanaf] = useState(eersteVanMaand);
  const [tot, setTot] = useState(laatsteVanMaand);
  const [rijen, setRijen] = useState(null);
  const [fout, setFout] = useState("");

  const laad = useCallback(() => {
    setRijen(null); setFout("");
    fetch(`/api/mw-uren-rapportage?vanaf=${vanaf}&tot=${tot}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRijen(d.medewerkers || []))
      .catch(() => { setRijen([]); setFout("Kon de rapportage niet laden."); });
  }, [vanaf, tot]);
  useEffect(() => { laad(); }, [laad]);

  const ditJaar = () => { setVanaf(`${nu.getUTCFullYear()}-01-01`); setTot(`${nu.getUTCFullYear()}-12-31`); };
  const dezeMaand = () => { setVanaf(eersteVanMaand); setTot(laatsteVanMaand); };

  const totaalAlle = (rijen || []).reduce((a, r) => { a.totaal += r.totaal; a.decl += r.declarabelUren; return a; }, { totaal: 0, decl: 0 });
  const pctAlle = totaalAlle.totaal ? Math.round((totaalAlle.decl / totaalAlle.totaal) * 1000) / 10 : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Van</span>
          <input type="date" value={vanaf} onChange={(e) => setVanaf(e.target.value)} style={{ ...veldStijl, width: 150 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Tot en met</span>
          <input type="date" value={tot} onChange={(e) => setTot(e.target.value)} style={{ ...veldStijl, width: 150 }} />
        </div>
        <button onClick={dezeMaand} style={{ ...knopStijl(false), padding: "8px 12px" }}>Deze maand</button>
        <button onClick={ditJaar} style={{ ...knopStijl(false), padding: "8px 12px" }}>Dit jaar</button>
        <button onClick={laad} style={{ ...knopStijl(false), padding: "8px 12px" }}><RefreshCw size={13} /> Vernieuwen</button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {rijen === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Rapportage opbouwen…</div>
      ) : rijen.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen uren geschreven in deze periode.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ background: "#FBFBF9" }}>
                <th style={th}>Medewerker</th><th style={th}>Totaal</th><th style={th}>Declarabel</th>
                <th style={{ ...th, minWidth: 190 }}>Declarabel-% (doel)</th>
                <th style={th}>Abon.</th><th style={th}>UXT</th><th style={th}>Indirect</th><th style={th}>Kantoor</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => {
                const haaltDoel = r.doel == null ? null : r.declarabelPct >= r.doel;
                const kleur = haaltDoel == null ? KLEUR.blauw : haaltDoel ? KLEUR.groen : KLEUR.rood;
                return (
                  <tr key={r.email}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.naam}</td>
                    <td style={td}>{uur(r.totaal)} u</td>
                    <td style={td}>{uur(r.declarabelUren)} u</td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: "#EFEFEA", borderRadius: 999, overflow: "hidden", minWidth: 90, position: "relative" }}>
                          <div style={{ width: `${Math.min(100, r.declarabelPct)}%`, height: "100%", background: kleur, borderRadius: 999 }} />
                          {r.doel != null && <div title={`Doel ${r.doel}%`} style={{ position: "absolute", top: -2, bottom: -2, left: `${Math.min(100, r.doel)}%`, width: 2, background: KLEUR.tekst }} />}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: kleur, whiteSpace: "nowrap" }}>{r.declarabelPct}%{r.doel != null ? <span style={{ color: KLEUR.mutedTekst, fontWeight: 500 }}> / {r.doel}%</span> : ""}</span>
                      </div>
                    </td>
                    <td style={td}>{uur(r.abonnement)}</td>
                    <td style={td}>{uur(r.uxt)}</td>
                    <td style={td}>{uur(r.indirect)}</td>
                    <td style={td}>{uur(r.kantoor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#FBFBF9" }}>
                <td style={{ ...td, fontWeight: 700 }}>Kantoor totaal</td>
                <td style={{ ...td, fontWeight: 700 }}>{uur(totaalAlle.totaal)} u</td>
                <td style={{ ...td, fontWeight: 700 }}>{uur(totaalAlle.decl)} u</td>
                <td style={{ ...td, fontWeight: 700, color: KLEUR.blauw }}>{pctAlle}%</td>
                <td style={td} colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 10 }}>
        Declarabel-% = (abonnement + UXT) ÷ totaal. Alleen goedgekeurde uren tellen mee (niets telt vóór goedkeuring). Het doel per medewerker stel je in bij Beheer → Uren.
      </div>
    </div>
  );
}

const lbl = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" };
