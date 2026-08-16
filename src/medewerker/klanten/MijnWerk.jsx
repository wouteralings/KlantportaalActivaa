/**
 * "Mijn werk" — de ingelogde medewerker tekent zíjn eigen toegewezen werk af, nu als matrix:
 * klanten in de rijen, hoofdtaken (hoofdactiviteiten) in de kolommen, met een statuskleur per cel
 * (open / bezig / gereed). Filteren kan op klant, klantgroep en taak. Klik een cel om de deelstappen
 * van die hoofdtaak voor die klant af te tekenen; alle deelstappen af → de cel is "Gereed".
 *
 * Toont alleen de hoofdactiviteiten (uit de per-klant planning-configuratie) die in de gekozen periode
 * aan JOU zijn toegewezen — als vaste toewijzing (toegewezenAan) of via je rol op de klant.
 *
 * Data + opslaan via /api/mw-planning-deelactiviteiten (zelfde als het Afwikkeling-scherm).
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { ClipboardCheck, ListChecks, ChevronLeft, ChevronRight, ChevronDown, CheckSquare, Square, CheckCircle2, Loader2, Search, X, Users, Building2 } from "lucide-react";
import { useMijnNaam } from "../MijnFilter";
import UrenSchrijvenPanel from "../UrenSchrijvenPanel";
import { werkRegels, MAANDEN, MAAND_KORT } from "./planningWerk";
import Deelactiviteiten from "./Deelactiviteiten";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089", rand: "#E2E4DF",
  rood: "#B23B3B", roodBg: "#FBEAEA", roodRand: "#EAC4C4",
  groen: "#2E7D46", groenBg: "#E7F3EB", groenRand: "#BFE3C9",
  amber: "#A9660C", amberBg: "#FFF4E5", amberRand: "#F2D9A8", lichtblauw: "#EAF2F8",
};
// De uit de deelstappen AFGELEIDE status (bepaalt ook de celkleur) — staat in het statusfilter boven
// de handmatige beheer-statussen. Sleutels moeten los blijven van de beheer-statussleutels.
const AFGELEIDE_STATUSSEN = [["open", "Open"], ["bezig", "Bezig"], ["gereed", "Gereed"]];
// Rij- en kopje-stijl in de "Werk van"-combobox.
const werkVanRij = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 12.5, cursor: "pointer", color: "#1C2321" };
const werkVanKopje = { padding: "8px 10px 3px", fontSize: 10.5, fontWeight: 700, color: "#8A9089", textTransform: "uppercase", letterSpacing: ".03em" };
const pad = (n) => String(n).padStart(2, "0");
const datumKort = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL"); };

// teamPersoon/valtInMaand/MAANDEN staan in planningWerk.js — gedeeld met Planning → "Gepland vs geschreven".

const uurTekst = (n) => `${Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u`;

/**
 * Voortgangsbalk boven de matrix: beschikbare uren in de periode, hoeveel er al is weggewerkt
 * (afgetekend én daadwerkelijk geschreven), en of het nog te doen werk nog in de resterende uren van
 * de periode past. Puur informatief — alle cijfers komen uit de indicatie-uren van de planning en de
 * capaciteit uit rooster/verlof.
 */
function VoortgangBalk({ v, periodeLabel, wie }) {
  const pctGereed = v.ingepland > 0 ? Math.min(100, Math.round((v.gereedUren / v.ingepland) * 100)) : 0;
  // Past het nog? Nog te doen versus wat er vanaf vandaag nog aan uren in de periode zit.
  const heeftRest = v.restBeschikbaar != null;
  const ruimte = heeftRest ? Math.round((v.restBeschikbaar - v.openUren) * 100) / 100 : null;
  const krap = heeftRest && ruimte < 0;
  const bijnaKrap = heeftRest && !krap && v.restBeschikbaar > 0 && v.openUren / v.restBeschikbaar > 0.85;
  const tegel = (label, waarde, kleur, hint) => (
    <div title={hint} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "7px 11px", background: "#fff", minWidth: 108 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: kleur || KLEUR.tekst }}>{waarde}</div>
      {hint ? <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>{hint}</div> : null}
    </div>
  );
  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "12px 14px", background: "#FBFCFB", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        {v.beschikbaar != null
          ? tegel("Beschikbaar", uurTekst(v.beschikbaar), KLEUR.tekst,
              `rooster ${uurTekst(v.roosterUren)}${v.verlof ? ` − verlof ${uurTekst(v.verlof)}` : ""}${v.productiviteit != null && v.productiviteit !== 1 ? ` × ${Math.round(v.productiviteit * 100)}%` : ""}`)
          : tegel("Beschikbaar", "—", KLEUR.mutedTekst, "geen rooster/tarief bekend")}
        {v.verlof ? tegel("Verlof", uurTekst(v.verlof), KLEUR.blauw, "goedgekeurd in deze periode") : null}
        {tegel("Ingepland", uurTekst(v.ingepland), KLEUR.blauw, `${v.taken} ${v.taken === 1 ? "taak" : "taken"} in ${periodeLabel}`)}
        {tegel("Gereed", uurTekst(v.gereedUren), KLEUR.groen, `${v.takenGereed}/${v.taken} taken afgetekend`)}
        {tegel("Geschreven", uurTekst(v.geschreven), v.geschreven ? KLEUR.tekst : KLEUR.mutedTekst,
          `op cliënten${v.geschrevenUxt ? ` · ${uurTekst(v.geschrevenUxt)} UXT` : ""}`)}
        {tegel("Verschil", v.verschil ? `${v.verschil > 0 ? "+" : "−"}${uurTekst(Math.abs(v.verschil))}` : "—",
          v.verschil > 0 ? KLEUR.rood : v.verschil < 0 ? KLEUR.groen : KLEUR.mutedTekst,
          v.verschil > 0 ? "meer geschreven dan gepland" : "geschreven t.o.v. gepland")}
        {tegel("Nog te doen", uurTekst(v.openUren), v.openUren ? KLEUR.amber : KLEUR.groen, `${v.taken - v.takenGereed} taken open`)}
        {heeftRest
          ? tegel("Resterend beschikbaar", uurTekst(v.restBeschikbaar), krap ? KLEUR.rood : bijnaKrap ? KLEUR.amber : KLEUR.groen,
              `nog ${v.restWerkdagen} werkdag${v.restWerkdagen === 1 ? "" : "en"}${v.restVerlof ? ` − ${uurTekst(v.restVerlof)} verlof` : ""}`)
          : null}
      </div>

      {/* Voortgang van het afgetekende werk t.o.v. alles wat in deze periode is ingepland. */}
      {v.ingepland > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 8, borderRadius: 999, background: "#EDEFEA", overflow: "hidden" }}>
            <div style={{ width: `${pctGereed}%`, height: "100%", background: KLEUR.groen, transition: "width .2s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: KLEUR.subtekst, marginTop: 5 }}>
            <span><strong style={{ color: KLEUR.tekst }}>{pctGereed}%</strong> van het ingeplande werk is afgetekend</span>
            {heeftRest && (
              <span style={{ color: krap ? KLEUR.rood : bijnaKrap ? KLEUR.amber : KLEUR.groen, fontWeight: 600 }}>
                {krap
                  ? `${uurTekst(Math.abs(ruimte))} meer werk dan er nog beschikbaar is`
                  : `${uurTekst(ruimte)} ruimte over na het nog te doen werk`}
              </span>
            )}
          </div>
        </div>
      )}

      {v.zonderIndicatie > 0 && (
        <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
          {v.zonderIndicatie} {v.zonderIndicatie === 1 ? "taak heeft" : "taken hebben"} geen indicatie-uren — die tellen als 0 mee. Stel ze in bij Beheer → Planning of in de planning-configuratie van de klant.
        </div>
      )}
      {v.productiviteit === 1 && v.gevonden && (
        <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
          Er is nog geen productiviteit (declarabel-doel %) ingesteld, dus er wordt met 100% van de roosteruren gerekend — Beheer → Uren → Tarieven.
        </div>
      )}
      {!v.gevonden && (
        <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
          Geen rooster/uurtarief gevonden voor {wie}, dus de beschikbare uren kunnen niet worden berekend (Beheer → Uren → Tarieven).
        </div>
      )}
    </div>
  );
}

/**
 * Eén overzicht met de voortgang van ALLE medewerkers die je mag zien: beschikbare (productieve)
 * uren, goedgekeurd verlof, wat er is ingepland, wat er al gereed/geschreven is en of het nog te doen
 * werk nog in de resterende uren past. Gesorteerd op krapte, dus wie achterloopt staat bovenaan.
 */
