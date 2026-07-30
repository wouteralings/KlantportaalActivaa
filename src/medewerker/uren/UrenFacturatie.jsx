import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Loader2, Users, User, RefreshCw, Wallet, CheckCircle2 } from "lucide-react";
import {
  KLEUR, euro, uur, datumNL, maandVanNu, maandLabel, verschuifMaand, SoortBadge,
  knopStijl, th, td, veldStijl,
} from "./urenGedeeld";

/**
 * OHW- en facturatie-overzicht: het declarabele onderhanden werk, GESPLITST in UXT en abonnement.
 * Per cliënt zie je de nog te factureren en reeds gefactureerde waarde. Selecteer boekingen en
 * markeer ze als gefactureerd (met factuurreferentie). Manager ziet zijn cliënten; beheerder kan
 * kantoorbreed schakelen.
 */
export default function UrenFacturatie({ isBeheerder }) {
  const [maand, setMaand] = useState(maandVanNu());
  const [alleMaanden, setAlleMaanden] = useState(false);
  const [scope, setScope] = useState("manager");
  const [data, setData] = useState(null);
  const [fout, setFout] = useState("");
  const [sel, setSel] = useState(new Set());
  const [ref, setRef] = useState("");
  const [bezig, setBezig] = useState(false);
  const [openKlant, setOpenKlant] = useState("");

  const laad = useCallback(() => {
    setData(null); setFout(""); setSel(new Set());
    const m = alleMaanden ? "" : `maand=${maand}`;
    const s = scope === "alle" && isBeheerder ? "scope=alle" : "";
    const qs = [m, s].filter(Boolean).join("&");
    fetch(`/api/mw-uren-facturatie${qs ? "?" + qs : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData({ totaal: leegTotaal(), klanten: [] }); setFout("Kon het facturatie-overzicht niet laden."); });
  }, [maand, alleMaanden, scope, isBeheerder]);
  useEffect(() => { laad(); }, [laad]);

  const totaal = data?.totaal || leegTotaal();

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const markeer = async () => {
    if (sel.size === 0) return;
    setBezig(true);
    try {
      const res = await fetch("/api/mw-uren-facturatie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...sel], factuurRef: ref.trim() || undefined }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setRef(""); laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMaand(verschuifMaand(maand, -1))} disabled={alleMaanden} style={{ ...pijl, opacity: alleMaanden ? 0.4 : 1 }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{alleMaanden ? "Alle maanden" : maandLabel(maand)}</div>
          <button onClick={() => setMaand(verschuifMaand(maand, 1))} disabled={alleMaanden} style={{ ...pijl, opacity: alleMaanden ? 0.4 : 1 }}><ChevronRight size={16} /></button>
          <button onClick={() => setAlleMaanden((v) => !v)} style={{ ...knopStijl(alleMaanden), padding: "6px 10px" }}>Alle maanden</button>
          <button onClick={laad} style={{ ...knopStijl(false), padding: "6px 10px" }}><RefreshCw size={13} /></button>
        </div>
        {isBeheerder && (
          <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setScope("manager")} style={scopeKnop(scope === "manager")}><User size={13} /> Mijn cliënten</button>
            <button onClick={() => setScope("alle")} style={{ ...scopeKnop(scope === "alle"), borderLeft: `1px solid ${KLEUR.rand}` }}><Users size={13} /> Kantoorbreed</button>
          </div>
        )}
      </div>

      {/* Totalen: UXT vs abonnement */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <TotaalKaart titel="UXT (te factureren werk)" uren={totaal.uxt.uren} waarde={totaal.uxt.waarde} kleur={KLEUR.blauw} />
        <TotaalKaart titel="Abonnement (binnen vaste vergoeding)" uren={totaal.abonnement.uren} waarde={totaal.abonnement.waarde} kleur={KLEUR.groen} />
        <TotaalKaart titel="Nog te factureren" waarde={totaal.teFactureren} kleur={KLEUR.goud} enkel />
        <TotaalKaart titel="Reeds gefactureerd" waarde={totaal.gefactureerd} kleur={KLEUR.subtekst} enkel />
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {sel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: `1px solid ${KLEUR.blauw}`, background: KLEUR.lichtblauw, borderRadius: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{sel.size} boeking(en) geselecteerd</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Factuurnr/referentie (optioneel)" style={{ ...veldStijl, width: 220 }} />
          <button onClick={markeer} disabled={bezig} style={{ ...knopStijl(true), padding: "8px 13px" }}>{bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />} Markeer als gefactureerd</button>
          <button onClick={() => setSel(new Set())} style={{ ...knopStijl(false), padding: "8px 12px" }}>Wis selectie</button>
        </div>
      )}

      {data === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Overzicht ophalen…</div>
      ) : (data.klanten || []).length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen declarabel onderhanden werk{scope === "manager" ? " voor jouw cliënten" : ""}{alleMaanden ? "" : ` in ${maandLabel(maand)}`}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.klanten.map((k) => {
            const key = k.accountId || k.klantnaam;
            const open = openKlant === key;
            return (
              <div key={key} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                <div onClick={() => setOpenKlant(open ? "" : key)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: "#FBFBF9", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none" }} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{k.klantnaam}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: KLEUR.subtekst, flexWrap: "wrap" }}>
                    <span>UXT: <strong style={{ color: KLEUR.blauw }}>{euro(k.uxt.waarde)}</strong> ({uur(k.uxt.uren)} u)</span>
                    <span>Abon.: <strong style={{ color: KLEUR.groen }}>{euro(k.abonnement.waarde)}</strong> ({uur(k.abonnement.uren)} u)</span>
                    <span>Te fact.: <strong style={{ color: KLEUR.goud }}>{euro(k.teFactureren)}</strong></span>
                  </div>
                </div>
                {open && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, width: 1 }}></th><th style={th}>Datum</th><th style={th}>Soort</th>
                          <th style={th}>Medewerker</th><th style={th}>Erkend</th><th style={th}>Waarde</th><th style={th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {k.boekingen.map((b) => {
                          const erkend = b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren;
                          const waarde = (b.tariefBedrag || 0) * erkend + (b.extraBedrag || 0);
                          return (
                            <tr key={b.id} style={{ background: b.gefactureerd ? "#F1F8F3" : "#fff" }}>
                              <td style={td}>{!b.gefactureerd && <input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} />}</td>
                              <td style={td}>{datumNL(b.datum)}</td>
                              <td style={td}><SoortBadge soort={b.soort} /></td>
                              <td style={td}>{b.medewerkerNaam}</td>
                              <td style={td}>{uur(erkend)} u{b.extraBedrag ? <div style={{ fontSize: 10.5, color: KLEUR.goud }}>+{euro(b.extraBedrag)} extra</div> : null}</td>
                              <td style={td}>{euro(waarde)}</td>
                              <td style={td}>
                                {b.gefactureerd
                                  ? <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.groen }}>Gefactureerd{b.factuurRef ? ` · ${b.factuurRef}` : ""}</span>
                                  : b.status === "goedgekeurd"
                                    ? <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw }}>Goedgekeurd</span>
                                    : <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Nog controleren</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 12 }}>
        UXT is meerwerk dat apart gefactureerd wordt; abonnement-uren horen bij de vaste vergoeding maar worden hier als onderhanden werk gewaardeerd.
        Alleen goedgekeurde boekingen tellen definitief mee; nog te controleren boekingen staan op de geschreven uren.
      </div>
    </div>
  );
}

function leegTotaal() { return { uxt: { uren: 0, waarde: 0 }, abonnement: { uren: 0, waarde: 0 }, teFactureren: 0, gefactureerd: 0 }; }

function TotaalKaart({ titel, uren: u, waarde, kleur, enkel }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 160, border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>{titel}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: kleur }}>{euro(waarde)}</div>
      {!enkel && <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{uur(u)} uur</div>}
    </div>
  );
}

const pijl = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", color: KLEUR.subtekst };
const scopeKnop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });
