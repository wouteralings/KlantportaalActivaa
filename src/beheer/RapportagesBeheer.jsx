import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, CheckCircle2, ChevronDown, Clock, Loader2, Save, Search } from "lucide-react";

/** Zelfde palet als de rest van het beheerportaal (bewust hier herhaald, zie UrenTarievenBeheer.jsx). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237" };
const veld = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff", outline: "none" };

function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}

/**
 * Beheer van de Rapportagemodule: (1) per klant aan/uit + prijs per maand — zelfde patroon als de
 * rubriek "Facturatie & uren" in BeheerPortaal.jsx, hier als eigen standalone bestand (net als
 * UrenTarievenBeheer.jsx), en (2) globaal per RGS-code een eigen naam en presentatievolgorde.
 */
export default function RapportagesBeheer() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <BarChart3 size={17} color={KLEUR.blauw} /> Rapportages — W&amp;V en Balans uit RGS 3.5 / Exact Online
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18, maxWidth: 760 }}>
        Zet de Rapportagemodule per klant aan of uit, en bepaal hieronder globaal hoe RGS-codes heten en in
        welke volgorde ze getoond worden — dat geldt voor alle klanten tegelijk, RGS-codes zijn immers
        universeel.
      </div>
      <KlantenToggle />
      <div style={{ marginTop: 32 }}>
        <RgsNaamVolgorde />
      </div>
    </div>
  );
}

