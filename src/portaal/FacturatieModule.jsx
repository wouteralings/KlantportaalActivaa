import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText, FileSpreadsheet, Package, Users, Settings, Plus, Send, Check, X,
  Trash2, Pencil, CreditCard, Image, Bell, Sliders, ArrowLeft,
} from "lucide-react";

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

const kaartStijl = { border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginBottom: 16, background: "#fff" };
const labelStijl = { fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4, marginTop: 10 };
const inputStijl = { width: "100%", padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, fontSize: 13.5, color: KLEUR.tekst, boxSizing: "border-box" };

const STATUS_LABEL = {
  concept: "Concept", verzonden: "Verzonden", geaccepteerd: "Geaccepteerd", afgewezen: "Afgewezen",
  betaald: "Betaald", verlopen: "Verlopen", geannuleerd: "Geannuleerd",
};
const STATUS_KLEUR = {
  concept: KLEUR.mutedTekst, verzonden: KLEUR.blauw, geaccepteerd: KLEUR.groen, betaald: KLEUR.groen,
  afgewezen: KLEUR.rood, verlopen: KLEUR.rood, geannuleerd: KLEUR.mutedTekst,
};

function geld(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}

async function haalJson(res) {
  if (!res.ok) {
    let bericht = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) bericht = data.error;
    } catch { /* geen JSON-body, val terug op statuscode */ }
    const fout = new Error(bericht);
    fout.status = res.status;
    throw fout;
  }
  return res.status === 204 ? null : res.json();
}

