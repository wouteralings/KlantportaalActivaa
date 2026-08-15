import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Plus, Trash2, Pencil, X, Check, ChevronLeft, ChevronRight, Lock, RefreshCw, CheckSquare, ClipboardCheck, BarChart3, Gauge, Wallet, Loader2, Send, CalendarPlus, CalendarCheck, CalendarDays } from "lucide-react";
import {
  KLEUR, SOORTEN, soortVan, isDeclarabel, TARIEF_SOORTEN, euro, uur, datumNL,
  WEEKDAG_VOL, maandagVan, voegDagenToe, vandaagIso, useKlanten, KlantPicker, SoortBadge,
  knopStijl, veldStijl,
} from "./urenGedeeld";
import UrenControle from "./UrenControle";
import UrenFacturatie from "./UrenFacturatie";
import UrenRapportage from "./UrenRapportage";
import UrenGoedkeuren from "./UrenGoedkeuren";
import UrenBezetting from "./UrenBezetting";
import VerlofAanvragen from "./VerlofAanvragen";
import VerlofGoedkeuren from "./VerlofGoedkeuren";
import VerlofOverzicht from "./VerlofOverzicht";

/**
 * Interne urenregistratie voor medewerkers. Sub-tabs:
 *   - Schrijven          : je eigen uren per week schrijven/bewerken (incl. vaste + goedgekeurd verlof)
 *   - Verlof              : verlof aanvragen + eigen verlofsaldo
 *   - Verlof goedkeuren   : (leidinggevende) openstaande verlofaanvragen van je team afhandelen
 *   - Vakantieoverzicht   : bedrijfsbreed overzicht van goedgekeurd verlof — lijst + kalender
 *   - Goedkeuren          : wekelijkse weekstaat-goedkeuring (leidinggevende)
 *   - Controle            : maandcontrole van je cliënten (manager)
 *   - Facturatie          : OHW + facturatiestatus, gesplitst in UXT en abonnement
 *   - Rapportage          : declarabel-% en indirecte uren per medewerker
 *   - Bezetting           : ingeplande uren per medewerker per maand t.o.v. beschikbare capaciteit
 */
export default function Urenregistratie({ isBeheerder, magBewerken = true, magVerwijderen = true, subRechten = null }) {
  const [sub, setSub] = useState("schrijven");
  const zicht = subRechten ? subRechten.zien : () => true;
  // Subpagina-rechten: bewerken/verwijderen van de eigen uren (tab Schrijven) volgt de subpagina-instelling
  // als die er is, anders de rubriek-instelling.
  const magSchrijvenBewerken = subRechten ? subRechten.bewerken("schrijven") : magBewerken;
  const magSchrijvenVerwijderen = subRechten ? subRechten.verwijderen("schrijven") : magVerwijderen;
  const [teGoedkeuren, setTeGoedkeuren] = useState(0);
  const [verlofTeGoedkeuren, setVerlofTeGoedkeuren] = useState(0);

  // Telling van weekstaten die op mijn goedkeuring wachten (badge op de Goedkeuren-tab).
  const laadTelling = useCallback(() => {
    fetch("/api/mw-uren-weekstaten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTeGoedkeuren(d.aantalOpen || 0))
      .catch(() => {});
  }, []);
  useEffect(() => { laadTelling(); }, [laadTelling]);

  // Telling van verlofaanvragen die op mijn goedkeuring wachten (badge op de Verlof goedkeuren-tab).
  const laadVerlofTelling = useCallback(() => {
    fetch("/api/mw-verlof-goedkeuren")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setVerlofTeGoedkeuren(d.aantalOpen || 0))
      .catch(() => {});
  }, []);
  useEffect(() => { laadVerlofTelling(); }, [laadVerlofTelling]);

  const subs = [
    ["schrijven", "Schrijven", Clock, 0],
    ["verlof", "Verlof", CalendarPlus, 0],
    ["verlofgoedkeuren", "Verlof goedkeuren", CalendarCheck, verlofTeGoedkeuren],
    ["vakantieoverzicht", "Vakantieoverzicht", CalendarDays, 0],
    ["goedkeuren", "Goedkeuren", ClipboardCheck, teGoedkeuren],
    ["controle", "Facturatiecontrole", CheckSquare, 0],
    ["facturatie", "Facturatie", Wallet, 0],
    ["rapportage", "Rapportage", BarChart3, 0],
    ["bezetting", "Bezetting", Gauge, 0],
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <Clock size={17} color={KLEUR.blauw} /> Urenregistratie
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 820 }}>
        Schrijf je week (blijft concept) en dien 'm in. Je leidinggevende keurt de weekstaat wekelijks goed;
        daarna doet de manager de facturatiecontrole per cliënt (afboeken / UXT→Exact).
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {subs.filter(([k]) => zicht(k)).map(([k, label, Icon, badge]) => (
          <button key={k} onClick={() => setSub(k)} style={{ ...knopStijl(sub === k), position: "relative" }}>
            <Icon size={14} /> {label}
            {badge > 0 && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 17, height: 17, padding: "0 5px", borderRadius: 999, background: sub === k ? "#fff" : KLEUR.rood, color: sub === k ? KLEUR.blauw : "#fff", fontSize: 10.5, fontWeight: 700 }}>{badge}</span>}
          </button>
        ))}
      </div>

      {!zicht(sub) ? <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze subpagina is voor jouw rol niet zichtbaar.</div> : (<>
      {sub === "schrijven" && <Schrijven magBewerken={magSchrijvenBewerken} magVerwijderen={magSchrijvenVerwijderen} />}
      {sub === "verlof" && <VerlofAanvragen />}
      {sub === "verlofgoedkeuren" && <VerlofGoedkeuren isBeheerder={isBeheerder} onGewijzigd={laadVerlofTelling} />}
      {sub === "vakantieoverzicht" && <VerlofOverzicht />}
      {sub === "goedkeuren" && <UrenGoedkeuren isBeheerder={isBeheerder} onGewijzigd={laadTelling} />}
      {sub === "controle" && <UrenControle isBeheerder={isBeheerder} />}
      {sub === "facturatie" && <UrenFacturatie isBeheerder={isBeheerder} />}
      {sub === "rapportage" && <UrenRapportage />}
      {sub === "bezetting" && <UrenBezetting isBeheerder={isBeheerder} />}
      </>)}
    </div>
  );
}

