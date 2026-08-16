/**
 * De vaste notulen van Activaa, overgezet uit de Word-modellen (aangeleverd 16-08-2026):
 * dividenduitkering, dividendbeleid, agiostorting, benoeming bestuurder en ontslag bestuurder.
 *
 * KOP EN STAART LIGGEN VAST en zijn bij alle vijf identiek — de kop (t/m "…de navolgende besluiten
 * heeft genomen:") en de staart (Besluit / Sluiting / ondertekening). Alleen punt I ertussen
 * verschilt. Daarom staan romp en staart hier één keer: pas je ze aan, dan veranderen ze in één klap
 * voor alle vijf de modellen.
 *
 * Opmaak: zie src/medewerker/documentOpmaak.js — # titel, ## kop, ### kopje, --- lijn, - punt,
 * "a) punt", > inspringen, [midden], [ondertekening] functie | naam.
 *
 * Invulplekken: {{sleutel|LABEL}}. Is het veld in het dossier gevuld, dan komt die waarde te staan;
 * is het leeg of bestaat het veld niet bij deze soort, dan toont het document [LABEL] — precies zoals
 * in de Word-modellen, zodat je ziet wát er nog moet worden ingevuld.
 */

export const ROMP = `# Notulen
[midden] van de Algemene Vergadering van {{klantnaam|NAAM}}
[midden] gevestigd te {{vestigingsplaats|PLAATS}}
[midden] (hierna te noemen: "de Vennootschap")
[midden] gehouden op {{datumactie|DATUM}}
[midden] ten kantore van de vennootschap
---
### Aanwezig:

Naam en aandeel in Aandelenkapitaal:

{{aandeelhouders|AANDEELHOUDERS}}

{{directeur|VOORZITTER}} treedt op als voorzitter en {{notulist|NOTULIST}} als notulist van de Vergadering.

De voorzitter opent de Vergadering en constateert dat:
- op geen der aandelen enig recht van vruchtgebruik of pandrecht is gevestigd waarbij aan de vruchtgebruiker respectievelijk de pandhouder vergaderrecht toekomt;
- op geen der aandelen beslag is gelegd;
- er geen certificaten van aandelen bestaan, waaraan vergaderrecht is verbonden;
- er geen andere vergadergerechtigden zijn die ter Vergadering opgeroepen moeten worden;
- in zijn persoon het gehele geplaatste kapitaal ter Vergadering vertegenwoordigd is en tevens het bestuur aanwezig is;

zodat op de Vergadering rechtsgeldige besluiten kunnen worden genomen.

Vervolgens stelt de voorzitter de onderwerpen aan de orde waarover de Vergadering een besluit dient te nemen:

Na beraadslaging, waarbij de bestuurder van de Vennootschap in de gelegenheid is gesteld de Vergadering ter zake van de voorgenomen besluiten te adviseren, worden deze in stemming gebracht. Vervolgens constateert de voorzitter dat de Vergadering met algemene stemmen de navolgende besluiten heeft genomen:
`;

export const STAART = `{{toelichting|EXTRA TOELICHTING}}

### Besluit:
Gehoord de toelichting van het bestuur wijst de Vergadering hierbij, voor zover vereist en voor zover zij zulks niet reeds eerder heeft gedaan, het bestuur alsmede de bestuurder alsnog aan als bevoegd vertegenwoordiger van de Vennootschap ter zake van:
a. de Rechtshandelingen, als hiervoor genoemd; en
b. alle overige in het boekjaar namens de Vennootschap aangegane rechtshandelingen, mits blijkend uit de administratie en verwerkt in de jaarrekening, waarbij mogelijk sprake is geweest van tegenstrijdigheid tussen de belangen van de Vennootschap en haar bestuurder.

Deze aanwijzing geldt tevens voor alle rechtshandelingen en feitelijke handelingen ter uitvoering van of in verband met de onder a en b bedoelde handelingen.

### Sluiting:
Niets meer aan de orde zijnde sluit de voorzitter de Vergadering.

Aldus opgemaakt en ondertekend te {{vestigingsplaats|PLAATS}} op d.d. {{datumactie|DATUM}}.

[ondertekening] Voorzitter | {{directeur|VOORZITTER}}
[ondertekening] Notulist | {{notulist|NOTULIST}}
`;

/**
 * Zet kop + besluit + staart aan elkaar tot één stuk. Kop en staart komen uit Beheer (één keer
 * ingesteld, geldt voor álle notulen); het besluit is per model — en per stuk aan te passen in
 * "Notulen opstellen". Lege kop/staart valt terug op de standaardtekst hierboven.
 */
export function steltNotulenSamen({ kop, besluit, staart }) {
  const k = String(kop == null || !String(kop).trim() ? ROMP : kop).replace(/\s+$/, "");
  const s = String(staart == null || !String(staart).trim() ? STAART : staart).replace(/^\s+/, "");
  const b = String(besluit == null ? "" : besluit).trim();
  return `${k}\n${b ? b + "\n\n" : ""}${s}`;
}

