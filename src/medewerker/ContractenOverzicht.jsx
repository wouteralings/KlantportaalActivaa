/**
 * Medewerkerskant van de Contractenmodule — spiegelt ContractenModule.jsx (klantkant, zie
 * src/portaal/), maar bewust een ander bestand/andere naam om botsing met de klantversie te
 * voorkomen (zie het contractmanagement-plan, §3 "Naamsbotsing voorkomen").
 *
 * Stap 1 (skelet): alleen een lege placeholder. Stap 6 van het plan bouwt hier het echte
 * overzicht per klant, gefilterd/gesorteerd op "bijna verlopen" (mini-dashboard voor
 * relatiebeheerders). De tab is in Stap 1 alleen zichtbaar voor beheerders (zie
 * MedewerkerPortaal.jsx) — Stap 3 voegt de granulaire magContracten-rechtenvlag toe
 * (wijzigrechten.js, zelfde patroon als magOffertes) zodat losse medewerkers ook toegang
 * kunnen krijgen zonder volledig beheerder te zijn.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
};

export default function ContractenOverzicht() {
  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Contracten</div>
      <div style={{ textAlign: "center", padding: "40px 20px", color: KLEUR.mutedTekst, fontSize: 13 }}>
        Contracten wordt binnenkort beschikbaar — het overzicht per klant volgt in een latere stap.
      </div>
    </div>
  );
}
