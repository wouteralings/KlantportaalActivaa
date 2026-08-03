import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  ClipboardList,
  FileText,
  Folder,
  ChevronRight,
  Eye,
  CheckCircle2,
  XCircle,
  Circle,
  Tag,
  LogOut,
  Loader2,
  RefreshCw,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  LayoutGrid,
  Star,
  Send,
  User,
  HelpCircle,
  ChevronDown,
  Upload,
  Pencil,
  MessagesSquare,
  Search,
  Users,
  Bot,
  MessageCircle,
  Clock,
  BarChart3,
  Boxes,
} from "lucide-react";
import { haalApiToken } from "./msal";
import FacturatieModule from "./FacturatieModule";
import RittenModule from "./RittenModule";
import RapportagesModule from "./RapportagesModule";
import BezittingenModule from "./BezittingenModule";
import ContractenModule from "./ContractenModule";
import { haalMeekijkSessie, activeerMeekijkFetch, deactiveerMeekijkFetch, stopMeekijken } from "../meekijken";

const KLEUR = {
  blauw: "#1C5D8C",
  goud: "#B98237",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
};

// Vervangt (of maakt) de favicon in de browsertab door de opgegeven URL.
function zetBrowserFavicon(url) {
  if (!url) return;
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

// Parseert een API-antwoord alleen als het gelukt is. Bij 403 (geen koppeling / geen
// identiteit) of een andere foutstatus gooit dit een fout met .status, zodat de aanroeper
// een nette lege staat kan tonen i.p.v. te crashen op een foutobject.
async function haalData(res) {
  if (res.ok) return res.json();
  const fout = new Error(`HTTP ${res.status}`);
  fout.status = res.status;
  throw fout;
}

const TABS = [
  { key: "home", label: "Home", icon: ClipboardList },
  { key: "gegevens", label: "Mijn gegevens", icon: Building2 },
  { key: "documenten", label: "Documenten", icon: FileText },
  { key: "faq", label: "Veelgestelde vragen", icon: HelpCircle },
  { key: "review", label: "Review geven", icon: Star },
];
// Verzameltab voor de zakelijke administratie (facturen, offertes, creditnota's, abonnementen,
// klanten, producten, uren, …). De onderliggende functies zijn elk apart per klant aan te zetten
// (facturatiemodule, urenregistratie, …); de tab zelf is zichtbaar zodra er gekoppelde
// klant-accounts zijn — de module toont dan zelf per account/onderdeel een aanvraagkaart.
const FACTUREN_TAB = { key: "facturen", label: "Administratie", icon: FileText, nieuw: true };
// Fiscale dossiers (Inkomstenbelasting/Vennootschapsbelasting) uit Dynamics — zichtbaar zodra er
// gekoppelde klant-accounts zijn; de tab toont zelf een lege staat als er (nog) geen dossiers zijn.
const DOSSIERS_TAB = { key: "dossiers", label: "Dossiers", icon: Folder };
// Rapportages (W&V + Balans op basis van RGS 3.5 uit Exact Online) en Bezittingen (activastaat +
// afschrijvingen uit Exact) — twee losse modules, elk apart per klantaccount aan/uit te zetten in
// Beheer (zie RapportagesBeheer.jsx/BezittingenBeheer.jsx), net als Facturatie/Uren. Zichtbaar
// zodra er gekoppelde klant-accounts zijn; de module toont zelf een aanvraagkaart per account
// waarvoor de module nog niet aan staat.
const RAPPORTAGES_TAB = { key: "rapportages", label: "Rapportages", icon: BarChart3 };
const BEZITTINGEN_TAB = { key: "bezittingen", label: "Bezittingen", icon: Boxes };
// Rittenregistratie (€1,50/maand per klantaccount, los van Facturatie/Uren) — zelfde opzet als
// FACTUREN_TAB: de tab is zichtbaar zodra er gekoppelde klant-accounts zijn, ook als de module
// voor nog geen van die accounts aan staat; RittenModule toont dan zelf per account een
// "niet actief"-kaart met prijsinfo en een aanvraagknop.
const RITTEN_TAB = { key: "ritten", label: "Ritten", icon: Clock, nieuw: true };
// Contracten (zelf geregistreerde verzekeringen/telefonie/overige doorlopende contracten, met
// verloopherinneringen) — los per klantaccount aan/uit te zetten in Beheer (tab "Facturatie"),
// net als Bezittingen/Rapportages/Ritten. Zichtbaar zodra er gekoppelde klant-accounts zijn; de
// module toont zelf een aanvraagkaart per account waarvoor de module nog niet aan staat.
const CONTRACTEN_TAB = { key: "contracten", label: "Contracten", icon: FileText, nieuw: true };

export default function KlantPortaal() {
  const [ingelogd, setIngelogd] = useState(null); // null = nog aan het checken
  const [gebruiker, setGebruiker] = useState(null);
  const [tab, setTab] = useState("home");
  // Waar de Administratie-tab op opent: standaard "facturen", maar de snelknop op Home zet 'm op
  // "uren" zodat je direct in de urenregistratie belandt. Wordt bij een handmatige tabklik weer
  // teruggezet (zie de Tabs-wrapper hieronder).
  const [adminInitieelSubtab, setAdminInitieelSubtab] = useState("facturen");
  const [fout, setFout] = useState("");
  // Actief zodra een medewerker (met het als-klant-recht) vanuit het medewerkersportaal
  // "Bekijk als klant" heeft gekozen — zie src/meekijken.js. Alleen-lezen, zie de fetch-
  // interceptor daar en de afdwinging in herleidAccounts() op de backend.
  const [meekijkSessie, setMeekijkSessie] = useState(null);

  const [mijnGegevens, setMijnGegevens] = useState(null);
  const [taken, setTaken] = useState(null);
  const [content, setContent] = useState(null);
  const [nieuws, setNieuws] = useState(null);
  const [gelezenNieuws, setGelezenNieuws] = useState([]);
  const [geenKoppeling, setGeenKoppeling] = useState(false);
  const [mijnVerzoeken, setMijnVerzoeken] = useState([]);
  const [documenten, setDocumenten] = useState(null);
  const [documentenStatus, setDocumentenStatus] = useState("nietOpgehaald");
  const [documentenFoutmelding, setDocumentenFoutmelding] = useState("");
  const [documentenPad, setDocumentenPad] = useState([]); // breadcrumb: [{naam, driveId, itemId}]
  const [teamsChatUrl, setTeamsChatUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [copilotEmbedUrl, setCopilotEmbedUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [wijzigingFormNawUrl, setWijzigingFormNawUrl] = useState("");
  const [wijzigingFormContactUrl, setWijzigingFormContactUrl] = useState("");
  const [facturatiemodulePrijs, setFacturatiemodulePrijs] = useState(5);
  const [urenmodulePrijs, setUrenmodulePrijs] = useState(2.5);
  const [rittenmodulePrijs, setRittenmodulePrijs] = useState(1.5);
  const [contractenmodulePrijs, setContractenmodulePrijs] = useState(2.5);
  const [rapportagesmodulePrijs, setRapportagesmodulePrijs] = useState(7.5);
  const [bezittingenmodulePrijs, setBezittingenmodulePrijs] = useState(5);

  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => {
        const principal = data.clientPrincipal;
        // Alleen een medewerker/beheerder mag ooit een meekijk-sessie honoreren (defense-in-depth
        // aan de voorkant; de echte controle gebeurt sowieso op de backend in herleidAccounts()).
        if (principal) {
          const rollen = principal.userRoles || [];
          if (rollen.includes("medewerker") || rollen.includes("beheerder")) {
            const sessie = haalMeekijkSessie();
            if (sessie) {
              activeerMeekijkFetch(sessie.contactEmail);
              setMeekijkSessie(sessie);
            }
          }
        }
        setIngelogd(!!principal);
        setGebruiker(principal);
      })
      .catch(() => setIngelogd(false));
  }, []);

  const stopMetMeekijken = useCallback(() => {
    deactiveerMeekijkFetch();
    stopMeekijken();
    window.location.href = "/medewerker";
  }, []);

  useEffect(() => {
    fetch("/api/instellingen")
      .then((r) => r.json())
      .then((d) => {
        setTeamsChatUrl(d.teamsChatUrl || "");
        setWhatsappUrl(d.whatsappUrl || "");
        setCopilotEmbedUrl(d.copilotEmbedUrl || "");
        setLogoUrl(d.logoUrl || "");
        setWijzigingFormNawUrl(d.wijzigingFormNawUrl || "");
        setWijzigingFormContactUrl(d.wijzigingFormContactUrl || "");
        setFacturatiemodulePrijs(d.facturatiemodulePrijs != null ? d.facturatiemodulePrijs : 5);
        setUrenmodulePrijs(d.urenmodulePrijs != null ? d.urenmodulePrijs : 2.5);
        setRapportagesmodulePrijs(d.rapportagesmodulePrijs != null ? d.rapportagesmodulePrijs : 7.5);
        setBezittingenmodulePrijs(d.bezittingenmodulePrijs != null ? d.bezittingenmodulePrijs : 5);
        setRittenmodulePrijs(d.rittenmodulePrijs != null ? d.rittenmodulePrijs : 1.5);
        setContractenmodulePrijs(d.contractenmodulePrijs != null ? d.contractenmodulePrijs : 2.5);
        zetBrowserFavicon(d.faviconUrl);
      })
      .catch(() => {}); // niet-kritisch
  }, []);

  useEffect(() => {
    if (!ingelogd) return;

    // 403 = de ingelogde gebruiker is (nog) niet gekoppeld aan een klant-Contact in Dynamics.
    // Dan tonen we een nette melding i.p.v. een foutbanner, en zetten we lege standaardwaarden
    // zodat de tabs niet crashen op een foutobject.
    const verwerkFout = (e) => {
      if (e.status === 403) setGeenKoppeling(true);
      else setFout("Er ging iets mis bij het ophalen van je gegevens.");
    };

    fetch("/api/mijn-gegevens")
      .then(haalData)
      .then(setMijnGegevens)
      .catch((e) => { setMijnGegevens({ accounts: [] }); verwerkFout(e); });
    fetch("/api/taken")
      .then(haalData)
      .then(setTaken)
      .catch((e) => { setTaken({ groepen: [], akkoorden: [] }); verwerkFout(e); });
    fetch("/api/mijn-content")
      .then(haalData)
      .then(setContent)
      .catch((e) => { setContent({}); verwerkFout(e); });
    fetch("/api/nieuws")
      .then(haalData)
      .then(setNieuws)
      .catch(() => setNieuws([])); // niet-kritisch, portaal blijft verder werken
    fetch("/api/nieuws-gelezen")
      .then(haalData)
      .then((d) => setGelezenNieuws(d.gelezen || []))
      .catch(() => setGelezenNieuws([])); // niet-kritisch
    fetch("/api/wijzigingsverzoek")
      .then(haalData)
      .then((d) => setMijnVerzoeken(d.verzoeken || []))
      .catch(() => setMijnVerzoeken([])); // niet-kritisch
  }, [ingelogd]);

  const haalVerzoekenOp = useCallback(() => {
    fetch("/api/wijzigingsverzoek")
      .then(haalData)
      .then((d) => setMijnVerzoeken(d.verzoeken || []))
      .catch(() => {});
  }, []);

  const dienWijzigingIn = useCallback(async (accountId, voorstel) => {
    const res = await fetch("/api/wijzigingsverzoek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, voorstel }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    haalVerzoekenOp();
    return data;
  }, [haalVerzoekenOp]);

  const haalTakenOp = useCallback(() => {
    fetch("/api/taken")
      .then(haalData)
      .then(setTaken)
      .catch(() => {}); // niet-kritisch; bestaande weergave blijft staan
  }, []);

  const geefAkkoord = useCallback(async (taakId) => {
    const vorigeTaken = taken;
    // Optimistisch: haal de taak uit de open lijst zodat de knop meteen reageert.
    setTaken((huidig) => {
      if (!huidig || !Array.isArray(huidig.groepen)) return huidig;
      return {
        ...huidig,
        groepen: huidig.groepen.map((groep) => ({
          ...groep,
          taken: groep.taken.filter((t) => t.id !== taakId),
        })),
      };
    });
    try {
      const res = await fetch(`/api/taken?id=${taakId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "akkoord" }),
      });
      if (!res.ok) throw new Error(await res.text());
      haalTakenOp(); // ververst zodat de taak in het archief "Akkoord gegeven" verschijnt
    } catch (e) {
      setTaken(vorigeTaken); // terugzetten bij een fout
      setFout("Akkoord geven is niet gelukt: " + String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken, haalTakenOp]);

  const geefNietAkkoord = useCallback(async (taakId, bericht) => {
    const vorigeTaken = taken;
    setTaken((huidig) => {
      if (!huidig || !Array.isArray(huidig.groepen)) return huidig;
      return {
        ...huidig,
        groepen: huidig.groepen.map((groep) => ({
          ...groep,
          taken: groep.taken.filter((t) => t.id !== taakId),
        })),
      };
    });
    try {
      const res = await fetch(`/api/taken?id=${taakId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "niet-akkoord", bericht }),
      });
      if (!res.ok) throw new Error(await res.text());
      haalTakenOp();
    } catch (e) {
      setTaken(vorigeTaken);
      setFout("Versturen van je reactie is niet gelukt: " + String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken, haalTakenOp]);

  const geefHandtekening = useCallback(async (taakId, gegevens) => {
    // gegevens = { naam, email, toelichting, handtekening (data-URL) }
    const token = await haalApiToken(); // MSAL-token nodig voor de on-behalf-of-upload naar SharePoint
    const res = await fetch("/api/taken-ondertekenen", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ taakId, ...gegevens }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));
    // Taak uit de open lijst halen en verversen (verschijnt in de beheer-log).
    setTaken((huidig) => {
      if (!huidig || !Array.isArray(huidig.groepen)) return huidig;
      return { ...huidig, groepen: huidig.groepen.map((g) => ({ ...g, taken: g.taken.filter((t) => t.id !== taakId) })) };
    });
    haalTakenOp();
    if (data.sharepointFout) {
      setFout("Ondertekend en vastgelegd. Let op: opslaan in SharePoint lukte nog niet (" + data.sharepointFout + ").");
    }
    return data;
  }, [haalTakenOp]);

  const markeerNieuwsGelezen = useCallback(async (url, gelezen = true) => {
    // Optimistisch bijwerken zodat het bericht meteen naar (of uit) de gelezen-sectie schuift.
    setGelezenNieuws((huidig) =>
      gelezen ? (huidig.includes(url) ? huidig : [...huidig, url]) : huidig.filter((u) => u !== url)
    );
    try {
      const res = await fetch("/api/nieuws-gelezen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, gelezen }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      // Terugdraaien bij een fout.
      setGelezenNieuws((huidig) =>
        gelezen ? huidig.filter((u) => u !== url) : (huidig.includes(url) ? huidig : [...huidig, url])
      );
    }
  }, []);

  // Laadt de wortel (leeg pad) of de inhoud van een map (laatste item van 'pad').
  const laadDocumenten = useCallback(async (pad) => {
    setDocumentenStatus("laden");
    setFout("");
    try {
      const token = await haalApiToken();
      const laatste = pad[pad.length - 1];
      const qs = laatste
        ? `?driveId=${encodeURIComponent(laatste.driveId)}&itemId=${encodeURIComponent(laatste.itemId)}`
        : "";
      const res = await fetch(`/api/documenten${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      setDocumenten(await res.json());
      setDocumentenPad(pad);
      setDocumentenStatus("klaar");
    } catch (e) {
      // Bij een MSAL-inlogprobleem (geannuleerd, popup blocked, interaction_in_progress)
      // niet ook nog de algemene foutbanner tonen — de documenten-tab toont dan al een
      // nette, specifieke melding met "opnieuw proberen".
      if (e.code === "INLOG_PROBLEEM") {
        setDocumentenFoutmelding(e.message);
        setDocumentenStatus("inlogprobleem");
      } else {
        setFout(e.message || String(e));
        setDocumentenStatus("fout");
      }
    }
  }, []);

  // Huidige map opnieuw laden (of, bij de eerste keer, de wortel).
  const haalDocumentenOp = useCallback(() => {
    if (documentenStatus === "laden") return;
    laadDocumenten(documentenPad);
  }, [documentenStatus, documentenPad, laadDocumenten]);

  // Een map openen: pad uitbreiden en de inhoud laden.
  const openMap = useCallback(
    (item) => {
      if (documentenStatus === "laden" || !item.driveId || !item.itemId) return;
      laadDocumenten([...documentenPad, { naam: item.label || item.naam, driveId: item.driveId, itemId: item.itemId }]);
    },
    [documentenStatus, documentenPad, laadDocumenten]
  );

  // Via de breadcrumb naar een hoger niveau (index -1 = wortel).
  const gaNaarPad = useCallback(
    (index) => {
      if (documentenStatus === "laden") return;
      laadDocumenten(index < 0 ? [] : documentenPad.slice(0, index + 1));
    },
    [documentenStatus, documentenPad, laadDocumenten]
  );

  const wijzigDocumentVeld = useCallback(async (id, updates) => {
    try {
      const res = await fetch(`/api/mijn-labels?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDocumenten((huidig) => huidig.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    } catch (e) {
      setFout("Opslaan mislukt: " + String(e));
    }
  }, []);

  const wijzigLabel = useCallback((id, huidigLabel) => {
    const nieuw = window.prompt("Eigen naam voor dit document/map:", huidigLabel);
    if (!nieuw || nieuw.trim() === "") return;
    wijzigDocumentVeld(id, { label: nieuw.trim() });
  }, [wijzigDocumentVeld]);

  const wijzigEntiteit = useCallback((id, huidigeEntiteit) => {
    const entiteiten = (mijnGegevens?.accounts || []).map((a) => a.klantnaam);
    if (entiteiten.length === 0) {
      window.alert("Er zijn nog geen klantgegevens bekend om aan te koppelen.");
      return;
    }
    const lijst = entiteiten.map((naam, i) => `${i + 1}) ${naam}`).join("\n");
    const keuze = window.prompt(`Bij welke klant hoort dit document?\n${lijst}`, "");
    if (!keuze) return;
    const index = parseInt(keuze, 10) - 1;
    const gekozenNaam = entiteiten[index];
    if (!gekozenNaam) {
      window.alert("Ongeldige keuze.");
      return;
    }
    wijzigDocumentVeld(id, { entiteit: gekozenNaam });
  }, [mijnGegevens, wijzigDocumentVeld]);

  const verstuurReview = useCallback(async (sterren, opmerking) => {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sterren, opmerking }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, []);

  // Facturatiemodule: de tab is zichtbaar zodra er linked klant-accounts zijn, ook als de
  // module voor nog geen van die accounts aan staat — dan toont FacturatieModule zelf per
  // account een "niet actief"-kaart met prijsinfo en een aanvraagknop, in plaats van de
  // hele tab te verbergen (anders kan een klant het nooit aanvragen). Welke accounts
  // daadwerkelijk mogen werken met facturen bepaalt de module verderop zelf.
  const alleAccounts = mijnGegevens?.accounts || [];
  // Snelknop "Uren registreren" op Home: alleen als minstens één administratie de urenregistratie
  // aan heeft én de klant die snelknop daar heeft aangezet (Administratie → Instellingen).
  const kanUrenSnel = !meekijkSessie && alleAccounts.some((a) => a.urenIngeschakeld && a.toonUrenOpHome);
  const gaNaarUrenRegistratie = () => { setAdminInitieelSubtab("uren"); setTab("facturen"); };
  // Snelknop "Factuur maken" op Home: alleen als minstens één administratie de facturatiemodule aan
  // heeft én de klant die snelknop daar heeft aangezet (Administratie → Instellingen).
  const kanFacturenSnel = !meekijkSessie && alleAccounts.some((a) => a.facturatieIngeschakeld && a.toonFacturenOpHome);
  const gaNaarFacturen = () => { setAdminInitieelSubtab("facturen"); setTab("facturen"); };
  const zichtbareTabs = (alleAccounts.length > 0
    ? [...TABS.slice(0, 3), DOSSIERS_TAB, FACTUREN_TAB, RITTEN_TAB, RAPPORTAGES_TAB, BEZITTINGEN_TAB, CONTRACTEN_TAB, ...TABS.slice(3)]
    : TABS
  // Documenten werkt via de eigen Microsoft Graph-rechten van de ingelogde gebruiker
  // (on-behalf-of) — dat kan technisch niet "namens een andere klant" getoond worden, dus
  // deze tab blijft verborgen tijdens meekijken.
  ).filter((t) => !(meekijkSessie && t.key === "documenten"));

  // Als de actieve tab niet (meer) zichtbaar is (bijv. geen accounts meer), terug naar Home.
  useEffect(() => {
    if (!zichtbareTabs.some((t) => t.key === tab) && tab !== "home") setTab("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alleAccounts.length, tab]);

  if (ingelogd === null) return <Laadscherm />;
  if (!ingelogd) return <Inlogscherm logoUrl={logoUrl} />;

  return (
    <div className="kp-container" style={{ maxWidth: "none", width: "100%", margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <Header gebruiker={gebruiker} logoUrl={logoUrl} />
      {meekijkSessie && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
          margin: "12px 0", padding: "10px 16px", background: "#FFF4E5", border: "1px solid #E8C27A",
          borderRadius: 10, fontSize: 13, color: "#8A5A00",
        }}>
          <span>
            <Eye size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Je bekijkt dit portaal <strong>alleen-lezen</strong> namens <strong>{meekijkSessie.klantnaam || "een klant"}</strong> — er
            wordt niets gewijzigd of verstuurd.
          </span>
          <button
            onClick={stopMetMeekijken}
            style={{ padding: "6px 12px", background: "#fff", color: "#8A5A00", border: "1px solid #E8C27A", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Stop met meekijken
          </button>
        </div>
      )}
      <Tabs tab={tab} setTab={(k) => { setAdminInitieelSubtab("facturen"); setTab(k); }} tabs={zichtbareTabs} />

      {fout && <Foutmelding tekst={fout} onSluiten={() => setFout("")} />}

      {geenKoppeling && (
        <div style={{ margin: "12px 0", padding: "14px 16px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 10, fontSize: 14, color: KLEUR.tekst }}>
          Je account is nog niet gekoppeld aan een klantdossier. Neem contact op met Activaa,
          dan zorgen we dat je hier je gegevens, documenten en taken ziet.
        </div>
      )}

      {tab === "home" && (
        <>
          {(kanFacturenSnel || kanUrenSnel) && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
              {kanFacturenSnel && (
                <button
                  onClick={gaNaarFacturen}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 9,
                    background: KLEUR.blauw, color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
                  }}
                >
                  <FileText size={17} /> Factuur maken
                </button>
              )}
              {kanUrenSnel && (
                <button
                  onClick={gaNaarUrenRegistratie}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 9,
                    background: KLEUR.blauw, color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
                  }}
                >
                  <Clock size={17} /> Uren registreren
                </button>
              )}
            </div>
          )}
          <Kopje tekst="Open taken" />
          <TabTaken data={taken} gebruiker={gebruiker} onAkkoord={geefAkkoord} onNietAkkoord={geefNietAkkoord} onOndertekenen={geefHandtekening} alleenLezen={!!meekijkSessie} />

          {content?.programmas?.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <Kopje tekst="Links" />
              <TabLinks programmas={content.programmas} />
            </div>
          )}

          <div style={{ marginTop: 28 }}>
            <Kopje tekst="Mededelingen" />
            <TabMededelingen content={content} gelezen={gelezenNieuws} onMarkeerGelezen={markeerNieuwsGelezen} />
          </div>

          {nieuws && nieuws.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <Kopje tekst="Nieuws & blog" />
              <TabNieuws nieuws={nieuws} gelezen={gelezenNieuws} onMarkeerGelezen={markeerNieuwsGelezen} />
            </div>
          )}
        </>
      )}
      {tab === "gegevens" && (
        <TabGegevens data={mijnGegevens} verzoeken={mijnVerzoeken} onWijzigen={dienWijzigingIn} alleenLezen={!!meekijkSessie} />
      )}
      {tab === "documenten" && (
        <TabDocumenten
          status={documentenStatus}
          data={documenten}
          foutmelding={documentenFoutmelding}
          pad={documentenPad}
          onOphalen={haalDocumentenOp}
          onOpenMap={openMap}
          onNavigeer={gaNaarPad}
          onLabelWijzigen={wijzigLabel}
          onEntiteitWijzigen={wijzigEntiteit}
        />
      )}
      {tab === "dossiers" && <TabDossiers />}
      {tab === "facturen" && <FacturatieModule accounts={alleAccounts} prijs={facturatiemodulePrijs} urenPrijs={urenmodulePrijs} alleenLezen={!!meekijkSessie} initieelSubtab={adminInitieelSubtab} />}
      {tab === "ritten" && <RittenModule accounts={alleAccounts} prijs={rittenmodulePrijs} alleenLezen={!!meekijkSessie} />}
      {tab === "rapportages" && <RapportagesModule accounts={alleAccounts} prijs={rapportagesmodulePrijs} alleenLezen={!!meekijkSessie} />}
      {tab === "bezittingen" && <BezittingenModule accounts={alleAccounts} prijs={bezittingenmodulePrijs} alleenLezen={!!meekijkSessie} />}
      {tab === "contracten" && <ContractenModule accounts={alleAccounts} prijs={contractenmodulePrijs} alleenLezen={!!meekijkSessie} />}
      {tab === "faq" && <TabFaq content={content} teamsChatUrl={teamsChatUrl} whatsappUrl={whatsappUrl} copilotEmbedUrl={copilotEmbedUrl} />}
      {tab === "review" && <TabReview onVerzenden={verstuurReview} alleenLezen={!!meekijkSessie} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Laadscherm() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: KLEUR.subtekst }}>
      <Loader2 size={20} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />
      Bezig met laden...
    </div>
  );
}

