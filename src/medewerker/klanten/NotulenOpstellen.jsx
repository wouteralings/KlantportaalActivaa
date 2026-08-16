import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Printer, Copy, CheckCircle2, AlertTriangle, ArrowLeft, Plus, Trash2, Users, RotateCcw,
} from "lucide-react";
import { ontleedDocument, heeftEigenKop, blokkenNaarHtml, AFDRUK_CSS } from "../documentOpmaak";
import { NOTULEN_SJABLONEN } from "../../beheer/notulenSjablonen";
import { useMijnNaam } from "../MijnFilter";

/**
 * Notulen opstellen — medewerkersportaal → Klantoverzicht → Notulen → "Notulen opstellen".
 *
 * Zelfde opzet als het brievenscherm: links kies je de klant en het notulenmodel en vul je de
 * gegevens in, rechts loopt het voorbeeld live mee op een blanco A4. Ook de aandeelhouders vul je
 * hier in (naam + aandeel); ze verschijnen direct in het "Aanwezig"-blok van de notulen. Kop en
 * staart van de notulen liggen vast (zie src/beheer/notulenSjablonen.js) — alleen het besluit
 * ertussen verschilt per model.
 *
 * Namen (aandeelhouders, voorzitter, notulist) zoek je op in plaats van ze te typen — dat scheelt
 * typefouten en houdt de schrijfwijze gelijk aan Dynamics. Er wordt gezocht in de cliënten (holdings
 * en andere vennootschappen), de contactpersonen (/api/klant-contacten) en, voor de notulist, de
 * medewerkers. Zelf iets intypen mag altijd: een aandeelhouder die nog nergens staat, tik je gewoon in.
 *
 * De modellen komen uit Beheer → Dossiers → Voorbeelddocumenten (soort "notulen"); staat daar nog
 * niets, dan gebruikt dit scherm de vijf standaardmodellen uit de code, zodat je altijd kunt
 * beginnen. Wat je hier invult wordt niet in Dynamics weggeschreven — dit scherm maakt het stuk;
 * afdrukken/PDF gaat via het afdrukvenster van de browser.
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function normaliseerSleutel(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }

/** {{sleutel|LABEL}} → waarde, of een zichtbare invulplek [LABEL] als er nog niets is ingevuld. */
function vulSjabloonIn(tekst, waarden) {
  return String(tekst || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_, sleutel, label) => {
    const key = normaliseerSleutel(sleutel);
    const waarde = Object.prototype.hasOwnProperty.call(waarden, key) ? String(waarden[key] == null ? "" : waarden[key]).trim() : "";
    if (waarde) return waarde;
    const plek = (label && label.trim()) || String(sleutel).replace(/[_.-]+/g, " ").toUpperCase();
    return `[${plek}]`;
  });
}

function langeDatum(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}
function vandaagISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** "25000" → "25.000"; laat tekst die geen getal is ongemoeid (bijv. "25.000,50" of leeg). */
function bedragTekst(v) {
  const s = veiligeStr(v);
  if (!s) return "";
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : s;
}
function percentageTekst(v) {
  const s = veiligeStr(v);
  if (!s) return "";
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : s;
}

/** De aandeelhoudersregels zoals ze in het "Aanwezig"-blok komen: naam + aandeel, één per regel. */
function aandeelhoudersTekst(rijen) {
  return (rijen || [])
    .map((r) => {
      const naam = veiligeStr(r.naam);
      const pct = percentageTekst(r.percentage);
      if (!naam && !pct) return "";
      if (!pct) return naam;
      return `${naam || "—"} — ${pct}%`;
    })
    .filter(Boolean)
    .join("\n");
}

/** De vijf standaardmodellen als terugval zolang Beheer → Dossiers nog geen sjablonen heeft. */
function standaardSjablonen() {
  return NOTULEN_SJABLONEN.map((s, i) => ({ id: `std${i}`, naam: s.naam, tekst: s.tekst, standaard: true }));
}

