import { useCallback, useEffect, useState } from "react";
import { Gauge, Users, User, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Info } from "lucide-react";
import { KLEUR, uur, datumNL, voegDagenToe, maandVanNu, maandLabel, verschuifMaand, SoortBadge, knopStijl, th, td } from "./urenGedeeld";

const STATUS_LABEL = { concept: "Concept", ingediend: "Ingediend", goedgekeurd: "Goedgekeurd", gefactureerd: "Gefactureerd" };

/**
 * Bezetting per medewerker per maand: hoeveel uur staat er al ingepland/geboekt (alle soorten en
 * statussen samen — declarabel, indirect, kantoor én vast) t.o.v. de beschikbare capaciteit die
 * maand (werkdagen × 8 uur, de fulltime-norm). Voor capaciteitsplanning: wie heeft deze maand nog
 * weinig ingepland staan, wie zit al (bijna) vol. Alles is doorklikbaar: klik een medewerker open
 * voor de weekindeling, klik een week open voor de losse boekingen.
 */
export default function UrenBezetting({ isBeheerder }) {
  const [maand, setMaand] = useState(maandVanNu());
  const [scope, setScope] = useState("mijn");
  const [data, setData] = useState(null);
  const [fout, setFout] = useState("");
  const [openMedewerker, setOpenMedewerker] = useState("");
  const [openWeek, setOpenWeek] = useState("");

  const laad = useCallback(() => {
    setData(null); setFout("");
    const s = scope === "alle" && isBeheerder ? "&scope=alle" : "";
    fetch(`/api/mw-uren-bezetting?maand=${maand}${s}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData({ medewerkers: [] }); setFout("Kon de bezetting niet laden."); });
  }, [maand, scope, isBeheerder]);
  useEffect(() => { laad(); }, [laad]);

  const medewerkers = data?.medewerkers || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700 }}>
          <Gauge size={16} color={KLEUR.blauw} /> Bezetting per maand
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
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 820 }}>
        Ingepland = alle uren die al geboekt staan deze maand (declarabel, indirect, kantoor en vast — ongeacht goedkeuringsstatus). Beschikbaar = werkdagen deze maand × 8 uur (fulltime-norm).
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMaand(verschuifMaand(maand, -1))} style={pijl}><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{maandLabel(maand)}</div>
        <button onClick={() => setMaand(verschuifMaand(maand, 1))} style={pijl}><ChevronRight size={16} /></button>
        <button onClick={() => setMaand(maandVanNu())} style={{ ...knopStijl(false), padding: "6px 10px" }}>Deze maand</button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}
      {data && !fout && scope === "mijn" && !data.mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}><Info size={14} /> Je naam kon niet automatisch worden bepaald, dus we kunnen niet zien van wie jij de leidinggevende bent.</div>
      )}

      {data === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Bezetting opbouwen…</div>
      ) : medewerkers.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{scope === "mijn" ? "Er staat niemand geregistreerd met jou als leidinggevende (in te stellen bij Beheer → Uren)." : "Geen medewerkers gevonden."}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {medewerkers.map((m) => {
            const isOpen = openMedewerker === m.email;
            const kleur = m.bezettingPct >= 100 ? KLEUR.groen : m.bezettingPct >= 60 ? KLEUR.blauw : KLEUR.goud;
            return (
              <div key={m.email} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                <div onClick={() => setOpenMedewerker(isOpen ? "" : m.email)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", background: "#FBFBF9", cursor: "pointer", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{m.naam}</div>
                      {scope === "alle" && m.leidinggevende && <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Leidinggevende: {m.leidinggevende}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
                    <div style={{ flex: 1, height: 8, background: "#EFEFEA", borderRadius: 999, overflow: "hidden", minWidth: 100 }}>
                      <div style={{ width: `${Math.min(100, m.bezettingPct)}%`, height: "100%", background: kleur, borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: kleur, whiteSpace: "nowrap" }}>{uur(m.ingepland)} / {uur(m.beschikbaar)} u ({m.bezettingPct}%)</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: "6px 12px 10px" }}>
                    {m.weken.length === 0 ? (
                      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "6px 0" }}>Nog niets ingepland deze maand.</div>
                    ) : m.weken.map((w) => {
                      const weekSleutel = `${m.email}|${w.weekStart}`;
                      const weekOpen = openWeek === weekSleutel;
                      return (
                        <div key={w.weekStart} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, marginTop: 6, overflow: "hidden" }}>
                          <div onClick={() => setOpenWeek(weekOpen ? "" : weekSleutel)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", cursor: "pointer", background: "#fff" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                              <ChevronDown size={12} color={KLEUR.mutedTekst} style={{ transform: weekOpen ? "rotate(180deg)" : "none" }} />
                              Week {datumNL(w.weekStart)} – {datumNL(voegDagenToe(w.weekStart, 6))}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{uur(w.ingepland)} u</div>
                          </div>
                          {weekOpen && (
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                                <thead><tr><th style={th}>Datum</th><th style={th}>Soort</th><th style={th}>Urencode / omschrijving</th><th style={th}>Cliënt</th><th style={th}>Status</th><th style={th}>Uren</th></tr></thead>
                                <tbody>
                                  {w.boekingen.map((b) => (
                                    <tr key={b.id}>
                                      <td style={td}>{datumNL(b.datum)}</td>
                                      <td style={td}><SoortBadge soort={b.soort} /></td>
                                      <td style={td}>{b.urencode || ""}{b.urencode && b.omschrijving ? " · " : ""}{b.omschrijving || (!b.urencode ? "—" : "")}{b.vast ? " (vast)" : ""}</td>
                                      <td style={td}>{b.klantnaam || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                                      <td style={td}>{STATUS_LABEL[b.status] || b.status}</td>
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
          })}
        </div>
      )}
    </div>
  );
}

const scopeKnop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });
const pijl = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", color: KLEUR.subtekst };
