import { useEffect, useMemo, useState } from "react";
import { Boxes, CheckCircle2, Clock, Download, Lock, Package, PackageX } from "lucide-react";

/** Zelfde palet als de rest van het klantportaal (bewust hier herhaald, zie RapportagesModule.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259",
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

function Knop({ children, onClick, variant = "secundair", disabled, icon: Icon }) {
  const varianten = {
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    secundair: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
      fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
      whiteSpace: "nowrap", ...varianten[variant],
    }}>
      {Icon && <Icon size={13} />} {children}
    </button>
  );
}
function Melding({ tekst }) {
  if (!tekst) return null;
  return (
    <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
      {tekst}
    </div>
  );
}
function LegeStaat({ tekst }) {
  return <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>{tekst}</div>;
}

function BezittingenNietActief({ account, prijs }) {
  const [status, setStatus] = useState(account.bezittingenAangevraagdOp ? "aangevraagd" : "idle");

  const vraagAan = async () => {
    setStatus("bezig");
    try {
      await haalJson(await fetch("/api/bezittingen-aanvraag", {
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
        <div style={{ fontSize: 14, fontWeight: 700 }}>Bezittingen nog niet actief voor dit klantaccount</div>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 560 }}>
        Je actuele activastaat en afschrijvingen, rechtstreeks uit Exact Online — boekwaarde per bedrijfsmiddel,
        altijd actueel. Deze functie kost <strong>{geld(prijs)} per maand</strong> per administratie.
      </div>
      {status === "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} />
          Aangevraagd{account.bezittingenAangevraagdOp ? ` op ${datum(account.bezittingenAangevraagdOp)}` : ""} — we nemen contact met je op.
        </div>
      ) : (
        <Knop variant="primair" onClick={vraagAan} disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Vraag Bezittingen aan"}
        </Knop>
      )}
      {status === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="Aanvragen is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

const SUBTABS = [
  { key: "overzicht", label: "Overzicht", icon: Package },
  { key: "activastaat", label: "Activastaat", icon: Boxes },
  { key: "afschrijvingen", label: "Afschrijvingen", icon: CheckCircle2 },
];

function useBezittingen(accountId, jaar) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  useEffect(() => {
    if (!accountId) return;
    setStatus("laden");
    const params = new URLSearchParams({ accountId });
    if (jaar) params.set("jaar", String(jaar));
    fetch(`/api/bezittingen?${params.toString()}`)
      .then(haalJson)
      .then((d) => { setItems(d.bezittingen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId, jaar]);

  return { status, items, setItems, foutmelding };
}

/** Knop + inline formuliertje om een bezitting als "niet meer in bezit" te (de)markeren —
 * POST naar /api/bezittingen-status, met optimistische update van de lokale lijst na succes. */
