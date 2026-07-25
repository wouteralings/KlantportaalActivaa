const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER_NAAM = "portaalmedia";
let cachedContainerClient = null;

async function haalContainerClient() {
  if (cachedContainerClient) return cachedContainerClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAAM);
  // 'blob'-toegang: individuele bestanden zijn publiek leesbaar via hun URL (nodig
  // om het logo in een <img>-tag te tonen), de container zelf is niet doorzoekbaar.
  await containerClient.createIfNotExists({ access: "blob" });
  cachedContainerClient = containerClient;
  return containerClient;
}

/**
 * Slaat een afbeelding op vanuit een data-URL (bijv. "data:image/png;base64,....")
 * en geeft de publiek toegankelijke URL terug.
 */
async function slaLogoOp(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) {
    const fout = new Error("Verwacht een data-URL, bijv. 'data:image/png;base64,...'.");
    fout.code = "ONGELDIGE_AFBEELDING";
    throw fout;
  }
  const [, contentType, base64Data] = match;
  const extensie = contentType.split("/")[1].split("+")[0];

  const containerClient = await haalContainerClient();
  const blobClient = containerClient.getBlockBlobClient(`logo.${extensie}`);
  const buffer = Buffer.from(base64Data, "base64");
  await blobClient.upload(buffer, buffer.length, {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blobClient.url;
}

module.exports = { slaLogoOp };
