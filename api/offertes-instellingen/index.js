const { BlobServiceClient } = require("@azure/storage-blob");
const { isBeheerder } = require("../_gedeeld/offertesOnboarding");

const CONTAINER_NAAM = "instellingen";

let cachedContainerClient = null;

/**
 * Verbinding met de Blob-container maken (en aanmaken als die nog niet bestaat).
 * Vereist de Application Setting (Omgevingsvariabele) STORAGE_CONNECTION_STRING in Azure.
 */
async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("MISSING_CONFIG");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAAM);
  await containerClient.createIfNotExists();

  cachedContainerClient = containerClient;
  return containerClient;
}

async function streamNaarTekst(readableStream) {
  const stukken = [];
  for await (const stuk of readableStream) {
    stukken.push(Buffer.isBuffer(stuk) ? stuk : Buffer.from(stuk));
  }
  return Buffer.concat(stukken).toString("utf-8");
}

// Blobnamen mogen geen rare tekens bevatten; onze sleutels zijn intern altijd
// simpele woorden met koppeltekens, maar we maken 'm voor de zekerheid veilig.
function veiligeBlobNaam(sleutel) {
  return sleutel.replace(/[^a-zA-Z0-9-_]/g, "_");
}

// Whitelist van sleutels die de tool daadwerkelijk gebruikt (zie de opslagGet/opslagSet-
// aanroepen in src/App.jsx). Voorkomt dat dit generieke endpoint misbruikt wordt om
// willekeurige data onder een zelfgekozen sleutel weg te schrijven.
const TOEGESTANE_SLEUTELS = new Set([
  "afzender",
  "logo",
  "favicon",
  "bijlage-algemeen",
  "bijlage-per-dienst",
  "bijlage-per-klant",
  "mailtekst",
  "algemenevoorwaarden",
  "roadmap",
  "dienstencatalogus",
  // Vrij te beheren categorieën ("kolommen") waarin diensten worden ingedeeld — zie
  // "Categorieën beheren" onder Dienstencatalogus beheren en groepeerOpCategorie in
  // src/App.jsx. Vervangt de eerdere vaste 2-deling (eenmalig/doorlopend).
  "diensten-categorieen",
  "standaardteksten",
  "webhook-acceptatie",
  // Opdrachtbevestiging: zelf te beheren opdrachttypes (NV COS) + hun verplichte/optionele
  // standaardparagrafen, en de instellingen voor de taak/webhook die bij ondertekening
  // horen — los van de gelijknamige offerte-instellingen hieronder.
  "opdrachttypes",
  "opdrachtbevestiging-teksten",
  // Vrijwillige, per-dienst standaardtekst voor de opdrachtbevestiging (los van het
  // opdrachttype/NV COS) — zie opdrachtbevestigingDienstTeksten in src/App.jsx.
  "opdrachtbevestiging-dienst-teksten",
  "webhook-opdrachtbevestiging-acceptatie",
  "taak-instellingen-offerte",
  "taak-instellingen-opdrachtbevestiging",
  // Taak die wordt aangemaakt zodra de tool automatisch een concept-vervolg-
  // opdrachtbevestiging klaarzet na een verstreken tarieven-einddatum — zie
  // verwerkVerlopenTarieven in api/_gedeeld/offertesOnboarding.js. Staat standaard aan.
  "taak-instellingen-verlopen-concept",
  // Tarieven-registratie in Dataverse (cr283_opdrachtbevestiging + cr283_tarief) bij
  // ondertekening van een opdrachtbevestiging — zie api/dataverse-schema-setup en
  // schrijfTarievenNaarDataverse in api/_gedeeld/offertesOnboarding.js. Staat standaard uit.
  "tarieven-instellingen-opdrachtbevestiging",
  // Naar welke kolom van de cr283_tarief-tabel het bedrag en de dienstomschrijving
  // geschreven worden — zie schrijfTarievenNaarDataverse in api/_gedeeld/offertesOnboarding.js.
  // Standaard cr283_prijs / cr283_dienstomschrijving (de kolommen die
  // api/dataverse-schema-setup zelf aanmaakt).
  "tarieven-kolom-mapping",
  "mailtekst-opdrachtbevestiging",
  "inleiding-opdrachtbevestiging",
  // Opdrachtbevestiging heeft alleen een algemene toelichting — géén klantspecifieke/per-dienst
  // toelichting en géén roadmap, dat is bewust alleen bij de offerte gebleven.
  "bijlage-algemeen-opdrachtbevestiging",
]);

