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

    // Een mededeling is zichtbaar zolang er geen einddatum is ("tot nader te bepalen") of de
    // einddatum nog niet voorbij is (zichtbaar t/m het einde van de gekozen dag).
    const nu = Date.now();
    const mededelingActief = (m) => {
      if (!m.zichtbaarTot) return true;
      const t = new Date(m.zichtbaarTot);
      if (isNaN(t.getTime())) return true;
      t.setHours(23, 59, 59, 999);
      return t.getTime() >= nu;
    };

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
          .filter(mededelingActief)
          .map(({ id, titel, tekst, aangemaaktOp, zichtbaarTot }) => ({ id, titel, tekst, aangemaaktOp, zichtbaarTot }))
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
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
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
