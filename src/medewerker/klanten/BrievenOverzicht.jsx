import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, FileText, Download, FolderInput, Mail, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, X, ChevronDown, Building2, User, Landmark, Paperclip, Upload, Printer,
} from "lucide-react";

/**
 * Brieven — medewerkersportaal → Klantoverzicht → Brieven (herzien 05-08-2026).
 *
 * De medewerker kiest een klant en een standaardbrief. De geadresseerde is te kiezen: het adres van
 * de klant zelf, het gekoppelde belastingkantoor (via Dynamics-lookup op de klant), of "overig"
 * (handmatig). Een standaardbrief kan invulvelden hebben (bijv. periode: maand/kwartaal/jaar) die de
 * medewerker hier invult; samen met de klant-merge-velden vullen ze {{...}} in onderwerp/tekst. Het
 * voorbeeld staat altijd rechts in beeld (met eventueel het geüploade briefpapier als achtergrond),
 * en de brief kan als PDF/Word gedownload, in het klantdossier opgeslagen en gemaild worden.
 *
 * (De eerdere "Standaardbrief uit Dynamics"-modus met cr283_brief-records + regels-engine is er op
 * verzoek uit — "vergeet Dynamics in de brieven". De klant wordt nog wel uit Dynamics gekozen.)
 */

const KLEUR = {
  blauw: "#1C5D8C", tekst: "#1C2321", subtekst: "#5B6259", mutedTekst: "#8A9089",
  rand: "#E2E4DF", lichtblauw: "#EAF2F8", rood: "#B23B3B", groen: "#2E7D46", goud: "#B98237", papier: "#FFFFFF",
};

const ACTIE_LABEL = { mail: "Gemaild", dossier: "In dossier", backoffice: "Backoffice" };

function veiligeStr(v) { return String(v == null ? "" : v).trim(); }
function briefDatum(iso) { try { return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } }
function samenAdres(a) { a = a || {}; return [a.straat, a.huisnummer, a.toevoeging].map(veiligeStr).filter(Boolean).join(" "); }
function postcodePlaats(a) { a = a || {}; return [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join("  "); }
function vandaagLang() { try { return new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); } catch { return new Date().toISOString().slice(0, 10); } }
function beleefdeAchternaam(c) { c = c || {}; return [veiligeStr(c.tussenvoegsel), veiligeStr(c.achternaam)].filter(Boolean).join(" ") || veiligeStr(c.naam); }

/** Klant-merge-velden voor {{...}}. */
function veldenVan(klant, afzender) {
  const k = klant || {}, c = k.contact || {}, bezoek = k.adres || {}, contactAdres = c.adres || {};
  const adresBron = samenAdres(bezoek) ? bezoek : contactAdres;
  return {
    klantnaam: veiligeStr(k.klantnaam), klantnummer: veiligeStr(k.klantnummer), groepsnaam: veiligeStr(k.groepsnaam),
    kvk: veiligeStr(k.kvk), belastingkantoor: veiligeStr(k.belastingkantoor),
    relatiebeheerder: veiligeStr(k.relatiebeheerder), accountant: veiligeStr(k.accountant),
    contactpersoon: veiligeStr(c.naam), voornaam: veiligeStr(c.voornaam), achternaam: beleefdeAchternaam(c),
    functietitel: veiligeStr(c.functietitel), email: veiligeStr(c.email) || veiligeStr(k.emailKlant),
    telefoon: veiligeStr(c.telefoon) || veiligeStr(k.telefoonKlant),
    adresregel: samenAdres(adresBron), postcode: veiligeStr(adresBron.postcode), plaats: veiligeStr(adresBron.plaats),
    postcodeplaats: postcodePlaats(adresBron), datum: vandaagLang(),
    afzendernaam: veiligeStr(afzender && afzender.bedrijfsnaam) || "Activaa", afzenderplaats: veiligeStr(afzender && afzender.plaats),
  };
}
function vulIn(sjabloontekst, velden) {
  return String(sjabloontekst || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, sleutel) => {
    const key = String(sleutel).toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.prototype.hasOwnProperty.call(velden, key) ? velden[key] : "";
  });
}

function aanhefVan(klant) { const a = beleefdeAchternaam(klant && klant.contact); return a ? `Geachte heer/mevrouw ${a},` : "Geachte heer, mevrouw,"; }
function ontvangerRegelsVanKlant(klant) {
  const k = klant || {}, c = k.contact || {}, bezoek = k.adres || {};
  const adresBron = samenAdres(bezoek) ? bezoek : (c.adres || {});
  const r = [];
  if (veiligeStr(k.klantnaam)) r.push(veiligeStr(k.klantnaam));
  if (veiligeStr(c.naam)) r.push(`T.a.v. ${veiligeStr(c.naam)}`);
  const adr = samenAdres(adresBron); if (adr) r.push(adr);
  const pcp = postcodePlaats(adresBron); if (pcp) r.push(pcp);
  return r.length ? r : ["(kies een klant)"];
}
function afzenderRegelsVan(afzender) {
  const a = afzender || {}, r = [];
  if (veiligeStr(a.adres)) r.push(veiligeStr(a.adres));
  const pcp = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join("  "); if (pcp) r.push(pcp);
  if (veiligeStr(a.telefoon)) r.push(`T ${veiligeStr(a.telefoon)}`);
  const contact = [veiligeStr(a.email), veiligeStr(a.website)].filter(Boolean).join("  ·  "); if (contact) r.push(contact);
  return r;
}
function voetnootVan(afzender) {
  const a = afzender || {};
  if (veiligeStr(a.voetnoot)) return veiligeStr(a.voetnoot);
  return [veiligeStr(a.bedrijfsnaam) || "Activaa", veiligeStr(a.kvk) ? `KvK ${veiligeStr(a.kvk)}` : "", veiligeStr(a.email), veiligeStr(a.website)].filter(Boolean).join("  ·  ");
}
function ondertekenaarDefault(klant, afzender) {
  const a = afzender || {};
  if (a.ondertekenaarBron === "accountant") return veiligeStr(klant && klant.accountant);
  if (a.ondertekenaarBron === "vast") return veiligeStr(a.ondertekenaarVast);
  return veiligeStr(klant && klant.relatiebeheerder);
}
/** Standaard "Behandeld door": de relatiebeheerder/manager van de klant (anders de accountant). */
function behandelaarVan(klant) {
  const k = klant || {};
  return veiligeStr(k.manager && k.manager.naam) || veiligeStr(k.relatiebeheerder) || veiligeStr(k.accountant);
}
/** Driekoloms voettekst uit de afzendergegevens (bedrijf/adres · contact · BTW/KvK/IBAN). */
function footerKolommenVan(a) {
  a = a || {};
  const pcp = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ");
  return [
    [veiligeStr(a.bedrijfsnaam) || "Activaa", veiligeStr(a.adres), pcp].filter(Boolean),
    [veiligeStr(a.telefoon), veiligeStr(a.website), veiligeStr(a.email)].filter(Boolean),
    [veiligeStr(a.btw) && `BTW ${veiligeStr(a.btw)}`, veiligeStr(a.kvk) && `KvK ${veiligeStr(a.kvk)}`, veiligeStr(a.iban) && `IBAN ${veiligeStr(a.iban)}`].filter(Boolean),
  ];
}
/** Kleine afzender-adresregel (onder het logo, gecentreerd) — alleen zichtbaar met briefpapier/achtergrond. */
function afzenderMiniRegelVan(a) {
  a = a || {};
  const pcp = [veiligeStr(a.postcode), veiligeStr(a.plaats)].filter(Boolean).join(" ");
  return [veiligeStr(a.adres), pcp].filter(Boolean).join("  ");
}

