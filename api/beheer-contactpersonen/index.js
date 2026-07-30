const { haalDynamicsToken } = require("../_gedeeld/identiteit");

/**
 * Contactpersonen-overzicht voor het medewerkersportaal — de tegenhanger van
 * /api/beheer-klanten, maar op de Dataverse-tabel `contacts` in plaats van `accounts`.
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder').
 *
 * GET → { contactpersonen: [ ... ], afgekapt: bool }
 *
 * Let op de koppelrichting bij Activaa: op het Contact zelf staat GEEN bedrijf
 * (parentcustomerid is leeg — zie de uitleg bij herleidAccounts in _gedeeld/identiteit.js).
 * De koppeling loopt vanaf het Account: primarycontactid (primaire contactpersoon) en het
 * eigen lookupveld voor de secundaire contactpersoon. Om per contactpersoon te kunnen tonen
 * bij welke kliënt(en) hij hoort, halen we daarom ook een lichte accountlijst op (alleen id,
 * naam, nummer en de twee contactlookups) en draaien we die om naar contactid → kliënten.
 * Eén contactpersoon kan bij meerdere kliënten horen; dan staan ze er allemaal bij.
 */

const FV = "@OData.Community.Display.V1.FormattedValue";
const MAX_CONTACTPERSONEN = Number(process.env.BEHEER_MAX_CONTACTPERSONEN || 5000);
const MAX_KLANTEN = Number(process.env.BEHEER_MAX_KLANTEN || 3000);
const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
// Attribuut- (logische) naam van het lookupveld "secundaire contactpersoon" op Account.
const SECUNDAIR_ATTR = process.env.DYNAMICS_KLANT_SECUNDAIRCONTACT_VELD || "cr283_secundairecontactpersoon";

// Velden op Contact die altijd bestaan (standaard Dataverse-velden).
const VASTE_CONTACTVELDEN = [
  "contactid", "fullname", "firstname", "middlename", "lastname", "jobtitle",
  "emailaddress1", "mobilephone", "telephone1",
  "address1_line1", "address1_postalcode", "address1_city", "address1_country",
  "birthdate", "createdon",
];

// Eigen/optionele velden: bestaat er één niet onder deze naam, dan laten we precies dát veld
// weg en proberen het opnieuw — zelfde vangnet als in herleidAccounts, zodat één verkeerde
// schemanaam niet het hele overzicht sloopt.
const OPTIONELE_CONTACTVELDEN = [
  process.env.DYNAMICS_CONTACT_AANHEF_VELD || "sk_aanhef",
  process.env.DYNAMICS_CONTACT_HUISNUMMER_VELD || "cr283_huisnummer",
  process.env.DYNAMICS_CONTACT_TOEVOEGING_VELD || "cr283_huisnummertoevoeging",
].filter(Boolean);

function maakHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };
}

/** Loopt alle pagina's af tot `max` rijen. Geeft ook terug of er nog meer was (afgekapt). */
async function haalPaginas(startUrl, headers, max) {
  const alles = [];
  let url = startUrl;
  let laatsteFout = "";
  while (url && alles.length < max) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      laatsteFout = await res.text();
      const fout = new Error(laatsteFout);
      fout.status = res.status;
      throw fout;
    }
    const data = await res.json();
    alles.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
  }
  return { rijen: alles.slice(0, max), afgekapt: alles.length >= max && !!url };
}

/** Haalt alle actieve contactpersonen op, met terugval als een optioneel veld niet bestaat. */
async function haalContactpersonen(resource, token) {
  const headers = maakHeaders(token);
  const maakUrl = (optioneel) =>
    `${resource}/api/data/v9.2/contacts` +
    `?$select=${[...VASTE_CONTACTVELDEN, ...optioneel].join(",")}` +
    `&$filter=statecode eq 0` +
    `&$orderby=fullname asc`;

  let actief = [...OPTIONELE_CONTACTVELDEN];
  for (let poging = 0; poging <= OPTIONELE_CONTACTVELDEN.length; poging++) {
    try {
      return await haalPaginas(maakUrl(actief), headers, MAX_CONTACTPERSONEN);
    } catch (err) {
      const boosdoener = actief.find((v) => String(err.message || "").includes(v));
      if (!boosdoener) throw err;
      actief = actief.filter((v) => v !== boosdoener);
    }
  }
  return { rijen: [], afgekapt: false };
}

