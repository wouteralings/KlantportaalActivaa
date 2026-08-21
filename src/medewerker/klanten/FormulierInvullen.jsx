import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, FileText, Loader2, AlertTriangle, CheckCircle2, ArrowLeft, Printer, Save, RotateCcw, FolderInput, Mail } from "lucide-react";
import { veldLabel } from "../../beheer/FormulierenBeheer";
import { zichtbareVeldnamen, lijktOpIban, ibanTekst } from "../formulierVoorwaarden";

/**
 * Formulier invullen — medewerkersportaal → Klantoverzicht → Brieven → Formulieren.
 *
 * Kies een cliënt en een formulier, vul de velden in, en je krijgt de ingevulde PDF om af te drukken
 * of in het dossier op te slaan. De velden komen uit de PDF zelf (uitgelezen bij het toevoegen in
 * Beheer → Formulieren), gegroepeerd per pagina, in de volgorde van het papier.
 *
 * Wat er automatisch gevuld wordt bepaal je in Beheer, per veld. Er wordt niets geraden op basis van
 * veldnamen: op één formulier hoort "KvK-nummer" op de ene plek bij de cliënt en op de andere bij een
 * vereffenaar of een overnemer, en verkeerd voorvullen is erger dan niet voorvullen.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

/** De gekozen optie-index, of null. Number("") is 0, dus leeg mag nooit als "eerste optie" gelden. */
function gekozenOptie(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = Number(waarde);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Adres van de cliënt als één regel. */
function adresRegel(adres) {
  const a = adres || {};
  const straat = [veiligeStr(a.straat), [veiligeStr(a.huisnummer), veiligeStr(a.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" ");
  const plaats = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ");
  return [straat, plaats].filter(Boolean).join(", ");
}

/**
 * Het adres van ons kantoor staat in Beheer → Instellingen als één regel ("Hengelosestraat 100 A").
 * Formulieren hebben er vaak drie hokjes voor. We knippen op het laatste getal in de regel: alles
 * ervoor is de straatnaam, het getal is het huisnummer, wat erachter staat de toevoeging. Zit er
 * geen getal in, dan blijft de hele regel de straatnaam — liever niets dan iets verzonnens.
 */
function splitsAdresregel(regel) {
  const t = veiligeStr(regel);
  const m = /^(.*?)[\s,]+(\d+)\s*-?\s*([A-Za-z0-9-]*)$/.exec(t);
  if (!m) return { straat: t, huisnummer: "", toevoeging: "" };
  return { straat: m[1].trim(), huisnummer: m[2], toevoeging: m[3] };
}

/**
 * Fiscale nummers bestaan uit een hoofdnummer en een subnummer, gescheiden door een letter:
 * "NL8529.21.743.B01" en "123456789L02". Formulieren hebben er twee hokjes voor, met de letter al
 * voorgedrukt. Deze functie geeft het deel vóór de letter (negen cijfers) of het subnummer erna.
 *
 * De Belastingdienst rekent zelf ook zo: vraag 1c van de Melding Loonheffingen zegt "u mag ook uw
 * omzetbelastingnummer invullen, het deel van het nummer voor de letter B".
 */
function nummerdeel(nummer, letter, welk) {
  const t = veiligeStr(nummer).toUpperCase();
  const stukken = t.split(letter);
  if (welk === "hoofd") {
    const cijfers = stukken[0].replace(/\D/g, "");
    return cijfers.length === 9 ? cijfers : "";
  }
  if (stukken.length < 2) return "";
  const sub = stukken[1].replace(/\D/g, "");
  return sub ? sub.slice(0, 2) : "";
}

/**
 * De waarde die bij een bron hoort. Welke bron een veld gebruikt staat in Beheer → Formulieren,
 * per veld ingesteld. Bewust geen raadwerk op veldnamen: op één formulier hoort
 * "KvK-nummer" op de ene plek bij de cliënt en op de andere bij een vereffenaar of een overnemer.
 *
 * `afzender` zijn onze eigen kantoorgegevens uit Beheer → Instellingen; formulieren vragen die als
 * gemachtigde of correspondentieadres.
 */
function waardeUitBron(bron, klant, afzender, belastingkantoor, vast) {
  if (!bron) return "";
  const a = afzender || {};
  if (bron === "vandaag") return new Date().toISOString().slice(0, 10);
  // Vaste tekst: wat de beheerder bij dit veld heeft ingetikt. Handig voor een adres dat op dit
  // formulier altijd hetzelfde is, ongeacht welke cliënt het betreft.
  if (bron === "vast") return veiligeStr(vast);
  if (bron.startsWith("bk")) {
    const bk = belastingkantoor || {};
    const adres = bk.adres || {};
    switch (bron) {
      case "bknaam": return veiligeStr(bk.naam);
      case "bkadres": return adresRegel(adres);
      case "bkstraatnaam": return veiligeStr(adres.straat);
      case "bkhuisnummer": return veiligeStr(adres.huisnummer);
      case "bktoevoeging": return veiligeStr(adres.toevoeging);
      case "bkpostcode": return veiligeStr(adres.postcode);
      case "bkplaats": return veiligeStr(adres.plaats);
      default: return "";
    }
  }
  if (bron.startsWith("kantoor") || bron === "beconnummer") {
    const eigen = splitsAdresregel(a.adres);
    switch (bron) {
      case "kantoornaam": return veiligeStr(a.bedrijfsnaam);
      case "beconnummer": return veiligeStr(a.beconnummer);
      case "kantooradres": return veiligeStr(a.adres);
      case "kantoorstraatnaam": return eigen.straat;
      case "kantoorhuisnummer": return eigen.huisnummer;
      case "kantoortoevoeging": return eigen.toevoeging;
      case "kantoorpostcode": return veiligeStr(a.postcode);
      case "kantoorplaats": return veiligeStr(a.plaats);
      case "kantoortelefoon": return veiligeStr(a.telefoon);
      case "kantooremail": return veiligeStr(a.email);
      case "kantoorkvk": return veiligeStr(a.kvk);
      case "kantoorbtw": return veiligeStr(a.btw);
      case "kantooriban": return veiligeStr(a.iban);
      default: return "";
    }
  }
  if (!klant) return "";
  // Een eigen kolom van het klantoverzicht (Beheer → Instellingen): zo komen bsn, IBAN en wat je
  // verder aan Dynamics-velden toevoegt hier binnen zonder dat er code bij hoeft.
  if (bron.startsWith("extra:")) return veiligeStr((klant.extra || {})[bron.slice(6)]);
  const adres = klant.adres || {};
  const contact = klant.contact || {};
  switch (bron) {
    case "klantnaam": return veiligeStr(klant.klantnaam);
    case "kvk": return veiligeStr(klant.kvk);
    case "bsn": return veiligeStr(klant.bsn);
    case "iban": return veiligeStr(klant.iban);
    case "btwnummer": return veiligeStr(klant.btwnummer);
    case "rsin": return nummerdeel(klant.btwnummer, "B", "hoofd");
    case "btwsubnummer": return nummerdeel(klant.btwnummer, "B", "sub");
    case "loonheffingsnummer": return veiligeStr(klant.loonheffingsnummer);
    case "loonheffingsnummerdeel": return nummerdeel(klant.loonheffingsnummer, "L", "hoofd");
    case "loonheffingssubnummer": return nummerdeel(klant.loonheffingsnummer, "L", "sub");
    case "adres": return adresRegel(adres);
    case "straat": return [veiligeStr(adres.straat), [veiligeStr(adres.huisnummer), veiligeStr(adres.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" ");
    case "straatnaam": return veiligeStr(adres.straat);
    case "huisnummer": return veiligeStr(adres.huisnummer);
    case "toevoeging": return veiligeStr(adres.toevoeging);
    case "huisnummertoevoeging": return [veiligeStr(adres.huisnummer), veiligeStr(adres.toevoeging)].filter(Boolean).join("");
    case "postcode": return veiligeStr(adres.postcode);
    case "plaats": return veiligeStr(adres.plaats);
    case "land": return veiligeStr(adres.land);
    case "contactnaam": return veiligeStr(contact.naam);
    case "contactemail": return veiligeStr(contact.email) || veiligeStr(klant.emailKlant);
    case "contacttelefoon": return veiligeStr(contact.telefoon);
    default: return "";
  }
}

export default function FormulierInvullen({ onTerug }) {
  const [formulieren, setFormulieren] = useState(null);
  const [formulierId, setFormulierId] = useState("");
  const [formulier, setFormulier] = useState(null); // met velden en instellingen
  const [klanten, setKlanten] = useState([]);
  const [afzender, setAfzender] = useState(null); // onze eigen kantoorgegevens
  const [belastingkantoor, setBelastingkantoor] = useState(null); // van de gekozen cliënt
  const [klant, setKlant] = useState(null);
  const [zoek, setZoek] = useState("");
  const [antwoorden, setAntwoorden] = useState({});
  const [bezig, setBezig] = useState(""); // "" | welke actie er loopt
  const [melding, setMelding] = useState(null);
  const [voorbeeldUrl, setVoorbeeldUrl] = useState("");
  const [zbsAan, setZbsAan] = useState(false); // voorblad zonder begeleidend schrijven
  const [zbsBron, setZbsBron] = useState("");   // "" = zoals in Beheer ingesteld
  const [zbsEigenRegels, setZbsEigenRegels] = useState(null); // niet-null = zelf aangepast
  const [naar, setNaar] = useState("");
  const [mailModal, setMailModal] = useState(null); // { onderwerp, tekst, cc, bijlage }
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  useEffect(() => {
    fetch("/api/medewerker-formulier")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setFormulieren(Array.isArray(d.formulieren) ? d.formulieren : []); })
      .catch(() => { if (levend.current) setFormulieren([]); });
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(Array.isArray(d.klanten) ? d.klanten : []); })
      .catch(() => { if (levend.current) setKlanten([]); });
    // Onze eigen kantoorgegevens (naam, adres, beconnummer) uit Beheer → Instellingen: formulieren
    // vragen die als gemachtigde of correspondentieadres. Lukt het niet, dan blijven die bronnen
    // gewoon leeg — het formulier zelf werkt er niet minder om.
    fetch("/api/brief-sjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setAfzender((d && d.afzender) || null); })
      .catch(() => { if (levend.current) setAfzender(null); });
  }, []);

  // Het belastingkantoor dat aan deze cliënt hangt, met adres. Dezelfde bron als de Brieven-module
  // gebruikt voor een brief aan de Belastingdienst. Best-effort: lukt het niet, dan blijven die
  // bronnen leeg en tik je het adres zelf.
  useEffect(() => {
    if (!klant) { setBelastingkantoor(null); return; }
    fetch(`/api/brief-geadresseerde?accountId=${encodeURIComponent(klant.accountId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setBelastingkantoor(d && d.gekoppeld ? d : null); })
      .catch(() => { if (levend.current) setBelastingkantoor(null); });
  }, [klant]);

  // Het gekozen formulier ophalen mét zijn velden.
  useEffect(() => {
    if (!formulierId) { setFormulier(null); return; }
    setFormulier(null);
    fetch(`/api/medewerker-formulier?id=${encodeURIComponent(formulierId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setFormulier(d.formulier || null); })
      .catch(() => { if (levend.current) setMelding({ type: "fout", tekst: "Kon het formulier niet ophalen." }); });
  }, [formulierId]);

  // Het formulier bepaalt of het ZBS-voorblad standaard meegaat; per keer kun je het omzetten.
  useEffect(() => {
    setZbsAan(!!(formulier && formulier.zbs && formulier.zbs.aan));
    setZbsBron("");
    setZbsEigenRegels(null);
  }, [formulier]);

  // Mailadres van de cliënt voorstellen zodra die gekozen is.
  useEffect(() => {
    if (!klant) { setNaar(""); return; }
    setNaar(veiligeStr(klant.contact && klant.contact.email) || veiligeStr(klant.emailKlant));
  }, [klant]);

  // De adresregels voor het voorblad, uit de bron die bij dit formulier is ingesteld.
  const zbsAdresRegels = useMemo(() => {
    const z = (formulier && formulier.zbs) || {};
    const bron = zbsBron || z.adres || "belastingkantoor";
    if (bron === "vast") return String(z.vastAdres || "").split("\n").map(veiligeStr).filter(Boolean);
    if (bron === "klant") {
      if (!klant) return [];
      const a = klant.adres || {};
      return [
        veiligeStr(klant.klantnaam),
        [veiligeStr(a.straat), [veiligeStr(a.huisnummer), veiligeStr(a.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" "),
        [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" "),
      ].filter(Boolean);
    }
    if (!belastingkantoor) return [];
    const a = belastingkantoor.adres || {};
    if (veiligeStr(belastingkantoor.adresTekst)) {
      return [veiligeStr(belastingkantoor.naam), ...String(belastingkantoor.adresTekst).split("\n").map(veiligeStr)].filter(Boolean);
    }
    return [
      veiligeStr(belastingkantoor.naam),
      [veiligeStr(a.straat), [veiligeStr(a.huisnummer), veiligeStr(a.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" "),
      [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" "),
    ].filter(Boolean);
  }, [formulier, klant, belastingkantoor, zbsBron]);

  // Wat er op het voorblad komt: de bron uit Beheer of je eigen keuze, tenzij je de regels zelf hebt
  // aangepast — dan blijft jouw versie staan tot je op "Herstellen" klikt.
  const zbsRegels = zbsEigenRegels === null ? zbsAdresRegels : zbsEigenRegels;

  const treffers = useMemo(() => {
    const t = zoek.trim().toLowerCase();
    if (!t) return [];
    return (klanten || []).filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [klanten, zoek]);

  // De zichtbare velden, gegroepeerd per pagina zoals ze op papier staan.
  const paginas = useMemo(() => {
    if (!formulier) return [];
    const inst = (formulier.instellingen && typeof formulier.instellingen === "object") ? formulier.instellingen : {};
    // Velden die het formulier zelf invult (alleen-lezen in de PDF) stellen we niet als vraag; die
    // krijgen hun waarde van het veld dat er in Beheer aan gekoppeld is. En een veld met een
    // voorwaarde ("toon alleen als vraag 1a op Nee staat") verschijnt pas als die klopt — vandaar dat
    // dit meerekent met de antwoorden en niet alleen met het formulier.
    const gevraagd = zichtbareVeldnamen(formulier.velden || [], inst, antwoorden);
    const zichtbaar = (formulier.velden || []).filter((v) => gevraagd.has(v.naam));
    const per = new Map();
    for (const v of zichtbaar) {
      const nr = v.pagina || 0;
      if (!per.has(nr)) per.set(nr, []);
      per.get(nr).push({ ...v, label: veldLabel(v, inst[v.naam]) });
    }
    return [...per.entries()].sort((a, b) => a[0] - b[0]).map(([nr, velden]) => ({ nr, velden }));
  }, [formulier, antwoorden]);

  // Voorvullen zodra cliënt én formulier bekend zijn. Alleen velden die nog leeg zijn — wat jij
  // intikt blijft altijd staan.
  useEffect(() => {
    if (!formulier || (!klant && !afzender)) return;
    setAntwoorden((huidig) => {
      const nieuw = { ...huidig };
      const inst = (formulier.instellingen && typeof formulier.instellingen === "object") ? formulier.instellingen : {};
      for (const v of formulier.velden || []) {
        if (v.automatisch) continue;
        if (veiligeStr(nieuw[v.naam])) continue;
        const eigen = inst[v.naam] || {};
        const voorstel = waardeUitBron(eigen.bron, klant, afzender, belastingkantoor, eigen.vast);
        if (voorstel) nieuw[v.naam] = voorstel;
      }
      return nieuw;
    });
  }, [formulier, klant, afzender, belastingkantoor]);

  function zet(naam, waarde) { setAntwoorden((a) => ({ ...a, [naam]: waarde })); }

  // Zodra je uit een veld klikt waar een rekeningnummer in staat, zetten we het netjes in groepjes
  // van vier — zoals je een IBAN schrijft. Op papier haalt de vuller de spaties er weer uit als het
  // veld uit losse hokjes bestaat; daar zou een spatie het nummer scheeftrekken.
  function netjes(naam, waarde) {
    if (!lijktOpIban(waarde)) return;
    const mooi = ibanTekst(waarde, false);
    if (mooi !== veiligeStr(waarde)) zet(naam, mooi);
  }

  /** Mailvenster openen met een voorstel voor onderwerp en tekst. */
  function openMail() {
    if (!formulier) return;
    setMailModal({
      onderwerp: `${formulier.naam}${klant ? ` — ${veiligeStr(klant.klantnaam)}` : ""}`,
      tekst: `Bijgaand ontvangt u het formulier ${formulier.naam}.`,
      cc: "",
      bijlage: null,
      voorblad: zbsAan,
    });
  }

  /** Een extra bestand als bijlage meesturen. */
  function kiesBijlage(bestand) {
    if (!bestand) { setMailModal((m) => ({ ...m, bijlage: null })); return; }
    const lezer = new FileReader();
    lezer.onload = () => setMailModal((m) => ({ ...m, bijlage: { naam: bestand.name, contentType: bestand.type || "application/octet-stream", dataUrl: String(lezer.result) } }));
    lezer.readAsDataURL(bestand);
  }

  async function maak(actie) {
    if (!formulier) { setMelding({ type: "fout", tekst: "Kies eerst een formulier." }); return; }
    if (actie !== "maken" && !klant) { setMelding({ type: "fout", tekst: "Kies eerst een cliënt." }); return; }
    if (actie === "mail" && !veiligeStr(naar)) { setMelding({ type: "fout", tekst: "Vul een e-mailadres in om het formulier naartoe te sturen." }); return; }
    setBezig(actie); setMelding(null);
    try {
      const res = await fetch("/api/medewerker-formulier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: formulier.id, antwoorden,
          accountId: klant ? klant.accountId : "",
          klantnaam: klant ? veiligeStr(klant.klantnaam) : "",
          klantnummer: klant ? (klant.klantnummer ?? "") : "",
          actie,
          ...(actie === "mail" && mailModal ? {
            naar: veiligeStr(naar),
            cc: veiligeStr(mailModal.cc).split(/[;,]/).map((x) => x.trim()).filter(Boolean),
            mailOnderwerp: veiligeStr(mailModal.onderwerp),
            mailTekst: mailModal.tekst,
            ...(mailModal.bijlage ? { bijlage: mailModal.bijlage } : {}),
          } : {}),
          ...((actie === "mail" && mailModal ? mailModal.voorblad : zbsAan)
            ? { zbs: { adresRegels: zbsRegels, regel: (formulier.zbs && formulier.zbs.regel) || "" } }
            : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Formulier maken mislukt (${res.status}).`);
      const bytes = Uint8Array.from(atob(d.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setVoorbeeldUrl((oud) => { if (oud) URL.revokeObjectURL(oud); return url; });
      if (actie === "maken" && typeof window !== "undefined") window.open(url, "_blank");
      const zbsStaart = d.zbs && !d.zbs.gedaan ? ` Het ZBS-voorblad is niet meegekomen: ${d.zbs.reden || "onbekende reden"}.` : "";
      const staart = d.sharepoint
        ? (d.sharepoint.gedaan ? " Het staat in de SharePoint-map van de cliënt." : ` Let op: opslaan in SharePoint lukte niet (${d.sharepoint.reden || "onbekende reden"}).`)
        : "";
      const boStaart = d.backoffice
        ? (d.backoffice.gedaan ? " De backoffice heeft een taak gekregen om te printen en te versturen." : ` Let op: de backoffice-taak is niet aangemaakt (${d.backoffice.reden || "onbekende reden"}).`)
        : "";
      const mailStaart = d.mail
        ? (d.mail.verzonden ? ` Gemaild naar ${veiligeStr(naar)}.` : ` Mailen mislukt: ${d.mail.reden || "onbekende reden"}.`)
        : "";
      const kenmerkStaart = d.kenmerk ? ` Kenmerk ${d.kenmerk}.` : "";
      const misgegaan = (d.sharepoint && !d.sharepoint.gedaan) || (d.zbs && !d.zbs.gedaan)
        || (d.backoffice && !d.backoffice.gedaan) || (d.mail && !d.mail.verzonden);
      setMelding({ type: misgegaan ? "fout" : "ok", tekst: `${d.bestandsnaam} klaar.${kenmerkStaart}${staart}${boStaart}${mailStaart}${zbsStaart}` });
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) { setBezig(""); if (actie === "mail") setMailModal(null); }
    }
  }

  useEffect(() => () => { if (voorbeeldUrl) URL.revokeObjectURL(voorbeeldUrl); }, [voorbeeldUrl]);

  const invoer = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit" };
  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".03em" };
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {onTerug && (
          <button onClick={onTerug} style={{ ...knopLicht, padding: "7px 11px" }}><ArrowLeft size={14} /> Terug</button>
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: KLEUR.tekst }}>Formulier invullen</div>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
            De velden komen uit het formulier zelf. Wat we van de cliënt weten vullen we alvast in;
            de rest tik je hier. Ondertekenen blijft met pen.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: "1 1 460px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cliënt */}
          <div>
            <span style={label}>Cliënt</span>
            {klant ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{veiligeStr(klant.klantnaam)}</span>
                <button onClick={() => { setKlant(null); setZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een cliënt…" style={{ ...invoer, padding: "9px 11px 9px 32px" }} />
                </div>
                {treffers.length > 0 && (
                  <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
                    {treffers.map((k) => (
                      <button key={k.accountId} onClick={() => { setKlant(k); setZoek(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", fontSize: 13 }}>
                        {veiligeStr(k.klantnaam)}
                        {veiligeStr(k.klantnummer) && <span style={{ color: KLEUR.mutedTekst, fontSize: 11.5 }}>  ·  nr {k.klantnummer}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                  Zonder cliënt kun je het formulier ook invullen — je kunt het dan alleen niet in een dossier opslaan.
                </div>
              </>
            )}
          </div>

          {/* Formulier */}
          <div>
            <span style={label}>Formulier</span>
            {formulieren === null ? (
              <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Formulieren ophalen…</div>
            ) : formulieren.length === 0 ? (
              <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>
                Er zijn nog geen formulieren toegevoegd. Dat doe je bij <strong>Beheer → Formulieren</strong>.
              </div>
            ) : (
              <select value={formulierId} onChange={(e) => { setFormulierId(e.target.value); setAntwoorden({}); }} style={invoer}>
                <option value="">— kies een formulier —</option>
                {formulieren.map((f) => (
                  <option key={f.id} value={f.id}>{f.naam}{f.aantalVelden ? ` (${f.aantalVelden} velden)` : ""}</option>
                ))}
              </select>
            )}
          </div>

          {/* De velden, per pagina */}
          {formulierId && !formulier && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Velden ophalen…</div>}
          {formulier && paginas.map((p) => (
            <div key={p.nr}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ ...label, marginBottom: 0 }}>Pagina {p.nr || "?"}</span>
                <div style={{ flex: 1, borderTop: `1px solid ${KLEUR.rand}` }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {p.velden.map((v) => {
                  const waarde = antwoorden[v.naam];
                  // Hokjesvelden hebben een maximum: postcode 6, bsn 9, telefoon 10. We kappen bij
                  // het vullen zo nodig af, maar dan wil je dat hier zien en niet pas op papier.
                  const teLang = v.max ? Math.max(0, veiligeStr(waarde).replace(/[\s.\-/]/g, "").length - v.max) : 0;
                  return (
                    <div key={v.naam}>
                      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 4 }}>
                        {v.label}
                        {v.max ? <span style={{ color: KLEUR.mutedTekst, fontWeight: 400 }}>  ·  {v.max} tekens</span> : null}
                      </div>
                      {v.soort === "datum" ? (
                        <input type="date" value={veiligeStr(waarde).slice(0, 10)} onChange={(e) => zet(v.naam, e.target.value)} style={{ ...invoer, maxWidth: 200 }} />
                      ) : v.soort === "keuze" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(v.opties || []).map((optie, i) => {
                            const gekozen = gekozenOptie(waarde) === i;
                            return (
                              <button
                                key={i}
                                onClick={() => zet(v.naam, gekozen ? "" : i)}
                                style={{
                                  padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  border: `1px solid ${gekozen ? KLEUR.blauw : KLEUR.rand}`,
                                  background: gekozen ? KLEUR.blauw : "#fff", color: gekozen ? "#fff" : KLEUR.subtekst,
                                }}
                              >
                                {veiligeStr(optie) || `Optie ${i + 1}`}
                              </button>
                            );
                          })}
                        </div>
                      ) : v.soort === "vink" ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                          <input type="checkbox" checked={waarde === true} onChange={(e) => zet(v.naam, e.target.checked)} style={{ width: 15, height: 15 }} />
                          <span>Aankruisen</span>
                        </label>
                      ) : v.soort === "keuzelijst" ? (
                        <select value={veiligeStr(waarde)} onChange={(e) => zet(v.naam, e.target.value)} style={invoer}>
                          <option value="">— niet ingevuld —</option>
                          {(v.opties || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : v.soort === "memo" ? (
                        <textarea value={veiligeStr(waarde)} onChange={(e) => zet(v.naam, e.target.value)} rows={2} style={{ ...invoer, resize: "vertical", lineHeight: 1.4 }} />
                      ) : (
                        <input
                          value={veiligeStr(waarde)}
                          onChange={(e) => zet(v.naam, e.target.value)}
                          onBlur={(e) => netjes(v.naam, e.target.value)}
                          style={{ ...invoer, borderColor: teLang ? KLEUR.rood : KLEUR.rand }}
                        />
                      )}
                      {teLang > 0 && (
                        <div style={{ fontSize: 11, color: KLEUR.rood, marginTop: 3 }}>
                          Past niet: er is plaats voor {v.max} tekens, de laatste {teLang} {teLang === 1 ? "valt" : "vallen"} eraf.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {formulier && formulier.zbs && (
            <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", background: "#FAFBF9" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <input type="checkbox" checked={zbsAan} onChange={(e) => setZbsAan(e.target.checked)} style={{ width: 15, height: 15 }} />
                Voorblad meesturen (zonder begeleidend schrijven)
              </label>
              {zbsAan && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, color: KLEUR.subtekst }}>Adres</span>
                    <select
                      value={zbsBron || (formulier.zbs.adres || "belastingkantoor")}
                      onChange={(e) => { setZbsBron(e.target.value); setZbsEigenRegels(null); }}
                      style={{ ...invoer, width: "auto", padding: "5px 8px", fontSize: 12 }}
                    >
                      <option value="belastingkantoor">Belastingkantoor van de cliënt</option>
                      <option value="klant">De cliënt zelf</option>
                      <option value="vast">Vast adres uit Beheer</option>
                    </select>
                    {zbsEigenRegels !== null && (
                      <button onClick={() => setZbsEigenRegels(null)} style={{ ...knopLicht, padding: "4px 9px", fontSize: 11.5 }}>
                        <RotateCcw size={13} /> Herstellen
                      </button>
                    )}
                  </div>
                  {/* Het adres blijft aanpasbaar: soms moet een formulier naar een ander kantoor dan
                      wat er in Dynamics staat, en dan wil je dat hier kunnen overtypen. */}
                  <textarea
                    value={zbsRegels.join("\n")}
                    onChange={(e) => setZbsEigenRegels(e.target.value.split("\n"))}
                    rows={4}
                    placeholder={"Belastingdienst/Kantoor Almelo\nPostbus 8888\n7550 AB Almelo"}
                    style={{ ...invoer, marginTop: 6, maxWidth: 380, resize: "vertical", lineHeight: 1.4 }}
                  />
                  {veiligeStr(formulier.zbs.regel) && (
                    <div style={{ marginTop: 4, fontSize: 12, color: KLEUR.subtekst }}>
                      Onder het adres komt: <strong>{formulier.zbs.regel}</strong>
                    </div>
                  )}
                  {!zbsRegels.filter(Boolean).length && (
                    <div style={{ marginTop: 4, fontSize: 11.5, color: KLEUR.rood }}>
                      Nog geen adres — kies een andere bron of tik het hierboven zelf in.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dezelfde rij als onder een brief: maken, in het dossier, naar de backoffice, mailen. */}
          {formulier && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
              <div>
                <span style={label}>E-mailadres voor "Mailen"</span>
                <input value={naar} onChange={(e) => setNaar(e.target.value)} placeholder="naam@bedrijf.nl" style={{ ...invoer, maxWidth: 320 }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button onClick={() => maak("maken")} disabled={!!bezig} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: "none", background: KLEUR.groen, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.6 : 1 }}>
                  {bezig === "maken" ? <Loader2 size={15} className="spin" /> : <Printer size={15} />} PDF maken
                </button>
                <button onClick={() => maak("dossier")} disabled={!!bezig || !klant} style={{ ...knopLicht, opacity: bezig || !klant ? 0.6 : 1 }}>
                  {bezig === "dossier" ? <Loader2 size={15} className="spin" /> : <Save size={15} />} In klantdossier
                </button>
                <button
                  onClick={() => maak("backoffice")}
                  disabled={!!bezig || !klant}
                  title="Zet het formulier in het klantdossier en maak een taak voor de backoffice om te printen en te versturen"
                  style={{ ...knopLicht, opacity: bezig || !klant ? 0.6 : 1 }}
                >
                  {bezig === "backoffice" ? <Loader2 size={15} className="spin" /> : <FolderInput size={15} />} Naar backoffice
                </button>
                <button onClick={openMail} disabled={!!bezig || !klant || !veiligeStr(naar)} style={{ ...knopLicht, opacity: bezig || !klant || !veiligeStr(naar) ? 0.6 : 1 }}>
                  {bezig === "mail" ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Mailen naar klant
                </button>
                <button onClick={() => setAntwoorden({})} style={{ ...knopLicht }}>
                  <RotateCcw size={15} /> Leegmaken
                </button>
              </div>
            </div>
          )}

          {melding && (
            <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: 8, fontSize: 12,
              background: melding.type === "ok" ? "#EAF6EE" : "#FDF2F2",
              border: `1px solid ${melding.type === "ok" ? "#BFE0CB" : KLEUR.rood}`,
              color: melding.type === "ok" ? KLEUR.groen : KLEUR.rood }}>
              {melding.type === "ok" ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span>{melding.tekst}</span>
            </div>
          )}
        </div>

        {/* Voorbeeld van de ingevulde PDF */}
        <div style={{ flex: "1 1 480px", minWidth: 340 }}>
          <span style={label}>Voorbeeld</span>
          {voorbeeldUrl ? (
            <iframe title="Ingevuld formulier" src={voorbeeldUrl} style={{ width: "100%", height: 720, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, background: "#fff" }} />
          ) : (
            <div style={{ border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: "40px 20px", textAlign: "center", color: KLEUR.mutedTekst, fontSize: 12.5, background: "#FAFBF9" }}>
              <FileText size={22} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>Klik op “Formulier maken” — het ingevulde formulier verschijnt hier én in een nieuw tabblad.</div>
            </div>
          )}
        </div>
      </div>
      {/* Mailvenster: wie het krijgt, wat erin staat en wat er meegaat. */}
      {mailModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: "min(620px, 100%)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: KLEUR.tekst, marginBottom: 12 }}>Formulier mailen</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: "1 1 240px" }}>
                <span style={label}>Aan</span>
                <input value={naar} onChange={(e) => setNaar(e.target.value)} style={invoer} />
              </div>
              <div style={{ flex: "1 1 240px" }}>
                <span style={label}>Cc (optioneel)</span>
                <input value={mailModal.cc} onChange={(e) => setMailModal((m) => ({ ...m, cc: e.target.value }))} placeholder="meerdere adressen met een komma" style={invoer} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <span style={label}>Onderwerp</span>
              <input value={mailModal.onderwerp} onChange={(e) => setMailModal((m) => ({ ...m, onderwerp: e.target.value }))} style={invoer} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={label}>Bericht</span>
              <textarea value={mailModal.tekst} onChange={(e) => setMailModal((m) => ({ ...m, tekst: e.target.value }))} rows={5} style={{ ...invoer, resize: "vertical", lineHeight: 1.5 }} />
            </div>

            <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14, background: "#FAFBF9" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>Wat gaat er mee</div>
              <div style={{ fontSize: 12.5, color: KLEUR.tekst, marginBottom: 6 }}>
                <CheckCircle2 size={13} color={KLEUR.groen} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Het ingevulde formulier als PDF
              </div>
              {formulier && formulier.zbs && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", marginBottom: 6 }}>
                  <input type="checkbox" checked={!!mailModal.voorblad} onChange={(e) => setMailModal((m) => ({ ...m, voorblad: e.target.checked }))} style={{ width: 15, height: 15 }} />
                  Voorblad (ZBS) als eerste pagina
                </label>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input type="file" onChange={(e) => kiesBijlage(e.target.files && e.target.files[0])} style={{ fontSize: 12 }} />
                {mailModal.bijlage && (
                  <button onClick={() => kiesBijlage(null)} style={{ ...knopLicht, padding: "4px 9px", fontSize: 11.5 }}><X size={13} /> Weghalen</button>
                )}
              </div>
              <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>Optioneel: nog een bestand meesturen.</div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setMailModal(null)} disabled={bezig === "mail"} style={{ ...knopLicht, opacity: bezig === "mail" ? 0.6 : 1 }}>Annuleren</button>
              <button
                onClick={() => maak("mail")}
                disabled={bezig === "mail" || !veiligeStr(naar)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 8, border: "none", background: KLEUR.groen, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: bezig === "mail" || !veiligeStr(naar) ? 0.6 : 1 }}
              >
                {bezig === "mail" ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Versturen
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes forminvulspin{to{transform:rotate(360deg)}} .spin{animation:forminvulspin 1s linear infinite}`}</style>
    </div>
  );
}
