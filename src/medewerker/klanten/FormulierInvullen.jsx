import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, FileText, Loader2, AlertTriangle, CheckCircle2, ArrowLeft, Printer, Save, RotateCcw } from "lucide-react";
import { veldLabel } from "../../beheer/FormulierenBeheer";
import { zichtbareVeldnamen, lijktOpIban, ibanTekst } from "../formulierVoorwaarden";

/**
 * Formulier invullen — medewerkersportaal → Klantoverzicht → Brieven → Formulieren.
 *
 * Kies een cliënt en een formulier, vul de velden in, en je krijgt de ingevulde PDF om af te drukken
 * of in het dossier op te slaan. De velden komen uit de PDF zelf (uitgelezen bij het toevoegen in
 * Beheer → Formulieren), gegroepeerd per pagina, in de volgorde van het papier.
 *
 * Wat er automatisch gevuld wordt bepaal je in Beheer, per veld. Er wordt niets geraden op basis van
 * veldnamen: op één formulier hoort "KvK-nummer" op de ene plek bij de cliënt en op de andere bij een
 * vereffenaar of een overnemer, en verkeerd voorvullen is erger dan niet voorvullen.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

/** De gekozen optie-index, of null. Number("") is 0, dus leeg mag nooit als "eerste optie" gelden. */
function gekozenOptie(waarde) {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = Number(waarde);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Adres van de cliënt als één regel. */
function adresRegel(adres) {
  const a = adres || {};
  const straat = [veiligeStr(a.straat), [veiligeStr(a.huisnummer), veiligeStr(a.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" ");
  const plaats = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ");
  return [straat, plaats].filter(Boolean).join(", ");
}

/**
 * Het adres van ons kantoor staat in Beheer → Instellingen als één regel ("Hengelosestraat 100 A").
 * Formulieren hebben er vaak drie hokjes voor. We knippen op het laatste getal in de regel: alles
 * ervoor is de straatnaam, het getal is het huisnummer, wat erachter staat de toevoeging. Zit er
 * geen getal in, dan blijft de hele regel de straatnaam — liever niets dan iets verzonnens.
 */
function splitsAdresregel(regel) {
  const t = veiligeStr(regel);
  const m = /^(.*?)[\s,]+(\d+)\s*-?\s*([A-Za-z0-9-]*)$/.exec(t);
  if (!m) return { straat: t, huisnummer: "", toevoeging: "" };
  return { straat: m[1].trim(), huisnummer: m[2], toevoeging: m[3] };
}

/**
 * Fiscale nummers bestaan uit een hoofdnummer en een subnummer, gescheiden door een letter:
 * "NL8529.21.743.B01" en "123456789L02". Formulieren hebben er twee hokjes voor, met de letter al
 * voorgedrukt. Deze functie geeft het deel vóór de letter (negen cijfers) of het subnummer erna.
 *
 * De Belastingdienst rekent zelf ook zo: vraag 1c van de Melding Loonheffingen zegt "u mag ook uw
 * omzetbelastingnummer invullen, het deel van het nummer voor de letter B".
 */
function nummerdeel(nummer, letter, welk) {
  const t = veiligeStr(nummer).toUpperCase();
  const stukken = t.split(letter);
  if (welk === "hoofd") {
    const cijfers = stukken[0].replace(/\D/g, "");
    return cijfers.length === 9 ? cijfers : "";
  }
  if (stukken.length < 2) return "";
  const sub = stukken[1].replace(/\D/g, "");
  return sub ? sub.slice(0, 2) : "";
}

/**
 * De waarde die bij een bron hoort. Welke bron een veld gebruikt staat in Beheer → Formulieren,
 * per veld ingesteld. Bewust geen raadwerk op veldnamen: op één formulier hoort
 * "KvK-nummer" op de ene plek bij de cliënt en op de andere bij een vereffenaar of een overnemer.
 *
 * `afzender` zijn onze eigen kantoorgegevens uit Beheer → Instellingen; formulieren vragen die als
 * gemachtigde of correspondentieadres.
 */
function waardeUitBron(bron, klant, afzender, belastingkantoor, vast) {
  if (!bron) return "";
  const a = afzender || {};
  if (bron === "vandaag") return new Date().toISOString().slice(0, 10);
  // Vaste tekst: wat de beheerder bij dit veld heeft ingetikt. Handig voor een adres dat op dit
  // formulier altijd hetzelfde is, ongeacht welke cliënt het betreft.
  if (bron === "vast") return veiligeStr(vast);
  if (bron.startsWith("bk")) {
    const bk = belastingkantoor || {};
    const adres = bk.adres || {};
    switch (bron) {
      case "bknaam": return veiligeStr(bk.naam);
      case "bkadres": return adresRegel(adres);
      case "bkstraatnaam": return veiligeStr(adres.straat);
      case "bkhuisnummer": return veiligeStr(adres.huisnummer);
      case "bktoevoeging": return veiligeStr(adres.toevoeging);
      case "bkpostcode": return veiligeStr(adres.postcode);
      case "bkplaats": return veiligeStr(adres.plaats);
      default: return "";
    }
  }
  if (bron.startsWith("kantoor") || bron === "beconnummer") {
    const eigen = splitsAdresregel(a.adres);
    switch (bron) {
      case "kantoornaam": return veiligeStr(a.bedrijfsnaam);
      case "beconnummer": return veiligeStr(a.beconnummer);
      case "kantooradres": return veiligeStr(a.adres);
      case "kantoorstraatnaam": return eigen.straat;
      case "kantoorhuisnummer": return eigen.huisnummer;
      case "kantoortoevoeging": return eigen.toevoeging;
      case "kantoorpostcode": return veiligeStr(a.postcode);
      case "kantoorplaats": return veiligeStr(a.plaats);
      case "kantoortelefoon": return veiligeStr(a.telefoon);
      case "kantooremail": return veiligeStr(a.email);
      case "kantoorkvk": return veiligeStr(a.kvk);
      case "kantoorbtw": return veiligeStr(a.btw);
      case "kantooriban": return veiligeStr(a.iban);
      default: return "";
    }
  }
  if (!klant) return "";
  // Een eigen kolom van het klantoverzicht (Beheer → Instellingen): zo komen bsn, IBAN en wat je
  // verder aan Dynamics-velden toevoegt hier binnen zonder dat er code bij hoeft.
  if (bron.startsWith("extra:")) return veiligeStr((klant.extra || {})[bron.slice(6)]);
  const adres = klant.adres || {};
  const contact = klant.contact || {};
  switch (bron) {
    case "klantnaam": return veiligeStr(klant.klantnaam);
    case "kvk": return veiligeStr(klant.kvk);
    case "bsn": return veiligeStr(klant.bsn);
    case "iban": return veiligeStr(klant.iban);
    case "btwnummer": return veiligeStr(klant.btwnummer);
    case "rsin": return nummerdeel(klant.btwnummer, "B", "hoofd");
    case "btwsubnummer": return nummerdeel(klant.btwnummer, "B", "sub");
    case "loonheffingsnummer": return veiligeStr(klant.loonheffingsnummer);
    case "loonheffingsnummerdeel": return nummerdeel(klant.loonheffingsnummer, "L", "hoofd");
    case "loonheffingssubnummer": return nummerdeel(klant.loonheffingsnummer, "L", "sub");
    case "adres": return adresRegel(adres);
    case "straat": return [veiligeStr(adres.straat), [veiligeStr(adres.huisnummer), veiligeStr(adres.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" ");
    case "straatnaam": return veiligeStr(adres.straat);
    case "huisnummer": return veiligeStr(adres.huisnummer);
    case "toevoeging": return veiligeStr(adres.toevoeging);
    case "huisnummertoevoeging": return [veiligeStr(adres.huisnummer), veiligeStr(adres.toevoeging)].filter(Boolean).join("");
    case "postcode": return veiligeStr(adres.postcode);
    case "plaats": return veiligeStr(adres.plaats);
    case "land": return veiligeStr(adres.land);
    case "contactnaam": return veiligeStr(contact.naam);
    case "contactemail": return veiligeStr(contact.email) || veiligeStr(klant.emailKlant);
    case "contacttelefoon": return veiligeStr(contact.telefoon);
    default: return "";
  }
}

export default function FormulierInvullen({ onTerug }) {
  const [formulieren, setFormulieren] = useState(null);
  const [formulierId, setFormulierId] = useState("");
  const [formulier, setFormulier] = useState(null); // met velden en instellingen
  const [klanten, setKlanten] = useState([]);
  const [afzender, setAfzender] = useState(null); // onze eigen kantoorgegevens
  const [belastingkantoor, setBelastingkantoor] = useState(null); // van de gekozen cliënt
  const [klant, setKlant] = useState(null);
  const [zoek, setZoek] = useState("");
  const [antwoorden, setAntwoorden] = useState({});
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState(null);
  const [voorbeeldUrl, setVoorbeeldUrl] = useState("");
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  useEffect(() => {
    fetch("/api/medewerker-formulier")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setFormulieren(Array.isArray(d.formulieren) ? d.formulieren : []); })
      .catch(() => { if (levend.current) setFormulieren([]); });
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(Array.isArray(d.klanten) ? d.klanten : []); })
      .catch(() => { if (levend.current) setKlanten([]); });
    // Onze eigen kantoorgegevens (naam, adres, beconnummer) uit Beheer → Instellingen: formulieren
    // vragen die als gemachtigde of correspondentieadres. Lukt het niet, dan blijven die bronnen
    // gewoon leeg — het formulier zelf werkt er niet minder om.
    fetch("/api/brief-sjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setAfzender((d && d.afzender) || null); })
      .catch(() => { if (levend.current) setAfzender(null); });
  }, []);

  // Het belastingkantoor dat aan deze cliënt hangt, met adres. Dezelfde bron als de Brieven-module
  // gebruikt voor een brief aan de Belastingdienst. Best-effort: lukt het niet, dan blijven die
  // bronnen leeg en tik je het adres zelf.
  useEffect(() => {
    if (!klant) { setBelastingkantoor(null); return; }
    fetch(`/api/brief-geadresseerde?accountId=${encodeURIComponent(klant.accountId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setBelastingkantoor(d && d.gekoppeld ? d : null); })
      .catch(() => { if (levend.current) setBelastingkantoor(null); });
  }, [klant]);

  // Het gekozen formulier ophalen mét zijn velden.
  useEffect(() => {
    if (!formulierId) { setFormulier(null); return; }
    setFormulier(null);
    fetch(`/api/medewerker-formulier?id=${encodeURIComponent(formulierId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setFormulier(d.formulier || null); })
      .catch(() => { if (levend.current) setMelding({ type: "fout", tekst: "Kon het formulier niet ophalen." }); });
  }, [formulierId]);

  const treffers = useMemo(() => {
    const t = zoek.trim().toLowerCase();
    if (!t) return [];
    return (klanten || []).filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [klanten, zoek]);

  // De zichtbare velden, gegroepeerd per pagina zoals ze op papier staan.
  const paginas = useMemo(() => {
    if (!formulier) return [];
    const inst = (formulier.instellingen && typeof formulier.instellingen === "object") ? formulier.instellingen : {};
    // Velden die het formulier zelf invult (alleen-lezen in de PDF) stellen we niet als vraag; die
    // krijgen hun waarde van het veld dat er in Beheer aan gekoppeld is. En een veld met een
    // voorwaarde ("toon alleen als vraag 1a op Nee staat") verschijnt pas als die klopt — vandaar dat
    // dit meerekent met de antwoorden en niet alleen met het formulier.
    const gevraagd = zichtbareVeldnamen(formulier.velden || [], inst, antwoorden);
    const zichtbaar = (formulier.velden || []).filter((v) => gevraagd.has(v.naam));
    const per = new Map();
    for (const v of zichtbaar) {
      const nr = v.pagina || 0;
      if (!per.has(nr)) per.set(nr, []);
      per.get(nr).push({ ...v, label: veldLabel(v, inst[v.naam]) });
    }
    return [...per.entries()].sort((a, b) => a[0] - b[0]).map(([nr, velden]) => ({ nr, velden }));
  }, [formulier, antwoorden]);

  // Voorvullen zodra cliënt én formulier bekend zijn. Alleen velden die nog leeg zijn — wat jij
  // intikt blijft altijd staan.
  useEffect(() => {
    if (!formulier || (!klant && !afzender)) return;
    setAntwoorden((huidig) => {
      const nieuw = { ...huidig };
      const inst = (formulier.instellingen && typeof formulier.instellingen === "object") ? formulier.instellingen : {};
      for (const v of formulier.velden || []) {
        if (v.automatisch) continue;
        if (veiligeStr(nieuw[v.naam])) continue;
        const eigen = inst[v.naam] || {};
        const voorstel = waardeUitBron(eigen.bron, klant, afzender, belastingkantoor, eigen.vast);
        if (voorstel) nieuw[v.naam] = voorstel;
      }
      return nieuw;
    });
  }, [formulier, klant, afzender, belastingkantoor]);

  function zet(naam, waarde) { setAntwoorden((a) => ({ ...a, [naam]: waarde })); }

  // Zodra je uit een veld klikt waar een rekeningnummer in staat, zetten we het netjes in groepjes
  // van vier — zoals je een IBAN schrijft. Op papier haalt de vuller de spaties er weer uit als het
  // veld uit losse hokjes bestaat; daar zou een spatie het nummer scheeftrekken.
  function netjes(naam, waarde) {
    if (!lijktOpIban(waarde)) return;
    const mooi = ibanTekst(waarde, false);
    if (mooi !== veiligeStr(waarde)) zet(naam, mooi);
  }

  async function maak(opslaan) {
    if (!formulier) { setMelding({ type: "fout", tekst: "Kies eerst een formulier." }); return; }
    if (opslaan && !klant) { setMelding({ type: "fout", tekst: "Kies eerst een cliënt om het formulier bij op te slaan." }); return; }
    setBezig(true); setMelding(null);
    try {
      const res = await fetch("/api/medewerker-formulier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: formulier.id, antwoorden,
          accountId: klant ? klant.accountId : "",
          klantnaam: klant ? veiligeStr(klant.klantnaam) : "",
          opslaan: !!opslaan,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Formulier maken mislukt (${res.status}).`);
      const bytes = Uint8Array.from(atob(d.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setVoorbeeldUrl((oud) => { if (oud) URL.revokeObjectURL(oud); return url; });
      if (!opslaan && typeof window !== "undefined") window.open(url, "_blank");
      const staart = d.sharepoint
        ? (d.sharepoint.gedaan ? " Het staat in de SharePoint-map van de cliënt." : ` Let op: opslaan in SharePoint lukte niet (${d.sharepoint.reden || "onbekende reden"}).`)
        : "";
      setMelding({ type: d.sharepoint && !d.sharepoint.gedaan ? "fout" : "ok", tekst: `${d.bestandsnaam} klaar.${staart}` });
    } catch (e) {
      setMelding({ type: "fout", tekst: String((e && e.message) || e) });
    } finally {
      if (levend.current) setBezig(false);
    }
  }

  useEffect(() => () => { if (voorbeeldUrl) URL.revokeObjectURL(voorbeeldUrl); }, [voorbeeldUrl]);

  const invoer = { width: "100%", boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit" };
  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".03em" };
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {onTerug && (
          <button onClick={onTerug} style={{ ...knopLicht, padding: "7px 11px" }}><ArrowLeft size={14} /> Terug</button>
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: KLEUR.tekst }}>Formulier invullen</div>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
            De velden komen uit het formulier zelf. Wat we van de cliënt weten vullen we alvast in;
            de rest tik je hier. Ondertekenen blijft met pen.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: "1 1 460px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cliënt */}
          <div>
            <span style={label}>Cliënt</span>
            {klant ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{veiligeStr(klant.klantnaam)}</span>
                <button onClick={() => { setKlant(null); setZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een cliënt…" style={{ ...invoer, padding: "9px 11px 9px 32px" }} />
                </div>
                {treffers.length > 0 && (
                  <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
                    {treffers.map((k) => (
                      <button key={k.accountId} onClick={() => { setKlant(k); setZoek(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", fontSize: 13 }}>
                        {veiligeStr(k.klantnaam)}
                        {veiligeStr(k.klantnummer) && <span style={{ color: KLEUR.mutedTekst, fontSize: 11.5 }}>  ·  nr {k.klantnummer}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                  Zonder cliënt kun je het formulier ook invullen — je kunt het dan alleen niet in een dossier opslaan.
                </div>
              </>
            )}
          </div>

          {/* Formulier */}
          <div>
            <span style={label}>Formulier</span>
            {formulieren === null ? (
              <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Formulieren ophalen…</div>
            ) : formulieren.length === 0 ? (
              <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>
                Er zijn nog geen formulieren toegevoegd. Dat doe je bij <strong>Beheer → Formulieren</strong>.
              </div>
            ) : (
              <select value={formulierId} onChange={(e) => { setFormulierId(e.target.value); setAntwoorden({}); }} style={invoer}>
                <option value="">— kies een formulier —</option>
                {formulieren.map((f) => (
                  <option key={f.id} value={f.id}>{f.naam}{f.aantalVelden ? ` (${f.aantalVelden} velden)` : ""}</option>
                ))}
              </select>
            )}
          </div>

          {/* De velden, per pagina */}
          {formulierId && !formulier && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Velden ophalen…</div>}
          {formulier && paginas.map((p) => (
            <div key={p.nr}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ ...label, marginBottom: 0 }}>Pagina {p.nr || "?"}</span>
                <div style={{ flex: 1, borderTop: `1px solid ${KLEUR.rand}` }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {p.velden.map((v) => {
                  const waarde = antwoorden[v.naam];
                  // Hokjesvelden hebben een maximum: postcode 6, bsn 9, telefoon 10. We kappen bij
                  // het vullen zo nodig af, maar dan wil je dat hier zien en niet pas op papier.
                  const teLang = v.max ? Math.max(0, veiligeStr(waarde).replace(/[\s.\-/]/g, "").length - v.max) : 0;
                  return (
                    <div key={v.naam}>
                      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 4 }}>
                        {v.label}
                        {v.max ? <span style={{ color: KLEUR.mutedTekst, fontWeight: 400 }}>  ·  {v.max} tekens</span> : null}
                      </div>
                      {v.soort === "datum" ? (
                        <input type="date" value={veiligeStr(waarde).slice(0, 10)} onChange={(e) => zet(v.naam, e.target.value)} style={{ ...invoer, maxWidth: 200 }} />
                      ) : v.soort === "keuze" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(v.opties || []).map((optie, i) => {
                            const gekozen = gekozenOptie(waarde) === i;
                            return (
                              <button
                                key={i}
                                onClick={() => zet(v.naam, gekozen ? "" : i)}
                                style={{
                                  padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  border: `1px solid ${gekozen ? KLEUR.blauw : KLEUR.rand}`,
                                  background: gekozen ? KLEUR.blauw : "#fff", color: gekozen ? "#fff" : KLEUR.subtekst,
                                }}
                              >
                                {veiligeStr(optie) || `Optie ${i + 1}`}
                              </button>
                            );
                          })}
                        </div>
                      ) : v.soort === "vink" ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                          <input type="checkbox" checked={waarde === true} onChange={(e) => zet(v.naam, e.target.checked)} style={{ width: 15, height: 15 }} />
                          <span>Aankruisen</span>
                        </label>
                      ) : v.soort === "keuzelijst" ? (
                        <select value={veiligeStr(waarde)} onChange={(e) => zet(v.naam, e.target.value)} style={invoer}>
                          <option value="">— niet ingevuld —</option>
                          {(v.opties || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : v.soort === "memo" ? (
                        <textarea value={veiligeStr(waarde)} onChange={(e) => zet(v.naam, e.target.value)} rows={2} style={{ ...invoer, resize: "vertical", lineHeight: 1.4 }} />
                      ) : (
                        <input
                          value={veiligeStr(waarde)}
                          onChange={(e) => zet(v.naam, e.target.value)}
                          onBlur={(e) => netjes(v.naam, e.target.value)}
                          style={{ ...invoer, borderColor: teLang ? KLEUR.rood : KLEUR.rand }}
                        />
                      )}
                      {teLang > 0 && (
                        <div style={{ fontSize: 11, color: KLEUR.rood, marginTop: 3 }}>
                          Past niet: er is plaats voor {v.max} tekens, de laatste {teLang} {teLang === 1 ? "valt" : "vallen"} eraf.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {formulier && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
              <button onClick={() => maak(false)} disabled={bezig} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: "none", background: KLEUR.groen, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: bezig ? "default" : "pointer", opacity: bezig ? 0.6 : 1 }}>
                {bezig ? <Loader2 size={15} className="spin" /> : <Printer size={15} />} {bezig ? "Bezig…" : "Formulier maken"}
              </button>
              <button onClick={() => maak(true)} disabled={bezig || !klant} style={{ ...knopLicht, opacity: bezig || !klant ? 0.6 : 1 }}>
                <Save size={15} /> Maken en in dossier opslaan
              </button>
              <button onClick={() => setAntwoorden({})} style={{ ...knopLicht }}>
                <RotateCcw size={15} /> Leegmaken
              </button>
            </div>
          )}

          {melding && (
            <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: 8, fontSize: 12,
              background: melding.type === "ok" ? "#EAF6EE" : "#FDF2F2",
              border: `1px solid ${melding.type === "ok" ? "#BFE0CB" : KLEUR.rood}`,
              color: melding.type === "ok" ? KLEUR.groen : KLEUR.rood }}>
              {melding.type === "ok" ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span>{melding.tekst}</span>
            </div>
          )}
        </div>

        {/* Voorbeeld van de ingevulde PDF */}
        <div style={{ flex: "1 1 480px", minWidth: 340 }}>
          <span style={label}>Voorbeeld</span>
          {voorbeeldUrl ? (
            <iframe title="Ingevuld formulier" src={voorbeeldUrl} style={{ width: "100%", height: 720, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, background: "#fff" }} />
          ) : (
            <div style={{ border: `1px dashed ${KLEUR.rand}`, borderRadius: 10, padding: "40px 20px", textAlign: "center", color: KLEUR.mutedTekst, fontSize: 12.5, background: "#FAFBF9" }}>
              <FileText size={22} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>Klik op “Formulier maken” — het ingevulde formulier verschijnt hier én in een nieuw tabblad.</div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes forminvulspin{to{transform:rotate(360deg)}} .spin{animation:forminvulspin 1s linear infinite}`}</style>
    </div>
  );
}
