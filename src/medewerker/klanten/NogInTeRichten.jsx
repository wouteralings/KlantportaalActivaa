const KLEUR = {
  blauw: "#1C5D8C",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
};

/**
 * Tijdelijk scherm voor een tabblad dat nog gevuld moet worden. Bewust géén nepdata of
 * halve tabel: dan lijkt het werkend terwijl het dat niet is. In plaats daarvan staat er
 * kort wat er komt en waar de gegevens vandaan gaan komen, zodat het voor iedereen die het
 * tegenkomt duidelijk is dat dit nog in de maak is.
 */
export default function NogInTeRichten({ titel, watKomtEr }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{titel}</div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Dit overzicht wordt nog ingericht.
      </div>
      <div style={{ border: `1px solid ${KLEUR.rand}`, background: KLEUR.lichtblauw, borderRadius: 10, padding: 20, maxWidth: 720 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: KLEUR.blauw, marginBottom: 8 }}>Wat hier komt</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, lineHeight: 1.6 }}>{watKomtEr}</div>
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 14, lineHeight: 1.6 }}>
          De gegevens komen uit Dynamics. Zodra duidelijk is in welke tabel en velden ze staan,
          wordt dit tabblad gevuld met een overzicht in dezelfde opzet als het klantoverzicht:
          zoeken, kolommen kiezen, sorteren en filteren.
        </div>
      </div>
    </div>
  );
}
