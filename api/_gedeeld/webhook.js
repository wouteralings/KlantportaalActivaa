/**
 * Voegt het cliëntnummer als query-parameter 'ID' toe aan een webhook-URL.
 *
 * Power Automate-trigger-URL's ("When an HTTP request is received") bevatten al query-parameters
 * (sp/sv/sig), dus we plakken er met '&' aan vast; heeft de URL nog geen query, dan met '?'.
 * De trigger kan de waarde uitlezen via triggerOutputs()?['queries']?['ID'].
 *
 * Is er geen cliëntnummer, dan blijft de URL ongewijzigd.
 */
function webhookMetId(url, clientnummer) {
  if (!url) return url;
  const id = String(clientnummer ?? "").trim();
  if (!id) return url;
  const scheiding = url.includes("?") ? "&" : "?";
  return `${url}${scheiding}ID=${encodeURIComponent(id)}`;
}

module.exports = { webhookMetId };
