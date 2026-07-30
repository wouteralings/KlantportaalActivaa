const { metOffertesRecht } = require("../_gedeeld/offertesRecht");
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "offertes";

let cachedContainerClient = null;

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

const handler = async function (context, req) {
  try {
    const containerClient = await haalContainerClient();

    const samenvattingen = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      try {
        const blobClient = containerClient.getBlockBlobClient(blob.name);
        const downloadResponse = await blobClient.download();
        const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
        const record = JSON.parse(tekst);
        // Alleen de samenvatting teruggeven voor het overzicht — niet de volledige
        // offerte-inhoud (diensten, prijzen, teksten), die is alleen nodig bij het
        // daadwerkelijk openen van één specifieke offerte.
        const bekekenEvents = (record.logboek || []).filter((e) => e.gebeurtenis === "geopend");
        const laatsteBekeken = bekekenEvents.length > 0 ? bekekenEvents[bekekenEvents.length - 1] : null;

        samenvattingen.push({
          id: record.id,
          klantNamen: record.klantNamen || [],
          klantGroepen: record.klantGroepen || [],
          status: record.status || "verzonden",
          aangemaaktOp: record.aangemaaktOp,
          aangemaaktDoor: record.aangemaaktDoor,
          gewijzigdOp: record.gewijzigdOp,
          gewijzigdDoor: record.gewijzigdDoor,
          aantalBekeken: bekekenEvents.length,
          laatstBekekenOp: laatsteBekeken?.op || null,
          laatstBekekenIp: laatsteBekeken?.ip || null,
        });
      } catch (e) {
        // Eén corrupte/onleesbare offerte mag de rest van het overzicht niet blokkeren.
        context.log.error(`Kon offerte ${blob.name} niet lezen:`, e);
      }
    }

    samenvattingen.sort((a, b) => new Date(b.gewijzigdOp) - new Date(a.gewijzigdOp));

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: samenvattingen,
    };
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

// Alleen bereikbaar voor medewerkers met het offertes-recht (en voor beheerders) — zie
// api/_gedeeld/offertesRecht.js. Het verbergen van de tab in het portaal is cosmetisch;
// dit is de plek waar het daadwerkelijk wordt tegengehouden.
module.exports = metOffertesRecht(handler);
