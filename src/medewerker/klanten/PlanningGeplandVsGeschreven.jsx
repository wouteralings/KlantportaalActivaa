/**
 * Planning → "Gepland vs geschreven": per medewerker (uitklapbaar naar cliënt) de geplande
 * (indicatie-)uren van de periode náást de uren die er werkelijk op die cliënt zijn geschreven, met
 * een verschilkolom en de splitsing standaard dienstverlening (abonnement) versus meerwerk (UXT).
 *
 * Waar het om draait voor de beheerder/planner: **is een overschrijding derving of niet?**
 *   - Meer geschreven dan gepland op de STANDAARD dienstverlening (abonnement) → dat zit in het
 *     abonnement en wordt dus niet extra gefactureerd = **derving**. Rood.
 *   - Uren op **UXT** → meerwerk, wordt apart gefactureerd. Geen derving, blauw.
 *   - Minder geschreven dan gepland → ruimte (of nog niet af). Grijs/groen.
 *
 * Bronnen:
 *   - gepland    : /api/mw-planning-config (+ /api/mw-planning-overzicht voor de activiteiten en hun
 *                  standaard-uren, + /api/beheer-klanten voor de team-toewijzing per klant)
 *   - geschreven : /api/mw-planning-geschreven (cr283_urenboeking, per medewerker × cliënt × soort)
 */
