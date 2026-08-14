/**
 * Herbruikbaar "uren schrijven"-paneel — schrijft interne uren op één cliënt via /api/mw-uren-boekingen
 * (zelfde endpoint/velden als de Urenregistratie-module). Bedoeld om direct ná het afhandelen van een taak
 * of planningstaak te tonen, zodat de medewerker gelijk uren op die klant kan wegschrijven.
 *
 * De klant (accountId) ligt vast; de voorgestelde uren staan voorgevuld en zijn aanpasbaar. Standaard staat
 * de soort op "Abonnement" met het huidige jaar; is er een urencode gekozen, dan bepaalt die de soort.
 * Voor declarabele soorten (abonnement/UXT) hoort een cliënt; abonnement vereist een jaar.
 *
 * Props: { accountId, klantnaam, voorgesteldeUren?, omschrijving?, onGeboekt?(uren), onOverslaan?, compact? }
 */
import { useEffect, useState } from "react";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", groenBg: "#E7F3EB", goud: "#B98237", lichtblauw: "#EAF2F8",
};
const SOORTEN = [
  { key: "abonnement", label: "Abonnement", decl: true },
  { key: "uxt", label: "UXT", decl: true },
  { key: "indirect", label: "Indirect", decl: false },
  { key: "kantoor", label: "Kantoor", decl: false },
];
const TARIEF_SOORTEN = [["normaal", "Normaal"], ["hoog", "Hoog"], ["laag", "Laag"]];
const isDecl = (s) => s === "abonnement" || s === "uxt";
const pad = (n) => String(n).padStart(2, "0");
function vandaagISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", background: "#fff" };

export default function UrenSchrijvenPanel({ accountId, klantnaam, voorgesteldeUren, omschrijving, onGeboekt, onOverslaan, compact }) {
  const [codes, setCodes] = useState([]);
  const [tarief, setTarief] = useState(null);
  const [soort, setSoort] = useState("abonnement");
  const [urencode, setUrencode] = useState("");
  const [uren, setUren] = useState(voorgesteldeUren != null && voorgesteldeUren !== "" ? String(voorgesteldeUren) : "");
  const [jaar, setJaar] = useState(String(new Date().getFullYear()));
  const [tariefSoort, setTariefSoort] = useState("normaal");
  const [omschr, setOmschr] = useState(omschrijving || "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState(false); // geboekt aantal (of false)

  useEffect(() => {
    const t = vandaagISO();
    let actief = true;
    fetch(`/api/mw-uren-boekingen?vanaf=${t}&tot=${t}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { if (!actief) return; setCodes((d.urencodes || []).filter((c) => c.actief !== false)); setTarief(d.tarief || null); })
      .catch(() => {});
    return () => { actief = false; };
  }, []);

  const decl = isDecl(soort);
  const kiesCode = (naam) => {
    const c = codes.find((x) => x.naam === naam);
    setUrencode(naam);
    if (c && c.categorie && SOORTEN.some((s) => s.key === c.categorie)) setSoort(c.categorie);
  };

  const boek = async () => {
    const aantal = Number(String(uren).replace(",", "."));
    if (!(aantal > 0)) { setFout("Geef een aantal uren groter dan 0."); return; }
    if (soort === "abonnement" && !jaar) { setFout("Vul het jaar in voor een abonnement."); return; }
    if (decl && !accountId) { setFout("Er is geen cliënt gekoppeld voor declarabele uren."); return; }
    setBezig(true); setFout("");
    try {
      const payload = {
        datum: vandaagISO(), soort, urencode: urencode || undefined,
        accountId: decl ? accountId : undefined, omschrijving: omschr,
        uren: aantal, tariefSoort: decl ? tariefSoort : undefined,
        jaar: soort === "abonnement" ? Number(jaar) : undefined,
      };
      const res = await fetch("/api/mw-uren-boekingen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setKlaar(aantal);
      onGeboekt && onGeboekt(aantal);
    } catch (e) { setFout(e.message || "Uren boeken is mislukt."); } finally { setBezig(false); }
  };

  if (klaar) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.groen, background: KLEUR.groenBg, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <CheckCircle2 size={15} /> {String(klaar).replace(".", ",")} uur geboekt op {klantnaam || "de klant"}.
      </div>
    );
  }

  const jaren = [];
  { const nj = new Date().getFullYear(); for (let j = nj + 1; j >= nj - 3; j--) jaren.push(j); }

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: compact ? 12 : 14, background: "#FbFcFb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: KLEUR.tekst, marginBottom: 10 }}>
        <Clock size={15} color={KLEUR.blauw} /> Uren schrijven op {klantnaam || "de klant"}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        {codes.length > 0 && (
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Urencode
            <select value={urencode} onChange={(e) => kiesCode(e.target.value)} style={{ ...veld, width: 200 }}>
              <option value="">— kies —</option>
              {codes.map((c) => <option key={c.naam} value={c.naam}>{c.naam}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Soort</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SOORTEN.map((s) => (
              <button key={s.key} onClick={() => { setSoort(s.key); setUrencode(""); }} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${soort === s.key ? KLEUR.blauw : KLEUR.rand}`, background: soort === s.key ? KLEUR.lichtblauw : "#fff", color: soort === s.key ? KLEUR.blauw : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{s.label}</button>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
          Uren
          <input type="number" min="0" step="0.25" value={uren} onChange={(e) => setUren(e.target.value)} placeholder="uren" style={{ ...veld, width: 90 }} autoFocus />
        </label>
        {soort === "abonnement" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Jaar
            <select value={jaar} onChange={(e) => setJaar(e.target.value)} style={{ ...veld, width: 100, borderColor: jaar ? KLEUR.rand : KLEUR.goud }}>
              <option value="">—</option>
              {jaren.map((j) => <option key={j} value={String(j)}>{j}</option>)}
            </select>
          </label>
        )}
        {decl && (
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Tarief
            <select value={tariefSoort} onChange={(e) => setTariefSoort(e.target.value)} style={{ ...veld, width: 120 }}>
              {TARIEF_SOORTEN.map(([k, l]) => <option key={k} value={k}>{l}{tarief && tarief[k] != null ? ` · €${tarief[k]}` : ""}</option>)}
            </select>
          </label>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Omschrijving</span>
        <input value={omschr} onChange={(e) => setOmschr(e.target.value)} placeholder="Waar zijn de uren aan besteed?" style={{ ...veld, width: "100%", marginTop: 3 }} />
      </div>

      {decl && tarief == null && <div style={{ fontSize: 11.5, color: KLEUR.goud, marginTop: 8 }}>Je hebt nog geen uurtarief ingesteld — je kunt wel alvast uren schrijven.</div>}
      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        {onOverslaan && <button onClick={onOverslaan} disabled={bezig} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Overslaan</button>}
        <button onClick={boek} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", background: bezig ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer" }}>
          {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Clock size={14} />} {bezig ? "Boeken…" : "Uren schrijven"}
        </button>
      </div>
    </div>
  );
}