function Inlogscherm({ logoUrl }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "70vh", gap: 16 }}>
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" style={{ maxWidth: 200, maxHeight: 90, objectFit: "contain" }} />
      ) : (
        <Building2 size={32} color={KLEUR.blauw} />
      )}
      <div style={{ fontSize: 20, fontWeight: 600, color: KLEUR.tekst }}>Klantportaal</div>
      <div style={{ fontSize: 13.5, color: KLEUR.subtekst, marginBottom: 8 }}>Log in met je Microsoft-account om verder te gaan.</div>
      <a
        href={`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent("/")}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px",
          background: KLEUR.blauw, color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Inloggen met Microsoft
      </a>
    </div>
  );
}

function Header({ gebruiker, logoUrl }) {
  return (
    <div className="kp-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Building2 size={22} color={KLEUR.blauw} />
        <div style={{ fontSize: 19, fontWeight: 600 }}>Klantportaal</div>
        {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxHeight: 30, maxWidth: 160, objectFit: "contain", display: "block", alignSelf: "center", marginLeft: 8 }} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="kp-header-email" style={{ fontSize: 13, color: KLEUR.subtekst }}>{gebruiker?.userDetails}</span>
        {gebruiker?.userRoles?.includes("beheerder") && (
          <a href="/beheer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: KLEUR.blauw, textDecoration: "none", flexShrink: 0, fontWeight: 600 }}>
            <LayoutGrid size={14} /> Beheer
          </a>
        )}
        <a href="/.auth/logout" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: KLEUR.subtekst, textDecoration: "none", flexShrink: 0 }}>
          <LogOut size={14} /> Uitloggen
        </a>
      </div>
    </div>
  );
}

function Tabs({ tab, setTab, tabs }) {
  return (
    <div className="kp-tabs-wrap">
      <div className="kp-tabs" style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: `1px solid ${KLEUR.rand}` }}>
        {(tabs || TABS).map(({ key, label, icon: Icon, nieuw }) => (
          <button
            key={key}
            className="kp-tab-btn"
            onClick={() => setTab(key)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", border: "none",
              background: "transparent", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              color: tab === key ? KLEUR.blauw : KLEUR.subtekst,
              borderBottom: tab === key ? `2px solid ${KLEUR.blauw}` : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            <Icon size={15} /> {label}
            {nieuw && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: KLEUR.goud, border: `1px solid ${KLEUR.goud}55`, borderRadius: 20, padding: "1px 6px", textTransform: "uppercase", letterSpacing: ".02em" }}>
                Nieuw
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Foutmelding({ tekst, onSluiten }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, background: "#FBEAEA", border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
      <span>{tekst}</span>
      <button onClick={onSluiten} style={{ background: "none", border: "none", color: KLEUR.rood, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>×</button>
    </div>
  );
}

const kaartStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 16, background: "#fff" };

function Kopje({ tekst }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>
      {tekst}
    </div>
  );
}

function TabLinks({ programmas }) {
  if (!programmas || programmas.length === 0) return null;
  return (
    <div style={{ ...kaartStijl, display: "flex", flexWrap: "wrap", gap: 10 }}>
      {programmas.map((p) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
            border: `1px solid ${KLEUR.rand}`, borderRadius: 8, textDecoration: "none",
            color: KLEUR.tekst, fontSize: 13, fontWeight: 600,
          }}
        >
          <LayoutGrid size={15} color={KLEUR.blauw} /> {p.titel}
          <ExternalLink size={12} color={KLEUR.mutedTekst} />
        </a>
      ))}
    </div>
  );
}

function MededelingKaart({ m, gelezen, onMarkeerGelezen }) {
  return (
    <div style={{ ...kaartStijl, margin: 0, opacity: gelezen ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{m.titel}</div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, flexShrink: 0 }}>
          {new Date(m.aangemaaktOp).toLocaleDateString("nl-NL")}
        </div>
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.tekst}</div>
      <div style={{ marginTop: 10, borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 8 }}>
        {gelezen ? (
          <button
            onClick={() => onMarkeerGelezen(m.id, false)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: KLEUR.mutedTekst }}
          >
            <Circle size={13} /> Markeer als ongelezen
          </button>
        ) : (
          <button
            onClick={() => onMarkeerGelezen(m.id, true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: KLEUR.blauw }}
          >
            <CheckCircle2 size={13} /> Markeer als gelezen
          </button>
        )}
      </div>
    </div>
  );
}

function TabMededelingen({ content, gelezen = [], onMarkeerGelezen }) {
  const [gelezenOpen, setGelezenOpen] = useState(false);
  if (!content) return <Laadscherm />;
  const { mededelingen = [] } = content;
  if (mededelingen.length === 0) return <LegeStaat tekst="Geen mededelingen op dit moment." />;

  const gelezenSet = new Set(gelezen);
  const ongelezen = mededelingen.filter((m) => !gelezenSet.has(m.id));
  const gelezenItems = mededelingen.filter((m) => gelezenSet.has(m.id));

  return (
    <div>
      {ongelezen.length === 0 ? (
        <LegeStaat tekst="Je hebt alle mededelingen gelezen." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {ongelezen.map((m) => (
            <MededelingKaart key={m.id} m={m} gelezen={false} onMarkeerGelezen={onMarkeerGelezen} />
          ))}
        </div>
      )}

      {gelezenItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setGelezenOpen((v) => !v)}
            aria-expanded={gelezenOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0,
              background: "none", border: "none", cursor: "pointer", marginBottom: gelezenOpen ? 12 : 0,
              fontSize: 13, fontWeight: 700, color: KLEUR.subtekst, textAlign: "left",
            }}
          >
            <ChevronDown size={16} style={{ transform: gelezenOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
            Gelezen berichten <span style={{ fontWeight: 600, color: KLEUR.mutedTekst }}>({gelezenItems.length})</span>
          </button>
          {gelezenOpen && (
            <div style={{ display: "grid", gap: 12 }}>
              {gelezenItems.map((m) => (
                <MededelingKaart key={m.id} m={m} gelezen={true} onMarkeerGelezen={onMarkeerGelezen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NieuwsKaart({ n, gelezen, onMarkeerGelezen }) {
  return (
    <div style={{ ...kaartStijl, margin: 0, opacity: gelezen ? 0.75 : 1 }}>
      <a
        href={n.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{n.titel}</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: KLEUR.goud, flexShrink: 0 }}>
            {n.categorie}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, lineHeight: 1.5 }}>{n.samenvatting}</div>
        {n.datum && (
          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 8 }}>
            {new Date(n.datum).toLocaleDateString("nl-NL")}
          </div>
        )}
      </a>
      <div style={{ marginTop: 10, borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 8 }}>
        {gelezen ? (
          <button
            onClick={() => onMarkeerGelezen(n.url, false)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: KLEUR.mutedTekst }}
          >
            <Circle size={13} /> Markeer als ongelezen
          </button>
        ) : (
          <button
            onClick={() => onMarkeerGelezen(n.url, true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: KLEUR.blauw }}
          >
            <CheckCircle2 size={13} /> Markeer als gelezen
          </button>
        )}
      </div>
    </div>
  );
}

function TabNieuws({ nieuws, gelezen = [], onMarkeerGelezen }) {
  const [gelezenOpen, setGelezenOpen] = useState(false);
  if (!nieuws) return <Laadscherm />;
  if (nieuws.length === 0) return <LegeStaat tekst="Geen nieuws of blogposts op dit moment." />;

  const gelezenSet = new Set(gelezen);
  const ongelezen = nieuws.filter((n) => !gelezenSet.has(n.url));
  const gelezenItems = nieuws.filter((n) => gelezenSet.has(n.url));

  return (
    <div>
      {ongelezen.length === 0 ? (
        <LegeStaat tekst="Je hebt alle berichten gelezen." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {ongelezen.map((n) => (
            <NieuwsKaart key={n.url} n={n} gelezen={false} onMarkeerGelezen={onMarkeerGelezen} />
          ))}
        </div>
      )}

      {gelezenItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setGelezenOpen((v) => !v)}
            aria-expanded={gelezenOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0,
              background: "none", border: "none", cursor: "pointer", marginBottom: gelezenOpen ? 12 : 0,
              fontSize: 13, fontWeight: 700, color: KLEUR.subtekst, textAlign: "left",
            }}
          >
            <ChevronDown size={16} style={{ transform: gelezenOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
            Gelezen berichten <span style={{ fontWeight: 600, color: KLEUR.mutedTekst }}>({gelezenItems.length})</span>
          </button>
          {gelezenOpen && (
            <div style={{ display: "grid", gap: 12 }}>
              {gelezenItems.map((n) => (
                <NieuwsKaart key={n.url} n={n} gelezen={true} onMarkeerGelezen={onMarkeerGelezen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Maakt van een ingevuld WhatsApp-nummer of -link een geldige wa.me-link.
function whatsappHref(waarde) {
  if (!waarde) return "";
  if (/^https?:\/\//i.test(waarde)) return waarde;
  let cijfers = waarde.replace(/\D/g, "");
  if (cijfers.startsWith("00")) cijfers = cijfers.slice(2);
  else if (cijfers.startsWith("0")) cijfers = "31" + cijfers.slice(1); // NL-nummer met voorloop-0
  return cijfers ? `https://wa.me/${cijfers}` : "";
}

