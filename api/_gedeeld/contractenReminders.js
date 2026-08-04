/**
 * Verloopherinneringen voor de Contractenmodule (Contractmanagement-plan, Stap 5).
 *
 * Afgestemd met Wouter (02-08-2026): een contract krijgt een herinnering op TWEE soorten
 * drempels, allebei uitgedrukt in "dagen vóór de einddatum" zodat ze op één lijn gezet en
 * chronologisch afgehandeld kunnen worden:
 *   1) Vaste, generieke drempels voor elk contract: 90 en 30 dagen vóór de einddatum
 *      (VASTE_DAGEN hieronder).
 *   2) Een contract-specifieke drempel gebaseerd op het eigen `opzegtermijn_dagen`-veld: de
 *      klant krijgt ook een herinnering OPZEG_MARGE_DAGEN (14) dagen vóórdat de opzegtermijn
 *      zelf verstrijkt — dus vóórdat het te laat is om nog op te zeggen. In "dagen vóór de
 *      einddatum" is dat opzegtermijnDagen + OPZEG_MARGE_DAGEN. Alleen relevant als het
 *      contract een opzegtermijn heeft ingevuld.
 *
 * Eén contract kan dus tot 3 drempels hebben (bv. 90, 30, en een opzegtermijn-drempel die
 * ergens tussenin of juist vóór 90 kan vallen, afhankelijk van de eigen opzegtermijn). Ze worden
 * altijd in chronologische volgorde afgehandeld — de grootste "dagen vóór de einddatum" het
 * eerst — zodat een klant nooit een vroegere herinnering "overslaat" ook al zijn er ondertussen
 * meerdere drempels gepasseerd (bv. omdat de job een tijd niet gedraaid heeft): elke run
 * verstuurt hooguit ÉÉN herinnering per contract, de eerstvolgende die nog niet is verstuurd.
 *
 * dbo.contracten_klanten heeft maar twee trackingvelden (laatste_reminder_dagen,
 * laatste_reminder_verzonden_op) — geen losse vlag per drempel-type. Dat is bewust voldoende:
 * een drempel N geldt als "al verstuurd" zodra laatste_reminder_dagen bestaat én kleiner is dan
 * N (er is dus al een latere/dichterbij-de-einddatum-drempel verstuurd, dus een grotere/verdere
 * drempel is achterhaald). Wijzigt de klant de einddatum, dan reset wijzigContract() in
 * contractenKlanten.js deze velden automatisch, zodat de hele reeks drempels opnieuw beoordeeld
 * wordt voor de nieuwe datum.
 */
const { haalDynamicsToken } = require("./identiteit");
const { verstuurMail } = require("./mail");
const { isIngeschakeld } = require("./contractenInstellingen");
const { haalTeControlererenVoorReminders, markeerReminderVerzonden } = require("./contractenKlanten");
const { haalInstellingen } = require("./instellingen");

const VASTE_DAGEN = [90, 30];
const OPZEG_MARGE_DAGEN = 14;
const DAG_MS = 24 * 60 * 60 * 1000;

/** Alle drempels voor dit contract, in dagen vóór de einddatum, aflopend gesorteerd (grootste eerst). */
function berekenDrempels(contract) {
  const drempels = new Set(VASTE_DAGEN);
  if (contract.opzegtermijnDagen != null) {
    drempels.add(contract.opzegtermijnDagen + OPZEG_MARGE_DAGEN);
  }
  return [...drempels].sort((a, b) => b - a);
}

/**
 * Bepaalt of, en zo ja welke drempel, er vandaag voor dit contract verstuurd moet worden.
 * Geeft `null` terug als er niets te versturen valt (geen einddatum, al verlopen, geen drempel
 * bereikt, of de bereikte drempel(s) zijn al verstuurd).
 */
