/**
 * Formulieren onder Brieven: blanco PDF-formulieren die je zelf toevoegt (Belastingdienst, KvK, wat
 * dan ook) en in het portaal invult.
 *
 * Anders dan het KvK-formulier 17a — waarvan de vragenlijst met de hand in code staat — wordt hier
 * niets geprogrammeerd. Een invulbaar PDF-formulier draagt zijn eigen structuur mee: veldnamen,
 * veldsoorten, de tooltip die de uitgever erbij zette, en bij aankruisvakken de mogelijke waarden.
 * Die lezen we uit bij het uploaden. Wat jij er in Beheer aan toevoegt is de bovenlaag: een leesbaar
 * label, of een veld überhaupt gevraagd moet worden, en waar de waarde vandaan mag komen.
 *
 * Opslag:
 *   - de PDF zelf   → blob "formulier-<id>.pdf" in de container portaalmedia
 *   - de definitie  → formulieren.json in de container portaalcontent
 *
 * BELANGRIJK: niet elk PDF-formulier is invulbaar. Formulieren die met Adobe LiveCycle zijn gemaakt
 * (XFA) en platte, gescande PDF's hebben geen velden om te vullen. Dat herkennen we bij het uploaden
 * en zeggen we meteen — beter een duidelijke melding dan een formulier dat leeg uit de printer komt.
 */
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument, PDFName } = require("pdf-lib");

// Vlaggen zoals de PDF-standaard ze kent. We gebruiken er drie:
//   Ff bit 1  — alleen-lezen: een hulpveld van de uitgever, geen vraag voor ons
//   F  bit 2  — verborgen: staat pas in beeld als de JavaScript van het formulier hem toont
//   F  bit 3  — afdrukken
const ALLEEN_LEZEN = 1;
const VERBORGEN = 2;
const AFDRUKKEN = 4;

const CONTENT_CONTAINER = "portaalcontent";
const MEDIA_CONTAINER = "portaalmedia";
const BLOB_NAAM = "formulieren.json";
const clients = {};

async function haalContainer(naam) {
  if (clients[naam]) return clients[naam];
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");
  const client = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(naam);
  await client.createIfNotExists();
  clients[naam] = client;
  return client;
}

async function streamNaarBuffer(stream) {
  const stukken = [];
  for await (const stuk of stream) stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  return Buffer.concat(stukken);
}

/** Alle formulierdefinities (zonder de PDF's zelf). */
async function haalFormulieren() {
  try {
    const container = await haalContainer(CONTENT_CONTAINER);
    const blob = container.getBlockBlobClient(BLOB_NAAM);
    if (!(await blob.exists())) return [];
    const tekst = (await streamNaarBuffer((await blob.download()).readableStreamBody)).toString("utf-8");
    const lijst = JSON.parse(tekst);
    return Array.isArray(lijst) ? lijst : [];
  } catch {
    return [];
  }
}

async function schrijfFormulieren(lijst) {
  const container = await haalContainer(CONTENT_CONTAINER);
  const blob = container.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(lijst, null, 2), "utf-8");
  await blob.upload(buffer, buffer.length, { overwrite: true });
}

async function haalFormulier(id) {
  const lijst = await haalFormulieren();
  return lijst.find((f) => String(f.id) === String(id)) || null;
}

/** De blanco PDF van een formulier. */
async function haalFormulierPdf(id) {
  const container = await haalContainer(MEDIA_CONTAINER);
  const blob = container.getBlockBlobClient(`formulier-${id}.pdf`);
  if (!(await blob.exists())) throw new Error("Het blanco formulier is niet gevonden in de opslag.");
  return streamNaarBuffer((await blob.download()).readableStreamBody);
}

async function bewaarFormulierPdf(id, buffer) {
  const container = await haalContainer(MEDIA_CONTAINER);
  const blob = container.getBlockBlobClient(`formulier-${id}.pdf`);
  await blob.upload(buffer, buffer.length, { overwrite: true, blobHTTPHeaders: { blobContentType: "application/pdf" } });
}