function TabFaq({ content, teamsChatUrl, whatsappUrl, copilotEmbedUrl }) {
  const [open, setOpen] = useState(null);
  const [assistentOpen, setAssistentOpen] = useState(false);
  const [faqZoek, setFaqZoek] = useState("");
  if (!content) return <Laadscherm />;
  const faqs = content.faqs || [];
  const waLink = whatsappHref(whatsappUrl);
  const heeftKanaal = teamsChatUrl || waLink;
  const faqTerm = faqZoek.trim().toLowerCase();
  const zichtbareFaqs = faqTerm
    ? faqs.filter((f) => [f.vraag, f.antwoord].filter(Boolean).some((v) => v.toLowerCase().includes(faqTerm)))
    : faqs;

  return (
    <div>
      {copilotEmbedUrl && (
        <div style={{ ...kaartStijl, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: assistentOpen ? `1px solid ${KLEUR.rand}` : "none" }}>
            <Bot size={18} color={KLEUR.blauw} />
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Onze assistent</div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>— stel gerust je vraag</div>
          </div>
          {assistentOpen ? (
            <iframe
              src={copilotEmbedUrl}
              title="Activaa assistent"
              loading="lazy"
              style={{ width: "100%", height: 480, border: "none", display: "block" }}
              allow="microphone"
            />
          ) : (
            <div style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
                Stel je vraag aan onze digitale assistent.
              </div>
              <button
                onClick={() => setAssistentOpen(true)}
                style={{ ...knopStijlPrimair, cursor: "pointer" }}
              >
                <Bot size={14} /> Start de assistent
              </button>
            </div>
          )}
        </div>
      )}

      {heeftKanaal && (
        <div style={{ ...kaartStijl, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MessagesSquare size={20} color={KLEUR.blauw} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Liever persoonlijk contact?</div>
              <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Bereik ons rechtstreeks via een van deze kanalen.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {teamsChatUrl && (
              <a href={teamsChatUrl} target="_blank" rel="noopener noreferrer" style={knopStijlPrimair}>
                <MessagesSquare size={14} /> Chat in Teams
              </a>
            )}
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...knopStijlPrimair, background: "#25D366", color: "#0B3D24" }}
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {faqs.length === 0 ? (
        <LegeStaat tekst="Nog geen veelgestelde vragen beschikbaar." />
      ) : (
        <div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={16} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={faqZoek}
              onChange={(e) => setFaqZoek(e.target.value)}
              placeholder="Zoek in de vragen…"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", fontSize: 14, borderRadius: 10, border: `1px solid ${KLEUR.rand}`, outline: "none", color: KLEUR.tekst, background: "#fff" }}
            />
          </div>
          {zichtbareFaqs.length === 0 ? (
            <div style={{ ...kaartStijl, fontSize: 13, color: KLEUR.mutedTekst }}>
              Geen vragen gevonden voor “{faqZoek}”.
            </div>
          ) : (
        <div style={kaartStijl}>
          {zichtbareFaqs.map((f, i) => (
            <div key={f.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
              <button
                onClick={() => setOpen(open === f.id ? null : f.id)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: 12, padding: "14px 0", background: "none", border: "none", cursor: "pointer",
                  textAlign: "left", fontSize: 13.5, fontWeight: 600, color: KLEUR.tekst,
                }}
              >
                {f.vraag}
                <ChevronDown
                  size={16}
                  color={KLEUR.mutedTekst}
                  style={{ flexShrink: 0, transform: open === f.id ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                />
              </button>
              {open === f.id && (
                <div style={{ fontSize: 13, color: KLEUR.subtekst, lineHeight: 1.6, paddingBottom: 16, whiteSpace: "pre-wrap" }}>
                  {f.antwoord}
                </div>
              )}
            </div>
          ))}
        </div>
          )}
        </div>
      )}
    </div>
  );
}

function vulLinkIn(template, waarden) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, sleutel) =>
    waarden[sleutel] != null ? encodeURIComponent(waarden[sleutel]) : ""
  );
}

function WijzigLink({ url }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12,
        fontWeight: 600, color: KLEUR.blauw, textDecoration: "none",
      }}
    >
      <Pencil size={12} /> Wijziging doorgeven
    </a>
  );
}

