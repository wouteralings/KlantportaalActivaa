import AanleverLijstenBeheer from "./AanleverLijstenBeheer";
import AbonnementenOverzicht from "./AbonnementenOverzicht";

const KLEUR = { rand: "#E2E4DF" };

/**
 * Beheer-tab "Uitvraag": de automatische uitvragen (abonnementen) bovenaan en de aanleverlijsten
 * (sjablonen) daaronder, gestapeld op één pagina.
 */
export default function UitvraagBeheer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <AbonnementenOverzicht />
      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, margin: "8px 0" }} />
      <AanleverLijstenBeheer />
    </div>
  );
}
