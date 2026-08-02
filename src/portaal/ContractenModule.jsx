import { useEffect, useState } from "react";
import { Clock, FileText, Lock } from "lucide-react";

/** Zelfde palet als de rest van het klantportaal (bewust hier herhaald, zie BezittingenModule.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259",
  mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};

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

function Knop({ children, onClick, variant = "secundair", disabled }) {
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
      {children}
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

function ContractenNietActief({ account }) {
  const [status, setStatus] = useState(account.contractenAangevraagdOp ? "aangevraagd" : "idle");

  const vraagAan = async () => {
    setStatus("bezig");
    try {
      await haalJson(await fetch("/api/contracten-aanvraag", {
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
        <div style={{ fontSize: 14, fontWeight: 700 }}>Contracten nog niet actief voor dit klantaccount</div>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 560 }}>
        Registreer je eigen doorlopende contracten (verzekeringen, telefonie en overig) en ontvang op tijd een
        herinnering voordat een contract afloopt.
      </div>
      {status === "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} />
          Aangevraagd{account.contractenAangevraagdOp ? ` op ${datum(account.contractenAangevraagdOp)}` : ""} — we nemen contact met je op.
        </div>
      ) : (
        <Knop variant="primair" onClick={vraagAan} disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Vraag Contracten aan"}
        </Knop>
      )}
      {status === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="Aanvragen is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

/** Placeholder-inhoud zolang de daadwerkelijke registratie/CRUD (Stap 2 e.v. van het
 *  contractmanagement-plan) nog niet gebouwd is — voorkomt dat de tab een lege pagina toont
 *  zodra een account de module aan heeft staan. */
function ContractenInhoud({ alleenLezen }) {
  return (
    <div>
      <LegeStaat tekst="Contracten wordt binnenkort beschikbaar. Deze module staat al aan voor dit klantaccount." />
      {alleenLezen && (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4, textAlign: "center" }}>Je bekijkt dit alleen-lezen namens de klant.</div>
      )}
    </div>
  );
}

/** Module-root: per gekoppeld klantaccount straks de contractenlijst, of nu nog een
 *  aanvraagkaart/placeholder — zelfde account-kiezer-opzet als BezittingenModule.jsx. */
export default function ContractenModule({ accounts, alleenLezen = false }) {
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
        <FileText size={17} color={KLEUR.blauw} /> Contracten
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
      {account.contractenIngeschakeld
        ? <ContractenInhoud alleenLezen={alleenLezen} />
        : <ContractenNietActief account={account} />}
    </div>
  );
}
