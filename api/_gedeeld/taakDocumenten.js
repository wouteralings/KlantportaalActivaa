/**
 * Documenten bij één taak.
 *
 * Op de Task staat één documentkolom (Application Setting DYNAMICS_TAAK_DOCUMENT_VELD) met de
 * SharePoint-link naar het stuk. Bij een dividendstuk hoort er ook een bijlage bij (de aangifte
 * dividendbelasting), en de cliënt moet die er in het portaal náást zien staan. In plaats van een
 * extra kolom in Dynamics laten we die ene kolom MEERDERE links dragen, gescheiden door een
 * regeleinde (of een puntkomma / pipe, mocht iemand het met de hand invullen).
 *
 * Afspraak: de EERSTE link is het document van de taak zelf. Dat is het stuk dat ondertekend wordt en
 * dat bepaalt in welke SharePoint-map het ondertekeningsbewijs terechtkomt (zie api/taken-ondertekenen);
 * de rest is meekijk-materiaal. Bestaande taken met precies één link blijven dus werken zoals ze deden.
 */

/** Splitst de kolomwaarde in losse links. Lege stukken en dubbele links vallen weg, volgorde blijft. */
function splitsDocumentLinks(waarde) {
  const ruw = String(waarde == null ? "" : waarde);
  if (!ruw.trim()) return [];
  const gezien = new Set();
  const uit = [];
  for (const deel of ruw.split(/[\r\n;|]+/)) {
    const link = deel.trim();
    if (!link || gezien.has(link)) continue;
    gezien.add(link);
    uit.push(link);
  }
  return uit;
}

/**
 * Voegt links samen tot één kolomwaarde. Lege waarden vallen weg; de eerste blijft de eerste.
 * `maxLengte` is de kolomlengte in Dynamics: er wordt nooit midden in een link afgekapt — past een
 * volgende link er niet meer bij, dan blijft die er gewoon af (liever één document minder dan een
 * halve, onbruikbare url).
 */
function voegDocumentLinksSamen(links, maxLengte = 2000) {
  const schoon = (Array.isArray(links) ? links : [links])
    .map((l) => String(l == null ? "" : l).trim())
    .filter((l, i, a) => l && a.indexOf(l) === i);
  const uit = [];
  let lengte = 0;
  for (const link of schoon) {
    const erbij = (uit.length ? 1 : 0) + link.length; // 1 voor het regeleinde
    if (uit.length && lengte + erbij > maxLengte) break;
    uit.push(link.slice(0, maxLengte));
    lengte += erbij;
  }
  return uit.join("\n");
}

/**
 * Leesbare bestandsnaam uit een SharePoint-webUrl: het laatste padstuk, url-decoded en zonder
 * query. Lukt dat niet, dan een neutrale terugval — nooit de kale url, want die is lang en zegt
 * de cliënt niets.
 */
function documentNaamUitUrl(url, terugval) {
  try {
    const zonderQuery = String(url || "").split(/[?#]/)[0];
    const laatste = zonderQuery.split("/").filter(Boolean).pop() || "";
    const naam = decodeURIComponent(laatste).trim();
    if (naam) return naam;
  } catch {
    /* kapotte url-encoding: dan gewoon de terugval */
  }
  return terugval || "Document";
}

module.exports = { splitsDocumentLinks, voegDocumentLinksSamen, documentNaamUitUrl };
