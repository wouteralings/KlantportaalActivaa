import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Printer, Copy, CheckCircle2, AlertTriangle, ArrowLeft, Plus, Trash2, Users, RotateCcw,
  Save, Loader2, FileText,
} from "lucide-react";
import { ontleedDocument, heeftEigenKop, blokkenNaarHtml, AFDRUK_CSS } from "../documentOpmaak";
import { NOTULEN_SJABLONEN, steltNotulenSamen, haalBesluitUitTekst } from "../../beheer/notulenSjablonen";
import { useMijnNaam } from "../MijnFilter";
import { VeldInvoer, maakZichtbaarheid } from "../dossierVeldInvoer";
import { normaliseerSleutel, vulSjabloonIn, bouwMergeWaarden } from "../dossierMerge";

/**
 * Notulen opstellen — medewerkersportaal → Klantoverzicht → Notulen → "Notulen opstellen".
 *
 * Zelfde opzet als het brievenscherm: links kies je de klant en het notulenmodel en vul je de
 * gegevens in, rechts loopt het voorbeeld live mee op een blanco A4. Ook de aandeelhouders vul je
 * hier in (naam + aandeel); ze verschijnen direct in het "Aanwezig"-blok van de notulen. Kop en
 * staart van de notulen liggen vast (zie src/beheer/notulenSjablonen.js) — alleen het besluit
 * ertussen verschilt per model.
 *
 * Namen (aandeelhouders, voorzitter, notulist) zoek je op in plaats van ze te typen — dat scheelt
 * typefouten en houdt de schrijfwijze gelijk aan Dynamics. Er wordt gezocht in de cliënten (holdings
 * en andere vennootschappen), de contactpersonen (/api/klant-contacten) en, voor de notulist, de
 * medewerkers. Zelf iets intypen mag altijd: een aandeelhouder die nog nergens staat, tik je gewoon in.
 *
 * De modellen komen uit Beheer → Dossiers → Voorbeelddocumenten (soort "notulen"); staat daar nog
 * niets, dan gebruikt dit scherm de vijf standaardmodellen uit de code, zodat je altijd kunt
 * beginnen. Wat je hier invult wordt niet in Dynamics weggeschreven — dit scherm maakt het stuk;
 * afdrukken/PDF gaat via het afdrukvenster van de browser.
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

/** De aandeelhoudersregels zoals ze in het "Aanwezig"-blok komen: naam + aandeel, één per regel. */
function aandeelhoudersTekst(rijen) {
  return (rijen || [])
    .map((r) => {
      const naam = veiligeStr(r.naam);
      const pct = percentageTekst(r.percentage);
      if (!naam && !pct) return "";
      if (!pct) return naam;
      return `${naam || "—"} — ${pct}%`;
    })
    .filter(Boolean)
    .join("\n");
}

/** De vijf standaardmodellen als terugval zolang Beheer → Dossiers nog geen sjablonen heeft. */
function standaardSjablonen() {
  return NOTULEN_SJABLONEN.map((s, i) => ({ id: `std${i}`, naam: s.naam, tekst: s.tekst, besluit: s.besluit, standaard: true }));
}

