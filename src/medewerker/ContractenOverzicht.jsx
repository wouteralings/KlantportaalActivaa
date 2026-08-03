/**
 * Medewerkerskant van de Contractenmodule — spiegelt ContractenModule.jsx (klantkant, zie
 * src/portaal/), maar bewust een ander bestand/andere naam om botsing met de klantversie te
 * voorkomen (zie het contractmanagement-plan, §3 "Naamsbotsing voorkomen").
 *
 * Stap 6: het echte "mini-dashboard voor relatiebeheerders" — alle zelf-geregistreerde
 * contracten over ALLE klantaccounts heen (waar de ingelogde medewerker toegang toe heeft, d.w.z.
 * beheerder of het granulaire "Contracten"-recht), gesorteerd op eerstvolgende afloop. Haalt de
 * contracten op bij /api/mw-contracten-overzicht (beveiligd met contractenRecht.js, zelfde
 * tweelaagse patroon als offertesRecht.js) en de klantnaam/-nummer bij het al bestaande
 * /api/beheer-klanten — bewust GEEN eigen Dynamics-accountquery hier (zie de toelichting in
 * api/mw-contracten-overzicht/index.js).
 *
 * Sinds Stap 3 is de tab niet meer alleen voor beheerders: een medewerker met het granulaire
 * "Contracten"-recht (Beheer → Medewerkers → "Medewerkers — wijzig-rechten", kolom "Contracten";
 * zelfde opzet als het bestaande "Offertes"-recht in api/_gedeeld/wijzigrechten.js) ziet hem ook,
 * zie MedewerkerPortaal.jsx. Sinds Stap 6 wordt dat recht ook op de server afgedwongen
 * (api/_gedeeld/contractenRecht.js), niet meer alleen als weergave-keuze.
 */
import { useState, useEffect, useMemo } from "react";
import { FileText, Search, AlertTriangle } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };

// Moet in sync blijven met GELDIGE_TYPES in api/_gedeeld/contractenKlanten.js (zie de toelichting
// daar; ook bewust hier herhaald, net als in ContractenModule.jsx op de klantkant).
const TYPE_LABELS = {
  verzekering: "Verzekering", telefonie: "Telefonie", internet: "Internet",
  software: "Software", lease: "Lease", overig: "Overig",
};

function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
function dagenTot(einddatum) {
  if (!einddatum) return null;
  const eind = new Date(einddatum);
  if (isNaN(eind.getTime())) return null;
  eind.setHours(0, 0, 0, 0);
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((eind.getTime() - vandaag.getTime()) / 86400000);
}
function verloopBadge(einddatum) {
  const dagen = dagenTot(einddatum);
  if (dagen == null) return { tekst: "Geen einddatum", kleur: KLEUR.mutedTekst, achtergrond: "#F2F3F0" };
  if (dagen < 0) return { tekst: `Verlopen (${Math.abs(dagen)} dagen geleden)`, kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 30) return { tekst: `Over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`, kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 90) return { tekst: `Over ${dagen} dagen`, kleur: KLEUR.amber, achtergrond: KLEUR.amberAchtergrond };
  return { tekst: `Over ${dagen} dagen`, kleur: KLEUR.groen, achtergrond: "#EAF6EE" };
}

const FILTERS = [
  { key: "alles", label: "Alles" },
  { key: "binnenkort", label: "Verloopt binnen 90 dagen" },
  { key: "verlopen", label: "Verlopen" },
];

export default function ContractenOverzicht() {
  const [contracten, setContracten] = useState(null);
  const [klanten, setKlanten] = useState({});
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState("binnenkort");

  useEffect(() => {
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const bij = {};
        (d.klanten || []).forEach((k) => { bij[k.accountId] = k; });
        setKlanten(bij);
      })
      .catch(() => setKlanten({}));

    fetch("/api/mw-contracten-overzicht")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setContracten(d.contracten || []))
      .catch((err) => setFout(err.message || "Contracten konden niet worden opgehaald."));
  }, []);

  const rijen = useMemo(() => {
    if (!contracten) return [];
    return contracten.map((c) => ({
      ...c,
      klantnaam: klanten[c.klantAccountId]?.klantnaam || "Onbekende klant",
      klantnummer: klanten[c.klantAccountId]?.klantnummer || "",
      dagen: dagenTot(c.einddatum),
    }));
  }, [contracten, klanten]);

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return rijen.filter((r) => {
      if (term) {
        const raak = [r.klantnaam, r.klantnummer, r.naam, r.leverancier].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
        if (!raak) return false;
      }
      if (filter === "binnenkort") return r.dagen != null && r.dagen <= 90;
      if (filter === "verlopen") return r.dagen != null && r.dagen < 0;
      return true;
    });
  }, [rijen, zoek, filter]);

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <FileText size={17} color={KLEUR.blauw} /> Contracten — overzicht alle klanten
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
        Zelf geregistreerde doorlopende contracten van alle klanten, gesorteerd op eerstvolgende afloop.
      </div>

      {fout && (
        <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
          {fout}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
          <Search size={16} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op klant, contractnaam of leverancier…"
            style={{ ...inputStijl, padding: "9px 12px 9px 36px" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "8px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${filter === f.key ? KLEUR.blauw : KLEUR.rand}`,
                background: filter === f.key ? KLEUR.lichtblauw : "#fff",
                color: filter === f.key ? KLEUR.blauw : KLEUR.subtekst,
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {contracten === null && !fout && <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>Laden…</div>}

      {contracten !== null && gefilterd.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>
          {rijen.length === 0 ? "Nog geen contracten geregistreerd door klanten." : "Geen contracten gevonden voor dit filter."}
        </div>
      )}

      {gefilterd.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          {gefilterd.map((c, i) => {
            const badge = verloopBadge(c.einddatum);
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`,
              }}>
                {c.dagen != null && c.dagen <= 30 && (
                  <AlertTriangle size={15} color={KLEUR.rood} style={{ flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 130, flexShrink: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.klantnummer || "—"}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.klantnaam}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw,
                  padding: "3px 8px", borderRadius: 5, flexShrink: 0,
                }}>
                  {TYPE_LABELS[c.type] || c.type || "—"}
                </span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.naam}{c.leverancier ? ` — ${c.leverancier}` : ""}
                </div>
                <div style={{ fontSize: 12, color: KLEUR.subtekst, flexShrink: 0, minWidth: 80, textAlign: "right" }}>
                  {datum(c.einddatum)}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: badge.kleur, background: badge.achtergrond,
                  padding: "3px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap", minWidth: 90, textAlign: "center",
                }}>
                  {badge.tekst}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
