import React, { useCallback, useEffect, useState } from "react";
import OffertetoolApp from "../medewerker/offertes/OffertetoolApp";
import UitvraagBeheer from "./UitvraagBeheer";
import UrenTarievenBeheer from "./UrenTarievenBeheer";
import { Building2, Loader2, LogOut, ShieldAlert, Upload, CheckCircle2, Trash2, Send, Users, LayoutGrid, ExternalLink, Search, ArrowUp, ArrowDown, HelpCircle, ChevronDown, Plus, Pencil, Check, X, Clock } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
};

// De vier vaste BTW-categorieën (moet overeenkomen met de CHECK-constraint in de database).
const BTW_CODES = [
  ["nul", "Nultarief"],
  ["laag", "Laag tarief"],
  ["hoog", "Hoog tarief"],
  ["vrijgesteld", "Vrijgesteld van btw"],
];

// Basis-kolommen van het klantoverzicht (moet overeenkomen met BASIS_KOLOMMEN in het medewerkersportaal).
const KLANTOVERZICHT_BASIS = [
  ["klantnummer", "Cliëntnr"], ["klantnaam", "Cliëntnaam"], ["groepsnaam", "Groep"], ["kantoor", "Kantoor"],
  ["team", "Team"], ["clienttype", "Cliënttype"], ["contact", "Contactpersoon"], ["manager", "Manager"],
  ["accountant", "Accountant"], ["assistent", "Assistent"], ["fiscaalMedewerker", "Fiscaal medew."],
  ["loonadministratie", "Loonadmin."], ["belastingkantoor", "Belastingkantoor"], ["sharepoint", "SharePoint"], ["status", "Status"],
];

// De vaste keuzes voor "hoeveel regels wil ik zien". Overal in het portaal dezelfde reeks, en
// overal 25 als startwaarde — een beheerscherm opent zo altijd snel, ook bij duizenden regels.
const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];
const AANTAL_STANDAARD = 25;

/**
 * Regelaantal-kiezer onder een lijst: links "x van y getoond", rechts de keuzeknoppen.
 * Eén component voor alle lijsten in het beheersportaal, zodat ze zich hetzelfde gedragen en er
 * hetzelfde uitzien — en zodat een wijziging aan de reeks niet op zeven plekken hoeft.
 */
function AantalKiezer({ aantal, setAantal, totaal, extraTekst }) {
  const getoond = Math.min(aantal === Infinity ? totaal : aantal, totaal);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
        {getoond} van {totaal} getoond{extraTekst ? ` · ${extraTekst}` : ""}
      </div>
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

/** Eén aan/uit-schakelaar met kolomlabel, voor de tabel "Betaalde functionaliteiten". */
function ModuleToggle({ label, aan, bezig, uitgeschakeld, titel, onClick }) {
  const dood = bezig || uitgeschakeld;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 74 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "center", lineHeight: 1.1 }}>{label}</span>
      <button
        onClick={onClick}
        disabled={dood}
        title={titel}
        style={{
          position: "relative", width: 40, height: 22, borderRadius: 20, border: "none", cursor: dood ? "default" : "pointer",
          background: aan ? KLEUR.blauw : KLEUR.rand, opacity: dood ? (uitgeschakeld ? 0.45 : 0.6) : 1, transition: "background .15s",
        }}
      >
        <span style={{ position: "absolute", top: 2, left: aan ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s" }} />
      </button>
    </div>
  );
}

/** Filtert taaksoorten op de zoekterm — op één plek, zodat de lijst en de teller niet uiteenlopen. */
function filterTaaksoorten(opties, zoek) {
  const q = (zoek || "").trim().toLowerCase();
  return (opties || []).filter((o) => (o.label || "").toLowerCase().includes(q));
}

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

// Eén rij van de BTW-tarieven-tabel, als invoerformulier (voor zowel "nieuw tarief" als het
// bewerken van een bestaand tarief). De code is alleen bij een nieuw tarief te kiezen — een
// bestaand tarief corrigeren verandert nooit de categorie, alleen label/percentage/data's.
function BtwTariefFormulierRij({ form, setForm, bezig, onOpslaan, onAnnuleren, borderTop, nieuw }) {
  const zet = (k) => (e) => setForm((h) => ({ ...h, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 100px 120px 120px 90px", gap: 6, padding: "8px 12px", borderTop: borderTop ?? "none", alignItems: "center", background: KLEUR.lichtblauw }}>
      {nieuw ? (
        <select value={form.code} onChange={zet("code")} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, background: "#fff" }}>
          {BTW_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{BTW_CODES.find(([c]) => c === form.code)?.[1] || form.code}</div>
      )}
      <input value={form.label} onChange={zet("label")} placeholder={BTW_CODES.find(([c]) => c === form.code)?.[1] || ""} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <input type="number" step="0.01" value={form.percentage} onChange={zet("percentage")} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <input type="date" value={form.geldigVanaf} onChange={zet("geldigVanaf")} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <input type="date" value={form.geldigTot} onChange={zet("geldigTot")} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onOpslaan} disabled={bezig} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Opslaan"><Check size={15} /></button>
        <button onClick={onAnnuleren} disabled={bezig} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }} title="Annuleren"><X size={15} /></button>
      </div>
    </div>
  );
}

