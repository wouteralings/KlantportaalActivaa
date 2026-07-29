const { TableClient } = require("@azure/data-tables");

// Eenvoudige rate limiter: max `LIMIET` verzoeken per IP-adres per minuut, bijgehouden in
// een Table Storage-tabel. Bedoeld voor het publieke, anonieme /api/teken/*-endpoint, dat
// zonder drempel kwetsbaar zou zijn voor het geautomatiseerd aftasten van offerte-ID's.
const LIMIET = 30;
const TABEL_NAAM = "tekenratelimit";

let cachedTableClient = null;

async function haalRateLimitTabel() {
  if (cachedTableClient) return cachedTableClient;
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("MISSING_CONFIG");
  // allowInsecureConnection is alleen relevant voor http-verbindingen (bijv. lokaal testen met
  // Azurite) — bij een echte (https) Azure Storage-connection string heeft deze optie geen
  // effect, dus dit verandert niets aan het productiegedrag.
  cachedTableClient = TableClient.fromConnectionString(connectionString, TABEL_NAAM, { allowInsecureConnection: true });
  await cachedTableClient.createTable().catch(() => {});
  return cachedTableClient;
}

// Geeft true terug als het verzoek nog is toegestaan (en telt 'm meteen mee), false als de
// limiet voor dit IP-adres in de huidige minuut al is bereikt. Faalt de tabel zelf (bijv.
// tijdelijk niet bereikbaar), dan wordt het verzoek uit voorzorg toegestaan — een falende
// rate limiter mag de tool niet volledig platleggen.
async function magDoor(ip) {
  try {
    const tabel = await haalRateLimitTabel();
    const bucket = Math.floor(Date.now() / 60000); // per minuut
    const rowKey = `${ip}_${bucket}`;
    try {
      const entiteit = await tabel.getEntity("ip", rowKey);
      if (entiteit.aantal >= LIMIET) return false;
      await tabel.updateEntity({ partitionKey: "ip", rowKey, aantal: entiteit.aantal + 1 }, "Merge");
    } catch (e) {
      await tabel.createEntity({ partitionKey: "ip", rowKey, aantal: 1 });
    }
    return true;
  } catch (e) {
    return true;
  }
}

module.exports = { magDoor, LIMIET };
