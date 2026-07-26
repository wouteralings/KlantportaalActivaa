import React, { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, LogOut, ShieldAlert, Upload, CheckCircle2, Trash2, Send, Users, LayoutGrid, ExternalLink, Star, Search, Mail, ArrowUp, ArrowDown, HelpCircle } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C",
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

export default function BeheerPortaal() {
  const [status, setStatus] = useState("laden"); // laden | nietIngelogd | geenRol | klaar
  const [gebruiker, setGebruiker] = useState(null);
  const [tab, setTab] = useState("uitstraling"); // uitstraling | content | reviews | verzoeken | instellingen
  const [tellingen, setTellingen] = useState({ openWijzigingen: 0, nieuweReviews: 0 });
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

  const [snellinks, setSnellinks] = useState(null);
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
  const [linksOpslaanStatus, setLinksOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  const laadTellingen = useCallback(() => {
    fetch("/api/beheer-tellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTellingen({ openWijzigingen: d.openWijzigingen || 0, nieuweReviews: d.nieuweReviews || 0 }))
      .catch(() => {});
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
      })
      .catch(() => {});
    fetch("/api/beheer-klantcategorieen")
      .then((r) => r.json())
      .then((d) => setCategorieen(d.opties || []))
      .catch(() => setCategorieen([]));
    haalMededelingen();
    haalSnellinks();
    haalFaqs();
  }, [status]);

  // Tellingen voor de badges bijwerken bij elke tabwissel. Op het reviews-tabblad worden de
  // reviews eerst als "gezien" gemarkeerd (badge naar 0) en daarna worden de tellingen ververst.
  useEffect(() => {
    if (status !== "klaar") return;
    if (tab === "reviews") {
      fetch("/api/beheer-tellingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "reviews-gezien" }),
      })
        .then(() => laadTellingen())
        .catch(() => laadTellingen());
    } else {
      laadTellingen();
    }
  }, [status, tab, laadTellingen]);

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
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNieuweTitel("");
      setNieuweTekst("");
      setGekozenCategorieen([]);
      setVerzendStatus("idle");
      haalMededelingen();
    } catch {
      setVerzendStatus("fout");
    }
  }, [nieuweTitel, nieuweTekst, gekozenCategorieen, haalMededelingen]);

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
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Building2 size={20} color={KLEUR.blauw} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Beheerdersportaal</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{gebruiker?.userDetails}</span>
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
          ["uitstraling", "Uitstraling"],
          ["content", "Content"],
          ["faq", "FAQ"],
          ["reviews", "Reviews"],
          ["verzoeken", "Wijzigingsverzoeken"],
          ["instellingen", "Instellingen"],
        ].map(([k, label]) => {
          const badge = k === "reviews" ? tellingen.nieuweReviews : k === "verzoeken" ? tellingen.openWijzigingen : 0;
          return (
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
              {badge > 0 && (
                <span
                  title={`${badge} nieuw${badge === 1 ? "" : "e"}`}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
                    background: KLEUR.rood, color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1,
                  }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
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
            <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
              Actieve snellinks
            </div>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 12 }}>
              De volgorde hieronder is ook de volgorde waarin klanten de knoppen zien. Gebruik de pijltjes om te rangschikken.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {snellinks.map((s, i) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      <LayoutGrid size={13} color={KLEUR.blauw} /> {s.titel}
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: KLEUR.subtekst, marginTop: 2, textDecoration: "none" }}>
                      {s.url} <ExternalLink size={11} />
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
          disabled={!nieuweTitel.trim() || !nieuweTekst.trim() || verzendStatus === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw,
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !nieuweTitel.trim() || !nieuweTekst.trim() ? 0.5 : 1,
          }}
        >
          <Send size={14} /> {verzendStatus === "bezig" ? "Versturen..." : "Versturen"}
        </button>
        {verzendStatus === "fout" && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: KLEUR.rood }}>Versturen is niet gelukt, probeer het nog eens.</div>
        )}

        {mededelingen && mededelingen.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${KLEUR.rand}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>
              Actieve mededelingen
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mededelingen.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{m.titel}</div>
                    <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 2 }}>{m.tekst}</div>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                      {m.klantcategorieen?.length > 0
                        ? m.klantcategorieen.map(labelVoorWaarde).join(", ")
                        : "Alle klanten"}
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
              ))}
            </div>
          </div>
        )}
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

      </>)}

      {tab === "reviews" && <ReviewBeheer />}

      {tab === "verzoeken" && <WijzigingsverzoekBeheer onAfgehandeld={laadTellingen} />}
    </div>
  );
}