// Eén rij van de standaardartikelen-tabel, als invoerformulier (voor zowel "nieuw" als
// "bewerken" — het onderliggende artikel/nieuw-status bepaalt de aanroeper).
function StandaardartikelFormulierRij({ form, setForm, bezig, onOpslaan, onAnnuleren, borderTop }) {
  const zet = (k) => (e) => setForm((h) => ({ ...h, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px 90px", gap: 6, padding: "8px 12px", borderTop: borderTop ?? "none", alignItems: "center", background: KLEUR.lichtblauw }}>
      <input value={form.omschrijving} onChange={zet("omschrijving")} placeholder="Omschrijving" style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <input value={form.eenheid} onChange={zet("eenheid")} placeholder="uur, maand, ..." style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <input type="number" step="0.01" value={form.prijs} onChange={zet("prijs")} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" }} />
      <select value={form.btwCode} onChange={zet("btwCode")} style={{ padding: "6px 8px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 12.5, background: "#fff" }}>
        {BTW_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      <div />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onOpslaan} disabled={bezig} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Opslaan"><Check size={15} /></button>
        <button onClick={onAnnuleren} disabled={bezig} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }} title="Annuleren"><X size={15} /></button>
      </div>
    </div>
  );
}

export default function BeheerPortaal() {
  const [status, setStatus] = useState("laden"); // laden | nietIngelogd | geenRol | klaar
  const [gebruiker, setGebruiker] = useState(null);
  const [tab, setTab] = useState("uitstraling"); // uitstraling | content | faq | taken | instellingen
  // Open/dicht per rubriek-kaart (zelfde patroon als de taaksoorten-sectie onder "Taken");
  // undefined/true = open (standaard), false = ingeklapt. Eén gedeelde state i.p.v. een
  // aparte useState per rubriek.
  const [rubriekOpen, setRubriekOpen] = useState({});
  // Standaard dichtgeklapt — pas open na een expliciete klik door de beheerder.
  const rubriekIsOpen = (key) => rubriekOpen[key] === true;
  const toggleRubriek = (key) => setRubriekOpen((h) => ({ ...h, [key]: !rubriekIsOpen(key) }));
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [faviconUrl, setFaviconUrl] = useState("");
  const [faviconUploadStatus, setFaviconUploadStatus] = useState("idle"); // idle | bezig | gelukt | fout

  const [categorieen, setCategorieen] = useState(null); // null = laden, [] = geen/fout
  const [mededelingen, setMededelingen] = useState(null);
  const [nieuweTitel, setNieuweTitel] = useState("");
  const [nieuweTekst, setNieuweTekst] = useState("");
  const [gekozenCategorieen, setGekozenCategorieen] = useState([]);
  const [verzendStatus, setVerzendStatus] = useState("idle"); // idle | bezig | fout
  const [nieuweZichtbaarTot, setNieuweZichtbaarTot] = useState("");
  const [onbeperktZichtbaar, setOnbeperktZichtbaar] = useState(true); // "tot nader te bepalen"
  const [actieveMededelingenOpen, setActieveMededelingenOpen] = useState(true);
  const [verlopenMededelingenOpen, setVerlopenMededelingenOpen] = useState(false);
  // Mededeling bewerken (bestaande mededeling aanpassen, geen nieuwe versturen).
  const [mededelingBewerken, setMededelingBewerken] = useState(null); // id van mededeling die bewerkt wordt, of null
  const [bewerkTitel, setBewerkTitel] = useState("");
  const [bewerkTekst, setBewerkTekst] = useState("");
  const [bewerkCategorieen, setBewerkCategorieen] = useState([]);
  const [bewerkOnbeperkt, setBewerkOnbeperkt] = useState(true);
  const [bewerkZichtbaarTot, setBewerkZichtbaarTot] = useState("");
  const [bewerkMededelingStatus, setBewerkMededelingStatus] = useState("idle"); // idle | bezig | fout

  const [snellinks, setSnellinks] = useState(null);
  const [snellinksOpen, setSnellinksOpen] = useState(false);
  const [nieuweLinkTitel, setNieuweLinkTitel] = useState("");
  const [nieuweLinkUrl, setNieuweLinkUrl] = useState("");
  const [gekozenLinkCategorieen, setGekozenLinkCategorieen] = useState([]);
  const [linkVerzendStatus, setLinkVerzendStatus] = useState("idle"); // idle | bezig | fout

  const [faqs, setFaqs] = useState(null);
  const [nieuweVraag, setNieuweVraag] = useState("");
  const [nieuwAntwoord, setNieuwAntwoord] = useState("");
  const [gekozenFaqCategorieen, setGekozenFaqCategorieen] = useState([]);
  const [faqVerzendStatus, setFaqVerzendStatus] = useState("idle"); // idle | bezig | fout
  const [faqZoek, setFaqZoek] = useState("");
  // FAQ bewerken (bestaande vraag/antwoord aanpassen).
  const [faqBewerken, setFaqBewerken] = useState(null); // id van vraag die bewerkt wordt, of null
  const [bewerkVraag, setBewerkVraag] = useState("");
  const [bewerkAntwoord, setBewerkAntwoord] = useState("");
  const [bewerkFaqCategorieen, setBewerkFaqCategorieen] = useState([]);
  const [bewerkFaqStatus, setBewerkFaqStatus] = useState("idle"); // idle | bezig | fout

  const [wijzigingFormNawUrl, setWijzigingFormNawUrl] = useState("");
  const [wijzigingFormContactUrl, setWijzigingFormContactUrl] = useState("");
  const [formOpslaanStatus, setFormOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [teamsChatUrl, setTeamsChatUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [copilotEmbedUrl, setCopilotEmbedUrl] = useState("");
  const [linksOpslaanStatus, setLinksOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  // Rechtenniveau per medewerker (e-mail → 'manager'|'beheerder'; standaard = medewerker).
  const [niveaus, setNiveaus] = useState({});
  // Bulk-recht: lijst met e-mailadressen die bulk-aanpassingen mogen doen.
  const [bulk, setBulk] = useState([]);
  // Als-klant-recht: lijst met e-mailadressen die (alleen-lezen) mogen meekijken als klant.
  const [alsKlant, setAlsKlant] = useState([]);
  // Offertes-recht: lijst met e-mailadressen die offertes/opdrachtbevestigingen mogen maken.
  // Let op: leeg = niemand (net als bulk en als-klant); beheerders mogen altijd.
  const [offertes, setOffertes] = useState([]);
  const [wijzigrechtenStatus, setWijzigrechtenStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [medewerkers, setMedewerkers] = useState(null); // null = laden; alle Activaa-medewerkers
  const [medewerkerZoek, setMedewerkerZoek] = useState("");
  // Toegang tot het portaal via een Entra-groep. entraLeden is de set e-mailadressen die in de
  // gekozen groep zitten; daarmee kan de lijst hieronder per medewerker laten zien of hij
  // daadwerkelijk binnenkomt. null = nog niet geladen (dan tonen we geen conclusie, want
  // "niet gevonden" en "nog niet geladen" mogen er niet hetzelfde uitzien).
  const [entraGroepen, setEntraGroepen] = useState(null);
  const [entraGroepId, setEntraGroepId] = useState("");
  const [entraLeden, setEntraLeden] = useState(null);
  const [entraFout, setEntraFout] = useState("");
  const [entraStatus, setEntraStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [inzageLog, setInzageLog] = useState(null); // null = laden; audit-log "meekijken als klant"
  const [inzageLogZoek, setInzageLogZoek] = useState("");
  const [inzageLogToonAantal, setInzageLogToonAantal] = useState(AANTAL_STANDAARD);
  // Regelaantal per lijst — elke lijst heeft zijn eigen keuze, zodat het instellen van de ene
  // lijst de andere niet omgooit.
  const [medewerkerToonAantal, setMedewerkerToonAantal] = useState(AANTAL_STANDAARD);
  const [faqToonAantal, setFaqToonAantal] = useState(AANTAL_STANDAARD);
  const [btwToonAantal, setBtwToonAantal] = useState(AANTAL_STANDAARD);
  const [standaardartikelToonAantal, setStandaardartikelToonAantal] = useState(AANTAL_STANDAARD);
  const [taaksoortToonAantal, setTaaksoortToonAantal] = useState(AANTAL_STANDAARD);

  // Klantoverzicht-kolommen (medewerkersportaal): extra velden + standaard verborgen kolommen.
  const [koExtra, setKoExtra] = useState([]); // [{ veld, label, type }]
  const [koVerborgen, setKoVerborgen] = useState([]); // kolom-keys die standaard verborgen zijn
  const [koNieuwVeld, setKoNieuwVeld] = useState("");
  const [koNieuwLabel, setKoNieuwLabel] = useState("");
  const [koNieuwType, setKoNieuwType] = useState("tekst"); // tekst | keuze | lookup
  const [koStatus, setKoStatus] = useState("idle"); // idle | bezig | gelukt | fout

  // Taaksoorten: welke soorten klanten zien én mogen goedkeuren.
  const [taaksoortenOpties, setTaaksoortenOpties] = useState(null); // null = laden
  const [taaksoortenConfig, setTaaksoortenConfig] = useState({});
  const [taaksoortenConfiguratieNodig, setTaaksoortenConfiguratieNodig] = useState(false);
  const [taaksoortenFout, setTaaksoortenFout] = useState("");
  const [taaksoortenOpslaanStatus, setTaaksoortenOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [taaksoortenSectieOpen, setTaaksoortenSectieOpen] = useState(false);
  const [taaksoortenZoek, setTaaksoortenZoek] = useState("");

  // Webhooks (Power Automate), onderhoudbaar onder Instellingen.
  const [taakAfwijzingWebhookUrl, setTaakAfwijzingWebhookUrl] = useState("");
  const [reviewWebhookUrl, setReviewWebhookUrl] = useState("");
  const [webhookOpslaanStatus, setWebhookOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  // Facturatiemodule: per klant-account aan/uit (tab "Facturatie").
  const [facturatieKlanten, setFacturatieKlanten] = useState(null); // null = laden; [{accountId, klantnaam, klantnummer}]
  const [facturatieStatussen, setFacturatieStatussen] = useState({}); // accountId -> { ingeschakeld, gewijzigdOp, gewijzigdDoor }
  const [facturatieZoek, setFacturatieZoek] = useState("");
  const [facturatieStatusFilter, setFacturatieStatusFilter] = useState("alle"); // "alle" | "aan" | "uit"
  const [facturatieBezig, setFacturatieBezig] = useState({}); // accountId -> bool
  const [facturatieFout, setFacturatieFout] = useState("");
  // Losse urenregistratie-schakelaar (€2,50), naast de facturatiemodule — zelfde lijst klanten.
  const [urenStatussen, setUrenStatussen] = useState({}); // accountId -> { ingeschakeld, aangevraagdOp, ... }
  const [urenBezig, setUrenBezig] = useState({}); // accountId -> bool
  const [facturatieToonAantal, setFacturatieToonAantal] = useState(AANTAL_STANDAARD);
  const [facturatiemodulePrijs, setFacturatiemodulePrijs] = useState("5");
  const [prijsOpslaanStatus, setPrijsOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [urenmodulePrijs, setUrenmodulePrijs] = useState("2.5");
  const [urenPrijsOpslaanStatus, setUrenPrijsOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout
  // Overige betaalde modules per klant aan/uit — zelfde contract als facturatie/uren
  // (GET { statussen } / PUT { accountId, ingeschakeld }). Samengebracht in één tabel.
  const [bezittingenStatussen, setBezittingenStatussen] = useState({});
  const [bezittingenBezig, setBezittingenBezig] = useState({});
  const [rapportagesStatussen, setRapportagesStatussen] = useState({});
  const [rapportagesBezig, setRapportagesBezig] = useState({});
  const [rittenStatussen, setRittenStatussen] = useState({});
  const [rittenBezig, setRittenBezig] = useState({});

  // BTW-tarieven met geldigheidsperiode (Facturatie → BTW-tarieven) — zelfde bewerk-per-rij
  // patroon als Standaardartikelen: "nieuw" voegt een tarief toe (sluit het vorige van die
  // code automatisch af), een bestaand tarief bewerken corrigeert dat ene tarief zelf.
  const [btwTarieven, setBtwTarieven] = useState(null); // null = laden; volledige historie (alle codes)
  const [btwFout, setBtwFout] = useState("");
  const [btwBezig, setBtwBezig] = useState({}); // id (of "nieuw") -> bool
  const [btwBewerken, setBtwBewerken] = useState(null); // id van tarief dat bewerkt wordt, "nieuw", of null
  const [btwForm, setBtwForm] = useState({ code: "hoog", label: "", percentage: "", geldigVanaf: "", geldigTot: "" });

  // Centraal beheerde standaardartikelen (Facturatie → Standaardwaarden), voor elke klant beschikbaar.
  const [standaardartikelen, setStandaardartikelen] = useState(null); // null = laden
  const [standaardartikelenFout, setStandaardartikelenFout] = useState("");
  const [standaardartikelBezig, setStandaardartikelBezig] = useState({}); // id -> bool
  const [standaardartikelBewerken, setStandaardartikelBewerken] = useState(null); // id van artikel dat bewerkt wordt, of "nieuw"
  const [standaardartikelForm, setStandaardartikelForm] = useState({ omschrijving: "", eenheid: "", prijs: "", btwCode: "hoog" });

  const laadBtwTarieven = useCallback(() => {
    fetch("/api/beheer-btw-tarieven")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBtwTarieven(d.tarieven || []))
      .catch(() => { setBtwTarieven([]); setBtwFout("Kon de BTW-tarieven niet ophalen."); });
  }, []);

  const laadStandaardartikelen = useCallback(() => {
    fetch("/api/beheer-artikelen-algemeen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStandaardartikelen(d.artikelen || []))
      .catch(() => { setStandaardartikelen([]); setStandaardartikelenFout("Kon de standaardartikelen niet ophalen."); });
  }, []);

  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => {
        const principal = data.clientPrincipal;
        if (!principal) {
          setStatus("nietIngelogd");
          return;
        }
        setGebruiker(principal);
        const rollen = principal.userRoles || [];
        setStatus(rollen.includes("beheerder") ? "klaar" : "geenRol");
      })
      .catch(() => setStatus("nietIngelogd"));
  }, []);

  useEffect(() => {
    if (status !== "klaar") return;
    // Als beheerder laden we de volledige instellingen (incl. googleReviewUrl) via het
    // beveiligde endpoint; de publieke /api/instellingen geeft de reviewlink bewust niet terug.
    fetch("/api/beheer-instellingen")
      .then((r) => r.json())
      .then((d) => {
        setLogoUrl(d.logoUrl || "");
        setFaviconUrl(d.faviconUrl || "");
        zetBrowserFavicon(d.faviconUrl);
        setWijzigingFormNawUrl(d.wijzigingFormNawUrl || "");
        setWijzigingFormContactUrl(d.wijzigingFormContactUrl || "");
        setGoogleReviewUrl(d.googleReviewUrl || "");
        setTeamsChatUrl(d.teamsChatUrl || "");
        setWhatsappUrl(d.whatsappUrl || "");
        setCopilotEmbedUrl(d.copilotEmbedUrl || "");
        setTaakAfwijzingWebhookUrl(d.taakAfwijzingWebhookUrl || "");
        setReviewWebhookUrl(d.reviewWebhookUrl || "");
        setFacturatiemodulePrijs(d.facturatiemodulePrijs != null ? String(d.facturatiemodulePrijs) : "5");
        setUrenmodulePrijs(d.urenmodulePrijs != null ? String(d.urenmodulePrijs) : "2.5");
        setKoExtra((d.klantoverzicht && d.klantoverzicht.extraKolommen) || []);
        setKoVerborgen((d.klantoverzicht && d.klantoverzicht.standaardVerborgen) || []);
      })
      .catch(() => {});
    fetch("/api/beheer-klantcategorieen")
      .then((r) => r.json())
      .then((d) => setCategorieen(d.opties || []))
      .catch(() => setCategorieen([]));
    fetch("/api/beheer-wijzigrechten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setNiveaus(d.niveaus || {}); setBulk(Array.isArray(d.bulk) ? d.bulk : []); setAlsKlant(Array.isArray(d.alsKlant) ? d.alsKlant : []); setOffertes(Array.isArray(d.offertes) ? d.offertes : []); })
      .catch(() => {});
    fetch("/api/beheer-entra-groepen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setEntraGroepen(d.groepen || []);
        setEntraGroepId(d.gekozenGroepId || "");
        setEntraLeden(new Set((d.leden || []).map((e) => String(e).toLowerCase())));
        setEntraFout(d.fout || "");
      })
      .catch(() => { setEntraGroepen([]); setEntraLeden(new Set()); setEntraFout("De Entra-groepen konden niet worden opgehaald."); });
    fetch("/api/beheer-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMedewerkers(d.medewerkers || []))
      .catch(() => setMedewerkers([]));
    fetch("/api/medewerker-klant-inzage")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInzageLog(Array.isArray(d.log) ? d.log : []))
      .catch(() => setInzageLog([]));
    fetch("/api/beheer-taaksoorten")
      .then((r) => r.json())
      .then((d) => {
        setTaaksoortenOpties(d.opties || []);
        setTaaksoortenConfig(d.config || {});
        setTaaksoortenConfiguratieNodig(!!d.configuratieNodig);
        if (d.error) setTaaksoortenFout(d.error);
      })
      .catch(() => { setTaaksoortenOpties([]); setTaaksoortenFout("Kon de taaksoorten niet ophalen."); });
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setFacturatieKlanten(
        (d.klanten || []).map((k) => ({ accountId: k.accountId, klantnaam: k.klantnaam, klantnummer: k.klantnummer }))
      ))
      .catch(() => setFacturatieKlanten([]));
    fetch("/api/beheer-facturatie-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setFacturatieStatussen(d.statussen || {}))
      .catch(() => setFacturatieStatussen({}));
    fetch("/api/beheer-uren-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUrenStatussen(d.statussen || {}))
      .catch(() => setUrenStatussen({}));
    fetch("/api/beheer-bezittingen-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBezittingenStatussen(d.statussen || {}))
      .catch(() => setBezittingenStatussen({}));
    fetch("/api/beheer-rapportages-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRapportagesStatussen(d.statussen || {}))
      .catch(() => setRapportagesStatussen({}));
    fetch("/api/beheer-ritten-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRittenStatussen(d.statussen || {}))
      .catch(() => setRittenStatussen({}));
    laadBtwTarieven();
    laadStandaardartikelen();
    haalMededelingen();
    haalSnellinks();
    haalFaqs();
  }, [status]);

  const haalMededelingen = useCallback(() => {
    fetch("/api/beheer-content?type=mededeling")
      .then((r) => r.json())
      .then(setMededelingen)
      .catch(() => setMededelingen([]));
  }, []);

  const haalFaqs = useCallback(() => {
    fetch("/api/beheer-content?type=faq")
      .then((r) => r.json())
      .then(setFaqs)
      .catch(() => setFaqs([]));
  }, []);

  const toggleFaqCategorie = useCallback((waarde) => {
    setGekozenFaqCategorieen((huidig) =>
      huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]
    );
  }, []);

  const verstuurFaq = useCallback(async () => {
    if (!nieuweVraag.trim() || !nieuwAntwoord.trim()) return;
    setFaqVerzendStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "faq",
          vraag: nieuweVraag.trim(),
          antwoord: nieuwAntwoord.trim(),
          klantcategorieen: gekozenFaqCategorieen,
        }),
      });
      if (!res.ok) throw new Error();
      setNieuweVraag("");
      setNieuwAntwoord("");
      setGekozenFaqCategorieen([]);
      setFaqVerzendStatus("idle");
      haalFaqs();
    } catch {
      setFaqVerzendStatus("fout");
    }
  }, [nieuweVraag, nieuwAntwoord, gekozenFaqCategorieen, haalFaqs]);

  const verwijderFaq = useCallback(
    async (id) => {
      if (!window.confirm("Deze vraag verwijderen?")) return;
      try {
        await fetch(`/api/beheer-content?type=faq&id=${id}`, { method: "DELETE" });
        haalFaqs();
      } catch {
        // stil falen is acceptabel
      }
    },
    [haalFaqs]
  );

  const herschikFaq = useCallback(
    async (index, richting) => {
      const doel = index + richting;
      if (!faqs || doel < 0 || doel >= faqs.length) return;
      const nieuw = [...faqs];
      [nieuw[index], nieuw[doel]] = [nieuw[doel], nieuw[index]];
      setFaqs(nieuw);
      try {
        await fetch("/api/beheer-content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "faq", volgorde: nieuw.map((f) => f.id) }),
        });
      } catch {
        haalFaqs();
      }
    },
    [faqs, haalFaqs]
  );

  const beginBewerkFaq = useCallback((f) => {
    setFaqBewerken(f.id);
    setBewerkVraag(f.vraag || "");
    setBewerkAntwoord(f.antwoord || "");
    setBewerkFaqCategorieen(f.klantcategorieen || []);
    setBewerkFaqStatus("idle");
  }, []);

  const annuleerBewerkFaq = useCallback(() => setFaqBewerken(null), []);

  const toggleBewerkFaqCategorie = useCallback((waarde) => {
    setBewerkFaqCategorieen((huidig) => (huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]));
  }, []);

  const slaFaqOp = useCallback(async () => {
    if (!bewerkVraag.trim() || !bewerkAntwoord.trim()) return;
    setBewerkFaqStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "faq",
          id: faqBewerken,
          vraag: bewerkVraag.trim(),
          antwoord: bewerkAntwoord.trim(),
          klantcategorieen: bewerkFaqCategorieen,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFaqBewerken(null);
      haalFaqs();
    } catch {
      setBewerkFaqStatus("fout");
    }
  }, [bewerkVraag, bewerkAntwoord, bewerkFaqCategorieen, faqBewerken, haalFaqs]);

  const haalSnellinks = useCallback(() => {
    fetch("/api/beheer-content?type=programma")
      .then((r) => r.json())
      .then(setSnellinks)
      .catch(() => setSnellinks([]));
  }, []);

  const uploadLogo = useCallback((bestand) => {
    if (!bestand) return;
    setUploadStatus("bezig");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/beheer-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setLogoUrl(data.logoUrl);
        setUploadStatus("gelukt");
      } catch {
        setUploadStatus("fout");
      }
    };
    reader.readAsDataURL(bestand);
  }, []);

  const uploadFavicon = useCallback((bestand) => {
    if (!bestand) return;
    setFaviconUploadStatus("bezig");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/beheer-favicon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setFaviconUrl(data.faviconUrl);
        zetBrowserFavicon(data.faviconUrl);
        setFaviconUploadStatus("gelukt");
      } catch {
        setFaviconUploadStatus("fout");
      }
    };
    reader.readAsDataURL(bestand);
  }, []);

  const toggleCategorie = useCallback((waarde) => {
    setGekozenCategorieen((huidig) =>
      huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]
    );
  }, []);

  const verstuurMededeling = useCallback(async () => {
    if (!nieuweTitel.trim() || !nieuweTekst.trim()) return;
    setVerzendStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mededeling",
          titel: nieuweTitel.trim(),
          tekst: nieuweTekst.trim(),
          klantcategorieen: gekozenCategorieen,
          zichtbaarTot: onbeperktZichtbaar ? null : (nieuweZichtbaarTot || null),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNieuweTitel("");
      setNieuweTekst("");
      setGekozenCategorieen([]);
      setNieuweZichtbaarTot("");
      setOnbeperktZichtbaar(true);
      setVerzendStatus("idle");
      haalMededelingen();
    } catch {
      setVerzendStatus("fout");
    }
  }, [nieuweTitel, nieuweTekst, gekozenCategorieen, onbeperktZichtbaar, nieuweZichtbaarTot, haalMededelingen]);

  const verwijderMededeling = useCallback(
    async (id) => {
      if (!window.confirm("Deze mededeling verwijderen?")) return;
      try {
        await fetch(`/api/beheer-content?type=mededeling&id=${id}`, { method: "DELETE" });
        haalMededelingen();
      } catch {
        // stil falen is hier acceptabel; de lijst blijft gewoon staan
      }
    },
    [haalMededelingen]
  );

  const beginBewerkMededeling = useCallback((m) => {
    setMededelingBewerken(m.id);
    setBewerkTitel(m.titel || "");
    setBewerkTekst(m.tekst || "");
    setBewerkCategorieen(m.klantcategorieen || []);
    setBewerkOnbeperkt(!m.zichtbaarTot);
    setBewerkZichtbaarTot(m.zichtbaarTot ? String(m.zichtbaarTot).slice(0, 10) : "");
    setBewerkMededelingStatus("idle");
  }, []);

  const annuleerBewerkMededeling = useCallback(() => setMededelingBewerken(null), []);

  const toggleBewerkCategorie = useCallback((waarde) => {
    setBewerkCategorieen((huidig) => (huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]));
  }, []);

  const slaMededelingOp = useCallback(async () => {
    if (!bewerkTitel.trim() || !bewerkTekst.trim()) return;
    setBewerkMededelingStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mededeling",
          id: mededelingBewerken,
          titel: bewerkTitel.trim(),
          tekst: bewerkTekst.trim(),
          klantcategorieen: bewerkCategorieen,
          zichtbaarTot: bewerkOnbeperkt ? null : (bewerkZichtbaarTot || null),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMededelingBewerken(null);
      haalMededelingen();
    } catch {
      setBewerkMededelingStatus("fout");
    }
  }, [bewerkTitel, bewerkTekst, bewerkCategorieen, bewerkOnbeperkt, bewerkZichtbaarTot, mededelingBewerken, haalMededelingen]);

  const labelVoorWaarde = (waarde) => categorieen?.find((c) => c.waarde === waarde)?.label || waarde;

  const slaWebhooksOp = useCallback(async () => {
    setWebhookOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taakAfwijzingWebhookUrl: taakAfwijzingWebhookUrl.trim(), reviewWebhookUrl: reviewWebhookUrl.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setWebhookOpslaanStatus("gelukt");
    } catch {
      setWebhookOpslaanStatus("fout");
    }
  }, [taakAfwijzingWebhookUrl, reviewWebhookUrl]);

  const slaFormLinksOp = useCallback(async () => {
    setFormOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wijzigingFormNawUrl, wijzigingFormContactUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFormOpslaanStatus("gelukt");
    } catch {
      setFormOpslaanStatus("fout");
    }
  }, [wijzigingFormNawUrl, wijzigingFormContactUrl]);

  const slaReviewLinksOp = useCallback(async () => {
    setLinksOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleReviewUrl: googleReviewUrl.trim(),
          teamsChatUrl: teamsChatUrl.trim(),
          whatsappUrl: whatsappUrl.trim(),
          copilotEmbedUrl: copilotEmbedUrl.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setLinksOpslaanStatus("gelukt");
    } catch {
      setLinksOpslaanStatus("fout");
    }
  }, [googleReviewUrl, teamsChatUrl, whatsappUrl, copilotEmbedUrl]);

  const slaFacturatiemodulePrijsOp = useCallback(async () => {
    const bedrag = Number(String(facturatiemodulePrijs).replace(",", "."));
    if (!Number.isFinite(bedrag) || bedrag < 0) {
      setPrijsOpslaanStatus("fout");
      return;
    }
    setPrijsOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facturatiemodulePrijs: bedrag }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFacturatiemodulePrijs(String(bedrag));
      setPrijsOpslaanStatus("gelukt");
    } catch {
      setPrijsOpslaanStatus("fout");
    }
  }, [facturatiemodulePrijs]);

  const slaUrenmodulePrijsOp = useCallback(async () => {
    const bedrag = Number(String(urenmodulePrijs).replace(",", "."));
    if (!Number.isFinite(bedrag) || bedrag < 0) {
      setUrenPrijsOpslaanStatus("fout");
      return;
    }
    setUrenPrijsOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urenmodulePrijs: bedrag }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUrenmodulePrijs(String(bedrag));
      setUrenPrijsOpslaanStatus("gelukt");
    } catch {
      setUrenPrijsOpslaanStatus("fout");
    }
  }, [urenmodulePrijs]);

  // Facturatiemodule per klant aan/uit — direct opslaan (geen aparte "Opslaan"-knop), met
  // optimistische update en terugdraaien bij een fout.
  const zetFacturatieStatus = useCallback(async (accountId, ingeschakeld) => {
    setFacturatieFout("");
    setFacturatieBezig((h) => ({ ...h, [accountId]: true }));
    setFacturatieStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld } }));
    try {
      const res = await fetch("/api/beheer-facturatie-klanten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ingeschakeld }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setFacturatieStatussen((h) => ({ ...h, [accountId]: d }));
    } catch {
      setFacturatieStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld: !ingeschakeld } }));
      setFacturatieFout("Opslaan is niet gelukt, probeer het nog eens.");
    } finally {
      setFacturatieBezig((h) => ({ ...h, [accountId]: false }));
    }
  }, []);

  // Urenregistratie per klant aan/uit — zelfde patroon als zetFacturatieStatus, eigen endpoint.
  const zetUrenStatus = useCallback(async (accountId, ingeschakeld) => {
    setFacturatieFout("");
    setUrenBezig((h) => ({ ...h, [accountId]: true }));
    setUrenStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld } }));
    try {
      const res = await fetch("/api/beheer-uren-klanten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ingeschakeld }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setUrenStatussen((h) => ({ ...h, [accountId]: d }));
    } catch {
      setUrenStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld: !ingeschakeld } }));
      setFacturatieFout("Opslaan is niet gelukt, probeer het nog eens.");
    } finally {
      setUrenBezig((h) => ({ ...h, [accountId]: false }));
    }
  }, []);

  // Generieke aan/uit-schakelaar voor de overige betaalde modules (bezittingen/rapportages/ritten) —
  // zelfde optimistische update + terugdraaien als facturatie/uren, maar met meegegeven endpoint/setters.
  const zetModuleStatus = useCallback(async (endpoint, setStatussen, setBezig, accountId, ingeschakeld) => {
    setFacturatieFout("");
    setBezig((h) => ({ ...h, [accountId]: true }));
    setStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld } }));
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ingeschakeld }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setStatussen((h) => ({ ...h, [accountId]: d }));
    } catch {
      setStatussen((h) => ({ ...h, [accountId]: { ...(h[accountId] || {}), ingeschakeld: !ingeschakeld } }));
      setFacturatieFout("Opslaan is niet gelukt, probeer het nog eens.");
    } finally {
      setBezig((h) => ({ ...h, [accountId]: false }));
    }
  }, []);

  // Heeft deze klant minstens één betaalde module aanstaan? (voor het "Aan"-filter + de teller)
  const anyModuleAan = (accountId) =>
    !!(facturatieStatussen[accountId] && facturatieStatussen[accountId].ingeschakeld) ||
    !!(urenStatussen[accountId] && urenStatussen[accountId].ingeschakeld) ||
    !!(bezittingenStatussen[accountId] && bezittingenStatussen[accountId].ingeschakeld) ||
    !!(rapportagesStatussen[accountId] && rapportagesStatussen[accountId].ingeschakeld) ||
    !!(rittenStatussen[accountId] && rittenStatussen[accountId].ingeschakeld);

  // BTW-tarieven — "nieuw" voegt een tarief toe (de server sluit automatisch het vorige
  // tarief van diezelfde code af); een bestaand tarief bewerken corrigeert dat ene tarief
  // via PUT (bijv. typefout in percentage of datum), zonder iets anders af te sluiten.
  const beginBtwTarief = useCallback((tarief) => {
    setBtwFout("");
    if (tarief) {
      setBtwBewerken(tarief.id);
      setBtwForm({
        code: tarief.code, label: tarief.label || "", percentage: tarief.percentage,
        geldigVanaf: tarief.geldigVanaf ? String(tarief.geldigVanaf).slice(0, 10) : "",
        geldigTot: tarief.geldigTot ? String(tarief.geldigTot).slice(0, 10) : "",
      });
    } else {
      setBtwBewerken("nieuw");
      setBtwForm({ code: "hoog", label: "", percentage: "", geldigVanaf: "", geldigTot: "" });
    }
  }, []);

  const slaBtwTariefOp = useCallback(async () => {
    if (btwForm.percentage === "" || btwForm.percentage == null) {
      setBtwFout("Percentage is verplicht.");
      return;
    }
    if (btwBewerken === "nieuw" && !btwForm.geldigVanaf) {
      setBtwFout("Geldig-vanaf-datum is verplicht voor een nieuw tarief.");
      return;
    }
    const id = btwBewerken;
    setBtwBezig((h) => ({ ...h, [id]: true }));
    setBtwFout("");
    try {
      const res = id === "nieuw"
        ? await fetch("/api/beheer-btw-tarieven", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: btwForm.code,
              label: btwForm.label.trim() || undefined,
              percentage: Number(btwForm.percentage),
              geldigVanaf: btwForm.geldigVanaf,
            }),
          })
        : await fetch("/api/beheer-btw-tarieven", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              label: btwForm.label.trim() || undefined,
              percentage: Number(btwForm.percentage),
              geldigVanaf: btwForm.geldigVanaf || undefined,
              geldigTot: btwForm.geldigTot || null,
            }),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Opslaan mislukt.");
      }
      setBtwBewerken(null);
      laadBtwTarieven();
    } catch (e) {
      setBtwFout(e.message || String(e));
    } finally {
      setBtwBezig((h) => ({ ...h, [id]: false }));
    }
  }, [btwForm, btwBewerken, laadBtwTarieven]);

  // Standaardartikelen (artikelen_algemeen) — voor elke klant beschikbaar, alleen hier te wijzigen.
  const beginStandaardartikel = useCallback((artikel) => {
    setStandaardartikelenFout("");
    if (artikel) {
      setStandaardartikelBewerken(artikel.id);
      setStandaardartikelForm({
        omschrijving: artikel.omschrijving, eenheid: artikel.eenheid || "",
        prijs: artikel.prijs, btwCode: artikel.btwCode || "hoog",
      });
    } else {
      setStandaardartikelBewerken("nieuw");
      setStandaardartikelForm({ omschrijving: "", eenheid: "", prijs: "", btwCode: "hoog" });
    }
  }, []);

  const slaStandaardartikelOp = useCallback(async () => {
    if (!standaardartikelForm.omschrijving.trim()) {
      setStandaardartikelenFout("Omschrijving is verplicht.");
      return;
    }
    const id = standaardartikelBewerken;
    setStandaardartikelBezig((h) => ({ ...h, [id]: true }));
    setStandaardartikelenFout("");
    try {
      const payload = {
        omschrijving: standaardartikelForm.omschrijving,
        eenheid: standaardartikelForm.eenheid,
        prijs: Number(standaardartikelForm.prijs) || 0,
        btwCode: standaardartikelForm.btwCode,
      };
      const res = id === "nieuw"
        ? await fetch("/api/beheer-artikelen-algemeen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/beheer-artikelen-algemeen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Opslaan mislukt.");
      }
      setStandaardartikelBewerken(null);
      laadStandaardartikelen();
    } catch (e) {
      setStandaardartikelenFout(e.message || String(e));
    } finally {
      setStandaardartikelBezig((h) => ({ ...h, [id]: false }));
    }
  }, [standaardartikelForm, standaardartikelBewerken, laadStandaardartikelen]);

  const verwijderStandaardartikel = useCallback(async (artikel) => {
    if (!window.confirm(`"${artikel.omschrijving}" verwijderen? Dit artikel verdwijnt uit de keuzelijst van alle klanten.`)) return;
    setStandaardartikelBezig((h) => ({ ...h, [artikel.id]: true }));
    try {
      await fetch(`/api/beheer-artikelen-algemeen?id=${artikel.id}`, { method: "DELETE" });
      laadStandaardartikelen();
    } catch {
      setStandaardartikelenFout("Verwijderen is niet gelukt, probeer het nog eens.");
      setStandaardartikelBezig((h) => ({ ...h, [artikel.id]: false }));
    }
  }, [laadStandaardartikelen]);

  const zetNiveau = useCallback((email, niveau) => {
    const laag = String(email).toLowerCase();
    setNiveaus((h) => { const n = { ...h }; if (niveau === "medewerker") delete n[laag]; else n[laag] = niveau; return n; });
    setWijzigrechtenStatus("idle");
  }, []);

  const zetBulk = useCallback((email, aan) => {
    const laag = String(email).toLowerCase();
    setBulk((h) => (aan ? [...new Set([...h, laag])] : h.filter((e) => e !== laag)));
    setWijzigrechtenStatus("idle");
  }, []);

  const zetAlsKlant = useCallback((email, aan) => {
    const laag = String(email).toLowerCase();
    setAlsKlant((h) => (aan ? [...new Set([...h, laag])] : h.filter((e) => e !== laag)));
    setWijzigrechtenStatus("idle");
  }, []);

  const zetOffertes = useCallback((email, aan) => {
    const laag = String(email).toLowerCase();
    setOffertes((h) => (aan ? [...new Set([...h, laag])] : h.filter((e) => e !== laag)));
    setWijzigrechtenStatus("idle");
  }, []);

  const slaWijzigrechtenOp = useCallback(async () => {
    setWijzigrechtenStatus("bezig");
    try {
      const res = await fetch("/api/beheer-wijzigrechten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niveaus, bulk, alsKlant, offertes }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setNiveaus(d.niveaus || {});
      setBulk(Array.isArray(d.bulk) ? d.bulk : []);
      setAlsKlant(Array.isArray(d.alsKlant) ? d.alsKlant : []);
      setOffertes(Array.isArray(d.offertes) ? d.offertes : []);
      setWijzigrechtenStatus("gelukt");
    } catch {
      setWijzigrechtenStatus("fout");
    }
  }, [niveaus, bulk, alsKlant, offertes]);

  const slaEntraGroepOp = useCallback(async () => {
    setEntraStatus("bezig");
    try {
      const gekozen = (entraGroepen || []).find((g) => g.id === entraGroepId);
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medewerkersGroepId: entraGroepId, medewerkersGroepNaam: gekozen ? gekozen.naam : "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Direct de ledenlijst van de nieuwe groep ophalen (met ?vernieuw=1, zodat de cache aan de
      // serverkant niet het oude beeld teruggeeft) — dan zie je meteen wie er wel en niet in zit.
      const verse = await fetch("/api/beheer-entra-groepen?vernieuw=1").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (verse) {
        setEntraLeden(new Set((verse.leden || []).map((e) => String(e).toLowerCase())));
        setEntraFout(verse.fout || "");
      }
      setEntraStatus("gelukt");
    } catch {
      setEntraStatus("fout");
    }
  }, [entraGroepId, entraGroepen]);

  const slaKlantoverzichtOp = useCallback(async () => {
    setKoStatus("bezig");
    try {
      const schoonExtra = koExtra.filter((c) => c && c.veld).map((c) => ({ veld: c.veld.trim(), label: (c.label || c.veld).trim(), type: c.type || "tekst" }));
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ klantoverzicht: { extraKolommen: schoonExtra, standaardVerborgen: koVerborgen } }),
      });
      if (!res.ok) throw new Error(await res.text());
      setKoStatus("gelukt");
    } catch {
      setKoStatus("fout");
    }
  }, [koExtra, koVerborgen]);

  const voegExtraKolomToe = useCallback(() => {
    const veld = koNieuwVeld.trim();
    if (!veld) return;
    setKoExtra((h) => (h.some((c) => c.veld === veld) ? h : [...h, { veld, label: koNieuwLabel.trim() || veld, type: koNieuwType }]));
    setKoNieuwVeld(""); setKoNieuwLabel(""); setKoNieuwType("tekst");
  }, [koNieuwVeld, koNieuwLabel, koNieuwType]);

  const wijzigTaaksoort = useCallback((waarde, veld, aan, label) => {
    setTaaksoortenConfig((huidig) => {
      const key = String(waarde);
      const bestaand = huidig[key] || {};
      const nieuw = { ...bestaand, [veld]: aan, label: label ?? bestaand.label };
      // Goedkeuren én ondertekenen kunnen alleen bij een zichtbare soort.
      if (veld === "zichtbaar" && !aan) { nieuw.magGoedkeuren = false; nieuw.vereistHandtekening = false; }
      if (veld === "magGoedkeuren" && aan) nieuw.zichtbaar = true;
      if (veld === "vereistHandtekening" && aan) nieuw.zichtbaar = true;
      return { ...huidig, [key]: nieuw };
    });
    setTaaksoortenOpslaanStatus("idle");
  }, []);

  const slaTaaksoortenOp = useCallback(async () => {
    setTaaksoortenOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taaksoorten: taaksoortenConfig }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTaaksoortenOpslaanStatus("gelukt");
    } catch {
      setTaaksoortenOpslaanStatus("fout");
    }
  }, [taaksoortenConfig]);

  const toggleLinkCategorie = useCallback((waarde) => {
    setGekozenLinkCategorieen((huidig) =>
      huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]
    );
  }, []);

  const verstuurSnellink = useCallback(async () => {
    if (!nieuweLinkTitel.trim() || !nieuweLinkUrl.trim()) return;
    setLinkVerzendStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "programma",
          titel: nieuweLinkTitel.trim(),
          url: nieuweLinkUrl.trim(),
          klantcategorieen: gekozenLinkCategorieen,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNieuweLinkTitel("");
      setNieuweLinkUrl("");
      setGekozenLinkCategorieen([]);
      setLinkVerzendStatus("idle");
      haalSnellinks();
    } catch {
      setLinkVerzendStatus("fout");
    }
  }, [nieuweLinkTitel, nieuweLinkUrl, gekozenLinkCategorieen, haalSnellinks]);

  const verwijderSnellink = useCallback(
    async (id) => {
      if (!window.confirm("Deze snellink verwijderen?")) return;
      try {
        await fetch(`/api/beheer-content?type=programma&id=${id}`, { method: "DELETE" });
        haalSnellinks();
      } catch {
        // stil falen is hier acceptabel; de lijst blijft gewoon staan
      }
    },
    [haalSnellinks]
  );

  const herschikSnellink = useCallback(
    async (index, richting) => {
      const doel = index + richting;
      if (!snellinks || doel < 0 || doel >= snellinks.length) return;
      // Direct in de UI omwisselen voor een snelle reactie.
      const nieuw = [...snellinks];
      [nieuw[index], nieuw[doel]] = [nieuw[doel], nieuw[index]];
      setSnellinks(nieuw);
      try {
        await fetch("/api/beheer-content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "programma", volgorde: nieuw.map((s) => s.id) }),
        });
      } catch {
        haalSnellinks(); // bij een fout de opgeslagen volgorde terughalen
      }
    },
    [snellinks, haalSnellinks]
  );

  if (status === "laden") {
    return (
      <Scherm>
        <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} color={KLEUR.subtekst} />
      </Scherm>
    );
  }

  if (status === "nietIngelogd") {
    return (
      <Scherm>
        <Building2 size={32} color={KLEUR.blauw} />
        <div style={{ fontSize: 20, fontWeight: 600 }}>Beheerdersportaal</div>
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, marginBottom: 8 }}>Log in met je Microsoft-account.</div>
        <a
          href={`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent("/beheer")}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: KLEUR.blauw, color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
        >
          Inloggen met Microsoft
        </a>
      </Scherm>
    );
  }

  if (status === "geenRol") {
    return (
      <Scherm>
        <ShieldAlert size={28} color={KLEUR.rood} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>Geen toegang</div>
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, textAlign: "center", maxWidth: 320 }}>
          Je bent ingelogd als {gebruiker?.userDetails}, maar hebt niet de rol <strong>beheerder</strong>.
          Vraag iemand met beheerrechten om die rol toe te kennen via Static Web Apps &gt; Role management.
        </div>
      </Scherm>
    );
  }

  // Aantal openstaande facturatiemodule-aanvragen (module nog uit, wel aangevraagd) — voor het
  // rode badge-rondje op de tab "Facturatie", zodat een beheerder dit niet over het hoofd ziet.
  const facturatieAanvragenCount = Object.values(facturatieStatussen).filter((s) => s && !s.ingeschakeld && s.aangevraagdOp).length
    + Object.values(urenStatussen).filter((s) => s && !s.ingeschakeld && s.aangevraagdOp).length;

  return (
    <div style={{ maxWidth: "none", width: "100%", margin: "0 auto", padding: "24px 32px", boxSizing: "border-box", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Building2 size={20} color={KLEUR.blauw} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Beheerdersportaal</div>
          {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxHeight: 30, maxWidth: 160, objectFit: "contain", display: "block", alignSelf: "center", marginLeft: 8 }} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{gebruiker?.userDetails}</span>
          <a href="/medewerker" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw, textDecoration: "none" }}>
            <Users size={13} /> Medewerker
          </a>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw, textDecoration: "none" }}>
            <LayoutGrid size={13} /> Klantportaal
          </a>
          <a href="/.auth/logout" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.subtekst, textDecoration: "none" }}>
            <LogOut size={13} /> Uitloggen
          </a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${KLEUR.rand}` }}>
        {[
          ["uitstraling", "Huisstijl"],
          ["content", "Content"],
          ["faq", "FAQ"],
          ["taken", "Taken"],
          ["medewerkers", "Medewerkers"],
          ["facturatie", "Facturatie"],
          ["offertes", "Offertes"],
          ["aanleveren", "Uitvraag"],
          ["uren", "Uren"],
          ["instellingen", "Instellingen"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, marginBottom: -1,
              color: tab === k ? KLEUR.blauw : KLEUR.subtekst,
              borderBottom: `2px solid ${tab === k ? KLEUR.blauw : "transparent"}`,
            }}
          >
            {label}
            {k === "facturatie" && facturatieAanvragenCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
                background: KLEUR.rood, color: "#fff", fontSize: 10.5, fontWeight: 700, lineHeight: 1,
              }}>
                {facturatieAanvragenCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "aanleveren" && <UitvraagBeheer />}
      {tab === "uren" && <UrenTarievenBeheer />}

      {tab === "uitstraling" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <button
          onClick={() => toggleRubriek("logo")}
          aria-expanded={rubriekIsOpen("logo")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("logo") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Logo</span>
        </button>
        {rubriekIsOpen("logo") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 18px" }}>
          Verschijnt op het inlogscherm en bovenaan het klantportaal.
        </div>

        {logoUrl && (
          <div style={{ marginBottom: 18, padding: 16, background: KLEUR.lichtblauw, borderRadius: 8, display: "flex", justifyContent: "center" }}>
            <img src={logoUrl} alt="Huidig logo" style={{ maxHeight: 70, maxWidth: 280, objectFit: "contain" }} />
          </div>
        )}

        <label
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px",
            border: `1.5px dashed ${KLEUR.rand}`, borderRadius: 8, cursor: "pointer", fontSize: 13.5,
            fontWeight: 600, color: KLEUR.blauw,
          }}
        >
          <Upload size={16} />
          {uploadStatus === "bezig" ? "Bezig met uploaden..." : "Nieuw logo kiezen"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => uploadLogo(e.target.files?.[0])}
          />
        </label>

        {uploadStatus === "gelukt" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Logo bijgewerkt.
          </div>
        )}
        {uploadStatus === "fout" && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: KLEUR.rood }}>Uploaden is niet gelukt, probeer het nog eens.</div>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("favicon")}
          aria-expanded={rubriekIsOpen("favicon")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("favicon") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Favicon</span>
        </button>
        {rubriekIsOpen("favicon") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 18px" }}>
          Het kleine icoon in de browsertab. Gebruik bij voorkeur een vierkante afbeelding (PNG of SVG).
        </div>

        {faviconUrl && (
          <div style={{ marginBottom: 18, padding: 16, background: KLEUR.lichtblauw, borderRadius: 8, display: "flex", justifyContent: "center" }}>
            <img src={faviconUrl} alt="Huidige favicon" style={{ height: 48, width: 48, objectFit: "contain" }} />
          </div>
        )}

        <label
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px",
            border: `1.5px dashed ${KLEUR.rand}`, borderRadius: 8, cursor: "pointer", fontSize: 13.5,
            fontWeight: 600, color: KLEUR.blauw,
          }}
        >
          <Upload size={16} />
          {faviconUploadStatus === "bezig" ? "Bezig met uploaden..." : "Nieuwe favicon kiezen"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => uploadFavicon(e.target.files?.[0])}
          />
        </label>

        {faviconUploadStatus === "gelukt" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Favicon bijgewerkt.
          </div>
        )}
        {faviconUploadStatus === "fout" && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: KLEUR.rood }}>Uploaden is niet gelukt, probeer het nog eens.</div>
        )}
        </>)}
      </div>

      </>)}

      {tab === "content" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("snellinks")}
          aria-expanded={rubriekIsOpen("snellinks")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("snellinks") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Snellinks</span>
        </button>
        {rubriekIsOpen("snellinks") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 18px" }}>
          Knoppen die op home boven de mededelingen staan. Kies eventueel voor welke klantgroepen
          een link zichtbaar is — niets aanvinken = voor iedereen.
        </div>

        <input
          type="text"
          value={nieuweLinkTitel}
          onChange={(e) => setNieuweLinkTitel(e.target.value)}
          placeholder="Titel (bijv. MijnActivaa)"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
        />
        <input
          type="url"
          value={nieuweLinkUrl}
          onChange={(e) => setNieuweLinkUrl(e.target.value)}
          placeholder="https://..."
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
          <Users size={13} /> Klantgroepen (uit Dataverse)
        </div>

        {categorieen === null ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>Categorieën ophalen...</div>
        ) : categorieen.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>
            Geen categorieën gevonden. Controleer <code>DYNAMICS_KLANTCATEGORIE_VELD</code>.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {categorieen.map((c) => {
              const actief = gekozenLinkCategorieen.includes(c.waarde);
              return (
                <button
                  key={c.waarde}
                  onClick={() => toggleLinkCategorie(c.waarde)}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
                    background: actief ? KLEUR.blauw : "#fff",
                    color: actief ? "#fff" : KLEUR.tekst,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={verstuurSnellink}
          disabled={!nieuweLinkTitel.trim() || !nieuweLinkUrl.trim() || linkVerzendStatus === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw,
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !nieuweLinkTitel.trim() || !nieuweLinkUrl.trim() ? 0.5 : 1,
          }}
        >
          <LayoutGrid size={14} /> {linkVerzendStatus === "bezig" ? "Toevoegen..." : "Snellink toevoegen"}
        </button>
        {linkVerzendStatus === "fout" && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: KLEUR.rood }}>Toevoegen is niet gelukt, probeer het nog eens.</div>
        )}

        {snellinks && snellinks.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${KLEUR.rand}` }}>
            <button
              onClick={() => setSnellinksOpen((v) => !v)}
              aria-expanded={snellinksOpen}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ transform: snellinksOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Actieve snellinks
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: KLEUR.mutedTekst }}>({snellinks.length})</span>
            </button>
            {snellinksOpen && (<>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, margin: "8px 0 12px" }}>
              De volgorde hieronder is ook de volgorde waarin klanten de knoppen zien. Gebruik de pijltjes om te rangschikken.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {snellinks.map((s, i) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      <LayoutGrid size={13} color={KLEUR.blauw} /> {s.titel}
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.url} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: KLEUR.subtekst, marginTop: 2, textDecoration: "none", maxWidth: "100%" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{s.url}</span>
                      <ExternalLink size={11} style={{ flexShrink: 0 }} />
                    </a>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                      {s.klantcategorieen?.length > 0
                        ? s.klantcategorieen.map(labelVoorWaarde).join(", ")
                        : "Alle klanten"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => herschikSnellink(i, -1)}
                      disabled={i === 0}
                      title="Omhoog"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer" }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => herschikSnellink(i, 1)}
                      disabled={i === snellinks.length - 1}
                      title="Omlaag"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: i === snellinks.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === snellinks.length - 1 ? "default" : "pointer" }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => verwijderSnellink(s.id)}
                      title="Verwijderen"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </>)}
          </div>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("mededeling")}
          aria-expanded={rubriekIsOpen("mededeling")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("mededeling") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Mededeling versturen</span>
        </button>
        {rubriekIsOpen("mededeling") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 18px" }}>
          Kies aan welke klantgroepen deze zichtbaar wordt. Niets aanvinken = zichtbaar voor iedereen.
        </div>

        <input
          type="text"
          value={nieuweTitel}
          onChange={(e) => setNieuweTitel(e.target.value)}
          placeholder="Titel"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
        />
        <textarea
          value={nieuweTekst}
          onChange={(e) => setNieuweTekst(e.target.value)}
          placeholder="Tekst van de mededeling"
          rows={4}
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Zichtbaar tot
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={onbeperktZichtbaar}
            onChange={(e) => setOnbeperktZichtbaar(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          Tot nader te bepalen (blijft zichtbaar tot je hem verwijdert)
        </label>
        {!onbeperktZichtbaar && (
          <input
            type="date"
            value={nieuweZichtbaarTot}
            onChange={(e) => setNieuweZichtbaarTot(e.target.value)}
            style={{ display: "block", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, marginBottom: 16, boxSizing: "border-box" }}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
          <Users size={13} /> Klantgroepen (uit Dataverse)
        </div>

        {categorieen === null ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>Categorieën ophalen...</div>
        ) : categorieen.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>
            Geen categorieën gevonden. Controleer <code>DYNAMICS_KLANTCATEGORIE_VELD</code>.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {categorieen.map((c) => {
              const actief = gekozenCategorieen.includes(c.waarde);
              return (
                <button
                  key={c.waarde}
                  onClick={() => toggleCategorie(c.waarde)}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
                    background: actief ? KLEUR.blauw : "#fff",
                    color: actief ? "#fff" : KLEUR.tekst,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={verstuurMededeling}
          disabled={!nieuweTitel.trim() || !nieuweTekst.trim() || (!onbeperktZichtbaar && !nieuweZichtbaarTot) || verzendStatus === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw,
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !nieuweTitel.trim() || !nieuweTekst.trim() || (!onbeperktZichtbaar && !nieuweZichtbaarTot) ? 0.5 : 1,
          }}
        >
          <Send size={14} /> {verzendStatus === "bezig" ? "Versturen..." : "Versturen"}
        </button>
        {verzendStatus === "fout" && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: KLEUR.rood }}>Versturen is niet gelukt, probeer het nog eens.</div>
        )}

        {mededelingen && mededelingen.length > 0 && (() => {
          const isVerlopen = (m) => {
            if (!m.zichtbaarTot) return false;
            const t = new Date(m.zichtbaarTot);
            if (isNaN(t.getTime())) return false;
            t.setHours(23, 59, 59, 999);
            return t.getTime() < Date.now();
          };
          const actief = mededelingen.filter((m) => !isVerlopen(m));
          const verlopen = mededelingen.filter(isVerlopen);
          const zichtbaarTotLabel = (m) =>
            m.zichtbaarTot
              ? "Zichtbaar tot " + new Date(m.zichtbaarTot).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
              : "Tot nader te bepalen";

          // Herschikken werkt alleen binnen de actieve sectie (verlopen mededelingen hoeven niet
          // herordend te worden); de verlopen items behouden hun eigen relatieve volgorde erachter
          // — /api/beheer-content PATCH accepteert een gedeeltelijke volgorde-array precies daarvoor.
          const herschikMededelingRegel = (index, richting) => {
            const doel = index + richting;
            if (doel < 0 || doel >= actief.length) return;
            const nieuwActief = [...actief];
            [nieuwActief[index], nieuwActief[doel]] = [nieuwActief[doel], nieuwActief[index]];
            setMededelingen([...nieuwActief, ...verlopen]);
            fetch("/api/beheer-content", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "mededeling", volgorde: nieuwActief.map((m) => m.id) }),
            }).catch(() => haalMededelingen());
          };

          const MededelingRegel = ({ m, verlopenStijl, index, aantal, onHerschik }) => {
            if (mededelingBewerken === m.id) {
              return (
                <div style={{ padding: "12px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <input
                    type="text"
                    value={bewerkTitel}
                    onChange={(e) => setBewerkTitel(e.target.value)}
                    placeholder="Titel"
                    style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
                  />
                  <textarea
                    value={bewerkTekst}
                    onChange={(e) => setBewerkTekst(e.target.value)}
                    placeholder="Tekst van de mededeling"
                    rows={3}
                    style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 10, boxSizing: "border-box" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={bewerkOnbeperkt}
                      onChange={(e) => setBewerkOnbeperkt(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    Tot nader te bepalen
                  </label>
                  {!bewerkOnbeperkt && (
                    <input
                      type="date"
                      value={bewerkZichtbaarTot}
                      onChange={(e) => setBewerkZichtbaarTot(e.target.value)}
                      style={{ display: "block", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
                    />
                  )}
                  {categorieen && categorieen.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {categorieen.map((c) => {
                        const gekozen = bewerkCategorieen.includes(c.waarde);
                        return (
                          <button
                            key={c.waarde}
                            onClick={() => toggleBewerkCategorie(c.waarde)}
                            style={{
                              padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                              border: `1px solid ${gekozen ? KLEUR.blauw : KLEUR.rand}`,
                              background: gekozen ? KLEUR.blauw : "#fff",
                              color: gekozen ? "#fff" : KLEUR.tekst,
                            }}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={slaMededelingOp}
                      disabled={!bewerkTitel.trim() || !bewerkTekst.trim() || bewerkMededelingStatus === "bezig"}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw,
                        color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        opacity: !bewerkTitel.trim() || !bewerkTekst.trim() ? 0.5 : 1,
                      }}
                    >
                      <Check size={13} /> {bewerkMededelingStatus === "bezig" ? "Opslaan..." : "Opslaan"}
                    </button>
                    <button
                      onClick={annuleerBewerkMededeling}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      <X size={13} /> Annuleren
                    </button>
                    {bewerkMededelingStatus === "fout" && <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>}
                  </div>
                </div>
              );
            }
            return (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}`, opacity: verlopenStijl ? 0.7 : 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{m.titel}</div>
                  <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 2 }}>{m.tekst}</div>
                  <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                    {(m.klantcategorieen?.length > 0
                      ? m.klantcategorieen.map(labelVoorWaarde).join(", ")
                      : "Alle klanten")}
                    {" · "}
                    <span style={{ color: verlopenStijl ? KLEUR.rood : KLEUR.mutedTekst }}>{zichtbaarTotLabel(m)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!verlopenStijl && onHerschik && (
                    <>
                      <button
                        onClick={() => onHerschik(index, -1)}
                        disabled={index === 0}
                        title="Omhoog"
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: index === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: index === 0 ? "default" : "pointer" }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => onHerschik(index, 1)}
                        disabled={index === aantal - 1}
                        title="Omlaag"
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: index === aantal - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: index === aantal - 1 ? "default" : "pointer" }}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => beginBewerkMededeling(m)}
                    title="Bewerken"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.blauw, cursor: "pointer", flexShrink: 0 }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => verwijderMededeling(m.id)}
                    title="Verwijderen"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer", flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          };

          const sectieKnop = (open, setOpen, label, aantal) => (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", textAlign: "left" }}
            >
              <ChevronDown size={15} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
              {label} <span style={{ color: KLEUR.mutedTekst }}>({aantal})</span>
            </button>
          );

          return (
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${KLEUR.rand}` }}>
              {sectieKnop(actieveMededelingenOpen, setActieveMededelingenOpen, "Actieve mededelingen", actief.length)}
              {actieveMededelingenOpen && (
                actief.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginTop: 10 }}>Geen actieve mededelingen.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                    {actief.map((m, i) => <MededelingRegel key={m.id} m={m} index={i} aantal={actief.length} onHerschik={herschikMededelingRegel} />)}
                  </div>
                )
              )}

              {verlopen.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  {sectieKnop(verlopenMededelingenOpen, setVerlopenMededelingenOpen, "Verlopen mededelingen", verlopen.length)}
                  {verlopenMededelingenOpen && (
                    <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                      {verlopen.map((m) => <MededelingRegel key={m.id} m={m} verlopenStijl />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        </>)}
      </div>

      </>)}

      {tab === "faq" && (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <button
          onClick={() => toggleRubriek("faq")}
          aria-expanded={rubriekIsOpen("faq")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("faq") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Veelgestelde vragen (FAQ)</span>
        </button>
        {rubriekIsOpen("faq") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 18px" }}>
          Vraag en antwoord die klanten op de pagina "Veelgestelde vragen" zien. Kies eventueel voor
          welke klantgroepen een vraag zichtbaar is — niets aanvinken = voor iedereen.
        </div>

        <input
          type="text"
          value={nieuweVraag}
          onChange={(e) => setNieuweVraag(e.target.value)}
          placeholder="Vraag"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
        />
        <textarea
          value={nieuwAntwoord}
          onChange={(e) => setNieuwAntwoord(e.target.value)}
          placeholder="Antwoord"
          rows={4}
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
          <Users size={13} /> Klantgroepen (uit Dataverse)
        </div>
        {categorieen === null ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>Categorieën ophalen...</div>
        ) : categorieen.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>
            Geen categorieën gevonden. Controleer <code>DYNAMICS_KLANTCATEGORIE_VELD</code>.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {categorieen.map((c) => {
              const actief = gekozenFaqCategorieen.includes(c.waarde);
              return (
                <button
                  key={c.waarde}
                  onClick={() => toggleFaqCategorie(c.waarde)}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
                    background: actief ? KLEUR.blauw : "#fff",
                    color: actief ? "#fff" : KLEUR.tekst,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={verstuurFaq}
          disabled={!nieuweVraag.trim() || !nieuwAntwoord.trim() || faqVerzendStatus === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw,
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !nieuweVraag.trim() || !nieuwAntwoord.trim() ? 0.5 : 1,
          }}
        >
          <HelpCircle size={14} /> {faqVerzendStatus === "bezig" ? "Toevoegen..." : "Vraag toevoegen"}
        </button>
        {faqVerzendStatus === "fout" && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: KLEUR.rood }}>Toevoegen is niet gelukt, probeer het nog eens.</div>
        )}

        {faqs && faqs.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${KLEUR.rand}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>
              Bestaande vragen
            </div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={faqZoek}
                onChange={(e) => setFaqZoek(e.target.value)}
                placeholder="Zoek in vragen en antwoorden…"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
              />
            </div>
            {(() => {
              const term = faqZoek.trim().toLowerCase();
              const zichtbaar = faqs.filter((f) => !term || [f.vraag, f.antwoord].filter(Boolean).some((v) => v.toLowerCase().includes(term)));
              // Welke vragen mogen op dit moment op het scherm: de eerste faqToonAantal treffers.
              // We werken met id's en niet met slice op de map, omdat de index i hieronder de échte
              // positie in de volledige lijst moet blijven — anders verspringt omhoog/omlaag.
              const zichtbaarIds = new Set(zichtbaar.slice(0, faqToonAantal).map((f) => f.id));
              if (zichtbaar.length === 0) {
                return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen vragen gevonden voor “{faqZoek}”.</div>;
              }
              return (
                <>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {faqs.map((f, i) => {
                    if (!zichtbaarIds.has(f.id)) return null;

                    if (faqBewerken === f.id) {
                      return (
                        <div key={f.id} style={{ padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                          <input
                            type="text"
                            value={bewerkVraag}
                            onChange={(e) => setBewerkVraag(e.target.value)}
                            placeholder="Vraag"
                            style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
                          />
                          <textarea
                            value={bewerkAntwoord}
                            onChange={(e) => setBewerkAntwoord(e.target.value)}
                            placeholder="Antwoord"
                            rows={3}
                            style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 10, boxSizing: "border-box" }}
                          />
                          {categorieen && categorieen.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                              {categorieen.map((c) => {
                                const gekozen = bewerkFaqCategorieen.includes(c.waarde);
                                return (
                                  <button
                                    key={c.waarde}
                                    onClick={() => toggleBewerkFaqCategorie(c.waarde)}
                                    style={{
                                      padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                                      border: `1px solid ${gekozen ? KLEUR.blauw : KLEUR.rand}`,
                                      background: gekozen ? KLEUR.blauw : "#fff",
                                      color: gekozen ? "#fff" : KLEUR.tekst,
                                    }}
                                  >
                                    {c.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button
                              onClick={slaFaqOp}
                              disabled={!bewerkVraag.trim() || !bewerkAntwoord.trim() || bewerkFaqStatus === "bezig"}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw,
                                color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                                opacity: !bewerkVraag.trim() || !bewerkAntwoord.trim() ? 0.5 : 1,
                              }}
                            >
                              <Check size={13} /> {bewerkFaqStatus === "bezig" ? "Opslaan..." : "Opslaan"}
                            </button>
                            <button
                              onClick={annuleerBewerkFaq}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                            >
                              <X size={13} /> Annuleren
                            </button>
                            {bewerkFaqStatus === "fout" && <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{f.vraag}</div>
                          <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 2, whiteSpace: "pre-wrap" }}>{f.antwoord}</div>
                          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                            {f.klantcategorieen?.length > 0 ? f.klantcategorieen.map(labelVoorWaarde).join(", ") : "Alle klanten"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {!term && (
                            <>
                              <button onClick={() => herschikFaq(i, -1)} disabled={i === 0} title="Omhoog" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer" }}>
                                <ArrowUp size={14} />
                              </button>
                              <button onClick={() => herschikFaq(i, 1)} disabled={i === faqs.length - 1} title="Omlaag" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: i === faqs.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === faqs.length - 1 ? "default" : "pointer" }}>
                                <ArrowDown size={14} />
                              </button>
                            </>
                          )}
                          <button onClick={() => beginBewerkFaq(f)} title="Bewerken" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.blauw, cursor: "pointer" }}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => verwijderFaq(f.id)} title="Verwijderen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <AantalKiezer aantal={faqToonAantal} setAantal={setFaqToonAantal} totaal={zichtbaar.length} />
                </>
              );
            })()}
          </div>
        )}
        </>)}
      </div>
      )}

      {tab === "instellingen" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("webhooks")}
          aria-expanded={rubriekIsOpen("webhooks")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("webhooks") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Webhooks (Power Automate)</span>
        </button>
        {rubriekIsOpen("webhooks") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 6px" }}>
          Wanneer een klant bij een taak op <strong>"Niet akkoord"</strong> klikt, stuurt het portaal
          de toelichting naar deze webhook. Maak in Power Automate een stroom met trigger
          "Wanneer een HTTP-aanvraag wordt ontvangen" en plak hier de gegenereerde URL; de stroom
          kan dan een mail versturen.
        </div>
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 12, lineHeight: 1.6 }}>
          De POST-body bevat: <code>gebeurtenis</code>, <code>taaktitel</code>, <code>soort</code>,{" "}
          <code>klantnaam</code>, <code>klantnummer</code>, <code>aanvragerEmail</code>,{" "}
          <code>bericht</code>, <code>tijdstip</code>. Laat leeg om geen webhook te gebruiken.
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Webhook-URL — "Niet akkoord" op taken</div>
        <input
          type="text"
          value={taakAfwijzingWebhookUrl}
          onChange={(e) => setTaakAfwijzingWebhookUrl(e.target.value)}
          placeholder="https://prod-XX.westeurope.logic.azure.com:443/workflows/.../triggers/manual/paths/invoke?..."
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Webhook-URL — review onder 5 sterren</div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 6, lineHeight: 1.5 }}>
          Bij een review van minder dan 5 sterren stuurt het portaal de score en opmerking hierheen
          (naast de bestaande meldingsmail), zodat je de afhandeling in Power Automate kunt regelen.
          Body: <code>gebeurtenis</code>, <code>sterren</code>, <code>opmerking</code>,{" "}
          <code>reviewerEmail</code>, <code>klantnaam</code>, <code>klantnummer</code>,{" "}
          <code>relatiebeheerder(Email)</code>, <code>accountant(Email)</code>, <code>tijdstip</code>.
        </div>
        <input
          type="text"
          value={reviewWebhookUrl}
          onChange={(e) => setReviewWebhookUrl(e.target.value)}
          placeholder="https://prod-XX.westeurope.logic.azure.com:443/workflows/.../triggers/manual/paths/invoke?..."
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />
        <button
          onClick={slaWebhooksOp}
          disabled={webhookOpslaanStatus === "bezig"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {webhookOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
        </button>
        {webhookOpslaanStatus === "gelukt" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Opgeslagen.
          </span>
        )}
        {webhookOpslaanStatus === "fout" && (
          <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("wijzigingsformulieren")}
          aria-expanded={rubriekIsOpen("wijzigingsformulieren")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("wijzigingsformulieren") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Wijzigingsformulieren</span>
        </button>
        {rubriekIsOpen("wijzigingsformulieren") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 4px" }}>
          Links naar (bijv. Microsoft Forms-)formulieren waarmee klanten wijzigingen in hun
          gegevens kunnen doorgeven — verschijnen onder "Mijn gegevens", bij respectievelijk
          de bedrijfsgegevens en de contactgegevens.
        </div>
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 18, lineHeight: 1.6 }}>
          Gebruik <code>{"{veldnaam}"}</code> in de link om automatisch de bekende gegevens van
          de klant in te vullen. Beschikbaar bij bedrijfsgegevens: <code>{"{klantnummer}"}</code>,{" "}
          <code>{"{bedrijfsnaam}"}</code>, <code>{"{straat}"}</code>, <code>{"{postcode}"}</code>,{" "}
          <code>{"{plaats}"}</code>. Bij contactgegevens: <code>{"{klantnummer}"}</code>,{" "}
          <code>{"{contactpersoon}"}</code>, <code>{"{email}"}</code>, <code>{"{telefoon}"}</code>.
          Bijvoorbeeld handig bij een vooraf-ingevulde Microsoft Forms-link.
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Link bij bedrijfsgegevens (NAW)</div>
        <input
          type="text"
          value={wijzigingFormNawUrl}
          onChange={(e) => setWijzigingFormNawUrl(e.target.value)}
          placeholder="https://forms.office.com/...&r1={bedrijfsnaam}&r2={straat}"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Link bij contactgegevens</div>
        <input
          type="text"
          value={wijzigingFormContactUrl}
          onChange={(e) => setWijzigingFormContactUrl(e.target.value)}
          placeholder="https://forms.office.com/...&r1={email}&r2={telefoon}"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <button
          onClick={slaFormLinksOp}
          disabled={formOpslaanStatus === "bezig"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {formOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
        </button>
        {formOpslaanStatus === "gelukt" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Opgeslagen.
          </span>
        )}
        {formOpslaanStatus === "fout" && (
          <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("assistentReviews")}
          aria-expanded={rubriekIsOpen("assistentReviews")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("assistentReviews") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Assistent, reviews & contact</span>
        </button>
        {rubriekIsOpen("assistentReviews") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 18px" }}>
          Deze links sturen de knoppen en de assistent op de pagina "Veelgestelde vragen" en de
          reviewpagina aan. Laat een veld leeg om die knop/optie te verbergen.
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>AI-assistent — insluit-link (Copilot Studio)</div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 6, lineHeight: 1.5 }}>
          Publiceer je agent in Copilot Studio via kanaal "Aangepaste website" en plak hier de
          insluit-URL (de <code>src</code> uit de iframe-code). De assistent verschijnt dan als
          chatvenster op de FAQ-pagina.
        </div>
        <input
          type="text"
          value={copilotEmbedUrl}
          onChange={(e) => setCopilotEmbedUrl(e.target.value)}
          placeholder="https://copilotstudio.microsoft.com/environments/.../webchat"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>WhatsApp-nummer of -link</div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 6, lineHeight: 1.5 }}>
          Bijv. <code>0612345678</code> (NL) of internationaal <code>31612345678</code>, of een
          volledige <code>https://wa.me/...</code>-link.
        </div>
        <input
          type="text"
          value={whatsappUrl}
          onChange={(e) => setWhatsappUrl(e.target.value)}
          placeholder="0612345678"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Google-reviewlink</div>
        <input
          type="text"
          value={googleReviewUrl}
          onChange={(e) => setGoogleReviewUrl(e.target.value)}
          placeholder="https://g.page/r/.../review"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Teams-chatlink</div>
        <input
          type="text"
          value={teamsChatUrl}
          onChange={(e) => setTeamsChatUrl(e.target.value)}
          placeholder="https://teams.microsoft.com/l/chat/..."
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <button
          onClick={slaReviewLinksOp}
          disabled={linksOpslaanStatus === "bezig"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {linksOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
        </button>
        {linksOpslaanStatus === "gelukt" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Opgeslagen.
          </span>
        )}
        {linksOpslaanStatus === "fout" && (
          <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("klantoverzichtKolommen")}
          aria-expanded={rubriekIsOpen("klantoverzichtKolommen")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("klantoverzichtKolommen") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Klantoverzicht-kolommen (medewerkersportaal)</span>
        </button>
        {rubriekIsOpen("klantoverzichtKolommen") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
          Bepaal welke kolommen medewerkers standaard zien in het klantoverzicht, en voeg extra
          Dynamics-velden als kolom toe. Medewerkers kunnen kolommen zelf altijd aan/uit zetten.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Standaard zichtbare kolommen</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 18 }}>
          {[...KLANTOVERZICHT_BASIS, ...koExtra.filter((c) => c && c.veld).map((c) => ["extra_" + c.veld, c.label || c.veld])].map(([key, labelTekst]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!koVerborgen.includes(key)}
                onChange={() => setKoVerborgen((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))}
              />
              {labelTekst}
            </label>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Extra kolommen (Dynamics-velden)</div>
        {koExtra.filter((c) => c && c.veld).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {koExtra.filter((c) => c && c.veld).map((c) => (
              <div key={c.veld} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>{c.label || c.veld}</span>
                <code style={{ color: KLEUR.subtekst }}>{c.veld}</code>
                <span style={{ color: KLEUR.mutedTekst }}>({c.type})</span>
                <button onClick={() => setKoExtra((h) => h.filter((x) => x.veld !== c.veld))} title="Verwijderen" style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <input value={koNieuwVeld} onChange={(e) => setKoNieuwVeld(e.target.value)} placeholder="logische veldnaam (bijv. sk_btwnummer)" style={{ flex: "1 1 220px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }} />
          <input value={koNieuwLabel} onChange={(e) => setKoNieuwLabel(e.target.value)} placeholder="kolomtitel (bijv. BTW-nummer)" style={{ flex: "1 1 180px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }} />
          <select value={koNieuwType} onChange={(e) => setKoNieuwType(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff" }}>
            <option value="tekst">Tekst/getal</option>
            <option value="keuze">Keuzelijst</option>
            <option value="lookup">Lookup (verwijzing)</option>
          </select>
          <button onClick={voegExtraKolomToe} style={{ padding: "8px 14px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Toevoegen</button>
        </div>

        <button
          onClick={slaKlantoverzichtOp}
          disabled={koStatus === "bezig"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {koStatus === "bezig" ? "Opslaan..." : "Opslaan"}
        </button>
        {koStatus === "gelukt" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Opgeslagen.
          </span>
        )}
        {koStatus === "fout" && (
          <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
        )}
        </>)}
      </div>

      </>)}

      {tab === "medewerkers" && (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <button
          onClick={() => toggleRubriek("entraGroep")}
          aria-expanded={rubriekIsOpen("entraGroep")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("entraGroep") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Toegang tot het portaal — Entra-groep</span>
        </button>
        {rubriekIsOpen("entraGroep") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px", lineHeight: 1.6 }}>
          Dit bepaalt <strong>wie er binnenkomt</strong>. Wie in de gekozen Entra-groep zit, krijgt bij
          het inloggen automatisch toegang tot het medewerkersportaal — je hoeft niemand meer per
          persoon in Azure uit te nodigen. Wie hieronder bij de wijzig-rechten op niveau
          {" "}<strong>Beheerder</strong> staat, krijgt daarnaast toegang tot dit beheersportaal.
          De rubriek daaronder bepaalt alleen wát iemand mag zodra hij binnen is, niet óf hij binnenkomt.
        </div>

        {entraFout && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: KLEUR.rood, lineHeight: 1.5 }}>{entraFout}</div>
        )}

        {entraGroepen === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Groepen ophalen…
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select
                value={entraGroepId}
                onChange={(e) => { setEntraGroepId(e.target.value); setEntraStatus("idle"); }}
                style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", minWidth: 280 }}
              >
                <option value="">Geen groep — niemand krijgt toegang via een groep</option>
                {entraGroepen.map((g) => (
                  <option key={g.id} value={g.id}>{g.naam}{g.email ? ` (${g.email})` : ""}</option>
                ))}
              </select>
              <button
                onClick={slaEntraGroepOp}
                disabled={entraStatus === "bezig"}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {entraStatus === "bezig" ? "Opslaan..." : "Opslaan"}
              </button>
              {entraStatus === "gelukt" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw }}>
                  <CheckCircle2 size={14} /> Opgeslagen.
                </span>
              )}
              {entraStatus === "fout" && (
                <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 10 }}>
              {entraGroepId
                ? `${entraLeden ? entraLeden.size : 0} leden gevonden in deze groep.`
                : "Nog geen groep gekozen."}
              {" "}Een wijziging geldt bij de volgende keer dat iemand inlogt; wie nu is ingelogd houdt zijn huidige rollen tot hij uit- en weer inlogt.
            </div>
          </>
        )}
        </>)}
      </div>
      )}

      {tab === "medewerkers" && (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <button
          onClick={() => toggleRubriek("medewerkers")}
          aria-expanded={rubriekIsOpen("medewerkers")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("medewerkers") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Medewerkers — wijzig-rechten</span>
        </button>
        {rubriekIsOpen("medewerkers") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
          Standaard mag een medewerker in het medewerkersportaal alleen lezen. Kies per medewerker het
          <strong> niveau</strong> (wijzigen van klantgegevens), vink aan wie <strong>bulk-aanpassingen</strong>
          {" "}op meerdere klanten tegelijk mag doen, en vink aan wie <strong>als klant mag meekijken</strong>
          {" "}(alleen-lezen het klantportaal bekijken namens een gekozen klant, via de tab "Meekijken als klant"
          {" "}in het medewerkersportaal), en vink aan wie <strong>offertes</strong> mag maken (de tab "Offertes":
          {" "}offertes en opdrachtbevestigingen opstellen en versturen). Beheerders mogen dit alle vier sowieso
          {" "}altijd. Wie het offertes-recht niet heeft, ziet de tab niet en kan de bijbehorende API ook niet
          {" "}aanroepen.
        </div>

        {medewerkers === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Medewerkers ophalen…
          </div>
        ) : medewerkers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.rood }}>Geen medewerkers gevonden (controleer de Dynamics-koppeling).</div>
        ) : (
          <>
            <div style={{ position: "relative", marginBottom: 12, maxWidth: 320 }}>
              <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={medewerkerZoek}
                onChange={(e) => setMedewerkerZoek(e.target.value)}
                placeholder="Zoek medewerker…"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
              />
            </div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
              {Object.values(niveaus).filter((n) => n === "manager" || n === "beheerder").length} met wijzig-recht · {bulk.length} met bulk-recht · {alsKlant.length} met als-klant-recht · {offertes.length} met offertes-recht · {medewerkers.length} medewerkers
            </div>
            {(() => {
            const gefilterdeMedewerkers = medewerkers
              .filter((m) => { const q = medewerkerZoek.trim().toLowerCase(); return !q || m.naam.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.functie || "").toLowerCase().includes(q); });
            return (
            <>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 460, overflowY: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
              {gefilterdeMedewerkers
                .slice(0, medewerkerToonAantal)
                .map((m, i) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.naam || m.email}</div>
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{m.functie ? m.functie + " · " : ""}{m.email}</div>
                      {/* Waarschuwing als iemand hier wel rechten heeft maar niet in de Entra-groep
                          zit: dan komt hij het portaal helemaal niet in en doen die rechten niets.
                          Alleen tonen als we de groepsleden echt hebben opgehaald (entraLeden is
                          dan een Set) en er een groep is gekozen — anders zou "niet gevonden" ook
                          "nog niet geladen" kunnen betekenen. */}
                      {entraGroepId && entraLeden && !entraLeden.has(String(m.email).toLowerCase()) && niveaus[m.email] !== "beheerder" && (
                        <div style={{ fontSize: 11, color: KLEUR.rood, marginTop: 2 }}>
                          Zit niet in de Entra-groep — komt het portaal niet in
                        </div>
                      )}
                    </div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst, cursor: "pointer", whiteSpace: "nowrap" }} title="Mag bulk-aanpassingen op meerdere klanten tegelijk doen">
                      <input
                        type="checkbox"
                        checked={bulk.includes(String(m.email).toLowerCase())}
                        onChange={(e) => zetBulk(m.email, e.target.checked)}
                      />
                      Bulk
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst, cursor: "pointer", whiteSpace: "nowrap" }} title="Mag (alleen-lezen) meekijken als klant, via de tab 'Meekijken als klant' in het medewerkersportaal">
                      <input
                        type="checkbox"
                        checked={alsKlant.includes(String(m.email).toLowerCase())}
                        onChange={(e) => zetAlsKlant(m.email, e.target.checked)}
                      />
                      Als klant
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst, cursor: "pointer", whiteSpace: "nowrap" }} title="Mag offertes en opdrachtbevestigingen maken (de tab 'Offertes' in het medewerkersportaal)">
                      <input
                        type="checkbox"
                        checked={offertes.includes(String(m.email).toLowerCase())}
                        onChange={(e) => zetOffertes(m.email, e.target.checked)}
                      />
                      Offertes
                    </label>
                    <select
                      value={niveaus[m.email] || "medewerker"}
                      onChange={(e) => zetNiveau(m.email, e.target.value)}
                      style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: "#fff" }}
                    >
                      <option value="medewerker">Medewerker</option>
                      <option value="manager">Manager</option>
                      <option value="beheerder">Beheerder</option>
                    </select>
                  </div>
                ))}
            </div>
            <AantalKiezer aantal={medewerkerToonAantal} setAantal={setMedewerkerToonAantal} totaal={gefilterdeMedewerkers.length} />
            </>
            );
            })()}
            <div style={{ marginTop: 14 }}>
              <button
                onClick={slaWijzigrechtenOp}
                disabled={wijzigrechtenStatus === "bezig"}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {wijzigrechtenStatus === "bezig" ? "Opslaan..." : "Opslaan"}
              </button>
              {wijzigrechtenStatus === "gelukt" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
                  <CheckCircle2 size={14} /> Opgeslagen.
                </span>
              )}
              {wijzigrechtenStatus === "fout" && (
                <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
              )}
            </div>
          </>
        )}
        </>)}
      </div>
      )}

      {tab === "medewerkers" && (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button
          onClick={() => toggleRubriek("klantInzageLog")}
          aria-expanded={rubriekIsOpen("klantInzageLog")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("klantInzageLog") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Log — meekijken als klant</span>
        </button>
        {rubriekIsOpen("klantInzageLog") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
          Overzicht van elk moment dat een medewerker (alleen-lezen) het klantportaal namens een klant heeft
          bekeken — wie, namens welke klant, en wanneer.
        </div>
        {inzageLog === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Log ophalen…
          </div>
        ) : (
          <>
            <div style={{ position: "relative", marginBottom: 12, maxWidth: 320 }}>
              <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={inzageLogZoek}
                onChange={(e) => setInzageLogZoek(e.target.value)}
                placeholder="Zoek op medewerker of klant…"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
              />
            </div>
            {inzageLog.length === 0 ? (
              <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog niemand heeft als klant meegekeken.</div>
            ) : (() => {
              const gefilterdInzageLog = inzageLog.filter((item) => {
                const q = inzageLogZoek.trim().toLowerCase();
                if (!q) return true;
                return [item.medewerkerNaam, item.medewerkerEmail, item.klantnaam, String(item.klantnummer ?? "")]
                  .filter(Boolean)
                  .some((v) => v.toLowerCase().includes(q));
              });
              const zichtbaarInzageLog = gefilterdInzageLog.slice(0, inzageLogToonAantal);
              return (
                <>
                  <div style={{ display: "flex", flexDirection: "column", maxHeight: 360, overflowY: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
                    {zichtbaarInzageLog.map((item, i) => (
                      <div key={item.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, fontSize: 12.5 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{item.medewerkerNaam || item.medewerkerEmail}</strong> keek mee als <strong>{item.klantnaam || "onbekende klant"}</strong>
                          {item.klantnummer ? ` (${item.klantnummer})` : ""}
                        </div>
                        <div style={{ color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>
                          {item.tijdstip ? new Date(item.tijdstip).toLocaleString("nl-NL") : ""}
                        </div>
                      </div>
                    ))}
                  </div>

                  <AantalKiezer aantal={inzageLogToonAantal} setAantal={setInzageLogToonAantal} totaal={gefilterdInzageLog.length} />
                </>
              );
            })()}
          </>
        )}
        </>)}
      </div>
      )}

      {tab === "facturatie" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <button
          onClick={() => toggleRubriek("facturatieKlanten")}
          aria-expanded={rubriekIsOpen("facturatieKlanten")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("facturatieKlanten") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Betaalde functionaliteiten</span>
        </button>
        {rubriekIsOpen("facturatieKlanten") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
          Alle betaalde modules staan standaard <strong>uit</strong> voor elke klant. Zet per klant aan wat die klant mag
          gebruiken — de bijbehorende tab verschijnt dan meteen in het klantportaal. Modules: <strong>Facturen</strong>,
          <strong> Uren</strong> (werkt bovenop Facturen), <strong>Bezittingen</strong>, <strong>Rapportages</strong> en <strong>Ritten</strong>.
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 18, padding: 14, background: KLEUR.lichtblauw, borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Prijs per maand, per klantaccount</div>
            <div style={{ position: "relative", maxWidth: 160 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
              <input
                type="text"
                inputMode="decimal"
                value={facturatiemodulePrijs}
                onChange={(e) => setFacturatiemodulePrijs(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 24px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
              />
            </div>
          </div>
          <button
            onClick={slaFacturatiemodulePrijsOp}
            disabled={prijsOpslaanStatus === "bezig"}
            style={{ padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            {prijsOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
          </button>
          {prijsOpslaanStatus === "gelukt" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw }}>
              <CheckCircle2 size={14} /> Opgeslagen.
            </span>
          )}
          {prijsOpslaanStatus === "fout" && (
            <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Ongeldig bedrag of opslaan mislukt.</span>
          )}
          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, width: "100%" }}>
            Deze prijs wordt getoond aan klanten bij wie de module nog niet actief is (klantportaal, tab "Facturen").
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 18, padding: 14, background: KLEUR.lichtblauw, borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Prijs urenregistratie per maand, per klantaccount</div>
            <div style={{ position: "relative", maxWidth: 160 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
              <input
                type="text"
                inputMode="decimal"
                value={urenmodulePrijs}
                onChange={(e) => setUrenmodulePrijs(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 24px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
              />
            </div>
          </div>
          <button
            onClick={slaUrenmodulePrijsOp}
            disabled={urenPrijsOpslaanStatus === "bezig"}
            style={{ padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            {urenPrijsOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
          </button>
          {urenPrijsOpslaanStatus === "gelukt" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw }}>
              <CheckCircle2 size={14} /> Opgeslagen.
            </span>
          )}
          {urenPrijsOpslaanStatus === "fout" && (
            <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Ongeldig bedrag of opslaan mislukt.</span>
          )}
          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, width: "100%" }}>
            De losse urenregistratie-module (werkt samen met de facturatiemodule). Deze prijs wordt getoond aan klanten bij wie de urenregistratie nog niet actief is.
          </div>
        </div>

        {facturatieFout && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: KLEUR.rood }}>{facturatieFout}</div>
        )}

        {facturatieKlanten === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Klanten ophalen…
          </div>
        ) : facturatieKlanten.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.rood }}>Geen klanten gevonden (controleer de Dynamics-koppeling).</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <div style={{ position: "relative", maxWidth: 320, flex: "1 1 220px" }}>
                <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  value={facturatieZoek}
                  onChange={(e) => setFacturatieZoek(e.target.value)}
                  placeholder="Zoek klant…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
                />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["alle", "Alle"], ["aan", "Aan"], ["uit", "Uit"]].map(([v, lbl]) => (
                  <button
                    key={v}
                    onClick={() => setFacturatieStatusFilter(v)}
                    style={{
                      padding: "7px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${facturatieStatusFilter === v ? KLEUR.blauw : KLEUR.rand}`,
                      background: facturatieStatusFilter === v ? KLEUR.blauw : "#fff",
                      color: facturatieStatusFilter === v ? "#fff" : KLEUR.subtekst,
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
              {facturatieKlanten.filter((k) => anyModuleAan(k.accountId)).length} van {facturatieKlanten.length} klanten met minstens één module aan
              {(() => {
                const nAanvragen = Object.values(facturatieStatussen).filter((s) => s && !s.ingeschakeld && s.aangevraagdOp).length;
                return nAanvragen > 0 ? ` — ${nAanvragen} ${nAanvragen === 1 ? "aanvraag" : "aanvragen"} open` : "";
              })()}
            </div>
            {(() => {
              const gefilterdFacturatie = facturatieKlanten
                .filter((k) => {
                  const q = facturatieZoek.trim().toLowerCase();
                  return !q || (k.klantnaam || "").toLowerCase().includes(q) || String(k.klantnummer || "").toLowerCase().includes(q);
                })
                .filter((k) => {
                  if (facturatieStatusFilter === "alle") return true;
                  const aan = anyModuleAan(k.accountId);
                  return facturatieStatusFilter === "aan" ? aan : !aan;
                })
                .slice()
                .sort((a, b) => {
                  // Klanten met een openstaande aanvraag (module nog uit, wel aangevraagd) bovenaan,
                  // zodat een beheerder die niet over het hoofd ziet tussen alle andere klanten.
                  const aanvraag = (k) => !(facturatieStatussen[k.accountId] && facturatieStatussen[k.accountId].ingeschakeld)
                    && !!(facturatieStatussen[k.accountId] && facturatieStatussen[k.accountId].aangevraagdOp);
                  return (aanvraag(b) ? 1 : 0) - (aanvraag(a) ? 1 : 0);
                });
              const zichtbareFacturatie = gefilterdFacturatie.slice(0, facturatieToonAantal);
              return (
                <>
                  <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
                    {zichtbareFacturatie.map((k, i) => {
                      const status = facturatieStatussen[k.accountId] || {};
                      const aan = !!status.ingeschakeld;
                      const bezig = !!facturatieBezig[k.accountId];
                      const aangevraagd = !aan && !!status.aangevraagdOp;
                      const urenStatus = urenStatussen[k.accountId] || {};
                      const urenAan = !!urenStatus.ingeschakeld;
                      const urenBezigRow = !!urenBezig[k.accountId];
                      const urenAangevraagd = !urenAan && !!urenStatus.aangevraagdOp;
                      const bezAan = !!(bezittingenStatussen[k.accountId] && bezittingenStatussen[k.accountId].ingeschakeld);
                      const rapAan = !!(rapportagesStatussen[k.accountId] && rapportagesStatussen[k.accountId].ingeschakeld);
                      const ritAan = !!(rittenStatussen[k.accountId] && rittenStatussen[k.accountId].ingeschakeld);
                      return (
                        <div key={k.accountId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, background: (aangevraagd || urenAangevraagd) ? KLEUR.lichtblauw : "transparent" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{k.klantnaam || "(geen naam)"}</div>
                            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Cliëntnr {k.klantnummer || "—"}</div>
                            {aangevraagd && (
                              <div style={{ fontSize: 11, fontWeight: 600, color: KLEUR.blauw, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                                <Clock size={11} /> Facturen aangevraagd op {new Date(status.aangevraagdOp).toLocaleDateString("nl-NL")}
                                {status.aangevraagdDoor ? ` door ${status.aangevraagdDoor}` : ""}
                              </div>
                            )}
                            {urenAangevraagd && (
                              <div style={{ fontSize: 11, fontWeight: 600, color: KLEUR.blauw, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                                <Clock size={11} /> Uren aangevraagd op {new Date(urenStatus.aangevraagdOp).toLocaleDateString("nl-NL")}
                                {urenStatus.aangevraagdDoor ? ` door ${urenStatus.aangevraagdDoor}` : ""}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <ModuleToggle label="Facturen" aan={aan} bezig={bezig} titel={aan ? "Facturatiemodule uitzetten" : "Facturatiemodule aanzetten"} onClick={() => zetFacturatieStatus(k.accountId, !aan)} />
                            <ModuleToggle label="Uren" aan={urenAan} bezig={urenBezigRow} uitgeschakeld={!aan} titel={!aan ? "Zet eerst Facturen aan — Uren werkt daarbovenop" : urenAan ? "Urenregistratie uitzetten" : "Urenregistratie aanzetten"} onClick={() => zetUrenStatus(k.accountId, !urenAan)} />
                            <ModuleToggle label="Bezittingen" aan={bezAan} bezig={!!bezittingenBezig[k.accountId]} titel={bezAan ? "Bezittingen uitzetten" : "Bezittingen aanzetten"} onClick={() => zetModuleStatus("/api/beheer-bezittingen-klanten", setBezittingenStatussen, setBezittingenBezig, k.accountId, !bezAan)} />
                            <ModuleToggle label="Rapportages" aan={rapAan} bezig={!!rapportagesBezig[k.accountId]} titel={rapAan ? "Rapportages uitzetten" : "Rapportages aanzetten"} onClick={() => zetModuleStatus("/api/beheer-rapportages-klanten", setRapportagesStatussen, setRapportagesBezig, k.accountId, !rapAan)} />
                            <ModuleToggle label="Ritten" aan={ritAan} bezig={!!rittenBezig[k.accountId]} titel={ritAan ? "Ritten uitzetten" : "Ritten aanzetten"} onClick={() => zetModuleStatus("/api/beheer-ritten-klanten", setRittenStatussen, setRittenBezig, k.accountId, !ritAan)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <AantalKiezer aantal={facturatieToonAantal} setAantal={setFacturatieToonAantal} totaal={gefilterdFacturatie.length} />
                </>
              );
            })()}
          </>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => toggleRubriek("btwTarieven")}
            aria-expanded={rubriekIsOpen("btwTarieven")}
            style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("btwTarieven") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>BTW-tarieven</span>
          </button>
          {btwBewerken === null && (
            <button
              onClick={() => { setRubriekOpen((h) => ({ ...h, btwTarieven: true })); beginBtwTarief(null); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              <Plus size={13} /> Nieuw tarief
            </button>
          )}
        </div>
        {rubriekIsOpen("btwTarieven") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
          Elk tarief geldt vanaf een datum tot (optioneel) een einddatum. Voeg je een nieuw tarief toe voor een
          bestaande categorie, dan sluit het vorige tarief van die categorie automatisch af op de dag ervoor.
          Een bestaand tarief bewerken (bijv. een typefout) corrigeert alleen dat ene tarief — al gemaakte
          facturen blijven ongewijzigd, want die bevriezen het percentage op het moment van opstellen.
        </div>

        {btwFout && <div style={{ marginBottom: 12, fontSize: 12.5, color: KLEUR.rood }}>{btwFout}</div>}

        {btwTarieven === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Tarieven ophalen…
          </div>
        ) : (
          <>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 100px 120px 120px 90px", background: KLEUR.lichtblauw, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
              <div>Code</div><div>Label</div><div>Percentage</div><div>Geldig vanaf</div><div>Geldig tot</div><div>Acties</div>
            </div>

            {btwBewerken === "nieuw" && (
              <BtwTariefFormulierRij
                form={btwForm}
                setForm={setBtwForm}
                bezig={!!btwBezig["nieuw"]}
                onOpslaan={slaBtwTariefOp}
                onAnnuleren={() => setBtwBewerken(null)}
                nieuw
              />
            )}

            {btwTarieven.length === 0 && btwBewerken !== "nieuw" && (
              <div style={{ padding: "12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen tarieven.</div>
            )}

            {btwTarieven.slice(0, btwToonAantal).map((t, i) => (
              btwBewerken === t.id ? (
                <BtwTariefFormulierRij
                  key={t.id}
                  form={btwForm}
                  setForm={setBtwForm}
                  bezig={!!btwBezig[t.id]}
                  onOpslaan={slaBtwTariefOp}
                  onAnnuleren={() => setBtwBewerken(null)}
                  borderTop={i === 0 ? "none" : `1px solid ${KLEUR.rand}`}
                />
              ) : (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 100px 120px 120px 90px", padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center", opacity: t.geldigTot ? 0.6 : 1 }}>
                  <div>{t.code}</div>
                  <div>{t.label}</div>
                  <div>{t.percentage}%</div>
                  <div>{t.geldigVanaf ? new Date(t.geldigVanaf).toLocaleDateString("nl-NL") : "—"}</div>
                  <div>{t.geldigTot ? new Date(t.geldigTot).toLocaleDateString("nl-NL") : "— (actief)"}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => beginBtwTarief(t)} disabled={!!btwBezig[t.id]} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
                  </div>
                </div>
              )
            ))}
          </div>
          <AantalKiezer aantal={btwToonAantal} setAantal={setBtwToonAantal} totaal={btwTarieven.length} />
          </>
        )}
        </>)}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => toggleRubriek("standaardartikelen")}
            aria-expanded={rubriekIsOpen("standaardartikelen")}
            style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: rubriekIsOpen("standaardartikelen") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>Standaardartikelen</span>
          </button>
          {standaardartikelBewerken === null && (
            <button
              onClick={() => { setRubriekOpen((h) => ({ ...h, standaardartikelen: true })); beginStandaardartikel(null); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              <Plus size={13} /> Nieuw artikel
            </button>
          )}
        </div>
        {rubriekIsOpen("standaardartikelen") && (<>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 14px" }}>
          Deze artikelen staan voor elke klant beschikbaar bij het opstellen van een factuur of offerte
          (bijvoorbeeld Managementvergoeding, Huur, Diensten). Wijzig je hier de prijs, dan geldt dat voor
          alle klanten tegelijk — al opgestelde facturen blijven ongewijzigd.
        </div>

        {standaardartikelenFout && <div style={{ marginBottom: 12, fontSize: 12.5, color: KLEUR.rood }}>{standaardartikelenFout}</div>}

        {standaardartikelen === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Artikelen ophalen…
          </div>
        ) : (
          <>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px 90px", background: KLEUR.lichtblauw, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
              <div>Omschrijving</div><div>Eenheid</div><div>Prijs</div><div>BTW</div><div>Actief</div><div>Acties</div>
            </div>

            {standaardartikelBewerken === "nieuw" && (
              <StandaardartikelFormulierRij
                form={standaardartikelForm}
                setForm={setStandaardartikelForm}
                bezig={!!standaardartikelBezig["nieuw"]}
                onOpslaan={slaStandaardartikelOp}
                onAnnuleren={() => setStandaardartikelBewerken(null)}
              />
            )}

            {standaardartikelen.length === 0 && standaardartikelBewerken !== "nieuw" && (
              <div style={{ padding: "12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen standaardartikelen.</div>
            )}

            {standaardartikelen.slice(0, standaardartikelToonAantal).map((a, i) => (
              standaardartikelBewerken === a.id ? (
                <StandaardartikelFormulierRij
                  key={a.id}
                  form={standaardartikelForm}
                  setForm={setStandaardartikelForm}
                  bezig={!!standaardartikelBezig[a.id]}
                  onOpslaan={slaStandaardartikelOp}
                  onAnnuleren={() => setStandaardartikelBewerken(null)}
                  borderTop={i === 0 ? "none" : `1px solid ${KLEUR.rand}`}
                />
              ) : (
                <div key={a.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px 90px", padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center", opacity: a.actief ? 1 : 0.55 }}>
                  <div style={{ fontWeight: 600 }}>{a.omschrijving}</div>
                  <div>{a.eenheid || "—"}</div>
                  <div>{new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(a.prijs) || 0)}</div>
                  <div>{a.btwPercentage}%</div>
                  <div>{a.actief ? "Ja" : "Nee"}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => beginStandaardartikel(a)} disabled={!!standaardartikelBezig[a.id]} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
                    <button onClick={() => verwijderStandaardartikel(a)} disabled={!!standaardartikelBezig[a.id]} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Verwijderen"><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            ))}
          </div>
          <AantalKiezer aantal={standaardartikelToonAantal} setAantal={setStandaardartikelToonAantal} totaal={standaardartikelen.length} />
          </>
        )}
        </>)}
      </div>
      </>)}

      {tab === "taken" && (<>
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
          <button
            onClick={() => setTaaksoortenSectieOpen((v) => !v)}
            aria-expanded={taaksoortenSectieOpen}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: taaksoortenSectieOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>Zichtbare taaksoorten</span>
          </button>
          {taaksoortenSectieOpen && (<>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "10px 0 16px", lineHeight: 1.6 }}>
            Bepaal per soort taak of klanten hem in het portaal zien, en of ze hem zelf mogen
            goedkeuren. Bij goedkeuren wordt de taak in Dynamics afgerond, met een notitie dat de
            klant akkoord gaf. Soorten die niet zijn aangevinkt blijven voor de klant verborgen.
          </div>

          {taaksoortenOpties === null ? (
            <div style={{ fontSize: 13, color: KLEUR.mutedTekst }}>Laden…</div>
          ) : taaksoortenConfiguratieNodig ? (
            <div style={{ padding: "12px 14px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, color: KLEUR.tekst, lineHeight: 1.6 }}>
              Het soort-veld is nog niet ingesteld. Zet de logische veldnaam van het "Soort"-veld
              op taken in de Application Setting <code>DYNAMICS_TAAK_SOORT_VELD</code> (bijv.{" "}
              <code>sk_soort</code>). Zolang dit ontbreekt, ziet de klant — uit voorzorg — geen taken.
            </div>
          ) : taaksoortenOpties.length === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.rood }}>
              {taaksoortenFout || "Geen taaksoorten gevonden. Controleer of DYNAMICS_TAAK_SOORT_VELD de juiste veldnaam is."}
            </div>
          ) : (
            <>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="text"
                  value={taaksoortenZoek}
                  onChange={(e) => setTaaksoortenZoek(e.target.value)}
                  placeholder="Zoek een taaksoort…"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px 8px 32px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "0 18px", alignItems: "center" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, paddingBottom: 8, borderBottom: `1px solid ${KLEUR.rand}` }}>Soort</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, paddingBottom: 8, borderBottom: `1px solid ${KLEUR.rand}`, textAlign: "center" }}>Zichtbaar</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, paddingBottom: 8, borderBottom: `1px solid ${KLEUR.rand}`, textAlign: "center" }}>Mag goedkeuren</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, paddingBottom: 8, borderBottom: `1px solid ${KLEUR.rand}`, textAlign: "center" }}>Vereist handtekening</div>
                {filterTaaksoorten(taaksoortenOpties, taaksoortenZoek)
                  .slice(0, taaksoortToonAantal)
                  .map((optie) => {
                  const cfg = taaksoortenConfig[String(optie.waarde)] || {};
                  return (
                    <React.Fragment key={optie.waarde}>
                      <div style={{ fontSize: 13, padding: "10px 0", borderBottom: `1px solid ${KLEUR.rand}` }}>{optie.label}</div>
                      <div style={{ textAlign: "center", padding: "10px 0", borderBottom: `1px solid ${KLEUR.rand}` }}>
                        <input
                          type="checkbox"
                          checked={!!cfg.zichtbaar}
                          onChange={(e) => wijzigTaaksoort(optie.waarde, "zichtbaar", e.target.checked, optie.label)}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                      </div>
                      <div style={{ textAlign: "center", padding: "10px 0", borderBottom: `1px solid ${KLEUR.rand}` }}>
                        <input
                          type="checkbox"
                          checked={!!cfg.magGoedkeuren}
                          onChange={(e) => wijzigTaaksoort(optie.waarde, "magGoedkeuren", e.target.checked, optie.label)}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                      </div>
                      <div style={{ textAlign: "center", padding: "10px 0", borderBottom: `1px solid ${KLEUR.rand}` }}>
                        <input
                          type="checkbox"
                          checked={!!cfg.vereistHandtekening}
                          onChange={(e) => wijzigTaaksoort(optie.waarde, "vereistHandtekening", e.target.checked, optie.label)}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              <AantalKiezer aantal={taaksoortToonAantal} setAantal={setTaaksoortToonAantal} totaal={filterTaaksoorten(taaksoortenOpties, taaksoortenZoek).length} />

              <div style={{ marginTop: 18 }}>
                <button
                  onClick={slaTaaksoortenOp}
                  disabled={taaksoortenOpslaanStatus === "bezig"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  {taaksoortenOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
                </button>
                {taaksoortenOpslaanStatus === "gelukt" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
                    <CheckCircle2 size={14} /> Opgeslagen.
                  </span>
                )}
                {taaksoortenOpslaanStatus === "fout" && (
                  <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
                )}
              </div>
            </>
          )}
          </>)}
        </div>
      </>)}

      {/* Offertes — het beheer van de offertetool: afzendergegevens, dienstencatalogus, teksten,
          voorwaarden, roadmap en opdrachtbevestiging-teksten. Dit stond eerder in de Offertes-tab
          van het medewerkersportaal; daar blijft nu alleen het werk zelf staan (de wizard en de
          overzichten). Het component doet zijn eigen beheerderscheck via /api/ben-ik-beheerder,
          bovenop het feit dat dit hele portaal al achter de rol 'beheerder' zit. */}
      {tab === "offertes" && <OffertetoolApp modus="beheer" />}

    </div>
  );
}

function Scherm({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {children}
    </div>
  );
}
