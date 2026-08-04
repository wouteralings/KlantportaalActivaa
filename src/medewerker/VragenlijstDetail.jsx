import { useState } from "react";
import { MessageCircle, Send, FileText, CheckCircle2, Circle, CheckCheck, RotateCcw, Trash2, Plus, Pencil } from "lucide-react";

/** Zelfde palet als de rest van het medewerkersportaal (bewust hier herhaald zodat dit bestand op
 *  zichzelf staat, zie bijv. Vragenlijsten.jsx). */
const KLEUR = {
  blauw: "#1C5D8C",
  goud: "#B98237",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D46",
};

function tijd(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * De volledige inhoud van één vragenlijst (aanlever-verzoek): naam/jaar/deadline aanpassen,
 * documenten aftekenen/heropenen/bewerken, en vragen van de klant beantwoorden — exact dezelfde
 * functionaliteit als de uitklapbare rij in Vragenlijsten.jsx (het medewerkers-werkoverzicht), maar
 * hier herbruikbaar als losstaand kaartje zodat 'm ook rechtstreeks in een fiscaal dossier getoond
 * kan worden (zie DossierDetail in MedewerkerPortaal.jsx — "Gekoppelde uitvraaglijst"). Bewust een
 * eigen kopie i.p.v. een gedeeld component uit Vragenlijsten.jsx zelf trekken: zelfde reden als de
 * KLEUR-duplicatie hierboven (dit bestand moet op zichzelf kunnen staan), en het vermijdt het risico
 * op regressie in het al werkende Vragenlijsten-scherm door daar geen refactor op los te laten.
 *
 * Props:
 *  - verzoek: het volledige, verrijkte object (zie verrijkVerzoek() in
 *    api/_gedeeld/aanleververzoeken.js) — dezelfde vorm als een rij in Vragenlijsten.jsx.
 *  - onGewijzigd(bijgewerktVerzoek): aangeroepen na elke succesvolle actie.
 *  - onVerwijderd(): aangeroepen nadat de hele vragenlijst verwijderd is.
 */
export default function VragenlijstDetail({ verzoek: r, onGewijzigd, onVerwijderd }) {
  const [antwoord, setAntwoord] = useState("");
  const [bezigAntwoord, setBezigAntwoord] = useState(false);
  const [bezigAccepteren, setBezigAccepteren] = useState(false);
  const [bezigVerwijderen, setBezigVerwijderen] = useState(false);
  const [bezigHeropenen, setBezigHeropenen] = useState(""); // regelId
  const [deadlineDraft, setDeadlineDraft] = useState(null); // null = ongewijzigd
  const [bezigDeadline, setBezigDeadline] = useState(false);
  const [titelDraft, setTitelDraft] = useState(null);
  const [jaarDraft, setJaarDraft] = useState(null);
  const [bezigTitel, setBezigTitel] = useState(false);
  const [nieuweVraag, setNieuweVraag] = useState({ tonen: false, naam: "", toelichting: "", verplicht: true });
  const [bezigVraagToevoegen, setBezigVraagToevoegen] = useState(false);
  const [bewerkRegelId, setBewerkRegelId] = useState("");
  const [regelDraft, setRegelDraft] = useState({ naam: "", toelichting: "", verplicht: true });
  const [bezigRegelWijzigen, setBezigRegelWijzigen] = useState(false);
  const [fout, setFout] = useState("");

  const beantwoorden = async () => {
    const tekst = antwoord.trim();
    if (!tekst) return;
    setBezigAntwoord(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "antwoord", verzoekId: r.id, tekst }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onGewijzigd(d.verzoek);
      setAntwoord("");
    } catch { setFout("Antwoord versturen mislukt."); }
    finally { setBezigAntwoord(false); }
  };

  const accepteren = async () => {
    setBezigAccepteren(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "accepteren", verzoekId: r.id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onGewijzigd(d.verzoek);
    } catch (e) { setFout("Accepteren mislukt: " + (e.message || e)); }
    finally { setBezigAccepteren(false); }
  };

  const heropenen = async (d) => {
    if (!window.confirm(`"${d.naam}" heropenen? De klant moet dit document dan opnieuw aanleveren.`)) return;
    setBezigHeropenen(d.id); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "heropenen", verzoekId: r.id, regelId: d.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onGewijzigd(data.verzoek);
    } catch (e) { setFout("Heropenen mislukt: " + (e.message || e)); }
    finally { setBezigHeropenen(""); }
  };

  const verwijderen = async () => {
    if (!window.confirm(`Vragenlijst "${r.lijstNaam}" van ${r.klantnaam || r.accountId} helemaal verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setBezigVerwijderen(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-aanleververzoeken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "verwijderen", id: r.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) throw new Error(d.error || `HTTP ${res.status}`);
      onVerwijderd();
    } catch (e) { setFout("Verwijderen mislukt: " + (e.message || e)); }
    finally { setBezigVerwijderen(false); }
  };

  const wijzigDeadline = async () => {
    const deadline = deadlineDraft != null ? deadlineDraft : (r.deadline || "");
    setBezigDeadline(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "deadline-zetten", verzoekId: r.id, deadline }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onGewijzigd(d.verzoek);
    } catch (e) { setFout("Deadline aanpassen mislukt: " + (e.message || e)); }
    finally { setBezigDeadline(false); }
  };

  const wijzigTitel = async () => {
    const lijstNaam = (titelDraft != null ? titelDraft : (r.lijstNaam || "")).trim();
    const jaar = (jaarDraft != null ? jaarDraft : (r.jaar || "")).trim();
    if (!lijstNaam) return;
    setBezigTitel(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "titel-zetten", verzoekId: r.id, lijstNaam, jaar }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onGewijzigd(d.verzoek);
    } catch (e) { setFout("Naam/jaar aanpassen mislukt: " + (e.message || e)); }
    finally { setBezigTitel(false); }
  };

  const beginRegelBewerken = (d) => {
    setRegelDraft({ naam: d.naam || "", toelichting: d.toelichting || "", verplicht: d.verplicht !== false });
    setBewerkRegelId(d.id);
  };

  const regelWijzigen = async (d) => {
    const naam = (regelDraft.naam || "").trim();
    if (!naam) return;
    setBezigRegelWijzigen(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "regel-bewerken", verzoekId: r.id, regelId: d.id, naam, toelichting: regelDraft.toelichting || "", verplicht: regelDraft.verplicht !== false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onGewijzigd(data.verzoek);
      setBewerkRegelId("");
    } catch (e) { setFout("Vraag aanpassen mislukt: " + (e.message || e)); }
    finally { setBezigRegelWijzigen(false); }
  };

  const toggleVraagForm = () => setNieuweVraag((h) => ({ naam: "", toelichting: "", verplicht: true, ...h, tonen: !h.tonen }));

  const vraagToevoegen = async () => {
    const naam = (nieuweVraag.naam || "").trim();
    if (!naam) return;
    setBezigVraagToevoegen(true); setFout("");
    try {
      const res = await fetch("/api/medewerker-vragenlijsten", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "regel-toevoegen", verzoekId: r.id, naam, toelichting: nieuweVraag.toelichting || "", verplicht: nieuweVraag.verplicht !== false }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onGewijzigd(d.verzoek);
      setNieuweVraag({ tonen: false, naam: "", toelichting: "", verplicht: true });
    } catch (e) { setFout("Vraag toevoegen mislukt: " + (e.message || e)); }
    finally { setBezigVraagToevoegen(false); }
  };

  return (
    <div>
      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 8 }}>{fout}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst }}>Naam</label>
        <input
          value={titelDraft != null ? titelDraft : (r.lijstNaam || "")}
          onChange={(e) => setTitelDraft(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 140, boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "5px 8px", fontSize: 12.5, color: KLEUR.tekst }}
        />
        <label style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst }}>Jaar</label>
        <input
          value={jaarDraft != null ? jaarDraft : (r.jaar || "")}
          onChange={(e) => setJaarDraft(e.target.value)}
          placeholder="bv. 2026"
          style={{ width: 70, boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "5px 8px", fontSize: 12.5, color: KLEUR.tekst }}
        />
        <button
          onClick={wijzigTitel}
          disabled={
            bezigTitel ||
            !(titelDraft != null ? titelDraft : (r.lijstNaam || "")).trim() ||
            ((titelDraft ?? (r.lijstNaam || "")) === (r.lijstNaam || "") && (jaarDraft ?? (r.jaar || "")) === (r.jaar || ""))
          }
          style={{ padding: "5px 10px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}
        >
          {bezigTitel ? "Opslaan…" : "Opslaan"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst }}>Einddatum</label>
          <input
            type="date"
            value={deadlineDraft != null ? deadlineDraft : (r.deadline || "")}
            onChange={(e) => setDeadlineDraft(e.target.value)}
            style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "5px 7px", fontSize: 12, color: KLEUR.tekst }}
          />
          <button
            onClick={wijzigDeadline}
            disabled={bezigDeadline || (deadlineDraft ?? (r.deadline || "")) === (r.deadline || "")}
            style={{ padding: "5px 10px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}
          >
            {bezigDeadline ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {r.wachtOpControle && (
            <button
              onClick={accepteren}
              disabled={bezigAccepteren}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: KLEUR.groen, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: bezigAccepteren ? "default" : "pointer" }}
            >
              <CheckCheck size={14} /> {bezigAccepteren ? "Bezig…" : "Accepteren"}
            </button>
          )}
          <button
            onClick={verwijderen}
            disabled={bezigVerwijderen}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: bezigVerwijderen ? "default" : "pointer" }}
          >
            <Trash2 size={13} /> Verwijderen
          </button>
        </div>
      </div>

      {/* Documenten */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>
          <FileText size={14} /> Documenten ({r.aangeleverd}/{r.aantalDocumenten})
        </div>
        {r.notitie && <div style={{ fontSize: 12, color: KLEUR.subtekst, fontStyle: "italic", marginBottom: 6 }}>{r.notitie}</div>}
        {(r.documenten || []).length === 0 ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen documenten in deze vragenlijst.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {r.documenten.map((d) => {
              const klaar = d.status !== "open";
              const heropenBezig = bezigHeropenen === d.id;
              const bewerken = bewerkRegelId === d.id;
              if (bewerken) {
                return (
                  <div key={d.id} style={{ padding: 10, border: `1px dashed ${KLEUR.rand}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      value={regelDraft.naam}
                      onChange={(e) => setRegelDraft((h) => ({ ...h, naam: e.target.value }))}
                      placeholder="Naam van het document/de vraag…"
                      style={{ boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 9px", fontSize: 12.5, outline: "none" }}
                    />
                    <input
                      value={regelDraft.toelichting}
                      onChange={(e) => setRegelDraft((h) => ({ ...h, toelichting: e.target.value }))}
                      placeholder="Toelichting (optioneel)…"
                      style={{ boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 9px", fontSize: 12.5, outline: "none" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: KLEUR.subtekst }}>
                        <input type="checkbox" checked={regelDraft.verplicht !== false} onChange={(e) => setRegelDraft((h) => ({ ...h, verplicht: e.target.checked }))} />
                        Verplicht
                      </label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setBewerkRegelId("")} style={{ padding: "6px 10px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: KLEUR.subtekst, cursor: "pointer" }}>
                          Annuleren
                        </button>
                        <button
                          onClick={() => regelWijzigen(d)}
                          disabled={bezigRegelWijzigen || !regelDraft.naam.trim()}
                          style={{ padding: "6px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                        >
                          {bezigRegelWijzigen ? "Opslaan…" : "Opslaan"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: "6px 9px", border: `1px solid ${klaar ? "#BFE0C8" : KLEUR.rand}`, borderRadius: 7, background: klaar ? "#F1F8F3" : "#fff" }}>
                  {klaar ? <CheckCircle2 size={15} color={KLEUR.groen} style={{ flexShrink: 0, marginTop: 1 }} /> : <Circle size={15} color={KLEUR.mutedTekst} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div><span style={{ fontWeight: 600 }}>{d.naam}</span>{d.verplicht === false && <span style={{ color: KLEUR.mutedTekst }}> · optioneel</span>}</div>
                    {klaar && d.bestandNaam && <div style={{ fontSize: 11.5, color: KLEUR.groen }}>Aangeleverd: {d.bestandNaam}{d.aangeleverdOp ? ` · ${tijd(d.aangeleverdOp)}` : ""}</div>}
                    {klaar && !d.bestandNaam && <div style={{ fontSize: 11.5, color: KLEUR.goud }}>Afgemeld (via opmerking, geen bestand){d.aangeleverdOp ? ` · ${tijd(d.aangeleverdOp)}` : ""}</div>}
                    {d.opmerking && <div style={{ fontSize: 11.5, color: KLEUR.goud }}>Opmerking klant: {d.opmerking}</div>}
                    {d.toelichting && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{d.toelichting}</div>}
                  </div>
                  <button
                    onClick={() => beginRegelBewerken(d)}
                    title="Naam/toelichting/verplicht van deze vraag aanpassen"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "4px 8px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: KLEUR.subtekst, cursor: "pointer" }}
                  >
                    <Pencil size={11} /> Wijzigen
                  </button>
                  {klaar && (
                    <button
                      onClick={() => heropenen(d)}
                      disabled={heropenBezig}
                      title="Document weer open zetten zodat de klant het opnieuw kan aanleveren"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "4px 8px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: KLEUR.blauw, cursor: heropenBezig ? "default" : "pointer" }}
                    >
                      <RotateCcw size={11} /> {heropenBezig ? "Bezig…" : "Heropenen"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {nieuweVraag.tonen ? (
          <div style={{ marginTop: 8, padding: 10, border: `1px dashed ${KLEUR.rand}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              value={nieuweVraag.naam}
              onChange={(e) => setNieuweVraag((h) => ({ ...h, naam: e.target.value }))}
              placeholder="Naam van het document/de vraag…"
              style={{ boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 9px", fontSize: 12.5, outline: "none" }}
            />
            <input
              value={nieuweVraag.toelichting}
              onChange={(e) => setNieuweVraag((h) => ({ ...h, toelichting: e.target.value }))}
              placeholder="Toelichting (optioneel)…"
              style={{ boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "6px 9px", fontSize: 12.5, outline: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: KLEUR.subtekst }}>
                <input type="checkbox" checked={nieuweVraag.verplicht !== false} onChange={(e) => setNieuweVraag((h) => ({ ...h, verplicht: e.target.checked }))} />
                Verplicht
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={toggleVraagForm} style={{ padding: "6px 10px", background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: KLEUR.subtekst, cursor: "pointer" }}>
                  Annuleren
                </button>
                <button
                  onClick={vraagToevoegen}
                  disabled={bezigVraagToevoegen || !(nieuweVraag.naam || "").trim()}
                  style={{ padding: "6px 12px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                >
                  {bezigVraagToevoegen ? "Toevoegen…" : "Toevoegen"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={toggleVraagForm}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "6px 10px", background: "#fff", border: `1px dashed ${KLEUR.rand}`, borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: KLEUR.blauw, cursor: "pointer" }}
          >
            <Plus size={12} /> Vraag toevoegen
          </button>
        )}
      </div>

      {/* Vragen (chat met de klant) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 6 }}>
        <MessageCircle size={14} /> Vragen
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(r.vragen || []).length === 0 ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen vragen bij deze vragenlijst.</div>
        ) : r.vragen.map((m) => (
          <div key={m.id} style={{ alignSelf: m.rol === "klant" ? "flex-start" : "flex-end", maxWidth: "85%", background: m.rol === "klant" ? "#F4F1EA" : KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: m.rol === "klant" ? KLEUR.goud : KLEUR.blauw, marginBottom: 2 }}>
              {m.rol === "klant" ? (m.auteur || r.contactNaam || "Klant") : (m.rol === "ai" ? "Assistent" : (m.auteur || "Medewerker"))}
              <span style={{ color: KLEUR.mutedTekst, fontWeight: 400 }}>{m.tijd ? ` · ${tijd(m.tijd)}` : ""}</span>
            </div>
            <div style={{ fontSize: 12.5, color: KLEUR.tekst, whiteSpace: "pre-wrap" }}>{m.tekst}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            value={antwoord}
            onChange={(e) => setAntwoord(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") beantwoorden(); }}
            placeholder="Typ je antwoord aan de klant…"
            style={{ flex: 1, boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "8px 10px", fontSize: 12.5, outline: "none" }}
          />
          <button onClick={beantwoorden} disabled={bezigAntwoord || !antwoord.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Send size={13} /> {bezigAntwoord ? "Versturen…" : "Antwoord versturen"}
          </button>
        </div>
      </div>
    </div>
  );
}
