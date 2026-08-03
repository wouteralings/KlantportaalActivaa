import { useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald, zie bijv.
 *  ContractenTypesBeheer.jsx — deze bestanden staan bewust op zichzelf). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none" };

function nieuweSectieSleutel(bestaande) {
  let n = bestaande.length + 1;
  while (bestaande.some((s) => s.sleutel === `sectie${n}`)) n++;
  return `sectie${n}`;
}

/**
 * Beheer → Dossiers: hiermee bepaalt Wouter zelf hoe de ~70 IB-dossiervelden (rechtstreeks uit
 * Dynamics, zie api/_gedeeld/dossierVelden.js) verdeeld worden over secties op de dossierpagina
 * in het medewerkersportaal — i.p.v. een vaste, door ons opgelegde indeling. Standaard staat de
 * indeling gelijk aan de tabbladen van het echte Dynamics-formulier (Algemeen/Box I/II/III/
 * Review), maar elk veld is vrij naar een andere (of nieuwe) sectie te verplaatsen en te
 * herordenen. Een veld dat in geen enkele sectie zit, wordt in het medewerkersportaal niet
 * getoond (zie de "Niet ingedeeld"-lijst onderaan).
 *
 * Opslag: hergebruikt het generieke /api/beheer-instellingen (PUT { dossierIndeling }) — geen
 * eigen endpoint nodig. Alleen de "ib"-sleutel wordt hier gelezen/geschreven; eventuele latere
 * andere soorten (bijv. straks vpb) blijven met rust (zie bewaar()).
 */