function datumKort(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function Sterren({ n }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, verticalAlign: "middle" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={12} fill={i <= n ? "#B98237" : "none"} color={i <= n ? "#B98237" : KLEUR.rand} />
      ))}
    </span>
  );
}

function ReviewBeheer() {
  const [klanten, setKlanten] = useState(null); // null = laden
  const [afgekapt, setAfgekapt] = useState(false);
  const [fout, setFout] = useState(false);
  const [zoek, setZoek] = useState("");
  const [fRb, setFRb] = useState("");
  const [fGroep, setFGroep] = useState("");
  const [fStatus, setFStatus] = useState("alle"); // alle | met | zonder | uitgenodigd
  const [sel, setSel] = useState(() => new Set());
  const [uitnodigStatus, setUitnodigStatus] = useState("idle"); // idle | bezig | klaar | fout
  const [resultaat, setResultaat] = useState(null);

  const laadKlanten = useCallback(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setKlanten(d.klanten || []);
        setAfgekapt(!!d.afgekapt);
      })
      .catch(() => {
        setKlanten([]);
        setFout(true);
      });
  }, []);

  useEffect(() => {
    laadKlanten();
  }, [laadKlanten]);

  const lijst = klanten || [];
  const rbOpties = [...new Set(lijst.map((k) => k.relatiebeheerder).filter(Boolean))].sort();
  const groepOpties = [...new Set(lijst.map((k) => k.groepsnaam).filter(Boolean))].sort();

  const term = zoek.trim().toLowerCase();
  const gefilterd = lijst.filter((k) => {
    if (fRb && k.relatiebeheerder !== fRb) return false;
    if (fGroep && k.groepsnaam !== fGroep) return false;
    if (fStatus === "met" && !k.laatsteReview) return false;
    if (fStatus === "zonder" && k.laatsteReview) return false;
    if (fStatus === "uitgenodigd" && !k.laatsteUitnodiging) return false;
    if (
      term &&
      ![k.klantnaam, String(k.klantnummer ?? ""), k.groepsnaam, k.contactNaam]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term))
    )
      return false;
    return true;
  });

  const MAX_TOON = 400;
  const zichtbaar = gefilterd.slice(0, MAX_TOON);
  const selecteerbaar = gefilterd.filter((k) => k.contactEmail);
  const allesGeselecteerd = selecteerbaar.length > 0 && selecteerbaar.every((k) => sel.has(k.accountId));

  const toggle = (id) =>
    setSel((h) => {
      const n = new Set(h);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAlles = () =>
    setSel((h) => {
      const n = new Set(h);
      if (allesGeselecteerd) selecteerbaar.forEach((k) => n.delete(k.accountId));
      else selecteerbaar.forEach((k) => n.add(k.accountId));
      return n;
    });

  const geselecteerd = lijst.filter((k) => sel.has(k.accountId) && k.contactEmail);

  const uitnodigen = useCallback(async () => {
    if (geselecteerd.length === 0) return;
    if (!window.confirm(`${geselecteerd.length} klant(en) een review-uitnodiging mailen?`)) return;
    setUitnodigStatus("bezig");
    setResultaat(null);
    try {
      const res = await fetch("/api/beheer-review-uitnodiging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          klanten: geselecteerd.map((k) => ({
            accountId: k.accountId,
            contactEmail: k.contactEmail,
            contactNaam: k.contactNaam,
            klantnaam: k.klantnaam,
          })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResultaat(await res.json());
      setUitnodigStatus("klaar");
      setSel(new Set());
      laadKlanten();
    } catch {
      setUitnodigStatus("fout");
    }
  }, [geselecteerd, laadKlanten]);

  const selectStijl = {
    border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px",
    fontSize: 12.5, color: KLEUR.tekst, background: "#fff",
  };
  const thStijl = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}` };
  const tdStijl = { fontSize: 12.5, padding: "8px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Star size={18} color={KLEUR.blauw} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>Reviews & uitnodigingen</div>
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Zoek en filter je klantrelaties, zie wie een review gaf en wanneer, en nodig klanten uit
        om een review te geven (e-mail met een link naar het portaal).
      </div>

      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 12 }}>
          De klantenlijst kon niet worden geladen. Controleer of de Dynamics- en opslag-instellingen goed staan.
        </div>
      )}

      {klanten === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Klantenlijst ophalen…
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
              <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Zoek op naam, nummer, groep of contact…"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
              />
            </div>
            <select value={fRb} onChange={(e) => setFRb(e.target.value)} style={selectStijl}>
              <option value="">Alle relatiebeheerders</option>
              {rbOpties.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select value={fGroep} onChange={(e) => setFGroep(e.target.value)} style={selectStijl}>
              <option value="">Alle groepen</option>
              {groepOpties.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selectStijl}>
              <option value="alle">Alle reviewstatus</option>
              <option value="met">Wel een review</option>
              <option value="zonder">Nog geen review</option>
              <option value="uitgenodigd">Reeds uitgenodigd</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>
              {gefilterd.length} klant{gefilterd.length === 1 ? "" : "en"}
              {sel.size > 0 ? ` · ${sel.size} geselecteerd` : ""}
              {afgekapt ? " · lijst afgekapt, verfijn je filter" : ""}
            </div>
            <button
              onClick={uitnodigen}
              disabled={geselecteerd.length === 0 || uitnodigStatus === "bezig"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
                background: geselecteerd.length === 0 ? KLEUR.rand : KLEUR.blauw,
                color: geselecteerd.length === 0 ? KLEUR.mutedTekst : "#fff",
                border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
                cursor: geselecteerd.length === 0 ? "default" : "pointer",
              }}
            >
              <Mail size={14} /> {uitnodigStatus === "bezig" ? "Versturen…" : `Uitnodigen${geselecteerd.length ? ` (${geselecteerd.length})` : ""}`}
            </button>
          </div>

          {uitnodigStatus === "klaar" && resultaat && (
            <div style={{ fontSize: 12.5, color: KLEUR.blauw, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} /> {resultaat.verzonden} uitnodiging(en) verstuurd
              {resultaat.mislukt ? `, ${resultaat.mislukt} mislukt` : ""}
              {resultaat.overgeslagen ? `, ${resultaat.overgeslagen} overgeslagen (maximum per keer)` : ""}.
            </div>
          )}
          {uitnodigStatus === "fout" && (
            <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>
              Uitnodigen is niet gelukt. Controleer of de mailmachtiging (Mail.Send) is verleend.
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStijl, width: 28 }}>
                    <input type="checkbox" checked={allesGeselecteerd} onChange={toggleAlles} title="Alles selecteren" />
                  </th>
                  <th style={thStijl}>Nr</th>
                  <th style={thStijl}>Klant</th>
                  <th style={thStijl}>Groep</th>
                  <th style={thStijl}>Relatiebeheerder</th>
                  <th style={thStijl}>Laatste review</th>
                  <th style={thStijl}>Uitgenodigd</th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((k) => (
                  <tr key={k.accountId}>
                    <td style={tdStijl}>
                      <input
                        type="checkbox"
                        checked={sel.has(k.accountId)}
                        disabled={!k.contactEmail}
                        onChange={() => toggle(k.accountId)}
                        title={k.contactEmail ? "" : "Geen e-mailadres bekend"}
                      />
                    </td>
                    <td style={{ ...tdStijl, color: KLEUR.blauw, fontWeight: 600, whiteSpace: "nowrap" }}>{k.klantnummer || "—"}</td>
                    <td style={tdStijl}>
                      <div style={{ fontWeight: 600 }}>{k.klantnaam}</div>
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{k.contactNaam}{k.contactEmail ? ` · ${k.contactEmail}` : " · geen e-mail"}</div>
                    </td>
                    <td style={tdStijl}>{k.groepsnaam || "—"}</td>
                    <td style={tdStijl}>{k.relatiebeheerder || "—"}</td>
                    <td style={{ ...tdStijl, whiteSpace: "nowrap" }}>
                      {k.laatsteReview ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Sterren n={k.laatsteReview.sterren} /> {datumKort(k.laatsteReview.datum)}
                        </span>
                      ) : (
                        <span style={{ color: KLEUR.mutedTekst }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStijl, whiteSpace: "nowrap", color: k.laatsteUitnodiging ? KLEUR.subtekst : KLEUR.mutedTekst }}>
                      {k.laatsteUitnodiging ? datumKort(k.laatsteUitnodiging) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {gefilterd.length > MAX_TOON && (
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 10 }}>
              Eerste {MAX_TOON} van {gefilterd.length} getoond — verfijn je zoekopdracht of filters
              om de rest te zien. "Alles selecteren" pakt wél de volledige gefilterde lijst.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const WIJZIG_VELD_LABELS = {
  aanhef: "Aanhef", voornaam: "Voornaam", tussenvoegsel: "Tussenvoegsel", achternaam: "Achternaam",
  functietitel: "Functietitel", mobiel: "Mobiel", email: "E-mail", geboortedatum: "Geboortedatum",
  straat: "Straat", huisnummer: "Huisnummer", toevoeging: "Toevoeging", postcode: "Postcode",
  plaats: "Plaats", provincie: "Provincie", land: "Land",
  bedrijf_straat: "Bedrijf · Straat", bedrijf_huisnummer: "Bedrijf · Huisnummer",
  bedrijf_toevoeging: "Bedrijf · Toevoeging", bedrijf_postcode: "Bedrijf · Postcode",
  bedrijf_plaats: "Bedrijf · Plaats", bedrijf_land: "Bedrijf · Land",
};

function StatusBadge({ status }) {
  const kleuren = {
    open: { bg: "#FFF4E5", tekst: "#8A5A00" },
    goedgekeurd: { bg: "#E7F3EA", tekst: "#1E6B33" },
    afgewezen: { bg: "#FBE9E9", tekst: KLEUR.rood },
  };
  const k = kleuren[status] || kleuren.open;
  const label = status === "open" ? "Wacht op goedkeuring" : status === "goedgekeurd" ? "Goedgekeurd" : "Afgewezen";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: k.bg, color: k.tekst }}>
      {label}
    </span>
  );
}

function WijzigingsverzoekBeheer({ onAfgehandeld }) {
  const [verzoeken, setVerzoeken] = useState(null);
  const [fout, setFout] = useState(false);
  const [filter, setFilter] = useState("open"); // open | alle
  const [zoek, setZoek] = useState("");
  const [bezigId, setBezigId] = useState(null);

  const laad = useCallback(() => {
    fetch("/api/beheer-wijzigingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setVerzoeken(d.verzoeken || []))
      .catch(() => {
        setVerzoeken([]);
        setFout(true);
      });
  }, []);

  useEffect(() => {
    laad();
  }, [laad]);

  const beslis = useCallback(
    async (id, actie) => {
      if (actie === "afwijzen" && !window.confirm("Dit wijzigingsverzoek afwijzen?")) return;
      setBezigId(id);
      try {
        const res = await fetch("/api/beheer-wijzigingen", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, actie }),
        });
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (actie === "goedkeuren" && d.verwerkt === false) {
          window.alert(
            "Goedgekeurd, maar automatisch verwerken in Dynamics lukte niet " +
              "(waarschijnlijk onvoldoende schrijfrechten). De gegevens staan wel klaar om handmatig door te voeren."
          );
        }
        laad();
        onAfgehandeld?.();
      } catch {
        setFout(true);
      } finally {
        setBezigId(null);
      }
    },
    [laad, onAfgehandeld]
  );

  if (verzoeken === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Wijzigingsverzoeken ophalen…
      </div>
    );
  }

  const term = zoek.trim().toLowerCase();
  const lijst = verzoeken.filter((v) => {
    if (filter !== "alle" && v.status !== "open") return false;
    if (
      term &&
      ![v.klantnaam, String(v.klantnummer ?? ""), v.aanvragerEmail, v.verwerktDoor]
        .filter(Boolean)
        .some((val) => val.toLowerCase().includes(term))
    )
      return false;
    return true;
  });
  const aantalOpen = verzoeken.filter((v) => v.status === "open").length;

  return (
    <div>
      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>
          Er ging iets mis met de wijzigingsverzoeken. Controleer of de opslag is geconfigureerd.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst }}>
          {aantalOpen} openstaand{aantalOpen === 1 ? "" : "e"} verzoek{aantalOpen === 1 ? "" : "en"}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Zoek op klant, nummer, e-mail of beoordelaar…"
              style={{ padding: "8px 10px 8px 30px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", minWidth: 240 }}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff" }}
          >
            <option value="open">Alleen openstaand</option>
            <option value="alle">Alle (ook afgehandeld)</option>
          </select>
        </div>
      </div>

      {lijst.length === 0 ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>
          {filter === "open" ? "Geen openstaande wijzigingsverzoeken." : "Nog geen wijzigingsverzoeken."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {lijst.map((v) => {
            const gewijzigd = Object.keys(WIJZIG_VELD_LABELS).filter(
              (veld) => (v.voorstel?.[veld] ?? "") !== (v.huidig?.[veld] ?? "")
            );
            return (
              <div key={v.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {v.klantnaam} <span style={{ fontSize: 12, fontWeight: 500, color: KLEUR.mutedTekst }}>· nr {v.klantnummer ?? "-"}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 2 }}>
                      Ingediend door {v.aanvragerEmail} · {new Date(v.aangevraagdOp).toLocaleString("nl-NL")}
                    </div>
                    {v.status !== "open" && v.verwerktDoor && (
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 2 }}>
                        {v.status === "afgewezen" ? "Afgewezen" : "Goedgekeurd"} door {v.verwerktDoor}
                        {v.verwerktOp ? ` · ${new Date(v.verwerktOp).toLocaleString("nl-NL")}` : ""}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px 8px", color: KLEUR.mutedTekst, fontWeight: 600, borderBottom: `1px solid ${KLEUR.rand}` }}>Veld</th>
                        <th style={{ textAlign: "left", padding: "4px 8px", color: KLEUR.mutedTekst, fontWeight: 600, borderBottom: `1px solid ${KLEUR.rand}` }}>Huidig</th>
                        <th style={{ textAlign: "left", padding: "4px 8px", color: KLEUR.mutedTekst, fontWeight: 600, borderBottom: `1px solid ${KLEUR.rand}` }}>Nieuw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gewijzigd.map((veld) => (
                        <tr key={veld}>
                          <td style={{ padding: "5px 8px", fontWeight: 600 }}>{WIJZIG_VELD_LABELS[veld]}</td>
                          <td style={{ padding: "5px 8px", color: KLEUR.subtekst }}>{v.huidig?.[veld] || "—"}</td>
                          <td style={{ padding: "5px 8px", color: KLEUR.blauw, fontWeight: 600 }}>{v.voorstel?.[veld] || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {v.status === "goedgekeurd" && v.verwerkingsfout && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: KLEUR.rood }}>
                      Automatisch verwerken lukte niet: {v.verwerkingsfout}
                    </div>
                    <button
                      onClick={() => beslis(v.id, "goedkeuren")}
                      disabled={bezigId === v.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      <CheckCircle2 size={13} /> {bezigId === v.id ? "Bezig…" : "Opnieuw verwerken"}
                    </button>
                  </div>
                )}
                {v.status === "goedgekeurd" && !v.verwerkingsfout && (
                  <div style={{ fontSize: 11.5, color: "#1E6B33", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle2 size={13} /> Verwerkt in Dynamics{v.verwerktDoor ? ` door ${v.verwerktDoor}` : ""}.
                  </div>
                )}

                {v.status === "open" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button
                      onClick={() => beslis(v.id, "goedkeuren")}
                      disabled={bezigId === v.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      <CheckCircle2 size={14} /> {bezigId === v.id ? "Bezig…" : "Goedkeuren & verwerken"}
                    </button>
                    <button
                      onClick={() => beslis(v.id, "afwijzen")}
                      disabled={bezigId === v.id}
                      style={{ padding: "8px 14px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      Afwijzen
                    </button>
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

function Scherm({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {children}
    </div>
  );
}