/**
 * Leest de invulbare velden uit een PDF. Per veld:
 *   naam    — de technische veldnaam in de PDF (daar vullen we straks op)
 *   soort   — "tekst" | "keuze" | "vink" | "keuzelijst"
 *   tip     — de tooltip van de uitgever, als die er is ("vul postadres in")
 *   pagina  — waar het veld staat, zodat het scherm de vragen op volgorde kan tonen
 *   opties  — bij een aankruisveld: de hokjes, in de volgorde waarin ze op papier staan
 *
 * Een aankruisveld met meerdere hokjes (ja/nee, man/vrouw/anders) behandelen we als "keuze"; één
 * hokje is een gewoon vinkje. We kiezen straks op INDEX en niet op naam, omdat de namen van hokjes
 * in de praktijk escapes en verminkte tekens bevatten.
 */
async function leesVelden(pdfBuffer) {
  const doc = await PDFDocument.load(pdfBuffer);

  // XFA: een LiveCycle-formulier. Wat pdf-lib daar ziet is hooguit een schil; de echte velden zitten
  // in een XML-laag die we niet kunnen vullen. Beter meteen melden dan een leeg vel afdrukken.
  let heeftXfa = false;
  try {
    const acroRef = doc.catalog.get(PDFName.of("AcroForm"));
    const acro = acroRef ? doc.context.lookup(acroRef) : null;
    heeftXfa = !!(acro && typeof acro.get === "function" && acro.get(PDFName.of("XFA")));
  } catch {
    /* geen AcroForm of een vorm die we niet herkennen: dan is XFA hier niet aan de orde */
  }

  const form = doc.getForm();
  // Welk veld op welke pagina staat. We lopen de annotaties van elke pagina langs en zoeken de
  // bijbehorende dict op; daarop kunnen we straks de widgets van een veld terugvinden. Zo kan het
  // invulscherm de vragen in de volgorde van het papier tonen in plaats van door elkaar.
  const paginaVan = new Map();
  doc.getPages().forEach((pagina, i) => {
    const annots = pagina.node.Annots();
    if (!annots) return;
    for (let j = 0; j < annots.size(); j++) {
      const ref = annots.get(j);
      const dict = doc.context.lookup(ref);
      if (dict) paginaVan.set(dict, i + 1);
    }
  });

  const velden = [];
  for (const veld of form.getFields()) {
    const naam = veld.getName();
    const type = veld.constructor.name;
    const woordenboek = veld.acroField.dict;
    const tip = woordenboek.get(PDFName.of("TU"));
    const widgets = veld.acroField.getWidgets();
    let pagina = 0;
    for (const w of widgets) {
      const nr = paginaVan.get(w.dict);
      if (nr) { pagina = nr; break; }
    }

    // Alleen-lezen velden vult het formulier zelf in met zijn eigen JavaScript: het bsn dat op
    // pagina 2 wordt herhaald, of een hulpveld over de IBAN-regel. Daar stellen we geen vraag over —
    // maar dat script draait bij ons niet, dus we houden ze wel in de lijst. In Beheer kun je zo'n
    // veld laten overnemen van een vraag die je al stelt, anders blijft dat vakje op papier leeg.
    const automatisch = (vlag(veld.acroField, "Ff") & ALLEEN_LEZEN) !== 0;

    const basis = {
      naam,
      tip: tip && tip.decodeText ? tip.decodeText() : (tip ? String(tip).replace(/^\(|\)$/g, "") : ""),
      pagina: pagina || 0,
      ...(automatisch ? { automatisch: true } : {}),
    };

    if (type === "PDFCheckBox") {
      const opties = widgets.map((w) => {
        const aan = typeof w.getOnValue === "function" ? w.getOnValue() : null;
        return aan ? leesbaarHokje(aan.asString()) : "";
      });
      velden.push({ ...basis, soort: opties.length > 1 ? "keuze" : "vink", opties: opties.filter(() => true) });
      continue;
    }
    if (type === "PDFRadioGroup") {
      velden.push({ ...basis, soort: "keuze", opties: (veld.getOptions() || []).map(leesbaarHokje) });
      continue;
    }
    if (type === "PDFDropdown" || type === "PDFOptionList") {
      velden.push({ ...basis, soort: "keuzelijst", opties: veld.getOptions() || [] });
      continue;
    }
    if (type === "PDFTextField") {
      let lang = false;
      let max = 0;
      let hokjes = false;
      try { lang = !!veld.isMultiline(); } catch { /* niet elk veld meldt dit */ }
      try { max = veld.getMaxLength() || 0; } catch { /* geen maximum ingesteld */ }
      try { hokjes = !!veld.isCombed(); } catch { /* geen losse hokjes */ }
      velden.push({ ...basis, soort: lang ? "memo" : "tekst", max, hokjes });
      continue;
    }
    // Handtekeningvelden en onbekende soorten slaan we over: die kunnen we niet digitaal vullen.
  }

  return { velden: groepeerDatums(velden), heeftXfa, aantalPaginas: doc.getPageCount() };
}

