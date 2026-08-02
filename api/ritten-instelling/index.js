/**
 * /api/ritten-instelling — eigen voorkeur van de klant: toon een snelknop "Rit toevoegen" op de
 * homepagina. Vereist dat de Rittenregistratie voor dit account aan staat
 * (controleerRittenToegang). Opgeslagen in dezelfde blob als de ritten-aan/uit-status
 * (ritten-klanten.json, veld toonOpHome). Zelfde opzet als api/uren-instelling/index.js.
 *
 *   GET ?accountId=...                       → { accountId, toonOpHome }   (de opgeslagen stand)
 *   PUT body { accountId, toonOpHome }        → opslaan
 */
const { controleerRittenToegang, afhandelFout } = require("../_gedeeld/rittenToegang");
const { zetToonOpHome, haalStatussen } = require("../_gedeeld/rittenInstellingen");

module.exports = async function (context, req) {
  try {
    const { accountId } = await controleerRittenToegang(req);

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