import { Fragment, useState, useEffect, useMemo } from "react";
import { Scale, ChevronRight, ChevronDown, ChevronLeft, Loader2, Search, AlertTriangle } from "lucide-react";
import { werkRegels, MAANDEN } from "./planningWerk";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", roodBg: "#FBEAEA", roodRand: "#EAC4C4",
  groen: "#2E7D46", groenBg: "#E7F3EB",
  amber: "#A9660C", amberBg: "#FFF4E5", amberRand: "#F2D9A8", lichtblauw: "#EAF2F8",
};
const pad = (n) => String(n).padStart(2, "0");
const uur = (n) => `${Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u`;
const euro = (n) => `€ ${Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const kop = { textAlign: "right", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "7px 9px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const cel = { fontSize: 12.5, padding: "7px 9px", borderBottom: `1px solid ${KLEUR.rand}`, textAlign: "right", whiteSpace: "nowrap" };

/** Verschil = geschreven − gepland. Positief (meer geschreven) is de aandacht-kant. */
function VerschilCel({ verschil, derving }) {
  if (!verschil) return <td style={{ ...cel, color: KLEUR.mutedTekst }}>—</td>;
  const meer = verschil > 0;
  return (
    <td style={{ ...cel, color: meer ? (derving ? KLEUR.rood : KLEUR.amber) : KLEUR.groen, fontWeight: 700 }}>
      {meer ? "+" : "−"}{uur(Math.abs(verschil))}
    </td>
  );
}

export default function PlanningGeplandVsGeschreven() {
  const nu = new Date();
  const [type, setType] = useState("maand");           // maand | jaar
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);
  const [config, setConfig] = useState(null);
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenMap, setKlantenMap] = useState({});
  const [geschreven, setGeschreven] = useState(null);  // rijen uit /api/mw-planning-geschreven
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState(() => new Set());   // uitgeklapte medewerkers
  const [alleenAfwijking, setAlleenAfwijking] = useState(false);

  const periodeLabel = type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : String(jaar);
  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);

  useEffect(() => {
    fetch("/api/mw-planning-config").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setConfig(d.config || [])).catch(() => { setConfig([]); setFout("De planning-configuratie kon niet worden geladen."); });
    fetch("/api/mw-planning-overzicht").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setActiviteiten(d.activiteiten || [])).catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten?alle=1").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const b = {}; (d.klanten || []).forEach((k) => { b[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(b); }).catch(() => setKlantenMap({}));
  }, []);

  useEffect(() => {
    setGeschreven(null);
    const vraag = type === "maand" ? `maand=${jaar}-${pad(maand)}` : `jaar=${jaar}`;
    fetch(`/api/mw-planning-geschreven?${vraag}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setGeschreven(d.rijen || []))
      .catch(() => { setGeschreven([]); setFout("De geschreven uren konden niet worden opgehaald."); });
  }, [type, jaar, maand]);

  // Geplande uren: dezelfde werkvoorraad-berekening als "Mijn werk", maar dan voor iedereen.
  const gepland = useMemo(
    () => werkRegels({ config, activiteitById, klantenMap, type, jaar, maand }),
    [config, activiteitById, klantenMap, type, jaar, maand]
  );

  /**
   * Samenvoegen tot: medewerker → cliënten → { gepland, abonnement, uxt, overig, verschil, derving }.
   * Een cliënt komt in de lijst als er gepland werk ÓF geschreven tijd is — juist het verschil is
   * interessant (ook uren op een klant waar niets voor gepland stond).
   */
  const rijen = useMemo(() => {
    if (!config || geschreven === null) return null;
    const per = new Map();
    const zorgMw = (naam, email) => {
      const lc = String(naam || "").trim().toLowerCase() || String(email || "").trim().toLowerCase();
      if (!per.has(lc)) per.set(lc, { lc, naam: String(naam || "").trim() || email || "— onbekend —", klanten: new Map() });
      return per.get(lc);
    };
    const zorgKlant = (mw, acc, klantnaam) => {
      if (!mw.klanten.has(acc)) {
        mw.klanten.set(acc, { acc, klantnaam: klantnaam || "Onbekende klant", klantnummer: "", gepland: 0, geenUren: 0, activiteiten: [], abonnement: 0, uxt: 0, overig: 0, bedragAbonnement: 0 });
      }
      return mw.klanten.get(acc);
    };

    for (const it of gepland) {
      if (!it.wieLc) continue; // niet toegewezen werk telt niet bij een persoon
      const mw = zorgMw(it.wie);
      const k = zorgKlant(mw, it.acc, it.klantnaam);
      k.klantnummer = it.klantnummer || k.klantnummer;
      k.gepland += Number(it.indicatieUren) || 0;
      if (it.indicatieUren == null) k.geenUren++;
      k.activiteiten.push(it.act.label);
    }
    for (const g of geschreven) {
      const mw = zorgMw(g.naam, g.email);
      const acc = String(g.accountId || "").toLowerCase();
      // Uren zonder cliënt (indirect/kantoor) horen niet in deze vergelijking thuis.
      if (!acc) continue;
      const k = zorgKlant(mw, acc, g.klantnaam || (klantenMap[acc] && klantenMap[acc].klantnaam));
      if (!k.klantnummer && klantenMap[acc]) k.klantnummer = klantenMap[acc].klantnummer || "";
      if (g.soort === "abonnement") { k.abonnement += g.uren; k.bedragAbonnement += g.bedrag || 0; }
      else if (g.soort === "uxt") k.uxt += g.uren;
      else k.overig += g.uren;
    }

    const rond = (n) => Math.round(n * 100) / 100;
    const uit = [...per.values()].map((mw) => {
      const klanten = [...mw.klanten.values()].map((k) => {
        const geschrevenTotaal = k.abonnement + k.uxt + k.overig;
        // Derving = wat er BOVEN de planning op de standaard dienstverlening is geschreven. UXT valt
        // erbuiten: dat is meerwerk en wordt apart gefactureerd.
        const dervingUren = Math.max(0, k.abonnement - k.gepland);
        // Gemiddeld uurtarief van de abonnement-uren, voor een indicatie in euro's.
        const gemTarief = k.abonnement > 0 ? k.bedragAbonnement / k.abonnement : 0;
        return {
          ...k,
          gepland: rond(k.gepland), abonnement: rond(k.abonnement), uxt: rond(k.uxt), overig: rond(k.overig),
          geschreven: rond(geschrevenTotaal),
          verschil: rond(geschrevenTotaal - k.gepland),
          dervingUren: rond(dervingUren),
          dervingBedrag: Math.round(dervingUren * gemTarief),
        };
      }).sort((a, b) => b.dervingUren - a.dervingUren || String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
      const som = (veld) => rond(klanten.reduce((s, k) => s + (k[veld] || 0), 0));
      return {
        lc: mw.lc, naam: mw.naam, klanten,
        gepland: som("gepland"), abonnement: som("abonnement"), uxt: som("uxt"), overig: som("overig"),
        geschreven: som("geschreven"), verschil: som("verschil"),
        dervingUren: som("dervingUren"), dervingBedrag: klanten.reduce((s, k) => s + (k.dervingBedrag || 0), 0),
        geenUren: klanten.reduce((s, k) => s + (k.geenUren || 0), 0),
      };
    });
    return uit.sort((a, b) => b.dervingUren - a.dervingUren || String(a.naam).localeCompare(String(b.naam), "nl"));
  }, [config, gepland, geschreven, klantenMap]);

  const zichtbaar = useMemo(() => {
    if (!rijen) return [];
    const q = zoek.trim().toLowerCase();
    return rijen
      .filter((r) => !alleenAfwijking || r.verschil !== 0 || r.dervingUren > 0)
      .filter((r) => !q || r.naam.toLowerCase().includes(q) || r.klanten.some((k) => `${k.klantnaam} ${k.klantnummer}`.toLowerCase().includes(q)));
  }, [rijen, zoek, alleenAfwijking]);

  const totalen = useMemo(() => {
    const s = { gepland: 0, abonnement: 0, uxt: 0, geschreven: 0, dervingUren: 0, dervingBedrag: 0 };
    for (const r of zichtbaar) {
      s.gepland += r.gepland; s.abonnement += r.abonnement; s.uxt += r.uxt;
      s.geschreven += r.geschreven; s.dervingUren += r.dervingUren; s.dervingBedrag += r.dervingBedrag;
    }
    const rond = (n) => Math.round(n * 100) / 100;
    return { ...s, gepland: rond(s.gepland), abonnement: rond(s.abonnement), uxt: rond(s.uxt), geschreven: rond(s.geschreven), dervingUren: rond(s.dervingUren) };
  }, [zichtbaar]);

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const toggle = (lc) => setOpen((s) => { const n = new Set(s); if (n.has(lc)) n.delete(lc); else n.add(lc); return n; });

  const laden = config === null || geschreven === null;

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <Scale size={17} color={KLEUR.blauw} /> Gepland vs geschreven
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: type === "maand" ? 150 : 60, textAlign: "center" }}>{periodeLabel}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12, maxWidth: 900 }}>
        Per medewerker de <strong>geplande uren</strong> uit de planning naast de uren die er in {periodeLabel} werkelijk
        op die cliënt zijn <strong>geschreven</strong>. Meer geschreven dan gepland op de <strong>standaard dienstverlening</strong>
        {" "}(abonnement) is <span style={{ color: KLEUR.rood, fontWeight: 700 }}>derving</span> — dat zit in het abonnement en
        wordt niet apart gefactureerd. Uren op <strong>UXT</strong> zijn meerwerk en gaan wél apart op de factuur.
        Klik een medewerker open voor de cliënten eronder.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        {type === "jaar" && (
          <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Alle jaartaken en alle geschreven uren van {jaar}.</span>
        )}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op medewerker of klant…" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }} />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: KLEUR.subtekst }}>
          <input type="checkbox" checked={alleenAfwijking} onChange={(e) => setAlleenAfwijking(e.target.checked)} /> Alleen afwijkingen
        </label>
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>{fout}</div>}

      {/* Kop-cijfers van de hele (gefilterde) periode */}
      {!laden && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            ["Gepland", uur(totalen.gepland), KLEUR.tekst],
            ["Geschreven", uur(totalen.geschreven), KLEUR.tekst],
            ["Standaard (abonnement)", uur(totalen.abonnement), KLEUR.tekst],
            ["Meerwerk (UXT)", uur(totalen.uxt), KLEUR.blauw],
            ["Derving", `${uur(totalen.dervingUren)}${totalen.dervingBedrag ? ` · ${euro(totalen.dervingBedrag)}` : ""}`, totalen.dervingUren ? KLEUR.rood : KLEUR.groen],
          ].map(([l, w, c]) => (
            <div key={l} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "7px 11px", background: "#fff", minWidth: 120 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" }}>{l}</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: c }}>{w}</div>
            </div>
          ))}
        </div>
      )}

      {laden ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Geen medewerkers met gepland of geschreven werk in {periodeLabel}.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...kop, textAlign: "left", minWidth: 230 }}>Medewerker / cliënt</th>
                <th style={kop} title="Som van de indicatie-uren uit de planning voor deze periode">Gepland</th>
                <th style={kop} title="Alle uren die in deze periode op deze cliënt zijn geschreven">Geschreven</th>
                <th style={kop} title="Uren op een abonnement-urencode: standaard dienstverlening">Standaard</th>
                <th style={kop} title="Uren op een UXT-urencode: meerwerk, wordt apart gefactureerd">UXT</th>
                <th style={kop} title="Geschreven − gepland">Verschil</th>
                <th style={kop} title="Uren boven de planning op de standaard dienstverlening — die kun je niet doorbelasten">Derving</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((r) => {
                const uit = open.has(r.lc);
                return (
                  <Fragment key={r.lc}>
                    <tr style={{ background: "#FBFCFB", cursor: "pointer" }} onClick={() => toggle(r.lc)}>
                      <td style={{ ...cel, textAlign: "left", fontWeight: 700 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {uit ? <ChevronDown size={14} color={KLEUR.mutedTekst} /> : <ChevronRight size={14} color={KLEUR.mutedTekst} />}
                          {r.naam}
                          <span style={{ fontWeight: 400, color: KLEUR.mutedTekst, fontSize: 11.5 }}>· {r.klanten.length} {r.klanten.length === 1 ? "cliënt" : "cliënten"}</span>
                          {r.geenUren > 0 && (
                            <span title={`${r.geenUren} geplande ${r.geenUren === 1 ? "taak heeft" : "taken hebben"} geen indicatie-uren — het geplande getal is dus onvolledig`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, borderRadius: 999, padding: "1px 7px" }}>
                              <AlertTriangle size={10} /> {r.geenUren} zonder uren
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={{ ...cel, fontWeight: 700 }}>{uur(r.gepland)}</td>
                      <td style={{ ...cel, fontWeight: 700 }}>{uur(r.geschreven)}</td>
                      <td style={cel}>{r.abonnement ? uur(r.abonnement) : "—"}</td>
                      <td style={{ ...cel, color: r.uxt ? KLEUR.blauw : KLEUR.mutedTekst, fontWeight: r.uxt ? 700 : 400 }}>{r.uxt ? uur(r.uxt) : "—"}</td>
                      <VerschilCel verschil={r.verschil} derving={r.dervingUren > 0} />
                      <td style={{ ...cel, fontWeight: 700, color: r.dervingUren ? KLEUR.rood : KLEUR.mutedTekst }}>
                        {r.dervingUren ? uur(r.dervingUren) : "—"}
                        {r.dervingBedrag ? <div style={{ fontSize: 10.5, fontWeight: 600, color: KLEUR.rood }}>{euro(r.dervingBedrag)}</div> : null}
                      </td>
                    </tr>
                    {uit && r.klanten.map((k) => (
                      <tr key={`${r.lc}|${k.acc}`}>
                        <td style={{ ...cel, textAlign: "left", paddingLeft: 30 }}>
                          <div style={{ fontSize: 12.5 }}>{k.klantnaam}</div>
                          <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst }}>
                            {k.klantnummer ? `${k.klantnummer} · ` : ""}{k.activiteiten.length ? k.activiteiten.join(", ") : "niets gepland"}
                          </div>
                        </td>
                        <td style={cel}>{k.gepland ? uur(k.gepland) : "—"}</td>
                        <td style={cel}>{k.geschreven ? uur(k.geschreven) : "—"}</td>
                        <td style={cel}>{k.abonnement ? uur(k.abonnement) : "—"}</td>
                        <td style={{ ...cel, color: k.uxt ? KLEUR.blauw : KLEUR.mutedTekst }}>{k.uxt ? uur(k.uxt) : "—"}</td>
                        <VerschilCel verschil={k.verschil} derving={k.dervingUren > 0} />
                        <td style={{ ...cel, color: k.dervingUren ? KLEUR.rood : KLEUR.mutedTekst, fontWeight: k.dervingUren ? 700 : 400 }}>
                          {k.dervingUren ? uur(k.dervingUren) : "—"}
                          {k.dervingBedrag ? <div style={{ fontSize: 10.5, fontWeight: 600, color: KLEUR.rood }}>{euro(k.dervingBedrag)}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#FBFCFB" }}>
                <td style={{ ...cel, textAlign: "left", fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}` }}>Totaal · {zichtbaar.length} {zichtbaar.length === 1 ? "medewerker" : "medewerkers"}</td>
                <td style={{ ...cel, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}` }}>{uur(totalen.gepland)}</td>
                <td style={{ ...cel, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}` }}>{uur(totalen.geschreven)}</td>
                <td style={{ ...cel, borderTop: `2px solid ${KLEUR.rand}` }}>{uur(totalen.abonnement)}</td>
                <td style={{ ...cel, color: KLEUR.blauw, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}` }}>{uur(totalen.uxt)}</td>
                <td style={{ ...cel, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}`, color: totalen.geschreven - totalen.gepland > 0 ? KLEUR.rood : KLEUR.groen }}>
                  {totalen.geschreven - totalen.gepland >= 0 ? "+" : "−"}{uur(Math.abs(totalen.geschreven - totalen.gepland))}
                </td>
                <td style={{ ...cel, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}`, color: totalen.dervingUren ? KLEUR.rood : KLEUR.groen }}>
                  {uur(totalen.dervingUren)}
                  {totalen.dervingBedrag ? <div style={{ fontSize: 10.5, fontWeight: 600 }}>{euro(totalen.dervingBedrag)}</div> : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 10, lineHeight: 1.5 }}>
        <strong>Derving</strong> = de uren die bóven de planning op de standaard dienstverlening (abonnement) zijn geschreven;
        het bedrag is die uren maal het gemiddelde uurtarief van die boekingen. <strong>UXT-uren tellen niet als derving</strong> —
        dat is meerwerk dat apart wordt gefactureerd. Alle statussen tellen mee (concept t/m gefactureerd). Cliënten waar wél
        uren op staan maar niets voor gepland was, staan er ook bij (gepland = —). Staat er een oranje "zonder uren"-melding,
        dan mist er nog een indicatie in de planning en is de vergelijking dus niet compleet.
      </div>
    </div>
  );
}
