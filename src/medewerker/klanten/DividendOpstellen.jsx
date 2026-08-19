import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Printer, Copy, CheckCircle2, AlertTriangle, ArrowLeft, Plus, Trash2, Users, RotateCcw,
  Save, Loader2, FileText, Mail, FileSignature, Lock,
} from "lucide-react";
import { ontleedDocument, heeftEigenKop, blokkenNaarHtml, AFDRUK_CSS } from "../documentOpmaak";
import { useMijnNaam } from "../MijnFilter";
import { normaliseerSleutel, vulSjabloonIn, bouwMergeWaarden } from "../dossierMerge";

/**
 * Dividendstuk opstellen — medewerkersportaal → Klantoverzicht → Dividenduitkeringen →
 * "Dividendstuk opstellen".
 *
 * Losse tegenhanger van NotulenOpstellen.jsx: dezelfde werkwijze, maar op de soort
 * Dividenduitkering. Bewust een eigen bestand en geen gedeelde component, zodat een wijziging aan
 * het notulenscherm dit scherm nooit raakt (en andersom).
 *
 * Links kies je de cliënt en het model en vul je de gegevens in, rechts loopt het voorbeeld live mee
 * op een blanco A4. De aandeelhouders vul je hier in (naam + aandeel); ze verschijnen direct in het
 * "Aanwezig"-blok. Kop en staart komen uit Beheer → Dividend en gelden voor álle dividendstukken —
 * alleen het TUSSENSTUK ertussen verschilt per model, en is per stuk nog aan te passen.
 *
 * Net als bij een brief toont dit scherm géén dossiervelden: je vult de INVULVELDEN in die in
 * Beheer → Dividend bij dit model zijn aangezet. Bij het opslaan gaat wat plaatsbaar is alsnog naar
 * het dividenddossier in Dynamics — de voorzitter, de aandeel-percentages, en elk invulveld waarvan
 * de sleutel een kolom van de soort Dividenduitkering is (bijv. {{bedragdividenduitkering}}).
 *
 * Namen (aandeelhouders, voorzitter, notulist) zoek je op in plaats van ze te typen — dat scheelt
 * typefouten en houdt de schrijfwijze gelijk aan Dynamics. Zelf iets intypen mag altijd: een
 * aandeelhouder die nog nergens staat, tik je gewoon in.
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

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
 * Wat we van een getikt bedrag BEWAREN: alleen cijfers en hooguit één decimale komma. Zo blijft de
 * opgeslagen waarde een kaal getal ("100000", "1250,50") — precies wat Dynamics en het logboek
 * willen — terwijl het scherm er duizendpunten omheen mag zetten.
 */
function schoonBedrag(v) {
  const ruw = String(v == null ? "" : v).replace(/[^\d,.]/g, "").replace(/\./g, "");
  const [heel, ...rest] = ruw.split(",");
  return rest.length ? `${heel},${rest.join("").slice(0, 2)}` : heel;
}

/** Hetzelfde bedrag mét duizendpunten, zoals het in het invoerveld hoort te staan: "100.000". */
function groepeerBedrag(v) {
  const schoon = schoonBedrag(v);
  if (!schoon) return "";
  const [heel, decimalen] = schoon.split(",");
  const metPunten = heel ? heel.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  return decimalen !== undefined ? `${metPunten},${decimalen}` : metPunten;
}

/**
 * Invoerveld voor een bedrag dat tijdens het typen meteen duizendpunten toont ("100.000") maar naar
 * buiten toe het kale getal doorgeeft. De cursor wordt teruggezet op basis van het aantal ECHTE
 * tekens vóór de cursor (cijfers en de decimale komma), niet op de tekenpositie — anders springt hij
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
      if (/[\d,]/.test(el.value[pos])) geteld += 1;
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
        tekensVoorCaret.current = (voor.match(/[\d,]/g) || []).length;
        onChange(schoonBedrag(el.value));
      }}
      inputMode="decimal"
      placeholder="bijv. 100.000"
      style={stijl}
    />
  );
}

/**
 * Het stuk = vaste kop (Beheer) + het tussenstuk van dít stuk + vaste staart (Beheer). Anders dan bij
 * notulen is er hier geen ingebouwde standaardtekst als terugval: is de kop of de staart in Beheer nog
 * leeg, dan blijft dat deel gewoon weg. Lege delen worden overgeslagen, zodat er geen dubbele witregels
 * ontstaan.
 */
