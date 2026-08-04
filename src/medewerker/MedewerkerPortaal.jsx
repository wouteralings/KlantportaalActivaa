import React, { useCallback, useEffect, useRef, useState } from "react";
import { Users, Loader2, LogOut, ShieldAlert, CheckCircle2, XCircle, Search, LayoutGrid, Building2, Star, Mail, Eye, FileText, Coins, Wallet, Plus, Trash2, ChevronRight, ArrowLeft, Lock, Copy, X, ExternalLink, Upload } from "lucide-react";
import { startMeekijken } from "../meekijken";
import OffertesModule from "./OffertesModule";
import ContractenOverzicht from "./ContractenOverzicht";
import Vragenlijsten from "./Vragenlijsten";
import VragenlijstDetail from "./VragenlijstDetail";
import Urenregistratie from "./uren/Urenregistratie";
import ScopeToggle, { useMijnNaam, isKlantVanMij } from "./MijnFilter";
import ContactpersonenOverzicht from "./klanten/ContactpersonenOverzicht";
import NogInTeRichten from "./klanten/NogInTeRichten";
import Logboek from "./klanten/Logboek";
import KlantVasteUitvragen from "./klanten/KlantVasteUitvragen";

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
  // Facturatiemodule → Bedrijfsgegevens (type "bedrijfsgegevens_facturatie"); straat/huisnummer/
  // toevoeging/postcode/plaats/land hierboven worden hergebruikt, dit zijn alleen de extra velden.
  bedrijfsnaam: "Bedrijfsnaam", kvkNummer: "KvK-nummer", btwNummer: "BTW-nummer",
  iban: "IBAN", ibanTenaamstelling: "Tenaamstelling IBAN",
  // Bezittingenmodule → "niet meer in bezit" (type "bezitting_niet_meer_in_bezit").
  bezitting: "Bezitting", reden: "Reden",
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
          const verzoek = verzoeken?.find((x) => x.id === id);
          const doel = verzoek?.type === "bedrijfsgegevens_facturatie" ? "de database" : "Dynamics";
          window.alert(
            `Goedgekeurd, maar automatisch verwerken in ${doel} lukte niet ` +
              "(waarschijnlijk onvoldoende schrijfrechten/verbinding). De gegevens staan wel klaar om handmatig door te voeren."
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
    [laad, onAfgehandeld, verzoeken]
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
                    <CheckCircle2 size={13} />
                    {v.type === "bezitting_niet_meer_in_bezit"
                      ? "Gezien"
                      : `Verwerkt${v.type === "bedrijfsgegevens_facturatie" ? "" : " in Dynamics"}`}
                    {v.verwerktDoor ? ` door ${v.verwerktDoor}` : ""}.
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

// ── Reviews & uitnodigingen ─────────────────────────────────────────────────
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
  const [toonAantal, setToonAantal] = useState(25);

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

  const zichtbaar = gefilterd.slice(0, toonAantal);
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
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
              {Math.min(toonAantal, gefilterd.length)} van {gefilterd.length} getoond
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
              {[[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]].map(([n, lbl]) => (
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
        </>
      )}
    </div>
  );
}

// ── Klantoverzicht ──────────────────────────────────────────────────────────
function Veld({ label, waarde, link }) {
  if (!waarde) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 2 }}>{label}</div>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: KLEUR.blauw, textDecoration: "none", wordBreak: "break-word" }}>{waarde}</a>
      ) : (
        <div style={{ fontSize: 13, color: KLEUR.tekst }}>{waarde}</div>
      )}
    </div>
  );
}

// Bouwt een adres op als losse regels: straat+nr / postcode plaats / land.
function adresRegels(adres) {
  const a = adres || {};
  return [
    [a.straat, a.huisnummer, a.toevoeging].filter(Boolean).join(" "),
    [a.postcode, a.plaats].filter(Boolean).join(" "),
    a.land || "",
  ].filter(Boolean);
}

// Toont een adres onder een label, elke regel onder elkaar.
function AdresVeld({ label, adres }) {
  const regels = adresRegels(adres);
  if (regels.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 2 }}>{label}</div>
      {regels.map((r, i) => <div key={i} style={{ fontSize: 13, color: KLEUR.tekst }}>{r}</div>)}
    </div>
  );
}

function TerugKnop({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, padding: "6px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
    >
      ← Terug naar overzicht
    </button>
  );
}

function veldInput(waarde, onChange, placeholder) {
  return (
    <input
      value={waarde}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || ""}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, marginBottom: 8 }}
    />
  );
}

// Zoek-en-kies veld voor een medewerker of contactpersoon. zoek(term) → [{id, naam, sub}] (sync of async).
function ZoekKiezer({ label, huidigeNaam, zoek, onKies, onWis }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (!open) return;
    let actief = true;
    Promise.resolve(zoek(term)).then((r) => { if (actief) setRes(r || []); }).catch(() => { if (actief) setRes([]); });
    return () => { actief = false; };
  }, [term, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const lblStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 4 };
  const itemStijl = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", cursor: "pointer", fontSize: 12.5, color: KLEUR.tekst };
  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <div style={lblStijl}>{label}</div>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", textAlign: "left", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: "#fff", cursor: "pointer" }}>
        {huidigeNaam || <span style={{ color: KLEUR.mutedTekst }}>— kies —</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 61, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", padding: 6, maxHeight: 260, overflowY: "auto" }}>
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Zoek…" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 8px", fontSize: 12.5, marginBottom: 4 }} />
            <button onClick={() => { onWis(); setOpen(false); setTerm(""); }} style={{ ...itemStijl, color: KLEUR.mutedTekst }}>— geen —</button>
            {res.map((r) => (
              <button key={r.id} onClick={() => { onKies(r.id, r.naam); setOpen(false); setTerm(""); }} style={itemStijl}>
                {r.naam}{r.sub ? <span style={{ color: KLEUR.mutedTekst }}>{" · " + r.sub}</span> : null}
              </button>
            ))}
            {res.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Typ om te zoeken…</div>}
          </div>
        </>
      )}
    </div>
  );
}

const CHOICE_VELD = { clienttype: "businesstypecode", status: "cr283_clienttype", team: "cr283_team", kantoor: "cr283_kantoor" };
const TEAM_ROLLEN = [["manager", "Manager"], ["accountant", "Accountant"], ["assistent", "Assistent"], ["backup", "Back-up"], ["fiscaal", "Fiscaal medewerker"], ["loon", "Loonadministratie"]];
const TEAM_BRON = { manager: "manager", accountant: "accountantPersoon", assistent: "assistent", backup: "backup", fiscaal: "fiscaalMedewerker", loon: "loonadministratie" };

// Velden die in bulk (op meerdere klanten tegelijk) aangepast kunnen worden.
// soort "team" → koppelt een medewerker (systemuser); soort "keuze" → zet een keuzelijst-waarde.
const BULK_VELDEN = [
  { key: "manager", label: "Manager", soort: "team", bron: "manager" },
  { key: "accountant", label: "Accountant", soort: "team", bron: "accountantPersoon" },
  { key: "assistent", label: "Assistent", soort: "team", bron: "assistent" },
  { key: "backup", label: "Back-up", soort: "team", bron: "backup" },
  { key: "fiscaal", label: "Fiscaal medewerker", soort: "team", bron: "fiscaalMedewerker" },
  { key: "loon", label: "Loonadministratie", soort: "team", bron: "loonadministratie" },
  { key: "team", label: "Team", soort: "keuze", lijst: "team" },
  { key: "kantoor", label: "Kantoor", soort: "keuze", lijst: "kantoor" },
  { key: "clienttype", label: "Cliënttype", soort: "keuze", lijst: "clienttype" },
  { key: "status", label: "Status", soort: "keuze", lijst: "status" },
];

// Bulk-bewerkpaneel: kies één veld en één waarde, pas toe op alle geselecteerde klanten.
function BulkBewerken({ aantal, keuzes, medewerkers, onKlaar, onToepassen }) {
  const [veldKey, setVeldKey] = useState("");
  const [teamSel, setTeamSel] = useState({ waarde: "", naam: "", gekozen: false });
  const [keuzeVal, setKeuzeVal] = useState("__none__");
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [resultaat, setResultaat] = useState(null); // { gelukt, mislukt }
  const veld = BULK_VELDEN.find((v) => v.key === veldKey) || null;
  const alleMedewerkers = medewerkers || [];
  const zoekMedewerker = (term) => {
    const q = term.trim().toLowerCase();
    return alleMedewerkers
      .filter((m) => !q || m.naam.toLowerCase().includes(q) || (m.functie || "").toLowerCase().includes(q))
      .slice(0, 30)
      .map((m) => ({ id: m.id, naam: m.naam, sub: m.functie }));
  };
  const kiesVeld = (k) => { setVeldKey(k); setTeamSel({ waarde: "", naam: "", gekozen: false }); setKeuzeVal("__none__"); setResultaat(null); setStatus("invoer"); };

  const klaarOmToe = veld && (veld.soort === "team" ? teamSel.gekozen : keuzeVal !== "__none__");
  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 4 };

  const toepassen = async () => {
    if (!klaarOmToe) return;
    let waarde, naam;
    if (veld.soort === "team") {
      waarde = teamSel.waarde; // "" = loskoppelen
      naam = teamSel.naam;
    } else {
      waarde = keuzeVal === "__leeg__" ? "" : keuzeVal;
      const o = (keuzes[veld.lijst] || []).find((x) => String(x.value) === String(keuzeVal));
      naam = o ? o.label : "";
    }
    const omschrijving = waarde === "" ? "leegmaken" : `"${naam}"`;
    if (!window.confirm(`Weet je zeker dat je "${veld.label}" bij ${aantal} klant${aantal === 1 ? "" : "en"} wilt ${waarde === "" ? "leegmaken" : `wijzigen naar ${omschrijving}`}?`)) return;
    setStatus("bezig");
    try {
      const d = await onToepassen(veld, waarde, naam);
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
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bulk-aanpassing</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14 }}>
          De gekozen waarde wordt toegepast op <strong>{aantal}</strong> geselecteerde klant{aantal === 1 ? "" : "en"}.
        </div>

        <div style={label}>Veld</div>
        <select value={veldKey} onChange={(e) => kiesVeld(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, marginBottom: 10, background: "#fff" }}>
          <option value="">— kies een veld —</option>
          {BULK_VELDEN.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>

        {veld && veld.soort === "team" && (
          <ZoekKiezer
            label={`Nieuwe ${veld.label.toLowerCase()}`}
            huidigeNaam={teamSel.gekozen ? (teamSel.naam || "(leegmaken)") : ""}
            zoek={zoekMedewerker}
            onKies={(id, naam) => setTeamSel({ waarde: id, naam, gekozen: true })}
            onWis={() => setTeamSel({ waarde: "", naam: "", gekozen: true })}
          />
        )}
        {veld && veld.soort === "keuze" && (
          <div>
            <div style={label}>Nieuwe waarde</div>
            <select value={keuzeVal} onChange={(e) => setKeuzeVal(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, marginBottom: 8, background: "#fff" }}>
              <option value="__none__" disabled>— kies waarde —</option>
              {(keuzes[veld.lijst] || []).map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
              <option value="__leeg__">— leegmaken —</option>
            </select>
          </div>
        )}

        {resultaat && (
          <div style={{ fontSize: 12.5, marginTop: 6, marginBottom: 4, color: resultaat.mislukt && resultaat.mislukt.length ? KLEUR.rood : "#2E7D46" }}>
            {resultaat.gelukt} gewijzigd{resultaat.mislukt && resultaat.mislukt.length ? ` · ${resultaat.mislukt.length} mislukt (mogelijk onvoldoende schrijfrechten in Dynamics)` : ""}.
          </div>
        )}
        {status === "fout" && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 6 }}>Bulk-aanpassing mislukt, probeer het nog eens.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={toepassen} disabled={!klaarOmToe || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaarOmToe ? "#2E7D46" : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaarOmToe ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Bezig…" : "Toepassen"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sluiten</button>
        </div>
      </div>
    </>
  );
}

