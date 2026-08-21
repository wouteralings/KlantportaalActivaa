import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, FileText, Loader2, AlertTriangle, CheckCircle2, ArrowLeft, Printer, Save, RotateCcw } from "lucide-react";
import { veldLabel } from "../../beheer/FormulierenBeheer";

/**
 * Formulier invullen — medewerkersportaal → Klantoverzicht → Brieven → Formulieren.
 *
 * Kies een cliënt en een formulier, vul de velden in, en je krijgt de ingevulde PDF om af te drukken
 * of in het dossier op te slaan. De velden komen uit de PDF zelf (uitgelezen bij het toevoegen in
 * Beheer → Brieven → Formulieren), gegroepeerd per pagina, in de volgorde van het papier.
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
 * De waarde die bij een bron hoort. Welke bron een veld gebruikt staat in Beheer → Brieven →
 * Formulieren, per veld ingesteld. Bewust geen raadwerk op veldnamen: op één formulier hoort
 * "KvK-nummer" op de ene plek bij de cliënt en op de andere bij een vereffenaar of een overnemer.
 */
function waardeUitBron(bron, klant) {
  if (!bron || !klant) return "";
  const adres = klant.adres || {};
  const contact = klant.contact || {};
  switch (bron) {
    case "klantnaam": return veiligeStr(klant.klantnaam);
    case "kvk": return veiligeStr(klant.kvk);
    case "btwnummer": return veiligeStr(klant.btwnummer);
    case "loonheffingsnummer": return veiligeStr(klant.loonheffingsnummer);
    case "adres": return adresRegel(adres);
    case "straat": return [veiligeStr(adres.straat), [veiligeStr(adres.huisnummer), veiligeStr(adres.toevoeging)].filter(Boolean).join("")].filter(Boolean).join(" ");
    case "postcode": return veiligeStr(adres.postcode);
    case "plaats": return veiligeStr(adres.plaats);
    case "contactnaam": return veiligeStr(contact.naam);
    case "contactemail": return veiligeStr(contact.email) || veiligeStr(klant.emailKlant);
    case "contacttelefoon": return veiligeStr(contact.telefoon);
    case "vandaag": return new Date().toISOString().slice(0, 10);
    default: return "";
  }
}

export default function FormulierInvullen({ onTerug }) {
  const [formulieren, setFormulieren] = useState(null);
  const [formulierId, setFormulierId] = useState("");
  const [formulier, setFormulier] = useState(null); // met velden en instellingen
  const [klanten, setKlanten] = useState([]);
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
  }, []);

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
    // krijgen hun waarde van het veld dat er in Beheer aan gekoppeld is.
    const zichtbaar = (formulier.velden || []).filter((v) => !v.automatisch && !(inst[v.naam] && inst[v.naam].verborgen));
    const per = new Map();
    for (const v of zichtbaar) {
      const nr = v.pagina || 0;
      if (!per.has(nr)) per.set(nr, []);
      per.get(nr).push({ ...v, label: veldLabel(v, inst[v.naam]) });
    }
    return [...per.entries()].sort((a, b) => a[0] - b[0]).map(([nr, velden]) => ({ nr, velden }));
  }, [formulier]);

  // Voorvullen zodra cliënt én formulier bekend zijn. Alleen velden die nog leeg zijn — wat jij
  // intikt blijft altijd staan.
  useEffect(() => {
    if (!formulier || !klant) return;
    setAntwoorden((huidig) => {
      const nieuw = { ...huidig };
      const inst = (formulier.instellingen && typeof formulier.instellingen === "object") ? formulier.instellingen : {};
      for (const v of formulier.velden || []) {
        if (v.automatisch) continue;
        if (veiligeStr(nieuw[v.naam])) continue;
        const voorstel = waardeUitBron(inst[v.naam] && inst[v.naam].bron, klant);
        if (voorstel) nieuw[v.naam] = voorstel;
      }
      return nieuw;
    });
  }, [formulier, klant]);

  function zet(naam, waarde) { setAntwoorden((a) => ({ ...a, [naam]: waarde })); }

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
                Er zijn nog geen formulieren toegevoegd. Dat doe je bij <strong>Beheer → Brieven → Formulieren</strong>.
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
                        <input value={veiligeStr(waarde)} onChange={(e) => zet(v.naam, e.target.value)} style={{ ...invoer, borderColor: teLang ? KLEUR.rood : KLEUR.rand }} />
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
