import { useEffect, useState } from "react";
import { Clock, Save, Loader2, Search, Bell, CheckCircle2 } from "lucide-react";

/** Zelfde palet als de rest van het beheerportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237" };
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff", outline: "none" };
const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "7px 10px", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "8px 10px", borderTop: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };
const WEEKDAGEN = [[1, "Maandag"], [2, "Dinsdag"], [3, "Woensdag"], [4, "Donderdag"], [5, "Vrijdag"], [6, "Zaterdag"], [7, "Zondag"]];

/**
 * Beheer van de interne urenregistratie: per medewerker de uurtarieven (normaal/hoog/laag) en het
 * declarabel-doel(%), plus de herinneringsflow (deadline-weekdag, minimum uren, webhook, tekst).
 */
export default function UrenTarievenBeheer() {
  const [medewerkers, setMedewerkers] = useState(null);
  const [instellingen, setInstellingen] = useState(null);
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");

  const laad = () => {
    setMedewerkers(null); setFout("");
    fetch("/api/beheer-uren-tarieven")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMedewerkers(d.medewerkers || []); setInstellingen(d.instellingen || null); })
      .catch(() => { setMedewerkers([]); setFout("Kon het tariefbeheer niet laden. Controleer of de database-koppeling is ingesteld."); });
  };
  useEffect(() => { laad(); }, []);

  const gefilterd = (medewerkers || []).filter((m) => { const q = zoek.trim().toLowerCase(); return !q || `${m.naam} ${m.email} ${m.functie}`.toLowerCase().includes(q); });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <Clock size={17} color={KLEUR.blauw} /> Urenregistratie — tarieven & herinneringen
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 760 }}>
        Stel per medewerker het normale, hoge en lage uurtarief en het declarabel-doel(%) in. Onderaan richt je de
        wekelijkse herinnering in voor medewerkers die hun uren nog niet volledig hebben geschreven.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <div style={{ position: "relative", maxWidth: 320, marginBottom: 10 }}>
        <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker…" style={{ ...veld, width: "100%", padding: "8px 9px 8px 28px" }} />
      </div>

      {medewerkers === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Medewerkers ophalen…</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#FBFBF9" }}>
                <th style={th}>Medewerker</th><th style={th}>Normaal €/u</th><th style={th}>Hoog €/u</th><th style={th}>Laag €/u</th>
                <th style={th}>Declarabel-doel %</th><th style={th}>Actief</th><th style={{ ...th, width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.length === 0 ? (
                <tr><td style={{ ...td, color: KLEUR.mutedTekst }} colSpan={7}>Geen medewerkers gevonden.</td></tr>
              ) : gefilterd.map((m) => <TariefRij key={m.email} m={m} />)}
            </tbody>
          </table>
        </div>
      )}

      {instellingen && <Herinneringen begin={instellingen} onFout={setFout} />}
    </div>
  );
}

function TariefRij({ m }) {
  const t = m.tarief || {};
  const [normaal, setNormaal] = useState(t.normaal ?? "");
  const [hoog, setHoog] = useState(t.hoog ?? "");
  const [laag, setLaag] = useState(t.laag ?? "");
  const [doel, setDoel] = useState(t.declarabelDoel ?? "");
  const [actief, setActief] = useState(t.actief !== false);
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);
  const [fout, setFout] = useState("");

  const opslaan = async () => {
    setBezig(true); setOk(false); setFout("");
    try {
      const res = await fetch("/api/beheer-uren-tarieven", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "tarief", email: m.email, naam: m.naam, tarief_normaal: normaal, tarief_hoog: hoog, tarief_laag: laag, declarabel_doel: doel, actief }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOk(true); setTimeout(() => setOk(false), 1800);
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const num = { ...veld, width: 78 };
  return (
    <tr>
      <td style={td}><div style={{ fontWeight: 600 }}>{m.naam}</div><div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{m.functie || m.email}</div>{fout && <div style={{ fontSize: 10.5, color: KLEUR.rood }}>{fout}</div>}</td>
      <td style={td}><input value={normaal} onChange={(e) => setNormaal(e.target.value)} inputMode="decimal" placeholder="—" style={num} /></td>
      <td style={td}><input value={hoog} onChange={(e) => setHoog(e.target.value)} inputMode="decimal" placeholder="—" style={num} /></td>
      <td style={td}><input value={laag} onChange={(e) => setLaag(e.target.value)} inputMode="decimal" placeholder="—" style={num} /></td>
      <td style={td}><input value={doel} onChange={(e) => setDoel(e.target.value)} inputMode="decimal" placeholder="—" style={{ ...veld, width: 64 }} /></td>
      <td style={td}><label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} /></label></td>
      <td style={td}>
        <button onClick={opslaan} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", background: ok ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={13} /> : <Save size={13} />} {ok ? "Opgeslagen" : "Opslaan"}
        </button>
      </td>
    </tr>
  );
}

function Herinneringen({ begin, onFout }) {
  const [actief, setActief] = useState(!!begin.herinneringActief);
  const [weekdag, setWeekdag] = useState(begin.herinneringWeekdag || 5);
  const [minuren, setMinuren] = useState(begin.herinneringMinuren ?? 40);
  const [webhook, setWebhook] = useState(begin.herinneringWebhook || "");
  const [tekst, setTekst] = useState(begin.herinneringTekst || "");
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);

  const opslaan = async () => {
    setBezig(true); setOk(false); onFout("");
    try {
      const res = await fetch("/api/beheer-uren-tarieven", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "instellingen", herinnering_actief: actief, herinnering_weekdag: Number(weekdag), herinnering_minuren: Number(minuren), herinnering_webhook: webhook.trim() || null, herinnering_tekst: tekst.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setOk(true); setTimeout(() => setOk(false), 1800);
    } catch (e) { onFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 4 }}><Bell size={16} color={KLEUR.blauw} /> Herinneringsflow</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12 }}>
        Op de ingestelde deadline-dag krijgen medewerkers die deze week minder dan het minimum aantal uren hebben geschreven een
        herinnering via de webhook (bijv. Teams/Power Automate). De dagelijkse aanroep loopt via <code>/api/verwerk-uren-herinneringen</code>.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} /> Herinneringen inschakelen
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Deadline-dag</span>
          <select value={weekdag} onChange={(e) => setWeekdag(e.target.value)} style={{ ...veld, width: 150 }}>
            {WEEKDAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Minimum uren/week</span>
          <input value={minuren} onChange={(e) => setMinuren(e.target.value)} inputMode="decimal" style={{ ...veld, width: 110 }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        <span style={lbl}>Webhook-URL (Teams / Power Automate)</span>
        <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" style={{ ...veld, width: "100%" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
        <span style={lbl}>Herinneringstekst</span>
        <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} placeholder="Vergeet niet je uren voor deze week volledig te schrijven." style={{ ...veld, width: "100%", resize: "vertical" }} />
      </div>
      <button onClick={opslaan} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", background: ok ? KLEUR.groen : KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={14} /> : <Save size={14} />} {ok ? "Opgeslagen" : "Instellingen opslaan"}
      </button>
    </div>
  );
}

const lbl = { fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" };