/**
 * Haalt het besluitblok (punt I) uit een compleet notulensjabloon — nodig om bestaande sjablonen,
 * die nog één lap tekst waren, om te zetten naar de nieuwe opzet (kop en staart in Beheer, besluit
 * per model). Zoekt tussen de laatste regel van de kop ("…de navolgende besluiten heeft genomen:")
 * en het begin van de staart ({{toelichting}} of het kopje "Besluit:"). Lukt dat niet, dan geeft het
 * een lege string terug — de aanroeper toont de volledige tekst dan ongewijzigd, zodat er nooit
 * stilletjes iets verdwijnt.
 */
export function haalBesluitUitTekst(tekst) {
  const t = String(tekst == null ? "" : tekst).replace(/\r\n/g, "\n");
  const start = t.search(/navolgende\s+besluiten\s+heeft\s+genomen:/i);
  if (start === -1) return "";
  const na = t.indexOf("\n", start);
  if (na === -1) return "";
  const rest = t.slice(na + 1);
  const eindKandidaten = [
    rest.search(/\{\{\s*toelichting/i),
    rest.search(/^\s*###\s*Besluit\s*:/im),
    rest.search(/^\s*Besluit\s*:/im),
  ].filter((i) => i > -1);
  const eind = eindKandidaten.length ? Math.min(...eindKandidaten) : rest.length;
  return rest.slice(0, eind).trim();
}

/** Bouwt één volledig sjabloon: vaste kop + het eigen besluitblok (punt I) + vaste staart. */
const maak = (naam, besluitblok) => ({
  naam,
  besluit: besluitblok.trim(),
  tekst: steltNotulenSamen({ besluit: besluitblok }),
});

export const NOTULEN_SJABLONEN = [
  maak("Notulen dividenduitkering", `
I. Dividenduitkering
> Per {{datumactie|DATUM}} wordt er in totaal € {{bedrag|BEDRAG}} dividend uitgekeerd. De uitkering vindt plaats naar rato van het aandelenbezit en wordt, indien nodig, verrekend in rekening-courant.
> De uitkering geschiedt met inachtneming van de wettelijke en statutaire bepalingen en nadat het bestuur de uitkeringstoets als bedoeld in artikel 2:216 BW heeft uitgevoerd.
`),

  maak("Notulen dividendbeleid", `
I. Dividendbeleid
> De algemene vergadering van aandeelhouders spreekt de intentie uit om, met inachtneming van de wettelijke en statutaire bepalingen, jaarlijks minimaal {{percentage|PERCENTAGE}}% van het gerealiseerde nettoresultaat van de vennootschap als dividend uit te keren aan de aandeelhouders.
> Uitkeringen zullen slechts plaatsvinden voor zover het eigen vermogen van de vennootschap groter is dan de wettelijke en statutaire reserves en na uitvoering van de door het bestuur te verrichten uitkeringstoets, zoals bedoeld in artikel 2:216 BW.
> Het bestuur behoudt te allen tijde de bevoegdheid om een voorgenomen uitkering niet goed te keuren indien het weet of redelijkerwijs behoort te voorzien dat de vennootschap na uitkering niet kan blijven voortgaan met het betalen van haar opeisbare schulden.
> De algemene vergadering kan, op voorstel van het bestuur en met inachtneming van de belangen van de vennootschap en haar onderneming, gemotiveerd afwijken van dit dividendbeleid.
`),

  maak("Notulen agiostorting", `
I. Agiostorting
> Een agiostorting te doen van € {{bedrag|BEDRAG}}. De agiostorting zal plaatsvinden naar rato van aandelenbezit en wordt indien nodig verrekend in rekening-courant. De agiostorting zal worden geboekt als agioreserve op het eigen vermogen van de vennootschap. De storting geschiedt zonder terugbetalingsverplichting.
`),

  maak("Notulen benoeming bestuurder", `
I. Benoeming bestuurder
> Met ingang van {{datumactie|DATUM}} wordt {{directeur|NAAM BESTUURDER}} benoemd als (statutair) bestuurder van de vennootschap. De benoeming gaat met onmiddellijke ingang in. Het bestuur van de vennootschap wordt gemachtigd om de benoeming in te schrijven bij de Kamer van Koophandel.
`),

  maak("Notulen ontslag bestuurder", `
I. Ontslag bestuurder
> Met ingang van {{datumactie|DATUM}} wordt {{directeur|NAAM BESTUURDER}} ontslagen als (statutair) bestuurder van de vennootschap. Het ontslag wordt verleend met onmiddellijke ingang. Er wordt decharge verleend voor het door hem/haar gevoerde beleid tot de datum van ontslag. Indien noodzakelijk zullen de onderlinge rechtsverhoudingen tussen vennootschap en bestuurder worden afgewikkeld. Indien noodzakelijk wordt het bestuur van de vennootschap gemachtigd om het ontslag in te schrijven bij de Kamer van Koophandel.
`),
];
