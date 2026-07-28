const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalcontent";
const BLOB_NAAM = "instellingen.json";
let cachedContainerClient = null;

async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");

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

/** Geeft de huidige instellingen terug, met lege strings als er nog niets is opgeslagen. */
async function haalInstellingen() {
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);

  const bestaat = await blobClient.exists();
  if (!bestaat) return { googleReviewUrl: "", teamsChatUrl: "", whatsappUrl: "", copilotEmbedUrl: "", logoUrl: "", faviconUrl: "", wijzigingFormNawUrl: "", wijzigingFormContactUrl: "", taaksoorten: {}, taakAfwijzingWebhookUrl: "", reviewWebhookUrl: "", offerteportaalUrl: "", offerteToolUrl: "", facturatiemodulePrijs: 5, klantoverzicht: { extraKolommen: [], standaardVerborgen: [] } };

  const downloadResponse = await blobClient.download();
  const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
  return {
    googleReviewUrl: "",
    teamsChatUrl: "",
    whatsappUrl: "",
    copilotEmbedUrl: "",
    logoUrl: "",
    faviconUrl: "",
    wijzigingFormNawUrl: "",
    wijzigingFormContactUrl: "",
    // Per soort (op numerieke optieset-waarde): { zichtbaar: bool, magGoedkeuren: bool, label: string }.
    taaksoorten: {},
    // Power Automate HTTP-trigger (webhook) die een mail stuurt als een klant "Niet akkoord" geeft.
    taakAfwijzingWebhookUrl: "",
    // Power Automate HTTP-trigger (webhook) voor de afhandeling van reviews onder de 5 sterren.
    reviewWebhookUrl: "",
    // Link naar het externe offerteportaal (getoond in het medewerkersportaal).
    offerteportaalUrl: "",
    // Link naar de offertetool "Project" (getoond in het medewerkersportaal).
    offerteToolUrl: "",
    // Prijs (in hele euro's of met centen, bijv. 5 of 7.5) van de facturatiemodule per
    // klantaccount per maand — getoond in het klantportaal bij een nog niet actief account
    // (Facturatiemodule → "Niet actief"-uitleg), instelbaar in Beheer → Facturatie.
    facturatiemodulePrijs: 5,
    // Kolom-configuratie voor het klantoverzicht in het medewerkersportaal.
    // extraKolommen: [{ veld, label, type: "tekst"|"keuze"|"lookup" }]; standaardVerborgen: [kolom-keys].
    klantoverzicht: { extraKolommen: [], standaardVerborgen: [] },
    ...JSON.parse(tekst),
  };
}

async function werkInstellingenBij(velden) {
  const huidig = await haalInstellingen();
  const nieuw = { ...huidig, ...velden };
  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(BLOB_NAAM);
  const buffer = Buffer.from(JSON.stringify(nieuw, null, 2), "utf-8");
  await blobClient.upload(buffer, buffer.length, { overwrite: true });
  return nieuw;
}

module.exports = { haalInstellingen, werkInstellingenBij };
