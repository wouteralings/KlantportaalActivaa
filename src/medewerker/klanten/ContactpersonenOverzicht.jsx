import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ArrowLeft, Pencil, Link2, Unlink, AlertTriangle, CheckCircle2, X, Plus, Trash2, ClipboardList, Send, ShieldCheck, ChevronUp, ChevronDown, Star } from "lucide-react";
import Logboek from "./Logboek";
import ScopeToggle, { useMijnNaam, isKlantVanMij } from "../MijnFilter";

/** Zelfde palet als het medewerkersportaal — bewust hier herhaald zodat dit bestand
 *  op zichzelf staat. Wijzigt de huisstijl, pas dan beide plekken aan. */
const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
  goud: "#B98237",
};

/**
 * Basiskolommen van het contactpersonen-overzicht. `standaard: false` betekent: bestaat wel,
 * maar staat standaard uit — aan te zetten via "Kolommen". `num: true` sorteert numeriek.
 * Door Beheer → Kolommen zelf toegevoegde extra Dynamics-velden (instellingen.contactpersonenExtraKolommen)
 * komen er in de component zelf achteraan bij — zie de opbouw van KOLOMMEN in ContactpersonenOverzicht().
 */
const BASIS_KOLOMMEN = [
  { key: "naam", label: "Naam", waarde: (c) => c.naam, standaard: true },
  { key: "voornaam", label: "Voornaam", waarde: (c) => c.voornaam },
  { key: "tussenvoegsel", label: "Tussenvoegsel", waarde: (c) => c.tussenvoegsel },
  { key: "achternaam", label: "Achternaam", waarde: (c) => c.achternaam },
  { key: "aanhef", label: "Aanhef", waarde: (c) => c.aanhef },
  { key: "functie", label: "Functie", waarde: (c) => c.functie, standaard: true },
  { key: "email", label: "E-mail", waarde: (c) => c.email, standaard: true, soort: "email" },
  { key: "mobiel", label: "Mobiel", waarde: (c) => c.mobiel, standaard: true, soort: "tel" },
  { key: "telefoon", label: "Telefoon", waarde: (c) => c.telefoon, soort: "tel" },
  { key: "klantnamen", label: "Cliënt(en)", waarde: (c) => c.klantnamen, standaard: true },
  { key: "klantnummers", label: "Cliëntnr", waarde: (c) => c.klantnummers },
  { key: "rollen", label: "Rol", waarde: (c) => c.rollen, standaard: true },
  { key: "plaats", label: "Plaats", waarde: (c) => c.plaats, standaard: true },
  { key: "postcode", label: "Postcode", waarde: (c) => c.postcode },
  { key: "straat", label: "Straat", waarde: (c) => [c.straat, c.huisnummer, c.toevoeging].filter(Boolean).join(" ") },
  { key: "land", label: "Land", waarde: (c) => c.land },
  { key: "geboortedatum", label: "Geboortedatum", waarde: (c) => (c.geboortedatum ? new Date(c.geboortedatum).toLocaleDateString("nl-NL") : "") },
];

const AANTALLEN = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];

/** Velden die in bulk (op meerdere contactpersonen tegelijk) gewijzigd kunnen worden. `key` = het
 *  weergaveveld in het overzicht-object, `dyn` = de Dynamics-veldnaam die de backend verwacht. */
const BULK_VELDEN = [
  { key: "functie", dyn: "jobtitle", label: "Functie" },
  { key: "straat", dyn: "address1_line1", label: "Straat" },
  { key: "huisnummer", dyn: "cr283_huisnummer", label: "Huisnummer" },
  { key: "toevoeging", dyn: "cr283_huisnummertoevoeging", label: "Toevoeging" },
  { key: "postcode", dyn: "address1_postalcode", label: "Postcode" },
  { key: "plaats", dyn: "address1_city", label: "Plaats" },
];

/** Herberekent de platgeslagen cliënt-kolommen (voor tabel: zoeken/sorteren/filteren) nadat de
 *  koppelingen van een contactpersoon veranderd zijn. Module-niveau zodat het veilig in
 *  setState-updaters gebruikt kan worden. */
function herbereken(contact, klanten) {
  const klantnamen = klanten.map((k) => k.klantnaam).filter(Boolean).join(", ");
  const klantnummers = klanten.map((k) => k.klantnummer).filter(Boolean).join(", ");
  const rollen = [...new Set(klanten.map((k) => k.rol))].filter(Boolean).join(", ");
  return { ...contact, klanten, klantnamen, klantnummers, rollen };
}

/**
 * Contactpersonen-overzicht: dezelfde opzet als het klantoverzicht (zoeken, kolommen kiezen,
 * sorteren door op een kop te klikken, per kolom filteren en het aantal regels kiezen), maar op
 * de Dataverse-tabel `contacts`. Klik op een regel om door te klikken naar de detailweergave, waar
 * de contactpersoon (met wijzig-recht) bewerkt kan worden en (als beheerder) aan cliënten gekoppeld.
 * Zie api/beheer-contactpersonen (lijst) en api/medewerker-contactpersoon (bewerken/koppelen).
 */
