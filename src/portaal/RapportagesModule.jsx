import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, Clock, Download, Lock, Scale, TrendingUp } from "lucide-react";

/** Zelfde palet als de rest van het klantportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie UrenTarievenBeheer.jsx voor hetzelfde patroon aan de beheerkant). */
const KLEUR = {
  blauw: "#1C5D8C", goud: "#B98237", tekst: "#1C2321", subtekst: "#5B6259",
  mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};

function geld(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
async function haalJson(res) {
  if (!res.ok) {
    let bericht = `HTTP ${res.status}`;
    try { const d = await res.json(); if (d && d.error) bericht = d.error; } catch { /* geen JSON-body */ }
    const fout = new Error(bericht);
    fout.status = res.status;
    throw fout;
  }
  return res.json();
}

function Knop({ children, onClick, variant = "secundair", disabled, icon: Icon, style }) {
  const varianten = {
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    secundair: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
      fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
      whiteSpace: "nowrap", ...varianten[variant], ...style,
    }}>
      {Icon && <Icon size={13} />} {children}
    </button>
  );
}
function Melding({ tekst, type = "fout" }) {
  if (!tekst) return null;
  const kleur = type === "fout" ? KLEUR.rood : KLEUR.blauw;
  return (
    <div style={{ background: `${kleur}12`, border: `1px solid ${kleur}33`, color: kleur, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
      {tekst}
    </div>
  );
}
function LegeStaat({ tekst }) {
  return <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>{tekst}</div>;
}

/** Aanvraagkaart, getoond zolang Rapportages voor dit account nog niet aan staat — zelfde opzet
 * als UrenNietActief in FacturatieModule.jsx, tegen /api/rapportages-aanvraag. */
function RapportagesNietActief({ account, prijs }) {
  const [status, setStatus] = useState(account.rapportagesAangevraagdOp ? "aangevraagd" : "idle");

  const vraagAan = async () => {
    setStatus("bezig");
    try {
      await haalJson(await fetch("/api/rapportages-aanvraag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId }),
      }));
      setStatus("aangevraagd");
    } catch { setStatus("fout"); }
  };

  return (
    <div style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Lock size={15} color={KLEUR.mutedTekst} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>Rapportages nog niet actief voor dit klantaccount</div>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 560 }}>
        Winst-en-verliesrekening en balans, automatisch opgebouwd uit de RGS-indeling van je administratie in
        Exact Online — altijd actueel, geen aparte export nodig. Deze functie kost <strong>{geld(prijs)} per maand</strong> per
        administratie.
      </div>
      {status === "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} />
          Aangevraagd{account.rapportagesAangevraagdOp ? ` op ${datum(account.rapportagesAangevraagdOp)}` : ""} — we nemen contact met je op.
        </div>
      ) : (
        <Knop variant="primair" onClick={vraagAan} disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Vraag Rapportages aan"}
        </Knop>
      )}
      {status === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="Aanvragen is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

/** Eén rij in een W&V- of balansregel-lijst. */
function RegelRij({ regel, vergelijkRegel, toonVergelijk }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: toonVergelijk ? "1fr 130px 130px" : "1fr 130px", padding: "7px 14px", fontSize: 13, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ color: KLEUR.tekst }}>{regel.naam}</div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{geld(regel.saldo)}</div>
      {toonVergelijk && <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: KLEUR.mutedTekst }}>{geld(vergelijkRegel ? vergelijkRegel.saldo : 0)}</div>}
    </div>
  );
}

