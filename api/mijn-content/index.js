const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { haalItems, filterVoorCategorieen } = require("../_gedeeld/content");

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);

    // Unie van alle klantcategorieën over al je gekoppelde klanten heen.
    const klantcategorieen = [...new Set(accounts.flatMap((a) => a.klantcategorieen))];

    const [programmas, mededelingen, faqs] = await Promise.all([
      haalItems("programma"),
      haalItems("mededeling"),
      haalItems("faq"),
    ]);

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        programmas: filterVoorCategorieen(programmas, klantcategorieen).map(({ id, titel, url }) => ({
          id,
          titel,
          url,
        })),
        mededelingen: filterVoorCategorieen(mededelingen, klantcategorieen)
          .map(({ id, titel, tekst, aangemaaktOp }) => ({ id, titel, tekst, aangemaaktOp }))
          .sort((a, b) => new Date(b.aangemaaktOp) - new Date(a.aangemaaktOp)),
        faqs: filterVoorCategorieen(faqs, klantcategorieen).map(({ id, vraag, antwoord }) => ({
          id,
          vraag,
          antwoord,
        })),
      },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Opslag is nog niet geconfigureerd." } };
      return;
    }
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING") {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij ophalen van content.", detail: String(err) },
    };
  }
};
