import { useState } from "react";
import { ChevronDown, Clock, FileText, Lock, Search } from "lucide-react";

/** Zelfde palet/kaartstijl als de Facturatie-tab (bewust hier herhaald, zie FacturatieModule.jsx —
 *  deze module volgt bewust dezelfde lay-out: zoekveld + Actief/Niet-actief-secties met
 *  inklapbare rijen per klantaccount, i.p.v. de eenvoudiger pil-kiezer van bijv. Bezittingen). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259",
  mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const kaartStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 16, background: "#fff" };
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };
const sectieKopStijl = { fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "0 0 8px" };

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

/** Aanvraagkaart — zelfde opzet/stijl als FunctiesOverzicht/UrenNietActief in FacturatieModule.jsx. */
function ContractenNietActief({ account, prijs }) {
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
    <div style={{ ...kaartStijl, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Lock size={15} color={KLEUR.mutedTekst} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>Contracten nog niet actief voor dit klantaccount</div>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "6px 0 16px", maxWidth: 560 }}>
        Registreer je eigen doorlopende contracten (verzekeringen, telefonie en overig) en ontvang op tijd een
        herinnering voordat een contract afloopt. Deze functie kost <strong>{geld(prijs)} per maand</strong> per
        administratie.
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
    <div style={kaartStijl}>
      <LegeStaat tekst="Contracten wordt binnenkort beschikbaar. Deze module staat al aan voor dit klantaccount." />
      {alleenLezen && (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4, textAlign: "center" }}>Je bekijkt dit alleen-lezen namens de klant.</div>
      )}
    </div>
  );
}

/** Korte intro boven de sectie "Niet actief" bij meerdere klantaccounts — zelfde patroon als
 *  FacturatiemoduleUitlegBanner in FacturatieModule.jsx. */
function ContractenUitlegBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", marginBottom: 10,
      background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 10,
    }}>
      <Lock size={15} color={KLEUR.mutedTekst} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
        <strong style={{ color: KLEUR.tekst }}>Contracten is beschikbaar voor deze administraties.</strong>{" "}
        Klap een administratie open om de module aan te vragen.
      </div>
    </div>
  );
}

/** Module-root: per gekoppeld klantaccount de contractenlijst (of nog een aanvraagkaart/
 *  placeholder) — zelfde zoekveld + Actief/Niet-actief-indeling met inklapbare rijen als de
 *  Facturatie-tab (FacturatieModule.jsx), i.p.v. de eenvoudigere pil-kiezer van bijv. Bezittingen. */
export default function ContractenModule({ accounts, prijs = 2.5, alleenLezen = false }) {
  const [openAccountId, setOpenAccountId] = useState(accounts.length === 1 ? accounts[0]?.accountId : null);
  const [zoek, setZoek] = useState("");

  if (accounts.length === 0) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  // Eén klantaccount: geen lijst/sectie-indeling nodig — direct de volle module of de
  // aanvraagkaart tonen, zelfde regel als FacturatieModule.
  if (accounts.length === 1) {
    const acc = accounts[0];
    return acc.contractenIngeschakeld
      ? <ContractenInhoud alleenLezen={alleenLezen} />
      : <ContractenNietActief account={acc} prijs={prijs} />;
  }

  const term = zoek.trim().toLowerCase();
  const lijst = accounts.filter((a) =>
    !term || [a.klantnaam, String(a.klantnummer ?? "")].filter(Boolean).some((v) => v.toLowerCase().includes(term))
  );

  const renderAccountRij = (acc, i) => {
    const open = openAccountId === acc.accountId;
    return (
      <div key={acc.accountId} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
        <button
          onClick={() => setOpenAccountId(open ? null : acc.accountId)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", background: open ? KLEUR.lichtblauw : "#fff",
            border: "none", cursor: "pointer", textAlign: "left", color: KLEUR.tekst,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.blauw, minWidth: 52, flexShrink: 0 }}>
            {acc.klantnummer || "—"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {acc.klantnaam}
          </span>
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        {open && (
          <div style={{ padding: "16px" }}>
            {acc.contractenIngeschakeld
              ? <ContractenInhoud alleenLezen={alleenLezen} />
              : <ContractenNietActief account={acc} prijs={prijs} />}
          </div>
        )}
      </div>
    );
  };

  const actieveAccounts = lijst.filter((a) => a.contractenIngeschakeld);
  const nietActieveAccounts = lijst.filter((a) => !a.contractenIngeschakeld);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        <FileText size={17} color={KLEUR.blauw} /> Contracten
      </div>

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 360 }}>
        <Search size={16} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek op klantnummer of naam…"
          style={{ ...inputStijl, padding: "10px 12px 10px 36px" }}
        />
      </div>

      {lijst.length === 0 && (
        <div style={{ padding: "18px 16px", fontSize: 13, color: KLEUR.mutedTekst }}>Geen klanten gevonden voor "{zoek}".</div>
      )}

      {actieveAccounts.length > 0 && (
        <div style={{ marginBottom: nietActieveAccounts.length > 0 ? 24 : 0 }}>
          <div style={sectieKopStijl}>Actief ({actieveAccounts.length})</div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            {actieveAccounts.map(renderAccountRij)}
          </div>
        </div>
      )}

      {nietActieveAccounts.length > 0 && (
        <div>
          <div style={sectieKopStijl}>Niet actief ({nietActieveAccounts.length})</div>
          <ContractenUitlegBanner />
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            {nietActieveAccounts.map(renderAccountRij)}
          </div>
        </div>
      )}
    </div>
  );
}
