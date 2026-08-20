/**
 * Statusbadge voor een opgemaakt stuk (notulen, dividend, liquidatie) in het logboek.
 *
 * Wat je in één oogopslag wilt weten is: is dit alleen opgemaakt, of is het al de deur uit — en zo
 * ja, hoe. Die drie toestanden hebben elk hun eigen kleur, met de datum en de ontvanger eronder,
 * zodat je niet in het klantlogboek hoeft te duiken om te zien wat er met een stuk gebeurd is.
 *
 * De gegevens komen uit het `verstuurd`-blok dat de opslag-endpoints wegschrijven:
 *   { op, variant: "mail" | "ondertekenen", naar, onderwerp, taakGedaan, formulierMee }
 * Ontbreekt dat blok, dan is het stuk alleen opgesteld en verder nog nergens heen gegaan.
 */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237",
};

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }

function tijdstip(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

/** De toestand van een stuk als { label, kleur, achtergrond, rand, toelichting }. */
export function stukStatus(record) {
  const v = record && record.verstuurd;
  if (!v || !veiligeStr(v.op)) {
    return {
      sleutel: "opgemaakt",
      label: "Opgemaakt",
      kleur: KLEUR.subtekst,
      achtergrond: "#F2F3F0",
      rand: KLEUR.rand,
      toelichting: "nog niet verstuurd",
    };
  }
  const wanneer = tijdstip(v.op);
  const naar = veiligeStr(v.naar);
  if (v.variant === "ondertekenen") {
    // De taak kan zijn mislukt terwijl de mail wél weg is; dat is precies het geval waarin je moet
    // ingrijpen, dus dat verdient een eigen (rode) melding en niet dezelfde badge als "gelukt".
    const gelukt = v.taakGedaan === true;
    return {
      sleutel: gelukt ? "ondertekening" : "ondertekening-fout",
      label: gelukt ? "Ter ondertekening" : "Ter ondertekening — taak mislukt",
      kleur: gelukt ? KLEUR.goud : KLEUR.rood,
      achtergrond: gelukt ? "#FFFBEB" : "#FDF2F2",
      rand: gelukt ? `${KLEUR.goud}55` : KLEUR.rood,
      toelichting: [wanneer, naar && `aan ${naar}`].filter(Boolean).join(" · "),
    };
  }
  return {
    sleutel: "gemaild",
    label: "Gemaild",
    kleur: KLEUR.groen,
    achtergrond: "#EAF6EE",
    rand: "#BFE0CB",
    toelichting: [wanneer, naar && `aan ${naar}`].filter(Boolean).join(" · "),
  };
}

/** De badge zelf, met de datum en ontvanger eronder. */
export default function StukStatus({ record }) {
  const s = stukStatus(record);
  const v = (record && record.verstuurd) || {};
  return (
    <div>
      <span
        style={{
          display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
          color: s.kleur, background: s.achtergrond, border: `1px solid ${s.rand}`, whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </span>
      {s.toelichting && (
        <div style={{ marginTop: 3, fontSize: 11, color: KLEUR.mutedTekst }}>{s.toelichting}</div>
      )}
      {v.formulierMee === true && (
        <div style={{ marginTop: 2, fontSize: 11, color: KLEUR.mutedTekst }}>incl. KvK-formulier</div>
      )}
    </div>
  );
}