function base64Download(base64, bestandsnaam, contentType) {
  const bin = atob(base64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: contentType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = bestandsnaam || "brief";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Standaard begeleidende mailtekst (spiegelt STANDAARD_MAIL_TEKST in api/_gedeeld/briefSjablonen.js);
// gebruikt in de verstuur-preview als de beheerder (nog) geen eigen mailtekst heeft ingesteld.
const STANDAARD_MAIL_TEKST =
  "Geachte heer/mevrouw,\n\n" +
  "Bijgaand ontvangt u een brief van {{afzendernaam}}. Wij verzoeken u vriendelijk kennis te nemen van de inhoud.\n\n" +
  "Heeft u vragen naar aanleiding van deze brief? Neem dan gerust contact met ons op.\n\n" +
  "Met vriendelijke groet,\n{{afzendernaam}}";

export default function BrievenOverzicht() {
  const [config, setConfig] = useState(null); // { afzender, sharepointMap, sjablonen, briefvelden }
  const [configFout, setConfigFout] = useState("");
  const [klanten, setKlanten] = useState(null);
  const [klantFout, setKlantFout] = useState("");

  const [zoek, setZoek] = useState("");
  const [klant, setKlant] = useState(null);
  const [sjabloonId, setSjabloonId] = useState("");
  const [sjabloonZoek, setSjabloonZoek] = useState(""); // zoeken tussen de standaardbrieven i.p.v. dropdown

  // Geadresseerde
  const [geadType, setGeadType] = useState("klant"); // "klant" | "belastingkantoor" | "overig"
  const [bk, setBk] = useState({ status: "idle" }); // belastingkantoor: idle|laden|ok|niet|fout
  const [overig, setOverig] = useState({ naam: "", straat: "", huisnummer: "", postcode: "", plaats: "" });

  // Bewerkbare brief (onderwerp/tekst blijven "ruw" met {{...}}; resolven live in het voorbeeld/uitvoer)
  const [onderwerp, setOnderwerp] = useState("");
  const [aanhef, setAanhef] = useState("");
  const [tekst, setTekst] = useState("");
  const [afsluiting, setAfsluiting] = useState("");
  const [ondertekenaar, setOndertekenaar] = useState("");
  // Kopvelden (huisstijl-layout): VERTROUWELIJK, Kenmerk, Behandeld door, Telefoonnummer + de
  // "automatisch gegenereerd"-regel. Vooringevuld waar mogelijk, maar aanpasbaar.
  const [vertrouwelijk, setVertrouwelijk] = useState(false);
  const [kenmerk, setKenmerk] = useState("");
  const [behandeldDoor, setBehandeldDoor] = useState("");
  const [telefoonnummer, setTelefoonnummer] = useState("");
  const [autoGegenereerd, setAutoGegenereerd] = useState(true);
  const [veldWaarden, setVeldWaarden] = useState({}); // sleutel → waarde (invulvelden)
  const [naar, setNaar] = useState("");
  const [cc, setCc] = useState("");
  // Verstuur-preview: vóór het mailen eerst het onderwerp + de begeleidende tekst laten zien/bewerken
  // (zoals bij "Aangifte versturen"). null = dicht; anders { naar, cc, onderwerp, tekst }.
  const [mailModal, setMailModal] = useState(null);
  const [mailFout, setMailFout] = useState("");
  const [formaat, setFormaat] = useState("pdf");
  const [bijlage, setBijlage] = useState(null); // { naam, dataUrl, grootte } of null
  const [sleepBijlage, setSleepBijlage] = useState(false);
  const bijlageInputRef = useRef(null);

  const [bezig, setBezig] = useState("");
  const [melding, setMelding] = useState(null);

  const [verzonden, setVerzonden] = useState([]); // brievenlogboek van de gekozen klant
  const [verzondenBezig, setVerzondenBezig] = useState(false);

  const levend = useRef(true);
  useEffect(() => () => { levend.current = false; }, []);

  useEffect(() => {
    fetch("/api/brief-sjablonen").then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setConfig(d); })
      .catch(() => { if (levend.current) setConfigFout("De briefsjablonen konden niet worden geladen."); });
    fetch("/api/beheer-klanten").then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (levend.current) setKlanten(d.klanten || []); })
      .catch(() => { if (levend.current) { setKlanten([]); setKlantFout("De klantenlijst kon niet worden geladen."); } });
  }, []);

  const afzender = (config && config.afzender) || {};
  const sjablonen = (config && config.sjablonen) || [];
  const briefvelden = (config && config.briefvelden) || [];
  const sjabloon = sjablonen.find((s) => s.id === sjabloonId) || null;
  const gefilterdeSjablonen = useMemo(() => {
    const t = sjabloonZoek.trim().toLowerCase();
    if (!t) return sjablonen;
    return sjablonen.filter((s) => `${s.naam || ""} ${s.onderwerp || ""}`.toLowerCase().includes(t));
  }, [sjablonen, sjabloonZoek]);
  const actieveVelddefs = useMemo(() => {
    const sleutels = (sjabloon && Array.isArray(sjabloon.velden)) ? sjabloon.velden : [];
    return sleutels.map((sl) => briefvelden.find((v) => v.sleutel === sl)).filter(Boolean);
  }, [sjabloon, briefvelden]);

  // Belastingkantoor-adres ophalen zodra dat gekozen wordt (en bij klantwissel).
  useEffect(() => {
    if (geadType !== "belastingkantoor" || !klant) { return; }
    setBk({ status: "laden" });
    fetch(`/api/brief-geadresseerde?accountId=${encodeURIComponent(klant.accountId)}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!levend.current) return;
        if (!ok) setBk({ status: "fout", fout: d.error || "Kon het belastingkantoor niet ophalen." });
        else if (!d.gekoppeld) setBk({ status: "niet" });
        else setBk({ status: "ok", naam: d.naam, adres: d.adres, adresTekst: d.adresTekst || "" });
      })
      .catch((e) => { if (levend.current) setBk({ status: "fout", fout: String(e.message || e) }); });
  }, [geadType, klant]);

  // Sjabloon invullen bij keuze/klantwissel: ruwe onderwerp/tekst + defaults voor de invulvelden.
  useEffect(() => {
    if (!config || !sjabloon) return;
    setOnderwerp(sjabloon.onderwerp || "");
    setTekst(sjabloon.tekst || "");
    setAanhef(aanhefVan(klant));
    setAfsluiting(veiligeStr(afzender.afsluiting) || "Met vriendelijke groet,");
    setOndertekenaar(ondertekenaarDefault(klant, afzender));
    setVertrouwelijk(!!sjabloon.vertrouwelijk);
    setKenmerk("");
    setBehandeldDoor(behandelaarVan(klant));
    // "Behandeld door" krijgt het mobiele nummer van de manager/relatiebeheerder (systemuser.mobilephone,
    // al meegeleverd als klant.manager.telefoon); valt terug op het algemene afzender-telefoonnummer.
    setTelefoonnummer(veiligeStr(klant && klant.manager && klant.manager.telefoon) || veiligeStr(afzender.telefoon));
    setAutoGegenereerd(true);
    // (Naar/CC wordt gezet door de geadresseerde-effect hieronder.)
    // invulveld-defaults
    const start = {};
    for (const v of (Array.isArray(sjabloon.velden) ? sjabloon.velden : [])) {
      const def = briefvelden.find((x) => x.sleutel === v);
      if (!def) continue;
      start[v] = def.type === "keuze" && def.opties && def.opties[0] ? def.opties[0].label
               : def.type === "paragraaf" && def.opties && def.opties[0] ? (def.opties[0].tekst || "")
               : "";
    }
    setVeldWaarden(start);
    setMelding(null);
  }, [sjabloonId, klant, config]); // eslint-disable-line react-hooks/exhaustive-deps

  // E-mailbestemming + CC afhankelijk van de geadresseerde:
  //  - klant/belastingkantoor → mailen naar de klant-contactpersoon, geen CC.
  //  - overig → de brief gaat naar een andere partij, dus de bestemming (Naar) wordt gevraagd
  //    (leeg gelaten) en de klant-contactpersoon komt automatisch in CC.
  useEffect(() => {
    const klantEmail = veiligeStr(klant && klant.contact && klant.contact.email) || veiligeStr(klant && klant.emailKlant);
    if (geadType === "overig") { setNaar(""); setCc(klantEmail); }
    else { setNaar(klantEmail); setCc(""); }
  }, [geadType, klant]); // eslint-disable-line react-hooks/exhaustive-deps

  const gefilterd = useMemo(() => {
    const t = zoek.trim().toLowerCase(); const lijst = klanten || [];
    if (!t) return lijst.slice(0, 12);
    return lijst.filter((k) => `${k.klantnaam} ${k.klantnummer ?? ""} ${k.groepsnaam ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [zoek, klanten]);

  const ontvangerRegels = useMemo(() => {
    if (geadType === "belastingkantoor") {
      if (bk.status !== "ok") return ["(belastingkantoor)"];
      // Antwoordadres (cr283_antwoordadres) als meerregelige tekst → regel voor regel gebruiken.
      if (veiligeStr(bk.adresTekst)) {
        const lijnen = String(bk.adresTekst).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        return [veiligeStr(bk.naam) || "Belastingdienst", ...lijnen];
      }
      return [veiligeStr(bk.naam) || "Belastingdienst", samenAdres(bk.adres), postcodePlaats(bk.adres)].filter(Boolean);
    }
    if (geadType === "overig") {
      const r = [];
      if (veiligeStr(overig.naam)) r.push(veiligeStr(overig.naam));
      const adr = [veiligeStr(overig.straat), veiligeStr(overig.huisnummer)].filter(Boolean).join(" "); if (adr) r.push(adr);
      const pcp = [veiligeStr(overig.postcode), veiligeStr(overig.plaats)].filter(Boolean).join("  "); if (pcp) r.push(pcp);
      return r.length ? r : ["(vul het adres in)"];
    }
    return ontvangerRegelsVanKlant(klant);
  }, [geadType, bk, overig, klant]);

  // Merge-map: klant-velden + invulvelden (sleutels genormaliseerd, net als vulIn).
  const mergeVelden = useMemo(() => {
    const m = veldenVan(klant, afzender);
    for (const [sleutel, waarde] of Object.entries(veldWaarden)) {
      m[String(sleutel).toLowerCase().replace(/[^a-z0-9]/g, "")] = veiligeStr(waarde);
    }
    return m;
  }, [klant, afzender, veldWaarden]);

  const plaatsBrief = veiligeStr(afzender.plaats) || veiligeStr(klant && klant.adres && klant.adres.plaats);
  const brief = useMemo(() => ({
    afzenderNaam: veiligeStr(afzender.bedrijfsnaam) || "Activaa",
    afzenderRegels: afzenderRegelsVan(afzender),
    afzenderMiniRegel: afzenderMiniRegelVan(afzender),
    plaatsDatum: plaatsBrief ? `${plaatsBrief}, ${vandaagLang()}` : vandaagLang(),
    vertrouwelijk,
    ontvangerRegels,
    kenmerk: veiligeStr(kenmerk),
    beconnummer: veiligeStr(afzender.beconnummer),
    onderwerp: vulIn(onderwerp, mergeVelden),
    behandeldDoor: veiligeStr(behandeldDoor),
    telefoonnummer: veiligeStr(telefoonnummer),
    aanhef, tekst: vulIn(tekst, mergeVelden), afsluiting,
    ondertekeningBedrijf: veiligeStr(afzender.bedrijfsnaam) || "Activaa",
    ondertekenaar: veiligeStr(ondertekenaar),
    ondertekenaarRegels: [ondertekenaar, veiligeStr(afzender.bedrijfsnaam) || "Activaa"].filter(Boolean),
    automatischGegenereerd: !!autoGegenereerd,
    bijlageNaam: bijlage ? veiligeStr(bijlage.naam) : "",
    footerKolommen: footerKolommenVan(afzender),
    voetnoot: voetnootVan(afzender),
    logoUrl: veiligeStr(afzender.logoUrl), logoUitlijning: afzender.logoUitlijning || "links", logoGrootte: afzender.logoGrootte || "normaal",
    achtergrondUrl: veiligeStr(afzender.achtergrondUrl),
  }), [afzender, ontvangerRegels, onderwerp, aanhef, tekst, afsluiting, ondertekenaar, plaatsBrief, mergeVelden, vertrouwelijk, kenmerk, behandeldDoor, telefoonnummer, autoGegenereerd, bijlage]);

  const bestandsnaamBasis = `${(sjabloon && sjabloon.naam) || "Brief"}${klant ? " - " + veiligeStr(klant.klantnaam) : ""}`;
  const geadresseerdeOk = geadType !== "belastingkantoor" || bk.status === "ok";
  const klaarVoorActie = !!klant && !!sjabloonId && geadresseerdeOk;

  // Bijlage kiezen (1 bestand, alle types) — net als de klant een document uploadt: als data-URL
  // inlezen en meesturen. Grens op 20 MB (dossier); grote bestanden gaan mogelijk niet per e-mail mee.
  function kiesBijlage(file) {
    if (!file) return;
    const MAX = 20 * 1024 * 1024;
    if (file.size > MAX) { setMelding({ type: "fout", tekst: `Bijlage is te groot (max 20 MB). "${file.name}" is ${(file.size / 1048576).toFixed(1)} MB.` }); return; }
    const r = new FileReader();
    r.onload = () => { if (levend.current) { setBijlage({ naam: file.name, dataUrl: String(r.result || ""), grootte: file.size }); setMelding(null); } };
    r.onerror = () => { if (levend.current) setMelding({ type: "fout", tekst: "Kon de bijlage niet inlezen." }); };
    r.readAsDataURL(file);
  }

  // Kent bij de eerste verstuur-/genereeractie op deze brief één uniek kenmerk toe
  // (jaar-klantnummer-volgnummer) en hergebruikt dat daarna. Reset bij klant-/sjabloonwissel (setKenmerk("")).
  async function zorgVoorKenmerk() {
    if (kenmerk) return kenmerk;
    try {
      const res = await fetch("/api/brief-kenmerk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ klantnummer: klant && klant.klantnummer }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.kenmerk) { if (levend.current) setKenmerk(d.kenmerk); return d.kenmerk; }
    } catch { /* zonder kenmerk verder — de brief wordt dan zonder kenmerk gelogd */ }
    return "";
  }

  // Verzonden brieven van de gekozen klant (het brievenlogboek) ophalen.
  async function laadVerzonden(accountId) {
    if (!accountId) { setVerzonden([]); return; }
    setVerzondenBezig(true);
    try {
      const res = await fetch(`/api/brief-log?accountId=${encodeURIComponent(accountId)}`);
      const d = await res.json().catch(() => ({}));
      if (levend.current) setVerzonden(Array.isArray(d.brieven) ? d.brieven : []);
    } catch { if (levend.current) setVerzonden([]); }
    finally { if (levend.current) setVerzondenBezig(false); }
  }
  useEffect(() => { laadVerzonden(klant && klant.accountId); }, [klant]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doeActie(actie, fmt) {
    if (!klaarVoorActie) { setMelding({ type: "fout", tekst: "Kies eerst een klant, een brief en een geldige geadresseerde." }); return; }
    setMelding(null); setBezig(actie + (fmt || ""));
    try {
      const kenmerkNu = await zorgVoorKenmerk();
      const briefNu = { ...brief, kenmerk: kenmerkNu };
      const payload = { actie, brief: briefNu, bestandsnaamBasis, formaat: fmt || formaat };
      // Loggegevens voor het brievenlogboek (per klant terug te vinden) — bij elke actie meegestuurd.
      if (klant) { payload.accountId = klant.accountId; payload.klantnummer = klant.klantnummer; payload.klantnaam = veiligeStr(klant.klantnaam); }
      payload.sjabloonnaam = veiligeStr(sjabloon && sjabloon.naam);
      payload.geadType = geadType;
      if (actie === "backoffice") {
        // Onderwerp van de backoffice-taak uit Beheer, placeholders ingevuld.
        payload.backofficeOnderwerp = vulIn(veiligeStr(afzender.backofficeOnderwerp), mergeVelden);
      }
      if (actie === "mail") {
        payload.naar = naar.trim();
        payload.cc = cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        // Begeleidende mail uit Beheer: placeholders ({{klantnaam}} enz.) invullen met dezelfde
        // merge-velden als de brief; leeg = de backend valt terug op briefonderwerp/-tekst.
        payload.mailOnderwerp = vulIn(veiligeStr(afzender.mailOnderwerp), mergeVelden);
        payload.mailTekst = vulIn(veiligeStr(afzender.mailTekst), mergeVelden);
      }
      if ((actie === "mail" || actie === "dossier" || actie === "backoffice") && bijlage) payload.bijlage = { naam: bijlage.naam, dataUrl: bijlage.dataUrl };
      const res = await fetch("/api/brieven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Er ging iets mis (${res.status}).`);
      const metBijlage = bijlage ? " (met bijlage)" : "";
      if (actie === "genereer") { base64Download(data.base64, data.bestandsnaam, data.contentType); setMelding({ type: "ok", tekst: `${data.bestandsnaam} is gedownload.` }); }
      else if (actie === "mail") { setMelding({ type: "ok", tekst: `Brief gemaild naar ${naar.trim()}${metBijlage}.` }); }
      else if (actie === "dossier") { if (data.gedaan) setMelding({ type: "ok", tekst: `Brief opgeslagen in het SharePoint-dossier van de klant${metBijlage}.` }); else setMelding({ type: "fout", tekst: data.reden || "Opslaan in het dossier is niet gelukt." }); }
      else if (actie === "backoffice") {
        if (data.taakGedaan) setMelding({ type: "ok", tekst: `Taak voor backoffice aangemaakt${data.dossierGedaan ? " en de brief staat in het klantdossier" : ""}${metBijlage}.${data.eigenaarGevonden ? "" : " (Let op: geen eigenaar gevonden — controleer het backoffice-adres in Beheer.)"}` });
        else setMelding({ type: "fout", tekst: data.taakReden || "Kon de backoffice-taak niet aanmaken." });
      }
      if (actie === "mail" || actie === "dossier" || actie === "backoffice") laadVerzonden(klant && klant.accountId);
    } catch (e) { setMelding({ type: "fout", tekst: String(e.message || e) }); }
    finally { if (levend.current) setBezig(""); }
  }

  // "Mailen naar klant" opent eerst de preview-modal met vooringevuld onderwerp + begeleidende tekst
  // (uit Beheer → Brieven, placeholders ingevuld). Pas op "Versturen" in de modal gaat de mail weg.
  function openMailModal() {
    if (!klaarVoorActie) { setMelding({ type: "fout", tekst: "Kies eerst een klant, een brief en een geldige geadresseerde." }); return; }
    if (!naar.trim()) { setMelding({ type: "fout", tekst: "Vul eerst het e-mailadres van de ontvanger in." }); return; }
    const onderwerp = vulIn(veiligeStr(afzender.mailOnderwerp), mergeVelden).trim()
      || veiligeStr(brief.onderwerp) || `Brief van ${veiligeStr(brief.afzenderNaam) || "Activaa"}`;
    const tekst = vulIn(veiligeStr(afzender.mailTekst), mergeVelden).trim() || vulIn(STANDAARD_MAIL_TEKST, mergeVelden);
    setMelding(null); setMailFout("");
    setMailModal({ naar, cc, onderwerp, tekst });
  }

  async function verstuurBriefMail() {
    const m = mailModal; if (!m) return;
    const naarTrim = String(m.naar || "").trim();
    if (!naarTrim) { setMailFout("Vul het e-mailadres van de ontvanger in."); return; }
    if (!String(m.onderwerp || "").trim() || !String(m.tekst || "").trim()) { setMailFout("Onderwerp en berichttekst mogen niet leeg zijn."); return; }
    setMailFout(""); setBezig("mail");
    try {
      const kenmerkNu = await zorgVoorKenmerk();
      const payload = {
        actie: "mail", brief: { ...brief, kenmerk: kenmerkNu }, bestandsnaamBasis, formaat: "pdf",
        naar: naarTrim,
        cc: String(m.cc || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        mailOnderwerp: m.onderwerp, mailTekst: m.tekst,
        accountId: klant && klant.accountId, klantnummer: klant && klant.klantnummer, klantnaam: veiligeStr(klant && klant.klantnaam),
        sjabloonnaam: veiligeStr(sjabloon && sjabloon.naam), geadType,
      };
      if (bijlage) payload.bijlage = { naam: bijlage.naam, dataUrl: bijlage.dataUrl };
      const res = await fetch("/api/brieven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Er ging iets mis (${res.status}).`);
      setMailModal(null);
      setMelding({ type: "ok", tekst: `Brief gemaild naar ${naarTrim}${bijlage ? " (met bijlage)" : ""}.` });
      laadVerzonden(klant && klant.accountId);
    } catch (e) { setMailFout(String(e.message || e)); }
    finally { if (levend.current) setBezig(""); }
  }

  const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: KLEUR.mutedTekst, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 5 };
  const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, outline: "none", color: KLEUR.tekst, background: "#fff" };
  const knop = (kleur, aan = true) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${aan ? kleur : KLEUR.rand}`, background: aan ? kleur : "#F2F3F0", color: aan ? "#fff" : KLEUR.mutedTekst, fontSize: 12.5, fontWeight: 600, cursor: aan ? "pointer" : "not-allowed" });
  const knopLicht = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: `1px solid ${KLEUR.rand}`, background: "#fff", color: KLEUR.blauw, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  if (config === null && klanten === null && !configFout && !klantFout) {
    return <div style={{ fontSize: 13, color: KLEUR.mutedTekst, padding: "20px 0" }}>Brieven laden…</div>;
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 40px" }}>
      <div style={{ fontSize: 13, color: KLEUR.subtekst, marginBottom: 16 }}>
        Kies een klant en een standaardbrief. Stel de geadresseerde in (de klant zelf, het gekoppelde
        belastingkantoor, of een handmatig adres) en vul eventuele invulvelden in. Het voorbeeld staat rechts.
      </div>

      {configFout && <Banner type="fout" tekst={configFout} />}
      {klantFout && <Banner type="fout" tekst={klantFout} />}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── Linkerkolom ── */}
        <div style={{ flex: "1 1 460px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Klant */}
          <div>
            <span style={label}>Klant</span>
            {klant ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{veiligeStr(klant.klantnaam)}</div>
                  <div style={{ fontSize: 11.5, color: KLEUR.subtekst }}>{veiligeStr(klant.klantnummer) && `nr ${veiligeStr(klant.klantnummer)}`}{veiligeStr(klant.groepsnaam) && `  ·  ${veiligeStr(klant.groepsnaam)}`}</div>
                </div>
                <button onClick={() => { setKlant(null); setZoek(""); setBk({ status: "idle" }); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, cliëntnummer of groep…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                {(zoek.trim() || (klanten || []).length > 0) && (
                  <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                    {gefilterd.length === 0 ? <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen klanten gevonden.</div> : gefilterd.map((k) => (
                      <button key={k.accountId} onClick={() => { setKlant(k); setMelding(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(k.klantnaam)}</span>
                        <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{veiligeStr(k.klantnummer) && `   nr ${veiligeStr(k.klantnummer)}`}{veiligeStr(k.groepsnaam) && `   ·   ${veiligeStr(k.groepsnaam)}`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sjabloon — zoekbaar keuzeveld (typen om te filteren i.p.v. alleen een dropdown) */}
          <div>
            <span style={label}>Standaardbrief</span>
            {sjabloon ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "9px 12px", background: KLEUR.lichtblauw }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: KLEUR.tekst, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{veiligeStr(sjabloon.naam)}</span>
                <button onClick={() => { setSjabloonId(""); setSjabloonZoek(""); }} style={{ ...knopLicht, padding: "6px 10px" }}><X size={14} /> Wijzig</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={KLEUR.mutedTekst} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={sjabloonZoek} onChange={(e) => setSjabloonZoek(e.target.value)} placeholder="Zoek een standaardbrief op naam of onderwerp…" style={{ ...input, padding: "8px 10px 8px 32px" }} />
                </div>
                <div style={{ marginTop: 6, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", background: "#fff" }}>
                  {gefilterdeSjablonen.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 12.5, color: KLEUR.mutedTekst }}>Geen brieven gevonden.</div>
                  ) : gefilterdeSjablonen.map((s) => (
                    <button key={s.id} onClick={() => { setSjabloonId(s.id); setSjabloonZoek(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${KLEUR.rand}`, background: "#fff", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: KLEUR.tekst }}>{veiligeStr(s.naam)}</span>
                      {veiligeStr(s.onderwerp) && <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>{"   ·   "}{veiligeStr(s.onderwerp)}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Geadresseerde */}
          <div>
            <span style={label}>Geadresseerde</span>
            <div style={{ display: "flex", gap: 6, background: "#F2F3F0", borderRadius: 9, padding: 4 }}>
              {[["klant", "Klant", User], ["belastingkantoor", "Belastingkantoor", Landmark], ["overig", "Overig", Building2]].map(([k, t, Icon]) => (
                <button key={k} onClick={() => setGeadType(k)} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 8px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: geadType === k ? "#fff" : "transparent", color: geadType === k ? KLEUR.blauw : KLEUR.subtekst, boxShadow: geadType === k ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                  <Icon size={14} /> {t}
                </button>
              ))}
            </div>
            {geadType === "belastingkantoor" && (
              <div style={{ marginTop: 8 }}>
                {!klant ? <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>Kies eerst een klant.</div>
                  : bk.status === "laden" ? <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: KLEUR.mutedTekst }}><Loader2 size={15} className="spin" /> Belastingkantoor ophalen…</div>
                  : bk.status === "ok" ? <div style={{ fontSize: 12.5, color: KLEUR.subtekst, border: `1px solid ${KLEUR.rand}`, borderRadius: 8, padding: "8px 10px", background: "#FBFBF9", whiteSpace: "pre-line" }}><strong style={{ color: KLEUR.tekst }}>{veiligeStr(bk.naam)}</strong>{"\n"}{veiligeStr(bk.adresTekst) || [samenAdres(bk.adres), postcodePlaats(bk.adres)].filter(Boolean).join("\n")}</div>
                  : bk.status === "niet" ? <Banner type="fout" tekst="Aan deze klant is nog geen belastingkantoor gekoppeld in Dynamics. Koppel het belastingkantoor (met adres) aan de klant en probeer opnieuw." />
                  : <Banner type="fout" tekst={`Belastingkantoor kon niet worden opgehaald: ${bk.fout || ""}`} />}
              </div>
            )}
            {geadType === "overig" && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <input value={overig.naam} onChange={(e) => setOverig({ ...overig, naam: e.target.value })} placeholder="Naam / organisatie" style={{ ...input, flex: "1 1 100%" }} />
                <input value={overig.straat} onChange={(e) => setOverig({ ...overig, straat: e.target.value })} placeholder="Straat" style={{ ...input, flex: "2 1 160px" }} />
                <input value={overig.huisnummer} onChange={(e) => setOverig({ ...overig, huisnummer: e.target.value })} placeholder="Nr" style={{ ...input, flex: "0 1 80px" }} />
                <input value={overig.postcode} onChange={(e) => setOverig({ ...overig, postcode: e.target.value })} placeholder="Postcode" style={{ ...input, flex: "1 1 110px" }} />
                <input value={overig.plaats} onChange={(e) => setOverig({ ...overig, plaats: e.target.value })} placeholder="Plaats" style={{ ...input, flex: "1 1 140px" }} />
              </div>
            )}
          </div>

          {/* Invulvelden */}
          {actieveVelddefs.length > 0 && (
            <div>
              <span style={label}>Invulvelden</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {actieveVelddefs.map((v) => (
                  <div key={v.sleutel} style={{ flex: "1 1 180px", minWidth: 150 }}>
                    <div style={{ fontSize: 11.5, color: KLEUR.subtekst, marginBottom: 4 }}>{v.label}</div>
                    {v.type === "keuze" ? (
                      <select value={veldWaarden[v.sleutel] || ""} onChange={(e) => setVeldWaarden((w) => ({ ...w, [v.sleutel]: e.target.value }))} style={input}>
                        <option value="">—</option>
                        {(v.opties || []).map((o) => <option key={o.sleutel || o.label} value={o.label}>{o.label}</option>)}
                      </select>
                    ) : v.type === "paragraaf" ? (
                      <select value={veldWaarden[v.sleutel] || ""} onChange={(e) => setVeldWaarden((w) => ({ ...w, [v.sleutel]: e.target.value }))} style={input}>
                        <option value="">— kies een alinea —</option>
                        {(v.opties || []).map((o) => <option key={o.sleutel || o.label} value={o.tekst || ""}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={veldWaarden[v.sleutel] || ""} onChange={(e) => setVeldWaarden((w) => ({ ...w, [v.sleutel]: e.target.value }))} style={input} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kopgegevens (huisstijl-layout) */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}><span style={label}>Kenmerk</span><input value={kenmerk} readOnly style={{ ...input, background: "#F7F8F6", color: KLEUR.subtekst }} placeholder="(automatisch bij versturen)" title="Wordt automatisch toegekend zodra je de brief downloadt, opslaat of verstuurt (jaar-klantnummer-volgnummer)." /></div>
            <div style={{ flex: "1 1 180px" }}><span style={label}>Behandeld door</span><input value={behandeldDoor} onChange={(e) => setBehandeldDoor(e.target.value)} style={input} placeholder="naam behandelaar" /></div>
            <div style={{ flex: "1 1 150px" }}><span style={label}>Telefoonnummer</span><input value={telefoonnummer} onChange={(e) => setTelefoonnummer(e.target.value)} style={input} /></div>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, color: KLEUR.subtekst, fontWeight: 600 }}>
              <input type="checkbox" checked={vertrouwelijk} onChange={(e) => setVertrouwelijk(e.target.checked)} /> VERTROUWELIJK tonen
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, color: KLEUR.subtekst, fontWeight: 600 }}>
              <input type="checkbox" checked={autoGegenereerd} onChange={(e) => setAutoGegenereerd(e.target.checked)} /> Regel “automatisch gegenereerd”
            </label>
          </div>

          {/* Bewerkbare velden */}
          <div><span style={label}>Onderwerp</span><input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} style={input} placeholder="Betreft…" /></div>
          <div><span style={label}>Aanhef</span><input value={aanhef} onChange={(e) => setAanhef(e.target.value)} style={input} /></div>
          <div><span style={label}>Tekst</span><textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={11} style={{ ...input, resize: "vertical", minHeight: 200, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Inhoud van de brief… ({{velden}} worden live ingevuld)" /></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}><span style={label}>Afsluiting</span><input value={afsluiting} onChange={(e) => setAfsluiting(e.target.value)} style={input} /></div>
            <div style={{ flex: "1 1 200px" }}><span style={label}>Ondertekenaar</span><input value={ondertekenaar} onChange={(e) => setOndertekenaar(e.target.value)} style={input} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}><span style={label}>E-mail ontvanger</span><input value={naar} onChange={(e) => setNaar(e.target.value)} style={input} placeholder={geadType === "overig" ? "waarheen mailen? (verplicht bij Overig)" : "naam@bedrijf.nl"} /></div>
            <div style={{ flex: "1 1 180px" }}><span style={label}>CC (optioneel)</span><input value={cc} onChange={(e) => setCc(e.target.value)} style={input} placeholder="cc@… (komma-gescheiden)" /></div>
          </div>
          {geadType === "overig" && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Brief naar “Overig”: vul hierboven het e-mailadres in waar de brief naartoe gemaild moet worden. De klant-contactpersoon staat automatisch in CC.</div>}

          {/* Bijlage — dropvenster (zelfde opzet als het IB-dossier: slepen of klikken) */}
          <div>
            <span style={label}>Bijlage (optioneel)</span>
            <div
              onDragOver={(e) => { e.preventDefault(); setSleepBijlage(true); }}
              onDragLeave={() => setSleepBijlage(false)}
              onDrop={(e) => { e.preventDefault(); setSleepBijlage(false); kiesBijlage(e.dataTransfer.files && e.dataTransfer.files[0]); }}
              onClick={() => bijlageInputRef.current && bijlageInputRef.current.click()}
              style={{
                border: `1.5px dashed ${sleepBijlage ? KLEUR.blauw : KLEUR.rand}`, borderRadius: 10,
                padding: bijlage ? "12px 14px" : "20px 14px", textAlign: "center", cursor: "pointer",
                background: sleepBijlage ? KLEUR.lichtblauw : "#FAFBF9",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}
            >
              {bijlage ? (
                <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Paperclip size={15} color={KLEUR.subtekst} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bijlage.naam}</span>
                    <span style={{ fontSize: 11.5, color: KLEUR.mutedTekst, whiteSpace: "nowrap", flexShrink: 0 }}>{(bijlage.grootte / 1048576).toFixed(1)} MB</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setBijlage(null); }} style={{ ...knopLicht, padding: "6px 10px", flexShrink: 0 }}><X size={14} /> Verwijder</button>
                </div>
              ) : (
                <>
                  <Upload size={18} color={KLEUR.mutedTekst} />
                  <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst }}>Sleep hier een bestand naartoe, of klik om te kiezen</div>
                </>
              )}
              <input ref={bijlageInputRef} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; kiesBijlage(f); }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: KLEUR.mutedTekst }}>Gaat mee als bijlage bij het mailen en wordt met “In klantdossier” ook in de SharePoint-map opgeslagen. Grote bestanden (boven ± 3 MB) passen soms niet in een e-mail, maar worden wél in het dossier bewaard.</div>
          </div>

          {/* Acties */}
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={knop(KLEUR.blauw, klaarVoorActie)} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("genereer", "pdf")}>{bezig === "genereerpdf" ? <Loader2 size={15} className="spin" /> : <Download size={15} />} PDF downloaden</button>
              <button style={{ ...knopLicht, opacity: klaarVoorActie ? 1 : 0.5, cursor: klaarVoorActie ? "pointer" : "not-allowed" }} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("genereer", "docx")}>{bezig === "genereerdocx" ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} Word downloaden</button>
              <button style={{ ...knopLicht, opacity: klaarVoorActie ? 1 : 0.5, cursor: klaarVoorActie ? "pointer" : "not-allowed" }} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("dossier")}>{bezig === "dossier" ? <Loader2 size={15} className="spin" /> : <FolderInput size={15} />} In klantdossier</button>
              <button style={{ ...knopLicht, opacity: klaarVoorActie ? 1 : 0.5, cursor: klaarVoorActie ? "pointer" : "not-allowed" }} disabled={!klaarVoorActie || !!bezig} onClick={() => doeActie("backoffice")} title="Zet de brief in het klantdossier en maak een taak voor de backoffice om te printen en versturen">{bezig === "backoffice" ? <Loader2 size={15} className="spin" /> : <Printer size={15} />} Naar backoffice</button>
              <button style={knop(KLEUR.groen, klaarVoorActie && !!naar.trim())} disabled={!klaarVoorActie || !naar.trim() || !!bezig} onClick={openMailModal}>{bezig === "mail" ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Mailen naar klant</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: KLEUR.mutedTekst, display: "flex", alignItems: "center", gap: 8 }}>
              <span>Opslaan in dossier als:</span>
              {["pdf", "docx"].map((f) => (
                <label key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: formaat === f ? KLEUR.blauw : KLEUR.subtekst, fontWeight: formaat === f ? 700 : 500 }}>
                  <input type="radio" name="dossierformaat" checked={formaat === f} onChange={() => setFormaat(f)} /> {f === "pdf" ? "PDF" : "Word"}
                </label>
              ))}
            </div>
            {melding && <div style={{ marginTop: 12 }}><Banner type={melding.type} tekst={melding.tekst} /></div>}
          </div>

          {/* Verzonden brieven van deze klant (brievenlogboek) */}
          {klant && (
            <div style={{ borderTop: `1px solid ${KLEUR.rand}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ ...label, marginBottom: 0 }}>Verzonden brieven — {veiligeStr(klant.klantnaam)}{verzonden.length ? ` (${verzonden.length})` : ""}</span>
                <button onClick={() => laadVerzonden(klant.accountId)} style={{ ...knopLicht, padding: "5px 9px" }} title="Vernieuwen">{verzondenBezig ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}</button>
              </div>
              {verzonden.length === 0 ? (
                <div style={{ fontSize: 12.5, color: KLEUR.mutedTekst }}>{verzondenBezig ? "Laden…" : "Nog geen verstuurde brieven voor deze klant."}</div>
              ) : (
                <div style={{ border: `1px solid ${KLEUR.rand}`, borderRadius: 8, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                  {verzonden.map((v) => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${KLEUR.rand}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: KLEUR.tekst, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {veiligeStr(v.kenmerk) && <span style={{ color: KLEUR.blauw }}>{v.kenmerk} </span>}{veiligeStr(v.betreft) || veiligeStr(v.sjabloonnaam) || "(brief)"}
                        </div>
                        <div style={{ fontSize: 11, color: KLEUR.mutedTekst }}>
                          {briefDatum(v.verzondenOp)}
                          {veiligeStr(v.ontvangerNaam) ? `  ·  ${veiligeStr(v.ontvangerNaam)}` : ""}
                          {ACTIE_LABEL[v.actie] ? `  ·  ${ACTIE_LABEL[v.actie]}` : ""}
                        </div>
                      </div>
                      {veiligeStr(v.pdfUrl) ? (
                        <a href={v.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...knopLicht, padding: "6px 10px", textDecoration: "none", flexShrink: 0 }}><FileText size={13} /> Bekijk</a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Rechterkolom: voorbeeld ── */}
        <div style={{ flex: "1 1 520px", minWidth: 360, position: "sticky", top: 12 }}>
          <span style={{ ...label, marginBottom: 8 }}>Voorbeeld</span>
          {afzender.briefpapierDocx && (
            <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 8 }}>
              De <strong>Word</strong>-download gebruikt jullie eigen Word-briefpapier (huisstijl kan afwijken van dit voorbeeld).
            </div>
          )}
          <BriefVoorbeeld brief={brief} />
        </div>
      </div>

      {mailModal && (
        <div onClick={() => bezig !== "mail" && setMailModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>E-mail versturen</div>
            <div style={{ fontSize: 12.5, color: KLEUR.subtekst, marginBottom: 16 }}>
              De brief gaat als PDF-bijlage mee. Controleer of pas de begeleidende e-mail hieronder aan vóór het versturen.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: "1 1 240px" }}><span style={label}>E-mail ontvanger</span>
                <input value={mailModal.naar} onChange={(e) => setMailModal((h) => ({ ...h, naar: e.target.value }))} style={input} placeholder="naam@bedrijf.nl" /></div>
              <div style={{ flex: "1 1 200px" }}><span style={label}>CC (optioneel)</span>
                <input value={mailModal.cc} onChange={(e) => setMailModal((h) => ({ ...h, cc: e.target.value }))} style={input} placeholder="cc@… (komma-gescheiden)" /></div>
            </div>
            <div style={{ marginBottom: 12 }}><span style={label}>Onderwerp</span>
              <input value={mailModal.onderwerp} onChange={(e) => setMailModal((h) => ({ ...h, onderwerp: e.target.value }))} style={input} /></div>
            <div style={{ marginBottom: 14 }}><span style={label}>Berichttekst</span>
              <textarea value={mailModal.tekst} onChange={(e) => setMailModal((h) => ({ ...h, tekst: e.target.value }))} rows={9} style={{ ...input, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} /></div>
            {bijlage && <div style={{ fontSize: 11.5, color: KLEUR.mutedTekst, marginBottom: 10 }}>Bijlage meegestuurd: {bijlage.naam}</div>}
            {mailFout && <div style={{ marginBottom: 10 }}><Banner type="fout" tekst={mailFout} /></div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setMailModal(null)} disabled={bezig === "mail"} style={{ ...knopLicht, opacity: bezig === "mail" ? 0.6 : 1 }}>Annuleren</button>
              <button onClick={verstuurBriefMail}
                disabled={bezig === "mail" || !mailModal.naar.trim() || !mailModal.onderwerp.trim() || !mailModal.tekst.trim()}
                style={knop(KLEUR.groen, bezig !== "mail" && !!mailModal.naar.trim() && !!mailModal.onderwerp.trim() && !!mailModal.tekst.trim())}>
                {bezig === "mail" ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} {bezig === "mail" ? "Versturen…" : "Versturen"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes briefspin{to{transform:rotate(360deg)}} .spin{animation:briefspin 1s linear infinite}`}</style>
    </div>
  );
}

function Banner({ type, tekst }) {
  const ok = type === "ok";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, background: ok ? "#EAF6EE" : "#FBECEC", color: ok ? KLEUR.groen : KLEUR.rood, border: `1px solid ${ok ? "#BFE3CB" : "#F0C9C9"}` }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} <span>{tekst}</span>
    </div>
  );
}

