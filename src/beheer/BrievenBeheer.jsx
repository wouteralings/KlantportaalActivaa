import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, ArrowUp, ArrowDown, CheckCircle2, XCircle, Mail, ChevronDown, AlertTriangle, ListChecks } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. ContractenTypesBeheer.jsx). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};
const invoerStijl = { boxSizing: "border-box", width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff", color: KLEUR.tekst };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };

// De placeholders die in een sjabloon/paragraaf (onderwerp/tekst) mogen staan; in het
// medewerkersportaal (BrievenOverzicht.jsx → veldenVan) worden ze ingevuld met de Dynamics-gegevens
// van de klant.
const PLACEHOLDERS = [
  ["{{klantnaam}}", "Bedrijfs-/cliëntnaam"], ["{{klantnummer}}", "Cliëntnummer"], ["{{groepsnaam}}", "Groepsnaam"],
  ["{{kvk}}", "KvK-nummer"], ["{{belastingkantoor}}", "Belastingkantoor"], ["{{relatiebeheerder}}", "Relatiebeheerder"],
  ["{{accountant}}", "Accountant"], ["{{contactpersoon}}", "Naam contactpersoon"], ["{{achternaam}}", "Achternaam (met tussenvoegsel)"],
  ["{{email}}", "E-mail contactpersoon"], ["{{adresregel}}", "Straat + huisnummer"], ["{{postcodeplaats}}", "Postcode + plaats"],
  ["{{datum}}", "Datum van vandaag"], ["{{afzendernaam}}", "Naam van Activaa (afzender)"],
];

/**
 * Beheer van de Brieven-module — gebouwd 05-08-2026. Naast de afzendergegevens en de vrije
 * standaardbrieven (sjablonen) beheer je hier de **standaardparagrafen (regels)**: per paragraaf
 * een voorwaarde op een veld van de Dynamics-tabel Brieven (cr283_brief). De medewerker kiest in
 * het portaal een brief-record; de engine neemt de paragrafen mee waarvan de voorwaarde klopt.
 * Velden + opties komen live uit /api/brief-dynamics-velden. Opslag via /api/beheer-briefsjablonen.
 */
export default function BrievenBeheer() {
  const [config, setConfig] = useState(null); // { afzender, sharepointMap, sjablonen, paragrafen }
  const [status, setStatus] = useState("rust");
  const [fout, setFout] = useState("");
  const [velden, setVelden] = useState(null); // { booleans, optielijsten } | null
  const [veldenFout, setVeldenFout] = useState("");

  useEffect(() => {
    fetch("/api/beheer-briefsjablonen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConfig({
        afzender: d.afzender || {},
        sharepointMap: d.sharepointMap || "Brieven",
        sjablonen: Array.isArray(d.sjablonen) ? d.sjablonen : [],
        paragrafen: Array.isArray(d.paragrafen) ? d.paragrafen : [],
      }))
      .catch(() => { setConfig({ afzender: {}, sharepointMap: "Brieven", sjablonen: [], paragrafen: [] }); setFout("De briefsjablonen konden niet worden geladen."); });

    fetch("/api/brief-dynamics-velden")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setVelden({ booleans: d.booleans || [], optielijsten: d.optielijsten || [] }))
      .catch(() => setVeldenFout("De velden van de Brieven-tabel (cr283_brief) konden niet uit Dynamics geladen worden. Je kunt voorwaarden nog wel met de hand (logische veldnaam) invullen."));
  }, []);

  // Gecombineerde veldenlijst voor de voorwaarde-kiezer.
  const alleVelden = useMemo(() => {
    if (!velden) return [];
    return [
      ...velden.booleans.map((b) => ({ naam: b.naam, label: b.label, type: "bool", jaLabel: b.jaLabel, neeLabel: b.neeLabel })),
      ...velden.optielijsten.map((o) => ({ naam: o.naam, label: o.label, type: "optie", opties: o.opties || [] })),
    ];
  }, [velden]);

  const zetAfzender = (key, val) => setConfig((c) => ({ ...c, afzender: { ...c.afzender, [key]: val } }));
  const zetSjabloon = (i, key, val) => setConfig((c) => { const s = c.sjablonen.slice(); s[i] = { ...s[i], [key]: val }; return { ...c, sjablonen: s }; });
  const verplaatsSjabloon = (i, r) => setConfig((c) => { const j = i + r; if (j < 0 || j >= c.sjablonen.length) return c; const s = c.sjablonen.slice(); [s[i], s[j]] = [s[j], s[i]]; return { ...c, sjablonen: s }; });
  const verwijderSjabloon = (i) => setConfig((c) => ({ ...c, sjablonen: c.sjablonen.filter((_, idx) => idx !== i) }));
  const nieuwSjabloon = () => setConfig((c) => ({ ...c, sjablonen: [...c.sjablonen, { id: "", naam: "Nieuwe brief", onderwerp: "", tekst: "", actief: true }] }));

  const zetParagraaf = (i, key, val) => setConfig((c) => { const p = c.paragrafen.slice(); p[i] = { ...p[i], [key]: val }; return { ...c, paragrafen: p }; });
  const zetVoorwaarde = (i, vw) => setConfig((c) => { const p = c.paragrafen.slice(); p[i] = { ...p[i], voorwaarde: vw }; return { ...c, paragrafen: p }; });
  const verplaatsParagraaf = (i, r) => setConfig((c) => { const j = i + r; if (j < 0 || j >= c.paragrafen.length) return c; const p = c.paragrafen.slice(); [p[i], p[j]] = [p[j], p[i]]; return { ...c, paragrafen: p }; });
  const verwijderParagraaf = (i) => setConfig((c) => ({ ...c, paragrafen: c.paragrafen.filter((_, idx) => idx !== i) }));
  const nieuwParagraaf = () => setConfig((c) => ({ ...c, paragrafen: [...c.paragrafen, { id: "", naam: "", tekst: "", actief: true, voorwaarde: { modus: "altijd" } }] }));

  async function opslaan() {
    setStatus("bezig"); setFout("");
    try {
      const res = await fetch("/api/beheer-briefsjablonen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Opslaan mislukt.");
      setConfig({ afzender: d.afzender || {}, sharepointMap: d.sharepointMap || "Brieven", sjablonen: d.sjablonen || [], paragrafen: d.paragrafen || [] });
      setStatus("opgeslagen"); setTimeout(() => setStatus("rust"), 2500);
    } catch (e) { setStatus("fout"); setFout(String(e.message || e)); }
  }

  if (config === null) return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "16px 0" }}>Brieven-instellingen laden…</div>;

  const a = config.afzender || {};
  const veld = (key, titel, opts = {}) => (
    <div style={{ flex: opts.flex || "1 1 200px", minWidth: opts.minWidth || 160 }}>
      <span style={labelStijl}>{titel}</span>
      <input value={a[key] || ""} onChange={(e) => zetAfzender(key, e.target.value)} placeholder={opts.placeholder || ""} style={invoerStijl} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Mail size={17} color={KLEUR.blauw} /><h3 style={{ margin: 0, fontSize: 15, color: KLEUR.tekst }}>Brieven</h3>
      </div>
      <p style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "0 0 18px", maxWidth: 760 }}>
        Afzendergegevens, standaardparagrafen (met voorwaarden op de velden van de Dynamics-tabel
        Brieven) en vrije standaardbrieven voor de tab Klantoverzicht → Brieven. In tekst kun je
        {" {{merge-velden}} "} gebruiken; die worden met de Dynamics-gegevens van de klant ingevuld.
      </p>

      {/* Afzendergegevens */}
      <Rubriek titel="Afzendergegevens (briefpapier)">
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
            <div style={{ position: "relative" }}>
              <select value={a.ondertekenaarBron || "relatiebeheerder"} onChange={(e) => zetAfzender("ondertekenaarBron", e.target.value)} style={{ ...invoerStijl, appearance: "none", paddingRight: 30, cursor: "pointer" }}>
                <option value="relatiebeheerder">Relatiebeheerder van de klant</option>
                <option value="accountant">Accountant van de klant</option>
                <option value="vast">Vaste ondertekenaar</option>
              </select>
              <ChevronDown size={15} color={KLEUR.mutedTekst} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
          </div>
          {a.ondertekenaarBron === "vast" && (
            <div style={{ flex: "1 1 200px", minWidth: 160 }}>
              <span style={labelStijl}>Vaste ondertekenaar</span>
              <input value={a.ondertekenaarVast || ""} onChange={(e) => zetAfzender("ondertekenaarVast", e.target.value)} style={invoerStijl} />
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={labelStijl}>Voetnoot (onderaan de brief)</span>
          <input value={a.voetnoot || ""} onChange={(e) => zetAfzender("voetnoot", e.target.value)} placeholder="Leeg = automatisch (bedrijfsnaam · KvK · e-mail · website)" style={invoerStijl} />
        </div>
      </Rubriek>

      {/* SharePoint-map */}
      <Rubriek titel="Opslaan in klantdossier">
        <div style={{ maxWidth: 320 }}>
          <span style={labelStijl}>SharePoint-submap</span>
          <input value={config.sharepointMap} onChange={(e) => setConfig((c) => ({ ...c, sharepointMap: e.target.value }))} placeholder="Brieven" style={invoerStijl} />
        </div>
      </Rubriek>

      {/* Placeholders */}
      <Rubriek titel="Beschikbare merge-velden">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PLACEHOLDERS.map(([code, uitleg]) => (
            <span key={code} title={uitleg} style={{ fontSize: 11.5, background: KLEUR.lichtblauw, color: KLEUR.blauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "3px 7px", fontFamily: "monospace" }}>{code}</span>
          ))}
        </div>
      </Rubriek>

      {/* Standaardparagrafen (regels-engine) */}
      <Rubriek titel={`Standaardparagrafen (regels) — ${config.paragrafen.length}`}>
        <p style={{ fontSize: 12, color: KLEUR.subtekst, margin: "0 0 12px", maxWidth: 720 }}>
          De medewerker kiest in het portaal een klant en een brief-record uit Dynamics. Elke paragraaf
          hieronder komt in de brief als z'n voorwaarde klopt (in deze volgorde). "Altijd meenemen" =
          in elke brief; anders op een ja/nee-veld of optielijst van de Brieven-tabel.
        </p>
        {veldenFout && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FFF7E6", border: `1px solid #F0D9A6`, color: KLEUR.goud, borderRadius: 8, padding: "8px 11px", fontSize: 12, marginBottom: 12 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{veldenFout}</span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {config.paragrafen.map((p, i) => (
            <div key={i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, background: p.actief === false ? "#F7F7F5" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: KLEUR.lichtblauw, color: KLEUR.blauw, fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <input value={p.naam || ""} onChange={(e) => zetParagraaf(i, "naam", e.target.value)} placeholder="Naam (optioneel, alleen voor jezelf)" style={{ ...invoerStijl, flex: 1 }} />
                <button onClick={() => zetParagraaf(i, "actief", !(p.actief !== false))} title={p.actief === false ? "Inactief" : "Actief"} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: p.actief === false ? KLEUR.mutedTekst : KLEUR.groen, cursor: "pointer" }}>
                  {p.actief === false ? <XCircle size={14} /> : <CheckCircle2 size={14} />} {p.actief === false ? "Inactief" : "Actief"}
                </button>
                <button onClick={() => verplaatsParagraaf(i, -1)} disabled={i === 0} title="Omhoog" style={pijlStijl(i === 0)}><ArrowUp size={15} /></button>
                <button onClick={() => verplaatsParagraaf(i, 1)} disabled={i === config.paragrafen.length - 1} title="Omlaag" style={pijlStijl(i === config.paragrafen.length - 1)}><ArrowDown size={15} /></button>
                <button onClick={() => verwijderParagraaf(i)} title="Verwijderen" style={{ ...pijlStijl(false), color: KLEUR.rood }}><Trash2 size={15} /></button>
              </div>
              <VoorwaardeEditor voorwaarde={p.voorwaarde} onChange={(vw) => zetVoorwaarde(i, vw)} alleVelden={alleVelden} veldenGeladen={!!velden} />
              <div style={{ marginTop: 10 }}>
                <span style={labelStijl}>Paragraaftekst</span>
                <textarea value={p.tekst || ""} onChange={(e) => zetParagraaf(i, "tekst", e.target.value)} rows={4} style={{ ...invoerStijl, resize: "vertical", minHeight: 80, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Tekst van deze paragraaf… (gebruik {{merge-velden}})" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={nieuwParagraaf} style={knopLichtStijl}><Plus size={15} /> Nieuwe paragraaf</button>
      </Rubriek>

      {/* Vrije standaardbrieven (sjablonen) */}
      <Rubriek titel={`Vrije standaardbrieven (${config.sjablonen.length})`}>
        <p style={{ fontSize: 12, color: KLEUR.subtekst, margin: "0 0 12px", maxWidth: 720 }}>
          Losse sjablonen voor een snelle brief zónder Dynamics-regels (de medewerker kiest deze in
          het portaal onder "Vrije brief"). Onderwerp + tekst mogen {"{{merge-velden}}"} bevatten.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {config.sjablonen.map((s, i) => (
            <div key={i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, background: s.actief === false ? "#F7F7F5" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <input value={s.naam || ""} onChange={(e) => zetSjabloon(i, "naam", e.target.value)} placeholder="Naam van de brief" style={{ ...invoerStijl, fontWeight: 700, flex: 1 }} />
                <button onClick={() => zetSjabloon(i, "actief", !(s.actief !== false))} title={s.actief === false ? "Inactief" : "Actief"} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: s.actief === false ? KLEUR.mutedTekst : KLEUR.groen, cursor: "pointer" }}>
                  {s.actief === false ? <XCircle size={14} /> : <CheckCircle2 size={14} />} {s.actief === false ? "Inactief" : "Actief"}
                </button>
                <button onClick={() => verplaatsSjabloon(i, -1)} disabled={i === 0} title="Omhoog" style={pijlStijl(i === 0)}><ArrowUp size={15} /></button>
                <button onClick={() => verplaatsSjabloon(i, 1)} disabled={i === config.sjablonen.length - 1} title="Omlaag" style={pijlStijl(i === config.sjablonen.length - 1)}><ArrowDown size={15} /></button>
                <button onClick={() => verwijderSjabloon(i)} title="Verwijderen" style={{ ...pijlStijl(false), color: KLEUR.rood }}><Trash2 size={15} /></button>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={labelStijl}>Onderwerp</span>
                <input value={s.onderwerp || ""} onChange={(e) => zetSjabloon(i, "onderwerp", e.target.value)} placeholder="Betreft…" style={invoerStijl} />
              </div>
              <div>
                <span style={labelStijl}>Tekst</span>
                <textarea value={s.tekst || ""} onChange={(e) => zetSjabloon(i, "tekst", e.target.value)} rows={6} style={{ ...invoerStijl, resize: "vertical", minHeight: 120, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Inhoud van de brief… (lege regel = nieuwe alinea)" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={nieuwSjabloon} style={knopLichtStijl}><Plus size={15} /> Nieuwe brief</button>
      </Rubriek>

      {/* Opslaan */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 16 }}>
        <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: status === "bezig" ? "default" : "pointer", opacity: status === "bezig" ? 0.7 : 1 }}>
          <Save size={16} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: KLEUR.groen, fontSize: 12.5, fontWeight: 600 }}><CheckCircle2 size={15} /> Opgeslagen</span>}
        {status === "fout" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: KLEUR.rood, fontSize: 12.5, fontWeight: 600 }}><XCircle size={15} /> {fout}</span>}
      </div>
    </div>
  );
}

