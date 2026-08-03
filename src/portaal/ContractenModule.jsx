import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronDown, Clock, FileText, Lock, Search, Plus, Trash2, Download, Eye,
  Paperclip, Pencil, ArrowLeft, AlertTriangle,
} from "lucide-react";

/** Zelfde palet/kaartstijl als de Facturatie-tab (bewust hier herhaald, zie FacturatieModule.jsx —
 *  deze module volgt bewust dezelfde lay-out: zoekveld + Actief/Niet-actief-secties met
 *  inklapbare rijen per klantaccount, i.p.v. de eenvoudiger pil-kiezer van bijv. Bezittingen).
 *
 * Contractenlijst per account (04-08-2026, weer later die dag): op verzoek van Wouter kreeg de
 * medewerkerskant (src/medewerker/ContractenOverzicht.jsx) een echte sorteerbare tabel met
 * kolomkoppen, conform Contactpersonen — daarna vroeg hij expliciet "ik wil in klantenportaal
 * dezelfde interfase zien". <ContractenInhoud> (de contractenlijst van één administratie) is
 * daarom naar hetzelfde patroon herbouwd: een <table> met sorteerbare kolomkoppen, een
 * "Kolommen ▾"-kolomkiezer, een "Filters ▾"-statusfilter en een telregel, en klikken op een rij
 * opent nu een volledige detailweergave (<ContractDetail>, met "← Terug"-knop) i.p.v. de rij
 * inline uit te klappen. Bewust ANDERS dan de medewerkerskant: geen klant/klantgroep-kolommen
 * (deze lijst is al gescoped op één administratie) en de statusfilter staat hier standaard op
 * "Alles" i.p.v. "Binnenkort" — een klant heeft doorgaans maar een handvol eigen contracten, dus
 * er is geen reden om er standaard een deel van te verbergen. De rest (aanmaken/bewerken via
 * <ContractFormulier>, documenten via <ContractDocumenten>, de per-account accordeon bij meerdere
 * administraties) blijft ongewijzigd.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259",
  mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
  amber: "#A9660C", amberAchtergrond: "#FFF4E5",
};
const kaartStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 16, background: "#fff" };
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".02em" };
const sectieKopStijl = { fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "0 0 8px" };

// Contracttypes zijn sinds 04-08-2026 beheerbaar in Beheer → Facturatie → Contracttypes
// (api/_gedeeld/contractenTypes.js, opgehaald via /api/contracten-typeopties) i.p.v. een vaste
// lijst — TYPES_FALLBACK hieronder is alleen nog de terugval zolang die aanroep nog laadt of
// (bijv. bij een storing) mislukt, zodat het formulier nooit zonder keuzes komt te staan.
const TYPES_FALLBACK = [
  { waarde: "verzekering", label: "Verzekering" },
  { waarde: "telefonie", label: "Telefonie" },
  { waarde: "internet", label: "Internet" },
  { waarde: "software", label: "Software" },
  { waarde: "lease", label: "Lease" },
  { waarde: "overig", label: "Overig" },
];
// Frequenties blijven wél een vaste lijst (niet gevraagd om uit te breiden).
const FREQUENTIES = [
  { waarde: "", label: "— geen —" },
  { waarde: "maandelijks", label: "Maandelijks" },
  { waarde: "kwartaal", label: "Per kwartaal" },
  { waarde: "jaarlijks", label: "Jaarlijks" },
  { waarde: "eenmalig", label: "Eenmalig" },
];

function typeLabel(waarde, opties) {
  return (opties || TYPES_FALLBACK).find((t) => t.waarde === waarde)?.label || waarde || "—";
}

/** Haalt de actieve contracttype-lijst op; valt terug op TYPES_FALLBACK zolang dat nog niet is
 *  gelukt, zie de toelichting hierboven. */
