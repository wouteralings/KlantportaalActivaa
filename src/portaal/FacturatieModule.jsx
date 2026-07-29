import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FileText, FileSpreadsheet, Package, Users, Settings, Plus, Send, Check, X,
  Trash2, Pencil, CreditCard, Bell, Sliders, ArrowLeft, ChevronDown, Search,
  Lock, Clock, Copy, Repeat, Download, Pause, Play, Mail, Eye,
} from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C",
  goud: "#B98237",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

const kaartStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 16, background: "#fff" };
const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4, marginTop: 10 };
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };
const sectieKopStijl = { fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "0 0 8px" };

const STATUS_LABEL = {
  concept: "Concept", verzonden: "Verzonden", geaccepteerd: "Geaccepteerd", afgewezen: "Afgewezen",
  betaald: "Betaald", verlopen: "Verlopen", geannuleerd: "Geannuleerd",
};
const STATUS_KLEUR = {
  concept: KLEUR.mutedTekst, verzonden: KLEUR.blauw, geaccepteerd: KLEUR.groen, betaald: KLEUR.groen,
  afgewezen: KLEUR.rood, verlopen: KLEUR.rood, geannuleerd: KLEUR.mutedTekst,
};

function geld(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}

/** Zijn de eigen bedrijfsgegevens (afzender) volledig genoeg om zinvol op een factuur/offerte
 * te tonen? Bedrijfsnaam, volledig adres en minstens één van KvK-/BTW-nummer. */
function bedrijfsgegevensCompleet(bg) {
  const g = bg || {};
  return !!(g.bedrijfsnaam && g.straat && g.huisnummer && g.postcode && g.plaats && (g.kvkNummer || g.btwNummer));
}

/** Vult opgeslagen bedrijfsgegevens aan met wat al uit Dynamics bekend is (bedrijfsnaam, adres,
 * KvK-/BTW-nummer, IBAN + tenaamstelling) voor elk veld dat zelf nog leeg is — nooit een al
 * opgeslagen/goedgekeurde eigen waarde overschrijven. Gebruikt voor zowel het voorvullen van het
 * Instellingen-formulier als (sinds 29-07-2026) de volledigheids-check en de factuur-/
 * offerteweergave, zodat die hetzelfde laten zien als Instellingen — ook vóórdat er ooit een
 * wijzigingsverzoek is ingediend/goedgekeurd (zie ook de automatische achtergrond-sync in
 * FacturatieAccountInhoud, die dit ook echt naar de eigen tabel wegschrijft). */
function vulBedrijfsgegevensAanMetCrm(data, account) {
  if (!data) return null;
  const a = account?.klantadres || {};
  return {
    ...data,
    bedrijfsnaam: data.bedrijfsnaam || account?.klantnaam || "",
    straat: data.straat || a.straat || "",
    huisnummer: data.huisnummer || a.huisnummer || "",
    toevoeging: data.toevoeging || a.toevoeging || "",
    postcode: data.postcode || a.postcode || "",
    plaats: data.plaats || a.plaats || "",
    land: data.land || a.land || "NL",
    kvkNummer: data.kvkNummer || account?.kvkNummer || "",
    btwNummer: data.btwNummer || account?.btwNummer || "",
    iban: data.iban || account?.iban || "",
    ibanTenaamstelling: data.ibanTenaamstelling || account?.ibanTenaamstelling || "",
    // CC-mailadres — sinds 29-07-2026 ook een vangnet naar/vanuit Dynamics (cr283_ccbijversturen),
    // zelfde reden als IBAN hierboven: mislukt het opslaan in de eigen tabel een keer, dan blijft
    // de eerder ingestelde waarde hier toch zichtbaar i.p.v. onterecht leeg te lijken.
    ccEmail: data.ccEmail || account?.ccEmail || "",
  };
}

// Velden die meetellen bij het bepalen of er nog CRM-bekende waarden zijn die nog niet in de
// eigen tabel staan (zie de achtergrond-sync in FacturatieAccountInhoud) — bewust zonder
// logoUrl/gewijzigdOp (die hebben geen Dynamics-tegenhanger) én zonder ccEmail: dat heeft sinds
// 29-07-2026 wél een Dynamics-tegenhanger (cr283_ccbijversturen), maar loopt bewust niet mee in
// déze goedkeuring-vereisende sync — ccEmail wordt direct zelf opgeslagen (geen verificatiegegeven,
// zie opslaanCcEmail hieronder), dat zou anders onterecht een wijzigingsverzoek ter goedkeuring
// aanmaken voor een veld dat helemaal geen goedkeuring nodig heeft.
const BEDRIJFSGEGEVENS_SYNC_VELDEN = [
  "bedrijfsnaam", "straat", "huisnummer", "toevoeging", "postcode", "plaats", "land",
  "kvkNummer", "btwNummer", "iban", "ibanTenaamstelling",
];

/** Getalveld (aantal/prijs) met Nederlandse duizendtal-notatie: tijdens het bewerken zie je de
 * ruwe waarde (zodat typen niet hinderlijk "springt"), zodra je het veld verlaat wordt het
 * genetjes opgemaakt (bijv. "10.250"). De onderliggende waarde blijft gewoon een normaal getal
 * (punt als decimaalteken) — alleen de weergave wordt verzorgd, niets aan het opslaan/rekenen
 * verandert hierdoor. */
function BedragInput({ waarde, onChange, decimalen = 2, style, ...props }) {
  const [bewerken, setBewerken] = useState(false);
  const getal = Number(waarde);
  const heeftGetal = waarde !== "" && waarde !== null && waarde !== undefined && !isNaN(getal);
  const weergave = bewerken
    ? (waarde ?? "")
    : heeftGetal
      ? new Intl.NumberFormat("nl-NL", { minimumFractionDigits: decimalen, maximumFractionDigits: 2 }).format(getal)
      : "";
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={weergave}
      onFocus={() => setBewerken(true)}
      onBlur={() => setBewerken(false)}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, "").replace(",", "."))}
      style={style}
    />
  );
}

async function haalJson(res) {
  if (!res.ok) {
    let bericht = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) bericht = data.error;
    } catch { /* geen JSON-body, val terug op statuscode */ }
    const fout = new Error(bericht);
    fout.status = res.status;
    throw fout;
  }
  return res.status === 204 ? null : res.json();
}