function TeamVoortgang({ rijen, periodeLabel, open, setOpen, ikLc, alles = false }) {
  const kop = { textAlign: "right", fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const cel = { fontSize: 12, padding: "7px 8px", borderBottom: `1px solid ${KLEUR.rand}`, textAlign: "right", whiteSpace: "nowrap" };
  const achterlopers = rijen.filter((r) => r.ruimte != null && r.ruimte < 0).length;
  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 14px", background: "#FBFCFB", border: "none", borderBottom: open ? `1px solid ${KLEUR.rand}` : "none", cursor: "pointer" }}
      >
        <Users size={15} color={KLEUR.blauw} />
        <span style={{ fontSize: 13, fontWeight: 700, color: KLEUR.tekst }}>Voortgang per medewerker</span>
        <span style={{ fontSize: 12, color: KLEUR.mutedTekst }} title={alles ? "Kantoorbreed — je bent beheerder of hebt het Planning-recht" : "Jouw team: de medewerkers die jou in Beheer → Uren (Tarieven & deadline per medewerker) als leidinggevende hebben"}>· {periodeLabel} · {rijen.length} {rijen.length === 1 ? "medewerker" : "medewerkers"}{alles ? "" : " (mijn team)"}</span>
        {achterlopers > 0 && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.rood, background: KLEUR.roodBg, border: `1px solid ${KLEUR.roodRand}`, borderRadius: 999, padding: "1px 8px" }}>
            {achterlopers} loopt achter
          </span>
        )}
        <span style={{ flex: 1 }} />
        <ChevronDown size={16} color={KLEUR.mutedTekst} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
            <thead>
              <tr>
                <th style={{ ...kop, textAlign: "left" }}>Medewerker</th>
                <th style={kop} title="Productiviteit: het declarabel-doel % uit Beheer → Uren → Tarieven">Prod.</th>
                <th style={kop} title="Goedgekeurd verlof in deze periode (gaat van de beschikbare uren af)">Verlof</th>
                <th style={kop} title="Roosteruren − goedgekeurd verlof, maal de productiviteit">Beschikbaar</th>
                <th style={kop} title="Som van de indicatie-uren van alle aan deze persoon toegewezen hoofdtaken">Ingepland</th>
                <th style={kop}>Gereed</th>
                <th style={kop} title="Alle uren die deze medewerker in deze periode op cliënten heeft geschreven">Geschreven</th>
                <th style={kop} title="Geschreven − gepland. Positief (rood) = er is MEER geschreven dan ingepland; UXT-uren staan er apart bij, want die worden als meerwerk gefactureerd.">Verschil</th>
                <th style={kop}>Nog te doen</th>
                <th style={kop} title="Uren die er vanaf vandaag nog in deze periode zitten">Resterend</th>
                <th style={{ ...kop, textAlign: "left", minWidth: 150 }} title="Ingepland werk t.o.v. de beschikbare productieve uren">Bezetting</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => {
                const krap = r.ruimte != null && r.ruimte < 0;
                const bijna = !krap && r.ruimte != null && r.restBeschikbaar > 0 && r.openUren / r.restBeschikbaar > 0.85;
                const bezKleur = r.bezetting == null ? KLEUR.mutedTekst : r.bezetting > 100 ? KLEUR.rood : r.bezetting >= 85 ? KLEUR.amber : KLEUR.groen;
                return (
                  <tr key={r.lc} style={{ background: r.lc === ikLc ? KLEUR.lichtblauw : "transparent" }}>
                    <td style={{ ...cel, textAlign: "left", fontWeight: 600 }}>
                      {r.naam}
                      {krap && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: KLEUR.rood, background: KLEUR.roodBg, border: `1px solid ${KLEUR.roodRand}`, borderRadius: 999, padding: "1px 7px" }}>loopt achter</span>}
                      {bijna && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, borderRadius: 999, padding: "1px 7px" }}>krap</span>}
                      {!r.inCapaciteit && <span title="Geen rooster/uurtarief gevonden — Beheer → Uren → Tarieven" style={{ marginLeft: 6, fontSize: 10, color: KLEUR.mutedTekst }}>geen rooster</span>}
                    </td>
                    <td style={{ ...cel, color: r.productiviteit == null || r.productiviteit === 1 ? KLEUR.mutedTekst : KLEUR.tekst }}>
                      {r.productiviteit == null ? "—" : `${Math.round(r.productiviteit * 100)}%`}
                    </td>
                    <td style={{ ...cel, color: r.verlof ? KLEUR.blauw : KLEUR.mutedTekst }} title={r.restVerlof ? `waarvan ${uurTekst(r.restVerlof)} vanaf vandaag` : undefined}>
                      {r.verlof ? uurTekst(r.verlof) : "—"}
                    </td>
                    <td style={cel}>{r.beschikbaar == null ? "—" : uurTekst(r.beschikbaar)}</td>
                    <td style={{ ...cel, fontWeight: 600 }}>{uurTekst(r.ingepland)}</td>
                    <td style={{ ...cel, color: KLEUR.groen }}>{uurTekst(r.gereedUren)}<span style={{ color: KLEUR.mutedTekst, fontWeight: 400 }}> · {r.takenGereed}/{r.taken}</span></td>
                    <td style={{ ...cel, color: r.geschreven ? KLEUR.tekst : KLEUR.mutedTekst }} title={r.geschrevenUxt ? `waarvan ${uurTekst(r.geschrevenUxt)} UXT (meerwerk)` : undefined}>
                      {r.geschreven ? uurTekst(r.geschreven) : "—"}
                      {r.geschrevenUxt ? <div style={{ fontSize: 10, color: KLEUR.blauw }}>{uurTekst(r.geschrevenUxt)} UXT</div> : null}
                    </td>
                    <td style={{ ...cel, fontWeight: 700, color: r.verschil > 0 ? KLEUR.rood : r.verschil < 0 ? KLEUR.groen : KLEUR.mutedTekst }}
                      title={r.verschil > 0 ? `Er is ${uurTekst(r.verschil)} méér geschreven dan gepland${r.geschrevenUxt ? ` (waarvan ${uurTekst(r.geschrevenUxt)} als UXT/meerwerk)` : ""}` : undefined}>
                      {r.verschil ? `${r.verschil > 0 ? "+" : "−"}${uurTekst(Math.abs(r.verschil))}` : "—"}
                    </td>
                    <td style={{ ...cel, color: r.openUren ? KLEUR.amber : KLEUR.groen }}>{uurTekst(r.openUren)}</td>
                    <td style={{ ...cel, color: krap ? KLEUR.rood : KLEUR.tekst }}>{r.restBeschikbaar == null ? "—" : uurTekst(r.restBeschikbaar)}</td>
                    <td style={{ ...cel, textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ position: "relative", flex: 1, minWidth: 80, height: 8, borderRadius: 999, background: "#EDEFEA", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, r.bezetting || 0)}%`, height: "100%", background: bezKleur }} />
                          {r.ingepland > 0 && r.pctGereed != null && (
                            <div title={`${r.pctGereed}% van het ingeplande werk is afgetekend`} style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, Math.round((r.bezetting || 0) * (r.pctGereed / 100)))}%`, background: KLEUR.groen }} />
                          )}
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: bezKleur, minWidth: 38, textAlign: "right" }}>{r.bezetting == null ? "—" : `${r.bezetting}%`}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rijen.length === 0 && (
                <tr><td colSpan={11} style={{ ...cel, textAlign: "center", color: KLEUR.mutedTekst, padding: 18 }}>Geen medewerkers om te tonen.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: KLEUR.mutedTekst, padding: "8px 12px", lineHeight: 1.5 }}>
            <strong>Beschikbaar</strong> = (rooster − goedgekeurd verlof) × productiviteit (het declarabel-doel % per medewerker).
            De donkergroene balk is het deel dat al is afgetekend. <strong>Loopt achter</strong> = er staat meer werk open dan er
            vanaf vandaag nog aan productieve uren in {periodeLabel} zit. Gesorteerd op krapte.
          </div>
        </div>
      )}
    </div>
  );
}

// Statuskleur van één cel (hoofdtaak × klant).
function celStatus(item) {
  if (!item) return null;
  if (item.gereed) return { kind: "gereed", label: item.total ? `${item.done}/${item.total}` : "Gereed", bg: KLEUR.groenBg, kleur: KLEUR.groen, rand: KLEUR.groenRand };
  if (item.done > 0) return { kind: "bezig", label: `${item.done}/${item.total}`, bg: KLEUR.amberBg, kleur: KLEUR.amber, rand: KLEUR.amberRand };
  return { kind: "open", label: item.total ? `0/${item.total}` : "Open", bg: KLEUR.roodBg, kleur: KLEUR.rood, rand: KLEUR.roodRand };
}