function StatusBadge({ status }) {
  const kleur = STATUS_KLEUR[status] || KLEUR.mutedTekst;
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: kleur, background: `${kleur}18` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function Knop({ children, onClick, variant = "secundair", disabled, icon: Icon, style }) {
  const varianten = {
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    groen: { background: KLEUR.groen, color: "#fff", border: "none" },
    rood: { background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}55` },
    secundair: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
        fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap", ...varianten[variant], ...style,
      }}
    >
      {Icon && <Icon size={13} />} {children}
    </button>
  );
}

function Melding({ tekst, type = "fout" }) {
  if (!tekst) return null;
  const kleur = type === "fout" ? KLEUR.rood : KLEUR.blauw;
  return (
    <div style={{ background: `${kleur}12`, border: `1px solid ${kleur}33`, color: kleur, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
      {tekst}
    </div>
  );
}

function LegeStaat({ tekst }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>{tekst}</div>
  );
}

/* ---------------------------------------------------------------------- */
/* Data hooks — telkens gescopet op één klant-account (accountId)          */
/* ---------------------------------------------------------------------- */

function useDocumenten(accountId, documenttype) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/facturen-klanten?accountId=${encodeURIComponent(accountId)}&documenttype=${documenttype}`)
      .then(haalJson)
      .then((d) => { setItems(d.facturen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId, documenttype]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

function useKlanten(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/klanten-klanten?accountId=${encodeURIComponent(accountId)}&alles=1`)
      .then(haalJson)
      .then((d) => { setItems(d.klanten || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

function useArtikelen(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/artikelen-klanten?accountId=${encodeURIComponent(accountId)}&alles=1`)
      .then(haalJson)
      .then((d) => { setItems(d.artikelen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

/** Door Activaa centraal beheerde artikelen (dbo.artikelen_algemeen) — voor elke klant
 * hetzelfde, alleen leesbaar via het portaal (beheer gebeurt in Beheer). */
function useArtikelenAlgemeen(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/artikelen-algemeen?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setItems(d.artikelen || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

/** De op dit moment geldige BTW-tarieven — voor de BTW-keuzelijst bij een eigen artikel. */
function useBtwTarieven(accountId) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/btw-tarieven?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setItems(d.tarieven || []); setStatus("klaar"); })
      .catch(() => setStatus("fout"));
  }, [accountId]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, verversen };
}

/* ---------------------------------------------------------------------- */
/* Facturen & Offertes — gedeelde lijst-/detailweergave                    */
/* ---------------------------------------------------------------------- */

const LEGE_REGEL = () => ({ omschrijving: "", artikelId: "", aantal: 1, prijs: 0, btwPercentage: 21 });
const BETALINGSTERMIJN_OPTIES = [7, 14, 21, 30];

function DocumentFormulier({ accountId, documenttype, klanten, artikelen, bestaand, onKlaar, onOpgeslagen }) {
  const [klantKlantId, setKlantKlantId] = useState(bestaand?.klantKlantId || "");
  const [betalingstermijnDagen, setBetalingstermijnDagen] = useState(bestaand?.betalingstermijnDagen ?? 30);
  const [opmerkingen, setOpmerkingen] = useState(bestaand?.opmerkingen || "");
  const [regels, setRegels] = useState(
    bestaand?.regels?.length ? bestaand.regels.map((r) => ({ ...r, artikelId: r.artikelId || "" })) : [LEGE_REGEL()]
  );
  const [status, setStatus] = useState("invoer"); // invoer | bezig | fout
  const [foutmelding, setFoutmelding] = useState("");

  const zetRegel = (i, veld, waarde) => {
    setRegels((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const nieuw = { ...r, [veld]: waarde };
      if (veld === "artikelId" && waarde) {
        const artikel = artikelen.find((a) => a.id === waarde);
        if (artikel) {
          nieuw.omschrijving = artikel.omschrijving;
          nieuw.prijs = artikel.prijs;
          nieuw.btwPercentage = artikel.btwPercentage;
        }
      }
      return nieuw;
    }));
  };
  const voegRegelToe = () => setRegels((h) => [...h, LEGE_REGEL()]);
  const verwijderRegel = (i) => setRegels((h) => (h.length > 1 ? h.filter((_, idx) => idx !== i) : h));

  const subtotaal = useMemo(
    () => regels.reduce((som, r) => som + (Number(r.aantal) || 0) * (Number(r.prijs) || 0), 0),
    [regels]
  );
  const btwBedrag = useMemo(
    () => regels.reduce((som, r) => som + (Number(r.aantal) || 0) * (Number(r.prijs) || 0) * ((Number(r.btwPercentage) || 0) / 100), 0),
    [regels]
  );

  const opslaan = async () => {
    if (!klantKlantId) { setFoutmelding("Kies een klant."); setStatus("fout"); return; }
    setStatus("bezig");
    setFoutmelding("");
    try {
      const payload = {
        accountId,
        documenttype,
        klantKlantId,
        betalingstermijnDagen: Number(betalingstermijnDagen) || 30,
        opmerkingen,
        regels: regels.map((r) => ({ ...r, artikelId: r.artikelId || null })),
      };
      let res;
      if (bestaand) {
        res = await fetch("/api/facturen-klanten", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: bestaand.id }),
        });
      } else {
        res = await fetch("/api/facturen-klanten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await haalJson(res);
      onOpgeslagen(data);
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  const naam = documenttype === "offerte" ? "offerte" : "factuur";

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{bestaand ? `Concept-${naam} bewerken` : `Nieuwe ${naam}`}</div>
      </div>

      <Melding tekst={foutmelding} />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div>
          <div style={labelStijl}>Klant</div>
          <select value={klantKlantId} onChange={(e) => setKlantKlantId(e.target.value)} style={inputStijl}>
            <option value="">— kies een klant —</option>
            {klanten.filter((k) => k.actief || k.id === klantKlantId).map((k) => (
              <option key={k.id} value={k.id}>{k.naam}</option>
            ))}
          </select>
          {klanten.length === 0 && (
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 4 }}>
              Nog geen klanten. Voeg er eerst één toe via de tab "Klanten".
            </div>
          )}
        </div>
        <div>
          <div style={labelStijl}>Betalingstermijn (dagen)</div>
          <select value={betalingstermijnDagen} onChange={(e) => setBetalingstermijnDagen(Number(e.target.value))} style={inputStijl}>
            {[...new Set([...BETALINGSTERMIJN_OPTIES, Number(betalingstermijnDagen) || 30])]
              .sort((a, b) => a - b)
              .map((d) => <option key={d} value={d}>{d} dagen</option>)}
          </select>
        </div>
      </div>

      <div style={labelStijl}>Regels</div>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 90px 70px 90px 32px", gap: 0, background: KLEUR.lichtblauw, padding: "7px 10px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
          <div>Artikel</div><div>Omschrijving</div><div>Aantal</div><div>Prijs</div><div>BTW%</div><div>Bedrag</div><div />
        </div>
        {regels.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 90px 70px 90px 32px", gap: 6, padding: "8px 10px", borderTop: `1px solid ${KLEUR.rand}`, alignItems: "center" }}>
            <select value={r.artikelId} onChange={(e) => zetRegel(i, "artikelId", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }}>
              <option value="">— vrije tekst —</option>
              {artikelen.filter((a) => a.actief).map((a) => <option key={a.id} value={a.id}>{a.omschrijving}</option>)}
            </select>
            <input value={r.omschrijving} onChange={(e) => zetRegel(i, "omschrijving", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} placeholder="Omschrijving" />
            <input type="number" value={r.aantal} onChange={(e) => zetRegel(i, "aantal", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
            <input type="number" value={r.prijs} onChange={(e) => zetRegel(i, "prijs", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
            <input type="number" value={r.btwPercentage} onChange={(e) => zetRegel(i, "btwPercentage", e.target.value)} style={{ ...inputStijl, padding: "6px 8px", fontSize: 12.5 }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{geld((Number(r.aantal) || 0) * (Number(r.prijs) || 0))}</div>
            <button onClick={() => verwijderRegel(i)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex", justifyContent: "center" }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={voegRegelToe} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
        <Plus size={13} /> Regel toevoegen
      </button>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, textAlign: "right" }}>
          <div>Subtotaal: {geld(subtotaal)}</div>
          <div>BTW: {geld(btwBedrag)}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: KLEUR.tekst, marginTop: 2 }}>Totaal: {geld(subtotaal + btwBedrag)}</div>
        </div>
      </div>

      <div style={labelStijl}>Opmerkingen (optioneel)</div>
      <textarea value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} rows={2} style={{ ...inputStijl, resize: "vertical" }} />

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Knop variant="primair" onClick={opslaan} disabled={status === "bezig"} icon={Check}>
          {status === "bezig" ? "Opslaan…" : "Opslaan als concept"}
        </Knop>
        <Knop onClick={onKlaar}>Annuleren</Knop>
      </div>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>
        Een nummer wordt pas toegekend zodra je de {naam} verstuurt — hier sla je alleen het concept op.
      </div>
    </div>
  );
}

function DocumentDetail({ document, klantenMap, onTerug, onActie, gerelateerdeFactuur }) {
  const bezig = document._bezig;
  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onTerug} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{document.nummer || "(nog geen nummer)"}</div>
        <StatusBadge status={document.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "4px 20px", marginBottom: 14, fontSize: 13 }}>
        <div><span style={{ color: KLEUR.mutedTekst }}>Klant: </span>{klantenMap[document.klantKlantId] || "—"}</div>
        <div><span style={{ color: KLEUR.mutedTekst }}>Factuurdatum: </span>{datum(document.factuurdatum)}</div>
        <div><span style={{ color: KLEUR.mutedTekst }}>Vervaldatum: </span>{datum(document.vervaldatum)}</div>
        {document.verzondenOp && <div><span style={{ color: KLEUR.mutedTekst }}>Verzonden op: </span>{datum(document.verzondenOp)}</div>}
        {document.betaaldOp && <div><span style={{ color: KLEUR.mutedTekst }}>Betaald op: </span>{datum(document.betaaldOp)}</div>}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 90px 70px 90px", background: KLEUR.lichtblauw, padding: "7px 10px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
          <div>Omschrijving</div><div>Aantal</div><div>Prijs</div><div>BTW%</div><div>Bedrag</div>
        </div>
        {(document.regels || []).map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 90px 70px 90px", padding: "8px 10px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13 }}>
            <div>{r.omschrijving}</div><div>{r.aantal}</div><div>{geld(r.prijs)}</div><div>{r.btwPercentage}%</div><div>{geld(r.bedrag)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, textAlign: "right" }}>
          <div>Subtotaal: {geld(document.subtotaal)}</div>
          <div>BTW: {geld(document.btwBedrag)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: KLEUR.tekst }}>Totaal: {geld(document.totaal)}</div>
        </div>
      </div>

      {gerelateerdeFactuur && (
        <div style={{ background: KLEUR.lichtblauw, borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5 }}>
          Geaccepteerd — omgezet naar factuur {gerelateerdeFactuur.nummer || "(concept)"}.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {document.status === "concept" && (
          <Knop variant="primair" icon={Send} disabled={bezig} onClick={() => onActie(document, "versturen")}>Versturen</Knop>
        )}
        {document.documenttype === "offerte" && document.status === "verzonden" && (
          <>
            <Knop variant="groen" icon={Check} disabled={bezig} onClick={() => onActie(document, "accepteren")}>Klant is akkoord</Knop>
            <Knop variant="rood" icon={X} disabled={bezig} onClick={() => onActie(document, "afwijzen")}>Klant wijst af</Knop>
          </>
        )}
        {document.documenttype === "factuur" && document.status === "verzonden" && (
          <>
            <Knop variant="groen" icon={Check} disabled={bezig} onClick={() => onActie(document, "betaald")}>Markeer betaald</Knop>
            <Knop variant="rood" icon={X} disabled={bezig} onClick={() => onActie(document, "annuleren")}>Annuleren</Knop>
          </>
        )}
      </div>
    </div>
  );
}

