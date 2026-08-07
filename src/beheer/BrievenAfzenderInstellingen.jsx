import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald, zie BrievenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
const knopLichtStijl = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

/**
 * Beheer → Instellingen: het Word-briefpapier (.docx) en de bedrijfsgegevens (bedrijfsnaam, kvk,
 * adres, postcode, plaats, telefoon, e-mail, website, afsluiting, ondertekenaar, voetnoot).
 *
 * Verplaatst hierheen op verzoek van Wouter (05-08-2026): "Tabblad brieven afzendergegevens
 * verplaatsen naar instellingen. ... WORD-BRIEFPAPIER (.DOCX) — VOOR DE WORD-DOWNLOAD verhuizen naar
 * huisstijl." Beide velden horen bij dezelfde configuratie (`config.afzender`, blob
 * brief-sjablonen.json — zie api/_gedeeld/briefSjablonen.js) als de rest van de Brieven-module
 * (BrievenBeheer.jsx: SharePoint-map, invulvelden, standaardbrieven), maar staan nu bewust in dit
 * losse bestand zodat ze in de Instellingen-tab getoond kunnen worden i.p.v. in de tab Brieven. Om
 * geen velden te verliezen bij het opslaan haalt dit scherm — net als BrievenBeheer.jsx — steeds de
 * VOLLEDIGE configuratie op en stuurt die (met alleen afzender aangepast) ook weer volledig terug.
 *
 * Sinds dezelfde 05-08-2026-sessie is dit ook de GEDEELDE bron voor de offertetool: Wouter koos
 * expliciet "hergebruiken (één gedeeld setje)" toen gevraagd werd of de offertetool haar eigen,
 * losse bedrijfsnaam/kvk/adres/postcode/plaats moest behouden of dit setje moest overnemen. De
 * offertetool (OffertetoolApp.jsx) leest deze zelfde gegevens nu read-only via het publieke
 * /api/brief-sjablonen (rol beheerder + medewerker) — wijzig je hier iets, dan verandert het dus
 * ook op elke nieuwe offerte/opdrachtbevestiging, niet alleen in brieven.
 *
 * De Brieven-logo en -achtergrond (los briefpapier als afbeelding) zijn hier bewust NIET
 * overgenomen — die zijn op hetzelfde verzoek uit de Brieven-module verwijderd, niet verplaatst.
 * Het Logo/Favicon van de portaal-Huisstijl (hierboven op dit tabblad) worden sinds dezelfde
 * sessie ook door de offertetool hergebruikt, via het publieke /api/instellingen — dat loopt
 * buiten dit bestand om (geen wijziging hier nodig, staat al standaard in Instellingen).
 */