/** Een vlag (/Ff of /F) als getal, ook als hij niet gezet is. */
function vlag(acroField, sleutel) {
  try {
    const waarde = acroField.dict.get(PDFName.of(sleutel));
    return waarde && typeof waarde.asNumber === "function" ? waarde.asNumber() : 0;
  } catch {
    return 0;
  }
}

/**
 * Formulieren van de Belastingdienst zetten elke datum in drie losse hokjesvelden:
 * "5.1.date01.d_F", "5.1.date01.m_F" en "5.1.date01.y_F". Als vraag is dat onwerkbaar — op het
 * ondernemersformulier zouden dat er negen zijn voor drie handtekeningen. We voegen zo'n drietal
 * samen tot één datumvraag; bij het invullen wordt hij weer over de drie hokjes verdeeld.
 *
 * Alleen samenvoegen als dag, maand én jaar er alle drie zijn. Ontbreekt er een, dan laten we de
 * velden staan zoals ze zijn: liever drie kale vragen dan een datum die half op papier komt.
 */
function groepeerDatums(velden) {
  const patroon = /^(.*date\d*)\.(d|m|y|j)(_F)?$/i;
  const groepen = new Map();
  velden.forEach((veld, i) => {
    const treffer = veld.soort === "tekst" && !veld.automatisch && patroon.exec(veld.naam);
    if (!treffer) return;
    const sleutel = treffer[1];
    const deel = treffer[2].toLowerCase() === "j" ? "y" : treffer[2].toLowerCase();
    if (!groepen.has(sleutel)) groepen.set(sleutel, { eerste: i, delen: {} });
    groepen.get(sleutel).delen[deel] = veld;
  });

  const vervangen = new Map();
  const teVerwijderen = new Set();
  for (const [sleutel, groep] of groepen) {
    const { d, m, y } = groep.delen;
    if (!d || !m || !y) continue;
    [d, m, y].forEach((v) => teVerwijderen.add(v.naam));
    vervangen.set(d.naam, {
      naam: sleutel,
      soort: "datum",
      // De tooltip van het dagveld beschrijft de hele vraag ("Datum ondertekening vennoot 1.
      // Dag, 2 cijfers."); de staart over het aantal cijfers is nu niet meer van belang.
      tip: String(d.tip || "").replace(/\s*Dag,\s*2\s*cijfers\.?\s*$/i, "").trim(),
      pagina: d.pagina || m.pagina || y.pagina || 0,
      delen: { dag: d.naam, maand: m.naam, jaar: y.naam },
    });
  }

  if (!vervangen.size) return velden;
  const uitkomst = [];
  for (const veld of velden) {
    if (vervangen.has(veld.naam)) { uitkomst.push(vervangen.get(veld.naam)); continue; }
    if (teVerwijderen.has(veld.naam)) continue;
    uitkomst.push(veld);
  }
  return uitkomst;
}

/**
 * De naam van een hokje leesbaar maken. In de PDF staat daar bijvoorbeeld
 * "/be#91indiging#20van#20de#20onderneming" — escapes en soms verminkte letters. We maken er iets
 * van dat je kunt lezen; is er niets van te maken, dan geeft het scherm gewoon "Optie 1, 2, 3".
 */
function leesbaarHokje(ruw) {
  const zonderSlash = String(ruw == null ? "" : ruw).replace(/^\//, "");
  const gedecodeerd = zonderSlash.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => {
    const code = parseInt(hex, 16);
    // Alleen normale tekens terugzetten; rare bytes worden een spatie in plaats van een blokje.
    return code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
  });
  return gedecodeerd.replace(/\s+/g, " ").trim();
}

/**
 * Instellingen voor het ZBS-voorblad (zonder begeleidend schrijven) bij dit formulier.
 *   aan       — standaard meesturen
 *   adres     — "belastingkantoor" (van de cliënt) | "klant" | "vast"
 *   vastAdres — het adresblok als vaste tekst, één regel per regel; alleen bij adres: "vast"
 *   regel     — de ene zin onder het adres, bijvoorbeeld "Ter afwikkeling"
 */