function NietMeerInBezitActie({ b, accountId, alleenLezen, onBijgewerkt }) {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [datumVeld, setDatumVeld] = useState(() => new Date().toISOString().slice(0, 10));
  const [opmerking, setOpmerking] = useState("");

  const verstuur = async (nietMeerInBezit) => {
    setBezig(true);
    setFout("");
    try {
      const d = await haalJson(await fetch("/api/bezittingen-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId, bezittingId: b.id, nietMeerInBezit,
          datum: nietMeerInBezit ? datumVeld : undefined,
          opmerking: nietMeerInBezit ? opmerking : undefined,
        }),
      }));
      onBijgewerkt(b.id, {
        nietMeerInBezit: !!(d.status && d.status.nietMeerInBezit),
        nietMeerInBezitOp: (d.status && d.status.datum) || null,
        nietMeerInBezitOpmerking: (d.status && d.status.opmerking) || "",
      });
      setOpen(false);
      setOpmerking("");
    } catch (e) {
      setFout(e.message || String(e));
    } finally {
      setBezig(false);
    }
  };

  if (b.nietMeerInBezit) {
    return (
      <div style={{ fontSize: 11.5 }}>
        <div style={{ color: KLEUR.mutedTekst, display: "flex", alignItems: "center", gap: 5 }}>
          <PackageX size={12} /> Niet meer in bezit{b.nietMeerInBezitOp ? ` sinds ${datum(b.nietMeerInBezitOp)}` : ""}
        </div>
        {b.nietMeerInBezitOpmerking && (
          <div style={{ color: KLEUR.mutedTekst, marginTop: 2 }}>{b.nietMeerInBezitOpmerking}</div>
        )}
        {!alleenLezen && (
          <button onClick={() => verstuur(false)} disabled={bezig} style={{
            border: "none", background: "none", color: KLEUR.blauw, fontSize: 11.5, fontWeight: 600,
            cursor: bezig ? "default" : "pointer", padding: 0, marginTop: 3,
          }}>
            {bezig ? "Bezig…" : "Ongedaan maken"}
          </button>
        )}
        {fout && <div style={{ color: KLEUR.rood, marginTop: 3 }}>{fout}</div>}
      </div>
    );
  }

  if (alleenLezen) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, borderRadius: 6,
        padding: "4px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        <PackageX size={12} /> Niet meer in bezit
      </button>
    );
  }

  return (
    <div style={{ fontSize: 11.5, minWidth: 170 }} onClick={(e) => e.stopPropagation()}>
      <input type="date" value={datumVeld} onChange={(e) => setDatumVeld(e.target.value)}
        style={{ width: "100%", padding: "4px 6px", border: `1px solid ${KLEUR.rand}`, borderRadius: 5, fontSize: 11.5, marginBottom: 4 }} />
      <input type="text" placeholder="Reden (optioneel)" value={opmerking} onChange={(e) => setOpmerking(e.target.value)}
        style={{ width: "100%", padding: "4px 6px", border: `1px solid ${KLEUR.rand}`, borderRadius: 5, fontSize: 11.5, marginBottom: 4, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => verstuur(true)} disabled={bezig} style={{
          border: "none", background: KLEUR.blauw, color: "#fff", borderRadius: 5, padding: "4px 9px",
          fontSize: 11.5, fontWeight: 600, cursor: bezig ? "default" : "pointer",
        }}>
          {bezig ? "Bezig…" : "Bevestigen"}
        </button>
        <button onClick={() => { setOpen(false); setFout(""); }} disabled={bezig} style={{
          border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, borderRadius: 5, padding: "4px 9px",
          fontSize: 11.5, fontWeight: 600, cursor: bezig ? "default" : "pointer",
        }}>
          Annuleren
        </button>
      </div>
      {fout && <div style={{ color: KLEUR.rood, marginTop: 3 }}>{fout}</div>}
    </div>
  );
}

const OVERZICHT_KOLOMMEN = "2fr 1.1fr 1fr 1fr 1fr 1.4fr";

