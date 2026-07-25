import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ClipboardList,
  FileText,
  CheckCircle2,
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
} from "lucide-react";
import { haalApiToken } from "./msal";

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

const TABS = [
  { key: "home", label: "Home", icon: ClipboardList },
  { key: "gegevens", label: "Mijn gegevens", icon: Building2 },
  { key: "documenten", label: "Documenten", icon: FileText },
  { key: "faq", label: "Veelgestelde vragen", icon: HelpCircle },
  { key: "review", label: "Review geven", icon: Star },
];

export default function KlantPortaal() {
  const [ingelogd, setIngelogd] = useState(null); // null = nog aan het checken
  const [gebruiker, setGebruiker] = useState(null);
  const [tab, setTab] = useState("home");
  const [fout, setFout] = useState("");

  const [mijnGegevens, setMijnGegevens] = useState(null);
  const [taken, setTaken] = useState(null);
  const [content, setContent] = useState(null);
  const [nieuws, setNieuws] = useState(null);
  const [documenten, setDocumenten] = useState(null);
  const [documentenStatus, setDocumentenStatus] = useState("nietOpgehaald");
  const [documentenFoutmelding, setDocumentenFoutmelding] = useState("");
  const [teamsChatUrl, setTeamsChatUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [wijzigingFormNawUrl, setWijzigingFormNawUrl] = useState("");
  const [wijzigingFormContactUrl, setWijzigingFormContactUrl] = useState("");

  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => {
        const principal = data.clientPrincipal;
        setIngelogd(!!principal);
        setGebruiker(principal);
      })
      .catch(() => setIngelogd(false));
  }, []);

  useEffect(() => {
    fetch("/api/instellingen")
      .then((r) => r.json())
      .then((d) => {
        setTeamsChatUrl(d.teamsChatUrl || "");
        setLogoUrl(d.logoUrl || "");
        setWijzigingFormNawUrl(d.wijzigingFormNawUrl || "");
        setWijzigingFormContactUrl(d.wijzigingFormContactUrl || "");
      })
      .catch(() => {}); // niet-kritisch
  }, []);

  useEffect(() => {
    if (!ingelogd) return;
    fetch("/api/mijn-gegevens")
      .then((r) => r.json())
      .then(setMijnGegevens)
      .catch((e) => setFout(String(e)));
    fetch("/api/taken")
      .then((r) => r.json())
      .then(setTaken)
      .catch((e) => setFout(String(e)));
    fetch("/api/mijn-content")
      .then((r) => r.json())
      .then(setContent)
      .catch((e) => setFout(String(e)));
    fetch("/api/nieuws")
      .then((r) => r.json())
      .then(setNieuws)
      .catch(() => setNieuws([])); // niet-kritisch, portaal blijft verder werken
  }, [ingelogd]);

  const handelTaakAf = useCallback(async (taakId) => {
    const vorigeTaken = taken;
    setTaken((huidig) =>
      huidig.map((groep) => ({ ...groep, taken: groep.taken.filter((t) => t.id !== taakId) }))
    );
    try {
      const res = await fetch(`/api/taken?id=${taakId}`, { method: "PATCH" });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      setTaken(vorigeTaken); // terugzetten bij een fout
      setFout("Afhandelen is niet gelukt: " + String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken]);

  const haalDocumentenOp = useCallback(async () => {
    if (documentenStatus === "laden") return; // voorkomt dubbele, gelijktijdige aanvragen
    setDocumentenStatus("laden");
    setFout("");
    try {
      const token = await haalApiToken();
      const res = await fetch("/api/documenten", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setDocumenten(await res.json());
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
  }, [documentenStatus]);

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

  if (ingelogd === null) return <Laadscherm />;
  if (!ingelogd) return <Inlogscherm logoUrl={logoUrl} />;

  return (
    <div className="kp-container" style={{ maxWidth: 880, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <Header gebruiker={gebruiker} logoUrl={logoUrl} />
      <Tabs tab={tab} setTab={setTab} />

      {fout && <Foutmelding tekst={fout} onSluiten={() => setFout("")} />}

      {tab === "home" && (
        <>
          <Kopje tekst="Open taken" />
          <TabTaken data={taken} onAfhandelen={handelTaakAf} />

          {content?.programmas?.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <Kopje tekst="Links" />
              <TabLinks programmas={content.programmas} />
            </div>
          )}

          <div style={{ marginTop: 28 }}>
            <Kopje tekst="Mededelingen" />
            <TabMededelingen content={content} />
          </div>

          {nieuws && nieuws.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <Kopje tekst="Nieuws & blog" />
              <TabNieuws nieuws={nieuws} />
            </div>
          )}
        </>
      )}
      {tab === "gegevens" && (
        <TabGegevens data={mijnGegevens} wijzigingFormNawUrl={wijzigingFormNawUrl} wijzigingFormContactUrl={wijzigingFormContactUrl} />
      )}
      {tab === "documenten" && (
        <TabDocumenten
          status={documentenStatus}
          data={documenten}
          foutmelding={documentenFoutmelding}
          onOphalen={haalDocumentenOp}
          onLabelWijzigen={wijzigLabel}
          onEntiteitWijzigen={wijzigEntiteit}
        />
      )}
      {tab === "faq" && <TabFaq content={content} teamsChatUrl={teamsChatUrl} />}
      {tab === "review" && <TabReview onVerzenden={verstuurReview} />}
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
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" style={{ maxHeight: 36, maxWidth: 160, objectFit: "contain" }} />
        ) : (
          <>
            <Building2 size={22} color={KLEUR.blauw} />
            <div style={{ fontSize: 19, fontWeight: 600 }}>Klantportaal</div>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="kp-header-email" style={{ fontSize: 13, color: KLEUR.subtekst }}>{gebruiker?.userDetails}</span>
        <a href="/.auth/logout" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: KLEUR.subtekst, textDecoration: "none", flexShrink: 0 }}>
          <LogOut size={14} /> Uitloggen
        </a>
      </div>
    </div>
  );
}

function Tabs({ tab, setTab }) {
  return (
    <div className="kp-tabs-wrap">
      <div className="kp-tabs" style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: `1px solid ${KLEUR.rand}` }}>
        {TABS.map(({ key, label, icon: Icon }) => (
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

function TabMededelingen({ content }) {
  if (!content) return <Laadscherm />;
  const { mededelingen = [] } = content;

  return (
    <div>
      {mededelingen.length === 0 ? (
        <LegeStaat tekst="Geen mededelingen op dit moment." />
      ) : (
        mededelingen.map((m) => (
          <div key={m.id} style={kaartStijl}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{m.titel}</div>
              <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
                {new Date(m.aangemaaktOp).toLocaleDateString("nl-NL")}
              </div>
            </div>
            <div style={{ fontSize: 13, color: KLEUR.subtekst, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.tekst}</div>
          </div>
        ))
      )}
    </div>
  );
}

function TabNieuws({ nieuws }) {
  if (!nieuws) return <Laadscherm />;
  if (nieuws.length === 0) return <LegeStaat tekst="Geen nieuws of blogposts op dit moment." />;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {nieuws.map((n) => (
        <a
          key={n.url}
          href={n.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...kaartStijl, margin: 0, textDecoration: "none", color: "inherit", display: "block" }}
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
      ))}
    </div>
  );
}

function TabFaq({ content, teamsChatUrl }) {
  const [open, setOpen] = useState(null);
  if (!content) return <Laadscherm />;
  const faqs = content.faqs || [];

  return (
    <div>
      {teamsChatUrl && (
        <div style={{ ...kaartStijl, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MessagesSquare size={20} color={KLEUR.blauw} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Vraag niet gevonden?</div>
              <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Chat direct met onze assistent in Microsoft Teams.</div>
            </div>
          </div>
          <a href={teamsChatUrl} target="_blank" rel="noopener noreferrer" style={knopStijlPrimair}>
            <MessagesSquare size={14} /> Chat in Teams
          </a>
        </div>
      )}

      {faqs.length === 0 ? (
        <LegeStaat tekst="Nog geen veelgestelde vragen beschikbaar." />
      ) : (
        <div style={kaartStijl}>
          {faqs.map((f, i) => (
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

function TabGegevens({ data, wijzigingFormNawUrl, wijzigingFormContactUrl }) {
  if (!data) return <Laadscherm />;
  if (data.accounts?.length === 0) return <LegeStaat tekst="Er zijn nog geen klantgegevens aan jouw account gekoppeld." />;

  return (
    <div>
      {data.accounts.map((acc) => (
        <div key={acc.accountId} style={kaartStijl}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{acc.klantnaam}</div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Klantnummer {acc.klantnummer}</div>
          </div>
          <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>Contactpersoon: {acc.contactpersoon}</div>

          <div className="kp-grid-2">
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: KLEUR.mutedTekst, marginBottom: 8 }}>NAW-gegevens</div>
              <div style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 4 }}>
                <MapPin size={14} color={KLEUR.mutedTekst} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{acc.naw.straat}<br />{acc.naw.postcode} {acc.naw.plaats}</span>
              </div>
              <WijzigLink
                url={vulLinkIn(wijzigingFormNawUrl, {
                  klantnummer: acc.klantnummer,
                  bedrijfsnaam: acc.naw.bedrijfsnaam || acc.klantnaam,
                  straat: acc.naw.straat,
                  postcode: acc.naw.postcode,
                  plaats: acc.naw.plaats,
                })}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: KLEUR.mutedTekst, marginBottom: 8 }}>Relatiegegevens</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}>
                <Mail size={14} color={KLEUR.mutedTekst} /> {acc.relatiegegevens.email || "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Phone size={14} color={KLEUR.mutedTekst} /> {acc.relatiegegevens.telefoon || "—"}
              </div>
              <WijzigLink
                url={vulLinkIn(wijzigingFormContactUrl, {
                  klantnummer: acc.klantnummer,
                  contactpersoon: acc.contactpersoon,
                  email: acc.relatiegegevens.email,
                  telefoon: acc.relatiegegevens.telefoon,
                })}
              />
            </div>
          </div>

          {acc.adviseur && (acc.adviseur.naam || acc.adviseur.email || acc.adviseur.telefoon) && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${KLEUR.rand}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: KLEUR.mutedTekst, marginBottom: 8 }}>
                Jouw persoonlijke adviseur
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                <User size={14} color={KLEUR.mutedTekst} /> {acc.adviseur.naam || "—"}
              </div>
              {acc.adviseur.email && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                  <Mail size={14} color={KLEUR.mutedTekst} /> {acc.adviseur.email}
                </div>
              )}
              {acc.adviseur.telefoon && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <Phone size={14} color={KLEUR.mutedTekst} /> {acc.adviseur.telefoon}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TabTaken({ data, onAfhandelen }) {
  if (!data) return <Laadscherm />;
  const totaalOpen = data.reduce((som, groep) => som + groep.taken.length, 0);
  if (totaalOpen === 0) return <LegeStaat tekst="Geen openstaande taken — helemaal bij." />;

  return (
    <div>
      {data.map((groep) => (
        <div key={groep.accountId} style={kaartStijl}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: groep.taken.length ? 14 : 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{groep.klantnaam}</div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Klantnummer {groep.klantnummer}</div>
          </div>
          {groep.taken.length === 0 ? (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen openstaande taken.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {groep.taken.map((taak) => (
                <div key={taak.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <button
                    onClick={() => onAfhandelen(taak.id)}
                    title="Markeer als afgehandeld"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 1 }}
                  >
                    <Circle size={18} color={KLEUR.blauw} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{taak.titel}</div>
                    {taak.omschrijving && <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginTop: 2 }}>{taak.omschrijving}</div>}
                    {taak.deadline && (
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
                        Deadline: {new Date(taak.deadline).toLocaleDateString("nl-NL")}
                      </div>
                    )}
                    {taak.uploadLink && (
                      <div style={{ marginTop: 10 }}>
                        <a
                          href={taak.uploadLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px",
                            background: KLEUR.blauw, color: "#fff", borderRadius: 6, fontSize: 12.5,
                            fontWeight: 600, textDecoration: "none",
                          }}
                        >
                          <Upload size={13} /> Bestanden uploaden
                        </a>
                        {taak.uploadVerloopt && (
                          <span style={{ display: "inline-block", marginLeft: 10, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                            Link verloopt op {new Date(taak.uploadVerloopt).toLocaleDateString("nl-NL")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TabDocumenten({ status, data, foutmelding, onOphalen, onLabelWijzigen, onEntiteitWijzigen }) {
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

  if (!data || data.length === 0) return <LegeStaat tekst="Er is nog niets met jou gedeeld in SharePoint." />;

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={onOphalen} style={{ ...knopStijlSecundair, fontSize: 12 }}><RefreshCw size={12} /> Vernieuwen</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {data.map((item) => (
          <div key={item.id} className="kp-doc-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
            <FileText size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} />
            <div className="kp-doc-name" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
                {item.entiteit && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>
                    {item.entiteit}
                  </span>
                )}
              </div>
              {item.label !== item.naam && (
                <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Oorspronkelijke naam: {item.naam}</div>
              )}
            </div>
            {item.gewijzigd && (
              <div className="kp-doc-date" style={{ fontSize: 11.5, color: KLEUR.mutedTekst, flexShrink: 0 }}>
                {new Date(item.gewijzigd).toLocaleDateString("nl-NL")}
              </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}

function TabReview({ onVerzenden }) {
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
        disabled={sterren === 0 || status === "versturen"}
        style={{ ...knopStijlPrimair, opacity: sterren === 0 ? 0.5 : 1 }}
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
