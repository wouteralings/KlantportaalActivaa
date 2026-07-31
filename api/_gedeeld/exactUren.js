/**
 * Brug tussen de interne urenregistratie en Exact Online: schrijft goedgekeurde UXT-uren als
 * definitieve verkoopfactuur naar Exact. Per cliënt één factuur met een regel per boeking.
 *
 * Cliënt → Exact-debiteur wordt gematcht op KvK-nummer (Dynamics account.accountnumber →
 * Exact ChamberOfCommerce) met terugval op naam. Wordt er geen debiteur gevonden, dan blijven de
 * boekingen staan met een leesbare exactstatus (geen halve/foute factuur).
 *
 * Best-effort: fouten worden op de boeking vastgelegd (cr283_exactstatus) en nooit doorgegooid naar
 * de aanroepende actie (goedkeuren mag niet mislukken doordat Exact even plat ligt).
 */
const exact = require("./exact");
const uren = require("./urenDataverse");
const { haalDynamicsToken, haalAccountOpId } = require("./identiteit");

const cijfers = (s) => String(s || "").replace(/\D/g, "");

async function vindDebiteur(ctx, kvk, naam) {
  const { accessToken, division, base } = ctx;
  const hdr = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const kvkCijfers = cijfers(kvk);
  // 1) op KvK (ChamberOfCommerce)
  if (kvkCijfers) {
    const res = await fetch(`${base}/api/v1/${division}/crm/Accounts?$select=ID,Name,ChamberOfCommerce&$filter=ChamberOfCommerce eq '${kvkCijfers}'&$top=1`, { headers: hdr });
    if (res.ok) { const d = await res.json(); const r = d && d.d && d.d.results && d.d.results[0]; if (r) return r.ID; }
  }
  // 2) op exacte naam
  if (naam) {
    const veilig = String(naam).replace(/'/g, "''");
    const res = await fetch(`${base}/api/v1/${division}/crm/Accounts?$select=ID,Name&$filter=Name eq '${veilig}'&$top=1`, { headers: hdr });
    if (res.ok) { const d = await res.json(); const r = d && d.d && d.d.results && d.d.results[0]; if (r) return r.ID; }
  }
  return null;
}

async function maakVerkoopfactuur(ctx, debiteurId, boekingen) {
  const { accessToken, division, base } = ctx;
  const vatCode = process.env.EXACT_VATCODE || null;
  const regels = [];
  for (const b of boekingen) {
    const aantal = b.goedgekeurdeUren != null ? b.goedgekeurdeUren : b.uren;
    const regel = {
      Description: `${(b.soort || "UXT").toUpperCase()} ${b.datum}${b.omschrijving ? " - " + b.omschrijving : ""}`.slice(0, 250),
      Quantity: Number(aantal) || 0,
      UnitPrice: Number(b.tariefBedrag) || 0,
    };
    if (vatCode) regel.VATCode = vatCode;
    regels.push(regel);
    if (b.extraBedrag) {
      const extra = { Description: `Extra${b.extraReden ? " - " + b.extraReden : ""}`.slice(0, 250), Quantity: 1, UnitPrice: Number(b.extraBedrag) || 0 };
      if (vatCode) extra.VATCode = vatCode;
      regels.push(extra);
    }
  }
  const body = {
    InvoiceTo: debiteurId, OrderedBy: debiteurId,
    Description: `Meerwerk (UXT) — automatisch vanuit klantportaal`,
    SalesInvoiceLines: regels,
  };
  if (process.env.EXACT_JOURNAL) body.Journal = process.env.EXACT_JOURNAL;
  const res = await fetch(`${base}/api/v1/${division}/salesinvoice/SalesInvoices`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Exact verkoopfactuur aanmaken mislukt (${res.status}): ${await res.text()}`);
  const d = await res.json();
  const rec = (d && d.d) || {};
  const invoiceId = rec.InvoiceID || rec.EntryID || null;
  let referentie = rec.InvoiceNumber && rec.InvoiceNumber !== 0 ? String(rec.InvoiceNumber) : (invoiceId || "");

  // "Direct definitief": afdrukken/verwerken zodat de factuur definitief geboekt wordt.
  let definitief = false;
  if (invoiceId) {
    try {
      const pr = await fetch(`${base}/api/v1/${division}/salesinvoice/PrintedSalesInvoices`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ InvoiceID: invoiceId }),
      });
      if (pr.ok) { definitief = true; const pd = await pr.json().catch(() => null); const num = pd && pd.d && pd.d.InvoiceNumber; if (num) referentie = String(num); }
    } catch { /* factuur staat dan als concept in Exact */ }
  }
  return { referentie: referentie || invoiceId || "onbekend", invoiceId, definitief };
}

/** Push alle nog niet geëxporteerde, goedgekeurde UXT-uren van één cliënt naar Exact. */
async function pushKlantNaarExact(accountId) {
  if (!exact.isGeconfigureerd()) return { overgeslagen: "Exact niet geconfigureerd" };
  const boekingen = await uren.uxtTeExporteren({ accountId });
  if (boekingen.length === 0) return { aantal: 0 };

  let ctx;
  try { ctx = await exact.geldigToken(); }
  catch (e) {
    const reden = e.message === "EXACT_NIET_VERBONDEN" ? "Exact is nog niet gekoppeld" : "Exact-token ophalen mislukt";
    for (const b of boekingen) { try { await uren.markeerExact(b.id, { exactstatus: reden }); } catch { /* noop */ } }
    return { fout: reden, aantal: 0 };
  }

  // Debiteur zoeken op KvK/naam (uit Dynamics).
  let kvk = "", naam = "";
  try { const dynToken = await haalDynamicsToken(); const acc = await haalAccountOpId(accountId, dynToken); if (acc) { kvk = acc.accountnumber || ""; naam = acc.name || ""; } } catch { /* noop */ }
  if (!naam) naam = boekingen[0].klantnaam || "";

  let debiteurId = null;
  try { debiteurId = await vindDebiteur(ctx, kvk, naam); } catch { /* noop */ }
  if (!debiteurId) {
    const reden = `Geen Exact-debiteur gevonden (KvK ${cijfers(kvk) || "?"} / ${naam || "?"})`;
    for (const b of boekingen) { try { await uren.markeerExact(b.id, { exactstatus: reden }); } catch { /* noop */ } }
    return { fout: reden, aantal: 0 };
  }

  try {
    const { referentie, definitief } = await maakVerkoopfactuur(ctx, debiteurId, boekingen);
    const statusTekst = definitief ? `Definitief in Exact (${referentie})` : `Als concept in Exact (${referentie})`;
    for (const b of boekingen) { try { await uren.markeerExact(b.id, { exactfactuur: referentie, exactstatus: statusTekst, gefactureerd: true }); } catch { /* noop */ } }
    return { aantal: boekingen.length, referentie, definitief };
  } catch (e) {
    const reden = String(e.message || e).slice(0, 380);
    for (const b of boekingen) { try { await uren.markeerExact(b.id, { exactstatus: reden }); } catch { /* noop */ } }
    return { fout: reden, aantal: 0 };
  }
}

/** Push voor ALLE cliënten met openstaande goedgekeurde UXT-uren (voor de dagelijkse verwerker). */
async function pushAlleUxt() {
  if (!exact.isGeconfigureerd()) return { overgeslagen: "Exact niet geconfigureerd", klanten: 0 };
  const boekingen = await uren.uxtTeExporteren({});
  const accountIds = [...new Set(boekingen.map((b) => b.accountId).filter(Boolean))];
  const resultaten = [];
  for (const accountId of accountIds) {
    const r = await pushKlantNaarExact(accountId);
    resultaten.push({ accountId, ...r });
  }
  return { klanten: accountIds.length, gefactureerd: resultaten.filter((r) => r.aantal > 0).length, resultaten };
}

module.exports = { pushKlantNaarExact, pushAlleUxt };