function OverzichtTab({ items, accountId, setItems, alleenLezen }) {
  const [groepFilter, setGroepFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const groepen = useMemo(() => [...new Set(items.map((b) => b.groepLabel))], [items]);
  const gefilterd = items.filter((b) =>
    (groepFilter === "alle" || b.groepLabel === groepFilter)
    && (statusFilter === "alle"
      || (statusFilter === "niet-meer-in-bezit" ? b.nietMeerInBezit
        : statusFilter === "afgeschreven" ? b.volledigAfgeschreven
        : !b.volledigAfgeschreven))
  );
  const totaalBoekwaarde = gefilterd.filter((b) => !b.nietMeerInBezit).reduce((s, b) => s + b.boekwaardeNu, 0);

  const downloadCsv = () => { window.location.href = `/api/bezittingen?accountId=${encodeURIComponent(accountId)}&formaat=csv`; };

  const bijgewerkt = (bezittingId, patch) => {
    setItems((huidig) => huidig.map((b) => (b.id === bezittingId ? { ...b, ...patch } : b)));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <select value={groepFilter} onChange={(e) => setGroepFilter(e.target.value)} style={{ padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5 }}>
          <option value="alle">Alle groepen</option>
          {groepen.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5 }}>
          <option value="alle">Alle statussen</option>
          <option value="in-gebruik">In gebruik</option>
          <option value="afgeschreven">Volledig afgeschreven</option>
          <option value="niet-meer-in-bezit">Niet meer in bezit</option>
        </select>
        <div style={{ marginLeft: "auto" }}><Knop icon={Download} onClick={downloadCsv}>Download CSV</Knop></div>
      </div>

      {gefilterd.length === 0 ? <LegeStaat tekst="Geen bezittingen gevonden." /> : (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: OVERZICHT_KOLOMMEN, background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
            <div>Omschrijving</div><div>Groep</div><div>Aanschafdatum</div><div style={{ textAlign: "right" }}>Aanschafwaarde</div><div style={{ textAlign: "right" }}>Boekwaarde nu</div><div>Status</div>
          </div>
          {gefilterd.map((b) => (
            <div key={b.id} style={{
              display: "grid", gridTemplateColumns: OVERZICHT_KOLOMMEN, padding: "9px 14px",
              borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center",
              opacity: b.nietMeerInBezit ? 0.65 : 1,
            }}>
              <div style={{ fontWeight: 600 }}>{b.omschrijving}</div>
              <div style={{ color: KLEUR.subtekst }}>{b.groepLabel}</div>
              <div>{datum(b.aanschafdatum)}</div>
              <div style={{ textAlign: "right" }}>{geld(b.aanschafwaarde)}</div>
              <div style={{ textAlign: "right", fontWeight: 600, color: b.volledigAfgeschreven ? KLEUR.mutedTekst : KLEUR.tekst }}>
                {geld(b.boekwaardeNu)}{b.volledigAfgeschreven && <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, display: "block", fontWeight: 500 }}>Volledig afgeschreven</span>}
              </div>
              <div>
                <NietMeerInBezitActie b={b} accountId={accountId} alleenLezen={alleenLezen} onBijgewerkt={bijgewerkt} />
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: OVERZICHT_KOLOMMEN, padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, fontWeight: 700, background: KLEUR.lichtblauw }}>
            <div>Totaal</div><div /><div /><div /><div style={{ textAlign: "right" }}>{geld(totaalBoekwaarde)}</div><div />
          </div>
        </div>
      )}
    </div>
  );
}

