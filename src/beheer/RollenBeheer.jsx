/**
 * Beheer → Rollen & toegang. Maak rollen aan en bepaal per rol welke tabs (rubrieken) zichtbaar zijn in
 * het medewerkers- én beheerdersportaal en welke functies de rol mag. Wijs elke medewerker één rol toe.
 *
 * Fase 1: aanmaken + toewijzen (opslag via /api/beheer-rollen). Fase 2/3: tabs verbergen in beide
 * portalen + functies voeden. Fase 4: "kijken als rol" — met de knop per rol bekijkt de beheerder het
 * portaal precies zoals die rol het ziet en kan (server-ondersteund via /api/impersonatie).
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, CheckCircle2, ShieldCheck, Users, LayoutGrid, Eye, Layers } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46",
};
const invoerStijl = { boxSizing: "border-box", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", background: "#fff" };

function Vinkjes({ opties, geselecteerd, onToggle }) {
  const set = new Set(geselecteerd || []);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {opties.map((o) => {
        const aan = set.has(o.key);
        return (
          <button key={o.key} onClick={() => onToggle(o.key)} style={{ padding: "5px 10px", borderRadius: 20, border: `1px solid ${aan ? KLEUR.blauw : KLEUR.rand}`, background: aan ? KLEUR.lichtblauw : "#fff", color: aan ? KLEUR.blauw : KLEUR.mutedTekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {aan ? "✓ " : ""}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// Per rubriek (medewerker-tab) een keuze: Uit (verborgen) · Lezen (zichtbaar, alleen-lezen) · Bewerken.
// Optioneel (alleen medewerker-rubrieken): een losse "mag verwijderen"-schakelaar náást die keuze —
// pas te zetten als de rubriek zichtbaar is (niet Uit). Geef onZetVerwijder mee om die kolom te tonen.
const TAB_STATEN = [["uit", "Uit"], ["lezen", "Lezen"], ["bewerken", "Bewerken"]];
function TabRechten({ opties, zichtbaar, bewerkbaar, verwijderbaar, onZet, onZetVerwijder }) {
  const zicht = new Set(zichtbaar || []);
  const bew = new Set(bewerkbaar || []);
  const verw = new Set(verwijderbaar || []);
  const staatVan = (k) => (!zicht.has(k) ? "uit" : (bew.has(k) ? "bewerken" : "lezen"));
  const toonVerwijder = typeof onZetVerwijder === "function";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: toonVerwijder ? 620 : 460 }}>
      {opties.map((o) => {
        const st = staatVan(o.key);
        const uit = st === "uit";
        return (
          <div key={o.key} style={{ display: "grid", gridTemplateColumns: toonVerwijder ? "minmax(110px,1fr) auto auto" : "minmax(110px,1fr) auto", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: uit ? KLEUR.mutedTekst : KLEUR.tekst, fontWeight: uit ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
            <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, overflow: "hidden" }}>
              {TAB_STATEN.map(([val, lab], idx) => {
                const aan = st === val;
                const kleur = val === "bewerken" ? KLEUR.blauw : val === "lezen" ? KLEUR.groen : KLEUR.mutedTekst;
                return (
                  <button key={val} onClick={() => onZet(o.key, val)} style={{ padding: "4px 11px", border: "none", borderLeft: idx ? `1px solid ${KLEUR.rand}` : "none", background: aan ? kleur : "#fff", color: aan ? "#fff" : KLEUR.subtekst, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{lab}</button>
                );
              })}
            </div>
            {toonVerwijder && (
              <label title={uit ? "Eerst zichtbaar maken (Lezen of Bewerken)" : "Mag in deze rubriek verwijderen"} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: uit ? KLEUR.mutedTekst : (verw.has(o.key) ? KLEUR.rood : KLEUR.subtekst), cursor: uit ? "default" : "pointer", whiteSpace: "nowrap", opacity: uit ? 0.5 : 1 }}>
                <input type="checkbox" checked={verw.has(o.key)} disabled={uit} onChange={() => onZetVerwijder(o.key, !verw.has(o.key))} />
                <Trash2 size={12} /> Verwijderen
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Subpagina-rechten: per subpagina (gegroepeerd onder de hoofd-rubriek) een tri-state (uit/lezen/bewerken)
// plus losse schakelaars "verwijderen" en "bulk verwijderen". Verwijderen kan alleen op een zichtbare
// subpagina; bulk kan alleen als verwijderen aan staat. Zonder enige subpagina-config erft een rubriek
// gewoon de rechten van de hoofd-rubriek (dus dit is puur een verfijning).
function SubPaginaRechten({ opties, parents, zichtbaar, bewerkbaar, verwijderbaar, bulk, onZet, onZetVerwijder, onZetBulk }) {
  const zicht = new Set(zichtbaar || []);
  const bew = new Set(bewerkbaar || []);
  const verw = new Set(verwijderbaar || []);
  const bulkSet = new Set(bulk || []);
  const staatVan = (k) => (!zicht.has(k) ? "uit" : (bew.has(k) ? "bewerken" : "lezen"));
  const parentLabel = (pk) => (parents.find((p) => p.key === pk)?.label || pk);
  // Groepeer de subpagina's op hun hoofd-rubriek (parent), in de volgorde waarin ze binnenkomen.
  const groepen = [];
  for (const o of opties) {
    let g = groepen.find((x) => x.parent === o.parent);
    if (!g) { g = { parent: o.parent, items: [] }; groepen.push(g); }
    g.items.push(o);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      {groepen.map((g) => (
        <div key={g.parent}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: KLEUR.blauw, marginBottom: 4 }}>{parentLabel(g.parent)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {g.items.map((o) => {
              const st = staatVan(o.key);
              const uit = st === "uit";
              const magVerw = verw.has(o.key);
              return (
                <div key={o.key} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) auto auto auto", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: uit ? KLEUR.mutedTekst : KLEUR.tekst, fontWeight: uit ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 7, overflow: "hidden" }}>
                    {TAB_STATEN.map(([val, lab], idx) => {
                      const aan = st === val;
                      const kleur = val === "bewerken" ? KLEUR.blauw : val === "lezen" ? KLEUR.groen : KLEUR.mutedTekst;
                      return (
                        <button key={val} onClick={() => onZet(o.key, val)} style={{ padding: "4px 11px", border: "none", borderLeft: idx ? `1px solid ${KLEUR.rand}` : "none", background: aan ? kleur : "#fff", color: aan ? "#fff" : KLEUR.subtekst, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{lab}</button>
                      );
                    })}
                  </div>
                  <label title={uit ? "Eerst zichtbaar maken (Lezen of Bewerken)" : "Mag op deze subpagina verwijderen"} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: uit ? KLEUR.mutedTekst : (magVerw ? KLEUR.rood : KLEUR.subtekst), cursor: uit ? "default" : "pointer", whiteSpace: "nowrap", opacity: uit ? 0.5 : 1 }}>
                    <input type="checkbox" checked={magVerw} disabled={uit} onChange={() => onZetVerwijder(o.key, !magVerw)} />
                    <Trash2 size={12} /> Verwijderen
                  </label>
                  <label title={!magVerw ? "Eerst 'Verwijderen' aanzetten" : "Mag in bulk verwijderen (meerdere tegelijk)"} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: !magVerw ? KLEUR.mutedTekst : (bulkSet.has(o.key) ? KLEUR.rood : KLEUR.subtekst), cursor: !magVerw ? "default" : "pointer", whiteSpace: "nowrap", opacity: !magVerw ? 0.5 : 1 }}>
                    <input type="checkbox" checked={bulkSet.has(o.key)} disabled={!magVerw} onChange={() => onZetBulk(o.key, !bulkSet.has(o.key))} />
                    <Layers size={12} /> Bulk
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RollenBeheer() {
  const [rollen, setRollen] = useState(null);
  const [toewijzingen, setToewijzingen] = useState({});
  const [medewerkerTabs, setMedewerkerTabs] = useState([]);
  const [medewerkerSubTabs, setMedewerkerSubTabs] = useState([]);
  const [beheerTabs, setBeheerTabs] = useState([]);
  const [functies, setFuncties] = useState([]);
  const [medewerkers, setMedewerkers] = useState([]);
  const [rechten, setRechten] = useState(null); // volledige wijzigrechten (niveaus + legacy-lijsten) — niet-destructief bewaard
  const [nieuweRol, setNieuweRol] = useState("");
  const [vuil, setVuil] = useState(false);
  const [status, setStatus] = useState("rust"); // rust | bezig | opgeslagen | fout
  const [fout, setFout] = useState("");
  const [zoek, setZoek] = useState("");

  useEffect(() => {
    fetch("/api/beheer-rollen")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setRollen(d.rollen || []); setToewijzingen(d.toewijzingen || {}); setMedewerkerTabs(d.medewerkerTabs || []); setMedewerkerSubTabs(d.medewerkerSubTabs || []); setBeheerTabs(d.beheerTabs || []); setFuncties(d.functies || []); })
      .catch(() => { setRollen([]); setFout("Kon de rollen niet laden."); });
    fetch("/api/beheer-medewerkers").then((r) => (r.ok ? r.json() : {})).then((d) => setMedewerkers(d.medewerkers || [])).catch(() => {});
    // Niveau (medewerker/manager/beheerder) + de bestaande losse rechten. We bewaren ze volledig en
    // schrijven ze bij het opslaan ongewijzigd terug (op het niveau na), zodat bestaande per-persoon-
    // rechten niet verloren gaan — de functies beheer je voortaan via de rol.
    fetch("/api/beheer-wijzigrechten").then((r) => (r.ok ? r.json() : {})).then((d) => setRechten(d || {})).catch(() => setRechten({}));
  }, []);

  const merk = () => { setVuil(true); setStatus("rust"); };
  const opslaan = async () => {
    setStatus("bezig"); setFout("");
    try {
      const r = await fetch("/api/beheer-rollen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rollen, toewijzingen }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setRollen(d.rollen || rollen); setToewijzingen(d.toewijzingen || toewijzingen);
      // Niveau bewaren via wijzigrechten — de bestaande lijsten sturen we ongewijzigd mee terug, zodat
      // er niets verloren gaat (volledige overschrijving op de server).
      if (rechten) {
        const payload = {
          niveaus: rechten.niveaus || {},
          bulk: rechten.bulk || [], alsKlant: rechten.alsKlant || [], offertes: rechten.offertes || [],
          contracten: rechten.contracten || [], planning: rechten.planning || [],
          verwijderIb: rechten.verwijderIb || [], verwijderVpb: rechten.verwijderVpb || [],
          verwijderContactpersonen: rechten.verwijderContactpersonen || [], verwijderDividendbelasting: rechten.verwijderDividendbelasting || [],
        };
        const rw = await fetch("/api/beheer-wijzigrechten", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!rw.ok) throw new Error((await rw.json().catch(() => ({}))).error || `Niveau opslaan mislukt (HTTP ${rw.status})`);
        const dw = await rw.json().catch(() => null);
        if (dw) setRechten(dw);
      }
      setVuil(false); setStatus("opgeslagen"); setTimeout(() => setStatus((s) => (s === "opgeslagen" ? "rust" : s)), 2500);
    } catch (e) { setFout(e.message || "Opslaan mislukt."); setStatus("fout"); }
  };

  // "Kijken als rol" (fase 4): start server-side de impersonatie en ga naar het medewerkersportaal,
  // waar de banner bovenaan verschijnt. Alleen voor opgeslagen rollen en zonder open wijzigingen, zodat
  // de nagebootste rol overeenkomt met wat er is opgeslagen (en er geen werk verloren gaat bij navigeren).
  const bekijkAlsRol = async (sleutel) => {
    if (!sleutel || vuil) return;
    setFout("");
    try {
      const r = await fetch("/api/impersonatie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "start", rolSleutel: sleutel }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      window.location.assign("/medewerker");
    } catch (e) { setFout(e.message || "Kon 'kijken als rol' niet starten."); setStatus("fout"); }
  };

  const voegRolToe = () => { const naam = nieuweRol.trim(); if (!naam) return; setRollen((h) => [...(h || []), { naam, medewerkerTabs: [], bewerkTabs: [], verwijderTabs: [], subTabs: [], bewerkSubTabs: [], verwijderSubTabs: [], bulkVerwijderSubTabs: [], beheerTabs: [], bewerkBeheerTabs: [], functies: {} }]); setNieuweRol(""); merk(); };
  // Subpagina-tri-state: uit (verborgen) → ook geen verwijder/bulk; lezen; bewerken. Zet subTabs/bewerkSubTabs.
  const zetSubTabRecht = (i, key, staat) => {
    setRollen((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const zicht = new Set(r.subTabs || []);
      const bew = new Set(r.bewerkSubTabs || []);
      const verw = new Set(r.verwijderSubTabs || []);
      const bulk = new Set(r.bulkVerwijderSubTabs || []);
      if (staat === "uit") { zicht.delete(key); bew.delete(key); verw.delete(key); bulk.delete(key); }
      else if (staat === "lezen") { zicht.add(key); bew.delete(key); }
      else { zicht.add(key); bew.add(key); }
      return { ...r, subTabs: [...zicht], bewerkSubTabs: [...bew], verwijderSubTabs: [...verw], bulkVerwijderSubTabs: [...bulk] };
    }));
    merk();
  };
  // Losse "verwijderen"-schakelaar per subpagina; uitzetten haalt ook bulk weg.
  const zetSubVerwijderRecht = (i, key, aan) => {
    setRollen((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const verw = new Set(r.verwijderSubTabs || []);
      const bulk = new Set(r.bulkVerwijderSubTabs || []);
      if (aan) verw.add(key); else { verw.delete(key); bulk.delete(key); }
      return { ...r, verwijderSubTabs: [...verw], bulkVerwijderSubTabs: [...bulk] };
    }));
    merk();
  };
  // Losse "bulk verwijderen"-schakelaar per subpagina (vereist verwijderen).
  const zetSubBulkRecht = (i, key, aan) => {
    setRollen((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const bulk = new Set(r.bulkVerwijderSubTabs || []);
      aan ? bulk.add(key) : bulk.delete(key);
      return { ...r, bulkVerwijderSubTabs: [...bulk] };
    }));
    merk();
  };
  // Per rubriek (medewerker- of beheer-tab) de staat zetten: uit (verborgen) / lezen (alleen-lezen) / bewerken.
  const zetTabRecht = (i, portaal, key, staat) => {
    const zichtVeld = portaal === "beheer" ? "beheerTabs" : "medewerkerTabs";
    const bewVeld = portaal === "beheer" ? "bewerkBeheerTabs" : "bewerkTabs";
    setRollen((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const zicht = new Set(r[zichtVeld] || []);
      const bew = new Set(r[bewVeld] || []);
      const verw = new Set(r.verwijderTabs || []);
      if (staat === "uit") { zicht.delete(key); bew.delete(key); verw.delete(key); } // verborgen → ook geen verwijderrecht
      else if (staat === "lezen") { zicht.add(key); bew.delete(key); }
      else { zicht.add(key); bew.add(key); }
      // verwijderTabs alleen voor het medewerkersportaal; bij beheer laten we het veld ongemoeid.
      return { ...r, [zichtVeld]: [...zicht], [bewVeld]: [...bew], ...(portaal === "beheer" ? {} : { verwijderTabs: [...verw] }) };
    }));
    merk();
  };
  // Losse "mag verwijderen"-schakelaar per medewerker-rubriek (naast uit/lezen/bewerken).
  const zetVerwijderRecht = (i, key, aan) => {
    setRollen((h) => h.map((r, idx) => {
      if (idx !== i) return r;
      const verw = new Set(r.verwijderTabs || []);
      aan ? verw.add(key) : verw.delete(key);
      return { ...r, verwijderTabs: [...verw] };
    }));
    merk();
  };
  const verwijderRol = (i) => { setRollen((h) => h.filter((_, idx) => idx !== i)); merk(); };
  const wijzigRolNaam = (i, naam) => { setRollen((h) => h.map((r, idx) => (idx === i ? { ...r, naam } : r))); merk(); };
  const toggleTab = (i, portaal, key) => { setRollen((h) => h.map((r, idx) => { if (idx !== i) return r; const veld = portaal === "beheer" ? "beheerTabs" : "medewerkerTabs"; const set = new Set(r[veld] || []); set.has(key) ? set.delete(key) : set.add(key); return { ...r, [veld]: [...set] }; })); merk(); };
  const toggleFunctie = (i, key) => { setRollen((h) => h.map((r, idx) => { if (idx !== i) return r; const f = { ...(r.functies || {}) }; f[key] ? delete f[key] : (f[key] = true); return { ...r, functies: f }; })); merk(); };
  const zetToewijzing = (email, sleutel) => { const laag = email.toLowerCase(); setToewijzingen((h) => { const n = { ...h }; if (sleutel) n[laag] = sleutel; else delete n[laag]; return n; }); merk(); };
  // Niveau (portaaltoegang): medewerker = standaard (niet opgeslagen), manager = mag klantgegevens wijzigen,
  // beheerder = toegang tot het beheerdersportaal. Dit is de HARDE grens en blijft per medewerker.
  const niveauVan = (email) => (rechten && rechten.niveaus && rechten.niveaus[email.toLowerCase()]) || "medewerker";
  const zetNiveau = (email, niveau) => {
    const laag = email.toLowerCase();
    setRechten((h) => { const n = { ...(h || {}) }; const niv = { ...(n.niveaus || {}) }; if (!niveau || niveau === "medewerker") delete niv[laag]; else niv[laag] = niveau; n.niveaus = niv; return n; });
    merk();
  };

  const rolNaam = (sleutel) => (rollen || []).find((r) => r.sleutel === sleutel)?.naam || "";
  const gefilterdeMedewerkers = medewerkers.filter((m) => { const q = zoek.trim().toLowerCase(); return !q || `${m.naam} ${m.email} ${m.functie || ""}`.toLowerCase().includes(q); });

  if (rollen === null) return <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Rollen laden…</div>;

  const sectiekop = (Icon, t) => <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", margin: "10px 0 6px" }}><Icon size={13} /> {t}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: KLEUR.subtekst, background: KLEUR.lichtblauw, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "10px 12px" }}>
        <ShieldCheck size={15} color={KLEUR.blauw} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>Maak rollen aan en bepaal per rol welke tabs zichtbaar zijn (medewerkers- én beheerdersportaal) en welke functies de rol mag. Per medewerker-rubriek kies je <strong>uit / lezen / bewerken</strong> en zet je apart of de rol daarin mag <strong>verwijderen</strong>. Wijs onderaan elke medewerker één <strong>rol</strong> toe én een <strong>niveau</strong> (portaaltoegang): medewerker, manager of beheerder. Deze verfijning kan bestaande rechten alleen inperken, niet uitbreiden; het niveau blijft de harde toegangsgrens en eerder per persoon toegekende rechten blijven geldig.</div>
      </div>

      {/* Rollen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rollen.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Nog geen rollen. Voeg er hieronder één toe.</div>}
        {rollen.map((rol, i) => (
          <div key={rol.sleutel || i} style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <input value={rol.naam} onChange={(e) => wijzigRolNaam(i, e.target.value)} placeholder="Naam van de rol" style={{ ...invoerStijl, flex: "0 1 320px", fontWeight: 700 }} />
              <span style={{ flex: 1 }} />
              <button
                onClick={() => bekijkAlsRol(rol.sleutel)}
                disabled={!rol.sleutel || vuil}
                title={!rol.sleutel ? "Sla eerst op om deze rol te kunnen bekijken" : vuil ? "Sla eerst je wijzigingen op" : "Bekijk het portaal als deze rol"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: (!rol.sleutel || vuil) ? "#F3F4F2" : "#fff", color: (!rol.sleutel || vuil) ? KLEUR.mutedTekst : KLEUR.blauw, fontSize: 12, fontWeight: 600, cursor: (!rol.sleutel || vuil) ? "default" : "pointer" }}
              ><Eye size={14} /> Bekijk als rol</button>
              <button onClick={() => verwijderRol(i)} title="Rol verwijderen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer" }}><Trash2 size={14} /></button>
            </div>
            {sectiekop(Users, "Medewerkersportaal — rubrieken (uit / lezen / bewerken · verwijderen)")}
            <TabRechten opties={medewerkerTabs} zichtbaar={rol.medewerkerTabs} bewerkbaar={rol.bewerkTabs} verwijderbaar={rol.verwijderTabs} onZet={(k, st) => zetTabRecht(i, "medewerker", k, st)} onZetVerwijder={(k, aan) => zetVerwijderRecht(i, k, aan)} />
            {medewerkerSubTabs.length > 0 && (
              <>
                {sectiekop(Layers, "Medewerkersportaal — subpagina's (uit / lezen / bewerken · verwijderen · bulk)")}
                <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 6 }}>Laat een rubriek leeg om de subpagina's de rechten van de hoofd-rubriek te laten volgen. Zet je hier iets, dan geldt dat voor die subpagina's.</div>
                <SubPaginaRechten opties={medewerkerSubTabs} parents={medewerkerTabs} zichtbaar={rol.subTabs} bewerkbaar={rol.bewerkSubTabs} verwijderbaar={rol.verwijderSubTabs} bulk={rol.bulkVerwijderSubTabs} onZet={(k, st) => zetSubTabRecht(i, k, st)} onZetVerwijder={(k, aan) => zetSubVerwijderRecht(i, k, aan)} onZetBulk={(k, aan) => zetSubBulkRecht(i, k, aan)} />
              </>
            )}
            {sectiekop(LayoutGrid, "Beheerdersportaal — rubrieken (uit / lezen / bewerken)")}
            <TabRechten opties={beheerTabs} zichtbaar={rol.beheerTabs} bewerkbaar={rol.bewerkBeheerTabs} onZet={(k, st) => zetTabRecht(i, "beheer", k, st)} />
            {sectiekop(ShieldCheck, "Functies")}
            <Vinkjes opties={functies} geselecteerd={functies.filter((f) => rol.functies && rol.functies[f.key]).map((f) => f.key)} onToggle={(k) => toggleFunctie(i, k)} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={nieuweRol} onChange={(e) => setNieuweRol(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegRolToe(); } }} placeholder="Nieuwe rol, bijv. Assistent, Manager, Loonadministratie" style={{ ...invoerStijl, flex: "0 1 340px" }} />
          <button onClick={voegRolToe} disabled={!nieuweRol.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: nieuweRol.trim() ? KLEUR.blauw : "#9DB4A5", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nieuweRol.trim() ? "pointer" : "default" }}><Plus size={14} /> Rol toevoegen</button>
        </div>
      </div>

      {/* Toewijzing per medewerker */}
      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 8 }}><Users size={16} color={KLEUR.blauw} /> Rol &amp; niveau per medewerker</div>
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een medewerker…" style={{ ...invoerStijl, width: "100%", maxWidth: 360, marginBottom: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) 200px 170px", gap: 10, padding: "0 8px 6px", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em" }}>
          <span>Medewerker</span><span>Rol</span><span title="medewerker = alleen lezen · manager = mag klantgegevens wijzigen · beheerder = toegang beheerdersportaal">Niveau (toegang)</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
          {gefilterdeMedewerkers.map((m) => (
            <div key={m.email} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) 200px 170px", gap: 10, alignItems: "center", padding: "6px 8px", borderBottom: `1px solid ${KLEUR.rand}55` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.naam}</div>
                <div style={{ fontSize: 11, color: KLEUR.mutedTekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}{m.functie ? ` · ${m.functie}` : ""}</div>
              </div>
              <select value={toewijzingen[m.email.toLowerCase()] || ""} onChange={(e) => zetToewijzing(m.email, e.target.value)} style={invoerStijl}>
                <option value="">— geen rol —</option>
                {rollen.filter((r) => r.sleutel).map((r) => <option key={r.sleutel} value={r.sleutel}>{r.naam}</option>)}
              </select>
              <select value={niveauVan(m.email)} onChange={(e) => zetNiveau(m.email, e.target.value)} disabled={rechten === null} title="medewerker = alleen lezen · manager = mag klantgegevens wijzigen · beheerder = toegang tot het beheerdersportaal" style={invoerStijl}>
                <option value="medewerker">Medewerker</option>
                <option value="manager">Manager</option>
                <option value="beheerder">Beheerder</option>
              </select>
            </div>
          ))}
          {gefilterdeMedewerkers.length === 0 && <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "6px 2px" }}>{medewerkers.length === 0 ? "Medewerkers laden…" : "Geen medewerker gevonden."}</div>}
        </div>
        <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginTop: 8 }}>Nieuwe rollen verschijnen pas in deze lijst nadat je hebt opgeslagen. De rol bepaalt de functies en zichtbare tabs; het niveau bepaalt de portaaltoegang.</div>
      </div>

      {/* Opslaan */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={opslaan} disabled={status === "bezig"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: status === "bezig" ? "#9DB4A5" : KLEUR.groen, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: status === "bezig" ? "default" : "pointer" }}>
          <Save size={14} /> {status === "bezig" ? "Opslaan…" : "Opslaan"}
        </button>
        {vuil && status !== "opgeslagen" && <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Niet-opgeslagen wijzigingen.</span>}
        {status === "opgeslagen" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.groen }}><CheckCircle2 size={14} /> Opgeslagen</span>}
        {(status === "fout" || fout) && <span style={{ fontSize: 12.5, color: KLEUR.rood }}>{fout || "Opslaan mislukt."}</span>}
      </div>
    </div>
  );
}