/**
 * Lichte accountlijst om contactid → kliënt(en) te kunnen bepalen. Bestaat het lookupveld voor
 * de secundaire contactpersoon niet onder de verwachte naam, dan halen we alleen de primaire op.
 * Best-effort: mislukt dit helemaal, dan komt het overzicht er gewoon zonder kliëntkolom.
 */
async function haalKlantKoppelingen(resource, token) {
  const headers = maakHeaders(token);
  const maakUrl = (metSecundair) =>
    `${resource}/api/data/v9.2/accounts` +
    `?$select=accountid,name,${CLIENTNUMMER_VELD},_primarycontactid_value` +
    (metSecundair ? `,_${SECUNDAIR_ATTR}_value` : "") +
    `&$filter=statecode eq 0` +
    `&$orderby=name asc`;

  let rijen = [];
  try {
    rijen = (await haalPaginas(maakUrl(true), headers, MAX_KLANTEN)).rijen;
  } catch (err) {
    if (!String(err.message || "").includes(SECUNDAIR_ATTR)) throw err;
    rijen = (await haalPaginas(maakUrl(false), headers, MAX_KLANTEN)).rijen;
  }

  // contactid → [{ accountId, klantnaam, klantnummer, rol }]
  const perContact = new Map();
  const voegToe = (contactId, account, rol) => {
    if (!contactId) return;
    const nummer = account[CLIENTNUMMER_VELD];
    const lijst = perContact.get(contactId) || [];
    lijst.push({
      accountId: account.accountid,
      klantnaam: account.name || "",
      klantnummer: nummer != null && nummer !== "" ? String(nummer) : "",
      rol,
    });
    perContact.set(contactId, lijst);
  };
  for (const a of rijen) {
    voegToe(a._primarycontactid_value, a, "Primair");
    voegToe(a[`_${SECUNDAIR_ATTR}_value`], a, "Secundair");
  }
  return perContact;
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const [{ rijen, afgekapt }, perContact] = await Promise.all([
      haalContactpersonen(resource, token),
      haalKlantKoppelingen(resource, token).catch((err) => {
        context.log.warn ? context.log.warn(`Kliëntkoppelingen ophalen mislukt: ${err}`) : context.log(`Kliëntkoppelingen ophalen mislukt: ${err}`);
        return new Map();
      }),
    ]);

    const aanhefVeld = OPTIONELE_CONTACTVELDEN[0];
    const huisnummerVeld = OPTIONELE_CONTACTVELDEN[1];
    const toevoegingVeld = OPTIONELE_CONTACTVELDEN[2];

    const contactpersonen = rijen.map((c) => {
      const klanten = perContact.get(c.contactid) || [];
      // Voor de tabel platgeslagen varianten, zodat sorteren en filteren op tekst werkt.
      const klantnamen = klanten.map((k) => k.klantnaam).filter(Boolean).join(", ");
      const klantnummers = klanten.map((k) => k.klantnummer).filter(Boolean).join(", ");
      const rollen = [...new Set(klanten.map((k) => k.rol))].join(", ");
      return {
        contactId: c.contactid,
        naam: c.fullname || "",
        voornaam: c.firstname || "",
        tussenvoegsel: c.middlename || "",
        achternaam: c.lastname || "",
        aanhef: (aanhefVeld && (c[aanhefVeld + FV] || c[aanhefVeld])) || "",
        functie: c.jobtitle || "",
        email: c.emailaddress1 || "",
        mobiel: c.mobilephone || "",
        telefoon: c.telephone1 || "",
        straat: c.address1_line1 || "",
        huisnummer: (huisnummerVeld && c[huisnummerVeld]) || "",
        toevoeging: (toevoegingVeld && c[toevoegingVeld]) || "",
        postcode: c.address1_postalcode || "",
        plaats: c.address1_city || "",
        land: c.address1_country || "",
        geboortedatum: c.birthdate || "",
        aangemaakt: c.createdon || "",
        klanten,
        klantnamen,
        klantnummers,
        rollen,
      };
    });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { contactpersonen, afgekapt },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de contactpersonen.", detail: String(err) },
    };
  }
};
