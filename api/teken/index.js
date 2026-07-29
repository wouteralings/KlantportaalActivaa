const { BlobServiceClient } = require("@azure/storage-blob");
const { verwerkOndertekeningNaSignering, genereerOffertePdf, genereerOpdrachtbevestigingPdf } = require("../_gedeeld/offertesOnboarding");
const { magDoor } = require("../_gedeeld/offertesRatelimit");
const { haalInstellingWaarde } = require("../_gedeeld/offertesInstellingenOpslag");

// Deze publieke, anoniem toegankelijke tekenpagina bedient zowel offertes als
// opdrachtbevestigingen via dezelfde /tekenen/{id}-link — welke van de twee
// containers het record bevat, bepaalt (samen met het opgeslagen "soort"-veld in
// het record zelf) hoe er verder wordt afgehandeld (PDF-opmaak, webhook-sleutel,
// taak-instellingen). Zo hoeft er geen aparte publieke route/config bij te komen.
const CONTAINERS = { offerte: "offertes", opdrachtbevestiging: "opdrachtbevestigingen" };

const cachedContainerClients = {};

async function haalContainerClient(soort) {
  if (cachedContainerClients[soort]) return cachedContainerClients[soort];
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINERS[soort]);
  await containerClient.createIfNotExists();
  cachedContainerClients[soort] = containerClient;
  return containerClient;
}

// Zoekt het blob-record op in beide containers (eerst offertes, dan
// opdrachtbevestigingen) — de ID zelf is een willekeurige UUID, dus een botsing
// tussen beide containers is verwaarloosbaar. Geeft { containerClient, blobClient,
// soort } terug van de container waar het gevonden is, of null als het nergens
// bestaat.
async function vindBlobClient(id) {
  for (const soort of Object.keys(CONTAINERS)) {
    const containerClient = await haalContainerClient(soort);
    const blobClient = containerClient.getBlockBlobClient(veiligeBlobNaam(id));
    if (await blobClient.exists()) {
      return { containerClient, blobClient, soort };
    }
  }
  return null;
}

async function streamNaarTekst(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) {
    stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  }
  return Buffer.concat(stukken).toString("utf-8");
}