export default function BrievenAfzenderInstellingen() {
  const [config, setConfig] = useState(null); // volledige config (afzender + sharepointMap + sjablonen + briefvelden)
  const [status, setStatus] = useState("rust");
  const [fout, setFout] = useState("");
  const [papierBezig, setPapierBezig] = useState(false);
  const [papierFout, setPapierFout] = useState("");
  const [openWordpapier, setOpenWordpapier] = useState(false); // inklapbaar
  const [openBedrijf, setOpenBedrijf] = useState(false);       // inklapbaar
  // Auto-opslaan: geladenRef = true na de eerste load; vuilRef = er is een gebruikerswijziging die
  // nog bewaard moet worden. vuilRef voorkomt dat de setConfig ná een save opnieuw een save triggert
  // (anders een oneindige opslag-lus).
  const geladenRef = useRef(false);
  const vuilRef = useRef(false);

  useEffect(() => {
    fetch("/api/beheer-briefsjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig({
        afzender: d.afzender || {},
        sharepointMap: d.sharepointMap || "Brieven",
        sjablonen: Array.isArray(d.sjablonen) ? d.sjablonen : [],
        briefvelden: Array.isArray(d.briefvelden) ? d.briefvelden : [],
      }))
      .catch(() => { setConfig({ afzender: {}, sharepointMap: "Brieven", sjablonen: [], briefvelden: [] }); setFout("De briefinstellingen konden niet worden geladen."); })
      .finally(() => { geladenRef.current = true; });
  }, []);

  const zetAfzender = (key, val) => { vuilRef.current = true; setConfig((c) => ({ ...c, afzender: { ...c.afzender, [key]: val } })); };

  function uploadBriefpapier(bestand) {
    if (!bestand) return;
    if (!/\.docx$/i.test(bestand.name || "") && !/wordprocessing/.test(bestand.type || "")) { setPapierFout("Kies een .docx-bestand."); return; }
    if (bestand.size > 20 * 1024 * 1024) { setPapierFout("Maximaal 20 MB."); return; }
    setPapierFout(""); setPapierBezig(true);
    const lezer = new FileReader();
    lezer.onload = async () => {
      try {
        const res = await fetch("/api/beheer-briefpapier-docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: lezer.result }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Uploaden mislukt.");
        // Ook de uit het briefpapier afgeleide achtergrond bijhouden; auto-opslaan bewaart die dan
        // mee in de config (vuilRef = true).
        vuilRef.current = true;
        setConfig((c) => ({ ...c, afzender: { ...c.afzender, briefpapierDocx: d.briefpapierDocx === true, achtergrondUrl: d.achtergrondUrl || "" } }));
      } catch (e) { setPapierFout(String(e.message || e)); }
      finally { setPapierBezig(false); }
    };
    lezer.onerror = () => { setPapierBezig(false); setPapierFout("Kon het bestand niet lezen."); };
    lezer.readAsDataURL(bestand);
  }
  async function verwijderBriefpapier() {
    setPapierBezig(true); setPapierFout("");
    try {
      const res = await fetch("/api/beheer-briefpapier-docx", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Verwijderen mislukt.");
      vuilRef.current = true;
      setConfig((c) => ({ ...c, afzender: { ...c.afzender, briefpapierDocx: false, achtergrondUrl: "" } }));
    } catch (e) { setPapierFout(String(e.message || e)); }
    finally { setPapierBezig(false); }
  }

  async function opslaan() {
    vuilRef.current = false; // vóór de PUT: de setConfig met het serverantwoord mag geen nieuwe save triggeren
    setStatus("bezig"); setFout("");
    try {
      const res = await fetch("/api/beheer-briefsjablonen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setConfig({ afzender: d.afzender || {}, sharepointMap: d.sharepointMap || "Brieven", sjablonen: d.sjablonen || [], briefvelden: d.briefvelden || [] });
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  // Automatisch opslaan (gedebounced) zodra er een gebruikerswijziging is — geen losse "Opslaan"-knop meer.
  useEffect(() => {
    if (!geladenRef.current || !vuilRef.current) return;
    const t = setTimeout(() => { opslaan(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  if (config === null) return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>Briefinstellingen laden…</div>;

  const a = config.afzender || {};
  const veld = (key, titel, opts = {}) => (
    <div style={{ flex: opts.flex || "1 1 200px", minWidth: opts.minWidth || 160 }}>
      <span style={labelStijl}>{titel}</span>
      <input value={a[key] || ""} onChange={(e) => zetAfzender(key, e.target.value)} placeholder={opts.placeholder || ""} style={invoerStijl} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Word-briefpapier (.docx) — hoort inhoudelijk bij de Huisstijl-sectie hierboven op deze tab. */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button onClick={() => setOpenWordpapier((v) => !v)} aria-expanded={openWordpapier} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: openWordpapier ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Word-briefpapier (.docx) — voor de Word-download</span>
        </button>
        {openWordpapier && (<>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {a.briefpapierDocx
            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: KLEUR.groen, fontSize: 12.5, fontWeight: 600 }}><CheckCircle2 size={15} /> Ingesteld</span>
            : <span style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen Word-briefpapier</span>}
          <label style={{ ...knopLichtStijl, cursor: papierBezig ? "default" : "pointer", opacity: papierBezig ? 0.6 : 1 }}>
            {papierBezig ? "Bezig…" : (a.briefpapierDocx ? "Vervangen" : "Uploaden")}
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} disabled={papierBezig} onChange={(e) => { uploadBriefpapier(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          </label>
          {a.briefpapierDocx && <button onClick={verwijderBriefpapier} disabled={papierBezig} style={{ ...knopLichtStijl, color: KLEUR.rood }}>Verwijderen</button>}
        </div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8, maxWidth: 720 }}>
          Upload één .docx met jullie huisstijl in de <strong>kop- en voettekst</strong> (logo/adres/voettekst). Bij
          "Word downloaden" (Klantoverzicht → Brieven) zet het portaal de brief in dit briefpapier — een echte
          Word op jullie huisstijl.
        </div>
        {papierFout && <div style={{ fontSize: 11.5, color: KLEUR.rood, marginTop: 8 }}>{papierFout}</div>}
        </>)}
      </div>

      {/* Bedrijfsgegevens — gedeeld tussen Brieven en de offertetool, zie doc-comment bovenaan dit bestand. */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <button onClick={() => setOpenBedrijf((v) => !v)} aria-expanded={openBedrijf} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: openBedrijf ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Bedrijfsgegevens</span>
        </button>
        {openBedrijf && (<>
        <p style={{ fontSize: 12, color: KLEUR.subtekst, margin: "10px 0 14px", maxWidth: 720 }}>
          Bedrijfsnaam, kvk, adres, postcode en plaats staan op elke brief én op elke nieuwe offerte/
          opdrachtbevestiging. Wijzig je dit hier, dan verandert het overal mee.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {veld("bedrijfsnaam", "Bedrijfsnaam", { flex: "1 1 260px" })}{veld("kvk", "KvK-nummer", { flex: "1 1 160px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("adres", "Adres (straat + nr)", { flex: "2 1 260px" })}{veld("postcode", "Postcode", { flex: "1 1 120px" })}{veld("plaats", "Plaats", { flex: "1 1 160px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("telefoon", "Telefoon", { flex: "1 1 160px" })}{veld("email", "E-mail", { flex: "1 1 200px" })}{veld("website", "Website", { flex: "1 1 200px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("btw", "BTW-nummer", { flex: "1 1 200px", placeholder: "NL8529.21.743.B01" })}{veld("iban", "IBAN", { flex: "1 1 220px", placeholder: "NL34 INGB 0100 9652 53" })}{veld("beconnummer", "Beconnummer", { flex: "1 1 160px", placeholder: "632.788" })}
        </div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6, maxWidth: 720 }}>Beconnummer komt in de briefkop (bij Kenmerk/Betreft). De voettekst met adres/contact/BTW/KvK/IBAN zit al ín het geüploade briefpapier/achtergrond zelf — deze waarden hier zijn ter registratie.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
          {veld("afsluiting", "Afsluiting", { flex: "1 1 220px", placeholder: "Met vriendelijke groet," })}
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <span style={labelStijl}>Wie ondertekent standaard</span>
            <select value={a.ondertekenaarBron || "relatiebeheerder"} onChange={(e) => zetAfzender("ondertekenaarBron", e.target.value)} style={invoerStijl}>
              <option value="relatiebeheerder">Relatiebeheerder van de klant</option>
              <option value="accountant">Accountant van de klant</option>
              <option value="vast">Vaste ondertekenaar</option>
            </select>
          </div>
          {a.ondertekenaarBron === "vast" && (
            <div style={{ flex: "1 1 200px", minWidth: 160 }}>
              <span style={labelStijl}>Vaste ondertekenaar</span>
              <input value={a.ondertekenaarVast || ""} onChange={(e) => zetAfzender("ondertekenaarVast", e.target.value)} style={invoerStijl} />
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={labelStijl}>Voetnoot</span>
          <input value={a.voetnoot || ""} onChange={(e) => zetAfzender("voetnoot", e.target.value)} placeholder="Leeg = automatisch (bedrijfsnaam · KvK · e-mail · website)" style={invoerStijl} />
        </div>
        </>)}
      </div>

      {(status === "bezig" || status === "opgeslagen" || status === "fout") && (
        <div style={{ marginTop: 12 }}>
          {status === "bezig" ? (
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Opslaan…</div>
          ) : status === "opgeslagen" ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: KLEUR.groen }}><CheckCircle2 size={13} /> Automatisch opgeslagen</div>
          ) : (
            <div style={{ fontSize: 12.5, color: KLEUR.rood, fontWeight: 600 }}>{fout || "Automatisch opslaan is mislukt — probeer het nog eens."}</div>
          )}
        </div>
      )}
    </div>
  );
}
