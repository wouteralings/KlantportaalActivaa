import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald — standalone bestand,
 *  zie ContractenDossierInstellingen.jsx). */
const KLEUR = { blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF", lichtblauw: "#EAF2F8", groen: "#2E7D46", rood: "#B23B3B" };
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", fontFamily: "inherit" };
const veldLabelStijl = { fontSize: 11.5, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".02em" };

/** Welke variabelen in het onderwerp/de tekst hieronder vervangen worden — zie
 *  vulPlaceholdersIn()/maakOnderwerpEnTekst() in api/_gedeeld/contractenReminders.js. */
const PLACEHOLDERS = [
  { sleutel: "{klant}", uitleg: "Voornaam van de contactpersoon" },
  { sleutel: "{contract}", uitleg: "Naam van het contract" },
  { sleutel: "{leverancier}", uitleg: "Leverancier (indien ingevuld)" },
  { sleutel: "{einddatum}", uitleg: "Einddatum van het contract" },
  { sleutel: "{dagen}", uitleg: "Aantal dagen tot de einddatum" },
  { sleutel: "{opzegtermijn}", uitleg: "Opzegtermijn in dagen (indien ingevuld)" },
];

/**
 * Instelling: onderwerp/tekst van de automatische contract-verloopherinnering + het
 * afzender-e-mailadres waarvandaan die verstuurd wordt — op verzoek van Wouter (05-08-2026:
 * "Ik zou graag contracten mail willen kunnen aanpassen en mailadres waarvan wordt gemaild.").
 * Opslag via het generieke /api/beheer-instellingen (contractenReminderOnderwerp/-Tekst/-Afzender,
 * zie api/_gedeeld/instellingen.js), zelfde endpoint als de prijzentabel en
 * ContractenDossierInstellingen.jsx hierboven. Leeg laten = de ingebouwde standaardtekst/het
 * standaard afzenderadres (GRAPH_MAIL_SENDER) gebruiken — zie contractenReminders.js/mail.js.
 */
export default function ContractenMailInstellingen() {
  const [afzender, setAfzender] = useState("");
  const [onderwerp, setOnderwerp] = useState("");
  const [tekst, setTekst] = useState("");
  const [geladen, setGeladen] = useState(false);
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout

  useEffect(() => {
    fetch("/api/beheer-instellingen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setAfzender(d.contractenReminderAfzender || "");
        setOnderwerp(d.contractenReminderOnderwerp || "");
        setTekst(d.contractenReminderTekst || "");
        setGeladen(true);
      })
      .catch(() => setGeladen(true));
  }, []);

  const opslaan = async () => {
    setStatus("bezig");
    try {
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractenReminderAfzender: afzender.trim(),
          contractenReminderOnderwerp: onderwerp.trim(),
          contractenReminderTekst: tekst.trim(),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus("opgeslagen");
    } catch {
      setStatus("fout");
    }
  };

  const herstelStandaard = () => {
    setOnderwerp("");
    setTekst("");
  };

  if (!geladen) return null;

  return (
    <div style={{ marginTop: 14, padding: 14, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
        <Mail size={15} color={KLEUR.blauw} /> Verloopherinnering per e-mail
      </div>
      <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 12, maxWidth: 640 }}>
        Pas hier de automatische e-mail aan die een klant krijgt als een contract binnenkort verloopt
        (90/30 dagen vóór de einddatum, en vóór het einde van de opzegtermijn) en het adres
        waarvandaan die verstuurd wordt. Laat een veld leeg om de standaardtekst / het standaard
        afzenderadres te gebruiken.
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={veldLabelStijl}>Afzender e-mailadres</div>
        <input
          value={afzender}
          onChange={(e) => setAfzender(e.target.value)}
          placeholder="Standaard afzender gebruiken"
          style={{ ...invoerStijl, width: 320 }}
        />
        <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 4 }}>
          Moet een bestaand, gelicentieerd postvak in de Microsoft 365-tenant zijn (net als bij de standaard afzender).
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={veldLabelStijl}>Onderwerp</div>
        <input
          value={onderwerp}
          onChange={(e) => setOnderwerp(e.target.value)}
          placeholder={'Uw contract "{contract}" verloopt op {einddatum}'}
          style={{ ...invoerStijl, width: "100%" }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={veldLabelStijl}>Tekst</div>
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          rows={8}
          placeholder={"Beste {klant},\n\nUw contract \"{contract}\" verloopt op {einddatum}…"}
          style={{ ...invoerStijl, width: "100%", resize: "vertical" }}
        />
      </div>

      <div style={{ background: KLEUR.lichtblauw, borderRadius: 7, padding: "8px 10px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.subtekst, marginBottom: 4 }}>Beschikbare variabelen</div>
        <div style={{ fontSize: 11.5, color: KLEUR.subtekst, display: "flex", flexWrap: "wrap", gap: "3px 14px" }}>
          {PLACEHOLDERS.map((p) => (
            <span key={p.sleutel}>
              <code style={{ color: KLEUR.blauw, fontWeight: 600 }}>{p.sleutel}</code> — {p.uitleg}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={opslaan}
          disabled={status === "bezig"}
          style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          {status === "bezig" ? "Bezig…" : "Opslaan"}
        </button>
        <button
          onClick={herstelStandaard}
          disabled={status === "bezig"}
          style={{ padding: "7px 14px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Herstel standaardtekst
        </button>
        {status === "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.groen }}>Opgeslagen</span>}
        {status === "fout" && <span style={{ fontSize: 12, color: KLEUR.rood }}>Opslaan mislukt.</span>}
      </div>
    </div>
  );
}
