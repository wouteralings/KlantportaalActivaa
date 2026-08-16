/**
 * De vaste notulen-sjablonen van Activaa, overgezet uit de Word-modellen (aangeleverd 16-08-2026):
 * dividenduitkering, dividendbeleid, agiostorting, benoeming bestuurder en ontslag bestuurder.
 *
 * Alle vijf delen dezelfde romp — kop, aanwezigen, de constateringen van de voorzitter, het
 * besluitblok en de ondertekening. Alleen punt I (het eigenlijke besluit) verschilt. Vandaar één
 * ROMP_BOVEN + ROMP_ONDER met per sjabloon alleen dat ene blok ertussen: pas je de romp aan, dan
 * verandert hij in één klap voor alle vijf.
 *
 * Opmaak: zie src/medewerker/documentOpmaak.js (# titel, ## kop, ### kopje, --- lijn, - punt,
 * "a) punt", > inspringen, [midden], [handtekening] A | B).
 * Merge-velden: {{klantnaam}}, {{periode}}, {{datum}} en elk veld uit de veldencatalogus van de
 * soort — voor notulen o.a. {{directeur}}, {{bedrag}}, {{percentage}}, {{datumactie}},
 * {{aandeelhouders1}}…{{aandeelhouders5}}, {{toelichting}}.
 */

const ROMP_BOVEN = `# Notulen
[midden] van de Algemene Vergadering van
[midden] {{klantnaam}}
[midden] gevestigd te {{vestigingsplaats}}
[midden] (hierna te noemen: "de Vennootschap")
[midden] gehouden op {{datumactie}}
[midden] ten kantore van de vennootschap
---
## Aanwezig
Naam en aandeel in aandelenkapitaal:

{{directeur}} treedt op als voorzitter en {{notulist}} als notulist van de Vergadering.

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

const ROMP_ONDER = `### Besluit:
Gehoord de toelichting van het bestuur wijst de Vergadering hierbij, voor zover vereist en voor zover zij zulks niet reeds eerder heeft gedaan, het bestuur alsmede de bestuurder alsnog aan als bevoegd vertegenwoordiger van de Vennootschap ter zake van:
a) de Rechtshandelingen, als hiervoor genoemd; en
b) alle overige in het boekjaar namens de Vennootschap aangegane rechtshandelingen, mits blijkend uit de administratie en verwerkt in de jaarrekening, waarbij mogelijk sprake is geweest van tegenstrijdigheid tussen de belangen van de Vennootschap en haar bestuurder.

Deze aanwijzing geldt tevens voor alle rechtshandelingen en feitelijke handelingen ter uitvoering van of in verband met de onder a en b bedoelde handelingen.

### Sluiting:
Niets meer aan de orde zijnde sluit de voorzitter de Vergadering.

Aldus opgemaakt en ondertekend te {{vestigingsplaats}} op d.d. {{datumactie}}.

[handtekening] Voorzitter | Notulist
`;

/** Bouwt één volledig sjabloon: romp + het eigen besluitblok (punt I). */
const maak = (naam, besluitblok) => ({ naam, tekst: `${ROMP_BOVEN}\n${besluitblok.trim()}\n\n${ROMP_ONDER}` });

export const NOTULEN_SJABLONEN = [
  maak("Notulen dividenduitkering", `
## I. Dividenduitkering
> Per {{datumactie}} wordt er in totaal € {{bedrag}} dividend uitgekeerd. De uitkering vindt plaats naar rato van het aandelenbezit en wordt, indien nodig, verrekend in rekening-courant.
> De uitkering geschiedt met inachtneming van de wettelijke en statutaire bepalingen en nadat het bestuur de uitkeringstoets als bedoeld in artikel 2:216 BW heeft uitgevoerd.
`),

  maak("Notulen dividendbeleid", `
## I. Dividendbeleid
> De algemene vergadering van aandeelhouders spreekt de intentie uit om, met inachtneming van de wettelijke en statutaire bepalingen, jaarlijks minimaal {{percentage}}% van het gerealiseerde nettoresultaat van de vennootschap als dividend uit te keren aan de aandeelhouders.
> Uitkeringen zullen slechts plaatsvinden voor zover het eigen vermogen van de vennootschap groter is dan de wettelijke en statutaire reserves en na uitvoering van de door het bestuur te verrichten uitkeringstoets, zoals bedoeld in artikel 2:216 BW.
> Het bestuur behoudt te allen tijde de bevoegdheid om een voorgenomen uitkering niet goed te keuren indien het weet of redelijkerwijs behoort te voorzien dat de vennootschap na uitkering niet kan blijven voortgaan met het betalen van haar opeisbare schulden.
> De algemene vergadering kan, op voorstel van het bestuur en met inachtneming van de belangen van de vennootschap en haar onderneming, gemotiveerd afwijken van dit dividendbeleid.
`),

  maak("Notulen agiostorting", `
## I. Agiostorting
> Een agiostorting te doen van € {{bedrag}}. De agiostorting zal plaatsvinden naar rato van aandelenbezit en wordt indien nodig verrekend in rekening-courant. De agiostorting zal worden geboekt als agioreserve op het eigen vermogen van de vennootschap. De storting geschiedt zonder terugbetalingsverplichting.
`),

  maak("Notulen benoeming bestuurder", `
## I. Benoeming bestuurder
> Met ingang van {{datumactie}} wordt {{directeur}} benoemd als (statutair) bestuurder van de vennootschap. De benoeming gaat met onmiddellijke ingang in. Het bestuur van de vennootschap wordt gemachtigd om de benoeming in te schrijven bij de Kamer van Koophandel.
`),

  maak("Notulen ontslag bestuurder", `
## I. Ontslag bestuurder
> Met ingang van {{datumactie}} wordt {{directeur}} ontslagen als (statutair) bestuurder van de vennootschap. Het ontslag wordt verleend met onmiddellijke ingang. Er wordt decharge verleend voor het door hem/haar gevoerde beleid tot de datum van ontslag. Indien noodzakelijk zullen de onderlinge rechtsverhoudingen tussen vennootschap en bestuurder worden afgewikkeld. Indien noodzakelijk wordt het bestuur van de vennootschap gemachtigd om het ontslag in te schrijven bij de Kamer van Koophandel.
`),
];