export default function MijnWerk({ isBeheerder = false, magPlanning = false, magAftekenen = true, subRechten = null } = {}) {
  // Kantoorbreed meekijken is voor de beheerder en de planner (het granulaire Planning-recht). Een
  // LEIDINGGEVENDE ziet zijn eigen team — dat volgt uit de capaciteits-API, die scoopt op de
  // leidinggevende uit Beheer → Uren → "Tarieven & deadline per medewerker". De server bewaakt
  // dezelfde grens; dit is alleen de weergave.
  const magAlles = isBeheerder || magPlanning;
  const nu = new Date();
  const { mijnNaam, geladen: naamGeladen } = useMijnNaam();
  // Beheerders mogen ook het werk van een ANDERE medewerker bekijken/aftekenen ("" = mijzelf).
  const [bekeken, setBekeken] = useState("");
  // Klantgroep-verfijning: beperkt het getoonde werk tot de klanten in die groep. Staat LOS van de
  // medewerker-keuze (ze zijn combineerbaar) en is voor iedereen beschikbaar — ook een gewone
  // medewerker mag zijn eigen werk tot één klantgroep beperken.
  const [bekekenGroep, setBekekenGroep] = useState("");
  const [medewerkerLijst, setMedewerkerLijst] = useState([]);
  // Type-to-search combobox voor "Werk van" (medewerkers + klantgroepen in één lijst).
  const [werkVanOpen, setWerkVanOpen] = useState(false);
  const [werkVanZoek, setWerkVanZoek] = useState("");
  const werkVanRef = useRef(null);
  const [type, setType] = useState("maand"); // maand | jaar
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);
  // Alleen in de jaar-weergave: het hele jaar in één keer tonen i.p.v. filteren op de ingeplande maand.
  const [heelJaar, setHeelJaar] = useState(false);

  const [config, setConfig] = useState(null);
  const [geschrevenRijen, setGeschrevenRijen] = useState([]); // echt geschreven uren per medewerker × cliënt × soort
  const [geschrevenFout, setGeschrevenFout] = useState(false); // konden de geschreven uren niet worden opgehaald?
  const [activiteiten, setActiviteiten] = useState([]);
  const [urenPerBron, setUrenPerBron] = useState({}); // "acc|act|periode" → { uren, aantal } geschreven uren
  const [capaciteit, setCapaciteit] = useState(null); // { werkdagen, werkdagenResterend, medewerkers: [...] }
  const [teamOpen, setTeamOpen] = useState(false);    // overzicht "voortgang per medewerker" open?
  const [weergave, setWeergave] = useState("overzicht"); // overzicht (matrix + voortgang) | afwikkeling
  const [urenSchrijvenOpen, setUrenSchrijvenOpen] = useState(false); // uren schrijven zónder alles af te vinken
  const [statussen, setStatussen] = useState([]);      // { sleutel, label, kleur } — beheer-statussen
  const [klantenMap, setKlantenMap] = useState({});
  const [status, setStatus] = useState({});            // { "acc|act|deel" of "acc|act|__status__": {...} }
  const [klantDeelstappen, setKlantDeelstappen] = useState({}); // { "acc|act": [ {sleutel,label} ] }
  const [bezig, setBezig] = useState("");              // key die nu wordt opgeslagen
  const [fout, setFout] = useState("");

  // Filters + actieve cel (uitgeklapte deelstappen).
  const [klantZoek, setKlantZoek] = useState("");
  // Statusfilter: "" = alles. Eén gecombineerde lijst — de afgeleide status uit de deelstappen
  // ("open"/"bezig"/"gereed"), de handmatige beheer-statussen (op sleutel), en "__geen__" voor taken
  // zónder handmatig statuslabel.
  const [statusFilter, setStatusFilter] = useState("");
  const [verborgenTaken, setVerborgenTaken] = useState(() => new Set()); // hoofdtaken (kolommen) die verborgen zijn
  const [alleenOpen, setAlleenOpen] = useState(false);
  const [actieveCel, setActieveCel] = useState(null);  // { acc, actSleutel } of null

  const periode = type === "maand" ? `${jaar}-${pad(maand)}` : `${jaar}`;
  const periodeLabel = type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : String(jaar);
  const activiteitById = useMemo(() => Object.fromEntries(activiteiten.map((a) => [a.sleutel, a])), [activiteiten]);
  const activiteitOrder = useMemo(() => Object.fromEntries(activiteiten.map((a, i) => [a.sleutel, i])), [activiteiten]);
  const statusInfo = useMemo(() => Object.fromEntries((statussen || []).map((s) => [s.sleutel, s])), [statussen]);
  // Wiens werk tonen we? Standaard mijzelf. Een beheerder kan iedereen kiezen; een LEIDINGGEVENDE de
  // mensen uit zijn eigen team — dat zijn precies de medewerkers die /api/mw-planning-capaciteit
  // teruggeeft (dat endpoint scoopt al op leidinggevende, plus jezelf). Een gewone medewerker houdt
  // alleen zijn eigen werk en krijgt de keuze dus niet te zien.
  const teamNamen = useMemo(() => {
    const mij = String(mijnNaam || "").trim().toLowerCase();
    return ((capaciteit && capaciteit.medewerkers) || [])
      .map((m) => String(m.naam || "").trim())
      .filter((n) => n && n.toLowerCase() !== mij)
      .sort((a, b) => String(a).localeCompare(String(b), "nl"));
  }, [capaciteit, mijnNaam]);
  const magAndersBekijken = magAlles || teamNamen.length > 0;
  const bekekenNaam = magAndersBekijken && bekeken ? bekeken : (mijnNaam || "");
  const bekekenLc = String(bekekenNaam).trim().toLowerCase();
  // Klantgroep-verfijning actief? (Niet beheerder-gated: geldt voor iedereen.)
  const groepActief = !!bekekenGroep;

  useEffect(() => {
    fetch("/api/mw-planning-config").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setConfig(d.config || [])).catch(() => { setConfig([]); setFout("Configuratie kon niet worden geladen."); });
    fetch("/api/mw-planning-overzicht").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setActiviteiten(d.activiteiten || []); setStatussen(d.statussen || []); }).catch(() => setActiviteiten([]));
    // Al geschreven uren per planningstaak (kantoorbreed) — best-effort, puur informatief.
    fetch("/api/mw-uren-bron?soort=planning").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setUrenPerBron(d.perBron || {})).catch(() => setUrenPerBron({}));
    fetch("/api/beheer-klanten?alle=1").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const b = {}; (d.klanten || []).forEach((k) => { b[String(k.accountId || "").toLowerCase()] = k; }); setKlantenMap(b); }).catch(() => setKlantenMap({}));
    // Alleen beheerders: de medewerkerslijst voor de "werk van"-keuze.
    if (magAlles) {
      fetch("/api/mw-planning-medewerkers").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setMedewerkerLijst((d.medewerkers || []).map((m) => m.naam).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "nl")))).catch(() => setMedewerkerLijst([]));
    }
  }, [magAlles]);

  // Beschikbare capaciteit in de gekozen periode (rooster − goedgekeurd verlof), plus wat daarvan
  // resteert vanaf vandaag. Een beheerder kan het werk van iemand anders bekijken en heeft daarvoor
  // scope=alle nodig; een gewone medewerker krijgt sowieso zichzelf terug.
  useEffect(() => {
    const vraag = type === "maand" ? `maand=${jaar}-${pad(maand)}` : `jaar=${jaar}`;
    fetch(`/api/mw-planning-capaciteit?${vraag}${magAlles ? "&scope=alle" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCapaciteit(d || null))
      .catch(() => setCapaciteit(null));
    // De ECHT geschreven uren van deze periode (alle boekingen op cliënten, niet alleen wat er via de
    // planning-knop is geboekt). Nodig om te zien of er méér is geschreven dan gepland.
    fetch(`/api/mw-planning-geschreven?${vraag}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setGeschrevenRijen(d.rijen || []); setGeschrevenFout(false); })
      .catch(() => { setGeschrevenRijen([]); setGeschrevenFout(true); });
  }, [type, jaar, maand, magAlles]);

  useEffect(() => {
    setActieveCel(null);
    fetch(`/api/mw-planning-deelactiviteiten?periode=${periode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setStatus(d.status || {}); setKlantDeelstappen(d.klantDeelstappen || {}); })
      .catch(() => { setStatus({}); setKlantDeelstappen({}); });
  }, [periode]);

  // Andere cel geopend (of gesloten) → het los geopende uren-paneel weer dichtklappen.
  useEffect(() => { setUrenSchrijvenOpen(false); }, [actieveCel]);

  const effDeelstappen = (acc, actSleutel) => {
    const ov = klantDeelstappen[`${acc}|${actSleutel}`];
    return Array.isArray(ov) && ov.length ? ov : (activiteitById[actSleutel]?.deelstappen || []);
  };
  const stFor = (acc, actSleutel, deelSleutel) => status[`${acc}|${actSleutel}|${deelSleutel}`] || null;

  // Alle hoofdactiviteiten in deze periode, van IEDEREEN → per (klant × hoofdtaak) één item, met de
  // uitvoerder (`wieLc`) erbij. Hieruit komen zowel de eigen matrix (filteren op de bekeken persoon)
  // als het overzicht "voortgang per medewerker".
  const alleItems = useMemo(() => {
    // De werkvoorraad zelf komt uit de gedeelde helper (zelfde berekening als Planning → "Gepland vs
    // geschreven"); hier komt alleen de afteken-status uit de deelstappen erbij.
    return werkRegels({ config, activiteitById, klantenMap, type, jaar, maand }).map((r) => {
      const eff = effDeelstappen(r.acc, r.actSleutel);
      const total = eff.length;
      const done = total ? eff.filter((d) => stFor(r.acc, r.actSleutel, d.sleutel)?.gereed).length : 0;
      const gereed = total ? done === total : !!stFor(r.acc, r.actSleutel, "__hoofd__")?.gereed;
      const statusKey = (status[`${r.acc}|${r.actSleutel}|__status__`] || {}).statusKey || "";
      return { ...r, eff, done, total, gereed, statusKey };
    });
  }, [config, activiteitById, klantenMap, klantDeelstappen, status, type, maand, jaar]);

  // De werkvoorraad van de bekeken persoon (zonder de klantgroep-/statusverfijning, zodat de
  // voortgangscijfers niet meebewegen met een filter).
  const basisItems = useMemo(
    () => (bekekenLc ? alleItems.filter((it) => it.wieLc === bekekenLc) : []),
    [alleItems, bekekenLc]
  );

  // De getoonde items: de werkvoorraad met de maand-, klantgroep- en statusverfijning erop.
  const items = useMemo(() => basisItems.filter((it) => {
    // Jaar-weergave: filter op de ingeplande maand (uitvoermaand) — net als de maand-weergave, maar dan
    // voor jaartaken. Taken zónder ingestelde uitvoermaand tonen we altijd (ze horen bij geen enkele
    // maand en zouden anders overal verdwijnen), gemarkeerd als "geen maand". Met "Heel jaar" aan
    // vervalt dit filter.
    if (type === "jaar" && !heelJaar && it.uitvoerMaand && Number(it.uitvoerMaand) !== maand) return false;
    if (groepActief && it.klantgroep !== bekekenGroep) return false;
    if (statusFilter) {
      // Eén filter over twee soorten status: de afgeleide (uit de deelstappen) en de handmatige
      // (het beheer-statuslabel). "__geen__" = juist de taken zónder handmatig label.
      const afgeleid = it.gereed ? "gereed" : it.done > 0 ? "bezig" : "open";
      const past = statusFilter === "__geen__" ? !it.statusKey
        : AFGELEIDE_STATUSSEN.some(([k]) => k === statusFilter) ? afgeleid === statusFilter
        : it.statusKey === statusFilter;
      if (!past) return false;
    }
    return true;
  }), [basisItems, type, heelJaar, maand, groepActief, bekekenGroep, statusFilter]);

  /**
   * De ECHT geschreven uren, per medewerker: totaal, de splitsing standaard (abonnement) / meerwerk
   * (UXT), en per cliënt. Dit zijn alle urenboekingen op cliënten in de periode — niet alleen wat er
   * via de "Uren schrijven"-knop vanuit een planningstaak is geboekt. Alleen zó zie je of er méér is
   * geschreven dan gepland.
   */
  const geschrevenPerPersoon = useMemo(() => {
    // Koppelen op E-MAIL, niet op naam: een urenboeking bewaart de naam als snapshot op het moment van
    // boeken, en die kan afwijken van de Dynamics-naam waar de planning op werkt (bijv. met/zonder
    // titel). Via de capaciteitslijst (e-mail → naam) landt elke boeking bij de juiste persoon; is de
    // e-mail onbekend, dan valt hij terug op de naam uit de boeking zelf.
    const naamVanEmail = new Map(
      ((capaciteit && capaciteit.medewerkers) || [])
        .filter((m) => m.email)
        .map((m) => [String(m.email).trim().toLowerCase(), String(m.naam || "").trim().toLowerCase()])
    );
    const map = new Map();
    for (const g of geschrevenRijen) {
      const email = String(g.email || "").trim().toLowerCase();
      const lc = (email && naamVanEmail.get(email)) || String(g.naam || "").trim().toLowerCase();
      if (!lc) continue;
      if (!map.has(lc)) map.set(lc, { totaal: 0, abonnement: 0, uxt: 0, perKlant: {} });
      const r = map.get(lc);
      const u = Number(g.uren) || 0;
      const acc = String(g.accountId || "").toLowerCase();
      r.totaal += u;
      if (g.soort === "abonnement") r.abonnement += u;
      else if (g.soort === "uxt") r.uxt += u;
      if (acc) r.perKlant[acc] = (r.perKlant[acc] || 0) + u;
    }
    return map;
  }, [geschrevenRijen, capaciteit]);

  /**
   * Voortgang & capaciteit van de bekeken persoon in deze periode (maand of heel jaar):
   *   - beschikbaar        : rooster − goedgekeurd verlof (uit /api/mw-planning-capaciteit)
   *   - ingepland          : som van de indicatie-uren van al zijn/haar taken in deze periode
   *   - gereed / geschreven: wat er al is afgetekend resp. daadwerkelijk op geschreven
   *   - nog te doen        : indicatie-uren van de nog niet afgeronde taken
   *   - resterend beschikbaar: de uren die er vanaf vandaag nog in de periode zitten
   * Bewust op basis van `basisItems` (de hele werkvoorraad), zodat de cijfers niet meebewegen met de
   * zoek-/status-/klantgroepfilters.
   */
  const voortgang = useMemo(() => {
    const mij = (capaciteit && capaciteit.medewerkers || []).find((m) => String(m.naam || "").trim().toLowerCase() === bekekenLc) || null;
    let ingepland = 0, gereedUren = 0, openUren = 0, geschreven = 0, zonderIndicatie = 0, takenGereed = 0;
    for (const it of basisItems) {
      const u = Number(it.indicatieUren) || 0;
      if (it.indicatieUren == null) zonderIndicatie++;
      ingepland += u;
      if (it.gereed) { takenGereed++; gereedUren += u; } else openUren += u;
    }
    // Geschreven = ALLE uren die deze persoon in de periode op cliënten heeft geschreven (niet alleen
    // wat er vanuit een planningstaak is geboekt) — anders zegt het verschil met de planning niets.
    const gesch = geschrevenPerPersoon.get(bekekenLc) || { totaal: 0, abonnement: 0, uxt: 0 };
    geschreven = gesch.totaal;
    const rond = (n) => Math.round(n * 100) / 100;
    return {
      gevonden: !!mij,
      taken: basisItems.length, takenGereed, zonderIndicatie,
      ingepland: rond(ingepland), gereedUren: rond(gereedUren), openUren: rond(openUren), geschreven: rond(geschreven),
      geschrevenAbonnement: rond(gesch.abonnement), geschrevenUxt: rond(gesch.uxt),
      verschil: rond(geschreven - ingepland),
      beschikbaar: mij ? rond(Number(mij.beschikbaar) || 0) : null,
      roosterUren: mij ? rond(Number(mij.roosterUren) || 0) : null,
      verlof: mij ? rond(Number(mij.verlofGoedgekeurd) || 0) : null,
      restBeschikbaar: mij && mij.resterend ? rond(Number(mij.resterend.beschikbaar) || 0) : null,
      restWerkdagen: mij && mij.resterend ? mij.resterend.werkdagen : (capaciteit ? capaciteit.werkdagenResterend : null),
      restVerlof: mij && mij.resterend ? rond(Number(mij.resterend.verlof) || 0) : 0,
      productiviteit: mij && mij.declarabelFactor != null ? Number(mij.declarabelFactor) : null,
      beschikbaarBruto: mij ? rond(Number(mij.beschikbaarBruto) || 0) : null,
    };
  }, [basisItems, geschrevenPerPersoon, capaciteit, bekekenLc]);

  /**
   * Hetzelfde plaatje, maar dan in één overzicht voor ALLE medewerkers die je mag zien (leidinggevende:
   * je eigen team; beheerder met scope=alle: iedereen). Zo zie je in één oogopslag wie er achterloopt.
   * Gesorteerd op krapte: wie het minste ruimte overhoudt (nog te doen versus resterend beschikbaar)
   * staat bovenaan.
   */
  const teamVoortgang = useMemo(() => {
    const perPersoon = new Map();
    const zorg = (naam) => {
      const lc = String(naam || "").trim().toLowerCase();
      if (!perPersoon.has(lc)) {
        perPersoon.set(lc, {
          lc, naam: String(naam || "").trim() || "— niet toegewezen —",
          taken: 0, takenGereed: 0, ingepland: 0, gereedUren: 0, openUren: 0, geschreven: 0, geschrevenUxt: 0,
          beschikbaar: null, beschikbaarBruto: null, roosterUren: null, verlof: null, verlofAangevraagd: null,
          productiviteit: null, restBeschikbaar: null, inCapaciteit: false,
        });
      }
      return perPersoon.get(lc);
    };
    // Capaciteitskant: iedereen die je mag zien komt in de lijst, ook zonder ingepland werk.
    for (const m of (capaciteit && capaciteit.medewerkers) || []) {
      const p = zorg(m.naam);
      p.inCapaciteit = true;
      p.beschikbaar = Number(m.beschikbaar) || 0;
      p.beschikbaarBruto = Number(m.beschikbaarBruto) || 0;
      p.roosterUren = Number(m.roosterUren) || 0;
      p.verlof = Number(m.verlofGoedgekeurd) || 0;
      p.verlofAangevraagd = Number(m.verlofAangevraagd) || 0;
      p.productiviteit = m.declarabelFactor != null ? Number(m.declarabelFactor) : null;
      p.restBeschikbaar = m.resterend ? Number(m.resterend.beschikbaar) || 0 : null;
      p.restVerlof = m.resterend ? Number(m.resterend.verlof) || 0 : 0;
    }
    // Werklastkant: de ingeplande hoofdtaken van deze periode, per uitvoerder.
    for (const it of alleItems) {
      const p = zorg(it.wie);
      const u = Number(it.indicatieUren) || 0;
      p.taken++;
      p.ingepland += u;
      if (it.gereed) { p.takenGereed++; p.gereedUren += u; } else p.openUren += u;
    }
    // Geschreven kant: alle uren die deze persoon in de periode op cliënten schreef (kantoorbreed
    // opgehaald), zodat "meer geschreven dan gepland" echt klopt.
    for (const [lc, g] of geschrevenPerPersoon) {
      if (!perPersoon.has(lc)) continue; // buiten je scope — niet tonen
      const p = perPersoon.get(lc);
      p.geschreven = g.totaal;
      p.geschrevenUxt = g.uxt;
    }
    const rond = (n) => Math.round(n * 100) / 100;
    const rijen = [...perPersoon.values()]
      // Scope: alleen wie de capaciteits-API teruggeeft (je eigen team, of iedereen als beheerder).
      // Een beheerder ziet daarnaast ook wie wél werk heeft maar géén uurtarief/rooster — anders zou
      // die persoon stilletjes uit het overzicht vallen. "Niet toegewezen" werk valt sowieso af.
      .filter((p) => p.lc && (p.inCapaciteit || (magAlles && p.taken > 0)))
      .map((p) => ({
        ...p,
        ingepland: rond(p.ingepland), gereedUren: rond(p.gereedUren), openUren: rond(p.openUren), geschreven: rond(p.geschreven),
        geschrevenUxt: rond(p.geschrevenUxt),
        // Verschil = geschreven − gepland. Positief = er is MEER geschreven dan ingepland.
        verschil: rond(p.geschreven - p.ingepland),
        beschikbaar: p.beschikbaar == null ? null : rond(p.beschikbaar),
        pctGereed: p.ingepland > 0 ? Math.round((p.gereedUren / p.ingepland) * 100) : null,
        // Bezetting = ingepland werk t.o.v. de productieve uren in de periode.
        bezetting: p.beschikbaar ? Math.round((p.ingepland / p.beschikbaar) * 100) : null,
        // Ruimte = wat er ná het nog te doen werk nog aan productieve uren overblijft in de periode.
        ruimte: p.restBeschikbaar == null ? null : rond(p.restBeschikbaar - p.openUren),
      }));
    rijen.sort((a, b) => {
      if (a.ruimte == null && b.ruimte == null) return String(a.naam).localeCompare(String(b.naam), "nl");
      if (a.ruimte == null) return 1;
      if (b.ruimte == null) return -1;
      return a.ruimte - b.ruimte; // krapste (meest achterlopend) bovenaan
    });
    return rijen;
  }, [alleItems, geschrevenPerPersoon, capaciteit, magAlles]);

  // Kolommen: de hoofdtaken die in mijn werk voorkomen (op definitie-volgorde).
  const alleTaken = useMemo(() => {
    const perSleutel = new Map();
    for (const it of items) if (!perSleutel.has(it.actSleutel)) perSleutel.set(it.actSleutel, { sleutel: it.actSleutel, label: it.act.label });
    return [...perSleutel.values()].sort((a, b) => (activiteitOrder[a.sleutel] ?? 999) - (activiteitOrder[b.sleutel] ?? 999) || String(a.label).localeCompare(String(b.label), "nl"));
  }, [items, activiteitOrder]);
  const zichtbareTaken = alleTaken.filter((t) => !verborgenTaken.has(t.sleutel));

  // Rijen: per klant, met een map hoofdtaak→item.
  const klantRijen = useMemo(() => {
    const perKlant = new Map();
    for (const it of items) {
      if (!perKlant.has(it.acc)) perKlant.set(it.acc, { acc: it.acc, accountId: it.accountId, klantnaam: it.klantnaam, klantnummer: it.klantnummer, klantgroep: it.klantgroep, taken: {} });
      perKlant.get(it.acc).taken[it.actSleutel] = it;
    }
    return [...perKlant.values()].sort((a, b) => String(a.klantnaam).localeCompare(String(b.klantnaam), "nl"));
  }, [items]);

  // Alle klantgroepen uit de KLANTENLIJST (niet uit de zichtbare rijen) — anders zou je alleen de
  // groepen kunnen kiezen die al in je eigen werk voorkomen.
  const alleKlantgroepen = useMemo(
    () => [...new Set(Object.values(klantenMap).map((k) => k.groepsnaam).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "nl")),
    [klantenMap]
  );

  // "Werk van"-combobox: medewerkers + klantgroepen, gefilterd op wat je typt.
  const werkVanFilter = werkVanZoek.trim().toLowerCase();
  // Beheerder: alle medewerkers. Leidinggevende: zijn eigen team (uit de capaciteitslijst).
  const werkVanMedewerkers = useMemo(() => {
    const bron = magAlles && medewerkerLijst.length ? medewerkerLijst : teamNamen;
    return bron.filter((n) => n.toLowerCase() !== String(mijnNaam || "").toLowerCase() && (!werkVanFilter || n.toLowerCase().includes(werkVanFilter)));
  }, [magAlles, medewerkerLijst, teamNamen, mijnNaam, werkVanFilter]);
  const werkVanGroepen = useMemo(
    () => alleKlantgroepen.filter((g) => !werkVanFilter || g.toLowerCase().includes(werkVanFilter)),
    [alleKlantgroepen, werkVanFilter]
  );
  // Persoon en klantgroep zijn twee losse assen die tegelijk actief mogen zijn ("werk van Jan, binnen
  // klantgroep X"). Het label toont beide; wie niemand anders mag bekijken, ziet alleen het groep-deel.
  const persoonLabel = bekeken || (magAndersBekijken ? `Mijzelf${mijnNaam ? ` (${mijnNaam})` : ""}` : "");
  const werkVanLabel = [persoonLabel, bekekenGroep].filter(Boolean).join(" · ") || "Alle klantgroepen";
  const kiesWerkVan = (soort, waarde) => {
    if (soort === "medewerker") setBekeken(waarde);      // "" = mijzelf
    else setBekekenGroep(waarde);                        // "" = alle klantgroepen
    setActieveCel(null);
    setWerkVanOpen(false);
    setWerkVanZoek("");
  };

  // Klik buiten de combobox = sluiten (en de typtekst wissen, zodat je bij heropenen alles ziet).
  useEffect(() => {
    if (!werkVanOpen) return;
    const buiten = (e) => { if (werkVanRef.current && !werkVanRef.current.contains(e.target)) { setWerkVanOpen(false); setWerkVanZoek(""); } };
    document.addEventListener("mousedown", buiten);
    return () => document.removeEventListener("mousedown", buiten);
  }, [werkVanOpen]);

  const zichtbareRijen = useMemo(() => {
    const q = klantZoek.trim().toLowerCase();
    return klantRijen.filter((k) => {
      if (q && !`${k.klantnaam} ${k.klantnummer}`.toLowerCase().includes(q)) return false;
      if (alleenOpen) {
        const relevante = zichtbareTaken.map((t) => k.taken[t.sleutel]).filter(Boolean);
        if (relevante.length && relevante.every((it) => it.gereed)) return false;
      }
      return true;
    });
  }, [klantRijen, klantZoek, alleenOpen, zichtbareTaken]);

  const totaalCellen = items.length;
  const gereedCellen = items.filter((i) => i.gereed).length;

  // Geplande (indicatie-)uren van wat er nú in de matrix staat: per klantrij, per hoofdtaak-kolom en
  // het totaal van alles. Volgt dus wél de filters — het is de optelsom van de zichtbare regels.
  const rijTotalen = useMemo(() => {
    const perKlant = {}, perTaak = {}, leegPerKlant = {}, geschrevenPerKlant = {};
    const leegActiviteiten = new Set();
    const geschrevenVanMij = (geschrevenPerPersoon.get(bekekenLc) || {}).perKlant || {};
    let totaal = 0, leeg = 0, totaalGeschreven = 0;
    for (const rij of zichtbareRijen) {
      for (const t of zichtbareTaken) {
        const it = rij.taken[t.sleutel];
        if (!it) continue;
        const u = Number(it.indicatieUren) || 0;
        perKlant[rij.acc] = (perKlant[rij.acc] || 0) + u;
        perTaak[t.sleutel] = (perTaak[t.sleutel] || 0) + u;
        totaal += u;
        // Taken zonder indicatie-uren: die tellen als 0 mee en vertekenen het beeld, dus apart tellen.
        if (it.indicatieUren == null) {
          leeg++;
          leegPerKlant[rij.acc] = (leegPerKlant[rij.acc] || 0) + 1;
          leegActiviteiten.add(t.label);
        }
      }
    }
    // Geschreven uren van de bekeken persoon op deze klanten (alle boekingen, niet alleen vanuit de
    // planning) — zo zie je per klant of er meer tijd in ging dan gepland.
    for (const rij of zichtbareRijen) {
      const u = geschrevenVanMij[rij.acc] || 0;
      if (!u) continue;
      geschrevenPerKlant[rij.acc] = u;
      totaalGeschreven += u;
    }
    const rond = (n) => Math.round(n * 100) / 100;
    for (const k of Object.keys(perKlant)) perKlant[k] = rond(perKlant[k]);
    for (const k of Object.keys(perTaak)) perTaak[k] = rond(perTaak[k]);
    for (const k of Object.keys(geschrevenPerKlant)) geschrevenPerKlant[k] = rond(geschrevenPerKlant[k]);
    return { perKlant, perTaak, leegPerKlant, leeg, leegActiviteiten: [...leegActiviteiten], geschrevenPerKlant, totaal: rond(totaal), totaalGeschreven: rond(totaalGeschreven) };
  }, [zichtbareRijen, zichtbareTaken, geschrevenPerPersoon, bekekenLc]);

  // De aangeklikte cel (voor de aftekenen-popup) — live afgeleid, zodat de status meebeweegt met afvinken.
  const actieveRij = actieveCel ? klantRijen.find((r) => r.acc === actieveCel.acc) : null;
  const actiefItem = actieveRij ? actieveRij.taken[actieveCel.actSleutel] : null;
  const actieveStatus = actiefItem ? celStatus(actiefItem) : null;
  const STATUS_LABEL = { open: "Open", bezig: "Bezig", gereed: "Gereed" };
  // Bron-sleutel van deze planningstaak (klant × hoofdtaak × periode) — hieraan hangen de geschreven
  // uren, zodat je ze naast de indicatie-uren kunt zetten. Zelfde vorm als in urenDataverse.js.
  const bronSleutel = actiefItem ? `${actieveRij.acc}|${actiefItem.actSleutel}|${periode}` : "";
  const alGeschreven = (urenPerBron[bronSleutel] || {}).uren || 0;
  const urenPaneelZichtbaar = !!actiefItem && (actiefItem.gereed || urenSchrijvenOpen);

  const afvink = async (acc, actSleutel, deelSleutel, gereed) => {
    // Alleen-lezen rol: hard blokkeren, niet alleen de knop uitzetten.
    if (!magAftekenen) return;
    setFout("");
    const key = `${acc}|${actSleutel}|${deelSleutel}`;
    setBezig(key);
    const vorigeStatus = status;
    setStatus((p) => { const n = { ...p }; if (gereed) n[key] = { gereed: true, wie: mijnNaam || "(jij)", datum: new Date().toISOString() }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "afvink", accountId: acc, activiteit: actSleutel, periode, deelstap: deelSleutel, gereed }),
      });
      if (!res.ok) {
        const msg = res.status === 403 ? "Je hebt (nog) geen recht om af te tekenen." : ((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        throw new Error(msg);
      }
      const d = await res.json().catch(() => ({}));
      setStatus((p) => { const n = { ...p }; if (gereed && d.status) n[key] = d.status; else if (!gereed) delete n[key]; return n; });
    } catch (e) { setStatus(vorigeStatus); setFout(e.message || "Aftekenen mislukt."); } finally { setBezig(""); }
  };

  // Handmatige status (extra label) zetten voor (klant × hoofdtaak × periode), gekozen uit de beheer-
  // statussen. Los van het afvinken van deelstappen; "" wist de status. Optimistisch, met terugval.
  const zetItemStatus = async (acc, actSleutel, statusKey) => {
    // Alleen-lezen rol: hard blokkeren, niet alleen de keuzelijst uitzetten.
    if (!magAftekenen) return;
    setFout("");
    const key = `${acc}|${actSleutel}|__status__`;
    const vorige = status;
    setStatus((p) => { const n = { ...p }; if (statusKey) n[key] = { statusKey, wie: mijnNaam || "(jij)", datum: new Date().toISOString() }; else delete n[key]; return n; });
    try {
      const res = await fetch("/api/mw-planning-deelactiviteiten", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "status", accountId: acc, activiteit: actSleutel, periode, status: statusKey }),
      });
      if (!res.ok) { const msg = res.status === 403 ? "Je hebt (nog) geen recht om de planning bij te werken." : ((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); throw new Error(msg); }
    } catch (e) { setStatus(vorige); setFout(e.message || "Status opslaan mislukt."); }
  };

  const vorige = () => { if (type === "jaar") { setJaar((j) => j - 1); return; } if (maand === 1) { setMaand(12); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (type === "jaar") { setJaar((j) => j + 1); return; } if (maand === 12) { setMaand(1); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const toggleTaak = (sleutel) => setVerborgenTaken((s) => { const n = new Set(s); if (n.has(sleutel)) n.delete(sleutel); else n.add(sleutel); return n; });
  const filterActief = !!klantZoek.trim() || !!bekekenGroep || verborgenTaken.size > 0 || alleenOpen || !!statusFilter;

  const laden = config === null || !naamGeladen;

  const kop = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const cel = { padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "middle" };

  // Welke weergaven mag deze rol zien? (Beheer → Rollen & rechten → subpagina's van "Mijn werk".)
  const zichtWeergave = subRechten ? subRechten.zien : () => true;
  const zichtbareWeergaven = [["overzicht", "Mijn overzicht", ClipboardCheck], ["afwikkeling", "Afwikkeling", ListChecks]]
    .filter(([k]) => zichtWeergave(k));
  // Twee weergaven binnen "Mijn werk": het eigen overzicht (matrix + voortgang) en de Afwikkeling —
  // hetzelfde deelstappen-scherm als onder Planning, maar dan met de scope Mijzelf / Mijn team, zodat
  // ook een leidinggevende zónder Planning-recht het werk van zijn mensen kan aftekenen en volgen.
  const weergaveKnoppen = (
    <div style={{ display: zichtbareWeergaven.length > 1 ? "flex" : "none", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
      {zichtbareWeergaven.map(([k, label, Icon]) => {
        const aan = actieveWeergave === k;
        return (
          <button key={k} onClick={() => setWeergave(k)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20, border: "none",
            background: aan ? KLEUR.blauw : "transparent", color: aan ? "#fff" : KLEUR.blauw, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}><Icon size={14} /> {label}</button>
        );
      })}
    </div>
  );

  const actieveWeergave = zichtbareWeergaven.some(([k]) => k === weergave) ? weergave : (zichtbareWeergaven[0] || [])[0];
  if (!actieveWeergave) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Deze subpagina is voor jouw rol niet zichtbaar.</div>;
  }
  if (actieveWeergave === "afwikkeling") {
    return (
      <div>
        {weergaveKnoppen}
        <Deelactiviteiten magAlles={magAlles} standaardScope="mijzelf" />
      </div>
    );
  }

  return (
    <div>
    {weergaveKnoppen}
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
          <ClipboardCheck size={17} color={KLEUR.blauw} /> {magAndersBekijken && bekeken ? "Werk van" : "Mijn werk"}{bekekenNaam ? <span style={{ fontSize: 12.5, fontWeight: 500, color: KLEUR.mutedTekst }}>· {bekekenNaam}</span> : null}{groepActief ? <span style={{ fontSize: 12.5, fontWeight: 500, color: KLEUR.mutedTekst }}> · {bekekenGroep}</span> : null}{magAndersBekijken && bekeken ? <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 20, padding: "2px 8px", marginLeft: 6 }}>{magAlles ? (isBeheerder ? "als beheerder" : "als planner") : "als leidinggevende"}</span> : null}{!magAftekenen ? <span title="Je rol staat 'Mijn werk' op alleen-lezen; aftekenen is uitgeschakeld." style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, borderRadius: 20, padding: "2px 8px", marginLeft: 6 }}>alleen-lezen</span> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={vorige} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 14, fontWeight: 700, minWidth: type === "maand" ? 150 : 60, textAlign: "center" }}>{type === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : jaar}</div>
          <button onClick={volgende} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 7, background: "#fff", cursor: "pointer", color: KLEUR.subtekst }}><ChevronRight size={16} /></button>
          {type === "jaar" && (
            <select value={maand} onChange={(e) => setMaand(Number(e.target.value))} disabled={heelJaar} title={heelJaar ? "Uit: je ziet nu het hele jaar" : "Filter op ingeplande maand (standaard: huidige maand)"} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: heelJaar ? "#F4F5F2" : "#fff", color: heelJaar ? KLEUR.mutedTekst : KLEUR.tekst, cursor: heelJaar ? "default" : "pointer" }}>
              {MAANDEN.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
            </select>
          )}
          {type === "jaar" && (
            <label title="Toon alle jaartaken van dit jaar in één keer, ongeacht de ingeplande maand" style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: heelJaar ? 700 : 400, color: heelJaar ? KLEUR.blauw : KLEUR.subtekst, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={heelJaar} onChange={(e) => setHeelJaar(e.target.checked)} /> Heel jaar
            </label>
          )}
        </div>
      </div>

      {/* Bovenbalk: periode-type + filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["maand", "Per maand"], ["jaar", "Per jaar"]].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${type === k ? KLEUR.blauw : KLEUR.rand}`, background: type === k ? KLEUR.blauw : "#fff", color: type === k ? "#fff" : KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        {/* Zoek-en-kies: klantgroep voor iedereen, medewerker-namen alleen voor beheerders. */}
        <div ref={werkVanRef} style={{ position: "relative", fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {magAndersBekijken ? "Werk van" : "Klantgroep"}
            <button
              onClick={() => { setWerkVanOpen((o) => !o); setWerkVanZoek(""); }}
              title={magAndersBekijken ? "Kies een medewerker en/of een klantgroep — typ om te zoeken" : "Beperk je werk tot één klantgroep — typ om te zoeken"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 190, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: (bekeken || bekekenGroep) ? KLEUR.lichtblauw : "#fff", color: (bekeken || bekekenGroep) ? KLEUR.blauw : KLEUR.tekst, fontWeight: (bekeken || bekekenGroep) ? 700 : 400, cursor: "pointer", textAlign: "left" }}
            >
              {bekekenGroep ? <Building2 size={13} /> : bekeken ? <Users size={13} /> : null}
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{werkVanLabel}</span>
              <ChevronDown size={14} color={KLEUR.mutedTekst} />
            </button>
            {werkVanOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 62, zIndex: 30, width: 280, background: "#fff", border: `1px solid ${KLEUR.rand}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.10)", overflow: "hidden" }}>
                <div style={{ position: "relative", padding: 8, borderBottom: `1px solid ${KLEUR.rand}` }}>
                  <Search size={13} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    autoFocus
                    value={werkVanZoek}
                    onChange={(e) => setWerkVanZoek(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setWerkVanOpen(false); setWerkVanZoek(""); } }}
                    placeholder={magAndersBekijken ? "Zoek medewerker of klantgroep…" : "Zoek klantgroep…"}
                    style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px 6px 26px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 7 }}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto", padding: 4 }}>
                  {/* Medewerker-deel: alleen voor beheerders. Klantgroep-deel: voor iedereen. */}
                  {magAndersBekijken && (
                    <>
                      <button onClick={() => kiesWerkVan("medewerker", "")} style={{ ...werkVanRij, fontWeight: !bekeken ? 700 : 400 }}>
                        Mijzelf{mijnNaam ? ` (${mijnNaam})` : ""}
                      </button>
                      {werkVanMedewerkers.length > 0 && <div style={werkVanKopje}>{magAlles ? "Medewerkers" : "Mijn team"}</div>}
                      {werkVanMedewerkers.map((n) => (
                        <button key={`mw-${n}`} onClick={() => kiesWerkVan("medewerker", n)} style={{ ...werkVanRij, fontWeight: bekeken === n ? 700 : 400, color: bekeken === n ? KLEUR.blauw : KLEUR.tekst }}>{n}</button>
                      ))}
                    </>
                  )}
                  <div style={werkVanKopje}>Klantgroepen</div>
                  <button onClick={() => kiesWerkVan("klantgroep", "")} style={{ ...werkVanRij, fontWeight: !bekekenGroep ? 700 : 400 }}>Alle klantgroepen</button>
                  {werkVanGroepen.map((g) => (
                    <button key={`gr-${g}`} onClick={() => kiesWerkVan("klantgroep", g)} style={{ ...werkVanRij, fontWeight: bekekenGroep === g ? 700 : 400, color: bekekenGroep === g ? KLEUR.blauw : KLEUR.tekst }}>{g}</button>
                  ))}
                  {werkVanGroepen.length === 0 && (magAndersBekijken ? werkVanMedewerkers.length === 0 : true) && (
                    <div style={{ padding: "8px 10px", fontSize: 12, color: KLEUR.mutedTekst }}>Niets gevonden.</div>
                  )}
                </div>
              </div>
            )}
        </div>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={klantZoek} onChange={(e) => setKlantZoek(e.target.value)} placeholder="Zoek op klant of klantnummer…" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 32px", fontSize: 12.5, border: `1px solid ${KLEUR.rand}`, borderRadius: 8 }} />
        </div>
        <label style={{ fontSize: 12, color: KLEUR.subtekst, display: "inline-flex", alignItems: "center", gap: 6 }} title="Filter op status: bovenaan de status uit de deelstappen, daaronder de handmatige statuslabels uit Beheer → Planning">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: statusFilter ? KLEUR.lichtblauw : "#fff", color: statusFilter ? KLEUR.blauw : KLEUR.tekst, fontWeight: statusFilter ? 700 : 400, cursor: "pointer" }}>
            <option value="">Alle</option>
            <optgroup label="Voortgang">
              {AFGELEIDE_STATUSSEN.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </optgroup>
            {statussen.length > 0 && (
              <optgroup label="Statuslabel">
                {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
              </optgroup>
            )}
            <optgroup label="Overig">
              <option value="__geen__">— geen status —</option>
            </optgroup>
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: KLEUR.subtekst }}>
          <input type="checkbox" checked={alleenOpen} onChange={(e) => setAlleenOpen(e.target.checked)} /> Alleen openstaand
        </label>
        {filterActief && <button onClick={() => { setKlantZoek(""); setBekekenGroep(""); setVerborgenTaken(new Set()); setAlleenOpen(false); setStatusFilter(""); }} style={{ padding: "6px 10px", background: "#fff", color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Filters wissen</button>}
      </div>

      {/* Taak-filter (kolommen aan/uit) + statuslegenda */}
      {alleTaken.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", marginRight: 2 }}>Taken:</span>
          {alleTaken.map((t) => {
            const aan = !verborgenTaken.has(t.sleutel);
            return (
              <button key={t.sleutel} onClick={() => toggleTaak(t.sleutel)} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`, background: aan ? KLEUR.lichtblauw : "#fff", color: aan ? KLEUR.blauw : KLEUR.mutedTekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t.label}</button>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 11.5, color: KLEUR.subtekst }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: KLEUR.roodBg, border: `1px solid ${KLEUR.roodRand}` }} /> Open</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}` }} /> Bezig</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: KLEUR.groenBg, border: `1px solid ${KLEUR.groenRand}` }} /> Gereed</span>
          </span>
        </div>
      )}

      {/* Voortgang & capaciteit van deze persoon in deze periode */}
      {!laden && basisItems.length > 0 && (
        <VoortgangBalk
          v={voortgang}
          periodeLabel={periodeLabel}
          wie={magAndersBekijken && bekeken ? bekekenNaam : "jou"}
        />
      )}

      {/* Eén overzicht met iedereen die je mag zien — wie loopt achter? */}
      {!laden && teamVoortgang.length > 1 && (
        <TeamVoortgang
          rijen={teamVoortgang}
          periodeLabel={periodeLabel}
          open={teamOpen}
          setOpen={setTeamOpen}
          alles={magAlles}
          ikLc={String(mijnNaam || "").trim().toLowerCase()}
        />
      )}

      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 10 }}>
        <strong style={{ color: KLEUR.tekst }}>{zichtbareRijen.length}</strong> {zichtbareRijen.length === 1 ? "klant" : "klanten"} · {gereedCellen}/{totaalCellen} taken gereed
      </div>

      {fout && <div style={{ background: `${KLEUR.rood}12`, border: `1px solid ${KLEUR.rood}33`, color: KLEUR.rood, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>{fout}</div>}
      {geschrevenFout && (
        <div style={{ background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, color: KLEUR.amber, borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 12.5 }}>
          De geschreven uren konden niet worden opgehaald; de kolommen "Geschreven" en "Verschil" blijven daardoor leeg.
        </div>
      )}

      {laden ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Laden…</div>
      ) : !bekekenLc ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Je naam kon niet worden bepaald, dus je toegewezen werk kan niet worden getoond. Log opnieuw in of neem contact op met beheer.</div>
      ) : klantRijen.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Er is voor deze periode niets aan {magAndersBekijken && bekeken ? bekekenNaam : "jou"} toegewezen{groepActief ? ` binnen klantgroep ${bekekenGroep}` : ""}{statusFilter ? " met deze status" : ""}.</div>
      ) : zichtbareRijen.length === 0 ? (
        <div style={{ color: KLEUR.mutedTekst, fontSize: 13, padding: "16px 0" }}>Geen klanten voor deze filters.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ ...kop, position: "sticky", left: 0, background: "#fff", zIndex: 2, minWidth: 200 }}>Klant</th>
                {zichtbareTaken.map((t) => <th key={t.sleutel} style={{ ...kop, textAlign: "center" }}>{t.label}</th>)}
                <th style={{ ...kop, textAlign: "right" }} title="Totaal geplande (indicatie-)uren van deze klant in deze periode">Geplande uren</th>
                <th style={{ ...kop, textAlign: "right" }} title="Uren die er in deze periode werkelijk op deze klant zijn geschreven">Geschreven uren</th>
              </tr>
            </thead>
            <tbody>
              {zichtbareRijen.map((rij) => {
                const celOpen = actieveCel && actieveCel.acc === rij.acc;
                return (
                  <tr key={rij.acc}>
                    <td style={{ ...cel, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>{rij.klantnaam}</div>
                      <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{rij.klantnummer ? `${rij.klantnummer}` : ""}{rij.klantnummer && rij.klantgroep ? " · " : ""}{rij.klantgroep || ""}</div>
                    </td>
                    {zichtbareTaken.map((t) => {
                      const it = rij.taken[t.sleutel];
                      const st = celStatus(it);
                      if (!st) return <td key={t.sleutel} style={{ ...cel, textAlign: "center", color: KLEUR.rand }}>—</td>;
                      const isActief = celOpen && actieveCel.actSleutel === t.sleutel;
                      // Heeft de taak een handmatig statuslabel? Dan is DAT de cel — het vervangt de
                      // afgeleide "Open/Bezig/Gereed" (staat er dus niet meer als los badge onder).
                      // De voortgang uit de deelstappen blijft als teller (2/3) in dezelfde badge staan.
                      const label = it.statusKey ? statusInfo[it.statusKey] : null;
                      const celKleur = label ? (label.kleur || KLEUR.mutedTekst) : st.kleur;
                      const celBg = label ? `${label.kleur || KLEUR.mutedTekst}18` : st.bg;
                      const celRand = label ? `${label.kleur || KLEUR.mutedTekst}55` : st.rand;
                      const celTekst = label ? `${label.label}${it.total ? ` · ${it.done}/${it.total}` : ""}` : st.label;
                      return (
                        <td key={t.sleutel} style={{ ...cel, textAlign: "center" }}>
                          <button
                            onClick={() => setActieveCel({ acc: rij.acc, actSleutel: t.sleutel })}
                            title={label ? `${t.label} — ${rij.klantnaam} · status: ${label.label} (voortgang: ${STATUS_LABEL[st.kind]}) · aftekenen` : `${t.label} — ${rij.klantnaam} · aftekenen`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 62, justifyContent: "center", padding: "4px 10px", borderRadius: 20, background: celBg, color: celKleur, border: `1px solid ${isActief ? celKleur : celRand}`, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                          >
                            {st.kind === "gereed" ? <CheckCircle2 size={12} /> : null}{celTekst}
                          </button>
                          {type === "jaar" && (
                            <div style={{ fontSize: 10, color: it.uitvoerMaand ? KLEUR.mutedTekst : KLEUR.amber, marginTop: 3, whiteSpace: "nowrap" }}>
                              {it.uitvoerMaand ? MAAND_KORT[it.uitvoerMaand - 1] : "geen maand"}
                            </div>
                          )}
                          {/* Geplande uren per taak — ontbreken ze, dan valt dat meteen op (ze tellen als 0 mee). */}
                          <div style={{ fontSize: 10, marginTop: 3, whiteSpace: "nowrap", color: it.indicatieUren == null ? KLEUR.amber : KLEUR.mutedTekst, fontWeight: it.indicatieUren == null ? 700 : 400 }}
                            title={it.indicatieUren == null ? "Geen indicatie-uren ingesteld — deze taak telt als 0 uur mee. Vul in bij Beheer → Planning (standaard) of in de planning-configuratie van deze klant." : "Geplande (indicatie-)uren"}>
                            {it.indicatieUren == null ? "⚠ geen uren" : uurTekst(it.indicatieUren)}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ ...cel, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }} title={`${rij.klantnaam}: totaal geplande uren in deze periode`}>
                      {rijTotalen.perKlant[rij.acc] ? uurTekst(rijTotalen.perKlant[rij.acc]) : <span style={{ color: KLEUR.rand, fontWeight: 400 }}>—</span>}
                      {rijTotalen.leegPerKlant[rij.acc] ? (
                        <div title={`${rijTotalen.leegPerKlant[rij.acc]} ${rijTotalen.leegPerKlant[rij.acc] === 1 ? "taak heeft" : "taken hebben"} geen indicatie-uren`} style={{ fontSize: 10, fontWeight: 700, color: KLEUR.amber }}>
                          ⚠ {rijTotalen.leegPerKlant[rij.acc]} zonder uren
                        </div>
                      ) : null}
                    </td>
                    {(() => {
                      const g = rijTotalen.geschrevenPerKlant[rij.acc] || 0;
                      const gepland = rijTotalen.perKlant[rij.acc] || 0;
                      const meer = Math.round((g - gepland) * 100) / 100;
                      return (
                        <td style={{ ...cel, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }} title={`${rij.klantnaam}: werkelijk geschreven uren in deze periode`}>
                          {g ? uurTekst(g) : <span style={{ color: KLEUR.rand, fontWeight: 400 }}>—</span>}
                          {g && meer > 0 ? <div style={{ fontSize: 10, fontWeight: 700, color: KLEUR.rood }} title="Meer geschreven dan gepland">+{uurTekst(meer)} t.o.v. plan</div> : null}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
            {/* Totaalregel: per hoofdtaak de som van alle klanten, en rechts het totaal van alles. */}
            <tfoot>
              <tr style={{ background: "#FBFCFB" }}>
                <td style={{ ...cel, position: "sticky", left: 0, background: "#FBFCFB", zIndex: 1, fontSize: 12, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}` }}>
                  Totaal <span style={{ fontWeight: 400, color: KLEUR.mutedTekst }}>· {zichtbareRijen.length} {zichtbareRijen.length === 1 ? "klant" : "klanten"}</span>
                </td>
                {zichtbareTaken.map((t) => (
                  <td key={t.sleutel} style={{ ...cel, textAlign: "center", fontSize: 12, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}`, whiteSpace: "nowrap" }}>
                    {rijTotalen.perTaak[t.sleutel] ? uurTekst(rijTotalen.perTaak[t.sleutel]) : <span style={{ color: KLEUR.rand, fontWeight: 400 }}>—</span>}
                  </td>
                ))}
                <td style={{ ...cel, textAlign: "right", fontSize: 13, fontWeight: 700, color: KLEUR.blauw, borderTop: `2px solid ${KLEUR.rand}`, whiteSpace: "nowrap" }}>
                  {uurTekst(rijTotalen.totaal)}
                  {rijTotalen.leeg > 0 && (
                    <div title={`Nog geen indicatie-uren bij: ${rijTotalen.leegActiviteiten.join(", ")}. Vul ze in bij Beheer → Planning (standaard per activiteit) of per klant in de planning-configuratie.`}
                      style={{ fontSize: 10, fontWeight: 700, color: KLEUR.amber }}>
                      ⚠ {rijTotalen.leeg} zonder uren
                    </div>
                  )}
                </td>
                <td style={{ ...cel, textAlign: "right", fontSize: 13, fontWeight: 700, borderTop: `2px solid ${KLEUR.rand}`, whiteSpace: "nowrap", color: rijTotalen.totaalGeschreven > rijTotalen.totaal ? KLEUR.rood : KLEUR.blauw }}>
                  {rijTotalen.totaalGeschreven ? uurTekst(rijTotalen.totaalGeschreven) : "—"}
                  {rijTotalen.totaalGeschreven > rijTotalen.totaal && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: KLEUR.rood }} title="Er is in totaal meer op deze klanten geschreven dan er gepland stond">
                      +{uurTekst(Math.round((rijTotalen.totaalGeschreven - rijTotalen.totaal) * 100) / 100)} t.o.v. plan
                    </div>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 10, lineHeight: 1.5 }}>
        Klanten in de rijen, jouw hoofdtaken in de kolommen. De kleur toont de status: <span style={{ color: KLEUR.rood, fontWeight: 700 }}>open</span>, <span style={{ color: KLEUR.amber, fontWeight: 700 }}>bezig</span> of <span style={{ color: KLEUR.groen, fontWeight: 700 }}>gereed</span>. Kies je in een cel zelf een <strong>statuslabel</strong> (bijv. "Wacht op klant"), dan komt dat label mét zijn eigen kleur in de plaats van open/bezig/gereed; de voortgang uit de deelstappen blijft als teller zichtbaar. Klik een cel om af te tekenen, je status te kiezen of gelijk je uren op de klant te schrijven. In de jaar-weergave filter je met de maand-keuze (standaard de huidige maand) op de ingeplande maand — vink <strong>Heel jaar</strong> aan om alle jaartaken in één keer te zien; jaartaken zonder ingestelde maand blijven altijd staan.
      </div>

      {/* Aftekenen-popup: deelstappen + status per taak; is de taak gereed, dan gelijk uren schrijven */}
      {actieveCel && actieveRij && actiefItem && (
        <div onClick={() => setActieveCel(null)} style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${KLEUR.rand}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: KLEUR.tekst }}>{actiefItem.act.label}</div>
                <div style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{actieveRij.klantnaam}{actieveRij.klantnummer ? ` · ${actieveRij.klantnummer}` : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {actieveStatus && <span style={{ fontSize: 11, fontWeight: 700, color: actieveStatus.kleur, background: actieveStatus.bg, border: `1px solid ${actieveStatus.rand}`, borderRadius: 999, padding: "2px 10px" }}>{STATUS_LABEL[actieveStatus.kind]}{actiefItem.total ? ` · ${actiefItem.done}/${actiefItem.total}` : ""}</span>}
                <button onClick={() => setActieveCel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: KLEUR.mutedTekst, padding: 2, display: "inline-flex" }}><X size={18} /></button>
              </div>
            </div>

            {/* Uren-regel: indicatie, urencode en wat er al geschreven is + knop om nu uren te schrijven. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 16px", background: "#FBFCFB", borderBottom: `1px solid ${KLEUR.rand}`, fontSize: 12 }}>
              <span style={{ color: KLEUR.subtekst }}>
                Indicatie: <strong style={{ color: KLEUR.tekst }}>{actiefItem.indicatieUren != null ? `${Number(actiefItem.indicatieUren).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u` : "—"}</strong>
              </span>
              <span style={{ color: KLEUR.subtekst }}>
                Geschreven: <strong style={{ color: alGeschreven ? KLEUR.groen : KLEUR.tekst }}>{alGeschreven ? `${Number(alGeschreven).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u` : "—"}</strong>
              </span>
              {actiefItem.urencode
                ? <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.blauw, background: KLEUR.lichtblauw, borderRadius: 999, padding: "2px 9px" }}>{actiefItem.urencode}</span>
                : <span style={{ fontSize: 11, color: KLEUR.mutedTekst }} title="Stel een urencode in bij Beheer → Planning of in de planning-configuratie van deze klant">geen urencode</span>}
              <span style={{ flex: 1 }} />
              {actieveRij.accountId && !urenPaneelZichtbaar && (
                <button onClick={() => setUrenSchrijvenOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: `1px solid ${KLEUR.blauw}`, borderRadius: 8, background: "#fff", color: KLEUR.blauw, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Uren schrijven
                </button>
              )}
            </div>

            <div style={{ padding: 16 }}>
              {statussen.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${KLEUR.rand}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Status</span>
                  <select value={actiefItem.statusKey || ""} disabled={!magAftekenen} onChange={(e) => zetItemStatus(actieveRij.acc, actiefItem.actSleutel, e.target.value)} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, background: "#fff", cursor: magAftekenen ? "pointer" : "default", opacity: magAftekenen ? 1 : 0.6 }}>
                    <option value="">— geen (kleur volgt de deelstappen) —</option>
                    {statussen.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
                  </select>
                  {actiefItem.statusKey && statusInfo[actiefItem.statusKey] && (
                    <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, color: statusInfo[actiefItem.statusKey].kleur, background: `${statusInfo[actiefItem.statusKey].kleur}18`, border: `1px solid ${statusInfo[actiefItem.statusKey].kleur}55`, borderRadius: 20, padding: "2px 9px" }}>{statusInfo[actiefItem.statusKey].label}</span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Deelstappen</div>
              {(actiefItem.total === 0 ? [{ sleutel: "__hoofd__", label: `${actiefItem.act.label} afgewikkeld` }] : actiefItem.eff).map((d) => {
                const s = stFor(actieveRij.acc, actiefItem.actSleutel, d.sleutel);
                const gereed = !!s?.gereed;
                const key = `${actieveRij.acc}|${actiefItem.actSleutel}|${d.sleutel}`;
                return (
                  <div key={d.sleutel} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: `1px solid ${KLEUR.rand}55`, borderLeft: d.kleur ? `3px solid ${d.kleur}` : "3px solid transparent", paddingLeft: 8 }}>
                    <button disabled={bezig === key || !magAftekenen} onClick={() => afvink(actieveRij.acc, actiefItem.actSleutel, d.sleutel, !gereed)} title={!magAftekenen ? "Je mag hier alleen lezen" : undefined} style={{ background: "none", border: "none", cursor: (bezig === key || !magAftekenen) ? "default" : "pointer", color: gereed ? KLEUR.groen : KLEUR.mutedTekst, opacity: !magAftekenen ? 0.5 : 1, padding: 0, display: "inline-flex" }}>
                      {gereed ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                    {d.kleur ? <span style={{ width: 10, height: 10, borderRadius: 3, background: d.kleur, flexShrink: 0 }} /> : null}
                    <span style={{ flex: 1, fontSize: 13.5, color: KLEUR.tekst, fontWeight: gereed ? 600 : 400 }}>{d.label}</span>
                    {gereed
                      ? <span style={{ fontSize: 11, color: KLEUR.mutedTekst, whiteSpace: "nowrap" }}>{s?.wie || ""}{s?.datum ? ` · ${datumKort(s.datum)}` : ""}</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.amber, background: KLEUR.amberBg, border: `1px solid ${KLEUR.amberRand}`, borderRadius: 999, padding: "1px 8px" }}>open</span>}
                  </div>
                );
              })}

              {urenPaneelZichtbaar && (
                <div style={{ marginTop: 16 }}>
                  {actieveRij.accountId ? (
                    <UrenSchrijvenPanel
                      key={`${actieveRij.acc}|${actiefItem.actSleutel}|${periode}`}
                      accountId={actieveRij.accountId}
                      klantnaam={actieveRij.klantnaam}
                      voorgesteldeUren={actiefItem.indicatieUren != null ? actiefItem.indicatieUren : ""}
                      omschrijving={actiefItem.act.label}
                      urencode={actiefItem.urencode || ""}
                      bron={{ soort: "planning", id: bronSleutel, label: `${actiefItem.act.label} · ${periode}` }}
                      onGeboekt={(u) => setUrenPerBron((h) => {
                        const vorig = h[bronSleutel] || { uren: 0, aantal: 0 };
                        return { ...h, [bronSleutel]: { uren: Math.round((vorig.uren + Number(u || 0)) * 100) / 100, aantal: vorig.aantal + 1 } };
                      })}
                      onOverslaan={() => (urenSchrijvenOpen ? setUrenSchrijvenOpen(false) : setActieveCel(null))}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen cliënt gekoppeld, dus er kunnen geen uren worden geschreven.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
