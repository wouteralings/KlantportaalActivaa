import OffertetoolApp from "./offertes/OffertetoolApp";

/** Offertes-module: de Offertetool, geïntegreerd als tab in het medewerkersportaal.
 *
 * Stap 4 van het integratieplan: in plaats van de Offertetool scherm voor schern te
 * herbouwen in een eigen sub-tab-structuur, is `OffertetoolApp` (voorheen `App.jsx` in de
 * losstaande offerte-tool-activaa-repo) vrijwel ongewijzigd hierheen verhuisd — dat bleek bij
 * nader inzien één hecht verweven component van ruim 8500 regels met een eigen interne
 * stap-navigatie (Klant → Diensten → Prijzen → ... → Instellingen), niet 6 losstaande
 * schermen. Handmatig opsplitsen zou een veel grotere ingreep zijn geweest met reëel risico op
 * subtiele functionele verschillen — dat woog niet op tegen het cosmetische voordeel van een
 * subtab-balk die er als de rest van het portaal uitziet (zie het integratieplan, Stap 4, en
 * de projectdoc "Klantportaal — overzicht en status" voor de afweging).
 *
 * Wat wél is aangepast t.o.v. de losstaande tool (zie src/medewerker/offertes/OffertetoolApp.jsx
 * voor de details): de hernoemde API-paden uit Stap 2 (offertes-instellingen/-klanten/
 * -verstuur-mail), het startscherm slaat de eigen inlogstap over (het Klantportaal heeft al
 * ingelogd), en de eigen "Topbalk" (logo/naam/avatar/uitloggen) is verwijderd omdat
 * MedewerkerPortaal.jsx die al toont. De rechtencheck (Instellingen-sub-scherm beheerders-only)
 * bepaalt de tool zelf, via zijn eigen /api/ben-ik-beheerder-aanroep — die gebruikt sinds
 * Stap 3 dezelfde Azure-rol 'beheerder' als de rest van het Klantportaal.
 */
export default function OffertesModule() {
  return <OffertetoolApp />;
}
