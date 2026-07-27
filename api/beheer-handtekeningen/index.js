const { haalAlleHandtekeningen, haalPdfBlob } = require("../_gedeeld/handtekeningen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * GET                → { handtekeningen: [...] } (nieuwste eerst) — de ondertekeningen-log.
 * GET ?blob=<naam>   → streamt de bewijs-PDF (blob-kopie) als download.
 */
module.exports = async function (context, req) {
  try {
    const blobNaam = req.query.blob;
    if (blobNaam) {
      const buffer = await haalPdfBlob(blobNaam);
      if (!buffer) { context.res = { status: 404, body: { error: "Bewijs-PDF niet gevonden." } }; return; }
      const bestandsnaam = blobNaam.split("/").pop() || "handtekening.pdf";
      context.res = {
        status: 200,
        isRaw: true,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${bestandsnaam}"`,
        },
        body: buffer,
      };
      return;
    }

    const handtekeningen = await haalAlleHandtekeningen();
    handtekeningen.sort((a, b) => new Date(b.ondertekendOp) - new Date(a.ondertekendOp));
    context.res = { headers: { "Content-Type": "application/json" }, body: { handtekeningen } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij de handtekening-log.", detail: String(err) } };
  }
};
