import { useEffect, useState } from "react";
import { FolderInput } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald — standalone bestand). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", groen: "#2E7D46", rood: "#B23B3B" };
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none" };

/**
 * Instelling: contractdocumenten (bijlagen bij een contract) óók als kopie wegschrijven naar het
 * SharePoint-klantdossier — sinds 04-08-2026 op verzoek van Wouter ("de contracten als bijlage in
 * klantdossier willen opbergen net als met uitvraag documenten. Dit willen we kunnen instellen.").
 * Standaard uit. Opslag via het generieke /api/beheer-instellingen (contractenSharepointOpslag +
 * contractenSharepointMap, zie api/_gedeeld/instellingen.js) — zelfde endpoint als de prijzentabel
 * hierboven, alleen met andere velden.
 */
export default function ContractenDossierInstellingen() {
  const [aan, setAan] = useState(false);
  const [map, setMap] = useState("Contracten");
  const [geladen, setGeladen] = useState(false);
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout

  useEffect(() => {
    fetch("/api/beheer-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setAan(!!d.contractenSharepointOpslag);
        setMap(d.contractenSharepointMap || "Contracten");
        setGeladen(true);
      })
      .catch(() => setGeladen(true));
  }, []);

  const opslaan = async (velden) => {
    setStatus("bezig");
    try {
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(velden),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus("opgeslagen");
    } catch {
      setStatus("fout");
    }
  };

  if (!geladen) return null;

  return (
    <div style={{ marginTop: 14, padding: 14, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
        <FolderInput size={15} color={KLEUR.blauw} /> Contractdocumenten ook in het klantdossier (SharePoint)
      </div>
      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 }}>
        Als dit aanstaat wordt elke bijlage die een klant bij een contract uploadt óók als kopie weggeschreven
        naar de SharePoint-map van die klant, net als bij aanlever-uitvragen — de bijlage blijft daarnaast
        gewoon in het portaal zelf staan (op-/downloaden/verwijderen blijft daar werken). Vereist dat de
        klant een SharePoint-map heeft ingesteld in Dynamics.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}>
        <input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} />
        Contractdocumenten ook opslaan in het klantdossier
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: KLEUR.subtekst, whiteSpace: "nowrap" }}>Submap in het dossier:</span>
        <input value={map} onChange={(e) => setMap(e.target.value)} style={{ ...invoerStijl, width: 200 }} placeholder="Contracten" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => opslaan({ contractenSharepointOpslag: aan, contractenSharepointMap: (map || "Contracten").trim() || "Contracten" })}
          disabled={status === "bezig"}
          style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          {status === "bezig" ? "Bezig…" : "Opslaan"}
        </button>
        {status === "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.groen }}>Opgeslagen</span>}
        {status === "fout" && <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan mislukt.</span>}
      </div>
    </div>
  );
}