function DocumentenTab({ accountId, documenttype, klanten, artikelen, klantenMap, alleFacturen }) {
  const { status, items, foutmelding, verversen } = useDocumenten(accountId, documenttype);
  const [weergave, setWeergave] = useState("lijst"); // lijst | nieuw | bewerken | detail
  const [actief, setActief] = useState(null);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [actieFout, setActieFout] = useState("");

  const naam = documenttype === "offerte" ? "offerte" : "factuur";
  const naamMv = documenttype === "offerte" ? "offertes" : "facturen";

  const statussen = documenttype === "offerte"
    ? ["alle", "concept", "verzonden", "geaccepteerd", "afgewezen"]
    : ["alle", "concept", "verzonden", "betaald", "verlopen", "geannuleerd"];

  const gefilterd = statusFilter === "alle" ? items : items.filter((d) => d.status === statusFilter);

  const totalen = useMemo(() => {
    if (documenttype !== "factuur") return null;
    const som = (lijst) => lijst.reduce((s, d) => s + d.totaal, 0);
    return {
      gefactureerd: som(items.filter((d) => ["verzonden", "betaald", "verlopen"].includes(d.status))),
      concept: som(items.filter((d) => d.status === "concept")),
      openstaand: som(items.filter((d) => d.status === "verzonden")),
      betaald: som(items.filter((d) => d.status === "betaald")),
      verlopen: som(items.filter((d) => d.status === "verlopen")),
    };
  }, [items, documenttype]);

  const voerActieUit = async (document, actie) => {
    setActieFout("");
    setActief({ ...document, _bezig: true });
    try {
      const res = await fetch("/api/facturen-klanten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, id: document.id, actie }),
      });
      const bijgewerkt = await haalJson(res);
      verversen();
      setActief(bijgewerkt);
    } catch (e) {
      setActieFout(e.message || String(e));
      setActief({ ...document, _bezig: false });
    }
  };

  if (weergave === "nieuw") {
    return (
      <DocumentFormulier
        accountId={accountId} documenttype={documenttype} klanten={klanten} artikelen={artikelen}
        onKlaar={() => setWeergave("lijst")}
        onOpgeslagen={() => verversen()}
      />
    );
  }
  if (weergave === "bewerken" && actief) {
    return (
      <DocumentFormulier
        accountId={accountId} documenttype={documenttype} klanten={klanten} artikelen={artikelen} bestaand={actief}
        onKlaar={() => setWeergave("lijst")}
        onOpgeslagen={() => verversen()}
      />
    );
  }
  if (weergave === "detail" && actief) {
    const gerelateerdeFactuur = documenttype === "offerte" && actief.status === "geaccepteerd"
      ? (alleFacturen || []).find((f) => f.offerteId === actief.id)
      : null;
    return (
      <>
        <Melding tekst={actieFout} />
        <DocumentDetail document={actief} klantenMap={klantenMap} onTerug={() => setWeergave("lijst")} onActie={voerActieUit} gerelateerdeFactuur={gerelateerdeFactuur} />
      </>
    );
  }

  return (
    <div>
      {totalen && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
          {[
            ["Totaal gefactureerd", totalen.gefactureerd],
            ["Totaal concept", totalen.concept],
            ["Openstaand", totalen.openstaand],
            ["Betaald", totalen.betaald],
            ["Verlopen", totalen.verlopen],
          ].map(([label, bedrag]) => (
            <div key={label} style={{ ...kaartStijl, margin: 0, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{geld(bedrag)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {statussen.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${statusFilter === s ? KLEUR.blauw : KLEUR.rand}`,
                background: statusFilter === s ? KLEUR.blauw : "#fff",
                color: statusFilter === s ? "#fff" : KLEUR.subtekst,
              }}
            >
              {s === "alle" ? "Alle" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Nieuwe {naam}</Knop>
      </div>

      <Melding tekst={foutmelding} />

      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && gefilterd.length === 0 && <LegeStaat tekst={`Nog geen ${naamMv}.`} />}
      {status === "klaar" && gefilterd.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 2fr 110px 110px 110px 110px 130px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
            <div>Nummer</div><div>Klant</div><div>Datum</div><div>Vervaldatum</div><div>Bedrag</div><div>Status</div><div>Acties</div>
          </div>
          {gefilterd.map((d) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "110px 2fr 110px 110px 110px 110px 130px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>{d.nummer || "—"}</div>
              <div>{klantenMap[d.klantKlantId] || "—"}</div>
              <div>{datum(d.factuurdatum)}</div>
              <div>{datum(d.vervaldatum)}</div>
              <div>{geld(d.totaal)}</div>
              <div><StatusBadge status={d.status} /></div>
              <div style={{ display: "flex", gap: 6 }}>
                {d.status === "concept" ? (
                  <button onClick={() => { setActief(d); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken">
                    <Pencil size={14} />
                  </button>
                ) : (
                  <button onClick={() => { setActief(d); setWeergave("detail"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, fontSize: 12, fontWeight: 600 }}>
                    Bekijken
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Klanten (klanten_klanten) & Producten (artikelen_klanten)               */
/* ---------------------------------------------------------------------- */

function KlantFormulier({ accountId, bestaand, onKlaar, onOpgeslagen }) {
  const a = bestaand?.adres || {};
  const [f, setF] = useState({
    naam: bestaand?.naam || "", contactpersoon: bestaand?.contactpersoon || "", email: bestaand?.email || "",
    telefoon: bestaand?.telefoon || "", straat: a.straat || "", huisnummer: a.huisnummer || "",
    toevoeging: a.toevoeging || "", postcode: a.postcode || "", plaats: a.plaats || "", land: a.land || "NL",
    btwNummer: bestaand?.btwNummer || "", kvkNummer: bestaand?.kvkNummer || "", iban: bestaand?.iban || "",
    opmerkingen: bestaand?.opmerkingen || "",
  });
  const [status, setStatus] = useState("invoer");
  const [foutmelding, setFoutmelding] = useState("");
  const zet = (k) => (e) => setF((h) => ({ ...h, [k]: e.target.value }));

  const opslaan = async () => {
    if (!f.naam.trim()) { setFoutmelding("Naam is verplicht."); setStatus("fout"); return; }
    setStatus("bezig");
    try {
      const payload = {
        accountId, naam: f.naam, contactpersoon: f.contactpersoon, email: f.email, telefoon: f.telefoon,
        adres: { straat: f.straat, huisnummer: f.huisnummer, toevoeging: f.toevoeging, postcode: f.postcode, plaats: f.plaats, land: f.land },
        btwNummer: f.btwNummer, kvkNummer: f.kvkNummer, iban: f.iban, opmerkingen: f.opmerkingen,
      };
      const res = bestaand
        ? await fetch("/api/klanten-klanten", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: bestaand.id }) })
        : await fetch("/api/klanten-klanten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await haalJson(res);
      onOpgeslagen(data);
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ArrowLeft size={16} /></button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{bestaand ? "Klant bewerken" : "Nieuwe klant"}</div>
      </div>
      <Melding tekst={foutmelding} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 20px" }}>
        <div>
          <div style={labelStijl}>Naam *</div><input value={f.naam} onChange={zet("naam")} style={inputStijl} />
          <div style={labelStijl}>Contactpersoon</div><input value={f.contactpersoon} onChange={zet("contactpersoon")} style={inputStijl} />
          <div style={labelStijl}>E-mail</div><input value={f.email} onChange={zet("email")} style={inputStijl} />
          <div style={labelStijl}>Telefoon</div><input value={f.telefoon} onChange={zet("telefoon")} style={inputStijl} />
          <div style={labelStijl}>BTW-nummer</div><input value={f.btwNummer} onChange={zet("btwNummer")} style={inputStijl} />
          <div style={labelStijl}>KvK-nummer</div><input value={f.kvkNummer} onChange={zet("kvkNummer")} style={inputStijl} />
          <div style={labelStijl}>IBAN</div><input value={f.iban} onChange={zet("iban")} style={inputStijl} />
        </div>
        <div>
          <div style={labelStijl}>Straat</div><input value={f.straat} onChange={zet("straat")} style={inputStijl} />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><div style={labelStijl}>Huisnr</div><input value={f.huisnummer} onChange={zet("huisnummer")} style={inputStijl} /></div>
            <div style={{ flex: 1 }}><div style={labelStijl}>Toevoeging</div><input value={f.toevoeging} onChange={zet("toevoeging")} style={inputStijl} /></div>
          </div>
          <div style={labelStijl}>Postcode</div><input value={f.postcode} onChange={zet("postcode")} style={inputStijl} />
          <div style={labelStijl}>Plaats</div><input value={f.plaats} onChange={zet("plaats")} style={inputStijl} />
          <div style={labelStijl}>Land</div><input value={f.land} onChange={zet("land")} style={inputStijl} />
          <div style={labelStijl}>Opmerkingen</div><textarea value={f.opmerkingen} onChange={zet("opmerkingen")} rows={3} style={{ ...inputStijl, resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Knop variant="primair" icon={Check} disabled={status === "bezig"} onClick={opslaan}>{status === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
        <Knop onClick={onKlaar}>Annuleren</Knop>
      </div>
    </div>
  );
}

function KlantenTab({ accountId, klanten, status, foutmelding, verversen }) {
  const [weergave, setWeergave] = useState("lijst");
  const [actief, setActief] = useState(null);

  const deactiveren = async (k) => {
    if (!window.confirm(`"${k.naam}" deactiveren? Bestaande facturen blijven bewaard.`)) return;
    try {
      await haalJson(await fetch(`/api/klanten-klanten?accountId=${encodeURIComponent(accountId)}&id=${k.id}`, { method: "DELETE" }));
      verversen();
    } catch { /* verversen laat de echte staat zien */ verversen(); }
  };

  if (weergave === "nieuw") return <KlantFormulier accountId={accountId} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;
  if (weergave === "bewerken" && actief) return <KlantFormulier accountId={accountId} bestaand={actief} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Nieuwe klant</Knop>
      </div>
      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && klanten.length === 0 && <LegeStaat tekst="Nog geen klanten toegevoegd." />}
      {status === "klaar" && klanten.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 80px 100px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
            <div>Naam</div><div>E-mail / contact</div><div>Plaats</div><div>Actief</div><div>Acties</div>
          </div>
          {klanten.map((k) => (
            <div key={k.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 80px 100px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center", opacity: k.actief ? 1 : 0.55 }}>
              <div style={{ fontWeight: 600 }}>{k.naam}</div>
              <div>{k.email || k.contactpersoon || "—"}</div>
              <div>{k.adres?.plaats || "—"}</div>
              <div>{k.actief ? "Ja" : "Nee"}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setActief(k); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
                {k.actief && (
                  <button onClick={() => deactiveren(k)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Deactiveren"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtikelFormulier({ accountId, bestaand, tarieven, onKlaar, onOpgeslagen }) {
  const [f, setF] = useState({
    omschrijving: bestaand?.omschrijving || "", eenheid: bestaand?.eenheid || "uur",
    prijs: bestaand?.prijs ?? 0, btwCode: bestaand?.btwCode || "hoog",
  });
  const [status, setStatus] = useState("invoer");
  const [foutmelding, setFoutmelding] = useState("");
  const zet = (k) => (e) => setF((h) => ({ ...h, [k]: e.target.value }));

  const opslaan = async () => {
    if (!f.omschrijving.trim()) { setFoutmelding("Omschrijving is verplicht."); setStatus("fout"); return; }
    setStatus("bezig");
    try {
      const payload = { accountId, omschrijving: f.omschrijving, eenheid: f.eenheid, prijs: Number(f.prijs) || 0, btwCode: f.btwCode };
      const res = bestaand
        ? await fetch("/api/artikelen-klanten", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: bestaand.id }) })
        : await fetch("/api/artikelen-klanten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await haalJson(res);
      onOpgeslagen(data);
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onKlaar} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ArrowLeft size={16} /></button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{bestaand ? "Product bewerken" : "Nieuw product"}</div>
      </div>
      <Melding tekst={foutmelding} />
      <div style={labelStijl}>Omschrijving *</div><input value={f.omschrijving} onChange={zet("omschrijving")} style={inputStijl} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div><div style={labelStijl}>Eenheid</div><input value={f.eenheid} onChange={zet("eenheid")} style={inputStijl} placeholder="uur, stuk, ..." /></div>
        <div><div style={labelStijl}>Prijs (excl. btw)</div><input type="number" value={f.prijs} onChange={zet("prijs")} style={inputStijl} /></div>
        <div>
          <div style={labelStijl}>BTW</div>
          <select value={f.btwCode} onChange={zet("btwCode")} style={inputStijl}>
            {(tarieven || []).length === 0 && <option value={f.btwCode}>Laden…</option>}
            {(tarieven || []).map((t) => (
              <option key={t.code} value={t.code}>{t.label} ({t.percentage}%)</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Knop variant="primair" icon={Check} disabled={status === "bezig"} onClick={opslaan}>{status === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
        <Knop onClick={onKlaar}>Annuleren</Knop>
      </div>
    </div>
  );
}

function ProductenTab({ accountId, artikelen, artikelenAlgemeen, tarieven, status, foutmelding, verversen }) {
  const [weergave, setWeergave] = useState("lijst");
  const [actief, setActief] = useState(null);

  const deactiveren = async (a) => {
    if (!window.confirm(`"${a.omschrijving}" verwijderen uit de catalogus?`)) return;
    await fetch(`/api/artikelen-klanten?accountId=${encodeURIComponent(accountId)}&id=${a.id}`, { method: "DELETE" }).catch(() => {});
    verversen();
  };

  if (weergave === "nieuw") return <ArtikelFormulier accountId={accountId} tarieven={tarieven} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;
  if (weergave === "bewerken" && actief) return <ArtikelFormulier accountId={accountId} bestaand={actief} tarieven={tarieven} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Nieuw product</Knop>
      </div>
      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && artikelen.length === 0 && <LegeStaat tekst="Nog geen producten/diensten toegevoegd." />}
      {status === "klaar" && artikelen.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
            <div>Omschrijving</div><div>Eenheid</div><div>Prijs</div><div>BTW</div><div>Acties</div>
          </div>
          {artikelen.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center", opacity: a.actief ? 1 : 0.55 }}>
              <div style={{ fontWeight: 600 }}>{a.omschrijving}</div>
              <div>{a.eenheid || "—"}</div>
              <div>{geld(a.prijs)}</div>
              <div>{a.btwPercentage}%</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setActief(a); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
                {a.actief && <button onClick={() => deactiveren(a)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Verwijderen"><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(artikelenAlgemeen || []).length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Standaardartikelen van Activaa</div>
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>
            Deze artikelen zijn door Activaa ingesteld en gelden voor alle klanten in het portaal — je kunt ze gebruiken bij het opstellen van een factuur of offerte, maar hier niet zelf wijzigen.
          </div>
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase" }}>
              <div>Omschrijving</div><div>Eenheid</div><div>Prijs</div><div>BTW</div>
            </div>
            {artikelenAlgemeen.map((a) => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
                <div style={{ fontWeight: 600 }}>{a.omschrijving}</div>
                <div>{a.eenheid || "—"}</div>
                <div>{geld(a.prijs)}</div>
                <div>{a.btwPercentage}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Instellingen — hier staat wat nog gebouwd moet worden (bewust eerlijk)   */
/* ---------------------------------------------------------------------- */

function NogNietGebouwdKaart({ icon: Icon, titel, tekst }) {
  return (
    <div style={{ ...kaartStijl, opacity: 0.6, background: "repeating-linear-gradient(45deg, #fff, #fff 10px, #FAFAF8 10px, #FAFAF8 20px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={16} color={KLEUR.mutedTekst} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>{titel}</div>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 20, padding: "2px 8px" }}>NOG NIET GEBOUWD</span>
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{tekst}</div>
    </div>
  );
}

function InstellingenTab() {
  return (
    <div>
      <NogNietGebouwdKaart icon={Image} titel="Bedrijfsgegevens & logo" tekst="Eigen logo uploaden en factuurgegevens aanvullen — loopt straks via een wijzigingsverzoek aan Activaa, net als bij Mijn gegevens." />
      <NogNietGebouwdKaart icon={CreditCard} titel="Mollie & betalingen" tekst="Koppeling met Mollie zodat klanten van jouw klanten direct kunnen betalen vanaf de factuur." />
      <NogNietGebouwdKaart icon={Sliders} titel="Standaardwaarden" tekst="Standaard betalingstermijn, btw-percentage en factuurteksten instellen." />
      <NogNietGebouwdKaart icon={Bell} titel="Herinneringen & e-mailsjablonen" tekst="Automatische betalingsherinneringen; de teksten worden centraal beheerd door Activaa." />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Module-root                                                             */
/* ---------------------------------------------------------------------- */

const SUBTABS = [
  { key: "facturen", label: "Facturen", icon: FileText },
  { key: "offertes", label: "Offertes", icon: FileSpreadsheet },
  { key: "klanten", label: "Klanten", icon: Users },
  { key: "producten", label: "Producten", icon: Package },
  { key: "instellingen", label: "Instellingen", icon: Settings },
];

export default function FacturatieModule({ accounts }) {
  const [accountId, setAccountId] = useState(accounts[0]?.accountId || "");
  const [subtab, setSubtab] = useState("facturen");

  useEffect(() => {
    if (!accounts.some((a) => a.accountId === accountId)) {
      setAccountId(accounts[0]?.accountId || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const klantenData = useKlanten(accountId);
  const artikelenData = useArtikelen(accountId);
  const artikelenAlgemeenData = useArtikelenAlgemeen(accountId);
  const btwTarievenData = useBtwTarieven(accountId);
  // Voor de "omgezet naar factuur"-link bij geaccepteerde offertes hebben we ook de facturenlijst nodig.
  const facturenVoorKoppeling = useDocumenten(accountId, "factuur");

  const klantenMap = useMemo(
    () => Object.fromEntries(klantenData.items.map((k) => [k.id, k.naam])),
    [klantenData.items]
  );

  // Bij het opstellen van een factuur/offerte mag zowel uit de eigen catalogus als uit de
  // door Activaa centraal beheerde standaardartikelen gekozen worden.
  const alleArtikelen = useMemo(
    () => [...artikelenData.items, ...artikelenAlgemeenData.items],
    [artikelenData.items, artikelenAlgemeenData.items]
  );

  if (!accountId) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  return (
    <div>
      {accounts.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStijl}>Klantaccount</div>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inputStijl, maxWidth: 320 }}>
            {accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.klantnaam}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubtab(key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 8,
              border: `1px solid ${subtab === key ? KLEUR.blauw : KLEUR.rand}`, cursor: "pointer",
              background: subtab === key ? KLEUR.blauw : "#fff", color: subtab === key ? "#fff" : KLEUR.subtekst,
              fontSize: 13, fontWeight: 600,
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {subtab === "facturen" && (
        <DocumentenTab accountId={accountId} documenttype="factuur" klanten={klantenData.items} artikelen={alleArtikelen} klantenMap={klantenMap} />
      )}
      {subtab === "offertes" && (
        <DocumentenTab accountId={accountId} documenttype="offerte" klanten={klantenData.items} artikelen={alleArtikelen} klantenMap={klantenMap} alleFacturen={facturenVoorKoppeling.items} />
      )}
      {subtab === "klanten" && (
        <KlantenTab accountId={accountId} klanten={klantenData.items} status={klantenData.status} foutmelding={klantenData.foutmelding} verversen={klantenData.verversen} />
      )}
      {subtab === "producten" && (
        <ProductenTab
          accountId={accountId}
          artikelen={artikelenData.items}
          artikelenAlgemeen={artikelenAlgemeenData.items}
          tarieven={btwTarievenData.items}
          status={artikelenData.status}
          foutmelding={artikelenData.foutmelding}
          verversen={artikelenData.verversen}
        />
      )}
      {subtab === "instellingen" && <InstellingenTab />}
    </div>
  );
}
