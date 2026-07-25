const { haalGebruikersToken, wisselVoorGraphToken } = require("../_gedeeld/graphObo");
const { haalLabels, zetLabel } = require("../_gedeeld/labels");

/**
 * Geeft alleen items terug die in SharePoint/OneDrive daadwerkelijk met de ingelogde
 * gebruiker zijn gedeeld — Graph past de echte permissies van die gebruiker toe,
 * er is dus geen aparte toegangsadministratie meer nodig.
 */
async function haalGedeeldeItems(graphToken) {
  const url =
    "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe" +
    "?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,remoteItem";

  const res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
  if (!res.ok) throw new Error(`Graph-aanvraag mislukt: ${await res.text()}`);

  const data = await res.json();
  return (data.value || []).map((item) => {
    const bron = item.remoteItem || item; // gedeelde items staan vaak onder remoteItem
    return {
      id: item.id,
      naam: bron.name,
      type: bron.folder ? "map" : "bestand",
      grootteKb: bron.size ? Math.round(bron.size / 1024) : null,
      gewijzigd: bron.lastModifiedDateTime,
      url: bron.webUrl,
    };
  });
}

module.exports = async function (context, req) {
  const gebruikersToken = haalGebruikersToken(req);
  if (!gebruikersToken) {
    context.res = {
      status: 401,
      body: { error: "Geen geldig token meegestuurd. Log opnieuw in." },
    };
    return;
  }

  try {
    const graphToken = await wisselVoorGraphToken(gebruikersToken);
    const items = await haalGedeeldeItems(graphToken);

    // E-mail voor de labels-opslag halen we uit hetzelfde principal-mechanisme als elders.
    const { haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
    const email = haalEmailUitPrincipal(req);
    const labels = email ? await haalLabels(email) : {};

    const resultaat = items.map((item) => {
      const opgeslagen = labels[item.id] || {};
      return {
        ...item,
        label: opgeslagen.label || item.naam,
        entiteit: opgeslagen.entiteit || "",
      };
    });

    context.res = { headers: { "Content-Type": "application/json" }, body: resultaat };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, body: { error: "Graph-koppeling (AAD_*) is nog niet geconfigureerd." } };
      return;
    }
    if (err.code === "OBO_MISLUKT") {
      context.res = { status: 401, body: { error: "Sessie verlopen of onvoldoende rechten. Log opnieuw in." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij ophalen van documenten.", detail: String(err) },
    };
  }
};