export default function ContactpersonenOverzicht() {
  const [contactpersonen, setContactpersonen] = useState(null); // null = laden
  const [afgekapt, setAfgekapt] = useState(false);
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [kolomFilters, setKolomFilters] = useState({}); // { kolomKey: "bevat-tekst" }
  const [filterRegel, setFilterRegel] = useState(false);
  const [sortKey, setSortKey] = useState("naam");
  const [sortDir, setSortDir] = useState("asc");
  const [toonAantal, setToonAantal] = useState(25);
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [zichtbaar, setZichtbaar] = useState(() => new Set(BASIS_KOLOMMEN.filter((k) => k.standaard).map((k) => k.key)));
  const [kolomVolgorde, setKolomVolgorde] = useState(null); // null = standaard KOLOMMEN-volgorde; anders array van keys
  const [extraKolommenConfig, setExtraKolommenConfig] = useState([]); // door Beheer → Kolommen toegevoegde extra velden
  const [weergaven, setWeergaven] = useState([]); // [{ naam, config }] — opgeslagen weergaven (zie api/medewerker-weergaven)
  const [actieveWeergave, setActieveWeergave] = useState("");
  const [weergaveFout, setWeergaveFout] = useState(false); // true = laatste opslagpoging is mislukt (zie bewaarWeergaven)
  const [detail, setDetail] = useState(null); // gekozen contactpersoon → detailweergave
  const [magWijzigen, setMagWijzigen] = useState(false);
  const [magBulk, setMagBulk] = useState(false);
  const [magVerwijderen, setMagVerwijderen] = useState(false); // los in te stellen recht (Beheer → Medewerkers) — beheerders mogen dit sowieso altijd
  const [isBeheerder, setIsBeheerder] = useState(false);
  const [selectie, setSelectie] = useState(() => new Set()); // geselecteerde contactId's voor bulk
  const [bulkOpen, setBulkOpen] = useState(false);
  const [docrechtBulkOpen, setDocrechtBulkOpen] = useState(false);
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const [scope, setScope] = useState("mijn"); // "mijn" | "alle"
  const [mijnAccountIds, setMijnAccountIds] = useState(null); // Set van accountId's waar ik behandelaar ben
  const geladenRef = useRef(false); // true zodra de eerste weergaven-ophaal-ronde klaar is (zie hieronder)
  const autoOpslaanTimerRef = useRef(null); // debounce-timer voor het automatisch opslaan van "laatst"

  useEffect(() => {
    let actief = true;
    fetch("/api/beheer-contactpersonen")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!actief) return;
        setContactpersonen(d.contactpersonen || []);
        setAfgekapt(!!d.afgekapt);
      })
      .catch((e) => {
        if (!actief) return;
        setContactpersonen([]);
        setFout(e.message || "Onbekende fout");
      });
    return () => {
      actief = false;
    };
  }, []);

  // Opgeslagen weergaven (persoonlijk, eigen namespace "contactpersonen" — zie api/_gedeeld/weergaven.js).
  useEffect(() => {
    let actief = true;
    fetch("/api/medewerker-weergaven?scherm=" + encodeURIComponent("contactpersonen"))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!actief) return;
        const views = d.views || [];
        setWeergaven(views);
        // Eén weergave kan met de ster als "mijn standaard" gemarkeerd zijn (config.standaard) —
        // die laadt dan automatisch, i.p.v. steeds zelf een weergave te moeten kiezen.
        const standaard = views.find((v) => v.config && v.config.standaard);
        if (standaard) { setActieveWeergave(standaard.naam); pasWeergaveToe(standaard.config); }
        // Geen ster gezet? Dan de laatst gebruikte (niet-benoemde) kolommen/volgorde/filters/
        // sortering toepassen — automatisch bijgehouden, zie "laatst" in api/_gedeeld/weergaven.js.
        else if (d.laatst) pasWeergaveToe(d.laatst);
      })
      .catch(() => { if (actief) setWeergaven([]); })
      .finally(() => { if (actief) geladenRef.current = true; });
    return () => { actief = false; };
  }, []);

  // Door Beheer → Kolommen zelf toegevoegde extra Dynamics-velden (zie ExtraKolommenBeheer in BeheerPortaal.jsx).
  useEffect(() => {
    let actief = true;
    fetch("/api/instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setExtraKolommenConfig(d.contactpersonenExtraKolommen || []); })
      .catch(() => { if (actief) setExtraKolommenConfig([]); });
    return () => { actief = false; };
  }, []);

  // Voor het 'mijn cliënten'-filter: bepaal bij welke klanten ik behandelaar ben (via de klantenlijst).
  useEffect(() => {
    if (!mijnNaam) { setMijnAccountIds(new Set()); return; }
    let actief = true;
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!actief) return;
        const ids = new Set((d.klanten || []).filter((k) => isKlantVanMij(k, mijnNaam)).map((k) => k.accountId));
        setMijnAccountIds(ids);
      })
      .catch(() => { if (actief) setMijnAccountIds(new Set()); });
    return () => { actief = false; };
  }, [mijnNaam]);

  // Rechten: mag deze medewerker contactgegevens wijzigen, verwijderen, en is hij beheerder (koppelen)?
  useEffect(() => {
    fetch("/api/medewerker-rechten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMagWijzigen(!!d.magWijzigen); setMagBulk(!!d.magBulk); setMagVerwijderen(!!d.magVerwijderContactpersonen); })
      .catch(() => { setMagWijzigen(false); setMagBulk(false); setMagVerwijderen(false); });
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((d) => {
        const rollen = (d.clientPrincipal && d.clientPrincipal.userRoles) || [];
        setIsBeheerder(rollen.includes("beheerder"));
      })
      .catch(() => setIsBeheerder(false));
  }, []);

  // ── Lokale state bijwerken na een bewerking/koppeling (zonder de hele lijst opnieuw te laden) ──
  const naBewerken = (contactId, velden) => {
    setContactpersonen((huidig) => (huidig || []).map((c) => (c.contactId === contactId ? { ...c, ...velden } : c)));
    setDetail((huidig) => (huidig && huidig.contactId === contactId ? { ...huidig, ...velden } : huidig));
  };

  const naKoppelen = (contact, klant) => {
    setContactpersonen((huidig) => {
      const lijst = huidig || [];
      return lijst.map((c) => {
        // Deze contactpersoon: cliënt toevoegen/vervangen als Primair.
        if (c.contactId === contact.contactId) {
          const zonder = (c.klanten || []).filter((k) => k.accountId !== klant.accountId);
          return herbereken(c, [...zonder, { accountId: klant.accountId, klantnaam: klant.klantnaam, klantnummer: klant.klantnummer, rol: "Primair" }]);
        }
        // Vorige primaire contactpersoon (indien in de lijst): die verliest deze cliënt.
        const nieuweKlanten = (c.klanten || []).filter((k) => !(k.accountId === klant.accountId && k.rol === "Primair"));
        if (nieuweKlanten.length !== (c.klanten || []).length) return herbereken(c, nieuweKlanten);
        return c;
      });
    });
    setDetail((huidig) => {
      if (!huidig || huidig.contactId !== contact.contactId) return huidig;
      const zonder = (huidig.klanten || []).filter((k) => k.accountId !== klant.accountId);
      return herbereken(huidig, [...zonder, { accountId: klant.accountId, klantnaam: klant.klantnaam, klantnummer: klant.klantnummer, rol: "Primair" }]);
    });
  };

  const naOntkoppelen = (contact, accountId) => {
    const strip = (c) => herbereken(c, (c.klanten || []).filter((k) => !(k.accountId === accountId && k.rol === "Primair")));
    setContactpersonen((huidig) => (huidig || []).map((c) => (c.contactId === contact.contactId ? strip(c) : c)));
    setDetail((huidig) => (huidig && huidig.contactId === contact.contactId ? strip(huidig) : huidig));
  };

  const naToevoegen = (nieuw) => {
    const contact = {
      contactId: nieuw.contactId, naam: nieuw.naam || "",
      voornaam: nieuw.voornaam || "", tussenvoegsel: nieuw.tussenvoegsel || "", achternaam: nieuw.achternaam || "",
      functie: nieuw.functie || "", email: nieuw.email || "", mobiel: nieuw.mobiel || "", telefoon: "",
      aanhef: "", straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "", land: "",
      geboortedatum: "", aangemaakt: "", klanten: [], klantnamen: "", klantnummers: "", rollen: "",
    };
    setContactpersonen((huidig) => [contact, ...(huidig || [])]);
    setToevoegenOpen(false);
    setDetail(contact); // meteen openen zodat je kunt koppelen/aanvullen
  };

  const naVerwijderen = (contactId) => {
    setContactpersonen((huidig) => (huidig || []).filter((c) => c.contactId !== contactId));
    setSelectie((h) => { const n = new Set(h); n.delete(contactId); return n; });
    setDetail(null);
  };

  // Kolommen = basis + door Beheer → Kolommen toegevoegde extra velden (zie hierboven). Gememoized
  // (i.p.v. elke render een nieuwe array/functie) zodat gefilterd/gesorteerd hieronder er stabiel
  // naar kunnen verwijzen zonder bij elke render opnieuw te hoeven berekenen.
  const KOLOMMEN = useMemo(() => [
    ...BASIS_KOLOMMEN,
    ...extraKolommenConfig.filter((c) => c && c.veld).map((c) => ({
      key: "extra_" + c.veld,
      label: c.label || c.veld,
      waarde: (contact) => (contact.extra && contact.extra[c.veld]) || "",
    })),
  ], [extraKolommenConfig]);
  const kolomVan = useCallback((key) => KOLOMMEN.find((k) => k.key === key), [KOLOMMEN]);
  // Volgorde waarin kolommen getoond worden (kolomkiezer + tabel): eigen volgorde (indien gezet) +
  // eventuele nieuwe/onbekende kolommen erachter, zodat een oude opgeslagen weergave of een net
  // toegevoegde kolom nooit verdwijnt — alleen de plek in de rij is dan nog niet gekozen. Ook
  // gememoized, zodat gefilterd/gesorteerd hieronder er als stabiele dependency naar kunnen wijzen.
  const geordendeKolommen = useMemo(() => {
    const alleKeys = KOLOMMEN.map((k) => k.key);
    const basis = (kolomVolgorde || []).filter((k) => alleKeys.includes(k));
    const missend = alleKeys.filter((k) => !basis.includes(k));
    return [...basis, ...missend].map((k) => kolomVan(k)).filter(Boolean);
  }, [KOLOMMEN, kolomVolgorde, kolomVan]);
  const verplaatsKolom = (key, richting) => {
    const basis = geordendeKolommen.map((k) => k.key);
    const i = basis.indexOf(key);
    const j = i + richting;
    if (i === -1 || j < 0 || j >= basis.length) return;
    const nieuw = [...basis];
    [nieuw[i], nieuw[j]] = [nieuw[j], nieuw[i]];
    setKolomVolgorde(nieuw);
  };
  const zichtKols = useMemo(() => geordendeKolommen.filter((k) => zichtbaar.has(k.key)), [geordendeKolommen, zichtbaar]);

  // Opgeslagen weergaven (persoonlijk): kolommen + volgorde + filters + sortering + aantal regels.
  const huidigeConfig = () => ({ kolommen: [...zichtbaar], volgorde: geordendeKolommen.map((k) => k.key), filters: kolomFilters, sortKey, sortDir, toonAantal });
  const pasWeergaveToe = (cfg) => {
    if (!cfg) return;
    if (Array.isArray(cfg.kolommen)) setZichtbaar(new Set(cfg.kolommen));
    if (Array.isArray(cfg.volgorde)) setKolomVolgorde(cfg.volgorde);
    setKolomFilters(cfg.filters || {});
    if (cfg.sortKey) setSortKey(cfg.sortKey);
    if (cfg.sortDir) setSortDir(cfg.sortDir);
    if (cfg.toonAantal) setToonAantal(cfg.toonAantal);
  };

  // Auto-opslaan van de huidige (niet-benoemde) kolommen/volgorde/filters/sortering, gedebiseerd
  // zodat niet bij elke los tikje een aparte aanroep gaat — zie de uitleg bij "laatst" in
  // api/_gedeeld/weergaven.js. Pas actief ná de eerste keer laden (geladenRef, zie het weergaven-
  // ophaal-effect hierboven), anders zou het toepassen van een geladen weergave zichzelf overschrijven.
  useEffect(() => {
    if (!geladenRef.current) return;
    clearTimeout(autoOpslaanTimerRef.current);
    autoOpslaanTimerRef.current = setTimeout(() => {
      fetch("/api/medewerker-weergaven", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scherm: "contactpersonen", laatst: huidigeConfig() }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(autoOpslaanTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zichtbaar, kolomVolgorde, kolomFilters, sortKey, sortDir, toonAantal]);

  const bewaarWeergaven = (lijst) => {
    setWeergaven(lijst);
    setWeergaveFout(false);
    // Optimistisch: de UI toont de wijziging meteen. Faalt het opslaan zelf (netwerk- of
    // serverfout) dan verdwijnt de wijziging bij een volgend bezoek weer stilletjes — vandaar
    // hier expliciet r.ok controleren en een foutmelding tonen i.p.v. de fout te negeren.
    fetch("/api/medewerker-weergaven", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scherm: "contactpersonen", views: lijst }) })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => setWeergaveFout(true));
  };
  const opslaanAlsWeergave = () => {
    const naam = (window.prompt("Naam van de weergave:") || "").trim();
    if (!naam) return;
    bewaarWeergaven([...weergaven.filter((v) => v.naam !== naam), { naam, config: huidigeConfig() }]);
    setActieveWeergave(naam);
  };
  const kiesWeergave = (naam) => {
    setActieveWeergave(naam);
    const v = weergaven.find((w) => w.naam === naam);
    if (v) pasWeergaveToe(v.config);
  };
  const verwijderWeergave = () => {
    if (!actieveWeergave) return;
    if (!window.confirm(`Weergave "${actieveWeergave}" verwijderen?`)) return;
    bewaarWeergaven(weergaven.filter((v) => v.naam !== actieveWeergave));
    setActieveWeergave("");
  };
  // Markeert de gekozen weergave als "mijn standaard" (laadt automatisch bij het openen van dit
  // scherm) — nogmaals klikken zet 'm weer uit. Zit in config zelf (niet als los veld op de
  // weergave), want zetWeergavenVoor() bewaart per weergave alleen { naam, config }.
  const huidigeIsStandaard = !!weergaven.find((v) => v.naam === actieveWeergave)?.config?.standaard;
  const zetStandaardWeergave = () => {
    if (!actieveWeergave) return;
    const nieuw = weergaven.map((v) => ({ ...v, config: { ...(v.config || {}), standaard: v.naam === actieveWeergave ? !huidigeIsStandaard : false } }));
    bewaarWeergaven(nieuw);
  };

  const gefilterd = useMemo(() => {
    const lijst = contactpersonen || [];
    const term = zoek.trim().toLowerCase();
    return lijst.filter((c) => {
      if (scope === "mijn" && mijnNaam && mijnAccountIds) {
        const vanMij = (c.klanten || []).some((k) => mijnAccountIds.has(k.accountId));
        if (!vanMij) return false;
      }
      if (term) {
        const raak = zichtKols.some((kol) => String(kol.waarde(c) || "").toLowerCase().includes(term));
        if (!raak) return false;
      }
      for (const [key, waarde] of Object.entries(kolomFilters)) {
        if (!waarde) continue;
        const kol = kolomVan(key);
        if (!kol) continue;
        if (!String(kol.waarde(c) || "").toLowerCase().includes(String(waarde).toLowerCase())) return false;
      }
      return true;
    });
  }, [contactpersonen, zoek, kolomFilters, zichtbaar, zichtKols, kolomVan, scope, mijnNaam, mijnAccountIds]);

  const gesorteerd = useMemo(() => {
    const kol = kolomVan(sortKey) || KOLOMMEN[0];
    const richting = sortDir === "asc" ? 1 : -1;
    return [...gefilterd].sort((a, b) => {
      const wa = String(kol.waarde(a) || "");
      const wb = String(kol.waarde(b) || "");
      if (!wa && wb) return 1;
      if (wa && !wb) return -1;
      return wa.localeCompare(wb, "nl", { numeric: true, sensitivity: "base" }) * richting;
    });
  }, [gefilterd, sortKey, sortDir, kolomVan, KOLOMMEN]);

  const zichtbareRijen = gesorteerd.slice(0, toonAantal === Infinity ? undefined : toonAantal);
  const actieveFilters = Object.entries(kolomFilters).filter(([, v]) => v);

  // ── Bulk-selectie (op contactId). "Alles" werkt op de gefilterde lijst. ──
  const gefilterdeIds = gefilterd.map((c) => c.contactId);
  const allesGeselecteerd = gefilterdeIds.length > 0 && gefilterdeIds.every((id) => selectie.has(id));
  const toggleSelectie = (id) => setSelectie((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAlles = () => setSelectie(() => (allesGeselecteerd ? new Set() : new Set(gefilterdeIds)));

  const bulkToepassen = async (veld, waarde) => {
    const ids = [...selectie];
    const res = await fetch("/api/medewerker-contactpersoon", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "bulk-bewerken", contactIds: ids, veld: veld.dyn, waarde }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const d = await res.json();
    const mislukteIds = new Set((d.mislukt || []).map((m) => m.contactId));
    const geluktIds = new Set(ids.filter((id) => !mislukteIds.has(id)));
    // Weergave lokaal bijwerken voor de gelukte contactpersonen.
    setContactpersonen((huidig) => (huidig || []).map((c) => (geluktIds.has(c.contactId) ? { ...c, [veld.key]: waarde } : c)));
    return d;
  };

  const bulkDocumentrecht = async (recht, waarde) => {
    const ids = [...selectie];
    const res = await fetch("/api/medewerker-contactpersoon", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "bulk-documentrechten", contactIds: ids, recht, waarde }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return await res.json();
  };

  const sorteerOp = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const cel = (kol, c) => {
    const waarde = kol.waarde(c) || "";
    if (!waarde) return <span style={{ color: KLEUR.mutedTekst }}>—</span>;
    if (kol.soort === "email") return <a href={`mailto:${waarde}`} onClick={(e) => e.stopPropagation()} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>;
    if (kol.soort === "tel") return <a href={`tel:${String(waarde).replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>;
    return waarde;
  };

  if (detail) {
    return (
      <ContactpersoonDetail
        contact={detail}
        magWijzigen={magWijzigen}
        magVerwijderen={magVerwijderen}
        isBeheerder={isBeheerder}
        onTerug={() => setDetail(null)}
        onBewerkt={naBewerken}
        onKoppeld={naKoppelen}
        onOntkoppeld={naOntkoppelen}
        onVerwijderd={naVerwijderen}
      />
    );
  }

  if (contactpersonen === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "20px 0" }}>Contactpersonen ophalen…</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Contactpersonen</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
        Alle contactpersonen uit Dynamics. Klik op een regel om de gegevens te bekijken
        {magWijzigen ? ", te bewerken" : ""}{isBeheerder ? " en aan cliënten te koppelen" : ""}. Bij welke
        cliënt iemand hoort wordt bepaald vanaf de cliënt (primaire en secundaire contactpersoon).
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <ScopeToggle scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op naam, functie, e-mail, cliënt…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 250, maxHeight: 320, overflowY: "auto" }}>
                {geordendeKolommen.map((kol, i) => (
                  <div key={kol.key} style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer", flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={zichtbaar.has(kol.key)}
                        onChange={() => setZichtbaar((h) => { const n = new Set(h); if (n.has(kol.key)) n.delete(kol.key); else n.add(kol.key); return n; })}
                      />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kol.label}</span>
                    </label>
                    <button onClick={() => verplaatsKolom(kol.key, -1)} disabled={i === 0} title="Kolom naar links" style={{ background: "none", border: "none", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={14} /></button>
                    <button onClick={() => verplaatsKolom(kol.key, 1)} disabled={i === geordendeKolommen.length - 1} title="Kolom naar rechts" style={{ background: "none", border: "none", color: i === geordendeKolommen.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === geordendeKolommen.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <select value={actieveWeergave} onChange={(e) => kiesWeergave(e.target.value)} style={selectStijl} title="Opgeslagen weergave">
          <option value="">Weergave…</option>
          {weergaven.map((v) => <option key={v.naam} value={v.naam}>{v.naam}</option>)}
        </select>
        {actieveWeergave && (
          <button
            onClick={zetStandaardWeergave}
            title={huidigeIsStandaard ? "Dit is je standaardweergave — klik om uit te zetten" : "Als mijn standaardweergave instellen (laadt automatisch)"}
            style={{ background: "none", border: "none", cursor: "pointer", color: huidigeIsStandaard ? KLEUR.goud : KLEUR.mutedTekst, padding: 4, display: "flex" }}
          >
            <Star size={16} fill={huidigeIsStandaard ? "currentColor" : "none"} />
          </button>
        )}
        <button onClick={opslaanAlsWeergave} style={selectStijl} title="Huidige indeling opslaan als weergave">Opslaan als…</button>
        {actieveWeergave && (
          <button onClick={verwijderWeergave} style={{ ...selectStijl, color: KLEUR.rood }} title="Verwijder deze weergave">Verwijderen</button>
        )}
        {weergaveFout && (
          <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan van de weergave is mislukt — probeer het nog eens.</span>
        )}

        <button onClick={() => setFilterRegel((o) => !o)} style={{ ...selectStijl, color: filterRegel ? KLEUR.blauw : KLEUR.tekst, fontWeight: filterRegel ? 700 : 400 }}>
          Filters {filterRegel ? "▴" : "▾"}
        </button>

        {(actieveFilters.length > 0 || zoek) && (
          <button
            onClick={() => { setKolomFilters({}); setZoek(""); }}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Filters wissen
          </button>
        )}
        {isBeheerder && (
          <button onClick={() => setToevoegenOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={14} /> Nieuwe contactpersoon
          </button>
        )}
      </div>

      {actieveFilters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {actieveFilters.map(([key, v]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
              {(kolomVan(key)?.label || key)} bevat "{v}"
              <button onClick={() => setKolomFilters((h) => { const n = { ...h }; delete n[key]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>
          De contactpersonen konden niet worden geladen ({fout}). Controleer de Dynamics-instellingen.
        </div>
      )}

      {scope === "mijn" && naamGeladen && !mijnNaam && (
        <div style={{ fontSize: 12, color: "#B98237", marginBottom: 8 }}>Je naam kon niet automatisch worden bepaald; gebruik <strong>Kantoorbreed</strong>.</div>
      )}

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
        {gefilterd.length} contactperso{gefilterd.length === 1 ? "on" : "nen"}
        {afgekapt ? " · lijst afgekapt, verfijn je zoekopdracht" : ""}
      </div>

      {magBulk && selectie.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10, padding: "8px 12px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: KLEUR.blauw }}>{selectie.size} geselecteerd</span>
          <button onClick={() => setBulkOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Pencil size={13} /> Bulk wijzigen
          </button>
          {isBeheerder && (
            <button onClick={() => setDocrechtBulkOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <ShieldCheck size={13} /> Documentrechten
            </button>
          )}
          <button onClick={() => setSelectie(new Set())} style={{ padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Selectie wissen</button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, zichtKols.length * 110) }}>
          <thead>
            <tr>
              {magBulk && (
                <th style={{ ...th, width: 34, cursor: "default" }}>
                  <input type="checkbox" checked={allesGeselecteerd} onChange={toggleAlles} title="Alles op deze lijst selecteren" />
                </th>
              )}
              {zichtKols.map((kol) => {
                const actief = sortKey === kol.key || kolomFilters[kol.key];
                return (
                  <th
                    key={kol.key}
                    onClick={() => sorteerOp(kol.key)}
                    title="Klik om te sorteren"
                    style={{ ...th, cursor: "pointer", userSelect: "none", color: actief ? KLEUR.blauw : th.color }}
                  >
                    {kol.label}{pijl(kol.key)}{kolomFilters[kol.key] ? " •" : ""}
                  </th>
                );
              })}
            </tr>
            {filterRegel && (
              <tr>
                {magBulk && <th style={{ ...th, padding: "4px 6px", width: 34 }} />}
                {zichtKols.map((kol) => (
                  <th key={kol.key} style={{ ...th, padding: "4px 6px", textTransform: "none" }}>
                    <input
                      value={kolomFilters[kol.key] || ""}
                      onChange={(e) => setKolomFilters((h) => ({ ...h, [kol.key]: e.target.value }))}
                      placeholder="bevat…"
                      style={{ width: "100%", boxSizing: "border-box", padding: "5px 7px", fontSize: 12, fontWeight: 400, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, outline: "none" }}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {zichtbareRijen.map((c) => {
              const gekozen = selectie.has(c.contactId);
              return (
                <tr
                  key={c.contactId}
                  onClick={() => setDetail(c)}
                  title="Klik om te openen"
                  style={{ cursor: "pointer", background: gekozen ? KLEUR.lichtblauw : "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = KLEUR.lichtblauw)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = gekozen ? KLEUR.lichtblauw : "transparent")}
                >
                  {magBulk && (
                    <td style={{ ...td, width: 34 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={gekozen} onChange={() => toggleSelectie(c.contactId)} />
                    </td>
                  )}
                  {zichtKols.map((kol) => (
                    <td key={kol.key} style={td}>{cel(kol, c)}</td>
                  ))}
                </tr>
              );
            })}
            {zichtbareRijen.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, zichtKols.length + (magBulk ? 1 : 0))} style={{ ...td, color: KLEUR.mutedTekst, whiteSpace: "normal" }}>
                  Geen contactpersonen gevonden met deze zoekopdracht of filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
          {Math.min(toonAantal === Infinity ? gefilterd.length : toonAantal, gefilterd.length)} van {gefilterd.length} getoond
          {afgekapt ? " · lijst afgekapt in Dynamics" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
          {AANTALLEN.map(([n, lbl]) => (
            <button
              key={lbl}
              onClick={() => setToonAantal(n)}
              style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${toonAantal === n ? KLEUR.blauw : KLEUR.rand}`,
                background: toonAantal === n ? KLEUR.blauw : "#fff",
                color: toonAantal === n ? "#fff" : KLEUR.subtekst,
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {bulkOpen && magBulk && (
        <BulkContactBewerken
          aantal={selectie.size}
          onKlaar={() => setBulkOpen(false)}
          onToepassen={bulkToepassen}
        />
      )}

      {toevoegenOpen && isBeheerder && (
        <ContactpersoonToevoegen onKlaar={() => setToevoegenOpen(false)} onToegevoegd={naToevoegen} />
      )}

      {docrechtBulkOpen && isBeheerder && (
        <BulkDocumentrechten aantal={selectie.size} onKlaar={() => setDocrechtBulkOpen(false)} onToepassen={bulkDocumentrecht} />
      )}
    </div>
  );
}

/* ── Bulk: één documentrecht aan-/uitzetten op alle geselecteerde contactpersonen (beheerder) ── */
function BulkDocumentrechten({ aantal, onKlaar, onToepassen }) {
  const [recht, setRecht] = useState("aanleveren");
  const [waarde, setWaarde] = useState(true);
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [resultaat, setResultaat] = useState(null);
  const rechtLabel = (DOC_RECHTEN.find((r) => r.key === recht) || {}).label || recht;

  const toepassen = async () => {
    if (!window.confirm(`Documentrecht "${rechtLabel}" ${waarde ? "aanzetten" : "uitzetten"} bij ${aantal} contactperso${aantal === 1 ? "on" : "nen"}?`)) return;
    setStatus("bezig");
    try {
      const d = await onToepassen(recht, waarde);
      setResultaat(d);
      setStatus("invoer");
    } catch {
      setStatus("fout");
    }
  };

  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, background: "#fff", marginBottom: 8 };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 420, maxWidth: "92vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <ShieldCheck size={17} color={KLEUR.blauw} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Documentrechten in bulk</span>
        </div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14 }}>
          Zet één documentrecht in één keer aan of uit bij <strong>{aantal}</strong> geselecteerde contactperso{aantal === 1 ? "on" : "nen"}. Wordt per persoon gelogd.
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Recht</div>
        <select value={recht} onChange={(e) => { setRecht(e.target.value); setResultaat(null); }} style={veld}>
          {DOC_RECHTEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>

        <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Actie</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          {[[true, "Aanzetten"], [false, "Uitzetten"]].map(([v, lbl]) => (
            <button key={lbl} onClick={() => setWaarde(v)} style={{ flex: 1, padding: "8px 10px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${waarde === v ? KLEUR.blauw : KLEUR.rand}`, background: waarde === v ? KLEUR.blauw : "#fff", color: waarde === v ? "#fff" : KLEUR.subtekst }}>
              {lbl}
            </button>
          ))}
        </div>

        {resultaat && (
          <div style={{ fontSize: 12.5, marginTop: 6, color: resultaat.mislukt && resultaat.mislukt.length ? KLEUR.rood : KLEUR.groen }}>
            {resultaat.gelukt} bijgewerkt{resultaat.mislukt && resultaat.mislukt.length ? ` · ${resultaat.mislukt.length} mislukt` : ""}.
          </div>
        )}
        {status === "fout" && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 6 }}>Bulk-aanpassing mislukt, probeer het nog eens.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={toepassen} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Bezig…" : "Toepassen"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sluiten</button>
        </div>
      </div>
    </>
  );
}