function KlantenToggle() {
  const [klanten, setKlanten] = useState(null); // null = laden
  const [statussen, setStatussen] = useState({});
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState("alle"); // alle | aan | uit
  const [bezig, setBezig] = useState({});
  const [fout, setFout] = useState("");
  const [prijs, setPrijs] = useState("7.5");
  const [prijsStatus, setPrijsStatus] = useState("idle"); // idle | bezig | gelukt | fout

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKlanten((d.klanten || []).map((k) => ({ accountId: k.accountId, klantnaam: k.klantnaam, klantnummer: k.klantnummer }))))
      .catch(() => setKlanten([]));
    fetch("/api/beheer-rapportages-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStatussen(d.statussen || {}))
      .catch(() => setStatussen({}));
    fetch("/api/beheer-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPrijs(d.rapportagesmodulePrijs != null ? String(d.rapportagesmodulePrijs) : "7.5"))
      .catch(() => {});
  }, []);

  const zetStatus = async (accountId, ingeschakeld) => {
    setFout("");
    setBezig((h) => ({ ...h, [accountId]: true }));
    setStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld } }));
    try {
      const res = await fetch("/api/beheer-rapportages-klanten", {
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
        body: JSON.stringify({ rapportagesmodulePrijs: bedrag }),
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
        Standaard staat Rapportages <strong>uit</strong> voor elke klant. Zet 'm per klant aan zodra die klant hem mag
        gebruiken — de tab "Rapportages" verschijnt dan meteen in het klantportaal van die klant.
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
  );
}

const CATEGORIE_LABEL = { omzet: "W&V — Omzet", kosten: "W&V — Kosten", activa: "Balans — Activa", passiva: "Balans — Passiva" };
const CATEGORIEEN = ["omzet", "kosten", "activa", "passiva"];

function RgsNaamVolgorde() {
  const [codes, setCodes] = useState(null); // null = laden
  const [fout, setFout] = useState("");
  const [open, setOpen] = useState("omzet");

  const laad = () => {
    fetch("/api/rgs-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCodes(d.codes || []))
      .catch(() => { setCodes([]); setFout("Kon de RGS-instellingen niet ophalen."); });
  };
  useEffect(() => { laad(); }, []);

  const perCategorie = useMemo(() => {
    const m = {};
    for (const c of CATEGORIEEN) m[c] = (codes || []).filter((r) => r.categorie === c).sort((a, b) => a.volgorde - b.volgorde);
    return m;
  }, [codes]);

  const verplaats = async (categorie, index, richting) => {
    const lijst = [...perCategorie[categorie]];
    const nieuweIndex = index + richting;
    if (nieuweIndex < 0 || nieuweIndex >= lijst.length) return;
    [lijst[index], lijst[nieuweIndex]] = [lijst[nieuweIndex], lijst[index]];
    setFout("");
    try {
      const res = await fetch("/api/rgs-instellingen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "volgorde", rgsCodes: lijst.map((r) => r.rgsCode) }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setCodes(d.codes || []);
    } catch { setFout("Herschikken is niet gelukt, probeer het nog eens."); }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>RGS-namen en volgorde</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14 }}>
        Geef een RGS-code een eigen, herkenbare naam voor je klanten (leeg = standaardnaam) en bepaal met de
        pijltjes in welke volgorde de regels binnen elke rapportage getoond worden. Geldt voor alle klanten.
      </div>
      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {codes === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>RGS-codes ophalen…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CATEGORIEEN.map((cat) => (
            <div key={cat} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
              <button
                onClick={() => setOpen(open === cat ? null : cat)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <ChevronDown size={14} color={KLEUR.mutedTekst} style={{ transform: open === cat ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{CATEGORIE_LABEL[cat]}</span>
                <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>({perCategorie[cat].length})</span>
              </button>
              {open === cat && (
                <div style={{ borderTop: `1px solid ${KLEUR.rand}` }}>
                  {perCategorie[cat].map((r, i) => (
                    <RgsCodeRij key={r.rgsCode} r={r} isEerste={i === 0} isLaatste={i === perCategorie[cat].length - 1}
                      onVerplaats={(richting) => verplaats(cat, i, richting)} onNaamOpgeslagen={laad} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RgsCodeRij({ r, isEerste, isLaatste, onVerplaats, onNaamOpgeslagen }) {
  const [naam, setNaam] = useState(r.naam || "");
  const [bezig, setBezig] = useState(false);
  const [ok, setOk] = useState(false);
  const gewijzigd = naam !== (r.naam || "");

  const opslaan = async () => {
    setBezig(true); setOk(false);
    try {
      const res = await fetch("/api/rgs-instellingen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "naam", rgsCode: r.rgsCode, naam }),
      });
      if (!res.ok) throw new Error();
      setOk(true);
      onNaamOpgeslagen();
      setTimeout(() => setOk(false), 1500);
    } catch { /* rij blijft gewoon bewerkbaar staan, gebruiker kan opnieuw proberen */ }
    finally { setBezig(false); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button onClick={() => onVerplaats(-1)} disabled={isEerste} style={{ background: "none", border: "none", cursor: isEerste ? "default" : "pointer", opacity: isEerste ? 0.3 : 1, padding: 0 }}><ArrowUp size={13} color={KLEUR.subtekst} /></button>
        <button onClick={() => onVerplaats(1)} disabled={isLaatste} style={{ background: "none", border: "none", cursor: isLaatste ? "default" : "pointer", opacity: isLaatste ? 0.3 : 1, padding: 0 }}><ArrowDown size={13} color={KLEUR.subtekst} /></button>
      </div>
      <div style={{ flex: "0 0 190px" }}>
        <div style={{ fontSize: 12.5, color: KLEUR.tekst }}>{r.standaardNaam}</div>
        <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, fontFamily: "monospace" }}>{r.rgsCode} · {r.groep}</div>
      </div>
      <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={r.standaardNaam} style={{ ...veld, flex: 1 }} />
      <button onClick={opslaan} disabled={!gewijzigd || bezig} style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px",
        background: !gewijzigd ? "#fff" : ok ? KLEUR.groen : KLEUR.blauw, color: !gewijzigd ? KLEUR.mutedTekst : "#fff",
        border: `1px solid ${!gewijzigd ? KLEUR.rand : "transparent"}`, borderRadius: 7, fontSize: 12, fontWeight: 600,
        cursor: !gewijzigd || bezig ? "default" : "pointer",
      }}>
        {bezig ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : ok ? <CheckCircle2 size={12} /> : <Save size={12} />}
        {ok ? "Opgeslagen" : "Opslaan"}
      </button>
    </div>
  );
}
