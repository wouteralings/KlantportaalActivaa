import React, { useCallback, useEffect, useState } from "react";
import { Users, Loader2, LogOut, ShieldAlert, CheckCircle2, XCircle, Search, LayoutGrid, Building2 } from "lucide-react";

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

function Scherm({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {children}
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

// ── Wijzigingsverzoeken ─────────────────────────────────────────────────────
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

// ── Log klantreacties op taken ──────────────────────────────────────────────
function AkkoordenLog() {
  const [akkoordenLog, setAkkoordenLog] = useState(null); // null = laden
  const [logZoek, setLogZoek] = useState("");

  useEffect(() => {
    fetch("/api/beheer-taakakkoorden")
      .then((r) => r.json())
      .then((d) => setAkkoordenLog(d.akkoorden || []))
      .catch(() => setAkkoordenLog([]));
  }, []);

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Log — klantreacties op taken</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Wie heeft welke taak goedgekeurd of afgewezen, en wanneer. Bij "Niet akkoord" staat
        ook de toelichting van de klant erbij (die is ook per mail via de webhook verstuurd).
      </div>
      {akkoordenLog !== null && akkoordenLog.length > 0 && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            value={logZoek}
            onChange={(e) => setLogZoek(e.target.value)}
            placeholder="Zoek op taak, klant of e-mail…"
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px 8px 32px", fontSize: 13 }}
          />
        </div>
      )}
      {akkoordenLog === null ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst }}>Laden…</div>
      ) : akkoordenLog.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen reacties vastgelegd.</div>
      ) : (() => {
        const q = logZoek.trim().toLowerCase();
        const rijen = q
          ? akkoordenLog.filter((a) =>
              [a.taaktitel, a.klantnaam, a.klantnummer, a.aanvragerEmail, a.soort, a.bericht]
                .map((v) => (v == null ? "" : String(v)).toLowerCase())
                .some((v) => v.includes(q))
            )
          : akkoordenLog;
        if (rijen.length === 0) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen resultaten voor "{logZoek}".</div>;
        return (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rijen.map((a, i) => {
              const nietAkkoord = a.beslissing === "niet_akkoord";
              return (
                <div key={a.id || a.taakId} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
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
                      {a.klantnummer ? "nr " + a.klantnummer + " · " : ""}
                      {a.aanvragerEmail || "onbekend"} ·{" "}
                      {new Date(a.akkoordOp).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                    {nietAkkoord && a.bericht && (
                      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginTop: 3, whiteSpace: "pre-wrap" }}>“{a.bericht}”</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ── Ondertekeningen ─────────────────────────────────────────────────────────
function OndertekeningenLog() {
  const [handtekeningenLog, setHandtekeningenLog] = useState(null); // null = laden

  useEffect(() => {
    fetch("/api/beheer-handtekeningen")
      .then((r) => r.json())
      .then((d) => setHandtekeningenLog(d.handtekeningen || []))
      .catch(() => setHandtekeningenLog([]));
  }, []);

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Ondertekeningen</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Digitale handtekeningen die klanten via een taak hebben gezet, met downloadlink naar de
        bewijs-PDF. De PDF wordt ook in SharePoint opgeslagen (map "1. Intern / 0. Permanent dossier").
      </div>
      {handtekeningenLog === null ? (
        <div style={{ fontSize: 13, color: KLEUR.mutedTekst }}>Laden…</div>
      ) : handtekeningenLog.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen ondertekeningen vastgelegd.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {handtekeningenLog.map((h, i) => (
            <div key={h.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
              <CheckCircle2 size={16} color="#2E7D46" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.taaktitel || "(taak)"}</div>
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 2 }}>
                  {h.klantnaam ? h.klantnaam + " · " : ""}
                  Getekend door {h.naam || "onbekend"}{h.opgegevenEmail ? " (" + h.opgegevenEmail + ")" : ""} ·{" "}
                  {new Date(h.ondertekendOp).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                  {h.ip ? " · IP " + h.ip : ""}
                </div>
                {h.toelichting && <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 3, whiteSpace: "pre-wrap" }}>“{h.toelichting}”</div>}
                <div style={{ marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {h.sharepointUrl && (
                    <a href={h.sharepointUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: KLEUR.blauw, textDecoration: "none" }}>Bewijs in SharePoint</a>
                  )}
                  {h.blobNaam && (
                    <a href={`/api/beheer-handtekeningen?blob=${encodeURIComponent(h.blobNaam)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: KLEUR.blauw, textDecoration: "none" }}>Download bewijs-PDF</a>
                  )}
                  {!h.sharepointUrl && h.sharepointFout && (
                    <span style={{ fontSize: 11.5, color: KLEUR.rood }}>SharePoint-opslag mislukt ({h.sharepointFout})</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Medewerkersportaal ──────────────────────────────────────────────────────
export default function MedewerkerPortaal() {
  const [status, setStatus] = useState("laden"); // laden | nietIngelogd | geenRol | klaar
  const [gebruiker, setGebruiker] = useState(null);
  const [isBeheerder, setIsBeheerder] = useState(false);
  const [tab, setTab] = useState("verzoeken"); // verzoeken | reacties | ondertekeningen
  const [openWijzigingen, setOpenWijzigingen] = useState(0);

  const laadTellingen = useCallback(() => {
    fetch("/api/beheer-tellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOpenWijzigingen(d.openWijzigingen || 0))
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
        setIsBeheerder(rollen.includes("beheerder"));
        // Zowel medewerkers als beheerders mogen erin (beheerder = superset).
        setStatus(rollen.includes("medewerker") || rollen.includes("beheerder") ? "klaar" : "geenRol");
      })
      .catch(() => setStatus("nietIngelogd"));
  }, []);

  useEffect(() => {
    if (status !== "klaar") return;
    fetch("/api/instellingen")
      .then((r) => r.json())
      .then((d) => zetBrowserFavicon(d.faviconUrl))
      .catch(() => {});
    laadTellingen();
  }, [status, laadTellingen]);

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
        <Users size={32} color={KLEUR.blauw} />
        <div style={{ fontSize: 20, fontWeight: 600 }}>Medewerkersportaal</div>
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, marginBottom: 8 }}>Log in met je Microsoft-account.</div>
        <a
          href={`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent("/medewerker")}`}
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
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, textAlign: "center", maxWidth: 340 }}>
          Je bent ingelogd als {gebruiker?.userDetails}, maar hebt niet de rol <strong>medewerker</strong>.
          Vraag iemand met beheerrechten om die rol toe te kennen via Static Web Apps &gt; Role management.
        </div>
      </Scherm>
    );
  }

  const tabs = [
    ["verzoeken", "Wijzigingsverzoeken", openWijzigingen],
    ["reacties", "Log klantreacties", 0],
    ["ondertekeningen", "Ondertekeningen", 0],
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={20} color={KLEUR.blauw} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Medewerkersportaal</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{gebruiker?.userDetails}</span>
          {isBeheerder && (
            <a href="/beheer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw, textDecoration: "none" }}>
              <Building2 size={13} /> Beheer
            </a>
          )}
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.blauw, textDecoration: "none" }}>
            <LayoutGrid size={13} /> Klantportaal
          </a>
          <a href="/.auth/logout" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.subtekst, textDecoration: "none" }}>
            <LogOut size={13} /> Uitloggen
          </a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${KLEUR.rand}` }}>
        {tabs.map(([k, label, badge]) => (
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
                title={`${badge} openstaand`}
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
        ))}
      </div>

      {tab === "verzoeken" && <WijzigingsverzoekBeheer onAfgehandeld={laadTellingen} />}
      {tab === "reacties" && <AkkoordenLog />}
      {tab === "ondertekeningen" && <OndertekeningenLog />}
    </div>
  );
}