// Bulk: één vragenlijst in één keer naar meerdere geselecteerde cliënten (primaire contactpersoon).
function BulkVragenlijst({ accountIds, onKlaar, onKlaarEnVervers }) {
  const [lijsten, setLijsten] = useState([]);
  const [lijstId, setLijstId] = useState("");
  const [jaar, setJaar] = useState("");
  const [deadline, setDeadline] = useState("");
  const [modus, setModus] = useState("versturen");
  const [status, setStatus] = useState("invoer"); // invoer | bezig | klaar | fout
  const [res, setRes] = useState(null);
  const [fout, setFout] = useState("");
  const aantal = accountIds.length;

  useEffect(() => {
    fetch("/api/medewerker-aanleververzoeken")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setLijsten(d.lijsten || []))
      .catch(() => {});
  }, []);

  const versturen = async () => {
    if (!lijstId) { setFout("Kies een vragenlijst."); return; }
    const gekozen = lijsten.find((l) => l.id === lijstId);
    if (!window.confirm(`Vragenlijst "${gekozen ? gekozen.naam : ""}" ${modus === "versturen" ? "versturen naar" : "als concept klaarzetten bij"} ${aantal} cliënt${aantal === 1 ? "" : "en"}?`)) return;
    setStatus("bezig"); setFout("");
    try {
      const r = await fetch("/api/medewerker-aanleververzoeken", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "bulk-uitzetten", accountIds, lijstId, jaar, deadline, modus }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRes(d); setStatus("klaar");
    } catch (e) { setFout(e.message || "Versturen mislukt."); setStatus("fout"); }
  };

  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 8 };
  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, background: "#fff" };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 440, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Vragenlijst versturen</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 6 }}>
          Wordt uitgezet bij <strong>{aantal}</strong> geselecteerde cliënt{aantal === 1 ? "" : "en"}, naar de <strong>primaire contactpersoon</strong> van elke cliënt.
        </div>

        {status === "klaar" && res ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, color: KLEUR.groen, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={15} /> {res.aangemaakt} verstuurd{res.mislukt && res.mislukt.length ? ` · ${res.mislukt.length} overgeslagen` : ""}.</div>
            {res.mislukt && res.mislukt.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: KLEUR.subtekst, maxHeight: 160, overflowY: "auto" }}>
                {res.mislukt.map((m, i) => <div key={i}>• {m.klantnaam || m.accountId}: {m.reden}</div>)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={onKlaarEnVervers} style={{ padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Klaar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={label}>Vragenlijst</div>
            <select value={lijstId} onChange={(e) => setLijstId(e.target.value)} style={veld}>
              <option value="">— kies een aanleverlijst —</option>
              {lijsten.map((l) => <option key={l.id} value={l.id}>{l.naam}{l.aantalRegels ? ` (${l.aantalRegels})` : ""}</option>)}
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={label}>Jaar (optioneel)</div>
                <input value={jaar} onChange={(e) => setJaar(e.target.value)} placeholder="2025" style={veld} />
              </div>
              <div>
                <div style={label}>Deadline (optioneel)</div>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={veld} />
              </div>
            </div>

            <div style={label}>Bij versturen</div>
            <select value={modus} onChange={(e) => setModus(e.target.value)} style={veld}>
              <option value="versturen">Direct zichtbaar voor de klant</option>
              <option value="concept">Concept klaarzetten (later vrijgeven)</option>
            </select>

            {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>{fout}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={versturen} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <CheckCircle2 size={14} /> {status === "bezig" ? "Bezig…" : `Versturen (${aantal})`}
              </button>
              <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function KlantBewerken({ klant, keuzes, medewerkers, onKlaar, onOpgeslagen }) {
  const kz = keuzes || { clienttype: [], status: [], team: [], kantoor: [] };
  const alleMedewerkers = medewerkers || [];
  // Beginselectie voor team en contacten (id + naam), om alleen wijzigingen door te sturen.
  const teamInit = {};
  for (const [key] of TEAM_ROLLEN) { const p = klant[TEAM_BRON[key]] || {}; teamInit[key] = { id: p.id || "", naam: p.naam || "" }; }
  const [teamSel, setTeamSel] = useState(teamInit);
  const [contactSel, setContactSel] = useState({
    primair: { id: klant.contact?.contactId || "", naam: klant.contact?.naam || "" },
    secundair: { id: klant.secundairContact?.contactId || "", naam: klant.secundairContact?.naam || "" },
  });
  const zoekMedewerker = (term) => {
    const q = term.trim().toLowerCase();
    return alleMedewerkers
      .filter((m) => !q || m.naam.toLowerCase().includes(q) || (m.functie || "").toLowerCase().includes(q))
      .slice(0, 30)
      .map((m) => ({ id: m.id, naam: m.naam, sub: m.functie }));
  };
  const zoekContact = async (term) => {
    if (term.trim().length < 2) return [];
    try {
      const r = await fetch("/api/klant-contacten?zoek=" + encodeURIComponent(term.trim()));
      if (!r.ok) return [];
      const d = await r.json();
      return (d.contacten || []).map((c) => ({ id: c.id, naam: c.naam, sub: c.email }));
    } catch { return []; }
  };
  const initKeuze = (lijstKey, huidigeLabel) => {
    const opt = (kz[lijstKey] || []).find((o) => o.label === huidigeLabel);
    return opt ? String(opt.value) : "";
  };
  const a = klant.adres || {};
  const c = klant.contact || {};
  const [f, setF] = useState({
    name: klant.klantnaam || "",
    straat: a.straat || "", huisnummer: a.huisnummer || "", toevoeging: a.toevoeging || "",
    postcode: a.postcode || "", plaats: a.plaats || "", land: a.land || "",
    telefoonKlant: klant.telefoonKlant || "", emailKlant: klant.emailKlant || "",
    clienttypeVal: initKeuze("clienttype", klant.clienttype), statusVal: initKeuze("status", klant.status),
    teamVal: initKeuze("team", klant.team), kantoorVal: initKeuze("kantoor", klant.kantoor),
    voornaam: c.voornaam || "", tussenvoegsel: c.tussenvoegsel || "", achternaam: c.achternaam || "",
    functietitel: c.functietitel || "", cEmail: c.email || "", cTelefoon: c.telefoon || "",
    cStraat: (c.adres && c.adres.straat) || "", cHuisnummer: (c.adres && c.adres.huisnummer) || "", cToevoeging: (c.adres && c.adres.toevoeging) || "",
    cPostcode: (c.adres && c.adres.postcode) || "", cPlaats: (c.adres && c.adres.plaats) || "", cLand: (c.adres && c.adres.land) || "",
  });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));
  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 4 };

  const opslaan = async () => {
    setStatus("bezig");
    try {
      const account = {
        name: f.name, address1_line1: f.straat, cr283_huisnummer: f.huisnummer,
        cr283_huisnummertoevoeging: f.toevoeging, address1_postalcode: f.postcode,
        address1_city: f.plaats, address1_country: f.land,
        telephone1: f.telefoonKlant, emailaddress1: f.emailKlant,
      };
      // Classificatie-keuzevelden: alleen meesturen als er een waarde is gekozen (numeriek).
      if (f.clienttypeVal !== "") account[CHOICE_VELD.clienttype] = Number(f.clienttypeVal);
      if (f.statusVal !== "") account[CHOICE_VELD.status] = Number(f.statusVal);
      if (f.teamVal !== "") account[CHOICE_VELD.team] = Number(f.teamVal);
      if (f.kantoorVal !== "") account[CHOICE_VELD.kantoor] = Number(f.kantoorVal);
      const contact = {
        firstname: f.voornaam, middlename: f.tussenvoegsel, lastname: f.achternaam,
        jobtitle: f.functietitel, emailaddress1: f.cEmail, mobilephone: f.cTelefoon,
        address1_line1: f.cStraat, cr283_huisnummer: f.cHuisnummer, cr283_huisnummertoevoeging: f.cToevoeging,
        address1_postalcode: f.cPostcode, address1_city: f.cPlaats, address1_country: f.cLand,
      };
      // Team en contacten: alleen gewijzigde koppelingen meesturen (GUID = koppelen, "" = loskoppelen).
      const team = {};
      for (const [key] of TEAM_ROLLEN) if ((teamSel[key].id || "") !== (teamInit[key].id || "")) team[key] = teamSel[key].id || "";
      const contacten = {};
      if ((contactSel.primair.id || "") !== (klant.contact?.contactId || "")) contacten.primair = contactSel.primair.id || "";
      if ((contactSel.secundair.id || "") !== (klant.secundairContact?.contactId || "")) contacten.secundair = contactSel.secundair.id || "";

      const res = await fetch("/api/medewerker-klant-wijzigen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: klant.accountId, contactId: klant.contact?.contactId, account, contact, team, contacten }),
      });
      if (!res.ok) throw new Error(await res.text());
      const naam = [f.voornaam, f.tussenvoegsel, f.achternaam].filter(Boolean).join(" ").trim();
      const labelVan = (lijstKey, val) => { const o = (kz[lijstKey] || []).find((x) => String(x.value) === String(val)); return o ? o.label : ""; };
      onOpgeslagen(klant.accountId, {
        klantnaam: f.name,
        adres: { straat: f.straat, huisnummer: f.huisnummer, toevoeging: f.toevoeging, postcode: f.postcode, plaats: f.plaats, land: f.land },
        telefoonKlant: f.telefoonKlant, emailKlant: f.emailKlant,
        clienttype: f.clienttypeVal !== "" ? labelVan("clienttype", f.clienttypeVal) : klant.clienttype,
        status: f.statusVal !== "" ? labelVan("status", f.statusVal) : klant.status,
        team: f.teamVal !== "" ? labelVan("team", f.teamVal) : klant.team,
        kantoor: f.kantoorVal !== "" ? labelVan("kantoor", f.kantoorVal) : klant.kantoor,
        contact: { ...klant.contact, voornaam: f.voornaam, tussenvoegsel: f.tussenvoegsel, achternaam: f.achternaam, functietitel: f.functietitel, email: f.cEmail, telefoon: f.cTelefoon, naam: naam || klant.contact?.naam, contactId: contactSel.primair.id, adres: { straat: f.cStraat, huisnummer: f.cHuisnummer, toevoeging: f.cToevoeging, postcode: f.cPostcode, plaats: f.cPlaats, land: f.cLand } },
        manager: { ...(klant.manager || {}), id: teamSel.manager.id, naam: teamSel.manager.naam },
        accountantPersoon: { ...(klant.accountantPersoon || {}), id: teamSel.accountant.id, naam: teamSel.accountant.naam },
        assistent: { ...(klant.assistent || {}), id: teamSel.assistent.id, naam: teamSel.assistent.naam },
        backup: { ...(klant.backup || {}), id: teamSel.backup.id, naam: teamSel.backup.naam },
        fiscaalMedewerker: { ...(klant.fiscaalMedewerker || {}), id: teamSel.fiscaal.id, naam: teamSel.fiscaal.naam },
        loonadministratie: { ...(klant.loonadministratie || {}), id: teamSel.loon.id, naam: teamSel.loon.naam },
        secundairContact: contactSel.secundair.id ? { ...(klant.secundairContact || {}), contactId: contactSel.secundair.id, naam: contactSel.secundair.naam } : null,
      });
      onKlaar();
    } catch {
      setStatus("fout");
    }
  };

  return (
    <div>
      <TerugKnop onClick={onKlaar} />
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Klantgegevens wijzigen</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
          <div>
            <div style={label}>Klantnaam</div>
            {veldInput(f.name, zet("name"))}
            <div style={label}>Straat</div>
            {veldInput(f.straat, zet("straat"))}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><div style={label}>Huisnr</div>{veldInput(f.huisnummer, zet("huisnummer"))}</div>
              <div style={{ flex: 1 }}><div style={label}>Toevoeging</div>{veldInput(f.toevoeging, zet("toevoeging"))}</div>
            </div>
            <div style={label}>Postcode</div>
            {veldInput(f.postcode, zet("postcode"))}
            <div style={label}>Plaats</div>
            {veldInput(f.plaats, zet("plaats"))}
            <div style={label}>Land</div>
            {veldInput(f.land, zet("land"))}
            <div style={label}>Telefoon (klant)</div>
            {veldInput(f.telefoonKlant, zet("telefoonKlant"))}
            <div style={label}>E-mail (klant)</div>
            {veldInput(f.emailKlant, zet("emailKlant"))}
            {[["Cliënttype", "clienttype", "clienttypeVal"], ["Status", "status", "statusVal"], ["Team", "team", "teamVal"], ["Kantoor", "kantoor", "kantoorVal"]].map(([lbl, lijstKey, veldKey]) => (
              (kz[lijstKey] || []).length > 0 ? (
                <div key={veldKey}>
                  <div style={label}>{lbl}</div>
                  <select
                    value={f[veldKey]}
                    onChange={(e) => zet(veldKey)(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, marginBottom: 8, background: "#fff" }}
                  >
                    <option value="">— kies —</option>
                    {kz[lijstKey].map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
                  </select>
                </div>
              ) : null
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Primair contactpersoon</div>
            <div style={label}>Voornaam</div>
            {veldInput(f.voornaam, zet("voornaam"))}
            <div style={label}>Tussenvoegsel</div>
            {veldInput(f.tussenvoegsel, zet("tussenvoegsel"))}
            <div style={label}>Achternaam</div>
            {veldInput(f.achternaam, zet("achternaam"))}
            <div style={label}>Functietitel</div>
            {veldInput(f.functietitel, zet("functietitel"))}
            <div style={label}>E-mail</div>
            {veldInput(f.cEmail, zet("cEmail"))}
            <div style={label}>Telefoon</div>
            {veldInput(f.cTelefoon, zet("cTelefoon"))}
            <div style={label}>Straat</div>
            {veldInput(f.cStraat, zet("cStraat"))}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><div style={label}>Huisnr</div>{veldInput(f.cHuisnummer, zet("cHuisnummer"))}</div>
              <div style={{ flex: 1 }}><div style={label}>Toevoeging</div>{veldInput(f.cToevoeging, zet("cToevoeging"))}</div>
            </div>
            <div style={label}>Postcode</div>
            {veldInput(f.cPostcode, zet("cPostcode"))}
            <div style={label}>Plaats</div>
            {veldInput(f.cPlaats, zet("cPlaats"))}
            <div style={label}>Land</div>
            {veldInput(f.cLand, zet("cLand"))}
          </div>
        </div>

        <div style={{ marginTop: 8, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Team</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
            {TEAM_ROLLEN.map(([key, lbl]) => (
              <ZoekKiezer
                key={key}
                label={lbl}
                huidigeNaam={teamSel[key].naam}
                zoek={zoekMedewerker}
                onKies={(id, naam) => setTeamSel((s) => ({ ...s, [key]: { id, naam } }))}
                onWis={() => setTeamSel((s) => ({ ...s, [key]: { id: "", naam: "" } }))}
              />
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 8px" }}>Contactpersonen (koppelen)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
            <ZoekKiezer label="Primair contactpersoon" huidigeNaam={contactSel.primair.naam} zoek={zoekContact}
              onKies={(id, naam) => setContactSel((s) => ({ ...s, primair: { id, naam } }))} onWis={() => setContactSel((s) => ({ ...s, primair: { id: "", naam: "" } }))} />
            <ZoekKiezer label="Secundair contactpersoon" huidigeNaam={contactSel.secundair.naam} zoek={zoekContact}
              onKies={(id, naam) => setContactSel((s) => ({ ...s, secundair: { id, naam } }))} onWis={() => setContactSel((s) => ({ ...s, secundair: { id: "", naam: "" } }))} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "#2E7D46", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
          {status === "fout" && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt (mogelijk onvoldoende schrijfrechten in Dynamics).</span>}
        </div>
      </div>
    </div>
  );
}

function KlantDetail({ klant, magWijzigen, isBeheerder, keuzes, medewerkers, onTerug, onContact, onMedewerker, onOpgeslagen, onVerwijderd }) {
  const [bewerken, setBewerken] = useState(false);
  const [verwijderBezig, setVerwijderBezig] = useState(false);
  const [verwijderFout, setVerwijderFout] = useState("");
  if (bewerken) {
    return <KlantBewerken klant={klant} keuzes={keuzes} medewerkers={medewerkers} onKlaar={() => setBewerken(false)} onOpgeslagen={onOpgeslagen} />;
  }

  const verwijder = async () => {
    if (!window.confirm(`Cliënt "${klant.klantnaam || ""}" verwijderen?\n\nDe cliënt wordt op inactief gezet en verdwijnt uit het portaal; de portaal-toegang van de contactpersoon vervalt. Dit is terug te draaien in Dynamics.`)) return;
    setVerwijderBezig(true);
    setVerwijderFout("");
    try {
      const r = await fetch("/api/medewerker-klant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "verwijderen", accountId: klant.accountId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onVerwijderd && onVerwijderd(klant.accountId);
    } catch (e) {
      setVerwijderFout(e.message || "Verwijderen mislukt.");
      setVerwijderBezig(false);
    }
  };
  const MedewerkerRegel = ({ label, persoon, rol }) => {
    if (!persoon || !persoon.naam) return null;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 2 }}>{label}</div>
        <button onClick={() => onMedewerker && onMedewerker(persoon, rol, klant.klantnaam)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 13, color: KLEUR.blauw, fontWeight: 600 }}>{persoon.naam}</span>
          {persoon.email ? <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{" · " + persoon.email}</span> : null}
        </button>
      </div>
    );
  };
  return (
    <div>
      <TerugKnop onClick={onTerug} />
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{klant.klantnaam}</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 16 }}>
              Cliëntnr {klant.klantnummer || "—"}{klant.status ? " · " + klant.status : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {magWijzigen && (
              <button
                onClick={() => setBewerken(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                Bewerken
              </button>
            )}
            {isBeheerder && (
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
        {verwijderFout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 8 }}>Verwijderen mislukt: {verwijderFout}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
          <div>
            <Veld label="Groep" waarde={klant.groepsnaam} />
            <Veld label="Cliënttype" waarde={klant.clienttype} />
            <Veld label="Team" waarde={klant.team} />
            <Veld label="Kantoor" waarde={klant.kantoor} />
            <Veld label="Belastingkantoor" waarde={klant.belastingkantoor} />
            <Veld label="KvK" waarde={klant.kvk} />
            <AdresVeld label="Adres" adres={klant.adres} />
            <Veld label="SharePoint" waarde={klant.sharepointUrl ? "Map openen" : ""} link={klant.sharepointUrl} />
          </div>
          <div>
            <MedewerkerRegel label="Manager" persoon={klant.manager || { naam: klant.relatiebeheerder }} rol="Manager" />
            <MedewerkerRegel label="Accountant" persoon={klant.accountantPersoon || { naam: klant.accountant }} rol="Accountant" />
            <MedewerkerRegel label="Assistent" persoon={klant.assistent} rol="Assistent" />
            <MedewerkerRegel label="Back-up" persoon={klant.backup} rol="Back-up" />
            <MedewerkerRegel label="Fiscaal medewerker" persoon={klant.fiscaalMedewerker} rol="Fiscaal medewerker" />
            <MedewerkerRegel label="Loonadministratie" persoon={klant.loonadministratie} rol="Loonadministratie" />
          </div>
        </div>

        <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Primair contactpersoon</div>
          {klant.contact?.naam ? (
            <div>
              <button
                onClick={() => onContact(klant)}
                style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <span style={{ fontSize: 13, color: KLEUR.blauw, fontWeight: 600 }}>{klant.contact.naam}</span>
                {klant.contact.functietitel ? <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{" · " + klant.contact.functietitel}</span> : null}
              </button>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 18px", marginTop: 6 }}>
                {klant.contact.email && (
                  <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
                    E-mail: <a href={`mailto:${klant.contact.email}`} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{klant.contact.email}</a>
                  </div>
                )}
                {klant.contact.telefoon && (
                  <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Telefoon: {klant.contact.telefoon}</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen contactpersoon bekend.</div>
          )}
        </div>

        {klant.secundairContact?.naam && (() => {
          const s = klant.secundairContact;
          const sRegels = adresRegels(s.adres);
          return (
            <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Secundaire contactpersoon</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.naam}{s.functietitel ? <span style={{ fontWeight: 400, color: KLEUR.subtekst }}>{" · " + s.functietitel}</span> : null}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 18px", marginTop: 4 }}>
                {s.email && <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>E-mail: <a href={`mailto:${s.email}`} style={{ color: KLEUR.blauw, textDecoration: "none" }}>{s.email}</a></div>}
                {s.telefoon && <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Telefoon: {s.telefoon}</div>}
              </div>
              {sRegels.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>Adres:</div>
                  {sRegels.map((r, i) => <div key={i} style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{r}</div>)}
                </div>
              )}
            </div>
          );
        })()}

        <KlantVasteUitvragen accountId={klant.accountId} klantnaam={klant.klantnaam} defaultContact={{ id: klant.contact?.contactId || "", naam: klant.contact?.naam || "" }} magWijzigen={magWijzigen} />

        <Logboek accountId={klant.accountId} />
      </div>
    </div>
  );
}

// Bewerkt alleen de (primaire) contactpersoon-gegevens + diens adres.
function ContactBewerken({ klant, onKlaar, onOpgeslagen }) {
  const c = klant.contact || {};
  const ca = c.adres || {};
  const [f, setF] = useState({
    voornaam: c.voornaam || "", tussenvoegsel: c.tussenvoegsel || "", achternaam: c.achternaam || "",
    functietitel: c.functietitel || "", email: c.email || "", telefoon: c.telefoon || "",
    straat: ca.straat || "", huisnummer: ca.huisnummer || "", toevoeging: ca.toevoeging || "",
    postcode: ca.postcode || "", plaats: ca.plaats || "", land: ca.land || "",
  });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));
  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 4 };

  const opslaan = async () => {
    setStatus("bezig");
    try {
      const contact = {
        firstname: f.voornaam, middlename: f.tussenvoegsel, lastname: f.achternaam,
        jobtitle: f.functietitel, emailaddress1: f.email, mobilephone: f.telefoon,
        address1_line1: f.straat, cr283_huisnummer: f.huisnummer, cr283_huisnummertoevoeging: f.toevoeging,
        address1_postalcode: f.postcode, address1_city: f.plaats, address1_country: f.land,
      };
      const res = await fetch("/api/medewerker-klant-wijzigen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: klant.accountId, contactId: c.contactId, account: {}, contact }),
      });
      if (!res.ok) throw new Error(await res.text());
      const naam = [f.voornaam, f.tussenvoegsel, f.achternaam].filter(Boolean).join(" ").trim();
      onOpgeslagen(klant.accountId, {
        contact: {
          ...klant.contact,
          voornaam: f.voornaam, tussenvoegsel: f.tussenvoegsel, achternaam: f.achternaam,
          naam: naam || klant.contact?.naam, functietitel: f.functietitel, email: f.email, telefoon: f.telefoon,
          adres: { straat: f.straat, huisnummer: f.huisnummer, toevoeging: f.toevoeging, postcode: f.postcode, plaats: f.plaats, land: f.land },
        },
      });
      onKlaar();
    } catch {
      setStatus("fout");
    }
  };

  return (
    <div>
      <TerugKnop onClick={onKlaar} />
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Contactpersoon wijzigen</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
          <div>
            <div style={label}>Voornaam</div>
            {veldInput(f.voornaam, zet("voornaam"))}
            <div style={label}>Tussenvoegsel</div>
            {veldInput(f.tussenvoegsel, zet("tussenvoegsel"))}
            <div style={label}>Achternaam</div>
            {veldInput(f.achternaam, zet("achternaam"))}
            <div style={label}>Functietitel</div>
            {veldInput(f.functietitel, zet("functietitel"))}
            <div style={label}>E-mail</div>
            {veldInput(f.email, zet("email"))}
            <div style={label}>Telefoon</div>
            {veldInput(f.telefoon, zet("telefoon"))}
          </div>
          <div>
            <div style={label}>Straat</div>
            {veldInput(f.straat, zet("straat"))}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><div style={label}>Huisnr</div>{veldInput(f.huisnummer, zet("huisnummer"))}</div>
              <div style={{ flex: 1 }}><div style={label}>Toevoeging</div>{veldInput(f.toevoeging, zet("toevoeging"))}</div>
            </div>
            <div style={label}>Postcode</div>
            {veldInput(f.postcode, zet("postcode"))}
            <div style={label}>Plaats</div>
            {veldInput(f.plaats, zet("plaats"))}
            <div style={label}>Land</div>
            {veldInput(f.land, zet("land"))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "#2E7D46", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
          {status === "fout" && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt (mogelijk onvoldoende schrijfrechten in Dynamics).</span>}
        </div>
      </div>
    </div>
  );
}

function ContactDetail({ klant, magWijzigen, onTerug, onOpgeslagen }) {
  const [bewerken, setBewerken] = useState(false);
  const c = klant.contact || {};
  if (bewerken) {
    return <ContactBewerken klant={klant} onKlaar={() => setBewerken(false)} onOpgeslagen={onOpgeslagen} />;
  }
  return (
    <div>
      <TerugKnop onClick={onTerug} />
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{c.naam || "Contactpersoon"}</div>
            <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 16 }}>
              Primair contactpersoon van {klant.klantnaam}
            </div>
          </div>
          {magWijzigen && (
            <button
              onClick={() => setBewerken(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              Bewerken
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
          <div>
            <Veld label="Functietitel" waarde={c.functietitel} />
            <Veld label="E-mail" waarde={c.email} link={c.email ? `mailto:${c.email}` : ""} />
            <Veld label="Telefoon" waarde={c.telefoon} />
            <AdresVeld label="Adres" adres={c.adres} />
          </div>
          <div>
            <Veld label="Klant" waarde={klant.klantnaam} />
            <Veld label="Team" waarde={klant.team} />
            <Veld label="Groep" waarde={klant.groepsnaam} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GroepDetail({ groepsnaam, klanten, onTerug, onKlant }) {
  const leden = klanten.filter((k) => k.groepsnaam === groepsnaam);
  return (
    <div>
      <TerugKnop onClick={onTerug} />
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>Groep {groepsnaam}</div>
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 16 }}>
          {leden.length} klant{leden.length === 1 ? "" : "en"} in deze groep
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {leden.map((k, i) => (
            <div key={k.accountId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
              <button onClick={() => onKlant(k)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.blauw }}>{k.klantnaam}</span>
                <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>{k.klantnummer ? " · nr " + k.klantnummer : ""}</span>
              </button>
              <span style={{ fontSize: 12, color: KLEUR.subtekst }}>{k.contact?.naam || ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MedewerkerDetail({ persoon, rol, klantnaam, onTerug }) {
  const p = persoon || {};
  return (
    <div>
      <TerugKnop onClick={onTerug} />
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{p.naam || "Medewerker"}</div>
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 16 }}>
          {rol}{klantnaam ? " · " + klantnaam : ""}
        </div>
        <Veld label="Rol" waarde={rol} />
        <Veld label="E-mail" waarde={p.email} link={p.email ? `mailto:${p.email}` : ""} />
        <Veld label="Telefoon" waarde={p.telefoon} />
        {!p.email && !p.telefoon && (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen verdere contactgegevens beschikbaar.</div>
        )}
      </div>
    </div>
  );
}

// Kolomdefinities voor het klantoverzicht-raster. cel(k) geeft de tekstwaarde (voor sorteren,
// filteren en zoeken); soort bepaalt hoe de cel wordt weergegeven (link/medewerker/sharepoint).
const BASIS_KOLOMMEN = [
  { key: "klantnummer", label: "Cliëntnr", cel: (k) => (k.klantnummer === "" || k.klantnummer == null ? "" : String(k.klantnummer)), num: true },
  { key: "klantnaam", label: "Cliëntnaam", cel: (k) => k.klantnaam || "", soort: "klant" },
  { key: "groepsnaam", label: "Groep", cel: (k) => k.groepsnaam || "", soort: "groep" },
  { key: "kantoor", label: "Kantoor", cel: (k) => k.kantoor || "" },
  { key: "team", label: "Team", cel: (k) => k.team || "" },
  { key: "clienttype", label: "Cliënttype", cel: (k) => k.clienttype || "" },
  { key: "contact", label: "Contactpersoon", cel: (k) => k.contact?.naam || "", soort: "contact" },
  { key: "manager", label: "Manager", cel: (k) => k.manager?.naam || k.relatiebeheerder || "", soort: "medewerker", rol: "Manager", persoon: (k) => k.manager || { naam: k.relatiebeheerder } },
  { key: "accountant", label: "Accountant", cel: (k) => k.accountantPersoon?.naam || k.accountant || "", soort: "medewerker", rol: "Accountant", persoon: (k) => k.accountantPersoon || { naam: k.accountant } },
  { key: "assistent", label: "Assistent", cel: (k) => k.assistent?.naam || "", soort: "medewerker", rol: "Assistent", persoon: (k) => k.assistent },
  { key: "fiscaalMedewerker", label: "Fiscaal medew.", cel: (k) => k.fiscaalMedewerker?.naam || "", soort: "medewerker", rol: "Fiscaal medewerker", persoon: (k) => k.fiscaalMedewerker },
  { key: "loonadministratie", label: "Loonadmin.", cel: (k) => k.loonadministratie?.naam || "", soort: "medewerker", rol: "Loonadministratie", persoon: (k) => k.loonadministratie },
  { key: "belastingkantoor", label: "Belastingkantoor", cel: (k) => k.belastingkantoor || "" },
  { key: "sharepoint", label: "SharePoint", cel: (k) => (k.sharepointUrl ? "Map" : ""), soort: "sharepoint", geenSort: true, geenFilter: true },
  { key: "status", label: "Status", cel: (k) => k.status || "" },
];

// De sub-tabbladen onder "Klantoverzicht". Klantoverzicht en Contactpersonen zijn echte
// overzichten; de vier fiscale tabbladen zijn nog leeg en worden één voor één gevuld zodra
// duidelijk is in welke Dynamics-tabellen en -velden die gegevens staan.
const KLANTEN_SUBTABS = [
  { key: "klanten", label: "Klanten", icon: LayoutGrid },
  { key: "contactpersonen", label: "Contactpersonen", icon: Users },
  { key: "ib", label: "Inkomstenbelasting", icon: FileText, watKomtEr: "Per cliënt de inkomstenbelasting-aangiftes: jaar, status, behandelaar en deadline, zodat je in één lijst ziet wat nog open staat en bij wie het ligt." },
  { key: "vpb", label: "Vennootschapsbelasting", icon: Building2, watKomtEr: "Per cliënt de vennootschapsbelasting-aangiftes: jaar, status, behandelaar en deadline, inclusief fiscale eenheden waar die van toepassing zijn." },
  { key: "divb", label: "Dividendbelasting", icon: Coins, watKomtEr: "Per cliënt de dividendbelasting-aangiftes: aangiftedatum, uitgekeerd dividend, status en behandelaar." },
  { key: "lonen", label: "Lonen", icon: Wallet, watKomtEr: "De loonadministratie per cliënt: aangifteperiode, status, verantwoordelijke loonadministratie en aantal werknemers." },
];

/**
 * Verzamelscherm achter de tab "Klantoverzicht": één sub-tabbalk met alle cliënt-gerichte
 * overzichten. Dezelfde opzet als de stappenbalk in de Offertes-tab, zodat het portaal
 * consistent aanvoelt. Elk sub-tabblad houdt zijn eigen state; door van tabblad te wisselen
 * gaan filters en sortering van het andere tabblad dus niet verloren zolang je in het portaal
 * blijft — behalve dat een leeg tabblad niets te onthouden heeft.
 */
function KlantenModule() {
  const [sub, setSub] = useState("klanten");
  const actief = KLANTEN_SUBTABS.find((s) => s.key === sub) || KLANTEN_SUBTABS[0];

  return (
    <div>
      {/* Exact dezelfde balk als de stappenbalk in de Offertes-tab: dezelfde opbouw (een band met
          onderrand en lichte achtergrond, daarin een rij van maximaal 1600px die meecentreert),
          dezelfde maten en dezelfde pilstijl. Beide balken hangen op dezelfde plek in het portaal,
          dus door de opbouw identiek te houden zien ze er ook echt identiek uit — zonder trucs met
          negatieve marges, die bij een andere paginapadding weer zouden gaan schuiven. */}
      <div style={{ borderBottom: `1px solid ${KLEUR.rand}`, background: "#FBFBF9" }}>
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
          {KLANTEN_SUBTABS.map((s) => {
            const aan = s.key === sub;
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setSub(s.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  border: "none",
                  background: aan ? KLEUR.blauw : "transparent",
                  color: aan ? "#fff" : KLEUR.blauw,
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
        </div>
      </div>

      <div style={{ paddingTop: 24 }}>
        {sub === "klanten" && <KlantOverzicht />}
        {sub === "contactpersonen" && <ContactpersonenOverzicht />}
        {(sub === "ib" || sub === "vpb") && <MedewerkerDossiers soort={sub} />}
        {(sub === "divb" || sub === "lonen") && <NogInTeRichten titel={actief.label} watKomtEr={actief.watKomtEr} />}
      </div>
    </div>
  );
}

/* ── Fiscale dossiers voor de medewerker (Inkomstenbelasting / Vennootschapsbelasting) ──
   Eén lijst per soort over alle cliënten, uit /api/medewerker-dossiers (deelt de query met de
   klantweergave via api/_gedeeld/dossiers.js). Read-only overzicht: jaar/boekjaar, status,
   behandelaar. */
function dossierBoekjaar(d) {
  const jr = (x) => (x ? new Date(x).getFullYear() : "");
  const van = jr(d.begindatum);
  const tot = jr(d.einddatum);
  if (van && tot && van !== tot) return `${van}–${tot}`;
  return String(van || tot || "");
}

// Kolomdefinities voor de dossieroverzichten (IB/VPB) — zelfde patroon (cel/label/sorteren via
// klik-op-kop/filteren via kolomkop-menu) als het klantoverzicht (BASIS_KOLOMMEN hierboven),
// bewust hier apart gedefinieerd i.p.v. gedeeld: dit bestand houdt elk scherm bewust op zichzelf
// (zie ook ContactpersonenOverzicht/ContractenOverzicht). "periode" is Jaar bij IB en Boekjaar
// bij VPB — de label/waarde daarvan hangt van "soort" af en wordt dus in de component zelf
// samengesteld i.p.v. hier statisch, in tegenstelling tot de rest van de kolommen.
function dossierKolommen(periodeLabel, periode) {
  return [
    { key: "klantnaam", label: "Cliënt", cel: (d) => d.klantnaam || "" },
    { key: "dossiernaam", label: "Dossiernaam", cel: (d) => d.dossiernaam || "" },
    { key: "periode", label: periodeLabel, cel: (d) => periode(d) },
    { key: "statusLabel", label: "Status", cel: (d) => d.statusLabel || "" },
    { key: "accountant", label: "Accountant", cel: (d) => d.accountant || "" },
    { key: "assistent", label: "Assistent", cel: (d) => d.assistent || "" },
    { key: "manager", label: "Manager", cel: (d) => d.manager || "" },
    { key: "groepsnaam", label: "Groep", cel: (d) => d.groepsnaam || "" },
  ];
}
// "dossiernaam" en "manager" (Wouter, 04-08-2026) staan bewust NIET meer in deze lijst — die wil hij
// standaard zichtbaar in de hoofdtabel Inkomstenbelasting. "groepsnaam" blijft wel kiesbaar-maar-
// standaard-verborgen. Voor VPB blijven "dossiernaam"/"manager" gewoon leeg (geen Dynamics-veld voor
// dat soort, zie api/_gedeeld/dossiers.js) — zelfde bestaande gedrag als "groepsnaam" daar al had.
const DOSSIER_KOLOMMEN_STANDAARD_VERBORGEN = ["groepsnaam"]; // wel kiesbaar, niet standaard getoond

/**
 * Nieuw dossier aanmaken ("+ Nieuwe Inkomstenbelasting" in de lijst, of "Aangifte kopiëren naar
 * volgend jaar" vanuit een geopend dossier) — via POST /api/medewerker-dossier-aanmaken.
 *
 * Twee modi:
 *  - "kopieren": bestaande aangifte overnemen naar een nieuw jaar (alle gegevens, behalve
 *    review-/reactienotities en opmerkingen — zie de toelichting in het scherm zelf).
 *    Bron is ofwel vrij te kiezen (zoeken in `dossiers`), ofwel vast (`vasteBron`, vanuit een
 *    geopend dossier — dan is dit de ENIGE modus, geen toggle, geen zoeken nodig).
 *  - "nieuw": lege aangifte voor een zelf te kiezen cliënt, met optioneel een fiscaal partner.
 * Alleen bereikbaar als `vasteBron` niet gezet is.
 */
function NieuwDossierModal({ soort, soortLabel, periodeLabel, dossiers, vasteBron, onKlaar, onAangemaakt }) {
  const [modus, setModus] = useState("kopieren");
  const [bron, setBron] = useState(vasteBron || null);
  const [klanten, setKlanten] = useState(null); // lazy, null = nog niet geladen (niet nodig bij vasteBron)
  const [client, setClient] = useState(null); // { id, naam }
  const [heeftPartner, setHeeftPartner] = useState(false);
  const [partner, setPartner] = useState(null); // { id, naam }
  const [jaar, setJaar] = useState(() => (vasteBron && vasteBron.jaar != null ? String(Number(vasteBron.jaar) + 1) : ""));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  useEffect(() => {
    if (vasteBron) return;
    let actief = true;
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setKlanten(d.klanten || []); })
      .catch(() => { if (actief) setKlanten([]); });
    return () => { actief = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Als de gebruiker naar "Nieuw" wisselt zonder al een jaar te hebben ingevuld: het lopende
  // jaar als sensibel startpunt voorstellen (i.p.v. leeg, of het "kopieren"-jaar te laten staan).
  useEffect(() => {
    if (jaar || vasteBron) return;
    if (modus === "nieuw") setJaar(String(new Date().getFullYear()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modus]);

  const zoekBron = (term) => {
    const t = term.trim().toLowerCase();
    const lijst = (dossiers || []).filter((d) => !t || `${d.klantnaam} ${d.jaar ?? ""}`.toLowerCase().includes(t));
    return lijst.slice(0, 20).map((d) => ({ id: d.id, naam: d.klantnaam || "—", sub: `${periodeLabel} ${d.jaar ?? "—"}` }));
  };
  const kiesBron = (id) => {
    const d = (dossiers || []).find((x) => x.id === id);
    if (!d) return;
    setBron(d);
    setJaar(d.jaar != null ? String(Number(d.jaar) + 1) : "");
  };

  const zoekKlant = (term) => {
    const t = term.trim().toLowerCase();
    const lijst = (klanten || []).filter((k) => !t || `${k.klantnaam} ${k.klantnummer ?? ""}`.toLowerCase().includes(t));
    return lijst.slice(0, 20).map((k) => ({ id: k.accountId, naam: k.klantnaam || "—", sub: k.klantnummer ? `Nr. ${k.klantnummer}` : "" }));
  };
  const zoekPartner = (term) => zoekKlant(term).filter((k) => !client || k.id !== client.id);

  const jaarGeldig = jaar.trim() !== "" && Number.isInteger(Number(jaar));
  const klaarOmAanTeMaken = jaarGeldig && (modus === "kopieren" ? !!bron : !!client);

  const aanmaken = async () => {
    if (!klaarOmAanTeMaken || bezig) return;
    setBezig(true);
    setFout("");
    try {
      const body = modus === "kopieren"
        ? { soort, kopieerVanId: bron.id, jaar: Number(jaar) }
        : { soort, accountId: client.id, jaar: Number(jaar), fiscaalPartnerschap: heeftPartner, fiscaalPartnerAccountId: heeftPartner && partner ? partner.id : null };
      const r = await fetch("/api/medewerker-dossier-aanmaken", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onAangemaakt(d.dossier);
    } catch (e) {
      setFout(e.message || "Aanmaken van het dossier is mislukt.");
    } finally {
      setBezig(false);
    }
  };

  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3, marginTop: 4 };
  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 9px", fontSize: 13, marginBottom: 8, background: "#fff" };
  const tabStijl = (actief) => ({ flex: 1, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, border: `1px solid ${KLEUR.rand}`, background: actief ? KLEUR.lichtblauw : "#fff", color: actief ? KLEUR.blauw : KLEUR.subtekst, cursor: "pointer" });

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 440, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: vasteBron ? 4 : 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{vasteBron ? "Aangifte kopiëren naar volgend jaar" : `Nieuwe ${soortLabel.toLowerCase()}`}</div>
          <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, display: "flex", padding: 0 }}><X size={16} /></button>
        </div>

        {!vasteBron && (
          <div style={{ display: "flex", marginBottom: 14, borderRadius: 7, overflow: "hidden" }}>
            <button onClick={() => setModus("kopieren")} style={{ ...tabStijl(modus === "kopieren"), borderRadius: "7px 0 0 7px" }}>Kopiëren van vorig jaar</button>
            <button onClick={() => setModus("nieuw")} style={{ ...tabStijl(modus === "nieuw"), borderRadius: "0 7px 7px 0", borderLeft: "none" }}>Nieuwe aangifte</button>
          </div>
        )}

        {modus === "kopieren" ? (
          <>
            {vasteBron ? (
              <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 10 }}>
                Cliënt: <strong>{vasteBron.klantnaam || "—"}</strong> · huidig {periodeLabel.toLowerCase()} {vasteBron.jaar ?? "—"}
              </div>
            ) : (
              <ZoekKiezer
                label="Aangifte om van te kopiëren"
                huidigeNaam={bron ? `${bron.klantnaam || "—"} · ${periodeLabel} ${bron.jaar ?? "—"}` : ""}
                zoek={zoekBron}
                onKies={(id) => kiesBron(id)}
                onWis={() => { setBron(null); setJaar(""); }}
              />
            )}
            <div style={label}>Nieuw {periodeLabel.toLowerCase()}</div>
            <input type="number" value={jaar} onChange={(e) => setJaar(e.target.value)} style={veld} />
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: -4 }}>
              Alle gegevens worden overgenomen, behalve review-/reactienotities en opmerkingen. Toelichtingen blijven staan.
            </div>
          </>
        ) : (
          <>
            <ZoekKiezer label="Cliënt" huidigeNaam={client ? client.naam : ""} zoek={zoekKlant} onKies={(id, naam) => setClient({ id, naam })} onWis={() => setClient(null)} />
            <div style={label}>Fiscaal partnerschap</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <button onClick={() => setHeeftPartner(true)} style={{ ...tabStijl(heeftPartner), flex: "0 0 80px" }}>Ja</button>
              <button onClick={() => { setHeeftPartner(false); setPartner(null); }} style={{ ...tabStijl(!heeftPartner), flex: "0 0 80px" }}>Nee</button>
            </div>
            {heeftPartner && (
              <ZoekKiezer label="Fiscaal partner" huidigeNaam={partner ? partner.naam : ""} zoek={zoekPartner} onKies={(id, naam) => setPartner({ id, naam })} onWis={() => setPartner(null)} />
            )}
            <div style={label}>{periodeLabel}</div>
            <input type="number" value={jaar} onChange={(e) => setJaar(e.target.value)} style={{ ...veld, marginBottom: 0 }} />
          </>
        )}

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>{fout}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={aanmaken} disabled={!klaarOmAanTeMaken || bezig} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaarOmAanTeMaken ? "#2E7D46" : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaarOmAanTeMaken ? "pointer" : "default" }}>
            {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />} {bezig ? "Bezig…" : "Aangifte aanmaken"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
        </div>
      </div>
    </>
  );
}

function MedewerkerDossiers({ soort }) {
  const [dossiers, setDossiers] = useState(null); // null = laden
  const [fout, setFout] = useState(false);
  const [zoek, setZoek] = useState("");
  const [kolomFilters, setKolomFilters] = useState({}); // { kolomKey: waarde | {bevat} }
  const [sortKey, setSortKey] = useState("klantnaam");
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [toonAantal, setToonAantal] = useState(25);
  const [zichtbareKolommen, setZichtbareKolommen] = useState(null); // null = nog standaard bepalen
  const [weergaven, setWeergaven] = useState([]); // [{ naam, config }]
  const [actieveWeergave, setActieveWeergave] = useState("");
  const [menu, setMenu] = useState(null); // { key, x, y } — geopend kolomkop-menu
  const [menuZoek, setMenuZoek] = useState("");
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const [scope, setScope] = useState("mijn"); // "mijn" | "alle"
  const [statusOpties, setStatusOpties] = useState([]);
  const [detailId, setDetailId] = useState(null); // id van het geopende dossier, of null
  const [detail, setDetail] = useState(null); // volledige detailrespons ({ dossier, catalogus, secties, picklistOpties })
  const [detailLaden, setDetailLaden] = useState(false);
  const [detailFout, setDetailFout] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false); // "+ Nieuwe ..."-popup
  const [magVerwijderen, setMagVerwijderen] = useState(false); // los in te stellen recht (Beheer → Medewerkers) — beheerders mogen dit sowieso altijd

  const scherm = "dossiers-" + soort; // eigen namespace voor opgeslagen weergaven (zie api/_gedeeld/weergaven.js)
  const soortLabelText = soort === "vpb" ? "Vennootschapsbelasting" : "Inkomstenbelasting";

  // Verwijder-recht voor déze dossiersoort ophalen (per soort een ander recht — magVerwijderIb/magVerwijderVpb).
  useEffect(() => {
    let actief = true;
    fetch("/api/medewerker-rechten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setMagVerwijderen(!!d.beheerder || !!(soort === "vpb" ? d.magVerwijderVpb : d.magVerwijderIb)); })
      .catch(() => { if (actief) setMagVerwijderen(false); });
    return () => { actief = false; };
  }, [soort]);

  useEffect(() => {
    setDossiers(null);
    setFout(false);
    setZoek("");
    setKolomFilters({});
    setSortKey("klantnaam");
    setSortDir("asc");
    setToonAantal(25);
    setZichtbareKolommen(null);
    setActieveWeergave("");
    setMenu(null);
    setKolomKiezerOpen(false);
    setDetailId(null);
    setDetail(null);
    setNieuwOpen(false);
    let actief = true;
    fetch(`/api/medewerker-dossiers?soort=${encodeURIComponent(soort)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) { setDossiers(d.dossiers || []); setStatusOpties(d.statusOpties || []); } })
      .catch(() => { if (actief) { setDossiers([]); setFout(true); } });
    fetch(`/api/medewerker-weergaven?scherm=${encodeURIComponent("dossiers-" + soort)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setWeergaven(d.views || []); })
      .catch(() => { if (actief) setWeergaven([]); });
    return () => { actief = false; };
  }, [soort]);

  const periodeLabel = soort === "vpb" ? "Boekjaar" : "Jaar";
  const periode = (d) => (d.jaar != null && d.jaar !== "" ? String(d.jaar) : dossierBoekjaar(d));
  const KOLOMMEN = dossierKolommen(periodeLabel, periode);
  const alleKeys = KOLOMMEN.map((c) => c.key);
  useEffect(() => {
    setZichtbareKolommen((huidig) => huidig || new Set(alleKeys.filter((key) => !DOSSIER_KOLOMMEN_STANDAARD_VERBORGEN.includes(key))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soort]);
  const zichtbareSet = zichtbareKolommen || new Set(alleKeys.filter((key) => !DOSSIER_KOLOMMEN_STANDAARD_VERBORGEN.includes(key)));
  const kolomVan = (key) => KOLOMMEN.find((c) => c.key === key);

  // Volledig dossier (incl. catalogus/secties/picklistopties) apart ophalen zodra er één wordt
  // geopend — de lijst zelf bevat alleen de basisvelden (Cliënt/Jaar/Status/Accountant/Assistent).
  const openDossier = (id) => {
    setDetailId(id);
    setDetail(null);
    setDetailFout("");
    setDetailLaden(true);
    fetch(`/api/medewerker-dossier?soort=${encodeURIComponent(soort)}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error((d && d.error) || `HTTP ${r.status}`)))))
      .then((d) => setDetail(d))
      .catch((e) => setDetailFout(e.message || "Kon het dossier niet openen."))
      .finally(() => setDetailLaden(false));
  };

  // Na het aanmaken van een dossier (vanuit de lijst óf vanuit een geopend dossier zelf, zie
  // DossierDetail's "Aangifte kopiëren naar volgend jaar"): bovenaan de lijst zetten en meteen
  // openen — zelfde eindresultaat als een medewerker die een net aangemaakt dossier aanklikt.
  const dossierAangemaakt = (nieuw) => {
    setNieuwOpen(false);
    setDossiers((h) => [nieuw, ...(h || [])]);
    openDossier(nieuw.id);
  };

  // Na definitief verwijderen (DossierDetail's "Verwijderen"-knop): terug naar de lijst, en het
  // dossier daar ook meteen weghalen zodat het niet meer aan te klikken is.
  const dossierVerwijderd = (id) => {
    setDetailId(null);
    setDetail(null);
    setDossiers((h) => (h || []).filter((x) => x.id !== id));
  };

  if (detailId) {
    if (detailLaden) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Dossier ophalen…
        </div>
      );
    }
    if (detailFout || !detail) {
      return (
        <div>
          <button onClick={() => { setDetailId(null); setDetail(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 14 }}>
            <ArrowLeft size={15} /> Terug
          </button>
          <div style={{ fontSize: 12.5, color: KLEUR.rood }}>{detailFout || "Dossier niet gevonden."}</div>
        </div>
      );
    }
    return (
      <DossierDetail
        dossier={detail.dossier}
        soortLabel={detail.dossier.soortLabel || (soort === "vpb" ? "Vennootschapsbelasting" : "Inkomstenbelasting")}
        periodeLabel={periodeLabel}
        periode={periode}
        statusOpties={detail.statusOpties || statusOpties}
        catalogus={detail.catalogus || []}
        secties={detail.secties || []}
        verborgen={detail.verborgen || []}
        voorwaarden={detail.voorwaarden || {}}
        alleenLezen={detail.alleenLezen || []}
        picklistOpties={detail.picklistOpties || {}}
        gekoppeldeUitvragen={detail.gekoppeldeUitvragen || []}
        magVerwijderen={magVerwijderen}
        onDossierVerwijderd={dossierVerwijderd}
        onTerug={() => { setDetailId(null); setDetail(null); }}
        onOpgeslagen={(bijgewerkt) => {
          setDetail((h) => ({ ...h, dossier: bijgewerkt }));
          setDossiers((h) => (h || []).map((x) => (x.id === bijgewerkt.id ? bijgewerkt : x)));
        }}
        onDossierAangemaakt={dossierAangemaakt}
      />
    );
  }

  if (dossiers === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Dossiers ophalen…
      </div>
    );
  }

  const term = zoek.trim().toLowerCase();
  const mijnLc = mijnNaam.trim().toLowerCase();
  const isDossierVanMij = (d) => !!mijnLc && [d.accountant, d.assistent].some((v) => String(v || "").trim().toLowerCase() === mijnLc);
  const gefilterd = dossiers.filter((d) => {
    if (scope === "mijn" && mijnNaam && !isDossierVanMij(d)) return false;
    for (const [key, val] of Object.entries(kolomFilters)) {
      if (!val) continue;
      const kol = kolomVan(key);
      if (!kol) continue;
      const cel = kol.cel(d);
      if (typeof val === "object" && val.bevat) {
        if (!String(cel).toLowerCase().includes(val.bevat.toLowerCase())) return false;
      } else if (cel !== val) {
        return false;
      }
    }
    if (term) {
      const raak = [d.klantnaam, periode(d), d.statusLabel, d.accountant, d.assistent, d.manager, d.groepsnaam]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
      if (!raak) return false;
    }
    return true;
  });
  const filterActief = Object.values(kolomFilters).some(Boolean) || !!term;

  const sortKol = kolomVan(sortKey) || kolomVan("klantnaam");
  const gesorteerd = [...gefilterd].sort((x, y) => {
    const va = sortKol.cel(x), vb = sortKol.cel(y);
    const c = String(va).localeCompare(String(vb), "nl", { sensitivity: "base" });
    return sortDir === "asc" ? c : -c;
  });
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const zichtbaar = gesorteerd.slice(0, toonAantal);
  const zichtKols = KOLOMMEN.filter((c) => zichtbareSet.has(c.key));

  const openKopMenu = (e, key) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuZoek("");
    setMenu((m) => (m && m.key === key ? null : { key, x: r.left, y: r.bottom }));
  };
  const wisAllesFilters = () => { setKolomFilters({}); setZoek(""); };

  // Opgeslagen weergaven (persoonlijk, per dossiersoort): kolommen + filters + sortering + aantal regels.
  const huidigeConfig = () => ({ kolommen: [...zichtbareSet], filters: kolomFilters, sortKey, sortDir, toonAantal });
  const pasWeergaveToe = (cfg) => {
    if (!cfg) return;
    if (Array.isArray(cfg.kolommen)) setZichtbareKolommen(new Set(cfg.kolommen));
    setKolomFilters(cfg.filters || {});
    if (cfg.sortKey) setSortKey(cfg.sortKey);
    if (cfg.sortDir) setSortDir(cfg.sortDir);
    if (cfg.toonAantal) setToonAantal(cfg.toonAantal);
  };
  const bewaarWeergaven = (lijst) => {
    setWeergaven(lijst);
    fetch("/api/medewerker-weergaven", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scherm, views: lijst }) }).catch(() => {});
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

  const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
  const menuItem = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, color: KLEUR.tekst };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };

  return (
    <div>
      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 12 }}>Er ging iets mis bij het ophalen van de dossiers.</div>
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <ScopeToggle scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op cliënt, jaar, status of behandelaar…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
          />
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 200, maxHeight: 320, overflowY: "auto" }}>
                {KOLOMMEN.map((kol) => (
                  <label key={kol.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={zichtbareSet.has(kol.key)}
                      onChange={() => setZichtbareKolommen(() => { const n = new Set(zichtbareSet); if (n.has(kol.key)) n.delete(kol.key); else n.add(kol.key); return n; })}
                    />
                    {kol.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <select value={actieveWeergave} onChange={(e) => kiesWeergave(e.target.value)} style={selectStijl} title="Opgeslagen weergave">
          <option value="">Weergave…</option>
          {weergaven.map((v) => <option key={v.naam} value={v.naam}>{v.naam}</option>)}
        </select>
        <button onClick={opslaanAlsWeergave} style={selectStijl} title="Huidige indeling opslaan als weergave">Opslaan als…</button>
        {actieveWeergave && (
          <button onClick={verwijderWeergave} style={{ ...selectStijl, color: KLEUR.rood }} title="Verwijder deze weergave">Verwijderen</button>
        )}
        {filterActief && (
          <button
            onClick={wisAllesFilters}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Filters wissen
          </button>
        )}
        {soort === "ib" && (
          <button
            onClick={() => setNieuwOpen(true)}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2E7D46", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nieuwe {soortLabelText}
          </button>
        )}
      </div>

      {nieuwOpen && (
        <NieuwDossierModal
          soort={soort}
          soortLabel={soortLabelText}
          periodeLabel={periodeLabel}
          dossiers={dossiers || []}
          onKlaar={() => setNieuwOpen(false)}
          onAangemaakt={dossierAangemaakt}
        />
      )}

      {Object.entries(kolomFilters).filter(([, v]) => v).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {Object.entries(kolomFilters).filter(([, v]) => v).map(([key, v]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
              {(kolomVan(key)?.label || key)}{typeof v === "object" && v.bevat ? ` bevat "${v.bevat}"` : `: ${v}`}
              <button onClick={() => setKolomFilters((h) => { const n = { ...h }; delete n[key]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {scope === "mijn" && naamGeladen && !mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8 }}>Je naam kon niet automatisch worden bepaald; gebruik <strong>Kantoorbreed</strong>.</div>
      )}

      {dossiers.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "16px 2px" }}>Nog geen dossiers gevonden.</div>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(560, zichtKols.length * 120) }}>
              <thead>
                <tr>
                  {zichtKols.map((kol) => {
                    const kolActief = sortKey === kol.key || kolomFilters[kol.key];
                    return (
                      <th
                        key={kol.key}
                        onClick={(e) => openKopMenu(e, kol.key)}
                        title="Klik om te sorteren of filteren"
                        style={{ ...th, cursor: "pointer", userSelect: "none", color: kolActief ? KLEUR.blauw : th.color }}
                      >
                        {kol.label}{pijl(kol.key)}{kolomFilters[kol.key] ? " •" : ""} <span style={{ color: KLEUR.mutedTekst }}>▾</span>
                      </th>
                    );
                  })}
                  <th style={{ ...th, width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => openDossier(d.id)}
                    title="Open dossier"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FBFBF9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {zichtKols.map((kol) => (
                      <td key={kol.key} style={td}>
                        {kol.key === "klantnaam" ? (
                          <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {d.klantnaam || "—"}
                            {d.actief === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#F0F0EC", color: KLEUR.mutedTekst }}>Inactief</span>}
                          </span>
                        ) : (
                          kol.cel(d) || "—"
                        )}
                      </td>
                    ))}
                    <td style={{ ...td, color: KLEUR.mutedTekst, textAlign: "right" }}><ChevronRight size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{Math.min(toonAantal, gefilterd.length)} van {gefilterd.length} getoond</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
              {[[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]].map(([n, lbl]) => (
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
        </>
      )}

      {menu && (() => {
        const kol = kolomVan(menu.key);
        if (!kol) return null;
        const waarden = [...new Set(dossiers.map(kol.cel).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "nl"))
          .filter((v) => !menuZoek || v.toLowerCase().includes(menuZoek.toLowerCase()));
        return (
          <>
            <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
            <div style={{ position: "fixed", left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 260), top: menu.y + 4, width: 240, maxHeight: 360, overflowY: "auto", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", zIndex: 51, padding: 8 }}>
              <button onClick={() => { setSortKey(kol.key); setSortDir("asc"); setMenu(null); }} style={menuItem}>↑ Sorteer A→Z</button>
              <button onClick={() => { setSortKey(kol.key); setSortDir("desc"); setMenu(null); }} style={menuItem}>↓ Sorteer Z→A</button>
              <div style={{ height: 1, background: KLEUR.rand, margin: "6px 0" }} />
              <input
                value={menuZoek}
                onChange={(e) => setMenuZoek(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && menuZoek.trim()) {
                    setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } }));
                    setMenu(null);
                  }
                }}
                placeholder="Typ en Enter = bevat…"
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 12.5 }}
              />
              {menuZoek.trim() && (
                <button onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } })); setMenu(null); }} style={{ ...menuItem, color: KLEUR.blauw, fontWeight: 600 }}>
                  Filter op: bevat "{menuZoek.trim()}"
                </button>
              )}
              <button onClick={() => { setKolomFilters((h) => { const n = { ...h }; delete n[kol.key]; return n; }); setMenu(null); }} style={{ ...menuItem, fontWeight: kolomFilters[kol.key] ? 400 : 700 }}>Alles tonen</button>
              {waarden.map((v) => (
                <button key={v} onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: v })); setMenu(null); }} style={{ ...menuItem, color: kolomFilters[kol.key] === v ? KLEUR.blauw : KLEUR.tekst, fontWeight: kolomFilters[kol.key] === v ? 700 : 400 }}>{v}</button>
              ))}
              {waarden.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Geen waarden</div>}
            </div>
          </>
        );
      })()}
    </div>
  );
}

/* Detail van één fiscaal dossier (IB/VPB) voor de medewerker — met bewerkbare status + documentlink.
   Alleen-lezen als het dossier in Dynamics op inactief (statecode) staat. Lay-out in lijn met de
   andere detailschermen (terug-knop, kop, veldenraster, bewerksectie). */
// Bouwt de initiële { [catalogusKey]: waarde }-bag uit een dossier — gedeeld tussen de
// beginwaarde van het bewerkformulier en de "is er iets gewijzigd?"-vergelijking.
function waardenUitDossier(dossier, catalogus) {
  const resultaat = {};
  for (const veldDef of catalogus || []) {
    if (veldDef.key.startsWith("__")) continue; // "vaste" velden (status/links) lopen via hun eigen state, niet via de vrije velden-bag
    const info = (dossier.velden && dossier.velden[veldDef.key]) || {};
    resultaat[veldDef.key] = info.waarde !== undefined ? info.waarde : (veldDef.type === "boolean" ? false : null);
  }
  return resultaat;
}

/** Eén besturingselement in de dossiersecties, op basis van het veldtype uit de catalogus
 * (zie api/_gedeeld/dossierVelden.js). Ja/nee-velden (verreweg de meeste) als nette pil-toggle
 * i.p.v. een kale HTML-checkbox — dat leest sneller in een lange lijst en sluit aan bij de
 * toggle-stijl die de rest van het beheerportaal al gebruikt (bijv. ContractenTypesBeheer). */
function VeldInvoer({ veldDef, waarde, onChange, picklistOpties, statusOpties, disabled, alleenLezen, stijlen }) {
  const { label, veld: veldStijl } = stijlen;
  const uitgeschakeld = disabled || alleenLezen;
  const labelMetSlot = (
    <div style={{ ...label, display: "flex", alignItems: "center", gap: 5 }}>
      {veldDef.label}
      {alleenLezen && <Lock size={10} color={KLEUR.mutedTekst} title="Alleen-lezen" />}
    </div>
  );
  if (veldDef.type === "vast-status") {
    return (
      <div>
        {labelMetSlot}
        <select disabled={uitgeschakeld} value={waarde ?? ""} onChange={(e) => onChange(e.target.value)} style={veldStijl}>
          <option value="">— geen —</option>
          {(statusOpties || []).map((o) => <option key={o.waarde} value={String(o.waarde)}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (veldDef.type === "vast-url") {
    const heeftWaarde = !!(waarde && String(waarde).trim());
    const href = heeftWaarde ? (/^https?:\/\//i.test(waarde.trim()) ? waarde.trim() : `https://${waarde.trim()}`) : null;
    return (
      <div>
        {labelMetSlot}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input disabled={uitgeschakeld} value={waarde || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" style={{ ...veldStijl, flex: 1 }} />
          {heeftWaarde && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Openen in nieuw tabblad"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                width: 34, height: 34, borderRadius: 7, border: `1px solid ${KLEUR.rand}`,
                background: "#F2F3F0", color: KLEUR.tekst,
              }}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    );
  }
  if (veldDef.type === "boolean") {
    const aan = !!waarde;
    return (
      <div>
        {labelMetSlot}
        <button
          type="button"
          disabled={uitgeschakeld}
          onClick={() => onChange(!aan)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999,
            border: `1px solid ${aan ? KLEUR.groen : KLEUR.rand}`,
            background: aan ? "#EAF6EE" : "#F2F3F0",
            color: aan ? KLEUR.groen : KLEUR.mutedTekst,
            fontSize: 12.5, fontWeight: 600, cursor: uitgeschakeld ? "default" : "pointer", opacity: uitgeschakeld ? 0.7 : 1,
          }}
        >
          {aan ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {aan ? "Ja" : "Nee"}
        </button>
      </div>
    );
  }
  if (veldDef.type === "picklist") {
    const opties = (picklistOpties && picklistOpties[veldDef.key]) || [];
    return (
      <div>
        {labelMetSlot}
        <select disabled={uitgeschakeld} value={waarde ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} style={veldStijl}>
          <option value="">— geen —</option>
          {opties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (veldDef.type === "memo") {
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        {labelMetSlot}
        <textarea disabled={uitgeschakeld} value={waarde || ""} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...veldStijl, resize: "vertical", fontFamily: "inherit" }} />
      </div>
    );
  }
  if (veldDef.type === "datetime") {
    const datumWaarde = waarde ? String(waarde).slice(0, 10) : "";
    return (
      <div>
        {labelMetSlot}
        <input type="date" disabled={uitgeschakeld} value={datumWaarde} onChange={(e) => onChange(e.target.value || null)} style={veldStijl} />
      </div>
    );
  }
  if (veldDef.type === "decimal") {
    return (
      <div>
        {labelMetSlot}
        <input
          type="number"
          step="any"
          disabled={uitgeschakeld}
          value={waarde ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          style={veldStijl}
        />
      </div>
    );
  }
  // string
  return (
    <div>
      {labelMetSlot}
      <input disabled={uitgeschakeld} value={waarde || ""} onChange={(e) => onChange(e.target.value)} style={veldStijl} />
    </div>
  );
}

/** Eén dropzone (cliënt óf fiscaal partner) voor "Aangifte versturen" — zie AangifteVersturenKaart
 * hieronder. Puur presentatie/bestandskeuze (drag & drop of klikken); de daadwerkelijke verwerking
 * (voorbereiden/versturen) gebeurt in de kaart zelf, zodat het voorbeeldscherm daar één plek heeft. */
function AangifteDropzone({ label, doelgroep, disabled, onGekozen }) {
  const [sleep, setSleep] = useState(false);
  const inputRef = useRef(null);

  const kies = (file) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
      onGekozen(doelgroep, null, "Alleen PDF-bestanden zijn toegestaan.");
      return;
    }
    onGekozen(doelgroep, file, "");
  };

  return (
    <div
      onDragOver={(e) => { if (disabled) return; e.preventDefault(); setSleep(true); }}
      onDragLeave={() => setSleep(false)}
      onDrop={(e) => { e.preventDefault(); setSleep(false); if (disabled) return; kies(e.dataTransfer.files && e.dataTransfer.files[0]); }}
      onClick={() => !disabled && inputRef.current && inputRef.current.click()}
      style={{
        border: `1.5px dashed ${sleep ? KLEUR.blauw : KLEUR.rand}`,
        borderRadius: 10,
        padding: "20px 14px",
        textAlign: "center",
        cursor: disabled ? "default" : "pointer",
        background: sleep ? KLEUR.lichtblauw : "#FAFBF9",
        opacity: disabled ? 0.55 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        flex: "1 1 220px",
        minWidth: 200,
      }}
    >
      <Upload size={18} color={KLEUR.mutedTekst} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>{label}</div>
      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Sleep hier de PDF naartoe, of klik om te kiezen</div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        disabled={disabled}
        onChange={(e) => { kies(e.target.files && e.target.files[0]); e.target.value = ""; }}
        style={{ display: "none" }}
      />
    </div>
  );
}

/** "Aangifte versturen" — twee dropzones (cliënt zelf en, indien ingevuld, diens fiscaal partner —
 * elk een eigen Dynamics-account met eigen SharePoint-dossier). Dropt de medewerker een PDF, dan
 * wordt eerst (GET /api/medewerker-aangifte-ontvanger) opgehaald wie de ontvanger is en of
 * versturen mogelijk is (SharePoint-map + e-mailadres bekend); is dat zo, dan volgt een
 * voorbeeldscherm — zelfde opzet als het mail-conceptscherm bij Offertes — waar de medewerker de
 * bestandsnaam en de mailtekst nog kan aanpassen vóórdat er daadwerkelijk iets de deur uitgaat
 * (POST /api/medewerker-aangifte-versturen: upload naar SharePoint "Correspondentie", Dynamics-taak
 * "In afwachting reactie client", mail vanaf correspondentie@activaa.nl). Alleen voor IB — VPB
 * heeft geen fiscaal-partner-concept en dit is specifiek voor de aangifte inkomstenbelasting. */
function AangifteVersturenKaart({ dossier, disabled }) {
  const [modal, setModal] = useState(null); // { doelgroep, bestand, laden, ontvanger, bestandsnaam, mailOnderwerp, mailTekst }
  // Per doelgroep (client/partner) een eigen melding/resultaat bijhouden — anders verdwijnt de
  // bevestiging "verstuurd naar cliënt" zodra je daarna ook nog iets voor de partner verstuurt
  // (het zijn twee onafhankelijke acties/mails, dus ook twee onafhankelijke terugkoppelingen).
  const [meldingen, setMeldingen] = useState({}); // { client?: tekst, partner?: tekst }
  const [versturenStatus, setVersturenStatus] = useState("rust"); // rust | bezig | klaar | fout
  const [versturenFout, setVersturenFout] = useState("");
  const [resultaten, setResultaten] = useState({}); // { client?: {...respons, naam}, partner?: {...respons, naam} }

  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 };
  const veldStijl = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" };

  // Terugval als /api/medewerker-aangifte-ontvanger onverhoopt geen mailOnderwerpStandaard/
  // mailTekstStandaard teruggeeft (bijv. instellingen.json nog niet bereikbaar) — normaal komt de
  // standaardtekst gewoon uit Beheer → Dossiers ("Mail — aangifte versturen").
  const standaardOnderwerp = (jaar) => `Uw aangifte inkomstenbelasting${jaar ? ` ${jaar}` : ""} staat klaar in het portaal`;
  const standaardTekst = (naam, jaar) =>
    `Beste ${naam || "klant"},\n\nUw aangifte inkomstenbelasting${jaar ? ` over ${jaar}` : ""} staat klaar ter beoordeling in het klantportaal.\n\nU kunt de aangifte inzien via het portaal, onder "Taken". Zodra u akkoord geeft, ronden wij de aangifte verder voor u af.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\nActivaa Accountants en Adviseurs`;

  const gekozen = async (doelgroep, bestand, fout) => {
    setMeldingen((h) => ({ ...h, [doelgroep]: null }));
    setResultaten((h) => ({ ...h, [doelgroep]: null }));
    if (fout) { setMeldingen((h) => ({ ...h, [doelgroep]: fout })); return; }
    if (!bestand) return;
    setModal({ doelgroep, bestand, laden: true });
    try {
      const r = await fetch(`/api/medewerker-aangifte-ontvanger?soort=ib&id=${encodeURIComponent(dossier.id)}&doelgroep=${doelgroep}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (!d.klaar) { setModal(null); setMeldingen((h) => ({ ...h, [doelgroep]: d.reden || "Versturen is nu niet mogelijk." })); return; }
      setModal({
        doelgroep, bestand, laden: false,
        ontvanger: d.ontvanger,
        bestandsnaam: d.bestandsnaamStandaard,
        mailOnderwerp: d.mailOnderwerpStandaard || standaardOnderwerp(d.jaar),
        mailTekst: d.mailTekstStandaard || standaardTekst(d.ontvanger?.naam, d.jaar),
      });
    } catch (e) {
      setModal(null);
      setMeldingen((h) => ({ ...h, [doelgroep]: e.message || "Voorbereiden is mislukt." }));
    }
  };

  const leesAlsBase64 = (file) => new Promise((resolve, reject) => {
    const lezer = new FileReader();
    lezer.onload = () => resolve(String(lezer.result).replace(/^data:.*;base64,/, ""));
    lezer.onerror = reject;
    lezer.readAsDataURL(file);
  });

  const versturen = async () => {
    if (!modal) return;
    setVersturenStatus("bezig"); setVersturenFout("");
    try {
      const bestandBase64 = await leesAlsBase64(modal.bestand);
      const r = await fetch("/api/medewerker-aangifte-versturen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soort: "ib", id: dossier.id, doelgroep: modal.doelgroep,
          bestandsnaam: modal.bestandsnaam, bestandBase64,
          mailOnderwerp: modal.mailOnderwerp, mailTekst: modal.mailTekst,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setVersturenStatus("klaar");
      setResultaten((h) => ({ ...h, [modal.doelgroep]: { ...d, naam: modal.ontvanger?.naam || "" } }));
      setModal(null);
    } catch (e) {
      setVersturenFout(e.message || "Versturen is mislukt.");
      setVersturenStatus("fout");
    }
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Aangifte versturen</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 640 }}>
        Sleep de aangifte inkomstenbelasting (PDF) hierheen — de ontvanger krijgt een mail en een
        taak "In afwachting reactie client" in het portaal, en kan het document daar inzien.
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <AangifteDropzone label={`Cliënt — ${dossier.klantnaam || "—"}`} doelgroep="client" disabled={disabled} onGekozen={gekozen} />
        {dossier.fiscaalPartnerAccountId ? (
          <AangifteDropzone label={`Fiscaal partner — ${dossier.fiscaalPartnerNaam || "—"}`} doelgroep="partner" disabled={disabled} onGekozen={gekozen} />
        ) : (
          <div style={{ flex: "1 1 220px", minWidth: 200, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "20px 14px", fontSize: 11.5, color: KLEUR.mutedTekst }}>
            Geen fiscaal partner bij dit dossier ingevuld.
          </div>
        )}
      </div>
      {["client", "partner"].map((dg) => {
        const doelgroepLabel = dg === "partner" ? "fiscaal partner" : "cliënt";
        const fout = meldingen[dg];
        const res = resultaten[dg];
        if (!fout && !res) return null;
        return (
          <div key={dg} style={{ marginTop: 10 }}>
            {fout && <div style={{ fontSize: 12, color: KLEUR.rood }}>{fout}</div>}
            {res && (
              <div style={{ fontSize: 12.5, color: res.mailVerzonden ? KLEUR.groen : KLEUR.goud, display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} />
                {res.mailVerzonden
                  ? `Verstuurd naar ${doelgroepLabel}${res.naam ? ` (${res.naam})` : ""} — het document staat in Correspondentie, en de taak en mail zijn aangemaakt.`
                  : `Document voor ${doelgroepLabel}${res.naam ? ` (${res.naam})` : ""} opgeslagen en taak aangemaakt, maar de mail versturen is mislukt — controleer dit handmatig.`}
              </div>
            )}
            {res?.waarschuwing && <div style={{ marginTop: 4, fontSize: 11.5, color: KLEUR.goud }}>{res.waarschuwing}</div>}
          </div>
        );
      })}

      {modal && (
        <div
          onClick={() => versturenStatus !== "bezig" && setModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Aangifte versturen</div>
            {modal.laden ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>
                <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Gegevens ophalen…
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
                  Aan: <strong>{modal.ontvanger?.naam || "—"}</strong> ({modal.ontvanger?.email || "onbekend"}) · {modal.bestand?.name}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={label}>Bestandsnaam in SharePoint</div>
                  <input value={modal.bestandsnaam} onChange={(e) => setModal((h) => ({ ...h, bestandsnaam: e.target.value }))} style={veldStijl} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={label}>Onderwerp van de mail</div>
                  <input value={modal.mailOnderwerp} onChange={(e) => setModal((h) => ({ ...h, mailOnderwerp: e.target.value }))} style={veldStijl} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={label}>Tekst van de mail</div>
                  <textarea value={modal.mailTekst} onChange={(e) => setModal((h) => ({ ...h, mailTekst: e.target.value }))} rows={9} style={{ ...veldStijl, resize: "vertical" }} />
                </div>
                {versturenFout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{versturenFout}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    onClick={() => setModal(null)}
                    disabled={versturenStatus === "bezig"}
                    style={{ padding: "9px 16px", background: "none", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: versturenStatus === "bezig" ? "default" : "pointer" }}
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={versturen}
                    disabled={versturenStatus === "bezig" || !modal.bestandsnaam.trim() || !modal.mailOnderwerp.trim() || !modal.mailTekst.trim()}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {versturenStatus === "bezig" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Mail size={14} />}
                    {versturenStatus === "bezig" ? "Versturen…" : "Versturen"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Detail van één fiscaal dossier (IB/VPB) voor de medewerker. Kop met alleen de vaste, niet
   door Beheer indeelbare identiteitsvelden (cliënt/periode/behandelaars) plus, eronder, één
   kaart per hoofdrubriek (met evt. subrubrieken) uit de Beheer-indeling (Beheer → Dossiers) —
   inclusief de "vaste" velden Status van de aangifte/URL dossier/Documentlink, die daar net als
   elk ander veld zelf een plek krijgen. Dezelfde inhoud als het Dynamics-formulier (tabbladen
   Algemeen/Box I/II/III/Review), maar als één doorlopende, overzichtelijke pagina i.p.v. zes
   aparte tabbladen. Alleen-lezen als het dossier in Dynamics op inactief (statecode) staat, of
   per veld als dat veld in Beheer → Dossiers op alleen-lezen is gezet. Als Beheer → Dossiers een
   onderwerp aan deze dossiersoort heeft gekoppeld (zie DossierIndelingBeheer.jsx), toont een aparte
   kaart bovenaan (vóór de secties) de gekoppelde uitvraaglijst(en) — de volledige vragenlijst
   (documenten aftekenen/heropenen, vragen van de klant beantwoorden) rechtstreeks ingebouwd via
   VragenlijstDetail, dezelfde functionaliteit als het tabblad Vragenlijsten. */
function DossierDetail({ dossier, soortLabel, periodeLabel, periode, statusOpties, catalogus, secties, verborgen, voorwaarden, alleenLezen, picklistOpties, gekoppeldeUitvragen, magVerwijderen, onDossierVerwijderd, onTerug, onOpgeslagen, onDossierAangemaakt }) {
  const [status, setStatus] = useState(dossier.status != null ? String(dossier.status) : "");
  const [urlDossier, setUrlDossier] = useState(dossier.urlDossier || "");
  const [documentUrl, setDocumentUrl] = useState(dossier.documentUrl || "");
  const [veldenState, setVeldenState] = useState(() => waardenUitDossier(dossier, catalogus));
  const [opslaan, setOpslaan] = useState("rust"); // rust | bezig | gelukt | fout
  const [fout, setFout] = useState("");
  const [kopieOpen, setKopieOpen] = useState(false); // "Aangifte kopiëren naar volgend jaar"-popup
  const [verwijderBezig, setVerwijderBezig] = useState(false);
  const [verwijderFout, setVerwijderFout] = useState("");
  const bewerkbaar = dossier.actief !== false;
  // Gekoppelde uitvraaglijst(en) — lokale kopie zodat VragenlijstDetail (hieronder ingebed) een
  // wijziging/verwijdering direct in de kaart kan doorvoeren zonder het hele dossier opnieuw te laden.
  const [uitvragen, setUitvragen] = useState(gekoppeldeUitvragen || []);
  // Per uitvraaglijst in-/uitgeklapt (id -> bool); zonder eigen keuze staat een afgeronde lijst
  // standaard dichtgeklapt (makkelijk nalezen zonder de pagina vol te zetten) en een open lijst
  // standaard opengeklapt (die vraagt nog aandacht).
  const [uitvraagOpen, setUitvraagOpen] = useState({});

  const oorspronkelijkeVelden = waardenUitDossier(dossier, catalogus);
  const veldenGewijzigd = JSON.stringify(veldenState) !== JSON.stringify(oorspronkelijkeVelden);
  const gewijzigd = String(dossier.status ?? "") !== status || (dossier.urlDossier || "") !== urlDossier || (dossier.documentUrl || "") !== documentUrl || veldenGewijzigd;

  const zetVeld = (key, waarde) => { setVeldenState((h) => ({ ...h, [key]: waarde })); setOpslaan("rust"); };

  const bewaar = async () => {
    setOpslaan("bezig"); setFout("");
    try {
      const r = await fetch("/api/medewerker-dossier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soort: dossier.soort, id: dossier.id, status: status === "" ? null : Number(status), urlDossier, documentUrl, velden: veldenState }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setOpslaan("gelukt");
      if (d.dossier) onOpgeslagen(d.dossier);
    } catch (e) { setFout(e.message || "Opslaan mislukt."); setOpslaan("fout"); }
  };

  /** Dossier DEFINITIEF uit Dynamics verwijderen — geen terugweg, dus dubbel bevestigen. */
  const verwijder = async () => {
    if (!window.confirm(`Dit dossier (${soortLabel}${periode(dossier) ? ` ${periode(dossier)}` : ""}) van ${dossier.klantnaam || "deze cliënt"} definitief verwijderen uit Dynamics?\n\nDit kan niet ongedaan worden gemaakt.`)) return;
    setVerwijderBezig(true);
    setVerwijderFout("");
    try {
      const r = await fetch("/api/medewerker-dossier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soort: dossier.soort, id: dossier.id, actie: "verwijderen" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onDossierVerwijderd(dossier.id);
    } catch (e) {
      setVerwijderFout(e.message || "Verwijderen mislukt.");
      setVerwijderBezig(false);
    }
  };

  const label = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 };
  const waarde = { fontSize: 13.5, color: KLEUR.tekst };
  const veld = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, background: "#fff" };
  const veldStijlen = { label, veld };
  // Verborgen (Beheer → Dossiers, oog-icoon) → nooit tonen. Voorwaarden (Beheer → Dossiers,
  // "Alleen tonen als") → alleen tonen zodra het gekoppelde ja/nee-veld op DIT dossier "Ja" is.
  const verborgenSet = new Set(verborgen || []);
  const alleenLezenSet = new Set(alleenLezen || []);
  const magTonen = (key) => {
    if (verborgenSet.has(key)) return false;
    const parentKey = voorwaarden && voorwaarden[key];
    if (parentKey) return !!veldenState[parentKey];
    return true;
  };
  const zichtbareSecties = (secties || [])
    .map((s) => {
      const velden = (s.velden || []).filter(magTonen);
      const subsecties = (s.subsecties || [])
        .map((sub) => ({ ...sub, velden: (sub.velden || []).filter(magTonen) }))
        .filter((sub) => sub.velden.length > 0);
      return { ...s, velden, subsecties };
    })
    .filter((s) => s.velden.length > 0 || s.subsecties.length > 0);

  // De drie "vaste" velden (__status/__urlDossier/__documentUrl) lopen niet via veldenState/
  // zetVeld maar via hun eigen state hierboven (status/urlDossier/documentUrl) — zo blijft
  // opslaan exact zoals het was, alleen de plek in de indeling is nu door Wouter zelf te kiezen.
  const renderVeld = (key) => {
    const veldDef = (catalogus || []).find((v) => v.key === key);
    if (!veldDef) return null;
    const isAlleenLezen = alleenLezenSet.has(key);
    if (key === "__status") {
      return <VeldInvoer key={key} veldDef={veldDef} waarde={status} onChange={(w) => { setStatus(w); setOpslaan("rust"); }} statusOpties={statusOpties} disabled={!bewerkbaar} alleenLezen={isAlleenLezen} stijlen={veldStijlen} />;
    }
    if (key === "__urlDossier") {
      return <VeldInvoer key={key} veldDef={veldDef} waarde={urlDossier} onChange={(w) => { setUrlDossier(w); setOpslaan("rust"); }} disabled={!bewerkbaar} alleenLezen={isAlleenLezen} stijlen={veldStijlen} />;
    }
    if (key === "__documentUrl") {
      return <VeldInvoer key={key} veldDef={veldDef} waarde={documentUrl} onChange={(w) => { setDocumentUrl(w); setOpslaan("rust"); }} disabled={!bewerkbaar} alleenLezen={isAlleenLezen} stijlen={veldStijlen} />;
    }
    return (
      <VeldInvoer
        key={key}
        veldDef={veldDef}
        waarde={veldenState[key]}
        onChange={(w) => zetVeld(key, w)}
        picklistOpties={picklistOpties}
        disabled={!bewerkbaar}
        alleenLezen={isAlleenLezen}
        stijlen={veldStijlen}
      />
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          <ArrowLeft size={15} /> Terug naar {soortLabel}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {dossier.soort === "ib" && onDossierAangemaakt && (
            <button onClick={() => setKopieOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${KLEUR.rand}`, color: KLEUR.tekst, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "6px 12px", borderRadius: 7 }}>
              <Copy size={14} /> Aangifte kopiëren naar volgend jaar
            </button>
          )}
          {magVerwijderen && (
            <button onClick={verwijder} disabled={verwijderBezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${KLEUR.rand}`, color: KLEUR.rood, fontSize: 12.5, fontWeight: 600, cursor: verwijderBezig ? "default" : "pointer", padding: "6px 12px", borderRadius: 7 }}>
              <Trash2 size={14} /> {verwijderBezig ? "Verwijderen…" : "Verwijderen"}
            </button>
          )}
        </div>
      </div>
      {verwijderFout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{verwijderFout}</div>}

      {kopieOpen && (
        <NieuwDossierModal
          soort={dossier.soort}
          soortLabel={soortLabel}
          periodeLabel={periodeLabel}
          dossiers={[]}
          vasteBron={dossier}
          onKlaar={() => setKopieOpen(false)}
          onAangemaakt={(nieuw) => { setKopieOpen(false); onDossierAangemaakt(nieuw); }}
        />
      )}

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{dossier.klantnaam || "—"}</div>
          {dossier.actief === false && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F0F0EC", color: KLEUR.mutedTekst }}>Inactief</span>}
        </div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>{soortLabel} · {periodeLabel} {periode(dossier) || "—"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px 24px" }}>
          <div><div style={label}>Cliënt</div><div style={waarde}>{dossier.klantnaam || "—"}</div></div>
          <div><div style={label}>{periodeLabel}</div><div style={waarde}>{periode(dossier) || "—"}</div></div>
          <div><div style={label}>Accountant</div><div style={waarde}>{dossier.accountant || "—"}</div></div>
          <div><div style={label}>Assistent</div><div style={waarde}>{dossier.assistent || "—"}</div></div>
          {dossier.manager && <div><div style={label}>Manager</div><div style={waarde}>{dossier.manager}</div></div>}
          {dossier.groepsnaam && <div><div style={label}>Groep</div><div style={waarde}>{dossier.groepsnaam}</div></div>}
        </div>
      </div>

      {!bewerkbaar && (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 16 }}>
          Dit dossier staat in Dynamics op <strong>inactief</strong> en is daarom hieronder alleen-lezen.
        </div>
      )}

      {dossier.soort === "ib" && <AangifteVersturenKaart dossier={dossier} disabled={!bewerkbaar} />}

      {uitvragen.length > 0 && uitvragen.map((u) => {
        const opengeklapt = uitvraagOpen[u.id] ?? (u.status !== "afgerond");
        return (
          <div key={u.id} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div
              onClick={() => setUitvraagOpen((h) => ({ ...h, [u.id]: !opengeklapt }))}
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: opengeklapt ? 14 : 0, cursor: "pointer" }}
            >
              <ChevronRight size={15} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transform: opengeklapt ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
              <FileText size={16} color={KLEUR.blauw} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>{u.lijstNaam || "Uitvraaglijst"}</span>
              <span
                style={{
                  fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".02em",
                  background: u.status === "afgerond" ? "#EAF6EE" : "#FCEFE0",
                  color: u.status === "afgerond" ? KLEUR.groen : "#B98237",
                }}
              >
                {u.status === "afgerond" ? "Afgerond" : "Open"}
              </span>
              {!u.zichtbaar && <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst }}>(concept — nog niet zichtbaar voor de klant)</span>}
              {u.openVragen > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F6E4E4", color: KLEUR.rood }}>
                  {u.openVragen} open vraag/vragen
                </span>
              )}
            </div>
            {opengeklapt && (
              <VragenlijstDetail
                verzoek={u}
                onGewijzigd={(bijgewerkt) => setUitvragen((h) => h.map((x) => (x.id === bijgewerkt.id ? bijgewerkt : x)))}
                onVerwijderd={() => setUitvragen((h) => h.filter((x) => x.id !== u.id))}
              />
            )}
          </div>
        );
      })}

      {zichtbareSecties.map((sectie) => (
        <div key={sectie.sleutel} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{sectie.titel}</div>
          {sectie.velden.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px 20px" }}>
              {sectie.velden.map((key) => renderVeld(key))}
            </div>
          )}
          {sectie.subsecties.map((sub) => (
            <div key={sub.sleutel} style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${KLEUR.rand}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 10 }}>{sub.titel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px 20px" }}>
                {sub.velden.map((key) => renderVeld(key))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {bewerkbaar && (
        <div style={{ position: "sticky", bottom: 0, background: "#fff", paddingTop: 8 }}>
          {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={bewaar} disabled={opslaan === "bezig" || !gewijzigd} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: gewijzigd ? KLEUR.groen : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: gewijzigd ? "pointer" : "default" }}>
              <CheckCircle2 size={14} /> {opslaan === "bezig" ? "Opslaan…" : "Opslaan"}
            </button>
            {opslaan === "gelukt" && !gewijzigd && <span style={{ fontSize: 12.5, color: KLEUR.groen }}>Opgeslagen.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function KlantOverzicht() {
  const [klanten, setKlanten] = useState(null); // null = laden
  const [afgekapt, setAfgekapt] = useState(false);
  const [fout, setFout] = useState(false);
  const [zoek, setZoek] = useState("");
  const [kolomFilters, setKolomFilters] = useState({}); // { kolomKey: waarde }
  const [sortKey, setSortKey] = useState("klantnaam");
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [toonAantal, setToonAantal] = useState(25); // aantal getoonde regels
  const [config, setConfig] = useState({ extraKolommen: [], standaardVerborgen: [] });
  const [zichtbareKolommen, setZichtbareKolommen] = useState(null); // null = nog standaard bepalen
  const [weergaven, setWeergaven] = useState([]); // [{ naam, config }]
  const [actieveWeergave, setActieveWeergave] = useState("");
  const [keuzes, setKeuzes] = useState({ clienttype: [], status: [], team: [], kantoor: [] });
  const [medewerkers, setMedewerkers] = useState([]); // voor de team-zoekvelden
  const [menu, setMenu] = useState(null); // { key, x, y } — geopend kolomkop-menu
  const [menuZoek, setMenuZoek] = useState("");
  const [kolomKiezerOpen, setKolomKiezerOpen] = useState(false);
  const [detailKlant, setDetailKlant] = useState(null);
  const [detailContact, setDetailContact] = useState(null);
  const [detailGroep, setDetailGroep] = useState(null);
  const [detailMedewerker, setDetailMedewerker] = useState(null); // { persoon, rol, klantnaam }
  const [magWijzigen, setMagWijzigen] = useState(false);
  const [magBulk, setMagBulk] = useState(false);
  const [isBeheerder, setIsBeheerder] = useState(false);
  const [selectie, setSelectie] = useState(() => new Set()); // geselecteerde accountId's voor bulk
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkVragenlijstOpen, setBulkVragenlijstOpen] = useState(false);
  const [klantToevoegenOpen, setKlantToevoegenOpen] = useState(false);
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  const [scope, setScope] = useState("mijn"); // "mijn" | "alle"

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setKlanten(d.klanten || []); setAfgekapt(!!d.afgekapt); })
      .catch(() => { setKlanten([]); setFout(true); });
    fetch("/api/medewerker-rechten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMagWijzigen(!!d.magWijzigen); setMagBulk(!!d.magBulk); })
      .catch(() => { setMagWijzigen(false); setMagBulk(false); });
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((d) => setIsBeheerder(((d.clientPrincipal && d.clientPrincipal.userRoles) || []).includes("beheerder")))
      .catch(() => setIsBeheerder(false));
    fetch("/api/instellingen")
      .then((r) => r.json())
      .then((d) => setConfig(d.klantoverzicht && typeof d.klantoverzicht === "object" ? { extraKolommen: d.klantoverzicht.extraKolommen || [], standaardVerborgen: d.klantoverzicht.standaardVerborgen || [] } : { extraKolommen: [], standaardVerborgen: [] }))
      .catch(() => {});
    fetch("/api/medewerker-weergaven")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setWeergaven(d.views || []))
      .catch(() => {});
    fetch("/api/klant-keuzelijsten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKeuzes({ clienttype: d.clienttype || [], status: d.status || [], team: d.team || [], kantoor: d.kantoor || [] }))
      .catch(() => {});
    fetch("/api/beheer-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMedewerkers(d.medewerkers || []))
      .catch(() => {});
  }, []);

  // Kolommen = basis + door beheer toegevoegde extra velden.
  const KOLOMMEN = [
    ...BASIS_KOLOMMEN,
    ...(config.extraKolommen || []).filter((c) => c && c.veld).map((c) => ({
      key: "extra_" + c.veld,
      label: c.label || c.veld,
      cel: (k) => (k.extra && k.extra[c.veld]) || "",
    })),
  ];
  const alleKeys = KOLOMMEN.map((c) => c.key);
  // Standaard-zichtbaarheid uit de beheer-config bepalen zodra we die (en de kolommen) kennen.
  useEffect(() => {
    setZichtbareKolommen((huidig) => huidig || new Set(alleKeys.filter((key) => !(config.standaardVerborgen || []).includes(key))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  const zichtbareSet = zichtbareKolommen || new Set(alleKeys.filter((key) => !(config.standaardVerborgen || []).includes(key)));

  // Werkt één klant bij in de lijst én in het geopende detail na een opgeslagen wijziging.
  const verwerkKlantWijziging = (accountId, patch) => {
    setKlanten((huidig) => huidig.map((k) => (k.accountId === accountId ? { ...k, ...patch } : k)));
    setDetailKlant((huidig) => (huidig && huidig.accountId === accountId ? { ...huidig, ...patch } : huidig));
    setDetailContact((huidig) => (huidig && huidig.accountId === accountId ? { ...huidig, ...patch } : huidig));
  };

  const naKlantToevoegen = (nieuw) => {
    // nieuw: { accountId, klantnaam, klantnummer }
    const klant = { accountId: nieuw.accountId, klantnaam: nieuw.klantnaam || "", klantnummer: nieuw.klantnummer || "", adres: {}, contact: {}, groepsnaam: "", klantcategorieen: [] };
    setKlanten((huidig) => [klant, ...(huidig || [])]);
    setKlantToevoegenOpen(false);
    setDetailKlant(klant); // meteen openen zodat je verder kunt vullen/koppelen
  };

  const naKlantVerwijderen = (accountId) => {
    setKlanten((huidig) => (huidig || []).filter((k) => k.accountId !== accountId));
    setSelectie((h) => { const n = new Set(h); n.delete(accountId); return n; });
    setDetailKlant(null);
  };

  if (klanten === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Klantoverzicht ophalen…
      </div>
    );
  }

  const openMedewerker = (persoon, rol, klantnaam) => { if (persoon && persoon.naam) setDetailMedewerker({ persoon, rol, klantnaam }); };

  if (detailMedewerker) {
    return <MedewerkerDetail persoon={detailMedewerker.persoon} rol={detailMedewerker.rol} klantnaam={detailMedewerker.klantnaam} onTerug={() => setDetailMedewerker(null)} />;
  }
  if (detailKlant) {
    return <KlantDetail klant={detailKlant} magWijzigen={magWijzigen} isBeheerder={isBeheerder} keuzes={keuzes} medewerkers={medewerkers} onTerug={() => setDetailKlant(null)} onContact={(k) => { setDetailKlant(null); setDetailContact(k); }} onMedewerker={openMedewerker} onOpgeslagen={verwerkKlantWijziging} onVerwijderd={naKlantVerwijderen} />;
  }
  if (detailContact) {
    return <ContactDetail klant={detailContact} magWijzigen={magWijzigen} onTerug={() => setDetailContact(null)} onOpgeslagen={verwerkKlantWijziging} />;
  }
  if (detailGroep) {
    return <GroepDetail groepsnaam={detailGroep} klanten={klanten} onTerug={() => setDetailGroep(null)} onKlant={(k) => { setDetailGroep(null); setDetailKlant(k); }} />;
  }

  const kolomVan = (key) => KOLOMMEN.find((c) => c.key === key);
  const term = zoek.trim().toLowerCase();
  const gefilterd = klanten.filter((k) => {
    if (scope === "mijn" && mijnNaam && !isKlantVanMij(k, mijnNaam)) return false;
    for (const [key, val] of Object.entries(kolomFilters)) {
      if (!val) continue;
      const kol = kolomVan(key);
      if (!kol) continue;
      const cel = kol.cel(k);
      if (typeof val === "object" && val.bevat) {
        if (!String(cel).toLowerCase().includes(val.bevat.toLowerCase())) return false;
      } else if (cel !== val) {
        return false;
      }
    }
    if (term) {
      const raak = [k.klantnaam, String(k.klantnummer ?? ""), k.groepsnaam, k.contact?.naam, k.relatiebeheerder, k.team, k.clienttype]
        .map((v) => (v == null ? "" : String(v)).toLowerCase())
        .some((v) => v.includes(term));
      if (!raak) return false;
    }
    return true;
  });
  const filterActief = Object.values(kolomFilters).some(Boolean) || !!term;

  const sortKol = kolomVan(sortKey) || kolomVan("klantnaam");
  const gesorteerd = [...gefilterd].sort((x, y) => {
    const va = sortKol.cel(x), vb = sortKol.cel(y);
    let c;
    if (sortKol.num) c = (Number(va) || 0) - (Number(vb) || 0);
    else c = String(va).localeCompare(String(vb), "nl", { sensitivity: "base" });
    return sortDir === "asc" ? c : -c;
  });
  const pijl = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const zichtbaar = gesorteerd.slice(0, toonAantal);
  const zichtKols = KOLOMMEN.filter((c) => zichtbareSet.has(c.key));

  const openKopMenu = (e, key) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuZoek("");
    setMenu((m) => (m && m.key === key ? null : { key, x: r.left, y: r.bottom }));
  };
  const wisAllesFilters = () => { setKolomFilters({}); setZoek(""); };

  // Bulk-selectie: op basis van accountId. "Alles" werkt op de gefilterde lijst.
  const gefilterdeIds = gefilterd.map((k) => k.accountId);
  const allesGeselecteerd = gefilterdeIds.length > 0 && gefilterdeIds.every((id) => selectie.has(id));
  const toggleSelectie = (id) => setSelectie((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAlles = () => setSelectie(() => (allesGeselecteerd ? new Set() : new Set(gefilterdeIds)));
  const bulkToepassen = async (veld, waarde, naam) => {
    const ids = [...selectie];
    const res = await fetch("/api/medewerker-bulk-wijzigen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds: ids, veld: veld.key, waarde }),
    });
    if (!res.ok) throw new Error(await res.text());
    const d = await res.json();
    const mislukteIds = new Set((d.mislukt || []).map((m) => m.accountId));
    const geluktIds = new Set(ids.filter((id) => !mislukteIds.has(id)));
    setKlanten((huidig) => huidig.map((k) => {
      if (!geluktIds.has(k.accountId)) return k;
      if (veld.soort === "team") return { ...k, [veld.bron]: waarde ? { ...(k[veld.bron] || {}), id: waarde, naam } : null };
      return { ...k, [veld.key]: waarde === "" ? "" : naam };
    }));
    return d;
  };

  // Opgeslagen weergaven (persoonlijk): kolommen + filters + sortering + aantal regels.
  const huidigeConfig = () => ({ kolommen: [...zichtbareSet], filters: kolomFilters, sortKey, sortDir, toonAantal });
  const pasWeergaveToe = (cfg) => {
    if (!cfg) return;
    if (Array.isArray(cfg.kolommen)) setZichtbareKolommen(new Set(cfg.kolommen));
    setKolomFilters(cfg.filters || {});
    if (cfg.sortKey) setSortKey(cfg.sortKey);
    if (cfg.sortDir) setSortDir(cfg.sortDir);
    if (cfg.toonAantal) setToonAantal(cfg.toonAantal);
  };
  const bewaarWeergaven = (lijst) => {
    setWeergaven(lijst);
    fetch("/api/medewerker-weergaven", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ views: lijst }) }).catch(() => {});
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

  const selectStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", color: KLEUR.tekst, cursor: "pointer" };
  const menuItem = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, color: KLEUR.tekst };
  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  // Bewust geen fontWeight: de klikbare kolommen (cliëntnaam, groep, contactpersoon, manager,
  // accountant, assistent, fiscaal medewerker, loonadministratie) waren alle acht vet, wat de
  // tabel onrustig maakte. De blauwe kleur maakt al duidelijk dat het aanklikbaar is.
  const linkStijl = { color: KLEUR.blauw, cursor: "pointer", background: "none", border: "none", padding: 0, fontSize: 12.5, textAlign: "left" };

  const renderCel = (kol, k) => {
    const tekst = kol.cel(k);
    if (kol.soort === "klant") return <button onClick={() => setDetailKlant(k)} style={linkStijl}>{tekst || "—"}</button>;
    if (kol.soort === "groep") return tekst ? <button onClick={() => setDetailGroep(tekst)} style={linkStijl}>{tekst}</button> : "—";
    if (kol.soort === "contact") return tekst ? <button onClick={() => setDetailContact(k)} style={linkStijl}>{tekst}</button> : "—";
    if (kol.soort === "medewerker") { const p = kol.persoon(k); return p && p.naam ? <button onClick={() => openMedewerker(p, kol.rol, k.klantnaam)} style={linkStijl}>{p.naam}</button> : "—"; }
    if (kol.soort === "sharepoint") return k.sharepointUrl ? <a href={k.sharepointUrl} target="_blank" rel="noopener noreferrer" style={{ color: KLEUR.blauw, fontWeight: 600, textDecoration: "none" }}>Map</a> : "—";
    return tekst || "—";
  };

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Klantoverzicht</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14 }}>
        Klik op een klantnaam, groep of contactpersoon om de details te bekijken.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <ScopeToggle scope={scope} setScope={setScope} />
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op naam, nummer, groep, contact…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }}
          />
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setKolomKiezerOpen((o) => !o)} style={selectStijl}>Kolommen ▾</button>
          {kolomKiezerOpen && (
            <>
              <div onClick={() => setKolomKiezerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 41, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", padding: 10, width: 220, maxHeight: 320, overflowY: "auto" }}>
                {KOLOMMEN.map((kol) => (
                  <label key={kol.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={zichtbareSet.has(kol.key)}
                      onChange={() => setZichtbareKolommen(() => { const n = new Set(zichtbareSet); if (n.has(kol.key)) n.delete(kol.key); else n.add(kol.key); return n; })}
                    />
                    {kol.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <select value={actieveWeergave} onChange={(e) => kiesWeergave(e.target.value)} style={selectStijl} title="Opgeslagen weergave">
          <option value="">Weergave…</option>
          {weergaven.map((v) => <option key={v.naam} value={v.naam}>{v.naam}</option>)}
        </select>
        <button onClick={opslaanAlsWeergave} style={selectStijl} title="Huidige indeling opslaan als weergave">Opslaan als…</button>
        {actieveWeergave && (
          <button onClick={verwijderWeergave} style={{ ...selectStijl, color: KLEUR.rood }} title="Verwijder deze weergave">Verwijderen</button>
        )}
        {filterActief && (
          <button
            onClick={wisAllesFilters}
            style={{ padding: "8px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Filters wissen
          </button>
        )}
        {isBeheerder && (
          <button onClick={() => setKlantToevoegenOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", padding: "8px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={14} /> Nieuwe klant
          </button>
        )}
      </div>

      {Object.entries(kolomFilters).filter(([, v]) => v).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {Object.entries(kolomFilters).filter(([, v]) => v).map(([key, v]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", background: KLEUR.lichtblauw, color: KLEUR.blauw, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
              {(kolomVan(key)?.label || key)}{typeof v === "object" && v.bevat ? ` bevat "${v.bevat}"` : `: ${v}`}
              <button onClick={() => setKolomFilters((h) => { const n = { ...h }; delete n[key]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>
          De klantenlijst kon niet worden geladen. Controleer de Dynamics- en opslag-instellingen.
        </div>
      )}

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 8 }}>
        {gefilterd.length} klant{gefilterd.length === 1 ? "" : "en"}
        {afgekapt ? " · lijst afgekapt, verfijn je zoekopdracht" : ""}
      </div>

      {magBulk && selectie.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10, padding: "10px 14px", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: KLEUR.blauw }}>{selectie.size} geselecteerd</span>
          <button onClick={() => setBulkOpen(true)} style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Bulk bewerken</button>
          <button onClick={() => setBulkVragenlijstOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Mail size={13} /> Vragenlijst versturen</button>
          <button onClick={() => setSelectie(new Set())} style={{ padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Selectie wissen</button>
        </div>
      )}

      {scope === "mijn" && naamGeladen && !mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8 }}>Je naam kon niet automatisch worden bepaald, dus we kunnen niet zien welke cliënten van jou zijn. Gebruik <strong>Kantoorbreed</strong>.</div>
      )}

      <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, zichtKols.length * 95) }}>
          <thead>
            <tr>
              {magBulk && (
                <th style={{ ...th, width: 1, cursor: "pointer" }} title="Alles op deze gefilterde lijst selecteren">
                  <input type="checkbox" checked={allesGeselecteerd} onChange={toggleAlles} />
                </th>
              )}
              {zichtKols.map((kol) => {
                const actief = sortKey === kol.key || kolomFilters[kol.key];
                return (
                  <th
                    key={kol.key}
                    onClick={(e) => openKopMenu(e, kol.key)}
                    title="Klik om te sorteren of filteren"
                    style={{ ...th, cursor: "pointer", userSelect: "none", color: actief ? KLEUR.blauw : th.color }}
                  >
                    {kol.label}{pijl(kol.key)}{kolomFilters[kol.key] ? " •" : ""} <span style={{ color: KLEUR.mutedTekst }}>▾</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map((k) => (
              <tr key={k.accountId} style={selectie.has(k.accountId) ? { background: KLEUR.lichtblauw } : undefined}>
                {magBulk && (
                  <td style={td}>
                    <input type="checkbox" checked={selectie.has(k.accountId)} onChange={() => toggleSelectie(k.accountId)} />
                  </td>
                )}
                {zichtKols.map((kol) => (
                  <td key={kol.key} style={td}>{renderCel(kol, k)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
          {Math.min(toonAantal, gefilterd.length)} van {gefilterd.length} getoond
          {afgekapt ? " · lijst afgekapt in Dynamics" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
          {[[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]].map(([n, lbl]) => (
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

      {menu && (() => {
        const kol = kolomVan(menu.key);
        if (!kol) return null;
        const waarden = kol.geenFilter ? [] : [...new Set(klanten.map(kol.cel).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "nl"))
          .filter((v) => !menuZoek || v.toLowerCase().includes(menuZoek.toLowerCase()));
        return (
          <>
            <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
            <div style={{ position: "fixed", left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 260), top: menu.y + 4, width: 240, maxHeight: 360, overflowY: "auto", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", zIndex: 51, padding: 8 }}>
              {!kol.geenSort && (
                <>
                  <button onClick={() => { setSortKey(kol.key); setSortDir("asc"); setMenu(null); }} style={menuItem}>↑ Sorteer A→Z</button>
                  <button onClick={() => { setSortKey(kol.key); setSortDir("desc"); setMenu(null); }} style={menuItem}>↓ Sorteer Z→A</button>
                </>
              )}
              {!kol.geenFilter && (
                <>
                  <div style={{ height: 1, background: KLEUR.rand, margin: "6px 0" }} />
                  <input
                    value={menuZoek}
                    onChange={(e) => setMenuZoek(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && menuZoek.trim()) {
                        setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } }));
                        setMenu(null);
                      }
                    }}
                    placeholder="Typ en Enter = bevat…"
                    style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 12.5 }}
                  />
                  {menuZoek.trim() && (
                    <button onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: { bevat: menuZoek.trim() } })); setMenu(null); }} style={{ ...menuItem, color: KLEUR.blauw, fontWeight: 600 }}>
                      Filter op: bevat “{menuZoek.trim()}”
                    </button>
                  )}
                  <button onClick={() => { setKolomFilters((h) => { const n = { ...h }; delete n[kol.key]; return n; }); setMenu(null); }} style={{ ...menuItem, fontWeight: kolomFilters[kol.key] ? 400 : 700 }}>Alles tonen</button>
                  {waarden.map((v) => (
                    <button key={v} onClick={() => { setKolomFilters((h) => ({ ...h, [kol.key]: v })); setMenu(null); }} style={{ ...menuItem, color: kolomFilters[kol.key] === v ? KLEUR.blauw : KLEUR.tekst, fontWeight: kolomFilters[kol.key] === v ? 700 : 400 }}>{v}</button>
                  ))}
                  {waarden.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 8px" }}>Geen waarden</div>}
                </>
              )}
            </div>
          </>
        );
      })()}

      {bulkOpen && magBulk && (
        <BulkBewerken
          aantal={selectie.size}
          keuzes={keuzes}
          medewerkers={medewerkers}
          onToepassen={bulkToepassen}
          onKlaar={() => setBulkOpen(false)}
        />
      )}

      {bulkVragenlijstOpen && magBulk && (
        <BulkVragenlijst
          accountIds={[...selectie]}
          onKlaar={() => setBulkVragenlijstOpen(false)}
          onKlaarEnVervers={() => { setBulkVragenlijstOpen(false); setSelectie(new Set()); }}
        />
      )}

      {klantToevoegenOpen && isBeheerder && (
        <KlantToevoegen onKlaar={() => setKlantToevoegenOpen(false)} onToegevoegd={naKlantToevoegen} />
      )}
    </div>
  );
}

/* ── Nieuwe klant toevoegen (beknopt: naam + adres + e-mail/telefoon) ── */
function KlantToevoegen({ onKlaar, onToegevoegd }) {
  const [f, setF] = useState({ name: "", straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "", land: "", telefoon: "", email: "" });
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [fout, setFout] = useState("");
  const zet = (k) => (v) => setF((h) => ({ ...h, [k]: v }));
  const klaar = f.name.trim() !== "";
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
      const account = {
        name: f.name, address1_line1: f.straat, cr283_huisnummer: f.huisnummer, cr283_huisnummertoevoeging: f.toevoeging,
        address1_postalcode: f.postcode, address1_city: f.plaats, address1_country: f.land,
        telephone1: f.telefoon, emailaddress1: f.email,
      };
      const r = await fetch("/api/medewerker-klant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "toevoegen", account }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      onToegevoegd({ accountId: d.accountId, klantnaam: d.klantnaam || f.name, klantnummer: d.klantnummer || "" });
    } catch (e) {
      setFout(e.message || "Aanmaken mislukt.");
      setStatus("fout");
    }
  };

  return (
    <>
      <div onClick={onKlaar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", padding: 22, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Nieuwe klant</div>
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 10 }}>
          De cliënt wordt in Dynamics aangemaakt. Cliënttype/team en de contactpersoon (koppelen) doe je daarna via Bewerken.
        </div>

        <div style={lbl}>Naam *</div>{inp(f.name, zet("name"))}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
          <div><div style={lbl}>Straat</div>{inp(f.straat, zet("straat"))}</div>
          <div><div style={lbl}>Nr.</div>{inp(f.huisnummer, zet("huisnummer"))}</div>
          <div><div style={lbl}>Toev.</div>{inp(f.toevoeging, zet("toevoeging"))}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><div style={lbl}>Postcode</div>{inp(f.postcode, zet("postcode"))}</div>
          <div><div style={lbl}>Plaats</div>{inp(f.plaats, zet("plaats"))}</div>
          <div><div style={lbl}>Land</div>{inp(f.land, zet("land"))}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><div style={lbl}>Telefoon</div>{inp(f.telefoon, zet("telefoon"))}</div>
          <div><div style={lbl}>E-mail</div>{inp(f.email, zet("email"), { type: "email" })}</div>
        </div>

        {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginTop: 10 }}>Aanmaken mislukt: {fout}</div>}
        {!klaar && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>De naam is verplicht.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={opslaan} disabled={!klaar || status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: klaar ? "#2E7D46" : "#9DB4A5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: klaar ? "pointer" : "default" }}>
            <CheckCircle2 size={14} /> {status === "bezig" ? "Aanmaken…" : "Klant aanmaken"}
          </button>
          <button onClick={onKlaar} style={{ padding: "9px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annuleren</button>
        </div>
      </div>
    </>
  );
}

// ── Meekijken als klant ─────────────────────────────────────────────────────
/** Kies een klant en bekijk (alleen-lezen) precies wat die klant in het klantportaal ziet.
 * Alleen zichtbaar/bruikbaar voor medewerkers met het als-klant-recht (of beheerders — zie
 * Beheer → Medewerkers). De daadwerkelijke autorisatie + het alleen-lezen afdwingen gebeurt op
 * de backend (herleidAccounts in api/_gedeeld/identiteit.js); dit scherm kiest alleen wélke klant
 * en legt het moment vast in de audit-log (api/medewerker-klant-inzage). */
function MeekijkenAlsKlant({ gebruiker }) {
  const [klanten, setKlanten] = useState(null); // null = laden
  const [fout, setFout] = useState(false);
  const [zoek, setZoek] = useState("");
  const [bezigId, setBezigId] = useState(null);
  const [startFout, setStartFout] = useState("");
  const [toonAantal, setToonAantal] = useState(25);

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKlanten(d.klanten || []))
      .catch(() => { setKlanten([]); setFout(true); });
  }, []);

  const bekijkAlsKlant = useCallback(async (klant) => {
    setStartFout("");
    if (!klant.contactEmail) {
      setStartFout(`Geen e-mailadres van de contactpersoon bekend bij "${klant.klantnaam}" — kan niet meekijken.`);
      return;
    }
    setBezigId(klant.accountId);
    try {
      const res = await fetch("/api/medewerker-klant-inzage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: klant.accountId,
          klantnummer: klant.klantnummer,
          klantnaam: klant.klantnaam,
          contactEmail: klant.contactEmail,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      startMeekijken({
        accountId: klant.accountId,
        klantnummer: klant.klantnummer,
        klantnaam: klant.klantnaam,
        contactEmail: klant.contactEmail,
        medewerkerNaam: gebruiker?.userDetails || "",
        medewerkerEmail: gebruiker?.userDetails || "",
      });
      window.location.href = "/";
    } catch {
      setStartFout("Meekijken starten is niet gelukt, probeer het nog eens.");
      setBezigId(null);
    }
  }, [gebruiker]);

  if (klanten === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Klanten ophalen…
      </div>
    );
  }

  const term = zoek.trim().toLowerCase();
  const gefilterd = klanten
    .filter((k) => !term || [k.klantnaam, String(k.klantnummer ?? ""), k.contactNaam, k.contactEmail].filter(Boolean).some((v) => v.toLowerCase().includes(term)));
  const zichtbaar = gefilterd.slice(0, toonAantal);

  return (
    <div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 720 }}>
        Kies hieronder een klant om het klantportaal <strong>alleen-lezen</strong> te bekijken, precies zoals die
        klant het zelf ziet. Er wordt niets gewijzigd of verstuurd namens de klant, en dit moment wordt vastgelegd
        in de audit-log (Beheer → Medewerkers).
      </div>
      {fout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 12 }}>
          Er ging iets mis bij het ophalen van de klantenlijst.
        </div>
      )}
      {startFout && (
        <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 12 }}>{startFout}</div>
      )}
      <div style={{ position: "relative", marginBottom: 12, maxWidth: 320 }}>
        <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek klant…"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 520, overflowY: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
        {gefilterd.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen klanten gevonden.</div>
        ) : (
          zichtbaar.map((k, i) => (
            <div key={k.accountId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{k.klantnaam}{k.klantnummer ? ` (${k.klantnummer})` : ""}</div>
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
                  {k.contactNaam || "Geen contactpersoon"}{k.contactEmail ? ` · ${k.contactEmail}` : ""}
                </div>
              </div>
              <button
                onClick={() => bekijkAlsKlant(k)}
                disabled={bezigId === k.accountId || !k.contactEmail}
                title={!k.contactEmail ? "Geen e-mailadres van de contactpersoon bekend" : "Bekijk het klantportaal alleen-lezen namens deze klant"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
                  background: k.contactEmail ? KLEUR.blauw : KLEUR.rand, color: k.contactEmail ? "#fff" : KLEUR.mutedTekst,
                  border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
                  cursor: k.contactEmail ? "pointer" : "not-allowed", whiteSpace: "nowrap",
                }}
              >
                <Eye size={13} /> {bezigId === k.accountId ? "Bezig…" : "Bekijk als klant"}
              </button>
            </div>
          ))
        )}
      </div>

      {gefilterd.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
            {Math.min(toonAantal, gefilterd.length)} van {gefilterd.length} getoond
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
            <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
            {[[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]].map(([n, lbl]) => (
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
      )}
    </div>
  );
}

// ── Medewerkersportaal ──────────────────────────────────────────────────────
export default function MedewerkerPortaal() {
  const [status, setStatus] = useState("laden"); // laden | nietIngelogd | geenRol | klaar
  const [gebruiker, setGebruiker] = useState(null);
  const [isBeheerder, setIsBeheerder] = useState(false);
  const [magAlsKlant, setMagAlsKlant] = useState(false);
  // Mag deze medewerker offertes/opdrachtbevestigingen maken? Beheert een beheerder via
  // Beheer → Medewerkers. Dit bepaalt alleen of de tab "Offertes" verschijnt; de offerte-API's
  // controleren het recht zelf ook (api/_gedeeld/offertesRecht.js), dus dit is geen slot.
  const [magOffertes, setMagOffertes] = useState(false);
  // Mag deze medewerker de tab "Contracten" zien? Beheert een beheerder via Beheer → Medewerkers
  // (Contractmanagement-plan, Stap 3). Bepaalt vooralsnog alleen of de tab verschijnt — er is nog
  // geen eigen medewerkerskant-API om serverkant af te dwingen zoals bij offertes; die komt met
  // Stap 6, wanneer ContractenOverzicht.jsx zijn placeholder inruilt voor echte inhoud.
  const [magContracten, setMagContracten] = useState(false);
  const [tab, setTab] = useState("klantoverzicht"); // klantoverzicht | verzoeken | reacties | ondertekeningen | reviews | offertes | contracten | meekijken
  const [tellingen, setTellingen] = useState({ openWijzigingen: 0, nieuweReviews: 0, vragenlijstenAandacht: 0 });
  const [logoUrl, setLogoUrl] = useState("");

  const laadTellingen = useCallback(() => {
    fetch("/api/beheer-tellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTellingen({
        openWijzigingen: d.openWijzigingen || 0,
        nieuweReviews: d.nieuweReviews || 0,
        vragenlijstenAandacht: d.vragenlijstenAandacht || 0,
      }))
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
      .then((d) => { zetBrowserFavicon(d.faviconUrl); setLogoUrl(d.logoUrl || ""); })
      .catch(() => {});
    fetch("/api/medewerker-rechten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMagAlsKlant(!!d.magAlsKlant); setMagOffertes(!!d.magOffertes); setMagContracten(!!d.magContracten); })
      .catch(() => setMagAlsKlant(false));
  }, [status]);

  // Tellingen bijwerken bij elke tabwissel. Op het reviews- en vragenlijsten-tabblad wordt eerst
  // "gezien" gemarkeerd (badge naar 0) en daarna worden de tellingen ververst.
  useEffect(() => {
    if (status !== "klaar") return;
    const gezienActie = tab === "reviews" ? "reviews-gezien" : tab === "vragenlijsten" ? "vragenlijsten-gezien" : null;
    if (gezienActie) {
      fetch("/api/beheer-tellingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: gezienActie }),
      })
        .then(() => laadTellingen())
        .catch(() => laadTellingen());
    } else {
      laadTellingen();
    }
  }, [status, tab, laadTellingen]);

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
    ["klantoverzicht", "Klantoverzicht", 0],
    ["vragenlijsten", "Vragenlijsten", tellingen.vragenlijstenAandacht],
    ["uren", "Uren", 0],
    ["verzoeken", "Wijzigingsverzoeken", tellingen.openWijzigingen],
    ["reacties", "Log klantreacties", 0],
    ["ondertekeningen", "Ondertekeningen", 0],
    ["reviews", "Reviews", tellingen.nieuweReviews],
    ...(magOffertes || isBeheerder ? [["offertes", "Offertes", 0]] : []),
    ...(magContracten || isBeheerder ? [["contracten", "Contracten", 0]] : []),
    ...(magAlsKlant || isBeheerder ? [["meekijken", "Meekijken als klant", 0]] : []),
  ];

  return (
    <div style={{ maxWidth: "none", width: "100%", margin: "0 auto", padding: "24px 32px", boxSizing: "border-box", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={20} color={KLEUR.blauw} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Medewerkersportaal</div>
          {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxHeight: 30, maxWidth: 160, objectFit: "contain", display: "block", alignSelf: "center", marginLeft: 8 }} />}
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

      {tab === "klantoverzicht" && <KlantenModule />}
      {tab === "vragenlijsten" && <Vragenlijsten />}
      {tab === "uren" && <Urenregistratie isBeheerder={isBeheerder} />}
      {tab === "verzoeken" && <WijzigingsverzoekBeheer onAfgehandeld={laadTellingen} />}
      {tab === "reacties" && <AkkoordenLog />}
      {tab === "ondertekeningen" && <OndertekeningenLog />}
      {tab === "reviews" && <ReviewBeheer />}
      {tab === "offertes" && (magOffertes || isBeheerder) && <OffertesModule />}
      {tab === "contracten" && (magContracten || isBeheerder) && <ContractenOverzicht />}
      {tab === "meekijken" && <MeekijkenAlsKlant gebruiker={gebruiker} />}
    </div>
  );
}