/** Groepeert regels op hun "groep"-veld en toont elke groep inklapbaar, met subtotaal. */
function GroepenLijst({ regels, vergelijkRegels, toonVergelijk }) {
  const [openGroepen, setOpenGroepen] = useState(() => new Set());
  const vergelijkPerCode = useMemo(() => {
    const m = new Map();
    (vergelijkRegels || []).forEach((r) => m.set(r.rgsCode, r));
    return m;
  }, [vergelijkRegels]);

  const groepen = useMemo(() => {
    const m = new Map();
    for (const r of regels) {
      if (!m.has(r.groep)) m.set(r.groep, []);
      m.get(r.groep).push(r);
    }
    return [...m.entries()];
  }, [regels]);

  const toggle = (groep) => setOpenGroepen((h) => {
    const n = new Set(h);
    n.has(groep) ? n.delete(groep) : n.add(groep);
    return n;
  });

  if (regels.length === 0) return <LegeStaat tekst="Geen regels voor dit jaar." />;

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
      {groepen.map(([groep, groepRegels], i) => {
        const open = openGroepen.has(groep) || openGroepen.size === 0 && i === 0;
        const subtotaal = groepRegels.reduce((s, r) => s + r.saldo, 0);
        return (
          <div key={groep} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
            <button
              onClick={() => toggle(groep)}
              style={{
                display: "grid", gridTemplateColumns: toonVergelijk ? "auto 1fr 130px 130px" : "auto 1fr 130px",
                alignItems: "center", width: "100%", padding: "10px 14px", background: KLEUR.lichtblauw,
                border: "none", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst,
              }}
            >
              <ChevronDown size={14} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
              <span>{groep}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{geld(subtotaal)}</span>
              {toonVergelijk && <span />}
            </button>
            {open && groepRegels.map((r) => (
              <RegelRij key={r.rgsCode} regel={r} vergelijkRegel={vergelijkPerCode.get(r.rgsCode)} toonVergelijk={toonVergelijk} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function JaarKiezer({ jaar, setJaar }) {
  const huidig = new Date().getFullYear();
  const jaren = [huidig, huidig - 1, huidig - 2, huidig - 3, huidig - 4];
  return (
    <select value={jaar} onChange={(e) => setJaar(Number(e.target.value))} style={{ padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, background: "#fff" }}>
      {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
    </select>
  );
}

function useRapportage(accountId, jaar, vergelijkMet) {
  const [status, setStatus] = useState("laden");
  const [data, setData] = useState(null);
  const [foutmelding, setFoutmelding] = useState("");

  useEffect(() => {
    if (!accountId) return;
    setStatus("laden");
    const params = new URLSearchParams({ accountId, jaar: String(jaar) });
    if (vergelijkMet) params.set("vergelijkMet", String(vergelijkMet));
    fetch(`/api/rapportages?${params.toString()}`)
      .then(haalJson)
      .then((d) => { setData(d); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId, jaar, vergelijkMet]);

  return { status, data, foutmelding };
}

/** Volle Rapportages-inhoud voor één account waarvoor de module aan staat. */
function RapportagesInhoud({ account, alleenLezen }) {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const [vergelijk, setVergelijk] = useState(false);
  const vergelijkMet = vergelijk ? jaar - 1 : null;
  const { status, data, foutmelding } = useRapportage(account.accountId, jaar, vergelijkMet);

  const downloadCsv = () => {
    const params = new URLSearchParams({ accountId: account.accountId, jaar: String(jaar), formaat: "csv" });
    window.location.href = `/api/rapportages?${params.toString()}`;
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <JaarKiezer jaar={jaar} setJaar={setJaar} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.subtekst, cursor: "pointer" }}>
            <input type="checkbox" checked={vergelijk} onChange={(e) => setVergelijk(e.target.checked)} />
            Vergelijk met {jaar - 1}
          </label>
        </div>
        <Knop icon={Download} onClick={downloadCsv}>Download CSV</Knop>
      </div>

      {status === "laden" && <LegeStaat tekst="Cijfers ophalen…" />}
      {status === "fout" && <Melding tekst={foutmelding} />}

      {status === "klaar" && data && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, margin: "4px 0 10px" }}>
            <TrendingUp size={16} color={KLEUR.blauw} /> Winst-en-verliesrekening {jaar}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", margin: "12px 0 6px" }}>Omzet</div>
          <GroepenLijst regels={data.wv.omzet} vergelijkRegels={data.vergelijkMet?.wv?.omzet} toonVergelijk={vergelijk} />
          <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", margin: "16px 0 6px" }}>Kosten</div>
          <GroepenLijst regels={data.wv.kosten} vergelijkRegels={data.vergelijkMet?.wv?.kosten} toonVergelijk={vergelijk} />
          <div style={{
            display: "grid", gridTemplateColumns: vergelijk ? "1fr 130px 130px" : "1fr 130px", padding: "12px 14px", marginTop: 12,
            background: data.wv.resultaat >= 0 ? `${KLEUR.groen}12` : `${KLEUR.rood}12`, borderRadius: 8, fontSize: 14, fontWeight: 700,
          }}>
            <div>Resultaat</div>
            <div style={{ textAlign: "right", color: data.wv.resultaat >= 0 ? KLEUR.groen : KLEUR.rood }}>{geld(data.wv.resultaat)}</div>
            {vergelijk && <div style={{ textAlign: "right", color: KLEUR.mutedTekst, fontWeight: 600 }}>{geld(data.vergelijkMet?.wv?.resultaat)}</div>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, margin: "28px 0 10px" }}>
            <Scale size={16} color={KLEUR.blauw} /> Balans per 31-12-{jaar}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", margin: "12px 0 6px" }}>Activa</div>
          <GroepenLijst regels={data.balans.activa} vergelijkRegels={data.vergelijkMet?.balans?.activa} toonVergelijk={vergelijk} />
          <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", margin: "16px 0 6px" }}>Passiva</div>
          <GroepenLijst regels={data.balans.passiva} vergelijkRegels={data.vergelijkMet?.balans?.passiva} toonVergelijk={vergelijk} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", padding: "12px 14px", marginTop: 12, background: KLEUR.lichtblauw, borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            <div>Totaal activa / passiva</div>
            <div style={{ textAlign: "right" }}>{geld(data.balans.activaTotaal)}</div>
          </div>

          {alleenLezen && (
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 14 }}>Je bekijkt dit alleen-lezen namens de klant.</div>
          )}
        </>
      )}
    </div>
  );
}

/** Module-root: per gekoppeld klantaccount de volle rapportage of een aanvraagkaart. Bij meerdere
 * gekoppelde accounts kies je bovenaan voor welke administratie je kijkt (net als het accountId-
 * concept overal elders in het portaal). */
export default function RapportagesModule({ accounts, prijs = 7.5, alleenLezen = false }) {
  const [gekozenId, setGekozenId] = useState(accounts[0]?.accountId || null);

  useEffect(() => {
    if (!accounts.some((a) => a.accountId === gekozenId)) setGekozenId(accounts[0]?.accountId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  if (accounts.length === 0) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  const account = accounts.find((a) => a.accountId === gekozenId) || accounts[0];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: accounts.length > 1 ? 12 : 4 }}>
        <BarChart3 size={17} color={KLEUR.blauw} /> Rapportages
      </div>
      {accounts.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {accounts.map((a) => (
            <button
              key={a.accountId}
              onClick={() => setGekozenId(a.accountId)}
              style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${a.accountId === gekozenId ? KLEUR.blauw : KLEUR.rand}`,
                background: a.accountId === gekozenId ? KLEUR.blauw : "#fff",
                color: a.accountId === gekozenId ? "#fff" : KLEUR.subtekst,
              }}
            >
              {a.klantnaam}
            </button>
          ))}
        </div>
      )}
      {account.rapportagesIngeschakeld
        ? <RapportagesInhoud account={account} alleenLezen={alleenLezen} />
        : <RapportagesNietActief account={account} prijs={prijs} />}
    </div>
  );
}
