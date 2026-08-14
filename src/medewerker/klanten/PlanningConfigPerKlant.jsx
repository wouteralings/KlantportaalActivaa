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
import MedewerkerKiezer from "./MedewerkerKiezer";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", groen: "#2E7D46", amber: "#A9660C", amberAchtergrond: "#FFF4E5", lichtblauw: "#EAF2F8",
};
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13, color: KLEUR.tekst, boxSizing: "border-box" };
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

const ROL_LABELS = { assistent: "Assistent", manager: "Manager", accountant: "Accountant", fiscaal: "Fiscaal medewerker", loonadministratie: "Loonadministratie", backoffice: "Backoffice", backup: "Backup" };
const FREQ = [["maandelijks", "Maandelijks"], ["kwartaal", "Per kwartaal"], ["jaarlijks", "Jaarlijks"], ["eenmalig", "Eenmalig"]];
const freqLabel = (f) => (FREQ.find(([k]) => k === f) || [null, f])[1];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
// Een uitvoermaand is relevant voor jaar-/eenmalige afspraken (welke maand valt de taak?).
const heeftUitvoerMaand = (frequentie) => frequentie === "jaarlijks" || frequentie === "eenmalig";

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

export default function PlanningConfigPerKlant({ initieelAccountId, vasteKlant, readOnly = false } = {}) {
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
  const [nwUitvoerMaand, setNwUitvoerMaand] = useState("");
  const [overrides, setOverrides] = useState({}); // id → tekst tijdens het bewerken van een afwijkende toewijzing
  const [setjes, setSetjes] = useState([]); // beheer-setjes van hoofdtaken
  const [setjeKeuze, setSetjeKeuze] = useState("");
  const [setjeBezig, setSetjeBezig] = useState(false);
  const [setjeMelding, setSetjeMelding] = useState("");

  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);

  useEffect(() => {
    fetch("/api/mw-planning-overzicht")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setActiviteiten(d.activiteiten || []); setSetjes(Array.isArray(d.setjes) ? d.setjes : []); })
      .catch(() => setActiviteiten([]));
    // Klantenlijst alleen nodig voor de picker; bij een vaste klant (ingebed in de klantkaart) overslaan.
    if (!vasteKlant) {
      fetch("/api/beheer-klanten?alle=1")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setKlantenLijst((d.klanten || []).slice().sort((a, b) => String(a.klantnaam || "").localeCompare(String(b.klantnaam || ""), "nl"))))
        .catch(() => setKlantenLijst([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const laadConfig = (accountId) => {
    setConfig(null);
    fetch(`/api/mw-planning-config?accountId=${encodeURIComponent(accountId)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.json(); })
      .then((d) => setConfig(d.config || []))
      .catch((e) => { setConfig([]); setFout(e.message || "Configuratie kon niet worden opgehaald."); });
  };

  const kiesKlant = (k) => { setKlant(k); setFout(""); laadConfig(String(k.accountId).toLowerCase()); };

  // Vast op één klant (ingebed in de klantkaart, tab "Planning"): meteen die klant openen, geen picker.
  useEffect(() => {
    if (vasteKlant && vasteKlant.accountId) kiesKlant(vasteKlant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vasteKlant && vasteKlant.accountId]);

  // Voorselecteren wanneer we vanuit de Jaarplanning binnenkomen met een klant ("instellen"-doorklik):
  // zodra de klantenlijst geladen is, de klant met dat account-id automatisch openen.
  useEffect(() => {
    if (vasteKlant || !initieelAccountId || !klantenLijst.length) return;
    const doel = String(initieelAccountId).toLowerCase();
    if (klant && String(klant.accountId).toLowerCase() === doel) return;
    const gevonden = klantenLijst.find((k) => String(k.accountId).toLowerCase() === doel);
    if (gevonden) kiesKlant(gevonden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initieelAccountId, klantenLijst]);

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
        body: JSON.stringify({ klantAccountId: String(klant.accountId).toLowerCase(), activiteit: nwActiviteit, frequentie: nwFrequentie, indicatieUren: nwUren === "" ? null : nwUren, uitvoerMaand: heeftUitvoerMaand(nwFrequentie) && nwUitvoerMaand ? Number(nwUitvoerMaand) : null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setNwActiviteit(""); setNwUren(""); setNwFrequentie("maandelijks"); setNwUitvoerMaand("");
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

  // Een setje van hoofdtaken toepassen op de gekozen klant: elke activiteit die er nog niet is, wordt
  // toegevoegd; bestaande worden overgeslagen.
  const pasSetjeToe = async () => {
    const setje = setjes.find((s) => s.sleutel === setjeKeuze);
    if (!setje || !klant) return;
    setSetjeBezig(true); setFout(""); setSetjeMelding("");
    const acc = String(klant.accountId).toLowerCase();
    const bestaand = new Set((config || []).map((r) => r.activiteit));
    let toegevoegd = 0, overgeslagen = 0;
    try {
      for (const it of (setje.items || [])) {
        if (bestaand.has(it.activiteit)) { overgeslagen++; continue; }
        const res = await fetch("/api/mw-planning-config", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ klantAccountId: acc, activiteit: it.activiteit, frequentie: it.frequentie || "maandelijks", indicatieUren: it.indicatieUren ?? null, uitvoerMaand: it.uitvoerMaand ?? null }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        toegevoegd++; bestaand.add(it.activiteit);
      }
      setSetjeMelding(`Setje "${setje.naam}" toegepast: ${toegevoegd} toegevoegd${overgeslagen ? `, ${overgeslagen} al aanwezig (overgeslagen)` : ""}.`);
      setSetjeKeuze("");
      laadConfig(acc);
    } catch (e) { setFout(e.message || "Setje toepassen mislukt."); if (toegevoegd) laadConfig(acc); }
    finally { setSetjeBezig(false); }
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
        Stel per klant in wat we doen: welke activiteiten, met welke frequentie en indicatie-uren. Laat je
        de uren leeg, dan geldt de <strong>standaard-uren</strong> van de activiteit (Beheer → Planning). De
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
            {!vasteKlant && (
              <button onClick={() => { setKlant(null); setConfig(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <X size={14} /> Andere klant
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {["assistent", "manager", "accountant", "fiscaal", "loonadministratie", "backup"].map((rol) => {
              const naam = teamPersoon(klant, rol);
              if (!naam) return null;
              return <span key={rol} style={{ fontSize: 11.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, padding: "4px 9px", borderRadius: 6 }}><strong style={{ color: KLEUR.blauw }}>{ROL_LABELS[rol]}:</strong> {naam}</span>;
            })}
          </div>

          {/* Setje toepassen */}
          {!readOnly && setjes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.blauw }}>Setje toepassen</span>
              <select value={setjeKeuze} onChange={(e) => { setSetjeKeuze(e.target.value); setSetjeMelding(""); }} style={{ ...inputStijl, width: "auto", minWidth: 200 }}>
                <option value="">— kies een setje —</option>
                {setjes.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.naam} ({(s.items || []).length})</option>)}
              </select>
              <button onClick={pasSetjeToe} disabled={!setjeKeuze || setjeBezig || config === null} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: setjeKeuze && !setjeBezig ? KLEUR.blauw : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: setjeKeuze && !setjeBezig ? "pointer" : "default" }}>
                <Plus size={14} /> {setjeBezig ? "Toepassen…" : "Toepassen"}
              </button>
              <span style={{ fontSize: 11.5, color: KLEUR.subtekst }}>Voegt de hoofdtaken toe; wat er al staat blijft.</span>
              {setjeMelding && <span style={{ fontSize: 12, color: KLEUR.groen, fontWeight: 600 }}>{setjeMelding}</span>}
            </div>
          )}

          {/* Configuratietabel */}
          {config === null ? (
            <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "20px 0" }}>Configuratie laden…</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr>
                  <th style={th}>Activiteit</th><th style={th}>Type</th><th style={th}>Frequentie</th><th style={th}>Uitvoermaand</th>
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
                          {readOnly ? <span>{freqLabel(r.frequentie)}</span> : (
                            <select value={r.frequentie} onChange={(e) => wijzig(r.id, { frequentie: e.target.value })} style={{ ...inputStijl, width: "auto", padding: "5px 8px" }}>
                              {FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={td}>
                          {!heeftUitvoerMaand(r.frequentie) ? <span style={{ color: KLEUR.mutedTekst }}>n.v.t.</span>
                            : readOnly ? <span>{r.uitvoerMaand ? MAANDEN[r.uitvoerMaand - 1] : "—"}</span> : (
                            <select value={r.uitvoerMaand || ""} onChange={(e) => wijzig(r.id, { uitvoerMaand: e.target.value ? Number(e.target.value) : null })} style={{ ...inputStijl, width: "auto", padding: "5px 8px" }}>
                              <option value="">— kies —</option>
                              {MAANDEN.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={td}>
                          {readOnly ? <span>{r.indicatieUren != null ? urenTekst(r.indicatieUren) : (info.act?.standaardUren != null ? `${urenTekst(info.act.standaardUren)} (std)` : "—")}</span> : (
                            <input type="number" min="0" step="0.25" defaultValue={r.indicatieUren == null ? "" : r.indicatieUren}
                              onBlur={(e) => { const v = e.target.value; if (String(v) !== String(r.indicatieUren ?? "")) wijzig(r.id, { indicatieUren: v === "" ? null : v }); }}
                              placeholder={info.act?.standaardUren != null ? String(info.act.standaardUren) : "uren"}
                              title={info.act?.standaardUren != null ? `Leeg = de standaard-uren van deze activiteit (${info.act.standaardUren} u)` : "Indicatie-uren"}
                              style={{ ...inputStijl, width: 90, padding: "5px 8px" }} />
                          )}
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
                          {!readOnly && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                              <div style={{ width: 220 }}>
                                <MedewerkerKiezer
                                  waarde={overrides[r.id] !== undefined ? overrides[r.id] : (r.toegewezenAan || "")}
                                  onChange={(v) => setOverrides((o) => ({ ...o, [r.id]: v }))}
                                  onCommit={(v) => { const t = (v || "").trim(); if (t !== (r.toegewezenAan || "")) wijzig(r.id, { toegewezenAan: t }); setOverrides((o) => { const n = { ...o }; delete n[r.id]; return n; }); }}
                                  placeholder={`Afwijken van team (${ROL_LABELS[info.rol] || "rol"})…`}
                                  klein
                                />
                              </div>
                              {r.toegewezenAan && <button onClick={() => { wijzig(r.id, { toegewezenAan: "" }); setOverrides((o) => { const n = { ...o }; delete n[r.id]; return n; }); }} title="Terug naar team" style={{ background: "none", border: "none", color: KLEUR.blauw, fontSize: 11.5, cursor: "pointer", flexShrink: 0 }}>← team</button>}
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {!readOnly && <button onClick={() => verwijder(r.id)} title="Verwijderen" style={{ background: "none", border: "none", color: KLEUR.rood, cursor: "pointer" }}><Trash2 size={15} /></button>}
                        </td>
                      </tr>
                    );
                  })}
                  {config.length === 0 && <tr><td colSpan={7} style={{ ...td, color: KLEUR.mutedTekst, textAlign: "center", padding: "20px" }}>Nog niets ingesteld voor deze klant.{readOnly ? "" : " Voeg hieronder een activiteit toe."}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Nieuwe regel — alleen in bewerk-stand */}
          {!readOnly && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={nwActiviteit} onChange={(e) => setNwActiviteit(e.target.value)} style={{ ...inputStijl, width: "auto", minWidth: 220 }}>
              <option value="">— kies activiteit —</option>
              <optgroup label="Maandactiviteiten">{activiteiten.filter((a) => a.type === "maand").map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}</optgroup>
              <optgroup label="Jaaractiviteiten">{activiteiten.filter((a) => a.type === "jaar").map((a) => <option key={a.sleutel} value={a.sleutel}>{a.label}</option>)}</optgroup>
            </select>
            <select value={nwFrequentie} onChange={(e) => setNwFrequentie(e.target.value)} style={{ ...inputStijl, width: "auto" }}>
              {FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {heeftUitvoerMaand(nwFrequentie) && (
              <select value={nwUitvoerMaand} onChange={(e) => setNwUitvoerMaand(e.target.value)} title="In welke maand valt deze jaartaak?" style={{ ...inputStijl, width: "auto" }}>
                <option value="">Uitvoermaand…</option>
                {MAANDEN.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
              </select>
            )}
            <input type="number" min="0" step="0.25" value={nwUren} onChange={(e) => setNwUren(e.target.value)} placeholder={activiteitById[nwActiviteit]?.standaardUren != null ? `${activiteitById[nwActiviteit].standaardUren} (standaard)` : "uren (bv. 2)"} title="Leeg = de standaard-uren van de activiteit" style={{ ...inputStijl, width: 150 }} />
            <button onClick={voegToe} disabled={!nwActiviteit || bezig} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nwActiviteit ? "pointer" : "default", opacity: nwActiviteit ? 1 : 0.6 }}>
              <Plus size={14} /> Toevoegen
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
