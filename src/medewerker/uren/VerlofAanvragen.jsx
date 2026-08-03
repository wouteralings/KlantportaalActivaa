import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Loader2, RefreshCw, X, Send, Info, ChevronDown } from "lucide-react";
import { KLEUR, datumNL, tijdNL, uur, vandaagIso, knopStijl, veldStijl, th, td } from "./urenGedeeld";

const STATUS_LABEL = { aangevraagd: "Aangevraagd", goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen", ingetrokken: "Ingetrokken" };
const STATUS_KLEUR = { aangevraagd: KLEUR.goud, goedgekeurd: KLEUR.groen, afgewezen: KLEUR.rood, ingetrokken: KLEUR.mutedTekst };

function StatusBadge({ status }) {
  const kleur = STATUS_KLEUR[status] || KLEUR.mutedTekst;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: kleur + "1A", color: kleur, whiteSpace: "nowrap" }}>{STATUS_LABEL[status] || status}</span>;
}

/**
 * Verlof aanvragen (medewerker). Toont het eigen verloftegoed (pro-rata op basis van het
 * werkrooster, plus eventuele correcties van beheer, min al opgenomen/aangevraagd verlof), een
 * formulier om een nieuwe aanvraag in te dienen (periode + type + optionele toelichting — het
 * aantal uren wordt automatisch berekend uit je werkrooster) en de eigen aanvraaggeschiedenis.
 * Goedkeuring gebeurt door je leidinggevende; zolang een aanvraag nog 'aangevraagd' is kun je 'm
 * zelf weer intrekken.
 */
