import AanleverLijstenBeheer from "./AanleverLijstenBeheer";
import AbonnementenOverzicht from "./AbonnementenOverzicht";
import OnderwerpenBeheer from "./OnderwerpenBeheer";

const KLEUR = { rand: "#E2E4DF" };

/**
 * Beheer-tab "Uitvraag": eerst de onderwerpen (bepalen opslaglocatie + koppeling aan dossiers),
 * daarna de automatische uitvragen (abonnementen) en de aanleverlijsten (sjablonen), gestapeld op
 * één pagina.
 */
export default function UitvraagBeheer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <OnderwerpenBeheer />
      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, margin: "8px 0" }} />
      <AbonnementenOverzicht />
      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, margin: "8px 0" }} />
      <AanleverLijstenBeheer />
    </div>
  );
}