function bepaalTeVersturenDrempel(contract, vandaag) {
  if (!contract.einddatum) return null;
  const einddatum = new Date(contract.einddatum);
  if (isNaN(einddatum.getTime())) return null;
  const dagenTotEinddatum = Math.floor((einddatum.getTime() - vandaag.getTime()) / DAG_MS);
  if (dagenTotEinddatum < 0) return null; // al verlopen — geen nieuwe herinnering meer

  const bereikt = berekenDrempels(contract).filter((d) => dagenTotEinddatum <= d);
  const nogNietVerstuurd = bereikt.filter(
    (d) => contract.laatsteReminderDagen == null || d < contract.laatsteReminderDagen
  );
  if (nogNietVerstuurd.length === 0) return null;
  // Grootste (= verst vooruit, dus chronologisch eerste nog niet verstuurde) drempel.
  return Math.max(...nogNietVerstuurd);
}

/**
 * Zoekt het e-mailadres van "de klant zelf" op — de primaire contactpersoon van het
 * klant-account (besluit §5.4). Zelfde velden als herleidAccounts() in identiteit.js, maar
 * werkt rechtstreeks op een accountId (geen ingelogde gebruiker/req nodig — dit draait als
 * achtergrondtaak). Best-effort: geeft `null` bij elke fout, zodat één account zonder (geldig)
 * e-mailadres de rest van de run niet blokkeert.
 */
