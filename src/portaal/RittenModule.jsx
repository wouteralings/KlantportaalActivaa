import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Car, Plus, Trash2, Pencil, X, Settings, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Download, Star, MapPin, Repeat, Calendar, List, Bike, Motorbike, Search,
} from "lucide-react";

// Voertuigtype (migratie 010) — auto/motor/fiets, zelfde drie waarden als de
// CK_voertuigen_klanten_type check-constraint in de database.
const VOERTUIGTYPES = [
  { key: "auto", label: "Auto", icon: Car },
  { key: "motor", label: "Motor", icon: Motorbike },
  { key: "fiets", label: "Fiets", icon: Bike },
];
function voertuigtypeLabel(type) {
  return (VOERTUIGTYPES.find((t) => t.key === type) || VOERTUIGTYPES[0]).label;
}

/** Eén-regelige weergave van een klantadres (dbo.klanten_klanten.adres), of "" als er geen
 * bruikbaar adres is. Gebruikt om een klant als snelkeuze aan te bieden bij Van/Naar in het
 * rit-formulier, zodat je niet zelf het adres hoeft te typen/kopiëren. */
function formatAdres(adres) {
  if (!adres) return "";
  const straatHuis = [adres.straat, [adres.huisnummer, adres.toevoeging].filter(Boolean).join("")].filter(Boolean).join(" ");
  const postcodePlaats = [adres.postcode, adres.plaats].filter(Boolean).join(" ");
  return [straatHuis, postcodePlaats].filter(Boolean).join(", ");
}
function klantHeeftAdres(k) {
  return !!(k.adres && k.adres.straat && k.adres.postcode && k.adres.plaats);
}

/**
 * Rittenregistratie — klantportaal-tab (zie project-doc/skill "rittenregistratie" voor het
 * volledige plan). Zelfde bouwpatroon als src/portaal/FacturatieModule.jsx: eigen KLEUR-palet,
 * lokale Knop/Melding/LegeStaat-hulpcomponenten, data-hooks per accountId, en een
 * NietActief-aanvraagkaart voor accounts waar de module nog niet aan staat.
 *
 * Aannames over bestaande endpoints die dit bestand hergebruikt (niet hier gebouwd):
 *  - GET /api/klanten-klanten?accountId=...            → { klanten: [...] }  (na de toegangs-
 *    patch in api/_gedeeld/klantenLijstToegang.js ook bereikbaar zonder Facturatie)
 *  - GET/PUT /api/bedrijfsgegevens-klanten?accountId=...  → gebruikt hier voor de nieuwe velden
 *    standaardKmTarief / standaardKmTariefType / rittenKlantVerplicht (zie migratie 009 +
 *    PATCHES/bedrijfsgegevensKlanten.js.patch-instructies.md). Controleer de exacte
 *    endpoint-naam/-vorm tegen de echte code — dit bestand gaat uit van hetzelfde
 *    partial-update-patroon als de rest van de Instellingen-tab.
 */

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
// Zelfde sectiekop-stijl als Contracten (ContractenModule.jsx) — voor de Actief/Niet-actief-
// indeling in de module-root hieronder.
const sectieKopStijl = { fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "0 0 8px" };

