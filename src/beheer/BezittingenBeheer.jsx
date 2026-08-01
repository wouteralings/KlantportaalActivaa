import { useEffect, useState } from "react";
import { ChevronDown, Clock, Loader2, Search } from "lucide-react";

/** Zelfde palet als de rest van het beheerportaal (bewust hier herhaald, zie UrenTarievenBeheer.jsx). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237" };
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff", outline: "none" };
const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];
const AANTAL_STANDAARD = 25;

/** Zelfde "Toon: 25/50/.../Alle"-kiezer als in BeheerPortaal.jsx (bewust hier herhaald). */
function AantalKiezer({ aantal, setAantal, totaal }) {
  const getoond = Math.min(aantal === Infinity ? totaal : aantal, totaal);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{getoond} van {totaal} getoond</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTAL_KEUZES.map(([n, lbl]) => (
          <button
            key={lbl}
            onClick={() => setAantal(n)}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${aantal === n ? KLEUR.blauw : KLEUR.rand}`,
              background: aantal === n ? KLEUR.blauw : "#fff",
              color: aantal === n ? "#fff" : KLEUR.subtekst,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}

/**
 * Beheer van de Bezittingenmodule: per klant aan/uit + prijs per maand. Zelfde inklapbare
 * chevron-rubriek-patroon als "BTW-tarieven"/"Standaardartikelen" in de Facturatie-tab van
 * BeheerPortaal.jsx — dit bestand wordt daar zelf ook binnen de tab "Facturatie" gerenderd,
 * naast de facturatie- en rapportagerubrieken, zodat alle klantmodules op één tab staan
 * conform de standaard lay-out. Standalone bestand (net als UrenTarievenBeheer.jsx /
 * RapportagesBeheer.jsx) — er is voor Bezittingen geen apart naam/volgorde-scherm nodig (dat
 * is RGS-specifiek en zit al bij Rapportages).
 */
export default function BezittingenBeheer() {
  const [open, setOpen] = useState(false);
  const [klanten, setKlanten] = useState(null);
  const [statussen, setStatussen] = useState({});
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState("alle");
  const [bezig, setBezig] = useState({});
  const [fout, setFout] = useState("");
  const [toonAantal, setToonAantal] = useState(AANTAL_STANDAARD);

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKlanten((d.klanten || []).map((k) => ({ accountId: k.accountId, klantnaam: k.klantnaam, klantnummer: k.klantnummer }))))
      .catch(() => setKlanten([]));
    fetch("/api/beheer-bezittingen-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStatussen(d.statussen || {}))
      .catch(() => setStatussen({}));
  }, []);

  const zetStatus = async (accountId, ingeschakeld) => {
    setFout("");
    setBezig((h) => ({ ...h, [accountId]: true }));
    setStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld } }));
    try {
      const res = await fetch("/api/beheer-bezittingen-klanten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ingeschakeld }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setStatussen((h) => ({ ...h, [accountId]: d }));
    } catch {
      setStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld: !ingeschakeld } }));
      setFout("Opslaan is niet gelukt, probeer het nog eens.");
    } finally {
      setBezig((h) => ({ ...h, [accountId]: false }));
    }
  };

  const aanvragenCount = Object.values(statussen).filter((s) => s && !s.ingeschakeld && s.aangevraagdOp).length;
  const term = zoek.trim().toLowerCase();
  const gefilterd = (klanten || []).filter((k) => {
    const matcht = !term || `${k.klantnaam} ${k.klantnummer ?? ""}`.toLowerCase().includes(term);
    const aan = !!(statussen[k.accountId] && statussen[k.accountId].ingeschakeld);
    const filterMatcht = filter === "alle" || (filter === "aan" ? aan : !aan);
    return matcht && filterMatcht;
  });

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 700 }}>Bezittingen — per klant aan/uit</span>
        {aanvragenCount > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: KLEUR.rood, color: "#fff", fontSize: 10.5, fontWeight: 700 }}>
            {aanvragenCount}
          </span>
        )}
      </button>
      {open && (<>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
        Standaard staat Bezittingen <strong>uit</strong> voor elke klant. Zet 'm per klant aan zodra die klant hem mag
        gebruiken — de tab "Bezittingen" verschijnt dan meteen in het klantportaal van die klant. Los van Rapportages
        en Facturatie — een klant kan het één zonder het ander afnemen. De prijs per maand stel je in bij de tabel
        "Betaalde functionaliteiten" bovenaan de tab Facturatie.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ position: "relative", maxWidth: 280, flex: "1 1 220px" }}>
          <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek klant…" style={{ ...veld, width: "100%", padding: "8px 9px 8px 28px" }} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["alle", "Alle"], ["aan", "Aan"], ["uit", "Uit"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${filter === k ? KLEUR.blauw : KLEUR.rand}`,
              background: filter === k ? KLEUR.blauw : "#fff", color: filter === k ? "#fff" : KLEUR.subtekst,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {klanten === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Klanten ophalen…</div>
      ) : gefilterd.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen klanten gevonden.</div>
      ) : (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          {gefilterd.slice(0, toonAantal).map((k, i) => {
            const s = statussen[k.accountId] || {};
            const aan = !!s.ingeschakeld;
            const aanvraag = !aan && !!s.aangevraagdOp;
            return (
              <div key={k.accountId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 14px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{k.klantnaam}</div>
                  <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>
                    {k.klantnummer || "—"}
                    {aanvraag && <span style={{ marginLeft: 8, color: KLEUR.goud, display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={11} /> Aangevraagd {datum(s.aangevraagdOp)}</span>}
                  </div>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  {bezig[k.accountId] && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                  <input type="checkbox" checked={aan} disabled={!!bezig[k.accountId]} onChange={() => zetStatus(k.accountId, !aan)} />
                </label>
              </div>
            );
          })}
        </div>
      )}
      {klanten !== null && gefilterd.length > 0 && (
        <AantalKiezer aantal={toonAantal} setAantal={setToonAantal} totaal={gefilterd.length} />
      )}
      </>)}
    </div>
  );
}
