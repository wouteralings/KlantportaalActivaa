import { Info } from "lucide-react";
import DossierSjablonenPerSoort, { DossierMailTaakPerSoort, DossierBijlagePerSoort } from "./DossierSjablonenBeheer";

/**
 * Beheer → Notulen — het notulenbeheer als eigen tabblad, net als Brieven.
 *
 * Alles wat je één keer instelt en daarna voor álle notulen geldt staat hier bij elkaar:
 *   - de vaste kop en staart (aanwezigen, sluiting, ondertekening) en per model het besluit;
 *   - per model de Dynamics-kolommen die de medewerker bij dat model invult;
 *   - wie standaard als voorzitter en notulist wordt voorgesteld;
 *   - de bijlage-dropzone en de mail-/opslagtaak van de soort Notulen.
 *
 * De veldindeling van het notulendossier zelf (rubrieken, verborgen velden, "alleen tonen als")
 * blijft bij Beheer → Dossiers staan: dat gaat over het dossier, niet over het stuk.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8",
};

export default function NotulenBeheer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          Hier stel je in hoe de notulen eruitzien en wat de medewerker invult. De medewerker maakt het
          stuk in het medewerkersportaal onder <strong>Klantoverzicht → Notulen → Nieuwe notulen</strong>;
          bij opslaan gaat de PDF naar de SharePoint-map van de cliënt en komen de gegevens in het
          notulendossier. De <strong>veldindeling</strong> van dat dossier (rubrieken, verborgen velden,
          “alleen tonen als”) staat bij <strong>Beheer → Dossiers</strong>.
        </div>
      </div>

      <DossierSjablonenPerSoort soort="notulen" />
      <DossierBijlagePerSoort soort="notulen" />
      <DossierMailTaakPerSoort soort="notulen" />
    </div>
  );
}