function steltStukSamen({ kop, tussenstuk, staart }) {
  const k = String(kop == null ? "" : kop).replace(/\s+$/, "");
  const t = String(tussenstuk == null ? "" : tussenstuk).trim();
  const s = String(staart == null ? "" : staart).replace(/^\s+/, "");
  return [k, t, s].filter((deel) => deel.trim()).join("\n\n");
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

export default function DividendOpstellen({ onTerug, openStuk = null }) {
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
  // Is er dividendbelasting verschuldigd? Zo ja, dan hoort de aangifte dividendbelasting bij dit stuk:
  // hij gaat mee als tweede PDF in de mail, komt in dezelfde SharePoint-map en moet ook ondertekend
  // worden. Zonder dat bestand laat het scherm je niet opslaan of versturen.
  const [dividendbelasting, setDividendbelasting] = useState(false);
  // Heeft het bestuur de uitkeringstest (art. 2:216 lid 2 BW) uitgevoerd? Een echte ja/nee, want de
  // Dynamics-kolom cr283_uitkeringstest is een ja/nee-kolom — dat mag geen tekstveld worden.
  const [uitkeringstest, setUitkeringstest] = useState(false);
  // { naam, dataUrl, grootte } zolang het stuk open staat; { naam, url } bij een heropend stuk (dan
  // heeft de browser de bytes niet meer, alleen de link — de server haalt hem dan uit SharePoint).
  const [aangifte, setAangifte] = useState(null);
  const [aangifteSleep, setAangifteSleep] = useState(false);
  const [aangifteFout, setAangifteFout] = useState("");
  const aangifteInputRef = useRef(null);

  // De veldencatalogus van de soort Dividenduitkering — alleen nog om te herkennen wélk invulveld toevallig
  // een Dynamics-kolom is (dan schrijven we die waarde ook naar het dividenddossier weg).
  const [catalogus, setCatalogus] = useState([]);

  // Het tussenstuk van dit ene stuk: begint bij de tekst van het gekozen model en is hier vrij aan
  // te passen. Kop en staart komen uit Beheer → Dividend en gelden voor álle dividendstukken.
  const [tussenstuk, setTussenstuk] = useState("");
  const [opbouw, setOpbouw] = useState({ kop: "", staart: "", standaard: null });
  // Vrije invulvelden (Beheer → Dividend → Invulvelden), net als bij de standaardbrieven: per model
  // staat vast wélke je krijgt; hier houden we bij wat je invult. Sleutel → waarde (bij "paragraaf"
  // is de waarde de gekozen alineatekst, zodat die zo in het stuk komt).
  const [velddefinities, setVelddefinities] = useState([]);
  const [invulwaarden, setInvulwaarden] = useState({});

  // Vastleggen: het dividenddossier waar dit stuk bij hoort. Leeg = nog niet opgeslagen; na de eerste
  // keer opslaan werkt "Opslaan" hetzelfde dossier bij in plaats van er een tweede naast te zetten.
  const [dossierId, setDossierId] = useState("");
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  // Is er op dít stuk al eens opgeslagen? Bepaalt alleen het opschrift van de knop — het dossier
  // bestaat namelijk al zodra je een cliënt kiest, dus daar kunnen we het niet aan aflezen.
  const [opgeslagenOoit, setOpgeslagenOoit] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [eerdere, setEerdere] = useState([]); // eerder opgestelde dividendstukken van deze cliënt
  // Versturen: mailen of ter ondertekening aanbieden. null = dicht; anders { variant, naar, cc, onderwerp, tekst }.
  const [verstuurModal, setVerstuurModal] = useState(null);
  const [verstuurBezig, setVerstuurBezig] = useState(false);
  const [mailCfg, setMailCfg] = useState(null); // instellingen.dividendMail (onderwerp/tekst per variant)

  const [melding, setMelding] = useState(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  // Dossiervelden + modellen van de soort Dividenduitkering, uit Beheer → Dividend. Zonder ingestelde
  // modellen blijft de lijst leeg.
  useEffect(() => {
    fetch("/api/dossier-velden?soort=dividend")
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
        // Modellen komen alléén uit Beheer → Dividend; er zijn geen ingebouwde standaardmodellen
        // (je maakt ze zelf, net als de standaardbrieven).
        setSjablonen(Array.isArray(d.sjablonen) ? d.sjablonen.filter((s) => s && veiligeStr(s.tekst)) : []);
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
      .then((d) => { if (levend.current) setMailCfg((d && d.dividendMail) || {}); })
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
    // Ook de dividendbelasting-keuze en de aangifte horen bij één stuk.
    setDividendbelasting(false); setAangifte(null); setAangifteFout(""); setUitkeringstest(false);
    setAandeelhouders([{ naam: contactNaam, percentage: "100" }]);
    setMelding(null);
    // Een andere cliënt = een ander stuk: de koppeling met het vorige dividenddossier loslaten. Het
    // effect hieronder maakt meteen een nieuwe rij aan en zet dossierId opnieuw.
    setDossierId(""); setPdfUrl(""); setOpgeslagenOoit(false);
  }, [klant]);

  // Eerder opgestelde dividendstukken van deze cliënt (om te heropenen en bij te werken). Best-effort.
  useEffect(() => {
    setEerdere([]);
    const acc = klant && klant.accountId;
    if (!acc) return;
    let bezig = true;
    fetch(`/api/medewerker-dividend-opslaan?accountId=${encodeURIComponent(acc)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (bezig && levend.current) setEerdere(Array.isArray(d.stukken) ? d.stukken : []); })
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
   * Zodra je een cliënt kiest, maken we het dividenddossier in Dynamics al aan — dan staat de rij
   * meteen in het Dividend-overzicht en heeft het stuk vanaf het begin een dossier om aan te hangen.
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
    fetch("/api/medewerker-dividend-opslaan", {
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
    const bezigMet = fetch("/api/medewerker-dividend-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "aanmaken", accountId: klant.accountId, datum: datumactie }),
    })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!bezig || !levend.current) return "";
        if (!ok || !d.dossierId) { setMelding({ type: "fout", tekst: `Het dividenddossier kon nog niet worden aangemaakt: ${d.error || "onbekende reden"}. Je kunt gewoon doorwerken; bij Opslaan wordt het alsnog aangemaakt.` }); return ""; }
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
    fetch("/api/medewerker-dividend-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "verwijderen", dossierId: id }),
    }).catch(() => { /* best-effort */ });
  }, []);

  // Vanuit het dividendlogboek geopend ("Bewerken"): de juiste cliënt kiezen en het stuk terughalen.
  const geopendRef = useRef(false);
  useEffect(() => {
    if (!openStuk || geopendRef.current) return;
    if (!Array.isArray(klanten) || !lijst.length) return; // wachten tot cliënten én modellen er zijn
    const k = klanten.find((x) => String(x.accountId) === String(openStuk.accountId));
    if (!k) return;
    geopendRef.current = true;
    openendRef.current = true; // de klantwissel hieronder mag geen nieuwe rij aanmaken
    setKlant(k);
    // Na het zetten van de cliënt worden de velden voorgevuld; daarna pas het stuk terugzetten.
    setTimeout(() => { if (levend.current) heropen(openStuk); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStuk, klanten, lijst]);

  /** Het gesleepte bestand inlezen als data-URL, zodat het met het stuk mee kan naar de server. */
  function leesAangifte(bestand) {
    setAangifteFout("");
    if (!bestand) return;
    // 15 MB is de grens die we ook bij de bijlage-dropzone in het dossier aanhouden.
    if (bestand.size > 15 * 1024 * 1024) { setAangifteFout("Dit bestand is groter dan 15 MB."); return; }
    const lezer = new FileReader();
    lezer.onload = () => setAangifte({ naam: bestand.name, dataUrl: String(lezer.result), grootte: bestand.size });
    lezer.onerror = () => setAangifteFout("Het bestand kon niet worden gelezen.");
    lezer.readAsDataURL(bestand);
  }

  /**
   * Mag dit stuk de deur uit? Staat dividendbelasting op Ja, dan hoort de aangifte erbij — anders
   * krijg je een melding in plaats van een halve verzending. Geeft true als het door mag.
   */
  function aangifteInOrde() {
    if (!dividendbelasting) return true;
    if (aangifte && (veiligeStr(aangifte.dataUrl) || veiligeStr(aangifte.url))) return true;
    setMelding({ type: "fout", tekst: "Je hebt aangegeven dat er dividendbelasting verschuldigd is. Sleep dan eerst de aangifte dividendbelasting in het vak hieronder — die gaat als tweede PDF mee naar de cliënt en in het dossier." });
    return false;
  }

  /**
   * Wat er van dit stuk naar het dividenddossier in Dynamics gaat. Dit scherm toont geen dossiervelden
   * meer (zoals een brief die ook niet toont): de voorzitter gaat mee als "Directeur", en verder elk
   * invulveld waarvan de sleutel toevallig een kolom van de soort Dividenduitkering is —
   * {{bedragdividenduitkering}} landt dus in cr283_bedragdividenduitkering. Al het andere hoort bij
   * het stuk zelf en staat in het dividendlogboek.
   */
  const dossierVeldenUitStuk = useMemo(() => {
    const uit = {};
    if (veiligeStr(voorzitter)) uit.directeur = veiligeStr(voorzitter);
    if (veiligeStr(emailVoorzitter)) uit.emailvoorzitter = veiligeStr(emailVoorzitter);
    if (veiligeStr(emailNotulist)) uit.emailnotulist = veiligeStr(emailNotulist);
    // Ja/nee-kolom cr283_dividendbelasting — altijd meesturen, ook bij Nee, zodat het dossier klopt.
    uit.dividendbelasting = !!dividendbelasting;
    uit.uitkeringstest = !!uitkeringstest;
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
  }, [voorzitter, emailVoorzitter, emailNotulist, invulwaarden, catalogus, velddefinities, dividendbelasting, uitkeringstest]);

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
    zet("datumdividend", langeDatum(datumactie));
    zet("datumnotulen", langeDatum(datumactie));
    // De naam van het gekozen model, zodat je hem in de vaste tekst of in het tussenstuk kunt
    // gebruiken — bijv. "Notulen inzake {{naammodel}}". Nog geen model gekozen?
    // Dan blijft hij leeg, net als elk ander merge-veld zonder waarde.
    zet("naammodel", sjabloon && sjabloon.naam);
    zet("naamnotulen", sjabloon && sjabloon.naam);
    zet("modelnaam", sjabloon && sjabloon.naam);
    zet("dividendbelasting", dividendbelasting ? "Ja" : "Nee");
    zet("uitkeringstest", uitkeringstest ? "Ja" : "Nee");
    zet("aandeelhouders", aandeelhoudersTekst(aandeelhouders));
    // De vrije invulvelden als laatste: die horen bij dít stuk en winnen dus van gelijknamige velden.
    // Een bedrag komt als "€ 100.000" in het stuk en een datum als "17 augustus 2026" — ongeacht hoe
    // het is ingetikt, zodat je dat niet per model hoeft te regelen.
    for (const [sleutel, waarde] of Object.entries(invulwaarden || {})) {
      const def = velddefinities.find((v) => v && String(v.sleutel) === sleutel);
      if (def && def.type === "bedrag") zet(sleutel, bedragTekst(waarde));
      else if (def && def.type === "datum") zet(sleutel, langeDatum(waarde));
      else zet(sleutel, waarde);
    }
    return m;
  }, [klant, vestigingsplaats, datumactie, voorzitter, emailVoorzitter, notulist, emailNotulist, aandeelhouders, invulwaarden, velddefinities, sjabloon, dividendbelasting, uitkeringstest]);

  // Het stuk = vaste kop (Beheer) + het tussenstuk van dit stuk + vaste staart (Beheer). Zo staan de
  // aandeelhouders en het ondertekenblok altijd in de centrale tekst en bewegen ze mee met wat je
  // hier invult; alleen het tussenstuk is per stuk anders.
  //
  const ruweTekst = !sjabloon
    ? ""
    : steltStukSamen({ kop: opbouw.kop, tussenstuk, staart: opbouw.staart });
  const ingevuld = vulSjabloonIn(ruweTekst, mergeWaarden);
  const blokken = useMemo(() => ontleedDocument(ingevuld), [ingevuld]);
  const eigenKop = heeftEigenKop(ruweTekst);
  const leeg = !veiligeStr(ruweTekst);

  const somAandeel = aandeelhouders.reduce((t, r) => {
    const n = Number(String(r.percentage || "").replace(",", "."));
    return t + (Number.isFinite(n) ? n : 0);
  }, 0);
  const aandeelIngevuld = aandeelhouders.some((r) => veiligeStr(r.percentage));

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

  const bestandsnaam = `${veiligeStr(sjabloon && sjabloon.naam) || "Dividenduitkering"}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const subkop = `Dividenduitkering${datumactie ? " · " + langeDatum(datumactie) : ""}`;

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
      `<style>${AFDRUK_CSS}</style></head><body>${kopHtml}${blokkenNaarHtml(blokken, esc)}</body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* afdruk best-effort */ } }, 300);
  }

  /**
   * Vastleggen: het stuk als PDF in de SharePoint-map van de cliënt, de gegevens in een
   * dividenddossier in Dynamics, en de invulgegevens (waaronder de aandeelhoudersnamen) zodat je het
   * later kunt heropenen. Tweede keer opslaan werkt hetzelfde dossier bij.
   */
  async function opslaan({ alsNieuw = false } = {}) {
    if (!klant || leeg) return;
    if (!aangifteInOrde()) return;
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
      const res = await fetch("/api/medewerker-dividend-opslaan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: klant.accountId,
          klantnaam: veiligeStr(klant.klantnaam),
          dossierId: doelDossierId || undefined,
          modelNaam: veiligeStr(sjabloon && sjabloon.naam),
          datum: datumactie,
          // Naar het dividenddossier in Dynamics gaat wat we kúnnen plaatsen: de voorzitter, plus elk
          // invulveld waarvan de sleutel toevallig een kolom van de soort Dividenduitkering is
          // → cr283_bedrag). De rest van de invulvelden hoort bij het stuk en blijft in het logboek.
          dossierVelden: dossierVeldenUitStuk,
          zichtbareSleutels: Object.keys(dossierVeldenUitStuk),
          // …en dit zijn de gegevens die het scherm zelf beheert; die worden bewaard zodat je het
          // stuk later kunt heropenen (vooral de aandeelhoudersnamen — die passen niet in Dynamics).
          velden: { vestigingsplaats, voorzitter, emailVoorzitter, notulist, emailNotulist },
          invulwaarden,
          aandeelhouders,
          // Dividendbelasting + de aangifte die erbij hoort. Zit het bestand nog in het scherm, dan
          // gaat het als data-URL mee; bij een heropend stuk is alleen de link bekend en haalt de
          // server het zelf uit SharePoint.
          dividendbelasting,
          uitkeringstest,
          aangifte: aangifte ? { naam: aangifte.naam, dataUrl: aangifte.dataUrl || "", url: aangifte.url || "" } : null,
          // De blokken zoals ze rechts in het voorbeeld staan — de PDF gebruikt exact dezelfde.
          blokken,
          tekst: ruweTekst,
          tussenstuk,
          bestandsnaamBasis: bestandsnaam,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Opslaan mislukt (${res.status}).`);
      if (!levend.current) return;
      const nieuw = alsNieuw || !doelDossierId || autoRef.current === doelDossierId;
      // Sloegen we bewust als NIEUW STUK op, dan hangt het scherm daarna aan die nieuwe rij; de
      // oude blijft ongewijzigd in het logboek staan.
      setDossierId(d.dossierId || "");
      setPdfUrl(d.pdfUrl || "");
      autoRef.current = ""; // opgeslagen: deze rij is geen wegwerp-rij meer
      aanmakenRef.current = null;
      setOpgeslagenOoit(true);
      setMelding(
        d.sharepoint && d.sharepoint.gedaan
          ? { type: "ok", tekst: `Het dividendstuk staat in het dossier${nieuw ? " (nieuw dividenddossier aangemaakt)" : ""} en in de SharePoint-map van ${veiligeStr(klant.klantnaam)}.` }
          : { type: "fout", tekst: `Het dividenddossier is ${nieuw ? "aangemaakt" : "bijgewerkt"}, maar het stuk kon niet in SharePoint worden gezet: ${(d.sharepoint && d.sharepoint.reden) || "onbekende reden"}` },
      );
      // Lijstje met eerdere stukken verversen, zodat het nieuwe stuk er meteen bij staat.
      fetch(`/api/medewerker-dividend-opslaan?accountId=${encodeURIComponent(klant.accountId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((x) => { if (levend.current) setEerdere(Array.isArray(x.stukken) ? x.stukken : []); })
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
    // ermee. Vroeger lieten we alleen de verwijzing los; dan bleef er een leeg dividenddossier staan.
    ruimAutoRijOp();
    aanmakenRef.current = null;
    setDossierId(r.dossierId || "");
    setPdfUrl(r.pdfUrl || "");
    setOpgeslagenOoit(true);
    const model = lijst.find((s) => veiligeStr(s.naam) === veiligeStr(r.modelNaam));
    if (model) setSjabloonId(model.id);
    // Het tussenstuk van dat stuk terug; staat het er niet in (oud record), dan de tekst van het model.
    setTussenstuk(veiligeStr(r.tussenstuk) || (model ? veiligeStr(model.tekst) : ""));
    setDatumactie(veiligeStr(r.datum) || vandaagISO());
    setVestigingsplaats(veiligeStr(v.vestigingsplaats));
    setVoorzitter(veiligeStr(v.voorzitter) || veiligeStr(v.directeur));
    setEmailVoorzitter(veiligeStr(v.emailVoorzitter));
    setNotulist(veiligeStr(v.notulist));
    setEmailNotulist(veiligeStr(v.emailNotulist));
    setDividendbelasting(r.dividendbelasting === true);
    setUitkeringstest(r.uitkeringstest === true);
    setAangifte(r.aangifte && veiligeStr(r.aangifte.url) ? { naam: veiligeStr(r.aangifte.naam) || "Aangifte dividendbelasting", url: veiligeStr(r.aangifte.url) } : null);
    setAangifteFout("");
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
    setMelding({ type: "ok", tekst: "Eerder opgesteld stuk teruggehaald — opslaan werkt hetzelfde dossier bij." });
  }

  /** Het verstuurvenster openen met de tekst uit Beheer, per variant. */
  function openVersturen(variant) {
    if (!aangifteInOrde()) return;
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
      onderwerp: vul(onderwerp) || `Dividenduitkering ${veiligeStr(klant.klantnaam)}`,
      tekst: vul(tekst) || "Bijgaand ontvangt u het dividendstuk.",
    });
  }

  async function verstuur() {
    const m = verstuurModal;
    if (!m || !klant) return;
    if (!veiligeStr(m.naar)) { setMelding({ type: "fout", tekst: "Vul het e-mailadres van de ontvanger in." }); return; }
    setVerstuurBezig(true);
    try {
      const res = await fetch("/api/medewerker-dividend-opslaan", {
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
          bestandsnaamBasis: bestandsnaam,
          // De aangifte gaat als tweede bijlage mee en krijgt bij "ter ondertekening" zijn eigen taak.
          dividendbelasting,
          uitkeringstest,
          aangifte: aangifte ? { naam: aangifte.naam, dataUrl: aangifte.dataUrl || "", url: aangifte.url || "" } : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Versturen mislukt (${res.status}).`);
      if (!levend.current) return;
      setVerstuurModal(null);
      if (d.pdfUrl) setPdfUrl(d.pdfUrl);
      const aantalTaken = (d.taak && d.taak.aantal) || 0;
      const staart = m.variant === "ondertekenen"
        ? (d.taak && d.taak.gedaan
            ? (aantalTaken > 1
                ? ` De cliënt heeft ${aantalTaken} taken gekregen — één per document, dus hij tekent ze allebei.`
                : " De cliënt heeft een taak gekregen om te ondertekenen.")
            : ` Let op: de taak kon niet worden aangemaakt${d.taak && d.taak.reden ? ` (${d.taak.reden})` : ""}.`)
        : (aangifte ? " De aangifte dividendbelasting is als tweede bijlage meegestuurd." : "");
      setMelding({ type: (m.variant === "ondertekenen" && !(d.taak && d.taak.gedaan)) ? "fout" : "ok", tekst: `Dividendstuk verstuurd naar ${veiligeStr(m.naar)}.${staart}` });
    } catch (e) {
      if (levend.current) setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) setVerstuurBezig(false);
    }
  }

  async function kopieerTekst() {
    try {
      await navigator.clipboard.writeText(ingevuld);
      setMelding({ type: "ok", tekst: "Het dividendstuk staat op het klembord — plakken in Word kan direct." });
    } catch {
      setMelding({ type: "fout", tekst: "Kopiëren naar het klembord lukte niet in deze browser." });
    }
  }

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  const knop = (kleur, aan = true) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${aan ? kleur : KLEUR.rand}`, background: aan ? kleur : "#F2F3F0", color: aan ? "#fff" : KLEUR.mutedTekst, fontSize: 12.5, fontWeight: 600, cursor: aan ? "pointer" : "not-allowed" });
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  if (sjablonen === null && klanten === null) {
    return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Dividendstuk laden…</div>;
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      {onTerug && (
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          <ArrowLeft size={15} /> Terug naar overzicht
        </button>
      )}
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Kies een cliënt en een model, vul de vergadering en de aandeelhouders in. Het voorbeeld rechts
        loopt live mee; kop en staart komen uit Beheer → Dividend, alleen het tussenstuk verschilt per model.
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
            <span style={label}>Model</span>
            {sjabloon ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{veiligeStr(sjabloon.naam)}</span>
                <button onClick={() => { setSjabloonId(""); setSjabloonZoek(""); setTussenstuk(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={sjabloonZoek} onChange={(e) => setSjabloonZoek(e.target.value)} placeholder="Zoek een model…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeSjablonen.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>{sjablonen === null ? "Modellen laden…" : "Geen modellen gevonden."}</div>
                  ) : gefilterdeSjablonen.map((s) => (
                    <button key={s.id} onClick={() => { setSjabloonId(s.id); setSjabloonZoek(""); setTussenstuk(veiligeStr(s.tekst)); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(s.naam)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {sjablonen !== null && sjablonen.length === 0 && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.goud }}>
                Er zijn nog geen modellen. Maak ze aan bij Beheer → Dividend — net als de standaardbrieven:
                een naam, de tekst van het model en de invulvelden die erbij horen.
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
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Datum dividend</div>
                <input type="date" value={datumactie} onChange={(e) => setDatumactie(e.target.value)} style={input} />
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

          {/* Dividendbelasting + de aangifte die erbij hoort. Staat de schakelaar op Ja, dan is het
              sleepvak verplicht: dat bestand gaat als tweede PDF mee naar de cliënt, komt in dezelfde
              SharePoint-map als het stuk, en krijgt bij "ter ondertekening" zijn eigen taak. */}
          {/* Uitkeringstest: echte ja/nee, dus een schakelaar en geen invulveld. Een invulveld met deze
              sleutel zou als tekst naar de ja/nee-kolom cr283_uitkeringstest gaan, en daar wordt élke
              niet-lege tekst "waar" — ook "Nee". */}
          <div>
            <span style={label}>Uitkeringstest</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {[[false, "Nee"], [true, "Ja"]].map(([waarde, tekst]) => (
                <button
                  key={tekst}
                  type="button"
                  onClick={() => setUitkeringstest(waarde)}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${uitkeringstest === waarde ? KLEUR.blauw : KLEUR.rand}`,
                    background: uitkeringstest === waarde ? KLEUR.blauw : "#fff",
                    color: uitkeringstest === waarde ? "#fff" : KLEUR.subtekst,
                  }}
                >
                  {tekst}
                </button>
              ))}
              <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>uitgevoerd door het bestuur (art. 2:216 lid 2 BW)</span>
            </div>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 5 }}>
              Komt in het stuk als <code>{"{{uitkeringstest}}"}</code> — “Ja” of “Nee” — en gaat als ja/nee naar het dossier.
            </div>
          </div>

          <div>
            <span style={label}>Dividendbelasting</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {[[false, "Nee"], [true, "Ja"]].map(([waarde, tekst]) => (
                <button
                  key={tekst}
                  type="button"
                  onClick={() => { setDividendbelasting(waarde); if (!waarde) setAangifteFout(""); }}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${dividendbelasting === waarde ? KLEUR.blauw : KLEUR.rand}`,
                    background: dividendbelasting === waarde ? KLEUR.blauw : "#fff",
                    color: dividendbelasting === waarde ? "#fff" : KLEUR.subtekst,
                  }}
                >
                  {tekst}
                </button>
              ))}
              <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>verschuldigd over deze uitkering</span>
            </div>

            {dividendbelasting && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Aangifte dividendbelasting</div>
                {aangifte ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: "#fff" }}>
                    <FileText size={15} color={KLEUR.blauw} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {veiligeStr(aangifte.url) ? (
                        <a href={aangifte.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.blauw, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aangifte.naam}</a>
                      ) : (
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aangifte.naam}</div>
                      )}
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>
                        {veiligeStr(aangifte.url) ? "staat al in het dossier" : "gaat mee bij opslaan en versturen"}
                        {aangifte.grootte ? ` · ${Math.max(1, Math.round(aangifte.grootte / 1024))} KB` : ""}
                      </div>
                    </div>
                    <button onClick={() => { setAangifte(null); setAangifteFout(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={13} /> Vervangen</button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setAangifteSleep(true); }}
                    onDragLeave={() => setAangifteSleep(false)}
                    onDrop={(e) => { e.preventDefault(); setAangifteSleep(false); leesAangifte(e.dataTransfer.files && e.dataTransfer.files[0]); }}
                    onClick={() => aangifteInputRef.current && aangifteInputRef.current.click()}
                    style={{
                      border: `1.5px dashed ${aangifteSleep ? KLEUR.blauw : KLEUR.rand}`, borderRadius: 10, padding: "18px 14px",
                      textAlign: "center", cursor: "pointer", background: aangifteSleep ? KLEUR.lichtblauw : "#FAFBF9",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>Sleep de aangifte hierheen, of klik om te kiezen</div>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>PDF · max. 15 MB · gaat als tweede bijlage mee</div>
                    <input ref={aangifteInputRef} type="file" accept="application/pdf,.pdf" onChange={(e) => { leesAangifte(e.target.files && e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
                  </div>
                )}
                {aangifteFout && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 6 }}>{aangifteFout}</div>}
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6 }}>
                  Zonder dit bestand kun je het stuk niet opslaan of versturen. Bij “ter ondertekening”
                  krijgt de cliënt twee taken — één per document — zodat hij ze allebei tekent.
                </div>
              </div>
            )}
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

          {/* Tussenstuk — het enige stuk tekst dat per dividendstuk verschilt */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ ...label, marginBottom: 0 }}>Tussenstuk — de tekst van dit stuk</span>
              {sjabloon && veiligeStr(sjabloon.tekst) && veiligeStr(tussenstuk) !== veiligeStr(sjabloon.tekst) && (
                <button onClick={() => setTussenstuk(veiligeStr(sjabloon.tekst))} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }} title="Terug naar de tekst van het model">
                  <RotateCcw size={13} /> Model herstellen
                </button>
              )}
            </div>
            <textarea
              value={tussenstuk}
              onChange={(e) => setTussenstuk(e.target.value)}
              disabled={!sjabloon}
              rows={8}
              placeholder={sjabloon ? "I. Dividenduitkering\n> Per {{datumdividend}} wordt er in totaal € {{bedragdividenduitkering}} dividend uitgekeerd…" : "Kies eerst een model."}
              style={{ ...input, resize: "vertical", minHeight: 150, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, background: sjabloon ? "#fff" : "#F7F8F6" }}
            />
            <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
              Alleen dit tussenstuk hoort bij dít stuk; kop en staart (aanwezigen, sluiting, ondertekening)
              staan één keer in Beheer → Dividend en gelden voor alle dividendstukken.
              Opmaak: <code>&gt;</code> inspringen, <code>-</code> opsomming, <code>###</code> kopje.
            </div>
            {sjabloon && !/\{\{\s*aandeelhouders\s*[|}]/i.test(ruweTekst) && (
              <div style={{ marginTop: 8 }}>
                <Banner type="fout" tekst="In de vaste kop staat geen {{aandeelhouders}}, dus de aandeelhouders die je hier invult komen niet in het stuk. Voeg de plaatshouder toe in Beheer → Dividend." />
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
                  Opslaan werkt het bestaande stuk bij: <strong>{veiligeStr(huidigeRegel.modelNaam) || "Dividenduitkering"}</strong>
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
                  title="Laat het stuk dat je nu bewerkt staan en legt dit vast als een nieuw dividendstuk, met een eigen regel in het logboek."
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
              Opslaan zet het stuk als PDF in de SharePoint-map van de cliënt (submap uit Beheer → Dividend) en
              legt de gegevens vast in een dividenddossier — datum, bedrag, de aandelen en de link naar
              het stuk. Daarna vind je het terug in het dividendlogboek.
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
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(r.modelNaam) || "Dividenduitkering"}</div>
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
                <div style={{ color: KLEUR.mutedTekst, fontStyle: "italic" }}>Kies links een model; het stuk verschijnt hier meteen.</div>
              ) : (
                blokken.map(renderBlok)
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst }}>
            Nog niet ingevulde gegevens staan als <strong>[INVULPLEK]</strong> in het stuk, net als in de Word-modellen.
          </div>
        </div>
      </div>

      {verstuurModal && (
        <div onClick={() => !verstuurBezig && setVerstuurModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {verstuurModal.variant === "ondertekenen" ? "Ter ondertekening aanbieden" : "Dividendstuk mailen"}
            </div>
            <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
              {verstuurModal.variant === "ondertekenen"
                ? "Het stuk gaat als PDF mee én de cliënt krijgt een taak om te ondertekenen. Onderwerp en tekst komen uit Beheer → Dividend; hier kun je ze per keer nog aanpassen."
                : "Het stuk gaat als PDF-bijlage mee. Onderwerp en tekst komen uit Beheer → Dividend; hier kun je ze per keer nog aanpassen."}
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

      <style>{`@keyframes dividendspin{to{transform:rotate(360deg)}} .spin{animation:dividendspin 1s linear infinite}`}</style>
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
      uit.push({ sleutel: `c-${c.id}`, naam: veiligeStr(c.naam), soort: "Contactpersoon", email: veiligeStr(c.email), sub: veiligeStr(c.email) });
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
