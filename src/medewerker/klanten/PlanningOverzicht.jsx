/** Zelfde palet als het medewerkersportaal — bewust hier herhaald zodat dit bestand
 *  op zichzelf staat. Wijzigt de huisstijl, pas dan beide plekken aan. */
const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
};

/**
 * Planning — medewerkersoverzicht (sub-tab onder Klantoverzicht).
 *
 * Planningsmodule Stap 1 (skelet). Dit is bewust nog een placeholder: de eigen, simpele planning
 * (één tabel `dbo.planning_klanten`, gekoppeld aan de klant via `klant_account_id`) is in migratie
 * 012 aangelegd en het `magPlanning`-recht is end-to-end bekabeld, maar de CRUD-backend en het echte
 * scherm volgen in Stap 2 t/m 4. Bewust géén nepdata — dan lijkt het werkend terwijl het dat niet is.
 *
 * Wat hier komt (afgestemd met Wouter, 07-08-2026):
 *   - Per klant planningsregels: activiteit (maand-/jaaractiviteit), periode/deadline, toegewezen
 *     medewerker, status (zelf te beheren in Beheer) en indicatie-uren (inschatting werklast).
 *   - Invoer op de klantkaart én in dit overzicht.
 *   - Sorteerbare tabel met dezelfde bovenbalk/kolommen/filters als Contactpersonen, plus de
 *     "Mijn cliënten / Kantoorbreed"-schakelaar en optelling van indicatie-uren per medewerker/periode
 *     en per klant.
 */
export default function PlanningOverzicht() {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Planning</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Dit overzicht wordt nog ingericht (Stap 1 — het fundament staat, het scherm volgt).
      </div>
      <div style={{ border: `1px solid ${KLEUR.rand}`, background: KLEUR.lichtblauw, borderRadius: 10, padding: 20, maxWidth: 760 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: KLEUR.blauw, marginBottom: 8 }}>Wat hier komt</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, lineHeight: 1.6 }}>
          Een simpele, eigen maand- en jaarplanning per klant. Per planningsregel: de activiteit, de
          periode en/of deadline, de toegewezen medewerker, een status (zelf te beheren) en een
          indicatie van de werkzaamheden in uren. Regels voer je in op de klantkaart én hier in dit
          overzicht, met zoeken, filteren, de &laquo;Mijn cli&euml;nten&raquo;-schakelaar en een
          optelling van de indicatie-uren.
        </div>
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 14, lineHeight: 1.6 }}>
          De gegevens komen uit een eigen tabel in de portaaldatabase (geen koppeling met Offsoo). Het
          fundament — de tabel en het toegangsrecht &laquo;Planning&raquo; (Beheer &rarr; Medewerkers) —
          staat nu; de invoer en het overzicht worden in de volgende stappen gebouwd.
        </div>
      </div>
    </div>
  );
}
