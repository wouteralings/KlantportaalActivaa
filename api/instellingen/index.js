const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * In tegenstelling tot /api/beheer-instellingen (alleen rol 'beheerder', GET+PUT) is dit
 * endpoint voor elke ingelogde klant leesbaar — puur om instellingen te tonen die in de
 * portal-UI gebruikt worden, zoals de Teams-chatlink en de wijzigingsformulier-links.
 */
const LEGE_INSTELLINGEN = { teamsChatUrl: "", logoUrl: "", wijzigingFormNawUrl: "", wijzigingFormContactUrl: "" };

module.exports = async function (context, req) {
  try {
    const { teamsChatUrl, logoUrl, wijzigingFormNawUrl, wijzigingFormContactUrl } = await haalInstellingen();
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { teamsChatUrl, logoUrl, wijzigingFormNawUrl, wijzigingFormContactUrl },
    };
  } catch (err) {
    context.log.error(err);
    context.res = { headers: { "Content-Type": "application/json" }, body: LEGE_INSTELLINGEN };
  }
};