function ActivastaatTab({ items }) {
  const perGroep = useMemo(() => {
    const m = new Map();
    for (const b of items) {
      if (!m.has(b.groepLabel)) m.set(b.groepLabel, []);
      m.get(b.groepLabel).push(b);
    }
    return [...m.entries()];
  }, [items]);

  if (items.length === 0) return <LegeStaat tekst="Geen bezittingen gevonden." />;

  return (
    <div>
      {perGroep.map(([groep, lijst]) => {
        const subtotaalAanschaf = lijst.reduce((s, b) => s + b.aanschafwaarde, 0);
        const subtotaalBoekwaarde = lijst.reduce((s, b) => s + b.boekwaardeNu, 0);
        return (
          <div key={groep} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst, marginBottom: 6 }}>{groep}</div>
            <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
              {lijst.map((b, i) => (
                <div key={b.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "8px 14px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, fontSize: 13 }}>
                  <div>{b.omschrijving}</div>
                  <div style={{ textAlign: "right" }}>{geld(b.aanschafwaarde)}</div>
                  <div style={{ textAlign: "right", fontWeight: 600 }}>{geld(b.boekwaardeNu)}</div>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "8px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 12.5, fontWeight: 700, background: KLEUR.lichtblauw }}>
                <div>Subtotaal</div>
                <div style={{ textAlign: "right" }}>{geld(subtotaalAanschaf)}</div>
                <div style={{ textAlign: "right" }}>{geld(subtotaalBoekwaarde)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AfschrijvingenTab({ accountId }) {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const huidig = new Date().getFullYear();
  const { status, items, foutmelding } = useBezittingen(accountId, jaar);
  const totaal = items.reduce((s, b) => s + (b.afschrijvingDitJaar?.afschrijving || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select value={jaar} onChange={(e) => setJaar(Number(e.target.value))} style={{ padding: "7px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13 }}>
          {[huidig, huidig - 1, huidig - 2, huidig - 3, huidig - 4].map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>
      {status === "laden" && <LegeStaat tekst="Afschrijvingen ophalen…" />}
      {status === "fout" && <Melding tekst={foutmelding} />}
      {status === "klaar" && (
        items.length === 0 ? <LegeStaat tekst="Geen bezittingen gevonden." /> : (
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
              <div>Bezitting</div><div style={{ textAlign: "right" }}>Boekwaarde begin</div><div style={{ textAlign: "right" }}>Afschrijving {jaar}</div><div style={{ textAlign: "right" }}>Boekwaarde eind</div>
            </div>
            {items.map((b) => (
              <div key={b.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "9px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13 }}>
                <div>{b.omschrijving}</div>
                <div style={{ textAlign: "right" }}>{geld(b.afschrijvingDitJaar?.beginboekwaarde)}</div>
                <div style={{ textAlign: "right", color: KLEUR.rood }}>{geld(b.afschrijvingDitJaar?.afschrijving)}</div>
                <div style={{ textAlign: "right", fontWeight: 600 }}>{geld(b.afschrijvingDitJaar?.eindboekwaarde)}</div>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, fontWeight: 700, background: KLEUR.lichtblauw }}>
              <div>Totaal afschrijving {jaar}</div><div /><div style={{ textAlign: "right", color: KLEUR.rood }}>{geld(totaal)}</div><div />
            </div>
          </div>
        )
      )}
    </div>
  );
}

function BezittingenInhoud({ account, alleenLezen }) {
  const [subtab, setSubtab] = useState("overzicht");
  const { status, items, setItems, foutmelding } = useBezittingen(account.accountId, null);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSubtab(key)} style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 8,
            border: `1px solid ${subtab === key ? KLEUR.blauw : KLEUR.rand}`, cursor: "pointer",
            background: subtab === key ? KLEUR.blauw : "#fff", color: subtab === key ? "#fff" : KLEUR.subtekst,
            fontSize: 13, fontWeight: 600,
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {status === "laden" && <LegeStaat tekst="Bezittingen ophalen…" />}
      {status === "fout" && <Melding tekst={foutmelding} />}
      {status === "klaar" && subtab === "overzicht" && <OverzichtTab items={items} accountId={account.accountId} setItems={setItems} alleenLezen={alleenLezen} />}
      {status === "klaar" && subtab === "activastaat" && <ActivastaatTab items={items} />}
      {subtab === "afschrijvingen" && <AfschrijvingenTab accountId={account.accountId} />}

      {alleenLezen && (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 14 }}>Je bekijkt dit alleen-lezen namens de klant.</div>
      )}
    </div>
  );
}

/** Module-root: per gekoppeld klantaccount de volle activastaat of een aanvraagkaart, zelfde
 * account-kiezer-opzet als RapportagesModule.jsx. */
export default function BezittingenModule({ accounts, prijs = 5, alleenLezen = false }) {
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
        <Boxes size={17} color={KLEUR.blauw} /> Bezittingen
      </div>
      {accounts.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {accounts.map((a) => (
            <button key={a.accountId} onClick={() => setGekozenId(a.accountId)} style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${a.accountId === gekozenId ? KLEUR.blauw : KLEUR.rand}`,
              background: a.accountId === gekozenId ? KLEUR.blauw : "#fff",
              color: a.accountId === gekozenId ? "#fff" : KLEUR.subtekst,
            }}>
              {a.klantnaam}
            </button>
          ))}
        </div>
      )}
      {account.bezittingenIngeschakeld
        ? <BezittingenInhoud account={account} alleenLezen={alleenLezen} />
        : <BezittingenNietActief account={account} prijs={prijs} />}
    </div>
  );
}
