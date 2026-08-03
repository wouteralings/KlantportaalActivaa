import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown, Clock, FileText, Lock, Search, Plus, Trash2, Download, Eye,
  Paperclip, Pencil,
} from "lucide-react";

/** Zelfde palet/kaartstijl als de Facturatie-tab (bewust hier herhaald, zie FacturatieModule.jsx —
 *  deze module volgt bewust dezelfde lay-out: zoekveld + Actief/Niet-actief-secties met
 *  inklapbare rijen per klantaccount, i.p.v. de eenvoudiger pil-kiezer van bijv. Bezittingen). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259",
  mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
  amber: "#A9660C", amberAchtergrond: "#FFF4E5",
};
const kaartStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 16, background: "#fff" };
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };
const labelStijl = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".02em" };
const sectieKopStijl = { fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "0 0 8px" };

// Moet in sync blijven met GELDIGE_TYPES / GELDIGE_FREQUENTIES in api/_gedeeld/contractenKlanten.js
// (bewust een JS-array daar i.p.v. een DB-constraint, zie de toelichting in dat bestand).
const TYPES = [
  { waarde: "verzekering", label: "Verzekering" },
  { waarde: "telefonie", label: "Telefonie" },
  { waarde: "internet", label: "Internet" },
  { waarde: "software", label: "Software" },
  { waarde: "lease", label: "Lease" },
  { waarde: "overig", label: "Overig" },
];
const FREQUENTIES = [
  { waarde: "", label: "— geen —" },
  { waarde: "maandelijks", label: "Maandelijks" },
  { waarde: "kwartaal", label: "Per kwartaal" },
  { waarde: "jaarlijks", label: "Jaarlijks" },
  { waarde: "eenmalig", label: "Eenmalig" },
];

function typeLabel(waarde) {
  return TYPES.find((t) => t.waarde === waarde)?.label || waarde || "—";
}
function geld(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
function datumInputWaarde(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}
function grootteTekst(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
/** Aantal dagen tot de einddatum (negatief = al verlopen), of null zonder einddatum. */
function dagenTot(einddatum) {
  if (!einddatum) return null;
  const eind = new Date(einddatum);
  if (isNaN(eind.getTime())) return null;
  eind.setHours(0, 0, 0, 0);
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((eind.getTime() - vandaag.getTime()) / 86400000);
}
function verloopBadge(einddatum) {
  const dagen = dagenTot(einddatum);
  if (dagen == null) return { tekst: "Geen einddatum", kleur: KLEUR.mutedTekst, achtergrond: "#F2F3F0" };
  if (dagen < 0) return { tekst: "Verlopen", kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 30) return { tekst: `Verloopt over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`, kleur: KLEUR.rood, achtergrond: `${KLEUR.rood}14` };
  if (dagen <= 90) return { tekst: `Verloopt over ${dagen} dagen`, kleur: KLEUR.amber, achtergrond: KLEUR.amberAchtergrond };
  return { tekst: `Verloopt over ${dagen} dagen`, kleur: KLEUR.groen, achtergrond: "#EAF6EE" };
}
async function haalJson(res) {
  if (!res.ok) {
    let bericht = `HTTP ${res.status}`;
    try { const d = await res.json(); if (d && d.error) bericht = d.error; } catch { /* geen JSON-body */ }
    const fout = new Error(bericht);
    fout.status = res.status;
    throw fout;
  }
  return res.json();
}
function leesAlsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Knop({ children, onClick, variant = "secundair", disabled, type = "button", title }) {
  const varianten = {
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    secundair: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
    gevaar: { background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}55` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
      fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
      whiteSpace: "nowrap", ...varianten[variant],
    }}>
      {children}
    </button>
  );
}
function Melding({ tekst }) {
  if (!tekst) return null;
  return (
    <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
      {tekst}
    </div>
  );
}
function LegeStaat({ tekst }) {
  return <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>{tekst}</div>;
}
function AlleenLezenBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16,
      background: "#FFF4E5", border: "1px solid #E8C27A", borderRadius: 10, fontSize: 12.5, color: "#8A5A00",
    }}>
      <Eye size={14} style={{ flexShrink: 0 }} />
      Alleen-lezen weergave — contracten en documenten kunnen hier niet aangemaakt, gewijzigd of geüpload/verwijderd worden.
    </div>
  );
}

/** Aanvraagkaart — zelfde opzet/stijl als FunctiesOverzicht/UrenNietActief in FacturatieModule.jsx. */
function ContractenNietActief({ account, prijs }) {
  const [status, setStatus] = useState(account.contractenAangevraagdOp ? "aangevraagd" : "idle");

  const vraagAan = async () => {
    setStatus("bezig");
    try {
      await haalJson(await fetch("/api/contracten-aanvraag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId }),
      }));
      setStatus("aangevraagd");
    } catch { setStatus("fout"); }
  };

  return (
    <div style={{ ...kaartStijl, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Lock size={15} color={KLEUR.mutedTekst} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>Contracten nog niet actief voor dit klantaccount</div>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, margin: "6px 0 16px", maxWidth: 560 }}>
        Registreer je eigen doorlopende contracten (verzekeringen, telefonie en overig) en ontvang op tijd een
        herinnering voordat een contract afloopt. Deze functie kost <strong>{geld(prijs)} per maand</strong> per
        administratie.
      </div>
      {status === "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} />
          Aangevraagd{account.contractenAangevraagdOp ? ` op ${datum(account.contractenAangevraagdOp)}` : ""} — we nemen contact met je op.
        </div>
      ) : (
        <Knop variant="primair" onClick={vraagAan} disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Vraag Contracten aan"}
        </Knop>
      )}
      {status === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="Aanvragen is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

/** Bewerk-/aanmaakformulier voor één contract. */
function ContractFormulier({ bestaand, onOpslaan, onAnnuleren, bezig, fout }) {
  const [waarden, setWaarden] = useState(() => ({
    type: bestaand?.type || "verzekering",
    naam: bestaand?.naam || "",
    leverancier: bestaand?.leverancier || "",
    contractnummer: bestaand?.contractnummer || "",
    ingangsdatum: datumInputWaarde(bestaand?.ingangsdatum),
    einddatum: datumInputWaarde(bestaand?.einddatum),
    opzegtermijnDagen: bestaand?.opzegtermijnDagen != null ? String(bestaand.opzegtermijnDagen) : "",
    automatischeVerlenging: bestaand ? !!bestaand.automatischeVerlenging : true,
    frequentie: bestaand?.frequentie || "",
    bedrag: bestaand?.bedrag != null ? String(bestaand.bedrag) : "",
    opmerkingen: bestaand?.opmerkingen || "",
  }));

  const zet = (veld) => (e) => {
    const waarde = e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setWaarden((w) => ({ ...w, [veld]: waarde }));
  };

  const versturen = (e) => {
    e.preventDefault();
    onOpslaan({
      type: waarden.type,
      naam: waarden.naam.trim(),
      leverancier: waarden.leverancier.trim(),
      contractnummer: waarden.contractnummer.trim(),
      ingangsdatum: waarden.ingangsdatum || null,
      einddatum: waarden.einddatum || null,
      opzegtermijnDagen: waarden.opzegtermijnDagen === "" ? null : Number(waarden.opzegtermijnDagen),
      automatischeVerlenging: waarden.automatischeVerlenging,
      frequentie: waarden.frequentie || null,
      bedrag: waarden.bedrag === "" ? null : Number(waarden.bedrag),
      opmerkingen: waarden.opmerkingen.trim(),
    });
  };

  return (
    <form onSubmit={versturen} style={{ ...kaartStijl, background: KLEUR.lichtblauw, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}>
        {bestaand ? "Contract bewerken" : "Nieuw contract"}
      </div>
      <Melding tekst={fout} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStijl}>Type *</label>
          <select value={waarden.type} onChange={zet("type")} style={inputStijl} required>
            {TYPES.map((t) => <option key={t.waarde} value={t.waarde}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStijl}>Naam *</label>
          <input value={waarden.naam} onChange={zet("naam")} style={inputStijl} required placeholder="Bijv. Autoverzekering" />
        </div>
        <div>
          <label style={labelStijl}>Leverancier</label>
          <input value={waarden.leverancier} onChange={zet("leverancier")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Contractnummer</label>
          <input value={waarden.contractnummer} onChange={zet("contractnummer")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Ingangsdatum</label>
          <input type="date" value={waarden.ingangsdatum} onChange={zet("ingangsdatum")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Einddatum</label>
          <input type="date" value={waarden.einddatum} onChange={zet("einddatum")} style={inputStijl} />
        </div>
        <div>
          <label style={labelStijl}>Opzegtermijn (dagen)</label>
          <input type="number" min="0" value={waarden.opzegtermijnDagen} onChange={zet("opzegtermijnDagen")} style={inputStijl} placeholder="Bijv. 30" />
        </div>
        <div>
          <label style={labelStijl}>Frequentie</label>
          <select value={waarden.frequentie} onChange={zet("frequentie")} style={inputStijl}>
            {FREQUENTIES.map((f) => <option key={f.waarde} value={f.waarde}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStijl}>Bedrag</label>
          <input type="number" min="0" step="0.01" value={waarden.bedrag} onChange={zet("bedrag")} style={inputStijl} placeholder="0,00" />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: KLEUR.tekst, cursor: "pointer" }}>
            <input type="checkbox" checked={waarden.automatischeVerlenging} onChange={zet("automatischeVerlenging")} />
            Verlengt automatisch
          </label>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStijl}>Opmerkingen</label>
        <textarea value={waarden.opmerkingen} onChange={zet("opmerkingen")} rows={2} style={{ ...inputStijl, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Knop variant="primair" type="submit" disabled={bezig}>{bezig ? "Bezig…" : "Opslaan"}</Knop>
        <Knop variant="secundair" type="button" onClick={onAnnuleren} disabled={bezig}>Annuleren</Knop>
      </div>
    </form>
  );
}

/** Documenten (bijlagen) bij één contract — Stap 4-endpoints, hier voor het eerst vanuit de UI gebruikt. */
function ContractDocumenten({ accountId, contractId, alleenLezen }) {
  const [documenten, setDocumenten] = useState(null);
  const [fout, setFout] = useState("");
  const [uploadBezig, setUploadBezig] = useState(false);

  const laad = useCallback(() => {
    fetch(`/api/contracten-documenten?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}`)
      .then(haalJson)
      .then((d) => setDocumenten(d.documenten || []))
      .catch(() => setFout("Documenten konden niet worden opgehaald."));
  }, [accountId, contractId]);

  useEffect(() => { laad(); }, [laad]);

  const upload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setFout("");
    setUploadBezig(true);
    try {
      const dataUrl = await leesAlsDataUrl(file);
      await haalJson(await fetch("/api/contracten-documenten", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, contractId, bestandsnaam: file.name, dataUrl }),
      }));
      laad();
    } catch (err) {
      setFout(err.message || "Uploaden is niet gelukt.");
    } finally {
      setUploadBezig(false);
    }
  };

  const verwijder = async (doc) => {
    if (!window.confirm(`"${doc.bestandsnaam}" verwijderen?`)) return;
    setFout("");
    try {
      await haalJson(await fetch(`/api/contracten-documenten?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}&id=${encodeURIComponent(doc.id)}`, { method: "DELETE" }));
      laad();
    } catch (err) {
      setFout(err.message || "Verwijderen is niet gelukt.");
    }
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${KLEUR.rand}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, display: "flex", alignItems: "center", gap: 6 }}>
          <Paperclip size={13} /> Documenten {documenten ? `(${documenten.length})` : ""}
        </div>
        {!alleenLezen && (
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 7,
            fontSize: 12, fontWeight: 600, cursor: uploadBezig ? "default" : "pointer", opacity: uploadBezig ? 0.6 : 1,
            background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`,
          }}>
            {uploadBezig ? "Bezig…" : "Bestand toevoegen"}
            <input type="file" onChange={upload} disabled={uploadBezig} style={{ display: "none" }} />
          </label>
        )}
      </div>
      <Melding tekst={fout} />
      {documenten === null && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Laden…</div>}
      {documenten && documenten.length === 0 && <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen documenten.</div>}
      {documenten && documenten.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {documenten.map((doc) => (
            <div key={doc.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
              border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff",
            }}>
              <FileText size={14} color={KLEUR.mutedTekst} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.bestandsnaam}</div>
                <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{grootteTekst(doc.grootte)} · {datum(doc.geuploadOp)}</div>
              </div>
              <a
                href={`/api/contracten-documenten?accountId=${encodeURIComponent(accountId)}&contractId=${encodeURIComponent(contractId)}&id=${encodeURIComponent(doc.id)}`}
                target="_blank" rel="noopener noreferrer" title="Downloaden"
                style={{ color: KLEUR.blauw, display: "flex", alignItems: "center" }}
              >
                <Download size={15} />
              </a>
              {!alleenLezen && (
                <button onClick={() => verwijder(doc)} title="Verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex", alignItems: "center" }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** De echte contracteninhoud voor één klantaccount: lijst + aanmaken/bewerken + documenten. */
function ContractenInhoud({ accountId, alleenLezen }) {
  const [contracten, setContracten] = useState(null);
  const [fout, setFout] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [opslaanFout, setOpslaanFout] = useState("");

  const laad = useCallback(() => {
    fetch(`/api/contracten-klanten?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => setContracten(d.contracten || []))
      .catch(() => setFout("Contracten konden niet worden opgehaald."));
  }, [accountId]);

  useEffect(() => { laad(); }, [laad]);

  const opslaan = async (payload) => {
    setOpslaanBezig(true);
    setOpslaanFout("");
    try {
      if (bewerkId) {
        await haalJson(await fetch("/api/contracten-klanten", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, id: bewerkId, ...payload }),
        }));
      } else {
        await haalJson(await fetch("/api/contracten-klanten", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, ...payload }),
        }));
      }
      setNieuwOpen(false);
      setBewerkId(null);
      laad();
    } catch (err) {
      setOpslaanFout(err.message || "Opslaan is niet gelukt.");
    } finally {
      setOpslaanBezig(false);
    }
  };

  if (contracten === null) return <LegeStaat tekst="Contracten laden…" />;

  const bewerkContract = bewerkId ? contracten.find((c) => c.id === bewerkId) : null;

  return (
    <div>
      {alleenLezen && <AlleenLezenBanner />}
      <Melding tekst={fout} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst }}>{contracten.length} {contracten.length === 1 ? "contract" : "contracten"}</div>
        {!alleenLezen && !nieuwOpen && !bewerkId && (
          <Knop variant="primair" onClick={() => setNieuwOpen(true)}><Plus size={14} /> Nieuw contract</Knop>
        )}
      </div>

      {nieuwOpen && (
        <ContractFormulier
          bezig={opslaanBezig}
          fout={opslaanFout}
          onAnnuleren={() => { setNieuwOpen(false); setOpslaanFout(""); }}
          onOpslaan={opslaan}
        />
      )}
      {bewerkContract && (
        <ContractFormulier
          bestaand={bewerkContract}
          bezig={opslaanBezig}
          fout={opslaanFout}
          onAnnuleren={() => { setBewerkId(null); setOpslaanFout(""); }}
          onOpslaan={opslaan}
        />
      )}

      {contracten.length === 0 && !nieuwOpen && (
        <LegeStaat tekst={alleenLezen ? "Nog geen contracten geregistreerd." : "Nog geen contracten geregistreerd. Klik op \"Nieuw contract\" om te beginnen."} />
      )}

      {contracten.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          {contracten.map((c, i) => {
            const open = openId === c.id;
            const badge = verloopBadge(c.einddatum);
            return (
              <div key={c.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
                <button
                  onClick={() => setOpenId(open ? null : c.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", background: open ? KLEUR.lichtblauw : "#fff",
                    border: "none", cursor: "pointer", textAlign: "left", color: KLEUR.tekst,
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw,
                    padding: "3px 8px", borderRadius: 5, flexShrink: 0,
                  }}>
                    {typeLabel(c.type)}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.naam}{c.leverancier ? ` — ${c.leverancier}` : ""}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: badge.kleur, background: badge.achtergrond,
                    padding: "3px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap",
                  }}>
                    {badge.tekst}
                  </span>
                  <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }} />
                </button>
                {open && (
                  <div style={{ padding: "16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12.5, marginBottom: 4 }}>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Contractnummer:</span> {c.contractnummer || "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Ingangsdatum:</span> {datum(c.ingangsdatum)}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Einddatum:</span> {datum(c.einddatum)}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Opzegtermijn:</span> {c.opzegtermijnDagen != null ? `${c.opzegtermijnDagen} dagen` : "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Frequentie:</span> {FREQUENTIES.find((f) => f.waarde === c.frequentie)?.label || "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Bedrag:</span> {c.bedrag != null ? geld(c.bedrag) : "—"}</div>
                      <div><span style={{ color: KLEUR.mutedTekst }}>Automatische verlenging:</span> {c.automatischeVerlenging ? "Ja" : "Nee"}</div>
                    </div>
                    {c.opmerkingen && (
                      <div style={{ fontSize: 12.5, marginTop: 8, whiteSpace: "pre-wrap" }}>
                        <span style={{ color: KLEUR.mutedTekst }}>Opmerkingen:</span> {c.opmerkingen}
                      </div>
                    )}
                    {!alleenLezen && (
                      <div style={{ marginTop: 12 }}>
                        <Knop variant="secundair" onClick={() => { setBewerkId(c.id); setNieuwOpen(false); setOpslaanFout(""); }}>
                          <Pencil size={13} /> Bewerken
                        </Knop>
                      </div>
                    )}
                    <ContractDocumenten accountId={accountId} contractId={c.id} alleenLezen={alleenLezen} />
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

/** Korte intro boven de sectie "Niet actief" bij meerdere klantaccounts — zelfde patroon als
 *  FacturatiemoduleUitlegBanner in FacturatieModule.jsx. */
function ContractenUitlegBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", marginBottom: 10,
      background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 10,
    }}>
      <Lock size={15} color={KLEUR.mutedTekst} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
        <strong style={{ color: KLEUR.tekst }}>Contracten is beschikbaar voor deze administraties.</strong>{" "}
        Klap een administratie open om de module aan te vragen.
      </div>
    </div>
  );
}

/** Module-root: per gekoppeld klantaccount de contractenlijst (of nog een aanvraagkaart) — zelfde
 *  zoekveld + Actief/Niet-actief-indeling met inklapbare rijen als de Facturatie-tab
 *  (FacturatieModule.jsx), i.p.v. de eenvoudigere pil-kiezer van bijv. Bezittingen. */
export default function ContractenModule({ accounts, prijs = 2.5, alleenLezen = false }) {
  const [openAccountId, setOpenAccountId] = useState(accounts.length === 1 ? accounts[0]?.accountId : null);
  const [zoek, setZoek] = useState("");

  if (accounts.length === 0) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  // Eén klantaccount: geen lijst/sectie-indeling nodig — direct de volle module of de
  // aanvraagkaart tonen, zelfde regel als FacturatieModule.
  if (accounts.length === 1) {
    const acc = accounts[0];
    return acc.contractenIngeschakeld
      ? <ContractenInhoud accountId={acc.accountId} alleenLezen={alleenLezen} />
      : <ContractenNietActief account={acc} prijs={prijs} />;
  }

  const term = zoek.trim().toLowerCase();
  const lijst = accounts.filter((a) =>
    !term || [a.klantnaam, String(a.klantnummer ?? "")].filter(Boolean).some((v) => v.toLowerCase().includes(term))
  );

  const renderAccountRij = (acc, i) => {
    const open = openAccountId === acc.accountId;
    return (
      <div key={acc.accountId} style={{ borderTop: i === 0 ? "none" : `1px solid ${KLEUR.rand}` }}>
        <button
          onClick={() => setOpenAccountId(open ? null : acc.accountId)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", background: open ? KLEUR.lichtblauw : "#fff",
            border: "none", cursor: "pointer", textAlign: "left", color: KLEUR.tekst,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: KLEUR.blauw, minWidth: 52, flexShrink: 0 }}>
            {acc.klantnummer || "—"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {acc.klantnaam}
          </span>
          <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        {open && (
          <div style={{ padding: "16px" }}>
            {acc.contractenIngeschakeld
              ? <ContractenInhoud accountId={acc.accountId} alleenLezen={alleenLezen} />
              : <ContractenNietActief account={acc} prijs={prijs} />}
          </div>
        )}
      </div>
    );
  };

  const actieveAccounts = lijst.filter((a) => a.contractenIngeschakeld);
  const nietActieveAccounts = lijst.filter((a) => !a.contractenIngeschakeld);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        <FileText size={17} color={KLEUR.blauw} /> Contracten
      </div>

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 360 }}>
        <Search size={16} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek op klantnummer of naam…"
          style={{ ...inputStijl, padding: "10px 12px 10px 36px" }}
        />
      </div>

      {lijst.length === 0 && (
        <div style={{ padding: "18px 16px", fontSize: 13, color: KLEUR.mutedTekst }}>Geen klanten gevonden voor "{zoek}".</div>
      )}

      {actieveAccounts.length > 0 && (
        <div style={{ marginBottom: nietActieveAccounts.length > 0 ? 24 : 0 }}>
          <div style={sectieKopStijl}>Actief ({actieveAccounts.length})</div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            {actieveAccounts.map(renderAccountRij)}
          </div>
        </div>
      )}

      {nietActieveAccounts.length > 0 && (
        <div>
          <div style={sectieKopStijl}>Niet actief ({nietActieveAccounts.length})</div>
          <ContractenUitlegBanner />
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            {nietActieveAccounts.map(renderAccountRij)}
          </div>
        </div>
      )}
    </div>
  );
}