const LEEG = { id: "", datum: "", soort: "abonnement", urencode: "", accountId: "", klantnaam: "", omschrijving: "", uren: "", tariefSoort: "normaal", jaar: "", meerdere: false, dagen: [] };
const WEEKDAG_KORT = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const STATUS_LABEL = { concept: "Concept", ingediend: "Ingediend", goedgekeurd: "Goedgekeurd", gefactureerd: "Gefactureerd" };

function Schrijven({ magBewerken = true, magVerwijderen = true }) {
  const klanten = useKlanten();
  const [weekStart, setWeekStart] = useState(maandagVan(vandaagIso()));
  const [boekingen, setBoekingen] = useState(null); // null = laden
  const [tarief, setTarief] = useState(null);
  const [codes, setCodes] = useState([]);
  const [vasteUren, setVasteUren] = useState([]); // virtuele vaste (contract)uren voor deze week
  const [verlofUren, setVerlofUren] = useState([]); // virtueel goedgekeurd (nog niet vastgelegd) verlof voor deze week
  const [weekEis, setWeekEis] = useState(40);
  const [fout, setFout] = useState("");
  const [form, setForm] = useState({ ...LEEG, datum: vandaagIso() });
  const [bezig, setBezig] = useState(false);

  const weekEinde = voegDagenToe(weekStart, 6);

  const laad = useCallback(() => {
    setBoekingen(null); setFout("");
    fetch(`/api/mw-uren-boekingen?vanaf=${weekStart}&tot=${weekEinde}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setBoekingen(d.boekingen || []); setTarief(d.tarief || null); setCodes(d.urencodes || []); setVasteUren(d.vasteUren || []); setVerlofUren(d.verlofUren || []); setWeekEis(d.weekUrenEis || 40); })
      .catch(() => { setBoekingen([]); setFout("Kon je uren niet laden. Controleer of de database-koppeling is ingesteld."); });
  }, [weekStart, weekEinde]);
  useEffect(() => { laad(); }, [laad]);

  // Is de week al ingediend/goedgekeurd? Dan mag er niet meer geschreven worden.
  const weekVergrendeld = (boekingen || []).some((b) => b.status !== "concept");
  const weekStatus = (boekingen || []).find((b) => b.status !== "concept")?.status || "concept";
  const heeftConcept = (boekingen || []).some((b) => b.status === "concept");

  const zet = (veld) => (e) => setForm((f) => ({ ...f, [veld]: e && e.target ? e.target.value : e }));
  const kiesCode = (code) => setForm((f) => ({ ...f, urencode: code.naam, soort: code.categorie, ...(isDeclarabel(code.categorie) ? {} : { accountId: "", klantnaam: "" }) }));
  const kiesSoort = (key) => setForm((f) => ({ ...f, soort: key, urencode: "", ...(isDeclarabel(key) ? {} : { accountId: "", klantnaam: "" }) }));
  const bewerk = (b) => { if (!magBewerken) return; setForm({ ...LEEG, id: b.id, datum: b.datum, soort: b.soort, urencode: b.urencode || "", accountId: b.accountId || "", klantnaam: b.klantnaam || "", omschrijving: b.omschrijving || "", uren: String(b.uren), tariefSoort: b.tariefSoort || "normaal", jaar: b.jaar != null ? String(b.jaar) : "" }); };
  const annuleer = () => setForm({ ...LEEG, datum: form.datum || vandaagIso() });
  const weekDagen = Array.from({ length: 7 }, (_, i) => voegDagenToe(weekStart, i));
  const toggleDag = (iso) => setForm((f) => ({ ...f, dagen: f.dagen.includes(iso) ? f.dagen.filter((d) => d !== iso) : [...f.dagen, iso] }));

  const bewaar = async () => {
    if (!magBewerken) return; // alleen-lezen rol
    setFout("");
    if (codes.length > 0 && !form.urencode) { setFout("Kies een urencode."); return; }
    const decl = isDeclarabel(form.soort);
    if (decl && !form.accountId) { setFout("Kies een cliënt voor abonnement/UXT."); return; }
    if (form.soort === "abonnement" && !form.jaar) { setFout("Vul het jaar in voor een abonnement."); return; }
    const aantal = Number(String(form.uren).replace(",", "."));
    if (!(aantal > 0)) { setFout("Vul een aantal uren in (groter dan 0)."); return; }
    const dagen = form.dagen.filter((d) => weekDagen.includes(d));
    if (form.meerdere && dagen.length === 0) { setFout("Kies minstens één dag."); return; }
    setBezig(true);
    try {
      const payload = { soort: form.soort, urencode: form.urencode || undefined, accountId: decl ? form.accountId : undefined, omschrijving: form.omschrijving, uren: aantal, tariefSoort: decl ? form.tariefSoort : undefined,
        jaar: form.soort === "abonnement" ? Number(form.jaar) : undefined,
        ...(form.meerdere && !form.id ? { datums: dagen } : { datum: form.datum }) };
      const res = await fetch("/api/mw-uren-boekingen", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? { id: form.id, ...payload } : payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      annuleer();
      laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const dienIn = async () => {
    if (!magBewerken) return; // alleen-lezen rol
    setFout(""); setBezig(true);
    try {
      const res = await fetch("/api/mw-uren-boekingen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "indienen", weekStart }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  const verwijder = async (b) => {
    if (!magVerwijderen) return; // rol mag in deze rubriek niet verwijderen
    if (b.status !== "concept") return;
    setBezig(true);
    try {
      const res = await fetch(`/api/mw-uren-boekingen?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      if (form.id === b.id) annuleer();
      laad();
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  // Codes die niet meetellen in de noemer van het declarabel-% (verlof/overuren/parttime).
  const nietMeetellend = useMemo(() => new Set((codes || []).filter((c) => c.teltDeclarabelMee === false).map((c) => c.naam)), [codes]);
  // Echte boekingen + virtuele vaste uren + virtueel goedgekeurd verlof samen (tellen alle drie mee
  // voor het weektotaal en de 40u-eis).
  const alleRijen = useMemo(() => ([...(boekingen || []), ...(vasteUren || []), ...(verlofUren || [])]), [boekingen, vasteUren, verlofUren]);

  const perDag = useMemo(() => {
    const map = {};
    for (let i = 0; i < 7; i++) map[voegDagenToe(weekStart, i)] = [];
    alleRijen.forEach((b) => { if (map[b.datum]) map[b.datum].push(b); });
    return map;
  }, [alleRijen, weekStart]);

  const totalen = useMemo(() => {
    let totaal = 0, declU = 0, indU = 0, basis = 0;
    alleRijen.forEach((b) => {
      totaal += b.uren; if (b.declarabel) declU += b.uren; else indU += b.uren;
      if (!(b.soort === "verlof" || (b.urencode && nietMeetellend.has(b.urencode)))) basis += b.uren;
    });
    return { totaal, declU, indU, basis, pct: basis ? Math.round((declU / basis) * 1000) / 10 : 0 };
  }, [alleRijen, nietMeetellend]);

  const weekCompleet = Math.abs(totalen.totaal - weekEis) < 0.001;
  const heeftInTeDienen = heeftConcept || (vasteUren || []).length > 0 || (verlofUren || []).length > 0;

  const decl = isDeclarabel(form.soort);
  const dezeWeek = () => setWeekStart(maandagVan(vandaagIso()));

  return (
    <div>
      {/* Weeknavigatie + totalen */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setWeekStart(voegDagenToe(weekStart, -7))} style={pijl}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 210, textAlign: "center" }}>{datumNL(weekStart)} – {datumNL(weekEinde)}</div>
          <button onClick={() => setWeekStart(voegDagenToe(weekStart, 7))} style={pijl}><ChevronRight size={16} /></button>
          <button onClick={dezeWeek} style={{ ...knopStijl(false), padding: "6px 10px" }}>Deze week</button>
          <button onClick={laad} style={{ ...knopStijl(false), padding: "6px 10px" }}><RefreshCw size={13} /></button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
          <Kpi label="Totaal deze week" waarde={`${uur(totalen.totaal)} u`} />
          <Kpi label="Declarabel" waarde={`${uur(totalen.declU)} u`} kleur={KLEUR.groen} />
          <Kpi label="Indirect/kantoor" waarde={`${uur(totalen.indU)} u`} kleur={KLEUR.goud} />
          <Kpi label="Declarabel-%" waarde={`${totalen.pct}%`} kleur={KLEUR.blauw} />
        </div>
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      {/* Weekstatus + indienen */}
      {boekingen !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
            background: weekStatus === "concept" ? "#EFEFEA" : weekStatus === "ingediend" ? "#FBF3E4" : weekStatus === "goedgekeurd" ? "#E7F2EA" : KLEUR.lichtblauw,
            color: weekStatus === "concept" ? KLEUR.subtekst : weekStatus === "ingediend" ? KLEUR.goud : weekStatus === "goedgekeurd" ? KLEUR.groen : KLEUR.blauw }}>
            Weekstaat: {STATUS_LABEL[weekStatus] || weekStatus}
          </span>
          {tarief && tarief.deadlineWeekdag ? <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Deadline: uiterlijk {WEEKDAG_VOL[(tarief.deadlineWeekdag - 1)] || "?"}</span> : null}
          {!weekVergrendeld && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: weekCompleet ? "#E7F2EA" : "#FBF3E4", color: weekCompleet ? KLEUR.groen : KLEUR.goud }}>
              {weekCompleet ? <Check size={12} /> : null}{uur(totalen.totaal)} / {weekEis} u
            </span>
          )}
          {heeftInTeDienen && !weekVergrendeld && magBewerken && (
            <button onClick={dienIn} disabled={bezig || !weekCompleet} title={weekCompleet ? "Weekstaat indienen bij je leidinggevende" : `Je week moet op precies ${weekEis} uur uitkomen voordat je 'm kunt indienen`} style={{ ...knopStijl(true), padding: "7px 12px", marginLeft: "auto", opacity: weekCompleet ? 1 : 0.55, cursor: weekCompleet ? "pointer" : "not-allowed" }}>
              {bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />} Week indienen
            </button>
          )}
        </div>
      )}

      {/* Boekingsformulier — alleen zolang de week nog concept is én je rol mag bewerken */}
      {weekVergrendeld ? (
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, background: "#FBFBF9", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          Deze week is <strong>{STATUS_LABEL[weekStatus]?.toLowerCase() || weekStatus}</strong> en kan niet meer worden bewerkt. Neem contact op met je leidinggevende als er iets moet wijzigen.
        </div>
      ) : !magBewerken ? (
        <div style={{ fontSize: 12.5, color: KLEUR.subtekst, background: "#FBFBF9", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          Je rol mag de urenregistratie <strong>alleen inzien</strong>. Zelf uren schrijven, wijzigen of indienen kan niet — vraag beheer als dat moet veranderen.
        </div>
      ) : (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 16, background: "#FBFBF9" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 8 }}>{form.id ? "Boeking bewerken" : "Nieuwe boeking"}</div>
          {!form.id && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.meerdere} onChange={(e) => setForm((f) => ({ ...f, meerdere: e.target.checked, dagen: e.target.checked ? (f.datum ? [f.datum] : []) : [] }))} />
              Vul dezelfde boeking voor meerdere dagen in
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            {codes.length > 0 ? (
              <Veld label="Urencode">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select value={form.urencode} onChange={(e) => { const c = codes.find((x) => x.naam === e.target.value); if (c) kiesCode(c); }} style={{ ...veldStijl, width: 210 }}>
                    <option value="">Kies urencode…</option>
                    {SOORTEN.filter((s) => s.key !== "verlof").map((s) => {
                      const inCat = codes.filter((c) => c.categorie === s.key);
                      return inCat.length ? <optgroup key={s.key} label={s.label}>{inCat.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}</optgroup> : null;
                    })}
                  </select>
                  {form.urencode && <SoortBadge soort={form.soort} />}
                </div>
              </Veld>
            ) : (
              <Veld label="Soort">
                <div style={{ display: "flex", gap: 6 }}>
                  {SOORTEN.filter((s) => s.key !== "verlof").map((s) => <button key={s.key} onClick={() => kiesSoort(s.key)} title={s.uitleg} style={{ ...knopStijl(form.soort === s.key), padding: "8px 10px", borderColor: form.soort === s.key ? s.kleur : KLEUR.rand, background: form.soort === s.key ? s.kleur : "#fff" }}>{s.label}</button>)}
                </div>
              </Veld>
            )}
            {form.meerdere && !form.id ? (
              <Veld label="Dagen (deze week)">
                <div style={{ display: "flex", gap: 4 }}>
                  {weekDagen.map((iso, i) => {
                    const aan = form.dagen.includes(iso);
                    return <button key={iso} onClick={() => toggleDag(iso)} title={datumNL(iso)} style={{ ...knopStijl(aan), padding: "8px 9px", minWidth: 36 }}>{WEEKDAG_KORT[i]}</button>;
                  })}
                </div>
              </Veld>
            ) : (
              <Veld label="Datum">
                <input type="date" value={form.datum} min={weekStart} max={weekEinde} onChange={zet("datum")} style={{ ...veldStijl, width: 150 }} />
              </Veld>
            )}
            {decl && (
              <Veld label="Cliënt">
                <div style={{ width: 240 }}>
                  <KlantPicker klanten={klanten} waarde={form.accountId} onKies={(k) => setForm((f) => ({ ...f, accountId: k.accountId, klantnaam: k.klantnaam }))} />
                </div>
              </Veld>
            )}
            {decl && (
              <Veld label="Tarief">
                <select value={form.tariefSoort} onChange={zet("tariefSoort")} style={{ ...veldStijl, width: 220 }}>
                  {TARIEF_SOORTEN.map((t) => <option key={t.key} value={t.key}>{t.label}{tariefBedrag(tarief, t.key) != null ? ` · ${euro(tariefBedrag(tarief, t.key))}` : ""}</option>)}
                </select>
              </Veld>
            )}
            {form.soort === "abonnement" && (
              <Veld label="Jaar">
                <select value={form.jaar} onChange={zet("jaar")} style={{ ...veldStijl, width: 110, borderColor: form.jaar ? KLEUR.rand : KLEUR.goud }} title="Verplicht bij uren op een abonnement">
                  <option value="">Kies jaar…</option>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i).map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </Veld>
            )}
            <Veld label="Uren">
              <input value={form.uren} onChange={zet("uren")} placeholder="0,00" inputMode="decimal" style={{ ...veldStijl, width: 80 }} />
            </Veld>
            <Veld label="Omschrijving" groei>
              <input value={form.omschrijving} onChange={zet("omschrijving")} placeholder="Waar heb je aan gewerkt?" style={{ ...veldStijl, width: "100%" }} />
            </Veld>
            <button onClick={bewaar} disabled={bezig} style={{ ...knopStijl(true), padding: "9px 14px" }}>
              {bezig ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : (form.id ? <Check size={14} /> : <Plus size={14} />)} {form.id ? "Opslaan" : `Toevoegen${form.meerdere && form.dagen.length ? ` (${form.dagen.length} dagen)` : ""}`}
            </button>
            {form.id && <button onClick={annuleer} style={{ ...knopStijl(false), padding: "9px 12px" }}><X size={14} /> Annuleren</button>}
          </div>
          {decl && tarief == null && <div style={{ fontSize: 11.5, color: KLEUR.goud, marginTop: 8 }}>Je hebt nog geen uurtarief ingesteld — vraag beheer om je tarieven (hoog/laag/normaal) toe te voegen. Je kunt wel alvast uren schrijven.</div>}
          {codes.length === 0 && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Er zijn nog geen urencodes ingesteld — beheer kan die toevoegen bij Beheer → Uren. Zolang kies je de categorie rechtstreeks.</div>}
        </div>
      )}

      {/* Uren per dag */}
      {boekingen === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Uren ophalen…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.keys(perDag).map((dag, i) => {
            const rijen = perDag[dag];
            const dagtotaal = rijen.reduce((s, b) => s + b.uren, 0);
            return (
              <div key={dag} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: dag === vandaagIso() ? KLEUR.lichtblauw : "#FBFBF9" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{WEEKDAG_VOL[i]} <span style={{ color: KLEUR.mutedTekst, fontWeight: 500 }}>· {datumNL(dag)}</span></div>
                  <div style={{ fontSize: 12, color: KLEUR.subtekst, fontWeight: 600 }}>{dagtotaal > 0 ? `${uur(dagtotaal)} u` : ""}</div>
                </div>
                {rijen.length > 0 && (
                  <div>
                    {rijen.map((b) => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: `1px solid ${KLEUR.rand}` }}>
                        <SoortBadge soort={b.soort} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {b.urencode && <span style={{ fontWeight: 600 }}>{b.urencode}</span>}
                            {b.urencode && (b.declarabel || b.omschrijving) ? " · " : ""}
                            {b.declarabel && <span style={{ fontWeight: 600 }}>{b.klantnaam || "—"}</span>}
                            {b.declarabel && b.omschrijving ? " · " : ""}
                            {b.omschrijving || (!b.urencode && !b.declarabel ? soortVan(b.soort).uitleg : "")}
                          </div>
                          {b.declarabel && b.tariefSoort && <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>Tarief {b.tariefSoort}{b.tariefBedrag != null ? ` · ${euro(b.tariefBedrag)}/u` : ""}{b.soort === "abonnement" && b.jaar ? ` · jaar ${b.jaar}` : ""}</div>}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, minWidth: 52, textAlign: "right" }}>{uur(b.uren)} u</div>
                        {b.vast ? (
                          <span title={b.soort === "verlof" ? "Goedgekeurd verlof — niet zelf te wijzigen" : "Vaste (contract)uren — door beheer vastgezet, niet zelf te wijzigen"} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "2px 8px" }}><Lock size={11} /> {b.soort === "verlof" ? "Verlof" : "Vast"}</span>
                        ) : b.status === "concept" ? (
                          (magBewerken || magVerwijderen) ? (
                            <div style={{ display: "flex", gap: 4 }}>
                              {magBewerken && <button onClick={() => bewerk(b)} title="Bewerken" style={ikoonKnop}><Pencil size={13} color={KLEUR.subtekst} /></button>}
                              {magVerwijderen && <button onClick={() => verwijder(b)} title="Verwijderen" style={ikoonKnop}><Trash2 size={13} color={KLEUR.rood} /></button>}
                            </div>
                          ) : (
                            <span title="Alleen-lezen" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst }}><Lock size={11} /> Concept</span>
                          )
                        ) : (
                          <span title={STATUS_LABEL[b.status] || b.status} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst }}><Lock size={11} /> {STATUS_LABEL[b.status] || b.status}</span>
                        )}
                      </div>
                    ))}
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

function tariefBedrag(tarief, key) { return tarief ? tarief[key] : null; }

const pijl = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", color: KLEUR.subtekst };
const ikoonKnop = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" };

function Veld({ label, children, groei }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: groei ? "1 1 200px" : "0 0 auto", minWidth: groei ? 180 : undefined }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</span>
      {children}
    </div>
  );
}
function Kpi({ label, waarde, kleur }) {
  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "5px 10px", background: "#fff", minWidth: 90 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: kleur || KLEUR.tekst }}>{waarde}</div>
    </div>
  );
}