/* ── Bulk-bewerken van meerdere contactpersonen: kies één veld + waarde en pas toe op de selectie ── */
function BulkContactBewerken({ aantal, onKlaar, onToepassen }) {
  const [veldKey, setVeldKey] = useState("");
  const [waarde, setWaarde] = useState("");
  const [leeg, setLeeg] = useState(false); // veld leegmaken i.p.v. een waarde zetten
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [resultaat, setResultaat] = useState(null); // { gelukt, mislukt }
  const veld = BULK_VELDEN.find((v) => v.key === veldKey) || null;
  const klaar = !!veld && (leeg || waarde.trim() !== "");
  const lbl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 6 };

  const toepassen = async () => {
    if (!klaar) return;
    const teZetten = leeg ? "" : waarde;
    const omschrijving = leeg ? "leegmaken" : `wijzigen naar "${teZetten}"`;
    if (!window.confirm(`Weet je zeker dat je "${veld.label}" bij ${aantal} contactperso${aantal === 1 ? "on" : "nen"} wilt ${omschrijving}?`)) return;
    setStatus("bezig");
    try {
      const d = await onToepassen(veld, teZetten);
      setResultaat(d);
      setStatus("invoer");
    } catch {
      setStatus("fout");
    }
  };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 420, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bulk-aanpassing contactpersonen</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14 }}>
          De gekozen waarde wordt toegepast op <strong>{aantal}</strong> geselecteerde contactperso{aantal === 1 ? "on" : "nen"}. Wijzigingen gaan rechtstreeks naar Dynamics en komen in het logboek.
        </div>

        <div style={lbl}>Veld</div>
        <select value={veldKey} onChange={(e) => { setVeldKey(e.target.value); setResultaat(null); }} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, marginBottom: 8, background: "#fff" }}>
          <option value="">— kies een veld —</option>
          {BULK_VELDEN.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>

        {veld && (
          <div>
            <div style={lbl}>Nieuwe waarde</div>
            <input
              value={leeg ? "" : waarde}
              disabled={leeg}
              onChange={(e) => setWaarde(e.target.value)}
              placeholder={leeg ? "(leegmaken)" : `Nieuwe ${veld.label.toLowerCase()}…`}
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, background: leeg ? "#F4F4F1" : "#fff" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12.5, color: KLEUR.subtekst, cursor: "pointer" }}>
              <input type="checkbox" checked={leeg} onChange={(e) => setLeeg(e.target.checked)} /> Veld leegmaken
            </label>
          </div>
        )}

        {resultaat && (
          <div style={{ fontSize: 12.5, marginTop: 10, color: resultaat.mislukt && resultaat.mislukt.length ? KLEUR.rood : KLEUR.groen }}>
            {resultaat.gelukt} gewijzigd{resultaat.mislukt && resultaat.mislukt.length ? ` · ${resultaat.mislukt.length} mislukt (mogelijk onvoldoende schrijfrechten in Dynamics)` : ""}.
          </div>
        )}
        {status === "fout" && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Bulk-aanpassing mislukt, probeer het nog eens.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={toepassen} disabled={!klaar || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaar ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaar ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Bezig…" : "Toepassen"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sluiten</button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Detailweergave ─────────────────────────── */

const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 2, marginTop: 10 };

function Veld({ label, waarde, soort }) {
  const leeg = waarde == null || waarde === "";
  return (
    <div>
      <div style={labelStijl}>{label}</div>
      {leeg ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst }}>—</div>
      ) : soort === "email" ? (
        <a href={`mailto:${waarde}`} style={{ fontSize: 13, color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>
      ) : soort === "tel" ? (
        <a href={`tel:${String(waarde).replace(/\s/g, "")}`} style={{ fontSize: 13, color: KLEUR.blauw, textDecoration: "none" }}>{waarde}</a>
      ) : (
        <div style={{ fontSize: 13, color: KLEUR.tekst }}>{waarde}</div>
      )}
    </div>
  );
}