// Compacte persoonsregel (contactpersoon / relatiebeheerder / accountant).
function PersoonRegel({ label, persoon }) {
  if (!persoon || !(persoon.naam || persoon.email || persoon.telefoon)) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: KLEUR.mutedTekst, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
        <User size={13} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} /> {persoon.naam || "—"}
      </div>
      {persoon.email && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.subtekst, marginTop: 2 }}>
          <Mail size={13} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} /> <span style={{ overflowWrap: "anywhere" }}>{persoon.email}</span>
        </div>
      )}
      {persoon.telefoon && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.subtekst, marginTop: 2 }}>
          <Phone size={13} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} /> {persoon.telefoon}
        </div>
      )}
    </div>
  );
}

// Bewerkbare contactpersoon-velden (Functie rol bewust NIET wijzigbaar).
const AANHEF_OPTIES = ["De heer", "Mevrouw", "De heer / mevrouw"];
const CONTACT_VELDEN = [
  { key: "aanhef", label: "Aanhef", type: "aanhef" },
  { key: "voornaam", label: "Voornaam" },
  { key: "tussenvoegsel", label: "Tussenvoegsel" },
  { key: "achternaam", label: "Achternaam" },
  { key: "functietitel", label: "Functietitel" },
  { key: "mobiel", label: "Mobiel" },
  { key: "email", label: "E-mail" },
  { key: "geboortedatum", label: "Geboortedatum", type: "date" },
  { key: "straat", label: "Straat" },
  { key: "huisnummer", label: "Huisnummer" },
  { key: "toevoeging", label: "Toevoeging" },
  { key: "postcode", label: "Postcode" },
  { key: "plaats", label: "Plaats" },
  { key: "provincie", label: "Provincie" },
  { key: "land", label: "Land" },
];

const BEDRIJF_VELDEN = [
  { key: "bedrijf_straat", label: "Straat" },
  { key: "bedrijf_huisnummer", label: "Huisnummer" },
  { key: "bedrijf_toevoeging", label: "Toevoeging" },
  { key: "bedrijf_postcode", label: "Postcode" },
  { key: "bedrijf_plaats", label: "Plaats" },
  { key: "bedrijf_land", label: "Land" },
];

function contactBeginwaarden(acc) {
  const cp = acc.contactpersoon || {};
  const a = cp.adres || {};
  const ka = acc.klantadres || {};
  return {
    aanhef: cp.aanhef || "",
    voornaam: cp.voornaam || "",
    tussenvoegsel: cp.tussenvoegsel || "",
    achternaam: cp.achternaam || "",
    functietitel: cp.functietitel || "",
    mobiel: cp.mobiel || "",
    email: cp.email || "",
    geboortedatum: cp.geboortedatum || "",
    straat: a.straat || "",
    huisnummer: a.huisnummer || "",
    toevoeging: a.toevoeging || "",
    postcode: a.postcode || "",
    plaats: a.plaats || "",
    provincie: a.provincie || "",
    land: a.land || "",
    bedrijf_straat: ka.straat || "",
    bedrijf_huisnummer: ka.huisnummer || "",
    bedrijf_toevoeging: ka.toevoeging || "",
    bedrijf_postcode: ka.postcode || "",
    bedrijf_plaats: ka.plaats || "",
    bedrijf_land: ka.land || "",
  };
}

