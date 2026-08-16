import { useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, X, Eye, EyeOff, Lock, Unlock, Sparkles } from "lucide-react";
import DossierSjablonenPerSoort, { DossierMailTaakPerSoort } from "./DossierSjablonenBeheer";

// Soorten met een voorbeeld-documentmodule (blanco A4 in het dossier) — het bijbehorende
// "Voorbeelddocumenten"-blok komt onder de indelingskaart van die soort te hangen (zie de export
// onderaan). Vooralsnog alleen notulen en dividenduitkering (op verzoek van Wouter).
const SOORTEN_MET_SJABLONEN = new Set(["notulen", "dividend"]);

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald, zie bijv.
 *  ContractenTypesBeheer.jsx — deze bestanden staan bewust op zichzelf). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#A67C00",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none" };

// Standaard review-instellingen per dossiersoort — moet gelijk lopen met STANDAARD_REVIEW in
// api/_gedeeld/dossierReview.js. LET OP: elke dossiersoort heeft zijn eigen status-optieset, dus
// dezelfde getalswaarde betekent per soort iets anders. Alleen IB en VPB kennen echte
// review-statussen (601280001 "gereed voor review", 601280002 "aanpassen na review"); bij dividend
// en notulen zouden die "Verzonden naar client" resp. "Getekend" betekenen, dus daar geen default.
const STANDAARD_REVIEW_CFG = {
  aan: false,
  taakSoort: "", taakOnderwerp: "Review {soort} {periode} — {klant}", taakRubriek: "",
  statusAanvraag: "",
  akkoordTaakSoort: "", akkoordTaakOnderwerp: "Afronden na review: {soort} {periode} — {klant}", statusAkkoord: "",
  aanpassenTaakSoort: "", aanpassenTaakOnderwerp: "Aanpassen na review: {soort} {periode} — {klant}", statusAanpassen: "",
};
const REVIEW_STATUS_DEFAULTS = {
  ib: { statusAanvraag: 601280001, statusAanpassen: 601280002 },
  vpb: { statusAanvraag: 601280001, statusAanpassen: 601280002 },
};
const standaardReviewVoor = (soort) => ({ ...STANDAARD_REVIEW_CFG, ...(REVIEW_STATUS_DEFAULTS[soort] || {}) });

// Dossier-taakketen ná "versturen naar de cliënt" — moet gelijk lopen met STANDAARD_KETEN in
// api/_gedeeld/dossierTaakketen.js. Alles leeg = die stap gebeurt niet.
const STANDAARD_KETEN_CFG = {
  statusVersturen: "",
  akkoordTaakSoort: "", akkoordTaakOnderwerp: "Versturen naar Belastingdienst: {soort} {periode} — {klant}",
  akkoordTaakRubriek: "", statusAkkoord: "",
  statusVervolgKlaar: "", inactiefNaVervolg: false,
  // Dezelfde keten, maar voor een VOORLOPIGE aangifte: alleen andere dossierstatussen.
  voorlopigStatusVersturen: "", voorlopigStatusAkkoord: "", voorlopigStatusVervolgKlaar: "",
};

// Voorlopige aangifte — moet gelijk lopen met STANDAARD_VOORLOPIG in api/_gedeeld/dossierVoorlopig.js.
const STANDAARD_VOORLOPIG_CFG = {
  aan: false,
  redenen: [
    { sleutel: "jaarcijfers-onderneming", label: "Wacht op jaarcijfers onderneming", actief: true },
    { sleutel: "buitenlands-inkomen", label: "Buitenlands inkomen nog onbekend", actief: true },
    { sleutel: "ontbrekende-stukken", label: "Ontbrekende stukken van de cliënt", actief: true },
    { sleutel: "teruggaaf-versnellen", label: "Teruggaaf versnellen", actief: true },
  ],
  status: "", taakSoort: "", taakOnderwerp: "Moet de voorlopige aangifte {soort} {periode} herzien worden?",
  taakRubriek: "", herzienDag: 1, herzienMaand: 12,
};
const MAANDNAMEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const redenSleutel = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// Types die via "Nieuw veld aanmaken" in Dynamics aangemaakt kunnen worden — zelfde vijf typen
// als de rest van de catalogus ondersteunt (zie VeldInvoer in MedewerkerPortaal.jsx). Keuzelijst
// (picklist) zit hier bewust nog niet bij: dat vraagt ook eigen opties/optionset-beheer, een
// aparte, latere uitbreiding.
const NIEUW_VELD_TYPES = [
  { type: "boolean", label: "Ja/Nee" },
  { type: "string", label: "Tekst (kort)" },
  { type: "memo", label: "Tekst (lang)" },
  { type: "decimal", label: "Getal" },
  { type: "datetime", label: "Datum" },
];

