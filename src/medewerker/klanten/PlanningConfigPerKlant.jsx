/**
 * Planning — configuratie per klant ("wat doen we voor deze klant"), Planningsmodule Stap 3a.
 *
 * Per klant een lijst afspraken: activiteit + frequentie + indicatie-uren. De toewijzing volgt
 * standaard het TEAM van de klant: elke activiteit hangt in Beheer → Planning aan een rol
 * (assistent/manager/accountant/…), en de bijbehorende persoon komt uit de klantgegevens
 * (/api/beheer-klanten, Dynamics). Wijs je iemand ANDERS toe dan het team, dan wordt dat duidelijk
 * gemarkeerd ("Afwijkend van team"). CRUD via /api/mw-planning-config; de activiteiten (met hun rol)
 * komen uit /api/mw-planning-overzicht.
 */
import { useState, useEffect, useMemo } from "react";
import { Search, Plus, Trash2, Users, AlertTriangle, X } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, color: KLEUR.tekst, boxSizing: "border-box" };
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

const ROL_LABELS = { assistent: "Assistent", manager: "Manager", accountant: "Accountant", fiscaal: "Fiscaal medewerker", loonadministratie: "Loonadministratie", backup: "Backup" };
const FREQ = [["maandelijks", "Maandelijks"], ["kwartaal", "Per kwartaal"], ["jaarlijks", "Jaarlijks"], ["eenmalig", "Eenmalig"]];
const freqLabel = (f) => (FREQ.find(([k]) => k === f) || [null, f])[1];

/** De naam van de persoon in een bepaalde rol op de klant (uit /api/beheer-klanten). */
function teamPersoon(klant, rol) {
  if (!klant || !rol) return "";
  switch (rol) {
    case "assistent": return klant.assistent?.naam || "";
    case "manager": return klant.manager?.naam || klant.relatiebeheerder || "";
    case "accountant": return klant.accountantPersoon?.naam || klant.accountant || "";
    case "fiscaal": return klant.fiscaalMedewerker?.naam || "";
    case "loonadministratie": return klant.loonadministratie?.naam || "";
    case "backup": return klant.backup?.naam || "";
    default: return "";
  }
}

function urenTekst(n) {
  if (n == null || n === "") return "—";
  return `${Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} u`;
}

