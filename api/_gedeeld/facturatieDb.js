/**
 * Gedeelde SQL-connectie voor de facturatiemodule (Azure SQL Database).
 *
 * Losstaand van Dataverse en van de bestaande Blob-opslag (portaalcontent): dit is de
 * operationele database voor facturen_klanten, klanten_klanten (eigen debiteuren van een
 * portaalklant) en artikelen_klanten (eigen productencatalogus). Zie
 * db/migrations/001_facturatiemodule.sql voor het schema en Context/Facturatiemodule.md
 * voor de achtergrond van deze keuze.
 *
 * Vereist de Application Setting FACTURATIE_SQL_CONNECTIONSTRING, bijvoorbeeld:
 *   Server=tcp:<server>.database.windows.net,1433;Database=<db>;
 *   Authentication=Active Directory Default;Encrypt=true;TrustServerCertificate=false;
 *   Connection Timeout=30;
 * (of met User Id=...;Password=...; als je geen Managed Identity gebruikt)
 *
 * Vergeet niet "mssql" te installeren in api/ (npm install, zie package.json).
 */
const sql = require("mssql");

let cachedPoolPromise = null;

/** Geeft een (gecachte) connectie-pool terug. Eén pool per Function-instance, hergebruikt
 * tussen aanroepen — net als de Blob-containerclient elders in api/_gedeeld. */
async function haalPool() {
  if (!cachedPoolPromise) {
    const connectionString = process.env.FACTURATIE_SQL_CONNECTIONSTRING;
    if (!connectionString) throw new Error("MISSING_CONFIG");
    cachedPoolPromise = sql.connect(connectionString).catch((err) => {
      // Bij een mislukte connectie niet blijven cachen — anders blijft elke volgende
      // aanroep dezelfde kapotte promise teruggeven totdat de Function herstart.
      cachedPoolPromise = null;
      throw err;
    });
  }
  return cachedPoolPromise;
}

module.exports = { sql, haalPool };