function geld(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
function datum(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("nl-NL");
}
function isoDatum(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}
async function haalJson(response) {
  if (response.ok) return response.json();
  let bericht = `Fout ${response.status}`;
  try {
    const data = await response.json();
    if (data && data.error) bericht = data.error;
  } catch { /* geen JSON-body */ }
  throw new Error(bericht);
}

/* ---------------------------------------------------------------------- */
/* Kleine hulpcomponenten — zelfde stijl als FacturatieModule.jsx          */
/* ---------------------------------------------------------------------- */

function Knop({ children, variant = "normaal", icon: Icon, disabled, style, ...props }) {
  const varianten = {
    normaal: { background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}` },
    primair: { background: KLEUR.blauw, color: "#fff", border: "none" },
    gevaar: { background: "#fff", color: KLEUR.rood, border: `1px solid ${KLEUR.rood}55` },
  };
  return (
    <button
      disabled={disabled}
      {...props}
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
  return <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>{tekst}</div>;
}

function Modal({ titel, onSluiten, breedte = 560, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto", zIndex: 200 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: breedte, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${KLEUR.rand}` }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{titel}</div>
          <button onClick={onSluiten} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Data hooks — telkens gescopet op één klant-account (accountId)          */
/* ---------------------------------------------------------------------- */

function useLijst(accountId, pad, extraQuery, sleutel) {
  const [status, setStatus] = useState("laden");
  const [items, setItems] = useState([]);
  const [foutmelding, setFoutmelding] = useState("");

  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    const query = new URLSearchParams({ accountId, ...(extraQuery || {}) }).toString();
    fetch(`/api/${pad}?${query}`)
      .then(haalJson)
      .then((d) => { setItems(d[sleutel] || []); setStatus("klaar"); })
      .catch((e) => { setFoutmelding(e.message || String(e)); setStatus("fout"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, JSON.stringify(extraQuery)]);

  useEffect(() => { verversen(); }, [verversen]);
  return { status, items, foutmelding, verversen };
}

function useKlanten(accountId) {
  return useLijst(accountId, "klanten-klanten", { alles: "0" }, "klanten");
}
function useVoertuigen(accountId, alles) {
  return useLijst(accountId, "voertuigen-klanten", { alles: alles ? "1" : "0" }, "voertuigen");
}
function useProjecten(accountId) {
  return useLijst(accountId, "projecten-klanten", {}, "projecten");
}
function useFavorieteRitten(accountId) {
  return useLijst(accountId, "favoriete-ritten-klanten", {}, "favorieteRitten");
}
function useRitten(accountId, filters) {
  return useLijst(accountId, "ritten-klanten", filters, "ritten");
}

function useBedrijfsgegevens(accountId) {
  const [gegevens, setGegevens] = useState(null);
  const [status, setStatus] = useState("laden");
  const verversen = useCallback(() => {
    if (!accountId) return;
    setStatus("laden");
    fetch(`/api/bedrijfsgegevens-klanten?accountId=${encodeURIComponent(accountId)}`)
      .then(haalJson)
      .then((d) => { setGegevens(d || {}); setStatus("klaar"); })
      .catch(() => { setGegevens({}); setStatus("fout"); });
  }, [accountId]);
  useEffect(() => { verversen(); }, [verversen]);
  return { gegevens, status, verversen };
}

/* ---------------------------------------------------------------------- */
/* Module kost / nog niet actief                                          */
/* ---------------------------------------------------------------------- */

function RittenNietActief({ account, prijs }) {
  const [status, setStatus] = useState("idle");

  const vraagAan = async () => {
    setStatus("bezig");
    try {
      await haalJson(await fetch("/api/ritten-aanvraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId }),
      }));
      setStatus("aangevraagd");
    } catch {
      setStatus("fout");
    }
  };

  return (
    <div style={kaartStijl}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
        <Car size={17} color={KLEUR.blauw} /> Rittenregistratie
      </div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 12, maxWidth: 560 }}>
        Registreer je zakelijke ritten: van/naar-adres, voertuig, project en of het een privé- of
        woon-werkrit was. De afstand wordt automatisch berekend. Deze functie kost{" "}
        <strong>{geld(prijs)} per maand</strong> per klantaccount.
      </div>
      {account.rittenAangevraagdOp && status !== "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} /> Al aangevraagd op {datum(account.rittenAangevraagdOp)} — we nemen contact met je op.
        </div>
      ) : status === "aangevraagd" ? (
        <div style={{ fontSize: 12.5, color: KLEUR.blauw, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} /> Aangevraagd — we nemen contact met je op.
        </div>
      ) : (
        <Knop variant="primair" onClick={vraagAan} disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Vraag Rittenregistratie aan"}
        </Knop>
      )}
      {status === "fout" && <div style={{ marginTop: 10 }}><Melding tekst="Aanvragen is niet gelukt, probeer het nog eens." /></div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Rit-formulier (toevoegen/bewerken)                                     */
/* ---------------------------------------------------------------------- */

function RitFormulier({ accountId, bestaand, standaardTarief, klanten, projecten, voertuigen, favorieteRitten, suggesties, onKlaar, onOpgeslagen }) {
  const isNieuw = !bestaand;
  const [klantKlantId, setKlantKlantId] = useState(bestaand?.klantKlantId || "");
  const [projectId, setProjectId] = useState(bestaand?.projectId || "");
  const [voertuigId, setVoertuigId] = useState(bestaand?.voertuigId || (voertuigen.find((v) => v.favoriet)?.id ?? ""));
  const [datumVeld, setDatumVeld] = useState(isoDatum(bestaand?.datum) || isoDatum(new Date()));
  const [vanAdres, setVanAdres] = useState(bestaand?.vanAdres || "");
  const [naarAdres, setNaarAdres] = useState(bestaand?.naarAdres || "");
  const [afstandKm, setAfstandKm] = useState(bestaand?.afstandKm ?? "");
  const [omschrijving, setOmschrijving] = useState(bestaand?.omschrijving || "");
  const [priveRit, setPriveRit] = useState(!!bestaand?.priveRit);
  const [woonWerkRit, setWoonWerkRit] = useState(!!bestaand?.woonWerkRit);
  const [boekOokRetour, setBoekOokRetour] = useState(false);
  const [declarabelType, setDeclarabelType] = useState(bestaand?.declarabelType || standaardTarief?.type || "per_km");
  const [declarabelTarief, setDeclarabelTarief] = useState(bestaand?.declarabelTarief ?? standaardTarief?.bedrag ?? "");
  const [mapsStatus, setMapsStatus] = useState("idle");
  const [mapsMelding, setMapsMelding] = useState("");
  const [opslaanStatus, setOpslaanStatus] = useState("idle");
  const [foutmelding, setFoutmelding] = useState("");

  const projectenVanKlant = useMemo(
    () => projecten.filter((p) => !klantKlantId || p.klantKlantId === klantKlantId),
    [projecten, klantKlantId]
  );

  // Kiest een project met een klant die niet meer klopt bij de gekozen klant? Dan resetten.
  useEffect(() => {
    if (projectId && !projectenVanKlant.some((p) => p.id === projectId)) setProjectId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klantKlantId]);

  const totaalBedrag = useMemo(() => {
    const tarief = Number(declarabelTarief) || 0;
    if (!tarief) return 0;
    return declarabelType === "per_keer" ? tarief : tarief * (Number(afstandKm) || 0);
  }, [declarabelType, declarabelTarief, afstandKm]);

  // Klanten met een compleet adres — alleen die komen in aanmerking voor de "kies adres van
  // klant"-snelkeuze bij Van/Naar, zodat je nooit een leeg/onvolledig adres kan overnemen.
  const klantenMetAdres = useMemo(() => klanten.filter(klantHeeftAdres), [klanten]);

  const kiesKlantAdres = (klantId, veld) => {
    if (!klantId) return;
    const k = klanten.find((x) => x.id === klantId);
    const adres = formatAdres(k?.adres);
    if (!adres) return;
    if (veld === "van") setVanAdres(adres); else setNaarAdres(adres);
    if (!klantKlantId) setKlantKlantId(klantId);
  };

  const vulFavorietIn = (favId) => {
    const f = favorieteRitten.find((x) => x.id === favId);
    if (!f) return;
    setVanAdres(f.vanAdres || "");
    setNaarAdres(f.naarAdres || "");
    setVoertuigId(f.voertuigId || "");
    setKlantKlantId(f.klantKlantId || "");
    setProjectId(f.projectId || "");
    setOmschrijving(f.omschrijving || "");
    setPriveRit(!!f.priveRit);
    setWoonWerkRit(!!f.woonWerkRit);
    setDeclarabelType(f.declarabelType || "per_km");
    setDeclarabelTarief(f.declarabelTarief ?? "");
  };

  const berekenAfstand = async () => {
    if (!vanAdres.trim() || !naarAdres.trim()) {
      setMapsMelding("Vul eerst beide adressen in.");
      return;
    }
    setMapsStatus("bezig");
    setMapsMelding("");
    try {
      const d = await haalJson(await fetch("/api/ritten-afstand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, vanAdres, naarAdres }),
      }));
      if (d.afstandKm == null) {
        setMapsMelding(d.fout || "Kon de afstand niet berekenen.");
      } else {
        setAfstandKm(d.afstandKm);
      }
    } catch (e) {
      setMapsMelding(e.message || String(e));
    } finally {
      setMapsStatus("idle");
    }
  };

  const opslaan = async () => {
    if (!vanAdres.trim() || !naarAdres.trim()) { setFoutmelding("Van- en naar-adres zijn verplicht."); return; }
    if (!datumVeld) { setFoutmelding("Datum is verplicht."); return; }
    setOpslaanStatus("bezig");
    setFoutmelding("");
    const payload = {
      accountId,
      klantKlantId: klantKlantId || null,
      projectId: projectId || null,
      voertuigId: voertuigId || null,
      datum: datumVeld,
      vanAdres, naarAdres,
      afstandKm: afstandKm === "" ? null : Number(afstandKm),
      priveRit, woonWerkRit,
      omschrijving,
      declarabelType,
      declarabelTarief: declarabelTarief === "" ? null : Number(declarabelTarief),
      ...(isNieuw ? { boekOokRetour } : {}),
    };
    try {
      if (isNieuw) {
        await haalJson(await fetch("/api/ritten-klanten", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        }));
      } else {
        await haalJson(await fetch(`/api/ritten-klanten?id=${bestaand.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        }));
      }
      onOpgeslagen();
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setOpslaanStatus("idle");
    }
  };

  return (
    <Modal titel={isNieuw ? "Rit toevoegen" : "Rit bewerken"} onSluiten={onKlaar}>
      <Melding tekst={foutmelding} />

      {isNieuw && favorieteRitten.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStijl}>Favoriete rit invullen</div>
          <select style={inputStijl} defaultValue="" onChange={(e) => e.target.value && vulFavorietIn(e.target.value)}>
            <option value="">Kies een favoriete rit…</option>
            {favorieteRitten.map((f) => <option key={f.id} value={f.id}>{f.naam}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={labelStijl}>Van</div>
          <input style={inputStijl} value={vanAdres} onChange={(e) => setVanAdres(e.target.value)} list="ritten-adres-suggesties" placeholder="Startadres" />
          {klantenMetAdres.length > 0 && (
            <select style={{ ...inputStijl, marginTop: 4, fontSize: 11.5, color: KLEUR.mutedTekst }} defaultValue="" onChange={(e) => { kiesKlantAdres(e.target.value, "van"); e.target.value = ""; }}>
              <option value="">Of kies adres van klant…</option>
              {klantenMetAdres.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
            </select>
          )}
        </div>
        <div>
          <div style={labelStijl}>Naar</div>
          <input style={inputStijl} value={naarAdres} onChange={(e) => setNaarAdres(e.target.value)} list="ritten-adres-suggesties" placeholder="Bestemming" />
          {klantenMetAdres.length > 0 && (
            <select style={{ ...inputStijl, marginTop: 4, fontSize: 11.5, color: KLEUR.mutedTekst }} defaultValue="" onChange={(e) => { kiesKlantAdres(e.target.value, "naar"); e.target.value = ""; }}>
              <option value="">Of kies adres van klant…</option>
              {klantenMetAdres.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
            </select>
          )}
        </div>
      </div>
      <datalist id="ritten-adres-suggesties">
        {(suggesties.adressen || []).map((a) => <option key={a} value={a} />)}
      </datalist>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "end" }}>
        <div>
          <div style={labelStijl}>Afstand (km)</div>
          <input style={inputStijl} type="number" step="0.1" value={afstandKm} onChange={(e) => setAfstandKm(e.target.value)} />
        </div>
        <Knop onClick={berekenAfstand} disabled={mapsStatus === "bezig"} icon={MapPin}>
          {mapsStatus === "bezig" ? "Berekenen…" : "Bereken via Google Maps"}
        </Knop>
      </div>
      {mapsMelding && <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 4 }}>{mapsMelding}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={labelStijl}>Voertuig</div>
          <select style={inputStijl} value={voertuigId} onChange={(e) => setVoertuigId(e.target.value)}>
            <option value="">Geen voertuig</option>
            {voertuigen.map((v) => <option key={v.id} value={v.id}>{v.merk}{v.model ? ` ${v.model}` : ""}{v.kenteken ? ` (${v.kenteken})` : ""}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStijl}>Datum</div>
          <input style={inputStijl} type="date" value={datumVeld} onChange={(e) => setDatumVeld(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={labelStijl}>Klant</div>
          <select style={inputStijl} value={klantKlantId} onChange={(e) => setKlantKlantId(e.target.value)}>
            <option value="">Geen klant</option>
            {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStijl}>Project</div>
          <select style={inputStijl} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Alle projecten</option>
            {projectenVanKlant.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div style={labelStijl}>Omschrijving</div>
        <input style={inputStijl} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} list="ritten-omschrijving-suggesties" />
      </div>
      <datalist id="ritten-omschrijving-suggesties">
        {(suggesties.omschrijvingen || []).map((o) => <option key={o} value={o} />)}
      </datalist>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, margin: "14px 0" }}>
        {isNieuw && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={boekOokRetour} onChange={(e) => setBoekOokRetour(e.target.checked)} /> Boek ook de retourrit
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={priveRit} onChange={(e) => setPriveRit(e.target.checked)} /> Privé-rit
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={woonWerkRit} onChange={(e) => setWoonWerkRit(e.target.checked)} /> Woon-werkverkeer
        </label>
      </div>

      <div style={{ ...kaartStijl, background: KLEUR.lichtblauw, marginBottom: 0 }}>
        <div style={labelStijl}>Declarabel</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
            <input style={{ ...inputStijl, paddingLeft: 24 }} type="number" step="0.01" value={declarabelTarief} onChange={(e) => setDeclarabelTarief(e.target.value)} />
          </div>
          <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            {["per_km", "per_keer"].map((t) => (
              <button key={t} onClick={() => setDeclarabelType(t)} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: declarabelType === t ? KLEUR.blauw : "#fff", color: declarabelType === t ? "#fff" : KLEUR.subtekst }}>
                {t === "per_km" ? "Per km" : "Per keer"}
              </button>
            ))}
          </div>
        </div>
        {declarabelType === "per_km" && Number(declarabelTarief) > 0 && (
          <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 6 }}>
            Totaalbedrag: {geld(totaalBedrag)} ({afstandKm || 0}km x {geld(declarabelTarief)})
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
        <Knop onClick={onKlaar}>Annuleren</Knop>
        <Knop variant="primair" onClick={opslaan} disabled={opslaanStatus === "bezig"}>{opslaanStatus === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Lijstweergave                                                          */
/* ---------------------------------------------------------------------- */

function RittenLijst({ accountId, ritten, status, foutmelding, verversen, klantenMap, projectenMap, voertuigenMap, onBewerken, onNieuw }) {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const [voertuigFilter, setVoertuigFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("alle");
  const [projectFilter, setProjectFilter] = useState("");

  const gefilterd = useMemo(() => ritten.filter((r) => {
    if (jaar && new Date(r.datum).getFullYear() !== jaar) return false;
    if (voertuigFilter && r.voertuigId !== voertuigFilter) return false;
    if (projectFilter && r.projectId !== projectFilter) return false;
    if (typeFilter === "zakelijk" && r.priveRit) return false;
    if (typeFilter === "prive" && !r.priveRit) return false;
    if (typeFilter === "woon_werk" && !r.woonWerkRit) return false;
    return true;
  }), [ritten, jaar, voertuigFilter, projectFilter, typeFilter]);

  const totalen = gefilterd.reduce((acc, r) => {
    acc.declarabel += Number(r.declarabelBedrag) || 0;
    acc.afstand += Number(r.afstandKm) || 0;
    return acc;
  }, { declarabel: 0, afstand: 0 });

  const verwijderen = async (rit) => {
    if (!window.confirm(`Rit van ${datum(rit.datum)} verwijderen?`)) return;
    try {
      await haalJson(await fetch(`/api/ritten-klanten?accountId=${encodeURIComponent(accountId)}&id=${rit.id}`, { method: "DELETE" }));
      verversen();
    } catch { verversen(); }
  };

  const downloadCsv = () => {
    const kop = ["Datum", "Type", "Van", "Naar", "Voertuig", "Project", "Declarabel", "Afstand (km)"];
    const rijen = gefilterd.map((r) => [
      datum(r.datum),
      r.priveRit ? "Privé" : r.woonWerkRit ? "Woon-werk" : "Zakelijk",
      r.vanAdres, r.naarAdres,
      voertuigenMap[r.voertuigId] || "",
      projectenMap[r.projectId] || "",
      r.declarabelBedrag != null ? String(r.declarabelBedrag).replace(".", ",") : "",
      r.afstandKm != null ? String(r.afstandKm).replace(".", ",") : "",
    ]);
    const csv = [kop, ...rijen].map((rij) => rij.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ritten-${jaar}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <input style={{ ...inputStijl, width: 100 }} type="number" value={jaar} onChange={(e) => setJaar(Number(e.target.value) || jaar)} />
          <select style={{ ...inputStijl, width: 180 }} value={voertuigFilter} onChange={(e) => setVoertuigFilter(e.target.value)}>
            <option value="">Alle voertuigen</option>
            {Object.entries(voertuigenMap).map(([id, naam]) => <option key={id} value={id}>{naam}</option>)}
          </select>
          <select style={{ ...inputStijl, width: 150 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="alle">Zakelijk & Privé</option>
            <option value="zakelijk">Alleen zakelijk</option>
            <option value="prive">Alleen privé</option>
            <option value="woon_werk">Alleen woon-werk</option>
          </select>
          <select style={{ ...inputStijl, width: 180 }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">Alle projecten</option>
            {Object.entries(projectenMap).map(([id, naam]) => <option key={id} value={id}>{naam}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Knop icon={Download} onClick={downloadCsv}>Download CSV</Knop>
          <Knop variant="primair" icon={Plus} onClick={onNieuw}>Rit toevoegen</Knop>
        </div>
      </div>

      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && gefilterd.length === 0 && <LegeStaat tekst="Geen ritten voor deze filters." />}

      {status === "klaar" && gefilterd.length > 0 && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 90px 1.4fr 1.4fr 1fr 90px 90px 70px", background: KLEUR.lichtblauw, padding: "9px 14px", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
            <div>Datum</div><div>Type</div><div>Van</div><div>Naar</div><div>Voertuig</div><div>Declarabel</div><div>Afstand</div><div>Acties</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "100px 90px 1.4fr 1.4fr 1fr 90px 90px 70px", padding: "8px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 12.5, color: KLEUR.mutedTekst }}>
            <div /><div /><div /><div /><div /><div style={{ fontWeight: 700 }}>{geld(totalen.declarabel)}</div><div style={{ fontWeight: 700 }}>{totalen.afstand.toFixed(1)} km</div><div />
          </div>
          {gefilterd.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "100px 90px 1.4fr 1.4fr 1fr 90px 90px 70px", padding: "10px 14px", borderTop: `1px solid ${KLEUR.rand}`, fontSize: 13, alignItems: "center" }}>
              <div>{datum(r.datum)}</div>
              <div>{r.priveRit ? "Privé" : r.woonWerkRit ? "Woon-werk" : "Zakelijk"}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.vanAdres}>{r.vanAdres}{r.retourVanId && <Repeat size={11} style={{ marginLeft: 4, verticalAlign: "middle" }} color={KLEUR.mutedTekst} />}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.naarAdres}>{r.naarAdres}</div>
              <div>{voertuigenMap[r.voertuigId] || "—"}</div>
              <div>{r.declarabelBedrag != null ? geld(r.declarabelBedrag) : "—"}</div>
              <div>{r.afstandKm != null ? `${r.afstandKm} km` : "—"}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => onBewerken(r)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }} title="Bewerken"><Pencil size={14} /></button>
                <button onClick={() => verwijderen(r)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }} title="Verwijderen"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Kalenderweergave ("Per dag")                                           */
/* ---------------------------------------------------------------------- */

function RittenKalender({ ritten, onBewerken, onNieuwOpDatum }) {
  const [maandOffset, setMaandOffset] = useState(0);
  const basis = useMemo(() => {
    const nu = new Date();
    return new Date(nu.getFullYear(), nu.getMonth() + maandOffset, 1);
  }, [maandOffset]);

  const dagenInMaand = new Date(basis.getFullYear(), basis.getMonth() + 1, 0).getDate();
  const eersteWeekdag = (basis.getDay() + 6) % 7; // maandag = 0

  const ritsPerDag = useMemo(() => {
    const map = {};
    ritten.forEach((r) => {
      const d = new Date(r.datum);
      if (d.getFullYear() === basis.getFullYear() && d.getMonth() === basis.getMonth()) {
        const dag = d.getDate();
        (map[dag] = map[dag] || []).push(r);
      }
    });
    return map;
  }, [ritten, basis]);

  const cellen = [];
  for (let i = 0; i < eersteWeekdag; i++) cellen.push(null);
  for (let dag = 1; dag <= dagenInMaand; dag++) cellen.push(dag);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 14 }}>
        <button onClick={() => setMaandOffset((m) => m - 1)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ChevronLeft size={18} /></button>
        <div style={{ fontSize: 15, fontWeight: 700, minWidth: 160, textAlign: "center" }}>
          {basis.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}
        </div>
        <button onClick={() => setMaandOffset((m) => m + 1)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex" }}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textAlign: "center", padding: "4px 0" }}>{d}</div>
        ))}
        {cellen.map((dag, i) => (
          <div key={i} style={{ minHeight: 90, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 6, background: dag ? "#fff" : "transparent", cursor: dag ? "pointer" : "default" }}
               onClick={() => dag && onNieuwOpDatum(new Date(basis.getFullYear(), basis.getMonth(), dag))}>
            {dag && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4 }}>{dag}</div>
                {(ritsPerDag[dag] || []).slice(0, 3).map((r) => (
                  <div key={r.id} onClick={(e) => { e.stopPropagation(); onBewerken(r); }}
                       style={{ fontSize: 10.5, background: r.priveRit ? `${KLEUR.rood}18` : KLEUR.lichtblauw, color: r.priveRit ? KLEUR.rood : KLEUR.blauw, borderRadius: 5, padding: "2px 5px", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                       title={`${r.vanAdres} → ${r.naarAdres}`}>
                    {r.naarAdres}
                  </div>
                ))}
                {(ritsPerDag[dag] || []).length > 3 && (
                  <div style={{ fontSize: 10, color: KLEUR.mutedTekst }}>+{ritsPerDag[dag].length - 3} meer</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Instellingen — Algemeen / Voertuigen / Favoriete ritten                 */
/* ---------------------------------------------------------------------- */

function InstellingenAlgemeen({ accountId }) {
  const { gegevens, status, verversen } = useBedrijfsgegevens(accountId);
  const [tarief, setTarief] = useState("");
  const [type, setType] = useState("per_km");
  const [klantVerplicht, setKlantVerplicht] = useState(false);
  const [opslaanStatus, setOpslaanStatus] = useState("idle");

  useEffect(() => {
    if (gegevens) {
      setTarief(gegevens.standaardKmTarief ?? "");
      setType(gegevens.standaardKmTariefType || "per_km");
      setKlantVerplicht(!!gegevens.rittenKlantVerplicht);
    }
  }, [gegevens]);

  const opslaan = async () => {
    setOpslaanStatus("bezig");
    try {
      await haalJson(await fetch("/api/bedrijfsgegevens-klanten", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          standaardKmTarief: tarief === "" ? null : Number(tarief),
          standaardKmTariefType: type,
          rittenKlantVerplicht: klantVerplicht,
        }),
      }));
      setOpslaanStatus("gelukt");
      verversen();
    } catch {
      setOpslaanStatus("fout");
    }
  };

  if (status === "laden") return <LegeStaat tekst="Laden…" />;

  return (
    <div style={kaartStijl}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Standaard tarief</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12 }}>
        Je standaard tarief wordt automatisch voor je ingevuld wanneer je een nieuwe rit voor een project maakt.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
          <input style={{ ...inputStijl, width: 140, paddingLeft: 24 }} type="number" step="0.01" value={tarief} onChange={(e) => setTarief(e.target.value)} />
        </div>
        <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
          {["per_km", "per_keer"].map((t) => (
            <button key={t} onClick={() => setType(t)} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: type === t ? KLEUR.blauw : "#fff", color: type === t ? "#fff" : KLEUR.subtekst }}>
              {t === "per_km" ? "Per km" : "Per keer"}
            </button>
          ))}
        </div>
        <Knop variant="primair" onClick={opslaan} disabled={opslaanStatus === "bezig"}>{opslaanStatus === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
        {opslaanStatus === "gelukt" && <span style={{ fontSize: 12.5, color: KLEUR.blauw }}>Opgeslagen.</span>}
      </div>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${KLEUR.rand}` }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={klantVerplicht} onChange={(e) => setKlantVerplicht(e.target.checked)} />
          Klant verplicht op een rit
        </label>
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 4, marginLeft: 24 }}>
          Staat dit aan, dan moet elke rit gekoppeld zijn aan een klant.
        </div>
      </div>
    </div>
  );
}

function VoertuigFormulier({ accountId, bestaand, onKlaar, onOpgeslagen }) {
  const [voertuigType, setVoertuigType] = useState(bestaand?.voertuigType || "auto");
  const [merk, setMerk] = useState(bestaand?.merk || "");
  const [model, setModel] = useState(bestaand?.model || "");
  const [kenteken, setKenteken] = useState(bestaand?.kenteken || "");
  const [cataloguswaarde, setCataloguswaarde] = useState(bestaand?.cataloguswaarde ?? "");
  const [priveOfZakelijk, setPriveOfZakelijk] = useState(bestaand?.priveOfZakelijk || "prive");
  const [foutmelding, setFoutmelding] = useState("");
  const [opslaanStatus, setOpslaanStatus] = useState("idle");

  // Cataloguswaarde is voor auto/motor verplicht (o.a. t.b.v. een eventuele latere
  // bijtellingsberekening); voor een fiets is dat geen relevant gegeven, dus daar niet verplicht.
  const cataloguswaardeVerplicht = voertuigType !== "fiets";

  const opslaan = async () => {
    if (!merk.trim()) { setFoutmelding(voertuigType === "fiets" ? "Merk is verplicht." : "Merk is verplicht."); return; }
    if (cataloguswaardeVerplicht && (cataloguswaarde === "" || Number(cataloguswaarde) < 0)) {
      setFoutmelding("Cataloguswaarde is verplicht."); return;
    }
    if (cataloguswaarde !== "" && Number(cataloguswaarde) < 0) { setFoutmelding("Cataloguswaarde moet 0 of hoger zijn."); return; }
    setOpslaanStatus("bezig");
    const payload = {
      accountId, merk, model, kenteken,
      cataloguswaarde: cataloguswaarde === "" ? 0 : Number(cataloguswaarde),
      priveOfZakelijk, voertuigType,
    };
    try {
      if (bestaand) {
        await haalJson(await fetch(`/api/voertuigen-klanten?id=${bestaand.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      } else {
        await haalJson(await fetch("/api/voertuigen-klanten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      }
      onOpgeslagen();
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setOpslaanStatus("idle");
    }
  };

  return (
    <Modal titel="Voertuig bewerken" onSluiten={onKlaar} breedte={480}>
      <Melding tekst={foutmelding} />

      <div style={labelStijl}>Type voertuig</div>
      <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
        {VOERTUIGTYPES.map((t) => (
          <button key={t.key} onClick={() => setVoertuigType(t.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: voertuigType === t.key ? KLEUR.blauw : "#fff", color: voertuigType === t.key ? "#fff" : KLEUR.subtekst }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <div style={labelStijl}>Merk *</div>
      <input style={inputStijl} value={merk} onChange={(e) => setMerk(e.target.value)} placeholder={voertuigType === "fiets" ? "Bijv. Gazelle" : "Bijv. Volkswagen"} />
      <div style={labelStijl}>Model</div>
      <input style={inputStijl} value={model} onChange={(e) => setModel(e.target.value)} />
      {voertuigType !== "fiets" && (
        <>
          <div style={labelStijl}>Kenteken</div>
          <input style={inputStijl} value={kenteken} onChange={(e) => setKenteken(e.target.value)} />
        </>
      )}
      <div style={labelStijl}>Cataloguswaarde{cataloguswaardeVerplicht ? " *" : " (optioneel)"}</div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
        <input style={{ ...inputStijl, paddingLeft: 24 }} type="number" step="0.01" value={cataloguswaarde} onChange={(e) => setCataloguswaarde(e.target.value)} />
      </div>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 4 }}>
        {voertuigType === "fiets" ? "Voor een fiets is dit veld niet verplicht." : "Bij het RDW kan je de catalogusprijs opzoeken."}
      </div>
      <div style={labelStijl}>Privé of zakelijk</div>
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, marginTop: 6, cursor: "pointer" }}>
        <input type="radio" checked={priveOfZakelijk === "prive"} onChange={() => setPriveOfZakelijk("prive")} /> Privé, ik rijd/fiets met mijn eigen {voertuigType === "fiets" ? "fiets" : voertuigType === "motor" ? "motor" : "auto"}
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, marginTop: 6, cursor: "pointer" }}>
        <input type="radio" checked={priveOfZakelijk === "zakelijk"} onChange={() => setPriveOfZakelijk("zakelijk")} /> Zakelijk, {voertuigType === "fiets" ? "de fiets is" : voertuigType === "motor" ? "de motor is" : "de auto is"} zakelijk aangeschaft
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <Knop variant="primair" onClick={opslaan} disabled={opslaanStatus === "bezig"}>{opslaanStatus === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
      </div>
    </Modal>
  );
}

function InstellingenVoertuigen({ accountId }) {
  const [alles, setAlles] = useState(false);
  const { items, status, foutmelding, verversen } = useVoertuigen(accountId, alles);
  const [weergave, setWeergave] = useState("lijst");
  const [actief, setActief] = useState(null);

  const zetFavoriet = async (v) => {
    try {
      await haalJson(await fetch(`/api/voertuigen-klanten?id=${v.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, favoriet: true }) }));
      verversen();
    } catch { verversen(); }
  };
  const verwijderen = async (v) => {
    if (!window.confirm(`"${v.merk}${v.model ? ` ${v.model}` : ""}" uit gebruik zetten?`)) return;
    try {
      await haalJson(await fetch(`/api/voertuigen-klanten?accountId=${encodeURIComponent(accountId)}&id=${v.id}`, { method: "DELETE" }));
      verversen();
    } catch { verversen(); }
  };

  if (weergave === "nieuw") return <VoertuigFormulier accountId={accountId} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;
  if (weergave === "bewerken" && actief) return <VoertuigFormulier accountId={accountId} bestaand={actief} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <select style={{ ...inputStijl, width: 160 }} value={alles ? "alles" : "ingebruik"} onChange={(e) => setAlles(e.target.value === "alles")}>
          <option value="ingebruik">In gebruik</option>
          <option value="alles">Alle voertuigen</option>
        </select>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Toevoegen</Knop>
      </div>
      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && items.length === 0 && <LegeStaat tekst="Nog geen voertuigen toegevoegd." />}
      {items.map((v) => (
        <div key={v.id} style={{ ...kaartStijl, display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => zetFavoriet(v)} title="Favoriet maken" style={{ background: v.favoriet ? `${KLEUR.goud}22` : "transparent", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Star size={16} color={v.favoriet ? KLEUR.goud : KLEUR.mutedTekst} fill={v.favoriet ? KLEUR.goud : "none"} />
          </button>
          <div style={{ flex: 1, fontWeight: 600 }}>{v.merk}{v.model ? ` ${v.model}` : ""}</div>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, width: 80 }}>Type<br /><span style={{ color: KLEUR.tekst, fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>{React.createElement((VOERTUIGTYPES.find((t) => t.key === v.voertuigType) || VOERTUIGTYPES[0]).icon, { size: 12 })}{voertuigtypeLabel(v.voertuigType)}</span></div>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, width: 100 }}>Kenteken<br /><span style={{ color: KLEUR.tekst, fontWeight: 600, fontSize: 13 }}>{v.kenteken || "—"}</span></div>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, width: 120 }}>Cataloguswaarde<br /><span style={{ color: KLEUR.tekst, fontWeight: 600, fontSize: 13 }}>{v.voertuigType === "fiets" && !v.cataloguswaarde ? "—" : geld(v.cataloguswaarde)}</span></div>
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst, width: 90 }}>Soort<br /><span style={{ color: KLEUR.tekst, fontWeight: 600, fontSize: 13 }}>{v.priveOfZakelijk === "prive" ? "Privé" : "Zakelijk"}</span></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setActief(v); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }}><Pencil size={14} /></button>
            <button onClick={() => verwijderen(v)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FavorieteRitFormulier({ accountId, bestaand, klanten, projecten, voertuigen, onKlaar, onOpgeslagen }) {
  const [naam, setNaam] = useState(bestaand?.naam || "");
  const [vanAdres, setVanAdres] = useState(bestaand?.vanAdres || "");
  const [naarAdres, setNaarAdres] = useState(bestaand?.naarAdres || "");
  const [voertuigId, setVoertuigId] = useState(bestaand?.voertuigId || "");
  const [klantKlantId, setKlantKlantId] = useState(bestaand?.klantKlantId || "");
  const [projectId, setProjectId] = useState(bestaand?.projectId || "");
  const [omschrijving, setOmschrijving] = useState(bestaand?.omschrijving || "");
  const [declarabelType, setDeclarabelType] = useState(bestaand?.declarabelType || "per_km");
  const [declarabelTarief, setDeclarabelTarief] = useState(bestaand?.declarabelTarief ?? "");
  const [foutmelding, setFoutmelding] = useState("");
  const [opslaanStatus, setOpslaanStatus] = useState("idle");

  const opslaan = async () => {
    if (!naam.trim()) { setFoutmelding("Naam is verplicht."); return; }
    setOpslaanStatus("bezig");
    const payload = {
      accountId, naam, vanAdres, naarAdres, voertuigId: voertuigId || null, klantKlantId: klantKlantId || null,
      projectId: projectId || null, omschrijving, declarabelType, declarabelTarief: declarabelTarief === "" ? null : Number(declarabelTarief),
    };
    try {
      if (bestaand) {
        await haalJson(await fetch(`/api/favoriete-ritten-klanten?id=${bestaand.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      } else {
        await haalJson(await fetch("/api/favoriete-ritten-klanten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      }
      onOpgeslagen();
      onKlaar();
    } catch (e) {
      setFoutmelding(e.message || String(e));
      setOpslaanStatus("idle");
    }
  };

  return (
    <Modal titel={bestaand ? "Favoriete rit bewerken" : "Favoriete rit toevoegen"} onSluiten={onKlaar}>
      <Melding tekst={foutmelding} />
      <div style={labelStijl}>Naam</div>
      <input style={inputStijl} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Kantoor → OSW B.V." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><div style={labelStijl}>Van</div><input style={inputStijl} value={vanAdres} onChange={(e) => setVanAdres(e.target.value)} /></div>
        <div><div style={labelStijl}>Naar</div><input style={inputStijl} value={naarAdres} onChange={(e) => setNaarAdres(e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={labelStijl}>Voertuig</div>
          <select style={inputStijl} value={voertuigId} onChange={(e) => setVoertuigId(e.target.value)}>
            <option value="">Geen voertuig</option>
            {voertuigen.map((v) => <option key={v.id} value={v.id}>{v.merk}{v.model ? ` ${v.model}` : ""}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStijl}>Klant</div>
          <select style={inputStijl} value={klantKlantId} onChange={(e) => setKlantKlantId(e.target.value)}>
            <option value="">Geen klant</option>
            {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
        </div>
      </div>
      <div style={labelStijl}>Project</div>
      <select style={inputStijl} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        <option value="">Geen project</option>
        {projecten.filter((p) => !klantKlantId || p.klantKlantId === klantKlantId).map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
      </select>
      <div style={labelStijl}>Omschrijving</div>
      <input style={inputStijl} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: KLEUR.mutedTekst }}>€</span>
          <input style={{ ...inputStijl, paddingLeft: 24 }} type="number" step="0.01" value={declarabelTarief} onChange={(e) => setDeclarabelTarief(e.target.value)} />
        </div>
        <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
          {["per_km", "per_keer"].map((t) => (
            <button key={t} onClick={() => setDeclarabelType(t)} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: declarabelType === t ? KLEUR.blauw : "#fff", color: declarabelType === t ? "#fff" : KLEUR.subtekst }}>
              {t === "per_km" ? "Per km" : "Per keer"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <Knop variant="primair" onClick={opslaan} disabled={opslaanStatus === "bezig"}>{opslaanStatus === "bezig" ? "Opslaan…" : "Opslaan"}</Knop>
      </div>
    </Modal>
  );
}

function InstellingenFavorieteRitten({ accountId, klanten, projecten, voertuigen }) {
  const { items, status, foutmelding, verversen } = useFavorieteRitten(accountId);
  const [weergave, setWeergave] = useState("lijst");
  const [actief, setActief] = useState(null);

  const verwijderen = async (f) => {
    if (!window.confirm(`Favoriete rit "${f.naam}" verwijderen?`)) return;
    try {
      await haalJson(await fetch(`/api/favoriete-ritten-klanten?accountId=${encodeURIComponent(accountId)}&id=${f.id}`, { method: "DELETE" }));
      verversen();
    } catch { verversen(); }
  };

  if (weergave === "nieuw") return <FavorieteRitFormulier accountId={accountId} klanten={klanten} projecten={projecten} voertuigen={voertuigen} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;
  if (weergave === "bewerken" && actief) return <FavorieteRitFormulier accountId={accountId} bestaand={actief} klanten={klanten} projecten={projecten} voertuigen={voertuigen} onKlaar={() => setWeergave("lijst")} onOpgeslagen={verversen} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Knop variant="primair" icon={Plus} onClick={() => setWeergave("nieuw")}>Favoriete rit toevoegen</Knop>
      </div>
      <Melding tekst={foutmelding} />
      {status === "laden" && <LegeStaat tekst="Laden…" />}
      {status === "klaar" && items.length === 0 && <LegeStaat tekst="Nog geen favoriete ritten opgeslagen." />}
      {items.map((f) => (
        <div key={f.id} style={{ ...kaartStijl, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{f.naam}</div>
            <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>{f.vanAdres} → {f.naarAdres}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setActief(f); setWeergave("bewerken"); }} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.blauw, display: "flex" }}><Pencil size={14} /></button>
            <button onClick={() => verwijderen(f)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.rood, display: "flex" }}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

const INSTELLINGEN_SUBTABS = [
  { key: "algemeen", label: "Algemeen" },
  { key: "voertuigen", label: "Voertuigen" },
  { key: "favoriete-ritten", label: "Favoriete ritten" },
];

function RittenInstellingen({ accountId, account, klanten, projecten, voertuigen, onTerug }) {
  const [sub, setSub] = useState("algemeen");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <button onClick={onTerug} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.subtekst, display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <ChevronLeft size={16} /> Terug naar Ritten
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, margin: "10px 0 16px" }}>
        <Settings size={17} color={KLEUR.blauw} /> Ritten
      </div>
      <div style={{ display: "flex", gap: 22, borderBottom: `1px solid ${KLEUR.rand}`, marginBottom: 18 }}>
        {INSTELLINGEN_SUBTABS.map((s) => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{ background: "none", border: "none", borderBottom: sub === s.key ? `2px solid ${KLEUR.blauw}` : "2px solid transparent", padding: "0 0 10px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: sub === s.key ? KLEUR.blauw : KLEUR.subtekst }}>
            {s.label}
          </button>
        ))}
      </div>
      {sub === "algemeen" && (
        <>
          <InstellingenAlgemeen accountId={accountId} />
          {account && <RittenHomeKaart account={account} />}
        </>
      )}
      {sub === "voertuigen" && <InstellingenVoertuigen accountId={accountId} />}
      {sub === "favoriete-ritten" && <InstellingenFavorieteRitten accountId={accountId} klanten={klanten} projecten={projecten} voertuigen={voertuigen} />}
    </div>
  );
}

/** Klant-voorkeur: een snelknop "Rit toevoegen" op de homepagina tonen. Zelfde patroon als
 * UrenHomeKaart/FacturenHomeKaart in FacturatieModule.jsx. Slaat direct op via
 * /api/ritten-instelling. */
function RittenHomeKaart({ account }) {
  const [aan, setAan] = useState(!!account.toonRittenOpHome);
  const [status, setStatus] = useState("idle"); // idle | bezig | fout
  const [foutmelding, setFoutmelding] = useState("");

  // Laad de écht opgeslagen stand op (i.p.v. alleen te vertrouwen op de pagina-snapshot uit
  // mijn-gegevens) — zelfde reden als bij UrenHomeKaart/FacturenHomeKaart.
  useEffect(() => {
    let actief = true;
    fetch(`/api/ritten-instelling?accountId=${encodeURIComponent(account.accountId)}`)
      .then(haalJson)
      .then((d) => { if (actief) setAan(!!d.toonOpHome); })
      .catch(() => {}); // stil: val terug op de snapshot-waarde
    return () => { actief = false; };
  }, [account.accountId]);

  const zet = async (nieuw) => {
    setAan(nieuw);
    setStatus("bezig");
    setFoutmelding("");
    try {
      await haalJson(await fetch("/api/ritten-instelling", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId, toonOpHome: nieuw }),
      }));
      setStatus("idle");
    } catch (e) {
      setAan(!nieuw);
      setFoutmelding(e.message || String(e));
      setStatus("fout");
    }
  };

  return (
    <div style={{ ...kaartStijl, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Ritten op de homepagina</div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 12, maxWidth: 620 }}>
        Toon een snelknop <strong>"Rit toevoegen"</strong> op je Home-pagina, zodat je snel een rit
        kunt invoeren zonder eerst naar deze tab te gaan.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => zet(!aan)}
          disabled={status === "bezig"}
          title={aan ? "Snelknop verbergen" : "Snelknop tonen"}
          style={{ position: "relative", width: 40, height: 22, borderRadius: 20, border: "none", cursor: status === "bezig" ? "default" : "pointer", background: aan ? KLEUR.blauw : KLEUR.rand, flexShrink: 0, transition: "background .15s" }}
        >
          <span style={{ position: "absolute", top: 2, left: aan ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s" }} />
        </button>
        <span style={{ fontSize: 13.5 }}>Snelknop op Home tonen</span>
      </div>
      {status === "fout" && <div style={{ fontSize: 12, color: KLEUR.rood, marginTop: 8 }}>Opslaan mislukt{foutmelding ? `: ${foutmelding}` : ""}, probeer het nog eens.</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Account-inhoud — hoofdscherm (Lijst/Kalender + Instellingen)            */
/* ---------------------------------------------------------------------- */

function RittenAccountInhoud({ account, alleenLezen }) {
  const accountId = account.accountId;
  const [weergave, setWeergave] = useState("lijst"); // lijst | kalender | instellingen
  const [bewerkRit, setBewerkRit] = useState(undefined); // undefined = gesloten, null = nieuw, object = bewerken
  const [nieuweDatum, setNieuweDatum] = useState(null);

  const klantenData = useKlanten(accountId);
  const voertuigenData = useVoertuigen(accountId, false);
  const projectenData = useProjecten(accountId);
  const favorieteRittenData = useFavorieteRitten(accountId);
  const { gegevens: bedrijfsgegevens } = useBedrijfsgegevens(accountId);
  const rittenData = useRitten(accountId, {});
  const [suggesties, setSuggesties] = useState({ adressen: [], omschrijvingen: [] });

  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/ritten-klanten?accountId=${encodeURIComponent(accountId)}&suggesties=1`)
      .then(haalJson).then(setSuggesties).catch(() => {});
  }, [accountId, rittenData.items.length]);

  const klantenMap = useMemo(() => Object.fromEntries(klantenData.items.map((k) => [k.id, k.naam])), [klantenData.items]);
  const projectenMap = useMemo(() => Object.fromEntries(projectenData.items.map((p) => [p.id, p.naam])), [projectenData.items]);
  const voertuigenMap = useMemo(() => Object.fromEntries(voertuigenData.items.map((v) => [v.id, `${v.merk}${v.model ? ` ${v.model}` : ""}`])), [voertuigenData.items]);

  const standaardTarief = { bedrag: bedrijfsgegevens?.standaardKmTarief, type: bedrijfsgegevens?.standaardKmTariefType };

  if (weergave === "instellingen") {
    return (
      <RittenInstellingen
        accountId={accountId}
        account={account}
        klanten={klantenData.items}
        projecten={projectenData.items}
        voertuigen={voertuigenData.items}
        onTerug={() => setWeergave("lijst")}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <Car size={17} color={KLEUR.blauw} /> Ritten
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setWeergave("kalender")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: weergave === "kalender" ? KLEUR.blauw : "#fff", color: weergave === "kalender" ? "#fff" : KLEUR.subtekst }}>
              <Calendar size={13} /> Per dag
            </button>
            <button onClick={() => setWeergave("lijst")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: weergave === "lijst" ? KLEUR.blauw : "#fff", color: weergave === "lijst" ? "#fff" : KLEUR.subtekst }}>
              <List size={13} /> Lijst
            </button>
          </div>
          {!alleenLezen && (
            <button onClick={() => setWeergave("instellingen")} style={{ background: "none", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: KLEUR.subtekst }}>
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {weergave === "lijst" && (
        <RittenLijst
          accountId={accountId}
          ritten={rittenData.items}
          status={rittenData.status}
          foutmelding={rittenData.foutmelding}
          verversen={rittenData.verversen}
          klantenMap={klantenMap}
          projectenMap={projectenMap}
          voertuigenMap={voertuigenMap}
          onBewerken={setBewerkRit}
          onNieuw={() => setBewerkRit(null)}
        />
      )}
      {weergave === "kalender" && (
        <RittenKalender
          ritten={rittenData.items}
          onBewerken={setBewerkRit}
          onNieuwOpDatum={(d) => { setNieuweDatum(d); setBewerkRit(null); }}
        />
      )}

      {bewerkRit !== undefined && !alleenLezen && (
        <RitFormulier
          accountId={accountId}
          bestaand={bewerkRit || undefined}
          standaardTarief={standaardTarief}
          klanten={klantenData.items}
          projecten={projectenData.items}
          voertuigen={voertuigenData.items}
          favorieteRitten={favorieteRittenData.items}
          suggesties={suggesties}
          onKlaar={() => { setBewerkRit(undefined); setNieuweDatum(null); }}
          onOpgeslagen={rittenData.verversen}
        />
      )}
    </div>
  );
}

/** Korte intro boven de sectie "Niet actief" bij meerdere klantaccounts — zelfde patroon als
 *  ContractenUitlegBanner in ContractenModule.jsx. */
function RittenUitlegBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", marginBottom: 10,
      background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 10,
    }}>
      <Clock size={15} color={KLEUR.mutedTekst} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>
        <strong style={{ color: KLEUR.tekst }}>Rittenregistratie is beschikbaar voor deze administraties.</strong>{" "}
        Klap een administratie open om de module aan te vragen.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Module-root — per gekoppeld klantaccount, zelfde zoekveld + Actief/Niet-  */
/* actief-indeling met inklapbare rijen als de Contracten-tab               */
/* (ContractenModule.jsx), op verzoek van Wouter (05-08-2026) gelijkgetrokken. */
/* ---------------------------------------------------------------------- */

export default function RittenModule({ accounts, prijs = 1.5, alleenLezen = false }) {
  const [openAccountId, setOpenAccountId] = useState(accounts.length === 1 ? accounts[0]?.accountId : null);
  const [zoek, setZoek] = useState("");

  if (accounts.length === 0) return <LegeStaat tekst="Geen klantaccount beschikbaar." />;

  // Eén klantaccount: geen lijst/sectie-indeling nodig — direct de volle module of de
  // aanvraagkaart tonen, zelfde regel als ContractenModule.
  if (accounts.length === 1) {
    const acc = accounts[0];
    return acc.rittenIngeschakeld
      ? <RittenAccountInhoud account={acc} alleenLezen={alleenLezen} />
      : <RittenNietActief account={acc} prijs={prijs} />;
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
            {acc.rittenIngeschakeld
              ? <RittenAccountInhoud account={acc} alleenLezen={alleenLezen} />
              : <RittenNietActief account={acc} prijs={prijs} />}
          </div>
        )}
      </div>
    );
  };

  const actieveAccounts = lijst.filter((a) => a.rittenIngeschakeld);
  const nietActieveAccounts = lijst.filter((a) => !a.rittenIngeschakeld);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        <Car size={17} color={KLEUR.blauw} /> Ritten
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
          <RittenUitlegBanner />
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            {nietActieveAccounts.map(renderAccountRij)}
          </div>
        </div>
      )}
    </div>
  );
}