/* ── Documentrechten per contactpersoon (beheerder): wat mag deze persoon in het klantportaal
   onder Documenten. Wijzigingen worden meteen opgeslagen (server dwingt beheerder-recht af). ── */
const DOC_RECHTEN = [
  { key: "inzien", label: "Inzien correspondentie", uitleg: "Mag de map Correspondentie van de cliënt bekijken." },
  { key: "aanleveren", label: "Aanleveren", uitleg: "Mag bestanden aanleveren op een verzoek." },
  { key: "akkorderen", label: "Akkorderen", uitleg: "Mag akkoord/ondertekening geven op stukken." },
  { key: "inzienDirectie", label: "Inzien directie", uitleg: "Mag de map 'Directie' bekijken." },
  { key: "inzienAdministratie", label: "Inzien administratie", uitleg: "Mag de map 'Administratie' bekijken." },
  { key: "bewerkenAdministratie", label: "Bewerken administratie", uitleg: "Mag zelf bestanden uploaden in de map 'Administratie' (kan die map dan ook bekijken)." },
];

function Documentrechten({ contactId, onGewijzigd }) {
  const [rechten, setRechten] = useState(null); // null = laden
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");

  useEffect(() => {
    let actief = true;
    setRechten(null);
    setStatus("rust");
    fetch("/api/medewerker-contactpersoon?documentrechten=" + encodeURIComponent(contactId))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setRechten(d.documentrechten || {}); })
      .catch(() => { if (actief) setRechten({}); });
    return () => { actief = false; };
  }, [contactId]);

  const toggle = async (key) => {
    if (!rechten) return;
    const nieuw = { ...rechten, [key]: !rechten[key] };
    setRechten(nieuw);
    setStatus("bezig");
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "documentrechten", contactId, rechten: nieuw }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setRechten(d.documentrechten || nieuw);
      setStatus("opgeslagen");
      onGewijzigd && onGewijzigd();
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
      setRechten((h) => ({ ...(h || {}), [key]: !nieuw[key] })); // terugdraaien
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Documentrechten</div>
        {status === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
        {status === "bezig" && <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Opslaan…</span>}
      </div>
      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 8 }}>
        Bepaalt wat deze contactpersoon in het klantportaal onder Documenten mag. Wijzigingen worden meteen opgeslagen.
      </div>
      {rechten === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Rechten ophalen…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 6 }}>
          {DOC_RECHTEN.map((r) => (
            <label key={r.key} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, cursor: "pointer", background: rechten[r.key] ? KLEUR.lichtblauw : "#fff" }}>
              <input type="checkbox" checked={!!rechten[r.key]} onChange={() => toggle(r.key)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>{r.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: KLEUR.mutedTekst }}>{r.uitleg}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}
    </div>
  );
}

