/**
 * PUT /api/uren-instelling  body { accountId, toonOpHome }
 *
 * Eigen voorkeur van de klant: toon een snelknop "Uren registreren" op de homepagina. Vereist
 * dat de urenregistratie voor dit account aan staat (controleerUrenToegang). Opgeslagen in
 * dezelfde blob als de uren-aan/uit-status (uren-klanten.json, veld toonOpHome per account).
 */
const { controleerUrenToegang, afhandelFout } = require("../_gedeeld/urenToegang");
const { zetToonOpHome } = require("../_gedeeld/urenInstellingen");

module.exports = async function (context, req) {
  if (req.method !== "PUT") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
    return;
  }
  try {
    const { accountId } = await controleerUrenToegang(req);
    const toonOpHome = !!(req.body && req.body.toonOpHome);
    const opgeslagen = await zetToonOpHome(accountId, toonOpHome);
    context.res = { headers: { "Content-Type": "application/json" }, body: { accountId, toonOpHome: !!opgeslagen.toonOpHome } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
