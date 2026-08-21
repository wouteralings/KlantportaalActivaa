import { Info } from "lucide-react";
import DossierSjablonenPerSoort, { DossierMailTaakPerSoort, DossierBijlagePerSoort, StukOpslagInstellingen } from "./DossierSjablonenBeheer";
import KvkFormulierBeheer from "./KvkFormulierBeheer";

/**
 * Beheer → Liquidatiestukken — zelfde opzet als Beheer → Notulen en Beheer → Dividend.
 *
 * Alles wat je één keer instelt en daarna voor álle liquidatiestukken geldt staat hier bij elkaar:
 *   - de vaste kop en staart (aanwezigen, constateringen, sluiting, ondertekening) en per model
 *     de besluiten (ontbinding, décharge, bewaarder administratie);
 *   - per model de Dynamics-kolommen en invulvelden die de medewerker bij dat model invult;
 *   - de bijlage-dropzone en de mail-/ondertekentaak van de soort Liquidatiestukken;
 *   - waar het stuk als PDF terechtkomt in SharePoint.
 *
 * De veldindeling van het liquidatiedossier zelf (rubrieken, verborgen velden, "alleen tonen als")
 * blijft bij Beheer → Dossiers staan: dat gaat over het dossier, niet over het stuk. De balans- en
 * resultatenrekening-regels staan vast — die volgen het ontbindingsrapport en zijn niet instelbaar,
 * anders zouden ze niet meer op de Dynamics-kolommen aansluiten.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8",
};

export default function LiquidatieBeheer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <Info size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          Hier stel je in hoe een liquidatiestuk (ontbindingsrapport) eruitziet en wat de medewerker
          invult. De medewerker maakt het stuk onder{" "}
          <strong>Klantoverzicht → Liquidatiestukken → Nieuw liquidatiestuk</strong>; bij opslaan gaat
          de PDF naar de SharePoint-map van de cliënt en komen de gegevens — inclusief balans en
          resultatenrekening — in het liquidatiedossier. De <strong>veldindeling</strong> van dat
          dossier staat bij <strong>Beheer → Dossiers</strong>. De cijferregels van de balans en de
          resultatenrekening liggen vast: die volgen het ontbindingsrapport en sluiten één-op-één aan
          op de kolommen in Dynamics.
        </div>
      </div>

      <DossierSjablonenPerSoort soort="liquidatie" />
      {/* Het KvK-formulier hoort bij de liquidatiestukken en wordt daarom hier onderhouden, niet
          onder Brieven → Formulieren. */}
      <KvkFormulierBeheer />
      <DossierBijlagePerSoort soort="liquidatie" />
      <DossierMailTaakPerSoort soort="liquidatie" />
      {/* Onderaan, want het is de laatste stap: waar het stuk terechtkomt als je klaar bent. */}
      <StukOpslagInstellingen soort="liquidatie" />
    </div>
  );
}
