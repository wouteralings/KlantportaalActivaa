import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, CheckCircle2, XCircle, Loader2, RefreshCw, Users, User, ChevronDown, Info } from "lucide-react";
import { KLEUR, uur, datumNL, voegDagenToe, SoortBadge, knopStijl, th, td } from "./urenGedeeld";

/**
 * Wekelijkse goedkeuring van weekstaten door de LEIDINGGEVENDE. Toont de ingediende weekstaten die
 * op mijn goedkeuring wachten (op basis van 'leidinggevende' per medewerker in Beheer → Uren). Ik
 * keur een hele week in één keer goed, of keur 'm af (terug naar concept bij de medewerker). Daarna
 * doet de manager-op-de-cliënt de facturatiecontrole op de goedgekeurde uren.
 */
export default function UrenGoedkeuren({ isBeheerder, onGewijzigd }) {
  const [scope, setScope] = useState("mijn");
  const [data, setData] = useState(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState("");
  const [open, setOpen] = useState("");

  const laad = useCallback(() => {
    setData(null); setFout("");
    const s = scope === "alle" && isBeheerder ? "?scope=alle" : "";
    fetch(`/api/mw-uren-weekstaten${s}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData({ weekstaten: [] }); setFout("Kon de weekstaten niet laden."); });
  }, [scope, isBeheerder]);
  useEffect(() => { laad(); }, [laad]);

  const actie = async (w, actieNaam) => {
    const sleutel = `${w.medewerkerEmail}|${w.weekStart}`;
    setBezig(sleutel); setFout("");
    try {
      const res = await fetch("/api/mw-uren-weekstaten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: actieNaam, medewerkerEmail: w.medewerkerEmail, weekStart: w.weekStart }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      laad(); if (onGewijzigd) onGewijzigd();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(""); }
  };

  const weekstaten = data?.weekstaten || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700 }}>
          <ClipboardCheck size={16} color={KLEUR.blauw} /> Weekstaten goedkeuren
          {weekstaten.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: KLEUR.rood, borderRadius: 999, padding: "1px 8px" }}>{weekstaten.length}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isBeheerder && (
            <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
              <button onClick={() => setScope("mijn")} style={scopeKnop(scope === "mijn")}><User size={13} /> Mijn team</button>
              <button onClick={() => setScope("alle")} style={{ ...scopeKnop(scope === "alle"), borderLeft: `1px solid ${KLEUR.rand}` }}><Users size={13} /> Kantoorbreed</button>
            </div>
          )}
          <button onClick={laad} style={{ ...knopStijl(false), padding: "7px 10px" }}><RefreshCw size={13} /></button>
        </div>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}
      {data && !fout && scope === "mijn" && !data.mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}><Info size={14} /> Je naam kon niet automatisch worden bepaald, dus we kunnen niet zien wie jou als leidinggevende heeft.</div>
      )}

      {data === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Weekstaten ophalen…</div>
      ) : weekstaten.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Er staan geen weekstaten op je goedkeuring te wachten.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {weekstaten.map((w) => {
            const sleutel = `${w.medewerkerEmail}|${w.weekStart}`;
            const isOpen = open === sleutel;
            return (
              <div key={sleutel} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: "#FBFBF9", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpen(isOpen ? "" : sleutel)}>
                    <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{w.medewerkerNaam}</div>
                      <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>Week {datumNL(w.weekStart)} – {datumNL(voegDagenToe(w.weekStart, 6))} · {uur(w.totaal)} u ({uur(w.declarabel)} u declarabel)</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => actie(w, "afkeuren")} disabled={bezig === sleutel} style={{ ...knopStijl(false), padding: "7px 11px", color: KLEUR.rood, borderColor: "#E7C9C9" }}><XCircle size={13} /> Afkeuren</button>
                    <button onClick={() => actie(w, "goedkeuren")} disabled={bezig === sleutel} style={{ ...knopStijl(true), padding: "7px 12px" }}>{bezig === sleutel ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />} Goedkeuren</button>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                      <thead><tr><th style={th}>Datum</th><th style={th}>Soort</th><th style={th}>Urencode / omschrijving</th><th style={th}>Cliënt</th><th style={th}>Uren</th></tr></thead>
                      <tbody>
                        {w.boekingen.map((b) => (
                          <tr key={b.id}>
                            <td style={td}>{datumNL(b.datum)}</td>
                            <td style={td}><SoortBadge soort={b.soort} /></td>
                            <td style={td}>{b.urencode || ""}{b.urencode && b.omschrijving ? " · " : ""}{b.omschrijving || (!b.urencode ? "—" : "")}</td>
                            <td style={td}>{b.klantnaam || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                            <td style={td}>{uur(b.uren)} u</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const scopeKnop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });
