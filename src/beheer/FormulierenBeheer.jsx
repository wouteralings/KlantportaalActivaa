import { useEffect, useRef, useState } from "react";
import { Info, Upload, Trash2, Loader2, AlertTriangle, CheckCircle2, FileText, ChevronDown, Eye, EyeOff } from "lucide-react";
import { stuurbareVelden, antwoordLabels } from "../medewerker/formulierVoorwaarden";

/**
 * Beheer → Formulieren — PDF-formulieren toevoegen die je in het medewerkersportaal kunt
 * invullen (Belastingdienst, KvK, wat je maar nodig hebt).
 *
 * Er wordt hier niets geprogrammeerd: een invulbaar PDF-formulier draagt zijn eigen velden mee, en
 * die leest het portaal bij het uploaden uit. Wat je hier per veld instelt is de bovenlaag — een
 * leesbaar label in plaats van de technische veldnaam, en of een veld überhaupt gevraagd moet worden.
 *
 * Niet elke PDF kan dit. Formulieren van Adobe LiveCycle (XFA) en platte of gescande PDF's hebben
 * geen velden om te vullen; die worden bij het uploaden geweigerd met uitleg.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

/**
 * Waar een veld automatisch mee gevuld mag worden. Bewust een expliciete keuze per veld en géén
 * slimmigheid op basis van de veldnaam: op één formulier betekent "KVK-nummer" op de ene plek dat
 * van de cliënt en op de andere dat van een vereffenaar of een overnemer. Automatisch raden vult dan
 * het verkeerde nummer in, en dat merk je pas als de Belastingdienst erover begint.
 */
export const BRONGROEPEN = [
  {
    groep: "Cliënt",
    items: [
      { key: "klantnaam", label: "Naam cliënt" },
      { key: "kvk", label: "KvK-nummer" },
      { key: "bsn", label: "Bsn / fiscaal nummer" },
      { key: "iban", label: "IBAN" },
      { key: "btwnummer", label: "Btw-nummer (volledig)" },
      // Formulieren splitsen deze nummers vaak: het deel vóór de letter en het subnummer erna
      // krijgen elk hun eigen hokjes. De Belastingdienst noemt het deel vóór de B zelf "RSIN of
      // fiscaal nummer" — zie vraag 1c van de Melding Loonheffingen.
      { key: "rsin", label: "RSIN (deel vóór de B)" },
      { key: "btwsubnummer", label: "Btw-subnummer (na de B)" },
      { key: "loonheffingsnummer", label: "Loonheffingennummer (volledig)" },
      { key: "loonheffingsnummerdeel", label: "Loonheffingennummer (vóór de L)" },
      { key: "loonheffingssubnummer", label: "Loonheffingen-subnummer (na de L)" },
      { key: "adres", label: "Adres (één regel)" },
      { key: "straat", label: "Straat en huisnummer" },
      // Veel formulieren hebben een apart hokje voor het huisnummer en nog een klein hokje voor de
      // toevoeging. Daarom staan de adresdelen hier ook los.
      { key: "straatnaam", label: "Alleen straatnaam" },
      { key: "huisnummer", label: "Huisnummer" },
      { key: "toevoeging", label: "Toevoeging huisnummer" },
      { key: "huisnummertoevoeging", label: "Huisnummer + toevoeging" },
      { key: "postcode", label: "Postcode" },
      { key: "plaats", label: "Vestigingsplaats" },
      { key: "land", label: "Land" },
    ],
  },
  {
    groep: "Contactpersoon",
    items: [
      { key: "contactnaam", label: "Naam contactpersoon" },
      { key: "contactemail", label: "E-mail contactpersoon" },
      { key: "contacttelefoon", label: "Telefoon contactpersoon" },
    ],
  },
  {
    // Ons eigen kantoor. Formulieren vragen die vaak als gemachtigde of correspondentieadres — op de
    // Melding Loonheffingen is dat een blok van acht vakjes. Deze waarden komen uit
    // Beheer → Instellingen → afzendergegevens, dus je vult ze één keer in.
    groep: "Ons kantoor",
    items: [
      { key: "kantoornaam", label: "Naam ons kantoor" },
      { key: "beconnummer", label: "Beconnummer" },
      { key: "kantooradres", label: "Adres (één regel)" },
      { key: "kantoorstraatnaam", label: "Alleen straatnaam" },
      { key: "kantoorhuisnummer", label: "Huisnummer" },
      { key: "kantoortoevoeging", label: "Toevoeging huisnummer" },
      { key: "kantoorpostcode", label: "Postcode" },
      { key: "kantoorplaats", label: "Plaats" },
      { key: "kantoortelefoon", label: "Telefoon" },
      { key: "kantooremail", label: "E-mail" },
      { key: "kantoorkvk", label: "KvK-nummer" },
      { key: "kantoorbtw", label: "Btw-nummer" },
      { key: "kantooriban", label: "IBAN" },
    ],
  },
  {
    // Het belastingkantoor dat in Dynamics aan de cliënt hangt, met het adres uit dat record —
    // dezelfde bron die de Brieven-module gebruikt voor een brief aan de Belastingdienst.
    groep: "Belastingkantoor van de cliënt",
    items: [
      { key: "bknaam", label: "Naam belastingkantoor" },
      { key: "bkadres", label: "Adres (één regel)" },
      { key: "bkstraatnaam", label: "Alleen straatnaam" },
      { key: "bkhuisnummer", label: "Huisnummer" },
      { key: "bktoevoeging", label: "Toevoeging huisnummer" },
      { key: "bkpostcode", label: "Postcode" },
      { key: "bkplaats", label: "Plaats" },
    ],
  },
  {
    groep: "Overig",
    items: [
      { key: "vandaag", label: "Datum van vandaag" },
      // Een adres of tekst die op dit formulier altijd hetzelfde is — je tikt hem hiernaast in.
      { key: "vast", label: "Vaste tekst (zelf invullen)" },
    ],
  },
];

/**
 * Alles wat níét standaard van de klantkaart komt — bsn, IBAN, een eigen kenmerk — voeg je toe als
 * extra kolom bij Beheer → Instellingen → kolommen van het klantoverzicht. Die kolommen verschijnen
 * hier vanzelf als bron, zodat er voor een volgend Dynamics-veld geen nieuwe regel code nodig is.
 */
export function extraKolomBronnen(extraKolommen) {
  const items = (Array.isArray(extraKolommen) ? extraKolommen : [])
    .filter((c) => c && c.veld)
    .map((c) => ({ key: `extra:${c.veld}`, label: veiligeStr(c.label) || c.veld }));
  return items.length ? [{ groep: "Extra kolommen van de klantkaart", items }] : [];
}

/** Platte lijst met de lege keuze vooraan — voor code die niet in groepen denkt. */
export const BRONNEN = [{ key: "", label: "— niet automatisch —" }, ...BRONGROEPEN.flatMap((g) => g.items)];

const SOORT_LABEL = { tekst: "Tekst", memo: "Tekst (lang)", datum: "Datum", keuze: "Keuze", vink: "Aankruisvak", keuzelijst: "Keuzelijst" };

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

/** Een leesbaar label voor een veld: wat de beheerder instelde, anders de tooltip, anders de veldnaam. */
export function veldLabel(veld, eigen) {
  return veiligeStr(eigen && eigen.label) || veiligeStr(veld.tip) || veiligeStr(veld.naam);
}

/**
 * Een antwoord dat al vast staat. Bij formulieren die je vaak op dezelfde manier invult scheelt dat
 * per keer een handvol klikken: de kruisjes staan er al, je hoeft alleen nog de uitzonderingen om te
 * zetten. Werkt op aankruisvakken, keuzes en keuzelijsten; tekstvelden gebruiken hiervoor de bron
 * "Vaste tekst".
 */
function StandaardAntwoord({ veld, eigen, onZet }) {
  const huidig = eigen ? eigen.standaard : undefined;

  if (veld.soort === "vink") {
    return (
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 4, cursor: "pointer" }}>
        <input type="checkbox" checked={huidig === true} onChange={(e) => onZet(e.target.checked ? true : undefined)} style={{ width: 13, height: 13 }} />
        Staat standaard aangekruist
      </label>
    );
  }

  if (veld.soort === "keuzelijst") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10.5, color: KLEUR.mutedTekst }}>
        <span>Standaard</span>
        <select
          value={veiligeStr(huidig)}
          onChange={(e) => onZet(e.target.value || undefined)}
          style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "2px 5px", fontSize: 10.5, fontFamily: "inherit", maxWidth: 240, color: KLEUR.subtekst }}
        >
          <option value="">— niets vooraf —</option>
          {(veld.opties || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (veld.soort !== "keuze") return null;
  const labels = antwoordLabels(veld);
  // Let op: 0 is een geldige optie-index. Vergelijken op === zodat "geen standaard" en "optie 0"
  // uit elkaar blijven — precies de val waar dit formulier eerder al eens in trapte.
  const gekozen = huidig === undefined || huidig === null || huidig === "" ? null : Number(huidig);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10.5, color: KLEUR.mutedTekst }}>
      <span>Standaard</span>
      {labels.map((label, i) => {
        const aan = gekozen === i;
        return (
          <button
            key={i}
            onClick={() => onZet(aan ? undefined : i)}
            title={label}
            style={{
              padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, cursor: "pointer",
              maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              border: `1px solid ${aan ? KLEUR.groen : KLEUR.rand}`,
              background: aan ? KLEUR.groen : "#fff", color: aan ? "#fff" : KLEUR.subtekst,
            }}
          >
            {label}
          </button>
        );
      })}
      {gekozen === null && <span>— niets vooraf —</span>}
    </div>
  );
}

/**
 * "Toon alleen als …" onder een veld. Papieren formulieren springen: "Nee. Ga verder met vraag 3e".
 * Hier koppel je het overgeslagen blok aan de vraag die erover beslist. Kies eerst de stuurvraag,
 * dan bij welke antwoorden dit veld gesteld moet worden.
 *
 * Zolang je nog geen antwoord hebt aangevinkt blijft het veld gewoon zichtbaar — een vraag die per
 * ongeluk verdwijnt is vervelender dan een vraag die te veel gesteld wordt.
 */
function Voorwaarde({ veld, eigen, stuurVelden, instellingen, onZet }) {
  const toonAls = (eigen && eigen.toonAls) || {};
  const keuzes = stuurVelden.filter((s) => s.naam !== veld.naam);
  if (!keuzes.length) return null;
  const stuur = keuzes.find((s) => s.naam === toonAls.veld) || null;
  const gekozen = Array.isArray(toonAls.opties) ? toonAls.opties.map(Number) : [];
  const labels = antwoordLabels(stuur);

  const wissel = (i) => {
    const nieuw = gekozen.includes(i) ? gekozen.filter((n) => n !== i) : [...gekozen, i].sort((a, b) => a - b);
    onZet({ veld: stuur.naam, opties: nieuw });
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10.5, color: KLEUR.mutedTekst }}>
      <span>Toon alleen als</span>
      <select
        value={stuur ? stuur.naam : ""}
        onChange={(e) => onZet(e.target.value ? { veld: e.target.value, opties: [] } : null)}
        style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "2px 5px", fontSize: 10.5, fontFamily: "inherit", maxWidth: 260, color: KLEUR.subtekst }}
      >
        <option value="">— altijd tonen —</option>
        {keuzes.map((s) => (
          <option key={s.naam} value={s.naam}>
            {veldLabel(s, instellingen[s.naam]).slice(0, 70)}
          </option>
        ))}
      </select>
      {stuur && labels.map((label, i) => {
        const aan = gekozen.includes(i);
        return (
          <button
            key={i}
            onClick={() => wissel(i)}
            title={label}
            style={{
              padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, cursor: "pointer",
              maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`,
              background: aan ? KLEUR.blauw : "#fff", color: aan ? "#fff" : KLEUR.subtekst,
            }}
          >
            {label}
          </button>
        );
      })}
      {stuur && !gekozen.length && <span style={{ color: KLEUR.goud }}>kies nog bij welk antwoord</span>}
    </div>
  );
}

/**
 * ZBS — zonder begeleidend schrijven. Een voorblad op ons briefpapier met alleen het adres van de
 * ontvanger en één regel eronder. Handig bij formulieren die je in setjes opstuurt: de ontvanger ziet
 * van wie het komt en waarvoor het is, en verder staat er niets.
 */
function ZbsInstelling({ zbs, onZet }) {
  const z = zbs && typeof zbs === "object" ? zbs : {};
  const aan = z.aan === true;
  const adres = ["belastingkantoor", "klant", "vast"].includes(z.adres) ? z.adres : "belastingkantoor";
  const zet = (wijziging) => onZet({ aan, adres, vastAdres: z.vastAdres || "", regel: z.regel === undefined ? "Ter afwikkeling" : z.regel, ...wijziging });
  const invoerje = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 9px", fontSize: 12.5, fontFamily: "inherit" };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, background: "#FAFBF9" }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst, cursor: "pointer" }}>
        <input type="checkbox" checked={aan} onChange={(e) => zet({ aan: e.target.checked })} style={{ width: 15, height: 15 }} />
        ZBS-voorblad standaard meesturen
      </label>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
        Een vel op ons briefpapier met alleen het adres en één regel, vóór het formulier. Bij het
        invullen kun je het per keer nog aan- of uitzetten.
      </div>
      {aan && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          <div style={{ flex: "1 1 220px" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 3 }}>Adres</span>
            <select value={adres} onChange={(e) => zet({ adres: e.target.value })} style={invoerje}>
              <option value="belastingkantoor">Belastingkantoor van de cliënt</option>
              <option value="klant">De cliënt zelf</option>
              <option value="vast">Vast adres (hieronder)</option>
            </select>
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 3 }}>Regel onder het adres</span>
            <input value={z.regel === undefined ? "Ter afwikkeling" : z.regel} onChange={(e) => zet({ regel: e.target.value })} placeholder="Ter afwikkeling" style={invoerje} />
          </div>
          {adres === "vast" && (
            <div style={{ flex: "1 1 100%" }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 3 }}>Vast adres — één regel per regel</span>
              <textarea
                value={z.vastAdres || ""}
                onChange={(e) => zet({ vastAdres: e.target.value })}
                rows={4}
                placeholder={"Belastingdienst/Kantoor Almelo\nPostbus 8888\n7550 AB Almelo"}
                style={{ ...invoerje, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FormulierenBeheer() {
  const [formulieren, setFormulieren] = useState(null); // null = laden
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState(null); // { type, tekst }
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState("");           // welk formulier is uitgeklapt
  const [naam, setNaam] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [extraKolommen, setExtraKolommen] = useState([]); // eigen kolommen van het klantoverzicht
  const bestandRef = useRef(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  async function laad() {
    setFout("");
    try {
      const res = await fetch("/api/beheer-formulieren");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Kon de formulieren niet laden (${res.status}).`);
      if (levend.current) setFormulieren(Array.isArray(d.formulieren) ? d.formulieren : []);
    } catch (e) {
      if (levend.current) { setFormulieren([]); setFout(String(e.message || e)); }
    }
  }
  useEffect(() => { laad(); }, []);

  // De eigen kolommen die bij Beheer → Instellingen aan het klantoverzicht zijn toegevoegd; die
  // bieden we hieronder als bron aan. Lukt het ophalen niet, dan blijft die groep gewoon leeg.
  useEffect(() => {
    fetch("/api/beheer-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setExtraKolommen((d.klantoverzicht && d.klantoverzicht.extraKolommen) || []); })
      .catch(() => { if (levend.current) setExtraKolommen([]); });
  }, []);

  /** Het gekozen bestand als data-URL versturen; de server leest de velden eruit. */
  async function upload(bestand) {
    if (!bestand) return;
    if (!veiligeStr(naam)) { setMelding({ type: "fout", tekst: "Geef het formulier eerst een naam." }); return; }
    setBezig(true); setMelding(null);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const lezer = new FileReader();
        lezer.onload = () => res(String(lezer.result));
        lezer.onerror = rej;
        lezer.readAsDataURL(bestand);
      });
      const res = await fetch("/api/beheer-formulieren", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, omschrijving, dataUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Toevoegen mislukt (${res.status}).`);
      setMelding({
        type: "ok",
        tekst: `"${d.formulier.naam}" ${d.vervangen ? "vervangen" : "toegevoegd"} — ${(d.formulier.velden || []).filter((v) => !v.automatisch).length} invulbare velden gevonden op ${d.formulier.aantalPaginas} pagina's.`,
      });
      setNaam(""); setOmschrijving("");
      if (bestandRef.current) bestandRef.current.value = "";
      await laad();
      setOpen(d.formulier.id);
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) setBezig(false);
    }
  }

  async function bewaarInstellingen(formulier, instellingen) {
    // Optimistisch bijwerken: het scherm volgt meteen, de server loopt erachteraan.
    setFormulieren((lijst) => (lijst || []).map((f) => (f.id === formulier.id ? { ...f, instellingen } : f)));
    try {
      const res = await fetch("/api/beheer-formulieren", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formulier.id, instellingen }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Opslaan mislukt.");
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
      laad();
    }
  }

  /** ZBS-instellingen van een formulier opslaan (zelfde patroon als bewaarInstellingen). */
  async function bewaarZbs(formulier, zbs) {
    setFormulieren((lijst) => (lijst || []).map((f) => (f.id === formulier.id ? { ...f, zbs } : f)));
    try {
      const res = await fetch("/api/beheer-formulieren", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formulier.id, zbs }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Opslaan mislukt.");
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
      laad();
    }
  }

  /** De SharePoint-submap van dit formulier opslaan. */
  async function bewaarMap(formulier, map) {
    setFormulieren((lijst) => (lijst || []).map((f) => (f.id === formulier.id ? { ...f, map } : f)));
    try {
      const res = await fetch("/api/beheer-formulieren", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formulier.id, map }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Opslaan mislukt.");
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
      laad();
    }
  }

  async function verwijder(formulier) {
    if (typeof window !== "undefined" && !window.confirm(`"${formulier.naam}" verwijderen?\n\nHet blanco formulier en de instellingen verdwijnen. Al ingevulde formulieren in de dossiers blijven staan.`)) return;
    try {
      const res = await fetch(`/api/beheer-formulieren?id=${encodeURIComponent(formulier.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Verwijderen mislukt.");
      await laad();
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    }
  }

  const invoer = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit" };
  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          Voeg hier invulbare PDF-formulieren toe. Het portaal leest de velden er zelf uit; in het
          medewerkersportaal vul je ze in onder <strong>Klantoverzicht → Brieven → Formulieren</strong>,
          met de ingevulde PDF om af te drukken of in het dossier op te slaan.
          <div style={{ marginTop: 6 }}>
            Werkt niet met formulieren van Adobe LiveCycle (XFA) of met platte, gescande PDF's — daar
            zitten geen velden in. Je krijgt dat bij het uploaden meteen te horen.
          </div>
        </div>
      </div>

      {/* ── Nieuw formulier ── */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, background: "#fff", padding: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, marginBottom: 10 }}>Formulier toevoegen</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: "1 1 240px" }}>
            <span style={label}>Naam</span>
            <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Opgaaf startende onderneming" style={invoer} />
          </div>
          <div style={{ flex: "1 1 280px" }}>
            <span style={label}>Omschrijving (optioneel)</span>
            <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Waar dit formulier voor is" style={invoer} />
          </div>
        </div>
        <input
          ref={bestandRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => { const b = e.target.files && e.target.files[0]; if (b) upload(b); }}
          style={{ display: "none" }}
        />
        <button
          onClick={() => bestandRef.current && bestandRef.current.click()}
          disabled={bezig}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.6 : 1 }}
        >
          {bezig ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} {bezig ? "Bezig met inlezen…" : "PDF kiezen"}
        </button>
        <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
          Bestaat er al een formulier met dezelfde naam, dan wordt de PDF daarvan vervangen — handig bij
          een nieuwe jaargang. Wat je per veld hebt ingesteld blijft dan gewoon staan.
        </div>
        {melding && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, padding: "9px 11px", borderRadius: 8, fontSize: 12,
            background: melding.type === "ok" ? "#EAF6EE" : "#FDF2F2",
            border: `1px solid ${melding.type === "ok" ? "#BFE0CB" : KLEUR.rood}`,
            color: melding.type === "ok" ? KLEUR.groen : KLEUR.rood }}>
            {melding.type === "ok" ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{melding.tekst}</span>
          </div>
        )}
      </div>

      {/* ── Bestaande formulieren ── */}
      {fout && (
        <div style={{ display: "flex", gap: 8, padding: "9px 11px", background: "#FDF2F2", border: `1px solid ${KLEUR.rood}`, borderRadius: 8, fontSize: 12, color: KLEUR.rood }}>
          <AlertTriangle size={14} /> <span>{fout}</span>
        </div>
      )}

      {formulieren === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Formulieren ophalen…</div>
      ) : formulieren.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Er zijn nog geen formulieren toegevoegd.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {formulieren.map((f) => {
            const uit = open === f.id;
            const inst = (f.instellingen && typeof f.instellingen === "object") ? f.instellingen : {};
            const teVragen = (f.velden || []).filter((v) => !v.automatisch);
            const stuurVelden = stuurbareVelden(f.velden || []);
            const verborgen = teVragen.filter((v) => inst[v.naam] && inst[v.naam].verborgen).length;
            return (
              <div key={f.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                  <FileText size={15} color={KLEUR.blauw} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst }}>{f.naam}</div>
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
                      {teVragen.length} velden · {f.aantalPaginas} pagina's
                      {verborgen ? ` · ${verborgen} verborgen` : ""}
                      {veiligeStr(f.omschrijving) ? ` · ${f.omschrijving}` : ""}
                    </div>
                  </div>
                  <button onClick={() => setOpen(uit ? "" : f.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}>
                    <ChevronDown size={14} style={{ transform: uit ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} /> Velden
                  </button>
                  <button onClick={() => verwijder(f)} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Trash2 size={15} color={KLEUR.rood} />
                  </button>
                </div>

                {uit && (
                  <div style={{ borderTop: `1px solid ${KLEUR.rand}`, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>
                      Per veld kun je een eigen label geven, kiezen waarmee het automatisch gevuld wordt,
                      en het verbergen als je het nooit invult. Een verborgen veld komt ook niet op papier,
                      ook niet als er ooit iets is ingetikt. Automatisch vullen is een bewuste keuze per
                      veld: op één formulier hoort “KvK-nummer” op de ene plek bij de cliënt en op de
                      andere bij een vereffenaar, en dat kan het portaal niet voor je raden.
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ ...label, marginBottom: 3 }}>Opslaan in map</span>
                      <input
                        value={f.map !== undefined ? f.map : ""}
                        onChange={(e) => bewaarMap(f, e.target.value)}
                        placeholder="Correspondentie"
                        style={{ ...invoer, maxWidth: 360 }}
                      />
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 3 }}>
                        Submap in de SharePoint-map van de cliënt. Leeg = de algemene formulierenmap.
                        Een pad met schuine strepen mag ook (<em>Belastingdienst/Loonheffingen</em>);
                        ontbrekende mappen worden aangemaakt.
                      </div>
                    </div>
                    <ZbsInstelling
                      zbs={f.zbs}
                      onZet={(zbs) => bewaarZbs(f, zbs)}
                    />
                    {(f.velden || []).filter((v) => !v.automatisch).map((v) => {
                      const eigen = inst[v.naam] || {};
                      const isVerborgen = eigen.verborgen === true;
                      return (
                        <div key={v.naam} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${KLEUR.rand}`, opacity: isVerborgen ? 0.55 : 1 }}>
                          <div style={{ width: 44, flexShrink: 0, fontSize: 11, color: KLEUR.mutedTekst }}>p{v.pagina || "?"}</div>
                          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                            <input
                              value={eigen.label !== undefined ? eigen.label : ""}
                              onChange={(e) => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, label: e.target.value } })}
                              placeholder={veiligeStr(v.tip) || v.naam}
                              style={{ ...invoer, padding: "6px 9px", fontSize: 12.5 }}
                            />
                            <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.naam}
                              {v.max ? ` · ${v.max} tekens` : ""}
                              {(v.opties || []).length ? ` · ${v.opties.join(" / ")}` : ""}
                            </div>
                            <StandaardAntwoord
                              veld={v}
                              eigen={eigen}
                              onZet={(standaard) => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, standaard } })}
                            />
                            <Voorwaarde
                              veld={v}
                              eigen={eigen}
                              stuurVelden={stuurVelden}
                              instellingen={inst}
                              onZet={(toonAls) => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, toonAls } })}
                            />
                          </div>
                          <div style={{ width: 86, flexShrink: 0, fontSize: 11.5, color: KLEUR.subtekst }}>{SOORT_LABEL[v.soort] || v.soort}</div>
                          {/* Automatisch vullen kan alleen bij tekstvelden; bij een keuze of een
                              aankruisvak zou je moeten raden wat de bedoeling is. */}
                          <div style={{ width: 190, flexShrink: 0 }}>
                            {(v.soort === "tekst" || v.soort === "memo" || v.soort === "datum") ? (
                              <select
                                value={veiligeStr(eigen.bron)}
                                onChange={(e) => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, bron: e.target.value } })}
                                style={{ ...invoer, padding: "5px 7px", fontSize: 12 }}
                                title="Waarmee dit veld automatisch gevuld wordt bij het invullen"
                              >
                                <option value="">— niet automatisch —</option>
                                {[...BRONGROEPEN, ...extraKolomBronnen(extraKolommen)].map((g) => (
                                  <optgroup key={g.groep} label={g.groep}>
                                    {g.items.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                                  </optgroup>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>—</span>
                            )}
                            {veiligeStr(eigen.bron) === "vast" && (
                              <input
                                value={eigen.vast !== undefined ? eigen.vast : ""}
                                onChange={(e) => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, vast: e.target.value } })}
                                placeholder="Wat hier altijd moet staan"
                                style={{ ...invoer, padding: "5px 7px", fontSize: 12, marginTop: 4 }}
                              />
                            )}
                          </div>
                          <button
                            onClick={() => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, verborgen: !isVerborgen } })}
                            title={isVerborgen ? "Nu verborgen — klik om te tonen" : "Zichtbaar — klik om te verbergen"}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                          >
                            {isVerborgen ? <EyeOff size={15} color={KLEUR.mutedTekst} /> : <Eye size={15} color={KLEUR.blauw} />}
                          </button>
                        </div>
                      );
                    })}

                    {/* Velden die het formulier zelf zou invullen. */}
                    {(f.velden || []).some((v) => v.automatisch) && (
                      <div style={{ marginTop: 16, borderTop: `2px solid ${KLEUR.rand}`, paddingTop: 12 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst, marginBottom: 4 }}>
                          Velden die het formulier zelf invult
                        </div>
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>
                          Deze vakjes vult de PDF normaal zelf met zijn ingebouwde JavaScript — bijvoorbeeld
                          het bsn dat op de volgende pagina wordt herhaald. Dat script draait alleen in
                          Adobe Reader, niet bij ons, dus blijven ze anders leeg. Kies hier van welke vraag
                          zo'n vakje de waarde overneemt. Laat je het leeg, dan komt er niets te staan.
                        </div>
                        {(f.velden || []).filter((v) => v.automatisch).map((v) => {
                          const eigen = inst[v.naam] || {};
                          return (
                            <div key={v.naam} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                              <div style={{ width: 44, flexShrink: 0, fontSize: 11, color: KLEUR.mutedTekst }}>p{v.pagina || "?"}</div>
                              <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12.5, color: KLEUR.subtekst }}>
                                {veiligeStr(v.tip) || v.naam}
                                <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {v.naam}{v.max ? ` · ${v.max} tekens` : ""}
                                </div>
                              </div>
                              <div style={{ width: 276, flexShrink: 0 }}>
                                <select
                                  value={veiligeStr(eigen.overnemenVan)}
                                  onChange={(e) => bewaarInstellingen(f, { ...inst, [v.naam]: { ...eigen, overnemenVan: e.target.value } })}
                                  style={{ ...invoer, padding: "5px 7px", fontSize: 12 }}
                                  title="Van welke vraag dit vakje de waarde overneemt"
                                >
                                  <option value="">— leeg laten —</option>
                                  {(f.velden || [])
                                    .filter((b) => !b.automatisch && (b.soort === "tekst" || b.soort === "memo" || b.soort === "datum"))
                                    .map((b) => (
                                      <option key={b.naam} value={b.naam}>{veldLabel(b, inst[b.naam])}</option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes formspin{to{transform:rotate(360deg)}} .spin{animation:formspin 1s linear infinite}`}</style>
    </div>
  );
}