export default function NotulenOpstellen({ onTerug }) {
  const { mijnNaam } = useMijnNaam();

  const [sjablonen, setSjablonen] = useState(null); // null = laden
  const [sjabloonBron, setSjabloonBron] = useState(""); // "beheer" | "standaard"
  const [klanten, setKlanten] = useState(null);
  const [klantFout, setKlantFout] = useState("");
  const [medewerkers, setMedewerkers] = useState([]); // voor het opzoeken van de notulist

  const [zoek, setZoek] = useState("");
  const [klant, setKlant] = useState(null);
  const [sjabloonId, setSjabloonId] = useState("");
  const [sjabloonZoek, setSjabloonZoek] = useState("");

  // Invulgegevens van de vergadering.
  const [vestigingsplaats, setVestigingsplaats] = useState("");
  const [datumactie, setDatumactie] = useState(vandaagISO());
  const [directeur, setDirecteur] = useState("");
  const [notulist, setNotulist] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [percentage, setPercentage] = useState("");
  const [toelichting, setToelichting] = useState("");
  const [aandeelhouders, setAandeelhouders] = useState([{ naam: "", percentage: "100" }]);

  // Vrije tekst: het gekozen model, zelf bij te schaven vóór afdrukken. Leeg = het model volgen.
  const [eigenTekst, setEigenTekst] = useState("");
  const [tekstOpen, setTekstOpen] = useState(false);

  const [melding, setMelding] = useState(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  // Modellen: uit Beheer → Dossiers (soort notulen); leeg = de vijf standaardmodellen uit de code.
  useEffect(() => {
    fetch("/api/dossier-velden?soort=notulen")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (!levend.current) return;
        const uitBeheer = Array.isArray(d.sjablonen) ? d.sjablonen.filter((s) => s && veiligeStr(s.tekst)) : [];
        if (uitBeheer.length) { setSjablonen(uitBeheer); setSjabloonBron("beheer"); }
        else { setSjablonen(standaardSjablonen()); setSjabloonBron("standaard"); }
      })
      .catch(() => { if (levend.current) { setSjablonen(standaardSjablonen()); setSjabloonBron("standaard"); } });
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(d.klanten || []); })
      .catch(() => { if (levend.current) { setKlanten([]); setKlantFout("De klantenlijst kon niet worden geladen."); } });
    // Medewerkers: alleen voor het opzoeken van de notulist. Best-effort — lukt dit niet, dan blijft
    // die suggestielijst leeg en typ je de naam gewoon zelf.
    fetch("/api/beheer-medewerkers")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setMedewerkers(d.medewerkers || []); })
      .catch(() => { if (levend.current) setMedewerkers([]); });
  }, []);

  const lijst = sjablonen || [];
  const sjabloon = lijst.find((s) => s.id === sjabloonId) || null;
  const gefilterdeSjablonen = useMemo(() => {
    const t = sjabloonZoek.trim().toLowerCase();
    if (!t) return lijst;
    return lijst.filter((s) => veiligeStr(s.naam).toLowerCase().includes(t));
  }, [lijst, sjabloonZoek]);

  const gefilterdeKlanten = useMemo(() => {
    const t = zoek.trim().toLowerCase(); const alle = klanten || [];
    if (!t) return alle.slice(0, 12);
    return alle.filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""} ${k.groepsnaam ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [zoek, klanten]);

  // Klantwissel: vestigingsplaats, voorzitter en de eerste aandeelhouder vast voorinvullen — alles
  // blijft aanpasbaar. De notulist wordt de ingelogde medewerker (die maakt het stuk immers op).
  useEffect(() => {
    if (!klant) return;
    const plaats = veiligeStr(klant.adres && klant.adres.plaats) || veiligeStr(klant.contact && klant.contact.adres && klant.contact.adres.plaats);
    const contactNaam = veiligeStr(klant.contact && klant.contact.naam);
    setVestigingsplaats(plaats);
    setDirecteur(contactNaam);
    setAandeelhouders([{ naam: contactNaam, percentage: "100" }]);
    setMelding(null);
  }, [klant]);

  useEffect(() => { if (mijnNaam && !notulist) setNotulist(mijnNaam); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mijnNaam]);

  // Ander model gekozen → eventuele eigen tekstaanpassing loslaten (die hoorde bij het vorige model).
  useEffect(() => { setEigenTekst(""); }, [sjabloonId]);

  const mergeWaarden = useMemo(() => {
    const m = {};
    const zet = (k, v) => { m[normaliseerSleutel(k)] = v == null ? "" : String(v); };
    zet("klantnaam", klant ? veiligeStr(klant.klantnaam) : "");
    zet("groepsnaam", klant ? veiligeStr(klant.groepsnaam) : "");
    zet("accountant", klant ? (veiligeStr(klant.accountant) || veiligeStr(klant.accountantPersoon && klant.accountantPersoon.naam)) : "");
    zet("manager", klant ? (veiligeStr(klant.manager && klant.manager.naam) || veiligeStr(klant.relatiebeheerder)) : "");
    zet("vestigingsplaats", vestigingsplaats);
    zet("plaats", vestigingsplaats);
    zet("datumactie", langeDatum(datumactie));
    zet("datum", langeDatum(datumactie) || langeDatum(vandaagISO()));
    zet("periode", langeDatum(datumactie));
    zet("directeur", directeur);
    zet("voorzitter", directeur);
    zet("notulist", notulist);
    zet("aandeelhouders", aandeelhoudersTekst(aandeelhouders));
    zet("bedrag", bedragTekst(bedrag));
    zet("percentage", percentageTekst(percentage));
    zet("toelichting", toelichting);
    zet("extratoelichting", toelichting ? "Ja" : "Nee");
    return m;
  }, [klant, vestigingsplaats, datumactie, directeur, notulist, aandeelhouders, bedrag, percentage, toelichting]);

  const ruweTekst = eigenTekst || (sjabloon ? sjabloon.tekst : "");
  const ingevuld = vulSjabloonIn(ruweTekst, mergeWaarden);
  const blokken = useMemo(() => ontleedDocument(ingevuld), [ingevuld]);
  const eigenKop = heeftEigenKop(ruweTekst);
  const leeg = !veiligeStr(ruweTekst);

  const somAandeel = aandeelhouders.reduce((t, r) => {
    const n = Number(String(r.percentage || "").replace(",", "."));
    return t + (Number.isFinite(n) ? n : 0);
  }, 0);
  const aandeelIngevuld = aandeelhouders.some((r) => veiligeStr(r.percentage));

  function zetAandeelhouder(i, veld, waarde) {
    setAandeelhouders((rijen) => rijen.map((r, j) => (j === i ? { ...r, [veld]: waarde } : r)));
  }
  function voegAandeelhouderToe() { setAandeelhouders((r) => [...r, { naam: "", percentage: "" }]); }
  function verwijderAandeelhouder(i) {
    setAandeelhouders((r) => (r.length <= 1 ? [{ naam: "", percentage: "" }] : r.filter((_, j) => j !== i)));
  }
  /** Verdeelt 100% gelijk over de ingevulde rijen — scheelt rekenwerk bij 2, 3 of 4 aandeelhouders. */
  function verdeelGelijk() {
    setAandeelhouders((rijen) => {
      const n = rijen.length || 1;
      const deel = Math.round((100 / n) * 100) / 100;
      return rijen.map((r, i) => ({
        ...r,
        // Laatste rij vangt het afrondingsrestje op, zodat de som exact 100 blijft.
        percentage: String(i === n - 1 ? Math.round((100 - deel * (n - 1)) * 100) / 100 : deel).replace(".", ","),
      }));
    });
  }

  const bestandsnaam = `${veiligeStr(sjabloon && sjabloon.naam) || "Notulen"}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const subkop = `Notulen${datumactie ? " · " + langeDatum(datumactie) : ""}`;

  function afdrukken() {
    if (leeg) return;
    const w = typeof window !== "undefined" ? window.open("", "_blank", "width=840,height=1180") : null;
    if (!w) { setMelding({ type: "fout", tekst: "Het afdrukvenster werd geblokkeerd door de browser. Sta pop-ups toe voor dit portaal en probeer opnieuw." }); return; }
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const kopHtml = eigenKop
      ? ""
      : `<div class="kop-klant">${esc(klant ? klant.klantnaam : "—")}</div><div class="kop-sub">${esc(subkop)}</div>`;
    w.document.write(
      `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(bestandsnaam)}</title>` +
      `<style>${AFDRUK_CSS}</style></head><body>${kopHtml}${blokkenNaarHtml(blokken, esc)}</body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* afdruk best-effort */ } }, 300);
  }

  async function kopieerTekst() {
    try {
      await navigator.clipboard.writeText(ingevuld);
      setMelding({ type: "ok", tekst: "De notulen staan op het klembord — plakken in Word kan direct." });
    } catch {
      setMelding({ type: "fout", tekst: "Kopiëren naar het klembord lukte niet in deze browser." });
    }
  }

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  const knop = (kleur, aan = true) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${aan ? kleur : KLEUR.rand}`, background: aan ? kleur : "#F2F3F0", color: aan ? "#fff" : KLEUR.mutedTekst, fontSize: 12.5, fontWeight: 600, cursor: aan ? "pointer" : "not-allowed" });
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  if (sjablonen === null && klanten === null) {
    return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Notulen laden…</div>;
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      {onTerug && (
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          <ArrowLeft size={15} /> Terug naar overzicht
        </button>
      )}
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Kies een klant en een notulenmodel, vul de vergadering en de aandeelhouders in. Het voorbeeld
        rechts loopt live mee; kop en staart van de notulen liggen vast, alleen het besluit verschilt per model.
      </div>

      {klantFout && <Banner type="fout" tekst={klantFout} />}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── Linkerkolom: invullen ── */}
        <div style={{ flex: "1 1 460px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Klant */}
          <div>
            <span style={label}>Klant</span>
            {klant ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(klant.klantnaam)}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{veiligeStr(klant.klantnummer) && `nr ${veiligeStr(klant.klantnummer)}`}{veiligeStr(klant.groepsnaam) && `  ·  ${veiligeStr(klant.groepsnaam)}`}</div>
                </div>
                <button onClick={() => { setKlant(null); setZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, cliëntnummer of groep…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeKlanten.length === 0 ? <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>{klanten === null ? "Klanten laden…" : "Geen klanten gevonden."}</div> : gefilterdeKlanten.map((k) => (
                    <button key={k.accountId} onClick={() => setKlant(k)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(k.klantnaam)}</span>
                      <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{veiligeStr(k.klantnummer) && `   nr ${veiligeStr(k.klantnummer)}`}{veiligeStr(k.groepsnaam) && `   ·   ${veiligeStr(k.groepsnaam)}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notulenmodel */}
          <div>
            <span style={label}>Notulenmodel</span>
            {sjabloon ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{veiligeStr(sjabloon.naam)}</span>
                <button onClick={() => { setSjabloonId(""); setSjabloonZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={sjabloonZoek} onChange={(e) => setSjabloonZoek(e.target.value)} placeholder="Zoek een notulenmodel…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeSjablonen.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>{sjablonen === null ? "Modellen laden…" : "Geen modellen gevonden."}</div>
                  ) : gefilterdeSjablonen.map((s) => (
                    <button key={s.id} onClick={() => { setSjabloonId(s.id); setSjabloonZoek(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(s.naam)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {sjabloonBron === "standaard" && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                Dit zijn de vijf standaardmodellen uit de code. Wil je ze aanpassen, zet ze dan via
                Beheer → Dossiers → Notulen → Voorbeelddocumenten (knop “Standaard-notulen toevoegen”) in beheer.
              </div>
            )}
          </div>

          {/* Vergadering */}
          <div>
            <span style={label}>Vergadering</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: "1 1 180px" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Gevestigd te</div>
                <input value={vestigingsplaats} onChange={(e) => setVestigingsplaats(e.target.value)} style={input} placeholder="plaats" />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Datum vergadering</div>
                <input type="date" value={datumactie} onChange={(e) => setDatumactie(e.target.value)} style={input} />
              </div>
              <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Voorzitter (directeur)</div>
                <NaamZoeker
                  waarde={directeur} opWaarde={setDirecteur} placeholder="zoek of typ een naam…"
                  bronnen={["contact", "klant"]} klanten={klanten} medewerkers={medewerkers} invoerStijl={input}
                />
              </div>
              <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Notulist</div>
                <NaamZoeker
                  waarde={notulist} opWaarde={setNotulist} placeholder="zoek of typ een naam…"
                  bronnen={["medewerker", "contact"]} klanten={klanten} medewerkers={medewerkers} invoerStijl={input}
                />
              </div>
            </div>
          </div>

          {/* Aandeelhouders */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ ...label, marginBottom: 0 }}>Aandeelhouders</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={verdeelGelijk} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }} title="Verdeel 100% gelijk over alle rijen"><Users size={13} /> Gelijk verdelen</button>
                <button onClick={voegAandeelhouderToe} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }}><Plus size={13} /> Aandeelhouder</button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aandeelhouders.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <NaamZoeker
                    waarde={r.naam}
                    opWaarde={(v) => zetAandeelhouder(i, "naam", v)}
                    placeholder={`Aandeelhouder ${i + 1} — zoek of typ een naam…`}
                    bronnen={["klant", "contact"]}
                    klanten={klanten}
                    medewerkers={medewerkers}
                    invoerStijl={{ ...input, flex: "1 1 auto" }}
                  />
                  <div style={{ position: "relative", flex: "0 0 110px" }}>
                    <input
                      value={r.percentage}
                      onChange={(e) => zetAandeelhouder(i, "percentage", e.target.value)}
                      placeholder="aandeel"
                      inputMode="decimal"
                      style={{ ...input, paddingRight: 26, textAlign: "right" }}
                    />
                    <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: KLEUR.mutedTekst }}>%</span>
                  </div>
                  <button onClick={() => verwijderAandeelhouder(i)} title="Rij verwijderen" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, flexShrink: 0, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, color: KLEUR.subtekst, cursor: "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: aandeelIngevuld && Math.abs(somAandeel - 100) > 0.01 ? KLEUR.goud : KLEUR.mutedTekst }}>
              {aandeelIngevuld
                ? `Totaal ${percentageTekst(somAandeel)}%${Math.abs(somAandeel - 100) > 0.01 ? " — dat is geen 100%." : ""}`
                : "Typ twee letters om te zoeken in de cliënten en contactpersonen; ze verschijnen direct in het “Aanwezig”-blok rechts."}
            </div>
          </div>

          {/* Besluitgegevens */}
          <div>
            <span style={label}>Besluit</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Bedrag (€)</div>
                <input value={bedrag} onChange={(e) => setBedrag(e.target.value)} inputMode="decimal" style={input} placeholder="bijv. 25000" />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Percentage (%)</div>
                <input value={percentage} onChange={(e) => setPercentage(e.target.value)} inputMode="decimal" style={input} placeholder="bijv. 50" />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>Extra toelichting</div>
              <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} rows={3} style={{ ...input, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Laat je dit leeg, dan staat er [EXTRA TOELICHTING] in het stuk." />
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
              Bedrag en percentage worden alleen gebruikt door de modellen die ze nodig hebben
              (dividenduitkering, dividendbeleid, agiostorting).
            </div>
          </div>

          {/* Tekst bijschaven */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ ...label, marginBottom: 0 }}>Tekst van dit stuk</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {eigenTekst && (
                  <button onClick={() => setEigenTekst("")} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5 }} title="Terug naar de modeltekst"><RotateCcw size={13} /> Model herstellen</button>
                )}
                <button onClick={() => setTekstOpen((o) => !o)} disabled={!sjabloon} style={{ ...knopLicht, padding: "5px 9px", fontSize: 11.5, opacity: sjabloon ? 1 : 0.5, cursor: sjabloon ? "pointer" : "not-allowed" }}>
                  {tekstOpen ? "Verbergen" : "Aanpassen voor dit stuk"}
                </button>
              </div>
            </div>
            {tekstOpen && sjabloon && (
              <>
                <textarea
                  value={eigenTekst || sjabloon.tekst}
                  onChange={(e) => setEigenTekst(e.target.value)}
                  rows={14}
                  style={{ ...input, resize: "vertical", minHeight: 240, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
                />
                <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>
                  Alleen voor dit ene stuk — het model in Beheer blijft ongewijzigd. Opmaak: <code>#</code> titel,
                  <code> ###</code> kopje, <code>---</code> lijn, <code>-</code> opsomming, <code>&gt;</code> inspringen,
                  <code> [midden]</code> gecentreerd, <code>[ondertekening] functie | naam</code>.
                </div>
              </>
            )}
          </div>

          {/* Acties */}
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={knop(KLEUR.blauw, !leeg)} disabled={leeg} onClick={afdrukken}><Printer size={15} /> Afdrukken / PDF</button>
              <button style={{ ...knopLicht, opacity: leeg ? 0.5 : 1, cursor: leeg ? "not-allowed" : "pointer" }} disabled={leeg} onClick={kopieerTekst}><Copy size={15} /> Tekst kopiëren</button>
            </div>
            {melding && <div style={{ marginTop: 12 }}><Banner type={melding.type} tekst={melding.tekst} /></div>}
          </div>
        </div>

        {/* ── Rechterkolom: live voorbeeld ── */}
        <div style={{ flex: "1 1 520px", minWidth: 360, position: "sticky", top: 12 }}>
          <span style={{ ...label, marginBottom: 8 }}>Voorbeeld</span>
          <div style={{ background: "#EEF0EC", borderRadius: 10, padding: 18, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            <div style={{ background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 4, boxShadow: "0 6px 24px rgba(0,0,0,0.08)", margin: "0 auto", maxWidth: 620, minHeight: "calc(620px * 1.414)", padding: "56px 60px", boxSizing: "border-box", color: KLEUR.tekst, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12.5, lineHeight: 1.55 }}>
              {!eigenKop && !leeg && (<>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{klant ? veiligeStr(klant.klantnaam) : "—"}</div>
                <div style={{ color: KLEUR.subtekst, fontSize: 12, marginBottom: 26 }}>{subkop}</div>
              </>)}
              {leeg ? (
                <div style={{ color: KLEUR.mutedTekst, fontStyle: "italic" }}>Kies links een notulenmodel; het stuk verschijnt hier meteen.</div>
              ) : (
                blokken.map(renderBlok)
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst }}>
            Nog niet ingevulde gegevens staan als <strong>[INVULPLEK]</strong> in het stuk, net als in de Word-modellen.
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Naamveld met opzoeken. Je typt (minimaal 2 tekens) en krijgt suggesties uit de meegegeven bronnen:
 *   - "klant"      → de al geladen cliëntenlijst (holdings, B.V.'s — vaak de aandeelhouder zelf)
 *   - "contact"    → contactpersonen uit Dynamics via /api/klant-contacten (met vertraging, zodat
 *                    niet elke toetsaanslag een aanroep wordt)
 *   - "medewerker" → de al geladen medewerkerslijst (voor de notulist)
 * Kiezen vult de naam exact zoals hij in Dynamics staat. Zelf een naam intikken blijft gewoon
 * mogelijk — de suggesties zijn hulp, geen verplichting.
 */
function NaamZoeker({ waarde, opWaarde, placeholder, bronnen, klanten, medewerkers, invoerStijl }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [contacten, setContacten] = useState([]);
  const [bezig, setBezig] = useState(false);
  const doosRef = useRef(null);
  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  // Buiten het veld klikken sluit de suggestielijst (blur alleen is te vroeg: dan gaat de klik op een
  // suggestie verloren).
  useEffect(() => {
    if (!open) return;
    const buiten = (e) => { if (doosRef.current && !doosRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", buiten);
    return () => document.removeEventListener("mousedown", buiten);
  }, [open]);

  // Contactpersonen ophalen, 250 ms na de laatste toetsaanslag.
  useEffect(() => {
    if (!bronnen.includes("contact") || term.trim().length < 2) { setContacten([]); return; }
    setBezig(true);
    const t = setTimeout(() => {
      fetch("/api/klant-contacten?zoek=" + encodeURIComponent(term.trim()))
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => { if (levend.current) setContacten(Array.isArray(d.contacten) ? d.contacten : []); })
        .catch(() => { if (levend.current) setContacten([]); })
        .finally(() => { if (levend.current) setBezig(false); });
    }, 250);
    return () => { clearTimeout(t); setBezig(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const suggesties = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    const uit = [];
    if (bronnen.includes("klant")) {
      for (const k of klanten || []) {
        if (!veiligeStr(k.klantnaam).toLowerCase().includes(t)) continue;
        uit.push({
          sleutel: `k-${k.accountId}`, naam: veiligeStr(k.klantnaam), soort: "Cliënt",
          sub: [veiligeStr(k.klantnummer) && `nr ${veiligeStr(k.klantnummer)}`, veiligeStr(k.groepsnaam)].filter(Boolean).join("  ·  "),
        });
        if (uit.length >= 8) break;
      }
    }
    if (bronnen.includes("medewerker")) {
      for (const m of medewerkers || []) {
        if (!veiligeStr(m.naam).toLowerCase().includes(t)) continue;
        uit.push({ sleutel: `m-${m.id}`, naam: veiligeStr(m.naam), soort: "Medewerker", sub: veiligeStr(m.functie) });
        if (uit.length >= 16) break;
      }
    }
    for (const c of contacten) {
      uit.push({ sleutel: `c-${c.id}`, naam: veiligeStr(c.naam), soort: "Contactpersoon", sub: veiligeStr(c.email) });
      if (uit.length >= 24) break;
    }
    // Dezelfde naam uit twee bronnen (cliënt én contactpersoon) maar één keer tonen.
    const gezien = new Set();
    return uit.filter((s) => { const k = s.naam.toLowerCase(); if (!s.naam || gezien.has(k)) return false; gezien.add(k); return true; });
  }, [term, contacten, klanten, medewerkers, bronnen]);

  const invoer = invoerStijl || {};
  return (
    <div ref={doosRef} style={{ position: "relative", flex: invoer.flex || "1 1 auto" }}>
      <input
        value={waarde}
        onChange={(e) => { opWaarde(e.target.value); setTerm(e.target.value); setOpen(true); }}
        onFocus={() => { setTerm(waarde); setOpen(true); }}
        placeholder={placeholder}
        style={{ ...invoer, flex: undefined, width: "100%" }}
      />
      {open && term.trim().length >= 2 && (
        <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "calc(100% + 4px)", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", maxHeight: 240, overflowY: "auto" }}>
          {suggesties.length === 0 ? (
            <div style={{ padding: "9px 12px", fontSize: 12, color: KLEUR.mutedTekst }}>
              {bezig ? "Zoeken…" : "Niets gevonden — je kunt de naam ook gewoon intypen."}
            </div>
          ) : suggesties.map((s) => (
            <button
              key={s.sleutel}
              onClick={() => { opWaarde(s.naam); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>{s.naam}</div>
              <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{s.soort}{s.sub ? `  ·  ${s.sub}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Eén blok als React — zelfde volgorde en verhoudingen als blokkenNaarHtml (documentOpmaak.js),
 *  zodat het voorbeeld op het scherm en de afdruk er hetzelfde uitzien. */
function renderBlok(b, i) {
  switch (b.type) {
    case "titel":
      return <div key={i} style={{ fontSize: 21, fontWeight: 700, textAlign: "center", marginBottom: 2 }}>{b.tekst}</div>;
    case "kop":
      return <div key={i} style={{ fontSize: 14.5, fontWeight: 700, margin: "14px 0 4px" }}>{b.tekst}</div>;
    case "kopje":
      return <div key={i} style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 3px" }}>{b.tekst}</div>;
    case "midden":
      return <div key={i} style={{ textAlign: "center", marginBottom: 4 }}>{b.tekst}</div>;
    case "lijn":
      return <div key={i} style={{ borderTop: `1px solid ${KLEUR.tekst}`, margin: "14px 0" }} />;
    case "punt":
      return (
        <div key={i} style={{ display: "flex", gap: 8, margin: "0 0 5px 10px" }}>
          <span style={{ flex: "0 0 auto", minWidth: 18 }}>{b.merk}</span>
          <span>{b.tekst}</span>
        </div>
      );
    case "inspring":
      return <div key={i} style={{ margin: "0 0 9px 22px" }}>{b.tekst}</div>;
    case "ondertekening":
      return (
        <div key={i} style={{ marginTop: 34 }}>
          <div style={{ color: KLEUR.mutedTekst, fontSize: 11, marginBottom: 18 }}>[Handtekening]</div>
          <div style={{ letterSpacing: 0.5 }}>…………………………………………….</div>
          {b.naam ? <div style={{ marginTop: 2 }}>{b.naam}</div> : null}
          {b.functie ? <div style={{ fontSize: 12 }}>{b.functie}</div> : null}
        </div>
      );
    case "handtekening":
      return (
        <div key={i} style={{ display: "flex", gap: 40, marginTop: 46 }}>
          {b.namen.map((n, j) => (
            <div key={j} style={{ flex: "1 1 0", minWidth: 0 }}>
              <div style={{ borderBottom: `1px solid ${KLEUR.tekst}`, height: 34 }} />
              <div style={{ fontSize: 11.5, marginTop: 4 }}>{n}</div>
            </div>
          ))}
        </div>
      );
    default:
      return <div key={i} style={{ marginTop: b.naPunt ? 9 : 0, marginBottom: 9, whiteSpace: "pre-wrap" }}>{b.tekst}</div>;
  }
}

function Banner({ type, tekst }) {
  const ok = type === "ok";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: ok ? "#EAF6EE" : "#FBECEC", color: ok ? KLEUR.groen : KLEUR.rood, border: `1px solid ${ok ? "#BFE3CB" : "#F0C9C9"}` }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} <span>{tekst}</span>
    </div>
  );
}
