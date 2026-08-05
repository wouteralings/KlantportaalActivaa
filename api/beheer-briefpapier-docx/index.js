/**
 * /api/beheer-briefpapier-docx — upload/verwijderen van het Word-briefpapier (.docx) voor de
 * Brieven-module. Beheerder-only. Bewaart het bestand in Blob Storage (briefWordpapier.js) én zet
 * de vlag afzender.briefpapierDocx in de Brieven-configuratie zodat het portaal weet dat er een
 * Word-briefpapier is ingesteld.
 *
 *   POST   { dataUrl: "data:...docx;base64,..." }  → { briefpapierDocx: true }
 *   DELETE                                          → { briefpapierDocx: false }
 */
const { slaBriefpapier, verwijderBriefpapier } = require("../_gedeeld/briefWordpapier");
const { haalConfig, zetConfig } = require("../_gedeeld/briefSjablonen");

async function zetVlag(waarde) {
  const config = await haalConfig();
  config.afzender = { ...config.afzender, briefpapierDocx: waarde };
  const opgeslagen = await zetConfig(config);
  return opgeslagen.afzender.briefpapierDocx === true;
}

module.exports = async function (context, req) {
  const methode = (req.method || "").toUpperCase();
  try {
    if (methode === "DELETE") {
      await verwijderBriefpapier();
      const vlag = await zetVlag(false);
      context.res = { headers: { "Content-Type": "application/json" }, body: { briefpapierDocx: vlag } };
      return;
    }
    if (methode !== "POST") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const dataUrl = (req.body && req.body.dataUrl) || "";
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef een .docx als data-URL mee (dataUrl)." } };
      return;
    }
    const buffer = Buffer.from(match[2], "base64");
    // .docx is een zip → begint met 'PK'. Simpele validatie tegen een verkeerd bestandstype.
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Dit lijkt geen geldig Word-bestand (.docx)." } };
      return;
    }
    await slaBriefpapier(buffer);
    const vlag = await zetVlag(true);
    context.res = { headers: { "Content-Type": "application/json" }, body: { briefpapierDocx: vlag } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij het opslaan van het Word-briefpapier." } };
  }
};