export default function PlanningConfigPerKlant() {
  const [activiteiten, setActiviteiten] = useState([]);
  const [klantenLijst, setKlantenLijst] = useState([]);
  const [klantZoek, setKlantZoek] = useState("");
  const [klant, setKlant] = useState(null); // gekozen klant (object uit beheer-klanten)
  const [config, setConfig] = useState(null); // configuratieregels van de gekozen klant
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  // nieuw-regel-form
  const [nwActiviteit, setNwActiviteit] = useState("");
  const [nwFrequentie, setNwFrequentie] = useState("maandelijks");
  const [nwUren, setNwUren] = useState("");

  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);

  useEffect(() => {
    fetch("/api/mw-planning-overzicht")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setActiviteiten(d.activiteiten || []))
      .catch(() => setActiviteiten([]));
    fetch("/api/beheer-klanten")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setKlantenLijst((d.klanten || []).slice().sort((a, b) => String(a.klantnaam || "").localeCompare(String(b.klantnaam || ""), "nl"))))
      .catch(() => setKlantenLijst([]));
  }, []);

  const laadConfig = (accountId) => {
    setConfig(null);
    fetch(`/api/mw-planning-config?accountId=${encodeURIComponent(accountId)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.json(); })
      .then((d) => setConfig(d.config || []))
      .catch((e) => { setConfig([]); setFout(e.message || "Configuratie kon niet worden opgehaald."); });
  };

  const kiesKlant = (k) => { setKlant(k); setFout(""); laadConfig(String(k.accountId).toLowerCase()); };

  const gefilterdeKlanten = useMemo(() => {
    const term = klantZoek.trim().toLowerCase();
    if (!term) return klantenLijst.slice(0, 30);
    return klantenLijst.filter((k) => [k.klantnaam, k.klantnummer, k.groepsnaam].filter(Boolean).some((v) => String(v).toLowerCase().includes(term))).slice(0, 30);
  }, [klantenLijst, klantZoek]);

  const voegToe = async () => {
    if (!klant || !nwActiviteit) return;
    setBezig(true); setFout("");
    try {
      const res = await fetch("/api/mw-planning-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ klantAccountId: String(klant.accountId).toLowerCase(), activiteit: nwActiviteit, frequentie: nwFrequentie, indicatieUren: nwUren === "" ? null : nwUren }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setNwActiviteit(""); setNwUren(""); setNwFrequentie("maandelijks");
      laadConfig(String(klant.accountId).toLowerCase());
    } catch (e) { setFout(e.message || "Toevoegen mislukt."); } finally { setBezig(false); }
  };

  const wijzig = async (id, patch) => {
    setFout("");
    try {
      const res = await fetch("/api/mw-planning-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const bij = await res.json();
      setConfig((h) => (h || []).map((r) => (r.id === id ? bij : r)));
    } catch (e) { setFout(e.message || "Opslaan mislukt."); }
  };

  const verwijder = async (id) => {
    if (!window.confirm("Deze regel uit de configuratie verwijderen?")) return;
    setFout("");
    try {
      const res = await fetch(`/api/mw-planning-config?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setConfig((h) => (h || []).filter((r) => r.id !== id));
    } catch (e) { setFout(e.message || "Verwijderen mislukt."); }
  };

  // Regel verrijkt met team-info
  const regelInfo = (r) => {
    const act = activiteitById[r.activiteit];
    const rol = act?.rol || "";
    const team = teamPersoon(klant, rol);
    const override = (r.toegewezenAan || "").trim();
    const afwijkend = !!override && override.toLowerCase() !== (team || "").toLowerCase();
    return { act, rol, team, override, afwijkend, toon: override || team || "" };
  };

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <Users size={17} color={KLEUR.blauw} /> Planning-configuratie per klant
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16, maxWidth: 820 }}>
        Stel per klant in wat we doen: welke activiteiten, met welke frequentie en indicatie-uren. De
        uitvoerder volgt standaard het <strong>team</strong> van de klant (de rol per activiteit, uit
        Beheer → Planning). Wijs je iemand anders toe, dan zie je dat gemarkeerd als
        <span style={{ color: KLEUR.amber, fontWeight: 600 }}> afwijkend van team</span>.
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>{fout}</div>}

      {/* Klantkeuze */}
      {!klant ? (
        <div>
          <div style={{ position: "relative", maxWidth: 460, marginBottom: 10 }}>
            <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={klantZoek} onChange={(e) => setKlantZoek(e.target.value)} placeholder="Zoek een klant op naam, nummer of groep…"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px 9px 32px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none" }} />
          </div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxWidth: 460, maxHeight: 360, overflowY: "auto" }}>
            {gefilterdeKlanten.map((k, i) => (
              <button key={k.accountId} onClick={() => kiesKlant(k)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "#fff", border: "none", borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}`, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = KLEUR.lichtblauw)} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{k.klantnaam || "(naamloos)"}</div>
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{k.klantnummer}{k.groepsnaam ? ` · ${k.groepsnaam}` : ""}</div>
              </button>
            ))}
            {gefilterdeKlanten.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen klanten gevonden.</div>}
          </div>
        </div>
      ) : (
        <div>
          {/* Gekozen klant + team */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{klant.klantnaam}</div>
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>{klant.klantnummer}{klant.groepsnaam ? ` · ${klant.groepsnaam}` : ""}</div>
            </div>
            <button onClick={() => { setKlant(null); setConfig(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <X size={14} /> Andere klant
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {["assistent", "manager", "accountant", "fiscaal", "loonadministratie", "backup"].map((rol) => {
              const naam = teamPersoon(klant, rol);
              if (!naam) return null;
              return <span key={rol} style={{ fontSize: 11.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, padding: "4px 9px", borderRadius: 6 }}><strong style={{ color: KLEUR.blauw }}>{ROL_LABELS[rol]}:</strong> {naam}</span>;
            })}
          </div>

          {/* Configuratietabel */}
          {config === null ? (
            <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "20px 0" }}>Configuratie laden…</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr>
                  <th style={th}>Activiteit</th><th style={th}>Type</th><th style={th}>Frequentie</th>
                  <th style={th}>Indicatie-uren</th><th style={th}>Uitvoerder (team)</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {config.map((r) => {
                    const info = regelInfo(r);
                    return (
                      <tr key={r.id}>
                        <td style={td}>{info.act?.label || r.activiteit}</td>
                        <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, padding: "2px 7px", borderRadius: 5 }}>{info.act?.type === "jaar" ? "Jaar" : "Maand"}</span></td>
                        <td style={td}>
                          <select value={r.frequentie} onChange={(e) => wijzig(r.id, { frequentie: e.target.value })} style={{ ...inputStijl, width: "auto", padding: "5px 8px" }}>
                            {FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </td>
                        <td style={td}>
                          <input type="number" min="0" step="0.25" defaultValue={r.indicatieUren == null ? "" : r.indicatieUren}
                            onBlur={(e) => { const v = e.target.value; if (String(v) !== String(r.indicatieUren ?? "")) wijzig(r.id, { indicatieUren: v === "" ? null : v }); }}
                            style={{ ...inputStijl, width: 90, padding: "5px 8px" }} />
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: info.afwijkend ? 700 : 400, color: info.afwijkend ? KLEUR.amber : KLEUR.tekst }}>{info.toon || <span style={{ color: KLEUR.mutedTekst }}>— geen {ROL_LABELS[info.rol] || "rol"} —</span>}</span>
                            {info.afwijkend && (
                              <span title={`Team (${ROL_LABELS[info.rol] || "rol"}): ${info.team || "—"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberAchtergrond, padding: "2px 7px", borderRadius: 20 }}>
                                <AlertTriangle size={11} /> Afwijkend van team
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                            <input placeholder={`Afwijken van team (${ROL_LABELS[info.rol] || "rol"})…`} defaultValue={r.toegewezenAan || ""}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.toegewezenAan || "")) wijzig(r.id, { toegewezenAan: v }); }}
                              style={{ ...inputStijl, width: 220, padding: "5px 8px", fontSize: 12 }} />
                            {r.toegewezenAan && <button onClick={() => wijzig(r.id, { toegewezenAan: "" })} title="Terug naar team" style={{ background: "none", border: "none", color: KLEUR.blauw, fontSize: 11.5, cursor: "pointer" }}>← team</button>}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <button onClick={() => verwijder(r.id)} title="Verwijderen" style={{ background: "none", border: "none", color: KLEUR.rood, cursor: "pointer" }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {config.length === 0 && <tr><td colSpan={6} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: "20px" }}>Nog niets ingesteld voor deze klant. Voeg hieronder een activiteit toe.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Nieuwe regel */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={nwActiviteit} onChange={(e) => setNwActiviteit(e.target.value)} style={{ ...inputStijl, width: "auto", minWidth: 220 }}>
              <option value="">— kies activiteit —</option>
              <optgroup label="Maandactiviteiten">{activiteiten.filter((a) => a.type === "maand").map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}</optgroup>
              <optgroup label="Jaaractiviteiten">{activiteiten.filter((a) => a.type === "jaar").map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}</optgroup>
            </select>
            <select value={nwFrequentie} onChange={(e) => setNwFrequentie(e.target.value)} style={{ ...inputStijl, width: "auto" }}>
              {FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input type="number" min="0" step="0.25" value={nwUren} onChange={(e) => setNwUren(e.target.value)} placeholder="uren (bv. 2)" style={{ ...inputStijl, width: 120 }} />
            <button onClick={voegToe} disabled={!nwActiviteit || bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nwActiviteit ? "pointer" : "default", opacity: nwActiviteit ? 1 : 0.6 }}>
              <Plus size={14} /> Toevoegen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
