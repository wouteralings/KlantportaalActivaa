import React, { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, LogOut, ShieldAlert, Upload, CheckCircle2, Trash2, Send, Users, LayoutGrid, ExternalLink } from "lucide-react";

const KLEUR = {
  blauw: "#1C5D8C",
  tekst: "#1C2321",
  subtekst: "#5B6259",
  mutedTekst: "#8A9089",
  rand: "#E2E4DF",
  lichtblauw: "#EAF2F8",
  rood: "#B23B3B",
};

export default function BeheerPortaal() {
  const [status, setStatus] = useState("laden"); // laden | nietIngelogd | geenRol | klaar
  const [gebruiker, setGebruiker] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | bezig | gelukt | fout

  const [categorieen, setCategorieen] = useState(null); // null = laden, [] = geen/fout
  const [mededelingen, setMededelingen] = useState(null);
  const [nieuweTitel, setNieuweTitel] = useState("");
  const [nieuweTekst, setNieuweTekst] = useState("");
  const [gekozenCategorieen, setGekozenCategorieen] = useState([]);
  const [verzendStatus, setVerzendStatus] = useState("idle"); // idle | bezig | fout

  const [snellinks, setSnellinks] = useState(null);
  const [nieuweLinkTitel, setNieuweLinkTitel] = useState("");
  const [nieuweLinkUrl, setNieuweLinkUrl] = useState("");
  const [gekozenLinkCategorieen, setGekozenLinkCategorieen] = useState([]);
  const [linkVerzendStatus, setLinkVerzendStatus] = useState("idle"); // idle | bezig | fout

  const [wijzigingFormNawUrl, setWijzigingFormNawUrl] = useState("");
  const [wijzigingFormContactUrl, setWijzigingFormContactUrl] = useState("");
  const [formOpslaanStatus, setFormOpslaanStatus] = useState("idle"); // idle | bezig | gelukt | fout

  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => {
        const principal = data.clientPrincipal;
        if (!principal) {
          setStatus("nietIngelogd");
          return;
        }
        setGebruiker(principal);
        const rollen = principal.userRoles || [];
        setStatus(rollen.includes("beheerder") ? "klaar" : "geenRol");
      })
      .catch(() => setStatus("nietIngelogd"));
  }, []);

  useEffect(() => {
    if (status !== "klaar") return;
    fetch("/api/instellingen")
      .then((r) => r.json())
      .then((d) => {
        setLogoUrl(d.logoUrl || "");
        setWijzigingFormNawUrl(d.wijzigingFormNawUrl || "");
        setWijzigingFormContactUrl(d.wijzigingFormContactUrl || "");
      })
      .catch(() => {});
    fetch("/api/beheer-klantcategorieen")
      .then((r) => r.json())
      .then((d) => setCategorieen(d.opties || []))
      .catch(() => setCategorieen([]));
    haalMededelingen();
    haalSnellinks();
  }, [status]);

  const haalMededelingen = useCallback(() => {
    fetch("/api/beheer-content?type=mededeling")
      .then((r) => r.json())
      .then(setMededelingen)
      .catch(() => setMededelingen([]));
  }, []);

  const haalSnellinks = useCallback(() => {
    fetch("/api/beheer-content?type=programma")
      .then((r) => r.json())
      .then(setSnellinks)
      .catch(() => setSnellinks([]));
  }, []);

  const uploadLogo = useCallback((bestand) => {
    if (!bestand) return;
    setUploadStatus("bezig");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/beheer-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setLogoUrl(data.logoUrl);
        setUploadStatus("gelukt");
      } catch {
        setUploadStatus("fout");
      }
    };
    reader.readAsDataURL(bestand);
  }, []);

  const toggleCategorie = useCallback((waarde) => {
    setGekozenCategorieen((huidig) =>
      huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]
    );
  }, []);

  const verstuurMededeling = useCallback(async () => {
    if (!nieuweTitel.trim() || !nieuweTekst.trim()) return;
    setVerzendStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mededeling",
          titel: nieuweTitel.trim(),
          tekst: nieuweTekst.trim(),
          klantcategorieen: gekozenCategorieen,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNieuweTitel("");
      setNieuweTekst("");
      setGekozenCategorieen([]);
      setVerzendStatus("idle");
      haalMededelingen();
    } catch {
      setVerzendStatus("fout");
    }
  }, [nieuweTitel, nieuweTekst, gekozenCategorieen, haalMededelingen]);

  const verwijderMededeling = useCallback(
    async (id) => {
      if (!window.confirm("Deze mededeling verwijderen?")) return;
      try {
        await fetch(`/api/beheer-content?type=mededeling&id=${id}`, { method: "DELETE" });
        haalMededelingen();
      } catch {
        // stil falen is hier acceptabel; de lijst blijft gewoon staan
      }
    },
    [haalMededelingen]
  );

  const labelVoorWaarde = (waarde) => categorieen?.find((c) => c.waarde === waarde)?.label || waarde;

  const slaFormLinksOp = useCallback(async () => {
    setFormOpslaanStatus("bezig");
    try {
      const res = await fetch("/api/beheer-instellingen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wijzigingFormNawUrl, wijzigingFormContactUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFormOpslaanStatus("gelukt");
    } catch {
      setFormOpslaanStatus("fout");
    }
  }, [wijzigingFormNawUrl, wijzigingFormContactUrl]);

  const toggleLinkCategorie = useCallback((waarde) => {
    setGekozenLinkCategorieen((huidig) =>
      huidig.includes(waarde) ? huidig.filter((c) => c !== waarde) : [...huidig, waarde]
    );
  }, []);

  const verstuurSnellink = useCallback(async () => {
    if (!nieuweLinkTitel.trim() || !nieuweLinkUrl.trim()) return;
    setLinkVerzendStatus("bezig");
    try {
      const res = await fetch("/api/beheer-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "programma",
          titel: nieuweLinkTitel.trim(),
          url: nieuweLinkUrl.trim(),
          klantcategorieen: gekozenLinkCategorieen,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNieuweLinkTitel("");
      setNieuweLinkUrl("");
      setGekozenLinkCategorieen([]);
      setLinkVerzendStatus("idle");
      haalSnellinks();
    } catch {
      setLinkVerzendStatus("fout");
    }
  }, [nieuweLinkTitel, nieuweLinkUrl, gekozenLinkCategorieen, haalSnellinks]);

  const verwijderSnellink = useCallback(
    async (id) => {
      if (!window.confirm("Deze snellink verwijderen?")) return;
      try {
        await fetch(`/api/beheer-content?type=programma&id=${id}`, { method: "DELETE" });
        haalSnellinks();
      } catch {
        // stil falen is hier acceptabel; de lijst blijft gewoon staan
      }
    },
    [haalSnellinks]
  );

  if (status === "laden") {
    return (
      <Scherm>
        <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} color={KLEUR.subtekst} />
      </Scherm>
    );
  }

  if (status === "nietIngelogd") {
    return (
      <Scherm>
        <Building2 size={32} color={KLEUR.blauw} />
        <div style={{ fontSize: 20, fontWeight: 600 }}>Beheerdersportaal</div>
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, marginBottom: 8 }}>Log in met je Microsoft-account.</div>
        <a
          href={`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent("/beheer")}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: KLEUR.blauw, color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
        >
          Inloggen met Microsoft
        </a>
      </Scherm>
    );
  }

  if (status === "geenRol") {
    return (
      <Scherm>
        <ShieldAlert size={28} color={KLEUR.rood} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>Geen toegang</div>
        <div style={{ fontSize: 13.5, color: KLEUR.subtekst, textAlign: "center", maxWidth: 320 }}>
          Je bent ingelogd als {gebruiker?.userDetails}, maar hebt niet de rol <strong>beheerder</strong>.
          Vraag iemand met beheerrechten om die rol toe te kennen via Static Web Apps &gt; Role management.
        </div>
      </Scherm>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: KLEUR.tekst }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${KLEUR.rand}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Building2 size={20} color={KLEUR.blauw} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Beheerdersportaal</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: KLEUR.subtekst }}>{gebruiker?.userDetails}</span>
          <a href="/.auth/logout" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: KLEUR.subtekst, textDecoration: "none" }}>
            <LogOut size={13} /> Uitloggen
          </a>
        </div>
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Logo</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
          Verschijnt op het inlogscherm en bovenaan het klantportaal.
        </div>

        {logoUrl && (
          <div style={{ marginBottom: 18, padding: 16, background: KLEUR.lichtblauw, borderRadius: 8, display: "flex", justifyContent: "center" }}>
            <img src={logoUrl} alt="Huidig logo" style={{ maxHeight: 70, maxWidth: 280, objectFit: "contain" }} />
          </div>
        )}

        <label
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px",
            border: `1.5px dashed ${KLEUR.rand}`, borderRadius: 8, cursor: "pointer", fontSize: 13.5,
            fontWeight: 600, color: KLEUR.blauw,
          }}
        >
          <Upload size={16} />
          {uploadStatus === "bezig" ? "Bezig met uploaden..." : "Nieuw logo kiezen"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => uploadLogo(e.target.files?.[0])}
          />
        </label>

        {uploadStatus === "gelukt" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Logo bijgewerkt.
          </div>
        )}
        {uploadStatus === "fout" && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: KLEUR.rood }}>Uploaden is niet gelukt, probeer het nog eens.</div>
        )}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Snellinks</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
          Knoppen die op home boven de mededelingen staan. Kies eventueel voor welke klantgroepen
          een link zichtbaar is — niets aanvinken = voor iedereen.
        </div>

        <input
          type="text"
          value={nieuweLinkTitel}
          onChange={(e) => setNieuweLinkTitel(e.target.value)}
          placeholder="Titel (bijv. MijnActivaa)"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
        />
        <input
          type="url"
          value={nieuweLinkUrl}
          onChange={(e) => setNieuweLinkUrl(e.target.value)}
          placeholder="https://..."
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
          <Users size={13} /> Klantgroepen (uit Dataverse)
        </div>

        {categorieen === null ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>Categorieën ophalen...</div>
        ) : categorieen.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>
            Geen categorieën gevonden. Controleer <code>DYNAMICS_KLANTCATEGORIE_VELD</code>.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {categorieen.map((c) => {
              const actief = gekozenLinkCategorieen.includes(c.waarde);
              return (
                <button
                  key={c.waarde}
                  onClick={() => toggleLinkCategorie(c.waarde)}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
                    background: actief ? KLEUR.blauw : "#fff",
                    color: actief ? "#fff" : KLEUR.tekst,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={verstuurSnellink}
          disabled={!nieuweLinkTitel.trim() || !nieuweLinkUrl.trim() || linkVerzendStatus === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw,
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !nieuweLinkTitel.trim() || !nieuweLinkUrl.trim() ? 0.5 : 1,
          }}
        >
          <LayoutGrid size={14} /> {linkVerzendStatus === "bezig" ? "Toevoegen..." : "Snellink toevoegen"}
        </button>
        {linkVerzendStatus === "fout" && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: KLEUR.rood }}>Toevoegen is niet gelukt, probeer het nog eens.</div>
        )}

        {snellinks && snellinks.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${KLEUR.rand}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>
              Actieve snellinks
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {snellinks.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      <LayoutGrid size={13} color={KLEUR.blauw} /> {s.titel}
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: KLEUR.subtekst, marginTop: 2, textDecoration: "none" }}>
                      {s.url} <ExternalLink size={11} />
                    </a>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                      {s.klantcategorieen?.length > 0
                        ? s.klantcategorieen.map(labelVoorWaarde).join(", ")
                        : "Alle klanten"}
                    </div>
                  </div>
                  <button
                    onClick={() => verwijderSnellink(s.id)}
                    title="Verwijderen"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer", flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Mededeling versturen</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 18 }}>
          Kies aan welke klantgroepen deze zichtbaar wordt. Niets aanvinken = zichtbaar voor iedereen.
        </div>

        <input
          type="text"
          value={nieuweTitel}
          onChange={(e) => setNieuweTitel(e.target.value)}
          placeholder="Titel"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }}
        />
        <textarea
          value={nieuweTekst}
          onChange={(e) => setNieuweTekst(e.target.value)}
          placeholder="Tekst van de mededeling"
          rows={4}
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
          <Users size={13} /> Klantgroepen (uit Dataverse)
        </div>

        {categorieen === null ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>Categorieën ophalen...</div>
        ) : categorieen.length === 0 ? (
          <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst, marginBottom: 14 }}>
            Geen categorieën gevonden. Controleer <code>DYNAMICS_KLANTCATEGORIE_VELD</code>.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {categorieen.map((c) => {
              const actief = gekozenCategorieen.includes(c.waarde);
              return (
                <button
                  key={c.waarde}
                  onClick={() => toggleCategorie(c.waarde)}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${actief ? KLEUR.blauw : KLEUR.rand}`,
                    background: actief ? KLEUR.blauw : "#fff",
                    color: actief ? "#fff" : KLEUR.tekst,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={verstuurMededeling}
          disabled={!nieuweTitel.trim() || !nieuweTekst.trim() || verzendStatus === "bezig"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw,
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !nieuweTitel.trim() || !nieuweTekst.trim() ? 0.5 : 1,
          }}
        >
          <Send size={14} /> {verzendStatus === "bezig" ? "Versturen..." : "Versturen"}
        </button>
        {verzendStatus === "fout" && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: KLEUR.rood }}>Versturen is niet gelukt, probeer het nog eens.</div>
        )}

        {mededelingen && mededelingen.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${KLEUR.rand}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>
              Actieve mededelingen
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mededelingen.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${KLEUR.rand}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{m.titel}</div>
                    <div style={{ fontSize: 12, color: KLEUR.subtekst, marginTop: 2 }}>{m.tekst}</div>
                    <div style={{ fontSize: 11, color: KLEUR.mutedTekst, marginTop: 6 }}>
                      {m.klantcategorieen?.length > 0
                        ? m.klantcategorieen.map(labelVoorWaarde).join(", ")
                        : "Alle klanten"}
                    </div>
                  </div>
                  <button
                    onClick={() => verwijderMededeling(m.id)}
                    title="Verwijderen"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, background: "#fff", color: KLEUR.rood, cursor: "pointer", flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Wijzigingsformulieren</div>
        <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 4 }}>
          Links naar (bijv. Microsoft Forms-)formulieren waarmee klanten wijzigingen in hun
          gegevens kunnen doorgeven — verschijnen onder "Mijn gegevens", bij respectievelijk
          de bedrijfsgegevens en de contactgegevens.
        </div>
        <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginBottom: 18, lineHeight: 1.6 }}>
          Gebruik <code>{"{veldnaam}"}</code> in de link om automatisch de bekende gegevens van
          de klant in te vullen. Beschikbaar bij bedrijfsgegevens: <code>{"{klantnummer}"}</code>,{" "}
          <code>{"{bedrijfsnaam}"}</code>, <code>{"{straat}"}</code>, <code>{"{postcode}"}</code>,{" "}
          <code>{"{plaats}"}</code>. Bij contactgegevens: <code>{"{klantnummer}"}</code>,{" "}
          <code>{"{contactpersoon}"}</code>, <code>{"{email}"}</code>, <code>{"{telefoon}"}</code>.
          Bijvoorbeeld handig bij een vooraf-ingevulde Microsoft Forms-link.
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Link bij bedrijfsgegevens (NAW)</div>
        <input
          type="text"
          value={wijzigingFormNawUrl}
          onChange={(e) => setWijzigingFormNawUrl(e.target.value)}
          placeholder="https://forms.office.com/...&r1={bedrijfsnaam}&r2={straat}"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Link bij contactgegevens</div>
        <input
          type="text"
          value={wijzigingFormContactUrl}
          onChange={(e) => setWijzigingFormContactUrl(e.target.value)}
          placeholder="https://forms.office.com/...&r1={email}&r2={telefoon}"
          style={{ width: "100%", border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />

        <button
          onClick={slaFormLinksOp}
          disabled={formOpslaanStatus === "bezig"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: KLEUR.blauw, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {formOpslaanStatus === "bezig" ? "Opslaan..." : "Opslaan"}
        </button>
        {formOpslaanStatus === "gelukt" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12.5, color: KLEUR.blauw }}>
            <CheckCircle2 size={14} /> Opgeslagen.
          </span>
        )}
        {formOpslaanStatus === "fout" && (
          <span style={{ marginLeft: 12, fontSize: 12.5, color: KLEUR.rood }}>Opslaan mislukt, probeer het nog eens.</span>
        )}
      </div>

      <div style={{ fontSize: 12, color: KLEUR.mutedTekst, marginTop: 20, lineHeight: 1.6 }}>
        FAQ, de Google-reviewlink en de Teams-chatlink beheer je voorlopig nog via de API
        (<code>/api/beheer-content</code> en <code>/api/beheer-instellingen</code>).
      </div>
    </div>
  );
}

function Scherm({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {children}
    </div>
  );
}
