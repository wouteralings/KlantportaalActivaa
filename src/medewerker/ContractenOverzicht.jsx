/**
 * Medewerkerskant van de Contractenmodule — spiegelt ContractenModule.jsx (klantkant, zie
 * src/portaal/), maar bewust een ander bestand/andere naam om botsing met de klantversie te
 * voorkomen (zie het contractmanagement-plan, §3 "Naamsbotsing voorkomen").
 *
 * Stap 1 (skelet): alleen een lege placeholder. Stap 6 van het plan bouwt hier het echte
 * overzicht per klant, gefilterd/gesorteerd op "bijna verlopen" (mini-dashboard voor
 * relatiebeheerders).
 *
 * Sinds Stap 3 is de tab niet meer alleen voor beheerders: een medewerker met het granulaire
 * "Contracten"-recht (Beheer → Medewerkers → "Medewerkers — wijzig-rechten", kolom "Contracten";
 * zelfde opzet als het bestaande "Offertes"-recht in api/_gedeeld/wijzigrechten.js) ziet hem ook,
 * zie MedewerkerPortaal.jsx. Dat recht is in deze stap alleen een weergave-keuze — er is nog geen
 * eigen medewerkerskant-API om serverkant af te dwingen; die komt met Stap 6.
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
