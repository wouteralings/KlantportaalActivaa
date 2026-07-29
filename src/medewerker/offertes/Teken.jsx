import React, { useState, useEffect, useRef } from "react";
import { Check, X, Loader2, ShieldCheck, ShieldAlert, Eraser, Download } from "lucide-react";
import { ACTIVAA_LOGO, currency, datumTijd, offerteStatusInfo, groepeerOpCategorie } from "./OffertetoolApp.jsx";

// Publieke, niet-ingelogde pagina waarmee een klant een offerte kan bekijken en digitaal kan
// ondertekenen (naam + e-mail + een echte, met muis/vinger getekende handtekening) of expliciet
// kan afwijzen. Het offerte-ID in de link functioneert als toegangssleutel — er is bewust geen
// Microsoft-login voor nodig, zodat klanten die niet bij Activaa werken de link gewoon kunnen
// openen.
export default function TekenPagina({ id }) {
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [record, setRecord] = useState(null);

  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [opmerking, setOpmerking] = useState("");
  const [bezig, setBezig] = useState(false);
  const [resultaat, setResultaat] = useState(null); // { akkoord, naam, op, handtekening } na succesvolle actie
  const [inzendFout, setInzendFout] = useState(null);

  // Handtekening-canvas: tekenen met muis of vinger.
  const canvasRef = useRef(null);
  const tekentRef = useRef(false);
  const laatstePuntRef = useRef(null);
  const [handtekeningLeeg, setHandtekeningLeeg] = useState(true);

  const [pdfBezig, setPdfBezig] = useState(false);

  function canvasPositie(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const punt = event.touches ? event.touches[0] : event;
    return {
      x: ((punt.clientX - rect.left) / rect.width) * canvas.width,
      y: ((punt.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function tekenStart(event) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    tekentRef.current = true;
    laatstePuntRef.current = canvasPositie(canvas, event);
  }

  function tekenBeweeg(event) {
    if (!tekentRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const nieuw = canvasPositie(canvas, event);
    ctx.strokeStyle = "#1C2E3D";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(laatstePuntRef.current.x, laatstePuntRef.current.y);
    ctx.lineTo(nieuw.x, nieuw.y);
    ctx.stroke();
    laatstePuntRef.current = nieuw;
    setHandtekeningLeeg(false);
  }

  function tekenStop() {
    tekentRef.current = false;
  }

  function wisHandtekening() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHandtekeningLeeg(true);
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/teken/${encodeURIComponent(id)}`);
        if (!res.ok) {
          setFout(res.status === 404 ? "Dit document kon niet worden gevonden." : "Er ging iets mis bij het laden.");
          return;
        }
        const data = await res.json();
        setRecord(data);
        // Vooraf invullen met de bekende contactpersoon van de klant — alleen ondubbelzinnig
        // te doen als er precies één klant op deze offerte staat.
        const klanten = data?.data?.gekozenKlanten || [];
        if (klanten.length === 1 && klanten[0].contact) {
          setNaam(klanten[0].contact || "");
          setEmail(klanten[0].email || "");
        }
      } catch (e) {
        setFout("Er ging iets mis bij het laden. Controleer je internetverbinding.");
      } finally {
        setLaden(false);
      }
    })();
  }, [id]);

  async function versturen(akkoord) {
    if (!naam.trim() || !email.trim()) {
      setInzendFout("Vul zowel je naam als je e-mailadres in.");
      return;
    }
    if (akkoord && handtekeningLeeg) {
      setInzendFout("Zet eerst je handtekening in het vak hierboven voordat je ondertekent.");
      return;
    }
    setInzendFout(null);
    setBezig(true);
    try {
      const handtekening = akkoord && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null;
      const res = await fetch(`/api/teken/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam: naam.trim(), email: email.trim(), opmerking: opmerking.trim(), akkoord, handtekening }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.ondertekening) {
          setResultaat(data.ondertekening);
          return;
        }
        setInzendFout(data.error || "Versturen is niet gelukt. Probeer het nogmaals.");
        return;
      }
      setResultaat(data.ondertekening);
    } catch (e) {
      setInzendFout("Versturen is niet gelukt. Controleer je internetverbinding en probeer het nogmaals.");
    } finally {
      setBezig(false);
    }
  }

  const scherm = {
    minHeight: "100vh",
    background: "#F5F6F4",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#2B2F2A",
    padding: "32px 16px",
  };
  const kaart = {
    maxWidth: 720,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #E2E4DF",
    overflow: "hidden",
  };
  const invoer = {
    width: "100%",
    border: "1px solid #C8CDC5",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  if (laden) {
    return (
      <div style={{ ...scherm, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={28} className="ot-spin" style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  if (fout) {
    return (
      <div style={scherm}>
        <div style={{ ...kaart, padding: 32, textAlign: "center" }}>
          <ShieldAlert size={32} color="#B14A2E" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15 }}>{fout}</p>
        </div>
      </div>
    );
  }

  // Al eerder ondertekend/afgewezen — of net nu ondertekend.
  const definitieveOndertekening = resultaat || record?.ondertekening;

  const isOpdrachtbevestiging = record?.soort === "opdrachtbevestiging";
  const documentLabel = isOpdrachtbevestiging ? "Opdrachtbevestiging" : "Offerte";
  const klantNamen = record?.klantNamen?.length ? record.klantNamen.join(", ") : "";
  const regelsPerKlant = record?.data?.regelsPerKlant || {};
  const gekozenKlanten = record?.data?.gekozenKlanten || [];
  const algemeneToelichting = record?.data?.algemeneToelichting || "";
  const bijlageToelichtingen = record?.data?.bijlageToelichtingen || {};
  const klantToelichtingen = record?.data?.klantToelichtingen || {};
  const roadmap = record?.data?.roadmap || null;
  const afzender = record?.data?.afzender || null;
  const algemeneVoorwaarden = record?.data?.algemeneVoorwaarden || null;
  const logo = record?.data?.logo || ACTIVAA_LOGO;
  const namens = record?.data?.namens || null;
  const opdrachttypeNaam = record?.opdrachttypeNaam || record?.data?.opdrachttypeNaam || "";
  const paragrafen = record?.data?.paragrafen || { verplicht: [], optioneel: [] };

  const koptekstMetLogo = (titel) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div className="offertetool-serif" style={{ fontSize: 22, fontWeight: 600 }}>{titel}</div>
      {logo && <img src={logo} alt="Logo" style={{ maxWidth: 130, maxHeight: 50, objectFit: "contain", flexShrink: 0, marginLeft: 20 }} />}
    </div>
  );

  async function downloadPdf() {
    setPdfBezig(true);
    try {
      const res = await fetch(`/api/teken/${encodeURIComponent(id)}?formaat=pdf`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${documentLabel} - ${(record?.klantNamen?.[0] || documentLabel.toLowerCase())}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      window.alert("PDF downloaden is helaas niet gelukt. Probeer het nogmaals.");
    } finally {
      setPdfBezig(false);
    }
  }

  return (
    <div style={scherm}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden; }
          #teken-print-gebied, #teken-print-gebied * { visibility: visible; }
          #teken-print-gebied { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div style={kaart}>
        <div style={{ padding: "24px 28px", borderBottom: "1px solid #E2E4DF" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={logo} alt="Logo" style={{ height: 40, width: "auto" }} />
              <div>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em", color: "#8A9089", fontWeight: 700 }}>
                  {documentLabel} ter ondertekening
                </div>
                {klantNamen && <div style={{ fontSize: 15, fontWeight: 700 }}>{klantNamen}</div>}
                {isOpdrachtbevestiging && opdrachttypeNaam && (
                  <div style={{ fontSize: 12, color: "#1C5D8C", fontWeight: 600, marginTop: 1 }}>{opdrachttypeNaam}</div>
                )}
              </div>
            </div>
            <button
              className="no-print"
              onClick={downloadPdf}
              disabled={pdfBezig}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid #C8CDC5",
                background: "#fff",
                color: "#5B6259",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: pdfBezig ? "default" : "pointer",
                opacity: pdfBezig ? 0.6 : 1,
              }}
            >
              <Download size={14} />
              {pdfBezig ? "Bezig…" : "PDF downloaden"}
            </button>
          </div>
        </div>

        <div id="teken-print-gebied" style={{ padding: "24px 28px" }}>
          {gekozenKlanten.map((klant, idx) => {
            const regels = regelsPerKlant[klant.id] || [];
            const subtotaal = regels.reduce((s, r) => s + r.subtotaal, 0);
            const btw = subtotaal * 0.21;
            const totaal = subtotaal + btw;
            // record.data.categorieVolgorde is de bevroren categorieën-lijst op het moment van
            // opslaan (zie groepeerOpCategorie/categorieVolgorde in App.jsx) — deze publieke
            // pagina heeft geen toegang tot de live catalogus-instellingen. Documenten van vóór
            // deze functie hebben geen categorieVolgorde; groepeerOpCategorie valt dan terug op
            // de regels zelf (regel.categorieNaam, of anders CATEGORIE_LABELS).
            const gegroepeerd = groepeerOpCategorie(regels, record?.data?.categorieVolgorde);

            return (
              <div key={klant.id} style={{ marginBottom: 36, paddingBottom: 28, borderBottom: idx < gekozenKlanten.length - 1 ? "2px dashed #E2E4DF" : "none" }}>
                {gekozenKlanten.length > 1 && (
                  <div style={{ fontSize: 11, color: "#B98237", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                    {documentLabel} {idx + 1} van {gekozenKlanten.length}
                  </div>
                )}
                {afzender && (
                  <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 16 }}>
                    Datum: {datumTijd(record.aangemaaktOp)}
                    {afzender.geldigheid && ` · Geldig ${afzender.geldigheid} dagen`}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #E2E4DF" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#8A9089", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Aan</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{klant.naam}</div>
                    {klant.contact && <div style={{ fontSize: 12.5, color: "#5B6259" }}>{klant.contact}</div>}
                    {klant.email && <div style={{ fontSize: 12.5, color: "#5B6259" }}>{klant.email}</div>}
                  </div>
                  {namens?.naam && (
                    <div>
                      <div style={{ fontSize: 11, color: "#8A9089", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Namens</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{namens.naam}</div>
                      {namens.email && namens.email.toLowerCase() !== namens.naam.toLowerCase() && (
                        <div style={{ fontSize: 12.5, color: "#5B6259" }}>{namens.email}</div>
                      )}
                    </div>
                  )}
                </div>

                {afzender?.inleiding && (
                  <p style={{ fontSize: 13.5, color: "#3A4038", lineHeight: 1.6, marginBottom: 16, whiteSpace: "pre-wrap" }}>
                    {afzender.inleiding}
                  </p>
                )}

                {klantToelichtingen[klant.id] && (
                  <div style={{ background: "#EAF2F8", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1C5D8C", textTransform: "uppercase", marginBottom: 4 }}>
                      Speciaal voor {klant.naam}
                    </div>
                    <div style={{ fontSize: 13, color: "#3A4038", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {klantToelichtingen[klant.id]}
                    </div>
                  </div>
                )}

                {isOpdrachtbevestiging &&
                  [...(paragrafen.verplicht || []), ...(paragrafen.optioneel || [])].map(
                    (p) =>
                      (p.titel || p.tekst) && (
                        <div key={p.id} style={{ marginBottom: 18 }}>
                          {p.titel && <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{p.titel}</div>}
                          {p.tekst && (
                            <p style={{ fontSize: 13, color: "#3A4038", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                              {p.tekst}
                            </p>
                          )}
                        </div>
                      )
                  )}

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #E2E4DF" }}>
                      <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, color: "#8A9089", textTransform: "uppercase" }}>Dienst</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 11, color: "#8A9089", textTransform: "uppercase" }}>Aantal</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 11, color: "#8A9089", textTransform: "uppercase" }}>Prijs</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 11, color: "#8A9089", textTransform: "uppercase" }}>Subtotaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gegroepeerd.map((g) => (
                      <React.Fragment key={g.cat}>
                        <tr>
                          <td colSpan={4} style={{ padding: "10px 4px 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#B98237" }}>
                            {g.naam}
                          </td>
                        </tr>
                        {g.items.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid #F0EEE6" }}>
                            <td style={{ padding: "8px 4px" }}>{r.naam}</td>
                            <td style={{ padding: "8px 4px", textAlign: "right" }}>{r.aantal} {r.eenheid}</td>
                            <td style={{ padding: "8px 4px", textAlign: "right" }}>
                              {r.opAanvraag ? "op aanvraag" : r.opNacalculatie ? "nacalculatie" : currency(r.prijs)}
                            </td>
                            <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700 }}>
                              {r.opAanvraag || r.opNacalculatie ? "—" : currency(r.subtotaal)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <div style={{ width: "100%", maxWidth: 220, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#5B6259" }}>
                      <span>Subtotaal</span>
                      <span>{currency(subtotaal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#5B6259" }}>
                      <span>Btw (21%)</span>
                      <span>{currency(btw)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: "1px solid #E2E4DF", fontWeight: 700 }}>
                      <span>Totaal</span>
                      <span>{currency(totaal)}</span>
                    </div>
                  </div>
                </div>

                {algemeneVoorwaarden?.url && (
                  <p style={{ fontSize: 11, color: "#8A9089", marginTop: 20 }}>
                    Op deze {documentLabel.toLowerCase()} zijn onze{" "}
                    <a href={algemeneVoorwaarden.url} target="_blank" rel="noreferrer" style={{ color: "#1C5D8C" }}>
                      {(algemeneVoorwaarden.titel || "algemene voorwaarden").toLowerCase()}
                    </a>{" "}
                    van toepassing.
                  </p>
                )}
              </div>
            );
          })}

          {roadmap && roadmap.fases?.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 28 }}>
              {koptekstMetLogo(roadmap.titel)}
              <div style={{ display: "grid", gap: 12 }}>
                {roadmap.fases.map((fase) => (
                  <div key={fase.id} style={{ padding: 14, borderRadius: 10, border: "1.5px solid #1C5D8C" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#B98237", letterSpacing: ".04em", textTransform: "uppercase" }}>
                      {fase.label}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4, marginBottom: 8 }}>{fase.titel}</div>
                    {(fase.puntenTekst || "").split("\n").map((p) => p.trim()).filter(Boolean).length > 0 && (
                      <ul style={{ margin: 0, marginBottom: 8, paddingLeft: 16, fontSize: 12, color: "#3A4038", lineHeight: 1.6 }}>
                        {(fase.puntenTekst || "").split("\n").map((p) => p.trim()).filter(Boolean).map((punt, i) => (
                          <li key={i}>{punt}</li>
                        ))}
                      </ul>
                    )}
                    {fase.resultaatTekst && (
                      <div style={{ background: "#EAF2F8", borderRadius: 6, padding: "8px 10px", display: "inline-block" }}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: "#1C5D8C", textTransform: "uppercase" }}>{fase.resultaatLabel}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 600 }}>{fase.resultaatTekst}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(algemeneToelichting.trim() !== "" || Object.values(bijlageToelichtingen).some((t) => (t || "").trim() !== "")) && (
            <div style={{ marginTop: 8 }}>
              {koptekstMetLogo("Bijlage — toelichting per onderdeel")}
              <div style={{ display: "grid", gap: 16 }}>
                {algemeneToelichting.trim() !== "" && (
                  <div style={{ paddingBottom: 14, borderBottom: "1px solid #E2E4DF" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Algemeen</div>
                    <div style={{ fontSize: 12.5, color: "#3A4038", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{algemeneToelichting}</div>
                  </div>
                )}
                {Object.entries(regelsPerKlant)[0]?.[1]?.map((regel) =>
                  bijlageToelichtingen[regel.id] ? (
                    <div key={regel.id} style={{ paddingBottom: 14, borderBottom: "1px solid #E2E4DF" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{regel.naam}</div>
                      <p style={{ fontSize: 12.5, color: "#3A4038", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {bijlageToelichtingen[regel.id]}
                      </p>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "24px 28px", borderTop: "1px solid #E2E4DF", background: "#FAFAF7" }}>
          {definitieveOndertekening ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 16,
                borderRadius: 10,
                background: definitieveOndertekening.akkoord ? "#E7F4EC" : "#FBF2EC",
                border: `1px solid ${definitieveOndertekening.akkoord ? "#BFE0CC" : "#E2C4B0"}`,
              }}
            >
              {definitieveOndertekening.akkoord ? (
                <ShieldCheck size={22} color="#2E7D4F" style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <ShieldAlert size={22} color="#B14A2E" style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <div style={{ fontSize: 13.5 }}>
                <strong>
                  {definitieveOndertekening.akkoord
                    ? `Deze ${documentLabel.toLowerCase()} is ondertekend.`
                    : `Deze ${documentLabel.toLowerCase()} is afgewezen.`}
                </strong>
                <div style={{ marginTop: 4, color: "#5B6259" }}>
                  Door {definitieveOndertekening.naam} ({definitieveOndertekening.email})<br />
                  op {datumTijd(definitieveOndertekening.op)}
                </div>
                {definitieveOndertekening.handtekening && (
                  <div style={{ marginTop: 10 }}>
                    <img
                      src={definitieveOndertekening.handtekening}
                      alt="Handtekening"
                      style={{ maxWidth: 260, background: "#fff", border: "1px solid #E2E4DF", borderRadius: 6 }}
                    />
                  </div>
                )}
                {definitieveOndertekening.emailKomtOvereen === false && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#8A6A1E", background: "#FBF3DE", borderRadius: 6, padding: "8px 10px" }}>
                    Let op: dit e-mailadres wijkt af van het bij ons bekende contactadres.
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11.5, color: "#8A9089" }}>
                  Vastgelegd inclusief tijdstip en IP-adres, als bevestiging van deze reactie.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Naam</label>
                  <input style={invoer} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>E-mailadres</label>
                  <input
                    style={invoer}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="naam@bedrijf.nl"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Toelichting (optioneel)
                  </label>
                  <textarea
                    style={{ ...invoer, minHeight: 70, resize: "vertical" }}
                    value={opmerking}
                    onChange={(e) => setOpmerking(e.target.value)}
                    placeholder="Eventuele opmerkingen…"
                  />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Handtekening (nodig om akkoord te geven — teken met muis of vinger)
                    </label>
                    <button
                      type="button"
                      onClick={wisHandtekening}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        border: "none",
                        background: "none",
                        color: "#8A9089",
                        fontSize: 11.5,
                        cursor: "pointer",
                        padding: 2,
                      }}
                    >
                      <Eraser size={12} />
                      Wissen
                    </button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={640}
                    height={180}
                    onMouseDown={tekenStart}
                    onMouseMove={tekenBeweeg}
                    onMouseUp={tekenStop}
                    onMouseLeave={tekenStop}
                    onTouchStart={tekenStart}
                    onTouchMove={tekenBeweeg}
                    onTouchEnd={tekenStop}
                    style={{
                      width: "100%",
                      height: 140,
                      display: "block",
                      background: "#FAFAF7",
                      border: "1px solid #C8CDC5",
                      borderRadius: 8,
                      touchAction: "none",
                      cursor: "crosshair",
                    }}
                  />
                </div>
              </div>

              {inzendFout && (
                <div style={{ fontSize: 12.5, color: "#B14A2E", marginBottom: 12 }}>{inzendFout}</div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  disabled={bezig}
                  onClick={() => versturen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "none",
                    background: "#1C5D8C",
                    color: "#fff",
                    padding: "12px 20px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: bezig ? "default" : "pointer",
                    opacity: bezig ? 0.6 : handtekeningLeeg ? 0.5 : 1,
                  }}
                >
                  <Check size={16} />
                  Akkoord — ondertekenen
                </button>
                <button
                  disabled={bezig}
                  onClick={() => versturen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid #C8CDC5",
                    background: "#fff",
                    color: "#5B6259",
                    padding: "12px 20px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: bezig ? "default" : "pointer",
                    opacity: bezig ? 0.6 : 1,
                  }}
                >
                  <X size={16} />
                  Niet akkoord
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#8A9089", marginTop: 12 }}>
                Voor akkoord is een handtekening in het vak hierboven verplicht; voor "Niet akkoord" hoeft dat niet.
                Door te versturen bevestig je dat jij deze reactie geeft. We leggen daarbij je naam, e-mailadres,
                handtekening, het tijdstip en je IP-adres vast als bewijs.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