function nieuweSectieSleutel(bestaande) {
  let n = bestaande.length + 1;
  while (bestaande.some((s) => s.sleutel === `sectie${n}`)) n++;
  return `sectie${n}`;
}
function nieuweSubsectieSleutel(sectieSleutel, bestaande) {
  let n = bestaande.length + 1;
  while (bestaande.some((s) => s.sleutel === `${sectieSleutel}-sub${n}`)) n++;
  return `${sectieSleutel}-sub${n}`;
}
// Zelfde diakrieten-strip als api/dossier-kolom-aanmaken (los gehouden, dit bestand is frontend).
function maakSleutelSlug(tekst) {
  const basis = String(tekst || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return basis || "veld";
}

/** Eén regel voor één veld — zowel in een hoofdrubriek (pad = sectieSleutel) als in een
 * subrubriek (pad = "sectieSleutel::subSleutel") — met alle beheeracties: label hernoemen,
 * voorwaarde, alleen-lezen, verbergen, herordenen, verplaatsen en uit de sectie halen. */
function VeldRij({ veldKey, veld, weergaveLabel, pad, padOpties, index, laatsteIndex, isVerborgen, isAlleenLezen, voorwaarde, conditieVelden, picklistOpties, onZetLabel, onLabelBlur, onZetVoorwaarde, onToggleVerborgen, onToggleAlleenLezen, onOmhoog, onOmlaag, onVerplaats, onVerwijderUitSectie }) {
  // Voorwaarde-editor: een veld kan afhankelijk van de UITKOMST van één of meer andere velden getoond
  // worden. Per veld één of meer "regels" (elk: een ja/nee-veld op Ja/Nee, of een keuzelijst die één van
  // meerdere aangevinkte antwoorden IS / NIET is), gecombineerd met "en" (alle) of "of" (minstens één).
  // Terugwaarts compatibel met de oude vormen: string (ja/nee-veld), { veld, waarde/waarden, negatie }
  // (één regel) en { modus, regels:[...] } (meerdere regels).
  const genormaliseerd = (() => {
    if (!voorwaarde) return { modus: "of", regels: [] };
    if (typeof voorwaarde === "string") return { modus: "of", regels: [{ veld: voorwaarde, waarde: true }] };
    if (Array.isArray(voorwaarde.regels)) return { modus: voorwaarde.modus === "en" ? "en" : "of", regels: voorwaarde.regels.filter((r) => r && r.veld) };
    if (voorwaarde.veld) return { modus: "of", regels: [voorwaarde] };
    return { modus: "of", regels: [] };
  })();
  const modus = genormaliseerd.modus;
  const regels = genormaliseerd.regels;
  const parentVan = (k) => (conditieVelden || []).find((v) => v.key === k) || null;
  const nieuweRegelVoor = (k) => {
    const p = parentVan(k);
    if (p && p.type === "boolean") return { veld: k, waarde: true };
    const opts = (picklistOpties && picklistOpties[k]) || [];
    return { veld: k, waarden: opts.length ? [opts[0].waarde] : [], negatie: false };
  };
  // Opslaan in de compacte vorm: 0 regels = geen voorwaarde, 1 regel = die regel zelf (oude vorm),
  // ≥2 regels = { modus, regels } — zo blijven bestaande enkele voorwaarden ongewijzigd opgeslagen.
  const bewaarRegels = (nieuweRegels, nieuweModus = modus) => {
    const schoon = (nieuweRegels || []).filter((r) => r && r.veld);
    if (schoon.length === 0) { onZetVoorwaarde(null); return; }
    if (schoon.length === 1) { onZetVoorwaarde(schoon[0]); return; }
    onZetVoorwaarde({ modus: nieuweModus === "en" ? "en" : "of", regels: schoon });
  };
  const kiesEersteVeld = (k) => { if (k) bewaarRegels([...regels, nieuweRegelVoor(k)]); };
  const voegRegelToe = () => {
    const gebruikt = new Set(regels.map((r) => r.veld));
    const kandidaat = (conditieVelden || []).find((v) => v.key !== veldKey && !gebruikt.has(v.key)) || (conditieVelden || []).find((v) => v.key !== veldKey);
    if (kandidaat) bewaarRegels([...regels, nieuweRegelVoor(kandidaat.key)]);
  };
  const verwijderRegel = (i) => bewaarRegels(regels.filter((_, idx) => idx !== i));
  const zetRegelVeld = (i, k) => bewaarRegels(regels.map((x, idx) => (idx === i ? nieuweRegelVoor(k) : x)));
  const zetRegelBool = (i, token) => bewaarRegels(regels.map((x, idx) => (idx === i ? { veld: x.veld, waarde: token !== "nee" } : x)));
  const zetRegelNegatie = (i, neg) => bewaarRegels(regels.map((x, idx) => (idx === i ? { ...x, negatie: neg } : x)));
  const toggleRegelWaarde = (i, w) => bewaarRegels(regels.map((x, idx) => {
    if (idx !== i) return x;
    const arr = Array.isArray(x.waarden) ? x.waarden : (x.waarde !== undefined && x.waarde !== null ? [x.waarde] : []);
    const heeft = arr.some((v) => String(v) === String(w));
    const waarden = heeft ? arr.filter((v) => String(v) !== String(w)) : [...arr, w];
    return { veld: x.veld, waarden, negatie: !!x.negatie };
  }));
  const zetModus = (m) => bewaarRegels(regels, m);
  const regelWaardenSet = (r) => new Set((Array.isArray(r.waarden) ? r.waarden : (r.waarde !== undefined && r.waarde !== null ? [r.waarde] : [])).map((w) => String(w)));
  const veldSelectStijl = { ...invoerStijl, padding: "4px 6px", fontSize: 11.5, maxWidth: 160 };
  return (
    <div style={{ padding: "6px 8px", borderRadius: 6, background: "#FBFBF9", opacity: isVerborgen ? 0.6 : 1 }}>
      {/* Hoofdregel: naam + status + type + acties. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          value={weergaveLabel}
          onChange={(e) => onZetLabel(e.target.value)}
          onBlur={onLabelBlur}
          title="Weergavenaam van dit veld in Beheer en het medewerkersportaal"
          style={{ ...invoerStijl, flex: 1, minWidth: 0, fontSize: 12.5, padding: "4px 7px", background: "#fff" }}
        />
        {isVerborgen && <span style={{ fontSize: 10, fontWeight: 700, color: KLEUR.rood, textTransform: "uppercase", letterSpacing: ".02em" }}>Verborgen</span>}
        {isAlleenLezen && <span style={{ fontSize: 10, fontWeight: 700, color: KLEUR.goud, textTransform: "uppercase", letterSpacing: ".02em" }}>Alleen-lezen</span>}
        <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".02em" }}>{veld ? veld.type.replace("vast-", "") : ""}</span>
        {regels.length === 0 && (
          <select value="" onChange={(e) => kiesEersteVeld(e.target.value)} title="Dit veld alleen tonen afhankelijk van (de uitkomst van) een ander veld" style={veldSelectStijl}>
            <option value="">Altijd tonen</option>
            {(conditieVelden || []).filter((b) => b.key !== veldKey).map((b) => (
              <option key={b.key} value={b.key}>Alleen als: {b.label}{b.type === "picklist" ? " (keuze)" : ""}</option>
            ))}
          </select>
        )}
        <button onClick={onToggleAlleenLezen} title={isAlleenLezen ? "Weer bewerkbaar maken in medewerkersportaal" : "Alleen-lezen maken in medewerkersportaal"} style={{ background: "none", border: "none", color: isAlleenLezen ? KLEUR.goud : KLEUR.subtekst, cursor: "pointer", padding: 2, display: "flex" }}>
          {isAlleenLezen ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
        <button onClick={onToggleVerborgen} title={isVerborgen ? "Weer zichtbaar maken" : "Verbergen (blijft op deze plek staan)"} style={{ background: "none", border: "none", color: isVerborgen ? KLEUR.rood : KLEUR.subtekst, cursor: "pointer", padding: 2, display: "flex" }}>
          {isVerborgen ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button onClick={onOmhoog} disabled={index === 0} title="Omhoog" style={{ background: "none", border: "none", color: index === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: index === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={14} /></button>
        <button onClick={onOmlaag} disabled={index === laatsteIndex} title="Omlaag" style={{ background: "none", border: "none", color: index === laatsteIndex ? KLEUR.rand : KLEUR.subtekst, cursor: index === laatsteIndex ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={14} /></button>
        <select value={pad} onChange={(e) => onVerplaats(e.target.value)} style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5 }}>
          {padOpties(pad)}
        </select>
        <button onClick={onVerwijderUitSectie} title="Uit deze indeling halen (naar 'Niet ingedeeld')" style={{ background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 2, display: "flex" }}><X size={13} /></button>
      </div>

      {/* Voorwaarde-editor: één of meer regels, gecombineerd met en/of. */}
      {regels.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${KLEUR.rand}`, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: KLEUR.subtekst, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>Alleen tonen als</span>
            {regels.length >= 2 && (
              <select value={modus} onChange={(e) => zetModus(e.target.value)} title="Alle voorwaarden moeten kloppen (en), of minstens één (of)" style={{ ...invoerStijl, padding: "2px 5px", fontSize: 11 }}>
                <option value="of">minstens één (of)</option>
                <option value="en">alle (en)</option>
              </select>
            )}
            <span>{regels.length >= 2 ? "van deze voorwaarden klopt:" : "deze voorwaarde klopt:"}</span>
          </div>
          {regels.map((r, i) => {
            const p = parentVan(r.veld);
            const opts = p && p.type === "picklist" ? ((picklistOpties && picklistOpties[r.veld]) || []) : [];
            const wset = regelWaardenSet(r);
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                <select value={r.veld} onChange={(e) => zetRegelVeld(i, e.target.value)} style={veldSelectStijl}>
                  {(conditieVelden || []).filter((b) => b.key !== veldKey).map((b) => (
                    <option key={b.key} value={b.key}>{b.label}{b.type === "picklist" ? " (keuze)" : ""}</option>
                  ))}
                </select>
                {p && p.type === "boolean" && (
                  <select value={r.waarde === false ? "nee" : "ja"} onChange={(e) => zetRegelBool(i, e.target.value)} style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5, maxWidth: 90 }}>
                    <option value="ja">is Ja</option>
                    <option value="nee">is Nee</option>
                  </select>
                )}
                {p && p.type === "picklist" && (
                  <>
                    <select value={r.negatie ? "isniet" : "is"} onChange={(e) => zetRegelNegatie(i, e.target.value === "isniet")} title="Tonen als het keuzeveld één van de aangevinkte antwoorden is (is), of juist niet (is niet)" style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5 }}>
                      <option value="is">is</option>
                      <option value="isniet">is niet</option>
                    </select>
                    {opts.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 96, overflowY: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, padding: "4px 6px", background: "#fff", minWidth: 140 }} title="Vink één of meerdere antwoorden aan">
                        {opts.map((o) => (
                          <label key={String(o.waarde)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <input type="checkbox" checked={wset.has(String(o.waarde))} onChange={() => toggleRegelWaarde(i, o.waarde)} />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: KLEUR.mutedTekst, alignSelf: "center" }}>(opties onbekend)</span>
                    )}
                  </>
                )}
                <button onClick={() => verwijderRegel(i)} title="Deze voorwaarde verwijderen" style={{ background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 2, display: "flex", alignSelf: "center" }}><X size={13} /></button>
              </div>
            );
          })}
          <div>
            <button onClick={voegRegelToe} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: `1px dashed ${KLEUR.rand}`, color: KLEUR.blauw, cursor: "pointer", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}><Plus size={12} /> voorwaarde</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Beheer → Dossiers: hiermee bepaalt Wouter zelf hoe de IB-dossiervelden (rechtstreeks uit
 * Dynamics, zie api/_gedeeld/dossierVelden.js — inclusief de "vaste" velden Status van de
 * aangifte/URL dossier/Documentlink) verdeeld worden over hoofdrubrieken (secties, zelf ook in
 * volgorde te zetten) en optionele subrubrieken daarbinnen, op de dossierpagina in het
 * medewerkersportaal — i.p.v. een vaste, door ons opgelegde indeling. Standaard staat de indeling
 * gelijk aan de tabbladen van het echte Dynamics-formulier (Algemeen/Box I/II/III/Review), maar
 * elk veld is vrij naar een andere (of nieuwe) hoofd-/subrubriek te verplaatsen en te herordenen,
 * en elk veld (ook de vaste) heeft een zelf aan te passen weergavenaam. Een veld dat in geen
 * enkele rubriek zit, wordt in het medewerkersportaal niet getoond (zie de "Niet ingedeeld"-lijst
 * onderaan). Elk veld kan daarnaast verborgen (nooit tonen) en/of alleen-lezen (tonen maar niet
 * bewerkbaar, ook server-side afgedwongen) gezet worden, en voorwaardelijk gemaakt worden op een
 * ander ja/nee-veld. Onderaan kan Wouter ook zelf een volledig nieuw veld aanmaken — dat maakt
 * een echte nieuwe kolom aan op de Dynamics-tabel (zie api/dossier-kolom-aanmaken).
 *
 * Opslag: hergebruikt het generieke /api/beheer-instellingen (PUT { dossierIndeling }) — geen
 * eigen endpoint nodig voor de indeling zelf. Alleen de "ib"-sleutel wordt hier gelezen/
 * geschreven; eventuele latere andere soorten (bijv. straks vpb) blijven met rust (zie bewaar()).
 */
const SOORTEN_TABS = [
  { key: "ib", label: "Inkomstenbelasting", dynamicsTabel: "Inkomstenbelasting" },
  { key: "vpb", label: "Vennootschapsbelasting", dynamicsTabel: "Vennootschapsbelasting" },
  { key: "dividend", label: "Dividenduitkeringen", dynamicsTabel: "Dividenduitkering" },
  { key: "notulen", label: "Notulen", dynamicsTabel: "Notulen" },
];

// Eén zelfstandig, inklapbaar indeling-paneel voor één dossiersoort (ib of vpb). De pagina rendert er
// twee onder elkaar (zie de default export onderaan), elk met exact dezelfde functies.
function SoortIndelingPaneel({ soort, onderaan }) {
  const [open, setOpen] = useState(false); // hele paneel dichtgeklapt bij openen van de pagina
  const [catalogus, setCatalogus] = useState(null); // null = laden
  const [dossierIndeling, setDossierIndeling] = useState(null); // volledig object uit instellingen (alle soorten)
  const [secties, setSecties] = useState(null); // werk-kopie van dossierIndeling.ib.secties (elk met optionele subsecties)
  const [verborgen, setVerborgen] = useState([]); // sleutels die in het medewerkersdossier nooit getoond worden
  const [voorwaarden, setVoorwaarden] = useState({}); // { childKey: voorwaarde } — ja/nee-veld óf keuzeveld-uitkomst (zie VeldRij)
  const [picklistOpties, setPicklistOpties] = useState({}); // keuzelijst-opties per veld (key → [{waarde,label}]) voor de voorwaarde-waardekeuze
  const [alleenLezen, setAlleenLezen] = useState([]); // sleutels die wel getoond maar niet bewerkt mogen worden
  const [labels, setLabels] = useState({}); // { sleutel: eigen weergavenaam } — overschrijft het standaardlabel
  const [aangepasteVelden, setAangepasteVelden] = useState([]); // zelf aangemaakte extra catalogusvelden (incl. Dynamics-kolom)
  const [onderwerpen, setOnderwerpen] = useState([]); // catalogus uit Beheer → Onderwerpen (Uitvraag dynamisch), voor de koppel-dropdown
  const [onderwerpId, setOnderwerpId] = useState(""); // gekoppeld onderwerp voor deze dossiersoort — leeg = geen koppeling
  // Bestandsnaam-sjabloon voor de "Aangifte versturen"-dropzones in het IB-dossier (zie
  // DossierDetail/AangifteVersturenModal in MedewerkerPortaal.jsx) — los van dossierIndeling,
  // dus met een eigen laad-/opslaanstatus i.p.v. via bewaar() hieronder.
  const [bestandsnaamTemplate, setBestandsnaamTemplate] = useState("");
  const [bestandsnaamStatus, setBestandsnaamStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  // Mail-sjabloon (onderwerp + tekst) voor diezelfde dropzones — los van bewaar() hieronder en met
  // een eigen "Opslaan"-knop (i.p.v. onBlur zoals de bestandsnaam) omdat het hier 2 samenhangende
  // velden zijn die je meestal samen aanpast.
  const [mailOnderwerpTemplate, setMailOnderwerpTemplate] = useState("");
  const [mailTekstTemplate, setMailTekstTemplate] = useState("");
  const [mailStatus, setMailStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  // Pad (submap na cr283_sharepoint), taak-onderwerp en taak-soort voor diezelfde "Aangifte
  // versturen"-actie — samen in één blok met één "Opslaan"-knop (net als het mail-blok hierboven).
  // De taak-soort-opties komen uit /api/beheer-taaksoorten (dezelfde optieset cr283_soortactiecategorie
  // die ook Beheer → Taken gebruikt), zodat je een échte taaksoort kiest i.p.v. een nummer te typen.
  const [padTemplate, setPadTemplate] = useState("");
  const [taakOnderwerpTemplate, setTaakOnderwerpTemplate] = useState("");
  const [taakSoort, setTaakSoort] = useState(""); // optiesetwaarde als string in de <select>
  const [taakSoortOpties, setTaakSoortOpties] = useState([]); // [{ waarde, label }]
  // Rubriek (cr283_rubriek) — optioneel, zelfde bron/opzet als taakSoort maar dan via
  // /api/beheer-taakrubrieken (op verzoek van Wouter, 07-08-2026).
  const [taakRubriek, setTaakRubriek] = useState("");
  const [taakRubriekOpties, setTaakRubriekOpties] = useState([]); // [{ waarde, label }]
  const [taakInstellingStatus, setTaakInstellingStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  // ── Dossier-review (instellingen-sleutel `dossierReview`, zie api/_gedeeld/dossierReview.js) ──
  //    Eén genest object per dossiersoort i.p.v. losse top-level sleutels: het zijn er tien per
  //    soort, en zo blijft de opslag overzichtelijk.
  const [reviewCfg, setReviewCfg] = useState(null);          // null = nog niet geladen
  const [alleReviewCfg, setAlleReviewCfg] = useState({});    // de andere soorten, ongemoeid terugschrijven
  const [statusOpties, setStatusOpties] = useState([]);      // [{ waarde, label }] van deze soort
  const [reviewStatus, setReviewStatus] = useState("rust");  // rust | bezig | opgeslagen | fout
  // ── Dossier-taakketen ná versturen (instellingen-sleutel `dossierAkkoord`) ──
  const [ketenCfg, setKetenCfg] = useState(null);        // null = nog niet geladen
  const [alleKetenCfg, setAlleKetenCfg] = useState({});  // andere soorten ongemoeid terugschrijven
  const [ketenStatus, setKetenStatus] = useState("rust");
  // ── Voorlopige aangifte (instellingen-sleutel `dossierVoorlopig`) ──
  const [voorlopigCfg, setVoorlopigCfg] = useState(null);        // null = nog niet geladen
  const [alleVoorlopigCfg, setAlleVoorlopigCfg] = useState({});
  const [voorlopigStatus, setVoorlopigStatus] = useState("rust");
  const [nieuweReden, setNieuweReden] = useState("");
  // Heeft deze dossiersoort een veld "reviewnotitie"? Zo niet, dan komt de opmerking van de reviewer
  // alleen in de vervolgtaak — dat zeggen we er dan bij (IB en VPB hebben het veld, dividend/notulen niet).
  const heeftReviewNotitieVeld = (catalogus || []).some((v) => v && v.key === "reviewnotitie");
  const [fout, setFout] = useState("");
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [nieuweSectieTitel, setNieuweSectieTitel] = useState("");
  const [nieuweSubsectieTitel, setNieuweSubsectieTitel] = useState({}); // { sectieSleutel: draftTitel }
  const [nieuwVeldLabel, setNieuwVeldLabel] = useState("");
  const [nieuwVeldType, setNieuwVeldType] = useState("boolean");
  const [nieuwVeldBezig, setNieuwVeldBezig] = useState(false);
  const [nieuwVeldFout, setNieuwVeldFout] = useState("");
  // "Bestaande kolom toevoegen": nog niet gebruikte custom-kolommen uit de Dynamics-tabel (lazy geladen).
  const [beschikbareKolommen, setBeschikbareKolommen] = useState(null); // null = nog niet geladen
  const [kolommenOpen, setKolommenOpen] = useState(false);
  const [kolommenLaden, setKolommenLaden] = useState(false);
  const [kolommenFout, setKolommenFout] = useState("");
  const [kolomBezig, setKolomBezig] = useState(""); // logische naam van de kolom die nu wordt toegevoegd

  // De "Aangifte versturen"-sjablonen worden per soort apart bewaard: IB houdt de bestaande
  // (legacy) instellingen-sleutels, VPB krijgt parallelle sleutels met een "_vpb"-achtervoegsel.
  const aangSuffix = soort === "ib" ? "" : `_${soort}`;
  const kBestandsnaam = `aangifteBestandsnaamTemplate${aangSuffix}`;
  const kMailOnderwerp = `aangifteMailOnderwerpTemplate${aangSuffix}`;
  const kMailTekst = `aangifteMailTekstTemplate${aangSuffix}`;
  const kPad = `aangiftePadTemplate${aangSuffix}`;
  const kTaakOnderwerp = `aangifteTaakOnderwerpTemplate${aangSuffix}`;
  const kTaakSoort = `aangifteTaakSoort${aangSuffix}`;
  const kTaakRubriek = `aangifteTaakRubriek${aangSuffix}`;
  const soortWoord = soort === "vpb" ? "vennootschapsbelasting"
    : soort === "dividend" ? "dividenduitkering"
    : soort === "notulen" ? "notulen"
    : "inkomstenbelasting";
  const soortLabelKort = soort === "vpb" ? "VPB"
    : soort === "dividend" ? "Dividend"
    : soort === "notulen" ? "Notulen"
    : "IB";

  // Zet de losse werk-states vanuit één (soort-)indelingsobject — de opgeslagen indeling, of de
  // standaardindeling van de soort als er nog niets eigens is opgeslagen.
  const zetWerkStaten = (ind) => {
    const eigen = ind || {};
    setSecties((eigen.secties || []).map((s) => ({ ...s, subsecties: s.subsecties || [] })));
    setVerborgen(eigen.verborgen || []);
    setVoorwaarden(eigen.voorwaarden || {});
    setAlleenLezen(eigen.alleenLezen || []);
    setLabels(eigen.labels || {});
    setAangepasteVelden(eigen.aangepasteVelden || []);
    setOnderwerpId(eigen.onderwerpId || "");
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/dossier-velden?soort=${soort}`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : Promise.reject())),
      // Best-effort: de onderwerpen-catalogus (Beheer → Onderwerpen, zie "Uitvraag dynamisch") is
      // alleen nodig voor de koppel-dropdown hieronder — als die nog niet geconfigureerd is, mag
      // dat de rest van dit scherm niet blokkeren (dan toont de dropdown gewoon "nog geen
      // onderwerpen ingericht").
      fetch("/api/beheer-aanleveronderwerpen").then((r) => (r.ok ? r.json() : { onderwerpen: [] })).catch(() => ({ onderwerpen: [] })),
      // Best-effort: de taaksoort-optieset (cr283_soortactiecategorie) voor de dropdown hieronder — als
      // die (nog) niet ophaalbaar is, valt het blok terug op een vrij in te vullen nummer.
      fetch("/api/beheer-taaksoorten").then((r) => (r.ok ? r.json() : { opties: [] })).catch(() => ({ opties: [] })),
      // Best-effort: dezelfde rubriek-optieset (cr283_rubriek) als bij Beheer → Brieven.
      fetch("/api/beheer-taakrubrieken").then((r) => (r.ok ? r.json() : { opties: [] })).catch(() => ({ opties: [] })),
    ])
      .then(([veldenData, instellingenData, onderwerpenData, taaksoortenData, taakrubriekenData]) => {
        setCatalogus(veldenData.catalogus || []);
        setPicklistOpties(veldenData.picklistOpties || {});
        const huidigeIndeling = instellingenData.dossierIndeling || {};
        setDossierIndeling(huidigeIndeling);
        // Seed vanuit de opgeslagen indeling van DEZE soort; is die er (nog) niet, dan vanuit de
        // standaardindeling die de server meegeeft — zo toont ook een nog niet geconfigureerde soort
        // (bijv. VPB) meteen de nette standaard-secties i.p.v. een leeg paneel.
        const eigen = huidigeIndeling[soort];
        const heeftEigen = eigen && Array.isArray(eigen.secties) && eigen.secties.length;
        zetWerkStaten(heeftEigen ? eigen : (veldenData.standaardIndeling || {}));
        setOnderwerpen(onderwerpenData.onderwerpen || []);
        setBestandsnaamTemplate(instellingenData[kBestandsnaam] || "");
        setMailOnderwerpTemplate(instellingenData[kMailOnderwerp] || "");
        setMailTekstTemplate(instellingenData[kMailTekst] || "");
        setPadTemplate(instellingenData[kPad] || "");
        setTaakOnderwerpTemplate(instellingenData[kTaakOnderwerp] || "");
        setTaakSoort(instellingenData[kTaakSoort] != null ? String(instellingenData[kTaakSoort]) : "");
        setTaakSoortOpties((taaksoortenData && taaksoortenData.opties) || []);
        setTaakRubriek(instellingenData[kTaakRubriek] != null ? String(instellingenData[kTaakRubriek]) : "");
        setTaakRubriekOpties((taakrubriekenData && taakrubriekenData.opties) || []);
        setStatusOpties((veldenData && veldenData.statusOpties) || []);
        const alleReview = (instellingenData && instellingenData.dossierReview) || {};
        setAlleReviewCfg(alleReview);
        setReviewCfg({ ...standaardReviewVoor(soort), ...(alleReview[soort] || {}) });
        const alleKeten = (instellingenData && instellingenData.dossierAkkoord) || {};
        setAlleKetenCfg(alleKeten);
        setKetenCfg({ ...STANDAARD_KETEN_CFG, ...(alleKeten[soort] || {}) });
        const alleVoorlopig = (instellingenData && instellingenData.dossierVoorlopig) || {};
        setAlleVoorlopigCfg(alleVoorlopig);
        setVoorlopigCfg({ ...STANDAARD_VOORLOPIG_CFG, ...(alleVoorlopig[soort] || {}) });
      })
      .catch(() => { setCatalogus([]); setSecties([]); setFout("Kon de dossierindeling niet laden."); });
  }, []);

  const veldInfo = (key) => (catalogus || []).find((v) => v.key === key);
  const weergaveLabel = (key) => labels[key] || (veldInfo(key)?.label) || key;
  const ingedeeldeKeys = new Set((secties || []).flatMap((s) => [...(s.velden || []), ...(s.subsecties || []).flatMap((sub) => sub.velden || [])]));
  const nietIngedeeld = (catalogus || []).filter((v) => !ingedeeldeKeys.has(v.key));
  // Alleen boolean-velden komen in aanmerking als "voorwaarde" (een ja/nee-poortje voor een ander veld).
  // Velden die als voorwaarde-poort kunnen dienen: ja/nee-velden én keuzelijsten (op hun uitkomst).
  const conditieVelden = (catalogus || []).filter((v) => v.type === "boolean" || v.type === "picklist");
  // Ja/nee-velden (boolean) die als trigger voor een rubriek-bijlage-dropzone kunnen dienen.
  const jaNeeVelden = (catalogus || []).filter((v) => v && v.key && v.type === "boolean" && !String(v.key).startsWith("__")).map((v) => ({ key: v.key, label: weergaveLabel(v.key) }));
  const aantalIngedeeld = (secties || []).reduce((n, s) => n + (s.velden || []).length + (s.subsecties || []).reduce((m, sub) => m + (sub.velden || []).length, 0), 0);

  const bewaar = async (overrides = {}) => {
    setStatus("bezig");
    setFout("");
    const volgendeSecties = overrides.secties !== undefined ? overrides.secties : (secties || []);
    const volgendeVerborgen = overrides.verborgen !== undefined ? overrides.verborgen : verborgen;
    const volgendeVoorwaarden = overrides.voorwaarden !== undefined ? overrides.voorwaarden : voorwaarden;
    const volgendeAlleenLezen = overrides.alleenLezen !== undefined ? overrides.alleenLezen : alleenLezen;
    const volgendeLabels = overrides.labels !== undefined ? overrides.labels : labels;
    const volgendeAangepasteVelden = overrides.aangepasteVelden !== undefined ? overrides.aangepasteVelden : aangepasteVelden;
    const volgendeOnderwerpId = overrides.onderwerpId !== undefined ? overrides.onderwerpId : onderwerpId;
    try {
      // Haal de meest recente dossierIndeling opnieuw op vóór het samenvoegen, zodat dit paneel
      // alleen zijn eigen soort-sleutel wijzigt en NOOIT de (mogelijk net door het andere soort-
      // paneel opgeslagen) indeling van de andere soort overschrijft.
      let basis = dossierIndeling || {};
      try {
        const huidig = await fetch("/api/beheer-instellingen").then((x) => (x.ok ? x.json() : null));
        if (huidig && huidig.dossierIndeling && typeof huidig.dossierIndeling === "object") basis = huidig.dossierIndeling;
      } catch { /* val terug op de in-memory kopie */ }
      const volledigeIndeling = {
        ...basis,
        [soort]: {
          secties: volgendeSecties, verborgen: volgendeVerborgen, voorwaarden: volgendeVoorwaarden,
          alleenLezen: volgendeAlleenLezen, labels: volgendeLabels, aangepasteVelden: volgendeAangepasteVelden,
          onderwerpId: volgendeOnderwerpId,
        },
      };
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierIndeling: volledigeIndeling }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setDossierIndeling(volledigeIndeling);
      setSecties(volgendeSecties);
      setVerborgen(volgendeVerborgen);
      setVoorwaarden(volgendeVoorwaarden);
      setAlleenLezen(volgendeAlleenLezen);
      setLabels(volgendeLabels);
      setAangepasteVelden(volgendeAangepasteVelden);
      setOnderwerpId(volgendeOnderwerpId);
      setStatus("opgeslagen");
    } catch (e) {
      setFout(e.message || "Opslaan mislukt.");
      setStatus("fout");
    }
  };

  /** Los van bewaar() hierboven (die alleen dossierIndeling opslaat) — de bestandsnaam-sjabloon
   * is een simpele top-level instelling, direct opgeslagen bij het verlaten van het invoerveld. */
  const bewaarBestandsnaamTemplate = async () => {
    setBestandsnaamStatus("bezig");
    try {
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kBestandsnaam]: bestandsnaamTemplate }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setBestandsnaamStatus("opgeslagen");
    } catch {
      setBestandsnaamStatus("fout");
    }
  };

  /** Mail-onderwerp + -tekst samen opslaan — zelfde generieke /api/beheer-instellingen als
   *  hierboven, gewoon 2 extra top-level velden. */
  const bewaarMailTemplate = async () => {
    setMailStatus("bezig");
    try {
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kMailOnderwerp]: mailOnderwerpTemplate, [kMailTekst]: mailTekstTemplate }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setMailStatus("opgeslagen");
    } catch {
      setMailStatus("fout");
    }
  };

  /** Pad (submap), taak-onderwerp, taak-soort en rubriek samen opslaan — zelfde generieke
   *  /api/beheer-instellingen als hierboven, gewoon vier extra top-level velden. Soort/rubriek
   *  worden als getal opgeslagen (leeg = niet meegeven op de taak). */
  const bewaarAangifteTaakInstellingen = async () => {
    setTaakInstellingStatus("bezig");
    try {
      const soortGetal = taakSoort === "" ? null : Number(taakSoort);
      const rubriekGetal = taakRubriek === "" ? null : Number(taakRubriek);
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [kPad]: padTemplate,
          [kTaakOnderwerp]: taakOnderwerpTemplate,
          [kTaakSoort]: Number.isFinite(soortGetal) ? soortGetal : null,
          [kTaakRubriek]: Number.isFinite(rubriekGetal) ? rubriekGetal : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setTaakInstellingStatus("opgeslagen");
    } catch {
      setTaakInstellingStatus("fout");
    }
  };

  /** Review-instellingen van DEZE soort opslaan; de andere soorten blijven onaangeroerd. */
  const bewaarReviewInstellingen = async () => {
    setReviewStatus("bezig");
    try {
      const getal = (v) => (v === "" || v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
      const schoon = {
        aan: !!reviewCfg.aan,
        taakSoort: getal(reviewCfg.taakSoort),
        taakOnderwerp: String(reviewCfg.taakOnderwerp || "").trim(),
        taakRubriek: getal(reviewCfg.taakRubriek),
        statusAanvraag: getal(reviewCfg.statusAanvraag),
        akkoordTaakSoort: getal(reviewCfg.akkoordTaakSoort),
        akkoordTaakOnderwerp: String(reviewCfg.akkoordTaakOnderwerp || "").trim(),
        statusAkkoord: getal(reviewCfg.statusAkkoord),
        aanpassenTaakSoort: getal(reviewCfg.aanpassenTaakSoort),
        aanpassenTaakOnderwerp: String(reviewCfg.aanpassenTaakOnderwerp || "").trim(),
        statusAanpassen: getal(reviewCfg.statusAanpassen),
      };
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierReview: { ...alleReviewCfg, [soort]: schoon } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setAlleReviewCfg((h) => ({ ...h, [soort]: schoon }));
      setReviewStatus("opgeslagen");
    } catch {
      setReviewStatus("fout");
    }
  };

  /** De taakketen-instellingen van DEZE soort opslaan; de andere soorten blijven onaangeroerd. */
  const bewaarKetenInstellingen = async () => {
    setKetenStatus("bezig");
    try {
      const getal = (v) => (v === "" || v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
      const schoon = {
        statusVersturen: getal(ketenCfg.statusVersturen),
        akkoordTaakSoort: getal(ketenCfg.akkoordTaakSoort),
        akkoordTaakOnderwerp: String(ketenCfg.akkoordTaakOnderwerp || "").trim(),
        akkoordTaakRubriek: getal(ketenCfg.akkoordTaakRubriek),
        statusAkkoord: getal(ketenCfg.statusAkkoord),
        statusVervolgKlaar: getal(ketenCfg.statusVervolgKlaar),
        inactiefNaVervolg: !!ketenCfg.inactiefNaVervolg,
        voorlopigStatusVersturen: getal(ketenCfg.voorlopigStatusVersturen),
        voorlopigStatusAkkoord: getal(ketenCfg.voorlopigStatusAkkoord),
        voorlopigStatusVervolgKlaar: getal(ketenCfg.voorlopigStatusVervolgKlaar),
      };
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierAkkoord: { ...alleKetenCfg, [soort]: schoon } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setAlleKetenCfg((h) => ({ ...h, [soort]: schoon }));
      setKetenStatus("opgeslagen");
    } catch {
      setKetenStatus("fout");
    }
  };

  /** Voorlopige-aangifte-instellingen van DEZE soort opslaan; andere soorten blijven onaangeroerd. */
  const bewaarVoorlopigInstellingen = async () => {
    setVoorlopigStatus("bezig");
    try {
      const getal = (v) => (v === "" || v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
      const schoon = {
        aan: !!voorlopigCfg.aan,
        redenen: (voorlopigCfg.redenen || []).filter((r) => r && String(r.label || "").trim()).map((r) => ({
          sleutel: r.sleutel || redenSleutel(r.label), label: String(r.label).trim(), actief: r.actief !== false,
        })),
        status: getal(voorlopigCfg.status),
        taakSoort: getal(voorlopigCfg.taakSoort),
        taakOnderwerp: String(voorlopigCfg.taakOnderwerp || "").trim(),
        taakRubriek: getal(voorlopigCfg.taakRubriek),
        herzienDag: getal(voorlopigCfg.herzienDag) || 1,
        herzienMaand: getal(voorlopigCfg.herzienMaand) || 12,
      };
      const r = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierVoorlopig: { ...alleVoorlopigCfg, [soort]: schoon } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setAlleVoorlopigCfg((h) => ({ ...h, [soort]: schoon }));
      setVoorlopigCfg((h) => ({ ...h, redenen: schoon.redenen }));
      setVoorlopigStatus("opgeslagen");
    } catch {
      setVoorlopigStatus("fout");
    }
  };

  const voegSectieToe = () => {
    const titel = nieuweSectieTitel.trim();
    if (!titel) return;
    const volgende = [...(secties || []), { sleutel: nieuweSectieSleutel(secties || []), titel, velden: [], subsecties: [] }];
    setNieuweSectieTitel("");
    bewaar({ secties: volgende });
  };

  const hernoemSectie = (sleutel, titel) => {
    setSecties((h) => (h || []).map((s) => (s.sleutel === sleutel ? { ...s, titel } : s)));
  };
  const sectieHernoemOpslaan = () => bewaar({ secties: secties || [] });

  // Bijlage-dropzone per rubriek: sectie.bijlage = { aan, trigger, submap, bestandsnaam }. De dropzone
  // verschijnt in het dossier ín deze rubriek zodra het gekozen ja/nee-veld ('trigger') op Ja staat
  // (leeg = altijd tonen). submap + bestandsnaam bepalen waar en onder welke naam een gedropt bestand in
  // SharePoint belandt (zie api/medewerker-dossier-bijlage). Wordt als onderdeel van de indeling (secties)
  // bewaard. Vinkje + keuzelijst slaan meteen op; de tekstvelden via onBlur (zoals de rubrieknaam).
  const merkSectieBijlage = (s, patch) => {
    const huidig = (s.bijlage && typeof s.bijlage === "object") ? s.bijlage : {};
    const nieuw = { ...huidig, ...patch };
    if (!nieuw.aan && !String(nieuw.trigger || "").trim() && !String(nieuw.submap || "").trim() && !String(nieuw.bestandsnaam || "").trim()) {
      const { bijlage, ...rest } = s; // niets ingesteld → bijlage helemaal weglaten (schoon opslaan)
      return rest;
    }
    return { ...s, bijlage: nieuw };
  };
  const wijzigSectieBijlage = (sleutel, patch) => setSecties((h) => (h || []).map((s) => (s.sleutel === sleutel ? merkSectieBijlage(s, patch) : s)));
  const zetSectieBijlageEnBewaar = (sleutel, patch) => {
    const volgende = (secties || []).map((s) => (s.sleutel === sleutel ? merkSectieBijlage(s, patch) : s));
    setSecties(volgende);
    bewaar({ secties: volgende });
  };
  const sectieBijlageOpslaan = () => bewaar({ secties: secties || [] });

  const verwijderSectie = (sleutel) => {
    const sectie = (secties || []).find((s) => s.sleutel === sleutel);
    if (!sectie) return;
    const aantal = (sectie.velden || []).length + (sectie.subsecties || []).reduce((n, sub) => n + (sub.velden || []).length, 0);
    if (aantal > 0 && !confirm(`Rubriek "${sectie.titel}" bevat nog ${aantal} veld(en) (incl. eventuele subrubrieken). Deze gaan naar "Niet ingedeeld". Doorgaan?`)) return;
    bewaar({ secties: (secties || []).filter((s) => s.sleutel !== sleutel) });
  };

  // Hoofdrubrieken zelf herordenen — bepaalt ook de volgorde van de kaarten in het
  // medewerkersdossier (die volgt gewoon de array-volgorde van secties).
  const verplaatsSectie = (sleutel, richting) => {
    const volgende = [...(secties || [])];
    const i = volgende.findIndex((s) => s.sleutel === sleutel);
    const j = i + richting;
    if (i < 0 || j < 0 || j >= volgende.length) return;
    [volgende[i], volgende[j]] = [volgende[j], volgende[i]];
    bewaar({ secties: volgende });
  };

  // Subrubrieken binnen één hoofdrubriek herordenen — zelfde patroon als verplaatsSectie
  // hierboven, maar dan op sectie.subsecties in plaats van op de secties zelf.
  const verplaatsSubsectie = (sectieSleutel, subSleutel, richting) => {
    const volgende = (secties || []).map((s) => {
      if (s.sleutel !== sectieSleutel) return s;
      const subVolgende = [...(s.subsecties || [])];
      const i = subVolgende.findIndex((sub) => sub.sleutel === subSleutel);
      const j = i + richting;
      if (i < 0 || j < 0 || j >= subVolgende.length) return s;
      [subVolgende[i], subVolgende[j]] = [subVolgende[j], subVolgende[i]];
      return { ...s, subsecties: subVolgende };
    });
    bewaar({ secties: volgende });
  };

  const voegSubsectieToe = (sectieSleutel) => {
    const titel = (nieuweSubsectieTitel[sectieSleutel] || "").trim();
    if (!titel) return;
    const volgende = (secties || []).map((s) => {
      if (s.sleutel !== sectieSleutel) return s;
      const bestaande = s.subsecties || [];
      return { ...s, subsecties: [...bestaande, { sleutel: nieuweSubsectieSleutel(sectieSleutel, bestaande), titel, velden: [] }] };
    });
    setNieuweSubsectieTitel((h) => ({ ...h, [sectieSleutel]: "" }));
    bewaar({ secties: volgende });
  };

  const hernoemSubsectie = (sectieSleutel, subSleutel, titel) => {
    setSecties((h) => (h || []).map((s) => (s.sleutel !== sectieSleutel ? s : { ...s, subsecties: (s.subsecties || []).map((sub) => (sub.sleutel === subSleutel ? { ...sub, titel } : sub)) })));
  };
  const subsectieHernoemOpslaan = () => bewaar({ secties: secties || [] });

  const verwijderSubsectie = (sectieSleutel, subSleutel) => {
    const sectie = (secties || []).find((s) => s.sleutel === sectieSleutel);
    const sub = sectie && (sectie.subsecties || []).find((x) => x.sleutel === subSleutel);
    if (!sub) return;
    if ((sub.velden || []).length > 0 && !confirm(`Subrubriek "${sub.titel}" bevat nog ${sub.velden.length} veld(en). Deze gaan naar "Niet ingedeeld". Doorgaan?`)) return;
    const volgende = (secties || []).map((s) => (s.sleutel !== sectieSleutel ? s : { ...s, subsecties: (s.subsecties || []).filter((x) => x.sleutel !== subSleutel) }));
    bewaar({ secties: volgende });
  };

  // "Pad" van een veld: "" (niet ingedeeld), "<sectieSleutel>" (rechtstreeks in de hoofdrubriek)
  // of "<sectieSleutel>::<subSleutel>" (in een subrubriek). Eén functie voor alle verplaatsingen
  // zodat een veld altijd op precies één plek staat.
  const verplaatsVeld = (key, doelPad) => {
    let volgende = (secties || []).map((s) => ({
      ...s,
      velden: (s.velden || []).filter((k) => k !== key),
      subsecties: (s.subsecties || []).map((sub) => ({ ...sub, velden: (sub.velden || []).filter((k) => k !== key) })),
    }));
    if (!doelPad) { bewaar({ secties: volgende }); return; } // terug naar "Niet ingedeeld"
    const [sectieSleutel, subSleutel] = doelPad.split("::");
    volgende = volgende.map((s) => {
      if (s.sleutel !== sectieSleutel) return s;
      if (!subSleutel) return { ...s, velden: [...(s.velden || []), key] };
      return { ...s, subsecties: (s.subsecties || []).map((sub) => (sub.sleutel === subSleutel ? { ...sub, velden: [...(sub.velden || []), key] } : sub)) };
    });
    bewaar({ secties: volgende });
  };

  const verplaatsBinnenGroep = (pad, key, richting) => {
    const [sectieSleutel, subSleutel] = pad.split("::");
    const volgende = (secties || []).map((s) => {
      if (s.sleutel !== sectieSleutel) return s;
      if (!subSleutel) {
        const velden = [...(s.velden || [])];
        const i = velden.indexOf(key), j = i + richting;
        if (i < 0 || j < 0 || j >= velden.length) return s;
        [velden[i], velden[j]] = [velden[j], velden[i]];
        return { ...s, velden };
      }
      return {
        ...s,
        subsecties: (s.subsecties || []).map((sub) => {
          if (sub.sleutel !== subSleutel) return sub;
          const velden = [...(sub.velden || [])];
          const i = velden.indexOf(key), j = i + richting;
          if (i < 0 || j < 0 || j >= velden.length) return sub;
          [velden[i], velden[j]] = [velden[j], velden[i]];
          return { ...sub, velden };
        }),
      };
    });
    bewaar({ secties: volgende });
  };

  // Verborgen: blijft op zijn plek staan, maar wordt in het medewerkersdossier nooit getoond —
  // anders dan "Niet ingedeeld" (dat het veld ook uit de indeling zelf haalt).
  const toggleVerborgen = (key) => {
    const isVerborgen = verborgen.includes(key);
    const volgende = isVerborgen ? verborgen.filter((k) => k !== key) : [...verborgen, key];
    bewaar({ verborgen: volgende });
  };

  // Alleen-lezen: het veld blijft zichtbaar in het medewerkersdossier maar kan niet meer bewerkt
  // worden (ook server-side afgedwongen, zie medewerker-dossier/index.js).
  const toggleAlleenLezen = (key) => {
    const isAL = alleenLezen.includes(key);
    const volgende = isAL ? alleenLezen.filter((k) => k !== key) : [...alleenLezen, key];
    bewaar({ alleenLezen: volgende });
  };

  // Voorwaarde: "key" alleen tonen in het medewerkersdossier afhankelijk van de uitkomst van een
  // ander veld (ja/nee of keuzelijst — zie VeldRij). "cond" is null/leeg om de voorwaarde weg te halen.
  const zetVoorwaarde = (key, cond) => {
    const volgende = { ...voorwaarden };
    if (cond) volgende[key] = cond; else delete volgende[key];
    bewaar({ voorwaarden: volgende });
  };

  // Label: alleen lokaal bijwerken tijdens het typen (zelfde patroon als sectie-/subrubriektitel
  // hierboven), pas opslaan bij onBlur — voorkomt een save-aanroep per toetsaanslag.
  const zetLabel = (key, waarde) => {
    setLabels((h) => ({ ...h, [key]: waarde }));
  };
  const labelBlurOpslaan = () => bewaar({ labels });

  // Nieuw veld aanmaken: maakt een echte kolom aan op de Dynamics-tabel (zie
  // api/dossier-kolom-aanmaken) en voegt het resultaat toe aan de catalogus + aangepasteVelden
  // (waarna het meteen als "Niet ingedeeld" verschijnt, klaar om in een rubriek te slepen).
  const maakNieuwVeld = async () => {
    const labelTekst = nieuwVeldLabel.trim();
    if (!labelTekst) return;
    const dynamicsTabel = (SOORTEN_TABS.find((s) => s.key === soort) || {}).dynamicsTabel || "Inkomstenbelasting";
    if (!confirm(`Nieuw veld "${labelTekst}" aanmaken? Dit voegt een echte nieuwe kolom toe aan de tabel ${dynamicsTabel} in Dynamics.`)) return;
    setNieuwVeldBezig(true);
    setNieuwVeldFout("");
    try {
      const bestaandeKeys = (catalogus || []).map((v) => v.key);
      const slug = maakSleutelSlug(labelTekst);
      let key = `extra_${slug}`;
      let n = 2;
      while (bestaandeKeys.includes(key)) { key = `extra_${slug}_${n}`; n++; }

      const r = await fetch("/api/dossier-kolom-aanmaken", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "klantportaal" },
        body: JSON.stringify({ soort, key, label: labelTekst, type: nieuwVeldType }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);

      const nieuwVeld = { key: d.key, veld: d.veld, type: d.type, label: d.label };
      const volgendeCatalogus = [...(catalogus || []), nieuwVeld];
      const volgendeAangepast = [...aangepasteVelden, nieuwVeld];
      setCatalogus(volgendeCatalogus);
      setNieuwVeldLabel("");
      await bewaar({ aangepasteVelden: volgendeAangepast });
    } catch (e) {
      setNieuwVeldFout(e.message || "Aanmaken van het veld is mislukt.");
    } finally {
      setNieuwVeldBezig(false);
    }
  };

  // Bestaande (nog ongebruikte) Dynamics-kolommen ophalen — pas bij het openklappen (lazy).
  const laadBeschikbareKolommen = () => {
    setKolommenLaden(true);
    setKolommenFout("");
    fetch(`/api/dossier-kolommen-beschikbaar?soort=${encodeURIComponent(soort)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error((d && d.error) || `HTTP ${r.status}`)))))
      .then((d) => setBeschikbareKolommen(d.kolommen || []))
      .catch((e) => { setBeschikbareKolommen([]); setKolommenFout(e.message || "Kon de kolommen niet ophalen."); })
      .finally(() => setKolommenLaden(false));
  };
  const toggleKolommen = () => {
    const nieuw = !kolommenOpen;
    setKolommenOpen(nieuw);
    if (nieuw && beschikbareKolommen === null && !kolommenLaden) laadBeschikbareKolommen();
  };
  // Een bestaande Dynamics-kolom toevoegen als (aangepast) dossierveld — géén nieuwe kolom in
  // Dynamics, alleen opnemen in de catalogus/aangepasteVelden (zelfde mechaniek als "Nieuw veld
  // aanmaken", maar dan wijzend naar een kolom die al bestaat). Verschijnt daarna bij "Niet ingedeeld".
  const voegBestaandeKolomToe = async (kol) => {
    setKolomBezig(kol.veld);
    try {
      const bestaandeKeys = new Set((catalogus || []).map((v) => v.key));
      const basis = maakSleutelSlug(String(kol.veld || "").replace(/^_/, "").replace(/_value$/, "").replace(/^cr283_/, "").replace(/^sk_/, "")) || "kolom";
      let key = `kol_${basis}`;
      let n = 2;
      while (bestaandeKeys.has(key)) { key = `kol_${basis}_${n}`; n++; }
      // Voor een lookup nemen we het doel (entiteit) mee — nodig voor de zoek-kiezer + wegschrijven.
      const nieuwVeld = { key, veld: kol.veld, type: kol.type, label: kol.label, ...(kol.type === "lookup" ? { doel: kol.doel || [] } : {}) };
      setCatalogus((c) => [...(c || []), nieuwVeld]);
      setBeschikbareKolommen((lijst) => (lijst || []).filter((k) => k.veld !== kol.veld));
      await bewaar({ aangepasteVelden: [...aangepasteVelden, nieuwVeld] });
    } finally {
      setKolomBezig("");
    }
  };

  if (catalogus === null || secties === null) {
    return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Dossierindeling ophalen…</div>;
  }

  const padOpties = (huidigPad) => (
    <>
      <option value="">Niet ingedeeld</option>
      {(secties || []).flatMap((s) => [
        <option key={s.sleutel} value={s.sleutel} disabled={s.sleutel === huidigPad}>{s.titel}</option>,
        ...(s.subsecties || []).map((sub) => {
          const pad = `${s.sleutel}::${sub.sleutel}`;
          return <option key={pad} value={pad} disabled={pad === huidigPad}>{`— ${sub.titel}`}</option>;
        }),
      ])}
    </>
  );

  const veldRijProps = (key, pad, i, laatsteIndex) => ({
    veldKey: key,
    veld: veldInfo(key),
    weergaveLabel: weergaveLabel(key),
    pad,
    padOpties,
    index: i,
    laatsteIndex,
    isVerborgen: verborgen.includes(key),
    isAlleenLezen: alleenLezen.includes(key),
    voorwaarde: voorwaarden[key],
    conditieVelden,
    picklistOpties,
    onZetLabel: (waarde) => zetLabel(key, waarde),
    onLabelBlur: labelBlurOpslaan,
    onZetVoorwaarde: (cond) => zetVoorwaarde(key, cond),
    onToggleVerborgen: () => toggleVerborgen(key),
    onToggleAlleenLezen: () => toggleAlleenLezen(key),
    onOmhoog: () => verplaatsBinnenGroep(pad, key, -1),
    onOmlaag: () => verplaatsBinnenGroep(pad, key, 1),
    onVerplaats: (doelPad) => verplaatsVeld(key, doelPad),
    onVerwijderUitSectie: () => verplaatsVeld(key, ""),
  });

  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16 }}>
      <button
        onClick={() => setOpen((h) => !h)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: open ? 6 : 0, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: KLEUR.tekst }}
      >
        {open ? <ChevronDown size={16} color={KLEUR.mutedTekst} /> : <ChevronRight size={16} color={KLEUR.mutedTekst} />}
        <FolderKanban size={16} color={KLEUR.blauw} /> Dossiers — indeling {(SOORTEN_TABS.find((s) => s.key === soort) || {}).label || "Inkomstenbelasting"}
      </button>
      {!open && (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 4 }}>
          {aantalIngedeeld} veld(en) ingedeeld · {verborgen.length} verborgen · {alleenLezen.length} alleen-lezen · {nietIngedeeld.length} niet ingedeeld
        </div>
      )}

      {open && (<>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 760 }}>
        Bepaalt hoe het {soortLabelKort}-dossier eruitziet op de dossierpagina van een cliënt in het
        medewerkersportaal (Klantoverzicht → {(SOORTEN_TABS.find((s) => s.key === soort) || {}).label || "dossier"} → dossier openen) — óók de vaste
        velden "Status van de aangifte", "URL dossier" en "Documentlink" staan hieronder gewoon
        tussen de rest en zijn vrij te verplaatsen/hernoemen. Standaard gelijk aan de tabbladen van
        het Dynamics-formulier — versleep een veld gerust naar een andere hoofd- of subrubriek,
        hernoem rubrieken en zet ze zelf in volgorde (pijltjes bij de rubriektitel), of maak nieuwe
        (ook subrubrieken, binnen een hoofdrubriek). Elke veldnaam is ook zelf te wijzigen — typ
        gewoon een eigen tekst in het naamveld. Een veld dat bij "Niet ingedeeld" staat, wordt niet
        getoond. Met het slot-icoon maak je een veld alleen-lezen (wel zichtbaar, niet meer te
        bewerken), met het oog-icoon verberg je het helemaal zonder het uit zijn plek te halen, en
        met "Alleen tonen als" laat je een veld pas verschijnen zodra een ander ja/nee-veld op dat
        dossier "Ja" is (bijv. "Eigen woning schuld" alleen als "Eigen woning" Ja is). Helemaal
        onderaan kun je ook een volledig nieuw veld aanmaken — dat zet meteen een echte nieuwe
        kolom in Dynamics klaar.
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 18, background: KLEUR.lichtblauw }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Gekoppelde uitvraaglijst</div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 }}>
          Kies het onderwerp (uit Beheer → Onderwerpen) dat bij {(SOORTEN_TABS.find((s) => s.key === soort) || {}).label || "deze soort"} hoort. Uitvraaglijsten
          (aanleververzoeken) met dit onderwerp verschijnen dan automatisch — bij dezelfde cliënt en,
          als het dossier een jaar heeft, hetzelfde jaar — in het dossier zelf.
        </div>
        {onderwerpen.length === 0 ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Nog geen onderwerpen ingericht — stel die eerst in via Beheer → Onderwerpen.</div>
        ) : (
          <select value={onderwerpId} onChange={(e) => bewaar({ onderwerpId: e.target.value })} style={{ ...invoerStijl, flex: "0 1 320px", background: "#fff" }}>
            <option value="">— geen koppeling —</option>
            {onderwerpen.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
          </select>
        )}
      </div>

      {/* De "Aangifte versturen"-sjablonen (bestandsnaam/mail/opslag+taak) horen bij de aangifte-
          dropzones in het dossier — per soort apart in te stellen. Alleen relevant voor de soorten
          met een "Aangifte versturen"-flow in het portaal (IB/VPB); voor Dividend/Notulen verborgen. */}
      {(soort === "ib" || soort === "vpb") && (
      <>
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 18, background: KLEUR.lichtblauw }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Bestandsnaam — aangifte versturen</div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 }}>
          Naam waaronder een via het {soortLabelKort}-dossier gedropte aangifte ({soort === "ib" ? "cliënt of fiscaal partner" : "cliënt"}) wordt
          opgeslagen in de map "Correspondentie" van het SharePoint-dossier. Plaatshouders:{" "}
          <code>{"{klant}"}</code> (naam van de ontvanger) en <code>{"{jaar}"}</code> (dossierjaar).
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={bestandsnaamTemplate}
            onChange={(e) => { setBestandsnaamTemplate(e.target.value); setBestandsnaamStatus("rust"); }}
            onBlur={bewaarBestandsnaamTemplate}
            placeholder={`Aangifte ${soortWoord} {jaar} - {klant}.pdf`}
            style={{ ...invoerStijl, flex: "0 1 420px", background: "#fff" }}
          />
          {bestandsnaamStatus === "bezig" && <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Opslaan…</span>}
          {bestandsnaamStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
          {bestandsnaamStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
        </div>
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 18, background: KLEUR.lichtblauw }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Mail — aangifte versturen</div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 }}>
          Standaard onderwerp en tekst van de mail die de ontvanger ({soort === "ib" ? "cliënt of fiscaal partner" : "cliënt"}) krijgt zodra een medewerker een
          aangifte via het {soortLabelKort}-dossier verstuurt. De medewerker ziet dit als voorstel in het voorbeeldscherm vlak vóór het
          versturen en kan het per keer nog aanpassen — hier stel je alleen in wat daar standaard al staat. Plaatshouders:{" "}
          <code>{"{klant}"}</code> (naam van de ontvanger) en <code>{"{jaar}"}</code> (dossierjaar).
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Onderwerp</span>
          <input
            value={mailOnderwerpTemplate}
            onChange={(e) => { setMailOnderwerpTemplate(e.target.value); setMailStatus("rust"); }}
            placeholder={`Uw aangifte ${soortWoord} {jaar} staat klaar in het portaal`}
            style={{ ...invoerStijl, width: "100%", maxWidth: 560, background: "#fff" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Tekst</span>
          <textarea
            value={mailTekstTemplate}
            onChange={(e) => { setMailTekstTemplate(e.target.value); setMailStatus("rust"); }}
            rows={8}
            placeholder={`Beste {klant},\n\nUw aangifte ${soortWoord} over {jaar} staat klaar ter beoordeling…`}
            style={{ ...invoerStijl, width: "100%", maxWidth: 560, background: "#fff", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={bewaarMailTemplate}
            disabled={mailStatus === "bezig"}
            style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: mailStatus === "bezig" ? "default" : "pointer" }}
          >
            {mailStatus === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          {mailStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
          {mailStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
        </div>
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14, marginBottom: 18, background: KLEUR.lichtblauw }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Opslag & taak — aangifte versturen</div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 12, maxWidth: 640 }}>
          Waar de gedropte aangifte in het SharePoint-dossier terechtkomt, en hoe de bijbehorende taak
          in Dynamics eruitziet. De submap staat onder de dossiermap van de klant ({" "}
          <code>cr283_sharepoint</code>) — met een <code>/</code> maak je submappen (bijv.{" "}
          <code>Correspondentie/{"{jaar}"}</code>). Plaatshouders <code>{"{klant}"}</code> en{" "}
          <code>{"{jaar}"}</code> mogen ook in het pad en het taak-onderwerp.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Submap in het SharePoint-dossier</span>
          <input
            value={padTemplate}
            onChange={(e) => { setPadTemplate(e.target.value); setTaakInstellingStatus("rust"); }}
            placeholder="Correspondentie"
            style={{ ...invoerStijl, width: "100%", maxWidth: 420, background: "#fff" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Onderwerp van de taak</span>
          <input
            value={taakOnderwerpTemplate}
            onChange={(e) => { setTaakOnderwerpTemplate(e.target.value); setTaakInstellingStatus("rust"); }}
            placeholder={`Aangifte ${soortWoord} {jaar} klaar ter beoordeling`}
            style={{ ...invoerStijl, width: "100%", maxWidth: 560, background: "#fff" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Soort taak</span>
          {taakSoortOpties.length > 0 ? (
            <select
              value={taakSoort}
              onChange={(e) => { setTaakSoort(e.target.value); setTaakInstellingStatus("rust"); }}
              style={{ ...invoerStijl, width: "100%", maxWidth: 420, background: "#fff" }}
            >
              <option value="">— standaard (In afwachting reactie client) —</option>
              {taakSoortOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
            </select>
          ) : (
            <>
              <input
                type="number"
                value={taakSoort}
                onChange={(e) => { setTaakSoort(e.target.value); setTaakInstellingStatus("rust"); }}
                placeholder="8006"
                style={{ ...invoerStijl, width: "100%", maxWidth: 200, background: "#fff" }}
              />
              <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>
                De taaksoorten-lijst kon niet worden opgehaald — vul de optiesetwaarde (nummer) rechtstreeks in. Leeg = standaard 8006.
              </span>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>Rubriek</span>
          {taakRubriekOpties.length > 0 ? (
            <select
              value={taakRubriek}
              onChange={(e) => { setTaakRubriek(e.target.value); setTaakInstellingStatus("rust"); }}
              style={{ ...invoerStijl, width: "100%", maxWidth: 420, background: "#fff" }}
            >
              <option value="">— geen rubriek —</option>
              {taakRubriekOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
            </select>
          ) : (
            <>
              <input
                type="number"
                value={taakRubriek}
                onChange={(e) => { setTaakRubriek(e.target.value); setTaakInstellingStatus("rust"); }}
                placeholder="Leeg = geen rubriek"
                style={{ ...invoerStijl, width: "100%", maxWidth: 200, background: "#fff" }}
              />
              <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>
                De rubrieken-lijst kon niet worden opgehaald — vul de optiesetwaarde (nummer) rechtstreeks in, of laat leeg.
              </span>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={bewaarAangifteTaakInstellingen}
            disabled={taakInstellingStatus === "bezig"}
            style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: taakInstellingStatus === "bezig" ? "default" : "pointer" }}
          >
            {taakInstellingStatus === "bezig" ? "Opslaan…" : "Opslaan"}
          </button>
          {taakInstellingStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
          {taakInstellingStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
        </div>
      </div>
      </>
      )}

      {/* ── Voorlopige aangifte ─────────────────────────────────────────────────────────────────
          Een aangifte die bewust nog niet definitief is. De medewerker moet een reden uit deze
          lijst kiezen, een toelichting geven én een herzieningsdatum prikken — daar wordt meteen een
          taak van gemaakt. Zie api/_gedeeld/dossierVoorlopig.js. */}
      {voorlopigCfg && (soort === "ib" || soort === "vpb") && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Voorlopige aangifte — {soortLabelKort}</div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: voorlopigCfg.aan ? KLEUR.blauw : KLEUR.subtekst, cursor: "pointer" }}>
              <input type="checkbox" checked={!!voorlopigCfg.aan} onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, aan: e.target.checked })); setVoorlopigStatus("rust"); }} />
              Knop tonen in het {soortWoord}-dossier
            </label>
          </div>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, lineHeight: 1.6, marginBottom: 14 }}>
            De medewerker legt vast dat een aangifte bewust nog niet definitief is. Verplicht: een{" "}
            <strong>reden</strong> uit onderstaande lijst, een <strong>toelichting</strong> en een{" "}
            <strong>toelichting</strong>. De herziening wordt daarna automatisch <strong>bij de cliënt
            uitgevraagd</strong> op één vaste jaarlijkse datum (standaard 1 december): op die dag staat er een
            taak in zijn portaal met de vraag of er iets is gewijzigd waardoor de aangifte herzien moet worden.
            Ligt die datum dit jaar al achter ons, dan wordt het die van volgend jaar. Zodra de taak wordt
            afgerond vervalt de markering vanzelf. De knop verschijnt alleen bij dossiers die nog niet op
            inactief staan.
          </div>
          <div style={{ fontSize: 12, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", marginBottom: 14, lineHeight: 1.6 }}>
            Omdat de cliënt deze taak moet zien, moet de gekozen taaksoort in <strong>Beheer → Taken</strong> op{" "}
            <strong>Zichtbaar</strong> staan (en meestal ook op "Mag goedkeuren", zodat hij kan reageren).
          </div>

          {/* Redenen */}
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 10, opacity: voorlopigCfg.aan ? 1 : 0.55 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Redenen in de keuzelijst</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {(voorlopigCfg.redenen || []).length === 0 && (
                <div style={{ fontSize: 12, color: KLEUR.rood }}>Geen redenen — zonder minstens één actieve reden blijft de knop verborgen.</div>
              )}
              {(voorlopigCfg.redenen || []).map((r, i) => (
                <div key={r.sleutel || i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={r.label}
                    onChange={(e) => { const v = e.target.value; setVoorlopigCfg((h) => ({ ...h, redenen: (h.redenen || []).map((x, idx) => (idx === i ? { ...x, label: v } : x)) })); setVoorlopigStatus("rust"); }}
                    disabled={!voorlopigCfg.aan}
                    style={{ ...invoerStijl, flex: "1 1 auto", minWidth: 0, background: "#fff" }}
                  />
                  <label title="Uitgezette redenen verdwijnen uit de keuzelijst; bestaande registraties houden hun reden." style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: KLEUR.subtekst, cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={r.actief !== false}
                      onChange={(e) => { const v = e.target.checked; setVoorlopigCfg((h) => ({ ...h, redenen: (h.redenen || []).map((x, idx) => (idx === i ? { ...x, actief: v } : x)) })); setVoorlopigStatus("rust"); }}
                      disabled={!voorlopigCfg.aan}
                    /> actief
                  </label>
                  <button
                    onClick={() => { setVoorlopigCfg((h) => ({ ...h, redenen: (h.redenen || []).filter((_, idx) => idx !== i) })); setVoorlopigStatus("rust"); }}
                    disabled={!voorlopigCfg.aan}
                    title="Reden verwijderen"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, flexShrink: 0, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: voorlopigCfg.aan ? "pointer" : "default" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={nieuweReden}
                onChange={(e) => setNieuweReden(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !nieuweReden.trim()) return;
                  const label = nieuweReden.trim();
                  setVoorlopigCfg((h) => ({ ...h, redenen: [...(h.redenen || []), { sleutel: redenSleutel(label), label, actief: true }] }));
                  setNieuweReden(""); setVoorlopigStatus("rust");
                }}
                disabled={!voorlopigCfg.aan}
                placeholder="Nieuwe reden…"
                style={{ ...invoerStijl, flex: "1 1 220px", maxWidth: 340, background: "#fff" }}
              />
              <button
                onClick={() => {
                  const label = nieuweReden.trim();
                  if (!label) return;
                  setVoorlopigCfg((h) => ({ ...h, redenen: [...(h.redenen || []), { sleutel: redenSleutel(label), label, actief: true }] }));
                  setNieuweReden(""); setVoorlopigStatus("rust");
                }}
                disabled={!voorlopigCfg.aan || !nieuweReden.trim()}
                style={{ padding: "7px 14px", background: !voorlopigCfg.aan || !nieuweReden.trim() ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: !voorlopigCfg.aan || !nieuweReden.trim() ? "default" : "pointer" }}
              >
                Toevoegen
              </button>
            </div>
          </div>

          {/* Taak + status */}
          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 12, opacity: voorlopigCfg.aan ? 1 : 0.55 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>De verplichte herzieningstaak</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr)", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Taaksoort (verplicht)</div>
                <select
                  value={voorlopigCfg.taakSoort === null || voorlopigCfg.taakSoort === undefined ? "" : String(voorlopigCfg.taakSoort)}
                  onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, taakSoort: e.target.value })); setVoorlopigStatus("rust"); }}
                  disabled={!voorlopigCfg.aan}
                  style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                >
                  <option value="">— kies een taaksoort —</option>
                  {taakSoortOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Dossierstatus bij markeren</div>
                <select
                  value={voorlopigCfg.status === null || voorlopigCfg.status === undefined ? "" : String(voorlopigCfg.status)}
                  onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, status: e.target.value })); setVoorlopigStatus("rust"); }}
                  disabled={!voorlopigCfg.aan}
                  style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                >
                  <option value="">— status niet wijzigen —</option>
                  {statusOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Onderwerp van de taak</div>
            <input
              value={voorlopigCfg.taakOnderwerp || ""}
              onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, taakOnderwerp: e.target.value })); setVoorlopigStatus("rust"); }}
              disabled={!voorlopigCfg.aan}
              style={{ ...invoerStijl, width: "100%", background: "#fff", marginBottom: 8 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr)", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Rubriek (optioneel)</div>
                {taakRubriekOpties.length > 0 ? (
                  <select
                    value={voorlopigCfg.taakRubriek === null || voorlopigCfg.taakRubriek === undefined ? "" : String(voorlopigCfg.taakRubriek)}
                    onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, taakRubriek: e.target.value })); setVoorlopigStatus("rust"); }}
                    disabled={!voorlopigCfg.aan}
                    style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                  >
                    <option value="">— geen rubriek —</option>
                    {taakRubriekOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    value={voorlopigCfg.taakRubriek === null || voorlopigCfg.taakRubriek === undefined ? "" : String(voorlopigCfg.taakRubriek)}
                    onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, taakRubriek: e.target.value })); setVoorlopigStatus("rust"); }}
                    disabled={!voorlopigCfg.aan}
                    placeholder="optiesetwaarde, of leeg"
                    style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                  />
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Jaarlijkse uitvraagdatum</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number" min="1" max="31"
                    value={voorlopigCfg.herzienDag ?? 1}
                    onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, herzienDag: e.target.value })); setVoorlopigStatus("rust"); }}
                    disabled={!voorlopigCfg.aan}
                    title="Dag van de maand"
                    style={{ ...invoerStijl, width: 70, background: "#fff" }}
                  />
                  <select
                    value={String(voorlopigCfg.herzienMaand ?? 12)}
                    onChange={(e) => { setVoorlopigCfg((h) => ({ ...h, herzienMaand: e.target.value })); setVoorlopigStatus("rust"); }}
                    disabled={!voorlopigCfg.aan}
                    style={{ ...invoerStijl, flex: "1 1 auto", minWidth: 0, background: "#fff" }}
                  >
                    {MAANDNAMEN.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {voorlopigCfg.aan && (voorlopigCfg.taakSoort === "" || voorlopigCfg.taakSoort === null) && (
            <div style={{ fontSize: 12, color: KLEUR.rood, marginBottom: 10 }}>
              Kies een taaksoort voor de herzieningstaak — zonder die soort blijft de knop verborgen.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={bewaarVoorlopigInstellingen}
              disabled={voorlopigStatus === "bezig"}
              style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: voorlopigStatus === "bezig" ? "default" : "pointer" }}
            >
              {voorlopigStatus === "bezig" ? "Opslaan…" : "Opslaan"}
            </button>
            {voorlopigStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
            {voorlopigStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
          </div>
        </div>
      )}

      {/* ── Na versturen: vervolgtaak en dossierstatussen ──────────────────────────────────────
          Het vervolg op het blok "Opslag & taak" hierboven. Zodra de cliënt akkoord geeft of
          ondertekent op de taak die daar wordt aangemaakt, kan er een interne vervolgtaak ontstaan
          (bijv. "versturen naar Belastingdienst") en beweegt de dossierstatus mee. Rondt een
          medewerker die vervolgtaak af, dan volgt de laatste status en gaat het dossier eventueel
          op inactief. Zie api/_gedeeld/dossierTaakketen.js. */}
      {ketenCfg && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Na versturen — vervolgtaak &amp; dossierstatus ({soortLabelKort})</div>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, lineHeight: 1.6, marginBottom: 14 }}>
            Het vervolg op "Opslag &amp; taak" hierboven. De taak die daar bij de cliënt terechtkomt is
            onzichtbaar aan dit dossier gekoppeld; zodra de cliënt <strong>akkoord</strong> geeft of
            ondertekent, maken we (als je hieronder een taaksoort kiest) een <strong>interne
            vervolgtaak</strong> aan en zetten we de dossierstatus. Wordt die vervolgtaak in het
            Taken-overzicht afgerond, dan volgt de laatste status en gaat het dossier eventueel op
            inactief. Elk veld dat je leeg laat betekent: die stap slaan we over. In het onderwerp kun
            je <code>{"{klant}"}</code>, <code>{"{periode}"}</code> en <code>{"{soort}"}</code> gebruiken.
          </div>

          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>1. Bij het versturen naar de cliënt</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Dossierstatus</div>
            <select
              value={ketenCfg.statusVersturen === null || ketenCfg.statusVersturen === undefined ? "" : String(ketenCfg.statusVersturen)}
              onChange={(e) => { setKetenCfg((h) => ({ ...h, statusVersturen: e.target.value })); setKetenStatus("rust"); }}
              style={{ ...invoerStijl, width: "100%", maxWidth: 380, background: "#fff" }}
            >
              <option value="">— standaard van het systeem —</option>
              {statusOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>2. Zodra de cliënt akkoord geeft of ondertekent</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr)", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Soort van de interne vervolgtaak</div>
                <select
                  value={ketenCfg.akkoordTaakSoort === null || ketenCfg.akkoordTaakSoort === undefined ? "" : String(ketenCfg.akkoordTaakSoort)}
                  onChange={(e) => { setKetenCfg((h) => ({ ...h, akkoordTaakSoort: e.target.value })); setKetenStatus("rust"); }}
                  style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                >
                  <option value="">— geen vervolgtaak —</option>
                  {taakSoortOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Dossierstatus na akkoord</div>
                <select
                  value={ketenCfg.statusAkkoord === null || ketenCfg.statusAkkoord === undefined ? "" : String(ketenCfg.statusAkkoord)}
                  onChange={(e) => { setKetenCfg((h) => ({ ...h, statusAkkoord: e.target.value })); setKetenStatus("rust"); }}
                  style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                >
                  <option value="">— status niet wijzigen —</option>
                  {statusOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Onderwerp van de vervolgtaak</div>
            <input
              value={ketenCfg.akkoordTaakOnderwerp || ""}
              onChange={(e) => { setKetenCfg((h) => ({ ...h, akkoordTaakOnderwerp: e.target.value })); setKetenStatus("rust"); }}
              style={{ ...invoerStijl, width: "100%", background: "#fff", marginBottom: 8 }}
            />
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Rubriek op de vervolgtaak (optioneel)</div>
            {taakRubriekOpties.length > 0 ? (
              <select
                value={ketenCfg.akkoordTaakRubriek === null || ketenCfg.akkoordTaakRubriek === undefined ? "" : String(ketenCfg.akkoordTaakRubriek)}
                onChange={(e) => { setKetenCfg((h) => ({ ...h, akkoordTaakRubriek: e.target.value })); setKetenStatus("rust"); }}
                style={{ ...invoerStijl, width: "100%", maxWidth: 300, background: "#fff" }}
              >
                <option value="">— geen rubriek —</option>
                {taakRubriekOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
              </select>
            ) : (
              <input
                value={ketenCfg.akkoordTaakRubriek === null || ketenCfg.akkoordTaakRubriek === undefined ? "" : String(ketenCfg.akkoordTaakRubriek)}
                onChange={(e) => { setKetenCfg((h) => ({ ...h, akkoordTaakRubriek: e.target.value })); setKetenStatus("rust"); }}
                placeholder="optiesetwaarde (nummer), of leeg"
                style={{ ...invoerStijl, width: "100%", maxWidth: 300, background: "#fff" }}
              />
            )}
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6 }}>
              De vervolgtaak komt bij de <strong>manager van het dossier</strong> terecht (of anders bij de
              relatiebeheerder van de cliënt).
            </div>
          </div>

          <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 12, opacity: ketenCfg.akkoordTaakSoort === "" || ketenCfg.akkoordTaakSoort === null ? 0.55 : 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>3. Zodra die vervolgtaak is afgerond</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Dossierstatus</div>
            <select
              value={ketenCfg.statusVervolgKlaar === null || ketenCfg.statusVervolgKlaar === undefined ? "" : String(ketenCfg.statusVervolgKlaar)}
              onChange={(e) => { setKetenCfg((h) => ({ ...h, statusVervolgKlaar: e.target.value })); setKetenStatus("rust"); }}
              disabled={ketenCfg.akkoordTaakSoort === "" || ketenCfg.akkoordTaakSoort === null}
              style={{ ...invoerStijl, width: "100%", maxWidth: 380, background: "#fff", marginBottom: 8 }}
            >
              <option value="">— status niet wijzigen —</option>
              {statusOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: ketenCfg.inactiefNaVervolg ? KLEUR.blauw : KLEUR.subtekst, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!ketenCfg.inactiefNaVervolg}
                onChange={(e) => { setKetenCfg((h) => ({ ...h, inactiefNaVervolg: e.target.checked })); setKetenStatus("rust"); }}
                disabled={ketenCfg.akkoordTaakSoort === "" || ketenCfg.akkoordTaakSoort === null}
              />
              Dossier daarna op <strong>inactief</strong> zetten
            </label>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 6 }}>
              Een inactief dossier is alleen-lezen: het blijft gewoon zichtbaar en doorzoekbaar, maar
              niemand kan er nog iets in wijzigen. Terugzetten kan altijd in Dynamics.
            </div>
          </div>

          {/* Zelfde drie stappen, maar voor een voorlopige aangifte. Alleen de statussen verschillen —
              de taken, onderwerpen en rubriek hierboven gelden voor beide varianten. */}
          {(soort === "ib" || soort === "vpb") && (
            <div style={{ border: "1px solid #EBD9B4", background: "#FDF9F1", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#A9660C" }}>Voorlopige aangifte — dezelfde keten, andere statussen</div>
              <div style={{ fontSize: 12, color: KLEUR.subtekst, lineHeight: 1.6, marginBottom: 10 }}>
                Staat een dossier als voorlopige aangifte gemarkeerd, dan loopt precies hetzelfde proces —
                zelfde taken en onderwerpen, met "voorlopig" erbij — maar krijgt het dossier deze statussen.
                Laat je ze leeg, dan blijft de status bij een voorlopige aangifte ongemoeid. Het dossier
                gaat bij een voorlopige aangifte nooit op inactief; de herziening moet immers nog komen.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                {[
                  ["voorlopigStatusVersturen", "1. Bij versturen"],
                  ["voorlopigStatusAkkoord", "2. Na akkoord cliënt"],
                  ["voorlopigStatusVervolgKlaar", "3. Na afronden vervolgtaak"],
                ].map(([sleutel, label]) => (
                  <div key={sleutel}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>{label}</div>
                    <select
                      value={ketenCfg[sleutel] === null || ketenCfg[sleutel] === undefined ? "" : String(ketenCfg[sleutel])}
                      onChange={(e) => { setKetenCfg((h) => ({ ...h, [sleutel]: e.target.value })); setKetenStatus("rust"); }}
                      style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                    >
                      <option value="">— status niet wijzigen —</option>
                      {statusOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={bewaarKetenInstellingen}
              disabled={ketenStatus === "bezig"}
              style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: ketenStatus === "bezig" ? "default" : "pointer" }}
            >
              {ketenStatus === "bezig" ? "Opslaan…" : "Opslaan"}
            </button>
            {ketenStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
            {ketenStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
          </div>
        </div>
      )}

      {/* ── Review: het dossier bij een collega neerleggen ─────────────────────────────────────
          De medewerker klikt in het dossier op "Review aanvragen" en kiest een collega; die krijgt
          een taak van de hieronder gekozen soort. Tekent hij af — akkoord of aanpassen — dan
          ontstaat de bijbehorende vervolgtaak bij de AANVRAGER, met de opmerking van de reviewer
          erin, en beweegt de dossierstatus mee. Zie api/_gedeeld/dossierReview.js. */}
      {reviewCfg && (
        <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Review — {soortLabelKort}</div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: reviewCfg.aan ? KLEUR.blauw : KLEUR.subtekst, cursor: "pointer" }}>
              <input type="checkbox" checked={!!reviewCfg.aan} onChange={(e) => { setReviewCfg((h) => ({ ...h, aan: e.target.checked })); setReviewStatus("rust"); }} />
              Review-knop tonen in het {soortWoord}-dossier
            </label>
          </div>
          <div style={{ fontSize: 12.5, color: KLEUR.subtekst, lineHeight: 1.6, marginBottom: 14 }}>
            Een medewerker legt zijn dossier ter review bij een collega neer; die krijgt er een taak van.
            De reviewer tekent die taak af met <strong>Akkoord</strong> of <strong>Aanpassen na review</strong> en
            geeft daarbij een opmerking mee. Die opmerking komt in de vervolgtaak — die altijd naar de
            aanvrager gaat{heeftReviewNotitieVeld ? ' — en in het veld "Review-notitie" van het dossier' : ""}. In de
            onderwerpen kun je <code>{"{klant}"}</code>, <code>{"{periode}"}</code>, <code>{"{soort}"}</code>,{" "}
            <code>{"{aanvrager}"}</code> en <code>{"{reviewer}"}</code> gebruiken — <code>{"{periode}"}</code> wordt
            het jaar, of bij notulen de vergaderdatum. Laat een taaksoort leeg om voor die uitkomst géén taak aan te maken.
          </div>
          {!heeftReviewNotitieVeld && (
            <div style={{ fontSize: 12, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", marginBottom: 14, lineHeight: 1.6 }}>
              Deze dossiersoort heeft geen veld <strong>Review-notitie</strong> in de catalogus. De opmerking van de
              reviewer komt dan alleen in de vervolgtaak terecht — dat werkt prima, maar je leest 'm niet terug in het
              dossier zelf. Wil je dat wel, maak dan hierboven met "Nieuw veld aanmaken" een memo-veld met de sleutel{" "}
              <code>reviewnotitie</code>.
            </div>
          )}

          {[
            { titel: "1. De reviewtaak (naar de gekozen collega)", soortKey: "taakSoort", ondKey: "taakOnderwerp", statusKey: "statusAanvraag", statusLabel: "Dossierstatus bij aanvragen", verplicht: true },
            { titel: "2. Uitkomst “Akkoord” — vervolgtaak naar de aanvrager", soortKey: "akkoordTaakSoort", ondKey: "akkoordTaakOnderwerp", statusKey: "statusAkkoord", statusLabel: "Dossierstatus na akkoord" },
            { titel: "3. Uitkomst “Aanpassen na review” — taak terug naar de aanvrager", soortKey: "aanpassenTaakSoort", ondKey: "aanpassenTaakOnderwerp", statusKey: "statusAanpassen", statusLabel: "Dossierstatus bij aanpassen" },
          ].map((blok) => (
            <div key={blok.soortKey} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 12, marginBottom: 10, opacity: reviewCfg.aan ? 1 : 0.55 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{blok.titel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr)", gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Taaksoort{blok.verplicht ? " (verplicht)" : ""}</div>
                  <select
                    value={reviewCfg[blok.soortKey] === null || reviewCfg[blok.soortKey] === undefined ? "" : String(reviewCfg[blok.soortKey])}
                    onChange={(e) => { setReviewCfg((h) => ({ ...h, [blok.soortKey]: e.target.value })); setReviewStatus("rust"); }}
                    disabled={!reviewCfg.aan}
                    style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                  >
                    <option value="">— geen taak aanmaken —</option>
                    {taakSoortOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>{blok.statusLabel}</div>
                  <select
                    value={reviewCfg[blok.statusKey] === null || reviewCfg[blok.statusKey] === undefined ? "" : String(reviewCfg[blok.statusKey])}
                    onChange={(e) => { setReviewCfg((h) => ({ ...h, [blok.statusKey]: e.target.value })); setReviewStatus("rust"); }}
                    disabled={!reviewCfg.aan}
                    style={{ ...invoerStijl, width: "100%", background: "#fff" }}
                  >
                    <option value="">— status niet wijzigen —</option>
                    {statusOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Onderwerp van de taak</div>
              <input
                value={reviewCfg[blok.ondKey] || ""}
                onChange={(e) => { setReviewCfg((h) => ({ ...h, [blok.ondKey]: e.target.value })); setReviewStatus("rust"); }}
                disabled={!reviewCfg.aan}
                style={{ ...invoerStijl, width: "100%", background: "#fff" }}
              />
            </div>
          ))}

          <div style={{ marginBottom: 12, opacity: reviewCfg.aan ? 1 : 0.55 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, marginBottom: 3 }}>Rubriek op de aangemaakte taken (optioneel)</div>
            {taakRubriekOpties.length > 0 ? (
              <select
                value={reviewCfg.taakRubriek === null || reviewCfg.taakRubriek === undefined ? "" : String(reviewCfg.taakRubriek)}
                onChange={(e) => { setReviewCfg((h) => ({ ...h, taakRubriek: e.target.value })); setReviewStatus("rust"); }}
                disabled={!reviewCfg.aan}
                style={{ ...invoerStijl, width: "100%", maxWidth: 300, background: "#fff" }}
              >
                <option value="">— geen rubriek —</option>
                {taakRubriekOpties.map((o) => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
              </select>
            ) : (
              <input
                value={reviewCfg.taakRubriek === null || reviewCfg.taakRubriek === undefined ? "" : String(reviewCfg.taakRubriek)}
                onChange={(e) => { setReviewCfg((h) => ({ ...h, taakRubriek: e.target.value })); setReviewStatus("rust"); }}
                disabled={!reviewCfg.aan}
                placeholder="optiesetwaarde (nummer), of leeg"
                style={{ ...invoerStijl, width: "100%", maxWidth: 300, background: "#fff" }}
              />
            )}
          </div>

          {reviewCfg.aan && (reviewCfg.taakSoort === "" || reviewCfg.taakSoort === null) && (
            <div style={{ fontSize: 12, color: KLEUR.rood, marginBottom: 10 }}>
              Kies een taaksoort voor de reviewtaak — zonder die soort verschijnt de knop wel, maar kan er geen review worden uitgezet.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={bewaarReviewInstellingen}
              disabled={reviewStatus === "bezig"}
              style={{ padding: "7px 14px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: reviewStatus === "bezig" ? "default" : "pointer" }}
            >
              {reviewStatus === "bezig" ? "Opslaan…" : "Opslaan"}
            </button>
            {reviewStatus === "opgeslagen" && <span style={{ fontSize: 11.5, color: KLEUR.groen }}>Opgeslagen</span>}
            {reviewStatus === "fout" && <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Opslaan mislukt</span>}
          </div>
        </div>
      )}

      {/* Notulen/dividend: dezelfde geblokte layout als de IB/VPB-"aangifte versturen"-blokken, maar dan
          voor de bijlage-mail (<soort>Mail) en de klant-taak (<soort>Taak). Op dezelfde plek in het paneel. */}
      {(soort === "notulen" || soort === "dividend") && <DossierMailTaakPerSoort soort={soort} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
        {(secties || []).map((sectie, sectieIndex) => {
          const directeVelden = sectie.velden || [];
          const subsecties = sectie.subsecties || [];
          return (
            <div key={sectie.sleutel} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <button onClick={() => verplaatsSectie(sectie.sleutel, -1)} disabled={sectieIndex === 0} title="Rubriek omhoog" style={{ background: "none", border: "none", color: sectieIndex === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: sectieIndex === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={16} /></button>
                <button onClick={() => verplaatsSectie(sectie.sleutel, 1)} disabled={sectieIndex === (secties || []).length - 1} title="Rubriek omlaag" style={{ background: "none", border: "none", color: sectieIndex === (secties || []).length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: sectieIndex === (secties || []).length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={16} /></button>
                <input
                  value={sectie.titel}
                  onChange={(e) => hernoemSectie(sectie.sleutel, e.target.value)}
                  onBlur={sectieHernoemOpslaan}
                  style={{ ...invoerStijl, flex: "0 1 320px", fontWeight: 700 }}
                />
                <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>
                  {directeVelden.length} veld(en){subsecties.length > 0 ? ` · ${subsecties.length} subrubriek(en)` : ""}
                </span>
                <button
                  onClick={() => verwijderSectie(sectie.sleutel)}
                  title="Rubriek verwijderen"
                  style={{ marginLeft: "auto", background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 4, display: "flex" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Bijlage-dropzone voor deze rubriek — vinkje + ja/nee-kolom (+ submap/bestandsnaam). De
                  dropzone verschijnt in het dossier ín deze rubriek zodra de gekozen ja/nee-kolom op Ja staat. */}
              <div style={{ background: "#FAFBF9", border: `1px dashed ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst }}>
                  <input type="checkbox" checked={!!(sectie.bijlage && sectie.bijlage.aan)} onChange={(e) => zetSectieBijlageEnBewaar(sectie.sleutel, { aan: e.target.checked })} />
                  Bijlage-dropzone in deze rubriek
                </label>
                {sectie.bijlage && sectie.bijlage.aan && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "flex-end" }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>Toon zodra ja/nee-veld</div>
                        <select value={(sectie.bijlage && sectie.bijlage.trigger) || ""} onChange={(e) => zetSectieBijlageEnBewaar(sectie.sleutel, { trigger: e.target.value })} style={{ ...invoerStijl, minWidth: 190, background: "#fff" }}>
                          <option value="">Altijd tonen</option>
                          {jaNeeVelden.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>SharePoint-submap</div>
                        <input value={(sectie.bijlage && sectie.bijlage.submap) || ""} onChange={(e) => wijzigSectieBijlage(sectie.sleutel, { submap: e.target.value })} onBlur={sectieBijlageOpslaan} placeholder="Bijlagen" style={{ ...invoerStijl, width: 180 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>Bestandsnaam</div>
                        <input value={(sectie.bijlage && sectie.bijlage.bestandsnaam) || ""} onChange={(e) => wijzigSectieBijlage(sectie.sleutel, { bestandsnaam: e.target.value })} onBlur={sectieBijlageOpslaan} placeholder="bijv. {{jaar}} — leeg = originele naam" style={{ ...invoerStijl, width: 250 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                      De dropzone verschijnt in het dossier onder de rubriek “{sectie.titel}”. Bestandsnaam mag <code style={{ background: "#fff", padding: "0 3px", borderRadius: 3, border: `1px solid ${KLEUR.rand}` }}>{"{{klantnaam}}"}</code>/<code style={{ background: "#fff", padding: "0 3px", borderRadius: 3, border: `1px solid ${KLEUR.rand}` }}>{"{{jaar}}"}</code>/<code style={{ background: "#fff", padding: "0 3px", borderRadius: 3, border: `1px solid ${KLEUR.rand}` }}>{"{{datum}}"}</code> bevatten; bij meerdere bestanden komt er een volgnummer achter.
                    </div>
                  </>
                )}
              </div>

              {directeVelden.length === 0 ? (
                <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 2px" }}>Nog geen velden rechtstreeks in deze rubriek.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {directeVelden.map((key, i) => (
                    <VeldRij key={key} {...veldRijProps(key, sectie.sleutel, i, directeVelden.length - 1)} />
                  ))}
                </div>
              )}

              {subsecties.map((sub, subIndex) => {
                const subVelden = sub.velden || [];
                const subPad = `${sectie.sleutel}::${sub.sleutel}`;
                return (
                  <div key={sub.sleutel} style={{ marginTop: 12, marginLeft: 14, paddingLeft: 12, borderLeft: `2px solid ${KLEUR.rand}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input
                        value={sub.titel}
                        onChange={(e) => hernoemSubsectie(sectie.sleutel, sub.sleutel, e.target.value)}
                        onBlur={subsectieHernoemOpslaan}
                        style={{ ...invoerStijl, flex: "0 1 260px", fontSize: 12.5 }}
                      />
                      <span style={{ fontSize: 11, color: KLEUR.mutedTekst }}>{subVelden.length} veld(en)</span>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
                        <button
                          onClick={() => verplaatsSubsectie(sectie.sleutel, sub.sleutel, -1)}
                          disabled={subIndex === 0}
                          title="Subrubriek omhoog"
                          style={{ background: "none", border: "none", color: subIndex === 0 ? KLEUR.rand : KLEUR.subtekst, cursor: subIndex === 0 ? "default" : "pointer", padding: 2, display: "flex" }}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => verplaatsSubsectie(sectie.sleutel, sub.sleutel, 1)}
                          disabled={subIndex === subsecties.length - 1}
                          title="Subrubriek omlaag"
                          style={{ background: "none", border: "none", color: subIndex === subsecties.length - 1 ? KLEUR.rand : KLEUR.subtekst, cursor: subIndex === subsecties.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={() => verwijderSubsectie(sectie.sleutel, sub.sleutel)}
                          title="Subrubriek verwijderen"
                          style={{ background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 4, display: "flex" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {subVelden.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, padding: "2px 2px 4px" }}>Nog geen velden in deze subrubriek.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
                        {subVelden.map((key, i) => (
                          <VeldRij key={key} {...veldRijProps(key, subPad, i, subVelden.length - 1)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 6, marginTop: 12, marginLeft: 14 }}>
                <input
                  value={nieuweSubsectieTitel[sectie.sleutel] || ""}
                  onChange={(e) => setNieuweSubsectieTitel((h) => ({ ...h, [sectie.sleutel]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegSubsectieToe(sectie.sleutel); } }}
                  placeholder="Nieuwe subrubriek, bijv. Fiscaal partner"
                  style={{ ...invoerStijl, flex: "0 1 260px", fontSize: 12.5, padding: "5px 8px" }}
                />
                <button
                  onClick={() => voegSubsectieToe(sectie.sleutel)}
                  disabled={!(nieuweSubsectieTitel[sectie.sleutel] || "").trim()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px",
                    background: "#fff", color: KLEUR.blauw, border: `1px solid ${KLEUR.blauw}`, borderRadius: 7,
                    fontSize: 11.5, fontWeight: 600, cursor: (nieuweSubsectieTitel[sectie.sleutel] || "").trim() ? "pointer" : "default",
                    opacity: (nieuweSubsectieTitel[sectie.sleutel] || "").trim() ? 1 : 0.6,
                  }}
                >
                  <Plus size={12} /> Subrubriek
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={nieuweSectieTitel}
          onChange={(e) => setNieuweSectieTitel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegSectieToe(); } }}
          placeholder="Nieuwe hoofdrubriek, bijv. Ondernemerschap"
          style={{ ...invoerStijl, flex: "0 1 320px" }}
        />
        <button
          onClick={voegSectieToe}
          disabled={!nieuweSectieTitel.trim()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
            background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8,
            fontSize: 12.5, fontWeight: 600, cursor: nieuweSectieTitel.trim() ? "pointer" : "default",
            opacity: nieuweSectieTitel.trim() ? 1 : 0.6,
          }}
        >
          <Plus size={14} /> Nieuwe hoofdrubriek
        </button>
        {status === "bezig" && <span style={{ fontSize: 12, color: KLEUR.mutedTekst, alignSelf: "center" }}>Opslaan…</span>}
        {status === "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.groen, alignSelf: "center" }}>Opgeslagen</span>}
      </div>

      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Niet ingedeeld ({nietIngedeeld.length})</div>
        {nietIngedeeld.length === 0 ? (
          <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Alle velden zijn ingedeeld.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nietIngedeeld.map((v) => (
              <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "#FBFBF9", opacity: 0.85 }}>
                <input
                  value={weergaveLabel(v.key)}
                  onChange={(e) => zetLabel(v.key, e.target.value)}
                  onBlur={labelBlurOpslaan}
                  style={{ ...invoerStijl, flex: 1, minWidth: 0, fontSize: 12.5, padding: "4px 7px", background: "#fff" }}
                />
                <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".02em" }}>{v.type.replace("vast-", "")}</span>
                <select value="" onChange={(e) => verplaatsVeld(v.key, e.target.value)} style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5 }}>
                  {padOpties("")}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          <Sparkles size={14} color={KLEUR.blauw} /> Nieuw veld aanmaken
        </div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 }}>
          Maakt een echte nieuwe kolom aan op de tabel {(SOORTEN_TABS.find((s) => s.key === soort) || {}).dynamicsTabel || "Inkomstenbelasting"} in Dynamics en zet het
          veld daarna klaar bij "Niet ingedeeld" hierboven. Keuzelijsten (met eigen opties) kunnen
          op deze manier nog niet aangemaakt worden.
        </div>
        {nieuwVeldFout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 8 }}>{nieuwVeldFout}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={nieuwVeldLabel}
            onChange={(e) => setNieuwVeldLabel(e.target.value)}
            placeholder="Naam van het nieuwe veld, bijv. Crypto-portefeuille"
            style={{ ...invoerStijl, flex: "0 1 320px" }}
          />
          <select value={nieuwVeldType} onChange={(e) => setNieuwVeldType(e.target.value)} style={{ ...invoerStijl, flex: "0 1 160px" }}>
            {NIEUW_VELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
          <button
            onClick={maakNieuwVeld}
            disabled={!nieuwVeldLabel.trim() || nieuwVeldBezig}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
              background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, cursor: (!nieuwVeldLabel.trim() || nieuwVeldBezig) ? "default" : "pointer",
              opacity: (!nieuwVeldLabel.trim() || nieuwVeldBezig) ? 0.6 : 1,
            }}
          >
            <Plus size={14} /> {nieuwVeldBezig ? "Bezig…" : "Veld aanmaken"}
          </button>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14, marginTop: 20 }}>
        <div onClick={toggleKolommen} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 6, cursor: "pointer" }}>
          {kolommenOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Bestaande kolom toevoegen
        </div>
        <div style={{ fontSize: 12, color: KLEUR.subtekst, marginBottom: 10, maxWidth: 640 }}>
          Kolommen die al op de tabel {(SOORTEN_TABS.find((s) => s.key === soort) || {}).dynamicsTabel || ""} in Dynamics bestaan
          maar nog niet in dit dossier zitten. Klik op <strong>Toevoegen</strong> om er één als veld op te nemen — hij verschijnt dan
          bij "Niet ingedeeld" hierboven, klaar om in een rubriek te zetten en (eventueel) te hernoemen. Ook lookups (koppelingen naar een
          persoon/relatie zoals voorzitter/aandeelhouder) staan erbij — die krijgen in het dossier een zoek-kiezer. Niet-ondersteunde typen worden niet getoond.
        </div>
        {kolommenOpen && (
          <div>
            {kolommenLaden ? (
              <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Kolommen ophalen…</div>
            ) : kolommenFout ? (
              <div style={{ fontSize: 12.5, color: KLEUR.rood }}>
                {kolommenFout}{" "}
                <button onClick={laadBeschikbareKolommen} style={{ marginLeft: 6, background: "none", border: "none", color: KLEUR.blauw, fontWeight: 600, cursor: "pointer", padding: 0 }}>Opnieuw proberen</button>
              </div>
            ) : (beschikbareKolommen && beschikbareKolommen.length === 0) ? (
              <div style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Geen ongebruikte kolommen gevonden — alle bestaande (ondersteunde) kolommen zitten al in dit dossier.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 340, overflowY: "auto" }}>
                {(beschikbareKolommen || []).map((k) => (
                  <div key={k.veld} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "#FBFBF9" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={k.label}>{k.label}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: KLEUR.mutedTekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }} title={k.veld}>{k.veld}</span>
                    <span style={{ fontSize: 10.5, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".02em" }}>{k.type}</span>
                    <button
                      onClick={() => voegBestaandeKolomToe(k)}
                      disabled={kolomBezig === k.veld}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: kolomBezig === k.veld ? "default" : "pointer", opacity: kolomBezig === k.veld ? 0.6 : 1 }}
                    >
                      <Plus size={13} /> {kolomBezig === k.veld ? "Bezig…" : "Toevoegen"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Genest onderaan het indeling-paneel (bijv. de Bijlage-dropzone) — zo staat in het hoofdscherm
          alleen de dossierkaart en verschijnt dit als sub-blok zodra je de kaart openklapt. */}
      {onderaan && <div style={{ marginTop: 12 }}>{onderaan}</div>}
      </>)}
    </div>
  );
}

// De pagina zelf: één indeling-paneel per dossiersoort onder elkaar (Inkomstenbelasting én
// Vennootschapsbelasting), elk zelfstandig in- en uitklapbaar en met exact dezelfde functies.
export default function DossierIndelingBeheer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {SOORTEN_TABS.map((s) => (
        <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* De bijlage-dropzone wordt per rubriek ingesteld en de "Voorbeelddocumenten" (notulen/dividend)
              hangen genest ónder het indeling-paneel (via de onderaan-prop) — zo staat in het hoofdscherm
              alleen de dossierkaart. */}
          <SoortIndelingPaneel
            soort={s.key}
            onderaan={SOORTEN_MET_SJABLONEN.has(s.key) ? <DossierSjablonenPerSoort soort={s.key} /> : null}
          />
        </div>
      ))}
    </div>
  );
}
