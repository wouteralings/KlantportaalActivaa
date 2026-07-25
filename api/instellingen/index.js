const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * In tegenstelling tot /api/beheer-instellingen (alleen rol 'beheerder', GET+PUT) is dit
 * endpoint voor elke ingelogde klant leesbaar — puur om instellingen te tonen die in de
 * portal-UI gebruikt worden, zoals de Teams-chatlink.
 */
module.exports = async function (context, req) {
  try {
    const { teamsChatUrl } = await haalInstellingen();
    context.res = { headers: { "Content-Type": "application/json" }, body: { teamsChatUrl } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { headers: { "Content-Type": "application/json" }, body: { teamsChatUrl: "" } };
      return;
    }
    context.log.error(err);
    context.res = { headers: { "Content-Type": "application/json" }, body: { teamsChatUrl: "" } };
  }
};
