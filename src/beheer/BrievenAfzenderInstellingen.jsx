import { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald, zie BrievenBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
const knopLichtStijl = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

/**
 * Beheer → Instellingen: het Word-briefpapier (.docx) en de afzendergegevens van de Brieven-module.
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
 * De Brieven-logo en -achtergrond (los briefpapier als afbeelding) zijn hier bewust NIET
 * overgenomen — die zijn op hetzelfde verzoek uit de Brieven-module verwijderd, niet verplaatst.
 */
export default function BrievenAfzenderInstellingen() {
  const [config, setConfig] = useState(null); // volledige config (afzender + sharepointMap + sjablonen + briefvelden)
  const [status, setStatus] = useState("rust");
  const [fout, setFout] = useState("");
  const [papierBezig, setPapierBezig] = useState(false);
  const [papierFout, setPapierFout] = useState("");

  useEffect(() => {
    fetch("/api/beheer-briefsjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig({
        afzender: d.afzender || {},
        sharepointMap: d.sharepointMap || "Brieven",
        sjablonen: Array.isArray(d.sjablonen) ? d.sjablonen : [],
        briefvelden: Array.isArray(d.briefvelden) ? d.briefvelden : [],
      }))
      .catch(() => { setConfig({ afzender: {}, sharepointMap: "Brieven", sjablonen: [], briefvelden: [] }); setFout("De briefinstellingen konden niet worden geladen."); });
  }, []);

  const zetAfzender = (key, val) => setConfig((c) => ({ ...c, afzender: { ...c.afzender, [key]: val } }));

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
        zetAfzender("briefpapierDocx", d.briefpapierDocx === true);
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
      zetAfzender("briefpapierDocx", false);
    } catch (e) { setPapierFout(String(e.message || e)); }
    finally { setPapierBezig(false); }
  }

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const res = await fetch("/api/beheer-briefsjablonen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setConfig({ afzender: d.afzender || {}, sharepointMap: d.sharepointMap || "Brieven", sjablonen: d.sjablonen || [], briefvelden: d.briefvelden || [] });
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

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
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Word-briefpapier (.docx) — voor de Word-download</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
      </div>

      {/* Afzendergegevens */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Brieven — afzendergegevens</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {veld("bedrijfsnaam", "Bedrijfsnaam", { flex: "1 1 260px" })}{veld("kvk", "KvK-nummer", { flex: "1 1 160px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("adres", "Adres (straat + nr)", { flex: "2 1 260px" })}{veld("postcode", "Postcode", { flex: "1 1 120px" })}{veld("plaats", "Plaats", { flex: "1 1 160px" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {veld("telefoon", "Telefoon", { flex: "1 1 160px" })}{veld("email", "E-mail", { flex: "1 1 200px" })}{veld("website", "Website", { flex: "1 1 200px" })}
        </div>
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
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
        <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: status === "bezig" ? "default" : "pointer", opacity: status === "bezig" ? 0.7 : 1 }}>
          <Save size={16} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: KLEUR.groen, fontSize: 12.5, fontWeight: 600 }}><CheckCircle2 size={15} /> Opgeslagen</span>}
        {status === "fout" && <span style={{ fontSize: 12.5, color: KLEUR.rood, fontWeight: 600 }}>{fout}</span>}
      </div>
    </div>
  );
}