async function haalKlantEmailAdres(accountId) {
  try {
    const resource = process.env.DYNAMICS_RESOURCE_URL;
    if (!resource) return null;
    const token = await haalDynamicsToken();
    const res = await fetch(
      `${resource}/api/data/v9.2/accounts(${accountId})?$select=name&$expand=primarycontactid($select=emailaddress1,fullname)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const contact = data.primarycontactid || {};
    if (!contact.emailaddress1) return null;
    return { email: contact.emailaddress1, contactNaam: contact.fullname || "", klantnaam: data.name || "" };
  } catch {
    return null;
  }
}

function formatteerDatum(waarde) {
  const d = new Date(waarde);
  if (isNaN(d.getTime())) return String(waarde);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

/** Vervangt {sleutel}-variabelen in een door de beheerder ingevoerde onderwerp-/tekst-sjabloon —
 *  zie de PLACEHOLDERS-lijst in ContractenMailInstellingen.jsx voor welke variabelen beschikbaar
 *  zijn. Een onbekende {sleutel} blijft ongewijzigd staan i.p.v. te verdwijnen. */
function vulPlaceholdersIn(tekst, waarden) {
  return String(tekst || "").replace(/\{(\w+)\}/g, (heel, sleutel) => (waarden[sleutel] != null && waarden[sleutel] !== "" ? String(waarden[sleutel]) : heel));
}

/**
 * Stelt onderwerp + tekst van de verloopherinnering samen. `instellingen.contractenReminder
 * Onderwerp`/`contractenReminderTekst` (Beheer → Facturatie → Betaalde functionaliteiten →
 * "Verloopherinnering per e-mail", zie ContractenMailInstellingen.jsx) overschrijven, indien
 * ingevuld, de ingebouwde standaardtekst hieronder — met {klant}/{contract}/{leverancier}/
 * {einddatum}/{dagen}/{opzegtermijn} als variabelen.
 */
function maakOnderwerpEnTekst(contract, dagenVoorEinddatum, klant, instellingen = {}) {
  const naamRegel = klant.contactNaam ? `Beste ${klant.contactNaam.split(" ")[0]},` : "Beste,";
  const einddatumTekst = formatteerDatum(contract.einddatum);
  const standaardOnderwerp = `Uw contract "${contract.naam}" verloopt op ${einddatumTekst}`;
  const regels = [
    naamRegel,
    "",
    `Dit is een automatische herinnering vanuit uw klantportaal: het contract "${contract.naam}"` +
      (contract.leverancier ? ` bij ${contract.leverancier}` : "") +
      ` verloopt op ${einddatumTekst} (over ${dagenVoorEinddatum} dagen).`,
  ];
  if (contract.opzegtermijnDagen != null) {
    regels.push(
      "",
      `Let op: dit contract heeft een opzegtermijn van ${contract.opzegtermijnDagen} dagen — wilt u niet ` +
        `verlengen, dan moet u tijdig opzeggen.`
    );
  }
  regels.push(
    "",
    "U kunt de details van dit contract inzien en aanpassen in uw klantportaal, tab Contracten.",
    "",
    "Met vriendelijke groet,",
    "Activaa"
  );
  const standaardTekst = regels.join("\n");

  const eigenOnderwerp = (instellingen.contractenReminderOnderwerp || "").trim();
  const eigenTekst = (instellingen.contractenReminderTekst || "").trim();
  if (!eigenOnderwerp && !eigenTekst) {
    return { onderwerp: standaardOnderwerp, tekst: standaardTekst };
  }

  const waarden = {
    klant: klant.contactNaam ? klant.contactNaam.split(" ")[0] : "",
    contract: contract.naam,
    leverancier: contract.leverancier || "",
    einddatum: einddatumTekst,
    dagen: dagenVoorEinddatum,
    opzegtermijn: contract.opzegtermijnDagen != null ? contract.opzegtermijnDagen : "",
  };
  return {
    onderwerp: eigenOnderwerp ? vulPlaceholdersIn(eigenOnderwerp, waarden) : standaardOnderwerp,
    tekst: eigenTekst ? vulPlaceholdersIn(eigenTekst, waarden) : standaardTekst,
  };
}

/**
 * Verwerkt alle contracten die vandaag een herinnering nodig hebben. Bedoeld om dagelijks
 * aangeroepen te worden door een extern schema, zie api/contracten-reminders/index.js.
 */
async function verwerkReminders() {
  const vandaag = new Date(new Date().toISOString().slice(0, 10)); // middernacht UTC, datum-only
  const contracten = await haalTeControlererenVoorReminders();
  // Best effort: als de instellingen-opslag (nog) niet beschikbaar is, gewoon de ingebouwde
  // standaardtekst + het standaard afzenderadres gebruiken i.p.v. de hele run te laten mislukken.
  const instellingen = await haalInstellingen().catch(() => ({}));
  const resultaten = [];

  // Cache per accountId, zodat we niet voor elk contract van dezelfde klant opnieuw de
  // module-status en het e-mailadres opvragen.
  const moduleStatusCache = new Map();
  const emailCache = new Map();

  for (const contract of contracten) {
    const dagenVoorEinddatum = bepaalTeVersturenDrempel(contract, vandaag);
    if (dagenVoorEinddatum == null) continue;

    try {
      if (!moduleStatusCache.has(contract.klantAccountId)) {
        moduleStatusCache.set(contract.klantAccountId, await isIngeschakeld(contract.klantAccountId));
      }
      if (!moduleStatusCache.get(contract.klantAccountId)) {
        resultaten.push({ contractId: contract.id, klantAccountId: contract.klantAccountId, dagenVoorEinddatum, verzonden: false, reden: "module staat uit voor dit account" });
        continue;
      }

      if (!emailCache.has(contract.klantAccountId)) {
        emailCache.set(contract.klantAccountId, await haalKlantEmailAdres(contract.klantAccountId));
      }
      const klant = emailCache.get(contract.klantAccountId);
      if (!klant || !klant.email) {
        resultaten.push({ contractId: contract.id, klantAccountId: contract.klantAccountId, dagenVoorEinddatum, verzonden: false, reden: "geen (geldig) e-mailadres bij de primaire contactpersoon gevonden" });
        continue;
      }

      const { onderwerp, tekst } = maakOnderwerpEnTekst(contract, dagenVoorEinddatum, klant, instellingen);
      await verstuurMail({ ontvangers: [klant.email], onderwerp, tekst, afzender: instellingen.contractenReminderAfzender });
      await markeerReminderVerzonden(contract.id, dagenVoorEinddatum);

      resultaten.push({ contractId: contract.id, klantAccountId: contract.klantAccountId, dagenVoorEinddatum, verzonden: true, naarEmail: klant.email });
    } catch (err) {
      resultaten.push({ contractId: contract.id, klantAccountId: contract.klantAccountId, dagenVoorEinddatum, verzonden: false, fout: String(err.message || err) });
    }
  }

  return resultaten;
}

module.exports = { verwerkReminders, berekenDrempels, bepaalTeVersturenDrempel, haalKlantEmailAdres, VASTE_DAGEN, OPZEG_MARGE_DAGEN };
