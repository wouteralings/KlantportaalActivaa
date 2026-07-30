import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2, Users, User, RefreshCw, Info } from "lucide-react";
import {
  KLEUR, euro, uur, datumNL, maandVanNu, maandLabel, verschuifMaand, SoortBadge,
  knopStijl, veldStijl, th, td,
} from "./urenGedeeld";

/**
 * Maandcontrole voor de manager: alle declarabele boekingen op cliënten waarvan jij de manager bent.
 * Per boeking erken je de uren (goedkeuren), boek je (deels) af met reden, en/of boek je extra op
 * (bedrag dat los gefactureerd moet worden). Beheerders kunnen kantoorbreed schakelen.
 */
export default function UrenControle({ isBeheerder }) {
  const [maand, setMaand] = useState(maandVanNu());
  const [scope, setScope] = useState("manager"); // manager | alle (alleen beheerder)
  const [data, setData] = useState(null); // {boekingen, mijnNaam}
  const [fout, setFout] = useState("");

  const laad = useCallback(() => {
    setData(null); setFout("");
    const s = scope === "alle" && isBeheerder ? "&scope=alle" : "";
    fetch(`/api/mw-uren-controle?maand=${maand}${s}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => { setData({ boekingen: [] }); setFout("Kon de controle niet laden."); });
  }, [maand, scope, isBeheerder]);
  useEffect(() => { laad(); }, [laad]);

  const perKlant = useMemo(() => {
    const map = new Map();
    (data?.boekingen || []).forEach((b) => {
      const k = b.accountId || b.klantnaam || "?";
      if (!map.has(k)) map.set(k, { klantnaam: b.klantnaam || b.accountId, boekingen: [] });
      map.get(k).boekingen.push(b);
    });
    return [...map.values()];
  }, [data]);

  const updateRij = (bijgewerkt) => setData((d) => ({ ...d, boekingen: (d.boekingen || []).map((x) => (x.id === bijgewerkt.id ? bijgewerkt : x)) }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMaand(verschuifMaand(maand, -1))} style={pijl}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{maandLabel(maand)}</div>
          <button onClick={() => setMaand(verschuifMaand(maand, 1))} style={pijl}><ChevronRight size={16} /></button>
          <button onClick={laad} style={{ ...knopStijl(false), padding: "6px 10px" }}><RefreshCw size={13} /></button>
        </div>
        {isBeheerder && (
          <div style={{ display: "inline-flex", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setScope("manager")} style={scopeKnop(scope === "manager")}><User size={13} /> Mijn cliënten</button>
            <button onClick={() => setScope("alle")} style={{ ...scopeKnop(scope === "alle"), borderLeft: `1px solid ${KLEUR.rand}` }}><Users size={13} /> Kantoorbreed</button>
          </div>
        )}
      </div>

      {fout && <div style={{ fontSize: 12.5, color: KLEUR.rood, marginBottom: 10 }}>{fout}</div>}
      {data && !fout && scope === "manager" && !data.mijnNaam && (
        <div style={{ fontSize: 12, color: KLEUR.goud, marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}><Info size={14} /> Je naam kon niet automatisch worden bepaald, dus we kunnen niet zien welke cliënten van jou zijn.{isBeheerder ? " Gebruik Kantoorbreed." : ""}</div>
      )}

      {data === null ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Boekingen ophalen…</div>
      ) : perKlant.length === 0 ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen te controleren boekingen in {maandLabel(maand)}{scope === "manager" ? " voor jouw cliënten" : ""}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {perKlant.map((k) => (
            <KlantBlok key={k.klantnaam} klant={k} onUpdate={updateRij} />
          ))}
        </div>
      )}
    </div>
  );
}

function KlantBlok({ klant, onUpdate }) {
  const openUren = klant.boekingen.reduce((s, b) => s + (b.status === "open" ? b.uren : 0), 0);
  return (
    <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#FBFBF9" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{klant.klantnaam}</div>
        <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{klant.boekingen.length} boeking(en){openUren > 0 ? ` · ${uur(openUren)} u open` : ""}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr>
              <th style={th}>Datum</th><th style={th}>Soort</th><th style={th}>Medewerker</th>
              <th style={th}>Geschr.</th><th style={th}>Erken (u)</th><th style={th}>Afboek-reden</th>
              <th style={th}>Extra €</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {klant.boekingen.map((b) => <ControleRij key={b.id} b={b} onUpdate={onUpdate} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ControleRij({ b, onUpdate }) {
  const open = b.status === "open";
  const [erken, setErken] = useState(String(b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren));
  const [afboekReden, setAfboekReden] = useState(b.afboekReden || "");
  const [extra, setExtra] = useState(b.extraBedrag != null ? String(b.extraBedrag) : "");
  const [extraReden, setExtraReden] = useState(b.extraReden || "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const erkenNum = Number(String(erken).replace(",", "."));
  const afboek = Math.max(0, Math.round((b.uren - (isNaN(erkenNum) ? b.uren : erkenNum)) * 100) / 100);

  const opslaan = async () => {
    setFout("");
    if (afboek > 0 && !afboekReden.trim()) { setFout("Geef een reden voor de afboeking."); return; }
    const extraNum = extra === "" ? null : Number(String(extra).replace(",", "."));
    setBezig(true);
    try {
      const res = await fetch("/api/mw-uren-controle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, goedgekeurdeUren: isNaN(erkenNum) ? b.uren : erkenNum, afboekUren: afboek || null, afboekReden: afboek > 0 ? afboekReden.trim() : null, extraBedrag: extraNum, extraReden: extraNum ? extraReden.trim() : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onUpdate(d.boeking);
    } catch (e) { setFout(String(e.message || e)); }
    finally { setBezig(false); }
  };

  if (!open) {
    return (
      <tr style={{ background: b.gefactureerd ? "#F1F8F3" : "#fff" }}>
        <td style={td}>{datumNL(b.datum)}</td>
        <td style={td}><SoortBadge soort={b.soort} /></td>
        <td style={td}>{b.medewerkerNaam}</td>
        <td style={td}>{uur(b.uren)} u</td>
        <td style={td} colSpan={4}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: b.gefactureerd ? KLEUR.groen : KLEUR.blauw }}>
            <CheckCircle2 size={13} /> {b.gefactureerd ? "Gefactureerd" : "Goedgekeurd"} · {uur(b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren)} u erkend
            {b.afboekUren ? ` · ${uur(b.afboekUren)} u afgeboekt` : ""}{b.extraBedrag ? ` · ${euro(b.extraBedrag)} extra` : ""}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={td}>{datumNL(b.datum)}</td>
      <td style={td}><SoortBadge soort={b.soort} /></td>
      <td style={td}>{b.medewerkerNaam}</td>
      <td style={td}>{uur(b.uren)} u{b.tariefBedrag != null ? <div style={{ fontSize: 10.5, color: KLEUR.mutedTekst }}>{euro(b.tariefBedrag)}/u</div> : null}</td>
      <td style={td}><input value={erken} onChange={(e) => setErken(e.target.value)} inputMode="decimal" style={{ ...veldStijl, width: 66 }} /></td>
      <td style={td}>{afboek > 0 ? <input value={afboekReden} onChange={(e) => setAfboekReden(e.target.value)} placeholder={`${uur(afboek)} u afboeken — reden`} style={{ ...veldStijl, width: 170 }} /> : <span style={{ color: KLEUR.mutedTekst, fontSize: 11.5 }}>—</span>}</td>
      <td style={td}>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0,00" inputMode="decimal" style={{ ...veldStijl, width: 74 }} />
        {extra !== "" && Number(String(extra).replace(",", ".")) > 0 && <input value={extraReden} onChange={(e) => setExtraReden(e.target.value)} placeholder="reden extra" style={{ ...veldStijl, width: 130, marginTop: 4 }} />}
        {fout && <div style={{ fontSize: 10.5, color: KLEUR.rood, marginTop: 3 }}>{fout}</div>}
      </td>
      <td style={td}>
        <button onClick={opslaan} disabled={bezig} style={{ ...knopStijl(true), padding: "7px 11px" }}>{bezig ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />} Akkoord</button>
      </td>
    </tr>
  );
}

const pijl = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer", color: KLEUR.subtekst };
const scopeKnop = (actief) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: actief ? KLEUR.blauw : "#fff", color: actief ? "#fff" : KLEUR.subtekst });
