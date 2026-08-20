import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Printer, Copy, CheckCircle2, AlertTriangle, ArrowLeft, Plus, Trash2, Users, RotateCcw, ChevronDown,
  Save, Loader2, FileText, Mail, FileSignature, Lock, Info,
} from "lucide-react";
import { ontleedDocument, heeftEigenKop, blokkenNaarHtml, AFDRUK_CSS } from "../documentOpmaak";
import { haalBesluitUitTekst } from "../../beheer/notulenSjablonen";
import { steltLiquidatieSamen as steltStukSamen, LIQUIDATIE_KOP, LIQUIDATIE_STAART } from "../../beheer/liquidatieSjablonen";
import { zichtbareSecties as formulierSecties, ontbrekend as formulierOntbrekend, vulVoor as formulierVulVoor } from "../kvkFormulier17a";
import { BALANS_ACTIVA, BALANS_PASSIVA, RESULTAAT, berekenCijfers, balansVerschil, bedragTekst as cijferTekst, INVULSLEUTELS } from "../liquidatieCijfers";
import { useMijnNaam } from "../MijnFilter";
import { normaliseerSleutel, vulSjabloonIn, bouwMergeWaarden } from "../dossierMerge";

/**
 * Liquidatiestuk opstellen — medewerkersportaal → Klantoverzicht → Liquidatiestukken → "Liquidatiestuk opstellen".
 *
 * Zelfde opzet als het brievenscherm: links kies je de klant en het liquidatiemodel en vul je de
 * gegevens in, rechts loopt het voorbeeld live mee op een blanco A4. Ook de aandeelhouders vul je
 * hier in (naam + aandeel); ze verschijnen direct in het "Aanwezig"-blok van het stuk. Kop en
 * staart van het stuk liggen vast (zie src/beheer/notulenSjablonen.js) — alleen het besluit
 * ertussen verschilt per model.
 *
 * Net als bij een brief toont dit scherm géén dossiervelden: je vult de INVULVELDEN in die in
 * Beheer → Liquidatiestukken bij dit model zijn aangezet. Bij het opslaan gaat wat plaatsbaar is alsnog naar
 * het liquidatiedossier in Dynamics (de voorzitter, en elk invulveld waarvan de sleutel een kolom van
 * de soort Liquidatiestukken is, bijv. {{bedrag}} → cr283_bedrag).
 *
 * Namen (aandeelhouders, voorzitter, notulist) zoek je op in plaats van ze te typen — dat scheelt
 * typefouten en houdt de schrijfwijze gelijk aan Dynamics. Er wordt gezocht in de cliënten (holdings
 * en andere vennootschappen), de contactpersonen (/api/klant-contacten) en, voor de notulist, de
 * medewerkers. Zelf iets intypen mag altijd: een aandeelhouder die nog nergens staat, tik je gewoon in.
 *
 * De modellen komen uit Beheer → Liquidatiestukken; staat daar nog
 * niets, dan gebruikt dit scherm de vijf standaardmodellen uit de code, zodat je altijd kunt
 * beginnen. Wat je hier invult wordt niet in Dynamics weggeschreven — dit scherm maakt het stuk;
 * afdrukken/PDF gaat via het afdrukvenster van de browser.
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
// Ja/nee-waarde als tekst voor in het stuk. Een ja/nee-invulveld houdt een echte true/false vast; die
// mag nooit als "true"/"false" in de tekst van een stuk belanden. Ook "ja"/"waar"/"1" tellen als ja, zodat
// een veld dat ooit als tekst is ingevuld hetzelfde leest.
function jaNee(v) {
  if (typeof v === "boolean") return v ? "Ja" : "Nee";
  return /^(ja|true|waar|1|x)$/i.test(String(v == null ? "" : v).trim()) ? "Ja" : "Nee";
}

function langeDatum(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}
function vandaagISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Percentage netjes tonen ("50" → "50", "12.5" → "12,5"); geen getal = ongemoeid laten. */
function percentageTekst(v) {
  const s = veiligeStr(v);
  if (!s) return "";
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : s;
}

/**
 * Een bedrag zoals het in een stuk hoort te staan: "100000" → "€ 100.000", "1250,50" → "€ 1.250,50".
 * Is het geen getal (iemand tikt "nader te bepalen"), dan blijft de tekst zoals hij is.
 */
