/**
 * /api/uren-instelling — eigen voorkeur van de klant: toon een snelknop "Uren registreren" op de
 * homepagina. Vereist dat de urenregistratie voor dit account aan staat (controleerUrenToegang).
 * Opgeslagen in dezelfde blob als de uren-aan/uit-status (uren-klanten.json, veld toonOpHome).
 *
 *   GET ?accountId=...                       → { accountId, toonOpHome }   (de opgeslagen stand)
 *   PUT body { accountId, toonOpHome }        → opslaan
 */
const { controleerUrenToegang, afhandelFout } = require("../_gedeeld/urenToegang");
const { zetToonOpHome, haalStatussen } = require("../_gedeeld/urenInstellingen");

module.exports = async function (context, req) {
  try {
    const { accountId } = await controleerUrenToegang(req);

    if (req.method === "GET") {
      const statussen = await haalStatussen();
      const toonOpHome = !!(statussen[accountId] && statussen[accountId].toonOpHome);
      context.res = { headers: { "Content-Type": "application/json" }, body: { accountId, toonOpHome } };
      return;
    }

    if (req.method === "PUT") {
      const toonOpHome = !!(req.body && req.body.toonOpHome);
      const opgeslagen = await zetToonOpHome(accountId, toonOpHome);
      context.res = { headers: { "Content-Type": "application/json" }, body: { accountId, toonOpHome: !!opgeslagen.toonOpHome } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    afhandelFout(context, err);
  }
};
