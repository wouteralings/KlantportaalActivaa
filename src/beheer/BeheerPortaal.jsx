import React, { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, LogOut, ShieldAlert, Upload, CheckCircle2, Trash2, Send, Users, LayoutGrid, ExternalLink, Search, ArrowUp, ArrowDown, HelpCircle, ChevronDown, Plus, Pencil, Check, X } from "lucide-react";

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

  const [wijzigingFormNawUrl, setWijzigingFormNawUrl] = useState("");
  const [wijzigingFormContactUrl, setWijzigingFormContactUrl] = useState("");
  const [formOpslaanStatus, setFormOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [teamsChatUrl, setTeamsChatUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [copilotEmbedUrl, setCopilotEmbedUrl] = useState("");
  const [offerteportaalUrl, setOfferteportaalUrl] = useState("");
  const [offerteToolUrl, setOfferteToolUrl] = useState("");
  const [linksOpslaanStatus, setLinksOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  // Rechtenniveau per medewerker (e-mail → 'manager'|'beheerder'; standaard = medewerker).
  const [niveaus, setNiveaus] = useState({});
  // Bulk-recht: lijst met e-mailadressen die bulk-aanpassingen mogen doen.
  const [bulk, setBulk] = useState([]);
  const [wijzigrechtenStatus, setWijzigrechtenStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [medewerkers, setMedewerkers] = useState(null); // null = laden; alle Activaa-medewerkers
  const [medewerkerZoek, setMedewerkerZoek] = useState("");

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
  const [facturatieBezig, setFacturatieBezig] = useState({}); // accountId -> bool
  const [facturatieFout, setFacturatieFout] = useState("");

  // BTW-tarieven met geldigheidsperiode (Facturatie → Standaardwaarden).
  const [btwTarieven, setBtwTarieven] = useState(null); // null = laden; volledige historie (alle codes)
  const [btwFout, setBtwFout] = useState("");
  const [btwOpslaanStatus, setBtwOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout
  const [btwNieuw, setBtwNieuw] = useState({ code: "hoog", label: "", percentage: "", geldigVanaf: "" });

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
        setOfferteportaalUrl(d.offerteportaalUrl || "");
        setOfferteToolUrl(d.offerteToolUrl || "");
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
      .then((d) => { setNiveaus(d.niveaus || {}); setBulk(Array.isArray(d.bulk) ? d.bulk : []); })
      .catch(() => {});
    fetch("/api/beheer-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMedewerkers(d.medewerkers || []))
      .catch(() => setMedewerkers([]));
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
          offerteportaalUrl: offerteportaalUrl.trim(),
          offerteToolUrl: offerteToolUrl.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setLinksOpslaanStatus("gelukt");
    } catch {
      setLinksOpslaanStatus("fout");
    }
  }, [googleReviewUrl, teamsChatUrl, whatsappUrl, copilotEmbedUrl, offerteportaalUrl, offerteToolUrl]);

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

  // Nieuw BTW-tarief toevoegen — sluit op de server automatisch het vorige tarief van
  // diezelfde code af (geldig_tot), dus hier alleen de nieuwe waarden versturen.
  const voegBtwTariefToe = useCallback(async () => {
    if (!btwNieuw.percentage || !btwNieuw.geldigVanaf) {
      setBtwFout("Percentage en geldig-vanaf-datum zijn verplicht.");
      return;
    }
    setBtwOpslaanStatus("bezig");
    setBtwFout("");
    try {
      const res = await fetch("/api/beheer-btw-tarieven", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: btwNieuw.code,
          label: btwNieuw.label.trim() || undefined,
          percentage: Number(btwNieuw.percentage),
          geldigVanaf: btwNieuw.geldigVanaf,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Opslaan mislukt.");
      }
      setBtwNieuw({ code: "hoog", label: "", percentage: "", geldigVanaf: "" });
      setBtwOpslaanStatus("gelukt");
      laadBtwTarieven();
    } catch (e) {
      setBtwFout(e.message || String(e));
      setBtwOpslaanStatus("fout");
    }
  }, [btwNieuw, laadBtwTarieven]);

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

  const slaWijzigrechtenOp = useCallback(async () => {
    setWijzigrechtenStatus("bezig");
    try {
      const res = await fetch("/api/beheer-wijzigrechten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niveaus, bulk }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setNiveaus(d.niveaus || {});
      setBulk(Array.isArray(d.bulk) ? d.bulk : []);
      setWijzigrechtenStatus("gelukt");
    } catch {
      setWijzigrechtenStatus("fout");
    }
  }, [niveaus, bulk]);

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
          </button>
        ))}
      </div>

      {tab === "uitstraling" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Logo</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
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
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Favicon</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
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
      </div>

      </>)}

      {tab === "content" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Snellinks</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
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
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Mededeling versturen</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
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

          const MededelingRegel = ({ m, verlopenStijl }) => (
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
              <button
                onClick={() => verwijderMededeling(m.id)}
                title="Verwijderen"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer", flexShrink: 0 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );

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
                    {actief.map((m) => <MededelingRegel key={m.id} m={m} />)}
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
      </div>

      </>)}

      {tab === "faq" && (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Veelgestelde vragen (FAQ)</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
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
              if (zichtbaar.length === 0) {
                return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen vragen gevonden voor “{faqZoek}”.</div>;
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {faqs.map((f, i) => {
                    if (term && ![f.vraag, f.antwoord].filter(Boolean).some((v) => v.toLowerCase().includes(term))) return null;
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
                          <button onClick={() => verwijderFaq(f.id)} title="Verwijderen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      )}

      {tab === "instellingen" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Webhooks (Power Automate)</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 6 }}>
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
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Wijzigingsformulieren</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 4 }}>
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
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Assistent, reviews & contact</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
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

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Offerteportaal-link (medewerkersportaal)</div>
        <input
          type="text"
          value={offerteportaalUrl}
          onChange={(e) => setOfferteportaalUrl(e.target.value)}
          placeholder="https://…"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Offertetool Project-link (medewerkersportaal)</div>
        <input
          type="text"
          value={offerteToolUrl}
          onChange={(e) => setOfferteToolUrl(e.target.value)}
          placeholder="https://…"
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
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Klantoverzicht-kolommen (medewerkersportaal)</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
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
      </div>

      </>)}

      {tab === "medewerkers" && (
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Medewerkers — wijzig-rechten</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
          Standaard mag een medewerker in het medewerkersportaal alleen lezen. Kies per medewerker het
          <strong> niveau</strong> (wijzigen van klantgegevens) en vink aan wie <strong>bulk-aanpassingen</strong>
          {" "}op meerdere klanten tegelijk mag doen. Beheerders mogen sowieso altijd wijzigen én bulk-aanpassingen doen.
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
              {Object.values(niveaus).filter((n) => n === "manager" || n === "beheerder").length} met wijzig-recht · {bulk.length} met bulk-recht · {medewerkers.length} medewerkers
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 460, overflowY: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
              {medewerkers
                .filter((m) => { const q = medewerkerZoek.trim().toLowerCase(); return !q || m.naam.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.functie || "").toLowerCase().includes(q); })
                .map((m, i) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.naam || m.email}</div>
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{m.functie ? m.functie + " · " : ""}{m.email}</div>
                    </div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst, cursor: "pointer", whiteSpace: "nowrap" }} title="Mag bulk-aanpassingen op meerdere klanten tegelijk doen">
                      <input
                        type="checkbox"
                        checked={bulk.includes(String(m.email).toLowerCase())}
                        onChange={(e) => zetBulk(m.email, e.target.checked)}
                      />
                      Bulk
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
      </div>
      )}

      {tab === "facturatie" && (<>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Facturatiemodule — per klant aan/uit</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
          Standaard staat de facturatiemodule <strong>uit</strong> voor elke klant. Zet 'm per klant aan zodra
          die klant hem mag gebruiken — de tab "Facturen" verschijnt dan meteen in het klantportaal van die klant.
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
            <div style={{ position: "relative", marginBottom: 12, maxWidth: 320 }}>
              <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={facturatieZoek}
                onChange={(e) => setFacturatieZoek(e.target.value)}
                placeholder="Zoek klant…"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
              />
            </div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
              {Object.values(facturatieStatussen).filter((s) => s && s.ingeschakeld).length} van {facturatieKlanten.length} klanten ingeschakeld
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 460, overflowY: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
              {facturatieKlanten
                .filter((k) => {
                  const q = facturatieZoek.trim().toLowerCase();
                  return !q || (k.klantnaam || "").toLowerCase().includes(q) || String(k.klantnummer || "").toLowerCase().includes(q);
                })
                .map((k, i) => {
                  const aan = !!(facturatieStatussen[k.accountId] && facturatieStatussen[k.accountId].ingeschakeld);
                  const bezig = !!facturatieBezig[k.accountId];
                  return (
                    <div key={k.accountId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{k.klantnaam || "(geen naam)"}</div>
                        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Cliëntnr {k.klantnummer || "—"}</div>
                      </div>
                      <button
                        onClick={() => zetFacturatieStatus(k.accountId, !aan)}
                        disabled={bezig}
                        title={aan ? "Facturatiemodule uitzetten" : "Facturatiemodule aanzetten"}
                        style={{
                          position: "relative", width: 40, height: 22, borderRadius: 20, border: "none", cursor: bezig ? "default" : "pointer",
                          background: aan ? KLEUR.blauw : KLEUR.rand, opacity: bezig ? 0.6 : 1, flexShrink: 0, transition: "background .15s",
                        }}
                      >
                        <span style={{
                          position: "absolute", top: 2, left: aan ? 20 : 2, width: 18, height: 18, borderRadius: "50%",
                          background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s",
                        }} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>BTW-tarieven</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
          Elk tarief geldt vanaf een datum tot (optioneel) een einddatum. Voeg je een nieuw tarief toe voor een
          bestaande categorie, dan sluit het vorige tarief van die categorie automatisch af op de dag ervoor —
          al gemaakte facturen blijven ongewijzigd, want die bevriezen het percentage op het moment van opstellen.
        </div>

        {btwFout && <div style={{ marginBottom: 12, fontSize: 12.5, color: KLEUR.rood }}>{btwFout}</div>}

        {btwTarieven === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Tarieven ophalen…
          </div>
        ) : (
          <>
            <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 100px 120px 120px", background: KLEUR.lichtblauw, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
                <div>Code</div><div>Label</div><div>Percentage</div><div>Geldig vanaf</div><div>Geldig tot</div>
              </div>
              {btwTarieven.length === 0 ? (
                <div style={{ padding: "12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen tarieven.</div>
              ) : (
                btwTarieven.map((t, i) => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 100px 120px 120px", padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center", opacity: t.geldigTot ? 0.6 : 1 }}>
                    <div>{t.code}</div>
                    <div>{t.label}</div>
                    <div>{t.percentage}%</div>
                    <div>{t.geldigVanaf ? new Date(t.geldigVanaf).toLocaleDateString("nl-NL") : "—"}</div>
                    <div>{t.geldigTot ? new Date(t.geldigTot).toLocaleDateString("nl-NL") : "— (actief)"}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Nieuw tarief toevoegen</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 100px 140px auto", gap: 8, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", marginBottom: 4 }}>Code</div>
                <select
                  value={btwNieuw.code}
                  onChange={(e) => setBtwNieuw((h) => ({ ...h, code: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5 }}
                >
                  {BTW_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", marginBottom: 4 }}>Label (optioneel)</div>
                <input
                  value={btwNieuw.label}
                  onChange={(e) => setBtwNieuw((h) => ({ ...h, label: e.target.value }))}
                  placeholder={BTW_CODES.find(([c]) => c === btwNieuw.code)?.[1] || ""}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", marginBottom: 4 }}>%</div>
                <input
                  type="number" step="0.01"
                  value={btwNieuw.percentage}
                  onChange={(e) => setBtwNieuw((h) => ({ ...h, percentage: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", marginBottom: 4 }}>Geldig vanaf</div>
                <input
                  type="date"
                  value={btwNieuw.geldigVanaf}
                  onChange={(e) => setBtwNieuw((h) => ({ ...h, geldigVanaf: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </div>
              <button
                onClick={voegBtwTariefToe}
                disabled={btwOpslaanStatus === "bezig"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                <Plus size={13} /> Toevoegen
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Standaardartikelen</div>
          {standaardartikelBewerken === null && (
            <button
              onClick={() => beginStandaardartikel(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={13} /> Nieuw artikel
            </button>
          )}
        </div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
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

            {standaardartikelen.map((a, i) => (
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
        )}
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
                {taaksoortenOpties
                  .filter((optie) => (optie.label || "").toLowerCase().includes(taaksoortenZoek.trim().toLowerCase()))
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
