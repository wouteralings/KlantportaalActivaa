const { BlobServiceClient } = require("@azure/storage-blob");

// Zelfde Storage Account/connection string als "instellingen", maar een eigen
// container zodat offertes gescheiden blijven van de instellingen-sleutels.
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

// Blobnamen mogen geen rare tekens bevatten; offerte-ID's zijn intern altijd
// simpele woorden met koppeltekens, maar we maken 'm voor de zekerheid veilig.
function veiligeBlobNaam(id) {
  return `${id.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;

  if (!id) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Geen offerte-ID opgegeven." },
    };
    return;
  }

  try {
    // CSRF-drempel (#10): cross-site formulieren kunnen deze header niet meesturen.
    if ((req.method === "PUT" || req.method === "DELETE") && req.headers["x-requested-with"] !== "offertetool") {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: "Ongeldig verzoek." },
      };
      return;
    }

    const containerClient = await haalContainerClient();
    const blobClient = containerClient.getBlockBlobClient(veiligeBlobNaam(id));

    if (req.method === "GET") {
      const bestaat = await blobClient.exists();
      if (!bestaat) {
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "Offerte niet gevonden." },
        };
        return;
      }
      const downloadResponse = await blobClient.download();
      const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: JSON.parse(tekst),
      };
      return;
    }

    if (req.method === "PUT") {
      const nu = new Date().toISOString();
      const invoer = req.body || {};
      const gebruikerNaam = invoer.gebruikerNaam || "Onbekend";
      const gebruikerEmail = invoer.gebruikerEmail || "";

      // Bestaand record ophalen (indien aanwezig) zodat "aangemaakt op/door" niet
      // wordt overschreven bij een kleine wijziging — alleen "gewijzigd op/door"
      // wordt dan bijgewerkt. Bestaat de offerte nog niet, dan is dit de eerste keer.
      let bestaandRecord = null;
      const bestaat = await blobClient.exists();
      if (bestaat) {
        const downloadResponse = await blobClient.download();
        const tekst = await streamNaarTekst(downloadResponse.readableStreamBody);
        try {
          bestaandRecord = JSON.parse(tekst);
        } catch (e) {
          bestaandRecord = null;
        }
      }

      const record = {
        ...(bestaandRecord || {}),
        id,
        aangemaaktOp: bestaandRecord?.aangemaaktOp || nu,
        aangemaaktDoor: bestaandRecord?.aangemaaktDoor || gebruikerNaam,
        aangemaaktDoorEmail: bestaandRecord?.aangemaaktDoorEmail || gebruikerEmail,
        gewijzigdOp: nu,
        gewijzigdDoor: gebruikerNaam,
        klantNamen: invoer.klantNamen !== undefined ? invoer.klantNamen : bestaandRecord?.klantNamen || [],
        klantGroepen: invoer.klantGroepen !== undefined ? invoer.klantGroepen : bestaandRecord?.klantGroepen || [],
        status: invoer.status !== undefined ? invoer.status : bestaandRecord?.status || "verzonden",
        data: invoer.data !== undefined ? invoer.data : bestaandRecord?.data || {},
      };

      const buffer = Buffer.from(JSON.stringify(record), "utf-8");
      await blobClient.upload(buffer, buffer.length, { overwrite: true });

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: record,
      };
      return;
    }

    if (req.method === "DELETE") {
      await blobClient.deleteIfExists();
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { id, deleted: true },
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