function useTypeOpties() {
  const [opties, setOpties] = useState(TYPES_FALLBACK);
  useEffect(() => {
    let actief = true;
    fetch("/api/contracten-typeopties")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const lijst = (d.typen || []).map((t) => ({ waarde: t.sleutel, label: t.label }));
        if (actief && lijst.length) setOpties(lijst);
      })
      .catch(() => {});
    return () => { actief = false; };
  }, []);
  return opties;
}
function geld(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
function datumInputWaarde(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}
function grootteTekst(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
/** Aantal dagen tot de einddatum (negatief = al verlopen), of null zonder einddatum. */
function dagenTot(einddatum) {
  if (!einddatum) return null;
  const eind = new Date(einddatum);
  if (isNaN(eind.getTime())) return null;
  eind.setHours(0, 0, 0, 0);
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((eind.getTime() - vandaag.getTime()) / 86400000);
}
function verloopBadge(einddatum) {
  const dagen = dagenTot(einddatum);
  if (dagen == null) return { tekst: "Geen einddatum", kleur: KLEUR.mutedTekst, achtergrond: "#F2F3F0" };
  if (dagen < 0) return { tekst: "Verlopen", kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 30) return { tekst: `Verloopt over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`, kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 90) return { tekst: `Verloopt over ${dagen} dagen`, kleur: KLEUR.amber, achtergrond: KLEUR.amberAchtergrond };
  return { tekst: `Verloopt over ${dagen} dagen`, kleur: KLEUR.groen, achtergrond: "#EAF6EE" };
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
function leesAlsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Knop({ children, onClick, variant = "secundair", disabled, type = "button", title }) {
  const varianten = {
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    secundair: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
    gevaar: { background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}55` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={{
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
// Zelfde stijl als de "Kolommen ▾"/"Filters ▾"-knoppen en tabelkoppen in het medewerkersoverzicht
// (src/medewerker/ContractenOverzicht.jsx) en ContactpersonenOverzicht.jsx.
const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

/** Zelfde "Toon: 25/50/.../Alle"-kiezer als elders in het portaal (bewust hier herhaald —
 *  standalone bestand). */
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

const STATUS_FILTERS = [
  { key: "alles", label: "Alles" },
  { key: "binnenkort", label: "Verloopt binnen 90 dagen" },
  { key: "verlopen", label: "Verlopen" },
];
// Bewust "alles" i.p.v. "binnenkort" — zie de toelichting bovenaan het bestand.
const STATUS_STANDAARD = "alles";

/** Kolommen van de contractentabel — zelfde KOLOMMEN-patroon als het medewerkersoverzicht en
 *  Contactpersonen. `standaard: false` betekent wel beschikbaar, maar standaard uit (aan te
 *  zetten via "Kolommen ▾"). */
const KOLOM_DEFINITIES = [
  { key: "type", label: "Type", standaard: true },
  { key: "contract", label: "Contract", standaard: true },
  { key: "contractnummer", label: "Contractnummer", standaard: false },
  { key: "waarde", label: "Waarde", standaard: true },
  { key: "ingangsdatum", label: "Ingangsdatum", standaard: false },
  { key: "einddatum", label: "Einddatum", standaard: true },
  { key: "status", label: "Status", standaard: true },
  { key: "frequentie", label: "Frequentie", standaard: false },
  { key: "verlenging", label: "Auto. verlenging", standaard: false },
];

function tekstVoorKolom(key, c, typeOpties) {
  switch (key) {
    case "type": return typeLabel(c.type, typeOpties);
    case "contract": return [c.naam, c.leverancier].filter(Boolean).join(" — ");
    case "contractnummer": return c.contractnummer || "";
    case "waarde": return c.bedrag != null ? geld(c.bedrag) : "";
    case "ingangsdatum": return datum(c.ingangsdatum);
    case "einddatum": return datum(c.einddatum);
    case "status": return verloopBadge(c.einddatum).tekst;
    case "frequentie": return FREQUENTIES.find((f) => f.waarde === c.frequentie)?.label || "";
    case "verlenging": return c.automatischeVerlenging ? "Ja" : "Nee";
    default: return "";
  }
}

/** Sorteerwaarde per kolom — voor bedrag/datums/status een echt getal (chronologisch/numeriek
 *  correct) i.p.v. alfabetisch op de geformatteerde tekst. */
function sorteerWaardeVoorKolom(key, c, typeOpties) {
  switch (key) {
    case "waarde": return Number(c.bedrag) || 0;
    case "ingangsdatum": return c.ingangsdatum ? new Date(c.ingangsdatum).getTime() : 0;
    case "einddatum": return c.einddatum ? new Date(c.einddatum).getTime() : Infinity;
    case "status": { const d = dagenTot(c.einddatum); return d == null ? Infinity : d; }
    default: return tekstVoorKolom(key, c, typeOpties).toLowerCase();
  }
}

function vergelijkWaarden(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "nl", { numeric: true, sensitivity: "base" });
}

/** Eigen celweergave voor Type (badge) en Status (gekleurde badge + waarschuwingsicoon binnen
 *  30 dagen) — de rest is platte tekst via tekstVoorKolom(). */
function ContractCel({ kolKey, c, typeOpties }) {
  if (kolKey === "type") {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>
        {typeLabel(c.type, typeOpties)}
      </span>
    );
  }
  if (kolKey === "status") {
    const badge = verloopBadge(c.einddatum);
    const dagen = dagenTot(c.einddatum);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        {dagen != null && dagen <= 30 && <AlertTriangle size={13} color={KLEUR.rood} style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: badge.kleur, background: badge.achtergrond, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
          {badge.tekst}
        </span>
      </span>
    );
  }
  const t = tekstVoorKolom(kolKey, c, typeOpties);
  return t ? <span>{t}</span> : <span style={{ color: KLEUR.mutedTekst }}>—</span>;
}

/** Volledige details van één contract — vervangt de lijst zodra er op een rij geklikt wordt,
 *  zelfde patroon als ContractDetail in het medewerkersoverzicht (en ContactpersoonDetail in
 *  ContactpersonenOverzicht.jsx). */
function ContractDetail({ contract: c, accountId, typeOpties, alleenLezen, onTerug, onBewerken }) {
  const badge = verloopBadge(c.einddatum);
  return (
    <div>
      <button
        onClick={onTerug}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 14 }}
      >
        <ArrowLeft size={15} /> Terug naar contracten
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{c.naam}{c.leverancier ? ` — ${c.leverancier}` : ""}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, padding: "3px 8px", borderRadius: 5 }}>
          {typeLabel(c.type, typeOpties)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: badge.kleur, background: badge.achtergrond, padding: "3px 9px", borderRadius: 20 }}>
          {badge.tekst}
        </span>
      </div>

      <div style={{ ...kaartStijl, marginBottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 12.5 }}>
          <div><span style={{ color: KLEUR.mutedTekst }}>Contractnummer:</span> {c.contractnummer || "—"}</div>
          <div><span style={{ color: KLEUR.mutedTekst }}>Ingangsdatum:</span> {datum(c.ingangsdatum)}</div>
          <div><span style={{ color: KLEUR.mutedTekst }}>Einddatum:</span> {datum(c.einddatum)}</div>
          <div><span style={{ color: KLEUR.mutedTekst }}>Opzegtermijn:</span> {c.opzegtermijnDagen != null ? `${c.opzegtermijnDagen} dagen` : "—"}</div>
          <div><span style={{ color: KLEUR.mutedTekst }}>Frequentie:</span> {FREQUENTIES.find((f) => f.waarde === c.frequentie)?.label || "—"}</div>
          <div><span style={{ color: KLEUR.mutedTekst }}>Bedrag:</span> {c.bedrag != null ? geld(c.bedrag) : "—"}</div>
          <div><span style={{ color: KLEUR.mutedTekst }}>Automatische verlenging:</span> {c.automatischeVerlenging ? "Ja" : "Nee"}</div>
        </div>
        {c.opmerkingen && (
          <div style={{ fontSize: 12.5, marginTop: 10, whiteSpace: "pre-wrap" }}>
            <span style={{ color: KLEUR.mutedTekst }}>Opmerkingen:</span> {c.opmerkingen}
          </div>
        )}
        {!alleenLezen && (
          <div style={{ marginTop: 14 }}>
            <Knop variant="secundair" onClick={onBewerken}><Pencil size={13} /> Bewerken</Knop>
          </div>
        )}
        <ContractDocumenten accountId={accountId} contractId={c.id} alleenLezen={alleenLezen} />
      </div>
    </div>
  );
}

function AlleenLezenBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16,
      background: "#FFF4E5", border: "1px solid #E8C27A", borderRadius: 10, fontSize: 12.5, color: "#8A5A00",
    }}>
      <Eye size={14} style={{ flexShrink: 0 }} />
      Alleen-lezen weergave — contracten en documenten kunnen hier niet aangemaakt, gewijzigd of geüpload/verwijderd worden.
    </div>
  );
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

/** Bewerk-/aanmaakformulier voor één contract. */
function ContractFormulier({ bestaand, onOpslaan, onAnnuleren, bezig, fout, typeOpties }) {
  const opties = typeOpties && typeOpties.length ? typeOpties : TYPES_FALLBACK;
  const [waarden, setWaarden] = useState(() => ({
    type: bestaand?.type || opties[0]?.waarde || "verzekering",
    naam: bestaand?.naam || "",
    leverancier: bestaand?.leverancier || "",
    contractnummer: bestaand?.contractnummer || "",
    ingangsdatum: datumInputWaarde(bestaand?.ingangsdatum),
    einddatum: datumInputWaarde(bestaand?.einddatum),
    opzegtermijnDagen: bestaand?.opzegtermijnDagen != null ? String(bestaand.opzegtermijnDagen) : "",
    automatischeVerlenging: bestaand ? !!bestaand.automatischeVerlenging : true,
    frequentie: bestaand?.frequentie || "",
    bedrag: bestaand?.bedrag != null ? String(bestaand.bedrag) : "",
    opmerkingen: bestaand?.opmerkingen || "",
  }));

  const zet = (veld) => (e) => {
    const waarde = e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setWaarden((w) => ({ ...w, [veld]: waarde }));
  };

  const versturen = (e) => {
    e.preventDefault();
    onOpslaan({
      type: waarden.type,
      naam: waarden.naam.trim(),
      leverancier: waarden.leverancier.trim(),
      contractnummer: waarden.contractnummer.trim(),
      ingangsdatum: waarden.ingangsdatum || null,
      einddatum: waarden.einddatum || null,
      opzegtermijnDagen: waarden.opzegtermijnDagen === "" ? null : Number(waarden.opzegtermijnDagen),
      automatischeVerlenging: waarden.automatischeVerlenging,
      frequentie: waarden.frequentie || null,
      bedrag: waarden.bedrag === "" ? null : Number(waarden.bedrag),
      opmerkingen: waarden.opmerkingen.trim(),
    });
  };

  return (
    <form onSubmit={versturen} style={{ ...kaartStijl, background: KLEUR.lichtblauw, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}>
        {bestaand ? "Contract bewerken" : "Nieuw contract"}
      </div>
      <Melding tekst={fout} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStijl}>Type *</label>
          <select value={waarden.type} onChange={zet("type")} style={inputStijl} required>
            {opties.map((t) => <option key={t.waarde} value={t.waarde}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStijl}>Naam *</label>
          <input value={waarden.naam} onChange={zet("naam")} style={inputStijl} required placeholder="Bijv. Autoverzekering" />
        </div>
        <div>
          <label style={labelStijl}>Leverancier</label>
          <input value={waarden.leverancier} onChange={zet("leverancier")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Contractnummer</label>
          <input value={waarden.contractnummer} onChange={zet("contractnummer")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Ingangsdatum</label>
          <input type="date" value={waarden.ingangsdatum} onChange={zet("ingangsdatum")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Einddatum</label>
          <input type="date" value={waarden.einddatum} onChange={zet("einddatum")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Opzegtermijn (dagen)</label>
          <input type="number" min="0" value={waarden.opzegtermijnDagen} onChange={zet("opzegtermijnDagen")} style={inputStijl} placeholder="Bijv. 30" />
        </div>
        <div>
          <label style={labelStijl}>Frequentie</label>
          <select value={waarden.frequentie} onChange={zet("frequentie")} style={inputStijl}>
            {FREQUENTIES.map((f) => <option key={f.waarde} value={f.waarde}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStijl}>Bedrag</label>
          <input type="number" min="0" step="0.01" value={waarden.bedrag} onChange={zet("bedrag")} style={inputStijl} placeholder="0,00" />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: KLEUR.tekst, cursor: "pointer" }}>
            <input type="checkbox" checked={waarden.automatischeVerlenging} onChange={zet("automatischeVerlenging")} />
            Verlengt automatisch
          </label>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStijl}>Opmerkingen</label>
        <textarea value={waarden.opmerkingen} onChange={zet("opmerkingen")} rows={2} style={{ ...inputStijl, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Knop variant="primair" type="submit" disabled={bezig}>{bezig ? "Bezig…" : "Opslaan"}</Knop>
        <Knop variant="secundair" type="button" onClick={onAnnuleren} disabled={bezig}>Annuleren</Knop>
      </div>
    </form>
  );
}

/** Documenten (bijlagen) bij één contract — Stap 4-endpoints, hier voor het eerst vanuit de UI gebruikt. */
function ContractDocumenten({ accountId, contractId, alleenLezen }) {
  const [documenten, setDocumenten] = useState(null);
  const [fout, setFout] = useState("");
  const [uploadBezig, setUploadBezig] = useState(false);

  const laad = useCallback(() => {
    fetch(`/api/contracten-documenten?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}`)
      .then(haalJson)
      .then((d) => setDocumenten(d.documenten || []))
      .catch(() => setFout("Documenten konden niet worden opgehaald."));
  }, [accountId, contractId]);

  useEffect(() => { laad(); }, [laad]);

  const upload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setFout("");
    setUploadBezig(true);
    try {
      const dataUrl = await leesAlsDataUrl(file);
      await haalJson(await fetch("/api/contracten-documenten", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, contractId, bestandsnaam: file.name, dataUrl }),
      }));
      laad();
    } catch (err) {
      setFout(err.message || "Uploaden is niet gelukt.");
    } finally {
      setUploadBezig(false);
    }
  };

  const verwijder = async (doc) => {
    if (!window.confirm(`"${doc.bestandsnaam}" verwijderen?`)) return;
    setFout("");
    try {
      await haalJson(await fetch(`/api/contracten-documenten?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}&id=${encodeURIComponent(doc.id)}`, { method: "DELETE" }));
      laad();
    } catch (err) {
      setFout(err.message || "Verwijderen is niet gelukt.");
    }
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, display: "flex", alignItems: "center", gap: 6 }}>
          <Paperclip size={13} /> Documenten {documenten ? `(${documenten.length})` : ""}
        </div>
        {!alleenLezen && (
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 7,
            fontSize: 12, fontWeight: 600, cursor: uploadBezig ? "default" : "pointer", opacity: uploadBezig ? 0.6 : 1,
            background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`,
          }}>
            {uploadBezig ? "Bezig…" : "Bestand toevoegen"}
            <input type="file" onChange={upload} disabled={uploadBezig} style={{ display: "none" }} />
          </label>
        )}
      </div>
      <Melding tekst={fout} />
      {documenten === null && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Laden…</div>}
      {documenten && documenten.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen documenten.</div>}
      {documenten && documenten.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {documenten.map((doc) => (
            <div key={doc.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
              border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff",
            }}>
              <FileText size={14} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.bestandsnaam}</div>
                <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{grootteTekst(doc.grootte)} · {datum(doc.geuploadOp)}</div>
              </div>
              <a
                href={`/api/contracten-documenten?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}&id=${encodeURIComponent(doc.id)}`}
                target="_blank" rel="noopener noreferrer" title="Downloaden"
                style={{ color: KLEUR.blauw, display: "flex", alignItems: "center" }}
              >
                <Download size={15} />
              </a>
              {!alleenLezen && (
                <button onClick={() => verwijder(doc)} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex", alignItems: "center" }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** De echte contracteninhoud voor één klantaccount: lijst (tabel) + aanmaken/bewerken + documenten. */
function ContractenInhoud({ accountId, alleenLezen }) {
  const typeOpties = useTypeOpties();
  const [contracten, setContracten] = useState(null);
  const [fout, setFout] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [detail, setDetail] = useState(null); // gekozen contract → detailweergave
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [opslaanFout, setOpslaanFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState(STATUS_STANDAARD);
  const [zichtbaar, setZichtbaar] = useState(() => new Set(KOLOM_DEFINITIES.filter((k) => k.standaard).map((k) => k.key)));
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState("einddatum");
  const [sortDir, setSortDir] = useState("asc");
  const [toonAantal, setToonAantal] = useState(25);

  const toggleKolom = (key) => setZichtbaar((h) => {
    const n = new Set(h);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const sorteerOp = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const laad = useCallback(() => {
    fetch(`/api/contracten-klanten?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => setContracten(d.contracten || []))
      .catch(() => setFout("Contracten konden niet worden opgehaald."));
  }, [accountId]);

  useEffect(() => { laad(); }, [laad]);

  const opslaan = async (payload) => {
    setOpslaanBezig(true);
    setOpslaanFout("");
    try {
      if (bewerkId) {
        await haalJson(await fetch("/api/contracten-klanten", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, id: bewerkId, ...payload }),
        }));
      } else {
        await haalJson(await fetch("/api/contracten-klanten", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, ...payload }),
        }));
      }
      setNieuwOpen(false);
      setBewerkId(null);
      laad();
    } catch (err) {
      setOpslaanFout(err.message || "Opslaan is niet gelukt.");
    } finally {
      setOpslaanBezig(false);
    }
  };

  const zichtKols = KOLOM_DEFINITIES.filter((k) => zichtbaar.has(k.key));

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return (contracten || []).filter((c) => {
      if (term) {
        const raak = [c.naam, c.leverancier, c.contractnummer, typeLabel(c.type, typeOpties)].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
        if (!raak) return false;
      }
      const dagen = dagenTot(c.einddatum);
      if (filter === "binnenkort") return dagen != null && dagen <= 90;
      if (filter === "verlopen") return dagen != null && dagen < 0;
      return true;
    });
  }, [contracten, zoek, filter, typeOpties]);

  const gesorteerd = useMemo(() => {
    const richting = sortDir === "asc" ? 1 : -1;
    return [...gefilterd].sort((a, b) => vergelijkWaarden(sorteerWaardeVoorKolom(sortKey, a, typeOpties), sorteerWaardeVoorKolom(sortKey, b, typeOpties)) * richting);
  }, [gefilterd, sortKey, sortDir, typeOpties]);

  const zichtbareRijen = toonAantal === Infinity ? gesorteerd : gesorteerd.slice(0, toonAantal);
  const filtersActief = filter !== STATUS_STANDAARD;

  if (contracten === null) return <LegeStaat tekst="Contracten laden…" />;

  const bewerkContract = bewerkId ? contracten.find((c) => c.id === bewerkId) : null;

  // Aanmaken/bewerken heeft voorrang op de lijst en de detailweergave.
  if (nieuwOpen || bewerkContract) {
    return (
      <div>
        {alleenLezen && <AlleenLezenBanner />}
        <Melding tekst={fout} />
        <ContractFormulier
          bestaand={bewerkContract}
          typeOpties={typeOpties}
          bezig={opslaanBezig}
          fout={opslaanFout}
          onAnnuleren={() => { setNieuwOpen(false); setBewerkId(null); setOpslaanFout(""); }}
          onOpslaan={opslaan}
        />
      </div>
    );
  }

  if (detail) {
    return (
      <div>
        {alleenLezen && <AlleenLezenBanner />}
        <Melding tekst={fout} />
        <ContractDetail
          contract={detail}
          accountId={accountId}
          typeOpties={typeOpties}
          alleenLezen={alleenLezen}
          onTerug={() => setDetail(null)}
          onBewerken={() => { setBewerkId(detail.id); setDetail(null); setOpslaanFout(""); }}
        />
      </div>
    );
  }

  return (
    <div>
      {alleenLezen && <AlleenLezenBanner />}
      <Melding tekst={fout} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op naam, leverancier of type…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 200 }}>
                {KOLOM_DEFINITIES.map((kol) => (
                  <label key={kol.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={zichtbaar.has(kol.key)} onChange={() => toggleKolom(kol.key)} />
                    {kol.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setFiltersOpen((o) => !o)} style={{ ...selectStijl, color: filtersActief ? KLEUR.blauw : KLEUR.tekst, fontWeight: filtersActief ? 700 : 400 }}>
            Filters {filtersOpen ? "▴" : "▾"}
          </button>
          {filtersOpen && (
            <>
              <div onClick={() => setFiltersOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 12, width: 240 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Status</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {STATUS_FILTERS.map((f) => (
                    <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                      <input type="radio" name={`klant-contracten-status-${accountId}`} checked={filter === f.key} onChange={() => setFilter(f.key)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {(filtersActief || zoek) && (
          <button
            onClick={() => { setFilter(STATUS_STANDAARD); setZoek(""); }}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Filters wissen
          </button>
        )}

        {!alleenLezen && (
          <Knop variant="primair" onClick={() => setNieuwOpen(true)}><Plus size={14} /> Nieuw contract</Knop>
        )}
      </div>

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
        {gefilterd.length} {gefilterd.length === 1 ? "contract" : "contracten"}
      </div>

      {contracten.length === 0 && (
        <LegeStaat tekst={alleenLezen ? "Nog geen contracten geregistreerd." : "Nog geen contracten geregistreerd. Klik op \"Nieuw contract\" om te beginnen."} />
      )}

      {contracten.length > 0 && gefilterd.length === 0 && (
        <LegeStaat tekst="Geen contracten gevonden voor dit filter." />
      )}

      {zichtbareRijen.length > 0 && (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(520, zichtKols.length * 120) }}>
            <thead>
              <tr>
                {zichtKols.map((kol) => {
                  const actief = sortKey === kol.key;
                  return (
                    <th
                      key={kol.key}
                      onClick={() => sorteerOp(kol.key)}
                      title="Klik om te sorteren"
                      style={{ ...th, cursor: "pointer", userSelect: "none", color: actief ? KLEUR.blauw : th.color }}
                    >
                      {kol.label}{pijl(kol.key)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {zichtbareRijen.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setDetail(c)}
                  title="Klik om te openen"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = KLEUR.lichtblauw)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {zichtKols.map((kol) => (
                    <td key={kol.key} style={td}><ContractCel kolKey={kol.key} c={c} typeOpties={typeOpties} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gefilterd.length > 0 && <AantalKiezer aantal={toonAantal} setAantal={setToonAantal} totaal={gefilterd.length} />}
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

/** Module-root: per gekoppeld klantaccount de contractenlijst (of nog een aanvraagkaart) — zelfde
 *  zoekveld + Actief/Niet-actief-indeling met inklapbare rijen als de Facturatie-tab
 *  (FacturatieModule.jsx), i.p.v. de eenvoudigere pil-kiezer van bijv. Bezittingen. */
export default function ContractenModule({ accounts, prijs = 2.5, alleenLezen = false }) {
  const [openAccountId, setOpenAccountId] = useState(accounts.length === 1 ? accounts[0]?.accountId : null);
  const [zoek, setZoek] = useState("");

  if (accounts.length === 0) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  // Eén klantaccount: geen lijst/sectie-indeling nodig — direct de volle module of de
  // aanvraagkaart tonen, zelfde regel als FacturatieModule.
  if (accounts.length === 1) {
    const acc = accounts[0];
    return acc.contractenIngeschakeld
      ? <ContractenInhoud accountId={acc.accountId} alleenLezen={alleenLezen} />
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
              ? <ContractenInhoud accountId={acc.accountId} alleenLezen={alleenLezen} />
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