function bedragTekst(v) {
  const ruw = veiligeStr(v);
  if (!ruw) return "";
  const n = Number(ruw.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return ruw;
  const heleEuros = Number.isInteger(n);
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: heleEuros ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * Wat we van een getikt bedrag BEWAREN: een eventueel minteken vooraan, cijfers, en hooguit één
 * decimale komma. Zo blijft de opgeslagen waarde een kaal getal ("100000", "-2500", "1250,50") —
 * precies wat Dynamics en het logboek willen — terwijl het scherm er duizendpunten omheen mag zetten.
 *
 * Negatieve bedragen moeten kunnen: op een balans staat een overige reserve regelmatig negatief, en
 * financiële baten en lasten zijn vaker last dan bate. Het minteken telt alleen vooraan; een streepje
 * midden in een getal is een typefout en verdwijnt.
 */
function schoonBedrag(v) {
  const ingetikt = String(v == null ? "" : v);
  const negatief = /^\s*-/.test(ingetikt);
  const ruw = ingetikt.replace(/[^\d,.]/g, "").replace(/\./g, "");
  const [heel, ...rest] = ruw.split(",");
  const zonderTeken = rest.length ? `${heel},${rest.join("").slice(0, 2)}` : heel;
  // Het losse minteken blijft bewaard terwijl je typt — anders kun je "-" niet als eerste teken
  // intikken (het veld zou dan meteen weer leeg zijn). Rekenkundig telt "-" als 0.
  return negatief ? `-${zonderTeken}` : zonderTeken;
}

/** Hetzelfde bedrag mét duizendpunten, zoals het in het invoerveld hoort te staan: "100.000". */
function groepeerBedrag(v) {
  const schoon = schoonBedrag(v);
  if (!schoon) return "";
  const negatief = schoon.startsWith("-");
  const [heel, decimalen] = schoon.replace(/^-/, "").split(",");
  const metPunten = heel ? heel.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  const uit = decimalen !== undefined ? `${metPunten},${decimalen}` : metPunten;
  return negatief ? `-${uit}` : uit;
}

/**
 * Invoerveld voor een bedrag dat tijdens het typen meteen duizendpunten toont ("100.000") maar naar
 * buiten toe het kale getal doorgeeft. De cursor wordt teruggezet op basis van het aantal ECHTE
 * tekens vóór de cursor (het minteken, de cijfers en de decimale komma), niet op de tekenpositie — anders springt hij
 * bij elke duizendpunt die erbij komt. De komma telt bewust mee: laat je die weg, dan belandt de
 * cursor er vóór en typ je je decimalen achterstevoren in het hele getal.
 */
function BedragInvoer({ waarde, onChange, stijl }) {
  const ref = useRef(null);
  const tekensVoorCaret = useRef(null);
  const tekst = groepeerBedrag(waarde);

  useLayoutEffect(() => {
    const el = ref.current;
    const doel = tekensVoorCaret.current;
    if (!el || doel == null) return;
    tekensVoorCaret.current = null;
    let pos = 0;
    let geteld = 0;
    while (pos < el.value.length && geteld < doel) {
      if (/[\d,-]/.test(el.value[pos])) geteld += 1;
      pos += 1;
    }
    try { el.setSelectionRange(pos, pos); } catch { /* niet elk veldtype ondersteunt dit */ }
  });

  return (
    <input
      ref={ref}
      value={tekst}
      onChange={(e) => {
        const el = e.target;
        const voor = el.value.slice(0, el.selectionStart == null ? el.value.length : el.selectionStart);
        tekensVoorCaret.current = (voor.match(/[\d,-]/g) || []).length;
        onChange(schoonBedrag(el.value));
      }}
      inputMode="decimal"
      placeholder="bijv. 100.000"
      style={stijl}
    />
  );
}

/** De aandeelhoudersregels zoals ze in het "Aanwezig"-blok komen: naam + aandeel, één per regel. */
function aandeelhoudersTekst(rijen) {
  return (rijen || [])
    .map((r) => {
      const naam = veiligeStr(r.naam);
      const pct = percentageTekst(r.percentage);
      // Zit deze aandeelhouder er namens een vennootschap, dan komt dat achter de naam: "J. Jansen,
      // handelend namens Jansen Beheer B.V. — 50%". Zo blijft het percentage achteraan staan.
      const namens = veiligeStr(r.namens);
      const wie = namens ? `${naam || "—"}, handelend namens ${namens}` : naam;
      if (!naam && !pct && !namens) return "";
      if (!pct) return wie;
      return `${wie || "—"} — ${pct}%`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Het woonadres van een contactpersoon als één regel: "Dorpsstraat 1a, 7511 AA Enschede". Alleen wat
 * gevuld is komt mee, dus een ontbrekend huisnummer of een lege postcode levert geen losse komma's op.
 * Zo staat het adres in het KvK-formulier zoals je het op een envelop zou schrijven.
 */
function adresRegel(adres) {
  const a = adres || {};
  const straat = [veiligeStr(a.straat), [veiligeStr(a.huisnummer), veiligeStr(a.toevoeging)].filter(Boolean).join("")]
    .filter(Boolean).join(" ");
  const plaats = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ");
  const land = veiligeStr(a.land);
  // Nederland laten we weg: dat is de standaard en het maakt de regel alleen langer.
  const delen = [straat, plaats, /^(nederland|the netherlands|nl)$/i.test(land) ? "" : land].filter(Boolean);
  return delen.join(", ");
}

/**
 * De gekozen optie-index van een keuzevraag, of null als er niets gekozen is. Apart, omdat
 * `Number("")` gewoon 0 oplevert: zonder deze controle zou "niets gekozen" niet te onderscheiden
 * zijn van "de eerste optie gekozen".
 */
function gekozenOptie(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = Number(waarde);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Het middenstuk van een model. Nieuwe modellen hebben dat als `besluit`; oudere staan nog als één
 * lap tekst opgeslagen. Dan proberen we het besluit eruit te knippen, en lukt dát niet, dan nemen we
 * de hele tekst als besluit — zo komen de vaste kop en staart er alsnog omheen te staan in plaats van
 * dat het stuk zonder aanhef en ondertekening in beeld komt.
 */
function besluitUitModel(model) {
  if (!model) return "";
  const eigen = veiligeStr(model.besluit);
  if (eigen) return eigen;
  const tekst = veiligeStr(model.tekst);
  return haalBesluitUitTekst(tekst) || tekst;
}

export default function LiquidatieOpstellen({ onTerug, openStuk = null }) {
  const { mijnNaam } = useMijnNaam();

  const [sjablonen, setSjablonen] = useState(null); // null = laden
  const [klanten, setKlanten] = useState(null);
  const [klantFout, setKlantFout] = useState("");
  const [medewerkers, setMedewerkers] = useState([]); // voor het opzoeken van de notulist

  const [zoek, setZoek] = useState("");
  const [klant, setKlant] = useState(null);
  const [sjabloonId, setSjabloonId] = useState("");
  const [sjabloonZoek, setSjabloonZoek] = useState("");

  // Invulgegevens die het scherm zelf beheert (geen kolom in Dynamics, of hier bewust anders):
  // vestigingsplaats en notulist bestaan niet als dossierveld, de vergaderdatum is de periode van het
  // dossier, en de aandeelhouders vullen we met naam + aandeel in (Dynamics heeft alleen percentages).
  const [vestigingsplaats, setVestigingsplaats] = useState("");
  const [datumactie, setDatumactie] = useState(vandaagISO());
  const [voorzitter, setVoorzitter] = useState("");
  const [emailVoorzitter, setEmailVoorzitter] = useState("");
  const [notulist, setNotulist] = useState("");
  const [emailNotulist, setEmailNotulist] = useState("");
  // De mailadressen komen uit het gekozen record en staan daarom op alleen-lezen. Heeft een
  // contactpersoon of medewerker geen adres in Dynamics, dan kun je het veld met "Aanpassen" openzetten
  // — anders zou je hier vast kunnen lopen zonder te kunnen mailen.
  const [mailVrij, setMailVrij] = useState({ voorzitter: false, notulist: false });
  const [aandeelhouders, setAandeelhouders] = useState([{ naam: "", percentage: "100" }]);

  // De veldencatalogus van de soort Liquidatiestukken — alleen nog om te herkennen wélk invulveld toevallig
  // een Dynamics-kolom is (dan schrijven we die waarde ook naar het liquidatiedossier weg).
  const [catalogus, setCatalogus] = useState([]);

  // Het besluit (punt I) van dit ene stuk: begint bij het besluit van het gekozen model en is hier
  // vrij aan te passen. Kop en staart komen uit Beheer en gelden voor álle liquidatiestukken.
  const [besluit, setBesluit] = useState("");
  // De cijfers van het ontbindingsrapport: alleen wat je zelf intikt (sleutel → tekst). De totalen
  // rekenen we uit met liquidatieCijfers.js, hier én op de server — nooit twee waarheden.
  const [cijfers, setCijfers] = useState({});
  // Antwoorden op KvK-formulier 17a (vraag-id → waarde). Wat we al weten vullen we voor; de rest
  // vraagt het scherm. Zie _gedeeld/kvkFormulier17a.js voor de vragen en de skip-logica.
  const [formulier, setFormulier] = useState({});
  const [formulierOpen, setFormulierOpen] = useState(false);
  const [formulierBezig, setFormulierBezig] = useState(false);
  // Live voorbeeld van het ingevulde KvK-formulier, onder het stuk in de rechterkolom. Uitgeklapt
  // laadt hij zichzelf opnieuw zodra je een antwoord aanpast (met een korte pauze, anders zou elke
  // toetsaanslag een PDF-bouw op de server veroorzaken).
  const [formulierVoorbeeldOpen, setFormulierVoorbeeldOpen] = useState(false);
  const [formulierVoorbeeldUrl, setFormulierVoorbeeldUrl] = useState("");
  const [formulierVoorbeeldBezig, setFormulierVoorbeeldBezig] = useState(false);
  const [formulierVoorbeeldFout, setFormulierVoorbeeldFout] = useState("");
  // Wel/niet meesturen bij mailen. Standaard aan: het formulier hoort bij de stukken.
  const [formulierMeesturen, setFormulierMeesturen] = useState(true);
  const [kvknummer, setKvknummer] = useState("");
  const [bewaarder, setBewaarder] = useState("");
  // Naam- en adresgegevens van de gekozen bewaarder, voor het KvK-formulier (dat vraagt achternaam,
  // voornamen en woonadres apart). Leeg zodra je een naam intikt die niet uit de zoeklijst komt —
  // dan hoort er ook geen adres bij dat we niet kennen.
  const [bewaarderGegevens, setBewaarderGegevens] = useState(null);
  // De datum van de vergadering staat los van de datum van ontbinding (datumactie).
  const [datumnotulen, setDatumnotulen] = useState("");
  const [opbouw, setOpbouw] = useState({ kop: "", staart: "", standaard: null });
  // Vrije invulvelden (Beheer → Liquidatiestukken → Invulvelden), net als bij de standaardbrieven: per model
  // staat vast wélke je krijgt; hier houden we bij wat je invult. Sleutel → waarde (bij "paragraaf"
  // is de waarde de gekozen alineatekst, zodat die zo in het stuk komt).
  const [velddefinities, setVelddefinities] = useState([]);
  const [invulwaarden, setInvulwaarden] = useState({});

  // Vastleggen: het liquidatiedossier waar dit stuk bij hoort. Leeg = nog niet opgeslagen; na de eerste
  // keer opslaan werkt "Opslaan" hetzelfde dossier bij in plaats van er een tweede naast te zetten.
  const [dossierId, setDossierId] = useState("");
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  // Is er op dít stuk al eens opgeslagen? Bepaalt alleen het opschrift van de knop — het dossier
  // bestaat namelijk al zodra je een cliënt kiest, dus daar kunnen we het niet aan aflezen.
  const [opgeslagenOoit, setOpgeslagenOoit] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [eerdere, setEerdere] = useState([]); // eerder opgestelde stukken van deze cliënt
  // Versturen: mailen of ter ondertekening aanbieden. null = dicht; anders { variant, naar, cc, onderwerp, tekst }.
  const [verstuurModal, setVerstuurModal] = useState(null);
  const [verstuurBezig, setVerstuurBezig] = useState(false);
  const [mailCfg, setMailCfg] = useState(null); // instellingen.liquidatieMail (onderwerp/tekst per variant)

  const [melding, setMelding] = useState(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  // Dossiervelden + modellen van de soort Liquidatiestukken. De vaste kop en staart en de modellen
  // komen uit Beheer → Liquidatiestukken; staat daar nog niets, dan blijft het scherm leeg en zie je
  // meteen dat het eerst ingericht moet worden.
  useEffect(() => {
    fetch("/api/dossier-velden?soort=liquidatie")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (!levend.current) return;
        const cat = Array.isArray(d.catalogus) ? d.catalogus : [];
        setCatalogus(cat);
        setOpbouw({
          kop: veiligeStr(d.sjabloonOpbouw && d.sjabloonOpbouw.kop),
          staart: veiligeStr(d.sjabloonOpbouw && d.sjabloonOpbouw.staart),
          standaard: (d.sjabloonOpbouw && d.sjabloonOpbouw.standaard) || null,
        });
        setVelddefinities(Array.isArray(d.sjabloonOpbouw && d.sjabloonOpbouw.velddefinities) ? d.sjabloonOpbouw.velddefinities : []);
        // Modellen komen alléén uit Beheer → Liquidatiestukken; er zijn geen ingebouwde standaardmodellen meer
        // (je maakt ze zelf, net als de standaardbrieven).
        setSjablonen(Array.isArray(d.sjablonen) ? d.sjablonen.filter((s) => s && (veiligeStr(s.tekst) || veiligeStr(s.besluit))) : []);
      })
      .catch(() => { if (levend.current) setSjablonen([]); });
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(d.klanten || []); })
      .catch(() => { if (levend.current) { setKlanten([]); setKlantFout("De klantenlijst kon niet worden geladen."); } });
    // Medewerkers: alleen voor het opzoeken van de notulist. Best-effort — lukt dit niet, dan blijft
    // die suggestielijst leeg en typ je de naam gewoon zelf.
    fetch("/api/instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setMailCfg((d && d.liquidatieMail) || {}); })
      .catch(() => { if (levend.current) setMailCfg({}); });
    fetch("/api/beheer-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setMedewerkers(d.medewerkers || []); })
      .catch(() => { if (levend.current) setMedewerkers([]); });
  }, []);

  const lijst = sjablonen || [];
  const sjabloon = lijst.find((s) => s.id === sjabloonId) || null;
  const gefilterdeSjablonen = useMemo(() => {
    const t = sjabloonZoek.trim().toLowerCase();
    if (!t) return lijst;
    return lijst.filter((s) => veiligeStr(s.naam).toLowerCase().includes(t));
  }, [lijst, sjabloonZoek]);

  const gefilterdeKlanten = useMemo(() => {
    const t = zoek.trim().toLowerCase(); const alle = klanten || [];
    if (!t) return alle.slice(0, 12);
    return alle.filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""} ${k.groepsnaam ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [zoek, klanten]);

  // Klantwissel: vestigingsplaats, voorzitter, notulist en de eerste aandeelhouder voorinvullen —
  // alles blijft gewoon aanpasbaar (beide namen zijn met de zoeklijst te vervangen).
  useEffect(() => {
    if (!klant) return;
    const plaats = veiligeStr(klant.adres && klant.adres.plaats) || veiligeStr(klant.contact && klant.contact.adres && klant.contact.adres.plaats);
    const contactNaam = veiligeStr(klant.contact && klant.contact.naam);
    const contactMail = veiligeStr(klant.contact && klant.contact.email) || veiligeStr(klant.emailKlant);
    setVestigingsplaats(plaats);
    // Voorzitter én notulist: allebei standaard de primaire contactpersoon van de cliënt (of de
    // vaste naam uit Beheer, als die daar ooit is ingesteld). Bij vergaderingen van de cliënt zit
    // die persoon meestal in beide rollen; wie er echt notuleert kies je gewoon in het scherm.
    const st = opbouw.standaard || {};
    setVoorzitter(st.voorzitterBron === "vast" && veiligeStr(st.voorzitterVast) ? veiligeStr(st.voorzitterVast) : contactNaam);
    setEmailVoorzitter(contactMail);
    setNotulist(st.notulistBron === "vast" && veiligeStr(st.notulistVast) ? veiligeStr(st.notulistVast) : contactNaam);
    setEmailNotulist(contactMail);
    setAandeelhouders([{ naam: contactNaam, percentage: "100" }]);
    setCijfers({}); setDatumnotulen(""); setFormulier({});
    // De bewaarder van boeken en bescheiden is standaard de primaire contactpersoon van de cliënt —
    // in de praktijk bewaart die de administratie. Blijft gewoon aanpasbaar via het zoekveld.
    setBewaarder(contactNaam);
    const c = klant.contact || {};
    setBewaarderGegevens(contactNaam ? {
      achternaam: [veiligeStr(c.tussenvoegsel), veiligeStr(c.achternaam)].filter(Boolean).join(" ") || contactNaam,
      voornaam: veiligeStr(c.voornaam),
      adres: adresRegel(c.adres),
    } : null);
    // Het KvK-nummer komt van de klantkaart (Dynamics) en wordt hier niet gewijzigd — zo kan er in
    // een liquidatiestuk of op het KvK-formulier nooit een ander nummer staan dan in de administratie.
    setKvknummer(veiligeStr(klant.kvk));
    setMelding(null);
    // Een andere cliënt = een ander stuk: de koppeling met het vorige liquidatiedossier loslaten. Het
    // effect hieronder maakt meteen een nieuwe rij aan en zet dossierId opnieuw.
    setDossierId(""); setPdfUrl(""); setOpgeslagenOoit(false);
  }, [klant]);

  // Eerder opgestelde stukken van deze cliënt (om te heropenen en bij te werken). Best-effort.
  useEffect(() => {
    setEerdere([]);
    const acc = klant && klant.accountId;
    if (!acc) return;
    let bezig = true;
    fetch(`/api/medewerker-liquidatie-opslaan?accountId=${encodeURIComponent(acc)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (bezig && levend.current) setEerdere(Array.isArray(d.liquidatie) ? d.liquidatie : []); })
      .catch(() => { if (bezig && levend.current) setEerdere([]); });
    return () => { bezig = false; };
  }, [klant]);

  // Zonder gekozen cliënt is er nog geen contactpersoon; dan blijft de ingelogde medewerker de
  // terugval voor de notulist, zodat het veld niet leeg staat. Zodra je een cliënt kiest neemt het
  // effect hierboven het over met de contactpersoon.
  useEffect(() => {
    const st = opbouw.standaard || {};
    const vast = st.notulistBron === "vast" ? veiligeStr(st.notulistVast) : "";
    if (vast) { setNotulist(vast); return; }
    if (!klant && mijnNaam && !notulist) setNotulist(mijnNaam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mijnNaam, opbouw.standaard]);

  /**
   * Zodra je een cliënt kiest, maken we het liquidatiedossier in Dynamics al aan — dan staat de rij
   * meteen in het Liquidatie-overzicht en heeft het stuk vanaf het begin een dossier om aan te hangen.
   * "Opslaan" vult daarna diezelfde rij (en zet het stuk in SharePoint).
   *
   * Wissel je van cliënt of loop je weg zonder ooit op te slaan, dan ruimen we die nog lege rij weer
   * op (best-effort) — anders blijft er bij elke wissel een leeg dossier achter. autoRef houdt bij om
   * welke rij dat gaat; zodra je opslaat is het geen wegwerp-rij meer en wordt de ref losgelaten.
   */
  const autoRef = useRef("");
  // Openen we een bestaand stuk vanuit het logboek? Dan hoort er géén nieuwe rij te ontstaan.
  const openendRef = useRef(!!openStuk);
  // Het aanmaken van die rij loopt asynchroon. Klikte je vóórdat het antwoord binnen was op Opslaan,
  // dan ging het stuk zónder dossierId weg, maakte de server een TWEEDE dossier aan, en kwam de
  // eerste rij er daarna alsnog overheen — resultaat: twee regels in het logboek voor één stuk.
  // Daarom houden we de lopende aanvraag vast; opslaan() wacht hem eerst af.
  const aanmakenRef = useRef(null);

  /** De zojuist automatisch aangemaakte, nog lege rij opruimen (best-effort). */
  function ruimAutoRijOp() {
    const id = autoRef.current;
    if (!id) return;
    autoRef.current = "";
    fetch("/api/medewerker-liquidatie-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "verwijderen", dossierId: id }),
    }).catch(() => { /* opruimen is best-effort */ });
  }

  useEffect(() => {
    ruimAutoRijOp();
    aanmakenRef.current = null;
    if (!klant || !klant.accountId) return;
    if (openendRef.current) { openendRef.current = false; return; } // bestaand stuk: geen nieuwe rij
    let bezig = true;
    const bezigMet = fetch("/api/medewerker-liquidatie-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "aanmaken", accountId: klant.accountId, datum: datumactie }),
    })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!bezig || !levend.current) return "";
        if (!ok || !d.dossierId) { setMelding({ type: "fout", tekst: `Het liquidatiedossier kon nog niet worden aangemaakt: ${d.error || "onbekende reden"}. Je kunt gewoon doorwerken; bij Opslaan wordt het alsnog aangemaakt.` }); return ""; }
        // Is er ondertussen al een stuk heropend (of opgeslagen), dan hóórt deze rij nergens meer bij:
        // niet alsnog overnemen, maar opruimen. Anders zou het scherm ineens naar een lege rij wijzen.
        if (!bezig) return "";
        setDossierId((h) => h || d.dossierId);
        autoRef.current = d.dossierId;
        return d.dossierId;
      })
      .catch(() => "" /* stil: bij Opslaan wordt het dossier alsnog aangemaakt */);
    aanmakenRef.current = bezigMet;
    return () => { bezig = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klant]);

  // Weglopen uit het scherm met een nog lege, automatisch aangemaakte rij → opruimen.
  useEffect(() => () => {
    const id = autoRef.current;
    if (!id) return;
    autoRef.current = "";
    fetch("/api/medewerker-liquidatie-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "verwijderen", dossierId: id }),
    }).catch(() => { /* best-effort */ });
  }, []);

  // Vanuit het liquidatielogboek geopend ("Bewerken"): de juiste cliënt kiezen en het stuk terughalen.
  const geopendRef = useRef(false);
  // Het stuk dat nog teruggezet moet worden zodra de cliënt-voorvulling geweest is. Dit ging eerder via
  // een setTimeout, maar dat is een gok: React verwerkt een setState uit een effect in een eigen taak,
  // en die kwam soms ná de timeout — dan overschreef de voorvulling het net herstelde stuk en stond er
  // weer één aandeelhouder van 100%. Nu hangt het herstel aan het effect hieronder, dat ná het
  // voorvul-effect is gedeclareerd en dus binnen dezelfde commit gegarandeerd later loopt.
  const teHerstellenRef = useRef(null);
  useEffect(() => {
    if (!openStuk || geopendRef.current) return;
    if (!Array.isArray(klanten) || !lijst.length) return; // wachten tot cliënten én modellen er zijn
    const k = klanten.find((x) => String(x.accountId) === String(openStuk.accountId));
    if (!k) return;
    geopendRef.current = true;
    openendRef.current = true; // de klantwissel hieronder mag geen nieuwe rij aanmaken
    if (klant && String(klant.accountId) === String(k.accountId)) {
      // Deze cliënt stond al ingesteld: setKlant verandert dan niets, dus het effect hieronder komt
      // niet langs — meteen zelf herstellen.
      heropen(openStuk);
      return;
    }
    teHerstellenRef.current = openStuk;
    setKlant(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStuk, klanten, lijst]);

  // Herstel ná de voorvulling: dit effect hangt aan dezelfde [klant] als het voorvul-effect en staat
  // verder naar beneden in het bestand, dus React draait hem daarna.
  useEffect(() => {
    const stuk = teHerstellenRef.current;
    if (!stuk || !klant) return;
    teHerstellenRef.current = null;
    heropen(stuk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klant]);

  /**
   * Wat er van dit stuk naar het liquidatiedossier in Dynamics gaat. Dit scherm toont geen dossiervelden
   * meer (zoals een brief die ook niet toont): de voorzitter gaat mee als "Directeur", en verder elk
   * invulveld waarvan de sleutel toevallig een kolom van de soort Liquidatiestukken is — {{bedrag}} landt dus in
   * cr283_bedrag. Al het andere hoort bij het stuk zelf en staat in het liquidatielogboek.
   */
  const dossierVeldenUitStuk = useMemo(() => {
    const uit = {};
    if (veiligeStr(voorzitter)) uit.directeur = veiligeStr(voorzitter);
    if (veiligeStr(emailVoorzitter)) uit.emailvoorzitter = veiligeStr(emailVoorzitter);
    if (veiligeStr(emailNotulist)) uit.emailnotulist = veiligeStr(emailNotulist);
    for (const [sleutel, waarde] of Object.entries(invulwaarden || {})) {
      const def = catalogus.find((v) => v && v.key === sleutel && v.type !== "lookup" && !String(v.key).startsWith("__"));
      if (!def) continue;
      if (waarde === undefined || waarde === null || String(waarde).trim() === "") continue;
      // Naar Dynamics gaat de kále waarde: een getalkolom wil 100000, niet "€ 100.000".
      const eigen = velddefinities.find((v) => v && String(v.sleutel) === sleutel);
      // Ja/nee-kolom: hier moet een echte true/false naartoe. Zou de tekst zo doorgaan, dan wordt élke
      // niet-lege waarde "waar" — ook het woord "Nee" — en zet je de kolom dus precies verkeerd.
      if (def.type === "boolean") {
        uit[sleutel] = /^(ja|true|waar|1|x)$/i.test(String(waarde).trim());
        continue;
      }
      if (eigen && eigen.type === "bedrag") {
        const n = Number(String(waarde).replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
        uit[sleutel] = Number.isFinite(n) ? n : waarde;
        continue;
      }
      uit[sleutel] = waarde;
    }
    return uit;
  }, [voorzitter, emailVoorzitter, emailNotulist, invulwaarden, catalogus, velddefinities]);

  // De regel uit "Eerder opgesteld" waar dit scherm nu aan hangt — die werkt Opslaan bij. Zolang die
  // er niet is (een gloednieuw stuk) maakt Opslaan juist wél een nieuwe regel; dat onderscheid tonen
  // we bij de knop, zodat je nooit per ongeluk een tweede regel in het logboek krijgt.
  const huidigeRegel = useMemo(
    () => (dossierId ? (eerdere || []).find((r) => String(r.dossierId) === String(dossierId)) || null : null),
    [eerdere, dossierId],
  );

  // De vrije invulvelden die bij het gekozen model horen (Beheer bepaalt welke), in de volgorde
  // waarin ze in Beheer staan.
  const actieveInvulvelden = useMemo(() => {
    const gekozen = sjabloon && Array.isArray(sjabloon.invulvelden) ? sjabloon.invulvelden : [];
    if (!gekozen.length) return [];
    return velddefinities.filter((v) => v && gekozen.includes(String(v.sleutel)));
  }, [sjabloon, velddefinities]);

  // Bij een ander model beginnen de invulvelden schoon; een "keuze"/"paragraaf" start op de eerste optie.
  // Behalve direct na het heropenen van een bewaard stuk: dan zijn de waarden net teruggezet en zou dit
  // effect ze meteen weer wissen (herstelRef). Dat was precies waarom een heropend stuk "niets onthield".
  const herstelRef = useRef(false);
  useEffect(() => {
    if (herstelRef.current) { herstelRef.current = false; return; }
    const start = {};
    for (const v of actieveInvulvelden) {
      const eerste = (v.opties || [])[0];
      start[v.sleutel] = v.type === "keuze" && eerste ? (eerste.label || "")
        : v.type === "paragraaf" && eerste ? (eerste.tekst || "")
        : "";
    }
    setInvulwaarden(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sjabloonId, velddefinities]);

  const mergeWaarden = useMemo(() => {
    // Eerst de dossiervelden (zelfde weergave als in het dossiervoorbeeld: keuzelijst-labels, ja/nee,
    // nette datums en getallen), daarna wat dit scherm zelf beheert.
    const m = bouwMergeWaarden({
      // Geen dossiervelden meer in dit scherm (net als bij een brief); alleen de vaste klantgegevens.
      catalogus: [], veldenState: {}, picklistOpties: {}, lookupNamen: {},
      dossier: {
        klantnaam: klant ? veiligeStr(klant.klantnaam) : "",
        groepsnaam: klant ? veiligeStr(klant.groepsnaam) : "",
        accountant: klant ? (veiligeStr(klant.accountant) || veiligeStr(klant.accountantPersoon && klant.accountantPersoon.naam)) : "",
        assistent: klant ? veiligeStr(klant.assistent && klant.assistent.naam) : "",
        manager: klant ? (veiligeStr(klant.manager && klant.manager.naam) || veiligeStr(klant.relatiebeheerder)) : "",
      },
      periodeTekst: langeDatum(datumactie),
    });
    const zet = (k, v) => { m[normaliseerSleutel(k)] = v == null ? "" : String(v); };
    zet("vestigingsplaats", vestigingsplaats);
    zet("plaats", vestigingsplaats);
    zet("datumactie", langeDatum(datumactie));
    zet("datum", langeDatum(datumactie) || langeDatum(vandaagISO()));
    zet("notulist", notulist);
    // In de modellen heet de voorzitter "directeur" (zo heet de kolom in Dynamics ook).
    zet("voorzitter", voorzitter);
    zet("directeur", voorzitter);
    zet("emailvoorzitter", emailVoorzitter);
    zet("emailnotulist", emailNotulist);
    zet("datumnotulen", langeDatum(datumnotulen) || langeDatum(datumactie));
    zet("datumontbinding", langeDatum(datumactie));
    zet("datumliquidatie", langeDatum(datumactie));
    zet("kvknummer", kvknummer);
    zet("kvk", kvknummer);
    zet("bewaarder", bewaarder);
    // De naam van het gekozen liquidatiemodel (bijv. "Agiostorting"), zodat je hem in de vaste tekst of
    // in het besluit kunt gebruiken — bijv. "Ontbindingsrapport {{naamnotulen}}". Nog geen model gekozen?
    // Dan blijft hij leeg, net als elk ander merge-veld zonder waarde.
    zet("naamnotulen", sjabloon && sjabloon.naam);
    zet("modelnaam", sjabloon && sjabloon.naam);
    zet("aandeelhouders", aandeelhoudersTekst(aandeelhouders));
    // De vrije invulvelden als laatste: die horen bij dít stuk en winnen dus van gelijknamige velden.
    // Een bedrag komt als "€ 100.000" in het stuk en een datum als "17 augustus 2026" — ongeacht hoe
    // het is ingetikt, zodat je dat niet per model hoeft te regelen.
    for (const [sleutel, waarde] of Object.entries(invulwaarden || {})) {
      const def = velddefinities.find((v) => v && String(v.sleutel) === sleutel);
      if (def && def.type === "bedrag") zet(sleutel, bedragTekst(waarde));
      else if (def && def.type === "datum") zet(sleutel, langeDatum(waarde));
      // Een ja/nee-veld houdt een échte true/false vast. Zo doorgeven zou letterlijk "false" in het
      // stuk zetten; in de tekst hoort natuurlijk "Ja" of "Nee" te staan.
      else if (typeof waarde === "boolean" || (def && def.type === "boolean")) zet(sleutel, jaNee(waarde));
      else zet(sleutel, waarde);
    }
    return m;
  }, [klant, vestigingsplaats, datumactie, datumnotulen, kvknummer, bewaarder, voorzitter, emailVoorzitter, notulist, emailNotulist, aandeelhouders, invulwaarden, velddefinities, sjabloon]);

  // Het stuk = vaste kop (Beheer) + het besluit van dit stuk + vaste staart (Beheer). Zo staan de
  // aandeelhouders en het ondertekenblok altijd in de centrale tekst en bewegen ze mee met wat je
  // hier invult; alleen het besluit is per stuk anders.
  //
  // Terugval voor een model dat nog als één lap tekst in Beheer staat (geen besluit-blok): dan tonen
  // we die tekst ongewijzigd — er verdwijnt nooit iets, en het scherm meldt het hieronder.
  // Een model dat nog als één lap tekst is opgeslagen wordt bij het kiezen omgezet naar een besluit
  // (zie besluitUitModel). We tonen dat alleen nog als opmerking; het stuk zelf krijgt altijd de vaste
  // kop en staart, precies zoals bij notulen.
  const modelOngesplitst = !!sjabloon && !veiligeStr(sjabloon.besluit) && !!veiligeStr(sjabloon.tekst);
  const ruweTekst = !sjabloon
    ? ""
    : steltStukSamen({ kop: opbouw.kop, besluit, staart: opbouw.staart });
  const ingevuld = vulSjabloonIn(ruweTekst, mergeWaarden);
  const berekend = useMemo(() => berekenCijfers(cijfers), [cijfers]);
  // "Ingevuld" = er staat érgens een bedrag, óók als dat 0 is. Alles-nihil moet immers een
  // cijferdeel met € 0 opleveren; alleen een écht leeg formulier laat het cijferdeel weg.
  const cijfersIngevuld = useMemo(() => INVULSLEUTELS.some((k) => /\d/.test(veiligeStr(cijfers[k]))), [cijfers]);
  const balansScheef = cijfersIngevuld ? balansVerschil(cijfers) : 0;

  /**
   * Het cijferdeel van het rapport, als losse blokken achter de notulen. Alleen als er cijfers zijn
   * ingevuld — een stuk zonder cijfers hoort geen lege balans te krijgen. Op een eigen pagina, met
   * per tabel de vaststellingsregel en een ondertekenruimte, precies zoals in het Word-format.
   */
  const cijferBlokken = useMemo(() => {
    if (!cijfersIngevuld) return [];
    const rij = (r) => ({ label: r.label, bedrag: cijferTekst(berekend[r.sleutel]), zwaar: !!r.zwaar });
    const datumTekst = langeDatum(datumactie) || langeDatum(datumnotulen);
    const vastgesteld = `De opgemaakte cijfers zijn door de Algemene vergadering vastgesteld op d.d. ${datumTekst || "…"}.`;
    return [
      { type: "paginaeinde" },
      { type: "titel", tekst: "ontbindingsrapport van" },
      { type: "midden", tekst: veiligeStr(klant && klant.klantnaam) || "—" },
      ...(veiligeStr(kvknummer) ? [{ type: "midden", tekst: `KVK ${veiligeStr(kvknummer)}` }] : []),
      ...(datumTekst ? [{ type: "midden", tekst: `op ${datumTekst}` }] : []),
      { type: "kop", tekst: `Balans per ${datumTekst || "…"}` },
      { type: "tabel", titel: "Activa", regels: BALANS_ACTIVA.map(rij) },
      { type: "tabel", titel: "Passiva", regels: BALANS_PASSIVA.map(rij) },
      { type: "alinea", tekst: vastgesteld },
      { type: "ondertekening", naam: veiligeStr(voorzitter), functie: "Voorzitter" },
      { type: "paginaeinde" },
      { type: "kop", tekst: "Resultatenrekening" },
      { type: "tabel", titel: "", regels: RESULTAAT.map(rij) },
      { type: "alinea", tekst: vastgesteld },
      { type: "ondertekening", naam: veiligeStr(voorzitter), functie: "Voorzitter" },
    ];
  }, [cijfersIngevuld, berekend, klant, kvknummer, datumactie, datumnotulen, voorzitter]);

  // De notulen zijn één document en het ontbindingsrapport (de cijfers) een tweede — losse PDF's, met
  // elk hun eigen ondertekening. Ze gaan samen naar de cliënt, maar zijn apart te bewaren, te tekenen
  // en te archiveren. Het voorbeeld hiernaast toont ze onder elkaar, met een scheiding ertussen.
  const blokken = useMemo(() => ontleedDocument(ingevuld), [ingevuld]);
  const eigenKop = heeftEigenKop(ruweTekst);
  const leeg = !veiligeStr(ruweTekst);

  const somAandeel = aandeelhouders.reduce((t, r) => {
    const n = Number(String(r.percentage || "").replace(",", "."));
    return t + (Number.isFinite(n) ? n : 0);
  }, 0);
  const aandeelIngevuld = aandeelhouders.some((r) => veiligeStr(r.percentage));

/**
   * KvK-formulier 17a. De antwoorden die we al weten komen uit de klantkaart en dit scherm: naam,
   * vestigingsplaats, KvK-nummer, datum van ontbinding, de bewaarder en wie ondertekent. De rest
   * vraagt de vragenlijst hieronder, met dezelfde "ga naar"-sprongen als op papier.
   */
  const formulierContext = useMemo(() => ({
    klantnaam: veiligeStr(klant && klant.klantnaam),
    vestigingsplaats: veiligeStr(vestigingsplaats),
    kvknummer: veiligeStr(kvknummer),
    datumontbinding: veiligeStr(datumactie),
    bewaarder: veiligeStr(bewaarder),
    ondertekenaar: veiligeStr(voorzitter),
    email: veiligeStr(emailVoorzitter),
    telefoon: veiligeStr(klant && klant.contact && klant.contact.telefoon),
    vandaag: vandaagISO(),
    // Het formulier vraagt de bewaarder apart uit: achternaam, voornamen en woonadres. Die komen mee
    // zodra je 'm uit het zoekveld kiest. Tik je een naam die niet in de lijst staat, dan hebben we
    // geen adres — en dan hoort er ook geen adres van iemand anders op het formulier te belanden.
    ...(bewaarderGegevens ? {
      bewaarderAchternaam: bewaarderGegevens.achternaam,
      bewaarderVoornaam: bewaarderGegevens.voornaam,
      bewaarderAdres: bewaarderGegevens.adres,
    } : {}),
  }), [klant, vestigingsplaats, kvknummer, datumactie, bewaarder, bewaarderGegevens, voorzitter, emailVoorzitter]);

  // Voorvullen zonder ooit een ingetikt antwoord te overschrijven — vandaar vulVoor() en niet gewoon
  // een merge. Loopt live mee: pas je de datum van ontbinding aan, dan volgt het formulier.
  const formulierAntwoorden = useMemo(() => formulierVulVoor(formulier, formulierContext), [formulier, formulierContext]);
  const formulierVragen = useMemo(() => formulierSecties(formulierAntwoorden), [formulierAntwoorden]);
  const formulierMist = useMemo(() => formulierOntbrekend(formulierAntwoorden), [formulierAntwoorden]);

  function zetFormulier(id, waarde) {
    setFormulier((f) => ({ ...f, [id]: waarde }));
  }

  /** Het ingevulde formulier ophalen als PDF en meteen openen, klaar om af te drukken. */
  async function maakFormulier(opslaan) {
    if (!klant) { setMelding({ type: "fout", tekst: "Kies eerst een cliënt." }); return; }
    setFormulierBezig(true);
    try {
      const res = await fetch("/api/medewerker-liquidatie-formulier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          antwoorden: formulierAntwoorden,
          accountId: klant.accountId,
          klantnaam: veiligeStr(klant.klantnaam),
          datum: veiligeStr(datumactie),
          opslaan: !!opslaan,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Formulier maken mislukt (${res.status}).`);
      // Base64 → blob → nieuw tabblad. Zo kun je 'm bekijken, afdrukken en opslaan waar je wilt.
      const bytes = Uint8Array.from(atob(d.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (typeof window !== "undefined") window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      const spStaart = d.sharepoint
        ? (d.sharepoint.gedaan ? " Het staat ook in de SharePoint-map van de cliënt." : ` Let op: opslaan in SharePoint lukte niet (${d.sharepoint.reden || "onbekende reden"}).`)
        : "";
      const mistStaart = (d.ontbrekend || []).length ? ` ${d.ontbrekend.length} verplichte vraag/vragen staan nog leeg — vul die met pen in.` : "";
      setMelding({ type: d.sharepoint && !d.sharepoint.gedaan ? "fout" : "ok", tekst: `KvK-formulier 17a klaar.${spStaart}${mistStaart}` });
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      setFormulierBezig(false);
    }
  }

  /**
   * Het voorbeeld verversen zodra er iets verandert — maar pas 900 ms nadat je bent gestopt met
   * typen. De vorige blob-URL geven we netjes vrij; anders houdt de browser elke tussenversie vast.
   */
  useEffect(() => {
    if (!formulierVoorbeeldOpen || !klant) return undefined;
    let levendig = true;
    setFormulierVoorbeeldBezig(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/medewerker-liquidatie-formulier", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ antwoorden: formulierAntwoorden, klantnaam: veiligeStr(klant.klantnaam), datum: veiligeStr(datumactie) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Voorbeeld maken mislukt (${res.status}).`);
        if (!levendig) return;
        const bytes = Uint8Array.from(atob(d.pdf), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setFormulierVoorbeeldUrl((oud) => { if (oud) URL.revokeObjectURL(oud); return url; });
        setFormulierVoorbeeldFout("");
      } catch (e) {
        if (levendig) setFormulierVoorbeeldFout(String((e && e.message) || e));
      } finally {
        if (levendig) setFormulierVoorbeeldBezig(false);
      }
    }, 900);
    return () => { levendig = false; clearTimeout(timer); };
  }, [formulierVoorbeeldOpen, klant, formulierAntwoorden, datumactie]);

  // De laatste blob-URL vrijgeven als het scherm sluit.
  useEffect(() => () => { if (formulierVoorbeeldUrl) URL.revokeObjectURL(formulierVoorbeeldUrl); }, [formulierVoorbeeldUrl]);

  function zetAandeelhouder(i, veld, waarde) {
    setAandeelhouders((rijen) => rijen.map((r, j) => (j === i ? { ...r, [veld]: waarde } : r)));
  }
  function voegAandeelhouderToe() { setAandeelhouders((r) => [...r, { naam: "", percentage: "" }]); }
  function verwijderAandeelhouder(i) {
    setAandeelhouders((r) => (r.length <= 1 ? [{ naam: "", percentage: "" }] : r.filter((_, j) => j !== i)));
  }
  /** Verdeelt 100% gelijk over de ingevulde rijen — scheelt rekenwerk bij 2, 3 of 4 aandeelhouders. */
  function verdeelGelijk() {
    setAandeelhouders((rijen) => {
      const n = rijen.length || 1;
      const deel = Math.round((100 / n) * 100) / 100;
      return rijen.map((r, i) => ({
        ...r,
        // Laatste rij vangt het afrondingsrestje op, zodat de som exact 100 blijft.
        percentage: String(i === n - 1 ? Math.round((100 - deel * (n - 1)) * 100) / 100 : deel).replace(".", ","),
      }));
    });
  }

  const bestandsnaam = `${veiligeStr(sjabloon && sjabloon.naam) || "Ontbindingsrapport"}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const subkop = `Liquidatiestuk${datumactie ? " · " + langeDatum(datumactie) : ""}`;

  function afdrukken() {
    if (leeg) return;
    const w = typeof window !== "undefined" ? window.open("", "_blank", "width=840,height=1180") : null;
    if (!w) { setMelding({ type: "fout", tekst: "Het afdrukvenster werd geblokkeerd door de browser. Sta pop-ups toe voor dit portaal en probeer opnieuw." }); return; }
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const kopHtml = eigenKop
      ? ""
      : `<div class="kop-klant">${esc(klant ? klant.klantnaam : "—")}</div><div class="kop-sub">${esc(subkop)}</div>`;
    w.document.write(
      `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(bestandsnaam)}</title>` +
      `<style>${AFDRUK_CSS}</style></head><body>${kopHtml}${blokkenNaarHtml([...blokken, ...cijferBlokken], esc)}</body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* afdruk best-effort */ } }, 300);
  }

  /**
   * Vastleggen: het stuk als PDF in de SharePoint-map van de cliënt, de gegevens in een
   * liquidatiedossier in Dynamics, en de invulgegevens (waaronder de aandeelhoudersnamen) zodat je het
   * later kunt heropenen. Tweede keer opslaan werkt hetzelfde dossier bij.
   */
  async function opslaan({ alsNieuw = false } = {}) {
    if (!klant || leeg) return;
    setOpslaanBezig(true); setMelding(null);
    try {
      // Eerst de eventueel nog lopende "aanmaken" afwachten: anders slaan we op zónder dossierId,
      // maakt de server een tweede dossier aan en staan er straks twee regels in het logboek.
      let doelDossierId = dossierId;
      if (!alsNieuw && !doelDossierId && aanmakenRef.current) {
        const gewacht = await aanmakenRef.current.catch(() => "");
        if (!levend.current) return;
        if (gewacht) doelDossierId = gewacht;
      }
      // "Opslaan als nieuw stuk": bewust géén dossierId meesturen, dan komt er een nieuw dossier
      // en een nieuwe regel in het logboek. De rij die het scherm nu vasthoudt blijft ongemoeid.
      if (alsNieuw) doelDossierId = "";
      const res = await fetch("/api/medewerker-liquidatie-opslaan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: klant.accountId,
          klantnaam: veiligeStr(klant.klantnaam),
          dossierId: doelDossierId || undefined,
          modelNaam: veiligeStr(sjabloon && sjabloon.naam),
          datum: datumactie,
          // Naar het liquidatiedossier in Dynamics gaat wat we kúnnen plaatsen: de voorzitter, plus elk
          // invulveld waarvan de sleutel toevallig een kolom van de soort Liquidatiestukken is (bijv. {{bedrag}}
          // → cr283_bedrag). De rest van de invulvelden hoort bij het stuk en blijft in het logboek.
          dossierVelden: dossierVeldenUitStuk,
          zichtbareSleutels: Object.keys(dossierVeldenUitStuk),
          // …en dit zijn de gegevens die het scherm zelf beheert; die worden bewaard zodat je het
          // stuk later kunt heropenen (vooral de aandeelhoudersnamen — die passen niet in Dynamics).
          velden: { vestigingsplaats, voorzitter, emailVoorzitter, notulist, emailNotulist },
          invulwaarden,
          aandeelhouders,
          // De blokken zoals ze rechts in het voorbeeld staan — de PDF gebruikt exact dezelfde.
          blokken,
          tekst: ruweTekst,
          besluit,
          datumnotulen: datumnotulen || datumactie,
          kvknummer,
          bewaarder,
          cijfers,
          formulier,
          rapportBlokken: cijferBlokken,
          bestandsnaamBasis: bestandsnaam,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Opslaan mislukt (${res.status}).`);
      if (!levend.current) return;
      const nieuw = alsNieuw || !doelDossierId || autoRef.current === doelDossierId;
      // Sloegen we bewust als NIEUW stuk op, dan hangt het scherm daarna aan die nieuwe rij; de
      // oude blijft ongewijzigd in het logboek staan.
      setDossierId(d.dossierId || "");
      setPdfUrl(d.pdfUrl || "");
      autoRef.current = ""; // opgeslagen: deze rij is geen wegwerp-rij meer
      aanmakenRef.current = null;
      setOpgeslagenOoit(true);
      setMelding(
        d.sharepoint && d.sharepoint.gedaan
          ? { type: "ok", tekst: `Het liquidatiestuk staat in het dossier${nieuw ? " (nieuw liquidatiedossier aangemaakt)" : ""} en in de SharePoint-map van ${veiligeStr(klant.klantnaam)}.` }
          : { type: "fout", tekst: `Het liquidatiedossier is ${nieuw ? "aangemaakt" : "bijgewerkt"}, maar het stuk kon niet in SharePoint worden gezet: ${(d.sharepoint && d.sharepoint.reden) || "onbekende reden"}` },
      );
      // Lijstje met eerdere stukken verversen, zodat het nieuwe stuk er meteen bij staat.
      fetch(`/api/medewerker-liquidatie-opslaan?accountId=${encodeURIComponent(klant.accountId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((x) => { if (levend.current) setEerdere(Array.isArray(x.liquidatie) ? x.liquidatie : []); })
        .catch(() => {});
    } catch (e) {
      if (levend.current) setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) setOpslaanBezig(false);
    }
  }

  /** Een eerder opgesteld stuk terughalen in het scherm (om bij te werken en opnieuw op te slaan). */
  function heropen(r) {
    if (!r) return;
    const v = r.velden || {};
    // Stond er nog een zojuist automatisch aangemaakte, lege rij klaar? Die is nu overbodig — weg
    // ermee. Vroeger lieten we alleen de verwijzing los; dan bleef er een leeg liquidatiedossier staan.
    ruimAutoRijOp();
    aanmakenRef.current = null;
    setDossierId(r.dossierId || "");
    setPdfUrl(r.pdfUrl || "");
    setOpgeslagenOoit(true);
    const model = lijst.find((s) => veiligeStr(s.naam) === veiligeStr(r.modelNaam));
    if (model) setSjabloonId(model.id);
    // Het besluit van dat stuk terug; oudere records hadden alleen de volledige tekst — daar halen we
    // het besluit dan uit, zodat je 'm gewoon verder kunt bewerken.
    setBesluit(veiligeStr(r.besluit) || haalBesluitUitTekst(r.tekst || "") || (model ? besluitUitModel(model) : ""));
    setDatumactie(veiligeStr(r.datum) || vandaagISO());
    setVestigingsplaats(veiligeStr(v.vestigingsplaats));
    setVoorzitter(veiligeStr(v.voorzitter) || veiligeStr(v.directeur));
    setEmailVoorzitter(veiligeStr(v.emailVoorzitter));
    setNotulist(veiligeStr(v.notulist));
    setEmailNotulist(veiligeStr(v.emailNotulist));
    // De invulvelden terugzetten. Let op: dit moet ná het zetten van het model gebeuren én het
    // reset-effect op sjabloonId mag er niet overheen lopen — daarvoor is herstelRef (zie hieronder).
    herstelRef.current = true;
    const bewaardeInvul = (r.invulwaarden && typeof r.invulwaarden === "object") ? r.invulwaarden : {};
    // Oudere records (van vóór de invulvelden) hadden bedrag/percentage/toelichting los in "velden"
    // of in dossierVelden staan; die nemen we mee zodat er niets verdwijnt bij het heropenen.
    const oudeWaarden = {};
    const uitDossier = (r.dossierVelden && typeof r.dossierVelden === "object") ? r.dossierVelden : {};
    for (const [sleutel, waarde] of Object.entries(uitDossier)) {
      if (sleutel === "directeur" || sleutel === "emailvoorzitter" || sleutel === "emailnotulist") continue;
      if (waarde !== null && waarde !== undefined && String(waarde) !== "") oudeWaarden[sleutel] = waarde;
    }
    for (const sleutel of ["bedrag", "percentage", "toelichting"]) {
      if (veiligeStr(v[sleutel]) && oudeWaarden[sleutel] === undefined) oudeWaarden[sleutel] = v[sleutel];
    }
    setInvulwaarden({ ...oudeWaarden, ...bewaardeInvul });
    setAandeelhouders(Array.isArray(r.aandeelhouders) && r.aandeelhouders.length ? r.aandeelhouders : [{ naam: "", percentage: "100" }]);
    setDatumnotulen(veiligeStr(r.datumnotulen).slice(0, 10));
    // KvK komt van de klantkaart; alleen als die leeg is valt hij terug op wat er bewaard was.
    setKvknummer((k) => veiligeStr(k) || veiligeStr(r.kvknummer));
    setBewaarder(veiligeStr(r.bewaarder));
    setCijfers(r.cijfers && typeof r.cijfers === "object" ? r.cijfers : {});
    setFormulier(r.formulier && typeof r.formulier === "object" ? r.formulier : {});
    setMelding({ type: "ok", tekst: "Eerder opgesteld stuk teruggehaald — opslaan werkt hetzelfde dossier bij." });
  }

  /** Het verstuurvenster openen met de tekst uit Beheer, per variant. */
  function openVersturen(variant) {
    if (!klant || leeg) return;
    const cfg = mailCfg || {};
    const ond = (cfg.ondertekening && typeof cfg.ondertekening === "object") ? cfg.ondertekening : {};
    const vul = (t) => String(t || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, k) => {
      const key = String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (key === "klantnaam") return veiligeStr(klant.klantnaam);
      if (key === "datum") return langeDatum(datumactie);
      if (key === "jaar") return veiligeStr(datumactie).slice(0, 4);
      return "";
    });
    const onderwerp = variant === "ondertekenen" ? (veiligeStr(ond.onderwerp) || veiligeStr(cfg.onderwerp)) : veiligeStr(cfg.onderwerp);
    const tekst = variant === "ondertekenen" ? (veiligeStr(ond.tekst) || veiligeStr(cfg.tekst)) : veiligeStr(cfg.tekst);
    setMelding(null);
    setVerstuurModal({
      variant,
      naar: veiligeStr(emailVoorzitter),
      cc: veiligeStr(emailNotulist),
      onderwerp: vul(onderwerp) || `Liquidatiestukken ${veiligeStr(klant.klantnaam)}`,
      tekst: vul(tekst) || "Bijgaand ontvangt u de liquidatiestukken.",
      // Standaard gaan de stukken die er zijn ook mee; per keer aan of uit te zetten in het venster.
      rapportMee: cijferBlokken.length > 0,
      formulierMee: formulierMist.length === 0 && Object.keys(formulier).length > 0,
    });
  }

  async function verstuur() {
    const m = verstuurModal;
    if (!m || !klant) return;
    if (!veiligeStr(m.naar)) { setMelding({ type: "fout", tekst: "Vul het e-mailadres van de ontvanger in." }); return; }
    setVerstuurBezig(true);
    try {
      const res = await fetch("/api/medewerker-liquidatie-opslaan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actie: "versturen",
          variant: m.variant,
          accountId: klant.accountId,
          klantnaam: veiligeStr(klant.klantnaam),
          dossierId: dossierId || undefined,
          datum: datumactie,
          naar: veiligeStr(m.naar),
          cc: veiligeStr(m.cc).split(/[,;]/).map((x) => x.trim()).filter(Boolean),
          onderwerp: m.onderwerp,
          tekst: m.tekst,
          blokken,
          // Het ontbindingsrapport en het KvK-formulier gaan als eigen bijlage mee — losse documenten,
          // zodat de cliënt ze apart kan bewaren en tekenen.
          rapportBlokken: m.rapportMee ? cijferBlokken : [],
          formulier: formulierAntwoorden,
          formulierMeesturen: !!m.formulierMee,
          bestandsnaamBasis: bestandsnaam,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Versturen mislukt (${res.status}).`);
      if (!levend.current) return;
      setVerstuurModal(null);
      if (d.pdfUrl) setPdfUrl(d.pdfUrl);
      const staart = m.variant === "ondertekenen"
        ? (d.taak && d.taak.gedaan ? " De cliënt heeft een taak gekregen om te ondertekenen." : ` Let op: de taak kon niet worden aangemaakt${d.taak && d.taak.reden ? ` (${d.taak.reden})` : ""}.`)
        : "";
      setMelding({ type: (m.variant === "ondertekenen" && !(d.taak && d.taak.gedaan)) ? "fout" : "ok", tekst: `Liquidatiestuk verstuurd naar ${veiligeStr(m.naar)}.${staart}` });
    } catch (e) {
      if (levend.current) setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) setVerstuurBezig(false);
    }
  }

  async function kopieerTekst() {
    try {
      await navigator.clipboard.writeText(ingevuld);
      setMelding({ type: "ok", tekst: "Het stuk staat op het klembord — plakken in Word kan direct." });
    } catch {
      setMelding({ type: "fout", tekst: "Kopiëren naar het klembord lukte niet in deze browser." });
    }
  }

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  const knop = (kleur, aan = true) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${aan ? kleur : KLEUR.rand}`, background: aan ? kleur : "#F2F3F0", color: aan ? "#fff" : KLEUR.mutedTekst, fontSize: 12.5, fontWeight: 600, cursor: aan ? "pointer" : "not-allowed" });
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  if (sjablonen === null && klanten === null) {
    return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Liquidatiestukken laden…</div>;
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      {onTerug && (
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          <ArrowLeft size={15} /> Terug naar overzicht
        </button>
      )}
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Kies een klant en een liquidatiemodel, vul de vergadering en de aandeelhouders in. Het voorbeeld
        rechts loopt live mee; kop en staart van het stuk liggen vast, alleen het besluit verschilt per model.
      </div>

      {klantFout && <Banner type="fout" tekst={klantFout} />}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── Linkerkolom: invullen ── */}
        <div style={{ flex: "1 1 460px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Klant */}
          <div>
            <span style={label}>Klant</span>
            {klant ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(klant.klantnaam)}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{veiligeStr(klant.klantnummer) && `nr ${veiligeStr(klant.klantnummer)}`}{veiligeStr(klant.groepsnaam) && `  ·  ${veiligeStr(klant.groepsnaam)}`}</div>
                </div>
                <button onClick={() => { setKlant(null); setZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, cliëntnummer of groep…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeKlanten.length === 0 ? <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>{klanten === null ? "Klanten laden…" : "Geen klanten gevonden."}</div> : gefilterdeKlanten.map((k) => (
                    <button key={k.accountId} onClick={() => setKlant(k)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(k.klantnaam)}</span>
                      <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{veiligeStr(k.klantnummer) && `   nr ${veiligeStr(k.klantnummer)}`}{veiligeStr(k.groepsnaam) && `   ·   ${veiligeStr(k.groepsnaam)}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Model */}
          <div>
            <span style={label}>Model liquidatiestuk</span>
            {sjabloon ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{veiligeStr(sjabloon.naam)}</span>
                <button onClick={() => { setSjabloonId(""); setSjabloonZoek(""); setBesluit(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={sjabloonZoek} onChange={(e) => setSjabloonZoek(e.target.value)} placeholder="Zoek een liquidatiemodel…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeSjablonen.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>{sjablonen === null ? "Modellen laden…" : "Geen modellen gevonden."}</div>
                  ) : gefilterdeSjablonen.map((s) => (
                    <button key={s.id} onClick={() => { setSjabloonId(s.id); setSjabloonZoek(""); setBesluit(besluitUitModel(s)); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(s.naam)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {sjablonen !== null && sjablonen.length === 0 && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.goud }}>
                Er zijn nog geen liquidatiemodellen. Maak ze aan bij Beheer → Liquidatiestukken — net als de standaardbrieven:
                een naam, het besluit (punt I) en de invulvelden die erbij horen.
              </div>
            )}
          </div>

          {/* Vergadering */}
          <div>
            <span style={label}>Vergadering</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: "1 1 180px" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Gevestigd te</div>
                <input value={vestigingsplaats} onChange={(e) => setVestigingsplaats(e.target.value)} style={input} placeholder="plaats" />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                {/* De datum van ontbinding is óók de periode van het liquidatiedossier. */}
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Datum ontbinding</div>
                <input type="date" value={datumactie} onChange={(e) => setDatumactie(e.target.value)} style={input} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Datum notulen</div>
                <input type="date" value={datumnotulen} onChange={(e) => setDatumnotulen(e.target.value)} style={input} />
                <div style={{ marginTop: 4, fontSize: 11, color: KLEUR.mutedTekst }}>Leeg = zelfde datum als de ontbinding.</div>
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>
                  KvK-nummer <Lock size={11} />
                </div>
                <input
                  value={kvknummer}
                  readOnly
                  title="Komt van de klantkaart. Klopt het niet, pas het dan bij de cliënt aan — niet hier."
                  style={{ ...input, background: "#F7F8F6", color: kvknummer ? KLEUR.tekst : KLEUR.mutedTekst, cursor: "default" }}
                  placeholder={klant ? "niet ingevuld op de klantkaart" : "kies eerst een cliënt"}
                />
              </div>
              <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column" }}>
                {/* Besluit III. Zoekveld op contactpersonen en cliënten — de bewaarder is meestal de
                    contactpersoon zelf, maar het kan ook een andere relatie of een BV zijn. Een naam
                    die nergens in Dynamics staat mag je gewoon intikken; het veld dwingt niets af. */}
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Bewaarder van de administratie</div>
                <NaamZoeker
                  waarde={bewaarder}
                  opWaarde={(v) => { setBewaarder(v); setBewaarderGegevens(null); }}
                  // Kies je iemand uit de lijst, dan nemen we z'n naam- en adresgegevens over voor het
                  // KvK-formulier — dat vraagt achternaam, voornamen en woonadres apart uit.
                  opKeuze={(s) => setBewaarderGegevens({
                    achternaam: [veiligeStr(s.tussenvoegsel), veiligeStr(s.achternaam)].filter(Boolean).join(" ") || veiligeStr(s.naam),
                    voornaam: veiligeStr(s.voornaam),
                    adres: adresRegel(s.adres),
                  })}
                  placeholder="zoek of typ een naam…"
                  bronnen={["contact", "klant"]} klanten={klanten} medewerkers={medewerkers} invoerStijl={input}
                />
              </div>
            </div>

            {/* Voorzitter en notulist onder elkaar, elk met het bijbehorende mailadres. Kies je een naam
                uit de lijst, dan wordt het e-mailadres van die contactpersoon/cliënt/medewerker meteen
                overgenomen — handmatig aanpassen blijft mogelijk. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Voorzitter</div>
                <NaamZoeker
                  waarde={voorzitter}
                  opWaarde={setVoorzitter}
                  opKeuze={(s) => { if (veiligeStr(s.email)) setEmailVoorzitter(veiligeStr(s.email)); }}
                  placeholder="zoek of typ een naam…"
                  bronnen={["contact", "klant"]} klanten={klanten} medewerkers={medewerkers} invoerStijl={input}
                />
              </div>
              <div style={{ flex: "1 1 240px" }}>
                <MailVeldKop
                  titel="E-mail voorzitter"
                  vrij={mailVrij.voorzitter}
                  opWissel={() => setMailVrij((h) => ({ ...h, voorzitter: !h.voorzitter }))}
                />
                <input
                  value={emailVoorzitter}
                  onChange={(e) => setEmailVoorzitter(e.target.value)}
                  readOnly={!mailVrij.voorzitter}
                  style={mailVrij.voorzitter ? input : { ...input, background: "#F7F8F6", color: KLEUR.subtekst }}
                  placeholder="komt uit de gekozen voorzitter"
                  title={mailVrij.voorzitter ? "" : "Komt uit het gekozen record — klik “Aanpassen” om te wijzigen"}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Notulist</div>
                <NaamZoeker
                  waarde={notulist}
                  opWaarde={setNotulist}
                  opKeuze={(s) => { if (veiligeStr(s.email)) setEmailNotulist(veiligeStr(s.email)); }}
                  placeholder="zoek of typ een naam…"
                  bronnen={["medewerker", "contact"]} klanten={klanten} medewerkers={medewerkers} invoerStijl={input}
                />
              </div>
              <div style={{ flex: "1 1 240px" }}>
                <MailVeldKop
                  titel="E-mail notulist"
                  vrij={mailVrij.notulist}
                  opWissel={() => setMailVrij((h) => ({ ...h, notulist: !h.notulist }))}
                />
                <input
                  value={emailNotulist}
                  onChange={(e) => setEmailNotulist(e.target.value)}
                  readOnly={!mailVrij.notulist}
                  style={mailVrij.notulist ? input : { ...input, background: "#F7F8F6", color: KLEUR.subtekst }}
                  placeholder="komt uit de gekozen notulist"
                  title={mailVrij.notulist ? "" : "Komt uit het gekozen record — klik “Aanpassen” om te wijzigen"}
                />
              </div>
            </div>
          </div>

          {/* Aandeelhouders */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ ...label, marginBottom: 0 }}>Aandeelhouders in het stuk</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={verdeelGelijk} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }} title="Verdeel 100% gelijk over alle rijen"><Users size={13} /> Gelijk verdelen</button>
                <button onClick={voegAandeelhouderToe} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }}><Plus size={13} /> Aandeelhouder</button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aandeelhouders.map((r, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <NaamZoeker
                      waarde={r.naam}
                      opWaarde={(v) => zetAandeelhouder(i, "naam", v)}
                      placeholder={`Aandeelhouder ${i + 1} — zoek of typ een naam…`}
                      bronnen={["klant", "contact"]}
                      klanten={klanten}
                      medewerkers={medewerkers}
                      invoerStijl={{ ...input, flex: "1 1 auto" }}
                    />
                    <div style={{ position: "relative", flex: "0 0 110px" }}>
                      <input
                        value={r.percentage}
                        onChange={(e) => zetAandeelhouder(i, "percentage", e.target.value)}
                        placeholder="aandeel"
                        inputMode="decimal"
                        style={{ ...input, paddingRight: 26, textAlign: "right" }}
                      />
                      <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: KLEUR.mutedTekst }}>%</span>
                    </div>
                    <button onClick={() => verwijderAandeelhouder(i)} title="Rij verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, flexShrink: 0, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, color: KLEUR.subtekst, cursor: "pointer" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Zit deze aandeelhouder er namens een vennootschap? Dan zoek je die er hier bij;
                      hij komt achter de naam in het "Aanwezig"-blok te staan. */}
                  <div style={{ paddingRight: 152 }}>
                    <NamensVeld
                      waarde={r.namens || ""}
                      opWaarde={(v) => zetAandeelhouder(i, "namens", v)}
                      klanten={klanten}
                      medewerkers={medewerkers}
                      invoerStijl={input}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: aandeelIngevuld && Math.abs(somAandeel - 100) > 0.01 ? KLEUR.goud : KLEUR.mutedTekst }}>
              {aandeelIngevuld
                ? `Totaal ${percentageTekst(somAandeel)}%${Math.abs(somAandeel - 100) > 0.01 ? " — dat is geen 100%." : ""}`
                : "Typ twee letters om te zoeken in de cliënten en contactpersonen; ze verschijnen direct in het “Aanwezig”-blok rechts."}
            </div>
          </div>

          {/* Invulvelden bij dit model — de vrije velden uit Beheer (tekst, keuzelijst of alinea-keuze),
              precies zoals bij de standaardbrieven. */}
          {actieveInvulvelden.length > 0 && (
            <div>
              <span style={label}>Invulvelden</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                {actieveInvulvelden.map((v) => (
                  <div key={v.sleutel} style={v.type === "paragraaf" ? { gridColumn: "1 / -1" } : undefined}>
                    <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>{v.label || v.sleutel}</div>
                    {v.type === "keuze" ? (
                      <select
                        value={invulwaarden[v.sleutel] || ""}
                        onChange={(e) => setInvulwaarden((h) => ({ ...h, [v.sleutel]: e.target.value }))}
                        style={input}
                      >
                        <option value="">—</option>
                        {(v.opties || []).map((o, i) => <option key={o.sleutel || i} value={o.label}>{o.label}</option>)}
                      </select>
                    ) : v.type === "paragraaf" ? (
                      <>
                        <select
                          value={invulwaarden[v.sleutel] || ""}
                          onChange={(e) => setInvulwaarden((h) => ({ ...h, [v.sleutel]: e.target.value }))}
                          style={input}
                        >
                          <option value="">— kies een alinea —</option>
                          {(v.opties || []).map((o, i) => <option key={o.sleutel || i} value={o.tekst || ""}>{o.label}</option>)}
                        </select>
                        {veiligeStr(invulwaarden[v.sleutel]) && (
                          <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst, whiteSpace: "pre-wrap", borderLeft: `2px solid ${KLEUR.rand}`, paddingLeft: 8 }}>
                            {invulwaarden[v.sleutel]}
                          </div>
                        )}
                      </>
                    ) : v.type === "bedrag" ? (
                      <>
                        <BedragInvoer
                          waarde={invulwaarden[v.sleutel] || ""}
                          onChange={(nieuw) => setInvulwaarden((h) => ({ ...h, [v.sleutel]: nieuw }))}
                          stijl={input}
                        />
                        {veiligeStr(invulwaarden[v.sleutel]) && (
                          <div style={{ marginTop: 4, fontSize: 11.5, color: KLEUR.mutedTekst }}>in het stuk: {bedragTekst(invulwaarden[v.sleutel])}</div>
                        )}
                      </>
                    ) : v.type === "datum" ? (
                      <>
                        <input
                          type="date"
                          value={veiligeStr(invulwaarden[v.sleutel]).slice(0, 10)}
                          onChange={(e) => setInvulwaarden((h) => ({ ...h, [v.sleutel]: e.target.value }))}
                          style={input}
                        />
                        {veiligeStr(invulwaarden[v.sleutel]) && (
                          <div style={{ marginTop: 4, fontSize: 11.5, color: KLEUR.mutedTekst }}>in het stuk: {langeDatum(invulwaarden[v.sleutel])}</div>
                        )}
                      </>
                    ) : (
                      <input
                        value={invulwaarden[v.sleutel] || ""}
                        onChange={(e) => setInvulwaarden((h) => ({ ...h, [v.sleutel]: e.target.value }))}
                        style={input}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Cijfers van het ontbindingsrapport ─────────────────────────────────────────────
              Vaste regels uit het Word-format; de totalen zijn niet in te tikken maar volgen uit
              de regels erboven, zodat een rapport nooit met een totaal de deur uit gaat dat niet
              bij de cijfers past. Laat je alles leeg, dan komt er ook geen cijferdeel in het stuk. */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ ...label, marginBottom: 0 }}>Balans en resultatenrekening</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {/* Bij een turboliquidatie is er niets meer: alles op nul in één klik. Let op het
                    verschil met leegmaken — nul is een ingevuld bedrag en komt dus als "€ 0" in het
                    rapport te staan, leeg betekent dat er helemaal geen cijferdeel komt. */}
                <button
                  onClick={() => setCijfers(Object.fromEntries(INVULSLEUTELS.map((k) => [k, "0"])))}
                  style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }}
                  title="Alle bedragen op nul — het cijferdeel komt met € 0 in het rapport."
                >
                  Alles nihil
                </button>
                {cijfersIngevuld && (
                  <button
                    onClick={() => setCijfers({})}
                    style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }}
                    title="Alle bedragen leegmaken — het cijferdeel verdwijnt dan uit het stuk."
                  >
                    <RotateCcw size={13} /> Leegmaken
                  </button>
                )}
              </div>
            </div>

            {[
              { titel: "Balans — activa", regels: BALANS_ACTIVA },
              { titel: "Balans — passiva", regels: BALANS_PASSIVA },
              { titel: "Resultatenrekening", regels: RESULTAAT },
            ].map((groep) => (
              <div key={groep.titel} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, margin: "8px 0 4px" }}>{groep.titel}</div>
                {groep.regels.map((r) => (
                  <div
                    key={r.sleutel}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "3px 0",
                      borderTop: r.zwaar ? `1px solid ${KLEUR.rand}` : "none",
                      marginTop: r.zwaar ? 4 : 0, paddingTop: r.zwaar ? 7 : 3,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: r.zwaar ? 700 : 400, color: KLEUR.tekst }}>{r.label}</div>
                    {r.berekend ? (
                      // Berekend: alleen tonen. Geen invoerveld, want dan zou je 'm kunnen laten
                      // afwijken van de regels erboven.
                      <div style={{ width: 130, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst }}>
                        {cijferTekst(berekend[r.sleutel])}
                      </div>
                    ) : (
                      <BedragInvoer
                        waarde={cijfers[r.sleutel] || ""}
                        onChange={(v) => setCijfers((c) => ({ ...c, [r.sleutel]: v }))}
                        stijl={{ ...input, width: 130, textAlign: "right" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}

            {cijfersIngevuld && balansScheef !== 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px", background: "#FDF2F2", border: `1px solid ${KLEUR.rood}`, borderRadius: 8, fontSize: 12, color: KLEUR.rood, fontWeight: 600 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  De balans sluit niet: activa {cijferTekst(berekend.totaalactiva)} tegen passiva {cijferTekst(berekend.totaalpassiva)} —
                  een verschil van {cijferTekst(Math.abs(balansScheef))}. Opslaan kan wel, maar zo hoort het stuk niet naar de cliënt.
                </span>
              </div>
            )}
            {cijfersIngevuld && balansScheef === 0 && (
              <div style={{ fontSize: 11.5, color: KLEUR.groen, fontWeight: 600 }}>
                De balans sluit — activa en passiva zijn allebei {cijferTekst(berekend.totaalactiva)}.
              </div>
            )}
            {!cijfersIngevuld && (
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
                Vul je hier niets in, dan bestaat het stuk alleen uit de notulen — zonder balans en resultatenrekening.
              </div>
            )}
          </div>

          {/* ── KvK-formulier 17a ───────────────────────────────────────────────────────────────
              De melding van de ontbinding bij het Handelsregister. Wat we al weten is voorgevuld;
              de rest vraagt de lijst hieronder, met dezelfde doorverwijzingen als op papier — kies
              je "geen baten", dan verdwijnen de vereffenaarsvragen vanzelf. De handtekening blijft
              handwerk: KvK eist een handtekening met pen, geen kopie of scan. */}
          <div>
            <button
              onClick={() => setFormulierOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", padding: "10px 12px", background: "#fff", border: `1px solid ${KLEUR.rand}`,
                borderRadius: 8, cursor: "pointer", textAlign: "left",
              }}
              aria-expanded={formulierOpen}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: KLEUR.tekst }}>
                <FileText size={15} color={KLEUR.blauw} /> KvK-formulier 17a — ontbinding melden
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {formulierMist.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.goud }}>{formulierMist.length} nog leeg</span>
                )}
                <ChevronDown size={15} style={{ transform: formulierOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s", color: KLEUR.mutedTekst }} />
              </span>
            </button>

            {formulierOpen && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
                {formulierVragen.map((sectie) => (
                  <div key={sectie.sleutel}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>{sectie.titel}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {sectie.vragen.map((v) => {
                        const waarde = formulierAntwoorden[v.id];
                        const leegVerplicht = v.verplicht && formulierMist.some((m) => m.id === v.id);
                        return (
                          <div key={v.id}>
                            <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 4 }}>
                              {v.vraag}
                              {v.verplicht && <span style={{ color: leegVerplicht ? KLEUR.goud : KLEUR.mutedTekst }}> *</span>}
                            </div>

                            {v.gekoppeld ? (
                              // Deze vraag wordt hierboven in het scherm al gesteld. Twee keer
                              // invullen zou betekenen dat het formulier van het stuk kan gaan
                              // afwijken, dus laten we hem hier alleen zien.
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F8F6", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
                                <Lock size={12} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 12.5, color: veiligeStr(waarde) ? KLEUR.tekst : KLEUR.mutedTekst }}>
                                  {v.type === "datum" ? (langeDatum(waarde) || "nog niet ingevuld") : (veiligeStr(waarde) || "nog niet ingevuld")}
                                </span>
                                <span style={{ marginLeft: "auto", fontSize: 11, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>uit {v.gekoppeld}</span>
                              </div>
                            ) : v.type === "keuze" ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {v.opties.map((optie, i) => {
                                  // Bewust NIET Number(waarde) === i: Number("") is 0, dus een
                                  // leeggemaakte vraag zou de eerste optie als gekozen tonen terwijl
                                  // er niets bewaard is — en dan zou het formulier iets melden wat je
                                  // nooit hebt aangeklikt.
                                  const gekozen = gekozenOptie(waarde) === i;
                                  return (
                                    <button
                                      key={optie}
                                      onClick={() => zetFormulier(v.id, gekozen ? "" : i)}
                                      style={{
                                        padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                        border: `1px solid ${gekozen ? KLEUR.blauw : KLEUR.rand}`,
                                        background: gekozen ? KLEUR.blauw : "#fff",
                                        color: gekozen ? "#fff" : KLEUR.subtekst,
                                      }}
                                    >
                                      {optie}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : v.type === "vink" ? (
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                                <input type="checkbox" checked={waarde === true} onChange={(e) => zetFormulier(v.id, e.target.checked)} style={{ width: 15, height: 15 }} />
                                <span style={{ color: KLEUR.tekst }}>Aankruisen</span>
                              </label>
                            ) : v.type === "datum" ? (
                              <input type="date" value={veiligeStr(waarde).slice(0, 10)} onChange={(e) => zetFormulier(v.id, e.target.value)} style={input} />
                            ) : v.type === "memo" ? (
                              <textarea value={veiligeStr(waarde)} onChange={(e) => zetFormulier(v.id, e.target.value)} rows={2} style={{ ...input, resize: "vertical", lineHeight: 1.4 }} />
                            ) : (
                              <input value={veiligeStr(waarde)} onChange={(e) => zetFormulier(v.id, e.target.value)} style={input} />
                            )}

                            {v.hulp && <div style={{ marginTop: 4, fontSize: 11, color: KLEUR.mutedTekst }}>{v.hulp}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button onClick={() => maakFormulier(false)} disabled={formulierBezig || !klant} style={{ ...knop(KLEUR.groen, !(formulierBezig || !klant)) }}>
                    {formulierBezig ? <Loader2 size={15} className="spin" /> : <Printer size={15} />} {formulierBezig ? "Bezig…" : "Formulier maken"}
                  </button>
                  <button onClick={() => maakFormulier(true)} disabled={formulierBezig || !klant} style={{ ...knopLicht, opacity: formulierBezig || !klant ? 0.6 : 1 }}>
                    <Save size={15} /> Maken en in dossier opslaan
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
                  Het formulier opent in een nieuw tabblad en blijft invulbaar, zodat je nog kunt bijstellen
                  voordat je afdrukt. Ondertekenen moet met pen — KvK accepteert geen kopie of scan van een
                  handtekening. Stuur het getekende ontbindingsbesluit (de notulen) mee, plus een kopie van
                  een geldig identiteitsbewijs van wie tekent.
                </div>
              </div>
            )}
          </div>

          {/* Besluiten — het enige stuk tekst dat per stuk verschilt */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ ...label, marginBottom: 0 }}>Besluit — punt I van dit stuk</span>
              {sjabloon && veiligeStr(sjabloon.besluit) && veiligeStr(besluit) !== veiligeStr(sjabloon.besluit) && (
                <button onClick={() => setBesluit(veiligeStr(sjabloon.besluit))} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }} title="Terug naar de tekst van het model">
                  <RotateCcw size={13} /> Model herstellen
                </button>
              )}
            </div>
            <textarea
              value={besluit}
              onChange={(e) => setBesluit(e.target.value)}
              disabled={!sjabloon}
              rows={8}
              placeholder={sjabloon ? "I. Ontbinding van de Vennootschap\n> De Vennootschap wordt ontbonden met ingang van {{datumontbinding}}…" : "Kies eerst een liquidatiemodel."}
              style={{ ...input, resize: "vertical", minHeight: 150, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, background: sjabloon ? "#fff" : "#F7F8F6" }}
            />
            <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
              Alleen dit besluit hoort bij dít stuk; kop en staart (aanwezigen, sluiting, ondertekening)
              staan één keer in Beheer → Liquidatiestukken en gelden voor alle stukken.
              Opmaak: <code>&gt;</code> inspringen, <code>-</code> opsomming, <code>###</code> kopje.
            </div>
            {modelOngesplitst && !veiligeStr(besluit) && (
              <div style={{ marginTop: 8 }}>
                <Banner type="fout" tekst="Dit model staat in Beheer nog als één lap tekst. Het stuk hiernaast is die tekst, ongewijzigd — knip het besluit in Beheer los, dan gebruiken kop en staart de centrale tekst en bewegen aandeelhouders en ondertekening mee." />
              </div>
            )}
            {!modelOngesplitst && sjabloon && !/\{\{\s*aandeelhouders\s*[|}]/i.test(ruweTekst) && (
              <div style={{ marginTop: 8 }}>
                <Banner type="fout" tekst="In de vaste kop staat geen {{aandeelhouders}}, dus de aandeelhouders die je hier invult komen niet in het stuk. Voeg de plaatshouder toe in Beheer → Liquidatiestukken." />
              </div>
            )}
          </div>

          {/* Acties */}
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
            {/* Waar gaat dit heen? Bij een stuk dat je bewerkt is dat een BESTAANDE regel in het
                logboek; die willen we zwart-op-wit tonen, want anders is niet te zien of je bijwerkt
                of iets nieuws maakt. */}
            {klant && opgeslagenOoit && huidigeRegel && (
              <div style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 600, color: KLEUR.blauw, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "5px 10px" }}>
                <RotateCcw size={13} />
                <span>
                  Opslaan werkt het bestaande stuk bij: <strong>{veiligeStr(huidigeRegel.modelNaam) || "Liquidatiestuk"}</strong>
                  {langeDatum(huidigeRegel.datum) ? ` d.d. ${langeDatum(huidigeRegel.datum)}` : ""} — er komt geen tweede regel in het logboek bij.
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={knop(KLEUR.groen, !!klant && !leeg && !opslaanBezig)} disabled={!klant || leeg || opslaanBezig} onClick={() => opslaan()}>
                {opslaanBezig ? <Loader2 size={15} className="spin" /> : <Save size={15} />} {opslaanBezig ? "Opslaan…" : (opgeslagenOoit ? "Dit stuk bijwerken" : "Opslaan in dossier")}
              </button>
              {opgeslagenOoit && (
                <button
                  style={{ ...knopLicht, opacity: klant && !leeg && !opslaanBezig ? 1 : 0.5, cursor: klant && !leeg && !opslaanBezig ? "pointer" : "not-allowed" }}
                  disabled={!klant || leeg || opslaanBezig}
                  onClick={() => opslaan({ alsNieuw: true })}
                  title="Laat het stuk dat je nu bewerkt staan en legt dit vast als een nieuw stuk, met een eigen regel in het logboek."
                >
                  <Plus size={15} /> Opslaan als nieuw stuk
                </button>
              )}
              <button style={{ ...knopLicht, opacity: klant && !leeg ? 1 : 0.5, cursor: klant && !leeg ? "pointer" : "not-allowed" }} disabled={!klant || leeg} onClick={() => openVersturen("mail")}>
                <Mail size={15} /> Mailen
              </button>
              <button style={{ ...knopLicht, opacity: klant && !leeg ? 1 : 0.5, cursor: klant && !leeg ? "pointer" : "not-allowed" }} disabled={!klant || leeg} onClick={() => openVersturen("ondertekenen")}>
                <FileSignature size={15} /> Ter ondertekening
              </button>
              <button style={knop(KLEUR.blauw, !leeg)} disabled={leeg} onClick={afdrukken}><Printer size={15} /> Afdrukken / PDF</button>
              <button style={{ ...knopLicht, opacity: leeg ? 0.5 : 1, cursor: leeg ? "not-allowed" : "pointer" }} disabled={leeg} onClick={kopieerTekst}><Copy size={15} /> Tekst kopiëren</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst }}>
              Opslaan zet het stuk als PDF in de SharePoint-map van de cliënt (submap “Liquidatie”) en legt
              de gegevens vast in een liquidatiedossier — datum, bedrag, percentage, de aandelen en de link
              naar het stuk. Daarna vind je het terug in het Liquidatie-overzicht.
            </div>
            {pdfUrl && (
              <div style={{ marginTop: 8 }}>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...knopLicht, textDecoration: "none", padding: "6px 10px" }}>
                  <FileText size={14} /> Bekijk het opgeslagen stuk in SharePoint
                </a>
              </div>
            )}
            {melding && <div style={{ marginTop: 12 }}><Banner type={melding.type} tekst={melding.tekst} /></div>}
          </div>

          {/* Eerder opgestelde stukken van deze cliënt — terug te halen en bij te werken */}
          {klant && eerdere.length > 0 && (
            <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
              <span style={label}>Eerder opgesteld — {veiligeStr(klant.klantnaam)} ({eerdere.length})</span>
              <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
                {eerdere.map((r) => (
                  <div key={r.dossierId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${KLEUR.rand}`, background: r.dossierId === dossierId ? KLEUR.lichtblauw : "#fff" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(r.modelNaam) || "Liquidatiestuk"}</div>
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>
                        {langeDatum(r.datum) || "geen datum"}
                        {veiligeStr(r.opgesteldDoor) ? `  ·  ${veiligeStr(r.opgesteldDoor)}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {veiligeStr(r.pdfUrl) && (
                        <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...knopLicht, padding: "6px 10px", textDecoration: "none" }}><FileText size={13} /> Bekijk</a>
                      )}
                      <button onClick={() => heropen(r)} style={{ ...knopLicht, padding: "6px 10px" }}>Bewerken</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Rechterkolom: live voorbeeld ── */}
        <div style={{ flex: "1 1 520px", minWidth: 360, position: "sticky", top: 12 }}>
          <span style={{ ...label, marginBottom: 8 }}>Voorbeeld</span>
          <div style={{ background: "#EEF0EC", borderRadius: 10, padding: 18, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            <div style={{ background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 4, boxShadow: "0 6px 24px rgba(0,0,0,0.08)", margin: "0 auto", maxWidth: 620, minHeight: "calc(620px * 1.414)", padding: "56px 60px", boxSizing: "border-box", color: KLEUR.tekst, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12.5, lineHeight: 1.55 }}>
              {!eigenKop && !leeg && (<>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{klant ? veiligeStr(klant.klantnaam) : "—"}</div>
                <div style={{ color: KLEUR.subtekst, fontSize: 12, marginBottom: 26 }}>{subkop}</div>
              </>)}
              {leeg ? (
                <div style={{ color: KLEUR.mutedTekst, fontStyle: "italic" }}>Kies links een liquidatiemodel; het stuk verschijnt hier meteen.</div>
              ) : (
                blokken.map(renderBlok)
              )}
            </div>

            {/* Het ontbindingsrapport is een eigen document, dus ook een eigen vel in het voorbeeld. */}
            {cijferBlokken.length > 0 && (
              <>
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".05em", margin: "18px 0 10px" }}>
                  Tweede document — ontbindingsrapport
                </div>
                <div style={{ background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 4, boxShadow: "0 6px 24px rgba(0,0,0,0.08)", margin: "0 auto", maxWidth: 620, minHeight: "calc(620px * 1.414)", padding: "56px 60px", boxSizing: "border-box", color: KLEUR.tekst, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12.5, lineHeight: 1.55 }}>
                  {cijferBlokken.map(renderBlok)}
                </div>
              </>
            )}
          </div>

          {/* Derde document: het KvK-formulier. Uitklappen laadt de écht gevulde PDF, zodat je kunt
              controleren wat er straks op papier staat — dus niet een namaak-weergave. */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setFormulierVoorbeeldOpen((v) => !v)}
              disabled={!klant}
              aria-expanded={formulierVoorbeeldOpen}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%",
                padding: "10px 12px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8,
                cursor: klant ? "pointer" : "not-allowed", textAlign: "left", opacity: klant ? 1 : 0.6,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst }}>
                <FileText size={14} color={KLEUR.blauw} /> Derde document — KvK-formulier 17a
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {formulierVoorbeeldOpen && formulierVoorbeeldBezig && <Loader2 size={13} className="spin" color={KLEUR.mutedTekst} />}
                <ChevronDown size={15} style={{ transform: formulierVoorbeeldOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s", color: KLEUR.mutedTekst }} />
              </span>
            </button>
            {formulierVoorbeeldOpen && (
              <div style={{ marginTop: 8 }}>
                {formulierVoorbeeldFout ? (
                  <div style={{ display: "flex", gap: 8, padding: "9px 11px", background: "#FDF2F2", border: `1px solid ${KLEUR.rood}`, borderRadius: 8, fontSize: 12, color: KLEUR.rood }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{formulierVoorbeeldFout}</span>
                  </div>
                ) : formulierVoorbeeldUrl ? (
                  <iframe
                    title="KvK-formulier 17a"
                    src={formulierVoorbeeldUrl}
                    style={{ width: "100%", height: 620, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, background: "#fff" }}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "10px 2px" }}>Formulier ophalen…</div>
                )}
              </div>
            )}
          </div>

          {/* Staat er in Beheer nog niets, dan gebruikt het stuk de standaardtekst. Dat melden we, want
              anders vraag je je af waar die aanhef vandaan komt — en of je hem mag aanpassen. */}
          {sjabloon && (!veiligeStr(opbouw.kop) || !veiligeStr(opbouw.staart)) && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, padding: "9px 11px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12, color: KLEUR.subtekst }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: KLEUR.blauw }} />
              <span>
                De vaste {!veiligeStr(opbouw.kop) && !veiligeStr(opbouw.staart) ? "kop en staart komen" : !veiligeStr(opbouw.kop) ? "kop komt" : "staart komt"} uit
                de standaardtekst. Wil je een andere aanhef of ondertekening, pas die dan aan bij{" "}
                <strong>Beheer → Liquidatiestukken</strong>; dat geldt dan voor alle liquidatiestukken.
              </span>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst }}>
            Nog niet ingevulde gegevens staan als <strong>[INVULPLEK]</strong> in het stuk, net als in de Word-modellen.
            De drie documenten gaan als losse bijlagen naar de cliënt.
          </div>
        </div>
      </div>

      {verstuurModal && (
        <div onClick={() => !verstuurBezig && setVerstuurModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {verstuurModal.variant === "ondertekenen" ? "Ter ondertekening aanbieden" : "Liquidatiestuk mailen"}
            </div>
            <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
              {verstuurModal.variant === "ondertekenen"
                ? "Het stuk gaat als PDF mee én de cliënt krijgt een taak om te ondertekenen. Onderwerp en tekst komen uit Beheer → Liquidatiestukken; hier kun je ze per keer nog aanpassen."
                : "Het stuk gaat als PDF-bijlage mee. Onderwerp en tekst komen uit Beheer → Liquidatiestukken; hier kun je ze per keer nog aanpassen."}
            </div>
            {/* Wat gaat er mee? De notulen altijd; het rapport en het KvK-formulier alleen als ze er zijn. */}
            <div style={{ marginBottom: 14, padding: "10px 12px", background: "#FAFBF9", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>Bijlagen</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
                  <input type="checkbox" checked readOnly style={{ width: 15, height: 15 }} />
                  Notulen ontbinding (gaat altijd mee)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: cijferBlokken.length ? KLEUR.tekst : KLEUR.mutedTekst, cursor: cijferBlokken.length ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    checked={!!verstuurModal.rapportMee && cijferBlokken.length > 0}
                    disabled={!cijferBlokken.length}
                    onChange={(e) => setVerstuurModal((h) => ({ ...h, rapportMee: e.target.checked }))}
                    style={{ width: 15, height: 15 }}
                  />
                  Ontbindingsrapport (balans en resultatenrekening){cijferBlokken.length ? "" : " — nog geen cijfers ingevuld"}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.tekst, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!verstuurModal.formulierMee}
                    onChange={(e) => setVerstuurModal((h) => ({ ...h, formulierMee: e.target.checked }))}
                    style={{ width: 15, height: 15 }}
                  />
                  KvK-formulier 17a{formulierMist.length ? ` — let op: ${formulierMist.length} verplichte vraag/vragen nog leeg` : ""}
                </label>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: "1 1 240px" }}>
                <span style={label}>E-mail ontvanger</span>
                <input value={verstuurModal.naar} onChange={(e) => setVerstuurModal((h) => ({ ...h, naar: e.target.value }))} style={input} placeholder="naam@bedrijf.nl" />
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <span style={label}>CC (optioneel)</span>
                <input value={verstuurModal.cc} onChange={(e) => setVerstuurModal((h) => ({ ...h, cc: e.target.value }))} style={input} placeholder="cc@… (komma-gescheiden)" />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={label}>Onderwerp</span>
              <input value={verstuurModal.onderwerp} onChange={(e) => setVerstuurModal((h) => ({ ...h, onderwerp: e.target.value }))} style={input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={label}>Berichttekst</span>
              <textarea value={verstuurModal.tekst} onChange={(e) => setVerstuurModal((h) => ({ ...h, tekst: e.target.value }))} rows={8} style={{ ...input, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setVerstuurModal(null)} disabled={verstuurBezig} style={{ ...knopLicht, opacity: verstuurBezig ? 0.6 : 1 }}>Annuleren</button>
              <button onClick={verstuur} disabled={verstuurBezig || !veiligeStr(verstuurModal.naar)} style={knop(KLEUR.groen, !verstuurBezig && !!veiligeStr(verstuurModal.naar))}>
                {verstuurBezig ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} {verstuurBezig ? "Versturen…" : "Versturen"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes liqspin{to{transform:rotate(360deg)}} .spin{animation:liqspin 1s linear infinite}`}</style>
    </div>
  );
}

/**
 * Naamveld met opzoeken. Je typt (minimaal 2 tekens) en krijgt suggesties uit de meegegeven bronnen:
 *   - "klant"      → de al geladen cliëntenlijst (holdings, B.V.'s — vaak de aandeelhouder zelf)
 *   - "contact"    → contactpersonen uit Dynamics via /api/klant-contacten (met vertraging, zodat
 *                    niet elke toetsaanslag een aanroep wordt)
 *   - "medewerker" → de al geladen medewerkerslijst (voor de notulist)
 * Kiezen vult de naam exact zoals hij in Dynamics staat. Zelf een naam intikken blijft gewoon
 * mogelijk — de suggesties zijn hulp, geen verplichting.
 */
function NaamZoeker({ waarde, opWaarde, opKeuze, placeholder, bronnen, klanten, medewerkers, invoerStijl }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [contacten, setContacten] = useState([]);
  const [bezig, setBezig] = useState(false);
  const doosRef = useRef(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  // Buiten het veld klikken sluit de suggestielijst (blur alleen is te vroeg: dan gaat de klik op een
  // suggestie verloren).
  useEffect(() => {
    if (!open) return;
    const buiten = (e) => { if (doosRef.current && !doosRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", buiten);
    return () => document.removeEventListener("mousedown", buiten);
  }, [open]);

  // Contactpersonen ophalen, 250 ms na de laatste toetsaanslag.
  useEffect(() => {
    if (!bronnen.includes("contact") || term.trim().length < 2) { setContacten([]); return; }
    setBezig(true);
    const t = setTimeout(() => {
      fetch("/api/klant-contacten?zoek=" + encodeURIComponent(term.trim()))
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => { if (levend.current) setContacten(Array.isArray(d.contacten) ? d.contacten : []); })
        .catch(() => { if (levend.current) setContacten([]); })
        .finally(() => { if (levend.current) setBezig(false); });
    }, 250);
    return () => { clearTimeout(t); setBezig(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const suggesties = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    const uit = [];
    if (bronnen.includes("klant")) {
      for (const k of klanten || []) {
        if (!veiligeStr(k.klantnaam).toLowerCase().includes(t)) continue;
        uit.push({
          sleutel: `k-${k.accountId}`, naam: veiligeStr(k.klantnaam), soort: "Cliënt",
          // Het adres van de contactpersoon van die cliënt, anders het algemene klantadres — zodat het
          // e-mailveld ernaast automatisch gevuld kan worden.
          email: veiligeStr(k.contact && k.contact.email) || veiligeStr(k.emailKlant),
          // Naam- en adresdelen van de contactpersoon, voor velden die die apart uitvragen.
          voornaam: veiligeStr(k.contact && k.contact.voornaam),
          tussenvoegsel: veiligeStr(k.contact && k.contact.tussenvoegsel),
          achternaam: veiligeStr(k.contact && k.contact.achternaam),
          adres: (k.contact && k.contact.adres) || k.adres || null,
          sub: [veiligeStr(k.klantnummer) && `nr ${veiligeStr(k.klantnummer)}`, veiligeStr(k.groepsnaam)].filter(Boolean).join("  ·  "),
        });
        if (uit.length >= 8) break;
      }
    }
    if (bronnen.includes("medewerker")) {
      for (const m of medewerkers || []) {
        if (!veiligeStr(m.naam).toLowerCase().includes(t)) continue;
        uit.push({ sleutel: `m-${m.id}`, naam: veiligeStr(m.naam), soort: "Medewerker", email: veiligeStr(m.email), sub: veiligeStr(m.functie) });
        if (uit.length >= 16) break;
      }
    }
    for (const c of contacten) {
      uit.push({
        sleutel: `c-${c.id}`, naam: veiligeStr(c.naam), soort: "Contactpersoon", email: veiligeStr(c.email),
        voornaam: veiligeStr(c.voornaam), tussenvoegsel: veiligeStr(c.tussenvoegsel), achternaam: veiligeStr(c.achternaam),
        adres: c.adres || null,
        sub: veiligeStr(c.email),
      });
      if (uit.length >= 24) break;
    }
    // Dezelfde naam uit twee bronnen (cliënt én contactpersoon) maar één keer tonen.
    const gezien = new Set();
    return uit.filter((s) => { const k = s.naam.toLowerCase(); if (!s.naam || gezien.has(k)) return false; gezien.add(k); return true; });
  }, [term, contacten, klanten, medewerkers, bronnen]);

  const invoer = invoerStijl || {};
  return (
    <div ref={doosRef} style={{ position: "relative", flex: invoer.flex || "1 1 auto" }}>
      <input
        value={waarde}
        onChange={(e) => { opWaarde(e.target.value); setTerm(e.target.value); setOpen(true); }}
        onFocus={() => { setTerm(waarde); setOpen(true); }}
        placeholder={placeholder}
        style={{ ...invoer, flex: undefined, width: "100%" }}
      />
      {open && term.trim().length >= 2 && (
        <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "calc(100% + 4px)", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", maxHeight: 240, overflowY: "auto" }}>
          {suggesties.length === 0 ? (
            <div style={{ padding: "9px 12px", fontSize: 12, color: KLEUR.mutedTekst }}>
              {bezig ? "Zoeken…" : "Niets gevonden — je kunt de naam ook gewoon intypen."}
            </div>
          ) : suggesties.map((s) => (
            <button
              key={s.sleutel}
              onClick={() => { opWaarde(s.naam); if (opKeuze) opKeuze(s); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>{s.naam}</div>
              <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{s.soort}{s.sub ? `  ·  ${s.sub}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Eén blok als React — zelfde volgorde en verhoudingen als blokkenNaarHtml (documentOpmaak.js),
 *  zodat het voorbeeld op het scherm en de afdruk er hetzelfde uitzien. */
function renderBlok(b, i) {
  switch (b.type) {
    case "titel":
      return <div key={i} style={{ fontSize: 21, fontWeight: 700, textAlign: "center", marginBottom: 2 }}>{b.tekst}</div>;
    case "kop":
      return <div key={i} style={{ fontSize: 14.5, fontWeight: 700, margin: "14px 0 4px" }}>{b.tekst}</div>;
    case "kopje":
      return <div key={i} style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 3px" }}>{b.tekst}</div>;
    case "midden":
      return <div key={i} style={{ textAlign: "center", marginBottom: 4 }}>{b.tekst}</div>;
    case "lijn":
      return <div key={i} style={{ borderTop: `1px solid ${KLEUR.tekst}`, margin: "14px 0" }} />;
    case "punt":
      return (
        <div key={i} style={{ display: "flex", gap: 8, margin: "0 0 5px 10px" }}>
          <span style={{ flex: "0 0 auto", minWidth: 18 }}>{b.merk}</span>
          <span>{b.tekst}</span>
        </div>
      );
    // Balans en resultatenrekening: twee kolommen, bedrag rechts, streep boven een totaal — dezelfde
    // opmaak als in de PDF (zie api/_gedeeld/notulenRenderer.js) en in de afdruk (documentOpmaak.js).
    // Zonder deze twee gevallen zou het cijferdeel in het voorbeeld leeg blijven terwijl het in de
    // PDF wél staat, en dan controleer je iets anders dan wat je verstuurt.
    case "tabel":
      return (
        <div key={i} style={{ marginBottom: 10 }}>
          {b.titel && <div style={{ fontWeight: 700, margin: "12px 0 3px" }}>{b.titel}</div>}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {(b.regels || []).map((r, j) => (
                <tr key={j}>
                  <td style={{ padding: r.zwaar ? "4px 0 2px" : "2px 0", verticalAlign: "top", fontWeight: r.zwaar ? 700 : 400, borderTop: r.zwaar ? `1px solid ${KLEUR.tekst}` : "none" }}>
                    {r.label}
                  </td>
                  <td style={{ padding: r.zwaar ? "4px 0 2px" : "2px 0", textAlign: "right", whiteSpace: "nowrap", width: "42%", fontWeight: r.zwaar ? 700 : 400, borderTop: r.zwaar ? `1px solid ${KLEUR.tekst}` : "none" }}>
                    {r.bedrag}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    // Pagina-einde: in het voorbeeld een zichtbare scheiding, zodat je ziet waar het blad breekt.
    case "paginaeinde":
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
          <div style={{ flex: 1, borderTop: `1px dashed ${KLEUR.rand}` }} />
          <span style={{ fontSize: 10, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em" }}>nieuwe pagina</span>
          <div style={{ flex: 1, borderTop: `1px dashed ${KLEUR.rand}` }} />
        </div>
      );
    case "inspring":
      return <div key={i} style={{ margin: "0 0 9px 22px" }}>{b.tekst}</div>;
    case "ondertekening":
      return (
        // Geen "[Handtekening]"-tekst meer boven de stippellijn: dat is een aanwijzing voor de lezer
        // die in een ondertekend stuk niets te zoeken heeft. De witruimte blijft wel staan, zodat er
        // ruimte is om te tekenen.
        <div key={i} style={{ marginTop: 34 }}>
          <div style={{ height: 29 }} />
          <div style={{ width: 235, borderBottom: `1px solid ${KLEUR.tekst}` }} />
          {b.naam ? <div style={{ marginTop: 4 }}>{b.naam}</div> : null}
          {b.namens ? <div style={{ fontSize: 12 }}>handelend namens {b.namens}</div> : null}
          {b.functie ? <div style={{ fontSize: 12 }}>{b.functie}</div> : null}
        </div>
      );
    case "handtekening":
      return (
        <div key={i} style={{ display: "flex", gap: 40, marginTop: 46 }}>
          {b.namen.map((n, j) => (
            <div key={j} style={{ flex: "1 1 0", minWidth: 0 }}>
              <div style={{ borderBottom: `1px solid ${KLEUR.tekst}`, height: 34 }} />
              <div style={{ fontSize: 11.5, marginTop: 4 }}>{n}</div>
            </div>
          ))}
        </div>
      );
    default:
      return <div key={i} style={{ marginTop: b.naPunt ? 9 : 0, marginBottom: 9, whiteSpace: "pre-wrap" }}>{b.tekst}</div>;
  }
}

/** Label van een alleen-lezen mailveld, met een slotje en een schakelaar om het toch te openen. */
function MailVeldKop({ titel, vrij, opWissel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 4 }}>
        {titel}
        {!vrij && <Lock size={10} color={KLEUR.mutedTekst} />}
      </span>
      <button
        type="button"
        onClick={opWissel}
        style={{ background: "none", border: "none", padding: 0, color: KLEUR.blauw, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
      >
        {vrij ? "Vastzetten" : "Aanpassen"}
      </button>
    </div>
  );
}

/**
 * "Handelend namens …" bij een aandeelhouder. Zit iemand niet voor zichzelf in de vergadering maar
 * namens zijn vennootschap, dan zoek je die B.V. hier op — zelfde zoeklijst als bij de naam zelf, dus
 * de schrijfwijze blijft gelijk aan Dynamics. In het "Aanwezig"-blok komt dat achter de naam te staan:
 * "J. Jansen, handelend namens Jansen Beheer B.V. — 50%".
 *
 * Standaard staat het veld dicht: het is de uitzondering, en een altijd zichtbaar leeg veld per rij
 * maakt de lijst onleesbaar. Is het al ingevuld (bijv. bij het heropenen van een stuk), dan staat het
 * meteen open.
 */
function NamensVeld({ waarde, opWaarde, klanten, medewerkers, invoerStijl }) {
  const [open, setOpen] = useState(!!veiligeStr(waarde));
  // Een heropend stuk vult de waarde ná de eerste render; dan hoort het veld alsnog open te staan.
  useEffect(() => { if (veiligeStr(waarde)) setOpen(true); }, [waarde]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ alignSelf: "flex-start", marginTop: 5, background: "none", border: "none", padding: 0, color: KLEUR.blauw, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
      >
        + handelend namens…
      </button>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Handelend namens</span>
        <button
          type="button"
          onClick={() => { opWaarde(""); setOpen(false); }}
          style={{ background: "none", border: "none", padding: 0, color: KLEUR.blauw, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          Weghalen
        </button>
      </div>
      <NaamZoeker
        waarde={waarde}
        opWaarde={opWaarde}
        placeholder="zoek de B.V. of typ een naam…"
        bronnen={["klant", "contact"]}
        klanten={klanten}
        medewerkers={medewerkers}
        invoerStijl={invoerStijl}
      />
    </div>
  );
}

function Banner({ type, tekst }) {
  const ok = type === "ok";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: ok ? "#EAF6EE" : "#FBECEC", color: ok ? KLEUR.groen : KLEUR.rood, border: `1px solid ${ok ? "#BFE3CB" : "#F0C9C9"}` }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} <span>{tekst}</span>
    </div>
  );
}