export default function VerlofAanvragen() {
  const [data, setData] = useState(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [correctiesOpen, setCorrectiesOpen] = useState(false);
  const [form, setForm] = useState({ verloftype: "", startdatum: vandaagIso(), einddatum: vandaagIso(), toelichting: "" });

  const laad = useCallback(() => {
    setData(null); setFout("");
    fetch("/api/mw-verlof-aanvraag")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || `HTTP ${r.status}`)))))
      .then((d) => {
        setData(d);
        setForm((f) => ({ ...f, verloftype: f.verloftype || (d.verloftypen && d.verloftypen[0] && d.verloftypen[0].sleutel) || "" }));
      })
      .catch((e) => { setData({ aanvragen: [], saldo: null, verloftypen: [] }); setFout(String(e.message || e)); });
  }, []);
  useEffect(() => { laad(); }, [laad]);

  const dien = async () => {
    setFout("");
    if (!form.verloftype) { setFout("Kies een verloftype."); return; }
    if (!form.startdatum || !form.einddatum) { setFout("Vul een start- en einddatum in."); return; }
    if (form.einddatum < form.startdatum) { setFout("De einddatum kan niet vóór de startdatum liggen."); return; }
    setBezig(true);
    try {
      const res = await fetch("/api/mw-verlof-aanvraag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verloftype: form.verloftype, startdatum: form.startdatum, einddatum: form.einddatum, toelichting: form.toelichting }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm((f) => ({ ...f, toelichting: "" }));
      laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const trekIn = async (id) => {
    setBezig(true); setFout("");
    try {
      const res = await fetch(`/api/mw-verlof-aanvraag?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const saldo = data?.saldo;
  const verloftypen = data?.verloftypen || [];
  const aanvragen = data?.aanvragen || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700 }}>
          <CalendarPlus size={16} color={KLEUR.blauw} /> Verlof aanvragen
        </div>
        <button onClick={laad} style={{ ...knopStijl(false), padding: "7px 10px" }}><RefreshCw size={13} /></button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {/* Saldo */}
      {saldo && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 16, background: "#FBFBF9" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Kpi label="Basis (pro rata)" waarde={`${uur(saldo.basis)} u`} />
            {saldo.correcties !== 0 && <Kpi label="Correcties" waarde={`${saldo.correcties > 0 ? "+" : ""}${uur(saldo.correcties)} u`} kleur={saldo.correcties > 0 ? KLEUR.groen : KLEUR.rood} />}
            <Kpi label="Opgenomen" waarde={`${uur(saldo.opgenomen)} u`} />
            {saldo.inBehandeling > 0 && <Kpi label="In behandeling" waarde={`${uur(saldo.inBehandeling)} u`} kleur={KLEUR.goud} />}
            <Kpi label="Resterend" waarde={`${uur(saldo.resterend)} u`} kleur={KLEUR.blauw} />
          </div>
          {saldo.correctieHistorie && saldo.correctieHistorie.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div onClick={() => setCorrectiesOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: KLEUR.subtekst, cursor: "pointer" }}>
                <ChevronDown size={12} style={{ transform: correctiesOpen ? "none" : "rotate(-90deg)" }} /> Correcties op je saldo ({saldo.correctieHistorie.length})
              </div>
              {correctiesOpen && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {saldo.correctieHistorie.map((c) => (
                    <div key={c.id} style={{ fontSize: 11.5, color: KLEUR.subtekst, display: "flex", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: c.uren > 0 ? KLEUR.groen : KLEUR.rood, minWidth: 46 }}>{c.uren > 0 ? "+" : ""}{uur(c.uren)} u</span>
                      <span>{c.toelichting}</span>
                      <span style={{ color: KLEUR.mutedTekst, marginLeft: "auto", whiteSpace: "nowrap" }}>{c.door} · {tijdNL(c.datum)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Nieuwe aanvraag */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 16, background: "#FBFBF9" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 8 }}>Nieuwe aanvraag</div>
        {verloftypen.length === 0 ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Er zijn nog geen verloftypen ingesteld — vraag beheer dit in te richten bij Beheer → Uren.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Veld label="Verloftype">
              <select value={form.verloftype} onChange={(e) => setForm((f) => ({ ...f, verloftype: e.target.value }))} style={{ ...veldStijl, width: 180 }}>
                {verloftypen.map((t) => <option key={t.sleutel} value={t.sleutel}>{t.label}</option>)}
              </select>
            </Veld>
            <Veld label="Startdatum">
              <input type="date" value={form.startdatum} onChange={(e) => setForm((f) => ({ ...f, startdatum: e.target.value }))} style={{ ...veldStijl, width: 150 }} />
            </Veld>
            <Veld label="Einddatum">
              <input type="date" value={form.einddatum} min={form.startdatum} onChange={(e) => setForm((f) => ({ ...f, einddatum: e.target.value }))} style={{ ...veldStijl, width: 150 }} />
            </Veld>
            <Veld label="Toelichting (optioneel)" groei>
              <input value={form.toelichting} onChange={(e) => setForm((f) => ({ ...f, toelichting: e.target.value }))} placeholder="Bijv. reden of extra info voor je leidinggevende" style={{ ...veldStijl, width: "100%" }} />
            </Veld>
            <button onClick={dien} disabled={bezig} style={{ ...knopStijl(true), padding: "9px 14px" }}>
              {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />} Aanvragen
            </button>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, display: "flex", gap: 6, alignItems: "flex-start" }}>
          <Info size={13} style={{ marginTop: 1, flexShrink: 0 }} /> Het aantal uren wordt automatisch berekend uit je werkrooster (dagen waarop je niet werkt tellen niet mee). Je leidinggevende keurt de aanvraag goed of af.
        </div>
      </div>

      {/* Geschiedenis */}
      {aanvragen.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Je hebt nog geen verlof aangevraagd.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr style={{ background: "#FBFBF9" }}><th style={th}>Periode</th><th style={th}>Type</th><th style={th}>Uren</th><th style={th}>Status</th><th style={th}>Toelichting / reden</th><th style={{ ...th, width: 1 }}></th></tr></thead>
            <tbody>
              {aanvragen.map((a) => (
                <tr key={a.id}>
                  <td style={td}>{datumNL(a.startdatum)}{a.einddatum !== a.startdatum ? ` – ${datumNL(a.einddatum)}` : ""}</td>
                  <td style={td}>{a.verloftype}</td>
                  <td style={td}>{uur(a.aantalUren)} u</td>
                  <td style={td}><StatusBadge status={a.status} /></td>
                  <td style={td}>{a.status === "afgewezen" ? a.afwijsReden : a.toelichting || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                  <td style={td}>
                    {a.status === "aangevraagd" && (
                      <button onClick={() => trekIn(a.id)} disabled={bezig} title="Aanvraag intrekken" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", background: "#fff", color: KLEUR.rood, border: `1px solid #E7C9C9`, borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                        <X size={12} /> Intrekken
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Veld({ label, children, groei }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: groei ? "1 1 200px" : "0 0 auto", minWidth: groei ? 180 : undefined }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</span>
      {children}
    </div>
  );
}
function Kpi({ label, waarde, kleur }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: kleur || KLEUR.tekst }}>{waarde}</div>
    </div>
  );
}
