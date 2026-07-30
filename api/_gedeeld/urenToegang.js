/**
 * Toegangscontrole voor de urenregistratie-endpoints. Bouwt voort op de facturatie-toegang:
 * uren wérken alleen als óók de facturatiemodule aan staat (klanten/artikelen/factureren zitten
 * daar), én de aparte urenregistratie-schakelaar voor dit account aan staat.
 *
 * Dus: eerst controleerToegang() uit facturatieToegang (juiste account + facturatie aan), dan de
 * eigen uren-schakelaar (urenInstellingen.js). afhandelFout wordt hergebruikt uit
 * facturatieToegang — die kent sinds deze wijziging ook de code UREN_MODULE_UITGESCHAKELD.
 */
const { controleerToegang, afhandelFout } = require("./facturatieToegang");
const { isIngeschakeld } = require("./urenInstellingen");

async function controleerUrenToegang(req) {
  // Vereist een geldig account waarvoor de facturatiemodule aan staat (gooit anders
  // GEEN_TOEGANG/MODULE_UITGESCHAKELD, afgehandeld door afhandelFout).
  const { email, accountId } = await controleerToegang(req);

  if (!(await isIngeschakeld(accountId))) {
    const fout = new Error("De urenregistratie staat voor dit klantaccount nog niet aan.");
    fout.code = "UREN_MODULE_UITGESCHAKELD";
    throw fout;
  }
  return { email, accountId };
}

module.exports = { controleerUrenToegang, afhandelFout };
