import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, List, LayoutGrid, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { KLEUR, datumNL, uur, maandVanNu, maandLabel, verschuifMaand, voegDagenToe, knopStijl, th, td } from "./urenGedeeld";

// Vaste kleurenset voor de kalenderchips, gebaseerd op de naam van de medewerker (stabiel per naam,
// zodat dezelfde persoon in elke maand dezelfde kleur chip krijgt).
const CHIP_KLEUREN = ["#1C5D8C", "#6B4C9A", "#2E7D46", "#B98237", "#B23B3B", "#3E7C8C", "#8A6D3B", "#5B6259"];
function kleurVoor(naam) {
  let hash = 0;
  for (let i = 0; i < (naam || "").length; i++) hash = (hash * 31 + naam.charCodeAt(i)) >>> 0;
  return CHIP_KLEUREN[hash % CHIP_KLEUREN.length];
}

/**
 * Vakantieoverzicht: alle goedgekeurde verlof, bedrijfsbreed — als lijst en op een maandkalender.
 * Bewust voor iedereen zichtbaar (geen "mijn team"-beperking zoals bij Bezetting): het idee is dat
 * collega's van elkaar kunnen zien wie wanneer vrij is, voor onderlinge afstemming.
 */
export default function VerlofOverzicht() {
  const [maand, setMaand] = useState(maandVanNu());
  const [weergave, setWeergave] = useState("kalender");
  const [data, setData] = useState(null);
  const [fout, setFout] = useState("");

  const laad = useCallback(() => {
    setData(null); setFout("");
    fetch(`/api/mw-verlof-overzicht?maand=${maand}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData({ verlof: [] }); setFout("Kon het vakantieoverzicht niet laden."); });
  }, [maand]);
  useEffect(() => { laad(); }, [laad]);

  const verlof = data?.verlof || [];

  // Per kalenderdag (binnen deze maand) de verlofregels die die dag overlappen.
  const perDag = useMemo(() => {
    const [j, m] = maand.split("-").map(Number);
    const eerste = new Date(Date.UTC(j, m - 1, 1));
    const laatsteDag = new Date(Date.UTC(j, m, 0)).getUTCDate();
    const map = new Map();
    for (let dag = 1; dag <= laatsteDag; dag++) {
      const iso = new Date(Date.UTC(j, m - 1, dag)).toISOString().slice(0, 10);
      map.set(iso, verlof.filter((v) => v.startdatum <= iso && v.einddatum >= iso));
    }
    return { map, eerste, laatsteDag };
  }, [verlof, maand]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700 }}>
          <CalendarDays size={16} color={KLEUR.blauw} /> Vakantieoverzicht
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setWeergave("kalender")} style={scopeKnop(weergave === "kalender")}><LayoutGrid size={13} /> Kalender</button>
            <button onClick={() => setWeergave("lijst")} style={{ ...scopeKnop(weergave === "lijst"), borderLeft: `1px solid ${KLEUR.rand}` }}><List size={13} /> Lijst</button>
          </div>
          <button onClick={laad} style={{ ...knopStijl(false), padding: "7px 10px" }}><RefreshCw size={13} /></button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 820 }}>
        Alle goedgekeurde verlofaanvragen, bedrijfsbreed — zo zie je in één oogopslag wie wanneer vrij is.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMaand(verschuifMaand(maand, -1))} style={pijl}><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{maandLabel(maand)}</div>
        <button onClick={() => setMaand(verschuifMaand(maand, 1))} style={pijl}><ChevronRight size={16} /></button>
        <button onClick={() => setMaand(maandVanNu())} style={{ ...knopStijl(false), padding: "6px 10px" }}>Deze maand</button>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {data === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Vakantieoverzicht ophalen…</div>
      ) : weergave === "lijst" ? (
        <VerlofLijst verlof={verlof} />
      ) : (
        <VerlofKalender perDag={perDag} maand={maand} />
      )}
    </div>
  );
}

function VerlofLijst({ verlof }) {
  if (verlof.length === 0) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Niemand heeft deze maand goedgekeurd verlof.</div>;
  const gesorteerd = [...verlof].sort((a, b) => a.startdatum.localeCompare(b.startdatum) || (a.medewerkerNaam || "").localeCompare(b.medewerkerNaam || ""));
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead><tr style={{ background: "#FBFBF9" }}><th style={th}>Medewerker</th><th style={th}>Type</th><th style={th}>Periode</th><th style={th}>Uren</th></tr></thead>
        <tbody>
          {gesorteerd.map((v) => (
            <tr key={v.id}>
              <td style={td}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: kleurVoor(v.medewerkerNaam), marginRight: 7 }} />{v.medewerkerNaam}</td>
              <td style={td}>{v.verloftypeLabel}</td>
              <td style={td}>{datumNL(v.startdatum)}{v.einddatum !== v.startdatum ? ` – ${datumNL(v.einddatum)}` : ""}</td>
              <td style={td}>{uur(v.aantalUren)} u</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VerlofKalender({ perDag, maand }) {
  const eersteWeekdag = (() => { const g = perDag.eerste.getUTCDay(); return g === 0 ? 7 : g; })(); // 1=ma..7=zo
  const cellen = [];
  for (let i = 1; i < eersteWeekdag; i++) cellen.push(null); // lege dagen vóór dag 1
  for (let dag = 1; dag <= perDag.laatsteDag; dag++) {
    const [j, m] = maand.split("-").map(Number);
    const iso = new Date(Date.UTC(j, m - 1, dag)).toISOString().slice(0, 10);
    cellen.push({ dag, iso, mensen: perDag.map.get(iso) || [] });
  }
  const weekdagKop = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  const vandaag = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {weekdagKop.map((d) => <div key={d} style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {cellen.map((c, i) => c === null ? (
          <div key={`leeg-${i}`} />
        ) : (
          <div key={c.iso} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, minHeight: 76, padding: 6, background: c.iso === vandaag ? KLEUR.lichtblauw : "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.iso === vandaag ? KLEUR.blauw : KLEUR.mutedTekst, marginBottom: 4 }}>{c.dag}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {c.mensen.slice(0, 4).map((v) => (
                <div key={v.id} title={`${v.medewerkerNaam} · ${v.verloftypeLabel}`} style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: kleurVoor(v.medewerkerNaam), borderRadius: 4, padding: "1px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.medewerkerNaam}
                </div>
              ))}
              {c.mensen.length > 4 && <div style={{ fontSize: 9.5, color: KLEUR.mutedTekst }}>+{c.mensen.length - 4} meer</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const scopeKnop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });
const pijl = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", color: KLEUR.subtekst };
