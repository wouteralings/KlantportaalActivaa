import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Beheer → Gastaccounts. Totaaloverzicht van alle contactpersonen (uit Dynamics) met per contact:
 *  - of hij een B2B-GASTACCOUNT in onze Entra ID heeft (kan hij inloggen?), en
 *  - zijn portaal-DOCUMENTRECHTEN (wat mag hij zien?) — bewust twee losse statussen.
 * Plus de acties uitnodigen / (de)blokkeren / verwijderen (alleen beheerder; ook server-side).
 *
 * Data: joint /api/beheer-contactpersonen (contacten) met /api/beheer-gastaccounts (gasten-index op
 * genormaliseerd e-mailadres + documentrechten per contactId). Acties → POST /api/beheer-gastaccount.
 */

const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
  groen: "#2E7D5B",
  oranje: "#B7791F",
};

const RECHT_LABELS = {
  inzien: "Inzien correspondentie",
  aanleveren: "Aanleveren",
  akkorderen: "Akkorderen",
  inzienDirectie: "Directie",
  inzienAdministratie: "Administratie (inzien)",
  bewerkenAdministratie: "Administratie (upload)",
};
const RECHT_KEYS = Object.keys(RECHT_LABELS);

// Zelfde normalisatie als de backend (kleine letters + #EXT#-omzetting), zodat het joinen klopt.
function normaliseerEmail(waarde) {
  let s = String(waarde || "").trim();
  if (!s) return "";
  if (s.includes("#EXT#")) {
    const voor = s.split("#EXT#")[0];
    const u = voor.lastIndexOf("_");
    if (u > -1) s = voor.slice(0, u) + "@" + voor.slice(u + 1);
  }
  return s.toLowerCase();
}

function bepaalStatus(row) {
  if (!row.email) return "geen-email";
  if (!row.gast) return "geen";
  if (!row.gast.accountEnabled) return "geblokkeerd";
  if (row.gast.externalUserState === "PendingAcceptance") return "pending";
  return "actief";
}

const STATUS_META = {
  "actief": { label: "Actief gastaccount", kleur: KLEUR.groen },
  "pending": { label: "Uitgenodigd — nog niet geaccepteerd", kleur: KLEUR.oranje },
  "geblokkeerd": { label: "Geblokkeerd", kleur: KLEUR.rood },
  "geen": { label: "Geen gastaccount", kleur: KLEUR.mutedTekst },
  "geen-email": { label: "Geen e-mailadres", kleur: KLEUR.mutedTekst },
};

const STATUS_FILTERS = [
  ["alle", "Alle"],
  ["actief", "Actief"],
  ["pending", "Uitgenodigd"],
  ["geblokkeerd", "Geblokkeerd"],
  ["geen", "Geen account"],
  ["geen-email", "Zonder e-mail"],
];