function veiligeBlobNaam(id) {
  return `${id.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
}

// Client-IP proberen te bepalen. Azure Static Web Apps/Functions geeft dit door via de
// "x-forwarded-for" header (formaat: "client-ip:poort, proxy-ip, ..."). We pakken het
// eerste, meest linkse adres — dat is het daadwerkelijke client-IP.
function haalClientIp(req) {
  const header = req.headers?.["x-forwarded-for"] || req.headers?.["X-Forwarded-For"];
  if (!header) return "onbekend";
  const eersteDeel = header.split(",")[0].trim();
  // IPv4 met poort ("1.2.3.4:5678") -> alleen het adres; IPv6 laten we ongemoeid.
  const zonderPoort = eersteDeel.includes(".") ? eersteDeel.split(":")[0] : eersteDeel;
  return zonderPoort || "onbekend";
}

// Bouwt de JSON-payload voor de Power Automate-webhook uit het offerte-record. Losstaande,
// pure functie (geen netwerk/opslag) zodat dit apart getest kan worden — de vorm van de
// payload is de "publieke API" naar Power Automate toe, dus moet stabiel en voorspelbaar zijn.
function bouwWebhookPayload(record, tekenlink) {
  const soort = record.soort === "opdrachtbevestiging" ? "opdrachtbevestiging" : "offerte";
  const regelsPerKlant = record.data?.regelsPerKlant || {};
  const alleRegels = Object.values(regelsPerKlant).flat();
  const subtotaal = alleRegels.reduce((som, r) => som + (r.subtotaal || 0), 0);
  const btw = subtotaal * 0.21;
  const afronden = (n) => Math.round(n * 100) / 100;

  return {
    gebeurtenis: soort === "opdrachtbevestiging" ? "opdrachtbevestiging-geaccepteerd" : "offerte-geaccepteerd",
    // offerteId blijft ongewijzigd voor bestaande Power Automate-flows die op dit veld
    // matchen; documentId/soort zijn de nieuwe, generieke velden (ook gevuld bij offerte).
    offerteId: record.id,
    documentId: record.id,
    soort,
    opdrachttypeNaam: soort === "opdrachtbevestiging" ? record.opdrachttypeNaam || record.data?.opdrachttypeNaam || null : undefined,
    tekenlink: tekenlink || null,
    klantNamen: record.klantNamen || [],
    klanten: (record.data?.gekozenKlanten || []).map((k) => ({ id: k.id, naam: k.naam, email: k.email || null })),
    namens: record.data?.namens || null,
    ondertekenaar: {
      naam: record.ondertekening?.naam || null,
      email: record.ondertekening?.email || null,
      opmerking: record.ondertekening?.opmerking || null,
      emailKomtOvereenMetKlant: record.ondertekening?.emailKomtOvereen ?? null,
    },
    ondertekendOp: record.ondertekening?.op || null,
    bedrag: { subtotaal: afronden(subtotaal), btw: afronden(btw), totaal: afronden(subtotaal + btw) },
  };
}

// Voegt een query-parameter toe aan de webhook-URL — via de URL-klasse i.p.v. losse
// string-concatenatie, zodat "?" vs "&" altijd goed komt, ook als de ingestelde URL zelf al
// eigen query-parameters heeft (zoals de sv/sig-parameters van een Power Automate/Logic
// Apps-trigger-URL), en de waarde automatisch correct ge-encodeerd wordt.
function voegQueryParamToe(url, naam, waarde) {
  if (!waarde) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(naam, waarde);
    return parsed.toString();
  } catch (e) {
    // Ongeldige URL -> ongewijzigd laten, stuurWebhook faalt/logt dat dan zelf.
    return url;
  }
}

// Doet de daadwerkelijke POST naar de webhook-URL — met een timeout, zodat een trage of
// onbereikbare Power Automate-flow de acceptatie van de klant niet blijft ophouden.
async function stuurWebhook(url, payload, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort: leest de eventueel ingestelde Power Automate-webhook-URL (Instellingen) en
// stuurt daar, alléén bij een akkoord-ondertekening, een POST met de offertegegevens naartoe.
// Geen URL ingesteld -> stilletjes niets doen. Mag de acceptatie zelf nooit laten mislukken;
// de aanroeper vangt fouten hiervan af, net als bij verwerkOndertekeningNaSignering.
async function stuurAcceptatieWebhook(record, tekenlink, contextLog) {
  // Offerte en opdrachtbevestiging hebben elk hun eigen, los in/uit te zetten
  // webhook-instelling (leeg = uit) — zie Instellingen in de app.
  const sleutel = record.soort === "opdrachtbevestiging" ? "webhook-opdrachtbevestiging-acceptatie" : "webhook-acceptatie";
  const webhookUrl = (await haalInstellingWaarde(sleutel))?.trim();
  if (!webhookUrl) return;

  const payload = bouwWebhookPayload(record, tekenlink);
  // Naast de klantgegevens in de JSON-body ook het Dynamics-account-ID van de (eerste)
  // klant als "ID"-query-parameter op de URL zelf — handig als de Power Automate-flow
  // hem zo direct uit de trigger-URL wil lezen i.p.v. uit de body te parsen. Bij een
  // offerte met meerdere klanten (zie "OFFERTE X VAN Y" op de PDF) is dit het account-ID
  // van de eerst gekozen klant — dezelfde "eerste klant"-conventie als elders in deze
  // Function (zie bekendeKlant hieronder).
  const accountId = record.data?.gekozenKlanten?.[0]?.id || null;
  const volledigeUrl = voegQueryParamToe(webhookUrl, "ID", accountId);
  const resultaat = await stuurWebhook(volledigeUrl, payload);
  if (!resultaat.ok) {
    contextLog(`Power Automate-webhook gaf status ${resultaat.status} terug.`);
  } else {
    contextLog("Power Automate-webhook verzonden.");
  }
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  if (!id) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen offerte-ID opgegeven." } };
    return;
  }

  const ipVoorLimiet = haalClientIp(req);
  if (!(await magDoor(ipVoorLimiet))) {
    context.res = {
      status: 429,
      headers: { "Content-Type": "application/json" },
      body: { error: "Te veel verzoeken. Probeer het over een minuut opnieuw." },
    };
    return;
  }

  try {
    const gevonden = await vindBlobClient(id);
    if (!gevonden) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Offerte of opdrachtbevestiging niet gevonden." } };
      return;
    }
    const { blobClient, soort } = gevonden;

    const downloadResponse = await blobClient.download();
    const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
    const record = JSON.parse(tekst);
    // Oudere offerte-records hebben nog geen "soort"-veld — welke container het record
    // bevatte is dan leidend, zodat downstream-functies (webhook, PDF, taak) altijd
    // consistent kunnen beslissen op record.soort.
    record.soort = record.soort || soort;
    const documentLabel = soort === "opdrachtbevestiging" ? "Opdrachtbevestiging" : "Offerte";
    const nu = new Date().toISOString();
    const ip = ipVoorLimiet;

    if (req.method === "GET") {
      // Elke keer openen loggen (view-tracking, zoals bij DocuSign) — blokkeert de respons niet
      // bij een schrijffout, dat mag het bekijken van de offerte niet in de weg staan.
      try {
        record.logboek = Array.isArray(record.logboek) ? record.logboek : [];
        record.logboek.push({ gebeurtenis: req.query?.formaat === "pdf" ? "pdf-gedownload" : "geopend", op: nu, ip });
        const buffer = Buffer.from(JSON.stringify(record), "utf-8");
        await blobClient.upload(buffer, buffer.length, { overwrite: true });
      } catch (e) {
        context.log.error("Kon gebeurtenis niet loggen:", e);
      }

      // Rechtstreekse PDF-download — zelfde generator die ook gebruikt wordt om het
      // ondertekende bestand naar SharePoint te sturen, maar hier al bruikbaar vóór
      // ondertekening (zonder handtekeningblok, dat verschijnt vanzelf zodra die er is).
      if (req.query?.formaat === "pdf") {
        try {
          const pdfBytes = soort === "opdrachtbevestiging" ? await genereerOpdrachtbevestigingPdf(record) : await genereerOffertePdf(record);
          const klantnaam = (record.klantNamen || [])[0] || documentLabel.toLowerCase();
          const veiligeNaam = klantnaam.replace(/[\\/:*?"<>|]/g, "-").trim();
          context.res = {
            status: 200,
            isRaw: true,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${documentLabel} - ${veiligeNaam}.pdf"`,
            },
            body: Buffer.from(pdfBytes),
          };
        } catch (e) {
          context.log.error("PDF genereren mislukt:", e);
          context.res = {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: { error: "PDF genereren is mislukt." },
          };
        }
        return;
      }

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: {
          id: record.id,
          soort,
          klantNamen: record.klantNamen || [],
          opdrachttypeNaam: record.opdrachttypeNaam || record.data?.opdrachttypeNaam || null,
          data: record.data || {},
          status: record.status || "verzonden",
          ondertekening: record.ondertekening || null,
        },
      };
      return;
    }

    if (req.method === "POST") {
      if (record.ondertekening) {
        // Al eerder getekend/afgewezen — niet nogmaals laten overschrijven, dat zou het
        // bewijs van de eerste ondertekening vernietigen. Gewoon de bestaande status tonen.
        context.res = {
          status: 409,
          headers: { "Content-Type": "application/json" },
          body: {
            error: `Deze ${documentLabel.toLowerCase()} is al eerder ondertekend of afgewezen.`,
            ondertekening: record.ondertekening,
            status: record.status,
          },
        };
        return;
      }

      const invoer = req.body || {};
      const naam = (invoer.naam || "").trim();
      const email = (invoer.email || "").trim();
      const akkoord = !!invoer.akkoord;
      const opmerking = (invoer.opmerking || "").trim();
      const handtekening = (invoer.handtekening || "").trim(); // base64 PNG data-URL vanaf het canvas

      if (!naam || !email) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "Naam en e-mailadres zijn verplicht." },
        };
        return;
      }
      // Een getekende handtekening is alleen verplicht bij akkoord — bij afwijzen hoeft er
      // niets getekend te worden.
      if (akkoord && (!handtekening || !handtekening.startsWith("data:image/"))) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "Handtekening ontbreekt." },
        };
        return;
      }

      record.ondertekening = { naam, email, opmerking, akkoord, handtekening: akkoord ? handtekening : null, ip, op: nu };
      record.status = akkoord ? "geaccepteerd" : "niet_geaccepteerd";
      record.gewijzigdOp = nu;
      record.gewijzigdDoor = `${naam} (klant)`;
      record.logboek = Array.isArray(record.logboek) ? record.logboek : [];
      record.logboek.push({
        gebeurtenis: akkoord ? "ondertekend" : "afgewezen",
        op: nu,
        naam,
        email,
        ip,
      });

      // Niet-blokkerende check (#6): wijkt het ingevulde e-mailadres af van het bij ons
      // bekende contactadres van de klant? Wordt alleen als signaal meegegeven — de
      // ondertekening zelf wordt hierdoor niet tegengehouden, dit is geen verificatie.
      const bekendeKlant = (record.data?.gekozenKlanten || [])[0];
      const emailKomtOvereen = !bekendeKlant?.email || bekendeKlant.email.toLowerCase() === email.toLowerCase();
      record.ondertekening.emailKomtOvereen = emailKomtOvereen;

      const buffer = Buffer.from(JSON.stringify(record), "utf-8");
      await blobClient.upload(buffer, buffer.length, { overwrite: true });

      // Alleen bij een echte ondertekening (akkoord) — niet bij afwijzen — het
      // ondertekende document + logbestand naar SharePoint wegschrijven en de
      // onboarding-taak aanmaken. Dit mag de ondertekening zelf nooit blokkeren
      // of ongedaan maken: fouten hier worden alleen gelogd.
      if (akkoord) {
        try {
          await verwerkOndertekeningNaSignering(record, (bericht) => context.log(`[onboarding] ${bericht}`));
        } catch (e) {
          context.log.error("[onboarding] Verwerking na ondertekening mislukt:", e);
        }
        try {
          const tekenlink = req.headers?.referer || req.headers?.Referer || null;
          await stuurAcceptatieWebhook(record, tekenlink, (bericht) => context.log(`[webhook] ${bericht}`));
        } catch (e) {
          context.log.error("[webhook] Versturen naar Power Automate mislukt:", e);
        }
      }

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { ondertekening: record.ondertekening, status: record.status, emailKomtOvereen },
      };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "Opslag is nog niet geconfigureerd." },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Er ging iets mis. Probeer het later opnieuw." },
    };
  }
};

// Los toegankelijk voor tests (bewust geen netwerk/opslag-afhankelijkheden in deze twee) —
// de Azure Functions-runtime roept alleen module.exports zelf aan als functie, deze twee
// extra properties daarop zijn daarvoor onzichtbaar/onschadelijk.
module.exports.bouwWebhookPayload = bouwWebhookPayload;
module.exports.stuurWebhook = stuurWebhook;
module.exports.voegQueryParamToe = voegQueryParamToe;