export default function DossierIndelingBeheer() {
  const [catalogus, setCatalogus] = useState(null); // null = laden
  const [dossierIndeling, setDossierIndeling] = useState(null); // volledig object uit instellingen (alle soorten)
  const [secties, setSecties] = useState(null); // werk-kopie van dossierIndeling.ib.secties
  const [fout, setFout] = useState("");
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [nieuweSectieTitel, setNieuweSectieTitel] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/dossier-velden?soort=ib").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([veldenData, instellingenData]) => {
        setCatalogus(veldenData.catalogus || []);
        const huidigeIndeling = instellingenData.dossierIndeling || {};
        setDossierIndeling(huidigeIndeling);
        setSecties((huidigeIndeling.ib && huidigeIndeling.ib.secties) || []);
      })
      .catch(() => { setCatalogus([]); setSecties([]); setFout("Kon de dossierindeling niet laden."); });
  }, []);

  const veldInfo = (key) => (catalogus || []).find((v) => v.key === key);
  const ingedeeldeKeys = new Set((secties || []).flatMap((s) => s.velden));
  const nietIngedeeld = (catalogus || []).filter((v) => !ingedeeldeKeys.has(v.key));

  const bewaar = async (volgendeSecties) => {
    setStatus("bezig");
    setFout("");
    try {
      const volledigeIndeling = { ...(dossierIndeling || {}), ib: { secties: volgendeSecties } };
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierIndeling: volledigeIndeling }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setDossierIndeling(volledigeIndeling);
      setSecties(volgendeSecties);
      setStatus("opgeslagen");
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  const voegSectieToe = () => {
    const titel = nieuweSectieTitel.trim();
    if (!titel) return;
    const volgende = [...(secties || []), { sleutel: nieuweSectieSleutel(secties || []), titel, velden: [] }];
    setNieuweSectieTitel("");
    bewaar(volgende);
  };

  const hernoemSectie = (sleutel, titel) => {
    setSecties((h) => (h || []).map((s) => (s.sleutel === sleutel ? { ...s, titel } : s)));
  };
  const sectieHernoemOpslaan = () => bewaar(secties || []);

  const verwijderSectie = (sleutel) => {
    const sectie = (secties || []).find((s) => s.sleutel === sleutel);
    if (!sectie) return;
    if (sectie.velden.length > 0 && !confirm(`Sectie "${sectie.titel}" bevat nog ${sectie.velden.length} veld(en). Deze gaan naar "Niet ingedeeld". Doorgaan?`)) return;
    bewaar((secties || []).filter((s) => s.sleutel !== sleutel));
  };

  const verplaatsVeld = (key, naarSectieSleutel) => {
    const zonder = (secties || []).map((s) => ({ ...s, velden: s.velden.filter((k) => k !== key) }));
    if (!naarSectieSleutel) { bewaar(zonder); return; } // terug naar "Niet ingedeeld"
    const volgende = zonder.map((s) => (s.sleutel === naarSectieSleutel ? { ...s, velden: [...s.velden, key] } : s));
    bewaar(volgende);
  };

  const verplaatsBinnenSectie = (sectieSleutel, key, richting) => {
    const volgende = (secties || []).map((s) => {
      if (s.sleutel !== sectieSleutel) return s;
      const i = s.velden.indexOf(key);
      const j = i + richting;
      if (i < 0 || j < 0 || j >= s.velden.length) return s;
      const velden = [...s.velden];
      [velden[i], velden[j]] = [velden[j], velden[i]];
      return { ...s, velden };
    });
    bewaar(volgende);
  };

  if (catalogus === null || secties === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Dossierindeling ophalen…</div>;
  }

  const sectieOpties = (huidigeSleutel) => (
    <>
      <option value="">Niet ingedeeld</option>
      {(secties || []).map((s) => <option key={s.sleutel} value={s.sleutel} disabled={s.sleutel === huidigeSleutel}>{s.titel}</option>)}
    </>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
        <FolderKanban size={16} color={KLEUR.blauw} /> Dossiers — indeling Inkomstenbelasting
      </div>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 720 }}>
        Bepaalt hoe het IB-dossier eruitziet op de dossierpagina van een cliënt in het
        medewerkersportaal (Klantoverzicht → Inkomstenbelasting → dossier openen). Standaard
        gelijk aan de tabbladen van het Dynamics-formulier — versleep een veld gerust naar een
        andere sectie, hernoem secties, of maak nieuwe. Een veld dat bij "Niet ingedeeld" staat,
        wordt niet getoond.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
        {(secties || []).map((sectie) => (
          <div key={sectie.sleutel} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input
                value={sectie.titel}
                onChange={(e) => hernoemSectie(sectie.sleutel, e.target.value)}
                onBlur={sectieHernoemOpslaan}
                style={{ ...invoerStijl, flex: "0 1 320px", fontWeight: 700 }}
              />
              <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{sectie.velden.length} veld(en)</span>
              <button
                onClick={() => verwijderSectie(sectie.sleutel)}
                title="Sectie verwijderen"
                style={{ marginLeft: "auto", background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 4, display: "flex" }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {sectie.velden.length === 0 ? (
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 2px" }}>Nog geen velden in deze sectie.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sectie.velden.map((key, i) => {
                  const v = veldInfo(key);
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "#FBFBF9" }}>
                      <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>{v ? v.label : key}</span>
                      <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".02em" }}>{v ? v.type : ""}</span>
                      <button onClick={() => verplaatsBinnenSectie(sectie.sleutel, key, -1)} disabled={i === 0} title="Omhoog" style={{ background: "none", border: "none", color: i === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: i === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={14} /></button>
                      <button onClick={() => verplaatsBinnenSectie(sectie.sleutel, key, 1)} disabled={i === sectie.velden.length - 1} title="Omlaag" style={{ background: "none", border: "none", color: i === sectie.velden.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: i === sectie.velden.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={14} /></button>
                      <select value={sectie.sleutel} onChange={(e) => verplaatsVeld(key, e.target.value)} style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5 }}>
                        {sectieOpties(sectie.sleutel)}
                      </select>
                      <button onClick={() => verplaatsVeld(key, "")} title="Uit deze sectie halen" style={{ background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 2, display: "flex" }}><X size={13} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={nieuweSectieTitel}
          onChange={(e) => setNieuweSectieTitel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegSectieToe(); } }}
          placeholder="Nieuwe sectie, bijv. Ondernemerschap"
          style={{ ...invoerStijl, flex: "0 1 320px" }}
        />
        <button
          onClick={voegSectieToe}
          disabled={!nieuweSectieTitel.trim()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
            background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8,
            fontSize: 12.5, fontWeight: 600, cursor: nieuweSectieTitel.trim() ? "pointer" : "default",
            opacity: nieuweSectieTitel.trim() ? 1 : 0.6,
          }}
        >
          <Plus size={14} /> Nieuwe sectie
        </button>
        {status === "bezig" && <span style={{ fontSize: 12, color: KLEUR.mutedTekst, alignSelf: "center" }}>Opslaan…</span>}
        {status === "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.groen, alignSelf: "center" }}>Opgeslagen</span>}
      </div>

      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Niet ingedeeld ({nietIngedeeld.length})</div>
        {nietIngedeeld.length === 0 ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Alle velden zijn ingedeeld.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nietIngedeeld.map((v) => (
              <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "#FBFBF9", opacity: 0.85 }}>
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>{v.label}</span>
                <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".02em" }}>{v.type}</span>
                <select value="" onChange={(e) => verplaatsVeld(v.key, e.target.value)} style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5 }}>
                  {sectieOpties("")}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
