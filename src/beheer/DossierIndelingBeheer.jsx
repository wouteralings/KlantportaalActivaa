import { useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, X, Eye, EyeOff, Lock, Unlock, Sparkles } from "lucide-react";

/** Zelfde palet als de rest van het beheerdersportaal (bewust hier herhaald, zie bijv.
 *  ContractenTypesBeheer.jsx — deze bestanden staan bewust op zichzelf). */
const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#A67C00",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none" };

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
function VeldRij({ veldKey, veld, weergaveLabel, pad, padOpties, index, laatsteIndex, isVerborgen, isAlleenLezen, voorwaardeParent, booleanVelden, onZetLabel, onLabelBlur, onZetVoorwaarde, onToggleVerborgen, onToggleAlleenLezen, onOmhoog, onOmlaag, onVerplaats, onVerwijderUitSectie }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "#FBFBF9", opacity: isVerborgen ? 0.6 : 1 }}>
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
      <select
        value={voorwaardeParent || ""}
        onChange={(e) => onZetVoorwaarde(e.target.value)}
        title="Alleen tonen als dit ja/nee-veld op het dossier 'Ja' is"
        style={{ ...invoerStijl, padding: "4px 6px", fontSize: 11.5, maxWidth: 170 }}
      >
        <option value="">Altijd tonen</option>
        {booleanVelden.filter((b) => b.key !== veldKey).map((b) => <option key={b.key} value={b.key}>Alleen als: {b.label}</option>)}
      </select>
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
export default function DossierIndelingBeheer() {
  const [open, setOpen] = useState(false); // hele paneel dichtgeklapt bij openen van de pagina
  const [catalogus, setCatalogus] = useState(null); // null = laden
  const [dossierIndeling, setDossierIndeling] = useState(null); // volledig object uit instellingen (alle soorten)
  const [secties, setSecties] = useState(null); // werk-kopie van dossierIndeling.ib.secties (elk met optionele subsecties)
  const [verborgen, setVerborgen] = useState([]); // sleutels die in het medewerkersdossier nooit getoond worden
  const [voorwaarden, setVoorwaarden] = useState({}); // { childKey: parentBooleanKey } — child alleen tonen als parent Ja is
  const [alleenLezen, setAlleenLezen] = useState([]); // sleutels die wel getoond maar niet bewerkt mogen worden
  const [labels, setLabels] = useState({}); // { sleutel: eigen weergavenaam } — overschrijft het standaardlabel
  const [aangepasteVelden, setAangepasteVelden] = useState([]); // zelf aangemaakte extra catalogusvelden (incl. Dynamics-kolom)
  const [onderwerpen, setOnderwerpen] = useState([]); // catalogus uit Beheer → Onderwerpen (Uitvraag dynamisch), voor de koppel-dropdown
  const [onderwerpId, setOnderwerpId] = useState(""); // gekoppeld onderwerp voor deze dossiersoort — leeg = geen koppeling
  const [fout, setFout] = useState("");
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [nieuweSectieTitel, setNieuweSectieTitel] = useState("");
  const [nieuweSubsectieTitel, setNieuweSubsectieTitel] = useState({}); // { sectieSleutel: draftTitel }
  const [nieuwVeldLabel, setNieuwVeldLabel] = useState("");
  const [nieuwVeldType, setNieuwVeldType] = useState("boolean");
  const [nieuwVeldBezig, setNieuwVeldBezig] = useState(false);
  const [nieuwVeldFout, setNieuwVeldFout] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/dossier-velden?soort=ib").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/beheer-instellingen").then((r) => (r.ok ? r.json() : Promise.reject())),
      // Best-effort: de onderwerpen-catalogus (Beheer → Onderwerpen, zie "Uitvraag dynamisch") is
      // alleen nodig voor de koppel-dropdown hieronder — als die nog niet geconfigureerd is, mag
      // dat de rest van dit scherm niet blokkeren (dan toont de dropdown gewoon "nog geen
      // onderwerpen ingericht").
      fetch("/api/beheer-aanleveronderwerpen").then((r) => (r.ok ? r.json() : { onderwerpen: [] })).catch(() => ({ onderwerpen: [] })),
    ])
      .then(([veldenData, instellingenData, onderwerpenData]) => {
        setCatalogus(veldenData.catalogus || []);
        const huidigeIndeling = instellingenData.dossierIndeling || {};
        setDossierIndeling(huidigeIndeling);
        const eigenSecties = (huidigeIndeling.ib && huidigeIndeling.ib.secties) || [];
        // Terugval voor secties die nog van vóór de subrubrieken-uitbreiding stammen.
        setSecties(eigenSecties.map((s) => ({ ...s, subsecties: s.subsecties || [] })));
        setVerborgen((huidigeIndeling.ib && huidigeIndeling.ib.verborgen) || []);
        setVoorwaarden((huidigeIndeling.ib && huidigeIndeling.ib.voorwaarden) || {});
        setAlleenLezen((huidigeIndeling.ib && huidigeIndeling.ib.alleenLezen) || []);
        setLabels((huidigeIndeling.ib && huidigeIndeling.ib.labels) || {});
        setAangepasteVelden((huidigeIndeling.ib && huidigeIndeling.ib.aangepasteVelden) || []);
        setOnderwerpId((huidigeIndeling.ib && huidigeIndeling.ib.onderwerpId) || "");
        setOnderwerpen(onderwerpenData.onderwerpen || []);
      })
      .catch(() => { setCatalogus([]); setSecties([]); setFout("Kon de dossierindeling niet laden."); });
  }, []);

  const veldInfo = (key) => (catalogus || []).find((v) => v.key === key);
  const weergaveLabel = (key) => labels[key] || (veldInfo(key)?.label) || key;
  const ingedeeldeKeys = new Set((secties || []).flatMap((s) => [...(s.velden || []), ...(s.subsecties || []).flatMap((sub) => sub.velden || [])]));
  const nietIngedeeld = (catalogus || []).filter((v) => !ingedeeldeKeys.has(v.key));
  // Alleen boolean-velden komen in aanmerking als "voorwaarde" (een ja/nee-poortje voor een ander veld).
  const booleanVelden = (catalogus || []).filter((v) => v.type === "boolean");
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
      const volledigeIndeling = {
        ...(dossierIndeling || {}),
        ib: {
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

  // Voorwaarde: "key" alleen tonen in het medewerkersdossier als het boolean-veld "parentKey" op
  // dat dossier "Ja" is. Kies "" om de voorwaarde weer weg te halen (altijd tonen).
  const zetVoorwaarde = (key, parentKey) => {
    const volgende = { ...voorwaarden };
    if (parentKey) volgende[key] = parentKey; else delete volgende[key];
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
    if (!confirm(`Nieuw veld "${labelTekst}" aanmaken? Dit voegt een echte nieuwe kolom toe aan de tabel Inkomstenbelasting in Dynamics.`)) return;
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
        body: JSON.stringify({ soort: "ib", key, label: labelTekst, type: nieuwVeldType }),
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
    voorwaardeParent: voorwaarden[key],
    booleanVelden,
    onZetLabel: (waarde) => zetLabel(key, waarde),
    onLabelBlur: labelBlurOpslaan,
    onZetVoorwaarde: (parentKey) => zetVoorwaarde(key, parentKey),
    onToggleVerborgen: () => toggleVerborgen(key),
    onToggleAlleenLezen: () => toggleAlleenLezen(key),
    onOmhoog: () => verplaatsBinnenGroep(pad, key, -1),
    onOmlaag: () => verplaatsBinnenGroep(pad, key, 1),
    onVerplaats: (doelPad) => verplaatsVeld(key, doelPad),
    onVerwijderUitSectie: () => verplaatsVeld(key, ""),
  });

  return (
    <div>
      <button
        onClick={() => setOpen((h) => !h)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: open ? 6 : 0, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: KLEUR.tekst }}
      >
        {open ? <ChevronDown size={16} color={KLEUR.mutedTekst} /> : <ChevronRight size={16} color={KLEUR.mutedTekst} />}
        <FolderKanban size={16} color={KLEUR.blauw} /> Dossiers — indeling Inkomstenbelasting
      </button>
      {!open && (
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 4 }}>
          {aantalIngedeeld} veld(en) ingedeeld · {verborgen.length} verborgen · {alleenLezen.length} alleen-lezen · {nietIngedeeld.length} niet ingedeeld
        </div>
      )}

      {open && (<>
      <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 14, maxWidth: 760 }}>
        Bepaalt hoe het IB-dossier eruitziet op de dossierpagina van een cliënt in het
        medewerkersportaal (Klantoverzicht → Inkomstenbelasting → dossier openen) — óók de vaste
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
          Kies het onderwerp (uit Beheer → Onderwerpen) dat bij Inkomstenbelasting hoort. Uitvraaglijsten
          (aanleververzoeken) met dit onderwerp verschijnen dan automatisch — bij dezelfde cliënt en,
          als het dossier een jaar heeft, hetzelfde jaar — in het IB-dossier zelf.
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

              {directeVelden.length === 0 ? (
                <div style={{ fontSize: 12, color: KLEUR.mutedTekst, padding: "4px 2px" }}>Nog geen velden rechtstreeks in deze rubriek.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {directeVelden.map((key, i) => (
                    <VeldRij key={key} {...veldRijProps(key, sectie.sleutel, i, directeVelden.length - 1)} />
                  ))}
                </div>
              )}

              {subsecties.map((sub) => {
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
                      <button
                        onClick={() => verwijderSubsectie(sectie.sleutel, sub.sleutel)}
                        title="Subrubriek verwijderen"
                        style={{ marginLeft: "auto", background: "none", border: "none", color: KLEUR.mutedTekst, cursor: "pointer", padding: 4, display: "flex" }}
                      >
                        <Trash2 size={13} />
                      </button>
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
          Maakt een echte nieuwe kolom aan op de tabel Inkomstenbelasting in Dynamics en zet het
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
      </>)}
    </div>
  );
}