// Instellingensleutel "medewerkers" (naam/e-mail/telefoonnummer/functie/rol) is bewust NIET
// meer in TOEGESTANE_SLEUTELS opgenomen (integratieplan, Stap 3, rechten centraliseren):
// wie beheerder is wordt sinds de integratie in het Klantportaal bepaald via de Azure-rol
// 'beheerder' (zie isBeheerder in api/_gedeeld/offertesOnboarding.js), dezelfde rol als de
// rest van het portaal — beheerd via Beheer → Medewerkers, niet meer via een eigen lijst
// binnen deze module. Een oude "medewerkers"-blob kan nog in de Storage-container staan;
// die wordt door niets meer gelezen en is veilig te negeren of op te ruimen.
//
// Instellingensleutels die ook bij een GET (lezen) al beheerder vereisen — in tegenstelling
// tot de meeste andere sleutels (dienstencatalogus, teksten, logo, enz.), die de hele app
// nodig heeft om offertes/opdrachtbevestigingen te kunnen opstellen. Op dit moment leeg;
// vul aan als een toekomstige sleutel ook bij het lezen al beheerder-only moet zijn.
const BEHEERDER_ALLEEN_LEZEN_SLEUTELS = new Set([]);

module.exports = async function (context, req) {
  const sleutel = context.bindingData.sleutel;

  if (!sleutel) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Geen sleutel opgegeven." },
    };
    return;
  }

  if (!TOEGESTANE_SLEUTELS.has(sleutel)) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onbekende instellingensleutel." },
    };
    return;
  }

  // CSRF-drempel (#10): cross-site formulieren kunnen deze header niet meesturen.
  if ((req.method === "PUT" || req.method === "DELETE") && req.headers["x-requested-with"] !== "offertetool") {
    context.res = {
      status: 403,
      headers: { "Content-Type": "application/json" },
      body: { error: "Ongeldig verzoek." },
    };
    return;
  }

  // Beheerder-drempel: elke wijziging (PUT/DELETE) is een Instellingen-scherm-actie en dus
  // beheerders-only — zie isBeheerder in api/_gedeeld/offertesOnboarding.js. Lezen (GET) blijft voor
  // de meeste sleutels open (de rest van de app heeft dienstencatalogus, teksten, logo enz.
  // ook buiten Instellingen om nodig), behalve voor de sleutels in
  // BEHEERDER_ALLEEN_LEZEN_SLEUTELS hierboven.
  const vereistBeheerder =
    req.method === "PUT" || req.method === "DELETE" || (req.method === "GET" && BEHEERDER_ALLEEN_LEZEN_SLEUTELS.has(sleutel));
  if (vereistBeheerder && !(await isBeheerder(req))) {
    context.res = {
      status: 403,
      headers: { "Content-Type": "application/json" },
      body: { error: "Alleen beheerders hebben hier toegang toe." },
    };
    return;
  }

  try {
    const containerClient = await haalContainerClient();
    const blobClient = containerClient.getBlockBlobClient(veiligeBlobNaam(sleutel));

    if (req.method === "GET") {
      const bestaat = await blobClient.exists();
      if (!bestaat) {
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "Niet gevonden." },
        };
        return;
      }
      const downloadResponse = await blobClient.download();
      const waarde = await streamNaarTekst(downloadResponse.readableStreamBody);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { key: sleutel, value: waarde },
      };
      return;
    }

    if (req.method === "PUT") {
      const waarde = req.body?.value;
      if (waarde === undefined) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "Veld 'value' ontbreekt in de request body." },
        };
        return;
      }
      const inhoud = String(waarde);
      const buffer = Buffer.from(inhoud, "utf-8");
      await blobClient.upload(buffer, buffer.length, { overwrite: true });
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { key: sleutel, value: waarde },
      };
      return;
    }

    if (req.method === "DELETE") {
      await blobClient.deleteIfExists();
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { key: sleutel, deleted: true },
      };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "Opslag is nog niet geconfigureerd (ontbrekende STORAGE_CONNECTION_STRING)." },
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
