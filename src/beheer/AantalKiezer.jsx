/**
 * De regelaantal-kiezer die onder de lijsten in het beheerdersportaal staat: links "x van y getoond",
 * rechts de knoppen 25 / 50 / 100 / 250 / 500 / Alle.
 *
 * Stond eerst als lokale hulpcomponent in BeheerPortaal.jsx. Nu de kiezer ook onder lijsten in andere
 * beheerschermen hoort (o.a. de voorbeelddocumenten bij Beheer → Notulen) staat hij hier apart:
 * BeheerPortaal importeert hem uit dit bestand, zodat er maar één reeks en één uiterlijk is. Andersom
 * importeren — vanuit een deelscherm terug uit BeheerPortaal — zou een kringetje opleveren, want
 * BeheerPortaal laadt die deelschermen zelf.
 */

const KLEUR = {
  blauw: "#1C5D8C",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
};

// De vaste keuzes voor "hoeveel regels wil ik zien". Overal in het portaal dezelfde reeks, en
// overal 25 als startwaarde — een beheerscherm opent zo altijd snel, ook bij duizenden regels.
export const AANTAL_KEUZES = [[25, "25"], [50, "50"], [100, "100"], [250, "250"], [500, "500"], [Infinity, "Alle"]];
export const AANTAL_STANDAARD = 25;

export function AantalKiezer({ aantal, setAantal, totaal, extraTekst }) {
  const getoond = Math.min(aantal === Infinity ? totaal : aantal, totaal);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
        {getoond} van {totaal} getoond{extraTekst ? ` · ${extraTekst}` : ""}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: KLEUR.mutedTekst }}>Toon:</span>
        {AANTAL_KEUZES.map(([n, lbl]) => (
          <button
            key={lbl}
            onClick={() => setAantal(n)}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${aantal === n ? KLEUR.blauw : KLEUR.rand}`,
              background: aantal === n ? KLEUR.blauw : "#fff",
              color: aantal === n ? "#fff" : KLEUR.subtekst,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AantalKiezer;
