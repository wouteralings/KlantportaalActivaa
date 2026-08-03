import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, XCircle, Loader2, RefreshCw, Users, User, Info } from "lucide-react";
import { KLEUR, datumNL, uur, knopStijl } from "./urenGedeeld";

/**
 * Goedkeuring van verlofaanvragen door de LEIDINGGEVENDE. Toont de aanvragen die op mijn
 * goedkeuring wachten (op basis van 'leidinggevende' per medewerker, Beheer → Uren). Dit IS de
 * goedkeuring van het verlof zelf — er volgt geen aparte weekstaat-goedkeuring meer voor deze uren;
 * ze tellen meteen mee in het verlofsaldo en het vakantieoverzicht van de medewerker.
 */
export default function VerlofGoedkeuren({ isBeheerder, onGewijzigd }) {
  const [scope, setScope] = useState("mijn");
  const [data, setData] = useState(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState("");
  const [afwijzen, setAfwijzen] = useState(""); // id van de aanvraag waarvoor de redenbox openstaat
  const [reden, setReden] = useState("");

  const laad = useCallback(() => {
    setData(null); setFout("");
    const s = scope === "alle" && isBeheerder ? "?scope=alle" : "";
    fetch(`/api/mw-verlof-goedkeuren${s}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData({ aanvragen: [] }); setFout("Kon de verlofaanvragen niet laden."); });
  }, [scope, isBeheerder]);
  useEffect(() => { laad(); }, [laad]);

  const goedkeuren = async (a) => {
    setBezig(a.id); setFout("");
    try {
      const res = await fetch("/api/mw-verlof-goedkeuren", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "goedkeuren", id: a.id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      laad(); if (onGewijzigd) onGewijzigd();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(""); }
  };

  const afwijs = async (a) => {
    if (!reden.trim()) { setFout("Geef een reden voor de afwijzing."); return; }
    setBezig(a.id); setFout("");
    try {
      const res = await fetch("/api/mw-verlof-goedkeuren", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "afwijzen", id: a.id, reden }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setAfwijzen(""); setReden("");
      laad(); if (onGewijzigd) onGewijzigd();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(""); }
  };

  const aanvragen = data?.aanvragen || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700 }}>
          <CalendarCheck size={16} color={KLEUR.blauw} /> Verlof goedkeuren
          {aanvragen.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: KLEUR.rood, borderRadius: 999, padding: "1px 8px" }}>{aanvragen.length}</span>}
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
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Verlofaanvragen ophalen…</div>
      ) : aanvragen.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Er staan geen verlofaanvragen op je goedkeuring te wachten.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {aanvragen.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "10px 12px", background: "#FBFBF9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{a.medewerkerNaam} <span style={{ fontWeight: 500, color: KLEUR.subtekst }}>· {a.verloftype}</span></div>
                  <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{datumNL(a.startdatum)}{a.einddatum !== a.startdatum ? ` – ${datumNL(a.einddatum)}` : ""} · {uur(a.aantalUren)} u</div>
                  {a.toelichting && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 2 }}>"{a.toelichting}"</div>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {afwijzen === a.id ? (
                    <>
                      <input value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Reden voor afwijzing (verplicht)" autoFocus style={{ boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 12, minWidth: 220 }} />
                      <button onClick={() => afwijs(a)} disabled={bezig === a.id} style={{ ...knopStijl(false), padding: "7px 11px", color: "#fff", background: KLEUR.rood, borderColor: KLEUR.rood }}>{bezig === a.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : "Bevestig afwijzing"}</button>
                      <button onClick={() => { setAfwijzen(""); setReden(""); }} disabled={bezig === a.id} style={{ ...knopStijl(false), padding: "7px 10px" }}>Annuleer</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setAfwijzen(a.id)} disabled={bezig === a.id} style={{ ...knopStijl(false), padding: "7px 11px", color: KLEUR.rood, borderColor: "#E7C9C9" }}><XCircle size={13} /> Afwijzen</button>
                      <button onClick={() => goedkeuren(a)} disabled={bezig === a.id} style={{ ...knopStijl(true), padding: "7px 12px" }}>{bezig === a.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />} Goedkeuren</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const scopeKnop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });
