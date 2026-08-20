/**
 * Standaardteksten voor de liquidatiestukken: de vaste kop en de vaste staart van de notulen van de
 * Algemene Vergadering waarin de ontbinding wordt besloten.
 *
 * Overgenomen uit het ontbindingsrapport van Activaa. Ze staan hier als terugval, precies zoals ROMP
 * en STAART dat bij de notulen doen: is er in Beheer → Liquidatiestukken nog niets ingevuld, dan
 * gebruikt het opstelscherm deze tekst, zodat een stuk nooit half leeg in beeld komt. Vul je in
 * Beheer wél iets in, dan gaat dat vóór — je bent nergens aan vastgeketend.
 *
 * De opmaakcodes zijn die van documentOpmaak.js: `#` titel, `###` kopje, `[midden]` gecentreerd,
 * `-` opsomming, `>` inspringen, `[ondertekening] Functie | Naam` een ondertekenblok. Alles tussen
 * {{ }} wordt bij het opstellen ingevuld; `{{sleutel|LABEL}}` toont [LABEL] zolang het leeg is.
 */

export const LIQUIDATIE_KOP = `# NOTULEN
[midden] van de Algemene Vergadering van {{klantnaam|NAAM}}
[midden] statutair gevestigd te {{vestigingsplaats|PLAATS}}
[midden] (hierna te noemen: 'de Vennootschap')
[midden] gehouden op d.d. {{datumnotulen|DATUM}}
[midden] ten kantore van de vennootschap
---
### Aanwezig:

Naam en aandeel in Aandelenkapitaal:

{{aandeelhouders|AANDEELHOUDERS}}

{{voorzitter|VOORZITTER}} treedt op als voorzitter en {{notulist|NOTULIST}} als notulist van de Vergadering.

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

export const LIQUIDATIE_STAART = `{{toelichting?}}

### Besluit:
Gehoord de toelichting van het bestuur wijst de Vergadering hierbij, voor zover vereist en voor zover zij zulks niet reeds eerder heeft gedaan, het bestuur alsmede de bestuurder alsnog aan als bevoegd vertegenwoordiger van de Vennootschap ter zake van:
a. de Rechtshandelingen, als hiervoor genoemd; en
b. alle overige in het boekjaar namens de Vennootschap aangegane rechtshandelingen, mits blijkend uit de administratie en verwerkt in de jaarrekening, waarbij mogelijk sprake is geweest van tegenstrijdigheid tussen de belangen van de Vennootschap en haar bestuurder.

Deze aanwijzing geldt tevens voor alle rechtshandelingen en feitelijke handelingen ter uitvoering van of in verband met de onder a en b bedoelde handelingen.

### Sluiting:
Niets meer aan de orde zijnde, sluit de voorzitter de vergadering.

Aldus opgemaakt en ondertekend ter vaststelling te {{vestigingsplaats|PLAATS}} op d.d. {{datumnotulen|DATUM}}.

[ondertekening] Voorzitter | {{voorzitter|VOORZITTER}}
[ondertekening] Notulist | {{notulist|NOTULIST}}
`;

/**
 * De besluiten van het standaardmodel "Turbo liquidatie" — het geval waarin er op het moment van
 * ontbinding geen baten meer zijn en de Vennootschap dus meteen ophoudt te bestaan. Dient als
 * beginpunt voor een nieuw model in Beheer; per stuk blijft alles aanpasbaar.
 */
export const LIQUIDATIE_BESLUIT_TURBO = `I. Ontbinding van de Vennootschap
> De Vennootschap wordt ontbonden met ingang van {{datumontbinding|DATUM}}. Nu de Vennootschap op voornoemd tijdstip haar activiteiten inmiddels heeft gestaakt en er geen baten meer zijn, hoeft er geen vereffening en verdeling meer plaats te vinden zodat de Vennootschap op het moment van ontbinding ophoudt te bestaan.

II. Terugtreden bestuurders en décharge
> De bestuurder van de Vennootschap treedt met ingang van het tijdstip van ontbinding uit functie van bestuurder. Aan de bestuurder wordt décharge verleend voor het na benoeming tot het tijdstip van ontbinding gevoerde bestuur respectievelijk het gedurende deze periode gevoerde toezicht.

III. Bewaarder administratie
> Tot bewaarder van de administratie van de Vennootschap wordt benoemd: {{bewaarder|BEWAARDER}}.
`;

/**
 * Kop + besluiten + staart aan elkaar. Lege kop of staart valt terug op de standaardtekst hierboven,
 * zodat het stuk altijd compleet is — ook als Beheer nog niet is ingericht.
 */
export function steltLiquidatieSamen({ kop, besluit, staart }) {
  const k = String(kop == null || !String(kop).trim() ? LIQUIDATIE_KOP : kop).replace(/\s+$/, "");
  const s = String(staart == null || !String(staart).trim() ? LIQUIDATIE_STAART : staart).replace(/^\s+/, "");
  const b = String(besluit == null ? "" : besluit).trim();
  return `${k}\n${b ? b + "\n\n" : ""}${s}`;
}