function standaardZbs() {
  return { aan: false, adres: "belastingkantoor", vastAdres: "", regel: "Ter afwikkeling" };
}

function normaliseerZbs(z) {
  const bron = z && typeof z === "object" ? z : {};
  const adres = ["belastingkantoor", "klant", "vast"].includes(bron.adres) ? bron.adres : "belastingkantoor";
  return {
    aan: bron.aan === true,
    adres,
    vastAdres: String(bron.vastAdres || "").slice(0, 500),
    regel: String(bron.regel === undefined ? "Ter afwikkeling" : bron.regel).slice(0, 200),
  };
}

/** Nieuw formulier opslaan (PDF + definitie). Geeft de definitie terug. */
async function voegFormulierToe({ id, naam, omschrijving, pdfBuffer, velden, aantalPaginas }) {
  await bewaarFormulierPdf(id, pdfBuffer);
  const lijst = await haalFormulieren();
  const nieuw = {
    id,
    naam: String(naam || "").trim() || "Naamloos formulier",
    omschrijving: String(omschrijving || "").trim(),
    aantalPaginas: aantalPaginas || 0,
    // De uitgelezen velden zoals ze in de PDF staan. Blijft staan zoals het is; wat de beheerder
    // erover instelt komt in `instellingen` te staan, zodat opnieuw uploaden die keuzes niet wist.
    velden: Array.isArray(velden) ? velden : [],
    instellingen: {},
    // ZBS-voorblad: zie _gedeeld/zbsVoorblad.js. Standaard uit; je zet het per formulier aan.
    zbs: standaardZbs(),
    // Submap in de SharePoint-map van de cliënt; leeg = de map uit de algemene instellingen.
    map: "",
    toegevoegdOp: new Date().toISOString(),
  };
  const zonderOude = lijst.filter((f) => String(f.id) !== String(id));
  // Bij opnieuw uploaden van hetzelfde formulier de bestaande instellingen meenemen.
  const oud = lijst.find((f) => String(f.id) === String(id));
  if (oud && oud.instellingen) nieuw.instellingen = oud.instellingen;
  if (oud && oud.zbs) nieuw.zbs = normaliseerZbs(oud.zbs);
  if (oud && oud.map) nieuw.map = oud.map;
  await schrijfFormulieren([...zonderOude, nieuw]);
  return nieuw;
}

/** Naam, omschrijving of veldinstellingen van een formulier bijwerken. */
async function werkFormulierBij(id, wijziging) {
  const lijst = await haalFormulieren();
  const index = lijst.findIndex((f) => String(f.id) === String(id));
  if (index === -1) return null;
  const huidig = lijst[index];
  lijst[index] = {
    ...huidig,
    naam: wijziging.naam !== undefined ? String(wijziging.naam || "").trim() || huidig.naam : huidig.naam,
    omschrijving: wijziging.omschrijving !== undefined ? String(wijziging.omschrijving || "") : huidig.omschrijving,
    instellingen: wijziging.instellingen && typeof wijziging.instellingen === "object" ? wijziging.instellingen : huidig.instellingen,
    zbs: wijziging.zbs !== undefined ? normaliseerZbs(wijziging.zbs) : normaliseerZbs(huidig.zbs),
    map: wijziging.map !== undefined ? String(wijziging.map || "").trim().slice(0, 200) : (huidig.map || ""),
  };
  await schrijfFormulieren(lijst);
  return lijst[index];
}

/** Formulier verwijderen — definitie én de blanco PDF. */
async function verwijderFormulier(id) {
  const lijst = await haalFormulieren();
  if (!lijst.some((f) => String(f.id) === String(id))) return false;
  await schrijfFormulieren(lijst.filter((f) => String(f.id) !== String(id)));
  try {
    const container = await haalContainer(MEDIA_CONTAINER);
    await container.getBlockBlobClient(`formulier-${id}.pdf`).deleteIfExists();
  } catch {
    // De definitie is weg; een achtergebleven blob is vervelend maar niet erg.
  }
  return true;
}

module.exports = {
  haalFormulieren,
  haalFormulier,
  haalFormulierPdf,
  voegFormulierToe,
  werkFormulierBij,
  verwijderFormulier,
  leesVelden,
  leesbaarHokje,
  groepeerDatums,
  standaardZbs,
  normaliseerZbs,
  ALLEEN_LEZEN,
  VERBORGEN,
  AFDRUKKEN,
};
