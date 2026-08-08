const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { haalGastenPerEmail, normaliseerEmail } = require("../_gedeeld/gastaccounts");

/**
 * Contactpersonen-overzicht voor het medewerkersportaal — de tegenhanger van
 * /api/beheer-klanten, maar op de Dataverse-tabel `contacts` in plaats van `accounts`.
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder'). Door
 * Beheer → Kolommen zelf toegevoegde extra Dynamics-velden (instellingen.contactpersonenExtraKolommen)
 * komen per contactpersoon terecht onder "extra" — zelfde idee als bij /api/beheer-klanten.
 *
 * GET → { contactpersonen: [ ... ], afgekapt: bool }
 *
 * Let op de koppelrichting bij Activaa: op het Contact zelf staat GEEN bedrijf
 * (parentcustomerid is leeg — zie de uitleg bij herleidAccounts in _gedeeld/identiteit.js).
 * De koppeling loopt vanaf het Account: primarycontactid (primaire contactpersoon) en het
 * eigen lookupveld voor de secundaire contactpersoon. Om per contactpersoon te kunnen tonen
 * bij welke cliënt(en) hij hoort, halen we daarom ook een lichte accountlijst op (alleen id,
 * naam, nummer en de twee contactlookups) en draaien we die om naar contactid → cliënten.
 * Eén contactpersoon kan bij meerdere cliënten horen; dan staan ze er allemaal bij.
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

// Zelfde leeshelpers als api/beheer-klanten/index.js — hier apart herhaald, dit bestand houdt
// bewust geen gedeelde afhankelijkheid met dat andere overzicht.
function leesVeld(rij, veld) {
  if (!veld) return "";
  if (rij[veld + FV] != null) return rij[veld + FV];
  return rij[veld] != null ? rij[veld] : "";
}
function leesLookup(rij, veld) {
  if (!veld) return "";
  return rij[`_${veld}_value${FV}`] || "";
}
function leesExtra(rij, def) {
  return def.type === "lookup" ? leesLookup(rij, def.veld) : leesVeld(rij, def.veld);
}

/** Haalt alle actieve contactpersonen op, met terugval als een optioneel of extra veld niet
 *  bestaat. `extraKolommen` = door Beheer → Kolommen zelf toegevoegde velden (zie hierboven). */
async function haalContactpersonen(resource, token, extraKolommen) {
  const headers = maakHeaders(token);
  const extraDefs = Array.isArray(extraKolommen) ? extraKolommen.filter((c) => c && c.veld) : [];
  const extraSelect = extraDefs.map((c) => (c.type === "lookup" ? `_${c.veld}_value` : c.veld));
  const maakUrl = (optioneel) =>
    `${resource}/api/data/v9.2/contacts` +
    `?$select=${[...VASTE_CONTACTVELDEN, ...optioneel].join(",")}` +
    `&$filter=statecode eq 0` +
    `&$orderby=fullname asc`;

  let actief = [...OPTIONELE_CONTACTVELDEN, ...extraSelect];
  for (let poging = 0; poging <= actief.length; poging++) {
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
 * Lichte accountlijst om contactid → cliënt(en) te kunnen bepalen. Bestaat het lookupveld voor
 * de secundaire contactpersoon niet onder de verwachte naam, dan halen we alleen de primaire op.
 * Best-effort: mislukt dit helemaal, dan komt het overzicht er gewoon zonder cliëntkolom.
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
    const instellingen = await haalInstellingen().catch(() => ({}));
    const extraKolommen = (instellingen.contactpersonenExtraKolommen || []).filter((c) => c && c.veld);
    const [{ rijen, afgekapt }, perContact, gastenPerEmail] = await Promise.all([
      haalContactpersonen(resource, token, extraKolommen),
      haalKlantKoppelingen(resource, token).catch((err) => {
        context.log.warn ? context.log.warn(`Cliëntkoppelingen ophalen mislukt: ${err}`) : context.log(`Cliëntkoppelingen ophalen mislukt: ${err}`);
        return new Map();
      }),
      // Best-effort: heeft dit contact een B2B-gastaccount (voor de groen-vinkje-kolom in het
      // overzicht)? Faalt dit (bijv. Graph-permissie), dan blijft de kolom leeg i.p.v. het hele
      // overzicht te breken. Gecachet in gastaccounts.js, dus niet elke load raakt Graph.
      haalGastenPerEmail().catch((err) => {
        context.log.error(`Gastaccount-status ophalen mislukt: ${err}`);
        return null;
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
      // "actief" | "pending" (uitgenodigd, nog niet geaccepteerd) | "geblokkeerd" | "" (geen account).
      let gastStatus = "";
      if (gastenPerEmail) {
        const g = gastenPerEmail.get(normaliseerEmail(c.emailaddress1));
        if (g) gastStatus = !g.accountEnabled ? "geblokkeerd" : g.externalUserState === "PendingAcceptance" ? "pending" : "actief";
      }
      const extra = {};
      for (const def of extraKolommen) extra[def.veld] = leesExtra(c, def);
      return {
        contactId: c.contactid,
        extra,
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
        gastStatus,
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