const knopLichtStijl = { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

/** Voorwaarde-editor voor één paragraaf: altijd, of een veld = waarde uit de Brieven-tabel. */
function VoorwaardeEditor({ voorwaarde, onChange, alleVelden, veldenGeladen }) {
  const vw = voorwaarde && typeof voorwaarde === "object" ? voorwaarde : { modus: "altijd" };
  const gekozenVeld = alleVelden.find((v) => v.naam === vw.veld);
  const sel = { ...invoerStijl, width: "auto", appearance: "auto", cursor: "pointer" };

  const zet = (patch) => onChange({ ...vw, ...patch });
  const toonWaarde = vw.modus === "veld" && vw.operator !== "ingevuld" && vw.operator !== "leeg";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 11px" }}>
      <ListChecks size={15} color={KLEUR.blauw} style={{ flexShrink: 0 }} />
      <select value={vw.modus === "veld" ? "veld" : "altijd"} onChange={(e) => zet(e.target.value === "veld" ? { modus: "veld", veld: vw.veld || "", operator: vw.operator || "is", waarde: vw.waarde } : { modus: "altijd" })} style={sel}>
        <option value="altijd">Altijd meenemen</option>
        <option value="veld">Alleen als…</option>
      </select>

      {vw.modus === "veld" && (
        <>
          {veldenGeladen && alleVelden.length > 0 ? (
            <select value={vw.veld || ""} onChange={(e) => zet({ veld: e.target.value, waarde: undefined })} style={sel}>
              <option value="">— kies veld —</option>
              {alleVelden.map((v) => <option key={v.naam} value={v.naam}>{v.label}{v.type === "bool" ? " (ja/nee)" : ""}</option>)}
            </select>
          ) : (
            <input value={vw.veld || ""} onChange={(e) => zet({ veld: e.target.value })} placeholder="logische veldnaam (bv. cr283_...)" style={{ ...invoerStijl, width: 220 }} />
          )}

          <select value={vw.operator || "is"} onChange={(e) => zet({ operator: e.target.value })} style={sel}>
            <option value="is">is</option>
            <option value="isNiet">is niet</option>
            <option value="ingevuld">is ingevuld</option>
            <option value="leeg">is leeg</option>
          </select>

          {toonWaarde && (
            gekozenVeld && gekozenVeld.type === "bool" ? (
              <select value={String(vw.waarde === true)} onChange={(e) => zet({ waarde: e.target.value === "true" })} style={sel}>
                <option value="true">{gekozenVeld.jaLabel || "Ja"}</option>
                <option value="false">{gekozenVeld.neeLabel || "Nee"}</option>
              </select>
            ) : gekozenVeld && gekozenVeld.type === "optie" ? (
              <select value={vw.waarde != null ? String(vw.waarde) : ""} onChange={(e) => zet({ waarde: e.target.value === "" ? null : Number(e.target.value) })} style={sel}>
                <option value="">— kies optie —</option>
                {gekozenVeld.opties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
              </select>
            ) : (
              <input value={vw.waarde != null ? String(vw.waarde) : ""} onChange={(e) => zet({ waarde: e.target.value })} placeholder="waarde" style={{ ...invoerStijl, width: 140 }} />
            )
          )}
        </>
      )}
    </div>
  );
}

function pijlStijl(uit) {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, background: "#fff", borderRadius: 7, color: uit ? KLEUR.rand : KLEUR.subtekst, cursor: uit ? "default" : "pointer" };
}
function Rubriek({ titel, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.tekst, marginBottom: 10 }}>{titel}</div>
      {children}
    </div>
  );
}