/** Live weergave van de brief in huisstijl-layout. Met een achtergrond (briefpapier) wordt die als
 *  A4-achtergrond getoond; het eigen logo/afzenderkop valt dan weg (zit al in het briefpapier) en
 *  onderaan komt de driekoloms voettekst over de footer-vorm van het briefpapier. */
function BriefVoorbeeld({ brief }) {
  const b = brief || {};
  const alineas = String(b.tekst || "").replace(/\r\n/g, "\n").split(/\n[ \t]*\n/);
  const heeftAcht = !!b.achtergrondUrl;
  const paginaStijl = {
    background: KLEUR.papier, border: `1px solid ${KLEUR.rand}`, borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
    color: KLEUR.tekst, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12.5, lineHeight: 1.5,
    aspectRatio: "1 / 1.414", position: "relative", overflow: "hidden",
    ...(heeftAcht
      ? { backgroundImage: `url("${b.achtergrondUrl}")`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", padding: "15% 12% 9%" }
      : { padding: "48px 52px" }),
  };
  const vetLabel = (labelTekst, waarde) => (
    <div style={{ marginBottom: 2 }}><span style={{ fontWeight: 700 }}>{labelTekst}:</span> {waarde}</div>
  );
  return (
    <div style={paginaStijl}>
      {heeftAcht ? (
        b.afzenderMiniRegel ? <div style={{ textAlign: "center", color: KLEUR.mutedTekst, fontSize: 10, marginTop: 24, marginBottom: 18 }}>{b.afzenderMiniRegel}</div> : null
      ) : (
        <>
          {b.logoUrl ? (
            <div style={{ textAlign: b.logoUitlijning === "midden" ? "center" : b.logoUitlijning === "rechts" ? "right" : "left", marginBottom: 6 }}>
              <img src={b.logoUrl} alt="logo" style={{ width: ({ klein: 120, normaal: 170, groot: 230 })[b.logoGrootte] || 170, maxWidth: "100%", height: "auto", display: "inline-block" }} />
            </div>
          ) : (
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.01em" }}>{b.afzenderNaam}</div>
          )}
          <div style={{ marginTop: 4, color: KLEUR.mutedTekst, fontSize: 11.5, lineHeight: 1.45 }}>{(b.afzenderRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
          <div style={{ borderTop: `1px solid ${KLEUR.rand}`, margin: "16px 0 20px" }} />
        </>
      )}

      {b.vertrouwelijk && <div style={{ fontWeight: 700, marginBottom: 6 }}>VERTROUWELIJK</div>}
      <div style={{ marginBottom: 16 }}>{(b.ontvangerRegels || []).map((r, i) => <div key={i}>{r}</div>)}</div>
      <div style={{ textAlign: heeftAcht ? "left" : "right", color: KLEUR.subtekst, marginBottom: 12 }}>{b.plaatsDatum}</div>
      {b.kenmerk && vetLabel("Kenmerk", b.kenmerk)}
      {b.beconnummer && vetLabel("Beconnummer", b.beconnummer)}
      {b.onderwerp && vetLabel("Betreft", b.onderwerp)}
      {(b.behandeldDoor || b.telefoonnummer) && <div style={{ height: 12 }} />}
      {b.behandeldDoor && vetLabel("Behandeld door", b.behandeldDoor)}
      {b.telefoonnummer && vetLabel("Telefoonnummer", b.telefoonnummer)}
      {(b.behandeldDoor || b.telefoonnummer) && <div style={{ height: 18 }} />}
      <div style={{ height: 12 }} />
      {b.aanhef && <div style={{ marginBottom: 12 }}>{b.aanhef}</div>}
      {alineas.map((a, i) => <div key={i} style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{a}</div>)}
      {b.afsluiting && <div style={{ marginTop: 14 }}>{b.afsluiting}</div>}
      {b.ondertekeningBedrijf && <div>{b.ondertekeningBedrijf}</div>}
      <div style={{ height: 38 }} />
      {b.ondertekenaar && <div>{b.ondertekenaar}</div>}
      {b.bijlageNaam && <div style={{ marginTop: 10 }}>Bijlage: {b.bijlageNaam}</div>}
      {b.automatischGegenereerd && <div style={{ marginTop: 10, fontSize: 10, color: KLEUR.mutedTekst }}>Deze brief is automatisch gegenereerd en daarom niet ondertekend</div>}

      {/* De driekoloms voettekst zit al ín het geüploade briefpapier/achtergrond; zonder achtergrond
          tonen we de eigen voetnoot. */}
      {!heeftAcht && b.voetnoot ? <div style={{ marginTop: 40, paddingTop: 12, borderTop: `1px solid ${KLEUR.rand}`, textAlign: "center", color: KLEUR.mutedTekst, fontSize: 10.5 }}>{b.voetnoot}</div> : null}
    </div>
  );
}
