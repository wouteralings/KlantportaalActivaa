import { useEffect, useState } from "react";
import { Boxes, CheckCircle2, Clock, Loader2, Search } from "lucide-react";

/** Zelfde palet als de rest van het beheerportaal (bewust hier herhaald, zie UrenTarievenBeheer.jsx). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237" };
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff", outline: "none" };

function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}

/**
 * Beheer van de Bezittingenmodule: per klant aan/uit + prijs per maand. Zelfde patroon als
 * RapportagesBeheer.jsx (en de "Facturatie & uren"-rubriek in BeheerPortaal.jsx), standalone
 * bestand — er is voor Bezittingen geen apart naam/volgorde-scherm nodig (dat is RGS-specifiek).
 */
export default function BezittingenBeheer() {
  const [klanten, setKlanten] = useState(null);
  const [statussen, setStatussen] = useState({});
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState("alle");
  const [bezig, setBezig] = useState({});
  const [fout, setFout] = useState("");
  const [prijs, setPrijs] = useState("5");
  const [prijsStatus, setPrijsStatus] = useState("idle");

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKlanten((d.klanten || []).map((k) => ({ accountId: k.accountId, klantnaam: k.klantnaam, klantnummer: k.klantnummer }))))
      .catch(() => setKlanten([]));
    fetch("/api/beheer-bezittingen-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStatussen(d.statussen || {}))
      .catch(() => setStatussen({}));
    fetch("/api/beheer-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPrijs(d.bezittingenmodulePrijs != null ? String(d.bezittingenmodulePrijs) : "5"))
      .catch(() => {});
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

  const slaPrijsOp = async () => {
    setPrijsStatus("bezig");
    try {
      const bedrag = Number(String(prijs).replace(",", "."));
      if (isNaN(bedrag) || bedrag < 0) throw new Error("Ongeldig bedrag");
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bezittingenmodulePrijs: bedrag }),
      });
      if (!res.ok) throw new Error();
      setPrijsStatus("gelukt");
      setTimeout(() => setPrijsStatus("idle"), 1800);
    } catch { setPrijsStatus("fout"); }
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
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <Boxes size={17} color={KLEUR.blauw} /> Bezittingen — activastaat en afschrijvingen uit Exact Online
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18, maxWidth: 760 }}>
        Zet de Bezittingenmodule per klant aan of uit. Los van Rapportages en Facturatie — een klant kan het één
        zonder het ander afnemen.
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          Per klant aan/uit
          {aanvragenCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: KLEUR.rood, color: "#fff", fontSize: 10.5, fontWeight: 700 }}>
              {aanvragenCount}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "6px 0 14px" }}>
          Standaard staat Bezittingen <strong>uit</strong> voor elke klant. Zet 'm per klant aan zodra die klant hem mag
          gebruiken — de tab "Bezittingen" verschijnt dan meteen in het klantportaal van die klant.
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 18, padding: 14, background: KLEUR.lichtblauw, borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Prijs per maand, per klantaccount</div>
            <div style={{ position: "relative", maxWidth: 160 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
              <input type="text" inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} style={{ ...veld, width: "100%", padding: "8px 10px 8px 24px" }} />
            </div>
          </div>
          <button onClick={slaPrijsOp} disabled={prijsStatus === "bezig"} style={{ padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            {prijsStatus === "bezig" ? "Opslaan..." : "Opslaan"}
          </button>
          {prijsStatus === "gelukt" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw }}><CheckCircle2 size={14} /> Opgeslagen.</span>}
          {prijsStatus === "fout" && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Ongeldig bedrag of opslaan mislukt.</span>}
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
            {gefilterd.map((k, i) => {
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
      </div>
    </div>
  );
}