export default function NotulenOpstellen({ onTerug }) {
  const { mijnNaam } = useMijnNaam();

  const [sjablonen, setSjablonen] = useState(null); // null = laden
  const [sjabloonBron, setSjabloonBron] = useState(""); // "beheer" | "standaard"
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
  const [notulist, setNotulist] = useState("");
  const [aandeelhouders, setAandeelhouders] = useState([{ naam: "", percentage: "100" }]);

  // De dossiervelden van de soort Notulen (Beheer → Dossiers): catalogus, keuzelijst-opties en de
  // indeling (rubrieken, volgorde, verborgen velden, "alleen tonen als"-regels).
  const [catalogus, setCatalogus] = useState([]);
  const [picklistOpties, setPicklistOpties] = useState({});
  const [indeling, setIndeling] = useState({ secties: [], verborgen: [], voorwaarden: {}, alleenLezen: [] });
  const [veldenState, setVeldenState] = useState({}); // catalogussleutel → waarde
  const [allesTonen, setAllesTonen] = useState(false); // "alleen tonen als"-regels tijdelijk negeren

  // Het besluit (punt I) van dit ene stuk: begint bij het besluit van het gekozen model en is hier
  // vrij aan te passen. Kop en staart komen uit Beheer en gelden voor álle notulen.
  const [besluit, setBesluit] = useState("");
  const [opbouw, setOpbouw] = useState({ kop: "", staart: "", standaard: null });

  // Vastleggen: het notulendossier waar dit stuk bij hoort. Leeg = nog niet opgeslagen; na de eerste
  // keer opslaan werkt "Opslaan" hetzelfde dossier bij in plaats van er een tweede naast te zetten.
  const [dossierId, setDossierId] = useState("");
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  // Is er op dít stuk al eens opgeslagen? Bepaalt alleen het opschrift van de knop — het dossier
  // bestaat namelijk al zodra je een cliënt kiest, dus daar kunnen we het niet aan aflezen.
  const [opgeslagenOoit, setOpgeslagenOoit] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [eerdere, setEerdere] = useState([]); // eerder opgestelde notulen van deze cliënt

  const [melding, setMelding] = useState(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  // Dossiervelden + modellen van de soort Notulen, uit Beheer → Dossiers. Zonder ingestelde modellen
  // vallen we terug op de vijf standaardmodellen uit de code.
  useEffect(() => {
    fetch("/api/dossier-velden?soort=notulen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (!levend.current) return;
        const cat = Array.isArray(d.catalogus) ? d.catalogus : [];
        setCatalogus(cat);
        setPicklistOpties(d.picklistOpties || {});
        const ind = d.indeling || d.standaardIndeling || {};
        setIndeling({
          secties: Array.isArray(ind.secties) ? ind.secties : [],
          verborgen: Array.isArray(ind.verborgen) ? ind.verborgen : [],
          voorwaarden: ind.voorwaarden || {},
          alleenLezen: Array.isArray(ind.alleenLezen) ? ind.alleenLezen : [],
        });
        // Beginwaarden: ja/nee op "Nee", de rest leeg — zelfde uitgangspunt als een nieuw dossier.
        const start = {};
        for (const v of cat) {
          if (!v || !v.key || String(v.key).startsWith("__")) continue;
          start[v.key] = v.type === "boolean" ? false : null;
        }
        setVeldenState(start);
        setOpbouw({
          kop: veiligeStr(d.sjabloonOpbouw && d.sjabloonOpbouw.kop),
          staart: veiligeStr(d.sjabloonOpbouw && d.sjabloonOpbouw.staart),
          standaard: (d.sjabloonOpbouw && d.sjabloonOpbouw.standaard) || null,
        });
        const uitBeheer = Array.isArray(d.sjablonen) ? d.sjablonen.filter((s) => s && (veiligeStr(s.tekst) || veiligeStr(s.besluit))) : [];
        if (uitBeheer.length) { setSjablonen(uitBeheer); setSjabloonBron("beheer"); }
        else { setSjablonen(standaardSjablonen()); setSjabloonBron("standaard"); }
      })
      .catch(() => { if (levend.current) { setSjablonen(standaardSjablonen()); setSjabloonBron("standaard"); } });
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(d.klanten || []); })
      .catch(() => { if (levend.current) { setKlanten([]); setKlantFout("De klantenlijst kon niet worden geladen."); } });
    // Medewerkers: alleen voor het opzoeken van de notulist. Best-effort — lukt dit niet, dan blijft
    // die suggestielijst leeg en typ je de naam gewoon zelf.
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

  // Klantwissel: vestigingsplaats, voorzitter en de eerste aandeelhouder vast voorinvullen — alles
  // blijft aanpasbaar. De notulist wordt de ingelogde medewerker (die maakt het stuk immers op).
  useEffect(() => {
    if (!klant) return;
    const plaats = veiligeStr(klant.adres && klant.adres.plaats) || veiligeStr(klant.contact && klant.contact.adres && klant.contact.adres.plaats);
    const contactNaam = veiligeStr(klant.contact && klant.contact.naam);
    setVestigingsplaats(plaats);
    // Voorzitter: de contactpersoon van de cliënt, of de vaste naam uit Beheer.
    const st = opbouw.standaard || {};
    zetVeld("directeur", st.voorzitterBron === "vast" && veiligeStr(st.voorzitterVast) ? veiligeStr(st.voorzitterVast) : contactNaam);
    setAandeelhouders([{ naam: contactNaam, percentage: "100" }]);
    setMelding(null);
    // Een andere cliënt = een ander stuk: de koppeling met het vorige notulendossier loslaten. Het
    // effect hieronder maakt meteen een nieuwe rij aan en zet dossierId opnieuw.
    setDossierId(""); setPdfUrl(""); setOpgeslagenOoit(false);
  }, [klant]);

  // Eerder opgestelde notulen van deze cliënt (om te heropenen en bij te werken). Best-effort.
  useEffect(() => {
    setEerdere([]);
    const acc = klant && klant.accountId;
    if (!acc) return;
    let bezig = true;
    fetch(`/api/medewerker-notulen-opslaan?accountId=${encodeURIComponent(acc)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (bezig && levend.current) setEerdere(Array.isArray(d.notulen) ? d.notulen : []); })
      .catch(() => { if (bezig && levend.current) setEerdere([]); });
    return () => { bezig = false; };
  }, [klant]);

  // Notulist: standaard de medewerker die het stuk opstelt, of de vaste naam uit Beheer.
  useEffect(() => {
    const st = opbouw.standaard || {};
    const vast = st.notulistBron === "vast" ? veiligeStr(st.notulistVast) : "";
    if (vast) { setNotulist(vast); return; }
    if (mijnNaam && !notulist) setNotulist(mijnNaam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mijnNaam, opbouw.standaard]);

  /**
   * Zodra je een cliënt kiest, maken we het notulendossier in Dynamics al aan — dan staat de rij
   * meteen in het Notulen-overzicht en heeft het stuk vanaf het begin een dossier om aan te hangen.
   * "Opslaan" vult daarna diezelfde rij (en zet het stuk in SharePoint).
   *
   * Wissel je van cliënt of loop je weg zonder ooit op te slaan, dan ruimen we die nog lege rij weer
   * op (best-effort) — anders blijft er bij elke wissel een leeg dossier achter. autoRef houdt bij om
   * welke rij dat gaat; zodra je opslaat is het geen wegwerp-rij meer en wordt de ref losgelaten.
   */
  const autoRef = useRef("");
  useEffect(() => {
    const vorige = autoRef.current;
    if (vorige) {
      autoRef.current = "";
      fetch("/api/medewerker-notulen-opslaan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "verwijderen", dossierId: vorige }),
      }).catch(() => { /* opruimen is best-effort */ });
    }
    if (!klant || !klant.accountId) return;
    let bezig = true;
    fetch("/api/medewerker-notulen-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "aanmaken", accountId: klant.accountId, datum: datumactie }),
    })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!bezig || !levend.current) return;
        if (!ok || !d.dossierId) { setMelding({ type: "fout", tekst: `Het notulendossier kon nog niet worden aangemaakt: ${d.error || "onbekende reden"}. Je kunt gewoon doorwerken; bij Opslaan wordt het alsnog aangemaakt.` }); return; }
        setDossierId(d.dossierId);
        autoRef.current = d.dossierId;
      })
      .catch(() => { /* stil: bij Opslaan wordt het dossier alsnog aangemaakt */ });
    return () => { bezig = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klant]);

  // Weglopen uit het scherm met een nog lege, automatisch aangemaakte rij → opruimen.
  useEffect(() => () => {
    const id = autoRef.current;
    if (!id) return;
    autoRef.current = "";
    fetch("/api/medewerker-notulen-opslaan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "verwijderen", dossierId: id }),
    }).catch(() => { /* best-effort */ });
  }, []);

  /** Eén dossierveld zetten (catalogussleutel → waarde). */
  function zetVeld(key, waarde) { setVeldenState((h) => ({ ...h, [key]: waarde })); }

  // Welke velden dit scherm zélf afhandelt en dus niet nog een tweede keer als dossierveld toont:
  // de vergaderdatum (staat als "Datum vergadering" bij Vergadering) en de aandeel-percentages
  // (komen uit de aandeelhoudersrijen, mét naam). Lookup-velden slaan we over: die koppelen aan een
  // Dynamics-record en horen bij het dossier zelf, niet bij het opstellen van het stuk.
  const EIGEN_BEHEER = new Set(["datumactie", "aandeelhouders1", "aandeelhouders2", "aandeelhouders3", "aandeelhouders4", "aandeelhouders5"]);
  const toonbaar = (key) => {
    if (!key || String(key).startsWith("__") || EIGEN_BEHEER.has(key)) return false;
    const def = catalogus.find((v) => v.key === key);
    return !!def && def.type !== "lookup";
  };

  // Rubrieken/volgorde/verborgen/"alleen tonen als" precies zoals in Beheer → Dossiers ingesteld.
  // Met "alles tonen" aan laten we de "alleen tonen als"-regels even los — handig als je een veld mist
  // omdat het aan een ander veld hangt dat je (nog) niet hebt ingevuld.
  const zichtbareSecties = useMemo(() => {
    const { zichtbareSecties: filter } = maakZichtbaarheid({
      verborgen: indeling.verborgen,
      voorwaarden: allesTonen ? {} : indeling.voorwaarden,
      veldenState,
    });
    return filter(indeling.secties).map((s) => ({
      ...s,
      velden: s.velden.filter(toonbaar),
      subsecties: (s.subsecties || []).map((sub) => ({ ...sub, velden: sub.velden.filter(toonbaar) })).filter((sub) => sub.velden.length),
    })).filter((s) => s.velden.length || (s.subsecties || []).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indeling, veldenState, catalogus, allesTonen]);

  // Heeft het gekozen model eigen Dynamics-kolommen (Beheer → Voorbeelddocumenten → "Dynamics-
  // kolommen bij dit model")? Dan tonen we precies die velden, in die volgorde — één rubriek, geen
  // "alleen tonen als"-regels ertussen. Niets gekozen = de volledige indeling hieronder.
  const modelVelden = useMemo(() => {
    const keys = sjabloon && Array.isArray(sjabloon.velden) ? sjabloon.velden : [];
    return keys.filter(toonbaar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sjabloon, catalogus]);

  // Velden uit de catalogus die in Beheer in géén enkele rubriek staan — die zouden hier anders
  // onzichtbaar blijven. We tonen ze onderaan onder "Overige velden", zodat je nooit een veld mist
  // doordat het (nog) niet is ingedeeld.
  const overigeVelden = useMemo(() => {
    const inSecties = new Set();
    for (const s of indeling.secties || []) {
      for (const k of s.velden || []) inSecties.add(k);
      for (const sub of s.subsecties || []) for (const k of sub.velden || []) inSecties.add(k);
    }
    return catalogus
      .map((v) => v && v.key)
      .filter((k) => toonbaar(k) && !inSecties.has(k) && !(indeling.verborgen || []).includes(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indeling, catalogus]);

  // De sleutels die dit scherm daadwerkelijk toont. Gaat mee naar de server, zodat een veld dat je
  // hier hebt leeggemaakt óók in Dynamics leeg wordt — en een veld dat je nooit zag ongemoeid blijft.
  const zichtbareSleutels = useMemo(() => {
    if (modelVelden.length) return modelVelden;
    const uit = [];
    for (const s of zichtbareSecties) {
      uit.push(...s.velden);
      for (const sub of s.subsecties || []) uit.push(...sub.velden);
    }
    uit.push(...overigeVelden);
    return uit;
  }, [zichtbareSecties, overigeVelden, modelVelden]);

  // Hoeveel velden nu wegvallen door een "alleen tonen als"-regel (dus niet door "verborgen").
  const aantalVoorwaardelijkVerborgen = useMemo(() => {
    if (allesTonen) return 0;
    const { magTonen } = maakZichtbaarheid({ verborgen: indeling.verborgen, voorwaarden: indeling.voorwaarden, veldenState });
    let n = 0;
    for (const s of indeling.secties || []) {
      const keys = [...(s.velden || []), ...(s.subsecties || []).flatMap((sub) => sub.velden || [])];
      for (const k of keys) if (toonbaar(k) && !(indeling.verborgen || []).includes(k) && !magTonen(k)) n += 1;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indeling, veldenState, catalogus, allesTonen]);

  const mergeWaarden = useMemo(() => {
    // Eerst de dossiervelden (zelfde weergave als in het dossiervoorbeeld: keuzelijst-labels, ja/nee,
    // nette datums en getallen), daarna wat dit scherm zelf beheert.
    const m = bouwMergeWaarden({
      dossier: {
        klantnaam: klant ? veiligeStr(klant.klantnaam) : "",
        groepsnaam: klant ? veiligeStr(klant.groepsnaam) : "",
        accountant: klant ? (veiligeStr(klant.accountant) || veiligeStr(klant.accountantPersoon && klant.accountantPersoon.naam)) : "",
        assistent: klant ? veiligeStr(klant.assistent && klant.assistent.naam) : "",
        manager: klant ? (veiligeStr(klant.manager && klant.manager.naam) || veiligeStr(klant.relatiebeheerder)) : "",
      },
      periodeTekst: langeDatum(datumactie),
      catalogus, veldenState, picklistOpties, lookupNamen: {},
    });
    const zet = (k, v) => { m[normaliseerSleutel(k)] = v == null ? "" : String(v); };
    zet("vestigingsplaats", vestigingsplaats);
    zet("plaats", vestigingsplaats);
    zet("datumactie", langeDatum(datumactie));
    zet("datum", langeDatum(datumactie) || langeDatum(vandaagISO()));
    zet("notulist", notulist);
    zet("voorzitter", veiligeStr(veldenState.directeur)); // in de modellen heet de voorzitter "directeur"
    zet("aandeelhouders", aandeelhoudersTekst(aandeelhouders));
    return m;
  }, [klant, vestigingsplaats, datumactie, notulist, aandeelhouders, catalogus, veldenState, picklistOpties]);

  // Het stuk = vaste kop (Beheer) + het besluit van dit stuk + vaste staart (Beheer). Zo staan de
  // aandeelhouders en het ondertekenblok altijd in de centrale tekst en bewegen ze mee met wat je
  // hier invult; alleen het besluit is per stuk anders.
  //
  // Terugval voor een model dat nog als één lap tekst in Beheer staat (geen besluit-blok): dan tonen
  // we die tekst ongewijzigd — er verdwijnt nooit iets, en het scherm meldt het hieronder.
  const modelOngesplitst = !!sjabloon && !veiligeStr(sjabloon.besluit) && !!veiligeStr(sjabloon.tekst);
  const ruweTekst = !sjabloon
    ? ""
    : modelOngesplitst && !veiligeStr(besluit)
      ? sjabloon.tekst
      : steltNotulenSamen({ kop: opbouw.kop, besluit, staart: opbouw.staart });
  const ingevuld = vulSjabloonIn(ruweTekst, mergeWaarden);
  const blokken = useMemo(() => ontleedDocument(ingevuld), [ingevuld]);
  const eigenKop = heeftEigenKop(ruweTekst);
  const leeg = !veiligeStr(ruweTekst);

  const somAandeel = aandeelhouders.reduce((t, r) => {
    const n = Number(String(r.percentage || "").replace(",", "."));
    return t + (Number.isFinite(n) ? n : 0);
  }, 0);
  const aandeelIngevuld = aandeelhouders.some((r) => veiligeStr(r.percentage));

  /**
   * Eén dossierveld tekenen. Standaard met hetzelfde besturingselement als in het dossier zelf
   * (VeldInvoer — zo werkt een veld dat je in Beheer instelt hier precies hetzelfde), behalve de
   * voorzitter: die krijgt de naam-zoeker, zodat je 'm net als de aandeelhouders kunt opzoeken.
   */
  function renderDossierVeld(key) {
    const veldDef = catalogus.find((v) => v.key === key);
    if (!veldDef) return null;
    if (key === "directeur") {
      return (
        <div key={key} style={{ display: "flex", flexDirection: "column" }}>
          <div style={veldStijlen.label}>{veldDef.label}</div>
          <NaamZoeker
            waarde={veiligeStr(veldenState[key])}
            opWaarde={(v) => zetVeld(key, v)}
            placeholder="zoek of typ een naam…"
            bronnen={["contact", "klant"]}
            klanten={klanten}
            medewerkers={medewerkers}
            invoerStijl={veldStijlen.veld}
          />
        </div>
      );
    }
    return (
      <VeldInvoer
        key={key}
        veldDef={veldDef}
        waarde={veldenState[key]}
        onChange={(w) => zetVeld(key, w)}
        picklistOpties={picklistOpties}
        alleenLezen={(indeling.alleenLezen || []).includes(key)}
        stijlen={veldStijlen}
      />
    );
  }

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

  const bestandsnaam = `${veiligeStr(sjabloon && sjabloon.naam) || "Notulen"}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const subkop = `Notulen${datumactie ? " · " + langeDatum(datumactie) : ""}`;

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
   * notulendossier in Dynamics, en de invulgegevens (waaronder de aandeelhoudersnamen) zodat je het
   * later kunt heropenen. Tweede keer opslaan werkt hetzelfde dossier bij.
   */
  async function opslaan() {
    if (!klant || leeg) return;
    setOpslaanBezig(true); setMelding(null);
    try {
      const res = await fetch("/api/medewerker-notulen-opslaan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: klant.accountId,
          klantnaam: veiligeStr(klant.klantnaam),
          dossierId: dossierId || undefined,
          modelNaam: veiligeStr(sjabloon && sjabloon.naam),
          datum: datumactie,
          // De dossiervelden (catalogussleutel → waarde) gaan naar het notulendossier in Dynamics…
          dossierVelden: veldenState,
          // Alleen de velden die je hier ook echt zag mogen leeggemaakt worden in Dynamics.
          zichtbareSleutels,
          // …en dit zijn de gegevens die het scherm zelf beheert; die worden bewaard zodat je het
          // stuk later kunt heropenen (vooral de aandeelhoudersnamen — die passen niet in Dynamics).
          velden: { vestigingsplaats, notulist },
          aandeelhouders,
          // De blokken zoals ze rechts in het voorbeeld staan — de PDF gebruikt exact dezelfde.
          blokken,
          tekst: ruweTekst,
          besluit,
          bestandsnaamBasis: bestandsnaam,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Opslaan mislukt (${res.status}).`);
      if (!levend.current) return;
      const nieuw = !dossierId || autoRef.current === dossierId;
      setDossierId(d.dossierId || "");
      setPdfUrl(d.pdfUrl || "");
      autoRef.current = ""; // opgeslagen: deze rij is geen wegwerp-rij meer
      setOpgeslagenOoit(true);
      setMelding(
        d.sharepoint && d.sharepoint.gedaan
          ? { type: "ok", tekst: `De notulen staan in het dossier${nieuw ? " (nieuw notulendossier aangemaakt)" : ""} en in de SharePoint-map van ${veiligeStr(klant.klantnaam)}.` }
          : { type: "fout", tekst: `Het notulendossier is ${nieuw ? "aangemaakt" : "bijgewerkt"}, maar het stuk kon niet in SharePoint worden gezet: ${(d.sharepoint && d.sharepoint.reden) || "onbekende reden"}` },
      );
      // Lijstje met eerdere notulen verversen, zodat het nieuwe stuk er meteen bij staat.
      fetch(`/api/medewerker-notulen-opslaan?accountId=${encodeURIComponent(klant.accountId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((x) => { if (levend.current) setEerdere(Array.isArray(x.notulen) ? x.notulen : []); })
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
    setDossierId(r.dossierId || "");
    setPdfUrl(r.pdfUrl || "");
    autoRef.current = ""; // een bestaand stuk is nooit een wegwerp-rij
    setOpgeslagenOoit(true);
    const model = lijst.find((s) => veiligeStr(s.naam) === veiligeStr(r.modelNaam));
    if (model) setSjabloonId(model.id);
    // Het besluit van dat stuk terug; oudere records hadden alleen de volledige tekst — daar halen we
    // het besluit dan uit, zodat je 'm gewoon verder kunt bewerken.
    setBesluit(veiligeStr(r.besluit) || haalBesluitUitTekst(r.tekst || "") || (model ? veiligeStr(model.besluit) : ""));
    setDatumactie(veiligeStr(r.datum) || vandaagISO());
    setVestigingsplaats(veiligeStr(v.vestigingsplaats));
    setNotulist(veiligeStr(v.notulist));
    // De dossiervelden terugzetten. Oudere records (van vóór de dossiervelden in dit scherm) hadden
    // directeur/bedrag/percentage/toelichting los in "velden" staan — die nemen we netjes over.
    setVeldenState((h) => ({
      ...h,
      ...(r.dossierVelden && typeof r.dossierVelden === "object" ? r.dossierVelden : {}),
      ...(veiligeStr(v.directeur) ? { directeur: veiligeStr(v.directeur) } : {}),
      ...(veiligeStr(v.bedrag) ? { bedrag: Number(String(v.bedrag).replace(",", ".")) || null } : {}),
      ...(veiligeStr(v.percentage) ? { percentage: Number(String(v.percentage).replace(",", ".")) || null } : {}),
      ...(veiligeStr(v.toelichting) ? { toelichting: veiligeStr(v.toelichting) } : {}),
    }));
    setAandeelhouders(Array.isArray(r.aandeelhouders) && r.aandeelhouders.length ? r.aandeelhouders : [{ naam: "", percentage: "100" }]);
    setMelding({ type: "ok", tekst: "Eerder opgestelde notulen teruggehaald — opslaan werkt hetzelfde dossier bij." });
  }

  async function kopieerTekst() {
    try {
      await navigator.clipboard.writeText(ingevuld);
      setMelding({ type: "ok", tekst: "De notulen staan op het klembord — plakken in Word kan direct." });
    } catch {
      setMelding({ type: "fout", tekst: "Kopiëren naar het klembord lukte niet in deze browser." });
    }
  }

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  // Stijlen voor de dossiervelden — zelfde vorm als in het dossierdetail ({ label, veld }), zodat
  // VeldInvoer hier hetzelfde oogt als daar.
  const veldStijlen = { label: { fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }, veld: input };
  const knop = (kleur, aan = true) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${aan ? kleur : KLEUR.rand}`, background: aan ? kleur : "#F2F3F0", color: aan ? "#fff" : KLEUR.mutedTekst, fontSize: 12.5, fontWeight: 600, cursor: aan ? "pointer" : "not-allowed" });
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  if (sjablonen === null && klanten === null) {
    return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Notulen laden…</div>;
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      {onTerug && (
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          <ArrowLeft size={15} /> Terug naar overzicht
        </button>
      )}
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Kies een klant en een notulenmodel, vul de vergadering en de aandeelhouders in. Het voorbeeld
        rechts loopt live mee; kop en staart van de notulen liggen vast, alleen het besluit verschilt per model.
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

          {/* Notulenmodel */}
          <div>
            <span style={label}>Notulenmodel</span>
            {sjabloon ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{veiligeStr(sjabloon.naam)}</span>
                <button onClick={() => { setSjabloonId(""); setSjabloonZoek(""); setBesluit(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={sjabloonZoek} onChange={(e) => setSjabloonZoek(e.target.value)} placeholder="Zoek een notulenmodel…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeSjablonen.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>{sjablonen === null ? "Modellen laden…" : "Geen modellen gevonden."}</div>
                  ) : gefilterdeSjablonen.map((s) => (
                    <button key={s.id} onClick={() => { setSjabloonId(s.id); setSjabloonZoek(""); setBesluit(veiligeStr(s.besluit) || haalBesluitUitTekst(s.tekst)); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(s.naam)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {sjabloonBron === "standaard" && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                Dit zijn de vijf standaardmodellen uit de code. Wil je ze aanpassen, zet ze dan via
                Beheer → Dossiers → Notulen → Voorbeelddocumenten (knop “Standaard-notulen toevoegen”) in beheer.
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
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Datum vergadering</div>
                <input type="date" value={datumactie} onChange={(e) => setDatumactie(e.target.value)} style={input} />
              </div>
              <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Notulist</div>
                <NaamZoeker
                  waarde={notulist} opWaarde={setNotulist} placeholder="zoek of typ een naam…"
                  bronnen={["medewerker", "contact"]} klanten={klanten} medewerkers={medewerkers} invoerStijl={input}
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
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: aandeelIngevuld && Math.abs(somAandeel - 100) > 0.01 ? KLEUR.goud : KLEUR.mutedTekst }}>
              {aandeelIngevuld
                ? `Totaal ${percentageTekst(somAandeel)}%${Math.abs(somAandeel - 100) > 0.01 ? " — dat is geen 100%." : ""}`
                : "Typ twee letters om te zoeken in de cliënten en contactpersonen; ze verschijnen direct in het “Aanwezig”-blok rechts."}
            </div>
          </div>

          {/* Dossiervelden — precies de velden, rubrieken, volgorde en "alleen tonen als"-regels die
              in Beheer → Dossiers → Notulen zijn ingesteld. Wat je hier invult komt zowel in het stuk
              ({{sleutel}}) als, bij opslaan, in het notulendossier terecht. */}
          {/* Model met eigen kolomkeuze: precies die velden, in de volgorde uit Beheer. */}
          {modelVelden.length > 0 ? (
            <div>
              <span style={label}>Gegevens voor dit model</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                {modelVelden.map(renderDossierVeld)}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                Deze kolommen horen bij “{veiligeStr(sjabloon && sjabloon.naam)}” — in te stellen bij
                Beheer → Dossiers → Notulen → Voorbeelddocumenten.
              </div>
            </div>
          ) : zichtbareSecties.map((sectie) => (
            <div key={sectie.sleutel || sectie.titel}>
              <span style={label}>{sectie.titel || "Gegevens"}</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                {sectie.velden.map(renderDossierVeld)}
              </div>
              {(sectie.subsecties || []).map((sub) => (
                <div key={sub.sleutel || sub.titel} style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>{sub.titel}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                    {sub.velden.map(renderDossierVeld)}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Velden die in Beheer nog in geen enkele rubriek staan — anders zou je ze hier missen. */}
          {modelVelden.length === 0 && overigeVelden.length > 0 && (
            <div>
              <span style={label}>Overige velden</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                {overigeVelden.map(renderDossierVeld)}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                Deze velden staan in Beheer → Dossiers → Notulen nog niet in een rubriek. Zet je ze daar in
                een rubriek, dan verschijnen ze hierboven op de plek die je kiest.
              </div>
            </div>
          )}

          {/* Velden die wegvallen door een "alleen tonen als"-regel: laten weten dát ze er zijn. */}
          {modelVelden.length === 0 && (aantalVoorwaardelijkVerborgen > 0 || allesTonen) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: KLEUR.mutedTekst, border: `1px dashed ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px" }}>
              <span>
                {allesTonen
                  ? "Alle velden staan nu aan, ook die normaal pas verschijnen als een ander veld is ingevuld."
                  : `${aantalVoorwaardelijkVerborgen} ${aantalVoorwaardelijkVerborgen === 1 ? "veld verschijnt" : "velden verschijnen"} pas als een ander veld is ingevuld (zo staat het in Beheer ingesteld).`}
              </span>
              <button onClick={() => setAllesTonen((a) => !a)} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }}>
                {allesTonen ? "Volg de instellingen" : "Toon ze toch"}
              </button>
            </div>
          )}

          {/* Besluit — het enige stuk tekst dat per notulen verschilt */}
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
              placeholder={sjabloon ? "I. Dividenduitkering\n> Per {{datumactie}} wordt er in totaal € {{bedrag}} dividend uitgekeerd…" : "Kies eerst een notulenmodel."}
              style={{ ...input, resize: "vertical", minHeight: 150, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, background: sjabloon ? "#fff" : "#F7F8F6" }}
            />
            <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
              Alleen dit besluit hoort bij dít stuk; kop en staart (aanwezigen, sluiting, ondertekening)
              staan één keer in Beheer → Dossiers → Notulen → Voorbeelddocumenten en gelden voor alle notulen.
              Opmaak: <code>&gt;</code> inspringen, <code>-</code> opsomming, <code>###</code> kopje.
            </div>
            {modelOngesplitst && !veiligeStr(besluit) && (
              <div style={{ marginTop: 8 }}>
                <Banner type="fout" tekst="Dit model staat in Beheer nog als één lap tekst. Het stuk hiernaast is die tekst, ongewijzigd — knip het besluit in Beheer los, dan gebruiken kop en staart de centrale tekst en bewegen aandeelhouders en ondertekening mee." />
              </div>
            )}
            {!modelOngesplitst && sjabloon && !/\{\{\s*aandeelhouders\s*[|}]/i.test(ruweTekst) && (
              <div style={{ marginTop: 8 }}>
                <Banner type="fout" tekst="In de vaste kop staat geen {{aandeelhouders}}, dus de aandeelhouders die je hier invult komen niet in het stuk. Voeg de plaatshouder toe in Beheer → Dossiers → Notulen → Voorbeelddocumenten." />
              </div>
            )}
          </div>

          {/* Acties */}
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={knop(KLEUR.groen, !!klant && !leeg && !opslaanBezig)} disabled={!klant || leeg || opslaanBezig} onClick={opslaan}>
                {opslaanBezig ? <Loader2 size={15} className="spin" /> : <Save size={15} />} {opslaanBezig ? "Opslaan…" : (opgeslagenOoit ? "Opnieuw opslaan" : "Opslaan in dossier")}
              </button>
              <button style={knop(KLEUR.blauw, !leeg)} disabled={leeg} onClick={afdrukken}><Printer size={15} /> Afdrukken / PDF</button>
              <button style={{ ...knopLicht, opacity: leeg ? 0.5 : 1, cursor: leeg ? "not-allowed" : "pointer" }} disabled={leeg} onClick={kopieerTekst}><Copy size={15} /> Tekst kopiëren</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst }}>
              Opslaan zet het stuk als PDF in de SharePoint-map van de cliënt (submap “Notulen”) en legt
              de gegevens vast in een notulendossier — datum, bedrag, percentage, de aandelen en de link
              naar het stuk. Daarna vind je het terug in het Notulen-overzicht.
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

          {/* Eerder opgestelde notulen van deze cliënt — terug te halen en bij te werken */}
          {klant && eerdere.length > 0 && (
            <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
              <span style={label}>Eerder opgesteld — {veiligeStr(klant.klantnaam)} ({eerdere.length})</span>
              <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
                {eerdere.map((r) => (
                  <div key={r.dossierId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${KLEUR.rand}`, background: r.dossierId === dossierId ? KLEUR.lichtblauw : "#fff" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(r.modelNaam) || "Notulen"}</div>
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
                <div style={{ color: KLEUR.mutedTekst, fontStyle: "italic" }}>Kies links een notulenmodel; het stuk verschijnt hier meteen.</div>
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

      <style>{`@keyframes notulenspin{to{transform:rotate(360deg)}} .spin{animation:notulenspin 1s linear infinite}`}</style>
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
function NaamZoeker({ waarde, opWaarde, placeholder, bronnen, klanten, medewerkers, invoerStijl }) {
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
          sub: [veiligeStr(k.klantnummer) && `nr ${veiligeStr(k.klantnummer)}`, veiligeStr(k.groepsnaam)].filter(Boolean).join("  ·  "),
        });
        if (uit.length >= 8) break;
      }
    }
    if (bronnen.includes("medewerker")) {
      for (const m of medewerkers || []) {
        if (!veiligeStr(m.naam).toLowerCase().includes(t)) continue;
        uit.push({ sleutel: `m-${m.id}`, naam: veiligeStr(m.naam), soort: "Medewerker", sub: veiligeStr(m.functie) });
        if (uit.length >= 16) break;
      }
    }
    for (const c of contacten) {
      uit.push({ sleutel: `c-${c.id}`, naam: veiligeStr(c.naam), soort: "Contactpersoon", sub: veiligeStr(c.email) });
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
              onClick={() => { opWaarde(s.naam); setOpen(false); }}
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
        <div key={i} style={{ marginTop: 34 }}>
          <div style={{ color: KLEUR.mutedTekst, fontSize: 11, marginBottom: 18 }}>[Handtekening]</div>
          <div style={{ letterSpacing: 0.5 }}>…………………………………………….</div>
          {b.naam ? <div style={{ marginTop: 2 }}>{b.naam}</div> : null}
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

function Banner({ type, tekst }) {
  const ok = type === "ok";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: ok ? "#EAF6EE" : "#FBECEC", color: ok ? KLEUR.groen : KLEUR.rood, border: `1px solid ${ok ? "#BFE3CB" : "#F0C9C9"}` }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} <span>{tekst}</span>
    </div>
  );
}