function nlDatum(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function volledigeNaam(cp) {
  return [cp.aanhef, cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(" ") || cp.naam || "—";
}

function WijzigForm({ acc, velden, titel, onWijzigen, onKlaar }) {
  const beginwaarden = contactBeginwaarden(acc);
  const [waarden, setWaarden] = useState(beginwaarden);
  const [status, setStatus] = useState("idle"); // idle | bezig | fout
  const [foutTekst, setFoutTekst] = useState("");

  const gewijzigd = velden.some((v) => (waarden[v.key] || "") !== (beginwaarden[v.key] || ""));

  const invoerStijl = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };

  const verstuur = async () => {
    setStatus("bezig");
    setFoutTekst("");
    try {
      // Alleen de getoonde velden meesturen; de rest blijft ongewijzigd.
      const voorstel = {};
      velden.forEach((v) => { voorstel[v.key] = waarden[v.key]; });
      await onWijzigen(acc.accountId, voorstel);
      onKlaar(true);
    } catch (e) {
      setStatus("fout");
      setFoutTekst(String(e.message || e));
    }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: KLEUR.mutedTekst, marginBottom: 10 }}>
        {titel}
      </div>
      <div className="kp-grid-2" style={{ gap: 12 }}>
        {velden.map((v) => (
          <div key={v.key}>
            <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>{v.label}</div>
            {v.type === "aanhef" ? (
              <select value={waarden.aanhef} onChange={(e) => setWaarden((h) => ({ ...h, aanhef: e.target.value }))} style={invoerStijl}>
                <option value="">—</option>
                {AANHEF_OPTIES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={v.type === "date" ? "date" : "text"}
                value={waarden[v.key]}
                onChange={(e) => setWaarden((h) => ({ ...h, [v.key]: e.target.value }))}
                style={invoerStijl}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button
          onClick={verstuur}
          disabled={!gewijzigd || status === "bezig"}
          style={{ ...knopStijlPrimair, opacity: gewijzigd ? 1 : 0.5, cursor: gewijzigd && status !== "bezig" ? "pointer" : "default" }}
        >
          <Send size={14} /> {status === "bezig" ? "Versturen…" : "Wijziging indienen"}
        </button>
        <button onClick={() => onKlaar(false)} style={{ background: "none", border: "none", color: KLEUR.subtekst, fontSize: 13, cursor: "pointer" }}>
          Annuleren
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
        Je wijziging wordt eerst door Activaa beoordeeld voordat 'ie wordt doorgevoerd.
      </div>
      {status === "fout" && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 6 }}>Indienen is niet gelukt. {foutTekst}</div>}
    </div>
  );
}

// Kleine wijzig-link per sectie.
function WijzigLinkKnop({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: 0, background: "none", border: "none", fontSize: 12.5, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}
    >
      <Pencil size={12} /> {label}
    </button>
  );
}

// Uitklapbare detail: bedrijfsgegevens + contactpersoon, elk met een eigen wijzig-knop.
function KlantDetail({ acc, verzoekStatus, onWijzigen, alleenLezen }) {
  const [wijzigWat, setWijzigWat] = useState(null); // null | "contact" | "bedrijf"
  const [ingediend, setIngediend] = useState(false);
  const inBehandeling = verzoekStatus === "open" || ingediend;
  const sluit = (gelukt) => {
    setWijzigWat(null);
    if (gelukt) setIngediend(true);
  };

  const cp = acc.contactpersoon || {};
  const a = cp.adres || {};
  const ka = acc.klantadres || {};
  const labelStijl = { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: KLEUR.mutedTekst, marginBottom: 6 };
  const regelStijl = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 3 };

  return (
    <div style={{ padding: "14px 16px 16px", borderTop: `1px solid ${KLEUR.rand}`, background: "#FCFCFB" }}>
      {/* Bedrijfsgegevens: bezoekadres (KvK read-only, of wijzigbaar zonder KvK). */}
      <div>
        <div style={labelStijl}>Bedrijfsgegevens (bezoekadres)</div>
        <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
          <MapPin size={14} color={KLEUR.mutedTekst} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {[ka.straat, ka.huisnummer, ka.toevoeging].filter(Boolean).join(" ") || "—"}
            <br />
            {[ka.postcode, ka.plaats].filter(Boolean).join(" ")}
            {ka.land ? <><br />{ka.land}</> : null}
          </span>
        </div>
        {!acc.bedrijfsadresBewerkbaar && (
          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6, fontStyle: "italic" }}>
            Deze gegevens worden automatisch gesynchroniseerd met de Kamer van Koophandel.
          </div>
        )}
        {acc.bedrijfsadresBewerkbaar && !inBehandeling && !alleenLezen && wijzigWat !== "bedrijf" && (
          <WijzigLinkKnop label="Bedrijfsadres wijzigen" onClick={() => setWijzigWat("bedrijf")} />
        )}
        {wijzigWat === "bedrijf" && !alleenLezen && (
          <WijzigForm acc={acc} velden={BEDRIJF_VELDEN} titel="Bedrijfsadres wijzigen" onWijzigen={onWijzigen} onKlaar={sluit} />
        )}
      </div>

      {/* Contactpersoon. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
        <div style={labelStijl}>Contactpersoon</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{volledigeNaam(cp)}</div>
        {cp.functietitel && <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginTop: 2 }}>{cp.functietitel}</div>}
        {cp.email && (
          <div style={regelStijl}><Mail size={14} color={KLEUR.mutedTekst} /> <span style={{ overflowWrap: "anywhere" }}>{cp.email}</span></div>
        )}
        {cp.mobiel && <div style={regelStijl}><Phone size={14} color={KLEUR.mutedTekst} /> {cp.mobiel}</div>}
        {cp.geboortedatum && (
          <div style={{ ...regelStijl, color: KLEUR.subtekst }}><Clock size={14} color={KLEUR.mutedTekst} /> Geboortedatum: {nlDatum(cp.geboortedatum)}</div>
        )}
        {(a.straat || a.plaats) && (
          <div style={{ display: "flex", gap: 8, fontSize: 13, marginTop: 6 }}>
            <MapPin size={14} color={KLEUR.mutedTekst} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {[a.straat, a.huisnummer, a.toevoeging].filter(Boolean).join(" ")}
              <br />
              {[a.postcode, a.plaats].filter(Boolean).join(" ")}
              {a.land ? <><br />{a.land}</> : null}
            </span>
          </div>
        )}
        {!inBehandeling && !alleenLezen && wijzigWat !== "contact" && (
          <WijzigLinkKnop label="Contactgegevens wijzigen" onClick={() => setWijzigWat("contact")} />
        )}
        {wijzigWat === "contact" && !alleenLezen && (
          <WijzigForm acc={acc} velden={CONTACT_VELDEN} titel="Contactgegevens wijzigen" onWijzigen={onWijzigen} onKlaar={sluit} />
        )}
      </div>

      {(acc.relatiebeheerder || acc.accountant) && (
        <div className="kp-grid-2" style={{ gap: 16, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
          <PersoonRegel label="Relatiebeheerder" persoon={acc.relatiebeheerder} />
          <PersoonRegel label="Accountant" persoon={acc.accountant} />
        </div>
      )}

      {inBehandeling && (
        <div style={{ marginTop: 16, padding: "10px 12px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, color: KLEUR.tekst, display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={14} color={KLEUR.blauw} /> Je wijziging is ingediend en wacht op goedkeuring door Activaa.
        </div>
      )}
    </div>
  );
}

function TabGegevens({ data, verzoeken, onWijzigen, alleenLezen }) {
  const [zoek, setZoek] = useState("");
  const [openId, setOpenId] = useState(null);

  if (!data) return <Laadscherm />;
  if (data.accounts?.length === 0) return <LegeStaat tekst="Er zijn nog geen klantgegevens aan jouw account gekoppeld." />;

  // Alleen NAW-verzoeken (contactpersoon/bedrijfsadres) tellen hier mee — een openstaand
  // verzoek van een ander type (bijv. facturatiemodule-bedrijfsgegevens) mag deze sectie
  // niet blokkeren/badgen.
  const openVerzoeken = new Set(
    (verzoeken || []).filter((v) => v.status === "open" && (v.type || "naw") === "naw").map((v) => v.accountId)
  );

  const term = zoek.trim().toLowerCase();
  const lijst = data.accounts.filter((acc) =>
    !term ||
    [acc.klantnaam, String(acc.klantnummer ?? ""), acc.groepsnaam]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(term))
  );

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={16} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek op klantnummer, naam of groep…"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px",
            fontSize: 14, borderRadius: 10, border: `1px solid ${KLEUR.rand}`,
            outline: "none", color: KLEUR.tekst, background: "#fff",
          }}
        />
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        {lijst.length === 0 && (
          <div style={{ padding: "18px 16px", fontSize: 13, color: KLEUR.mutedTekst }}>
            Geen klanten gevonden voor “{zoek}”.
          </div>
        )}
        {lijst.map((acc, i) => {
          const open = openId === acc.accountId;
          return (
            <div key={acc.accountId} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
              <button
                onClick={() => setOpenId(open ? null : acc.accountId)}
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
                {openVerzoeken.has(acc.accountId) && (
                  <span title="Wijziging wacht op goedkeuring" style={{
                    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                    color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "3px 8px", flexShrink: 0,
                  }}>
                    <Clock size={11} /> In behandeling
                  </span>
                )}
                {acc.groepsnaam && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                    color: KLEUR.subtekst, background: "#F1F3EF", border: `1px solid ${KLEUR.rand}`,
                    borderRadius: 999, padding: "3px 9px", flexShrink: 0,
                  }}>
                    <Users size={12} color={KLEUR.mutedTekst} /> {acc.groepsnaam}
                  </span>
                )}
                <ChevronDown
                  size={16} color={KLEUR.mutedTekst}
                  style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}
                />
              </button>
              {open && (
                <KlantDetail
                  acc={acc}
                  verzoekStatus={openVerzoeken.has(acc.accountId) ? "open" : null}
                  onWijzigen={onWijzigen}
                  alleenLezen={alleenLezen}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Toont een SharePoint-document zonder het in een SharePoint-iframe te laden (dat blokkeert
// SharePoint via 'frame-ancestors', en een login binnen een iframe kan niet). In plaats daarvan
// halen we de bytes server-side via Microsoft Graph op (on-behalf-of, met de échte permissies
// van de ingelogde klant) en tonen die als blob. Geen anonieme deellink nodig.
function DocumentViewer({ url, driveId, itemId, formaat, titel }) {
  const [status, setStatus] = useState("laden"); // laden | klaar | fout
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    let actief = true;
    let gemaakteUrl = "";
    setStatus("laden");
    setBlobUrl("");
    (async () => {
      try {
        const token = await haalApiToken();
        const params = new URLSearchParams();
        if (url) params.set("url", url);
        if (driveId) params.set("driveId", driveId);
        if (itemId) params.set("itemId", itemId);
        if (formaat) params.set("formaat", formaat);
        const res = await fetch(`/api/document-inhoud?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text().catch(() => ""));
        const blob = await res.blob();
        if (!actief) return;
        gemaakteUrl = URL.createObjectURL(blob);
        setBlobUrl(gemaakteUrl);
        setStatus("klaar");
      } catch {
        if (actief) setStatus("fout");
      }
    })();
    return () => {
      actief = false;
      if (gemaakteUrl) URL.revokeObjectURL(gemaakteUrl);
    };
  }, [url, driveId, itemId, formaat]);

  if (status === "laden") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst, padding: "16px 4px" }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Document ophalen…
      </div>
    );
  }
  if (status === "fout") {
    return (
      <div style={{ fontSize: 12.5, color: KLEUR.rood, padding: "8px 0" }}>
        Het document kon niet worden geladen. Gebruik de knop “Openen” hierboven om het in een nieuw tabblad te bekijken.
      </div>
    );
  }
  return (
    <iframe title={titel} src={blobUrl} style={{ width: "100%", height: 460, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, background: "#fff" }} />
  );
}

// Inline documenten aanleveren: de klant kiest/sleept bestanden en die worden direct in zijn
// eigen SharePoint-map gezet (server-side, app-only) — geen apart venster meer nodig.
function DocumentAanleveren({ taakId, uploadLink }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | bezig | klaar | fout
  const [resultaat, setResultaat] = useState(null);
  const [sleep, setSleep] = useState(false);
  const inputRef = useRef(null);

  const voegToe = (lijst) => { setFiles((h) => [...h, ...Array.from(lijst || [])]); setStatus("idle"); setResultaat(null); };
  const kies = (e) => { voegToe(e.target.files); if (inputRef.current) inputRef.current.value = ""; };
  const verwijder = (i) => setFiles((h) => h.filter((_, idx) => idx !== i));
  const leesAlsDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

  const uploaden = async () => {
    if (files.length === 0) return;
    setStatus("bezig"); setResultaat(null);
    try {
      const bestanden = await Promise.all(files.map(async (f) => ({ naam: f.name, dataUrl: await leesAlsDataUrl(f) })));
      const res = await fetch("/api/document-aanleveren", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taakId, bestanden }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "");
      setResultaat(data.resultaat || []);
      setStatus(data.ok ? "klaar" : "fout");
      if (data.ok) setFiles([]);
    } catch {
      setStatus("fout");
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setSleep(true); }}
        onDragLeave={() => setSleep(false)}
        onDrop={(e) => { e.preventDefault(); setSleep(false); voegToe(e.dataTransfer.files); }}
        onClick={() => inputRef.current && inputRef.current.click()}
        style={{
          border: `1.5px dashed ${sleep ? KLEUR.blauw : KLEUR.rand}`,
          borderRadius: 12,
          padding: "28px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: sleep ? KLEUR.lichtblauw : "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(28,35,33,0.16)",
          }}
        >
          <Upload size={18} color={KLEUR.tekst} />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); inputRef.current && inputRef.current.click(); }}
          style={{ padding: "9px 18px", background: KLEUR.tekst, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Bestanden uploaden
        </button>
        <input ref={inputRef} type="file" multiple onChange={kies} style={{ display: "none" }} />
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.tekst }}>
              <FileText size={13} color={KLEUR.mutedTekst} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ color: KLEUR.mutedTekst, fontSize: 11.5 }}>{Math.max(1, Math.round(f.size / 1024))} kB</span>
              {status !== "bezig" && (
                <button onClick={(e) => { e.stopPropagation(); verwijder(i); }} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>
          ))}
          <button onClick={uploaden} disabled={status === "bezig"} style={{ alignSelf: "flex-start", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#2E7D46", color: "#fff", border: "none", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            {status === "bezig" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={13} />}
            {status === "bezig" ? "Aanleveren…" : `Aanleveren (${files.length})`}
          </button>
        </div>
      )}

      {status === "klaar" && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: "#2E7D46", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} /> Documenten aangeleverd. Bedankt!
        </div>
      )}
      {status === "fout" && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: KLEUR.rood }}>
          Aanleveren is niet (helemaal) gelukt.
          {Array.isArray(resultaat) && resultaat.some((r) => !r.ok) && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {resultaat.filter((r) => !r.ok).map((r, i) => <li key={i}>{r.naam}: {r.error}</li>)}
            </ul>
          )}
          {uploadLink && (
            <div style={{ marginTop: 4 }}>
              Lukt het niet? <a href={uploadLink} target="_blank" rel="noopener noreferrer" style={{ color: KLEUR.blauw }}>Open de uploadpagina</a>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// DocuSign-achtig onderteken-paneel: naam, e-mail, toelichting en een getekende handtekening.
function HandtekeningPaneel({ taak, voorinvul, onOndertekenen, onNietAkkoord }) {
  const canvasRef = useRef(null);
  const tekentRef = useRef(false);
  const [heeftHandtekening, setHeeftHandtekening] = useState(false);
  const [naam, setNaam] = useState(voorinvul?.naam || "");
  const [email, setEmail] = useState(voorinvul?.email || "");
  const [toelichting, setToelichting] = useState("");
  const [status, setStatus] = useState("invoer"); // invoer | versturen | fout

  const positie = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - r.left) * (c.width / r.width), y: (clientY - r.top) * (c.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); tekentRef.current = true; const ctx = canvasRef.current.getContext("2d"); const p = positie(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const beweeg = (e) => {
    if (!tekentRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = positie(e);
    ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#1C2321"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    setHeeftHandtekening(true);
  };
  const stop = () => { tekentRef.current = false; };
  const wissen = () => { const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setHeeftHandtekening(false); };

  const verstuur = async () => {
    if (!naam.trim() || !heeftHandtekening || status === "versturen") return;
    setStatus("versturen");
    try {
      const handtekening = canvasRef.current.toDataURL("image/png");
      await onOndertekenen(taak.id, { naam: naam.trim(), email: email.trim(), toelichting: toelichting.trim(), handtekening });
    } catch {
      setStatus("fout");
      return;
    }
    setStatus("invoer");
  };

  const label = { fontSize: 12, fontWeight: 700, color: KLEUR.tekst, marginBottom: 4, display: "block" };
  const input = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 9, fontSize: 13, fontFamily: "inherit", marginBottom: 12 };

  return (
    <div style={{ marginTop: 12, padding: 14, background: "#FAFBF9", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
      <label style={label}>Naam</label>
      <input style={input} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" />
      <label style={label}>E-mailadres</label>
      <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
      <label style={label}>Toelichting (optioneel)</label>
      <textarea style={{ ...input, resize: "vertical" }} rows={2} value={toelichting} onChange={(e) => setToelichting(e.target.value)} placeholder="Eventuele opmerkingen…" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={label}>Handtekening (nodig om te ondertekenen — teken met muis of vinger)</label>
        <button onClick={wissen} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: KLEUR.mutedTekst }}>Wissen</button>
      </div>
      <canvas
        ref={canvasRef}
        width={520}
        height={150}
        onMouseDown={start} onMouseMove={beweeg} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={beweeg} onTouchEnd={stop}
        style={{ width: "100%", height: 150, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, touchAction: "none", cursor: "crosshair" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          onClick={verstuur}
          disabled={!naam.trim() || !heeftHandtekening || status === "versturen"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: (naam.trim() && heeftHandtekening) ? "#2E7D46" : "#9BBFA6", color: "#fff", border: "none", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: (naam.trim() && heeftHandtekening && status !== "versturen") ? "pointer" : "not-allowed" }}
        >
          <CheckCircle2 size={14} /> {status === "versturen" ? "Bezig…" : "Akkoord — ondertekenen"}
        </button>
        <button
          onClick={() => onNietAkkoord()}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          <XCircle size={14} /> Niet akkoord
        </button>
      </div>
      {status === "fout" && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 8 }}>Ondertekenen is niet gelukt. Probeer het opnieuw.</div>}
      <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 8, lineHeight: 1.5 }}>
        Voor akkoord is een handtekening verplicht; voor "Niet akkoord" niet. Door te ondertekenen bevestig je deze reactie. We leggen daarbij je naam, e-mailadres, handtekening, het tijdstip en je IP-adres vast als bewijs.
      </div>
    </div>
  );
}

// Haalt naam + e-mailadres uit de EasyAuth-principal, om het onderteken-formulier
// vast voor de klant in te vullen.
function leidGebruikerAf(gebruiker) {
  if (!gebruiker) return { naam: "", email: "" };
  const claims = Array.isArray(gebruiker.claims) ? gebruiker.claims : [];
  const claim = (...types) => {
    for (const t of types) {
      const c = claims.find((x) => x && (x.typ === t || x.type === t));
      if (c && c.val) return c.val;
    }
    return "";
  };
  const naam =
    claim("name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") ||
    [claim("given_name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"),
     claim("family_name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname")]
      .filter(Boolean).join(" ").trim();
  const email =
    claim("email", "emails", "preferred_username",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") ||
    (gebruiker.userDetails && gebruiker.userDetails.includes("@") ? gebruiker.userDetails : "");
  return { naam: naam || "", email: email || "" };
}

function TabTaken({ data, gebruiker, onAkkoord, onNietAkkoord, onOndertekenen, alleenLezen }) {
  const [bevestigId, setBevestigId] = useState(null);
  const [afwijzenId, setAfwijzenId] = useState(null);
  const [afwijzenTekst, setAfwijzenTekst] = useState("");
  const [archiefOpen, setArchiefOpen] = useState(false);
  const [uitgeklapt, setUitgeklapt] = useState({});
  if (!data) return <Laadscherm />;

  // Backward-compat: als er onverhoopt nog een array binnenkomt, behandel die als groepen.
  const groepen = Array.isArray(data) ? data : data.groepen || [];
  const akkoorden = Array.isArray(data) ? [] : data.akkoorden || [];
  // Voorinvulling van het onderteken-formulier: naam + e-mail komen bij voorkeur uit de backend
  // (Dynamics-contact / token-weergavenaam); anders uit de EasyAuth-principal aan de voorkant.
  const backendGebruiker = (!Array.isArray(data) && data.gebruiker) || {};
  const principalAfgeleid = leidGebruikerAf(gebruiker);
  const voorinvul = {
    naam: backendGebruiker.naam || principalAfgeleid.naam || "",
    email: backendGebruiker.email || principalAfgeleid.email || "",
  };
  // Alleen groepen met taken tonen (soorten zijn nu gefilterd, veel accounts hebben er geen).
  const groepenMetTaken = groepen.filter((g) => g.taken.length > 0);
  const totaalOpen = groepenMetTaken.reduce((som, groep) => som + groep.taken.length, 0);

  return (
    <div>
      {totaalOpen === 0 ? (
        <LegeStaat tekst="Geen taken die op je reactie wachten — helemaal bij." />
      ) : (
        groepenMetTaken.map((groep) => (
          <div key={groep.accountId} style={kaartStijl}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{groep.klantnaam}</div>
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Klantnummer {groep.klantnummer}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {groep.taken.map((taak) => {
                const idle = bevestigId !== taak.id && afwijzenId !== taak.id;
                // Taken die ondertekend moeten worden staan standaard ingeklapt; de klant
                // vouwt ze zelf open om het document te bekijken en te ondertekenen.
                const isTekentaak = taak.vereistHandtekening;
                const open = !isTekentaak || !!uitgeklapt[taak.id];
                const toggleOpen = () => setUitgeklapt((v) => ({ ...v, [taak.id]: !v[taak.id] }));
                return (
                <div key={taak.id} style={{ padding: "12px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div
                      onClick={isTekentaak ? toggleOpen : undefined}
                      style={{ flex: 1, minWidth: 0, cursor: isTekentaak ? "pointer" : "default" }}
                    >
                      {taak.soort && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 6, padding: "2px 9px", background: KLEUR.lichtblauw, color: KLEUR.blauw, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                          <Tag size={11} /> {taak.soort}
                        </span>
                      )}
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{taak.titel}</div>
                      {taak.omschrijving && <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginTop: 2, whiteSpace: "pre-wrap" }}>{taak.omschrijving}</div>}
                      {taak.deadline && (
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                          Deadline: {new Date(taak.deadline).toLocaleDateString("nl-NL")}
                        </div>
                      )}
                      {isTekentaak && !open && (
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                          Ondertekening vereist — klik om te openen.
                        </div>
                      )}
                    </div>
                    {isTekentaak && (
                      <button
                        onClick={toggleOpen}
                        aria-expanded={open}
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, padding: "8px 14px", background: open ? "#fff" : "#2E7D46", color: open ? KLEUR.subtekst : "#fff", border: open ? `1px solid ${KLEUR.rand}` : "none", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        <ChevronDown size={14} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                        {open ? "Inklappen" : "Bekijken & ondertekenen"}
                      </button>
                    )}
                    {taak.kanAkkoord && !taak.vereistHandtekening && idle && !alleenLezen && (
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => { setAfwijzenId(null); setBevestigId(taak.id); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#2E7D46", color: "#fff", border: "none", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          <CheckCircle2 size={14} /> Akkoord geven
                        </button>
                        <button
                          onClick={() => { setBevestigId(null); setAfwijzenTekst(""); setAfwijzenId(taak.id); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}`, borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          Niet akkoord
                        </button>
                      </div>
                    )}
                  </div>

                  {taak.uploadLink && !alleenLezen && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginTop: 12 }}>Documenten aanleveren</div>
                      <DocumentAanleveren taakId={taak.id} uploadLink={taak.uploadLink} />
                      {taak.uploadVerloopt && (
                        <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                          Aanleveren kan tot {new Date(taak.uploadVerloopt).toLocaleDateString("nl-NL")}
                        </div>
                      )}
                    </>
                  )}
                  {taak.uploadLink && alleenLezen && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                      Bestanden aanleveren is niet beschikbaar tijdens meekijken als klant.
                    </div>
                  )}

                  {taak.documentUrl && open && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst }}>Document</div>
                        <a href={taak.documentUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: KLEUR.blauw, textDecoration: "none" }}>
                          <ExternalLink size={12} /> Openen
                        </a>
                      </div>
                      <DocumentViewer url={taak.documentUrl} titel={taak.titel} />
                    </div>
                  )}

                  {taak.vereistHandtekening && open && afwijzenId !== taak.id && !alleenLezen && (
                    <HandtekeningPaneel
                      taak={taak}
                      voorinvul={voorinvul}
                      onOndertekenen={onOndertekenen}
                      onNietAkkoord={() => { setBevestigId(null); setAfwijzenTekst(""); setAfwijzenId(taak.id); }}
                    />
                  )}

                  {taak.kanAkkoord && bevestigId === taak.id && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Weet je zeker dat je akkoord geeft?</span>
                      <button onClick={() => { setBevestigId(null); onAkkoord(taak.id); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#2E7D46", color: "#fff", border: "none", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <CheckCircle2 size={14} /> Ja, akkoord
                      </button>
                      <button onClick={() => setBevestigId(null)} style={{ padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        Annuleren
                      </button>
                    </div>
                  )}

                  {(taak.kanAkkoord || taak.vereistHandtekening) && afwijzenId === taak.id && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 6 }}>
                        Geef aan waarom je niet akkoord gaat — dit bericht gaat naar Activaa.
                      </div>
                      <textarea value={afwijzenTekst} onChange={(e) => setAfwijzenTekst(e.target.value)} rows={3} placeholder="Je toelichting…" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button disabled={!afwijzenTekst.trim()} onClick={() => { const t = afwijzenTekst.trim(); setAfwijzenId(null); setAfwijzenTekst(""); onNietAkkoord(taak.id, t); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: afwijzenTekst.trim() ? KLEUR.rood : "#C9A3A3", color: "#fff", border: "none", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: afwijzenTekst.trim() ? "pointer" : "not-allowed" }}>
                          <Send size={13} /> Versturen
                        </button>
                        <button onClick={() => { setAfwijzenId(null); setAfwijzenTekst(""); }} style={{ padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          Annuleren
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {akkoorden.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setArchiefOpen((v) => !v)}
            aria-expanded={archiefOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0,
              background: "none", border: "none", cursor: "pointer", marginBottom: archiefOpen ? 10 : 0,
              fontSize: 13, fontWeight: 700, color: KLEUR.subtekst, textAlign: "left",
            }}
          >
            <ChevronDown
              size={16}
              style={{ transform: archiefOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}
            />
            Akkoord gegeven
            <span style={{ fontWeight: 600, color: KLEUR.mutedTekst }}>({akkoorden.length})</span>
          </button>
          {archiefOpen && (
            <div style={kaartStijl}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {akkoorden.map((a, i) => {
                  const nietAkkoord = a.beslissing === "niet_akkoord";
                  return (
                    <div key={a.id || a.taakId} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
                      {nietAkkoord
                        ? <XCircle size={16} color={KLEUR.rood} style={{ marginTop: 2, flexShrink: 0 }} />
                        : <CheckCircle2 size={16} color="#2E7D46" style={{ marginTop: 2, flexShrink: 0 }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {a.taaktitel || "(taak)"}
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: nietAkkoord ? KLEUR.rood : "#2E7D46" }}>
                            {nietAkkoord ? "Niet akkoord" : "Akkoord"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 2 }}>
                          {a.klantnaam ? a.klantnaam + " · " : ""}
                          {new Date(a.akkoordOp).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                          {a.aanvragerEmail ? " · door " + a.aanvragerEmail : ""}
                        </div>
                        {nietAkkoord && a.bericht && (
                          <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 3, whiteSpace: "pre-wrap" }}>
                            “{a.bericht}”
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Bestandstypen: direct te tonen (pdf/afbeelding) of eerst door Graph naar PDF laten omzetten (Office).
const NATIEF_PREVIEW = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "txt"];
const OFFICE_PREVIEW = ["doc", "docx", "dot", "dotx", "ppt", "pptx", "pot", "potx", "xls", "xlsx", "xlsm", "rtf", "odt", "odp", "ods"];
function bestandsExtensie(naam) {
  const punt = (naam || "").lastIndexOf(".");
  return punt > -1 ? naam.slice(punt + 1).toLowerCase() : "";
}
function isPreviewbaar(naam) {
  const ext = bestandsExtensie(naam);
  return NATIEF_PREVIEW.includes(ext) || OFFICE_PREVIEW.includes(ext);
}
function previewFormaat(naam) {
  return OFFICE_PREVIEW.includes(bestandsExtensie(naam)) ? "pdf" : "";
}

/* ── Dossiers (fiscale dossiers uit Dynamics: Inkomstenbelasting / Vennootschapsbelasting) ── */

function dossierPeriode(d) {
  if (d.jaar != null && d.jaar !== "") return `Aangifte ${d.jaar}`;
  if (d.begindatum || d.einddatum) {
    const jr = (x) => (x ? new Date(x).getFullYear() : "");
    const van = jr(d.begindatum);
    const tot = jr(d.einddatum);
    if (van && tot && van !== tot) return `Boekjaar ${van}–${tot}`;
    return `Boekjaar ${van || tot || ""}`.trim();
  }
  return d.soortLabel || "Dossier";
}

function dossierBehandelaar(d) {
  const delen = [];
  if (d.accountant) delen.push(`Accountant: ${d.accountant}`);
  if (d.assistent) delen.push(`Assistent: ${d.assistent}`);
  return delen.join("  ·  ");
}

function DossierRij({ dossier: d, eerste }) {
  return (
    <div style={{ padding: "14px 18px", borderTop: eerste ? "none" : `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {dossierPeriode(d)}
            {d.klantnaam ? <span style={{ fontWeight: 500, color: KLEUR.subtekst }}> — {d.klantnaam}</span> : null}
          </div>
          {dossierBehandelaar(d) && (
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 2 }}>{dossierBehandelaar(d)}</div>
          )}
        </div>
        {d.statusLabel && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 20, padding: "4px 11px", whiteSpace: "nowrap" }}>
            {d.statusLabel}
          </span>
        )}
      </div>
      {d.reviewNotitie && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "#FBF6EC", border: `1px solid ${KLEUR.goud}44`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.goud, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>Opmerking van je accountant</div>
          <div style={{ fontSize: 13, color: KLEUR.tekst }} dangerouslySetInnerHTML={{ __html: d.reviewNotitie }} />
        </div>
      )}
      {d.reactie && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>Jouw reactie</div>
          <div style={{ fontSize: 13, color: KLEUR.tekst }} dangerouslySetInnerHTML={{ __html: d.reactie }} />
        </div>
      )}
      {d.documentUrl && (
        <a href={d.documentUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 600, color: KLEUR.blauw, textDecoration: "none" }}>
          <ExternalLink size={13} /> Documenten bekijken
        </a>
      )}
    </div>
  );
}

function TabDossiers() {
  const [status, setStatus] = useState("laden"); // laden | klaar | fout
  const [dossiers, setDossiers] = useState([]);

  useEffect(() => {
    let actief = true;
    fetch("/api/dossiers")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (actief) { setDossiers(d.dossiers || []); setStatus("klaar"); } })
      .catch(() => { if (actief) setStatus("fout"); });
    return () => { actief = false; };
  }, []);

  if (status === "laden") {
    return (
      <div style={{ ...kaartStijl, display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13 }}>
        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Dossiers ophalen…
      </div>
    );
  }
  if (status === "fout") {
    return <div style={{ ...kaartStijl, textAlign: "center", padding: 32, color: KLEUR.rood, fontSize: 13.5 }}>Er ging iets mis bij het ophalen van je dossiers. Probeer het later opnieuw.</div>;
  }
  if (dossiers.length === 0) {
    return <div style={{ ...kaartStijl, textAlign: "center", padding: 36, color: KLEUR.mutedTekst, fontSize: 13.5 }}>Je hebt op dit moment geen fiscale dossiers in het portaal.</div>;
  }

  const perSoort = [];
  dossiers.forEach((d) => {
    let groep = perSoort.find((g) => g.label === d.soortLabel);
    if (!groep) { groep = { label: d.soortLabel, items: [] }; perSoort.push(groep); }
    groep.items.push(d);
  });

  return (
    <div>
      {perSoort.map((groep) => (
        <div key={groep.label} style={{ marginBottom: 28 }}>
          <Kopje tekst={groep.label} />
          <div style={{ ...kaartStijl, padding: 0, overflow: "hidden" }}>
            {groep.items.map((d, i) => <DossierRij key={d.id || i} dossier={d} eerste={i === 0} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabDocumenten({ status, data, foutmelding, pad = [], onOphalen, onOpenMap, onNavigeer, onLabelWijzigen, onEntiteitWijzigen }) {
  const [previewId, setPreviewId] = useState(null); // id van het bestand waarvan de preview openstaat
  if (status === "nietOpgehaald") {
    return (
      <div style={{ ...kaartStijl, textAlign: "center", padding: 36 }}>
        <FileText size={26} color={KLEUR.blauw} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, marginBottom: 16 }}>
          Je documenten worden opgehaald uit SharePoint, op basis van wat er met jou is gedeeld.
        </div>
        <button onClick={onOphalen} style={knopStijlPrimair}>
          <RefreshCw size={14} /> Documenten ophalen
        </button>
      </div>
    );
  }

  if (status === "laden") return <Laadscherm />;

  if (status === "inlogprobleem") {
    return (
      <div style={{ ...kaartStijl, textAlign: "center", padding: 36 }}>
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
          {foutmelding}
        </div>
        <button onClick={onOphalen} style={knopStijlPrimair}><RefreshCw size={14} /> Opnieuw proberen</button>
      </div>
    );
  }

  if (status === "fout") {
    return (
      <div style={{ ...kaartStijl, textAlign: "center", padding: 36 }}>
        <div style={{ fontSize: 13.5, color: KLEUR.rood, marginBottom: 16 }}>Ophalen is niet gelukt.</div>
        <button onClick={onOphalen} style={knopStijlPrimair}><RefreshCw size={14} /> Opnieuw proberen</button>
      </div>
    );
  }

  const items = data || [];
  const inMap = pad.length > 0;
  // Wortel én leeg = er is niets gedeeld. In een submap tonen we wel de breadcrumb.
  if (!inMap && items.length === 0) {
    return <LegeStaat tekst="Er is nog niets met jou gedeeld in SharePoint." />;
  }

  const kruimelStijl = (klikbaar) => ({
    background: "none", border: "none", padding: 0, cursor: klikbaar ? "pointer" : "default",
    fontSize: 12.5, fontWeight: klikbaar ? 600 : 700,
    color: klikbaar ? KLEUR.blauw : KLEUR.tekst,
  });

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", minWidth: 0 }}>
          <button onClick={() => onNavigeer(-1)} style={kruimelStijl(inMap)} disabled={!inMap}>Documenten</button>
          {pad.map((p, i) => (
            <span key={p.itemId} style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <span style={{ color: KLEUR.mutedTekst }}>›</span>
              <button
                onClick={() => onNavigeer(i)}
                style={{ ...kruimelStijl(i < pad.length - 1), maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                disabled={i === pad.length - 1}
                title={p.naam}
              >
                {p.naam}
              </button>
            </span>
          ))}
        </div>
        <button onClick={onOphalen} style={{ ...knopStijlSecundair, fontSize: 12 }}><RefreshCw size={12} /> Vernieuwen</button>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "8px 0" }}>Deze map is leeg.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((item) => {
            const isMap = item.type === "map";
            const kanPreview = !isMap && isPreviewbaar(item.naam) && item.driveId && item.itemId;
            const previewOpen = previewId === item.id;
            return (
              <React.Fragment key={item.id}>
              <div className="kp-doc-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                {isMap ? <Folder size={16} color={KLEUR.goud} style={{ flexShrink: 0 }} /> : <FileText size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} />}
                <div className="kp-doc-name" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isMap ? (
                      <button
                        onClick={() => onOpenMap(item)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}
                        title={`Map openen: ${item.label}`}
                      >
                        {item.label}
                      </button>
                    ) : (
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
                    )}
                    {item.entiteit && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>
                        {item.entiteit}
                      </span>
                    )}
                  </div>
                  {isMap
                    ? item.aantalItems != null && (
                        <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{item.aantalItems} item{item.aantalItems === 1 ? "" : "s"}</div>
                      )
                    : item.label !== item.naam && (
                        <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Oorspronkelijke naam: {item.naam}</div>
                      )}
                </div>
                {item.gewijzigd && (
                  <div className="kp-doc-date" style={{ fontSize: 11.5, color: KLEUR.mutedTekst, flexShrink: 0 }}>
                    {new Date(item.gewijzigd).toLocaleDateString("nl-NL")}
                  </div>
                )}
                {isMap ? (
                  <button onClick={() => onOpenMap(item)} title="Map openen" style={iconKnopStijl}>
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <>
                    {kanPreview && (
                      <button onClick={() => setPreviewId(previewOpen ? null : item.id)} title={previewOpen ? "Preview sluiten" : "Bekijken"} style={{ ...iconKnopStijl, color: previewOpen ? KLEUR.blauw : iconKnopStijl.color }}>
                        <Eye size={14} />
                      </button>
                    )}
                    <button onClick={() => onEntiteitWijzigen(item.id, item.entiteit)} title="Aan klant koppelen" style={iconKnopStijl}>
                      <Building2 size={14} />
                    </button>
                    <button onClick={() => onLabelWijzigen(item.id, item.label)} title="Eigen naam geven" style={iconKnopStijl}>
                      <Tag size={14} />
                    </button>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" title="Openen in SharePoint" style={iconKnopStijl}>
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </>
                )}
              </div>
              {previewOpen && kanPreview && (
                <div style={{ padding: "0 0 12px" }}>
                  <DocumentViewer driveId={item.driveId} itemId={item.itemId} formaat={previewFormaat(item.naam)} titel={item.label || item.naam} />
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabReview({ onVerzenden, alleenLezen }) {
  const [sterren, setSterren] = useState(0);
  const [hoverSterren, setHoverSterren] = useState(0);
  const [opmerking, setOpmerking] = useState("");
  const [status, setStatus] = useState("invoer"); // invoer | versturen | verzonden | fout
  const [resultaat, setResultaat] = useState(null);

  const versturen = async () => {
    if (sterren === 0) return;
    setStatus("versturen");
    try {
      const res = await onVerzenden(sterren, opmerking);
      setResultaat(res);
      setStatus("verzonden");
    } catch {
      setStatus("fout");
    }
  };

  if (status === "verzonden" && resultaat?.doorsturenNaarGoogle) {
    return (
      <div style={{ ...kaartStijl, textAlign: "center", padding: 36 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 14 }}>
          {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={22} fill={KLEUR.goud} color={KLEUR.goud} />)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Wat fijn om te horen!</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
          Zou je dit ook willen delen als review op Google?
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <a href={resultaat.googleReviewUrl} target="_blank" rel="noopener noreferrer" style={knopStijlPrimair}>
            <ExternalLink size={14} /> Ja, graag
          </a>
          <button onClick={() => setStatus("verzondenZonderGoogle")} style={knopStijlSecundair}>
            Liever niet
          </button>
        </div>
      </div>
    );
  }

  if (status === "verzondenZonderGoogle" || (status === "verzonden" && !resultaat?.doorsturenNaarGoogle)) {
    return (
      <div style={{ ...kaartStijl, textAlign: "center", padding: 36 }}>
        <CheckCircle2 size={24} color={KLEUR.blauw} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Bedankt voor je feedback</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst }}>
          {resultaat?.doorsturenNaarGoogle
            ? "Geen probleem — fijn dat je de tijd hebt genomen om te reageren."
            : "We hebben dit intern opgepakt en nemen zo nodig contact met je op."}
        </div>
      </div>
    );
  }

  return (
    <div style={kaartStijl}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Hoe tevreden ben je over ons?</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>Jouw mening helpt ons verbeteren.</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            onClick={() => setSterren(i)}
            onMouseEnter={() => setHoverSterren(i)}
            onMouseLeave={() => setHoverSterren(0)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
            aria-label={`${i} sterren`}
          >
            <Star
              size={30}
              fill={i <= (hoverSterren || sterren) ? KLEUR.goud : "none"}
              color={i <= (hoverSterren || sterren) ? KLEUR.goud : KLEUR.rand}
            />
          </button>
        ))}
      </div>

      <textarea
        value={opmerking}
        onChange={(e) => setOpmerking(e.target.value)}
        placeholder="Wil je verder nog iets toelichten? (optioneel)"
        rows={4}
        style={{
          width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10,
          fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 16, boxSizing: "border-box",
        }}
      />

      <button
        onClick={versturen}
        disabled={sterren === 0 || status === "versturen" || alleenLezen}
        title={alleenLezen ? "Niet beschikbaar tijdens meekijken als klant" : undefined}
        style={{ ...knopStijlPrimair, opacity: (sterren === 0 || alleenLezen) ? 0.5 : 1, cursor: alleenLezen ? "not-allowed" : "pointer" }}
      >
        <Send size={14} /> {status === "versturen" ? "Versturen..." : "Verstuur review"}
      </button>

      {status === "fout" && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: KLEUR.rood }}>
          Versturen is niet gelukt, probeer het nog eens.
        </div>
      )}
    </div>
  );
}

function LegeStaat({ tekst }) {
  return (
    <div style={{ ...kaartStijl, textAlign: "center", padding: 36, color: KLEUR.mutedTekst, fontSize: 13.5 }}>
      <CheckCircle2 size={22} style={{ marginBottom: 8 }} />
      <div>{tekst}</div>
    </div>
  );
}

const knopStijlPrimair = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px",
  background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7,
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const knopStijlSecundair = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
  background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 6,
  fontWeight: 600, cursor: "pointer",
};

const iconKnopStijl = {
  display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
  border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.subtekst,
  cursor: "pointer", flexShrink: 0, textDecoration: "none",
};
