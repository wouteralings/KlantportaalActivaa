import React, { useState, useMemo, useEffect } from "react";
import {
  Building2,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  FileText,
  Settings as SettingsIcon,
  Users,
  ClipboardList,
  Printer,
  Shield,
  Loader2,
  LogOut,
  Plus,
  Minus,
  Euro,
  RotateCcw,
  Layers,
  Trash2,
  PlusCircle,
  PenLine,
  BookOpen,
  ImageUp,
  Milestone,
  List,
  FolderOpen,
  Save,
  Link2,
  ScrollText,
  Eye,
  EyeOff,
  Download,
  Mail,
  ExternalLink,
  Zap,
  FileSignature,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mockdata — staat straks voor echte Dynamics 365-data (accounts, contacten,
// producten uit de Product Catalog / Price List).
// ---------------------------------------------------------------------------

const MOCK_USER = {
  naam: "Jasper de Vries",
  email: "jasper.devries@onzefirma.nl",
  rol: "Account Manager",
  initialen: "JV",
};

const MOCK_KLANTEN = [
  {
    id: "acc-1041",
    naam: "Van Rijn Bouwgroep B.V.",
    plaats: "Utrecht",
    contact: "M. van Rijn",
    email: "m.vanrijn@vanrijnbouw.nl",
    segment: "Bouw & Infra",
  },
  {
    id: "acc-2093",
    naam: "Noordzee Logistiek",
    plaats: "Rotterdam",
    contact: "S. Kramer",
    email: "s.kramer@noordzeelog.nl",
    segment: "Transport",
  },
  {
    id: "acc-3187",
    naam: "Heldergroen Zorginstellingen",
    plaats: "Amersfoort",
    contact: "F. Bakker",
    email: "f.bakker@heldergroen.nl",
    segment: "Zorg",
  },
  {
    id: "acc-4402",
    naam: "Studio Molenwerf",
    plaats: "Haarlem",
    contact: "T. de Boer",
    email: "t.deboer@molenwerf.studio",
    segment: "Creatief",
  },
  {
    id: "acc-5510",
    naam: "Kastermans Financieel Advies",
    plaats: "Eindhoven",
    contact: "R. Kastermans",
    email: "r.kastermans@kastermans.nl",
    segment: "Financieel",
  },
];

// Laatste terugval voor de naam van een categorie bij (oude) documenten die zijn opgeslagen
// vóórdat categorieën vrij beheerbaar werden — zie CATEGORIEEN_STANDAARD en "Categorieën
// beheren" (Dienstencatalogus beheren) hieronder. Blijft bestaan zodat Teken.jsx en de
// PDF-generatie (api/_gedeeld/onboarding.js) altijd een leesbare naam kunnen tonen, ook voor
// documenten zonder data.categorieVolgorde.
export const CATEGORIE_LABELS = {
  eenmalig: "Eenmalige werkzaamheden",
  doorlopend: "Doorlopende dienstverlening",
};

// Seed-/standaardcategorieën: het startpunt voor de vrij te beheren categorieënlijst
// (zie de "categorieen"-state hieronder). Bestaande diensten hebben nu eenmaal
// categorie "eenmalig" of "doorlopend", dus dit zorgt dat niets breekt bij de eerste
// keer laden — bewerk/hernoem/vul aan via "Categorieën beheren" onder Dienstencatalogus.
const CATEGORIEEN_STANDAARD = [
  { id: "eenmalig", naam: "Eenmalige werkzaamheden" },
  { id: "doorlopend", naam: "Doorlopende dienstverlening" },
];

// Status van een offerte: wordt automatisch op "verzonden" gezet bij de eerste opslag
// (= het moment van afdrukken/PDF), en is daarna handmatig te wijzigen in het overzicht.
const OFFERTE_STATUS_STANDAARD = "verzonden";
// Opdrachtbevestiging start bewust anders dan offerte: "in bewerking" totdat de mail
// daadwerkelijk is verstuurd (zie verstuurMailConceptOpdrachtbevestiging), niet al bij
// het opslaan/afdrukken. Daarna is de status net als bij offerte handmatig te wijzigen.
const OPDRACHTBEVESTIGING_STATUS_STANDAARD = "in_bewerking";
// Standaard kolom-koppeling voor het wegschrijven van tarieven naar Dataverse (zie
// tariefKolomMapping hieronder in de component) — dit zijn de kolomnamen die
// api/dataverse-schema-setup zelf aanmaakt in de cr283_tarief-tabel.
const TARIEF_KOLOM_MAPPING_STANDAARD = { bedragKolom: "cr283_prijs", omschrijvingKolom: "cr283_dienstomschrijving" };
export const OFFERTE_STATUSSEN = [
  { key: "in_bewerking", label: "In bewerking", kleur: "#5B6259", achtergrond: "#EEF0EC" },
  { key: "verzonden", label: "Verzonden", kleur: "#1C5D8C", achtergrond: "#EAF2F8" },
  { key: "besproken", label: "Besproken", kleur: "#8A6A1E", achtergrond: "#FBF3DE" },
  { key: "geaccepteerd", label: "Geaccepteerd", kleur: "#2E7D4F", achtergrond: "#E7F4EC" },
  { key: "niet_geaccepteerd", label: "Niet geaccepteerd", kleur: "#B14A2E", achtergrond: "#FBF2EC" },
];
export function offerteStatusInfo(key) {
  return OFFERTE_STATUSSEN.find((s) => s.key === key) || OFFERTE_STATUSSEN[0];
}

// Bekende waarden van het Dynamics-optionset "cr283_soortactiecategorie", gebruikt bij het
// aanmaken van een taak na ondertekening (zie Instellingen — taak bij ondertekening, voor
// zowel offerte als opdrachtbevestiging). Dit is niet per se een uitputtende lijst — het zijn
// de codes die tot nu toe in de koppeling zijn tegengekomen; "Andere code…" laat een vrij
// numeriek veld zien voor codes die hier nog niet in staan.
export const TAAK_CATEGORIE_OPTIES = [
  { code: 8009, label: "Backoffice" },
  { code: 8004, label: "Controleren" },
  { code: 8006, label: "In afwachting reactie cliënt" },
  { code: 8017, label: "SignNow" },
];

// Standaardwaarden voor de taak-instellingen (Instellingen > taak bij ondertekening) —
// module-scope (niet per render opnieuw aangemaakt) zodat de load-useEffects hieronder
// hier veilig naar kunnen verwijzen zonder een exhaustive-deps-waarschuwing.
const TAAK_INSTELLINGEN_OFFERTE_DEFAULT = { actief: true, onderwerp: "Onboarding klant", categorie: 8009 };
const TAAK_INSTELLINGEN_OPDRACHTBEVESTIGING_DEFAULT = { actief: false, onderwerp: "Opdrachtbevestiging ondertekend", categorie: 8009 };
// Taak bij een automatisch aangemaakt concept ná een verstreken tarieven-einddatum (zie
// tariefEinddatum hieronder) — staat, anders dan de opdrachtbevestiging-taak hierboven,
// standaard AAN: zonder een signaal zou zo'n concept makkelijk onopgemerkt blijven.
const TAAK_INSTELLINGEN_VERLOPEN_CONCEPT_DEFAULT = { actief: true, onderwerp: "Concept-opdrachtbevestiging klaar ter controle", categorie: 8009 };

// Standaard opdrachttypes (NV COS) — zelf te beheren/uit te breiden via "Opdrachtbevestiging-
// teksten beheren", dit is alleen de startset. De daadwerkelijke verplichte/optionele
// paragraafteksten worden bewust NIET hier voorgevuld (geen verzonnen NV COS-juridische tekst)
// — zie INITIAL_OPDRACHTBEVESTIGING_TEKSTEN: alleen de paragraaftitels staan al klaar, de tekst
// zelf vult de gebruiker zelf in via het beheerscherm.
const INITIAL_OPDRACHTTYPES = [
  { id: "type-samenstelling", naam: "Samenstellingsopdracht — NV COS 4410" },
  { id: "type-beoordeling", naam: "Beoordelingsopdracht — NV COS 2400" },
  { id: "type-overig", naam: "Overige / adviesopdracht" },
];

const INITIAL_OPDRACHTBEVESTIGING_TEKSTEN = {
  "type-samenstelling": {
    verplicht: [
      { id: "par-samenstelling-1", titel: "Aard en beperkingen van de opdracht", tekst: "" },
      { id: "par-samenstelling-2", titel: "Verantwoordelijkheden van het bestuur", tekst: "" },
      { id: "par-samenstelling-3", titel: "Verantwoordelijkheden van de accountant", tekst: "" },
    ],
    optioneel: [],
  },
  "type-beoordeling": {
    verplicht: [
      { id: "par-beoordeling-1", titel: "Aard en beperkingen van de opdracht", tekst: "" },
      { id: "par-beoordeling-2", titel: "Verantwoordelijkheden van het bestuur", tekst: "" },
      { id: "par-beoordeling-3", titel: "Verantwoordelijkheden van de accountant", tekst: "" },
    ],
    optioneel: [],
  },
  "type-overig": { verplicht: [], optioneel: [] },
};

// Genereert een cryptografisch willekeurige ID (UUID v4). Belangrijk: het ID van een offerte
// is tevens de enige "toegangssleutel" voor de publieke, niet-ingelogde tekenlink
// (/tekenen/{id}) — die moet dus onraadbaar zijn, niet alleen uniek. Eerder gebruikte deze
// functie Date.now() + een teller, wat voorspelbaar (en dus te raden) was.
function willekeurigeUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback voor het zeldzame geval dat crypto.randomUUID() niet beschikbaar is (vereist een
  // "secure context"/HTTPS — op de live site altijd het geval). Blijft cryptografisch veilig
  // via crypto.getRandomValues(); alleen als zelfs dat ontbreekt, valt het terug op Math.random().
  const bytes =
    typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
      ? crypto.getRandomValues(new Uint8Array(16))
      : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function nieuwId(prefix) {
  return `${prefix}-${willekeurigeUuid()}`;
}

// Haalt alleen de voornaam uit een volledige naam ("Jan de Vries" -> "Jan"), voor een
// wat persoonlijkere aanhef in de mail dan de volledige voor- en achternaam. Bevat de
// waarde geen spaties (bijv. al een voornaam, of een bedrijfsnaam), dan komt die
// ongewijzigd terug.
function voornaam(volledigeNaam) {
  const naam = (volledigeNaam || "").trim();
  if (!naam) return "";
  return naam.split(/\s+/)[0];
}

const STANDAARD_ROADMAP = {
  titel: "90 dagen roadmap: Kennismaking → Inrichting → Borging",
  fases: [
    {
      id: "fase-1",
      markering: "W1",
      label: "WEEK 1 · KENNISMAKING",
      titel: "We leren uw organisatie en administratie kennen",
      puntenTekst:
        "Kick-off gesprek: scope, aanspreekpunten, planning\nInventarisatie van bestaande systemen en administratie\nEerste proces volledig in kaart gebracht",
      resultaatLabel: "RESULTAAT",
      resultaatTekst: "Plan van aanpak staat + nulmeting ligt vast",
    },
    {
      id: "fase-2",
      markering: "W2",
      label: "WEEK 2 · INVENTARISATIE",
      titel: "Weten wat er nodig is om goed van start te gaan",
      puntenTekst:
        "Overzicht van de huidige situatie, inclusief aandachtspunten\nPer onderdeel: wat kan direct, wat vraagt meer tijd\nPrioriteiten bepalen op basis van impact",
      resultaatLabel: "RESULTAAT",
      resultaatTekst: "Inrichtingsplan met heldere prioriteiten",
    },
    {
      id: "fase-3",
      markering: "30",
      label: "DAG 30 · EERSTE RESULTAAT",
      titel: "Eerste onderdeel staat en draait",
      puntenTekst:
        "Ingericht op basis van het plan van aanpak\nU ziet het resultaat en denkt mee waar nodig\nOplevering met korte toelichting",
      resultaatLabel: "DOEL DAG 30",
      resultaatTekst: "Eerste onderdeel bewezen en werkend",
    },
    {
      id: "fase-4",
      markering: "60",
      label: "DAG 60 · OPSCHALEN",
      titel: "Van eerste onderdeel naar volledige administratie",
      puntenTekst:
        "Resterende onderdelen gefaseerd ingericht\nWerkwijze verder afgestemd op uw organisatie\nEerste voortgangsrapportage",
      resultaatLabel: "DOEL DAG 60",
      resultaatTekst: "Volledig operationeel + eerste rapportage",
    },
    {
      id: "fase-5",
      markering: "90",
      label: "DAG 90 · BORGING",
      titel: "Vast ritme en meetbaar resultaat",
      puntenTekst:
        "Resultaat gemeten ten opzichte van de nulmeting\nVaste rapportagemomenten afgesproken\nVervolgpunten en aandachtsgebieden besproken",
      resultaatLabel: "DOEL DAG 90",
      resultaatTekst: "Vast ritme en heldere afspraken voor de lange termijn",
    },
  ],
};

const INITIAL_CATALOGUS = [
  {
    id: "svc-impl",
    categorie: "eenmalig",
    naam: "Implementatie & inrichting",
    eenheid: "traject",
    varianten: [
      { id: "v1", naam: "Klein", prijs: 750 },
      { id: "v2", naam: "Middel", prijs: 1250 },
      { id: "v3", naam: "Groot", prijs: 2000 },
    ],
  },
  {
    id: "svc-migratie",
    categorie: "eenmalig",
    naam: "Data-migratie",
    eenheid: "traject",
    varianten: [
      { id: "v1", naam: "Klein", prijs: 900 },
      { id: "v2", naam: "Middel", prijs: 1500 },
      { id: "v3", naam: "Groot", prijs: 2200 },
    ],
  },
  {
    id: "svc-training",
    categorie: "eenmalig",
    naam: "Training en uitleg systemen",
    eenheid: "dagdeel",
    varianten: [{ id: "v1", naam: "", prijs: 500 }],
  },
  {
    id: "svc-onderhoud",
    categorie: "doorlopend",
    naam: "Onderhoud & support administratie",
    eenheid: "maand",
    varianten: [
      { id: "v1", naam: "0-50 facturen", prijs: 125 },
      { id: "v2", naam: "51-100 facturen", prijs: 175 },
      { id: "v3", naam: "101-200 facturen", prijs: 250 },
      { id: "v4", naam: "201-300 facturen", prijs: 300 },
      { id: "v5", naam: "301-400 facturen", prijs: 400 },
      { id: "v6", naam: "401-500 facturen", prijs: 450 },
      { id: "v7", naam: "500+ facturen", prijs: null },
    ],
  },
  {
    id: "svc-jaarrekening",
    categorie: "doorlopend",
    naam: "Samenstellen jaarrekening, publicatiestukken en notulen",
    eenheid: "jaar",
    varianten: [
      { id: "v1", naam: "Klein", prijs: 999 },
      { id: "v2", naam: "Middel", prijs: 1499 },
      { id: "v3", naam: "Groot", prijs: 2249 },
    ],
  },
  {
    id: "svc-vpb",
    categorie: "doorlopend",
    naam: "Aangifte vennootschapsbelasting",
    eenheid: "aangifte",
    varianten: [{ id: "v1", naam: "", prijs: 399 }],
  },
  {
    id: "svc-ib",
    categorie: "doorlopend",
    naam: "Aangifte inkomstenbelasting",
    eenheid: "aangifte",
    varianten: [{ id: "v1", naam: "", prijs: 399 }],
  },
];

const STAPPEN = [
  { key: "login", label: "Aanmelden", icon: Shield },
  { key: "klant", label: "Klant", icon: Users },
  { key: "diensten", label: "Diensten kiezen", icon: ClipboardList },
  { key: "prijzen", label: "Prijzen", icon: Euro },
  { key: "bijlage", label: "Bijlage", icon: PenLine },
  { key: "offerte", label: "Offerte", icon: FileText },
  // Opdrachtbevestiging staat bewust als los, altijd aanklikbaar tabblad naast Offerte (niet
  // erna in de volgorde) — beide gebruiken dezelfde Klant/Diensten/Prijzen-selectie hierboven,
  // je kunt dus uit één selectie zowel een offerte als een opdrachtbevestiging maken, of alleen
  // een opdrachtbevestiging zonder ooit een offerte te maken.
  { key: "opdrachtbevestiging", label: "Opdrachtbevestiging", icon: FileSignature },
];

export function currency(n) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

// Toont "10 stroken × 12" wanneer er een factor > 1 is ingesteld (zie zetFactor/regelsVoorKlant),
// anders gewoon "1 traject" zoals voorheen — zo blijft de weergave ongewijzigd voor diensten die
// geen gebruik maken van de aantallen/factor-functie.
export function formatteerAantal(aantal, eenheid, factor) {
  const basis = `${aantal} ${eenheid || ""}`.trim();
  return factor && factor !== 1 ? `${basis} × ${factor}` : basis;
}

// Groepeert een lijst items (diensten of regels — alles met een .categorie-veld) op categorie,
// in de opgegeven volgorde (categorieVolgorde: [{id, naam}, ...]) — gebruikt zowel hier in
// App.jsx (met de live "categorieen"-state als volgorde) als in Teken.jsx (met de bevroren
// data.categorieVolgorde van het opgeslagen document, want de publieke tekenpagina heeft geen
// toegang tot de live catalogus-instellingen). api/_gedeeld/onboarding.js heeft om dezelfde reden
// (CommonJS, geen import vanuit deze module mogelijk) een eigen, functioneel identieke kopie voor
// de PDF-generatie.
// Documenten van vóór deze functie hebben geen categorieVolgorde — dan wordt de volgorde afgeleid
// uit de regels zelf (eerste voorkomen), met CATEGORIE_LABELS als laatste terugval voor de naam.
export function groepeerOpCategorie(items, categorieVolgorde) {
  const volgorde =
    Array.isArray(categorieVolgorde) && categorieVolgorde.length > 0
      ? categorieVolgorde
      : [...new Map(items.map((it) => [it.categorie, { id: it.categorie, naam: it.categorieNaam }])).values()];
  return volgorde
    .map((c) => ({ cat: c.id, naam: c.naam || CATEGORIE_LABELS[c.id] || c.id, items: items.filter((it) => it.categorie === c.id) }))
    .filter((g) => g.items.length > 0);
}

export function datumTijd(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return "—";
  }
}

function klantAdresRegels(klant) {
  const nummerDeel = `${klant.huisnummer || ""}${klant.huisnummertoevoeging || ""}`.trim();
  const straatRegel = [klant.straat, nummerDeel].filter(Boolean).join(" ");
  const plaatsRegel = [klant.postcode, klant.plaats].filter(Boolean).join(" ");
  return [straatRegel, plaatsRegel].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Opslaghulp: gebruikt window.storage zolang die beschikbaar is (bijv. hier in
// Claude), en valt anders automatisch terug op de eigen Azure Function
// (/api/offertes-instellingen) — zo werkt hetzelfde bestand zowel hier als live op Azure.
// ---------------------------------------------------------------------------
async function opslagGet(sleutel) {
  if (typeof window !== "undefined" && window.storage) {
    try {
      const resultaat = await window.storage.get(sleutel, false);
      return resultaat?.value;
    } catch (e) {
      return undefined;
    }
  }
  try {
    const res = await fetch(`/api/offertes-instellingen/${encodeURIComponent(sleutel)}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.value;
  } catch (e) {
    return undefined;
  }
}

async function opslagSet(sleutel, waarde, { keepalive = false } = {}) {
  if (typeof window !== "undefined" && window.storage) {
    try {
      await window.storage.set(sleutel, waarde, false);
    } catch (e) {
      console.error("Opslaan mislukt:", e); // wijziging blijft wel zichtbaar voor deze sessie
    }
    return;
  }
  try {
    const res = await fetch(`/api/offertes-instellingen/${encodeURIComponent(sleutel)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Requested-With": "offertetool" },
      body: JSON.stringify({ value: waarde }),
      keepalive, // bij een flush vlak vóór het sluiten van de pagina (zie opslagSetDebounced)
    });
    if (!res.ok) {
      const foutdata = await res.json().catch(() => null);
      console.error("Opslaan mislukt:", foutdata?.detail || foutdata?.error || `HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("Opslaan mislukt:", e); // wijziging blijft wel zichtbaar voor deze sessie
  }
}

async function opslagDelete(sleutel) {
  if (typeof window !== "undefined" && window.storage) {
    try {
      await window.storage.delete(sleutel, false);
    } catch (e) {
      // niets opgeslagen om te verwijderen
    }
    return;
  }
  try {
    await fetch(`/api/offertes-instellingen/${encodeURIComponent(sleutel)}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "offertetool" },
    });
  } catch (e) {
    // niets opgeslagen om te verwijderen
  }
}

// Elke losse toetsaanslag in een instellingenveld (standaardteksten, dienstencatalogus,
// afzendergegevens, enz.) zette voorheen via de "bewaar zodra er iets wijzigt"-useEffects
// meteen een eigen PUT-verzoek naar /api/offertes-instellingen in gang. Bij vlot typen — of bij het
// direct na elkaar aanmaken van iets nieuws (bijv. een nieuwe dienst) en daar meteen een
// standaardtekst bij intypen — stonden zo meerdere verzoeken vóór dezelfde sleutel
// tegelijk "in de lucht", zonder enige garantie dat ze in dezelfde volgorde aankomen als ze
// verstuurd zijn. Komt een ouder verzoek toevallig als laatste binnen, dan overschrijft die
// (last-write-wins in api/instellingen) een net getypte, nieuwere tekst weer met de oudere,
// onvolledige inhoud — precies het "wordt niet opgeslagen"-gedrag. Deze helper wacht na de
// laatste wijziging een kort moment (debounce) en annuleert een eerder geplande, nog niet
// verstuurde opslag-actie voor dezelfde sleutel, zodat er nooit meer dan één verzoek per
// sleutel tegelijk onderweg is en altijd de laatst getypte waarde wint.
const opslagDebounceTimers = {};
// Laatst bekende, nog niet daadwerkelijk verstuurde waarde per sleutel — alleen gebruikt om
// bij het sluiten/verlaten van de pagina (zie flushOpslagDebounce hieronder) een nog
// openstaande wijziging alsnog te versturen, zodat een toetsaanslag vlak vóór het dichtklikken
// van het tabblad niet stilletjes verloren gaat door de debounce hierboven.
const opslagDebouncePending = {};
function opslagSetDebounced(sleutel, waarde, vertragingMs = 700) {
  opslagDebouncePending[sleutel] = waarde;
  if (opslagDebounceTimers[sleutel]) clearTimeout(opslagDebounceTimers[sleutel]);
  opslagDebounceTimers[sleutel] = setTimeout(() => {
    delete opslagDebounceTimers[sleutel];
    delete opslagDebouncePending[sleutel];
    opslagSet(sleutel, waarde).catch((e) => console.error("Opslaan mislukt:", e));
  }, vertragingMs);
}

if (typeof window !== "undefined") {
  const flushOpslagDebounce = () => {
    Object.entries(opslagDebouncePending).forEach(([sleutel, waarde]) => {
      if (opslagDebounceTimers[sleutel]) clearTimeout(opslagDebounceTimers[sleutel]);
      delete opslagDebounceTimers[sleutel];
      delete opslagDebouncePending[sleutel];
      opslagSet(sleutel, waarde, { keepalive: true }).catch(() => {});
    });
  };
  // "pagehide" vangt zowel het sluiten van het tabblad als wegnavigeren; "visibilitychange"
  // erbij omdat mobiele browsers een achtergrondtabblad soms afsluiten zonder ooit nog
  // "pagehide" te vuren.
  window.addEventListener("pagehide", flushOpslagDebounce);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOpslagDebounce();
  });
}

// ---------------------------------------------------------------------------
// Offertes bewaren/opzoeken/verwijderen — zelfde dual-mode aanpak als hierboven:
// gebruikt window.storage zolang die beschikbaar is (bijv. hier in Claude, met
// shared=true zodat "iedereen mag alles zien" ook hier klopt), en valt anders
// terug op de eigen Azure Functions (/api/offerte/{id} en /api/offertes).
// ---------------------------------------------------------------------------
function offerteSleutel(id) {
  return `offerte:${id}`;
}

async function offertesIndexOphalen() {
  try {
    const r = await window.storage.get("offertes-index", true);
    return r?.value ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}

async function offertesLijstOphalen() {
  if (typeof window !== "undefined" && window.storage) {
    const ids = await offertesIndexOphalen();
    const records = [];
    for (const id of ids) {
      try {
        const r = await window.storage.get(offerteSleutel(id), true);
        if (r?.value) records.push(JSON.parse(r.value));
      } catch (e) {
        // deze offerte overslaan, rest van de lijst blijft werken
      }
    }
    records.sort((a, b) => new Date(b.gewijzigdOp) - new Date(a.gewijzigdOp));
    return records.map((r) => {
      const bekekenEvents = (r.logboek || []).filter((e) => e.gebeurtenis === "geopend");
      const laatsteBekeken = bekekenEvents.length > 0 ? bekekenEvents[bekekenEvents.length - 1] : null;
      return {
        id: r.id,
        klantNamen: r.klantNamen || [],
        klantGroepen: r.klantGroepen || [],
        status: r.status || OFFERTE_STATUS_STANDAARD,
        aangemaaktOp: r.aangemaaktOp,
        aangemaaktDoor: r.aangemaaktDoor,
        gewijzigdOp: r.gewijzigdOp,
        gewijzigdDoor: r.gewijzigdDoor,
        aantalBekeken: bekekenEvents.length,
        laatstBekekenOp: laatsteBekeken?.op || null,
        laatstBekekenIp: laatsteBekeken?.ip || null,
      };
    });
  }
  const res = await fetch("/api/offertes");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function offerteOphalen(id) {
  if (typeof window !== "undefined" && window.storage) {
    const r = await window.storage.get(offerteSleutel(id), true);
    if (!r?.value) throw new Error("Offerte niet gevonden.");
    return JSON.parse(r.value);
  }
  const res = await fetch(`/api/offerte/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// payload mag een deelverzameling zijn van { data, klantNamen, klantGroepen, status,
// gebruikerNaam }. Ontbrekende velden worden overgenomen van het bestaande record —
// zo kan een statuswijziging (bijv. vanuit het overzicht) de rest van de offerte
// ongemoeid laten, en hoeft een volledige opslag (bij afdrukken) niet de status te
// resetten. Nieuwe offertes krijgen automatisch status "Verzonden".
async function offerteOpslaan(id, payload) {
  if (typeof window !== "undefined" && window.storage) {
    const nu = new Date().toISOString();
    let bestaandRecord = null;
    try {
      const bestaand = await window.storage.get(offerteSleutel(id), true);
      if (bestaand?.value) bestaandRecord = JSON.parse(bestaand.value);
    } catch (e) {
      // nog geen bestaand record; dit is dan de eerste opslag
    }
    const record = {
      ...bestaandRecord,
      id,
      aangemaaktOp: bestaandRecord?.aangemaaktOp || nu,
      aangemaaktDoor: bestaandRecord?.aangemaaktDoor || payload.gebruikerNaam,
      aangemaaktDoorEmail: bestaandRecord?.aangemaaktDoorEmail || payload.gebruikerEmail || "",
      gewijzigdOp: nu,
      gewijzigdDoor: payload.gebruikerNaam,
      klantNamen: payload.klantNamen !== undefined ? payload.klantNamen : bestaandRecord?.klantNamen || [],
      klantGroepen: payload.klantGroepen !== undefined ? payload.klantGroepen : bestaandRecord?.klantGroepen || [],
      status: payload.status !== undefined ? payload.status : bestaandRecord?.status || OFFERTE_STATUS_STANDAARD,
      data: payload.data !== undefined ? payload.data : bestaandRecord?.data || {},
    };
    await window.storage.set(offerteSleutel(id), JSON.stringify(record), true);
    const ids = await offertesIndexOphalen();
    if (!ids.includes(id)) {
      ids.push(id);
      await window.storage.set("offertes-index", JSON.stringify(ids), true);
    }
    return record;
  }
  const res = await fetch(`/api/offerte/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Requested-With": "offertetool" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function offertesVerwijderen(ids) {
  if (typeof window !== "undefined" && window.storage) {
    await Promise.all(
      ids.map(async (id) => {
        try {
          await window.storage.delete(offerteSleutel(id), true);
        } catch (e) {
          // niets opgeslagen om te verwijderen, of al weg
        }
      })
    );
    const huidigeIndex = await offertesIndexOphalen();
    const nieuweIndex = huidigeIndex.filter((id) => !ids.includes(id));
    await window.storage.set("offertes-index", JSON.stringify(nieuweIndex), true);
    return;
  }
  await Promise.all(
    ids.map((id) =>
      fetch(`/api/offerte/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Requested-With": "offertetool" },
      }).catch(() => null)
    )
  );
}

// ---------------------------------------------------------------------------
// Opdrachtbevestigingen bewaren/opzoeken/verwijderen — exacte kopie van de
// offerte-opslagfuncties hierboven, maar in een eigen "namespace" (sleutel-prefix,
// eigen index, eigen /api/opdrachtbevestiging(en)-endpoints) zodat opdrachtbevestigingen
// nooit door elkaar lopen met offertes, ook al kunnen ze uit dezelfde klant-/
// dienstenselectie ontstaan.
// ---------------------------------------------------------------------------
function opdrachtbevestigingSleutel(id) {
  return `opdrachtbevestiging:${id}`;
}

async function opdrachtbevestigingenIndexOphalen() {
  try {
    const r = await window.storage.get("opdrachtbevestigingen-index", true);
    return r?.value ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}

async function opdrachtbevestigingenLijstOphalen() {
  if (typeof window !== "undefined" && window.storage) {
    const ids = await opdrachtbevestigingenIndexOphalen();
    const records = [];
    for (const id of ids) {
      try {
        const r = await window.storage.get(opdrachtbevestigingSleutel(id), true);
        if (r?.value) records.push(JSON.parse(r.value));
      } catch (e) {
        // deze opdrachtbevestiging overslaan, rest van de lijst blijft werken
      }
    }
    records.sort((a, b) => new Date(b.gewijzigdOp) - new Date(a.gewijzigdOp));
    return records.map((r) => {
      const bekekenEvents = (r.logboek || []).filter((e) => e.gebeurtenis === "geopend");
      const laatsteBekeken = bekekenEvents.length > 0 ? bekekenEvents[bekekenEvents.length - 1] : null;
      return {
        id: r.id,
        klantNamen: r.klantNamen || [],
        klantGroepen: r.klantGroepen || [],
        opdrachttypeId: r.opdrachttypeId || null,
        opdrachttypeNaam: r.opdrachttypeNaam || "",
        status: r.status || OPDRACHTBEVESTIGING_STATUS_STANDAARD,
        aangemaaktOp: r.aangemaaktOp,
        aangemaaktDoor: r.aangemaaktDoor,
        gewijzigdOp: r.gewijzigdOp,
        gewijzigdDoor: r.gewijzigdDoor,
        aantalBekeken: bekekenEvents.length,
        laatstBekekenOp: laatsteBekeken?.op || null,
        laatstBekekenIp: laatsteBekeken?.ip || null,
      };
    });
  }
  const res = await fetch("/api/opdrachtbevestigingen");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function opdrachtbevestigingOphalen(id) {
  if (typeof window !== "undefined" && window.storage) {
    const r = await window.storage.get(opdrachtbevestigingSleutel(id), true);
    if (!r?.value) throw new Error("Opdrachtbevestiging niet gevonden.");
    return JSON.parse(r.value);
  }
  const res = await fetch(`/api/opdrachtbevestiging/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// payload mag een deelverzameling zijn van { data, klantNamen, klantGroepen, status,
// opdrachttypeId, opdrachttypeNaam, gebruikerNaam }. Zelfde "ontbrekende velden blijven
// zoals ze waren"-gedrag als offerteOpslaan.
async function opdrachtbevestigingOpslaan(id, payload) {
  if (typeof window !== "undefined" && window.storage) {
    const nu = new Date().toISOString();
    let bestaandRecord = null;
    try {
      const bestaand = await window.storage.get(opdrachtbevestigingSleutel(id), true);
      if (bestaand?.value) bestaandRecord = JSON.parse(bestaand.value);
    } catch (e) {
      // nog geen bestaand record; dit is dan de eerste opslag
    }
    const record = {
      ...bestaandRecord,
      id,
      soort: "opdrachtbevestiging",
      aangemaaktOp: bestaandRecord?.aangemaaktOp || nu,
      aangemaaktDoor: bestaandRecord?.aangemaaktDoor || payload.gebruikerNaam,
      aangemaaktDoorEmail: bestaandRecord?.aangemaaktDoorEmail || payload.gebruikerEmail || "",
      gewijzigdOp: nu,
      gewijzigdDoor: payload.gebruikerNaam,
      klantNamen: payload.klantNamen !== undefined ? payload.klantNamen : bestaandRecord?.klantNamen || [],
      klantGroepen: payload.klantGroepen !== undefined ? payload.klantGroepen : bestaandRecord?.klantGroepen || [],
      status: payload.status !== undefined ? payload.status : bestaandRecord?.status || OPDRACHTBEVESTIGING_STATUS_STANDAARD,
      opdrachttypeId: payload.opdrachttypeId !== undefined ? payload.opdrachttypeId : bestaandRecord?.opdrachttypeId || null,
      opdrachttypeNaam: payload.opdrachttypeNaam !== undefined ? payload.opdrachttypeNaam : bestaandRecord?.opdrachttypeNaam || "",
      data: payload.data !== undefined ? payload.data : bestaandRecord?.data || {},
    };
    await window.storage.set(opdrachtbevestigingSleutel(id), JSON.stringify(record), true);
    const ids = await opdrachtbevestigingenIndexOphalen();
    if (!ids.includes(id)) {
      ids.push(id);
      await window.storage.set("opdrachtbevestigingen-index", JSON.stringify(ids), true);
    }
    return record;
  }
  const res = await fetch(`/api/opdrachtbevestiging/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Requested-With": "offertetool" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function opdrachtbevestigingenVerwijderen(ids) {
  if (typeof window !== "undefined" && window.storage) {
    await Promise.all(
      ids.map(async (id) => {
        try {
          await window.storage.delete(opdrachtbevestigingSleutel(id), true);
        } catch (e) {
          // niets opgeslagen om te verwijderen, of al weg
        }
      })
    );
    const huidigeIndex = await opdrachtbevestigingenIndexOphalen();
    const nieuweIndex = huidigeIndex.filter((id) => !ids.includes(id));
    await window.storage.set("opdrachtbevestigingen-index", JSON.stringify(nieuweIndex), true);
    return;
  }
  await Promise.all(
    ids.map((id) =>
      fetch(`/api/opdrachtbevestiging/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Requested-With": "offertetool" },
      }).catch(() => null)
    )
  );
}

// Het echte Activaa-logo, ingebakken als standaardlogo. Wordt gebruikt zolang er
// geen eigen logo is geüpload via "Logo uploaden" — zo verschijnt er nooit meer
// eerst een gegenereerd placeholder-logo (initialen) voordat het echte laadt.
export const ACTIVAA_LOGO = "data:image/png;base64,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";

// Het echte Activaa-favicon (los van het grote logo, want dit moet ook goed leesbaar
// zijn op klein formaat in een browsertab). Wordt gebruikt zolang er geen eigen
// favicon is geüpload via "Favicon wijzigen" in de Afzender-instellingen.
const ACTIVAA_FAVICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA+gAAAPoCAMAAAB6fSTWAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyhpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNi1jMTM4IDc5LjE1OTgyNCwgMjAxNi8wOS8xNC0wMTowOTowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTcgKE1hY2ludG9zaCkiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6RUEzNkU2OTFBQTY2MTFFNzk1OUZBODY2MDBFNTQ5REYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6RUEzNkU2OTJBQTY2MTFFNzk1OUZBODY2MDBFNTQ5REYiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpFQTM2RTY4RkFBNjYxMUU3OTU5RkE4NjYwMEU1NDlERiIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpFQTM2RTY5MEFBNjYxMUU3OTU5RkE4NjYwMEU1NDlERiIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PjTZGV0AAAKsUExURfH6/U+66KDa87vl9vz+/yqs4/3+//f8/iir4yut5C6u5Pr9/kG15vX7/jCv5DSw5e74/eb1/EC15uHz++r3/EW35zuz5jex5dvx+tXv+i+u5HfK7dDt+Uq56L/m95PV8brk9la96VG76GfE657Z8o3T8FC76IjR8GzG7Eu56HLI7a/g9ZnX8kK2567f9Mnq+Pv9/mrF7IXQ7/L6/V7A6rTi9Syt5FzA6vH5/TWw5dnw+i2t5PP6/crr+Dqz5ka3597y+zyz5uP0+yms46bc847T8LHh9ej2/Dqy5ajd9LLh9ev3/JHU8YfQ79Tu+X/N7t3y+5TV8YLP79zx+nvM7vn9/ky56OT0+/j8/jGv5HPJ7eL0+1W96WLC6+z4/ZvY8sXo97bj9lS86Vm+6YPP70i453nL7prY8onR8Mzr+HDH7GjE61u/6nrL7s/s+T205jax5ZzY8qzf9IHO72TD62DB6jiy5X3M7u34/W7H7NHt+TOw5e/5/and9Nbv+rXi9fb7/lq/6l3A6uf2/E266Ee451K86cPo9z605qLb877m92bD65jX8uz3/KHa89rx+kO25+n2/Kre9Mfp+Njw+nXJ7XzM7tLu+bzl9vD5/cDn9zKv5G3G7GvF7Fi+6aTb88bp+JfW8eX1/Em455LV8b3l9nTJ7X3N7kS25zWx5aTc89Pu+bDg9ZDU8XbK7cXp+ITP76Pb8/T7/jmy5WXD6z+05orS8Mvr+Mrq+I/U8ane9M3s+c7s+W/H7Fy/6oLO77jj9sHn95XW8WnF7Kve9Lfj9uDz+1/B6sTo98jq+IvS8FO86Z3Z8rPh9ZbW8WHC66Xc82HB6oDO74bQ75/a80666Lnk9njL7q3f9N/y+1e+6dfw+sLn94zS8H7N7nHI7WPC66fd9Cer4////6FlT5YAAADkdFJOU///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////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";

function genereerStandaardLogo() {
  return ACTIVAA_LOGO;
}

export default function OffertetoolApp() {
  const [stap, setStap] = useState("klant");
  const [terugNaarStap, setTerugNaarStap] = useState("klant");
  const [ingelogd, setIngelogd] = useState(false);
  const [bezigMetInloggen, setBezigMetInloggen] = useState(false);

  // Echte ingelogde gebruiker ophalen bij Azure Static Web Apps (werkt alleen op de live site,
  // niet in lokale ontwikkeling — daar valt de tool terug op de gesimuleerde inlogknop).
  const [echteGebruiker, setEchteGebruiker] = useState(null);
  const [authGecontroleerd, setAuthGecontroleerd] = useState(false);

  useEffect(() => {
    let actief = true;
    fetch("/.auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!actief) return;
        const principal = data?.clientPrincipal;
        if (principal?.userDetails) {
          // userDetails is bij Microsoft-login meestal het e-mailadres/UPN. De echte
          // weergavenaam zit (indien beschikbaar) tussen de losse "claims" van het account.
          const naamClaim = principal.claims?.find(
            (c) =>
              c.typ === "name" ||
              c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" ||
              c.typ?.endsWith("/claims/name")
          );
          const naam = naamClaim?.val || principal.userDetails;
          const emailClaim = principal.claims?.find(
            (c) => c.typ === "preferred_username" || c.typ?.endsWith("/emailaddress")
          );
          const email = emailClaim?.val || principal.userDetails;
          setEchteGebruiker({
            naam,
            email,
            rol: "Ingelogd via Microsoft",
            initialen: naam
              .split(/[.\s@]/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join(""),
          });
          setIngelogd(true);
          setStap((huidige) => (huidige === "login" ? "klant" : huidige));
        }
      })
      .catch(() => {
        // /.auth/me bestaat niet (bijv. lokale ontwikkeling) — dan blijft de gesimuleerde login werken
      })
      .finally(() => {
        if (actief) setAuthGecontroleerd(true);
      });
    return () => {
      actief = false;
    };
  }, []);

  // Mag deze ingelogde gebruiker het Instellingen-scherm zien en op verzoek een Dataverse-
  // kolom aanmaken (zie api/ben-ik-beheerder en isBeheerder in api/_gedeeld/onboarding.js)?
  // Puur voor het tonen/verbergen van beheerders-only onderdelen — de echte afdwinging
  // gebeurt server-side, dus dit is alleen relevant voor de gebruikerservaring. Faalt de
  // aanroep (bijv. lokale ontwikkeling zonder /api-backend), dan blijft dit gewoon "nee".
  const [benIkBeheerder, setBenIkBeheerder] = useState(false);
  const [benIkBeheerderGeladen, setBenIkBeheerderGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    fetch("/api/ben-ik-beheerder")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (actief) setBenIkBeheerder(data?.beheerder === true);
      })
      .catch(() => {
        // geen /api-backend bereikbaar (bijv. lokale ontwikkeling) — blijft "nee"
      })
      .finally(() => {
        if (actief) setBenIkBeheerderGeladen(true);
      });
    return () => {
      actief = false;
    };
  }, []);

  const huidigeGebruiker = echteGebruiker || MOCK_USER;

  const [afzender, setAfzender] = useState({
    bedrijf: "Activaa Accountants en Adviseurs",
    adres: "Handelskade 12",
    postcode: "3011 CV",
    plaats: "Rotterdam",
    kvk: "84120933",
    ondertekenaar: MOCK_USER.naam,
    geldigheid: "30",
    inleiding:
      "Hartelijk dank voor uw interesse. Hieronder vindt u onze offerte, samengesteld op basis van het besproken traject.",
  });
  const [afzenderGeladen, setAfzenderGeladen] = useState(false);

  // Afzendergegevens laden uit persistente opslag.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("afzender");
        if (actief && waarde) {
          setAfzender(JSON.parse(waarde));
        }
      } catch (e) {
        // nog geen afzendergegevens opgeslagen, of opslag niet beschikbaar
      }
      if (actief) setAfzenderGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Afzendergegevens bewaren zodra er iets in wijzigt (pas nadat de eerste keer geladen is).
  useEffect(() => {
    if (!afzenderGeladen) return;
    opslagSetDebounced("afzender", JSON.stringify(afzender));
  }, [afzender, afzenderGeladen]);

  // "Ondertekenaar" (Namens) en het bijbehorende e-mailadres volgen automatisch de echt
  // ingelogde Microsoft-gebruiker — bij elke login opnieuw, zodat elke collega (van de 10)
  // gewoon zichzelf ziet staan zonder dat iemand dit handmatig hoeft in te stellen.
  useEffect(() => {
    if (echteGebruiker && afzenderGeladen) {
      setAfzender((prev) => ({
        ...prev,
        ondertekenaar: echteGebruiker.naam,
        ondertekenaarEmail: echteGebruiker.email,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echteGebruiker, afzenderGeladen]);

  // Inleidende tekst op de opdrachtbevestiging — bewust LOS van afzender.inleiding (de
  // offerte-inleiding hierboven). Werd eerder 1-op-1 hergebruikt, maar de teksten moeten
  // per document kunnen verschillen. Te bewerken bij de stap "Bijlage" (samen met de
  // offerte-inleiding), net als de andere gedeelde toelichtingsvelden daar.
  const OPDRACHTBEVESTIGING_INLEIDING_DEFAULT =
    "Hartelijk dank voor de opdracht. Hieronder vindt u onze opdrachtbevestiging, samengesteld op basis van de gemaakte afspraken.";
  const [opdrachtbevestigingInleiding, setOpdrachtbevestigingInleiding] = useState(OPDRACHTBEVESTIGING_INLEIDING_DEFAULT);
  const [opdrachtbevestigingInleidingGeladen, setOpdrachtbevestigingInleidingGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("inleiding-opdrachtbevestiging");
        if (actief && waarde) {
          setOpdrachtbevestigingInleiding(waarde);
        }
      } catch (e) {
        // nog niets opgeslagen, standaardtekst blijft staan
      } finally {
        if (actief) setOpdrachtbevestigingInleidingGeladen(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!opdrachtbevestigingInleidingGeladen) return;
    opslagSetDebounced("inleiding-opdrachtbevestiging", opdrachtbevestigingInleiding);
  }, [opdrachtbevestigingInleiding, opdrachtbevestigingInleidingGeladen]);

  const [logo, setLogo] = useState(null); // base64/SVG data-URL van het logo, of null zolang het nog laadt
  const [logoGeladen, setLogoGeladen] = useState(false);

  // Logo laden uit persistente opslag; anders eenmalig het echte standaardlogo opslaan.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("logo");
        // Vóór deze versie werd bij het eerste gebruik automatisch een SVG met initialen
        // ("OF") gegenereerd en opgeslagen als logo. Zo'n oude placeholder herkennen we
        // aan het "data:image/svg+xml"-voorvoegsel — een echt geüpload logo is altijd een
        // rasterafbeelding (PNG/JPG) en begint dus anders. Vinden we zo'n oude placeholder,
        // dan vervangen we 'm stilzwijgend door het echte logo, voor iedereen.
        const isOudePlaceholder = typeof waarde === "string" && waarde.startsWith("data:image/svg+xml");
        if (actief && waarde && !isOudePlaceholder) {
          setLogo(waarde);
          setLogoGeladen(true);
          return;
        }
      } catch (e) {
        // nog geen logo opgeslagen, of opslag niet beschikbaar — dan vullen we de standaard in
      }
      if (!actief) return;
      const standaard = genereerStandaardLogo(afzender.bedrijf);
      setLogo(standaard);
      setLogoGeladen(true);
      try {
        await opslagSet("logo", standaard);
      } catch (e) {
        console.error("Opslaan mislukt:", e); // logo blijft wel zichtbaar voor deze sessie
      }
    })();
    return () => {
      actief = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logoUploaden(bestand) {
    if (!bestand) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setLogo(dataUrl);
      try {
        await opslagSet("logo", dataUrl);
      } catch (err) {
        console.error("Opslaan mislukt:", err); // logo blijft wel zichtbaar voor deze sessie
      }
    };
    reader.readAsDataURL(bestand);
  }

  async function logoVerwijderen() {
    setLogo(null);
    try {
      await opslagDelete("logo");
    } catch (e) {
      // niets opgeslagen om te verwijderen
    }
  }

  const [favicon, setFavicon] = useState(null); // base64 data-URL van de favicon, of null zolang het nog laadt

  // Favicon laden uit persistente opslag; anders het ingebakken Activaa-favicon gebruiken.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("favicon");
        if (actief && waarde) {
          setFavicon(waarde);
          return;
        }
      } catch (e) {
        // nog geen favicon opgeslagen, of opslag niet beschikbaar — dan de standaard gebruiken
      }
      if (actief) setFavicon(ACTIVAA_FAVICON);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Zodra de favicon bekend is (standaard of eigen upload), het <link rel="icon">-element
  // in de <head> bijwerken, zodat 'm ook echt in de browsertab verschijnt.
  useEffect(() => {
    if (!favicon) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = favicon.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
    link.href = favicon;
  }, [favicon]);

  function faviconUploaden(bestand) {
    if (!bestand) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setFavicon(dataUrl);
      try {
        await opslagSet("favicon", dataUrl);
      } catch (err) {
        console.error("Opslaan mislukt:", err); // favicon blijft wel zichtbaar voor deze sessie
      }
    };
    reader.readAsDataURL(bestand);
  }

  async function faviconVerwijderen() {
    setFavicon(ACTIVAA_FAVICON);
    try {
      await opslagDelete("favicon");
    } catch (e) {
      // niets opgeslagen om te verwijderen
    }
  }

  const [dienstenCatalogus, setDienstenCatalogus] = useState(INITIAL_CATALOGUS);
  const [catalogusGeladen, setCatalogusGeladen] = useState(false);
  // Vrij te beheren categorieën ("kolommen") waarin diensten worden ingedeeld — zie
  // "Categorieën beheren" onder Dienstencatalogus beheren, en groepeerOpCategorie hierboven.
  const [categorieen, setCategorieen] = useState(CATEGORIEEN_STANDAARD);
  const [categorieenGeladen, setCategorieenGeladen] = useState(false);

  // Medewerkers (naam/e-mail/telefoonnummer/functie/rol) — bepaalt via de rol "beheerder" wie
  // toegang heeft tot het Instellingen-scherm, zie "Medewerkers beheren" onder Instellingen en
  // isBeheerder in api/_gedeeld/onboarding.js. automatisering@activaa.nl en alings@activaa.nl
  // zijn daar altijd beheerder, ook als ze niet (meer) in deze lijst staan.
  const [medewerkers, setMedewerkers] = useState([]);
  const [medewerkersGeladen, setMedewerkersGeladen] = useState(false);

  const [zoekKlant, setZoekKlant] = useState("");
  const [gekozenKlanten, setGekozenKlanten] = useState([]); // array van klant-objecten

  // Opgeslagen offertes: overzicht van iedereen (datum, klant(en), opgemaakt/gewijzigd door).
  const [offertesLijst, setOffertesLijst] = useState([]);
  const [offertesLijstBezig, setOffertesLijstBezig] = useState(false);
  const [offertesLijstFout, setOffertesLijstFout] = useState(false);
  // Zoeken (vrije tekst over klant, klantgroep, opgemaakt/gewijzigd door) en filteren
  // per kolom (klantgroep en opgemaakt door) in het offertes-overzicht.
  const [offertesZoekterm, setOffertesZoekterm] = useState("");
  const [offertesFilterKlantgroep, setOffertesFilterKlantgroep] = useState("");
  const [offertesFilterGebruiker, setOffertesFilterGebruiker] = useState("");
  const [offertesFilterStatus, setOffertesFilterStatus] = useState("");
  const [offerteStatusBezigId, setOfferteStatusBezigId] = useState(null);
  const [logboekOpenId, setLogboekOpenId] = useState(null);
  const [logboekRecord, setLogboekRecord] = useState(null);
  const [logboekBezig, setLogboekBezig] = useState(false);
  const [offertesPagina, setOffertesPagina] = useState(1);
  // Aantal offertes per pagina — instelbaar via de keuze onderaan het overzicht
  // (25/50/100/Alle); "alle" laat de paginering feitelijk vervallen.
  const [offertesPaginaGrootte, setOffertesPaginaGrootte] = useState(25);
  const [offertesSelectie, setOffertesSelectie] = useState(() => new Set());
  const [offertesVerwijderenBezig, setOffertesVerwijderenBezig] = useState(false);
  const [offertesBevestigenTonen, setOffertesBevestigenTonen] = useState(false);
  // huidigeOfferteId: null = nog niet opgeslagen (nieuwe offerte). Eenmaal opgeslagen
  // (bij het afdrukken/PDF) wordt een volgende opslag van dezelfde offerte een update
  // van hetzelfde record ("laatst gewijzigd"), in plaats van een nieuwe offerte.
  const [huidigeOfferteId, setHuidigeOfferteId] = useState(null);
  // offerteMaker: naam + e-mail van de oorspronkelijke maker van de op dit moment
  // geopende offerte (voor de automatische cc bij het versturen van de tekenlink-mail —
  // zie bepaalOfferteMaker()). Blijft de échte eerste maker, ook als een collega de
  // offerte later opent/bewerkt.
  const [offerteMaker, setOfferteMaker] = useState({ naam: "", email: "" });
  const [offerteOpslaanStatus, setOfferteOpslaanStatus] = useState("idle"); // idle | bezig | opgeslagen | fout
  // Status van de offerte die nu open staat (alleen relevant tijdens het bewerken/bekijken
  // van één offerte — het overzicht zelf houdt per rij zijn eigen status bij).
  const [huidigeOfferteStatus, setHuidigeOfferteStatus] = useState(OFFERTE_STATUS_STANDAARD);
  // Na het openen van de PDF vragen of de status op "Verzonden" gezet mag worden.
  const [offerteVraagStatusTonen, setOfferteVraagStatusTonen] = useState(false);
  const [tekenLinkGekopieerd, setTekenLinkGekopieerd] = useState(false);
  // Bezig met het ophalen van de PDF (dezelfde server-gegenereerde PDF als op de tekenlink).
  const [pdfBezig, setPdfBezig] = useState(false);
  // mailAdressen: per klant-ID het (evt. aangepaste) e-mailadres om de tekenlink naartoe te
  // mailen — standaard het bekende adres van de klant, hier alleen zichtbaar/wijzigbaar
  // vlak voordat je 'm gebruikt (niet apart opgeslagen bij de offerte).
  const [mailAdressen, setMailAdressen] = useState({});
  // mailStatus: per groep klanten (samengevoegde ID's) de status van het versturen —
  // { [sleutel]: { status: "bezig"|"verzonden"|"fout", bericht?, van? } }
  const [mailStatus, setMailStatus] = useState({});
  // mailConcepten: per groep klanten de (nog te bewerken) onderwerp/tekst, vóór verzending.
  // mailConceptOpenSleutel: welke groep op dit moment het bewerkscherm open heeft staan.
  const [mailConcepten, setMailConcepten] = useState({});
  const [mailConceptOpenSleutel, setMailConceptOpenSleutel] = useState(null);
  // mailCcExtra: per groep klanten een optioneel extra e-mailadres om in cc te zetten,
  // naast de automatische cc naar de maker van de offerte (zie bepaalOfferteMaker()).
  const [mailCcExtra, setMailCcExtra] = useState({});

  // ---------------------------------------------------------------------------
  // Opdrachtbevestiging — zelfde soort state als de offerte hierboven, maar in een eigen
  // "namespace": een los record-ID/maker/status/opslaanstatus, en een los overzicht
  // (lijst/filters/paginering/uitklapbaar logboek). Klant/diensten/prijzen (gekozenKlanten,
  // geselecteerd, klantVarianten, aangepastePrijzen, uitgeschakeldVoorKlant) blijven WEL
  // gedeeld met de offerte-stappen — dat is precies het punt: uit één selectie kun je zowel
  // een offerte als een opdrachtbevestiging maken.
  // ---------------------------------------------------------------------------
  const [huidigeOpdrachtbevestigingId, setHuidigeOpdrachtbevestigingId] = useState(null);
  const [opdrachtbevestigingMaker, setOpdrachtbevestigingMaker] = useState({ naam: "", email: "" });
  const [opdrachtbevestigingOpslaanStatus, setOpdrachtbevestigingOpslaanStatus] = useState("idle"); // idle | bezig | opgeslagen | fout
  const [huidigeOpdrachtbevestigingStatus, setHuidigeOpdrachtbevestigingStatus] = useState(OPDRACHTBEVESTIGING_STATUS_STANDAARD);
  const [tekenLinkGekopieerdOpdrachtbevestiging, setTekenLinkGekopieerdOpdrachtbevestiging] = useState(false);
  const [pdfBezigOpdrachtbevestiging, setPdfBezigOpdrachtbevestiging] = useState(false);
  // Vanuit welke offerte (indien via de snelkoppeling op het Offerte-scherm) deze
  // opdrachtbevestiging is gestart — puur informatief, geen functionele koppeling.
  const [opdrachtbevestigingVanuitOfferteId, setOpdrachtbevestigingVanuitOfferteId] = useState(null);
  // Is deze opdrachtbevestiging een herbevestiging/tariefswijziging van een eerdere,
  // al ondertekende opdrachtbevestiging? Zo ja: het interne ID van die eerdere
  // opdrachtbevestiging (zie de kiezer op de Opdrachtbevestiging-stap) — bij het
  // ondertekenen wordt hiermee in Dataverse de vorige rij gekoppeld (cr283_herbevestigingvan)
  // en worden de nog openstaande tarieven van die vorige rij afgesloten. Puur functioneel,
  // wél in de snapshot bewaard (zie huidigeOpdrachtbevestigingSnapshot).
  const [herbevestigingVanId, setHerbevestigingVanId] = useState(null);
  // Status van het automatisch overnemen van diensten bij het kiezen van een herbevestiging
  // hierboven (zie kiesHerbevestigingVan) — puur voor de meldingen in de UI, niet opgeslagen.
  const [herbevestigingOvernemenBezig, setHerbevestigingOvernemenBezig] = useState(false);
  const [herbevestigingOvernemenFout, setHerbevestigingOvernemenFout] = useState(null);
  const [herbevestigingOvergenomenAantal, setHerbevestigingOvergenomenAantal] = useState(null);
  const [herbevestigingVerdwenenDiensten, setHerbevestigingVerdwenenDiensten] = useState([]);
  // Optionele ingangsdatum voor de tarieven van deze opdrachtbevestiging (YYYY-MM-DD) — los van
  // de daadwerkelijke ondertekendatum. Leeg = ingangsdatum wordt de ondertekendatum (zoals
  // voorheen). Handig bij een herbevestiging/tariefswijziging die je vandaag ondertekent maar
  // pas op een latere datum in laat gaan: bepaalt zowel cr283_looptijdvan van de nieuwe
  // tarieven als de dag waarop de oude tarieven worden afgesloten (altijd één dag eerder).
  const [tariefIngangsdatum, setTariefIngangsdatum] = useState("");
  // Optionele einddatum voor de tarieven van deze opdrachtbevestiging (YYYY-MM-DD) — leeg =
  // geen vaste einddatum (loopt door). Wordt bij ondertekenen als cr283_looptijdtotenmet op
  // elke tarief-rij meegeschreven, én gebruikt door verwerkVerlopenTarieven (api/_gedeeld/
  // onboarding.js, aangeroepen vanuit api/opdrachtbevestigingen zodra het overzicht wordt
  // geladen) om automatisch een concept-vervolg-opdrachtbevestiging klaar te zetten zodra deze
  // datum verstreken is — zie README, sectie "Automatisch concept na einddatum tarieven".
  const [tariefEinddatum, setTariefEinddatum] = useState("");
  // Het gekozen opdrachttype (NV COS) voor de op dit moment "open" opdrachtbevestiging, en de
  // bijbehorende paragrafen — verplicht (alleen-lezen kopie van het beheerde standaardtype) en
  // optioneel (startpunt = de standaard-optionele paragrafen van dat type, per document vrij
  // aan te passen/aan te vullen/te verwijderen).
  const [gekozenOpdrachttypeId, setGekozenOpdrachttypeId] = useState(null);
  const [opdrachtbevestigingParagrafen, setOpdrachtbevestigingParagrafen] = useState({ verplicht: [], optioneel: [] });
  // Welke dienst-teksten (zie opdrachtbevestigingDienstTeksten hierboven) voor DEZE
  // opdrachtbevestiging zijn uitgezet — vorm: { [dienstId]: true }. Ontbreekt een dienst-ID
  // hier, dan telt de tekst gewoon mee (standaard aan); alleen expliciet uitgezette diensten
  // staan hierin. Puur per-record, niet los bewaard.
  const [opdrachtbevestigingDienstTekstUit, setOpdrachtbevestigingDienstTekstUit] = useState({});
  function toggleOpdrachtbevestigingDienstTekst(dienstId) {
    setOpdrachtbevestigingDienstTekstUit((prev) => {
      const next = { ...prev };
      if (next[dienstId]) delete next[dienstId];
      else next[dienstId] = true;
      return next;
    });
  }

  // Mail-opstellen voor opdrachtbevestiging — zelfde opzet als mailStatus/mailConcepten/
  // mailConceptOpenSleutel/mailCcExtra bij offerte, maar in een eigen "ob"-namespace. Een
  // gedeelde status zou anders kunnen laten zien dat "de mail al verstuurd is" voor de
  // opdrachtbevestiging terwijl in werkelijkheid alleen de offerte aan diezelfde klant is
  // gemaild (of andersom) — mailAdressen (welk adres) blijft wél gedeeld, dat is niet
  // documentgebonden.
  const [obMailStatus, setObMailStatus] = useState({});
  const [obMailConcepten, setObMailConcepten] = useState({});
  const [obMailConceptOpenSleutel, setObMailConceptOpenSleutel] = useState(null);
  const [obMailCcExtra, setObMailCcExtra] = useState({});

  // Opdrachtbevestigingen-overzicht: zelfde opzet als het offertes-overzicht hierboven, met
  // als enige inhoudelijke toevoeging het opdrachttype (kolom + filter) — zie het scherm
  // "opdrachtbevestigingen" verderop.
  const [opdrachtbevestigingenLijst, setOpdrachtbevestigingenLijst] = useState([]);
  const [opdrachtbevestigingenLijstBezig, setOpdrachtbevestigingenLijstBezig] = useState(false);
  const [opdrachtbevestigingenLijstFout, setOpdrachtbevestigingenLijstFout] = useState(false);
  const [opdrachtbevestigingenZoekterm, setOpdrachtbevestigingenZoekterm] = useState("");
  const [opdrachtbevestigingenFilterKlantgroep, setOpdrachtbevestigingenFilterKlantgroep] = useState("");
  const [opdrachtbevestigingenFilterOpdrachttype, setOpdrachtbevestigingenFilterOpdrachttype] = useState("");
  const [opdrachtbevestigingenFilterStatus, setOpdrachtbevestigingenFilterStatus] = useState("");
  const [opdrachtbevestigingStatusBezigId, setOpdrachtbevestigingStatusBezigId] = useState(null);
  const [obLogboekOpenId, setObLogboekOpenId] = useState(null);
  const [obLogboekRecord, setObLogboekRecord] = useState(null);
  const [obLogboekBezig, setObLogboekBezig] = useState(false);
  const [opdrachtbevestigingenPagina, setOpdrachtbevestigingenPagina] = useState(1);
  const [opdrachtbevestigingenPaginaGrootte, setOpdrachtbevestigingenPaginaGrootte] = useState(25);
  const [opdrachtbevestigingenSelectie, setOpdrachtbevestigingenSelectie] = useState(() => new Set());
  const [opdrachtbevestigingenVerwijderenBezig, setOpdrachtbevestigingenVerwijderenBezig] = useState(false);
  const [opdrachtbevestigingenBevestigenTonen, setOpdrachtbevestigingenBevestigenTonen] = useState(false);

  async function laadOpdrachtbevestigingenLijst() {
    setOpdrachtbevestigingenLijstBezig(true);
    setOpdrachtbevestigingenLijstFout(false);
    try {
      const data = await opdrachtbevestigingenLijstOphalen();
      setOpdrachtbevestigingenLijst(data);
      setOpdrachtbevestigingenSelectie(new Set());
    } catch (e) {
      setOpdrachtbevestigingenLijstFout(true);
    } finally {
      setOpdrachtbevestigingenLijstBezig(false);
    }
  }

  // De lijst is verder alleen bedoeld voor het overzichtsscherm (lazy geladen via
  // openOpdrachtbevestigingenOverzicht), maar de "Herbevestiging van eerdere
  // opdrachtbevestiging"-kiezer op de Opdrachtbevestiging-stap heeft 'm ook nodig — hier dus
  // ook (eenmalig, alleen als nog leeg) laden zodra die stap bereikt wordt.
  useEffect(() => {
    if (stap === "opdrachtbevestiging" && opdrachtbevestigingenLijst.length === 0 && !opdrachtbevestigingenLijstBezig && !opdrachtbevestigingenLijstFout) {
      laadOpdrachtbevestigingenLijst();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stap]);

  function toggleOpdrachtbevestigingSelectie(id) {
    setOpdrachtbevestigingenSelectie((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAlleOpdrachtbevestigingenOpPagina(ids, allesGeselecteerd) {
    setOpdrachtbevestigingenSelectie((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allesGeselecteerd ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  useEffect(() => {
    if (opdrachtbevestigingenSelectie.size === 0) setOpdrachtbevestigingenBevestigenTonen(false);
  }, [opdrachtbevestigingenSelectie]);

  async function verwijderGeselecteerdeOpdrachtbevestigingen() {
    if (opdrachtbevestigingenSelectie.size === 0) return;
    setOpdrachtbevestigingenVerwijderenBezig(true);
    try {
      const ids = [...opdrachtbevestigingenSelectie];
      await opdrachtbevestigingenVerwijderen(ids);
      setOpdrachtbevestigingenLijst((prev) => prev.filter((o) => !opdrachtbevestigingenSelectie.has(o.id)));
      if (huidigeOpdrachtbevestigingId && opdrachtbevestigingenSelectie.has(huidigeOpdrachtbevestigingId)) {
        setHuidigeOpdrachtbevestigingId(null);
        setOpdrachtbevestigingMaker({ naam: "", email: "" });
      }
      setOpdrachtbevestigingenSelectie(new Set());
      setOpdrachtbevestigingenBevestigenTonen(false);
      await laadOpdrachtbevestigingenLijst();
    } finally {
      setOpdrachtbevestigingenVerwijderenBezig(false);
    }
  }

  // Alle opdrachtbevestiging-inhoud die bij het opslaan/laden van één opdrachtbevestiging
  // hoort — inclusief de gedeelde klant/diensten/prijzen-selectie (zelfde velden als
  // huidigeOfferteSnapshot), plus het gekozen opdrachttype en de paragrafen.
  function huidigeOpdrachtbevestigingSnapshot() {
    const regelsPerKlant = {};
    gekozenKlanten.forEach((k) => {
      regelsPerKlant[k.id] = regelsVoorKlant(k.id);
    });
    return {
      gekozenKlanten,
      geselecteerd,
      klantVarianten,
      aangepastePrijzen,
      uitgeschakeldVoorKlant,
      // Alleen een algemene toelichting — eigen, losse tekst t.o.v. de offerte (zie
      // *OpdrachtbevestigingGeladen hierboven). Klantspecifiek, per-dienst en roadmap zijn
      // bewust NIET van toepassing op de opdrachtbevestiging.
      algemeneToelichting: algemeneToelichtingOpdrachtbevestiging,
      regelsPerKlant,
      // Bevriest de op dit moment geldende categorieën (id + naam, in de huidige volgorde) op
      // het document zelf — zie groepeerOpCategorie hierboven. Nodig omdat Teken.jsx en de
      // PDF-generatie geen toegang hebben tot de live, actuele categorieënlijst.
      categorieVolgorde: categorieen.map((c) => ({ id: c.id, naam: (c.naam || "").trim() || "Naamloze categorie" })),
      logo,
      afzender,
      algemeneVoorwaarden,
      namens: { naam: huidigeGebruiker?.naam || "", email: huidigeGebruiker?.email || "" },
      opdrachttypeId: gekozenOpdrachttypeId,
      opdrachttypeNaam: opdrachttypes.find((t) => t.id === gekozenOpdrachttypeId)?.naam || "",
      paragrafen: opdrachtbevestigingParagrafen,
      vanuitOfferteId: opdrachtbevestigingVanuitOfferteId,
      // Eigen inleidende tekst, los van afzender.inleiding (offerte) — zie toelichting bij
      // opdrachtbevestigingInleiding hierboven.
      inleiding: opdrachtbevestigingInleiding,
      // Aangepaste tekenlink-e-mailadressen (gedeeld met de offerte, zie huidigeOfferteSnapshot
      // hierboven) en de eigen extra cc voor opdrachtbevestiging-mails.
      mailAdressen,
      obMailCcExtra,
      // Vrijwillige dienst-teksten (zie opdrachtbevestigingDienstTeksten hierboven): de
      // aan/uit-status bewaren we per-record voor als deze opdrachtbevestiging weer geopend
      // wordt, en de daadwerkelijke, op dit moment geldende teksten bevriezen we hier ook nog
      // eens los — zodat een later gewijzigde of verwijderde standaardtekst niet met
      // terugwerkende kracht een al opgeslagen/verstuurde opdrachtbevestiging verandert
      // (zelfde principe als bij regelsPerKlant/roadmap hierboven).
      opdrachtbevestigingDienstTekstUit,
      dienstTeksten: dienstTekstenActief.map(({ dienst }) => ({
        id: dienst.id,
        naam: dienst.naam,
        tekst: opdrachtbevestigingDienstTeksten[dienst.id],
      })),
      // Herbevestiging/tariefswijziging van een eerdere opdrachtbevestiging (zie toelichting
      // bij herbevestigingVanId hierboven) — gebruikt bij ondertekenen om in Dataverse de
      // vorige rij te koppelen en diens nog openstaande tarieven af te sluiten.
      herbevestigingVanId,
      // Optionele ingangsdatum voor de tarieven (zie toelichting bij tariefIngangsdatum
      // hierboven) — leeg = ingangsdatum wordt de ondertekendatum.
      tariefIngangsdatum,
      // Optionele einddatum voor de tarieven (zie toelichting bij tariefEinddatum hierboven) —
      // leeg = geen vaste einddatum.
      tariefEinddatum,
    };
  }

  async function slaOpdrachtbevestigingOp() {
    if (gekozenKlanten.length === 0) return null;
    const id = huidigeOpdrachtbevestigingId || nieuwId("opdrachtbevestiging");
    setOpdrachtbevestigingOpslaanStatus("bezig");
    try {
      const snapshot = huidigeOpdrachtbevestigingSnapshot();
      const record = await opdrachtbevestigingOpslaan(id, {
        data: snapshot,
        klantNamen: gekozenKlanten.map((k) => k.naam),
        klantGroepen: [...new Set(gekozenKlanten.map((k) => k.segment).filter(Boolean))],
        opdrachttypeId: snapshot.opdrachttypeId,
        opdrachttypeNaam: snapshot.opdrachttypeNaam,
        gebruikerNaam: huidigeGebruiker?.naam || "Onbekend",
        gebruikerEmail: huidigeGebruiker?.email || "",
      });
      setHuidigeOpdrachtbevestigingId(id);
      setHuidigeOpdrachtbevestigingStatus(record?.status || OPDRACHTBEVESTIGING_STATUS_STANDAARD);
      setOpdrachtbevestigingMaker({ naam: record?.aangemaaktDoor || "", email: record?.aangemaaktDoorEmail || "" });
      setOpdrachtbevestigingOpslaanStatus("opgeslagen");
      return id;
    } catch (e) {
      setOpdrachtbevestigingOpslaanStatus("fout");
      return null;
    }
  }

  async function openOpdrachtbevestiging(id) {
    try {
      const record = await opdrachtbevestigingOphalen(id);
      const snap = record.data || {};
      setGekozenKlanten(snap.gekozenKlanten || []);
      setGeselecteerd(snap.geselecteerd || {});
      setKlantVarianten(snap.klantVarianten || {});
      setAangepastePrijzen(snap.aangepastePrijzen || {});
      setUitgeschakeldVoorKlant(snap.uitgeschakeldVoorKlant || {});
      setGekozenOpdrachttypeId(snap.opdrachttypeId || record.opdrachttypeId || null);
      setOpdrachtbevestigingParagrafen(snap.paragrafen || { verplicht: [], optioneel: [] });
      setOpdrachtbevestigingVanuitOfferteId(snap.vanuitOfferteId || null);
      // Eigen opdrachtbevestiging-tekst herstellen (los van de offerte-state, die blijft
      // ongemoeid staan). Klantspecifiek/per-dienst en roadmap gelden niet voor de
      // opdrachtbevestiging, dus die worden hier niet hersteld.
      setAlgemeneToelichtingOpdrachtbevestiging(snap.algemeneToelichting || "");
      setOpdrachtbevestigingInleiding(snap.inleiding || OPDRACHTBEVESTIGING_INLEIDING_DEFAULT);
      // Aangepaste tekenlink-e-mailadressen/cc herstellen — zie toelichting bij
      // huidigeOpdrachtbevestigingSnapshot hierboven.
      if (snap.mailAdressen) setMailAdressen(snap.mailAdressen);
      if (snap.obMailCcExtra) setObMailCcExtra(snap.obMailCcExtra);
      // Per-record aan/uit-status van de vrijwillige dienst-teksten herstellen (zie
      // toelichting bij huidigeOpdrachtbevestigingSnapshot hierboven).
      setOpdrachtbevestigingDienstTekstUit(snap.opdrachtbevestigingDienstTekstUit || {});
      setHerbevestigingVanId(snap.herbevestigingVanId || null);
      setTariefIngangsdatum(snap.tariefIngangsdatum || "");
      setTariefEinddatum(snap.tariefEinddatum || "");
      setHuidigeOpdrachtbevestigingId(id);
      setHuidigeOpdrachtbevestigingStatus(record.status || OPDRACHTBEVESTIGING_STATUS_STANDAARD);
      setOpdrachtbevestigingMaker({ naam: record.aangemaaktDoor || "", email: record.aangemaaktDoorEmail || "" });
      setOpdrachtbevestigingOpslaanStatus("idle");
      // Onafhankelijk van welke offerte er evt. nog open stond — een geopende
      // opdrachtbevestiging is een zelfstandig document.
      setHuidigeOfferteId(null);
      setOfferteMaker({ naam: "", email: "" });
      setStap("opdrachtbevestiging");
    } catch (e) {
      setOpdrachtbevestigingenLijstFout(true);
    }
  }

  // Kolomsleutels ("klantId::dienstId") uit een bron-object overnemen, maar alleen die van de
  // klant(en) die ook daadwerkelijk in dít document gekozen zijn — voorkomt dat overrides voor
  // een klant die niets met de gekoppelde opdrachtbevestiging te maken heeft, worden overschreven.
  function sleutelsVoorHuidigeKlanten(bron, klantIds) {
    const resultaat = {};
    Object.entries(bron || {}).forEach(([sleutel, waarde]) => {
      const klantId = sleutel.split("::")[0];
      if (klantIds.includes(klantId)) resultaat[sleutel] = waarde;
    });
    return resultaat;
  }

  // Leesbare naam voor een dienst-ID uit een oud document terugvinden via de bevroren
  // regelsPerKlant-snapshot — nodig omdat die dienst inmiddels uit de catalogus verwijderd
  // kan zijn (dan bestaat dienstenCatalogus.find(...) niet meer, maar de oude naam wel).
  function naamVoorVerdwenenDienst(snap, dienstId) {
    const regelsPerKlant = snap.regelsPerKlant || {};
    for (const regels of Object.values(regelsPerKlant)) {
      const gevonden = (regels || []).find((r) => r.id === dienstId);
      if (gevonden) return gevonden.naam;
    }
    return dienstId;
  }

  // Bij het kiezen van een herbevestiging/tariefswijziging (de kiezer op de Opdrachtbevestiging-
  // stap) worden ook meteen de diensten, aantallen/factoren, gekozen varianten en per-klant
  // uitschakelingen van dat gekoppelde document overgenomen — zo hoeft dat niet nogmaals
  // handmatig bij "Diensten kiezen" te gebeuren. Overneemt bewust NIET de bevroren
  // aangepastePrijzen van dat oude document: bij een herbevestiging/tariefswijziging gelden de
  // huidige catalogusprijzen, niet de prijzen van destijds. Diensten die inmiddels uit de
  // catalogus zijn verwijderd, worden overgeslagen (en apart gemeld) i.p.v. als "onzichtbare"
  // selectie te blijven hangen. Bestaande keuzes voor andere diensten/klanten in dít document
  // blijven staan — dit overschrijft alleen wat het gekoppelde document ook daadwerkelijk had.
  async function kiesHerbevestigingVan(id) {
    setHerbevestigingVanId(id || null);
    setHerbevestigingOvernemenFout(null);
    setHerbevestigingOvergenomenAantal(null);
    setHerbevestigingVerdwenenDiensten([]);
    if (!id) return;

    setHerbevestigingOvernemenBezig(true);
    try {
      const record = await opdrachtbevestigingOphalen(id);
      const snap = record.data || {};
      const klantIds = gekozenKlanten.map((k) => k.id);

      const bronGeselecteerd = snap.geselecteerd || {};
      const bestaandeEntries = {};
      const verdwenenNamen = [];
      Object.entries(bronGeselecteerd).forEach(([dienstId, waarde]) => {
        if (dienstenCatalogus.some((d) => d.id === dienstId)) {
          bestaandeEntries[dienstId] = waarde;
        } else {
          verdwenenNamen.push(naamVoorVerdwenenDienst(snap, dienstId));
        }
      });

      setGeselecteerd((prev) => ({ ...prev, ...bestaandeEntries }));
      setKlantVarianten((prev) => ({ ...prev, ...sleutelsVoorHuidigeKlanten(snap.klantVarianten, klantIds) }));
      setUitgeschakeldVoorKlant((prev) => ({ ...prev, ...sleutelsVoorHuidigeKlanten(snap.uitgeschakeldVoorKlant, klantIds) }));

      setHerbevestigingOvergenomenAantal(Object.keys(bestaandeEntries).length);
      setHerbevestigingVerdwenenDiensten(verdwenenNamen);
    } catch (e) {
      setHerbevestigingOvernemenFout("Overnemen van diensten is mislukt — kies eventueel opnieuw, of vink de diensten handmatig aan bij \"Diensten kiezen\".");
    } finally {
      setHerbevestigingOvernemenBezig(false);
    }
  }

  async function toggleObLogboek(id) {
    if (obLogboekOpenId === id) {
      setObLogboekOpenId(null);
      setObLogboekRecord(null);
      return;
    }
    setObLogboekOpenId(id);
    setObLogboekRecord(null);
    setObLogboekBezig(true);
    try {
      const record = await opdrachtbevestigingOphalen(id);
      setObLogboekRecord(record);
    } catch (e) {
      setObLogboekRecord({ fout: true });
    } finally {
      setObLogboekBezig(false);
    }
  }

  async function wijzigOpdrachtbevestigingStatus(id, nieuweStatus) {
    const vorige = opdrachtbevestigingenLijst;
    setOpdrachtbevestigingenLijst((prev) => prev.map((o) => (o.id === id ? { ...o, status: nieuweStatus } : o)));
    setOpdrachtbevestigingStatusBezigId(id);
    try {
      await opdrachtbevestigingOpslaan(id, {
        status: nieuweStatus,
        gebruikerNaam: huidigeGebruiker?.naam || "Onbekend",
      });
      await laadOpdrachtbevestigingenLijst();
    } catch (e) {
      setOpdrachtbevestigingenLijst(vorige);
    } finally {
      setOpdrachtbevestigingStatusBezigId(null);
    }
  }

  // Reset zowel de offerte- als de opdrachtbevestiging-koppeling en de gedeelde klant/
  // diensten/prijzen-selectie — gebruikt door zowel "Nieuwe offerte" als "Nieuwe
  // opdrachtbevestiging" (beide beginnen bij dezelfde lege Klant-stap).
  function nieuweKlantprijsSelectie() {
    setGekozenKlanten([]);
    setGeselecteerd({});
    setKlantVarianten({});
    setAangepastePrijzen({});
    setUitgeschakeldVoorKlant({});
    setAlgemeneToelichting("");
    setBijlageToelichtingen({});
    setKlantToelichtingen({});
    setRoadmapToevoegen(false);
    setHuidigeOfferteId(null);
    setOfferteMaker({ naam: "", email: "" });
    setHuidigeOfferteStatus(OFFERTE_STATUS_STANDAARD);
    setOfferteOpslaanStatus("idle");
    setOfferteVraagStatusTonen(false);
    setHuidigeOpdrachtbevestigingId(null);
    setOpdrachtbevestigingMaker({ naam: "", email: "" });
    setHuidigeOpdrachtbevestigingStatus(OPDRACHTBEVESTIGING_STATUS_STANDAARD);
    setOpdrachtbevestigingOpslaanStatus("idle");
    setGekozenOpdrachttypeId(null);
    setOpdrachtbevestigingParagrafen({ verplicht: [], optioneel: [] });
    setOpdrachtbevestigingVanuitOfferteId(null);
    setOpdrachtbevestigingDienstTekstUit({});
    setHerbevestigingVanId(null);
    setTariefIngangsdatum("");
    setTariefEinddatum("");
  }

  function nieuweOpdrachtbevestiging() {
    nieuweKlantprijsSelectie();
    setStap("klant");
  }

  // Opdrachttype kiezen/wisselen op de Opdrachtbevestiging-stap: de verplichte paragrafen
  // worden vervangen door de standaardset van het nieuwe type; al ingevulde optionele
  // paragrafen blijven staan. Bij het allereerste type-kiezen (nog geen optionele paragrafen)
  // worden de standaard-optionele paragrafen van dat type als startpunt overgenomen.
  function kiesOpdrachttype(typeId) {
    setGekozenOpdrachttypeId(typeId);
    const standaard = paragrafenVoorType(typeId);
    setOpdrachtbevestigingParagrafen((prev) => ({
      verplicht: (standaard.verplicht || []).map((p) => ({ ...p })),
      optioneel: prev.optioneel && prev.optioneel.length > 0 ? prev.optioneel : (standaard.optioneel || []).map((p) => ({ ...p })),
    }));
  }

  function voegRecordParagraafToe() {
    setOpdrachtbevestigingParagrafen((prev) => ({
      ...prev,
      optioneel: [...(prev.optioneel || []), { id: nieuwId("par"), titel: "Nieuwe paragraaf", tekst: "" }],
    }));
  }
  function verwijderRecordParagraaf(paragraafId) {
    setOpdrachtbevestigingParagrafen((prev) => ({
      ...prev,
      optioneel: (prev.optioneel || []).filter((p) => p.id !== paragraafId),
    }));
  }
  function bijwerkRecordParagraaf(paragraafId, veld, waarde) {
    setOpdrachtbevestigingParagrafen((prev) => ({
      ...prev,
      optioneel: (prev.optioneel || []).map((p) => (p.id === paragraafId ? { ...p, [veld]: waarde } : p)),
    }));
  }

  async function zorgVoorOpdrachtbevestigingId() {
    if (huidigeOpdrachtbevestigingId) return huidigeOpdrachtbevestigingId;
    return await slaOpdrachtbevestigingOp();
  }

  async function kopieerOpdrachtbevestigingTekenLink() {
    const id = await zorgVoorOpdrachtbevestigingId();
    if (!id) return;
    const link = `${window.location.origin}/tekenen/${id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      window.prompt("Kopieer deze link handmatig:", link);
    }
    setTekenLinkGekopieerdOpdrachtbevestiging(true);
    setTimeout(() => setTekenLinkGekopieerdOpdrachtbevestiging(false), 3000);
  }

  // Zelfde opzet als afdrukken() voor de offerte: dezelfde server-PDF (/api/teken/{id}?
  // formaat=pdf, generiek gemaakt voor beide documentsoorten) in een nieuw tabblad openen.
  async function afdrukkenOpdrachtbevestiging() {
    const id = await slaOpdrachtbevestigingOp();
    if (!id) {
      window.alert("Opslaan van de opdrachtbevestiging is niet gelukt, dus er kan geen PDF worden gemaakt. Probeer het nogmaals.");
      return;
    }
    setPdfBezigOpdrachtbevestiging(true);
    try {
      const res = await fetch(`/api/teken/${encodeURIComponent(id)}?formaat=pdf`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      window.alert("PDF maken is niet gelukt. Probeer het nogmaals.");
    } finally {
      setPdfBezigOpdrachtbevestiging(false);
    }
  }

  // Zelfde opzet als bepaalOfferteMaker() hierboven, maar voor opdrachtbevestiging.
  function bepaalOpdrachtbevestigingMaker() {
    if (opdrachtbevestigingMaker.email) return opdrachtbevestigingMaker;
    return { naam: huidigeGebruiker?.naam || "", email: huidigeGebruiker?.email || "" };
  }

  // Zelfde opzet als openMailConcept() hierboven, maar met de eigen mailtekst/onderwerp voor
  // opdrachtbevestiging (een bevestiging om te ondertekenen, geen offertevoorstel).
  function openMailConceptOpdrachtbevestiging(sleutel, klanten) {
    const groep = Array.isArray(klanten) ? klanten : [klanten];
    const eerste = groep[0];
    const bedrijfsnamen = groep.map((k) => k.naam).join(" en ");
    const onderwerp = `Opdrachtbevestiging ${afzender.bedrijf}`;
    const tekst = standaardMailtekstOpdrachtbevestiging
      .replaceAll("{contact}", voornaam(eerste.contact) || bedrijfsnamen || "")
      .replaceAll("{ondertekenaar}", huidigeGebruiker?.naam || "");
    setObMailConcepten((prev) => ({ ...prev, [sleutel]: { onderwerp, tekst } }));
    setObMailStatus((prev) => ({ ...prev, [sleutel]: undefined }));
    setObMailConceptOpenSleutel(sleutel);
  }

  // Zelfde opzet als verstuurMailConcept() hierboven, met twee verschillen: het endpoint
  // krijgt documentId + de generieke PDF-bijlage (offerte of opdrachtbevestiging, bepaald door
  // record.soort op de server), en bij een geslaagde verzending wordt de status van de
  // opdrachtbevestiging automatisch op "Verzonden" gezet — in tegenstelling tot offerte (waar
  // dat al bij het opslaan/afdrukken gebeurt) staat een opdrachtbevestiging tot dit moment op
  // "In bewerking".
  async function verstuurMailConceptOpdrachtbevestiging(sleutel, klanten) {
    const groep = Array.isArray(klanten) ? klanten : [klanten];
    const eerste = groep[0];
    const concept = obMailConcepten[sleutel];
    if (!concept) return;

    const email = mailAdressen[eerste.id] ?? eerste.email ?? "";
    if (!email.trim()) {
      setObMailStatus((prev) => ({ ...prev, [sleutel]: { status: "fout", bericht: "Vul eerst een e-mailadres in." } }));
      return;
    }

    const id = await zorgVoorOpdrachtbevestigingId();
    if (!id) return;
    const link = `${window.location.origin}/tekenen/${id}`;
    const volledigeTekst = concept.tekst.replaceAll("{link}", link);

    const ccLijst = [];
    const alToegevoegd = new Set([email.trim().toLowerCase()]);
    const makerEmail = bepaalOpdrachtbevestigingMaker().email.trim();
    if (makerEmail && !alToegevoegd.has(makerEmail.toLowerCase())) {
      ccLijst.push(makerEmail);
      alToegevoegd.add(makerEmail.toLowerCase());
    }
    const extraCc = (obMailCcExtra[sleutel] || "").trim();
    if (extraCc && !alToegevoegd.has(extraCc.toLowerCase())) {
      ccLijst.push(extraCc);
      alToegevoegd.add(extraCc.toLowerCase());
    }

    setObMailStatus((prev) => ({ ...prev, [sleutel]: { status: "bezig" } }));
    try {
      const res = await fetch("/api/offertes-verstuur-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naar: email.trim(),
          cc: ccLijst,
          onderwerp: concept.onderwerp,
          tekst: volledigeTekst,
          documentId: id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setObMailStatus((prev) => ({ ...prev, [sleutel]: { status: "verzonden", van: data.van, pdfBijgevoegd: data.pdfBijgevoegd } }));
      setObMailConceptOpenSleutel(null);
      try {
        await opdrachtbevestigingOpslaan(id, { status: "verzonden", gebruikerNaam: huidigeGebruiker?.naam || "Onbekend" });
        setHuidigeOpdrachtbevestigingStatus("verzonden");
      } catch (e) {
        // statuswijziging mislukt; de mail is al wel verstuurd, status is later handmatig te
        // corrigeren via het overzicht
      }
    } catch (e) {
      setObMailStatus((prev) => ({ ...prev, [sleutel]: { status: "fout", bericht: e.message } }));
    }
  }

  // Unieke waarden voor de filter-dropdowns van het opdrachtbevestigingen-overzicht.
  const opdrachtbevestigingenKlantgroepen = useMemo(() => {
    const set = new Set();
    opdrachtbevestigingenLijst.forEach((o) => (o.klantGroepen || []).forEach((g) => g && set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b, "nl"));
  }, [opdrachtbevestigingenLijst]);

  const gefilterdeOpdrachtbevestigingen = useMemo(() => {
    const q = opdrachtbevestigingenZoekterm.trim().toLowerCase();
    return opdrachtbevestigingenLijst.filter((o) => {
      if (opdrachtbevestigingenFilterKlantgroep && !(o.klantGroepen || []).includes(opdrachtbevestigingenFilterKlantgroep)) {
        return false;
      }
      if (opdrachtbevestigingenFilterOpdrachttype && o.opdrachttypeId !== opdrachtbevestigingenFilterOpdrachttype) {
        return false;
      }
      if (opdrachtbevestigingenFilterStatus && (o.status || OPDRACHTBEVESTIGING_STATUS_STANDAARD) !== opdrachtbevestigingenFilterStatus) {
        return false;
      }
      if (!q) return true;
      const doorzoekbaar = [
        ...(o.klantNamen || []),
        ...(o.klantGroepen || []),
        o.opdrachttypeNaam || "",
        o.aangemaaktDoor || "",
        o.gewijzigdDoor || "",
        offerteStatusInfo(o.status).label,
      ]
        .join(" ")
        .toLowerCase();
      return doorzoekbaar.includes(q);
    });
  }, [
    opdrachtbevestigingenLijst,
    opdrachtbevestigingenZoekterm,
    opdrachtbevestigingenFilterKlantgroep,
    opdrachtbevestigingenFilterOpdrachttype,
    opdrachtbevestigingenFilterStatus,
  ]);

  useEffect(() => {
    setOpdrachtbevestigingenPagina(1);
  }, [
    opdrachtbevestigingenZoekterm,
    opdrachtbevestigingenFilterKlantgroep,
    opdrachtbevestigingenFilterOpdrachttype,
    opdrachtbevestigingenFilterStatus,
    opdrachtbevestigingenLijst,
    opdrachtbevestigingenPaginaGrootte,
  ]);

  const opdrachtbevestigingenTotaalPaginas =
    opdrachtbevestigingenPaginaGrootte === "alle"
      ? 1
      : Math.max(1, Math.ceil(gefilterdeOpdrachtbevestigingen.length / opdrachtbevestigingenPaginaGrootte));
  const opdrachtbevestigingenPaginaVeilig = Math.min(opdrachtbevestigingenPagina, opdrachtbevestigingenTotaalPaginas);
  const gepagineerdeOpdrachtbevestigingen =
    opdrachtbevestigingenPaginaGrootte === "alle"
      ? gefilterdeOpdrachtbevestigingen
      : gefilterdeOpdrachtbevestigingen.slice(
          (opdrachtbevestigingenPaginaVeilig - 1) * opdrachtbevestigingenPaginaGrootte,
          opdrachtbevestigingenPaginaVeilig * opdrachtbevestigingenPaginaGrootte
        );

  async function laadOffertesLijst() {
    setOffertesLijstBezig(true);
    setOffertesLijstFout(false);
    try {
      const data = await offertesLijstOphalen();
      setOffertesLijst(data);
      setOffertesSelectie(new Set());
    } catch (e) {
      setOffertesLijstFout(true);
    } finally {
      setOffertesLijstBezig(false);
    }
  }

  function toggleOfferteSelectie(id) {
    setOffertesSelectie((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAlleOffertesOpPagina(ids, allesGeselecteerd) {
    setOffertesSelectie((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allesGeselecteerd ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  useEffect(() => {
    if (offertesSelectie.size === 0) setOffertesBevestigenTonen(false);
  }, [offertesSelectie]);

  async function verwijderGeselecteerdeOffertes() {
    if (offertesSelectie.size === 0) return;

    setOffertesVerwijderenBezig(true);
    try {
      const ids = [...offertesSelectie];
      await offertesVerwijderen(ids);
      // Verwijderde offerte(n) meteen uit het huidige overzicht halen, ook als een
      // vernieuwing van de lijst nog niet is uitgevoerd.
      setOffertesLijst((prev) => prev.filter((o) => !offertesSelectie.has(o.id)));
      // Wordt de op dit moment geopende offerte verwijderd? Dan de koppeling loslaten
      // zodat een volgende opslag niet per ongeluk die verwijderde offerte herschept.
      if (huidigeOfferteId && offertesSelectie.has(huidigeOfferteId)) {
        setHuidigeOfferteId(null);
        setOfferteMaker({ naam: "", email: "" });
      }
      setOffertesSelectie(new Set());
      setOffertesBevestigenTonen(false);
      await laadOffertesLijst();
    } finally {
      setOffertesVerwijderenBezig(false);
    }
  }

  // Alle offerte-inhoud die bij het opslaan/laden van één offerte hoort. Instellingen die
  // los beheerd worden (afzender, dienstencatalogus, standaardteksten, voorwaarden, roadmap-
  // sjabloon zelf) horen hier bewust niet bij — dat blijft gedeelde, doorlopende configuratie.
  function huidigeOfferteSnapshot() {
    // regelsPerKlant: de al berekende diensten/prijzen/subtotalen per klant, losgemaakt van de
    // (beveiligde) catalogus zelf. Nodig omdat de publieke tekenpagina (zonder Microsoft-login)
    // geen toegang heeft tot de catalogus-instellingen — en dit bewaart bovendien exact wat er
    // is aangeboden op het moment van versturen, ook als de catalogusprijzen later wijzigen.
    const regelsPerKlant = {};
    gekozenKlanten.forEach((k) => {
      regelsPerKlant[k.id] = regelsVoorKlant(k.id);
    });
    return {
      gekozenKlanten,
      geselecteerd,
      klantVarianten,
      aangepastePrijzen,
      uitgeschakeldVoorKlant,
      algemeneToelichting,
      bijlageToelichtingen,
      klantToelichtingen,
      roadmapToevoegen,
      regelsPerKlant,
      // Bevriest de op dit moment geldende categorieën (id + naam, in de huidige volgorde) op
      // het document zelf — zie groepeerOpCategorie hierboven. Nodig omdat Teken.jsx en de
      // PDF-generatie geen toegang hebben tot de live, actuele categorieënlijst.
      categorieVolgorde: categorieen.map((c) => ({ id: c.id, naam: (c.naam || "").trim() || "Naamloze categorie" })),
      // Onderstaande velden zijn nodig zodat de publieke tekenpagina (die geen toegang heeft
      // tot instellingen zoals logo/afzender/voorwaarden) toch de complete, echte offerte kan
      // tonen — inclusief branding — in plaats van een kale samenvatting.
      logo,
      afzender,
      algemeneVoorwaarden,
      roadmap: roadmapToevoegen ? roadmap : null,
      namens: { naam: huidigeGebruiker?.naam || "", email: huidigeGebruiker?.email || "" },
      // Aangepaste tekenlink-e-mailadressen en extra cc — anders ging een handmatige correctie
      // hiervan verloren zodra je wegnavigeert vóór het versturen (mailAdressen is gedeelde
      // state met de opdrachtbevestiging, zie huidigeOpdrachtbevestigingSnapshot hieronder).
      mailAdressen,
      mailCcExtra,
    };
  }

  async function slaOfferteOp() {
    if (gekozenKlanten.length === 0) return null;
    const id = huidigeOfferteId || nieuwId("offerte");
    setOfferteOpslaanStatus("bezig");
    try {
      const record = await offerteOpslaan(id, {
        data: huidigeOfferteSnapshot(),
        klantNamen: gekozenKlanten.map((k) => k.naam),
        klantGroepen: [...new Set(gekozenKlanten.map((k) => k.segment).filter(Boolean))],
        gebruikerNaam: huidigeGebruiker?.naam || "Onbekend",
        gebruikerEmail: huidigeGebruiker?.email || "",
      });
      setHuidigeOfferteId(id);
      setHuidigeOfferteStatus(record?.status || OFFERTE_STATUS_STANDAARD);
      setOfferteMaker({ naam: record?.aangemaaktDoor || "", email: record?.aangemaaktDoorEmail || "" });
      setOfferteOpslaanStatus("opgeslagen");
      return id;
    } catch (e) {
      setOfferteOpslaanStatus("fout");
      return null;
    }
  }

  async function openOfferte(id) {
    try {
      const record = await offerteOphalen(id);
      const snap = record.data || {};
      setGekozenKlanten(snap.gekozenKlanten || []);
      setGeselecteerd(snap.geselecteerd || {});
      setKlantVarianten(snap.klantVarianten || {});
      setAangepastePrijzen(snap.aangepastePrijzen || {});
      setUitgeschakeldVoorKlant(snap.uitgeschakeldVoorKlant || {});
      setAlgemeneToelichting(snap.algemeneToelichting || "");
      setBijlageToelichtingen(snap.bijlageToelichtingen || {});
      setKlantToelichtingen(snap.klantToelichtingen || {});
      setRoadmapToevoegen(!!snap.roadmapToevoegen);
      // Aangepaste tekenlink-e-mailadressen/cc herstellen — zie toelichting bij
      // huidigeOfferteSnapshot hierboven. Alleen overschrijven als er iets bewaard is, zodat
      // een eventueel al ingetypte correctie in dit tabblad niet verloren gaat.
      if (snap.mailAdressen) setMailAdressen(snap.mailAdressen);
      if (snap.mailCcExtra) setMailCcExtra(snap.mailCcExtra);
      setHuidigeOfferteId(id);
      setHuidigeOfferteStatus(record.status || OFFERTE_STATUS_STANDAARD);
      setOfferteMaker({ naam: record.aangemaaktDoor || "", email: record.aangemaaktDoorEmail || "" });
      setOfferteOpslaanStatus("idle");
      setOfferteVraagStatusTonen(false);
      // Een geopende offerte is een zelfstandig document — laat een eventueel nog open
      // staande opdrachtbevestiging los, net zoals openOpdrachtbevestiging andersom doet.
      setHuidigeOpdrachtbevestigingId(null);
      setOpdrachtbevestigingMaker({ naam: "", email: "" });
      setStap("offerte");
    } catch (e) {
      setOffertesLijstFout(true);
    }
  }

  async function toggleLogboek(id) {
    if (logboekOpenId === id) {
      setLogboekOpenId(null);
      setLogboekRecord(null);
      return;
    }
    setLogboekOpenId(id);
    setLogboekRecord(null);
    setLogboekBezig(true);
    try {
      const record = await offerteOphalen(id);
      setLogboekRecord(record);
    } catch (e) {
      setLogboekRecord({ fout: true });
    } finally {
      setLogboekBezig(false);
    }
  }


  async function wijzigOfferteStatus(id, nieuweStatus) {
    const vorige = offertesLijst;
    // Optimistisch bijwerken: meteen zichtbaar in het overzicht, ook al is de opslag
    // nog bezig — voelt direct aan. Mislukt de opslag, dan zetten we 'm terug.
    setOffertesLijst((prev) => prev.map((o) => (o.id === id ? { ...o, status: nieuweStatus } : o)));
    setOfferteStatusBezigId(id);
    try {
      await offerteOpslaan(id, {
        status: nieuweStatus,
        gebruikerNaam: huidigeGebruiker?.naam || "Onbekend",
      });
      await laadOffertesLijst();
    } catch (e) {
      setOffertesLijst(vorige);
    } finally {
      setOfferteStatusBezigId(null);
    }
  }


  function nieuweOfferte() {
    // Zie nieuweKlantprijsSelectie() hierboven — reset ook de eventueel gekoppelde
    // opdrachtbevestiging, zodat een "Nieuwe offerte" niet per ongeluk een oude,
    // ongerelateerde opdrachtbevestiging blijft overschrijven bij een volgende opslag.
    nieuweKlantprijsSelectie();
    setStap("klant");
  }

  // Unieke waarden voor de filter-dropdowns, afgeleid uit de geladen offertes.
  const offertesKlantgroepen = useMemo(() => {
    const set = new Set();
    offertesLijst.forEach((o) => (o.klantGroepen || []).forEach((g) => g && set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b, "nl"));
  }, [offertesLijst]);

  const offertesGebruikers = useMemo(() => {
    const set = new Set();
    offertesLijst.forEach((o) => {
      if (o.aangemaaktDoor) set.add(o.aangemaaktDoor);
      if (o.gewijzigdDoor) set.add(o.gewijzigdDoor);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "nl"));
  }, [offertesLijst]);

  // Zoeken (klant, klantgroep, opgemaakt/gewijzigd door) + kolomfilters (klantgroep,
  // opgemaakt door) samen toegepast op het overzicht.
  const gefilterdeOffertes = useMemo(() => {
    const q = offertesZoekterm.trim().toLowerCase();
    return offertesLijst.filter((o) => {
      if (offertesFilterKlantgroep && !(o.klantGroepen || []).includes(offertesFilterKlantgroep)) {
        return false;
      }
      if (
        offertesFilterGebruiker &&
        o.aangemaaktDoor !== offertesFilterGebruiker &&
        o.gewijzigdDoor !== offertesFilterGebruiker
      ) {
        return false;
      }
      if (offertesFilterStatus && (o.status || OFFERTE_STATUS_STANDAARD) !== offertesFilterStatus) {
        return false;
      }
      if (!q) return true;
      const doorzoekbaar = [
        ...(o.klantNamen || []),
        ...(o.klantGroepen || []),
        o.aangemaaktDoor || "",
        o.gewijzigdDoor || "",
        offerteStatusInfo(o.status).label,
      ]
        .join(" ")
        .toLowerCase();
      return doorzoekbaar.includes(q);
    });
  }, [offertesLijst, offertesZoekterm, offertesFilterKlantgroep, offertesFilterGebruiker, offertesFilterStatus]);

  // Bij elke wijziging in zoekterm/filters/paginagrootte (of een nieuw geladen lijst) weer bij pagina 1 beginnen.
  useEffect(() => {
    setOffertesPagina(1);
  }, [offertesZoekterm, offertesFilterKlantgroep, offertesFilterGebruiker, offertesFilterStatus, offertesLijst, offertesPaginaGrootte]);

  const offertesTotaalPaginas =
    offertesPaginaGrootte === "alle" ? 1 : Math.max(1, Math.ceil(gefilterdeOffertes.length / offertesPaginaGrootte));
  const offertesPaginaVeilig = Math.min(offertesPagina, offertesTotaalPaginas);
  const gepagineerdeOffertes =
    offertesPaginaGrootte === "alle"
      ? gefilterdeOffertes
      : gefilterdeOffertes.slice(
          (offertesPaginaVeilig - 1) * offertesPaginaGrootte,
          offertesPaginaVeilig * offertesPaginaGrootte
        );

  // geselecteerd: { [dienstId]: { aantal } }
  const [geselecteerd, setGeselecteerd] = useState({});
  // klantVarianten: "klantId::dienstId" -> gekozen variantId (per klant instelbaar, bijv. Klein/Middel/Groot)
  const [klantVarianten, setKlantVarianten] = useState({});
  // aangepastePrijzen: "klantId::dienstId" -> handmatige prijs (string of number)
  const [aangepastePrijzen, setAangepastePrijzen] = useState({});
  // uitgeschakeldVoorKlant: "klantId::dienstId" -> true als deze dienst voor déze klant uitstaat,
  // terwijl hij voor andere klanten wel meegenomen wordt
  const [uitgeschakeldVoorKlant, setUitgeschakeldVoorKlant] = useState({});
  // bijlageToelichtingen: "dienstId" -> vrije tekst voor de gezamenlijke bijlage
  const [bijlageToelichtingen, setBijlageToelichtingen] = useState({});
  // algemeneToelichting: vrije tekst die los van een specifieke dienst in de bijlage komt
  const [algemeneToelichting, setAlgemeneToelichting] = useState("");
  // klantToelichtingen: "klantId" -> klantspecifieke tekst, komt op de offerte van díe klant
  const [klantToelichtingen, setKlantToelichtingen] = useState({});
  const [bijlageGeladen, setBijlageGeladen] = useState(false);

  // Bijlage-teksten (algemeen, per dienst, per klant) laden uit persistente opslag.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const [algemeenWaarde, perDienstWaarde, perKlantWaarde] = await Promise.all([
          opslagGet("bijlage-algemeen"),
          opslagGet("bijlage-per-dienst"),
          opslagGet("bijlage-per-klant"),
        ]);
        if (actief) {
          if (algemeenWaarde) setAlgemeneToelichting(algemeenWaarde);
          if (perDienstWaarde) setBijlageToelichtingen(JSON.parse(perDienstWaarde));
          if (perKlantWaarde) setKlantToelichtingen(JSON.parse(perKlantWaarde));
        }
      } catch (e) {
        // nog niets opgeslagen, of opslag niet beschikbaar
      }
      if (actief) setBijlageGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Bijlage-teksten bewaren zodra er iets in wijzigt (pas nadat de eerste keer geladen is).
  useEffect(() => {
    if (!bijlageGeladen) return;
    opslagSetDebounced("bijlage-algemeen", algemeneToelichting);
  }, [algemeneToelichting, bijlageGeladen]);

  useEffect(() => {
    if (!bijlageGeladen) return;
    opslagSetDebounced("bijlage-per-dienst", JSON.stringify(bijlageToelichtingen));
  }, [bijlageToelichtingen, bijlageGeladen]);

  useEffect(() => {
    if (!bijlageGeladen) return;
    opslagSetDebounced("bijlage-per-klant", JSON.stringify(klantToelichtingen));
  }, [klantToelichtingen, bijlageGeladen]);

  // Algemene toelichting voor opdrachtbevestiging: eigen, losse tekst — wat je bij offerte
  // intypt mag niet in de opdrachtbevestiging verschijnen (en andersom). Staat gewoon onder
  // de offerte-versie op de stap Bijlage, net als bij de inleidende tekst hiervoor.
  // Klantspecifiek/per-dienst en de roadmap zijn bewust NIET beschikbaar voor de
  // opdrachtbevestiging — alleen deze algemene toelichting.
  const [algemeneToelichtingOpdrachtbevestiging, setAlgemeneToelichtingOpdrachtbevestiging] = useState("");
  const [bijlageOpdrachtbevestigingGeladen, setBijlageOpdrachtbevestigingGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const algemeenWaarde = await opslagGet("bijlage-algemeen-opdrachtbevestiging");
        if (actief && algemeenWaarde) setAlgemeneToelichtingOpdrachtbevestiging(algemeenWaarde);
      } catch (e) {
        // nog niets opgeslagen, of opslag niet beschikbaar
      }
      if (actief) setBijlageOpdrachtbevestigingGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!bijlageOpdrachtbevestigingGeladen) return;
    opslagSetDebounced("bijlage-algemeen-opdrachtbevestiging", algemeneToelichtingOpdrachtbevestiging);
  }, [algemeneToelichtingOpdrachtbevestiging, bijlageOpdrachtbevestigingGeladen]);

  // standaardTeksten: herbruikbare standaardteksten, net als de dienstencatalogus zelf te beheren
  const [standaardTeksten, setStandaardTeksten] = useState({
    algemeen: "",
    perDienst: {}, // { [dienstId]: tekst }
  });
  const [tekstenGeladen, setTekstenGeladen] = useState(false);

  const STANDAARD_MAILTEKST_DEFAULT =
    "Beste {contact},\n\n" +
    "Hierbij ontvangt u onze offerte. U kunt deze inzien en digitaal ondertekenen via onderstaande link:\n" +
    "{link}\n\n" +
    "Met vriendelijke groet,\n" +
    "{ondertekenaar}";
  const [standaardMailtekst, setStandaardMailtekst] = useState(STANDAARD_MAILTEKST_DEFAULT);
  const [mailtekstGeladen, setMailtekstGeladen] = useState(false);

  // Standaard mailtekst laden uit persistente opslag.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("mailtekst");
        if (actief && waarde) {
          setStandaardMailtekst(waarde);
        }
      } catch (e) {
        // nog niets opgeslagen, standaardtekst blijft staan
      } finally {
        if (actief) setMailtekstGeladen(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Standaard mailtekst bewaren zodra 'ie wijzigt (pas nadat de eerste keer geladen is).
  useEffect(() => {
    if (!mailtekstGeladen) return;
    opslagSetDebounced("mailtekst", standaardMailtekst);
  }, [standaardMailtekst, mailtekstGeladen]);

  // Standaard mailtekst voor opdrachtbevestiging — eigen tekst/instelling, los van offerte's
  // mailtekst hierboven (andere insteek: een bevestiging om te ondertekenen, geen voorstel).
  const STANDAARD_MAILTEKST_OB_DEFAULT =
    "Beste {contact},\n\n" +
    "Hierbij ontvangt u onze opdrachtbevestiging. U kunt deze inzien en digitaal ondertekenen via onderstaande link:\n" +
    "{link}\n\n" +
    "Met vriendelijke groet,\n" +
    "{ondertekenaar}";
  const [standaardMailtekstOpdrachtbevestiging, setStandaardMailtekstOpdrachtbevestiging] = useState(STANDAARD_MAILTEKST_OB_DEFAULT);
  const [mailtekstOpdrachtbevestigingGeladen, setMailtekstOpdrachtbevestigingGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("mailtekst-opdrachtbevestiging");
        if (actief && waarde) {
          setStandaardMailtekstOpdrachtbevestiging(waarde);
        }
      } catch (e) {
        // nog niets opgeslagen, standaardtekst blijft staan
      } finally {
        if (actief) setMailtekstOpdrachtbevestigingGeladen(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!mailtekstOpdrachtbevestigingGeladen) return;
    opslagSetDebounced("mailtekst-opdrachtbevestiging", standaardMailtekstOpdrachtbevestiging);
  }, [standaardMailtekstOpdrachtbevestiging, mailtekstOpdrachtbevestigingGeladen]);

  // Power Automate-webhook: optionele URL die de server (api/teken) met een POST aanroept
  // zodra een klant een offerte accepteert. Leeg = uitgeschakeld, geen extra actie.
  const [webhookAcceptatie, setWebhookAcceptatie] = useState("");
  const [webhookGeladen, setWebhookGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("webhook-acceptatie");
        if (actief && waarde) setWebhookAcceptatie(waarde);
      } catch (e) {
        // nog geen webhook ingesteld
      } finally {
        if (actief) setWebhookGeladen(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!webhookGeladen) return;
    opslagSetDebounced("webhook-acceptatie", webhookAcceptatie);
  }, [webhookAcceptatie, webhookGeladen]);

  // algemeneVoorwaarden: los te beheren, verschijnt als klikbare link op elke offerte
  const [algemeneVoorwaarden, setAlgemeneVoorwaarden] = useState({
    titel: "Algemene Voorwaarden",
    url: "https://activaa.nl/wp-content/uploads/2022/03/Algemene-Voorwaarden-Nederland-2022.pdf",
  });
  const [voorwaardenGeladen, setVoorwaardenGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("algemenevoorwaarden");
        if (actief && waarde) {
          const geparsed = JSON.parse(waarde);
          // Alleen titel en url overnemen — een eventueel oud 'tekst'-veld (uit een eerdere
          // versie van de tool) wordt hiermee genegeerd en bij de volgende opslag opgeschoond.
          setAlgemeneVoorwaarden((prev) => ({
            titel: geparsed.titel || prev.titel,
            url: geparsed.url ?? prev.url,
          }));
        }
      } catch (e) {
        // nog geen eigen voorwaarden opgeslagen — dan blijft de standaardtekst staan
      }
      if (actief) setVoorwaardenGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!voorwaardenGeladen) return;
    opslagSetDebounced("algemenevoorwaarden", JSON.stringify(algemeneVoorwaarden));
  }, [algemeneVoorwaarden, voorwaardenGeladen]);

  // roadmap: beheerbare, in Azure opgeslagen roadmap (net als de voorwaarden).
  const [roadmap, setRoadmap] = useState(STANDAARD_ROADMAP);
  const [roadmapGeladen, setRoadmapGeladen] = useState(false);
  // roadmapToevoegen: per-offerte aan/uit-schakelaar, geen bewaarde instelling maar een keuze per keer.
  const [roadmapToevoegen, setRoadmapToevoegen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("roadmap");
        if (actief && waarde) {
          setRoadmap(JSON.parse(waarde));
        }
      } catch (e) {
        // nog geen eigen roadmap opgeslagen — dan blijft de standaardroadmap staan
      }
      if (actief) setRoadmapGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!roadmapGeladen) return;
    opslagSetDebounced("roadmap", JSON.stringify(roadmap));
  }, [roadmap, roadmapGeladen]);

  function voegFaseToe() {
    setRoadmap((prev) => ({
      ...prev,
      fases: [
        ...prev.fases,
        {
          id: nieuwId("fase"),
          markering: "•",
          label: "NIEUWE FASE",
          titel: "Titel van deze fase",
          puntenTekst: "",
          resultaatLabel: "RESULTAAT",
          resultaatTekst: "",
        },
      ],
    }));
  }
  function verwijderFase(id) {
    setRoadmap((prev) => ({ ...prev, fases: prev.fases.filter((f) => f.id !== id) }));
  }
  function bijwerkFase(id, veld, waarde) {
    setRoadmap((prev) => ({
      ...prev,
      fases: prev.fases.map((f) => (f.id === id ? { ...f, [veld]: waarde } : f)),
    }));
  }

  // Dienstencatalogus laden uit persistente opslag (valt terug op de ingebouwde standaardlijst).
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("dienstencatalogus");
        if (actief && waarde) {
          setDienstenCatalogus(JSON.parse(waarde));
        }
      } catch (e) {
        // nog niets opgeslagen, of opslag niet beschikbaar — dan blijft de standaardcatalogus staan
      }
      if (actief) setCatalogusGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Dienstencatalogus bewaren zodra er iets in wijzigt (pas nadat de eerste keer geladen is).
  useEffect(() => {
    if (!catalogusGeladen) return;
    opslagSetDebounced("dienstencatalogus", JSON.stringify(dienstenCatalogus));
  }, [dienstenCatalogus, catalogusGeladen]);

  // Categorieën laden uit persistente opslag (valt terug op de 2 standaardcategorieën, zodat
  // bestaande diensten met categorie "eenmalig"/"doorlopend" gewoon blijven werken).
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("diensten-categorieen");
        if (actief && waarde) setCategorieen(JSON.parse(waarde));
      } catch (e) {
        // nog niets opgeslagen, of opslag niet beschikbaar — dan blijven de standaardcategorieën staan
      }
      if (actief) setCategorieenGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Categorieën bewaren zodra er iets in wijzigt (pas nadat de eerste keer geladen is).
  useEffect(() => {
    if (!categorieenGeladen) return;
    opslagSetDebounced("diensten-categorieen", JSON.stringify(categorieen));
  }, [categorieen, categorieenGeladen]);

  // Medewerkers laden — alleen zinvol voor beheerders (de server wijst een GET hierop af
  // voor niet-beheerders, zie BEHEERDER_ALLEEN_LEZEN_SLEUTELS in api/instellingen), dus voor
  // een normale gebruiker blijft dit gewoon een lege lijst zonder foutmelding in de UI.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("medewerkers");
        if (actief && waarde) setMedewerkers(JSON.parse(waarde));
      } catch (e) {
        // nog niets opgeslagen, of geen toegang (niet-beheerder) — lege lijst blijft staan
      }
      if (actief) setMedewerkersGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Alleen daadwerkelijk opslaan als deze gebruiker beheerder is — de server wijst een PUT
  // hierop hoe dan ook af voor niet-beheerders, maar zo voorkomen we ook een gegarandeerd
  // mislukkende aanroep (en de bijbehorende console-foutmelding) voor iedere andere gebruiker.
  useEffect(() => {
    if (!medewerkersGeladen || !benIkBeheerder) return;
    opslagSetDebounced("medewerkers", JSON.stringify(medewerkers));
  }, [medewerkers, medewerkersGeladen, benIkBeheerder]);

  function voegMedewerkerToe() {
    setMedewerkers((prev) => [...prev, { id: nieuwId("mw"), naam: "", email: "", telefoonnummer: "", functie: "", rol: "normaal" }]);
  }
  function bijwerkMedewerker(id, veld, waarde) {
    setMedewerkers((prev) => prev.map((m) => (m.id === id ? { ...m, [veld]: waarde } : m)));
  }
  function verwijderMedewerker(id) {
    setMedewerkers((prev) => prev.filter((m) => m.id !== id));
  }

  // Standaardteksten laden uit persistente opslag.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("standaardteksten");
        if (actief && waarde) {
          setStandaardTeksten(JSON.parse(waarde));
        }
      } catch (e) {
        // nog geen standaardteksten opgeslagen, of opslag niet beschikbaar
      }
      if (actief) setTekstenGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Standaardteksten bewaren zodra er iets in wijzigt (pas nadat de eerste keer geladen is).
  useEffect(() => {
    if (!tekstenGeladen) return;
    opslagSetDebounced("standaardteksten", JSON.stringify(standaardTeksten));
  }, [standaardTeksten, tekstenGeladen]);

  // opdrachttypes: zelf te beheren lijst van NV COS-opdrachttypes, net als de dienstencatalogus.
  const [opdrachttypes, setOpdrachttypes] = useState(INITIAL_OPDRACHTTYPES);
  const [opdrachttypesGeladen, setOpdrachttypesGeladen] = useState(false);
  // Welk opdrachttype er op dit moment bewerkt wordt op het beheerscherm "Opdrachtbevestiging-
  // teksten" (los van gekozenOpdrachttypeId, dat is voor de wizard-stap zelf).
  const [beheerOpdrachttypeId, setBeheerOpdrachttypeId] = useState(null);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("opdrachttypes");
        if (actief && waarde) setOpdrachttypes(JSON.parse(waarde));
      } catch (e) {
        // nog niets opgeslagen — dan blijft de standaardset staan
      }
      if (actief) setOpdrachttypesGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!opdrachttypesGeladen) return;
    opslagSetDebounced("opdrachttypes", JSON.stringify(opdrachttypes));
  }, [opdrachttypes, opdrachttypesGeladen]);

  // opdrachtbevestigingTeksten: per opdrachttype-ID de verplichte + optionele standaard-
  // paragrafen — net als standaardTeksten, maar dan één set per opdrachttype in plaats van
  // per dienst. Vorm: { [opdrachttypeId]: { verplicht: [{id, titel, tekst}], optioneel: [...] } }
  const [opdrachtbevestigingTeksten, setOpdrachtbevestigingTeksten] = useState(INITIAL_OPDRACHTBEVESTIGING_TEKSTEN);
  const [opdrachtbevestigingTekstenGeladen, setOpdrachtbevestigingTekstenGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("opdrachtbevestiging-teksten");
        if (actief && waarde) setOpdrachtbevestigingTeksten(JSON.parse(waarde));
      } catch (e) {
        // nog niets opgeslagen — dan blijft de standaardset staan
      }
      if (actief) setOpdrachtbevestigingTekstenGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!opdrachtbevestigingTekstenGeladen) return;
    opslagSetDebounced("opdrachtbevestiging-teksten", JSON.stringify(opdrachtbevestigingTeksten));
  }, [opdrachtbevestigingTeksten, opdrachtbevestigingTekstenGeladen]);

  // opdrachtbevestigingDienstTeksten: per dienst-ID (uit de dienstencatalogus, dus los van
  // opdrachttype) een vrijwillige standaardtekst voor de opdrachtbevestiging — vorm:
  // { [dienstId]: tekst }. Zodra die dienst in een opdrachtbevestiging is gekozen, komt deze
  // tekst automatisch in de bijlage terecht (net als de NV COS-paragrafen), maar je kan 'm per
  // opdrachtbevestiging uitzetten via opdrachtbevestigingDienstTekstUit (zie huidige
  // OpdrachtbevestigingSnapshot/openOpdrachtbevestiging) — dat is per-record, geen
  // catalogusbrede aan/uit-schakelaar zoals bij "Aantallen gebruiken".
  const [opdrachtbevestigingDienstTeksten, setOpdrachtbevestigingDienstTeksten] = useState({});
  const [opdrachtbevestigingDienstTekstenGeladen, setOpdrachtbevestigingDienstTekstenGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("opdrachtbevestiging-dienst-teksten");
        if (actief && waarde) setOpdrachtbevestigingDienstTeksten(JSON.parse(waarde));
      } catch (e) {
        // nog niets opgeslagen
      }
      if (actief) setOpdrachtbevestigingDienstTekstenGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!opdrachtbevestigingDienstTekstenGeladen) return;
    opslagSetDebounced("opdrachtbevestiging-dienst-teksten", JSON.stringify(opdrachtbevestigingDienstTeksten));
  }, [opdrachtbevestigingDienstTeksten, opdrachtbevestigingDienstTekstenGeladen]);

  function bijwerkOpdrachtbevestigingDienstTekst(dienstId, tekst) {
    setOpdrachtbevestigingDienstTeksten((prev) => ({ ...prev, [dienstId]: tekst }));
  }

  // taakInstellingenOfferte: onderwerp/categorie van de taak die na ondertekening van een
  // offerte wordt aangemaakt — voorheen vast ("Onboarding klant" / 8009 Backoffice), nu
  // instelbaar. Staat altijd aan (geen aparte "actief"-schakelaar, ongewijzigd gedrag).
  const [taakInstellingenOfferte, setTaakInstellingenOfferte] = useState(TAAK_INSTELLINGEN_OFFERTE_DEFAULT);
  const [taakInstellingenOfferteGeladen, setTaakInstellingenOfferteGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("taak-instellingen-offerte");
        if (actief && waarde) setTaakInstellingenOfferte({ ...TAAK_INSTELLINGEN_OFFERTE_DEFAULT, ...JSON.parse(waarde) });
      } catch (e) {
        // nog niets ingesteld — standaardwaarden blijven staan
      }
      if (actief) setTaakInstellingenOfferteGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!taakInstellingenOfferteGeladen) return;
    opslagSetDebounced("taak-instellingen-offerte", JSON.stringify(taakInstellingenOfferte));
  }, [taakInstellingenOfferte, taakInstellingenOfferteGeladen]);

  // taakInstellingenOpdrachtbevestiging: zelfde soort instelling als hierboven, maar dan voor
  // opdrachtbevestiging — met een eigen "actief"-schakelaar (los van offerte), standaard uit.
  const [taakInstellingenOpdrachtbevestiging, setTaakInstellingenOpdrachtbevestiging] = useState(TAAK_INSTELLINGEN_OPDRACHTBEVESTIGING_DEFAULT);
  const [taakInstellingenOpdrachtbevestigingGeladen, setTaakInstellingenOpdrachtbevestigingGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("taak-instellingen-opdrachtbevestiging");
        if (actief && waarde) {
          setTaakInstellingenOpdrachtbevestiging({ ...TAAK_INSTELLINGEN_OPDRACHTBEVESTIGING_DEFAULT, ...JSON.parse(waarde) });
        }
      } catch (e) {
        // nog niets ingesteld — standaardwaarden (uit) blijven staan
      }
      if (actief) setTaakInstellingenOpdrachtbevestigingGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!taakInstellingenOpdrachtbevestigingGeladen) return;
    opslagSetDebounced("taak-instellingen-opdrachtbevestiging", JSON.stringify(taakInstellingenOpdrachtbevestiging));
  }, [taakInstellingenOpdrachtbevestiging, taakInstellingenOpdrachtbevestigingGeladen]);

  // taakInstellingenVerlopenConcept: onderwerp/categorie van de taak die wordt aangemaakt zodra
  // de tool automatisch een concept-vervolg-opdrachtbevestiging klaarzet na een verstreken
  // tarieven-einddatum (zie tariefEinddatum en verwerkVerlopenTarieven in
  // api/_gedeeld/onboarding.js) — zelfde patroon als de twee taak-instellingen hierboven, maar
  // standaard AAN.
  const [taakInstellingenVerlopenConcept, setTaakInstellingenVerlopenConcept] = useState(TAAK_INSTELLINGEN_VERLOPEN_CONCEPT_DEFAULT);
  const [taakInstellingenVerlopenConceptGeladen, setTaakInstellingenVerlopenConceptGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("taak-instellingen-verlopen-concept");
        if (actief && waarde) {
          setTaakInstellingenVerlopenConcept({ ...TAAK_INSTELLINGEN_VERLOPEN_CONCEPT_DEFAULT, ...JSON.parse(waarde) });
        }
      } catch (e) {
        // nog niets ingesteld — standaardwaarden (aan) blijven staan
      }
      if (actief) setTaakInstellingenVerlopenConceptGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!taakInstellingenVerlopenConceptGeladen) return;
    opslagSetDebounced("taak-instellingen-verlopen-concept", JSON.stringify(taakInstellingenVerlopenConcept));
  }, [taakInstellingenVerlopenConcept, taakInstellingenVerlopenConceptGeladen]);

  // tariefInstellingenOpdrachtbevestiging: schakelaar voor de tarieven-registratie in
  // Dataverse (cr283_opdrachtbevestiging + cr283_tarief) bij het ondertekenen van een
  // opdrachtbevestiging — zie schrijfTarievenNaarDataverse in api/_gedeeld/onboarding.js.
  // Staat standaard uit totdat de tabellen zijn aangemaakt (zie api/dataverse-schema-setup).
  const [tariefInstellingenOpdrachtbevestiging, setTariefInstellingenOpdrachtbevestiging] = useState({ actief: false });
  const [tariefInstellingenOpdrachtbevestigingGeladen, setTariefInstellingenOpdrachtbevestigingGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("tarieven-instellingen-opdrachtbevestiging");
        if (actief && waarde) setTariefInstellingenOpdrachtbevestiging({ actief: false, ...JSON.parse(waarde) });
      } catch (e) {
        // nog niets ingesteld — standaardwaarde (uit) blijft staan
      }
      if (actief) setTariefInstellingenOpdrachtbevestigingGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!tariefInstellingenOpdrachtbevestigingGeladen) return;
    opslagSetDebounced("tarieven-instellingen-opdrachtbevestiging", JSON.stringify(tariefInstellingenOpdrachtbevestiging));
  }, [tariefInstellingenOpdrachtbevestiging, tariefInstellingenOpdrachtbevestigingGeladen]);

  // tariefKolomMapping: naar welke kolom van de cr283_tarief-tabel het bedrag en de
  // dienstomschrijving geschreven worden bij het wegschrijven naar Dataverse (zie
  // schrijfTarievenNaarDataverse in api/_gedeeld/onboarding.js) — per dienst apart instelbaar,
  // vorm { [dienstId]: { bedragKolom, omschrijvingKolom } }. Standaard (lege/ontbrekende rij)
  // vallen de kolommen terug op TARIEF_KOLOM_MAPPING_STANDAARD, de kolommen die
  // api/dataverse-schema-setup zelf aanmaakt.
  const [tariefKolomMapping, setTariefKolomMapping] = useState({});
  const [tariefKolomMappingGeladen, setTariefKolomMappingGeladen] = useState(false);

  // Wacht op catalogusGeladen: bij een eenmalige migratie van de oude, vlakke instelling (vóór
  // deze tabel bestond — één kolom-koppeling voor alle diensten samen) is de huidige
  // dienstenlijst nodig om voor elke bestaande dienst een eigen rij aan te maken met die oude
  // waarde als startpunt. De tariefKolomMappingGeladen-guard zorgt dat dit, net als de andere
  // laad-effecten hierboven, echt maar één keer draait — ook al staat dienstenCatalogus in de
  // dependency-array (nodig voor de migratie-tak hierboven, exhaustive-deps).
  useEffect(() => {
    if (!catalogusGeladen || tariefKolomMappingGeladen) return;
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("tarieven-kolom-mapping");
        if (actief && waarde) {
          const ruw = JSON.parse(waarde);
          const isOudeVlakkeVorm = typeof ruw?.bedragKolom === "string" || typeof ruw?.omschrijvingKolom === "string";
          if (isOudeVlakkeVorm) {
            const gemigreerd = {};
            dienstenCatalogus.forEach((d) => {
              gemigreerd[d.id] = { bedragKolom: ruw.bedragKolom || "", omschrijvingKolom: ruw.omschrijvingKolom || "" };
            });
            setTariefKolomMapping(gemigreerd);
          } else {
            setTariefKolomMapping(ruw || {});
          }
        }
      } catch (e) {
        // nog niets ingesteld — lege mapping blijft staan (elke dienst valt terug op de standaardkolommen)
      }
      if (actief) setTariefKolomMappingGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, [catalogusGeladen, tariefKolomMappingGeladen, dienstenCatalogus]);

  useEffect(() => {
    if (!tariefKolomMappingGeladen) return;
    opslagSetDebounced("tarieven-kolom-mapping", JSON.stringify(tariefKolomMapping));
  }, [tariefKolomMapping, tariefKolomMappingGeladen]);

  // Werkt de kolom-koppeling van één dienst bij (zie de tabel "Tarieven — kolom-koppeling in
  // Dataverse" onder Instellingen) — de andere diensten en het niet-aangeraakte veld van
  // dezelfde dienst blijven ongemoeid staan (dus leeg = valt terug op de standaardkolom).
  function bijwerkTariefKolomVoorDienst(dienstId, veld, waarde) {
    setTariefKolomMapping((prev) => ({
      ...prev,
      [dienstId]: { ...(prev[dienstId] || {}), [veld]: waarde },
    }));
  }

  // Op verzoek (knop "Kolom aanmaken in Dataverse" per dienst) een eigen bedrag- en
  // omschrijvingkolom laten aanmaken op cr283_tarief — zie api/dataverse-kolom-aanmaken en
  // maakTariefKolommenVoorDienst in api/_gedeeld/onboarding.js. Beheerders-only (de knop
  // wordt alleen getoond aan benIkBeheerder, en de server wijst het hoe dan ook af voor
  // anderen). Vult bij succes meteen de kolomnamen in bij deze dienst in de tabel hieronder.
  const [kolomAanmakenStatus, setKolomAanmakenStatus] = useState({});

  async function maakDataverseKolomAan(dienst) {
    setKolomAanmakenStatus((prev) => ({ ...prev, [dienst.id]: { bezig: true, fout: null } }));
    try {
      const res = await fetch("/api/dataverse-kolom-aanmaken", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "offertetool" },
        body: JSON.stringify({ dienstId: dienst.id, dienstNaam: dienst.naam }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      bijwerkTariefKolomVoorDienst(dienst.id, "bedragKolom", data.bedragKolom);
      bijwerkTariefKolomVoorDienst(dienst.id, "omschrijvingKolom", data.omschrijvingKolom);
      setKolomAanmakenStatus((prev) => ({ ...prev, [dienst.id]: { bezig: false, fout: null } }));
    } catch (err) {
      setKolomAanmakenStatus((prev) => ({ ...prev, [dienst.id]: { bezig: false, fout: err.message || "Aanmaken mislukt." } }));
    }
  }

  // Verbindingsstatus-check (api/dataverse-status) en het bekijken van de daadwerkelijk
  // weggeschreven tarieven (api/dataverse-tarieven-overzicht) — beide puur op aanvraag (geen
  // automatische polling), zie de nieuwe sectie "Tarieven — Dataverse inzien" in Instellingen.
  const [dataverseStatusBezig, setDataverseStatusBezig] = useState(false);
  const [dataverseStatusResultaat, setDataverseStatusResultaat] = useState(null);
  const [dataverseStatusFout, setDataverseStatusFout] = useState(null);

  async function testDataverseVerbinding() {
    setDataverseStatusBezig(true);
    setDataverseStatusFout(null);
    setDataverseStatusResultaat(null);
    try {
      const res = await fetch("/api/dataverse-status");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.foutmelding || data?.error || `HTTP ${res.status}`);
      setDataverseStatusResultaat(data);
      if (!data.ok) setDataverseStatusFout(data.foutmelding || "Verbinding mislukt.");
    } catch (err) {
      setDataverseStatusFout(err.message || "Verbinding testen mislukt.");
    } finally {
      setDataverseStatusBezig(false);
    }
  }

  const [dataverseOverzichtZoekterm, setDataverseOverzichtZoekterm] = useState("");
  const [dataverseOverzichtKlantOpties, setDataverseOverzichtKlantOpties] = useState([]);
  const [dataverseOverzichtKlantZoekenBezig, setDataverseOverzichtKlantZoekenBezig] = useState(false);
  const [dataverseOverzichtKlantId, setDataverseOverzichtKlantId] = useState("");
  const [dataverseOverzichtBezig, setDataverseOverzichtBezig] = useState(false);
  const [dataverseOverzichtResultaat, setDataverseOverzichtResultaat] = useState(null);
  const [dataverseOverzichtFout, setDataverseOverzichtFout] = useState(null);

  async function zoekKlantVoorDataverseOverzicht() {
    if (!dataverseOverzichtZoekterm.trim()) return;
    setDataverseOverzichtKlantZoekenBezig(true);
    try {
      const res = await fetch(`/api/offertes-klanten?zoek=${encodeURIComponent(dataverseOverzichtZoekterm)}`);
      const data = await res.json().catch(() => null);
      setDataverseOverzichtKlantOpties(Array.isArray(data) ? data : []);
    } catch (err) {
      setDataverseOverzichtKlantOpties([]);
    } finally {
      setDataverseOverzichtKlantZoekenBezig(false);
    }
  }

  async function haalDataverseTarievenOverzichtOp() {
    setDataverseOverzichtBezig(true);
    setDataverseOverzichtFout(null);
    setDataverseOverzichtResultaat(null);
    try {
      const url = dataverseOverzichtKlantId
        ? `/api/dataverse-tarieven-overzicht?klantId=${encodeURIComponent(dataverseOverzichtKlantId)}`
        : "/api/dataverse-tarieven-overzicht";
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDataverseOverzichtResultaat(data.tarieven || []);
    } catch (err) {
      setDataverseOverzichtFout(err.message || "Ophalen mislukt.");
    } finally {
      setDataverseOverzichtBezig(false);
    }
  }

  // webhookOpdrachtbevestiging: zelfde opzet als webhookAcceptatie (leeg = uitgeschakeld),
  // maar los in te stellen van de offerte-webhook hierboven.
  const [webhookOpdrachtbevestiging, setWebhookOpdrachtbevestiging] = useState("");
  const [webhookOpdrachtbevestigingGeladen, setWebhookOpdrachtbevestigingGeladen] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const waarde = await opslagGet("webhook-opdrachtbevestiging-acceptatie");
        if (actief && waarde) setWebhookOpdrachtbevestiging(waarde);
      } catch (e) {
        // nog geen webhook ingesteld
      } finally {
        if (actief) setWebhookOpdrachtbevestigingGeladen(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!webhookOpdrachtbevestigingGeladen) return;
    opslagSetDebounced("webhook-opdrachtbevestiging-acceptatie", webhookOpdrachtbevestiging);
  }, [webhookOpdrachtbevestiging, webhookOpdrachtbevestigingGeladen]);

  // Klanten ophalen bij de eigen Dynamics-koppeling (Azure Function op /api/offertes-klanten).
  // Lukt dit niet (nog niet geconfigureerd, lokale ontwikkeling, of een fout) dan valt
  // de tool terug op de voorbeeldklanten, zodat de tool altijd blijft werken.
  const [klantenBron, setKlantenBron] = useState(MOCK_KLANTEN);
  const [klantenUitDynamics, setKlantenUitDynamics] = useState(false);
  const [klantenFoutmelding, setKlantenFoutmelding] = useState(null);
  const [klantenMeerBeschikbaar, setKlantenMeerBeschikbaar] = useState(false);
  const [klantenLaden, setKlantenLaden] = useState(false);

  async function haalKlantenOp(zoekterm) {
    setKlantenLaden(true);
    try {
      const url = zoekterm ? `/api/offertes-klanten?zoek=${encodeURIComponent(zoekterm)}` : "/api/offertes-klanten";
      const res = await fetch(url);
      if (!res.ok) {
        const foutdata = await res.json().catch(() => null);
        throw new Error(foutdata?.detail || foutdata?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setKlantenMeerBeschikbaar(data.length > 10);
        setKlantenBron(data.slice(0, 10));
        setKlantenUitDynamics(true);
        setKlantenFoutmelding(null);
      }
    } catch (err) {
      // API niet bereikbaar (bijv. lokale ontwikkeling) geeft een generieke fetch-fout —
      // dat tonen we niet als "fout", want dat is normaal. Een fout mét inhoud (vanuit
      // onze eigen Azure Function) tonen we wél, want die is nuttig om te debuggen.
      if (err.message && err.message !== "Failed to fetch") {
        setKlantenFoutmelding(err.message);
      }
    } finally {
      setKlantenLaden(false);
    }
  }

  // Eerste keer laden: standaardlijst (alfabetisch, eerste 10).
  useEffect(() => {
    haalKlantenOp("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bij elke wijziging in het zoekveld: de zoekopdracht bij Dynamics zelf uitvoeren
  // (server-side), zodat álle klanten vindbaar zijn — niet alleen een vooraf geladen setje.
  // Een korte pauze (debounce) voorkomt dat elke toetsaanslag meteen een aanroep doet.
  useEffect(() => {
    if (!klantenUitDynamics) return; // nog geen live koppeling; dan lokaal filteren op voorbeelddata
    const timer = setTimeout(() => {
      haalKlantenOp(zoekKlant.trim());
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoekKlant, klantenUitDynamics]);

  const gefilterdeKlanten = useMemo(() => {
    if (klantenUitDynamics) return klantenBron; // al server-side gefilterd en beperkt
    const q = zoekKlant.trim().toLowerCase();
    if (!q) return klantenBron;
    return klantenBron.filter(
      (k) =>
        k.naam.toLowerCase().includes(q) ||
        (k.plaats || "").toLowerCase().includes(q) ||
        (k.segment || "").toLowerCase().includes(q)
    );
  }, [zoekKlant, klantenBron, klantenUitDynamics]);

  const heeftMeerResultaten = klantenUitDynamics ? klantenMeerBeschikbaar : gefilterdeKlanten.length > 10;

  function dienstById(id) {
    return dienstenCatalogus.find((d) => d.id === id);
  }
  function variantById(dienst, variantId) {
    return dienst?.varianten.find((v) => v.id === variantId);
  }

  const geselecteerdeEntries = useMemo(() => {
    // Catalogusvolgorde aanhouden (niet de volgorde waarin diensten zijn aangevinkt), zodat
    // het verplaatsen van diensten in "Diensten beheren" ook echt de volgorde op de offerte
    // zelf bepaalt.
    return dienstenCatalogus
      .filter((dienst) => geselecteerd[dienst.id])
      .map((dienst) => ({
        dienst,
        aantal: geselecteerd[dienst.id].aantal || 1,
        // Losse vermenigvuldigingsfactor naast aantal (bv. 10 stroken per maand × factor 12
        // maanden) — alleen relevant voor diensten met gebruikAantallen aan.
        factor: geselecteerd[dienst.id].factor || 1,
      }));
  }, [geselecteerd, dienstenCatalogus]);

  // Diensten waarvan de categorie niet (meer) bestaat in de categorieënlijst — bijv. nadat een
  // categorie is verwijderd terwijl er toch nog een dienst naar verwees. Gebruikt voor de
  // waarschuwing bovenaan "Dienstencatalogus beheren" en de rode rand bij het Categorie-veld.
  const dienstenZonderCategorie = useMemo(() => {
    return dienstenCatalogus.filter((d) => !categorieen.some((c) => c.id === d.categorie));
  }, [dienstenCatalogus, categorieen]);

  // Welke gekozen diensten hebben een vrijwillige standaardtekst voor de opdrachtbevestiging
  // (zie opdrachtbevestigingDienstTeksten) die (nog) niet per-record is uitgezet. Bepaalt wat
  // er standaard in de bijlage van de opdrachtbevestiging komt te staan.
  const dienstTekstenActief = useMemo(() => {
    return geselecteerdeEntries.filter(
      ({ dienst }) =>
        (opdrachtbevestigingDienstTeksten[dienst.id] || "").trim() !== "" &&
        !opdrachtbevestigingDienstTekstUit[dienst.id]
    );
  }, [geselecteerdeEntries, opdrachtbevestigingDienstTeksten, opdrachtbevestigingDienstTekstUit]);

  // Alle gekozen diensten met een vrijwillige standaardtekst, ongeacht of die voor deze
  // opdrachtbevestiging nu aan of uit staat — dit is de lijst die de checkbox-UI toont.
  const dienstenMetOpdrachtbevestigingTekst = useMemo(() => {
    return geselecteerdeEntries.filter(({ dienst }) => (opdrachtbevestigingDienstTeksten[dienst.id] || "").trim() !== "");
  }, [geselecteerdeEntries, opdrachtbevestigingDienstTeksten]);

  function toggleDienstSelectie(dienst) {
    setGeselecteerd((prev) => {
      const next = { ...prev };
      if (next[dienst.id]) {
        delete next[dienst.id];
      } else {
        next[dienst.id] = { aantal: dienst.standaardAantal || 1, factor: dienst.standaardFactor || 1 };
      }
      return next;
    });
    wisPrijsOverridesVoorDienst(dienst.id);
    wisUitschakelingenVoorDienst(dienst.id);
  }

  function isUitgeschakeldVoorKlant(klantId, dienstId) {
    return !!uitgeschakeldVoorKlant[prijsSleutel(klantId, dienstId)];
  }

  function toggleDienstVoorKlant(klantId, dienstId) {
    setUitgeschakeldVoorKlant((prev) => {
      const key = prijsSleutel(klantId, dienstId);
      return { ...prev, [key]: !prev[key] };
    });
  }

  function wisUitschakelingenVoorDienst(dienstId) {
    setUitgeschakeldVoorKlant((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, val]) => {
        if (!key.endsWith(`::${dienstId}`)) next[key] = val;
      });
      return next;
    });
  }

  function variantVoorKlant(klantId, dienst) {
    const key = prijsSleutel(klantId, dienst.id);
    const gekozenId = klantVarianten[key];
    return variantById(dienst, gekozenId) || dienst.varianten[0];
  }

  function kiesVariantVoorKlant(klantId, dienstId, variantId) {
    setKlantVarianten((prev) => ({
      ...prev,
      [prijsSleutel(klantId, dienstId)]: variantId,
    }));
    resetPrijs(klantId, dienstId);
  }

  function zetAantal(dienstId, aantal) {
    setGeselecteerd((prev) => ({
      ...prev,
      [dienstId]: { ...prev[dienstId], aantal: Math.max(1, aantal) },
    }));
  }

  function zetFactor(dienstId, factor) {
    setGeselecteerd((prev) => ({
      ...prev,
      [dienstId]: { ...prev[dienstId], factor: Math.max(1, factor) },
    }));
  }

  function wisPrijsOverridesVoorDienst(dienstId) {
    setAangepastePrijzen((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, val]) => {
        if (!key.endsWith(`::${dienstId}`)) next[key] = val;
      });
      return next;
    });
  }

  function prijsSleutel(klantId, dienstId) {
    return `${klantId}::${dienstId}`;
  }

  function catalogusPrijsVoor(klantId, dienst) {
    const variant = variantVoorKlant(klantId, dienst);
    if (variant?.prijs === null) return { prijs: 0, opAanvraag: true, opNacalculatie: false, variant };
    if (variant?.prijs === "nacalculatie") return { prijs: 0, opAanvraag: false, opNacalculatie: true, variant };
    return { prijs: variant?.prijs ?? 0, opAanvraag: false, opNacalculatie: false, variant };
  }

  function prijsVoor(klantId, dienst) {
    const key = prijsSleutel(klantId, dienst.id);
    const override = aangepastePrijzen[key];
    const catalogus = catalogusPrijsVoor(klantId, dienst);
    if (override !== undefined && override !== "" && override !== null) {
      return { prijs: Number(override), opAanvraag: false, opNacalculatie: false, variant: catalogus.variant };
    }
    return catalogus;
  }

  function zetPrijs(klantId, dienstId, waarde) {
    setAangepastePrijzen((prev) => ({
      ...prev,
      [prijsSleutel(klantId, dienstId)]: waarde,
    }));
  }

  function resetPrijs(klantId, dienstId) {
    setAangepastePrijzen((prev) => {
      const next = { ...prev };
      delete next[prijsSleutel(klantId, dienstId)];
      return next;
    });
  }

  function regelsVoorKlant(klantId) {
    return geselecteerdeEntries
      .filter(({ dienst }) => !isUitgeschakeldVoorKlant(klantId, dienst.id))
      .map(({ dienst, aantal, factor }) => {
        const { prijs, opAanvraag, opNacalculatie, variant } = prijsVoor(klantId, dienst);
        const catInfo = categorieen.find((c) => c.id === dienst.categorie);
        return {
          id: dienst.id,
          naam: variant?.naam ? `${dienst.naam} — ${variant.naam}` : dienst.naam,
          eenheid: dienst.eenheid,
          categorie: dienst.categorie,
          // Bevriest de op dit moment geldende categorienaam op de regel zelf — nodig omdat de
          // publieke tekenpagina en PDF-generatie geen toegang hebben tot de live categorieën-
          // lijst (zie groepeerOpCategorie hierboven en data.categorieVolgorde verderop).
          categorieNaam: catInfo ? (catInfo.naam || "").trim() || "Naamloze categorie" : dienst.categorie,
          // Los van de (vrije) categorie hierboven: alleen gebruikt bij het wegschrijven van
          // tarieven naar Dataverse (cr283_categorie, met maar 2 vaste optiewaarden) — zie
          // schrijfTarievenNaarDataverse in api/_gedeeld/onboarding.js.
          dataverseSoort: dienst.dataverseSoort || (dienst.categorie === "doorlopend" ? "doorlopend" : "eenmalig"),
          aantal,
          // Alleen relevant als de dienst "Aantallen gebruiken" heeft aanstaan; anders altijd 1
          // (en dus onzichtbaar in de weergave — zie formatteerAantal hieronder).
          factor,
          prijs,
          opAanvraag,
          opNacalculatie,
          subtotaal: opAanvraag || opNacalculatie ? 0 : aantal * factor * prijs,
        };
      });
  }

  const heeftMeerdereVarianten = geselecteerdeEntries.some(({ dienst }) => dienst.varianten.length > 1);

  // ---------------- Catalogusbeheer ----------------
  function voegDienstToe(categorie) {
    setDienstenCatalogus((prev) => [
      ...prev,
      {
        id: nieuwId("svc"),
        categorie,
        // Standaardwaarde voor het aparte Dataverse-veld (los van de categorie hierboven) — bij
        // de 2 standaardcategorieën blijft dit wat het altijd al was; bij een eigen categorie is
        // "eenmalig" een neutrale start die desgewenst direct in het bewerkscherm is om te zetten.
        dataverseSoort: categorie === "doorlopend" ? "doorlopend" : "eenmalig",
        naam: "Nieuwe dienst",
        eenheid: "stuk",
        gebruikAantallen: true,
        standaardAantal: 1,
        standaardFactor: 1,
        varianten: [{ id: nieuwId("v"), naam: "", prijs: 0 }],
      },
    ]);
  }
  // ---------------- Categorieënbeheer ----------------
  function voegCategorieToe() {
    setCategorieen((prev) => [...prev, { id: nieuwId("cat"), naam: "" }]);
  }
  function bijwerkCategorieNaam(id, naam) {
    setCategorieen((prev) => prev.map((c) => (c.id === id ? { ...c, naam } : c)));
  }
  function verwijderCategorie(id) {
    // Veiligheidsklep: de knop staat in de UI al uit zolang er nog diensten in deze categorie
    // zitten, maar deze check voorkomt ook per ongeluk "wees" diensten via een andere aanroeper.
    if (dienstenCatalogus.some((d) => d.categorie === id)) return;
    setCategorieen((prev) => prev.filter((c) => c.id !== id));
  }
  function verplaatsCategorie(id, richting) {
    setCategorieen((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const nieuweIdx = idx + richting;
      if (idx === -1 || nieuweIdx < 0 || nieuweIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[nieuweIdx]] = [next[nieuweIdx], next[idx]];
      return next;
    });
  }
  function verwijderDienst(id) {
    setDienstenCatalogus((prev) => prev.filter((d) => d.id !== id));
    setGeselecteerd((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    wisPrijsOverridesVoorDienst(id);
  }
  function bijwerkDienstVeld(id, veld, waarde) {
    setDienstenCatalogus((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [veld]: waarde } : d))
    );
  }
  // Verplaatst een dienst één plek omhoog/omlaag, alleen binnen zijn eigen categorie —
  // de onderlinge volgorde binnen een andere categorie blijft ongemoeid, en dit is ook de
  // volgorde waarin diensten straks op de offerte verschijnen.
  function verplaatsDienst(dienstId, richting) {
    setDienstenCatalogus((prev) => {
      const dienst = prev.find((d) => d.id === dienstId);
      if (!dienst) return prev;
      const idsInCategorie = prev.filter((d) => d.categorie === dienst.categorie).map((d) => d.id);
      const posInCategorie = idsInCategorie.indexOf(dienstId);
      const nieuwePos = posInCategorie + richting;
      if (nieuwePos < 0 || nieuwePos >= idsInCategorie.length) return prev;

      const wisselId = idsInCategorie[nieuwePos];
      const globaleIndexA = prev.findIndex((d) => d.id === dienstId);
      const globaleIndexB = prev.findIndex((d) => d.id === wisselId);
      const next = [...prev];
      [next[globaleIndexA], next[globaleIndexB]] = [next[globaleIndexB], next[globaleIndexA]];
      return next;
    });
  }
  function voegVariantToe(dienstId) {
    setDienstenCatalogus((prev) =>
      prev.map((d) =>
        d.id === dienstId
          ? { ...d, varianten: [...d.varianten, { id: nieuwId("v"), naam: "", prijs: 0 }] }
          : d
      )
    );
  }
  function verwijderVariant(dienstId, variantId) {
    setDienstenCatalogus((prev) =>
      prev.map((d) =>
        d.id === dienstId
          ? { ...d, varianten: d.varianten.filter((v) => v.id !== variantId) }
          : d
      )
    );
  }
  function bijwerkVariant(dienstId, variantId, veld, waarde) {
    setDienstenCatalogus((prev) =>
      prev.map((d) =>
        d.id === dienstId
          ? {
              ...d,
              varianten: d.varianten.map((v) =>
                v.id === variantId ? { ...v, [veld]: waarde } : v
              ),
            }
          : d
      )
    );
  }

  // ---- Opdrachttypes beheren (Instellingen > Opdrachtbevestiging-teksten) ----
  // Zelfde generieke-veldzetter-aanpak als bijwerkDienstVeld hierboven.
  function voegOpdrachttypeToe() {
    const id = nieuwId("otype");
    setOpdrachttypes((prev) => [...prev, { id, naam: "Nieuw opdrachttype" }]);
    setOpdrachtbevestigingTeksten((prev) => ({ ...prev, [id]: { verplicht: [], optioneel: [] } }));
    return id;
  }
  function verwijderOpdrachttype(id) {
    setOpdrachttypes((prev) => prev.filter((t) => t.id !== id));
    setOpdrachtbevestigingTeksten((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
  function bijwerkOpdrachttypeVeld(id, veld, waarde) {
    setOpdrachttypes((prev) => prev.map((t) => (t.id === id ? { ...t, [veld]: waarde } : t)));
  }
  function verplaatsOpdrachttype(id, richting) {
    setOpdrachttypes((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const nieuweIdx = idx + richting;
      if (idx === -1 || nieuweIdx < 0 || nieuweIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[nieuweIdx]] = [next[nieuweIdx], next[idx]];
      return next;
    });
  }

  // ---- Standaardparagrafen per opdrachttype beheren (verplicht + optioneel) ----
  function paragrafenVoorType(typeId) {
    return opdrachtbevestigingTeksten[typeId] || { verplicht: [], optioneel: [] };
  }
  function voegStandaardParagraafToe(typeId, soort) {
    setOpdrachtbevestigingTeksten((prev) => {
      const huidig = prev[typeId] || { verplicht: [], optioneel: [] };
      return {
        ...prev,
        [typeId]: { ...huidig, [soort]: [...(huidig[soort] || []), { id: nieuwId("par"), titel: "Nieuwe paragraaf", tekst: "" }] },
      };
    });
  }
  function verwijderStandaardParagraaf(typeId, soort, paragraafId) {
    setOpdrachtbevestigingTeksten((prev) => {
      const huidig = prev[typeId] || { verplicht: [], optioneel: [] };
      return { ...prev, [typeId]: { ...huidig, [soort]: (huidig[soort] || []).filter((p) => p.id !== paragraafId) } };
    });
  }
  function bijwerkStandaardParagraaf(typeId, soort, paragraafId, veld, waarde) {
    setOpdrachtbevestigingTeksten((prev) => {
      const huidig = prev[typeId] || { verplicht: [], optioneel: [] };
      return {
        ...prev,
        [typeId]: {
          ...huidig,
          [soort]: (huidig[soort] || []).map((p) => (p.id === paragraafId ? { ...p, [veld]: waarde } : p)),
        },
      };
    });
  }
  // Volgorde van paragrafen binnen verplicht/optioneel wijzigen — zelfde aanpak als
  // verplaatsOpdrachttype hierboven. Deze volgorde bepaalt ook de volgorde waarin de
  // paragrafen in de bijlage van de opdrachtbevestiging (preview + PDF) verschijnen.
  function verplaatsStandaardParagraaf(typeId, soort, paragraafId, richting) {
    setOpdrachtbevestigingTeksten((prev) => {
      const huidig = prev[typeId] || { verplicht: [], optioneel: [] };
      const lijst = huidig[soort] || [];
      const idx = lijst.findIndex((p) => p.id === paragraafId);
      const nieuweIdx = idx + richting;
      if (idx === -1 || nieuweIdx < 0 || nieuweIdx >= lijst.length) return prev;
      const nieuweLijst = [...lijst];
      [nieuweLijst[idx], nieuweLijst[nieuweIdx]] = [nieuweLijst[nieuweIdx], nieuweLijst[idx]];
      return { ...prev, [typeId]: { ...huidig, [soort]: nieuweLijst } };
    });
  }

  function toggleKlant(k) {
    setGekozenKlanten((prev) =>
      prev.some((x) => x.id === k.id)
        ? prev.filter((x) => x.id !== k.id)
        : [...prev, k]
    );
  }

  function startLogin() {
    setBezigMetInloggen(true);
    setTimeout(() => {
      setBezigMetInloggen(false);
      setIngelogd(true);
      setStap("klant");
    }, 1400);
  }

  function uitloggen() {
    const wasEchteMicrosoftLogin = !!echteGebruiker;
    setIngelogd(false);
    setEchteGebruiker(null);
    setGekozenKlanten([]);
    setGeselecteerd({});
    setKlantVarianten({});
    setAangepastePrijzen({});
    setUitgeschakeldVoorKlant({});
    setHuidigeOfferteId(null);
    setOfferteMaker({ naam: "", email: "" });
    setHuidigeOfferteStatus(OFFERTE_STATUS_STANDAARD);
    setOfferteOpslaanStatus("idle");
    setOfferteVraagStatusTonen(false);
    setStap("login");
    // Stuurt de browser naar het ingebouwde logout-endpoint van Azure Static Web
    // Apps, zodat ook de échte Microsoft-sessie wordt beëindigd. Dat endpoint
    // bestaat alleen als er ook echt via Microsoft is ingelogd (dus niet in de
    // gesimuleerde/demo-login) — anders zou deze regel de pagina onnodig verlaten.
    if (wasEchteMicrosoftLogin) {
      window.location.href = "/.auth/logout?post_logout_redirect_uri=/";
    }
  }

  function stapIndex(key) {
    return STAPPEN.findIndex((s) => s.key === key);
  }
  function volgende() {
    const i = stapIndex(stap);
    if (i < STAPPEN.length - 1) setStap(STAPPEN[i + 1].key);
  }
  function vorige() {
    const i = stapIndex(stap);
    if (i > 0) setStap(STAPPEN[i - 1].key);
  }
  const BEHEERSCHERMEN = [
    "catalogus",
    "teksten",
    "voorwaarden",
    "roadmap",
    "offertes",
    "opdrachtbevestiging-teksten",
    "opdrachtbevestigingen",
    "instellingen",
  ];
  function openAfzender() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("instellingen");
  }
  function openCatalogus() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("catalogus");
  }
  function openTeksten() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("teksten");
  }
  function openVoorwaarden() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("voorwaarden");
  }
  function openRoadmap() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("roadmap");
  }
  function openOffertesOverzicht() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("offertes");
    laadOffertesLijst();
  }
  function openOpdrachtbevestigingTeksten() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("opdrachtbevestiging-teksten");
  }
  function openOpdrachtbevestigingenOverzicht() {
    if (!BEHEERSCHERMEN.includes(stap)) setTerugNaarStap(stap);
    setStap("opdrachtbevestigingen");
    laadOpdrachtbevestigingenLijst();
  }

  function bijwerkStandaardAlgemeen(tekst) {
    setStandaardTeksten((prev) => ({ ...prev, algemeen: tekst }));
  }
  function bijwerkStandaardDienstTekst(dienstId, tekst) {
    setStandaardTeksten((prev) => ({ ...prev, perDienst: { ...prev.perDienst, [dienstId]: tekst } }));
  }

  // Op de Bijlage-stap: alle standaardteksten in één keer overnemen in déze offerte
  // (algemeen + elk aangevinkt dienst-tekstblok) — hetzelfde als los op elk "Standaardtekst"
  // knopje klikken, maar dan in één keer. Overschrijft wat er al in die velden stond.
  function alleStandaardtekstenOvernemen() {
    // Vult alleen de offerte-teksten — de opdrachtbevestiging-teksten hebben hun eigen,
    // los te bewerken velden verderop op de stap en worden hier niet aangeraakt.
    if (standaardTeksten.algemeen.trim() !== "") {
      setAlgemeneToelichting(standaardTeksten.algemeen);
    }
    setBijlageToelichtingen((prev) => {
      const next = { ...prev };
      geselecteerdeEntries.forEach(({ dienst }) => {
        const standaard = standaardTeksten.perDienst[dienst.id];
        if (standaard && standaard.trim() !== "") {
          next[dienst.id] = standaard;
        }
      });
      return next;
    });
  }

  // Standaardteksten automatisch invullen zodra diensten geselecteerd zijn — werkt ongeacht
  // via welke stap de gebruiker bij de offerte terechtkomt, niet alleen via de Bijlage-stap.
  useEffect(() => {
    if (!tekstenGeladen || !bijlageGeladen) return;
    setBijlageToelichtingen((prev) => {
      let gewijzigd = false;
      const next = { ...prev };
      geselecteerdeEntries.forEach(({ dienst }) => {
        const standaard = standaardTeksten.perDienst[dienst.id];
        if (standaard && (!next[dienst.id] || next[dienst.id].trim() === "")) {
          next[dienst.id] = standaard;
          gewijzigd = true;
        }
      });
      return gewijzigd ? next : prev;
    });
    setAlgemeneToelichting((prev) =>
      prev.trim() === "" && standaardTeksten.algemeen.trim() !== "" ? standaardTeksten.algemeen : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geselecteerdeEntries, standaardTeksten, tekstenGeladen, bijlageGeladen]);

  function naarBijlage() {
    setStap("bijlage");
  }

  // Genereert dezelfde server-PDF als de klant via de tekenlink krijgt (zelfde
  // /api/teken/{id}?formaat=pdf-endpoint, zelfde offertes-opslag) en opent 'm in een
  // nieuw tabblad — zo blijven "wat de klant ziet" en "wat wij afdrukken/opslaan"
  // altijd hetzelfde bestand, in plaats van twee losse opmaken die uit elkaar kunnen
  // gaan lopen. De eigen PDF-weergave van de browser heeft zelf knoppen om af te
  // drukken of op te slaan, dus dat blijft gewoon mogelijk.
  async function afdrukken() {
    // Offerte automatisch opslaan/bijwerken op het moment van afdrukken/PDF maken —
    // de server-PDF wordt namelijk uit de opgeslagen offerte opgebouwd.
    const id = await slaOfferteOp();
    if (!id) {
      window.alert("Opslaan van de offerte is niet gelukt, dus er kan geen PDF worden gemaakt. Probeer het nogmaals.");
      return;
    }

    setPdfBezig(true);
    try {
      const res = await fetch(`/api/teken/${encodeURIComponent(id)}?formaat=pdf`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      // Bewust geen revokeObjectURL meteen: het nieuwe tabblad moet de blob nog kunnen laden.
      window.open(url, "_blank");
    } catch (e) {
      window.alert("PDF maken is niet gelukt. Probeer het nogmaals.");
      return;
    } finally {
      setPdfBezig(false);
    }

    // Vragen of de status naar "Verzonden" mag — maar alleen als dat nog niet de status
    // is (voorkomt onnodig vragen bij elke herafdruk van een reeds verzonden/besproken/
    // geaccepteerde offerte).
    if (huidigeOfferteStatus !== "verzonden") {
      setOfferteVraagStatusTonen(true);
    }
  }

  async function zetOfferteOpVerzonden() {
    if (!huidigeOfferteId) {
      setOfferteVraagStatusTonen(false);
      return;
    }
    try {
      await offerteOpslaan(huidigeOfferteId, {
        status: "verzonden",
        gebruikerNaam: huidigeGebruiker?.naam || "Onbekend",
      });
      setHuidigeOfferteStatus("verzonden");
    } catch (e) {
      // status-wijziging mislukt; blijft op de vorige status staan, kan later via het overzicht
    } finally {
      setOfferteVraagStatusTonen(false);
    }
  }

  // Zorgt dat de offerte een ID heeft (slaat 'm zo nodig eerst op) en geeft dat ID terug —
  // gedeeld door zowel "link kopiëren" als "mailen".
  async function zorgVoorOfferteId() {
    if (huidigeOfferteId) return huidigeOfferteId;
    return await slaOfferteOp();
  }

  // De "maker" van de huidige offerte t.b.v. de automatische cc bij het versturen van de
  // tekenlink-mail: de daadwerkelijke oorspronkelijke maker (uit het opgeslagen record —
  // blijft dus dezelfde persoon ook als een collega de offerte nu heeft geopend), of, voor
  // een gloednieuwe/nog niet opgeslagen offerte, de nu ingelogde gebruiker (die dat bij de
  // eerste opslag alsnog wordt).
  function bepaalOfferteMaker() {
    if (offerteMaker.email) return offerteMaker;
    return { naam: huidigeGebruiker?.naam || "", email: huidigeGebruiker?.email || "" };
  }

  // Genereert (en slaat zo nodig eerst op) de publieke tekenlink, en kopieert 'm naar het
  // klembord. De link bevat geen Microsoft-login-vereiste — het offerte-ID zelf functioneert
  // als toegangssleutel, net zoals bij een gedeelde documentlink.
  async function kopieerTekenLink() {
    const id = await zorgVoorOfferteId();
    if (!id) return;
    const link = `${window.location.origin}/tekenen/${id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      window.prompt("Kopieer deze link handmatig:", link);
    }
    setTekenLinkGekopieerd(true);
    setTimeout(() => setTekenLinkGekopieerd(false), 3000);
  }

  // Opent de eigen mail-app (Outlook/webmail) met een kant-en-klare mail naar de gekozen
  // klant, met de tekenlink erin. Er is bewust geen automatische verzendfunctie gebouwd —
  // dit geeft ruimte om het e-mailadres en de tekst nog even te controleren voor het versturen.
  // Bouwt de bewerkbare conceptmail op basis van de standaard mailtekst (met plaatshouders
  // ingevuld) en opent het bewerkscherm — er wordt nog niets verstuurd.
  function openMailConcept(sleutel, klanten) {
    const groep = Array.isArray(klanten) ? klanten : [klanten];
    const eerste = groep[0];
    const bedrijfsnamen = groep.map((k) => k.naam).join(" en ");
    const onderwerp = `Voorstel tot samenwerken ${afzender.bedrijf}`;
    const tekst = standaardMailtekst
      .replaceAll("{contact}", voornaam(eerste.contact) || bedrijfsnamen || "")
      .replaceAll("{ondertekenaar}", huidigeGebruiker?.naam || "");
    setMailConcepten((prev) => ({ ...prev, [sleutel]: { onderwerp, tekst } }));
    setMailStatus((prev) => ({ ...prev, [sleutel]: undefined }));
    setMailConceptOpenSleutel(sleutel);
  }

  // Verstuurt het (mogelijk aangepaste) concept. De {link}-plaatshouder wordt hier pas
  // definitief vervangen door de echte tekenlink, zodat die niet per ongeluk uit het concept
  // wordt bewerkt/verwijderd zonder dat de gebruiker het doorheeft.
  async function verstuurMailConcept(sleutel, klanten) {
    const groep = Array.isArray(klanten) ? klanten : [klanten];
    const eerste = groep[0];
    const concept = mailConcepten[sleutel];
    if (!concept) return;

    const email = mailAdressen[eerste.id] ?? eerste.email ?? "";
    if (!email.trim()) {
      setMailStatus((prev) => ({ ...prev, [sleutel]: { status: "fout", bericht: "Vul eerst een e-mailadres in." } }));
      return;
    }

    const id = await zorgVoorOfferteId();
    if (!id) return;
    const link = `${window.location.origin}/tekenen/${id}`;
    const volledigeTekst = concept.tekst.replaceAll("{link}", link);

    // Cc opbouwen: automatisch de maker van de offerte, plus (optioneel) het handmatig
    // ingevulde extra adres — beide alleen als ze niet al gelijk zijn aan het "aan"-adres
    // of aan elkaar, zodat niemand dubbel in de mail staat.
    const ccLijst = [];
    const alToegevoegd = new Set([email.trim().toLowerCase()]);
    const makerEmail = bepaalOfferteMaker().email.trim();
    if (makerEmail && !alToegevoegd.has(makerEmail.toLowerCase())) {
      ccLijst.push(makerEmail);
      alToegevoegd.add(makerEmail.toLowerCase());
    }
    const extraCc = (mailCcExtra[sleutel] || "").trim();
    if (extraCc && !alToegevoegd.has(extraCc.toLowerCase())) {
      ccLijst.push(extraCc);
      alToegevoegd.add(extraCc.toLowerCase());
    }

    setMailStatus((prev) => ({ ...prev, [sleutel]: { status: "bezig" } }));
    try {
      const res = await fetch("/api/offertes-verstuur-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naar: email.trim(),
          cc: ccLijst,
          onderwerp: concept.onderwerp,
          tekst: volledigeTekst,
          offerteId: id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMailStatus((prev) => ({ ...prev, [sleutel]: { status: "verzonden", van: data.van, pdfBijgevoegd: data.pdfBijgevoegd } }));
      setMailConceptOpenSleutel(null);
    } catch (e) {
      setMailStatus((prev) => ({ ...prev, [sleutel]: { status: "fout", bericht: e.message } }));
    }
  }

  const kanNaarDiensten = gekozenKlanten.length > 0;
  const kanNaarPrijzen = geselecteerdeEntries.length > 0;
  const kanNaarOfferte = geselecteerdeEntries.length > 0;

  return (
    <div
      style={{
        fontFamily:
          "'Source Sans 3', 'Segoe UI', system-ui, -apple-system, sans-serif",
        background: "#FFFFFF",
        color: "#1C2321",
        minHeight: "100%",
      }}
    >
      <style>{`
        @import url('https://fonts.cdnfonts.com/css/fraunces');
        .offertetool-serif { font-family: 'Fraunces', 'Georgia', serif; }
        .ot-card { background:#fff; border:1px solid #E2E4DF; border-radius: 10px; }
        .ot-btn-primary {
          background:#1C5D8C; color:#F5F6F4; border:1px solid #1C5D8C;
          border-radius: 8px; padding: 10px 18px; font-weight:600; font-size:14px;
          display:inline-flex; align-items:center; gap:8px; cursor:pointer;
          transition: background .15s ease;
        }
        .ot-btn-primary:hover:not(:disabled) { background:#123F5E; }
        .ot-btn-primary:disabled { opacity:.4; cursor:not-allowed; }
        .ot-btn-secondary {
          background:#fff; color:#1C5D8C; border:1px solid #C8CDC5;
          border-radius: 8px; padding: 10px 18px; font-weight:600; font-size:14px;
          display:inline-flex; align-items:center; gap:8px; cursor:pointer;
        }
        .ot-btn-secondary:hover { border-color:#1C5D8C; }
        .ot-btn-ghost {
          background:transparent; color:#1C5D8C; border:none; padding:4px 6px;
          font-weight:600; font-size:12.5px; display:inline-flex; align-items:center; gap:5px; cursor:pointer;
        }
        .ot-btn-ghost:hover { text-decoration:underline; }
        .ot-input {
          border:1px solid #C8CDC5; border-radius:8px; padding:9px 12px; font-size:14px;
          width:100%; background:#fff; color:#1C2321;
        }
        .ot-input:focus { outline:2px solid #B98237; outline-offset:1px; }
        .ot-input:disabled { background:#F0F0EC; color:#A5AA9F; }
        .ot-label { font-size:12px; font-weight:600; color:#5B6259; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block; }
        .ot-pill {
          border:1.5px solid #C8CDC5; background:#fff; color:#1C2321; border-radius:20px;
          padding:6px 13px; font-size:12.5px; font-weight:600; cursor:pointer;
        }
        .ot-pill.actief { border-color:#1C5D8C; background:#1C5D8C; color:#fff; }
        .ot-cat-koptekst {
          font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
          color:#B98237; margin: 26px 0 10px; display:flex; align-items:center; justify-content:space-between;
        }
        .ot-cat-koptekst:first-child { margin-top:0; }
        .ot-tweekolommen { display:grid; grid-template-columns: 1fr 1fr; gap:24px; }
        @media (max-width: 560px) {
          .ot-tweekolommen { grid-template-columns: 1fr; gap:16px; }
        }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          body * { visibility: hidden; }
          #offerte-print-gebied, #offerte-print-gebied * { visibility: visible; }
          #offerte-print-gebied {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .offerte-doc { break-after: page; page-break-after: always; margin-bottom: 0 !important; }
          .offerte-doc:last-of-type { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      {/* Stappenbalk */}
      {ingelogd && (
        <div style={{ borderBottom: "1px solid #E2E4DF", background: "#FBFBF9" }}>
          <div
            style={{
              maxWidth: 1600,
              margin: "0 auto",
              padding: "14px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {STAPPEN.filter((s) => s.key !== "login").map((s) => {
                const actief = s.key === stap;
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStap(s.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      background: actief ? "#1C5D8C" : "transparent",
                      color: actief ? "#fff" : "#1C5D8C",
                      padding: "7px 12px",
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Icon size={14} />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={openOffertesOverzicht}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #C8CDC5",
                  background: stap === "offertes" ? "#1C5D8C" : "#fff",
                  color: stap === "offertes" ? "#fff" : "#5B6259",
                  padding: "7px 12px",
                  borderRadius: 20,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <List size={14} />
                Offertes
              </button>
              <button
                onClick={openOpdrachtbevestigingenOverzicht}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #C8CDC5",
                  background: stap === "opdrachtbevestigingen" ? "#1C5D8C" : "#fff",
                  color: stap === "opdrachtbevestigingen" ? "#fff" : "#5B6259",
                  padding: "7px 12px",
                  borderRadius: 20,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <List size={14} />
                Opdrachtbevestigingen
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "36px 24px 60px" }}>
        {/* -------------------- LOGIN -------------------- */}
        {stap === "login" && !authGecontroleerd && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 80, color: "#8A9089", fontSize: 13.5 }}>
            Bezig met inloggen controleren…
          </div>
        )}
        {stap === "login" && authGecontroleerd && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <div className="ot-card" style={{ width: 420, padding: 36, textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  background: "#F0EEE6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 18px",
                }}
              >
                <Building2 size={26} color="#1C5D8C" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
                Welkom bij de offertetool
              </h1>
              <p style={{ fontSize: 13.5, color: "#5B6259", marginBottom: 26, lineHeight: 1.5 }}>
                Meld u aan met uw Microsoft-account. Uw rechten in Dynamics bepalen welke
                klanten en gegevens u kunt ophalen.
              </p>
              <button
                className="ot-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={startLogin}
                disabled={bezigMetInloggen}
              >
                {bezigMetInloggen ? (
                  <>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Rechten controleren…
                  </>
                ) : (
                  <>
                    <MicrosoftLogo />
                    Aanmelden met Microsoft
                  </>
                )}
              </button>
              <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
              <p style={{ fontSize: 11.5, color: "#A5AA9F", marginTop: 18 }}>
                Dit is een demo-omgeving met voorbeelddata. Er wordt geen echte
                Microsoft-verbinding gemaakt.
              </p>
            </div>
          </div>
        )}

        {/* -------------------- INSTELLINGEN / AFZENDER -------------------- */}
        {stap === "instellingen" && (
          <StapWrapper
            titel="Instellingen"
            toelichting="Alle beheerschermen van de offertetool zijn hier verzameld — zo kunnen we dit later eenvoudig per functie/rol afschermen."
          >
            <OverigBeheerBalk
              actief={stap}
              onCatalogus={openCatalogus}
              onTeksten={openTeksten}
              onVoorwaarden={openVoorwaarden}
              onRoadmap={openRoadmap}
              onOpdrachtbevestigingTeksten={openOpdrachtbevestigingTeksten}
            />

            {benIkBeheerderGeladen && !benIkBeheerder ? (
              <div className="ot-card" style={{ padding: 24, marginTop: 8 }}>
                <p style={{ fontSize: 13.5, color: "#5B6259", margin: 0 }}>
                  Deze instellingen zijn alleen zichtbaar voor beheerders. Vraag een beheerder (bijv.
                  automatisering@activaa.nl) als hier iets aangepast moet worden.
                </p>
              </div>
            ) : (
              <>
            <label className="ot-label" style={{ marginBottom: 2, display: "block", fontSize: 15, fontWeight: 700 }}>
              Wie schrijven we aan namens?
            </label>
            <p style={{ fontSize: 13.5, color: "#5B6259", marginTop: 4, marginBottom: 16 }}>
              Deze gegevens komen op elke offerte te staan. Standaard ingevuld vanuit Activaa CRM - profiel — je kunt ze per offerte aanpassen.
            </p>
            <div className="ot-card" style={{ padding: 24, display: "grid", gap: 16 }}>
              <div>
                <label className="ot-label">Logo</label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 10,
                      border: "1px dashed #C8CDC5",
                      background: "#FBFBF9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {logo ? (
                      <img src={logo} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                      <Building2 size={24} color="#B4B9AE" />
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label className="ot-btn-secondary" style={{ width: "fit-content", cursor: "pointer" }}>
                      <ImageUp size={15} />
                      {logo ? "Ander logo kiezen" : "Logo kiezen"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => logoUploaden(e.target.files?.[0])}
                        style={{ display: "none" }}
                      />
                    </label>
                    {logo && (
                      <button className="ot-btn-ghost" style={{ width: "fit-content" }} onClick={logoVerwijderen}>
                        Logo verwijderen
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 11.5, color: "#8A9089", marginTop: 8 }}>
                  Verschijnt in de menubalk en op elke offerte. Een PNG met transparante achtergrond werkt het best. Wordt automatisch bewaard, ook na herladen of opnieuw inloggen.
                </p>
              </div>
              <div>
                <label className="ot-label">Favicon (icoontje in de browsertab)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      border: "1px dashed #C8CDC5",
                      background: "#FBFBF9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {favicon ? (
                      <img src={favicon} alt="Favicon" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                      <ImageUp size={18} color="#B4B9AE" />
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label className="ot-btn-secondary" style={{ width: "fit-content", cursor: "pointer" }}>
                      <ImageUp size={15} />
                      Favicon wijzigen
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => faviconUploaden(e.target.files?.[0])}
                        style={{ display: "none" }}
                      />
                    </label>
                    {favicon && favicon !== ACTIVAA_FAVICON && (
                      <button className="ot-btn-ghost" style={{ width: "fit-content" }} onClick={faviconVerwijderen}>
                        Terugzetten naar standaard
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 11.5, color: "#8A9089", marginTop: 8 }}>
                  Los in te stellen van het logo, omdat een favicon vaak leesbaarder is als eenvoudig icoon. Wordt net als
                  het logo automatisch bewaard voor iedereen.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="ot-label">Bedrijfsnaam</label>
                  <input className="ot-input" value={afzender.bedrijf} onChange={(e) => setAfzender({ ...afzender, bedrijf: e.target.value })} />
                </div>
                <div>
                  <label className="ot-label">KvK-nummer</label>
                  <input className="ot-input" value={afzender.kvk} onChange={(e) => setAfzender({ ...afzender, kvk: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="ot-label">Adres (straat en huisnummer)</label>
                <input className="ot-input" value={afzender.adres} onChange={(e) => setAfzender({ ...afzender, adres: e.target.value })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
                <div>
                  <label className="ot-label">Postcode</label>
                  <input className="ot-input" value={afzender.postcode} onChange={(e) => setAfzender({ ...afzender, postcode: e.target.value })} />
                </div>
                <div>
                  <label className="ot-label">Plaats</label>
                  <input className="ot-input" value={afzender.plaats} onChange={(e) => setAfzender({ ...afzender, plaats: e.target.value })} />
                </div>
              </div>
              <div
                style={{
                  padding: "12px 14px",
                  background: "#EAF2F8",
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: "#1C5D8C",
                }}
              >
                <strong>Ondertekenaar (Namens):</strong> {huidigeGebruiker.naam}
                {huidigeGebruiker.email && huidigeGebruiker.email !== huidigeGebruiker.naam
                  ? ` · ${huidigeGebruiker.email}`
                  : ""}
                <div style={{ color: "#5B6259", marginTop: 2 }}>
                  Dit wordt automatisch bepaald aan de hand van wie is ingelogd — elke collega ziet hier zichzelf staan.
                </div>
              </div>
            </div>

            <div className="ot-card" style={{ padding: 24, marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <label className="ot-label" style={{ marginBottom: 2 }}>Geldigheid offerte</label>
                <p style={{ fontSize: 12.5, color: "#8A9089", margin: 0 }}>
                  Aantal dagen dat een offerte geldig is nadat deze is opgesteld.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="ot-input"
                  type="number"
                  min="1"
                  style={{ width: 90, textAlign: "right" }}
                  value={afzender.geldigheid}
                  onChange={(e) => setAfzender({ ...afzender, geldigheid: e.target.value })}
                />
                <span style={{ fontSize: 13.5, color: "#5B6259" }}>dagen</span>
              </div>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Webhooks</span>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <label className="ot-label" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={14} />
                Offerte — webhook bij acceptatie
              </label>
              <p style={{ fontSize: 12.5, color: "#8A9089", marginTop: 4, marginBottom: 10 }}>
                Zodra een klant een offerte accepteert (ondertekent met akkoord), stuurt de tool een
                POST-verzoek met de offertegegevens (klant, ondertekenaar, bedrag) naar deze URL — bijvoorbeeld
                de trigger-URL van een Power Automate-flow "Wanneer een HTTP-aanvraag wordt ontvangen". Het
                Dynamics-account-ID van de klant wordt daarbij ook als <code>?ID=</code>-parameter aan de URL
                zelf toegevoegd (naast de offertegegevens in de body). Laat leeg om dit uit te laten.
              </p>
              <input
                className="ot-input"
                type="url"
                placeholder="https://prod-00.westeurope.logic.azure.com/workflows/..."
                value={webhookAcceptatie}
                onChange={(e) => setWebhookAcceptatie(e.target.value)}
              />
            </div>
            <div className="ot-card" style={{ padding: 24, marginTop: 16 }}>
              <label className="ot-label" style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={14} />
                Opdrachtbevestiging — webhook bij ondertekening
              </label>
              <p style={{ fontSize: 12.5, color: "#8A9089", marginTop: 4, marginBottom: 10 }}>
                Zelfde werking als de offerte-webhook hierboven — het Dynamics-accountid komt als{" "}
                <code>?ID=</code> op de URL, en de body bevat het document-ID, klant, ondertekenaar, tekenlink en
                bedrag. Los in te stellen van de offerte-webhook; leeg = uitgeschakeld.
              </p>
              <input
                className="ot-input"
                type="url"
                placeholder="https://prod-00.westeurope.logic.azure.com/workflows/..."
                value={webhookOpdrachtbevestiging}
                onChange={(e) => setWebhookOpdrachtbevestiging(e.target.value)}
              />
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Offerte — taak bij ondertekening</span>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 16, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!taakInstellingenOfferte.actief}
                  onChange={(e) => setTaakInstellingenOfferte((prev) => ({ ...prev, actief: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#1C5D8C" }}
                />
                Taak aanmaken bij ondertekening — {taakInstellingenOfferte.actief ? "aan" : "uit"}
              </label>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: "0 0 14px" }}>
                Staat standaard aan (ongewijzigd bestaand gedrag) — onderwerp en categorie zijn instelbaar in plaats
                van vast. Eigenaar van de taak blijft de relatiebeheerder van de klant.
              </p>
              <div className="ot-tweekolommen">
                <div>
                  <label className="ot-label">Taak — onderwerp</label>
                  <input
                    className="ot-input"
                    value={taakInstellingenOfferte.onderwerp}
                    onChange={(e) => setTaakInstellingenOfferte((prev) => ({ ...prev, onderwerp: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="ot-label">Taak — categorie (soort actiecategorie)</label>
                  <TaakCategorieSelect
                    waarde={taakInstellingenOfferte.categorie}
                    onChange={(code) => setTaakInstellingenOfferte((prev) => ({ ...prev, categorie: code }))}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: "#8A9089", margin: "10px 0 0" }}>
                Dit zijn de categorieën die tot nu toe zijn tegengekomen in de koppeling — gebruikt Activaa er meer,
                dan kunnen die met "Andere code…" alsnog ingevuld worden.
              </p>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Opdrachtbevestiging — taak bij ondertekening</span>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 16, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!taakInstellingenOpdrachtbevestiging.actief}
                  onChange={(e) => setTaakInstellingenOpdrachtbevestiging((prev) => ({ ...prev, actief: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#1C5D8C" }}
                />
                Taak aanmaken bij ondertekening — {taakInstellingenOpdrachtbevestiging.actief ? "aan" : "uit"}
              </label>
              <div className="ot-tweekolommen">
                <div>
                  <label className="ot-label">Taak — onderwerp</label>
                  <input
                    className="ot-input"
                    value={taakInstellingenOpdrachtbevestiging.onderwerp}
                    onChange={(e) => setTaakInstellingenOpdrachtbevestiging((prev) => ({ ...prev, onderwerp: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="ot-label">Taak — categorie (soort actiecategorie)</label>
                  <TaakCategorieSelect
                    waarde={taakInstellingenOpdrachtbevestiging.categorie}
                    onChange={(code) => setTaakInstellingenOpdrachtbevestiging((prev) => ({ ...prev, categorie: code }))}
                  />
                </div>
              </div>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Automatisch concept — taak bij verlopen tarieven</span>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 16, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!taakInstellingenVerlopenConcept.actief}
                  onChange={(e) => setTaakInstellingenVerlopenConcept((prev) => ({ ...prev, actief: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#1C5D8C" }}
                />
                Taak aanmaken bij automatisch concept — {taakInstellingenVerlopenConcept.actief ? "aan" : "uit"}
              </label>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: "0 0 14px" }}>
                Zodra de tool automatisch een concept-vervolg-opdrachtbevestiging klaarzet na een
                verstreken einddatum van de tarieven (zie de wizard), wordt — als deze schakelaar
                aanstaat (standaard: aan) — ook een taak in Dynamics aangemaakt bij de klant, zodat
                dit niet onopgemerkt blijft tussen de rest van het overzicht.
              </p>
              <div className="ot-tweekolommen">
                <div>
                  <label className="ot-label">Taak — onderwerp</label>
                  <input
                    className="ot-input"
                    value={taakInstellingenVerlopenConcept.onderwerp}
                    onChange={(e) => setTaakInstellingenVerlopenConcept((prev) => ({ ...prev, onderwerp: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="ot-label">Taak — categorie (soort actiecategorie)</label>
                  <TaakCategorieSelect
                    waarde={taakInstellingenVerlopenConcept.categorie}
                    onChange={(code) => setTaakInstellingenVerlopenConcept((prev) => ({ ...prev, categorie: code }))}
                  />
                </div>
              </div>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>SharePoint-opslag na ondertekening</span>
            </div>
            <div className="ot-card" style={{ padding: 24, background: "#F5F6F4" }}>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: 0 }}>
                Geen aparte instelling nodig: net als bij offerte wordt de getekende opdrachtbevestiging
                automatisch geüpload naar de SharePoint-map uit het <code>cr283_sharepoint</code>-veld van de klant
                in Dynamics — dezelfde koppeling die er al is, nu ook voor opdrachtbevestiging.
              </p>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Opdrachtbevestiging — tarieven naar Dataverse</span>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 16, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!tariefInstellingenOpdrachtbevestiging.actief}
                  onChange={(e) => setTariefInstellingenOpdrachtbevestiging((prev) => ({ ...prev, actief: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#1C5D8C" }}
                />
                Tarieven wegschrijven bij ondertekening — {tariefInstellingenOpdrachtbevestiging.actief ? "aan" : "uit"}
              </label>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: 0 }}>
                Schrijft bij een akkoord-ondertekening per klant een "Opdrachtbevestiging"-rij en per gekozen dienst
                een "Tarief"-rij (met looptijd) weg naar Dataverse, met een eigen kenmerk per opdrachtbevestiging.
                Staat standaard uit — zet dit pas aan nadat de tabellen zijn aangemaakt via het eenmalige
                opzet-endpoint (zie README, sectie "Tarieven-registratie in Dataverse opzetten"), anders mislukt het
                wegschrijven stil op de achtergrond (net als bij een niet-ingevuld SharePoint-veld).
              </p>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Tarieven — kolom-koppeling in Dataverse</span>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: "0 0 16px" }}>
                Bepaalt per dienst naar welke kolom van de "Tarief"-tabel (cr283_tarief) het bedrag en de
                dienstomschrijving worden geschreven. Elke dienst staat standaard op de kolommen die het
                opzet-endpoint zelf aanmaakt (leeg laten = die standaardkolom) — pas dit per dienst alleen aan
                als je liever een andere, zelf beheerde kolom gebruikt. Komt er een nieuwe dienst bij de
                catalogus, dan verschijnt die hier automatisch als nieuwe regel.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Dienst</th>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Kolom voor bedrag</th>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Kolom voor omschrijving</th>
                    {benIkBeheerder && (
                      <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dienstenCatalogus.map((dienst) => {
                    const rij = tariefKolomMapping[dienst.id] || {};
                    const catNaam = categorieen.find((c) => c.id === dienst.categorie)?.naam;
                    const kolomStatus = kolomAanmakenStatus[dienst.id] || {};
                    return (
                      <tr key={dienst.id} style={{ borderBottom: "1px solid #F0EEE6" }}>
                        <td style={{ padding: "8px 4px", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{dienst.naam}</div>
                          {catNaam && <div style={{ fontSize: 11.5, color: "#8A9089" }}>{catNaam}</div>}
                        </td>
                        <td style={{ padding: "8px 4px", verticalAlign: "top" }}>
                          <input
                            type="text"
                            className="ot-input"
                            value={rij.bedragKolom || ""}
                            onChange={(e) => bijwerkTariefKolomVoorDienst(dienst.id, "bedragKolom", e.target.value)}
                            placeholder={TARIEF_KOLOM_MAPPING_STANDAARD.bedragKolom}
                          />
                        </td>
                        <td style={{ padding: "8px 4px", verticalAlign: "top" }}>
                          <input
                            type="text"
                            className="ot-input"
                            value={rij.omschrijvingKolom || ""}
                            onChange={(e) => bijwerkTariefKolomVoorDienst(dienst.id, "omschrijvingKolom", e.target.value)}
                            placeholder={TARIEF_KOLOM_MAPPING_STANDAARD.omschrijvingKolom}
                          />
                        </td>
                        {benIkBeheerder && (
                          <td style={{ padding: "8px 4px", verticalAlign: "top" }}>
                            <button
                              className="ot-btn-secondary"
                              onClick={() => maakDataverseKolomAan(dienst)}
                              disabled={kolomStatus.bezig}
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {kolomStatus.bezig ? "Bezig…" : "Kolom aanmaken in Dataverse"}
                            </button>
                            {kolomStatus.fout && (
                              <p style={{ fontSize: 11.5, color: "#B3261E", margin: "6px 0 0", maxWidth: 220 }}>{kolomStatus.fout}</p>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {dienstenCatalogus.length === 0 && (
                    <tr>
                      <td colSpan={benIkBeheerder ? 4 : 3} style={{ padding: "10px 4px", fontSize: 12.5, color: "#8A9089" }}>
                        Nog geen diensten in de catalogus.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "#8A9089", margin: "12px 0 0" }}>
                "Kolom aanmaken in Dataverse" maakt een eigen bedrag- en omschrijvingkolom voor deze dienst aan
                (via dezelfde Metadata-API als het eenmalige opzet-endpoint) en vult de velden hierboven meteen
                automatisch in. Dit vereist dat de Application User permanent de systeemrol "System Customizer"
                (of hoger) heeft — zie README.md.
              </p>
              <p style={{ fontSize: 12, color: "#8A9089", margin: "12px 0 0" }}>
                Gebruik de logische (technische) kolomnaam uit Dataverse, bijv. "cr283_prijs" — niet de weergavenaam.
                Let op: "cr283_dienstomschrijving" is ook de naamgevende kolom van de Tarief-tabel; deze wordt hoe dan
                ook altijd gevuld (voor een leesbare recordnaam in Dataverse), ook als je hier voor een dienst een
                andere kolom kiest — in dat geval krijgt die andere kolom de omschrijving er dan bovenop. Onbekende
                of foutief overlappende kolomnamen worden bij het wegschrijven genegeerd en dan wordt stilzwijgend
                teruggevallen op de standaardkolom.
              </p>
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Tarieven — Dataverse inzien</span>
            </div>
            <div className="ot-card" style={{ padding: 24, marginBottom: 16 }}>
              <label className="ot-label">Verbinding testen</label>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: "0 0 12px" }}>
                Controleert of de tool daadwerkelijk bij Dynamics kan inloggen en of de tabellen
                "Opdrachtbevestiging" en "Tarief" bestaan — handig om te checken na de eenmalige opzet, zonder in de
                Power Apps-portal te hoeven kijken.
              </p>
              <button className="ot-btn-secondary" onClick={testDataverseVerbinding} disabled={dataverseStatusBezig}>
                {dataverseStatusBezig ? "Bezig…" : "Verbinding testen"}
              </button>
              {dataverseStatusFout && (
                <p style={{ fontSize: 12.5, color: "#B3261E", margin: "12px 0 0" }}>{dataverseStatusFout}</p>
              )}
              {dataverseStatusResultaat && dataverseStatusResultaat.ok && (
                <div style={{ fontSize: 12.5, color: "#2E7D4F", margin: "12px 0 0", lineHeight: 1.7 }}>
                  ✓ Verbonden met Dynamics.
                  <br />
                  {dataverseStatusResultaat.opdrachtbevestigingTabelBestaat
                    ? `✓ Tabel "Opdrachtbevestiging" bestaat (${dataverseStatusResultaat.aantalOpdrachtbevestigingen ?? "?"} rijen).`
                    : "✗ Tabel \"Opdrachtbevestiging\" bestaat nog niet — draai het opzet-endpoint (zie README)."}
                  <br />
                  {dataverseStatusResultaat.tariefTabelBestaat
                    ? `✓ Tabel "Tarief" bestaat (${dataverseStatusResultaat.aantalTarieven ?? "?"} rijen).`
                    : "✗ Tabel \"Tarief\" bestaat nog niet — draai het opzet-endpoint (zie README)."}
                </div>
              )}
            </div>

            <div className="ot-card" style={{ padding: 24 }}>
              <label className="ot-label">Weggeschreven tarieven bekijken</label>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: "0 0 12px" }}>
                Haalt de daadwerkelijke cr283_tarief-rijen op uit Dataverse — optioneel gefilterd op klant (leeg =
                de meest recente 200 rijen, ongeacht klant).
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                <div style={{ flex: "1 1 220px" }}>
                  <label className="ot-label">Klant zoeken (optioneel)</label>
                  <input
                    type="text"
                    className="ot-input"
                    value={dataverseOverzichtZoekterm}
                    onChange={(e) => setDataverseOverzichtZoekterm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && zoekKlantVoorDataverseOverzicht()}
                    placeholder="Klantnaam…"
                  />
                </div>
                <button
                  className="ot-btn-secondary"
                  onClick={zoekKlantVoorDataverseOverzicht}
                  disabled={dataverseOverzichtKlantZoekenBezig || !dataverseOverzichtZoekterm.trim()}
                >
                  {dataverseOverzichtKlantZoekenBezig ? "Zoeken…" : "Zoeken"}
                </button>
              </div>
              {dataverseOverzichtKlantOpties.length > 0 && (
                <select
                  className="ot-input"
                  style={{ marginBottom: 12 }}
                  value={dataverseOverzichtKlantId}
                  onChange={(e) => setDataverseOverzichtKlantId(e.target.value)}
                >
                  <option value="">Alle klanten</option>
                  {dataverseOverzichtKlantOpties.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.naam}
                    </option>
                  ))}
                </select>
              )}
              <div>
                <button className="ot-btn-primary" onClick={haalDataverseTarievenOverzichtOp} disabled={dataverseOverzichtBezig}>
                  {dataverseOverzichtBezig ? "Ophalen…" : "Tarieven ophalen"}
                </button>
              </div>
              {dataverseOverzichtFout && (
                <p style={{ fontSize: 12.5, color: "#B3261E", margin: "12px 0 0" }}>{dataverseOverzichtFout}</p>
              )}
              {dataverseOverzichtResultaat && (
                <div style={{ marginTop: 16, overflowX: "auto" }}>
                  {dataverseOverzichtResultaat.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "#8A9089" }}>Geen tarieven gevonden.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ background: "#F0EEE6", textAlign: "left" }}>
                          <th style={{ padding: "8px 10px" }}>Dienst</th>
                          <th style={{ padding: "8px 10px" }}>Bedrag</th>
                          <th style={{ padding: "8px 10px" }}>Eenheid</th>
                          <th style={{ padding: "8px 10px" }}>Aantal</th>
                          <th style={{ padding: "8px 10px" }}>Van</th>
                          <th style={{ padding: "8px 10px" }}>Tot en met</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataverseOverzichtResultaat.map((t, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #E2E4DF" }}>
                            <td style={{ padding: "8px 10px" }}>{t.dienstomschrijving || "—"}</td>
                            <td style={{ padding: "8px 10px" }}>{typeof t.bedrag === "number" ? currency(t.bedrag) : "—"}</td>
                            <td style={{ padding: "8px 10px" }}>{t.eenheid || "—"}</td>
                            <td style={{ padding: "8px 10px" }}>{t.aantal ?? "—"}</td>
                            <td style={{ padding: "8px 10px" }}>{t.looptijdvan ? new Date(t.looptijdvan).toLocaleDateString("nl-NL") : "—"}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {t.looptijdtotenmet ? new Date(t.looptijdtotenmet).toLocaleDateString("nl-NL") : "actief"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
              <span>Medewerkers &amp; beheerders</span>
              <button className="ot-btn-ghost" onClick={voegMedewerkerToe}>
                <PlusCircle size={14} />
                Medewerker toevoegen
              </button>
            </div>
            <div className="ot-card" style={{ padding: 24 }}>
              <p style={{ fontSize: 12.5, color: "#5B6259", margin: "0 0 16px" }}>
                Bepaalt wie het Instellingen-scherm mag zien en wie op verzoek een eigen Dataverse-kolom mag
                aanmaken (rol "Beheerder"). automatisering@activaa.nl en alings@activaa.nl zijn altijd beheerder,
                ook als ze hieronder niet (meer) voorkomen.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Naam</th>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>E-mail</th>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Telefoonnummer</th>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Functie</th>
                    <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Rol</th>
                    <th style={{ borderBottom: "1px solid #E2E4DF" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {medewerkers.map((mw) => (
                    <tr key={mw.id} style={{ borderBottom: "1px solid #F0EEE6" }}>
                      <td style={{ padding: "8px 4px" }}>
                        <input type="text" className="ot-input" value={mw.naam} onChange={(e) => bijwerkMedewerker(mw.id, "naam", e.target.value)} placeholder="Naam" />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input type="email" className="ot-input" value={mw.email} onChange={(e) => bijwerkMedewerker(mw.id, "email", e.target.value)} placeholder="naam@activaa.nl" />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input type="text" className="ot-input" value={mw.telefoonnummer} onChange={(e) => bijwerkMedewerker(mw.id, "telefoonnummer", e.target.value)} placeholder="06-12345678" />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input type="text" className="ot-input" value={mw.functie} onChange={(e) => bijwerkMedewerker(mw.id, "functie", e.target.value)} placeholder="Functie" />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <select className="ot-input" value={mw.rol} onChange={(e) => bijwerkMedewerker(mw.id, "rol", e.target.value)}>
                          <option value="normaal">Normaal</option>
                          <option value="beheerder">Beheerder</option>
                        </select>
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <button
                          onClick={() => verwijderMedewerker(mw.id)}
                          title="Medewerker verwijderen"
                          style={{ border: "1px solid #E2C4B0", background: "#FBF2EC", color: "#B14A2E", borderRadius: 8, padding: 9, cursor: "pointer", display: "flex" }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {medewerkers.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "10px 4px", fontSize: 12.5, color: "#8A9089" }}>
                        Nog geen medewerkers toegevoegd — alleen de vaste noodbeheerders (automatisering@activaa.nl,
                        alings@activaa.nl) hebben op dit moment toegang.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 22 }}>
              <button className="ot-btn-secondary" onClick={() => setStap(terugNaarStap)}>
                <ChevronLeft size={15} />
                Terug
              </button>
            </div>
          </StapWrapper>
        )}

        {/* -------------------- CATALOGUS BEHEREN -------------------- */}
        {stap === "catalogus" && (
          <StapWrapper
            titel="Dienstencatalogus beheren"
            toelichting="Optioneel: onderhoud hier alle diensten met hun categorie, varianten en prijzen. U hoeft dit niet elke keer te doorlopen — wijzigingen gelden meteen voor nieuwe offertes."
          >
            <OverigBeheerBalk
              actief={stap}
              onCatalogus={openCatalogus}
              onTeksten={openTeksten}
              onVoorwaarden={openVoorwaarden}
              onRoadmap={openRoadmap}
              onOpdrachtbevestigingTeksten={openOpdrachtbevestigingTeksten}
            />

            <div className="ot-cat-koptekst">
              <span>Categorieën</span>
              <button className="ot-btn-ghost" onClick={voegCategorieToe}>
                <PlusCircle size={14} />
                Categorie toevoegen
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#8A9089", margin: "0 0 12px" }}>
              Zelf te beheren indeling ("kolommen") waarin diensten worden getoond — hier, bij het
              kiezen van diensten, en op de offerte/opdrachtbevestiging zelf. De volgorde hieronder
              bepaalt ook de volgorde waarin categorieën daar verschijnen.
            </p>
            <div style={{ display: "grid", gap: 8, marginBottom: 28 }}>
              {categorieen.map((cat, i) => {
                const naamLeeg = !(cat.naam || "").trim();
                const aantalDiensten = dienstenCatalogus.filter((d) => d.categorie === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="ot-card"
                    style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, borderColor: naamLeeg ? "#E2A03F" : undefined }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button
                        onClick={() => verplaatsCategorie(cat.id, -1)}
                        disabled={i === 0}
                        title="Naar boven verplaatsen"
                        style={{ border: "1px solid #C8CDC5", background: "#fff", borderRadius: 6, padding: "3px 6px", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.35 : 1, display: "flex" }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        onClick={() => verplaatsCategorie(cat.id, 1)}
                        disabled={i === categorieen.length - 1}
                        title="Naar beneden verplaatsen"
                        style={{ border: "1px solid #C8CDC5", background: "#fff", borderRadius: 6, padding: "3px 6px", cursor: i === categorieen.length - 1 ? "default" : "pointer", opacity: i === categorieen.length - 1 ? 0.35 : 1, display: "flex" }}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        className="ot-input"
                        placeholder="Naam van de categorie…"
                        value={cat.naam}
                        onChange={(e) => bijwerkCategorieNaam(cat.id, e.target.value)}
                        style={naamLeeg ? { borderColor: "#E2A03F" } : undefined}
                      />
                      {naamLeeg && (
                        <p style={{ fontSize: 11.5, color: "#B14A2E", margin: "4px 0 0" }}>
                          ⚠ Geef deze categorie een naam — zonder naam is hij niet bruikbaar op offerte/opdrachtbevestiging.
                        </p>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#8A9089", whiteSpace: "nowrap" }}>
                      {aantalDiensten} {aantalDiensten === 1 ? "dienst" : "diensten"}
                    </div>
                    <button
                      onClick={() => verwijderCategorie(cat.id)}
                      disabled={aantalDiensten > 0}
                      title={aantalDiensten > 0 ? "Verplaats eerst alle diensten naar een andere categorie" : "Categorie verwijderen"}
                      style={{ border: "1px solid #E2C4B0", background: "#FBF2EC", color: "#B14A2E", borderRadius: 8, padding: 9, cursor: aantalDiensten > 0 ? "default" : "pointer", opacity: aantalDiensten > 0 ? 0.35 : 1, display: "flex" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {categorieen.length === 0 && (
                <p style={{ fontSize: 12.5, color: "#8A9089" }}>Nog geen categorieën — voeg er hierboven een toe.</p>
              )}
            </div>

            {dienstenZonderCategorie.length > 0 && (
              <div className="ot-card" style={{ padding: 16, marginBottom: 24, borderColor: "#E2A03F", background: "#FCF6E8" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#8A6A1E", marginBottom: 6 }}>
                  ⚠ {dienstenZonderCategorie.length} {dienstenZonderCategorie.length === 1 ? "dienst heeft" : "diensten hebben"} geen geldige categorie
                </div>
                <p style={{ fontSize: 12.5, color: "#5B6259", margin: 0 }}>
                  {dienstenZonderCategorie.map((d) => d.naam).join(", ")} — waarschijnlijk doordat de
                  categorie is verwijderd. Kies hieronder bij de betreffende dienst een nieuwe
                  categorie (herkenbaar aan de rode rand bij "Categorie").
                </p>
              </div>
            )}

            {categorieen.map((cat) => (
              <div key={cat.id}>
                <div className="ot-cat-koptekst">
                  <span>{(cat.naam || "").trim() || "Naamloze categorie"}</span>
                  <button className="ot-btn-ghost" onClick={() => voegDienstToe(cat.id)}>
                    <PlusCircle size={14} />
                    Dienst toevoegen
                  </button>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {dienstenCatalogus
                    .filter((d) => d.categorie === cat.id)
                    .map((dienst, i, lijst) => (
                      <div key={dienst.id} className="ot-card" style={{ padding: 18 }}>
                        <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button
                              onClick={() => verplaatsDienst(dienst.id, -1)}
                              disabled={i === 0}
                              title="Naar boven verplaatsen"
                              style={{
                                border: "1px solid #C8CDC5",
                                background: "#fff",
                                borderRadius: 6,
                                padding: "3px 6px",
                                cursor: i === 0 ? "default" : "pointer",
                                opacity: i === 0 ? 0.35 : 1,
                                display: "flex",
                              }}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => verplaatsDienst(dienst.id, 1)}
                              disabled={i === lijst.length - 1}
                              title="Naar beneden verplaatsen"
                              style={{
                                border: "1px solid #C8CDC5",
                                background: "#fff",
                                borderRadius: 6,
                                padding: "3px 6px",
                                cursor: i === lijst.length - 1 ? "default" : "pointer",
                                opacity: i === lijst.length - 1 ? 0.35 : 1,
                                display: "flex",
                              }}
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <div style={{ flex: 2 }}>
                            <label className="ot-label">Dienstnaam</label>
                            <input
                              className="ot-input"
                              value={dienst.naam}
                              onChange={(e) => bijwerkDienstVeld(dienst.id, "naam", e.target.value)}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="ot-label">Eenheid</label>
                            <input
                              className="ot-input"
                              value={dienst.eenheid}
                              onChange={(e) => bijwerkDienstVeld(dienst.id, "eenheid", e.target.value)}
                            />
                          </div>
                          {dienst.gebruikAantallen !== false && (
                            <>
                              <div style={{ flex: 1 }}>
                                <label className="ot-label">Standaard aantal</label>
                                <input
                                  className="ot-input"
                                  type="number"
                                  min="1"
                                  value={dienst.standaardAantal || 1}
                                  onChange={(e) =>
                                    bijwerkDienstVeld(dienst.id, "standaardAantal", Math.max(1, Number(e.target.value) || 1))
                                  }
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label className="ot-label">Standaard factor</label>
                                <input
                                  className="ot-input"
                                  type="number"
                                  min="1"
                                  value={dienst.standaardFactor || 1}
                                  onChange={(e) =>
                                    bijwerkDienstVeld(dienst.id, "standaardFactor", Math.max(1, Number(e.target.value) || 1))
                                  }
                                />
                              </div>
                            </>
                          )}
                          <button
                            onClick={() => verwijderDienst(dienst.id)}
                            title="Dienst verwijderen"
                            style={{ border: "1px solid #E2C4B0", background: "#FBF2EC", color: "#B14A2E", borderRadius: 8, padding: 9, cursor: "pointer", display: "flex" }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                          <div style={{ flex: 1 }}>
                            <label className="ot-label">Categorie</label>
                            <select
                              className="ot-input"
                              value={dienst.categorie}
                              onChange={(e) => bijwerkDienstVeld(dienst.id, "categorie", e.target.value)}
                              style={!categorieen.some((c) => c.id === dienst.categorie) ? { borderColor: "#B14A2E" } : undefined}
                            >
                              {!categorieen.some((c) => c.id === dienst.categorie) && (
                                <option value={dienst.categorie}>⚠ Onbekende categorie ({dienst.categorie})</option>
                              )}
                              {categorieen.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {(c.naam || "").trim() || "Naamloze categorie"}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="ot-label" title="Los van de categorie hierboven: alleen gebruikt bij het wegschrijven van tarieven naar Dataverse (cr283_categorie), dat een vast optieveld met 2 waarden heeft.">
                              Boekhoudkundige aard (Dataverse)
                            </label>
                            <select
                              className="ot-input"
                              value={dienst.dataverseSoort || (dienst.categorie === "doorlopend" ? "doorlopend" : "eenmalig")}
                              onChange={(e) => bijwerkDienstVeld(dienst.id, "dataverseSoort", e.target.value)}
                            >
                              <option value="eenmalig">Eenmalig</option>
                              <option value="doorlopend">Doorlopend</option>
                            </select>
                          </div>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 4, cursor: "pointer", fontSize: 12.5, color: "#5B6259" }}>
                          <input
                            type="checkbox"
                            checked={dienst.gebruikAantallen !== false}
                            onChange={(e) => bijwerkDienstVeld(dienst.id, "gebruikAantallen", e.target.checked)}
                            style={{ width: 15, height: 15, accentColor: "#1C5D8C" }}
                          />
                          Aantallen gebruiken — laat aantal en factor zien bij het kiezen van deze dienst (bv. "10 stroken × 12")
                        </label>

                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF" }}>Variant / staffel</th>
                              <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A9089", borderBottom: "1px solid #E2E4DF", width: 280 }}>Prijs</th>
                              <th style={{ width: 34, borderBottom: "1px solid #E2E4DF" }} />
                            </tr>
                          </thead>
                          <tbody>
                            {dienst.varianten.map((v) => (
                              <tr key={v.id}>
                                <td style={{ padding: "6px 4px" }}>
                                  <input
                                    className="ot-input"
                                    placeholder="(standaard, geen varianten)"
                                    value={v.naam}
                                    onChange={(e) => bijwerkVariant(dienst.id, v.id, "naam", e.target.value)}
                                  />
                                </td>
                                <td style={{ padding: "6px 4px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ position: "relative", flex: 1, minWidth: 110 }}>
                                      <span style={{ position: "absolute", left: 10, top: 10, fontSize: 13, color: "#8A9089" }}>€</span>
                                      <input
                                        className="ot-input"
                                        style={{ paddingLeft: 22 }}
                                        type="number"
                                        step="0.01"
                                        disabled={v.prijs === null || v.prijs === "nacalculatie"}
                                        value={v.prijs === null || v.prijs === "nacalculatie" ? "" : v.prijs}
                                        placeholder={v.prijs === null ? "op aanvraag" : v.prijs === "nacalculatie" ? "nacalculatie" : ""}
                                        onChange={(e) => bijwerkVariant(dienst.id, v.id, "prijs", e.target.value === "" ? 0 : Number(e.target.value))}
                                      />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#5B6259", whiteSpace: "nowrap" }}>
                                        <input
                                          type="checkbox"
                                          checked={v.prijs === null}
                                          onChange={(e) => bijwerkVariant(dienst.id, v.id, "prijs", e.target.checked ? null : 0)}
                                          style={{ accentColor: "#1C5D8C" }}
                                        />
                                        op aanvraag
                                      </label>
                                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#5B6259", whiteSpace: "nowrap" }}>
                                        <input
                                          type="checkbox"
                                          checked={v.prijs === "nacalculatie"}
                                          onChange={(e) => bijwerkVariant(dienst.id, v.id, "prijs", e.target.checked ? "nacalculatie" : 0)}
                                          style={{ accentColor: "#1C5D8C" }}
                                        />
                                        op nacalculatie
                                      </label>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: "6px 4px", textAlign: "center" }}>
                                  {dienst.varianten.length > 1 && (
                                    <button
                                      onClick={() => verwijderVariant(dienst.id, v.id)}
                                      title="Variant verwijderen"
                                      style={{ border: "none", background: "transparent", color: "#B4B9AE", cursor: "pointer", display: "flex" }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button className="ot-btn-ghost" style={{ marginTop: 8 }} onClick={() => voegVariantToe(dienst.id)}>
                          <PlusCircle size={13} />
                          Variant / staffel toevoegen
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 22 }}>
              <button className="ot-btn-secondary" onClick={() => setStap(terugNaarStap)}>
                <ChevronLeft size={15} />
                Terug naar offerte
              </button>
            </div>
          </StapWrapper>
        )}

        {/* -------------------- TEKSTEN BEHEREN -------------------- */}
        {stap === "teksten" && (
          <StapWrapper
            titel="Standaardteksten beheren"
            toelichting="Leg hier standaardteksten vast voor de bijlage, net als bij de dienstencatalogus. Bij een nieuwe offerte worden lege velden automatisch met deze standaardtekst gevuld — u kunt ze per offerte nog altijd aanpassen."
          >
            <OverigBeheerBalk
              actief={stap}
              onCatalogus={openCatalogus}
              onTeksten={openTeksten}
              onVoorwaarden={openVoorwaarden}
              onRoadmap={openRoadmap}
              onOpdrachtbevestigingTeksten={openOpdrachtbevestigingTeksten}
            />

            <div style={{ display: "grid", gap: 12 }}>
              <div className="ot-card" style={{ padding: 18 }}>
                <label className="ot-label">Algemeen</label>
                <textarea
                  className="ot-input"
                  rows={4}
                  placeholder="Standaardtekst voor de algemene toelichting…"
                  value={standaardTeksten.algemeen}
                  onChange={(e) => bijwerkStandaardAlgemeen(e.target.value)}
                />
              </div>

              {categorieen.map((cat) => (
                <div key={cat.id}>
                  <div className="ot-cat-koptekst">
                    <span>{(cat.naam || "").trim() || "Naamloze categorie"}</span>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {dienstenCatalogus
                      .filter((d) => d.categorie === cat.id)
                      .map((dienst) => (
                        <div key={dienst.id} className="ot-card" style={{ padding: 18 }}>
                          <label className="ot-label">{dienst.naam}</label>
                          <textarea
                            className="ot-input"
                            rows={3}
                            placeholder={`Standaardtekst bij ${dienst.naam.toLowerCase()}…`}
                            value={standaardTeksten.perDienst[dienst.id] || ""}
                            onChange={(e) => bijwerkStandaardDienstTekst(dienst.id, e.target.value)}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="ot-cat-koptekst">
              <span>Tekenlink per e-mail</span>
            </div>
            <div className="ot-card" style={{ padding: 18 }}>
              <label className="ot-label">Standaard mailtekst</label>
              <textarea
                className="ot-input"
                rows={7}
                value={standaardMailtekst}
                onChange={(e) => setStandaardMailtekst(e.target.value)}
              />
              <p style={{ fontSize: 11.5, color: "#8A9089", marginTop: 6 }}>
                Beschikbare plaatshouders: <code>{"{contact}"}</code> (voornaam van de
                contactpersoon), <code>{"{link}"}</code> (de tekenlink),{" "}
                <code>{"{ondertekenaar}"}</code> (naam van degene die verstuurt). Bij het
                versturen kun je de tekst per keer nog aanpassen — dit is alleen het
                startpunt.
              </p>
              {standaardMailtekst !== STANDAARD_MAILTEKST_DEFAULT && (
                <button
                  className="ot-btn-ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => setStandaardMailtekst(STANDAARD_MAILTEKST_DEFAULT)}
                >
                  <RotateCcw size={12} />
                  Terugzetten naar standaard
                </button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 22 }}>
              <button className="ot-btn-secondary" onClick={() => setStap(terugNaarStap)}>
                <ChevronLeft size={15} />
                Terug naar offerte
              </button>
            </div>
          </StapWrapper>
        )}

        {/* -------------------- OPDRACHTBEVESTIGING-TEKSTEN BEHEREN -------------------- */}
        {stap === "opdrachtbevestiging-teksten" &&
          (() => {
            const actieveType = opdrachttypes.find((t) => t.id === beheerOpdrachttypeId) || opdrachttypes[0] || null;
            const paragrafen = actieveType ? paragrafenVoorType(actieveType.id) : { verplicht: [], optioneel: [] };
            return (
              <StapWrapper
                titel="Opdrachtbevestiging-teksten beheren"
                toelichting="Leg hier per opdrachttype (NV COS) de verplichte en optionele standaardparagrafen vast — dit is waar de daadwerkelijke NV COS-teksten worden ingevuld, precies zoals bij 'Teksten beheren' voor de offerte."
              >
                <OverigBeheerBalk
                  actief={stap}
                  onCatalogus={openCatalogus}
                  onTeksten={openTeksten}
                  onVoorwaarden={openVoorwaarden}
                  onRoadmap={openRoadmap}
                  onOpdrachtbevestigingTeksten={openOpdrachtbevestigingTeksten}
                />

                <div className="ot-cat-koptekst">
                  <span>Opdrachttypes (zelf te beheren, net als de dienstencatalogus)</span>
                  <button
                    className="ot-btn-ghost"
                    onClick={() => {
                      const id = voegOpdrachttypeToe();
                      setBeheerOpdrachttypeId(id);
                    }}
                  >
                    <PlusCircle size={13} />
                    Opdrachttype toevoegen
                  </button>
                </div>
                <div className="ot-card" style={{ padding: 16, marginBottom: 22 }}>
                  {opdrachttypes.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "#8A9089", margin: 0 }}>
                      Nog geen opdrachttypes — voeg er hierboven één toe.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {opdrachttypes.map((t, idx) => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            className="ot-input"
                            value={t.naam}
                            onChange={(e) => bijwerkOpdrachttypeVeld(t.id, "naam", e.target.value)}
                          />
                          <button className="ot-btn-ghost" disabled={idx === 0} onClick={() => verplaatsOpdrachttype(t.id, -1)} title="Omhoog">
                            <ChevronUp size={14} />
                          </button>
                          <button
                            className="ot-btn-ghost"
                            disabled={idx === opdrachttypes.length - 1}
                            onClick={() => verplaatsOpdrachttype(t.id, 1)}
                            title="Omlaag"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            className="ot-btn-ghost"
                            onClick={() => {
                              verwijderOpdrachttype(t.id);
                              if (beheerOpdrachttypeId === t.id) setBeheerOpdrachttypeId(null);
                            }}
                            title="Verwijderen"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "#8A9089", margin: "10px 0 0" }}>
                    Deze lijst bepaal je zelf — type toevoegen, naam wijzigen, volgorde of verwijderen kan hier. Elk
                    type krijgt hieronder zijn eigen verplichte/optionele paragrafen.
                  </p>
                </div>

                {actieveType && (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                      {opdrachttypes.map((t) => (
                        <button
                          key={t.id}
                          className={t.id === actieveType.id ? "ot-pill actief" : "ot-pill"}
                          onClick={() => setBeheerOpdrachttypeId(t.id)}
                        >
                          {t.naam}
                        </button>
                      ))}
                    </div>

                    <div className="ot-cat-koptekst">
                      <span>Verplichte paragrafen</span>
                      <button className="ot-btn-ghost" onClick={() => voegStandaardParagraafToe(actieveType.id, "verplicht")}>
                        <PlusCircle size={13} />
                        Verplichte paragraaf toevoegen
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 12, marginBottom: 10 }}>
                      {paragrafen.verplicht.length === 0 && (
                        <p style={{ fontSize: 12.5, color: "#8A9089" }}>Nog geen verplichte paragrafen voor dit type.</p>
                      )}
                      {paragrafen.verplicht.map((p, idx) => (
                        <div key={p.id} className="ot-card" style={{ padding: 18 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                              <label className="ot-label">Paragraaftitel</label>
                              <input
                                className="ot-input"
                                value={p.titel}
                                onChange={(e) => bijwerkStandaardParagraaf(actieveType.id, "verplicht", p.id, "titel", e.target.value)}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 4, alignSelf: "flex-end" }}>
                              <button
                                className="ot-btn-ghost"
                                disabled={idx === 0}
                                onClick={() => verplaatsStandaardParagraaf(actieveType.id, "verplicht", p.id, -1)}
                                title="Omhoog"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                className="ot-btn-ghost"
                                disabled={idx === paragrafen.verplicht.length - 1}
                                onClick={() => verplaatsStandaardParagraaf(actieveType.id, "verplicht", p.id, 1)}
                                title="Omlaag"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                className="ot-btn-ghost"
                                onClick={() => verwijderStandaardParagraaf(actieveType.id, "verplicht", p.id)}
                                title="Verwijderen"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <label className="ot-label">Standaardtekst (NV COS)</label>
                          <textarea
                            className="ot-input"
                            rows={4}
                            placeholder="Vul hier de definitieve, verplichte NV COS-tekst in…"
                            value={p.tekst}
                            onChange={(e) => bijwerkStandaardParagraaf(actieveType.id, "verplicht", p.id, "tekst", e.target.value)}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="ot-cat-koptekst">
                      <span>Optionele paragrafen (standaard beschikbaar, niet verplicht)</span>
                      <button className="ot-btn-ghost" onClick={() => voegStandaardParagraafToe(actieveType.id, "optioneel")}>
                        <PlusCircle size={13} />
                        Optionele paragraaf toevoegen
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                      {paragrafen.optioneel.length === 0 && (
                        <p style={{ fontSize: 12.5, color: "#8A9089" }}>Nog geen optionele paragrafen voor dit type.</p>
                      )}
                      {paragrafen.optioneel.map((p, idx) => (
                        <div key={p.id} className="ot-card" style={{ padding: 18 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                              <label className="ot-label">Paragraaftitel</label>
                              <input
                                className="ot-input"
                                value={p.titel}
                                onChange={(e) => bijwerkStandaardParagraaf(actieveType.id, "optioneel", p.id, "titel", e.target.value)}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 4, alignSelf: "flex-end" }}>
                              <button
                                className="ot-btn-ghost"
                                disabled={idx === 0}
                                onClick={() => verplaatsStandaardParagraaf(actieveType.id, "optioneel", p.id, -1)}
                                title="Omhoog"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                className="ot-btn-ghost"
                                disabled={idx === paragrafen.optioneel.length - 1}
                                onClick={() => verplaatsStandaardParagraaf(actieveType.id, "optioneel", p.id, 1)}
                                title="Omlaag"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                className="ot-btn-ghost"
                                onClick={() => verwijderStandaardParagraaf(actieveType.id, "optioneel", p.id)}
                                title="Verwijderen"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <label className="ot-label">Standaardtekst</label>
                          <textarea
                            className="ot-input"
                            rows={3}
                            placeholder="Eigen tekst…"
                            value={p.tekst}
                            onChange={(e) => bijwerkStandaardParagraaf(actieveType.id, "optioneel", p.id, "tekst", e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
                  <span>Vrijwillige teksten per dienst</span>
                </div>
                <p style={{ fontSize: 12, color: "#8A9089", margin: "0 0 12px" }}>
                  Los van de opdrachttypes hierboven: leg per dienst uit de dienstencatalogus een
                  vrijwillige standaardtekst vast. Zodra die dienst in een opdrachtbevestiging is
                  geselecteerd, komt deze tekst automatisch mee in de bijlage — degene die de
                  opdrachtbevestiging opstelt kan 'm daar per keer nog uitzetten.
                </p>
                <div style={{ display: "grid", gap: 12, marginBottom: 10 }}>
                  {dienstenCatalogus.length === 0 && (
                    <p style={{ fontSize: 12.5, color: "#8A9089" }}>Nog geen diensten in de catalogus.</p>
                  )}
                  {dienstenCatalogus.map((dienst) => (
                    <div key={dienst.id} className="ot-card" style={{ padding: 18 }}>
                      <label className="ot-label">{dienst.naam}</label>
                      <textarea
                        className="ot-input"
                        rows={3}
                        placeholder="Vrijwillige standaardtekst voor deze dienst — leeg laten als er geen tekst nodig is…"
                        value={opdrachtbevestigingDienstTeksten[dienst.id] || ""}
                        onChange={(e) => bijwerkOpdrachtbevestigingDienstTekst(dienst.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="ot-cat-koptekst" style={{ marginTop: 34 }}>
                  <span>Tekenlink per e-mail</span>
                </div>
                <div className="ot-card" style={{ padding: 18 }}>
                  <label className="ot-label">Standaard mailtekst — opdrachtbevestiging</label>
                  <textarea
                    className="ot-input"
                    rows={7}
                    value={standaardMailtekstOpdrachtbevestiging}
                    onChange={(e) => setStandaardMailtekstOpdrachtbevestiging(e.target.value)}
                  />
                  <p style={{ fontSize: 11.5, color: "#8A9089", marginTop: 6 }}>
                    Beschikbare plaatshouders: <code>{"{contact}"}</code> (voornaam van de
                    contactpersoon), <code>{"{link}"}</code> (de tekenlink),{" "}
                    <code>{"{ondertekenaar}"}</code> (naam van degene die verstuurt). Los van de
                    offerte-mailtekst bij "Teksten beheren" — bij het versturen kun je de tekst
                    per keer nog aanpassen.
                  </p>
                  {standaardMailtekstOpdrachtbevestiging !== STANDAARD_MAILTEKST_OB_DEFAULT && (
                    <button
                      className="ot-btn-ghost"
                      style={{ marginTop: 8 }}
                      onClick={() => setStandaardMailtekstOpdrachtbevestiging(STANDAARD_MAILTEKST_OB_DEFAULT)}
                    >
                      <RotateCcw size={12} />
                      Terugzetten naar standaard
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 22 }}>
                  <button className="ot-btn-secondary" onClick={() => setStap(terugNaarStap)}>
                    <ChevronLeft size={15} />
                    Terug
                  </button>
                </div>
              </StapWrapper>
            );
          })()}

        {/* -------------------- VOORWAARDEN BEHEREN -------------------- */}
        {stap === "voorwaarden" && (
          <StapWrapper
            titel="Algemene voorwaarden beheren"
            toelichting="Deze link verschijnt als klikbare verwijzing op elke offerte, bijv. 'Op deze offerte zijn onze algemene voorwaarden van toepassing.'"
          >
            <OverigBeheerBalk
              actief={stap}
              onCatalogus={openCatalogus}
              onTeksten={openTeksten}
              onVoorwaarden={openVoorwaarden}
              onRoadmap={openRoadmap}
              onOpdrachtbevestigingTeksten={openOpdrachtbevestigingTeksten}
            />

            <div className="ot-card" style={{ padding: 18, display: "grid", gap: 14 }}>
              <div>
                <label className="ot-label">Titel</label>
                <input
                  className="ot-input"
                  value={algemeneVoorwaarden.titel}
                  onChange={(e) => setAlgemeneVoorwaarden((prev) => ({ ...prev, titel: e.target.value }))}
                />
              </div>
              <div>
                <label className="ot-label">Link naar de voorwaarden (PDF op de website)</label>
                <input
                  className="ot-input"
                  type="url"
                  placeholder="https://activaa.nl/algemene-voorwaarden.pdf"
                  value={algemeneVoorwaarden.url || ""}
                  onChange={(e) => setAlgemeneVoorwaarden((prev) => ({ ...prev, url: e.target.value }))}
                />
                <p style={{ fontSize: 11.5, color: "#8A9089", marginTop: 6 }}>
                  Deze link staat als klikbare tekst op elke offerte — ook in de PDF blijft dit aanklikbaar. Laat leeg om geen link te tonen.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 22 }}>
              <button className="ot-btn-secondary" onClick={() => setStap(terugNaarStap)}>
                <ChevronLeft size={15} />
                Terug naar offerte
              </button>
            </div>
          </StapWrapper>
        )}

        {/* -------------------- ROADMAP BEHEREN -------------------- */}
        {stap === "roadmap" && (
          <StapWrapper
            titel="Roadmap beheren"
            toelichting="Stel hier een stappenplan/roadmap samen (bijv. week 1, dag 30, dag 60...). Bij een offerte kan deze per keer aan- of uitgezet worden — handig als niet elke offerte een roadmap nodig heeft."
          >
            <OverigBeheerBalk
              actief={stap}
              onCatalogus={openCatalogus}
              onTeksten={openTeksten}
              onVoorwaarden={openVoorwaarden}
              onRoadmap={openRoadmap}
              onOpdrachtbevestigingTeksten={openOpdrachtbevestigingTeksten}
            />

            <div style={{ marginBottom: 14 }}>
              <label className="ot-label">Titel van de roadmap</label>
              <input
                className="ot-input"
                value={roadmap.titel}
                onChange={(e) => setRoadmap((prev) => ({ ...prev, titel: e.target.value }))}
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {roadmap.fases.map((fase, i) => (
                <div key={fase.id} className="ot-card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
                    <div style={{ width: 70 }}>
                      <label className="ot-label">Markering</label>
                      <input
                        className="ot-input"
                        value={fase.markering}
                        onChange={(e) => bijwerkFase(fase.id, "markering", e.target.value)}
                        placeholder="W1"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="ot-label">Label (klein, bovenaan)</label>
                      <input
                        className="ot-input"
                        value={fase.label}
                        onChange={(e) => bijwerkFase(fase.id, "label", e.target.value)}
                        placeholder="WEEK 1 · FUNDAMENT"
                      />
                    </div>
                    <button
                      onClick={() => verwijderFase(fase.id)}
                      title="Fase verwijderen"
                      style={{ border: "1px solid #E2C4B0", background: "#FBF2EC", color: "#B14A2E", borderRadius: 8, padding: 9, cursor: "pointer", display: "flex", flexShrink: 0 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label className="ot-label">Titel van deze fase</label>
                    <input
                      className="ot-input"
                      value={fase.titel}
                      onChange={(e) => bijwerkFase(fase.id, "titel", e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label className="ot-label">Bullet points (één per regel)</label>
                    <textarea
                      className="ot-input"
                      rows={3}
                      value={fase.puntenTekst}
                      onChange={(e) => bijwerkFase(fase.id, "puntenTekst", e.target.value)}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                    <div>
                      <label className="ot-label">Resultaat-label</label>
                      <input
                        className="ot-input"
                        value={fase.resultaatLabel}
                        onChange={(e) => bijwerkFase(fase.id, "resultaatLabel", e.target.value)}
                        placeholder="RESULTAAT"
                      />
                    </div>
                    <div>
                      <label className="ot-label">Resultaat-tekst</label>
                      <input
                        className="ot-input"
                        value={fase.resultaatTekst}
                        onChange={(e) => bijwerkFase(fase.id, "resultaatTekst", e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#8A9089", marginTop: 8 }}>Fase {i + 1}</div>
                </div>
              ))}
            </div>

            <button className="ot-btn-ghost" style={{ marginTop: 12 }} onClick={voegFaseToe}>
              <PlusCircle size={14} />
              Fase toevoegen
            </button>

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 22 }}>
              <button className="ot-btn-secondary" onClick={() => setStap(terugNaarStap)}>
                <ChevronLeft size={15} />
                Terug naar offerte
              </button>
            </div>
          </StapWrapper>
        )}

        {/* -------------------- OFFERTES OVERZICHT -------------------- */}
        {stap === "offertes" && (
          <StapWrapper
            titel="Offertes overzicht"
            toelichting="Alle opgeslagen offertes van iedereen. Open er één om een kleine wijziging te maken — bij opnieuw afdrukken/PDF wordt dezelfde offerte bijgewerkt."
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="ot-btn-ghost" onClick={laadOffertesLijst} disabled={offertesLijstBezig}>
                  <RotateCcw size={13} />
                  {offertesLijstBezig ? "Bezig met laden…" : "Vernieuwen"}
                </button>
                {offertesSelectie.size > 0 && (
                  <button
                    onClick={() => setOffertesBevestigenTonen(true)}
                    disabled={offertesVerwijderenBezig}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #E2C4B0",
                      background: "#FBF2EC",
                      color: "#B14A2E",
                      padding: "7px 12px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: offertesVerwijderenBezig ? "default" : "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                    {offertesVerwijderenBezig
                      ? "Bezig met verwijderen…"
                      : `${offertesSelectie.size} geselecteerd — verwijderen`}
                  </button>
                )}
              </div>
              <button className="ot-btn-primary" onClick={nieuweOfferte}>
                <PlusCircle size={15} />
                Nieuwe offerte
              </button>
            </div>

            {offertesBevestigenTonen && offertesSelectie.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "#FBF2EC",
                  border: "1px solid #E2C4B0",
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: 13, color: "#7A3520" }}>
                  {offertesSelectie.size === 1
                    ? "Deze offerte definitief verwijderen? Dit kan niet ongedaan worden gemaakt."
                    : `${offertesSelectie.size} offertes definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`}
                </span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    className="ot-btn-secondary"
                    onClick={() => setOffertesBevestigenTonen(false)}
                    disabled={offertesVerwijderenBezig}
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={verwijderGeselecteerdeOffertes}
                    disabled={offertesVerwijderenBezig}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      background: "#B14A2E",
                      color: "#fff",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: offertesVerwijderenBezig ? "default" : "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                    {offertesVerwijderenBezig ? "Bezig…" : "Ja, verwijderen"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8A9089" }} />
                <input
                  className="ot-input"
                  style={{ paddingLeft: 30 }}
                  placeholder="Zoek op klant, klantgroep of naam…"
                  value={offertesZoekterm}
                  onChange={(e) => setOffertesZoekterm(e.target.value)}
                />
              </div>
              <select
                className="ot-input"
                style={{ width: 200 }}
                value={offertesFilterKlantgroep}
                onChange={(e) => setOffertesFilterKlantgroep(e.target.value)}
              >
                <option value="">Alle klantgroepen</option>
                {offertesKlantgroepen.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                className="ot-input"
                style={{ width: 200 }}
                value={offertesFilterGebruiker}
                onChange={(e) => setOffertesFilterGebruiker(e.target.value)}
              >
                <option value="">Iedereen</option>
                {offertesGebruikers.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                className="ot-input"
                style={{ width: 180 }}
                value={offertesFilterStatus}
                onChange={(e) => setOffertesFilterStatus(e.target.value)}
              >
                <option value="">Alle statussen</option>
                {OFFERTE_STATUSSEN.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              {(offertesZoekterm || offertesFilterKlantgroep || offertesFilterGebruiker || offertesFilterStatus) && (
                <button
                  className="ot-btn-ghost"
                  onClick={() => {
                    setOffertesZoekterm("");
                    setOffertesFilterKlantgroep("");
                    setOffertesFilterGebruiker("");
                    setOffertesFilterStatus("");
                  }}
                >
                  Filters wissen
                </button>
              )}
            </div>

            {offertesLijstFout && (
              <div style={{ padding: 14, borderRadius: 10, background: "#FBF2EC", color: "#B14A2E", fontSize: 13, marginBottom: 16 }}>
                Kon de offertes niet laden. Controleer of de opslag is geconfigureerd (zie README, stap "Opslag van instellingen").
              </div>
            )}

            {offertesLijstBezig && offertesLijst.length === 0 && !offertesLijstFout && (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Bezig met laden…
              </div>
            )}

            {!offertesLijstBezig && offertesLijst.length === 0 && !offertesLijstFout && (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Nog geen offertes opgeslagen.
              </div>
            )}

            {offertesLijst.length > 0 && gefilterdeOffertes.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Geen offertes gevonden met deze zoekterm/filters.
              </div>
            )}

            {gefilterdeOffertes.length > 0 && (
              <div className="ot-card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F0EEE6", textAlign: "left" }}>
                      <th style={{ padding: "10px 12px", width: 1 }}>
                        <input
                          type="checkbox"
                          checked={
                            gepagineerdeOffertes.length > 0 &&
                            gepagineerdeOffertes.every((o) => offertesSelectie.has(o.id))
                          }
                          onChange={() =>
                            toggleAlleOffertesOpPagina(
                              gepagineerdeOffertes.map((o) => o.id),
                              gepagineerdeOffertes.length > 0 && gepagineerdeOffertes.every((o) => offertesSelectie.has(o.id))
                            )
                          }
                          title="Alles op deze pagina (de)selecteren"
                        />
                      </th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Datum</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Klant(en)</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Klantgroep</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Status</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Bekeken</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Opgemaakt door</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Laatst gewijzigd</th>
                      <th style={{ padding: "10px 14px", position: "sticky", right: 0, background: "#F0EEE6" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {gepagineerdeOffertes.map((o) => {
                      const gewijzigd = o.gewijzigdOp && o.gewijzigdOp !== o.aangemaaktOp;
                      const statusInfo = offerteStatusInfo(o.status);
                      return (
                        <React.Fragment key={o.id}>
                        <tr
                          style={{
                            borderTop: "1px solid #E2E4DF",
                            background: offertesSelectie.has(o.id) ? "#EAF2F8" : "transparent",
                          }}
                        >
                          <td style={{ padding: "10px 12px" }}>
                            <input
                              type="checkbox"
                              checked={offertesSelectie.has(o.id)}
                              onChange={() => toggleOfferteSelectie(o.id)}
                            />
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{datumTijd(o.aangemaaktOp)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {o.klantNamen && o.klantNamen.length > 0 ? o.klantNamen.join(", ") : "—"}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {o.klantGroepen && o.klantGroepen.length > 0 ? o.klantGroepen.join(", ") : "—"}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <select
                              value={o.status || OFFERTE_STATUS_STANDAARD}
                              onChange={(e) => wijzigOfferteStatus(o.id, e.target.value)}
                              disabled={offerteStatusBezigId === o.id}
                              style={{
                                border: "1px solid " + statusInfo.kleur + "33",
                                background: statusInfo.achtergrond,
                                color: statusInfo.kleur,
                                fontWeight: 600,
                                fontSize: 12,
                                borderRadius: 6,
                                padding: "5px 8px",
                                cursor: offerteStatusBezigId === o.id ? "default" : "pointer",
                              }}
                            >
                              {OFFERTE_STATUSSEN.map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            {o.aantalBekeken > 0 ? (
                              <span title={o.laatstBekekenIp ? `IP: ${o.laatstBekekenIp}` : undefined}>
                                <Eye size={12} style={{ verticalAlign: "-2px", marginRight: 4, color: "#2E7D4F" }} />
                                {datumTijd(o.laatstBekekenOp)}
                                {o.aantalBekeken > 1 && (
                                  <span style={{ color: "#8A9089" }}> ({o.aantalBekeken}x)</span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: "#A5AA9F" }}>
                                <EyeOff size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                                Nog niet bekeken
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px" }}>{o.aangemaaktDoor || "—"}</td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            {gewijzigd ? (
                              <>
                                {datumTijd(o.gewijzigdOp)}
                                <div style={{ fontSize: 11.5, color: "#8A9089" }}>door {o.gewijzigdDoor}</div>
                              </>
                            ) : (
                              <span style={{ color: "#A5AA9F" }}>—</span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              position: "sticky",
                              right: 0,
                              background: offertesSelectie.has(o.id) ? "#EAF2F8" : "#fff",
                              boxShadow: "-4px 0 6px -4px rgba(0,0,0,0.15)",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              <button className="ot-btn-ghost" onClick={() => toggleLogboek(o.id)}>
                                <ScrollText size={13} />
                                Log
                              </button>
                              <button className="ot-btn-ghost" onClick={() => openOfferte(o.id)}>
                                <FolderOpen size={13} />
                                Openen
                              </button>
                            </div>
                          </td>
                        </tr>
                        {logboekOpenId === o.id && (
                          <tr>
                            <td colSpan={9} style={{ padding: 0, borderTop: "1px solid #E2E4DF" }}>
                              <div style={{ padding: "14px 20px", background: "#FAFAF7" }}>
                                {logboekBezig && (
                                  <span style={{ fontSize: 12.5, color: "#8A9089" }}>Bezig met laden…</span>
                                )}
                                {!logboekBezig && logboekRecord?.fout && (
                                  <span style={{ fontSize: 12.5, color: "#B14A2E" }}>Kon het logboek niet laden.</span>
                                )}
                                {!logboekBezig && logboekRecord && !logboekRecord.fout && (
                                  <div style={{ display: "grid", gap: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6259" }}>Tekenlink:</span>
                                      <code style={{ fontSize: 11.5, background: "#EFEEE7", padding: "3px 8px", borderRadius: 6 }}>
                                        {`${window.location.origin}/tekenen/${o.id}`}
                                      </code>
                                      <button
                                        className="ot-btn-ghost"
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(`${window.location.origin}/tekenen/${o.id}`);
                                          } catch (e) {
                                            window.prompt("Kopieer deze link handmatig:", `${window.location.origin}/tekenen/${o.id}`);
                                          }
                                        }}
                                      >
                                        <Link2 size={12} />
                                        Kopiëren
                                      </button>
                                    </div>

                                    {logboekRecord.ondertekening ? (
                                      <div
                                        style={{
                                          padding: 12,
                                          borderRadius: 8,
                                          background: logboekRecord.ondertekening.akkoord ? "#E7F4EC" : "#FBF2EC",
                                          border: `1px solid ${logboekRecord.ondertekening.akkoord ? "#BFE0CC" : "#E2C4B0"}`,
                                          fontSize: 12.5,
                                        }}
                                      >
                                        <strong>{logboekRecord.ondertekening.akkoord ? "Ondertekend (akkoord)" : "Afgewezen (niet akkoord)"}</strong>
                                        <div style={{ marginTop: 4, color: "#5B6259" }}>
                                          door {logboekRecord.ondertekening.naam} ({logboekRecord.ondertekening.email})
                                          <br />
                                          op {datumTijd(logboekRecord.ondertekening.op)} · IP {logboekRecord.ondertekening.ip}
                                          {logboekRecord.ondertekening.opmerking && (
                                            <>
                                              <br />
                                              Opmerking: "{logboekRecord.ondertekening.opmerking}"
                                            </>
                                          )}
                                        </div>
                                        {logboekRecord.ondertekening.emailKomtOvereen === false && (
                                          <div style={{ marginTop: 6, fontSize: 11.5, color: "#8A6A1E", background: "#FBF3DE", borderRadius: 6, padding: "5px 8px" }}>
                                            ⚠ E-mailadres wijkt af van het bekende contactadres
                                          </div>
                                        )}
                                        {logboekRecord.ondertekening.handtekening && (
                                          <img
                                            src={logboekRecord.ondertekening.handtekening}
                                            alt="Handtekening"
                                            style={{ maxWidth: 220, marginTop: 8, background: "#fff", border: "1px solid #E2E4DF", borderRadius: 6 }}
                                          />
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 12.5, color: "#8A9089" }}>Nog niet ondertekend of afgewezen.</span>
                                    )}

                                    <div>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6259" }}>Logboek</span>
                                      {(logboekRecord.logboek || []).length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#8A9089", marginTop: 4 }}>Nog geen gebeurtenissen.</div>
                                      ) : (
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
                                          <tbody>
                                            {[...logboekRecord.logboek].reverse().map((entry, i) => (
                                              <tr key={i} style={{ borderTop: "1px solid #E2E4DF" }}>
                                                <td style={{ padding: "5px 6px", whiteSpace: "nowrap", color: "#5B6259" }}>
                                                  {datumTijd(entry.op)}
                                                </td>
                                                <td style={{ padding: "5px 6px", fontWeight: 600 }}>{entry.gebeurtenis}</td>
                                                <td style={{ padding: "5px 6px", color: "#8A9089" }}>
                                                  {entry.naam ? `${entry.naam} (${entry.email}) · ` : ""}IP {entry.ip}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {gefilterdeOffertes.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {offertesTotaalPaginas > 1 && (
                    <>
                      <button
                        className="ot-btn-ghost"
                        disabled={offertesPaginaVeilig === 1}
                        onClick={() => setOffertesPagina((p) => Math.max(1, p - 1))}
                        style={{ opacity: offertesPaginaVeilig === 1 ? 0.4 : 1 }}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {Array.from({ length: offertesTotaalPaginas }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setOffertesPagina(p)}
                          style={{
                            minWidth: 30,
                            height: 30,
                            border: "1px solid #C8CDC5",
                            background: p === offertesPaginaVeilig ? "#1C5D8C" : "#fff",
                            color: p === offertesPaginaVeilig ? "#fff" : "#5B6259",
                            borderRadius: 8,
                            fontSize: 12.5,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        className="ot-btn-ghost"
                        disabled={offertesPaginaVeilig === offertesTotaalPaginas}
                        onClick={() => setOffertesPagina((p) => Math.min(offertesTotaalPaginas, p + 1))}
                        style={{ opacity: offertesPaginaVeilig === offertesTotaalPaginas ? 0.4 : 1 }}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#8A9089" }}>
                    {gefilterdeOffertes.length} offerte{gefilterdeOffertes.length === 1 ? "" : "s"}
                    {offertesTotaalPaginas > 1 ? ` · pagina ${offertesPaginaVeilig} van ${offertesTotaalPaginas}` : ""}
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A9089" }}>
                    Per pagina
                    <select
                      className="ot-input"
                      style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}
                      value={offertesPaginaGrootte}
                      onChange={(e) => setOffertesPaginaGrootte(e.target.value === "alle" ? "alle" : Number(e.target.value))}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value="alle">Alle</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </StapWrapper>
        )}

        {/* -------------------- OPDRACHTBEVESTIGINGEN OVERZICHT -------------------- */}
        {stap === "opdrachtbevestigingen" && (
          <StapWrapper
            titel="Opdrachtbevestigingen overzicht"
            toelichting="Alle opgeslagen opdrachtbevestigingen van iedereen. Open er één om een kleine wijziging te maken — bij opnieuw afdrukken/PDF wordt dezelfde opdrachtbevestiging bijgewerkt."
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="ot-btn-ghost" onClick={laadOpdrachtbevestigingenLijst} disabled={opdrachtbevestigingenLijstBezig}>
                  <RotateCcw size={13} />
                  {opdrachtbevestigingenLijstBezig ? "Bezig met laden…" : "Vernieuwen"}
                </button>
                {opdrachtbevestigingenSelectie.size > 0 && (
                  <button
                    onClick={() => setOpdrachtbevestigingenBevestigenTonen(true)}
                    disabled={opdrachtbevestigingenVerwijderenBezig}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #E2C4B0",
                      background: "#FBF2EC",
                      color: "#B14A2E",
                      padding: "7px 12px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: opdrachtbevestigingenVerwijderenBezig ? "default" : "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                    {opdrachtbevestigingenVerwijderenBezig
                      ? "Bezig met verwijderen…"
                      : `${opdrachtbevestigingenSelectie.size} geselecteerd — verwijderen`}
                  </button>
                )}
              </div>
              <button className="ot-btn-primary" onClick={nieuweOpdrachtbevestiging}>
                <PlusCircle size={15} />
                Nieuwe opdrachtbevestiging
              </button>
            </div>

            {opdrachtbevestigingenBevestigenTonen && opdrachtbevestigingenSelectie.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "#FBF2EC",
                  border: "1px solid #E2C4B0",
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: 13, color: "#7A3520" }}>
                  {opdrachtbevestigingenSelectie.size === 1
                    ? "Deze opdrachtbevestiging definitief verwijderen? Dit kan niet ongedaan worden gemaakt."
                    : `${opdrachtbevestigingenSelectie.size} opdrachtbevestigingen definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`}
                </span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    className="ot-btn-secondary"
                    onClick={() => setOpdrachtbevestigingenBevestigenTonen(false)}
                    disabled={opdrachtbevestigingenVerwijderenBezig}
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={verwijderGeselecteerdeOpdrachtbevestigingen}
                    disabled={opdrachtbevestigingenVerwijderenBezig}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      background: "#B14A2E",
                      color: "#fff",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: opdrachtbevestigingenVerwijderenBezig ? "default" : "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                    {opdrachtbevestigingenVerwijderenBezig ? "Bezig…" : "Ja, verwijderen"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8A9089" }} />
                <input
                  className="ot-input"
                  style={{ paddingLeft: 30 }}
                  placeholder="Zoek op klant, klantgroep of naam…"
                  value={opdrachtbevestigingenZoekterm}
                  onChange={(e) => setOpdrachtbevestigingenZoekterm(e.target.value)}
                />
              </div>
              <select
                className="ot-input"
                style={{ width: 200 }}
                value={opdrachtbevestigingenFilterKlantgroep}
                onChange={(e) => setOpdrachtbevestigingenFilterKlantgroep(e.target.value)}
              >
                <option value="">Alle klantgroepen</option>
                {opdrachtbevestigingenKlantgroepen.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                className="ot-input"
                style={{ width: 200 }}
                value={opdrachtbevestigingenFilterOpdrachttype}
                onChange={(e) => setOpdrachtbevestigingenFilterOpdrachttype(e.target.value)}
              >
                <option value="">Alle opdrachttypes</option>
                {opdrachttypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.naam}
                  </option>
                ))}
              </select>
              <select
                className="ot-input"
                style={{ width: 180 }}
                value={opdrachtbevestigingenFilterStatus}
                onChange={(e) => setOpdrachtbevestigingenFilterStatus(e.target.value)}
              >
                <option value="">Alle statussen</option>
                {OFFERTE_STATUSSEN.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              {(opdrachtbevestigingenZoekterm || opdrachtbevestigingenFilterKlantgroep || opdrachtbevestigingenFilterOpdrachttype || opdrachtbevestigingenFilterStatus) && (
                <button
                  className="ot-btn-ghost"
                  onClick={() => {
                    setOpdrachtbevestigingenZoekterm("");
                    setOpdrachtbevestigingenFilterKlantgroep("");
                    setOpdrachtbevestigingenFilterOpdrachttype("");
                    setOpdrachtbevestigingenFilterStatus("");
                  }}
                >
                  Filters wissen
                </button>
              )}
            </div>

            {opdrachtbevestigingenLijstFout && (
              <div style={{ padding: 14, borderRadius: 10, background: "#FBF2EC", color: "#B14A2E", fontSize: 13, marginBottom: 16 }}>
                Kon de opdrachtbevestigingen niet laden. Controleer of de opslag is geconfigureerd (zie README, stap "Opslag van instellingen").
              </div>
            )}

            {opdrachtbevestigingenLijstBezig && opdrachtbevestigingenLijst.length === 0 && !opdrachtbevestigingenLijstFout && (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Bezig met laden…
              </div>
            )}

            {!opdrachtbevestigingenLijstBezig && opdrachtbevestigingenLijst.length === 0 && !opdrachtbevestigingenLijstFout && (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Nog geen opdrachtbevestigingen opgeslagen.
              </div>
            )}

            {opdrachtbevestigingenLijst.length > 0 && gefilterdeOpdrachtbevestigingen.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Geen opdrachtbevestigingen gevonden met deze zoekterm/filters.
              </div>
            )}

            {gefilterdeOpdrachtbevestigingen.length > 0 && (
              <div className="ot-card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F0EEE6", textAlign: "left" }}>
                      <th style={{ padding: "10px 12px", width: 1 }}>
                        <input
                          type="checkbox"
                          checked={
                            gepagineerdeOpdrachtbevestigingen.length > 0 &&
                            gepagineerdeOpdrachtbevestigingen.every((o) => opdrachtbevestigingenSelectie.has(o.id))
                          }
                          onChange={() =>
                            toggleAlleOpdrachtbevestigingenOpPagina(
                              gepagineerdeOpdrachtbevestigingen.map((o) => o.id),
                              gepagineerdeOpdrachtbevestigingen.length > 0 &&
                                gepagineerdeOpdrachtbevestigingen.every((o) => opdrachtbevestigingenSelectie.has(o.id))
                            )
                          }
                          title="Alles op deze pagina (de)selecteren"
                        />
                      </th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Datum</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Klant(en)</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Opdrachttype</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Status</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Bekeken</th>
                      <th style={{ padding: "10px 14px", fontWeight: 700, color: "#5B6259" }}>Opgemaakt door</th>
                      <th style={{ padding: "10px 14px", position: "sticky", right: 0, background: "#F0EEE6" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {gepagineerdeOpdrachtbevestigingen.map((o) => {
                      const statusInfo = offerteStatusInfo(o.status);
                      return (
                        <React.Fragment key={o.id}>
                        <tr
                          style={{
                            borderTop: "1px solid #E2E4DF",
                            background: opdrachtbevestigingenSelectie.has(o.id) ? "#EAF2F8" : "transparent",
                          }}
                        >
                          <td style={{ padding: "10px 12px" }}>
                            <input
                              type="checkbox"
                              checked={opdrachtbevestigingenSelectie.has(o.id)}
                              onChange={() => toggleOpdrachtbevestigingSelectie(o.id)}
                            />
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{datumTijd(o.aangemaaktOp)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {o.klantNamen && o.klantNamen.length > 0 ? o.klantNamen.join(", ") : "—"}
                            {o.automatischGegenereerd && (
                              <span
                                title="Automatisch aangemaakt na een verstreken tarieven-einddatum — controleer en verstuur."
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: "#8A6A1E",
                                  background: "#FBF3DE",
                                  borderRadius: 5,
                                  padding: "2px 6px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Automatisch concept
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px" }}>{o.opdrachttypeNaam || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <select
                              value={o.status || OPDRACHTBEVESTIGING_STATUS_STANDAARD}
                              onChange={(e) => wijzigOpdrachtbevestigingStatus(o.id, e.target.value)}
                              disabled={opdrachtbevestigingStatusBezigId === o.id}
                              style={{
                                border: "1px solid " + statusInfo.kleur + "33",
                                background: statusInfo.achtergrond,
                                color: statusInfo.kleur,
                                fontWeight: 600,
                                fontSize: 12,
                                borderRadius: 6,
                                padding: "5px 8px",
                                cursor: opdrachtbevestigingStatusBezigId === o.id ? "default" : "pointer",
                              }}
                            >
                              {OFFERTE_STATUSSEN.map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            {o.aantalBekeken > 0 ? (
                              <span title={o.laatstBekekenIp ? `IP: ${o.laatstBekekenIp}` : undefined}>
                                <Eye size={12} style={{ verticalAlign: "-2px", marginRight: 4, color: "#2E7D4F" }} />
                                {datumTijd(o.laatstBekekenOp)}
                                {o.aantalBekeken > 1 && (
                                  <span style={{ color: "#8A9089" }}> ({o.aantalBekeken}x)</span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: "#A5AA9F" }}>
                                <EyeOff size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                                Nog niet bekeken
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px" }}>{o.aangemaaktDoor || "—"}</td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              position: "sticky",
                              right: 0,
                              background: opdrachtbevestigingenSelectie.has(o.id) ? "#EAF2F8" : "#fff",
                              boxShadow: "-4px 0 6px -4px rgba(0,0,0,0.15)",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              <button className="ot-btn-ghost" onClick={() => toggleObLogboek(o.id)}>
                                <ScrollText size={13} />
                                Log
                              </button>
                              <button className="ot-btn-ghost" onClick={() => openOpdrachtbevestiging(o.id)}>
                                <FolderOpen size={13} />
                                Openen
                              </button>
                            </div>
                          </td>
                        </tr>
                        {obLogboekOpenId === o.id && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, borderTop: "1px solid #E2E4DF" }}>
                              <div style={{ padding: "14px 20px", background: "#FAFAF7" }}>
                                {obLogboekBezig && (
                                  <span style={{ fontSize: 12.5, color: "#8A9089" }}>Bezig met laden…</span>
                                )}
                                {!obLogboekBezig && obLogboekRecord?.fout && (
                                  <span style={{ fontSize: 12.5, color: "#B14A2E" }}>Kon het logboek niet laden.</span>
                                )}
                                {!obLogboekBezig && obLogboekRecord && !obLogboekRecord.fout && (
                                  <div style={{ display: "grid", gap: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6259" }}>Tekenlink:</span>
                                      <code style={{ fontSize: 11.5, background: "#EFEEE7", padding: "3px 8px", borderRadius: 6 }}>
                                        {`${window.location.origin}/tekenen/${o.id}`}
                                      </code>
                                      <button
                                        className="ot-btn-ghost"
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(`${window.location.origin}/tekenen/${o.id}`);
                                          } catch (e) {
                                            window.prompt("Kopieer deze link handmatig:", `${window.location.origin}/tekenen/${o.id}`);
                                          }
                                        }}
                                      >
                                        <Link2 size={12} />
                                        Kopiëren
                                      </button>
                                    </div>

                                    {obLogboekRecord.ondertekening ? (
                                      <div
                                        style={{
                                          padding: 12,
                                          borderRadius: 8,
                                          background: obLogboekRecord.ondertekening.akkoord ? "#E7F4EC" : "#FBF2EC",
                                          border: `1px solid ${obLogboekRecord.ondertekening.akkoord ? "#BFE0CC" : "#E2C4B0"}`,
                                          fontSize: 12.5,
                                        }}
                                      >
                                        <strong>{obLogboekRecord.ondertekening.akkoord ? "Ondertekend (akkoord)" : "Afgewezen (niet akkoord)"}</strong>
                                        <div style={{ marginTop: 4, color: "#5B6259" }}>
                                          door {obLogboekRecord.ondertekening.naam} ({obLogboekRecord.ondertekening.email})
                                          <br />
                                          op {datumTijd(obLogboekRecord.ondertekening.op)} · IP {obLogboekRecord.ondertekening.ip}
                                          {obLogboekRecord.ondertekening.opmerking && (
                                            <>
                                              <br />
                                              Opmerking: "{obLogboekRecord.ondertekening.opmerking}"
                                            </>
                                          )}
                                        </div>
                                        {obLogboekRecord.ondertekening.emailKomtOvereen === false && (
                                          <div style={{ marginTop: 6, fontSize: 11.5, color: "#8A6A1E", background: "#FBF3DE", borderRadius: 6, padding: "5px 8px" }}>
                                            ⚠ E-mailadres wijkt af van het bekende contactadres
                                          </div>
                                        )}
                                        {obLogboekRecord.ondertekening.handtekening && (
                                          <img
                                            src={obLogboekRecord.ondertekening.handtekening}
                                            alt="Handtekening"
                                            style={{ maxWidth: 220, marginTop: 8, background: "#fff", border: "1px solid #E2E4DF", borderRadius: 6 }}
                                          />
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 12.5, color: "#8A9089" }}>Nog niet ondertekend of afgewezen.</span>
                                    )}

                                    <div>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6259" }}>Logboek</span>
                                      {(obLogboekRecord.logboek || []).length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#8A9089", marginTop: 4 }}>Nog geen gebeurtenissen.</div>
                                      ) : (
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
                                          <tbody>
                                            {[...obLogboekRecord.logboek].reverse().map((entry, i) => (
                                              <tr key={i} style={{ borderTop: "1px solid #E2E4DF" }}>
                                                <td style={{ padding: "5px 6px", whiteSpace: "nowrap", color: "#5B6259" }}>
                                                  {datumTijd(entry.op)}
                                                </td>
                                                <td style={{ padding: "5px 6px", fontWeight: 600 }}>{entry.gebeurtenis}</td>
                                                <td style={{ padding: "5px 6px", color: "#8A9089" }}>
                                                  {entry.naam ? `${entry.naam} (${entry.email}) · ` : ""}IP {entry.ip}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {gefilterdeOpdrachtbevestigingen.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {opdrachtbevestigingenTotaalPaginas > 1 && (
                    <>
                      <button
                        className="ot-btn-ghost"
                        disabled={opdrachtbevestigingenPaginaVeilig === 1}
                        onClick={() => setOpdrachtbevestigingenPagina((p) => Math.max(1, p - 1))}
                        style={{ opacity: opdrachtbevestigingenPaginaVeilig === 1 ? 0.4 : 1 }}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {Array.from({ length: opdrachtbevestigingenTotaalPaginas }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setOpdrachtbevestigingenPagina(p)}
                          style={{
                            minWidth: 30,
                            height: 30,
                            border: "1px solid #C8CDC5",
                            background: p === opdrachtbevestigingenPaginaVeilig ? "#1C5D8C" : "#fff",
                            color: p === opdrachtbevestigingenPaginaVeilig ? "#fff" : "#5B6259",
                            borderRadius: 8,
                            fontSize: 12.5,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        className="ot-btn-ghost"
                        disabled={opdrachtbevestigingenPaginaVeilig === opdrachtbevestigingenTotaalPaginas}
                        onClick={() => setOpdrachtbevestigingenPagina((p) => Math.min(opdrachtbevestigingenTotaalPaginas, p + 1))}
                        style={{ opacity: opdrachtbevestigingenPaginaVeilig === opdrachtbevestigingenTotaalPaginas ? 0.4 : 1 }}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#8A9089" }}>
                    {gefilterdeOpdrachtbevestigingen.length} opdrachtbevestiging{gefilterdeOpdrachtbevestigingen.length === 1 ? "" : "en"}
                    {opdrachtbevestigingenTotaalPaginas > 1 ? ` · pagina ${opdrachtbevestigingenPaginaVeilig} van ${opdrachtbevestigingenTotaalPaginas}` : ""}
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A9089" }}>
                    Per pagina
                    <select
                      className="ot-input"
                      style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}
                      value={opdrachtbevestigingenPaginaGrootte}
                      onChange={(e) => setOpdrachtbevestigingenPaginaGrootte(e.target.value === "alle" ? "alle" : Number(e.target.value))}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value="alle">Alle</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </StapWrapper>
        )}

        {/* -------------------- KLANT -------------------- */}
        {stap === "klant" && (
          <StapWrapper
            titel="Selecteer klanten"
            toelichting="Klanten worden opgehaald uit Dynamics op basis van uw rechten. U kunt er meerdere kiezen — er wordt dan per klant een aparte offerte gemaakt met dezelfde diensten."
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 20,
                marginBottom: 14,
                background: klantenUitDynamics ? "#EAF2F8" : "#FBF2EC",
                color: klantenUitDynamics ? "#1C5D8C" : "#B14A2E",
              }}
            >
              {klantenUitDynamics ? "● Live data uit Dynamics" : "● Voorbeelddata (Dynamics nog niet gekoppeld)"}
            </div>
            {klantenFoutmelding && (
              <div
                style={{
                  fontSize: 12,
                  color: "#B14A2E",
                  background: "#FBF2EC",
                  border: "1px solid #E2C4B0",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginTop: -6,
                  marginBottom: 14,
                  fontFamily: "ui-monospace, monospace",
                  wordBreak: "break-word",
                }}
              >
                <strong>Foutmelding Dynamics-koppeling:</strong> {klantenFoutmelding}
              </div>
            )}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#8A9089" }} />
              <input
                className="ot-input"
                style={{ paddingLeft: 36, paddingRight: klantenLaden ? 90 : undefined }}
                placeholder="Zoek op klantnaam, plaats of klantgroep…"
                value={zoekKlant}
                onChange={(e) => setZoekKlant(e.target.value)}
              />
              {klantenLaden && (
                <span style={{ position: "absolute", right: 12, top: 11, fontSize: 12, color: "#8A9089" }}>
                  zoeken…
                </span>
              )}
            </div>

            {gekozenKlanten.length > 0 && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 14px",
                  background: "#EAF2F8",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#3A4038" }}>
                  <strong>{gekozenKlanten.length}</strong> klant{gekozenKlanten.length > 1 ? "en" : ""} geselecteerd
                </span>
                <button
                  onClick={() => setGekozenKlanten([])}
                  style={{ border: "none", background: "transparent", color: "#8A9089", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
                >
                  Selectie wissen
                </button>
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {gefilterdeKlanten.slice(0, 10).map((k) => {
                const actief = gekozenKlanten.some((x) => x.id === k.id);
                const metaDelen = [k.contact, k.plaats, k.segment].filter(Boolean);
                return (
                  <button
                    key={k.id}
                    onClick={() => toggleKlant(k)}
                    className="ot-card"
                    style={{
                      textAlign: "left",
                      padding: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      borderColor: actief ? "#1C5D8C" : "#E2E4DF",
                      borderWidth: actief ? 2 : 1,
                      background: actief ? "#EAF2F8" : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          border: actief ? "none" : "1.5px solid #C8CDC5",
                          background: actief ? "#1C5D8C" : "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {actief && <Check size={13} color="#fff" />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{k.naam}</div>
                        {metaDelen.length > 0 && (
                          <div style={{ fontSize: 12.5, color: "#5B6259", marginTop: 2 }}>
                            {metaDelen.join(" · ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {heeftMeerResultaten && (
                <div style={{ textAlign: "center", padding: "10px 4px", color: "#8A9089", fontSize: 12.5 }}>
                  Meer klanten gevonden — verfijn uw zoekopdracht om ze te zien.
                </div>
              )}
              {gefilterdeKlanten.length === 0 && !klantenLaden && (
                <div style={{ textAlign: "center", padding: 30, color: "#8A9089", fontSize: 13.5 }}>
                  Geen klanten gevonden voor "{zoekKlant}".
                </div>
              )}
            </div>

            <StapNavigatie onVolgende={volgende} volgendeDisabled={!kanNaarDiensten} volgendeLabel="Diensten kiezen" />
          </StapWrapper>
        )}

        {/* -------------------- DIENSTEN KIEZEN -------------------- */}
        {stap === "diensten" && (
          <StapWrapper
            titel="Vink diensten aan"
            toelichting="Kies welke diensten meegaan en het aantal. Heeft een dienst varianten of staffels (zoals Klein/Middel/Groot)? Die kiest u per klant bij de volgende stap, Prijzen."
          >
            {categorieen.map((cat) => (
              <div key={cat.id}>
                <div className="ot-cat-koptekst">
                  <span>{(cat.naam || "").trim() || "Naamloze categorie"}</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {dienstenCatalogus
                    .filter((d) => d.categorie === cat.id)
                    .map((dienst) => {
                      const info = geselecteerd[dienst.id];
                      const actief = !!info;
                      const meerdereVarianten = dienst.varianten.length > 1;
                      const prijzen = dienst.varianten
                        .map((v) => v.prijs)
                        .filter((p) => p !== null && p !== "nacalculatie");
                      const prijsIndicatie =
                        !meerdereVarianten
                          ? dienst.varianten[0].prijs === null
                            ? "op aanvraag"
                            : dienst.varianten[0].prijs === "nacalculatie"
                            ? "op nacalculatie"
                            : `${currency(dienst.varianten[0].prijs)} / ${dienst.eenheid}`
                          : prijzen.length
                          ? `${currency(Math.min(...prijzen))} – ${currency(Math.max(...prijzen))} / ${dienst.eenheid}`
                          : "op aanvraag / nacalculatie";

                      return (
                        <div
                          key={dienst.id}
                          className="ot-card"
                          style={{ padding: 16, borderColor: actief ? "#1C5D8C" : "#E2E4DF" }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", flex: 1 }}>
                              <input
                                type="checkbox"
                                checked={actief}
                                onChange={() => toggleDienstSelectie(dienst)}
                                style={{ marginTop: 3, width: 16, height: 16, accentColor: "#1C5D8C" }}
                              />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{dienst.naam}</div>
                                <div style={{ fontSize: 12.5, color: "#B98237", marginTop: 3, fontWeight: 600 }}>
                                  {prijsIndicatie}
                                  {meerdereVarianten && (
                                    <span style={{ color: "#8A9089", fontWeight: 500 }}> · {dienst.varianten.map((v) => v.naam || "Standaard").join(" / ")}</span>
                                  )}
                                </div>
                              </div>
                            </label>

                            {actief && dienst.gebruikAantallen !== false && (
                              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => zetAantal(dienst.id, (info.aantal || 1) - 1)} style={stapKnopStyle}>
                                    <Minus size={13} />
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    className="ot-input"
                                    style={{ width: 52, textAlign: "center", padding: "5px 6px", fontWeight: 700 }}
                                    value={info.aantal || 1}
                                    onChange={(e) => zetAantal(dienst.id, Math.max(1, Number(e.target.value) || 1))}
                                  />
                                  <button onClick={() => zetAantal(dienst.id, (info.aantal || 1) + 1)} style={stapKnopStyle}>
                                    <Plus size={13} />
                                  </button>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#8A9089" }}>× factor</span>
                                  <input
                                    type="number"
                                    min="1"
                                    className="ot-input"
                                    style={{ width: 52, textAlign: "center", padding: "5px 6px" }}
                                    value={info.factor || 1}
                                    onChange={(e) => zetFactor(dienst.id, Math.max(1, Number(e.target.value) || 1))}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            {geselecteerdeEntries.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "#EAF2F8",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <span style={{ color: "#5B6259" }}>{geselecteerdeEntries.length} dienst(en) geselecteerd</span>
                {heeftMeerdereVarianten && (
                  <span style={{ color: "#5B6259" }}>Kies varianten per klant bij de volgende stap</span>
                )}
              </div>
            )}

            <StapNavigatie onVorige={vorige} onVolgende={volgende} volgendeDisabled={!kanNaarPrijzen} volgendeLabel="Prijzen per klant" />
          </StapWrapper>
        )}

        {/* -------------------- PRIJZEN PER KLANT -------------------- */}
        {stap === "prijzen" && (
          <StapWrapper
            titel="Prijs (en variant) per dienst, per klant"
            toelichting="Kies voor elke klant welke variant of staffel geldt (indien van toepassing) en pas de prijs aan waar nodig. Heeft u meerdere klanten? Dan kunt u per klant een dienst ook los aan- of uitzetten met het vinkje bovenin elke cel."
          >
            <div className="ot-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: gekozenKlanten.length > 1 ? 480 + gekozenKlanten.length * 200 : undefined,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#FBFBF9", borderBottom: "1px solid #E2E4DF" }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px 16px",
                          fontSize: 11.5,
                          textTransform: "uppercase",
                          letterSpacing: ".04em",
                          color: "#5B6259",
                          position: "sticky",
                          left: 0,
                          background: "#FBFBF9",
                          minWidth: gekozenKlanten.length > 1 ? 220 : undefined,
                        }}
                      >
                        Dienst
                      </th>
                      {gekozenKlanten.map((k) => (
                        <th
                          key={k.id}
                          style={{
                            textAlign: "left",
                            padding: "12px 16px",
                            fontSize: 12,
                            color: "#1C2321",
                            minWidth: gekozenKlanten.length > 1 ? 200 : undefined,
                            borderLeft: "1px solid #E2E4DF",
                          }}
                        >
                          {k.naam}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {geselecteerdeEntries.map(({ dienst, aantal, factor }) => {
                      const meerdereVarianten = dienst.varianten.length > 1;
                      return (
                        <tr key={dienst.id} style={{ borderBottom: "1px solid #E2E4DF" }}>
                          <td style={{ padding: "12px 16px", position: "sticky", left: 0, background: "#fff", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{dienst.naam}</div>
                            <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>
                              {dienst.eenheid} · {aantal}×{factor && factor !== 1 ? ` · factor ${factor}` : ""}
                            </div>
                          </td>
                          {gekozenKlanten.map((k) => {
                            const variant = variantVoorKlant(k.id, dienst);
                            const key = prijsSleutel(k.id, dienst.id);
                            const aangepast = aangepastePrijzen[key] !== undefined && aangepastePrijzen[key] !== "";
                            const huidigeWaarde =
                              aangepastePrijzen[key] !== undefined
                                ? aangepastePrijzen[key]
                                : variant?.prijs === null || variant?.prijs === "nacalculatie"
                                ? ""
                                : variant.prijs;
                            const uitgeschakeld = isUitgeschakeldVoorKlant(k.id, dienst.id);
                            return (
                              <td key={k.id} style={{ padding: "10px 16px", borderLeft: "1px solid #E2E4DF", verticalAlign: "top" }}>
                                {gekozenKlanten.length > 1 && (
                                  <label
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      fontSize: 11.5,
                                      color: uitgeschakeld ? "#B4B9AE" : "#5B6259",
                                      marginBottom: 8,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!uitgeschakeld}
                                      onChange={() => toggleDienstVoorKlant(k.id, dienst.id)}
                                      style={{ width: 14, height: 14, accentColor: "#1C5D8C" }}
                                    />
                                    {uitgeschakeld ? "Niet voor deze klant" : "Voor deze klant"}
                                  </label>
                                )}
                                {!uitgeschakeld && (
                                  <>
                                {meerdereVarianten && (
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                                    {dienst.varianten.map((v) => (
                                      <button
                                        key={v.id}
                                        className={`ot-pill ${variant.id === v.id ? "actief" : ""}`}
                                        style={{ padding: "4px 10px", fontSize: 11.5 }}
                                        onClick={() => kiesVariantVoorKlant(k.id, dienst.id, v.id)}
                                      >
                                        {v.naam || "Standaard"}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ position: "absolute", left: 10, fontSize: 13, color: "#8A9089" }}>€</span>
                                  <input
                                    className="ot-input"
                                    type="number"
                                    step="0.01"
                                    placeholder={
                                      variant?.prijs === null
                                        ? "op aanvraag"
                                        : variant?.prijs === "nacalculatie"
                                        ? "nacalculatie"
                                        : ""
                                    }
                                    style={{ paddingLeft: 22, fontWeight: aangepast ? 700 : 400, borderColor: aangepast ? "#B98237" : "#C8CDC5" }}
                                    value={huidigeWaarde}
                                    onChange={(e) => zetPrijs(k.id, dienst.id, e.target.value)}
                                  />
                                  {aangepast && (
                                    <button
                                      title="Terug naar catalogusprijs"
                                      onClick={() => resetPrijs(k.id, dienst.id)}
                                      style={{ border: "none", background: "transparent", color: "#8A9089", cursor: "pointer", display: "flex", flexShrink: 0 }}
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                  )}
                                </div>
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13, position: "sticky", left: 0, background: "#FBFBF9", borderTop: "2px solid #1C2321" }}>
                        Totaal (excl. btw)
                      </td>
                      {gekozenKlanten.map((k) => {
                        const t = regelsVoorKlant(k.id).reduce((s, r) => s + r.subtotaal, 0);
                        return (
                          <td key={k.id} style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13.5, borderLeft: "1px solid #E2E4DF", borderTop: "2px solid #1C2321", background: "#FBFBF9" }}>
                            {currency(t)}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#8A9089", marginTop: 12 }}>
              <RotateCcw size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              zet een aangepaste prijs terug naar de catalogusprijs.
            </p>

            <StapNavigatie onVorige={vorige} onVolgende={naarBijlage} volgendeDisabled={!kanNaarOfferte} volgendeLabel="Bijlage toevoegen" />
          </StapWrapper>
        )}

        {/* -------------------- BIJLAGE (TOELICHTING) -------------------- */}
        {stap === "bijlage" && (
          <StapWrapper
            titel="Toelichting per onderdeel"
            toelichting="Pas hier de inleidende tekst en een algemene toelichting aan (apart voor offerte en opdrachtbevestiging), en voor de offerte optioneel ook iets klantspecifieks en/of een toelichting per dienst. Alles wordt bewaard en samengevoegd in één gezamenlijke bijlage na de offertes — de klantspecifieke tekst verschijnt op de offerte van díe klant zelf. De opdrachtbevestiging heeft alleen de algemene toelichting; klantspecifiek, per dienst en de roadmap gelden daar niet voor."
          >
            <div className="ot-cat-koptekst" style={{ marginTop: 0 }}>
              <span>Inleidende tekst</span>
            </div>
            <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
              <div className="ot-card" style={{ padding: 16 }}>
                <label className="ot-label">Offerte</label>
                <textarea
                  className="ot-input"
                  rows={3}
                  value={afzender.inleiding}
                  onChange={(e) => setAfzender({ ...afzender, inleiding: e.target.value })}
                />
              </div>
              <div className="ot-card" style={{ padding: 16 }}>
                <label className="ot-label">Opdrachtbevestiging</label>
                <textarea
                  className="ot-input"
                  rows={3}
                  value={opdrachtbevestigingInleiding}
                  onChange={(e) => setOpdrachtbevestigingInleiding(e.target.value)}
                />
              </div>
            </div>

            {(standaardTeksten.algemeen.trim() !== "" ||
              Object.values(standaardTeksten.perDienst).some((t) => (t || "").trim() !== "")) && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button className="ot-btn-secondary" onClick={alleStandaardtekstenOvernemen}>
                  <RotateCcw size={14} />
                  Alle standaardteksten overnemen
                </button>
              </div>
            )}
            <div
              className="ot-card"
              style={{
                padding: 16,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderColor: roadmapToevoegen ? "#1C5D8C" : "#E2E4DF",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={roadmapToevoegen}
                  onChange={(e) => setRoadmapToevoegen(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "#1C5D8C" }}
                />
                <span>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Roadmap toevoegen aan deze offerte</div>
                  <div style={{ fontSize: 12, color: "#8A9089" }}>"{roadmap.titel}" — te beheren via "Roadmap beheren"</div>
                </span>
              </label>
              <Milestone size={20} color={roadmapToevoegen ? "#1C5D8C" : "#B4B9AE"} />
            </div>
            <div style={{ display: "grid", gap: 20 }}>
              <div>
                <div className="ot-cat-koptekst" style={{ marginTop: 0 }}>
                  <span>Algemeen</span>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="ot-card" style={{ padding: 16, borderColor: "#1C5D8C" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label className="ot-label">Offerte</label>
                      {standaardTeksten.algemeen.trim() !== "" && (
                        <button
                          className="ot-btn-ghost"
                          onClick={() => setAlgemeneToelichting(standaardTeksten.algemeen)}
                          title="Standaardtekst gebruiken"
                        >
                          <RotateCcw size={12} />
                          Standaardtekst
                        </button>
                      )}
                    </div>
                    <textarea
                      className="ot-input"
                      rows={4}
                      placeholder="Algemene toelichting, niet gekoppeld aan een specifieke dienst…"
                      value={algemeneToelichting}
                      onChange={(e) => setAlgemeneToelichting(e.target.value)}
                    />
                  </div>
                  <div className="ot-card" style={{ padding: 16, borderColor: "#1C5D8C" }}>
                    <label className="ot-label">Opdrachtbevestiging</label>
                    <textarea
                      className="ot-input"
                      rows={4}
                      placeholder="Algemene toelichting, niet gekoppeld aan een specifieke dienst…"
                      value={algemeneToelichtingOpdrachtbevestiging}
                      onChange={(e) => setAlgemeneToelichtingOpdrachtbevestiging(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {dienstenMetOpdrachtbevestigingTekst.length > 0 && (
                <div>
                  <div className="ot-cat-koptekst">
                    <span>Diensten — opdrachtbevestiging</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#8A9089", margin: "0 0 10px" }}>
                    Deze vrijwillige teksten staan standaard aan omdat de bijbehorende dienst is
                    gekozen. Vink uit als een tekst voor déze opdrachtbevestiging niet van
                    toepassing is — de standaardtekst zelf pas je aan via "Opdrachtbevestiging-teksten
                    beheren".
                  </p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {dienstenMetOpdrachtbevestigingTekst.map(({ dienst }) => (
                      <div key={dienst.id} className="ot-card" style={{ padding: 16 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={!opdrachtbevestigingDienstTekstUit[dienst.id]}
                            onChange={() => toggleOpdrachtbevestigingDienstTekst(dienst.id)}
                          />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{dienst.naam}</span>
                        </label>
                        <p style={{ fontSize: 12.5, color: "#3A4038", margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
                          {opdrachtbevestigingDienstTeksten[dienst.id]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {gekozenKlanten.length > 0 && (
                <div>
                  <div className="ot-cat-koptekst">
                    <span>Klantspecifiek</span>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {gekozenKlanten.map((klant) => (
                      <div key={klant.id} className="ot-card" style={{ padding: 16 }}>
                        <label className="ot-label">{klant.naam}</label>
                        <textarea
                          className="ot-input"
                          rows={3}
                          placeholder={`Iets specifieks over ${klant.naam}…`}
                          value={klantToelichtingen[klant.id] || ""}
                          onChange={(e) =>
                            setKlantToelichtingen((prev) => ({ ...prev, [klant.id]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {geselecteerdeEntries.length > 0 && (
                <div>
                  <div className="ot-cat-koptekst">
                    <span>Diensten</span>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {geselecteerdeEntries.map(({ dienst }) => (
                      <div key={dienst.id} className="ot-card" style={{ padding: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label className="ot-label">{dienst.naam}</label>
                          {(standaardTeksten.perDienst[dienst.id] || "").trim() !== "" && (
                            <button
                              className="ot-btn-ghost"
                              onClick={() =>
                                setBijlageToelichtingen((prev) => ({ ...prev, [dienst.id]: standaardTeksten.perDienst[dienst.id] }))
                              }
                              title="Standaardtekst gebruiken"
                            >
                              <RotateCcw size={12} />
                              Standaardtekst
                            </button>
                          )}
                        </div>
                        <textarea
                          className="ot-input"
                          rows={3}
                          placeholder={`Toelichting bij ${dienst.naam.toLowerCase()}…`}
                          value={bijlageToelichtingen[dienst.id] || ""}
                          onChange={(e) =>
                            setBijlageToelichtingen((prev) => ({ ...prev, [dienst.id]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {geselecteerdeEntries.length === 0 && (
                <div style={{ textAlign: "center", padding: 30, color: "#8A9089", fontSize: 13.5 }}>
                  Nog geen diensten geselecteerd.
                </div>
              )}
            </div>

            <StapNavigatie onVorige={vorige} onVolgende={volgende} volgendeLabel="Offerte bekijken" />
          </StapWrapper>
        )}

        {/* -------------------- OFFERTE -------------------- */}
        {stap === "offerte" && (
          <StapWrapper
            titel={gekozenKlanten.length > 1 ? `${gekozenKlanten.length} offertes` : "Offerte"}
            toelichting={
              gekozenKlanten.length > 1
                ? "Voor elke geselecteerde klant is een eigen offerte samengesteld. Druk alles in één keer af of sla op als PDF."
                : "Controleer de offerte en druk af of sla op als PDF."
            }
          >
            {gekozenKlanten.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Nog geen klant geselecteerd.
                <div style={{ marginTop: 12 }}>
                  <button className="ot-btn-secondary" onClick={() => setStap("klant")}>
                    <Users size={15} />
                    Klant kiezen
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div id="offerte-print-gebied">
            {gekozenKlanten.map((klant, idx) => {
              const klantRegels = regelsVoorKlant(klant.id);
              const klantTotaalExcl = klantRegels.reduce((s, r) => s + r.subtotaal, 0);
              const klantBtw = klantTotaalExcl * 0.21;
              const klantTotaalIncl = klantTotaalExcl + klantBtw;
              const groepen = groepeerOpCategorie(
                klantRegels,
                categorieen.map((c) => ({ id: c.id, naam: (c.naam || "").trim() || "Naamloze categorie" }))
              );

              return (
                <div
                  key={klant.id}
                  className="ot-card offerte-doc"
                  style={{ padding: 40, marginBottom: idx < gekozenKlanten.length - 1 ? 24 : 0 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                      {gekozenKlanten.length > 1 && (
                        <div style={{ fontSize: 11.5, color: "#B98237", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
                          Offerte {idx + 1} van {gekozenKlanten.length}
                        </div>
                      )}
                      <div className="offertetool-serif" style={{ fontSize: 26, fontWeight: 600 }}>Offerte</div>
                      <div style={{ fontSize: 12.5, color: "#8A9089", marginTop: 4 }}>
                        Datum: {new Date().toLocaleDateString("nl-NL")} · Geldig {afzender.geldigheid} dagen
                      </div>
                    </div>
                    {logo && (
                      <img
                        src={logo}
                        alt="Logo"
                        style={{ maxWidth: 140, maxHeight: 56, objectFit: "contain", flexShrink: 0, marginLeft: 24 }}
                      />
                    )}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12.5, color: "#5B6259", lineHeight: 1.5, marginBottom: 32 }}>
                    <div style={{ fontWeight: 700, color: "#1C2321" }}>{afzender.bedrijf}</div>
                    <div>{afzender.adres}</div>
                    <div>{afzender.postcode} {afzender.plaats}</div>
                    <div>KvK {afzender.kvk}</div>
                  </div>

                  <div className="ot-tweekolommen" style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid #E2E4DF" }}>
                    <div>
                      <div className="ot-label">Aan</div>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{klant.naam}</div>
                      <div style={{ fontSize: 13, color: "#5B6259" }}>{klant.contact}</div>
                      {klantAdresRegels(klant).map((regel, i) => (
                        <div key={i} style={{ fontSize: 13, color: "#5B6259" }}>{regel}</div>
                      ))}
                      <div style={{ fontSize: 13, color: "#5B6259" }}>{klant.email}</div>
                    </div>
                    <div>
                      <div className="ot-label">Namens</div>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{huidigeGebruiker.naam}</div>
                      {huidigeGebruiker.email && huidigeGebruiker.email.toLowerCase() !== (huidigeGebruiker.naam || "").toLowerCase() && (
                        <div style={{ fontSize: 13, color: "#5B6259" }}>{huidigeGebruiker.email}</div>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A4038", marginBottom: 24 }}>
                    {afzender.inleiding}
                  </p>

                  {(klantToelichtingen[klant.id] || "").trim() !== "" && (
                    <div style={{ background: "#EAF2F8", borderRadius: 8, padding: 16, marginBottom: 24 }}>
                      <div className="ot-label" style={{ color: "#1C5D8C" }}>Speciaal voor {klant.naam}</div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A4038", whiteSpace: "pre-wrap" }}>
                        {klantToelichtingen[klant.id]}
                      </div>
                    </div>
                  )}

                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #1C2321" }}>
                        <th style={{ textAlign: "left", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Dienst</th>
                        <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Aantal</th>
                        <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Prijs</th>
                        <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Subtotaal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groepen.map((g) => (
                        <React.Fragment key={g.cat}>
                          <tr>
                            <td colSpan={4} style={{ padding: "12px 4px 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#B98237" }}>
                              {g.naam}
                            </td>
                          </tr>
                          {g.items.map((r) => (
                            <tr key={r.id} style={{ borderBottom: "1px solid #E2E4DF" }}>
                              <td style={{ padding: "10px 4px" }}>
                                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.naam}</div>
                              </td>
                              <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 13.5 }}>{formatteerAantal(r.aantal, r.eenheid, r.factor)}</td>
                              <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 13.5 }}>
                                {r.opAanvraag ? "op aanvraag" : r.opNacalculatie ? "nacalculatie" : currency(r.prijs)}
                              </td>
                              <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 13.5, fontWeight: 700 }}>
                                {r.opAanvraag || r.opNacalculatie ? "—" : currency(r.subtotaal)}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ width: "100%", maxWidth: 240, fontSize: 13.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                        <span style={{ color: "#5B6259" }}>Subtotaal</span>
                        <span>{currency(klantTotaalExcl)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                        <span style={{ color: "#5B6259" }}>Btw (21%)</span>
                        <span>{currency(klantBtw)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: "2px solid #1C2321", fontWeight: 700, fontSize: 15 }}>
                        <span>Totaal</span>
                        <span>{currency(klantTotaalIncl)}</span>
                      </div>
                    </div>
                  </div>

                  {algemeneVoorwaarden.url && (
                    <p style={{ fontSize: 11, color: "#8A9089", marginTop: 32, paddingTop: 12, borderTop: "1px solid #E2E4DF" }}>
                      Op deze offerte zijn onze{" "}
                      <a
                        href={algemeneVoorwaarden.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#1C5D8C", textDecoration: "underline" }}
                      >
                        {algemeneVoorwaarden.titel?.toLowerCase() || "algemene voorwaarden"}
                      </a>{" "}
                      van toepassing.
                    </p>
                  )}
                </div>
              );
            })}

            {roadmapToevoegen && roadmap.fases.length > 0 && (
              <div className="ot-card offerte-doc" style={{ padding: 40 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <div className="offertetool-serif" style={{ fontSize: 22, fontWeight: 600 }}>
                    {roadmap.titel}
                  </div>
                  {logo && (
                    <img
                      src={logo}
                      alt="Logo"
                      style={{ maxWidth: 140, maxHeight: 56, objectFit: "contain", flexShrink: 0, marginLeft: 24 }}
                    />
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {roadmap.fases.map((fase) => (
                    <div key={fase.id} style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: "#1C5D8C",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {fase.markering}
                        </div>
                        <div style={{ height: 2, background: "#EAF2F8", flex: 1 }} />
                      </div>
                      <div
                        style={{
                          border: "1.5px solid #1C5D8C",
                          borderRadius: 10,
                          padding: 14,
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#B98237", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                          {fase.label}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1C2321", marginBottom: 8 }}>
                          {fase.titel}
                        </div>
                        {fase.puntenTekst
                          .split("\n")
                          .map((p) => p.trim())
                          .filter(Boolean).length > 0 && (
                          <ul style={{ margin: 0, marginBottom: 10, paddingLeft: 16, fontSize: 11.5, color: "#3A4038", lineHeight: 1.5 }}>
                            {fase.puntenTekst
                              .split("\n")
                              .map((p) => p.trim())
                              .filter(Boolean)
                              .map((punt, i) => (
                                <li key={i}>{punt}</li>
                              ))}
                          </ul>
                        )}
                        {fase.resultaatTekst && (
                          <div
                            style={{
                              marginTop: "auto",
                              background: "#EAF2F8",
                              borderRadius: 6,
                              padding: "8px 10px",
                            }}
                          >
                            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#1C5D8C", textTransform: "uppercase", letterSpacing: ".04em" }}>
                              {fase.resultaatLabel}
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#1C2321" }}>{fase.resultaatTekst}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(algemeneToelichting.trim() !== "" ||
              geselecteerdeEntries.some(({ dienst }) => (bijlageToelichtingen[dienst.id] || "").trim() !== "")) && (
              <div className="ot-card offerte-doc" style={{ padding: 40 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div className="offertetool-serif" style={{ fontSize: 22, fontWeight: 600 }}>
                    Bijlage — toelichting per onderdeel
                  </div>
                  {logo && (
                    <img
                      src={logo}
                      alt="Logo"
                      style={{ maxWidth: 140, maxHeight: 56, objectFit: "contain", flexShrink: 0, marginLeft: 24 }}
                    />
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 24 }}>
                  Deze toelichting geldt voor alle bovenstaande offertes.
                </div>
                <div style={{ display: "grid", gap: 20 }}>
                  {algemeneToelichting.trim() !== "" && (
                    <div style={{ paddingBottom: 16, borderBottom: "1px solid #E2E4DF" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Algemeen</div>
                      <div style={{ fontSize: 13, color: "#3A4038", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {algemeneToelichting}
                      </div>
                    </div>
                  )}
                  {geselecteerdeEntries
                    .filter(({ dienst }) => (bijlageToelichtingen[dienst.id] || "").trim() !== "")
                    .map(({ dienst }) => (
                      <div key={dienst.id} style={{ paddingBottom: 16, borderBottom: "1px solid #E2E4DF" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{dienst.naam}</div>
                        <div style={{ fontSize: 13, color: "#3A4038", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {bijlageToelichtingen[dienst.id]}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            </div>

            {offerteVraagStatusTonen && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "#EAF2F8",
                  border: "1px solid #B7CFE0",
                  marginTop: 20,
                }}
              >
                <span style={{ fontSize: 13, color: "#1C5D8C" }}>
                  Offerte afgedrukt/opgeslagen als PDF. Status bijwerken naar "Verzonden"?
                </span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button className="ot-btn-secondary" onClick={() => setOfferteVraagStatusTonen(false)}>
                    Nee, laten staan
                  </button>
                  <button
                    onClick={zetOfferteOpVerzonden}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      background: "#1C5D8C",
                      color: "#fff",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Check size={14} />
                    Ja, zet op Verzonden
                  </button>
                </div>
              </div>
            )}

            {(() => {
              // Klanten groeperen op (eventueel aangepast) e-mailadres — als dezelfde
              // contactpersoon bij meerdere klanten hoort, komt die maar één keer in de
              // lijst, met beide klantnamen erbij, in plaats van 2x hetzelfde adres.
              const mailGroepen = [];
              const indexPerSleutel = new Map();
              gekozenKlanten.forEach((klant) => {
                const email = (mailAdressen[klant.id] ?? klant.email ?? "").trim().toLowerCase();
                const sleutel = email || `__geen-adres__${klant.id}`;
                if (indexPerSleutel.has(sleutel)) {
                  mailGroepen[indexPerSleutel.get(sleutel)].klanten.push(klant);
                } else {
                  indexPerSleutel.set(sleutel, mailGroepen.length);
                  mailGroepen.push({ sleutel, klanten: [klant] });
                }
              });

              return (
                <div style={{ padding: "14px 16px", background: "#FAFAF7", border: "1px solid #E2E4DF", borderRadius: 10, marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#5B6259", marginBottom: 10 }}>
                    Tekenlink per e-mail aanbieden
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {mailGroepen.map((groep) => {
                      const eerste = groep.klanten[0];
                      const emailWaarde = mailAdressen[eerste.id] ?? eerste.email ?? "";
                      const klantNamenTekst = groep.klanten.map((k) => k.naam).join(" + ");
                      const status = mailStatus[groep.sleutel];
                      const conceptOpen = mailConceptOpenSleutel === groep.sleutel;
                      const concept = mailConcepten[groep.sleutel];
                      return (
                        <div key={groep.sleutel}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12.5, minWidth: 140, color: "#3A4038" }}>{klantNamenTekst}</span>
                            <input
                              className="ot-input"
                              type="email"
                              style={{ flex: 1, minWidth: 200 }}
                              value={emailWaarde}
                              onChange={(e) => {
                                const nieuweWaarde = e.target.value;
                                setMailAdressen((prev) => {
                                  const next = { ...prev };
                                  groep.klanten.forEach((k) => {
                                    next[k.id] = nieuweWaarde;
                                  });
                                  return next;
                                });
                              }}
                              placeholder="e-mailadres@voorbeeld.nl"
                            />
                            {!conceptOpen && (
                              <button
                                className="ot-btn-secondary"
                                onClick={() => openMailConcept(groep.sleutel, groep.klanten)}
                                disabled={status?.status === "bezig"}
                              >
                                {status?.status === "verzonden" ? <Check size={14} /> : <Mail size={14} />}
                                {status?.status === "verzonden" ? "Nogmaals versturen" : "Mail opstellen"}
                              </button>
                            )}
                          </div>

                          {conceptOpen && concept && (
                            <div style={{ marginTop: 8, padding: 12, background: "#fff", border: "1px solid #C8CDC5", borderRadius: 8 }}>
                              <label style={{ fontSize: 11, color: "#8A9089", display: "block", marginBottom: 3 }}>Onderwerp</label>
                              <input
                                className="ot-input"
                                style={{ marginBottom: 8 }}
                                value={concept.onderwerp}
                                onChange={(e) =>
                                  setMailConcepten((prev) => ({ ...prev, [groep.sleutel]: { ...prev[groep.sleutel], onderwerp: e.target.value } }))
                                }
                              />
                              <label style={{ fontSize: 11, color: "#8A9089", display: "block", marginBottom: 3 }}>Tekst</label>
                              <textarea
                                className="ot-input"
                                rows={7}
                                value={concept.tekst}
                                onChange={(e) =>
                                  setMailConcepten((prev) => ({ ...prev, [groep.sleutel]: { ...prev[groep.sleutel], tekst: e.target.value } }))
                                }
                              />
                              <p style={{ fontSize: 10.5, color: "#8A9089", marginTop: 4 }}>
                                Laat <code>{"{link}"}</code> staan — die wordt bij het versturen automatisch de echte tekenlink.
                              </p>
                              {(() => {
                                const maker = bepaalOfferteMaker();
                                return maker.email ? (
                                  <p style={{ fontSize: 10.5, color: "#8A9089", marginTop: 0, marginBottom: 8 }}>
                                    In cc: {maker.naam ? `${maker.naam} ` : ""}
                                    ({maker.email})
                                  </p>
                                ) : null;
                              })()}
                              <label style={{ fontSize: 11, color: "#8A9089", display: "block", marginBottom: 3 }}>
                                Extra cc (optioneel)
                              </label>
                              <input
                                className="ot-input"
                                type="email"
                                style={{ marginBottom: 8 }}
                                value={mailCcExtra[groep.sleutel] || ""}
                                onChange={(e) =>
                                  setMailCcExtra((prev) => ({ ...prev, [groep.sleutel]: e.target.value }))
                                }
                                placeholder="naam@voorbeeld.nl"
                              />
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button
                                  className="ot-btn-secondary"
                                  onClick={() => setMailConceptOpenSleutel(null)}
                                  disabled={status?.status === "bezig"}
                                >
                                  Annuleren
                                </button>
                                <button
                                  className="ot-btn-primary"
                                  onClick={() => verstuurMailConcept(groep.sleutel, groep.klanten)}
                                  disabled={status?.status === "bezig"}
                                >
                                  <Mail size={14} />
                                  {status?.status === "bezig" ? "Bezig met versturen…" : "Versturen"}
                                </button>
                              </div>
                            </div>
                          )}

                          {status?.status === "verzonden" && (
                            <div style={{ fontSize: 11, color: "#2E7D4F", marginTop: 3 }}>
                              Verzonden vanaf {status.van}
                              {status.pdfBijgevoegd ? ", met de offerte-PDF als bijlage." : " (zonder PDF-bijlage — het genereren daarvan is niet gelukt)."}
                            </div>
                          )}
                          {status?.status === "fout" && (
                            <div style={{ fontSize: 11, color: "#B14A2E", marginTop: 3 }}>{status.bericht}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: "#8A9089", marginTop: 8 }}>
                    Wordt rechtstreeks verzonden vanaf <strong>correspondentie@activaa.nl</strong> — je kunt de
                    tekst voor het versturen nog aanpassen. Standaardtekst instellen kan bij "Teksten beheren".
                  </p>
                </div>
              );
            })()}

            {gekozenKlanten.length > 0 && (
              <div
                className="ot-card"
                style={{
                  padding: 18,
                  marginTop: 20,
                  background: "#EAF2F8",
                  borderColor: "#1C5D8C33",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1C2321" }}>
                    Ook een opdrachtbevestiging nodig voor deze klant?
                  </div>
                  <div style={{ fontSize: 12.5, color: "#5B6259", marginTop: 2 }}>
                    Gebruikt dezelfde klant en diensten — je hoeft alleen nog het opdrachttype en de teksten te kiezen.
                  </div>
                </div>
                <button
                  className="ot-btn-primary"
                  onClick={() => {
                    setOpdrachtbevestigingVanuitOfferteId(huidigeOfferteId);
                    setStap("opdrachtbevestiging");
                  }}
                >
                  <FileSignature size={15} />
                  Opdrachtbevestiging maken
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
              <button className="ot-btn-secondary" onClick={vorige}>
                <ChevronLeft size={15} />
                Terug naar bijlage
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#8A9089" }}>
                  {offerteOpslaanStatus === "bezig" && "Offerte opslaan…"}
                  {offerteOpslaanStatus === "opgeslagen" && (
                    <>
                      <Save size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                      Opgeslagen
                    </>
                  )}
                  {offerteOpslaanStatus === "fout" && (
                    <span style={{ color: "#B14A2E" }}>Opslaan mislukt (offerte blijft wel bruikbaar)</span>
                  )}
                </span>
                <button className="ot-btn-secondary" onClick={slaOfferteOp} disabled={offerteOpslaanStatus === "bezig"}>
                  <Save size={15} />
                  Opslaan
                </button>
                <button className="ot-btn-secondary" onClick={kopieerTekenLink}>
                  {tekenLinkGekopieerd ? <Check size={15} /> : <Link2 size={15} />}
                  {tekenLinkGekopieerd ? "Link gekopieerd" : "Tekenlink kopiëren"}
                </button>
                <button className="ot-btn-primary" onClick={afdrukken} disabled={pdfBezig}>
                  {pdfBezig ? <Loader2 size={15} className="ot-spin" style={{ animation: "spin 1s linear infinite" }} /> : <Printer size={15} />}
                  {pdfBezig
                    ? "PDF maken…"
                    : gekozenKlanten.length > 1
                    ? "Alles afdrukken / opslaan als PDF"
                    : "Afdrukken / opslaan als PDF"}
                </button>
              </div>
            </div>
            </>
            )}
          </StapWrapper>
        )}

        {/* -------------------- OPDRACHTBEVESTIGING -------------------- */}
        {stap === "opdrachtbevestiging" && (
          <StapWrapper
            titel={gekozenKlanten.length > 1 ? `${gekozenKlanten.length} opdrachtbevestigingen` : "Opdrachtbevestiging"}
            toelichting={
              gekozenKlanten.length > 1
                ? "Voor elke geselecteerde klant is een eigen opdrachtbevestiging samengesteld. Druk alles in één keer af of sla op als PDF."
                : "Kies eerst het opdrachttype, controleer de opdrachtbevestiging en druk af of sla op als PDF."
            }
          >
            {gekozenKlanten.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Nog geen klant geselecteerd.
                <div style={{ marginTop: 12 }}>
                  <button className="ot-btn-secondary" onClick={() => setStap("klant")}>
                    <Users size={15} />
                    Klant kiezen
                  </button>
                </div>
              </div>
            ) : opdrachttypes.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#8A9089", fontSize: 13.5 }}>
                Er zijn nog geen opdrachttypes ingericht.
                <div style={{ marginTop: 12 }}>
                  <button className="ot-btn-primary" onClick={openOpdrachtbevestigingTeksten}>
                    <ScrollText size={15} />
                    Opdrachtbevestiging-teksten beheren
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="ot-card" style={{ padding: 18, marginBottom: 22 }}>
                  <label className="ot-label">Type opdracht (NV COS)</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {opdrachttypes.map((t) => (
                      <button
                        key={t.id}
                        className={t.id === gekozenOpdrachttypeId ? "ot-pill actief" : "ot-pill"}
                        onClick={() => kiesOpdrachttype(t.id)}
                      >
                        {t.naam}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: "#8A9089", margin: "10px 0 0" }}>
                    Wisselen van type vervangt de verplichte paragrafen door de set die bij dat type hoort (zie
                    hieronder in de opdrachtbevestiging zelf) — al ingevulde optionele paragrafen blijven staan.
                  </p>
                </div>

                <div className="ot-card" style={{ padding: 18, marginBottom: 22 }}>
                  <label className="ot-label">Herbevestiging / tariefswijziging van eerdere opdrachtbevestiging (optioneel)</label>
                  <select
                    className="ot-input"
                    value={herbevestigingVanId || ""}
                    onChange={(e) => kiesHerbevestigingVan(e.target.value)}
                    disabled={herbevestigingOvernemenBezig}
                  >
                    <option value="">Geen — dit is een nieuwe, losstaande opdrachtbevestiging</option>
                    {opdrachtbevestigingenLijst
                      .filter((o) => o.status === "geaccepteerd" && o.id !== huidigeOpdrachtbevestigingId)
                      .sort((a, b) => new Date(b.gewijzigdOp) - new Date(a.gewijzigdOp))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {(o.klantNamen || []).join(", ") || "Onbekende klant"} — {o.opdrachttypeNaam || "geen type"} —{" "}
                          {o.gewijzigdOp ? new Date(o.gewijzigdOp).toLocaleDateString("nl-NL") : ""}
                        </option>
                      ))}
                  </select>
                  <p style={{ fontSize: 12, color: "#8A9089", margin: "10px 0 0" }}>
                    Kies hier de eerder ondertekende opdrachtbevestiging die deze vervangt/verlengt/wijzigt. Bij het
                    ondertekenen wordt dit in Dataverse vastgelegd (kenmerk van de vorige koppelen) en worden de nog
                    openstaande tarieven van die vorige opdrachtbevestiging automatisch afgesloten op de looptijd. De
                    diensten, aantallen/factoren, varianten en per-klant uitschakelingen van dat document worden
                    hierbij automatisch overgenomen (tegen de huidige catalogusprijzen, niet de prijzen van destijds)
                    — pas dit hieronder bij "Diensten kiezen" zo nodig verder aan.
                    {opdrachtbevestigingenLijstBezig && " (Lijst wordt geladen…)"}
                  </p>
                  {herbevestigingOvernemenBezig && (
                    <p style={{ fontSize: 12.5, color: "#5B6259", margin: "10px 0 0" }}>Diensten overnemen…</p>
                  )}
                  {herbevestigingOvernemenFout && (
                    <p style={{ fontSize: 12.5, color: "#B3261E", margin: "10px 0 0" }}>{herbevestigingOvernemenFout}</p>
                  )}
                  {!herbevestigingOvernemenBezig && !herbevestigingOvernemenFout && herbevestigingOvergenomenAantal !== null && (
                    <p style={{ fontSize: 12.5, color: "#2E7D4F", margin: "10px 0 0" }}>
                      ✓ {herbevestigingOvergenomenAantal}{" "}
                      {herbevestigingOvergenomenAantal === 1 ? "dienst" : "diensten"} overgenomen van de gekozen
                      opdrachtbevestiging, tegen de huidige tarieven.
                    </p>
                  )}
                  {herbevestigingVerdwenenDiensten.length > 0 && (
                    <p style={{ fontSize: 12.5, color: "#8A6A1E", margin: "6px 0 0" }}>
                      ⚠ {herbevestigingVerdwenenDiensten.length === 1 ? "Deze dienst bestaat" : "Deze diensten bestaan"}{" "}
                      niet meer in de catalogus en{" "}
                      {herbevestigingVerdwenenDiensten.length === 1 ? "is niet overgenomen" : "zijn niet overgenomen"}:{" "}
                      {herbevestigingVerdwenenDiensten.join(", ")}.
                    </p>
                  )}

                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 16 }}>
                    <div>
                      <label className="ot-label">Ingangsdatum tarieven (optioneel)</label>
                      <input
                        type="date"
                        className="ot-input"
                        value={tariefIngangsdatum}
                        onChange={(e) => setTariefIngangsdatum(e.target.value)}
                        style={{ maxWidth: 220 }}
                      />
                    </div>
                    <div>
                      <label className="ot-label">Einddatum tarieven (optioneel)</label>
                      <input
                        type="date"
                        className="ot-input"
                        value={tariefEinddatum}
                        onChange={(e) => setTariefEinddatum(e.target.value)}
                        style={{ maxWidth: 220 }}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#8A9089", margin: "10px 0 0" }}>
                    Leeg = de tarieven gaan in op de datum van ondertekening (zoals voorheen) en lopen door zonder
                    einddatum. Vul de ingangsdatum alleen in als de nieuwe/gewijzigde tarieven op een andere datum in
                    moeten gaan dan de ondertekendatum — bijv. je tekent vandaag een tariefswijziging die pas per de
                    1e van volgende maand ingaat. De vorige, nog openstaande tarieven (bij een herbevestiging
                    hierboven) worden dan afgesloten op de dag ervóór.
                  </p>
                  <p style={{ fontSize: 12, color: "#8A9089", margin: "6px 0 0" }}>
                    Vul de einddatum in als deze afspraak op een vaste datum afloopt (bijv. een jaarcontract). Zodra
                    die datum verstreken is, zet de tool automatisch een concept-vervolg-opdrachtbevestiging klaar in
                    het overzicht (zichtbaar zodra iemand het overzicht opent) — desgewenst met een taak in Dynamics
                    erbij, in te stellen onder Instellingen ("Automatisch concept — taak bij verlopen tarieven").
                  </p>
                </div>

                {gekozenOpdrachttypeId && (
                  <>
                    <div className="ot-cat-koptekst" style={{ marginTop: 26 }}>
                      <span>Extra paragrafen (optioneel)</span>
                    </div>
                    <div style={{ display: "grid", gap: 14, marginBottom: 22 }}>
                      {(opdrachtbevestigingParagrafen.optioneel || []).map((p) => (
                        <div key={p.id} className="ot-card" style={{ padding: 18 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                            <input
                              className="ot-input"
                              style={{ fontWeight: 700, flex: 1 }}
                              value={p.titel}
                              onChange={(e) => bijwerkRecordParagraaf(p.id, "titel", e.target.value)}
                            />
                            <button className="ot-btn-ghost" onClick={() => verwijderRecordParagraaf(p.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <textarea
                            className="ot-input"
                            rows={3}
                            placeholder="Eigen tekst over honorarium, betaaltermijn, etc.…"
                            value={p.tekst}
                            onChange={(e) => bijwerkRecordParagraaf(p.id, "tekst", e.target.value)}
                          />
                        </div>
                      ))}
                      <button className="ot-btn-ghost" onClick={voegRecordParagraafToe}>
                        <PlusCircle size={13} />
                        Extra paragraaf toevoegen
                      </button>
                    </div>
                  </>
                )}

                <div id="opdrachtbevestiging-print-gebied">
                {gekozenKlanten.map((klant, idx) => {
                  const klantRegels = regelsVoorKlant(klant.id);
                  const klantTotaalExcl = klantRegels.reduce((s, r) => s + r.subtotaal, 0);
                  const klantBtw = klantTotaalExcl * 0.21;
                  const klantTotaalIncl = klantTotaalExcl + klantBtw;
                  const groepen = groepeerOpCategorie(
                    klantRegels,
                    categorieen.map((c) => ({ id: c.id, naam: (c.naam || "").trim() || "Naamloze categorie" }))
                  );
                  const gekozenType = opdrachttypes.find((t) => t.id === gekozenOpdrachttypeId);

                  return (
                    <div
                      key={klant.id}
                      className="ot-card offerte-doc"
                      style={{ padding: 40, marginBottom: idx < gekozenKlanten.length - 1 ? 24 : 0 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <div>
                          {gekozenKlanten.length > 1 && (
                            <div style={{ fontSize: 11.5, color: "#B98237", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
                              Opdrachtbevestiging {idx + 1} van {gekozenKlanten.length}
                            </div>
                          )}
                          <div className="offertetool-serif" style={{ fontSize: 26, fontWeight: 600 }}>Opdrachtbevestiging</div>
                          {gekozenType && (
                            <div style={{ fontSize: 12.5, color: "#1C5D8C", fontWeight: 700, marginTop: 2 }}>{gekozenType.naam}</div>
                          )}
                          <div style={{ fontSize: 12.5, color: "#8A9089", marginTop: 4 }}>
                            Datum: {new Date().toLocaleDateString("nl-NL")}
                          </div>
                        </div>
                        {logo && (
                          <img
                            src={logo}
                            alt="Logo"
                            style={{ maxWidth: 140, maxHeight: 56, objectFit: "contain", flexShrink: 0, marginLeft: 24 }}
                          />
                        )}
                      </div>
                      <div style={{ textAlign: "right", fontSize: 12.5, color: "#5B6259", lineHeight: 1.5, marginBottom: 32 }}>
                        <div style={{ fontWeight: 700, color: "#1C2321" }}>{afzender.bedrijf}</div>
                        <div>{afzender.adres}</div>
                        <div>{afzender.postcode} {afzender.plaats}</div>
                        <div>KvK {afzender.kvk}</div>
                      </div>

                      <div className="ot-tweekolommen" style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid #E2E4DF" }}>
                        <div>
                          <div className="ot-label">Aan</div>
                          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{klant.naam}</div>
                          <div style={{ fontSize: 13, color: "#5B6259" }}>{klant.contact}</div>
                          {klantAdresRegels(klant).map((regel, i) => (
                            <div key={i} style={{ fontSize: 13, color: "#5B6259" }}>{regel}</div>
                          ))}
                          <div style={{ fontSize: 13, color: "#5B6259" }}>{klant.email}</div>
                        </div>
                        <div>
                          <div className="ot-label">Namens</div>
                          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{huidigeGebruiker.naam}</div>
                          {huidigeGebruiker.email && huidigeGebruiker.email.toLowerCase() !== (huidigeGebruiker.naam || "").toLowerCase() && (
                            <div style={{ fontSize: 13, color: "#5B6259" }}>{huidigeGebruiker.email}</div>
                          )}
                        </div>
                      </div>

                      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A4038", marginBottom: 24 }}>
                        {opdrachtbevestigingInleiding}
                      </p>

                      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #1C2321" }}>
                            <th style={{ textAlign: "left", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Dienst</th>
                            <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Aantal</th>
                            <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Prijs</th>
                            <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#5B6259" }}>Subtotaal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groepen.map((g) => (
                            <React.Fragment key={g.cat}>
                              <tr>
                                <td colSpan={4} style={{ padding: "12px 4px 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#B98237" }}>
                                  {g.naam}
                                </td>
                              </tr>
                              {g.items.map((r) => (
                                <tr key={r.id} style={{ borderBottom: "1px solid #E2E4DF" }}>
                                  <td style={{ padding: "10px 4px" }}>
                                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.naam}</div>
                                  </td>
                                  <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 13.5 }}>{formatteerAantal(r.aantal, r.eenheid, r.factor)}</td>
                                  <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 13.5 }}>
                                    {r.opAanvraag ? "op aanvraag" : r.opNacalculatie ? "nacalculatie" : currency(r.prijs)}
                                  </td>
                                  <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 13.5, fontWeight: 700 }}>
                                    {r.opAanvraag || r.opNacalculatie ? "—" : currency(r.subtotaal)}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ width: "100%", maxWidth: 240, fontSize: 13.5 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                            <span style={{ color: "#5B6259" }}>Subtotaal</span>
                            <span>{currency(klantTotaalExcl)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                            <span style={{ color: "#5B6259" }}>Btw (21%)</span>
                            <span>{currency(klantBtw)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: "2px solid #1C2321", fontWeight: 700, fontSize: 15 }}>
                            <span>Totaal</span>
                            <span>{currency(klantTotaalIncl)}</span>
                          </div>
                        </div>
                      </div>

                      {algemeneVoorwaarden.url && (
                        <p style={{ fontSize: 11, color: "#8A9089", marginTop: 32, paddingTop: 12, borderTop: "1px solid #E2E4DF" }}>
                          Op deze opdrachtbevestiging zijn onze{" "}
                          <a
                            href={algemeneVoorwaarden.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#1C5D8C", textDecoration: "underline" }}
                          >
                            {algemeneVoorwaarden.titel?.toLowerCase() || "algemene voorwaarden"}
                          </a>{" "}
                          van toepassing.
                        </p>
                      )}
                    </div>
                  );
                })}

                {(() => {
                  // Verplichte + optionele NV COS-paragrafen staan (net als de algemene
                  // toelichting) niet meer los in de hoofdtekst, maar hier in de bijlage —
                  // eenmalig voor de hele batch, niet per klant herhaald.
                  const alleParagrafen = [...(opdrachtbevestigingParagrafen.verplicht || []), ...(opdrachtbevestigingParagrafen.optioneel || [])];
                  if (
                    alleParagrafen.length === 0 &&
                    dienstTekstenActief.length === 0 &&
                    algemeneToelichtingOpdrachtbevestiging.trim() === ""
                  )
                    return null;
                  return (
                    <div className="ot-card offerte-doc" style={{ padding: 40 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div className="offertetool-serif" style={{ fontSize: 22, fontWeight: 600 }}>
                          Bijlage — toelichting per onderdeel
                        </div>
                        {logo && (
                          <img
                            src={logo}
                            alt="Logo"
                            style={{ maxWidth: 140, maxHeight: 56, objectFit: "contain", flexShrink: 0, marginLeft: 24 }}
                          />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 24 }}>
                        Deze toelichting geldt voor alle bovenstaande opdrachtbevestigingen.
                      </div>
                      <div style={{ display: "grid", gap: 18 }}>
                        {algemeneToelichtingOpdrachtbevestiging.trim() !== "" && (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Algemeen</div>
                            <div style={{ fontSize: 13, color: "#3A4038", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {algemeneToelichtingOpdrachtbevestiging}
                            </div>
                          </div>
                        )}
                        {dienstTekstenActief.map(({ dienst }) => (
                          <div key={dienst.id}>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{dienst.naam}</div>
                            <div style={{ fontSize: 13, color: "#3A4038", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {opdrachtbevestigingDienstTeksten[dienst.id]}
                            </div>
                          </div>
                        ))}
                        {alleParagrafen.map((p) => (
                          <div key={p.id}>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{p.titel}</div>
                            {p.tekst?.trim() ? (
                              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A4038", whiteSpace: "pre-wrap" }}>{p.tekst}</div>
                            ) : (
                              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#8A9089", fontStyle: "italic" }}>
                                Nog geen tekst ingevuld voor dit type — vul dit in via "Opdrachtbevestiging-teksten beheren".
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                </div>

                {(() => {
                  // Zelfde groepering op (evt. aangepast) e-mailadres als bij de offerte
                  // hierboven — mailAdressen is gedeelde state, dus al ingevulde adressen
                  // staan hier meteen klaar.
                  const mailGroepen = [];
                  const indexPerSleutel = new Map();
                  gekozenKlanten.forEach((klant) => {
                    const email = (mailAdressen[klant.id] ?? klant.email ?? "").trim().toLowerCase();
                    const sleutel = email || `__geen-adres__${klant.id}`;
                    if (indexPerSleutel.has(sleutel)) {
                      mailGroepen[indexPerSleutel.get(sleutel)].klanten.push(klant);
                    } else {
                      indexPerSleutel.set(sleutel, mailGroepen.length);
                      mailGroepen.push({ sleutel, klanten: [klant] });
                    }
                  });

                  return (
                    <div style={{ padding: "14px 16px", background: "#FAFAF7", border: "1px solid #E2E4DF", borderRadius: 10, marginTop: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#5B6259", marginBottom: 10 }}>
                        Tekenlink per e-mail aanbieden
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {mailGroepen.map((groep) => {
                          const eerste = groep.klanten[0];
                          const emailWaarde = mailAdressen[eerste.id] ?? eerste.email ?? "";
                          const klantNamenTekst = groep.klanten.map((k) => k.naam).join(" + ");
                          const status = obMailStatus[groep.sleutel];
                          const conceptOpen = obMailConceptOpenSleutel === groep.sleutel;
                          const concept = obMailConcepten[groep.sleutel];
                          return (
                            <div key={groep.sleutel}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12.5, minWidth: 140, color: "#3A4038" }}>{klantNamenTekst}</span>
                                <input
                                  className="ot-input"
                                  type="email"
                                  style={{ flex: 1, minWidth: 200 }}
                                  value={emailWaarde}
                                  onChange={(e) => {
                                    const nieuweWaarde = e.target.value;
                                    setMailAdressen((prev) => {
                                      const next = { ...prev };
                                      groep.klanten.forEach((k) => {
                                        next[k.id] = nieuweWaarde;
                                      });
                                      return next;
                                    });
                                  }}
                                  placeholder="e-mailadres@voorbeeld.nl"
                                />
                                {!conceptOpen && (
                                  <button
                                    className="ot-btn-secondary"
                                    onClick={() => openMailConceptOpdrachtbevestiging(groep.sleutel, groep.klanten)}
                                    disabled={status?.status === "bezig" || !gekozenOpdrachttypeId}
                                  >
                                    {status?.status === "verzonden" ? <Check size={14} /> : <Mail size={14} />}
                                    {status?.status === "verzonden" ? "Nogmaals versturen" : "Mail opstellen"}
                                  </button>
                                )}
                              </div>

                              {conceptOpen && concept && (
                                <div style={{ marginTop: 8, padding: 12, background: "#fff", border: "1px solid #C8CDC5", borderRadius: 8 }}>
                                  <label style={{ fontSize: 11, color: "#8A9089", display: "block", marginBottom: 3 }}>Onderwerp</label>
                                  <input
                                    className="ot-input"
                                    style={{ marginBottom: 8 }}
                                    value={concept.onderwerp}
                                    onChange={(e) =>
                                      setObMailConcepten((prev) => ({ ...prev, [groep.sleutel]: { ...prev[groep.sleutel], onderwerp: e.target.value } }))
                                    }
                                  />
                                  <label style={{ fontSize: 11, color: "#8A9089", display: "block", marginBottom: 3 }}>Tekst</label>
                                  <textarea
                                    className="ot-input"
                                    rows={7}
                                    value={concept.tekst}
                                    onChange={(e) =>
                                      setObMailConcepten((prev) => ({ ...prev, [groep.sleutel]: { ...prev[groep.sleutel], tekst: e.target.value } }))
                                    }
                                  />
                                  <p style={{ fontSize: 10.5, color: "#8A9089", marginTop: 4 }}>
                                    Laat <code>{"{link}"}</code> staan — die wordt bij het versturen automatisch de echte tekenlink.
                                  </p>
                                  {(() => {
                                    const maker = bepaalOpdrachtbevestigingMaker();
                                    return maker.email ? (
                                      <p style={{ fontSize: 10.5, color: "#8A9089", marginTop: 0, marginBottom: 8 }}>
                                        In cc: {maker.naam ? `${maker.naam} ` : ""}
                                        ({maker.email})
                                      </p>
                                    ) : null;
                                  })()}
                                  <label style={{ fontSize: 11, color: "#8A9089", display: "block", marginBottom: 3 }}>
                                    Extra cc (optioneel)
                                  </label>
                                  <input
                                    className="ot-input"
                                    type="email"
                                    style={{ marginBottom: 8 }}
                                    value={obMailCcExtra[groep.sleutel] || ""}
                                    onChange={(e) =>
                                      setObMailCcExtra((prev) => ({ ...prev, [groep.sleutel]: e.target.value }))
                                    }
                                    placeholder="naam@voorbeeld.nl"
                                  />
                                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button
                                      className="ot-btn-secondary"
                                      onClick={() => setObMailConceptOpenSleutel(null)}
                                      disabled={status?.status === "bezig"}
                                    >
                                      Annuleren
                                    </button>
                                    <button
                                      className="ot-btn-primary"
                                      onClick={() => verstuurMailConceptOpdrachtbevestiging(groep.sleutel, groep.klanten)}
                                      disabled={status?.status === "bezig"}
                                    >
                                      <Mail size={14} />
                                      {status?.status === "bezig" ? "Bezig met versturen…" : "Versturen"}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {status?.status === "verzonden" && (
                                <div style={{ fontSize: 11, color: "#2E7D4F", marginTop: 3 }}>
                                  Verzonden vanaf {status.van} — status is automatisch bijgewerkt naar "Verzonden".
                                  {status.pdfBijgevoegd ? " De opdrachtbevestiging-PDF is als bijlage meegestuurd." : " (zonder PDF-bijlage — het genereren daarvan is niet gelukt)."}
                                </div>
                              )}
                              {status?.status === "fout" && (
                                <div style={{ fontSize: 11, color: "#B14A2E", marginTop: 3 }}>{status.bericht}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ fontSize: 11, color: "#8A9089", marginTop: 8 }}>
                        Wordt rechtstreeks verzonden vanaf <strong>correspondentie@activaa.nl</strong> — je kunt de
                        tekst voor het versturen nog aanpassen. Standaardtekst instellen kan bij
                        "Opdrachtbevestiging-teksten beheren".
                      </p>
                    </div>
                  );
                })()}

                {gekozenKlanten.length > 0 && (
                  <div
                    className="ot-card"
                    style={{
                      padding: 18,
                      marginTop: 20,
                      background: "#EAF2F8",
                      borderColor: "#1C5D8C33",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1C2321" }}>
                        Ook een offerte nodig voor deze klant?
                      </div>
                      <div style={{ fontSize: 12.5, color: "#5B6259", marginTop: 2 }}>
                        Gebruikt dezelfde klant en diensten — je hoeft alleen nog naar het offerte-scherm te gaan.
                      </div>
                    </div>
                    <button className="ot-btn-primary" onClick={() => setStap("offerte")}>
                      <FileText size={15} />
                      Offerte maken
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                  <button className="ot-btn-secondary" onClick={vorige}>
                    <ChevronLeft size={15} />
                    Terug naar offerte
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#8A9089" }}>
                      {opdrachtbevestigingOpslaanStatus === "bezig" && "Opdrachtbevestiging opslaan…"}
                      {opdrachtbevestigingOpslaanStatus === "opgeslagen" && (
                        <>
                          <Save size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                          Opgeslagen
                        </>
                      )}
                      {opdrachtbevestigingOpslaanStatus === "fout" && (
                        <span style={{ color: "#B14A2E" }}>Opslaan mislukt (opdrachtbevestiging blijft wel bruikbaar)</span>
                      )}
                    </span>
                    <button
                      className="ot-btn-secondary"
                      onClick={slaOpdrachtbevestigingOp}
                      disabled={opdrachtbevestigingOpslaanStatus === "bezig" || !gekozenOpdrachttypeId}
                    >
                      <Save size={15} />
                      Opslaan
                    </button>
                    <button
                      className="ot-btn-secondary"
                      onClick={kopieerOpdrachtbevestigingTekenLink}
                      disabled={!gekozenOpdrachttypeId}
                    >
                      {tekenLinkGekopieerdOpdrachtbevestiging ? <Check size={15} /> : <Link2 size={15} />}
                      {tekenLinkGekopieerdOpdrachtbevestiging ? "Link gekopieerd" : "Tekenlink kopiëren"}
                    </button>
                    <button
                      className="ot-btn-primary"
                      onClick={afdrukkenOpdrachtbevestiging}
                      disabled={pdfBezigOpdrachtbevestiging || !gekozenOpdrachttypeId}
                    >
                      {pdfBezigOpdrachtbevestiging ? (
                        <Loader2 size={15} className="ot-spin" style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Printer size={15} />
                      )}
                      {pdfBezigOpdrachtbevestiging
                        ? "PDF maken…"
                        : gekozenKlanten.length > 1
                        ? "Alles afdrukken / opslaan als PDF"
                        : "Afdrukken / opslaan als PDF"}
                    </button>
                  </div>
                </div>
                {!gekozenOpdrachttypeId && (
                  <p style={{ fontSize: 12, color: "#8A6A1E", marginTop: 10, textAlign: "right" }}>
                    Kies eerst een opdrachttype hierboven.
                  </p>
                )}
              </>
            )}
          </StapWrapper>
        )}
      </div>

      {ingelogd && stap !== "login" && (
        <button
          onClick={openAfzender}
          title="Afzendergegevens beheren"
          style={{
            position: "fixed",
            left: 20,
            bottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #C8CDC5",
            background: stap === "instellingen" ? "#1C5D8C" : "#fff",
            color: stap === "instellingen" ? "#fff" : "#5B6259",
            padding: "8px 14px",
            borderRadius: 20,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            zIndex: 20,
          }}
        >
          <SettingsIcon size={14} />
          Instellingen
        </button>
      )}
    </div>
  );
}

const stapKnopStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid #C8CDC5",
  background: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function StapWrapper({ titel, toelichting, children }) {
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{titel}</h2>
      <p style={{ fontSize: 13.5, color: "#5B6259", marginBottom: 22 }}>{toelichting}</p>
      {children}
    </div>
  );
}

// Snelle schakelbalk tussen de beheerschermen (Diensten/Teksten/Voorwaarden/
// Roadmap beheren) — staat bovenaan op elk van deze schermen zelf (niet alleen
// op het Instellingen-scherm), zodat je vanuit bijv. "Teksten beheren" direct
// naar "Voorwaarden beheren" kunt switchen zonder eerst terug te gaan naar
// Instellingen. Het scherm waar je al op staat wordt gemarkeerd en is niet
// aanklikbaar.
function OverigBeheerBalk({ actief, onCatalogus, onTeksten, onVoorwaarden, onRoadmap, onOpdrachtbevestigingTeksten }) {
  const items = [
    { key: "catalogus", label: "Diensten beheren", icon: Layers, onClick: onCatalogus },
    { key: "teksten", label: "Teksten beheren", icon: BookOpen, onClick: onTeksten },
    { key: "voorwaarden", label: "Voorwaarden beheren", icon: FileText, onClick: onVoorwaarden },
    { key: "roadmap", label: "Roadmap beheren", icon: Milestone, onClick: onRoadmap },
    { key: "opdrachtbevestiging-teksten", label: "Opdrachtbevestiging-teksten", icon: ScrollText, onClick: onOpdrachtbevestigingTeksten },
  ];
  return (
    <div className="ot-card" style={{ padding: 20, marginBottom: 20 }}>
      <label className="ot-label" style={{ marginBottom: 10, display: "block" }}>Overig beheer</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActief = item.key === actief;
          return (
            <button
              key={item.key}
              className={isActief ? "ot-btn-primary" : "ot-btn-secondary"}
              onClick={item.onClick}
              disabled={isActief}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StapNavigatie({ onVorige, onVolgende, volgendeDisabled, volgendeLabel }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
      {onVorige ? (
        <button className="ot-btn-secondary" onClick={onVorige}>
          <ChevronLeft size={15} />
          Vorige
        </button>
      ) : (
        <span />
      )}
      <button className="ot-btn-primary" onClick={onVolgende} disabled={volgendeDisabled}>
        {volgendeLabel}
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

// Module-scope cache zodat de twee TaakCategorieSelect-instanties (offerte +
// opdrachtbevestiging) niet allebei apart hoeven te fetchen — eenmaal opgehaald in deze
// sessie is genoeg, de optionset-waarden veranderen niet tijdens gebruik van de tool.
let taakCategorieenCache = null;

// Categorie-select voor de taak-instellingen (offerte + opdrachtbevestiging) — haalt de
// daadwerkelijke, actuele cr283_soortactiecategorie-optionsetwaarden live op bij Dataverse
// (/api/taakcategorieen). Lukt dat niet (bijv. Dynamics-koppeling nog niet geconfigureerd,
// of nog aan het laden), dan valt de select terug op de eerder bekende lijst
// (TAAK_CATEGORIE_OPTIES) — plus altijd "Andere code…" voor codes die daar nog niet in staan.
function TaakCategorieSelect({ waarde, onChange }) {
  const [categorieen, setCategorieen] = useState(taakCategorieenCache || TAAK_CATEGORIE_OPTIES);
  const [ophalenMislukt, setOphalenMislukt] = useState(false);

  useEffect(() => {
    if (taakCategorieenCache) return;
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/taakcategorieen");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          taakCategorieenCache = data;
          if (actief) setCategorieen(data);
        }
      } catch (e) {
        // Dynamics-koppeling nog niet beschikbaar/geconfigureerd — de bekende lijst
        // (TAAK_CATEGORIE_OPTIES, al het startpunt van deze state) blijft dan gewoon staan.
        if (actief) setOphalenMislukt(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const bekend = categorieen.some((o) => o.code === Number(waarde));
  return (
    <div>
      <select
        className="ot-input"
        value={bekend ? String(waarde) : "andere"}
        onChange={(e) => {
          if (e.target.value === "andere") return;
          onChange(Number(e.target.value));
        }}
      >
        {categorieen.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label} ({o.code})
          </option>
        ))}
        <option value="andere">Andere code…</option>
      </select>
      {!bekend && (
        <input
          className="ot-input"
          type="number"
          style={{ marginTop: 8 }}
          placeholder="Code (cr283_soortactiecategorie)"
          value={waarde ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      )}
      {ophalenMislukt && (
        <p style={{ fontSize: 10.5, color: "#8A9089", marginTop: 6 }}>
          Kon de actuele lijst niet live ophalen bij Dynamics — dit toont de eerder bekende
          categorieën.
        </p>
      )}
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