export default function GastaccountsOverzicht() {
  const [contacten, setContacten] = useState(null);
  const [gasten, setGasten] = useState({});
  const [docRechten, setDocRechten] = useState({});
  const [fout, setFout] = useState("");
  const [laadFout, setLaadFout] = useState("");
  const [laden, setLaden] = useState(true);

  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");

  const [bezigId, setBezigId] = useState("");
  const [melding, setMelding] = useState({}); // contactId -> { type: "ok"|"fout", tekst }
  const [bevestigVerwijder, setBevestigVerwijder] = useState("");

  const laadGasten = useCallback(async (vernieuw) => {
    const url = vernieuw ? "/api/beheer-gastaccounts?vernieuw=1" : "/api/beheer-gastaccounts";
    const d = await fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Gastaccounts ophalen mislukt."))));
    setGasten(d.gasten || {});
    setDocRechten(d.docRechten || {});
    setFout(d.fout || "");
    return d;
  }, []);

  const laadAlles = useCallback(async () => {
    setLaden(true);
    setLaadFout("");
    try {
      const [contactData] = await Promise.all([
        fetch("/api/beheer-contactpersonen").then((r) => (r.ok ? r.json() : Promise.reject(new Error("Contactpersonen ophalen mislukt.")))),
        laadGasten(false),
      ]);
      setContacten(contactData.contactpersonen || []);
    } catch (e) {
      setLaadFout(String((e && e.message) || e));
      setContacten([]);
    } finally {
      setLaden(false);
    }
  }, [laadGasten]);

  useEffect(() => { laadAlles(); }, [laadAlles]);

  // Contacten joinen met gasten + documentrechten.
  const rijen = useMemo(() => {
    if (!contacten) return [];
    return contacten.map((c) => {
      const normEmail = normaliseerEmail(c.email);
      const gast = normEmail ? gasten[normEmail] || null : null;
      const rechtenObj = docRechten[c.contactId] || null;
      const rechten = RECHT_KEYS.filter((k) => rechtenObj && rechtenObj[k] === true);
      const row = { ...c, gast, rechten };
      row.status = bepaalStatus(row);
      return row;
    });
  }, [contacten, gasten, docRechten]);

  const tellers = useMemo(() => {
    const t = { totaal: rijen.length, actief: 0, pending: 0, geblokkeerd: 0, geen: 0, "geen-email": 0 };
    for (const r of rijen) t[r.status] = (t[r.status] || 0) + 1;
    return t;
  }, [rijen]);

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return rijen.filter((r) => {
      if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(r.naam || "").toLowerCase().includes(q) ||
        String(r.email || "").toLowerCase().includes(q) ||
        String(r.klantnamen || "").toLowerCase().includes(q)
      );
    });
  }, [rijen, zoek, statusFilter]);

  const doeActie = useCallback(async (row, actie) => {
    setBezigId(row.contactId);
    setMelding((m) => ({ ...m, [row.contactId]: null }));
    setBevestigVerwijder("");
    try {
      const body = { actie };
      if (actie === "uitnodigen") { body.email = row.email; body.naam = row.naam; }
      else { body.userId = row.gast && row.gast.id; }

      const res = await fetch("/api/beheer-gastaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Actie mislukt.");

      let tekst = "Gelukt.";
      if (actie === "uitnodigen") tekst = data.gemaild ? "Uitgenodigd en gemaild." : (data.waarschuwing || "Uitgenodigd (mail niet verstuurd).");
      else if (actie === "blokkeren") tekst = "Geblokkeerd.";
      else if (actie === "deblokkeren") tekst = "Gedeblokkeerd.";
      else if (actie === "verwijderen") tekst = "Gastaccount verwijderd.";

      await laadGasten(true); // verse gasten-index ophalen zodat de status meteen klopt
      setMelding((m) => ({ ...m, [row.contactId]: { type: data.gemaild === false ? "fout" : "ok", tekst } }));
    } catch (e) {
      setMelding((m) => ({ ...m, [row.contactId]: { type: "fout", tekst: String((e && e.message) || e) } }));
    } finally {
      setBezigId("");
    }
  }, [laadGasten]);

  const knop = (label, onClick, variant) => {
    const stijl = {
      basis: { padding: "5px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" },
      blauw: { padding: "5px 10px", border: "none", borderRadius: 6, background: KLEUR.blauw, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
      rood: { padding: "5px 10px", border: `1px solid ${KLEUR.rood}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, fontSize: 12, fontWeight: 600, cursor: "pointer" },
    };
    return <button onClick={onClick} style={stijl[variant] || stijl.basis}>{label}</button>;
  };

  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", padding: "8px 10px", borderBottom: `1px solid ${KLEUR.rand}`, whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, color: KLEUR.tekst, padding: "9px 10px", borderBottom: `1px solid ${KLEUR.rand}`, verticalAlign: "top" };

  return (
    <div>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, margin: "4px 0 16px", lineHeight: 1.6, maxWidth: 760 }}>
        Per contactpersoon zie je twee losse dingen: of hij een <strong>Entra-gastaccount</strong> heeft
        (kan inloggen op het portaal) en welke <strong>documentrechten</strong> hij heeft (wat hij ziet).
        Een gastaccount en documentrechten staan los van elkaar. Uitnodigen, blokkeren en verwijderen
        kan alleen als beheerder.
      </div>

      {laadFout && (
        <div style={{ marginBottom: 12, fontSize: 12.5, color: KLEUR.rood }}>{laadFout}</div>
      )}
      {fout && (
        <div style={{ marginBottom: 12, padding: "10px 12px", background: "#FBECEC", border: `1px solid ${KLEUR.rood}`, borderRadius: 8, fontSize: 12.5, color: KLEUR.rood, lineHeight: 1.5 }}>
          {fout}
        </div>
      )}

      {/* Totaaloverzicht */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          ["Contactpersonen", tellers.totaal, KLEUR.tekst],
          ["Actief", tellers.actief, KLEUR.groen],
          ["Uitgenodigd", tellers.pending, KLEUR.oranje],
          ["Geblokkeerd", tellers.geblokkeerd, KLEUR.rood],
          ["Geen account", tellers.geen, KLEUR.subtekst],
          ["Zonder e-mail", tellers["geen-email"], KLEUR.mutedTekst],
        ].map(([label, waarde, kleur]) => (
          <div key={label} style={{ minWidth: 120, border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: kleur }}>{waarde}</div>
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek op naam, e-mail of cliënt…"
          style={{ flex: "1 1 260px", minWidth: 220, padding: "8px 10px", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, fontSize: 12.5 }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${statusFilter === k ? KLEUR.blauw : KLEUR.rand}`,
                background: statusFilter === k ? KLEUR.blauw : "#fff", color: statusFilter === k ? "#fff" : KLEUR.subtekst,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => laadAlles()} style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.subtekst, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Vernieuwen
        </button>
      </div>

      {laden ? (
        <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, padding: "20px 0" }}>Laden…</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${KLEUR.rand}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Naam</th>
                <th style={th}>E-mail</th>
                <th style={th}>Cliënt(en)</th>
                <th style={th}>Gastaccount</th>
                <th style={th}>Documentrechten</th>
                <th style={{ ...th, textAlign: "right" }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.length === 0 && (
                <tr><td style={td} colSpan={6}><span style={{ color: KLEUR.mutedTekst }}>Geen contactpersonen gevonden.</span></td></tr>
              )}
              {gefilterd.map((row) => {
                const meta = STATUS_META[row.status];
                const rijMelding = melding[row.contactId];
                const bezig = bezigId === row.contactId;
                return (
                  <tr key={row.contactId}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{row.naam || "—"}</div>
                      {row.functie && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{row.functie}</div>}
                    </td>
                    <td style={td}>{row.email || <span style={{ color: KLEUR.mutedTekst }}>—</span>}</td>
                    <td style={td}>
                      <span style={{ color: row.klantnamen ? KLEUR.tekst : KLEUR.mutedTekst }}>{row.klantnamen || "—"}</span>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.kleur, display: "inline-block" }} />
                        <span style={{ color: meta.kleur, fontWeight: 600 }}>{meta.label}</span>
                      </span>
                    </td>
                    <td style={td}>
                      {row.rechten.length === 0
                        ? <span style={{ color: KLEUR.mutedTekst }}>Geen</span>
                        : <span title={row.rechten.map((k) => RECHT_LABELS[k]).join(", ")}>{row.rechten.length} recht{row.rechten.length === 1 ? "" : "en"}</span>}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {bezig ? (
                        <span style={{ fontSize: 12, color: KLEUR.mutedTekst }}>Bezig…</span>
                      ) : (
                        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {row.status === "geen-email" && <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Geen e-mailadres in Dynamics</span>}
                          {row.status === "geen" && knop("Uitnodigen", () => doeActie(row, "uitnodigen"), "blauw")}
                          {row.status === "pending" && knop("Opnieuw uitnodigen", () => doeActie(row, "uitnodigen"), "basis")}
                          {row.status === "actief" && knop("Blokkeren", () => doeActie(row, "blokkeren"), "basis")}
                          {row.status === "geblokkeerd" && knop("Deblokkeren", () => doeActie(row, "deblokkeren"), "blauw")}
                          {(row.status === "actief" || row.status === "geblokkeerd" || row.status === "pending") && (
                            bevestigVerwijder === row.contactId ? (
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 11.5, color: KLEUR.rood }}>Zeker?</span>
                                {knop("Ja, verwijderen", () => doeActie(row, "verwijderen"), "rood")}
                                {knop("Nee", () => setBevestigVerwijder(""), "basis")}
                              </span>
                            ) : (
                              knop("Verwijderen", () => setBevestigVerwijder(row.contactId), "rood")
                            )
                          )}
                        </div>
                      )}
                      {rijMelding && (
                        <div style={{ marginTop: 5, fontSize: 11.5, color: rijMelding.type === "fout" ? KLEUR.rood : KLEUR.groen }}>{rijMelding.tekst}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
