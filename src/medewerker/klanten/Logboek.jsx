import { useEffect, useState } from "react";
import { History, Link2, Unlink, Pencil, Plus, Trash2 } from "lucide-react";

/** Zelfde palet als de rest van het medewerkersportaal (bewust hier herhaald zodat dit bestand
 *  op zichzelf staat). */
const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
};

const ICOON = { koppel: Link2, ontkoppel: Unlink, bewerken: Pencil, toevoegen: Plus, verwijderen: Trash2 };
const KLEUR_ACTIE = { koppel: KLEUR.blauw, ontkoppel: KLEUR.rood, bewerken: KLEUR.subtekst, toevoegen: KLEUR.blauw, verwijderen: KLEUR.rood };

function tijdstip(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Logboek: toont wie wat wanneer heeft gedaan bij een cliënt of contactpersoon (koppelen,
 * loskoppelen, bewerken). Geef óf accountId (logboek van één cliënt) óf contactId (logboek van
 * één contactpersoon) mee. `sleutel` mag veranderen om een verse ophaal te forceren (bijv. na een
 * actie in hetzelfde scherm). Leest uit /api/medewerker-contactpersoon (zie api/_gedeeld/klantlog.js).
 */
export default function Logboek({ accountId, contactId, sleutel }) {
  const [log, setLog] = useState(null); // null = laden
  const [fout, setFout] = useState(false);

  useEffect(() => {
    const param = accountId ? "logAccountId=" + encodeURIComponent(accountId) : contactId ? "logContactId=" + encodeURIComponent(contactId) : "";
    if (!param) { setLog([]); return; }
    let actief = true;
    setLog(null);
    setFout(false);
    fetch("/api/medewerker-contactpersoon?" + param)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (actief) setLog(d.log || []); })
      .catch(() => { if (actief) { setLog([]); setFout(true); } });
    return () => { actief = false; };
  }, [accountId, contactId, sleutel]);

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <History size={15} color={KLEUR.subtekst} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>Logboek</span>
      </div>

      {log === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Logboek ophalen…</div>
      ) : fout ? (
        <div style={{ fontSize: 12.5, color: KLEUR.rood }}>Het logboek kon niet worden geladen.</div>
      ) : log.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen handelingen vastgelegd.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {log.map((e) => {
            const Icon = ICOON[e.actie] || History;
            const kleur = KLEUR_ACTIE[e.actie] || KLEUR.subtekst;
            return (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: KLEUR.lichtblauw, flexShrink: 0, marginTop: 1 }}>
                  <Icon size={13} color={kleur} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: KLEUR.tekst, lineHeight: 1.4 }}>{e.tekst || e.actie}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 2 }}>
                    {tijdstip(e.tijd)}{e.door ? " · " + e.door : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