function StatusBadge({ status }) {
  const kleur = STATUS_KLEUR[status] || KLEUR.mutedTekst;
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: kleur, background: `${kleur}18` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function Knop({ children, onClick, variant = "secundair", disabled, icon: Icon, style }) {
  const varianten = {
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    groen: { background: KLEUR.groen, color: "#fff", border: "none" },
    rood: { background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}55` },
    secundair: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
        fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap", ...varianten[variant], ...style,
      }}
    >
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
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>{tekst}</div>
  );
}

/* ---------------------------------------------------------------------- */
/* Data hooks — telkens gescopet op één klant-account (accountId)          */
/* ---------------------------------------------------------------------- */

function useDocumenten(accountId, documenttype) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/facturen-klanten?accountId=${encodeURIComponent(accountId)}&documenttype=${documenttype}`)
      .then(haalJson)
      .then((d) => { setItems(d.facturen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId, documenttype]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

/** Terugkerende-facturen-sjablonen ("abonnementen") van dit klant-account (dbo.facturen_terugkerend). */
function useTerugkerend(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/facturen-terugkerend?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setItems(d.terugkerend || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

function useKlanten(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/klanten-klanten?accountId=${encodeURIComponent(accountId)}&alles=1`)
      .then(haalJson)
      .then((d) => { setItems(d.klanten || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

function useArtikelen(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/artikelen-klanten?accountId=${encodeURIComponent(accountId)}&alles=1`)
      .then(haalJson)
      .then((d) => { setItems(d.artikelen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

/** Door Activaa centraal beheerde artikelen (dbo.artikelen_algemeen) — voor elke klant
 * hetzelfde, alleen leesbaar via het portaal (beheer gebeurt in Beheer). */
function useArtikelenAlgemeen(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/artikelen-algemeen?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setItems(d.artikelen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

/** De op dit moment geldige BTW-tarieven — voor de BTW-keuzelijst bij een eigen artikel. */
function useBtwTarieven(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/btw-tarieven?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setItems(d.tarieven || []); setStatus("klaar"); })
      .catch(() => setStatus("fout"));
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, verversen };
}

/** Eigen afzendergegevens + logo van dit klant-account (dbo.bedrijfsgegevens_klanten). */
function useBedrijfsgegevens(accountId) {
  const [status, setStatus] = useState("laden");
  const [data, setData] = useState(null);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/bedrijfsgegevens-klanten?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setData(d); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, data, foutmelding, verversen };
}

/* ---------------------------------------------------------------------- */
/* Facturen & Offertes — gedeelde lijst-/detailweergave                    */
/* ---------------------------------------------------------------------- */

const LEGE_REGEL = () => ({
  omschrijving: "", artikelId: "", aantal: 1, prijs: 0, btwCode: "hoog", btwPercentage: 21,
  // Optionele afwijkende leveringsperiode voor déze regel — leeg = geldt de leveringsperiode
  // van het hele document (zie "Leveringsperiode" hieronder in DocumentFormulier).
  leveringsperiodeStart: "", leveringsperiodeEind: "",
});
const BETALINGSTERMIJN_OPTIES = [7, 14, 21, 30];

const FREQUENTIE_OPTIES = [
  { code: "wekelijks", label: "Wekelijks" },
  { code: "maandelijks", label: "Maandelijks" },
  { code: "kwartaal", label: "Per kwartaal" },
  { code: "jaarlijks", label: "Jaarlijks" },
];
const FREQUENTIE_LABEL = Object.fromEntries(FREQUENTIE_OPTIES.map((f) => [f.code, f.label]));

// Adres als losse regels (straat+nr / postcode plaats / land), voor op de factuur-weergave.
function adresRegels(adres) {
  const a = adres || {};
  return [
    [a.straat, a.huisnummer, a.toevoeging].filter(Boolean).join(" "),
    [a.postcode, a.plaats].filter(Boolean).join(" "),
    a.land && a.land !== "NL" ? a.land : "",
  ].filter(Boolean);
}

// "1 jul 2026" i.p.v. de volledige datum() — compacter voor de leveringsperiode-weergave.
function kortDatum(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}
function leveringsperiodeTekst(start, eind) {
  const s = kortDatum(start);
  const e = kortDatum(eind);
  if (s && e && s !== e) return `${s} t/m ${e}`;
  return s || e || "";
}

// Groepeert de regels per BTW-percentage — de Belastingdienst-factuurvereisten schrijven voor
// dat je bij meerdere tarieven op één factuur het bedrag én de btw per tarief apart toont.
function groepeerBtw(regels) {
  const groepen = new Map();
  for (const r of regels) {
    const percentage = Number(r.btwPercentage) || 0;
    const basis = (Number(r.aantal) || 0) * (Number(r.prijs) || 0);
    const huidig = groepen.get(percentage) || { percentage, basis: 0, btw: 0 };
    huidig.basis += basis;
    huidig.btw += basis * (percentage / 100);
    groepen.set(percentage, huidig);
  }
  return [...groepen.values()].sort((a, b) => b.percentage - a.percentage);
}

/** Voorbeeld/weergave van een factuur, offerte of creditnota — gebruikt zowel voor het live
 * voorbeeld tijdens het invullen (DocumentFormulier, met een "in opbouw"-document) als voor een
 * echt opgeslagen document (DocumentDetail). Toont, conform de factuurvereisten van de
 * Belastingdienst: volledige naam/adres van leverancier én afnemer, KvK/BTW-id van de
 * leverancier, nummer, datum, leveringsperiode (alleen als ingevuld — een periode i.p.v. één
 * datum, bijv. bij een maandelijkse dienst), en het btw-bedrag per toegepast tarief (apart
 * getoond zodra een document meerdere tarieven mengt). De echte PDF (zie "Download PDF" in
 * DocumentDetail) volgt dezelfde opzet, mét een echte SEPA-betaal-QR-code. */
function DocumentVoorbeeld({ bedrijfsgegevens, documenttype, klant, document }) {
  const naam = documenttype === "offerte" ? "Offerte" : documenttype === "creditnota" ? "Creditnota" : "Factuur";
  const bg = bedrijfsgegevens || {};
  const doc = document || {};
  const zichtbareRegels = (doc.regels || []).filter((r) => (r.omschrijving || "").trim() || Number(r.prijs));
  const btwGroepen = groepeerBtw(zichtbareRegels);
  const eigenAdres = adresRegels(bg);
  const klantAdres = adresRegels(klant?.adres);
  const totaal = doc.totaal != null ? doc.totaal : (Number(doc.subtotaal) || 0) + (Number(doc.btwBedrag) || 0);
  const leveringDocument = leveringsperiodeTekst(doc.leveringsperiodeStart, doc.leveringsperiodeEind);
  const heeftBankgegevens = !!(bg.iban || bg.ibanTenaamstelling);

  return (
    <div style={{ background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "22px 20px", fontSize: 12, color: KLEUR.tekst }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          {bg.logoUrl && <img src={bg.logoUrl} alt="Logo" style={{ maxHeight: 40, maxWidth: 150, objectFit: "contain", marginBottom: 6, display: "block" }} />}
          <div style={{ fontSize: 13, fontWeight: 700 }}>{bg.bedrijfsnaam || "(bedrijfsnaam nog niet ingevuld)"}</div>
          <div style={{ fontSize: 10.5, color: KLEUR.subtekst, lineHeight: 1.6, marginTop: 3 }}>
            {eigenAdres.map((regel, i) => <div key={i}>{regel}</div>)}
            {bg.kvkNummer && <div>KvK {bg.kvkNummer}</div>}
            {bg.btwNummer && <div>BTW {bg.btwNummer}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: KLEUR.blauw }}>{naam}</div>
          <div style={{ fontSize: 10.5, color: KLEUR.subtekst, marginTop: 4, lineHeight: 1.6 }}>
            Nummer: {doc.nummer || "(concept)"}<br />
            Datum: {datum(doc.factuurdatum)}<br />
            {documenttype !== "offerte" && <>Vervaldatum: {datum(doc.vervaldatum)}<br /></>}
            {documenttype !== "offerte" && doc.betalingstermijnDagen != null && <>Betalingstermijn: {doc.betalingstermijnDagen} dagen<br /></>}
            {leveringDocument && <>Leveringsperiode: {leveringDocument}<br /></>}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: KLEUR.mutedTekst, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>{naam} aan</div>
      <div style={{ marginBottom: 18, fontSize: 12.5 }}>
        {klant ? (
          <>
            <div style={{ fontWeight: 600 }}>{klant.naam}</div>
            <div style={{ fontSize: 11, color: KLEUR.subtekst, lineHeight: 1.6 }}>
              {klantAdres.map((regel, i) => <div key={i}>{regel}</div>)}
              {klant.btwNummer && <div>BTW {klant.btwNummer}</div>}
              {klant.kvkNummer && <div>KvK {klant.kvkNummer}</div>}
            </div>
          </>
        ) : <span style={{ color: KLEUR.mutedTekst, fontStyle: "italic" }}>— nog geen klant gekozen —</span>}
      </div>

      {documenttype !== "offerte" && doc.vervaldatum && (
        <div style={{ background: KLEUR.lichtblauw, borderRadius: 7, padding: "9px 12px", marginBottom: 16, fontSize: 13, fontWeight: 700, color: KLEUR.blauw }}>
          {geld(totaal)} te betalen op {datum(doc.vervaldatum)}
        </div>
      )}

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 50px 70px 50px 70px", background: KLEUR.lichtblauw, padding: "6px 9px", fontSize: 10, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
          <div>Omschrijving</div><div>Aantal</div><div>Prijs</div><div>BTW%</div><div>Bedrag</div>
        </div>
        {zichtbareRegels.length === 0 ? (
          <div style={{ padding: "12px 9px", color: KLEUR.mutedTekst, fontStyle: "italic", fontSize: 11.5 }}>Nog geen regels ingevuld.</div>
        ) : zichtbareRegels.map((r, i) => {
          const leveringRegel = leveringsperiodeTekst(r.leveringsperiodeStart, r.leveringsperiodeEind);
          return (
            <div key={i} style={{ padding: "6px 9px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 11.5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 50px 70px 50px 70px" }}>
                <div style={{ overflowWrap: "anywhere" }}>{r.omschrijving || "—"}</div>
                <div>{r.aantal}</div>
                <div>{geld(r.prijs)}</div>
                <div>{r.btwPercentage}%</div>
                <div style={{ textAlign: "right" }}>{geld((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</div>
              </div>
              {leveringRegel && (
                <div style={{ fontSize: 10, color: KLEUR.mutedTekst, marginTop: 2 }}>Leveringsperiode: {leveringRegel}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ textAlign: "right", fontSize: 11.5, color: KLEUR.subtekst }}>
          <div>Subtotaal: {geld(doc.subtotaal)}</div>
          {btwGroepen.length === 0 && <div>BTW: {geld(doc.btwBedrag)}</div>}
          {btwGroepen.map((g) => (
            <div key={g.percentage}>BTW {g.percentage}% over {geld(g.basis)}: {geld(g.btw)}</div>
          ))}
          <div style={{ fontWeight: 700, fontSize: 13.5, color: KLEUR.tekst, marginTop: 2 }}>Totaal: {geld(totaal)}</div>
        </div>
      </div>

      {doc.opmerkingen && <div style={{ fontSize: 11, color: KLEUR.subtekst, whiteSpace: "pre-wrap", marginBottom: 12 }}>{doc.opmerkingen}</div>}

      {heeftBankgegevens && documenttype !== "offerte" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: KLEUR.mutedTekst, borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 10 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 4, border: `1px dashed ${KLEUR.rand}`, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, textAlign: "center", color: KLEUR.mutedTekst, lineHeight: 1.2,
          }}>
            QR op PDF
          </div>
          <div>
            Wij verzoeken u het bedrag van {geld(totaal)} uiterlijk {datum(doc.vervaldatum)} over te maken naar
            {bg.iban ? ` rekeningnummer ${bg.iban}` : ""}{bg.ibanTenaamstelling ? ` ten name van ${bg.ibanTenaamstelling}` : ""},
            onder vermelding van het {naam.toLowerCase()}nummer. Download de PDF voor een scanbare betaal-QR-code.
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentFormulier({ accountId, documenttype, klanten, artikelen, tarieven, bedrijfsgegevens, bedrijfsgegevensInBehandeling, onGaNaarInstellingen, bestaand, onKlaar, onOpgeslagen, onVerstuurd }) {
  // Het laatst opgeslagen document (concept) — zodra dit gezet is, kunnen Download PDF en
  // Versturen getoond worden náást Opslaan, op hetzelfde scherm (geen aparte detailpagina meer
  // nodig). Start met `bestaand` (bij het bewerken van een reeds opgeslagen concept) of leeg
  // (bij een gloednieuw document — pas gezet na de eerste keer opslaan).
  const [opgeslagenDocument, setOpgeslagenDocument] = useState(bestaand || null);
  const [pdfStatus, setPdfStatus] = useState("idle"); // idle | bezig | fout
  const [verstuurStatus, setVerstuurStatus] = useState("idle"); // idle | bezig | fout
  const [klantKlantId, setKlantKlantId] = useState(bestaand?.klantKlantId || "");
  const [betalingstermijnDagen, setBetalingstermijnDagen] = useState(bestaand?.betalingstermijnDagen ?? 30);
  // Geen invoerveld meer voor (zie 29-07-2026, "mag eraf") — de state blijft bestaan zodat een
  // al bewaarde periode op een bestaand concept behouden blijft (gewoon opnieuw meegestuurd bij
  // opslaan), maar is voor een nieuw document altijd leeg en niet meer zelf in te stellen.
  const [leveringsperiodeStart, _setLeveringsperiodeStart] = useState(bestaand?.leveringsperiodeStart ? String(bestaand.leveringsperiodeStart).slice(0, 10) : "");
  const [leveringsperiodeEind, _setLeveringsperiodeEind] = useState(bestaand?.leveringsperiodeEind ? String(bestaand.leveringsperiodeEind).slice(0, 10) : "");
  const [opmerkingen, setOpmerkingen] = useState(bestaand?.opmerkingen || "");
  const [regels, setRegels] = useState(
    bestaand?.regels?.length
      ? bestaand.regels.map((r) => ({
          ...r,
          artikelId: r.artikelId || "",
          btwCode: r.btwCode || "hoog",
          leveringsperiodeStart: r.leveringsperiodeStart ? String(r.leveringsperiodeStart).slice(0, 10) : "",
          leveringsperiodeEind: r.leveringsperiodeEind ? String(r.leveringsperiodeEind).slice(0, 10) : "",
        }))
      : [LEGE_REGEL()]
  );
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [foutmelding, setFoutmelding] = useState("");

  // Terugkerend (abonnement) — ook beschikbaar bij het bewerken van een al opgeslagen concept:
  // de huidige regels dienen dan als sjabloon voor een nieuw abonnement, náást het concept zelf
  // (dat blijft gewoon bestaan als losse, eenmalige factuur; zie opslaan() hieronder).
  const kanTerugkerend = documenttype === "factuur";
  const [terugkerend, setTerugkerend] = useState(false);
  const [frequentie, setFrequentie] = useState("maandelijks");
  const [terugkerendStart, setTerugkerendStart] = useState(new Date().toISOString().slice(0, 10));
  const [terugkerendEind, setTerugkerendEind] = useState("");
  const [automatischVerzenden, setAutomatischVerzenden] = useState(false);
  const [terugkerendOpgeslagen, setTerugkerendOpgeslagen] = useState(false);
  const [abonnementZojuistAangemaakt, setAbonnementZojuistAangemaakt] = useState(false);

  const zetRegel = (i, veld, waarde) => {
    setRegels((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const nieuw = { ...r, [veld]: waarde };
      if (veld === "artikelId" && waarde) {
        const artikel = artikelen.find((a) => a.id === waarde);
        if (artikel) {
          nieuw.omschrijving = artikel.omschrijving;
          nieuw.prijs = artikel.prijs;
          nieuw.btwCode = artikel.btwCode || nieuw.btwCode;
          nieuw.btwPercentage = artikel.btwPercentage;
        }
      }
      if (veld === "btwCode") {
        const tarief = (tarieven || []).find((t) => t.code === waarde);
        if (tarief) nieuw.btwPercentage = tarief.percentage;
      }
      return nieuw;
    }));
  };
  const voegRegelToe = () => setRegels((h) => [...h, LEGE_REGEL()]);
  const verwijderRegel = (i) => setRegels((h) => (h.length > 1 ? h.filter((_, idx) => idx !== i) : h));

  const subtotaal = useMemo(
    () => regels.reduce((som, r) => som + (Number(r.aantal) || 0) * (Number(r.prijs) || 0), 0),
    [regels]
  );
  const btwBedrag = useMemo(
    () => regels.reduce((som, r) => som + (Number(r.aantal) || 0) * (Number(r.prijs) || 0) * ((Number(r.btwPercentage) || 0) / 100), 0),
    [regels]
  );

  const opslaan = async () => {
    if (!klantKlantId) { setFoutmelding("Kies een klant."); setStatus("fout"); return; }
    if (terugkerend && !terugkerendStart) { setFoutmelding("Kies een startdatum voor het abonnement."); setStatus("fout"); return; }
    setStatus("bezig");
    setFoutmelding("");
    try {
      const regelsVoorVerzending = regels.map((r) => ({
        ...r,
        artikelId: r.artikelId || null,
        leveringsperiodeStart: r.leveringsperiodeStart || null,
        leveringsperiodeEind: r.leveringsperiodeEind || null,
      }));

      if (terugkerend) {
        const payload = {
          accountId,
          klantKlantId,
          frequentie,
          startdatum: terugkerendStart,
          einddatum: terugkerendEind || null,
          leveringsperiodeStart: leveringsperiodeStart || null,
          leveringsperiodeEind: leveringsperiodeEind || null,
          automatischVerzenden,
          betalingstermijnDagen: Number(betalingstermijnDagen) || 30,
          opmerkingen,
          regels: regelsVoorVerzending,
        };
        await haalJson(await fetch("/api/facturen-terugkerend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }));
        if (!opgeslagenDocument) {
          // Gloednieuwe factuur: er is niets los op te slaan, alleen het abonnement is relevant.
          setStatus("invoer");
          setTerugkerendOpgeslagen(true);
          return;
        }
        // Bestond dit concept al: het abonnement is aangemaakt als los sjabloon — val nu door
        // om ook de wijzigingen aan dit concept zelf op te slaan (zie hieronder), en zet het
        // vinkje weer uit zodat een volgende "Wijzigingen opslaan" niet nóg een abonnement maakt.
        setTerugkerend(false);
        setAbonnementZojuistAangemaakt(true);
      }

      const payload = {
        accountId,
        documenttype,
        klantKlantId,
        betalingstermijnDagen: Number(betalingstermijnDagen) || 30,
        leveringsperiodeStart: leveringsperiodeStart || null,
        leveringsperiodeEind: leveringsperiodeEind || null,
        opmerkingen,
        regels: regelsVoorVerzending,
      };
      let res;
      if (opgeslagenDocument?.id) {
        res = await fetch("/api/facturen-klanten", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: opgeslagenDocument.id }),
        });
      } else {
        res = await fetch("/api/facturen-klanten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await haalJson(res);
      onOpgeslagen(data);
      // Blijf op dit scherm staan (i.p.v. terug naar het overzicht) — zodra het document
      // opgeslagen is, verschijnen Download PDF en Versturen hieronder gewoon náást Opslaan.
      setOpgeslagenDocument(data);
      setStatus("invoer");
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  const downloadPdf = async () => {
    if (!opgeslagenDocument?.id) return;
    setPdfStatus("bezig");
    try {
      const res = await fetch(`/api/facturen-klanten?accountId=${encodeURIComponent(accountId)}&id=${opgeslagenDocument.id}&formaat=pdf`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Let op: bewust window.document (niet het bare `document`) — die naam is elders in deze
      // module al de factuur/offerte-prop, niet het globale DOM-document.
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${opgeslagenDocument.documenttype}-${opgeslagenDocument.nummer || "concept"}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfStatus("idle");
    } catch {
      setPdfStatus("fout");
    }
  };

  const versturen = async () => {
    if (!opgeslagenDocument?.id) return;
    setVerstuurStatus("bezig");
    setFoutmelding("");
    try {
      const res = await fetch("/api/facturen-klanten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, id: opgeslagenDocument.id, actie: "versturen" }),
      });
      const bijgewerkt = await haalJson(res);
      onVerstuurd(bijgewerkt);
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setVerstuurStatus("fout");
    }
  };

  const naam = documenttype === "offerte" ? "offerte" : "factuur";
  const gekozenKlant = klanten.find((k) => k.id === klantKlantId) || null;

  const voorbeeldDocument = useMemo(() => {
    const vandaag = new Date();
    const vervaldatum = new Date(vandaag.getTime() + (Number(betalingstermijnDagen) || 30) * 24 * 60 * 60 * 1000);
    return {
      nummer: opgeslagenDocument?.nummer || null,
      factuurdatum: opgeslagenDocument?.factuurdatum || vandaag.toISOString(),
      vervaldatum: opgeslagenDocument?.vervaldatum || vervaldatum.toISOString(),
      betalingstermijnDagen: Number(betalingstermijnDagen) || 30,
      leveringsperiodeStart: leveringsperiodeStart || null,
      leveringsperiodeEind: leveringsperiodeEind || null,
      regels,
      subtotaal,
      btwBedrag,
      opmerkingen,
    };
  }, [opgeslagenDocument, betalingstermijnDagen, leveringsperiodeStart, leveringsperiodeEind, regels, subtotaal, btwBedrag, opmerkingen]);

  if (terugkerendOpgeslagen) {
    return (
      <div style={kaartStijl}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Repeat size={16} color={KLEUR.groen} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Abonnement aangemaakt</div>
        </div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
          Er wordt vanaf {datum(terugkerendStart)} automatisch elke {(FREQUENTIE_LABEL[frequentie] || "").toLowerCase()} een nieuwe conceptfactuur
          aangemaakt met deze regels{automatischVerzenden ? " en direct verstuurd" : ""}. Je beheert dit abonnement (pauzeren, bewerken, verwijderen)
          via de tab "Abonnementen".
        </div>
        <Knop variant="primair" onClick={onKlaar}>Terug naar overzicht</Knop>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20, alignItems: "start" }}>
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {opgeslagenDocument ? `Concept-${naam} bewerken` : terugkerend ? "Nieuw abonnement" : `Nieuwe ${naam}`}
        </div>
      </div>

      <Melding tekst={foutmelding} />

      {!bedrijfsgegevensCompleet(bedrijfsgegevens) && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", marginBottom: 14,
          background: bedrijfsgegevensInBehandeling ? KLEUR.lichtblauw : "#FBF1E4",
          border: `1px solid ${bedrijfsgegevensInBehandeling ? KLEUR.rand : KLEUR.goud}55`,
          borderRadius: 8, fontSize: 12.5, color: KLEUR.tekst,
        }}>
          {bedrijfsgegevensInBehandeling
            ? <Clock size={14} color={KLEUR.blauw} style={{ marginTop: 1, flexShrink: 0 }} />
            : <Bell size={14} color={KLEUR.goud} style={{ marginTop: 1, flexShrink: 0 }} />}
          <div>
            {bedrijfsgegevensInBehandeling ? (
              <>Je ingediende bedrijfsgegevens (naam, adres, KvK-/BTW-nummer) wachten nog op goedkeuring door Activaa en
              verschijnen daarom nog niet op deze {naam}. Zodra dat goedgekeurd is, staan ze er automatisch op.</>
            ) : (
              <>
                Je eigen bedrijfsgegevens (naam, adres, KvK-/BTW-nummer) staan nog niet volledig ingevuld, dus ontbreken
                nu nog op deze {naam}.{" "}
                {onGaNaarInstellingen ? (
                  <button
                    onClick={onGaNaarInstellingen}
                    style={{ background: "none", border: "none", padding: 0, color: KLEUR.blauw, fontWeight: 700, cursor: "pointer", fontSize: 12.5, textDecoration: "underline" }}
                  >
                    Vul ze aan bij Instellingen
                  </button>
                ) : "Vul ze aan bij Instellingen."}
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div>
          <div style={labelStijl}>Klant</div>
          <select value={klantKlantId} onChange={(e) => setKlantKlantId(e.target.value)} style={inputStijl}>
            <option value="">— kies een klant —</option>
            {klanten.filter((k) => k.actief || k.id === klantKlantId).map((k) => (
              <option key={k.id} value={k.id}>{k.naam}</option>
            ))}
          </select>
          {klanten.length === 0 && (
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 4 }}>
              Nog geen klanten. Voeg er eerst één toe via de tab "Klanten".
            </div>
          )}
        </div>
        <div>
          <div style={labelStijl}>Betalingstermijn</div>
          <select value={betalingstermijnDagen} onChange={(e) => setBetalingstermijnDagen(Number(e.target.value))} style={inputStijl}>
            {[...new Set([...BETALINGSTERMIJN_OPTIES, Number(betalingstermijnDagen) || 30])]
              .sort((a, b) => a - b)
              .map((d) => <option key={d} value={d}>{d} dagen</option>)}
          </select>
        </div>
      </div>

      <div style={labelStijl}>Regels</div>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 55px 85px 105px 85px 28px", gap: 0, background: KLEUR.lichtblauw, padding: "7px 10px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
          <div>Artikel</div><div>Omschrijving</div><div>Aantal</div><div>Prijs</div><div>BTW</div><div>Bedrag</div><div />
        </div>
        {regels.map((r, i) => (
          <div key={i} style={{ borderTop: `1px solid ${KLEUR.rand}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 55px 85px 105px 85px 28px", gap: 6, padding: "8px 10px 4px", alignItems: "center" }}>
              <select value={r.artikelId} onChange={(e) => zetRegel(i, "artikelId", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }}>
                <option value="">— vrije tekst —</option>
                {artikelen.filter((a) => a.actief).map((a) => <option key={a.id} value={a.id}>{a.omschrijving}</option>)}
              </select>
              <input value={r.omschrijving} onChange={(e) => zetRegel(i, "omschrijving", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} placeholder="Omschrijving" />
              <BedragInput waarde={r.aantal} onChange={(w) => zetRegel(i, "aantal", w)} decimalen={0} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
              <BedragInput waarde={r.prijs} onChange={(w) => zetRegel(i, "prijs", w)} decimalen={2} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
              <select value={r.btwCode || "hoog"} onChange={(e) => zetRegel(i, "btwCode", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }}>
                {(tarieven || []).length === 0 && <option value={r.btwCode || "hoog"}>{r.btwPercentage}%</option>}
                {(tarieven || []).map((t) => (
                  <option key={t.code} value={t.code}>{t.label} ({t.percentage}%)</option>
                ))}
              </select>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{geld((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</div>
              <button onClick={() => verwijderRegel(i)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex", justifyContent: "center" }}>
                <Trash2 size={14} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 55px 85px 105px 85px 28px", gap: 6, padding: "0 10px 8px" }}>
              <div />
              <div style={{ gridColumn: "2 / 6", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>Leveringsperiode voor deze regel:</span>
                <input type="date" value={r.leveringsperiodeStart || ""} onChange={(e) => zetRegel(i, "leveringsperiodeStart", e.target.value)} style={{ ...inputStijl, padding: "3px 6px", fontSize: 11, width: 128 }} />
                <span style={{ fontSize: 10, color: KLEUR.mutedTekst }}>t/m</span>
                <input type="date" value={r.leveringsperiodeEind || ""} onChange={(e) => zetRegel(i, "leveringsperiodeEind", e.target.value)} style={{ ...inputStijl, padding: "3px 6px", fontSize: 11, width: 128 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={voegRegelToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
        <Plus size={13} /> Regel toevoegen
      </button>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, textAlign: "right" }}>
          <div>Subtotaal: {geld(subtotaal)}</div>
          <div>BTW: {geld(btwBedrag)}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: KLEUR.tekst, marginTop: 2 }}>Totaal: {geld(subtotaal + btwBedrag)}</div>
        </div>
      </div>

      <div style={labelStijl}>Opmerkingen (optioneel)</div>
      <textarea value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} rows={2} style={{ ...inputStijl, resize: "vertical" }} />

      {kanTerugkerend && (
        <div style={{ marginTop: 18, padding: 14, background: KLEUR.lichtblauw, borderRadius: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={terugkerend} onChange={(e) => setTerugkerend(e.target.checked)} />
            <Repeat size={14} /> {opgeslagenDocument ? "Maak hier ook een terugkerend abonnement van (met deze regels als sjabloon)" : "Dit is een terugkerende factuur (abonnement)"}
          </label>
          {terugkerend && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginTop: 12 }}>
              <div>
                <div style={labelStijl}>Frequentie</div>
                <select value={frequentie} onChange={(e) => setFrequentie(e.target.value)} style={inputStijl}>
                  {FREQUENTIE_OPTIES.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStijl}>Startdatum</div>
                <input type="date" value={terugkerendStart} onChange={(e) => setTerugkerendStart(e.target.value)} style={inputStijl} />
              </div>
              <div>
                <div style={labelStijl}>Einddatum (optioneel)</div>
                <input type="date" value={terugkerendEind} onChange={(e) => setTerugkerendEind(e.target.value)} style={inputStijl} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={automatischVerzenden} onChange={(e) => setAutomatischVerzenden(e.target.checked)} />
                  Automatisch verzenden (anders blijft elke gegenereerde factuur een concept totdat je 'm zelf verstuurt)
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Knop variant="primair" onClick={opslaan} disabled={status === "bezig"} icon={Check}>
          {status === "bezig"
            ? "Bezig…"
            : terugkerend
            ? (opgeslagenDocument ? "Opslaan + abonnement aanmaken" : "Abonnement aanmaken")
            : opgeslagenDocument ? "Wijzigingen opslaan" : "Opslaan als concept"}
        </Knop>
        {opgeslagenDocument && (
          <>
            <Knop icon={Download} disabled={pdfStatus === "bezig"} onClick={downloadPdf}>
              {pdfStatus === "bezig" ? "PDF downloaden…" : "Download PDF"}
            </Knop>
            {opgeslagenDocument.status === "concept" && (
              <Knop variant="primair" icon={Send} disabled={verstuurStatus === "bezig"} onClick={versturen}>
                {verstuurStatus === "bezig" ? "Versturen…" : "Versturen"}
              </Knop>
            )}
          </>
        )}
        <Knop onClick={onKlaar}>{opgeslagenDocument ? "Terug naar overzicht" : "Annuleren"}</Knop>
      </div>
      {pdfStatus === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="PDF downloaden is niet gelukt, probeer het nog eens." /></div>}
      {abonnementZojuistAangemaakt && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: KLEUR.groen, marginTop: 8, fontWeight: 600 }}>
          <Repeat size={12} /> Abonnement aangemaakt — te beheren via de tab "Abonnementen".
        </div>
      )}
      {terugkerend && (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
          Er wordt vanaf de startdatum automatisch periodiek een nieuwe conceptfactuur aangemaakt met deze regels — te beheren via de tab "Abonnementen".
        </div>
      )}
      {opgeslagenDocument ? (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
          Opgeslagen als concept{opgeslagenDocument.nummer ? ` (${opgeslagenDocument.nummer})` : ""}. Een nummer wordt pas definitief toegekend zodra je 'm verstuurt.
        </div>
      ) : !terugkerend && (
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
          Een nummer wordt pas toegekend zodra je de {naam} verstuurt — hier sla je alleen het concept op.
        </div>
      )}
    </div>

    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.blauw, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Eye size={14} /> Zo ziet je {naam} eruit (voorbeeld, wordt live bijgewerkt)
      </div>
      <DocumentVoorbeeld
        bedrijfsgegevens={bedrijfsgegevens}
        documenttype={documenttype}
        klant={gekozenKlant}
        document={voorbeeldDocument}
      />
    </div>
    </div>
  );
}

function DocumentDetail({ accountId, document, klantenMap, bedrijfsgegevens, onTerug, onActie, gerelateerdeFactuur }) {
  const bezig = document._bezig;
  const klant = klantenMap[document.klantKlantId] || null;
  const [pdfStatus, setPdfStatus] = useState("idle"); // idle | bezig | fout

  const downloadPdf = async () => {
    setPdfStatus("bezig");
    try {
      const res = await fetch(`/api/facturen-klanten?accountId=${encodeURIComponent(accountId)}&id=${document.id}&formaat=pdf`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Let op: bewust window.document (niet het bare `document`) — die naam is hier al de
      // factuur/offerte-prop van deze component, niet het globale DOM-document.
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document.documenttype}-${document.nummer || "concept"}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfStatus("idle");
    } catch {
      setPdfStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onTerug} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{document.nummer || "(nog geen nummer)"}</div>
        <StatusBadge status={document.status} />
      </div>

      {(document.verzondenOp || document.betaaldOp) && (
        <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 12.5, color: KLEUR.subtekst }}>
          {document.verzondenOp && <div><span style={{ color: KLEUR.mutedTekst }}>Verzonden op: </span>{datum(document.verzondenOp)}</div>}
          {document.betaaldOp && <div><span style={{ color: KLEUR.mutedTekst }}>Betaald op: </span>{datum(document.betaaldOp)}</div>}
        </div>
      )}

      {document.emailVerzonden != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 12.5, color: document.emailVerzonden ? KLEUR.groen : KLEUR.mutedTekst }}>
          <Mail size={13} />
          {document.emailVerzonden
            ? "E-mail met PDF-bijlage is verzonden naar de klant."
            : `E-mail is niet verzonden${document.emailFout ? ` (${document.emailFout})` : "."}`}
        </div>
      )}

      <DocumentVoorbeeld bedrijfsgegevens={bedrijfsgegevens} documenttype={document.documenttype} klant={klant} document={document} />

      {gerelateerdeFactuur && (
        <div style={{ background: KLEUR.lichtblauw, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
          Geaccepteerd — omgezet naar factuur {gerelateerdeFactuur.nummer || "(concept)"}.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Knop icon={Download} disabled={pdfStatus === "bezig"} onClick={downloadPdf}>
          {pdfStatus === "bezig" ? "PDF downloaden…" : "Download PDF"}
        </Knop>
        {document.status === "concept" && (
          <Knop variant="primair" icon={Send} disabled={bezig} onClick={() => onActie(document, "versturen")}>Versturen</Knop>
        )}
        {document.documenttype === "offerte" && document.status === "verzonden" && (
          <>
            <Knop variant="groen" icon={Check} disabled={bezig} onClick={() => onActie(document, "accepteren")}>Klant is akkoord</Knop>
            <Knop variant="rood" icon={X} disabled={bezig} onClick={() => onActie(document, "afwijzen")}>Klant wijst af</Knop>
          </>
        )}
        {document.documenttype === "factuur" && document.status === "verzonden" && (
          <>
            <Knop variant="groen" icon={Check} disabled={bezig} onClick={() => onActie(document, "betaald")}>Markeer betaald</Knop>
            <Knop variant="rood" icon={X} disabled={bezig} onClick={() => onActie(document, "annuleren")}>Annuleren</Knop>
          </>
        )}
      </div>
      {pdfStatus === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="PDF downloaden is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

function DocumentenTab({ accountId, documenttype, klanten, artikelen, tarieven, klantenMap, alleFacturen, bedrijfsgegevens, bedrijfsgegevensInBehandeling, onGaNaarInstellingen }) {
  const { status, items, foutmelding, verversen } = useDocumenten(accountId, documenttype);
  const [weergave, setWeergave] = useState("lijst"); // lijst | nieuw | bewerken | detail
  const [actief, setActief] = useState(null);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [actieFout, setActieFout] = useState("");

  const naam = documenttype === "offerte" ? "offerte" : "factuur";
  const naamMv = documenttype === "offerte" ? "offertes" : "facturen";

  const statussen = documenttype === "offerte"
    ? ["alle", "concept", "verzonden", "geaccepteerd", "afgewezen"]
    : ["alle", "concept", "verzonden", "betaald", "verlopen", "geannuleerd"];

  const gefilterd = statusFilter === "alle" ? items : items.filter((d) => d.status === statusFilter);

  const totalen = useMemo(() => {
    if (documenttype !== "factuur") return null;
    const som = (lijst) => lijst.reduce((s, d) => s + d.totaal, 0);
    return {
      gefactureerd: som(items.filter((d) => ["verzonden", "betaald", "verlopen"].includes(d.status))),
      concept: som(items.filter((d) => d.status === "concept")),
      openstaand: som(items.filter((d) => d.status === "verzonden")),
      betaald: som(items.filter((d) => d.status === "betaald")),
      verlopen: som(items.filter((d) => d.status === "verlopen")),
    };
  }, [items, documenttype]);

  const voerActieUit = async (document, actie) => {
    setActieFout("");
    setActief({ ...document, _bezig: true });
    try {
      const res = await fetch("/api/facturen-klanten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, id: document.id, actie }),
      });
      const bijgewerkt = await haalJson(res);
      verversen();
      setActief(bijgewerkt);
    } catch (e) {
      setActieFout(e.message || String(e));
      setActief({ ...document, _bezig: false });
    }
  };

  // Na het versturen (vanuit het formulier zelf, zie DocumentFormulier) is het geen concept
  // meer — dan naar de gewone detailweergave, die de juiste vervolgacties toont (betaald/
  // annuleren, of accepteren/afwijzen bij een offerte).
  const naVersturenVanuitFormulier = (bijgewerkt) => {
    verversen();
    setActief(bijgewerkt);
    setWeergave("detail");
  };

  if (weergave === "nieuw") {
    return (
      <DocumentFormulier
        accountId={accountId} documenttype={documenttype} klanten={klanten} artikelen={artikelen} tarieven={tarieven} bedrijfsgegevens={bedrijfsgegevens}
        bedrijfsgegevensInBehandeling={bedrijfsgegevensInBehandeling} onGaNaarInstellingen={onGaNaarInstellingen}
        onKlaar={() => setWeergave("lijst")}
        onOpgeslagen={() => verversen()}
        onVerstuurd={naVersturenVanuitFormulier}
      />
    );
  }
  if (weergave === "bewerken" && actief) {
    return (
      <DocumentFormulier
        accountId={accountId} documenttype={documenttype} klanten={klanten} artikelen={artikelen} tarieven={tarieven} bedrijfsgegevens={bedrijfsgegevens} bestaand={actief}
        bedrijfsgegevensInBehandeling={bedrijfsgegevensInBehandeling} onGaNaarInstellingen={onGaNaarInstellingen}
        onKlaar={() => setWeergave("lijst")}
        onOpgeslagen={() => verversen()}
        onVerstuurd={naVersturenVanuitFormulier}
      />
    );
  }
  if (weergave === "detail" && actief) {
    const gerelateerdeFactuur = documenttype === "offerte" && actief.status === "geaccepteerd"
      ? (alleFacturen || []).find((f) => f.offerteId === actief.id)
      : null;
    return (
      <>
        <Melding tekst={actieFout} />
        <DocumentDetail accountId={accountId} document={actief} klantenMap={klantenMap} bedrijfsgegevens={bedrijfsgegevens} onTerug={() => setWeergave("lijst")} onActie={voerActieUit} gerelateerdeFactuur={gerelateerdeFactuur} />
      </>
    );
  }

  return (
    <div>
      {totalen && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
          {[
            ["Totaal gefactureerd", totalen.gefactureerd],
            ["Totaal concept", totalen.concept],
            ["Openstaand", totalen.openstaand],
            ["Betaald", totalen.betaald],
            ["Verlopen", totalen.verlopen],
          ].map(([label, bedrag]) => (
            <div key={label} style={{ ...kaartStijl, margin: 0, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{geld(bedrag)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {statussen.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${statusFilter === s ? KLEUR.blauw : KLEUR.rand}`,
                background: statusFilter === s ? KLEUR.blauw : "#fff",
                color: statusFilter === s ? "#fff" : KLEUR.subtekst,
              }}
            >
              {s === "alle" ? "Alle" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Nieuwe {naam}</Knop>
      </div>

      <Melding tekst={foutmelding} />

      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && gefilterd.length === 0 && <LegeStaat tekst={`Nog geen ${naamMv}.`} />}
      {status === "klaar" && gefilterd.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 2fr 110px 110px 110px 110px 130px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
            <div>Nummer</div><div>Klant</div><div>Datum</div><div>Vervaldatum</div><div>Bedrag</div><div>Status</div><div>Acties</div>
          </div>
          {gefilterd.map((d) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "110px 2fr 110px 110px 110px 110px 130px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>{d.nummer || "—"}</div>
              <div>{klantenMap[d.klantKlantId]?.naam || "—"}</div>
              <div>{datum(d.factuurdatum)}</div>
              <div>{datum(d.vervaldatum)}</div>
              <div>{geld(d.totaal)}</div>
              <div><StatusBadge status={d.status} /></div>
              <div style={{ display: "flex", gap: 6 }}>
                {d.status === "concept" ? (
                  <button onClick={() => { setActief(d); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken">
                    <Pencil size={14} />
                  </button>
                ) : (
                  <button onClick={() => { setActief(d); setWeergave("detail"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 12, fontWeight: 600 }}>
                    Bekijken
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Abonnementen (facturen_terugkerend) — sjablonen voor terugkerende        */
/* facturen; het aanmaken zelf gebeurt via "Nieuwe factuur" → "Terugkerend" */
/* (zie DocumentFormulier). Hier beheren: bewerken/pauzeren/hervatten/verwijderen. */
/* ---------------------------------------------------------------------- */

/** Een bestaand abonnement bewerken — frequentie, betalingstermijn, einddatum, automatisch
 * verzenden, leveringsperiode (schuift zelf elke cyclus op, zie facturenTerugkerend.js),
 * regels en opmerkingen. Klant en startdatum liggen vast (wijzigTerugkerend in
 * api/_gedeeld/facturenTerugkerend.js ondersteunt die twee bewust niet — de eerst al gegenereerde
 * facturen blijven verder ongemoeid); pauzeren/hervatten en verwijderen blijven losse acties in
 * AbonnementenTab, niet hier. Regel-editor is bewust een eigen kopie van die in DocumentFormulier
 * (zelfde velden/gedrag) i.p.v. een gedeeld component, om dat grotere, al goed geteste onderdeel
 * niet aan te hoeven raken voor deze losstaande toevoeging. */
function AbonnementFormulier({ accountId, bestaand, artikelen, tarieven, klantnaam, onKlaar, onOpgeslagen }) {
  const [frequentie, setFrequentie] = useState(bestaand.frequentie);
  const [einddatum, setEinddatum] = useState(bestaand.einddatum ? String(bestaand.einddatum).slice(0, 10) : "");
  const [automatischVerzenden, setAutomatischVerzenden] = useState(!!bestaand.automatischVerzenden);
  const [betalingstermijnDagen, setBetalingstermijnDagen] = useState(bestaand.betalingstermijnDagen ?? 30);
  const [leveringsperiodeStart, setLeveringsperiodeStart] = useState(bestaand.leveringsperiodeStart ? String(bestaand.leveringsperiodeStart).slice(0, 10) : "");
  const [leveringsperiodeEind, setLeveringsperiodeEind] = useState(bestaand.leveringsperiodeEind ? String(bestaand.leveringsperiodeEind).slice(0, 10) : "");
  const [opmerkingen, setOpmerkingen] = useState(bestaand.opmerkingen || "");
  const [regels, setRegels] = useState(
    bestaand.regels?.length
      ? bestaand.regels.map((r) => ({
          ...r,
          artikelId: r.artikelId || "",
          btwCode: r.btwCode || "hoog",
          leveringsperiodeStart: r.leveringsperiodeStart ? String(r.leveringsperiodeStart).slice(0, 10) : "",
          leveringsperiodeEind: r.leveringsperiodeEind ? String(r.leveringsperiodeEind).slice(0, 10) : "",
        }))
      : [LEGE_REGEL()]
  );
  const [status, setStatus] = useState("invoer");
  const [foutmelding, setFoutmelding] = useState("");

  const zetRegel = (i, veld, waarde) => {
    setRegels((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const nieuw = { ...r, [veld]: waarde };
      if (veld === "artikelId" && waarde) {
        const artikel = artikelen.find((a) => a.id === waarde);
        if (artikel) {
          nieuw.omschrijving = artikel.omschrijving;
          nieuw.prijs = artikel.prijs;
          nieuw.btwCode = artikel.btwCode || nieuw.btwCode;
          nieuw.btwPercentage = artikel.btwPercentage;
        }
      }
      if (veld === "btwCode") {
        const tarief = (tarieven || []).find((t) => t.code === waarde);
        if (tarief) nieuw.btwPercentage = tarief.percentage;
      }
      return nieuw;
    }));
  };
  const voegRegelToe = () => setRegels((h) => [...h, LEGE_REGEL()]);
  const verwijderRegel = (i) => setRegels((h) => (h.length > 1 ? h.filter((_, idx) => idx !== i) : h));

  const subtotaal = useMemo(
    () => regels.reduce((som, r) => som + (Number(r.aantal) || 0) * (Number(r.prijs) || 0), 0),
    [regels]
  );
  const btwBedrag = useMemo(
    () => regels.reduce((som, r) => som + (Number(r.aantal) || 0) * (Number(r.prijs) || 0) * ((Number(r.btwPercentage) || 0) / 100), 0),
    [regels]
  );

  const opslaan = async () => {
    if (einddatum && bestaand.startdatum && new Date(einddatum) < new Date(bestaand.startdatum)) {
      setFoutmelding("Einddatum kan niet vóór de startdatum liggen.");
      setStatus("fout");
      return;
    }
    setStatus("bezig");
    setFoutmelding("");
    try {
      const regelsVoorVerzending = regels.map((r) => ({
        ...r,
        artikelId: r.artikelId || null,
        leveringsperiodeStart: r.leveringsperiodeStart || null,
        leveringsperiodeEind: r.leveringsperiodeEind || null,
      }));
      const data = await haalJson(await fetch("/api/facturen-terugkerend", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          id: bestaand.id,
          frequentie,
          einddatum: einddatum || null,
          leveringsperiodeStart: leveringsperiodeStart || null,
          leveringsperiodeEind: leveringsperiodeEind || null,
          automatischVerzenden,
          betalingstermijnDagen: Number(betalingstermijnDagen) || 30,
          opmerkingen,
          regels: regelsVoorVerzending,
        }),
      }));
      onOpgeslagen(data);
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ArrowLeft size={16} /></button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Abonnement bewerken — {klantnaam}</div>
      </div>
      <Melding tekst={foutmelding} />
      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 12 }}>
        Startdatum: {datum(bestaand.startdatum)} · Volgende factuur: {datum(bestaand.volgendeFactuurdatum)} (klant en startdatum zijn hier niet te wijzigen).
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <div>
          <div style={labelStijl}>Frequentie</div>
          <select value={frequentie} onChange={(e) => setFrequentie(e.target.value)} style={inputStijl}>
            {FREQUENTIE_OPTIES.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStijl}>Betalingstermijn</div>
          <select value={betalingstermijnDagen} onChange={(e) => setBetalingstermijnDagen(Number(e.target.value))} style={inputStijl}>
            {[...new Set([...BETALINGSTERMIJN_OPTIES, Number(betalingstermijnDagen) || 30])]
              .sort((a, b) => a - b)
              .map((d) => <option key={d} value={d}>{d} dagen</option>)}
          </select>
        </div>
        <div>
          <div style={labelStijl}>Einddatum (optioneel)</div>
          <input type="date" value={einddatum} onChange={(e) => setEinddatum(e.target.value)} style={inputStijl} />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 12, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={automatischVerzenden} onChange={(e) => setAutomatischVerzenden(e.target.checked)} />
        Automatisch verzenden zodra de conceptfactuur is aangemaakt
      </label>

      <div style={labelStijl}>Regels</div>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 55px 85px 105px 85px 28px", gap: 0, background: KLEUR.lichtblauw, padding: "7px 10px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
          <div>Artikel</div><div>Omschrijving</div><div>Aantal</div><div>Prijs</div><div>BTW</div><div>Bedrag</div><div />
        </div>
        {regels.map((r, i) => (
          <div key={i} style={{ borderTop: `1px solid ${KLEUR.rand}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 55px 85px 105px 85px 28px", gap: 6, padding: "8px 10px 4px", alignItems: "center" }}>
              <select value={r.artikelId} onChange={(e) => zetRegel(i, "artikelId", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }}>
                <option value="">— vrije tekst —</option>
                {artikelen.filter((a) => a.actief).map((a) => <option key={a.id} value={a.id}>{a.omschrijving}</option>)}
              </select>
              <input value={r.omschrijving} onChange={(e) => zetRegel(i, "omschrijving", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} placeholder="Omschrijving" />
              <BedragInput waarde={r.aantal} onChange={(w) => zetRegel(i, "aantal", w)} decimalen={0} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
              <BedragInput waarde={r.prijs} onChange={(w) => zetRegel(i, "prijs", w)} decimalen={2} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
              <select value={r.btwCode || "hoog"} onChange={(e) => zetRegel(i, "btwCode", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }}>
                {(tarieven || []).length === 0 && <option value={r.btwCode || "hoog"}>{r.btwPercentage}%</option>}
                {(tarieven || []).map((t) => (
                  <option key={t.code} value={t.code}>{t.label} ({t.percentage}%)</option>
                ))}
              </select>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{geld((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</div>
              <button onClick={() => verwijderRegel(i)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex", justifyContent: "center" }}>
                <Trash2 size={14} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 55px 85px 105px 85px 28px", gap: 6, padding: "0 10px 8px" }}>
              <div />
              <div style={{ gridColumn: "2 / 6", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>Leveringsperiode voor deze regel:</span>
                <input type="date" value={r.leveringsperiodeStart || ""} onChange={(e) => zetRegel(i, "leveringsperiodeStart", e.target.value)} style={{ ...inputStijl, padding: "3px 6px", fontSize: 11, width: 128 }} />
                <span style={{ fontSize: 10, color: KLEUR.mutedTekst }}>t/m</span>
                <input type="date" value={r.leveringsperiodeEind || ""} onChange={(e) => zetRegel(i, "leveringsperiodeEind", e.target.value)} style={{ ...inputStijl, padding: "3px 6px", fontSize: 11, width: 128 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={voegRegelToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
        <Plus size={13} /> Regel toevoegen
      </button>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, textAlign: "right" }}>
          <div>Subtotaal: {geld(subtotaal)}</div>
          <div>BTW: {geld(btwBedrag)}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: KLEUR.tekst, marginTop: 2 }}>Totaal: {geld(subtotaal + btwBedrag)}</div>
        </div>
      </div>

      <div style={labelStijl}>Leveringsperiode voor het hele document (optioneel)</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="date" value={leveringsperiodeStart} onChange={(e) => setLeveringsperiodeStart(e.target.value)} style={inputStijl} />
        <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>t/m</span>
        <input type="date" value={leveringsperiodeEind} onChange={(e) => setLeveringsperiodeEind(e.target.value)} style={inputStijl} />
      </div>
      <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4, marginBottom: 4 }}>
        Schuift automatisch een frequentie-stap op bij elke nieuw gegenereerde factuur (bijv. bij een maandelijkse dienst).
      </div>

      <div style={labelStijl}>Opmerkingen (optioneel)</div>
      <textarea value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} rows={2} style={{ ...inputStijl, resize: "vertical" }} />

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Knop variant="primair" icon={Check} disabled={status === "bezig"} onClick={opslaan}>{status === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
        <Knop onClick={onKlaar}>Annuleren</Knop>
      </div>
    </div>
  );
}

function AbonnementenTab({ accountId, klantenMap, artikelen, tarieven }) {
  const { status, items, foutmelding, verversen } = useTerugkerend(accountId);
  const [actieBezigId, setActieBezigId] = useState(null);
  const [actieFout, setActieFout] = useState("");
  const [weergave, setWeergave] = useState("lijst");
  const [bewerkItem, setBewerkItem] = useState(null);

  const wijzigActief = async (item, actief) => {
    setActieBezigId(item.id);
    setActieFout("");
    try {
      await haalJson(await fetch("/api/facturen-terugkerend", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, id: item.id, actief }),
      }));
      verversen();
    } catch (e) {
      setActieFout(e.message || String(e));
    }
    setActieBezigId(null);
  };

  const verwijderen = async (item) => {
    const klantnaam = klantenMap[item.klantKlantId]?.naam || "deze klant";
    if (!window.confirm(`Abonnement voor "${klantnaam}" verwijderen? Al eerder gegenereerde facturen blijven bewaard.`)) return;
    setActieBezigId(item.id);
    setActieFout("");
    try {
      await haalJson(await fetch(`/api/facturen-terugkerend?accountId=${encodeURIComponent(accountId)}&id=${item.id}`, { method: "DELETE" }));
      verversen();
    } catch (e) {
      setActieFout(e.message || String(e));
    }
    setActieBezigId(null);
  };

  if (weergave === "bewerken" && bewerkItem) {
    return (
      <AbonnementFormulier
        accountId={accountId}
        bestaand={bewerkItem}
        artikelen={artikelen}
        tarieven={tarieven}
        klantnaam={klantenMap[bewerkItem.klantKlantId]?.naam || "deze klant"}
        onKlaar={() => setWeergave("lijst")}
        onOpgeslagen={verversen}
      />
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 640 }}>
        Terugkerende facturen (abonnementen) stel je in vanaf "Nieuwe factuur" — schakel daar "Dit is een terugkerende factuur" in.
        Hier beheer je bestaande abonnementen: bewerken, pauzeren, hervatten of verwijderen.
      </div>
      <Melding tekst={foutmelding || actieFout} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && items.length === 0 && <LegeStaat tekst="Nog geen abonnementen ingesteld." />}
      {status === "klaar" && items.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px 116px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
            <div>Klant</div><div>Frequentie</div><div>Volgende factuur</div><div>Aantal verstuurd</div><div>Status</div><div>Acties</div>
          </div>
          {items.map((item) => (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px 116px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>{klantenMap[item.klantKlantId]?.naam || "—"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {FREQUENTIE_LABEL[item.frequentie] || item.frequentie}
                {item.automatischVerzenden && <Mail size={11} color={KLEUR.mutedTekst} title="Automatisch verzenden staat aan" />}
              </div>
              <div>{datum(item.volgendeFactuurdatum)}</div>
              <div>{item.aantalGegenereerd}</div>
              <div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: item.actief ? KLEUR.groen : KLEUR.mutedTekst }}>
                  {item.actief ? "Actief" : "Gepauzeerd"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setBewerkItem(item); setWeergave("bewerken"); }} disabled={actieBezigId === item.id} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
                {item.actief ? (
                  <button onClick={() => wijzigActief(item, false)} disabled={actieBezigId === item.id} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }} title="Pauzeren"><Pause size={14} /></button>
                ) : (
                  <button onClick={() => wijzigActief(item, true)} disabled={actieBezigId === item.id} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Hervatten"><Play size={14} /></button>
                )}
                <button onClick={() => verwijderen(item)} disabled={actieBezigId === item.id} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Verwijderen"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Klanten (klanten_klanten) & Producten (artikelen_klanten)               */
/* ---------------------------------------------------------------------- */

function KlantFormulier({ accountId, bestaand, onKlaar, onOpgeslagen }) {
  const a = bestaand?.adres || {};
  const [f, setF] = useState({
    naam: bestaand?.naam || "", contactpersoon: bestaand?.contactpersoon || "", email: bestaand?.email || "",
    telefoon: bestaand?.telefoon || "", straat: a.straat || "", huisnummer: a.huisnummer || "",
    toevoeging: a.toevoeging || "", postcode: a.postcode || "", plaats: a.plaats || "", land: a.land || "NL",
    btwNummer: bestaand?.btwNummer || "", kvkNummer: bestaand?.kvkNummer || "", iban: bestaand?.iban || "",
    opmerkingen: bestaand?.opmerkingen || "",
  });
  const [status, setStatus] = useState("invoer");
  const [foutmelding, setFoutmelding] = useState("");
  const zet = (k) => (e) => setF((h) => ({ ...h, [k]: e.target.value }));

  const opslaan = async () => {
    if (!f.naam.trim()) { setFoutmelding("Naam is verplicht."); setStatus("fout"); return; }
    setStatus("bezig");
    try {
      const payload = {
        accountId, naam: f.naam, contactpersoon: f.contactpersoon, email: f.email, telefoon: f.telefoon,
        adres: { straat: f.straat, huisnummer: f.huisnummer, toevoeging: f.toevoeging, postcode: f.postcode, plaats: f.plaats, land: f.land },
        btwNummer: f.btwNummer, kvkNummer: f.kvkNummer, iban: f.iban, opmerkingen: f.opmerkingen,
      };
      const res = bestaand
        ? await fetch("/api/klanten-klanten", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: bestaand.id }) })
        : await fetch("/api/klanten-klanten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await haalJson(res);
      onOpgeslagen(data);
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ArrowLeft size={16} /></button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{bestaand ? "Klant bewerken" : "Nieuwe klant"}</div>
      </div>
      <Melding tekst={foutmelding} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 20px" }}>
        <div>
          <div style={labelStijl}>Naam *</div><input value={f.naam} onChange={zet("naam")} style={inputStijl} />
          <div style={labelStijl}>Contactpersoon</div><input value={f.contactpersoon} onChange={zet("contactpersoon")} style={inputStijl} />
          <div style={labelStijl}>E-mail</div><input value={f.email} onChange={zet("email")} style={inputStijl} />
          <div style={labelStijl}>Telefoon</div><input value={f.telefoon} onChange={zet("telefoon")} style={inputStijl} />
          <div style={labelStijl}>BTW-nummer</div><input value={f.btwNummer} onChange={zet("btwNummer")} style={inputStijl} />
          <div style={labelStijl}>KvK-nummer</div><input value={f.kvkNummer} onChange={zet("kvkNummer")} style={inputStijl} />
          <div style={labelStijl}>IBAN</div><input value={f.iban} onChange={zet("iban")} style={inputStijl} />
        </div>
        <div>
          <div style={labelStijl}>Straat</div><input value={f.straat} onChange={zet("straat")} style={inputStijl} />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><div style={labelStijl}>Huisnr</div><input value={f.huisnummer} onChange={zet("huisnummer")} style={inputStijl} /></div>
            <div style={{ flex: 1 }}><div style={labelStijl}>Toevoeging</div><input value={f.toevoeging} onChange={zet("toevoeging")} style={inputStijl} /></div>
          </div>
          <div style={labelStijl}>Postcode</div><input value={f.postcode} onChange={zet("postcode")} style={inputStijl} />
          <div style={labelStijl}>Plaats</div><input value={f.plaats} onChange={zet("plaats")} style={inputStijl} />
          <div style={labelStijl}>Land</div><input value={f.land} onChange={zet("land")} style={inputStijl} />
          <div style={labelStijl}>Opmerkingen</div><textarea value={f.opmerkingen} onChange={zet("opmerkingen")} rows={3} style={{ ...inputStijl, resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Knop variant="primair" icon={Check} disabled={status === "bezig"} onClick={opslaan}>{status === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
        <Knop onClick={onKlaar}>Annuleren</Knop>
      </div>
    </div>
  );
}

function KlantenTab({ accountId, klanten, status, foutmelding, verversen }) {
  const [weergave, setWeergave] = useState("lijst");
  const [actief, setActief] = useState(null);

  const deactiveren = async (k) => {
    if (!window.confirm(`"${k.naam}" deactiveren? Bestaande facturen blijven bewaard.`)) return;
    try {
      await haalJson(await fetch(`/api/klanten-klanten?accountId=${encodeURIComponent(accountId)}&id=${k.id}`, { method: "DELETE" }));
      verversen();
    } catch { /* verversen laat de echte staat zien */ verversen(); }
  };

  if (weergave === "nieuw") return <KlantFormulier accountId={accountId} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;
  if (weergave === "bewerken" && actief) return <KlantFormulier accountId={accountId} bestaand={actief} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;

  const actieveKlanten = klanten.filter((k) => k.actief);
  const nietActieveKlanten = klanten.filter((k) => !k.actief);

  const KlantenTabel = ({ items }) => (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 100px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
        <div>Naam</div><div>E-mail / contact</div><div>Plaats</div><div>Acties</div>
      </div>
      {items.map((k) => (
        <div key={k.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 100px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
          <div style={{ fontWeight: 600 }}>{k.naam}</div>
          <div>{k.email || k.contactpersoon || "—"}</div>
          <div>{k.adres?.plaats || "—"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setActief(k); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
            {k.actief && (
              <button onClick={() => deactiveren(k)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Deactiveren"><Trash2 size={14} /></button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Nieuwe klant</Knop>
      </div>
      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && klanten.length === 0 && <LegeStaat tekst="Nog geen klanten toegevoegd." />}
      {status === "klaar" && actieveKlanten.length > 0 && (
        <div style={{ marginBottom: nietActieveKlanten.length > 0 ? 24 : 0 }}>
          <div style={sectieKopStijl}>Actief ({actieveKlanten.length})</div>
          <KlantenTabel items={actieveKlanten} />
        </div>
      )}
      {status === "klaar" && nietActieveKlanten.length > 0 && (
        <div>
          <div style={sectieKopStijl}>Niet actief ({nietActieveKlanten.length})</div>
          <KlantenTabel items={nietActieveKlanten} />
        </div>
      )}
    </div>
  );
}

function ArtikelFormulier({ accountId, bestaand, tarieven, onKlaar, onOpgeslagen }) {
  const [f, setF] = useState({
    omschrijving: bestaand?.omschrijving || "", eenheid: bestaand?.eenheid || "uur",
    prijs: bestaand?.prijs ?? 0, btwCode: bestaand?.btwCode || "hoog",
  });
  const [status, setStatus] = useState("invoer");
  const [foutmelding, setFoutmelding] = useState("");
  const zet = (k) => (e) => setF((h) => ({ ...h, [k]: e.target.value }));

  const opslaan = async () => {
    if (!f.omschrijving.trim()) { setFoutmelding("Omschrijving is verplicht."); setStatus("fout"); return; }
    setStatus("bezig");
    try {
      const payload = { accountId, omschrijving: f.omschrijving, eenheid: f.eenheid, prijs: Number(f.prijs) || 0, btwCode: f.btwCode };
      const res = bestaand
        ? await fetch("/api/artikelen-klanten", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: bestaand.id }) })
        : await fetch("/api/artikelen-klanten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await haalJson(res);
      onOpgeslagen(data);
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ArrowLeft size={16} /></button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{bestaand ? "Product bewerken" : "Nieuw product"}</div>
      </div>
      <Melding tekst={foutmelding} />
      <div style={labelStijl}>Omschrijving *</div><input value={f.omschrijving} onChange={zet("omschrijving")} style={inputStijl} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div><div style={labelStijl}>Eenheid</div><input value={f.eenheid} onChange={zet("eenheid")} style={inputStijl} placeholder="uur, stuk, ..." /></div>
        <div><div style={labelStijl}>Prijs (excl. btw)</div><input type="number" value={f.prijs} onChange={zet("prijs")} style={inputStijl} /></div>
        <div>
          <div style={labelStijl}>BTW</div>
          <select value={f.btwCode} onChange={zet("btwCode")} style={inputStijl}>
            {(tarieven || []).length === 0 && <option value={f.btwCode}>Laden…</option>}
            {(tarieven || []).map((t) => (
              <option key={t.code} value={t.code}>{t.label} ({t.percentage}%)</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Knop variant="primair" icon={Check} disabled={status === "bezig"} onClick={opslaan}>{status === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
        <Knop onClick={onKlaar}>Annuleren</Knop>
      </div>
    </div>
  );
}

function ProductenTab({ accountId, artikelen, artikelenAlgemeen, tarieven, status, foutmelding, verversen }) {
  const [weergave, setWeergave] = useState("lijst");
  const [actief, setActief] = useState(null);

  const deactiveren = async (a) => {
    if (!window.confirm(`"${a.omschrijving}" verwijderen uit de catalogus?`)) return;
    await fetch(`/api/artikelen-klanten?accountId=${encodeURIComponent(accountId)}&id=${a.id}`, { method: "DELETE" }).catch(() => {});
    verversen();
  };

  if (weergave === "nieuw") return <ArtikelFormulier accountId={accountId} tarieven={tarieven} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;
  if (weergave === "bewerken" && actief) return <ArtikelFormulier accountId={accountId} bestaand={actief} tarieven={tarieven} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;

  const actieveArtikelen = artikelen.filter((a) => a.actief);
  const nietActieveArtikelen = artikelen.filter((a) => !a.actief);

  const ArtikelenTabel = ({ items }) => (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
        <div>Omschrijving</div><div>Eenheid</div><div>Prijs</div><div>BTW</div><div>Acties</div>
      </div>
      {items.map((a) => (
        <div key={a.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
          <div style={{ fontWeight: 600 }}>{a.omschrijving}</div>
          <div>{a.eenheid || "—"}</div>
          <div>{geld(a.prijs)}</div>
          <div>{a.btwPercentage}%</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setActief(a); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
            {a.actief && <button onClick={() => deactiveren(a)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Verwijderen"><Trash2 size={14} /></button>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Nieuw product</Knop>
      </div>
      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && artikelen.length === 0 && <LegeStaat tekst="Nog geen producten/diensten toegevoegd." />}
      {status === "klaar" && actieveArtikelen.length > 0 && (
        <div style={{ marginBottom: nietActieveArtikelen.length > 0 ? 24 : 0 }}>
          <div style={sectieKopStijl}>Actief ({actieveArtikelen.length})</div>
          <ArtikelenTabel items={actieveArtikelen} />
        </div>
      )}
      {status === "klaar" && nietActieveArtikelen.length > 0 && (
        <div>
          <div style={sectieKopStijl}>Niet actief ({nietActieveArtikelen.length})</div>
          <ArtikelenTabel items={nietActieveArtikelen} />
        </div>
      )}

      {(artikelenAlgemeen || []).length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Standaardartikelen van Activaa</div>
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>
            Deze artikelen zijn door Activaa ingesteld en gelden voor alle klanten in het portaal — je kunt ze gebruiken bij het opstellen van een factuur of offerte, maar hier niet zelf wijzigen.
          </div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
              <div>Omschrijving</div><div>Eenheid</div><div>Prijs</div><div>BTW</div>
            </div>
            {artikelenAlgemeen.map((a) => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
                <div style={{ fontWeight: 600 }}>{a.omschrijving}</div>
                <div>{a.eenheid || "—"}</div>
                <div>{geld(a.prijs)}</div>
                <div>{a.btwPercentage}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Instellingen — hier staat wat nog gebouwd moet worden (bewust eerlijk)   */
/* ---------------------------------------------------------------------- */

function NogNietGebouwdKaart({ icon: Icon, titel, tekst }) {
  return (
    <div style={{ ...kaartStijl, opacity: 0.6, background: "repeating-linear-gradient(45deg, #fff, #fff 10px, #FAFAF8 10px, #FAFAF8 20px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={16} color={KLEUR.mutedTekst} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>{titel}</div>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 20, padding: "2px 8px" }}>NOG NIET GEBOUWD</span>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{tekst}</div>
    </div>
  );
}

/** Eigen afzendergegevens + logo (dbo.bedrijfsgegevens_klanten) — direct zelf te wijzigen,
 * geen goedkeuring door Activaa nodig (in tegenstelling tot bedrijfs-/contactgegevens uit
 * Dynamics bij "Mijn gegevens"). "Kopieer van" is alleen zichtbaar met >1 gekoppeld account
 * met de facturatiemodule aan, en neemt bewust het logo niet over (dat is echt per klant). */
/** De op dit moment ingediende (nog niet beoordeelde) wijzigingsverzoeken van de ingelogde
 * klant, over alle accounts en types heen — gebruikt om te bepalen of "Bedrijfsgegevens &
 * logo" voor een account al een openstaand verzoek heeft (dan is het formulier gesloten
 * totdat Activaa het beoordeeld heeft). */
function useEigenWijzigingsverzoeken() {
  const [items, setItems] = useState([]);

  const verversen = useCallback(() => {
    fetch("/api/wijzigingsverzoek")
      .then(haalJson)
      .then((d) => setItems(d.verzoeken || []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => { verversen(); }, [verversen]);
  return { items, verversen };
}

function BedrijfsgegevensKaart({ accountId, bedrijfsgegevens, andereAccounts, account, eigenVerzoeken, verversVerzoeken }) {
  const { status, data, verversen: verversBedrijfsgegevens } = bedrijfsgegevens;
  const [f, setF] = useState(null);
  const [indienStatus, setIndienStatus] = useState("idle"); // idle | bezig | fout
  const [ingediend, setIngediend] = useState(false);
  const [directOpgeslagen, setDirectOpgeslagen] = useState(false);
  const [logoStatus, setLogoStatus] = useState("idle"); // idle | bezig | fout | verwijderen
  const [kopieerVan, setKopieerVan] = useState("");
  const [kopieerBezig, setKopieerBezig] = useState(false);

  const openVerzoek = eigenVerzoeken.find(
    (v) => v.accountId === accountId && v.type === "bedrijfsgegevens_facturatie" && v.status === "open"
  );
  const inBehandeling = !!openVerzoek || ingediend;

  const [ccStatus, setCcStatus] = useState("idle"); // idle | bezig | fout

  useEffect(() => {
    if (!data || f) return;
    // Voor ieder veld dat bij Activaa al bekend is uit Dynamics (bedrijfsnaam, adres,
    // KvK-nummer, BTW-nummer, sinds 29-07-2026 ook IBAN + tenaamstelling) vullen we het aan
    // zodra het nog leeg is — nooit een al opgeslagen/goedgekeurde eigen waarde overschrijven.
    setF(vulBedrijfsgegevensAanMetCrm(data, account));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (status === "laden" || !f) {
    return (
      <div style={kaartStijl}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bedrijfsgegevens</div>
        <LegeStaat tekst="Laden…" />
      </div>
    );
  }

  const zet = (k) => (e) => setF((h) => ({ ...h, [k]: e.target.value }));

  const dienIn = async () => {
    setIndienStatus("bezig");
    setDirectOpgeslagen(false);
    try {
      // logo, gewijzigdOp en ccEmail horen niet bij dit verzoek — logo en ccEmail gaan via hun
      // eigen, directe endpoints (geen goedkeuring nodig, zie opslaanCcEmail/uploadLogo),
      // gewijzigdOp is read-only metadata.
      const { logoUrl: _logoUrl, gewijzigdOp: _gewijzigdOp, ccEmail: _ccEmail, ...velden } = f;
      const res = await fetch("/api/wijzigingsverzoek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, type: "bedrijfsgegevens_facturatie", voorstel: velden }),
      });
      const d = await haalJson(res);
      setIndienStatus("idle");
      if (d.geenWijziging) {
        // Niets dat je zelf hebt gewijzigd t.o.v. wat al bekend was (opgeslagen of vanuit CRM) —
        // dan is er niets om goed te keuren en is het meteen (of allang) opgeslagen.
        setDirectOpgeslagen(true);
        verversBedrijfsgegevens?.();
      } else {
        setIngediend(true);
        verversVerzoeken();
      }
    } catch (e) {
      setIndienStatus("fout");
    }
  };

  const uploadLogo = (bestand) => {
    if (!bestand) return;
    setLogoStatus("bezig");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/bedrijfsgegevens-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, dataUrl: reader.result }),
        });
        const d = await haalJson(res);
        setF((h) => ({ ...h, logoUrl: d.logoUrl }));
        setLogoStatus("idle");
      } catch {
        setLogoStatus("fout");
      }
    };
    reader.readAsDataURL(bestand);
  };

  const verwijderLogo = async () => {
    if (!window.confirm("Logo verwijderen?")) return;
    setLogoStatus("verwijderen");
    try {
      const res = await fetch("/api/bedrijfsgegevens-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, actie: "verwijderen" }),
      });
      const d = await haalJson(res);
      setF((h) => ({ ...h, logoUrl: d.logoUrl }));
      setLogoStatus("idle");
    } catch {
      setLogoStatus("fout");
    }
  };

  // CC-mailadres bij het versturen van een factuur/offerte/creditnota — puur een eigen
  // voorkeur (geen verificatiegegeven zoals naam/adres/KvK/BTW/IBAN), dus direct zelf te
  // wijzigen zonder goedkeuring door Activaa, zelfde patroon als het logo hierboven.
  const opslaanCcEmail = async () => {
    setCcStatus("bezig");
    try {
      const res = await fetch("/api/bedrijfsgegevens-klanten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ccEmail: f.ccEmail || "" }),
      });
      const d = await haalJson(res);
      setF((h) => ({ ...h, ccEmail: d.ccEmail }));
      setCcStatus("idle");
    } catch {
      setCcStatus("fout");
    }
  };

  const kopieer = async () => {
    if (!kopieerVan) return;
    setKopieerBezig(true);
    try {
      const d = await haalJson(await fetch(`/api/bedrijfsgegevens-klanten?accountId=${encodeURIComponent(kopieerVan)}`));
      setF((h) => ({ ...d, logoUrl: h.logoUrl }));
    } catch { /* gebruiker kan het gewoon opnieuw proberen */ }
    setKopieerBezig(false);
  };

  return (
    <>
      <div style={kaartStijl}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bedrijfsgegevens</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
          Deze gegevens komen als afzender ("Van:") bovenaan je facturen en offertes te staan.
          Bedrijfsnaam, adres, KvK-nummer, BTW-nummer en IBAN zijn al ingevuld met wat bij Activaa
          bekend is; een wijziging hier wordt eerst door Activaa beoordeeld voordat hij ingaat.
        </div>

        {andereAccounts.length > 0 && !inBehandeling && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <select value={kopieerVan} onChange={(e) => setKopieerVan(e.target.value)} style={{ ...inputStijl, maxWidth: 260 }}>
              <option value="">Kopieer van andere klant…</option>
              {andereAccounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.klantnaam}</option>)}
            </select>
            <Knop onClick={kopieer} disabled={!kopieerVan || kopieerBezig} icon={Copy}>{kopieerBezig ? "Bezig…" : "Kopieer"}</Knop>
            <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>(logo wordt niet overgenomen)</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0 20px", opacity: inBehandeling ? 0.6 : 1 }}>
          <div>
            <div style={labelStijl}>Bedrijfsnaam</div>
            <input value={f.bedrijfsnaam} onChange={zet("bedrijfsnaam")} style={inputStijl} disabled={inBehandeling} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <div><div style={labelStijl}>Straat</div><input value={f.straat} onChange={zet("straat")} style={inputStijl} disabled={inBehandeling} /></div>
              <div><div style={labelStijl}>Huisnr.</div><input value={f.huisnummer} onChange={zet("huisnummer")} style={inputStijl} disabled={inBehandeling} /></div>
              <div><div style={labelStijl}>Toev.</div><input value={f.toevoeging} onChange={zet("toevoeging")} style={inputStijl} disabled={inBehandeling} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
              <div><div style={labelStijl}>Postcode</div><input value={f.postcode} onChange={zet("postcode")} style={inputStijl} disabled={inBehandeling} /></div>
              <div><div style={labelStijl}>Plaats</div><input value={f.plaats} onChange={zet("plaats")} style={inputStijl} disabled={inBehandeling} /></div>
            </div>
            <div style={labelStijl}>Land</div>
            <input value={f.land} onChange={zet("land")} style={inputStijl} disabled={inBehandeling} />
          </div>
          <div>
            <div style={labelStijl}>KvK-nummer</div>
            <input value={f.kvkNummer} onChange={zet("kvkNummer")} style={inputStijl} disabled={inBehandeling} />
            <div style={labelStijl}>BTW-nummer</div>
            <input value={f.btwNummer} onChange={zet("btwNummer")} style={inputStijl} disabled={inBehandeling} />
            <div style={labelStijl}>IBAN</div>
            <input value={f.iban} onChange={zet("iban")} style={inputStijl} disabled={inBehandeling} />
            <div style={labelStijl}>Tenaamstelling IBAN</div>
            <input value={f.ibanTenaamstelling} onChange={zet("ibanTenaamstelling")} style={inputStijl} disabled={inBehandeling} />
          </div>
        </div>

        {inBehandeling ? (
          <div style={{ marginTop: 16, padding: "10px 12px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, color: KLEUR.tekst, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={14} color={KLEUR.blauw} /> Je wijziging is ingediend en wacht op goedkeuring door Activaa.
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <Knop variant="primair" icon={Send} onClick={dienIn} disabled={indienStatus === "bezig"}>
              {indienStatus === "bezig" ? "Indienen…" : "Wijziging indienen"}
            </Knop>
            {indienStatus === "fout" && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Indienen mislukt, probeer het nog eens.</span>}
            {directOpgeslagen && (
              <span style={{ fontSize: 12.5, color: KLEUR.groen, fontWeight: 600 }}>
                Opgeslagen — geen goedkeuring nodig, er was niets dat je zelf wijzigde.
              </span>
            )}
          </div>
        )}
      </div>

      <div style={kaartStijl}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Logo</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
          Dit logo komt bovenaan je facturen en offertes te staan. In tegenstelling tot de
          bedrijfsgegevens hiernaast pas je dit direct zelf aan, zonder goedkeuring door Activaa.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {f.logoUrl && (
            <img src={f.logoUrl} alt="Logo" style={{ maxHeight: 46, maxWidth: 150, objectFit: "contain", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: 4 }} />
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadLogo(e.target.files[0])} />
            {logoStatus === "bezig" ? "Bezig met uploaden…" : f.logoUrl ? "Ander logo kiezen" : "Logo uploaden"}
          </label>
          {f.logoUrl && (
            <button
              onClick={verwijderLogo}
              disabled={logoStatus === "verwijderen"}
              style={{ background: "none", border: "none", cursor: logoStatus === "verwijderen" ? "default" : "pointer", color: KLEUR.rood, fontSize: 12.5, fontWeight: 600, padding: 0 }}
            >
              {logoStatus === "verwijderen" ? "Bezig…" : "Logo verwijderen"}
            </button>
          )}
        </div>
        {logoStatus === "fout" && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 4 }}>Actie mislukt, probeer het nog eens.</div>}
      </div>

      <div style={kaartStijl}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>CC bij versturen</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
          Vul hier je eigen e-mailadres in om automatisch een kopie (CC) te ontvangen zodra je een
          factuur, offerte of creditnota verstuurt — zo weet je zeker dat 'm ook echt is verzonden.
          Leeg laten stuurt geen kopie. Net als het logo direct zelf te wijzigen, zonder goedkeuring
          door Activaa.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            type="email"
            value={f.ccEmail || ""}
            onChange={(e) => setF((h) => ({ ...h, ccEmail: e.target.value }))}
            placeholder="jouw@eigenbedrijf.nl"
            style={{ ...inputStijl, maxWidth: 280 }}
          />
          <Knop variant="primair" onClick={opslaanCcEmail} disabled={ccStatus === "bezig"}>
            {ccStatus === "bezig" ? "Opslaan…" : "Opslaan"}
          </Knop>
        </div>
        {ccStatus === "fout" && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 4 }}>Opslaan mislukt, probeer het nog eens.</div>}
      </div>
    </>
  );
}

function InstellingenTab({ accountId, bedrijfsgegevens, andereAccounts, account, eigenVerzoeken, verversVerzoeken }) {
  return (
    <div>
      <BedrijfsgegevensKaart accountId={accountId} bedrijfsgegevens={bedrijfsgegevens} andereAccounts={andereAccounts} account={account} eigenVerzoeken={eigenVerzoeken} verversVerzoeken={verversVerzoeken} />
      <NogNietGebouwdKaart icon={CreditCard} titel="Mollie & betalingen" tekst="Koppeling met Mollie zodat klanten van jouw klanten direct kunnen betalen vanaf de factuur." />
      <NogNietGebouwdKaart icon={Sliders} titel="Standaardwaarden" tekst="Standaard betalingstermijn, btw-percentage en factuurteksten instellen." />
      <NogNietGebouwdKaart icon={Bell} titel="Herinneringen & e-mailsjablonen" tekst="Automatische betalingsherinneringen; de teksten worden centraal beheerd door Activaa." />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Eén klant-account: ofwel de volle module (ingeschakeld), ofwel een       */
/* "niet actief"-kaart met prijsinfo en een aanvraagknop (uitgeschakeld).   */
/* ---------------------------------------------------------------------- */

const SUBTABS = [
  { key: "facturen", label: "Facturen", icon: FileText },
  { key: "offertes", label: "Offertes", icon: FileSpreadsheet },
  { key: "abonnementen", label: "Abonnementen", icon: Repeat },
  { key: "klanten", label: "Klanten", icon: Users },
  { key: "producten", label: "Producten", icon: Package },
  { key: "instellingen", label: "Instellingen", icon: Settings },
];

function FacturatieAccountInhoud({ account, andereAccounts }) {
  const accountId = account.accountId;
  const [subtab, setSubtab] = useState("facturen");

  const klantenData = useKlanten(accountId);
  const artikelenData = useArtikelen(accountId);
  const artikelenAlgemeenData = useArtikelenAlgemeen(accountId);
  const btwTarievenData = useBtwTarieven(accountId);
  const bedrijfsgegevensData = useBedrijfsgegevens(accountId);
  // Voor de "omgezet naar factuur"-link bij geaccepteerde offertes hebben we ook de facturenlijst nodig.
  const facturenVoorKoppeling = useDocumenten(accountId, "factuur");
  // Hier (i.p.v. alleen lokaal in BedrijfsgegevensKaart) opgehaald, zodat de factuur-/offerteschermen
  // ook kunnen zien of een bedrijfsgegevens-wijziging nog op goedkeuring wacht (zie de melding in
  // DocumentFormulier hierboven).
  const wijzigingsverzoeken = useEigenWijzigingsverzoeken();
  const bedrijfsgegevensInBehandeling = wijzigingsverzoeken.items.some(
    (v) => v.accountId === accountId && v.type === "bedrijfsgegevens_facturatie" && v.status === "open"
  );
  const gaNaarInstellingen = useCallback(() => setSubtab("instellingen"), []);

  // Wat er echt op de factuur/offerte moet verschijnen: de opgeslagen bedrijfsgegevens, aangevuld
  // met wat al uit Dynamics bekend is (zelfde regel als de Instellingen-kaart) — anders zou de
  // volledigheids-melding en de live-voorbeeld hier een LEGERE (want niet-aangevulde) versie tonen
  // dan wat de klant zelf bij Instellingen ziet staan (zie 29-07-2026: "melding niet compleet,
  // maar dat is wel zo").
  const effectieveBedrijfsgegevens = useMemo(
    () => vulBedrijfsgegevensAanMetCrm(bedrijfsgegevensData.data, account),
    [bedrijfsgegevensData.data, account]
  );

  // Sync de CRM-aanvulling hierboven ook echt naar de eigen tabel weg, zodat de PDF/e-mail die
  // Activaa daadwerkelijk verstuurt (die leest alleen de opgeslagen tabel, niet Dynamics) ook
  // klopt — niet alleen dit scherm. Zelfde "geen-wijziging"-endpoint als een handmatige
  // "Wijziging indienen" zonder echte wijziging (zie api/wijzigingsverzoek/index.js); hier
  // stil op de achtergrond aangeroepen zodat een klant niet eerst naar Instellingen hoeft en
  // daar handmatig moet opslaan voordat KvK/BTW/adres/IBAN echt op de factuur verschijnen.
  const crmSyncGedaanRef = useRef(false);
  useEffect(() => {
    if (crmSyncGedaanRef.current) return;
    if (bedrijfsgegevensData.status !== "klaar" || !effectieveBedrijfsgegevens) return;
    const verschilt = BEDRIJFSGEGEVENS_SYNC_VELDEN.some(
      (v) => (effectieveBedrijfsgegevens[v] || "") !== (bedrijfsgegevensData.data[v] || "")
    );
    if (!verschilt) { crmSyncGedaanRef.current = true; return; }
    crmSyncGedaanRef.current = true;
    const { logoUrl: _logoUrl, gewijzigdOp: _gewijzigdOp, ccEmail: _ccEmail, ...velden } = effectieveBedrijfsgegevens;
    fetch("/api/wijzigingsverzoek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, type: "bedrijfsgegevens_facturatie", voorstel: velden }),
    })
      .then(haalJson)
      .then((d) => { if (d.geenWijziging) bedrijfsgegevensData.verversen(); })
      .catch(() => {}); // best-effort en stil: de klant kan het ook nog gewoon handmatig indienen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedrijfsgegevensData.status, effectieveBedrijfsgegevens, accountId]);

  const klantenMap = useMemo(
    () => Object.fromEntries(klantenData.items.map((k) => [k.id, k])),
    [klantenData.items]
  );

  // Bij het opstellen van een factuur/offerte mag zowel uit de eigen catalogus als uit de
  // door Activaa centraal beheerde standaardartikelen gekozen worden.
  const alleArtikelen = useMemo(
    () => [...artikelenData.items, ...artikelenAlgemeenData.items],
    [artikelenData.items, artikelenAlgemeenData.items]
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubtab(key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 8,
              border: `1px solid ${subtab === key ? KLEUR.blauw : KLEUR.rand}`, cursor: "pointer",
              background: subtab === key ? KLEUR.blauw : "#fff", color: subtab === key ? "#fff" : KLEUR.subtekst,
              fontSize: 13, fontWeight: 600,
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {subtab === "facturen" && (
        <DocumentenTab
          accountId={accountId} documenttype="factuur" klanten={klantenData.items} artikelen={alleArtikelen} tarieven={btwTarievenData.items} klantenMap={klantenMap}
          bedrijfsgegevens={effectieveBedrijfsgegevens} bedrijfsgegevensInBehandeling={bedrijfsgegevensInBehandeling} onGaNaarInstellingen={gaNaarInstellingen}
        />
      )}
      {subtab === "offertes" && (
        <DocumentenTab
          accountId={accountId} documenttype="offerte" klanten={klantenData.items} artikelen={alleArtikelen} tarieven={btwTarievenData.items} klantenMap={klantenMap} alleFacturen={facturenVoorKoppeling.items}
          bedrijfsgegevens={effectieveBedrijfsgegevens} bedrijfsgegevensInBehandeling={bedrijfsgegevensInBehandeling} onGaNaarInstellingen={gaNaarInstellingen}
        />
      )}
      {subtab === "abonnementen" && (
        <AbonnementenTab accountId={accountId} klantenMap={klantenMap} artikelen={alleArtikelen} tarieven={btwTarievenData.items} />
      )}
      {subtab === "klanten" && (
        <KlantenTab accountId={accountId} klanten={klantenData.items} status={klantenData.status} foutmelding={klantenData.foutmelding} verversen={klantenData.verversen} />
      )}
      {subtab === "producten" && (
        <ProductenTab
          accountId={accountId}
          artikelen={artikelenData.items}
          artikelenAlgemeen={artikelenAlgemeenData.items}
          tarieven={btwTarievenData.items}
          status={artikelenData.status}
          foutmelding={artikelenData.foutmelding}
          verversen={artikelenData.verversen}
        />
      )}
      {subtab === "instellingen" && (
        <InstellingenTab
          accountId={accountId} bedrijfsgegevens={bedrijfsgegevensData} andereAccounts={andereAccounts} account={account}
          eigenVerzoeken={wijzigingsverzoeken.items} verversVerzoeken={wijzigingsverzoeken.verversen}
        />
      )}
    </div>
  );
}

/** Uitleg + prijs van de facturatiemodule — één keer bovenaan de sectie "Niet actief" bij
 * meerdere klantaccounts, zodat een klant dit niet per account hoeft open te klikken. */
function FacturatiemoduleUitlegBanner({ prijs }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", marginBottom: 10,
      background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 10,
    }}>
      <Lock size={15} color={KLEUR.mutedTekst} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
        <strong style={{ color: KLEUR.tekst }}>Facturatiemodule nog niet actief voor deze klantaccounts.</strong>{" "}
        Hiermee kun je zelf facturen en offertes opstellen aan je eigen klanten, met een eigen productencatalogus,
        eigen bedrijfsgegevens/logo en automatische doorlopende nummering. Deze module kost <strong>{geld(prijs)} per maand</strong> per
        klantaccount.
      </div>
    </div>
  );
}

/** Kaart voor een gekoppeld klantaccount waarvoor de facturatiemodule nog niet aan staat —
 * i.p.v. de tab helemaal te verbergen (dan zou een klant het nooit kunnen aanvragen).
 * toonUitleg=false laat de kop/uitleg/prijs weg — gebruikt binnen de sectie "Niet actief"
 * (meerdere accounts), waar FacturatiemoduleUitlegBanner die uitleg al één keer toont. */
function FacturatieNietActief({ account, prijs, toonUitleg = true }) {
  const [status, setStatus] = useState(account.facturatieAangevraagdOp ? "aangevraagd" : "idle"); // idle | bezig | aangevraagd | fout

  const vraagAan = async () => {
    setStatus("bezig");
    try {
      await haalJson(await fetch("/api/facturatie-aanvraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId }),
      }));
      setStatus("aangevraagd");
    } catch {
      setStatus("fout");
    }
  };

  return (
    <div style={{ padding: "18px 20px" }}>
      {toonUitleg && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Lock size={15} color={KLEUR.mutedTekst} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Facturatiemodule nog niet actief voor dit klantaccount</div>
          </div>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 560 }}>
            Hiermee kun je zelf facturen en offertes opstellen aan je eigen klanten, met een eigen productencatalogus,
            eigen bedrijfsgegevens/logo en automatische doorlopende nummering. Deze module kost <strong>{geld(prijs)} per maand</strong> per
            klantaccount.
          </div>
        </>
      )}
      {status === "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} />
          Aangevraagd{account.facturatieAangevraagdOp ? ` op ${datum(account.facturatieAangevraagdOp)}` : ""} — we nemen contact met je op.
        </div>
      ) : (
        <Knop variant="primair" onClick={vraagAan} disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Vraag facturatiemodule aan"}
        </Knop>
      )}
      {status === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="Aanvragen is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Module-root — per gekoppeld klantaccount een inklapbare kaart (net als  */
/* bij "Mijn gegevens"), met de volle module of een aanvraagkaart erin.    */
/* ---------------------------------------------------------------------- */

export default function FacturatieModule({ accounts, prijs = 5 }) {
  const [openAccountId, setOpenAccountId] = useState(accounts.length === 1 ? accounts[0].accountId : null);
  const [zoek, setZoek] = useState("");

  useEffect(() => {
    if (accounts.length === 1) setOpenAccountId(accounts[0].accountId);
    else if (!accounts.some((a) => a.accountId === openAccountId)) setOpenAccountId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  if (accounts.length === 0) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  const term = zoek.trim().toLowerCase();
  const lijst = accounts.filter((a) =>
    !term || [a.klantnaam, String(a.klantnummer ?? "")].filter(Boolean).some((v) => v.toLowerCase().includes(term))
  );

  // Eén klantaccount: geen lijst/sectie-indeling nodig — direct de volle module of de
  // aanvraagkaart tonen, zoals voorheen.
  if (accounts.length === 1) {
    const acc = accounts[0];
    return acc.facturatieIngeschakeld
      ? <FacturatieAccountInhoud account={acc} andereAccounts={[]} />
      : <FacturatieNietActief account={acc} prijs={prijs} />;
  }

  // Meerdere gekoppelde klantaccounts: opsplitsen in "Actief" en "Niet actief", met de
  // uitleg/prijs één keer bovenaan de laatste sectie (zie FacturatiemoduleUitlegBanner)
  // i.p.v. herhaald per account.
  const renderAccountRij = (acc, i) => {
    const open = openAccountId === acc.accountId;
    const andereAccounts = accounts.filter((a) => a.accountId !== acc.accountId && a.facturatieIngeschakeld);
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
          acc.facturatieIngeschakeld
            ? <div style={{ padding: "16px" }}><FacturatieAccountInhoud account={acc} andereAccounts={andereAccounts} /></div>
            : <FacturatieNietActief account={acc} prijs={prijs} toonUitleg={false} />
        )}
      </div>
    );
  };

  const actieveAccounts = lijst.filter((a) => a.facturatieIngeschakeld);
  const nietActieveAccounts = lijst.filter((a) => !a.facturatieIngeschakeld);

  return (
    <div>
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
          <FacturatiemoduleUitlegBanner prijs={prijs} />
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            {nietActieveAccounts.map(renderAccountRij)}
          </div>
        </div>
      )}
    </div>
  );
}
