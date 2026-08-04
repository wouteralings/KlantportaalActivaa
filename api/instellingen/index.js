const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * In tegenstelling tot /api/beheer-instellingen (alleen rol 'beheerder', GET+PUT) is dit
 * endpoint voor elke ingelogde klant leesbaar — puur om instellingen te tonen die in de
 * portal-UI gebruikt worden, zoals de Teams-chatlink en de wijzigingsformulier-links.
 */
const LEGE_INSTELLINGEN = { teamsChatUrl: "", whatsappUrl: "", copilotEmbedUrl: "", logoUrl: "", faviconUrl: "", wijzigingFormNawUrl: "", wijzigingFormContactUrl: "", facturatiemodulePrijs: 5, urenmodulePrijs: 2.5, rapportagesmodulePrijs: 7.5, bezittingenmodulePrijs: 5, rittenmodulePrijs: 1.5, contractenmodulePrijs: 2.5, klantoverzicht: { extraKolommen: [], standaardVerborgen: [] }, dossierExtraKolommen: { ib: [], vpb: [] }, contactpersonenExtraKolommen: [] };

module.exports = async function (context, req) {
  try {
    const { teamsChatUrl, whatsappUrl, copilotEmbedUrl, logoUrl, faviconUrl, wijzigingFormNawUrl, wijzigingFormContactUrl, facturatiemodulePrijs, urenmodulePrijs, rapportagesmodulePrijs, bezittingenmodulePrijs, rittenmodulePrijs, contractenmodulePrijs, klantoverzicht, dossierExtraKolommen, contactpersonenExtraKolommen } = await haalInstellingen();
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { teamsChatUrl, whatsappUrl, copilotEmbedUrl, logoUrl, faviconUrl, wijzigingFormNawUrl, wijzigingFormContactUrl, facturatiemodulePrijs: facturatiemodulePrijs != null ? facturatiemodulePrijs : 5, urenmodulePrijs: urenmodulePrijs != null ? urenmodulePrijs : 2.5, rapportagesmodulePrijs: rapportagesmodulePrijs != null ? rapportagesmodulePrijs : 7.5, bezittingenmodulePrijs: bezittingenmodulePrijs != null ? bezittingenmodulePrijs : 5, rittenmodulePrijs: rittenmodulePrijs != null ? rittenmodulePrijs : 1.5, contractenmodulePrijs: contractenmodulePrijs != null ? contractenmodulePrijs : 2.5, klantoverzicht: klantoverzicht || { extraKolommen: [], standaardVerborgen: [] }, dossierExtraKolommen: dossierExtraKolommen || { ib: [], vpb: [] }, contactpersonenExtraKolommen: contactpersonenExtraKolommen || [] },
    };
  } catch (err) {
    context.log.error(err);
    context.res = { headers: { "Content-Type": "application/json" }, body: LEGE_INSTELLINGEN };
  }
};