/* ── Aanlever-verzoeken uitzetten naar deze contactpersoon (kies cliënt + aanleverlijst) en de
   lopende verzoeken volgen. Beschikbaar voor medewerkers/beheerders (route dwingt de rol af). ── */
const rid = () => Math.random().toString(36).slice(2, 9);

function AanleverVerzoeken({ contact, onGewijzigd }) {
  const [data, setData] = useState(null); // { verzoeken } | null = laden
  const [nieuw, setNieuw] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [onderwerpId, setOnderwerpId] = useState("");
  const [lijstId, setLijstId] = useState("");
  const [jaar, setJaar] = useState("");
  const [gebruikAlgemeen, setGebruikAlgemeen] = useState(false);
  const [extraRegels, setExtraRegels] = useState([]);
  const [notitie, setNotitie] = useState("");
  const [klant, setKlant] = useState(null); // { onderwerpen, lijsten, config } voor gekozen account
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [openId, setOpenId] = useState("");

  const koppelingen = (contact.klanten || []).filter((k) => k.accountId);

  const laad = () =>
    fetch("/api/medewerker-aanleververzoeken")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData({ verzoeken: (d.verzoeken || []).filter((v) => v.contactId === contact.contactId) }))
      .catch(() => setData({ verzoeken: [] }));

  useEffect(() => {
    setData(null);
    laad();
    setAccountId(koppelingen.length === 1 ? koppelingen[0].accountId : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.contactId]);

  // Onderwerpen/lijsten/config van de gekozen cliënt laden.
  useEffect(() => {
    if (!accountId) { setKlant(null); return; }
    let a = true;
    setKlant(null); setOnderwerpId(""); setLijstId(""); setGebruikAlgemeen(false); setExtraRegels([]);
    fetch("/api/medewerker-klant-onderwerpen?accountId=" + encodeURIComponent(accountId))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (a) setKlant({ onderwerpen: d.onderwerpen || [], lijsten: d.lijsten || [], config: d.config || {} }); })
      .catch(() => { if (a) setKlant({ onderwerpen: [], lijsten: [], config: {} }); });
    return () => { a = false; };
  }, [accountId]);

  const onderwerp = klant ? (klant.onderwerpen || []).find((o) => o.id === onderwerpId) : null;
  const conf = klant && onderwerpId ? klant.config[onderwerpId] : null;
  const klantSpecifiek = !!(conf && Array.isArray(conf.regels));
  const gekozenLijst = klant && lijstId ? (klant.lijsten || []).find((l) => l.id === lijstId) : null;
  const bronLabel = gekozenLijst ? `de lijst "${gekozenLijst.naam}"` : (klantSpecifiek && !gebruikAlgemeen ? "de klant-specifieke lijst" : "de algemene lijst");
  const basisRegels = (() => {
    if (gekozenLijst) return gekozenLijst.regels || [];
    if (!onderwerp) return [];
    if (klantSpecifiek && !gebruikAlgemeen) return conf.regels || [];
    if (onderwerp.standaardLijstId) return ((klant.lijsten || []).find((l) => l.id === onderwerp.standaardLijstId) || {}).regels || [];
    return [];
  })();

  const uitzetten = async () => {
    if (!accountId) { setFout("Kies een cliënt."); return; }
    const extra = extraRegels.filter((r) => r.naam.trim());
    const regels = [...basisRegels, ...extra];
    if (!onderwerpId && !lijstId && regels.length === 0) { setFout("Kies een onderwerp of lijst, of voeg minimaal één regel toe."); return; }
    setBezig(true); setFout("");
    try {
      const r = await fetch("/api/medewerker-aanleververzoeken", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "uitzetten", accountId, contactId: contact.contactId, onderwerpId, lijstId, jaar, gebruikAlgemeen, regels, notitie }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setNieuw(false); setOnderwerpId(""); setLijstId(""); setJaar(""); setExtraRegels([]); setNotitie(""); setGebruikAlgemeen(false);
      await laad();
      onGewijzigd && onGewijzigd();
    } catch (e) {
      setFout(e.message || "Uitzetten mislukt.");
    } finally { setBezig(false); }
  };

  const verwijder = async (id) => {
    if (!window.confirm("Dit aanlever-verzoek verwijderen?")) return;
    await fetch("/api/medewerker-aanleververzoeken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "verwijderen", id }) }).catch(() => {});
    laad();
  };

  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, background: "#fff" };
  const mini = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "5px 7px", fontSize: 12, background: "#fff" };

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={15} color={KLEUR.blauw} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Aanlever-verzoeken</span>
        </div>
        {!nieuw && koppelingen.length > 0 && (
          <button onClick={() => { setNieuw(true); setFout(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={13} /> Verzoek uitzetten
          </button>
        )}
      </div>

      {koppelingen.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Koppel deze persoon eerst aan een cliënt om een verzoek te kunnen uitzetten.</div>}

      {nieuw && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 10, background: "#FBFBF9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Cliënt</div>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={veld}>
                <option value="">— kies cliënt —</option>
                {koppelingen.map((k) => <option key={k.accountId} value={k.accountId}>{k.klantnaam}{k.klantnummer ? ` (${k.klantnummer})` : ""}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Onderwerp <span style={{ fontWeight: 400 }}>(bepaalt de map)</span></div>
              <select value={onderwerpId} onChange={(e) => { setOnderwerpId(e.target.value); setGebruikAlgemeen(false); }} disabled={!klant} style={veld}>
                <option value="">— geen / algemeen —</option>
                {(klant && klant.onderwerpen || []).map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr", gap: 10, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Lijst <span style={{ fontWeight: 400 }}>(leeg = die van het onderwerp)</span></div>
              <select value={lijstId} onChange={(e) => setLijstId(e.target.value)} disabled={!klant} style={veld}>
                <option value="">{onderwerp ? "— lijst van het onderwerp —" : "— kies lijst —"}</option>
                {(klant && klant.lijsten || []).map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Jaar</div>
              <input value={jaar} onChange={(e) => setJaar(e.target.value)} placeholder="2025" style={veld} />
            </div>
          </div>

          {accountId && klant && (klant.onderwerpen || []).length === 0 && (
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Er zijn nog geen onderwerpen ingericht (Beheer → Onderwerpen). Je kunt hieronder wel losse regels toevoegen.</div>
          )}

          {(onderwerp || gekozenLijst) && (
            <div style={{ marginTop: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst }}>
                  Documenten uit {bronLabel} ({basisRegels.length})
                </span>
                {klantSpecifiek && !gekozenLijst && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: KLEUR.subtekst, cursor: "pointer" }}>
                    <input type="checkbox" checked={gebruikAlgemeen} onChange={(e) => setGebruikAlgemeen(e.target.checked)} /> Algemene lijst gebruiken
                  </label>
                )}
              </div>
              {basisRegels.length === 0
                ? <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten in deze lijst — voeg hieronder losse regels toe.</div>
                : basisRegels.map((r, i) => <div key={r.id || i} style={{ fontSize: 12.5 }}>• {r.naam}{r.verplicht === false ? <span style={{ color: KLEUR.mutedTekst }}> · optioneel</span> : null}</div>)}
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 4 }}>Extra losse documenten (optioneel)</div>
            {extraRegels.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr auto", gap: 6, marginBottom: 5 }}>
                <input value={r.naam} onChange={(e) => setExtraRegels((h) => h.map((x) => (x.id === r.id ? { ...x, naam: e.target.value } : x)))} placeholder="Document" style={{ ...mini, width: "100%" }} />
                <input value={r.bestandsnaam} onChange={(e) => setExtraRegels((h) => h.map((x) => (x.id === r.id ? { ...x, bestandsnaam: e.target.value } : x)))} placeholder="Vaste bestandsnaam (optioneel)" style={{ ...mini, width: "100%" }} />
                <button onClick={() => setExtraRegels((h) => h.filter((x) => x.id !== r.id))} title="Verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, cursor: "pointer" }}><Trash2 size={12} /></button>
              </div>
            ))}
            <button onClick={() => setExtraRegels((h) => [...h, { id: rid(), naam: "", bestandsnaam: "", toelichting: "", verplicht: true }])} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}><Plus size={12} /> Regel toevoegen</button>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Notitie voor de klant (optioneel)</div>
            <input value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="bv. Graag vóór 1 april aanleveren" style={veld} />
          </div>

          {fout && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={uitzetten} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <Send size={13} /> {bezig ? "Uitzetten…" : "Uitzetten"}
            </button>
            <button onClick={() => { setNieuw(false); setFout(""); }} style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
          </div>
        </div>
      )}

      {data === null ? (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Verzoeken ophalen…</div>
      ) : data.verzoeken.length === 0 ? (
        !nieuw && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen aanlever-verzoeken uitgezet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.verzoeken.map((v) => {
            const klaar = v.regels.filter((r) => r.status === "aangeleverd").length;
            const open = openId === v.id;
            return (
              <div key={v.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 12px" }}>
                  <button onClick={() => setOpenId(open ? "" : v.id)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                    <ChevronDown size={14} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v.onderwerp || v.lijstNaam || "Aanlever-verzoek"}{v.jaar ? ` ${v.jaar}` : ""}</span>
                    <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{v.klantnaam}{" · "}{klaar}/{v.regels.length} aangeleverd</span>
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: v.status === "afgerond" ? "#E7F2EA" : KLEUR.lichtblauw, color: v.status === "afgerond" ? KLEUR.groen : KLEUR.blauw }}>{v.status === "afgerond" ? "Compleet" : "Openstaand"}</span>
                    <button onClick={() => verwijder(v.id)} title="Verwijderen" style={{ display: "inline-flex", background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer" }}><Trash2 size={14} /></button>
                  </div>
                </div>
                {open && (
                  <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                    {v.notitie && <div style={{ fontSize: 11.5, color: KLEUR.subtekst, fontStyle: "italic" }}>{v.notitie}</div>}
                    {v.regels.map((r) => (
                      <div key={r.id} style={{ fontSize: 12, padding: "6px 9px", background: "#FBFBF9", border: `1px solid ${KLEUR.rand}`, borderRadius: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {r.status === "aangeleverd"
                            ? <CheckCircle2 size={13} color={KLEUR.groen} />
                            : <span style={{ width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${KLEUR.mutedTekst}`, display: "inline-block" }} />}
                          <span style={{ fontWeight: 600, color: KLEUR.tekst }}>{r.naam}</span>
                          {r.status === "aangeleverd" && r.bestand && <span style={{ color: KLEUR.mutedTekst }}>· {r.bestand.naam}</span>}
                        </div>
                        {r.opmerking && <div style={{ marginLeft: 20, marginTop: 2, color: "#B98237" }}>Opmerking: {r.opmerking}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContactpersoonDetail({ contact, magWijzigen, magVerwijderen, isBeheerder, onTerug, onBewerkt, onKoppeld, onOntkoppeld, onVerwijderd }) {
  const [bewerken, setBewerken] = useState(false);
  const [koppelKlant, setKoppelKlant] = useState(null); // gekozen cliënt voor de dubbele bevestiging
  const [ontkoppelBezig, setOntkoppelBezig] = useState(""); // accountId dat bezig is
  const [fout, setFout] = useState("");
  const [verwijderBezig, setVerwijderBezig] = useState(false);
  const [logSleutel, setLogSleutel] = useState(0); // ophogen = logboek opnieuw laden na een actie

  const verwijder = async () => {
    const aantalKoppelingen = (contact.klanten || []).length;
    const extra = aantalKoppelingen > 0
      ? `\n\nLet op: deze persoon is gekoppeld aan ${aantalKoppelingen} cliënt(en). Die koppeling(en) worden verbroken en de portaal-toegang vervalt.`
      : "";
    if (!window.confirm(`Contactpersoon "${contact.naam || ""}" verwijderen?\n\nDe persoon wordt op inactief gezet en verdwijnt uit het portaal. Dit is terug te draaien in Dynamics.${extra}`)) return;
    setVerwijderBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "verwijderen", contactId: contact.contactId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onVerwijderd(contact.contactId);
    } catch (e) {
      setFout(e.message || "Verwijderen mislukt.");
      setVerwijderBezig(false);
    }
  };

  if (bewerken) {
    return (
      <ContactpersoonBewerken
        contact={contact}
        onKlaar={() => setBewerken(false)}
        onOpgeslagen={(velden) => { onBewerkt(contact.contactId, velden); setBewerken(false); setLogSleutel((n) => n + 1); }}
      />
    );
  }

  const adres = [contact.straat, contact.huisnummer, contact.toevoeging].filter(Boolean).join(" ");
  const adresRegel2 = [contact.postcode, contact.plaats].filter(Boolean).join("  ");
  const klanten = contact.klanten || [];

  const ontkoppel = async (klant) => {
    if (!window.confirm(`Koppeling verbreken?\n\n${contact.naam} verliest hiermee de toegang tot het portaal-dossier van ${klant.klantnaam}.`)) return;
    setOntkoppelBezig(klant.accountId);
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "ontkoppel", accountId: klant.accountId, contactId: contact.contactId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onOntkoppeld(contact, klant.accountId);
      setLogSleutel((n) => n + 1);
    } catch (e) {
      setFout(e.message || "Loskoppelen mislukt.");
    } finally {
      setOntkoppelBezig("");
    }
  };

  return (
    <div>
      <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={15} /> Terug naar contactpersonen
      </button>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{contact.naam || "—"}</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{contact.functie || "Geen functie bekend"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {magWijzigen && (
              <button
                onClick={() => setBewerken(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                <Pencil size={13} /> Bewerken
              </button>
            )}
            {(isBeheerder || magVerwijderen) && (
              <button
                onClick={verwijder}
                disabled={verwijderBezig}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                <Trash2 size={13} /> {verwijderBezig ? "Verwijderen…" : "Verwijderen"}
              </button>
            )}
          </div>
        </div>

        <AanleverVerzoeken contact={contact} onGewijzigd={() => setLogSleutel((n) => n + 1)} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px", marginTop: 6 }}>
          <div>
            <Veld label="Aanhef" waarde={contact.aanhef} />
            <Veld label="Voornaam" waarde={contact.voornaam} />
            <Veld label="Tussenvoegsel" waarde={contact.tussenvoegsel} />
            <Veld label="Achternaam" waarde={contact.achternaam} />
            <Veld label="Functie" waarde={contact.functie} />
          </div>
          <div>
            <Veld label="E-mail" waarde={contact.email} soort="email" />
            <Veld label="Mobiel" waarde={contact.mobiel} soort="tel" />
            <Veld label="Telefoon" waarde={contact.telefoon} soort="tel" />
            <Veld label="Adres" waarde={[adres, adresRegel2].filter(Boolean).join(", ")} />
            <Veld label="Land" waarde={contact.land} />
          </div>
        </div>

        {/* ── Gekoppelde cliënten ── */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Gekoppelde cliënt(en)</div>
          {klanten.length === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze contactpersoon is nog niet aan een cliënt gekoppeld.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {klanten.map((k) => (
                <div key={k.accountId + k.rol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{k.klantnaam || "—"}</span>
                    {k.klantnummer ? <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Cliëntnr {k.klantnummer}</span> : null}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: k.rol === "Primair" ? KLEUR.lichtblauw : "#F1F1EE", color: k.rol === "Primair" ? KLEUR.blauw : KLEUR.subtekst }}>{k.rol}</span>
                  </div>
                  {isBeheerder && k.rol === "Primair" && (
                    <button
                      onClick={() => ontkoppel(k)}
                      disabled={ontkoppelBezig === k.accountId}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${KLEUR.rand}`, color: KLEUR.rood, borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      <Unlink size={13} /> {ontkoppelBezig === k.accountId ? "Bezig…" : "Loskoppelen"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 8 }}>{fout}</div>}

          {isBeheerder && (
            <div style={{ marginTop: 12 }}>
              <KoppelZoeker
                onKies={(klant) => setKoppelKlant(klant)}
                huidigeAccountIds={new Set(klanten.map((k) => k.accountId))}
              />
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6 }}>
                Koppelen zet deze persoon als <strong>primaire contactpersoon</strong> op de cliënt en geeft
                daarmee toegang tot het volledige dossier. Een eventuele huidige primaire contactpersoon
                verliest die toegang.
              </div>
            </div>
          )}
        </div>

        {isBeheerder && <Documentrechten contactId={contact.contactId} onGewijzigd={() => setLogSleutel((n) => n + 1)} />}

        <Logboek contactId={contact.contactId} sleutel={logSleutel} />
      </div>

      {koppelKlant && (
        <KoppelBevestiging
          contact={contact}
          klant={koppelKlant}
          onAnnuleer={() => setKoppelKlant(null)}
          onGekoppeld={(klant) => { onKoppeld(contact, klant); setKoppelKlant(null); setLogSleutel((n) => n + 1); }}
        />
      )}
    </div>
  );
}

/* ── Cliënt zoeken om aan te koppelen (dropdown, zoekt server-side) ── */
function KoppelZoeker({ onKies, huidigeAccountIds }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [res, setRes] = useState([]);
  const [laden, setLaden] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = term.trim();
    if (t.length < 2) { setRes([]); return; }
    let actief = true;
    setLaden(true);
    fetch("/api/medewerker-contactpersoon?zoekKlant=" + encodeURIComponent(t))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setRes(d.klanten || []); })
      .catch(() => { if (actief) setRes([]); })
      .finally(() => { if (actief) setLaden(false); });
    return () => { actief = false; };
  }, [term, open]);

  return (
    <div style={{ position: "relative", maxWidth: 460 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${KLEUR.blauw}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        <Link2 size={14} /> Koppelen aan cliënt
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 61, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", padding: 8, width: 420, maxWidth: "92vw", maxHeight: 320, overflowY: "auto" }}>
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Zoek cliënt op naam of cliëntnummer…"
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, marginBottom: 6 }}
            />
            {laden && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Zoeken…</div>}
            {!laden && term.trim().length >= 2 && res.length === 0 && (
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Geen cliënten gevonden.</div>
            )}
            {!laden && term.trim().length < 2 && (
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Typ minimaal 2 tekens…</div>
            )}
            {res.map((k) => {
              const alGekoppeld = huidigeAccountIds.has(k.accountId);
              return (
                <button
                  key={k.accountId}
                  disabled={alGekoppeld}
                  onClick={() => { onKies(k); setOpen(false); setTerm(""); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 8px", cursor: alGekoppeld ? "default" : "pointer", fontSize: 12.5, color: alGekoppeld ? KLEUR.mutedTekst : KLEUR.tekst, borderRadius: 6 }}
                >
                  <span style={{ fontWeight: 600 }}>{k.klantnaam}</span>
                  {k.klantnummer ? <span style={{ color: KLEUR.mutedTekst }}>{"  · Cliëntnr " + k.klantnummer}</span> : null}
                  {k.primairNaam ? <span style={{ color: KLEUR.mutedTekst, display: "block", fontSize: 11.5 }}>{"Nu primair: " + k.primairNaam}</span> : <span style={{ color: KLEUR.mutedTekst, display: "block", fontSize: 11.5 }}>Nog geen primaire contactpersoon</span>}
                  {alGekoppeld ? <span style={{ color: KLEUR.groen, display: "block", fontSize: 11.5 }}>Al gekoppeld</span> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Dubbele bevestiging bij koppelen: (1) waarschuwing dossier delen, (2) bewust akkoord ── */
function KoppelBevestiging({ contact, klant, onAnnuleer, onGekoppeld }) {
  const [stap, setStap] = useState(1);
  const [akkoord, setAkkoord] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const vervangtPrimair = klant.primairContactId && klant.primairContactId !== contact.contactId && klant.primairNaam;

  const bevestig = async () => {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "koppel", accountId: klant.accountId, contactId: contact.contactId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onGekoppeld(klant);
    } catch (e) {
      setFout(e.message || "Koppelen mislukt.");
      setBezig(false);
    }
  };

  const knop = { padding: "9px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none" };

  return (
    <>
      <div onClick={onAnnuleer} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 80 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 81, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.24)", padding: 24, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "#FBEDED", flexShrink: 0 }}>
            <AlertTriangle size={18} color={KLEUR.rood} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {stap === 1 ? "Dossier delen — weet je het zeker?" : "Bewust akkoord"}
          </div>
        </div>

        {stap === 1 ? (
          <div style={{ fontSize: 13.5, color: KLEUR.tekst, lineHeight: 1.5 }}>
            Je staat op het punt <strong>{contact.naam || "deze contactpersoon"}</strong> te koppelen aan cliënt{" "}
            <strong>{klant.klantnaam}</strong>{klant.klantnummer ? ` (cliëntnr ${klant.klantnummer})` : ""}.
            <div style={{ marginTop: 10 }}>
              Hiermee wordt het <strong>volledige klantportaal-dossier</strong> van deze cliënt met deze persoon
              gedeeld: documenten (SharePoint), NAW- en relatiegegevens, openstaande taken en facturen. De persoon
              kan hierna met dit e-mailadres inloggen en dit dossier inzien.
            </div>
            {vervangtPrimair && (
              <div style={{ marginTop: 10, padding: "9px 12px", background: "#FBEDED", border: `1px solid #F0D2D2`, borderRadius: 8, color: KLEUR.rood, fontSize: 12.5 }}>
                Let op: <strong>{klant.primairNaam}</strong> is nu de primaire contactpersoon en <strong>verliest hiermee
                de toegang</strong> tot dit dossier.
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: KLEUR.tekst, lineHeight: 1.5 }}>
            Bevestig deze koppeling bewust:
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, padding: "10px 12px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Ik begrijp dat het dossier van <strong>{klant.klantnaam}</strong> hiermee gedeeld wordt met{" "}
                <strong>{contact.naam || "deze contactpersoon"}</strong>
                {vervangtPrimair ? <> en dat <strong>{klant.primairNaam}</strong> de toegang verliest</> : null}.
              </span>
            </label>
          </div>
        )}

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>{fout}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          {stap === 1 ? (
            <>
              <button onClick={onAnnuleer} style={{ ...knop, background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` }}>Annuleren</button>
              <button onClick={() => setStap(2)} style={{ ...knop, background: KLEUR.blauw, color: "#fff" }}>Doorgaan</button>
            </>
          ) : (
            <>
              <button onClick={() => { setStap(1); setAkkoord(false); }} disabled={bezig} style={{ ...knop, background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` }}>Terug</button>
              <button
                onClick={bevestig}
                disabled={!akkoord || bezig}
                style={{ ...knop, display: "inline-flex", alignItems: "center", gap: 7, background: akkoord && !bezig ? KLEUR.rood : "#D9A9A9", color: "#fff", cursor: akkoord && !bezig ? "pointer" : "default" }}
              >
                <CheckCircle2 size={14} /> {bezig ? "Koppelen…" : "Definitief koppelen"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Nieuwe contactpersoon toevoegen (beknopt: naam + e-mail + mobiel + functie) ── */
function ContactpersoonToevoegen({ onKlaar, onToegevoegd }) {
  const [f, setF] = useState({ voornaam: "", tussenvoegsel: "", achternaam: "", functie: "", email: "", mobiel: "" });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [fout, setFout] = useState("");
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));
  const klaar = f.voornaam.trim() !== "" || f.achternaam.trim() !== "";
  const lbl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 8 };
  const inp = (waarde, onZet, extra) => (
    <input value={waarde} onChange={(e) => onZet(e.target.value)} {...(extra || {})}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" }} />
  );

  const opslaan = async () => {
    if (!klaar) return;
    setStatus("bezig");
    setFout("");
    try {
      const contact = {
        firstname: f.voornaam, middlename: f.tussenvoegsel, lastname: f.achternaam,
        jobtitle: f.functie, emailaddress1: f.email, mobilephone: f.mobiel,
      };
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "toevoegen", contact }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      const naam = [f.voornaam, f.tussenvoegsel, f.achternaam].filter(Boolean).join(" ").trim();
      onToegevoegd({ contactId: d.contactId, naam: d.naam || naam, voornaam: f.voornaam, tussenvoegsel: f.tussenvoegsel, achternaam: f.achternaam, functie: f.functie, email: f.email, mobiel: f.mobiel });
    } catch (e) {
      setFout(e.message || "Aanmaken mislukt.");
      setStatus("fout");
    }
  };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 460, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Nieuwe contactpersoon</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 10 }}>
          De persoon wordt in Dynamics aangemaakt. Koppelen aan een cliënt en de overige velden doe je daarna.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><div style={lbl}>Voornaam</div>{inp(f.voornaam, zet("voornaam"))}</div>
          <div><div style={lbl}>Achternaam</div>{inp(f.achternaam, zet("achternaam"))}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div><div style={lbl}>Tussenvoegsel</div>{inp(f.tussenvoegsel, zet("tussenvoegsel"))}</div>
          <div><div style={lbl}>Functie</div>{inp(f.functie, zet("functie"))}</div>
        </div>
        <div style={lbl}>E-mail</div>{inp(f.email, zet("email"), { type: "email" })}
        <div style={lbl}>Mobiel</div>{inp(f.mobiel, zet("mobiel"))}

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Aanmaken mislukt: {fout}</div>}
        {!klaar && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Vul minimaal een voor- of achternaam in.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={opslaan} disabled={!klaar || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaar ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaar ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Aanmaken…" : "Contactpersoon aanmaken"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
        </div>
      </div>
    </>
  );
}

/* ── Contactpersoon bewerken (schrijft rechtstreeks naar Dynamics via /api/medewerker-contactpersoon) ── */
function ContactpersoonBewerken({ contact, onKlaar, onOpgeslagen }) {
  const [f, setF] = useState({
    voornaam: contact.voornaam || "",
    tussenvoegsel: contact.tussenvoegsel || "",
    achternaam: contact.achternaam || "",
    functie: contact.functie || "",
    email: contact.email || "",
    mobiel: contact.mobiel || "",
    telefoon: contact.telefoon || "",
    straat: contact.straat || "",
    huisnummer: contact.huisnummer || "",
    toevoeging: contact.toevoeging || "",
    postcode: contact.postcode || "",
    plaats: contact.plaats || "",
    land: contact.land || "",
  });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [fout, setFout] = useState("");
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));

  const input = (waarde, onZet, extra) => (
    <input
      value={waarde}
      onChange={(e) => onZet(e.target.value)}
      {...(extra || {})}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, outline: "none" }}
    />
  );

  const opslaan = async () => {
    setStatus("bezig");
    setFout("");
    try {
      const contactBody = {
        firstname: f.voornaam, middlename: f.tussenvoegsel, lastname: f.achternaam,
        jobtitle: f.functie, emailaddress1: f.email, mobilephone: f.mobiel, telephone1: f.telefoon,
        address1_line1: f.straat, cr283_huisnummer: f.huisnummer, cr283_huisnummertoevoeging: f.toevoeging,
        address1_postalcode: f.postcode, address1_city: f.plaats, address1_country: f.land,
      };
      const r = await fetch("/api/medewerker-contactpersoon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "bewerken", contactId: contact.contactId, contact: contactBody }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const naam = [f.voornaam, f.tussenvoegsel, f.achternaam].filter(Boolean).join(" ").trim();
      onOpgeslagen({
        naam: naam || contact.naam,
        voornaam: f.voornaam, tussenvoegsel: f.tussenvoegsel, achternaam: f.achternaam,
        functie: f.functie, email: f.email, mobiel: f.mobiel, telefoon: f.telefoon,
        straat: f.straat, huisnummer: f.huisnummer, toevoeging: f.toevoeging,
        postcode: f.postcode, plaats: f.plaats, land: f.land,
      });
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  return (
    <div>
      <button onClick={onKlaar} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={15} /> Terug
      </button>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Contactpersoon bewerken</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12 }}>
          Wijzigingen worden rechtstreeks in Dynamics opgeslagen.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
          <div>
            <div style={labelStijl}>Voornaam</div>{input(f.voornaam, zet("voornaam"))}
            <div style={labelStijl}>Tussenvoegsel</div>{input(f.tussenvoegsel, zet("tussenvoegsel"))}
            <div style={labelStijl}>Achternaam</div>{input(f.achternaam, zet("achternaam"))}
            <div style={labelStijl}>Functie</div>{input(f.functie, zet("functie"))}
            <div style={labelStijl}>E-mail</div>{input(f.email, zet("email"), { type: "email" })}
          </div>
          <div>
            <div style={labelStijl}>Mobiel</div>{input(f.mobiel, zet("mobiel"))}
            <div style={labelStijl}>Telefoon</div>{input(f.telefoon, zet("telefoon"))}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <div><div style={labelStijl}>Straat</div>{input(f.straat, zet("straat"))}</div>
              <div><div style={labelStijl}>Nr.</div>{input(f.huisnummer, zet("huisnummer"))}</div>
              <div><div style={labelStijl}>Toev.</div>{input(f.toevoeging, zet("toevoeging"))}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={labelStijl}>Postcode</div>{input(f.postcode, zet("postcode"))}</div>
              <div><div style={labelStijl}>Plaats</div>{input(f.plaats, zet("plaats"))}</div>
            </div>
            <div style={labelStijl}>Land</div>{input(f.land, zet("land"))}
          </div>
        </div>

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Opslaan mislukt: {fout}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
        </div>
      </div>
    </div>
  );
}
