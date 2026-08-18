import { Info } from "lucide-react";
import DossierSjablonenPerSoort, { DossierMailTaakPerSoort, DossierBijlagePerSoort } from "./DossierSjablonenBeheer";

/**
 * Beheer → Dividend — het dividendbeheer als eigen tabblad, net als Brieven en Notulen.
 *
 * Alles wat over het STUK gaat staat hier bij elkaar:
 *   - de vaste kop en staart die voor alle dividendstukken gelden;
 *   - de voorbeelddocumenten (modellen) waaruit de medewerker kiest;
 *   - de bijlage-dropzone van de soort Dividenduitkering;
 *   - de mail naar de klant en de taak/opslag bij het versturen.
 *
 * De veldindeling van het dividenddossier zelf (rubrieken, verborgen velden, "alleen tonen als",
 * review, aangifte-instellingen) blijft bewust bij Beheer → Dossiers staan: dat gaat over het
 * dossier, niet over het stuk. Zo verandert er niets aan wat daar al is ingesteld.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8",
};

export default function DividendBeheer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          Hier stel je in hoe een dividendstuk eruitziet en hoe het naar de cliënt gaat. De medewerker
          opent het voorbeeld vanuit het dividenddossier in het medewerkersportaal. De{" "}
          <strong>veldindeling</strong> van dat dossier (rubrieken, verborgen velden, “alleen tonen als”,
          review) staat bij <strong>Beheer → Dossiers</strong> — daar verandert niets aan.
        </div>
      </div>

      <DossierSjablonenPerSoort soort="dividend" />
      <DossierBijlagePerSoort soort="dividend" />
      <DossierMailTaakPerSoort soort="dividend" />
    </div>
  );
}
