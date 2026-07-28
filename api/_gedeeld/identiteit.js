/**
 * Gedeelde helpers voor:
 *  1) een app-only token ophalen bij Entra ID (client credentials flow)
 *  2) de ingelogde portalgebruiker herleiden naar zijn Contact + Account in Dataverse
 *
 * Vereist dezelfde Application Settings als de bestaande /api/klanten:
 *   DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET, DYNAMICS_RESOURCE_URL
 */

async function haalDynamicsToken() {
  const tenantId = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const clientSecret = process.env.DYNAMICS_CLIENT_SECRET;
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!tenantId || !clientId || !clientSecret || !resource) {
    throw new Error("MISSING_CONFIG");
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: `${resource}/.default`,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const tekst = await res.text();
    throw new Error(`Token ophalen mislukt (${res.status}): ${tekst}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Leest de x-ms-client-principal header die Azure Static Web Apps automatisch meestuurt
 * voor elke geauthenticeerde request, en haalt daar het meest betrouwbare e-mailadres uit.
 * Voor AAD B2B-gastgebruikers staat het echte e-mailadres vaak in de claims (preferred_username
 * of emailaddress), niet altijd bruikbaar in userDetails (dat kan de #EXT#-notatie bevatten).
 */
function haalEmailUitPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;

  let principal;
  try {
    principal = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return null;
  }

  const claims = principal.claims || [];
  const emailClaim = claims.find((c) =>
    ["emailaddress", "preferred_username", "email"].some((sleutel) =>
      (c.typ || "").toLowerCase().includes(sleutel)
    )
  );

  const kandidaat = emailClaim?.val || principal.userDetails;
  if (!kandidaat) return null;

  // Gastgebruikers-UPN's zien er soms uit als "naam_bedrijf.nl#EXT#@tenant.onmicrosoft.com".
  // Het echte adres staat dan vóór "#EXT#", met een underscore i.p.v. de laatste @ van het domein.
  if (kandidaat.includes("#EXT#")) {
    const voorEXT = kandidaat.split("#EXT#")[0];
    const laatsteUnderscore = voorEXT.lastIndexOf("_");
    if (laatsteUnderscore > -1) {
      return voorEXT.slice(0, laatsteUnderscore) + "@" + voorEXT.slice(laatsteUnderscore + 1);
    }
  }

  return kandidaat;
}

/**
 * Leest de weergavenaam van de ingelogde gebruiker uit de x-ms-client-principal header.
 * Anders dan /.auth/me (dat geen claims teruggeeft) bevat deze header wél de token-claims,
 * inclusief de 'name'-claim — voor AAD B2B-gasten is dat hun weergavenaam (bijv. "Wouter Alings").
 * Valt terug op given_name + family_name als 'name' ontbreekt. Geeft "" als er niets bruikbaars is.
 */
function haalNaamUitPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return "";

  let principal;
  try {
    principal = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return "";
  }

  const claims = principal.claims || [];
  const claimVal = (...sleutels) => {
    for (const sleutel of sleutels) {
      const c = claims.find((x) => (x.typ || "").toLowerCase().endsWith(sleutel));
      if (c && c.val && !c.val.includes("@")) return c.val.trim();
    }
    return "";
  };

  const naam = claimVal("/name", "name");
  if (naam) return naam;
  const voor = claimVal("givenname", "given_name");
  const achter = claimVal("surname", "family_name");
  return [voor, achter].filter(Boolean).join(" ").trim();
}

/** Leest de rollen (userRoles) van de ingelogde gebruiker uit de x-ms-client-principal header. */
function haalRollenUitPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return [];
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    return Array.isArray(principal.userRoles) ? principal.userRoles : [];
  } catch {
    return [];
  }
}

/**
 * Herleidt de ingelogde gebruiker naar AL zijn gekoppelde Accounts in Dataverse.
 *
 * De koppeling bij Activaa loopt via het veld "Primair contactpersoon" (primarycontactid)
 * OP HET ACCOUNT: elk klant-Account wijst naar de Contactpersoon van de klant. De ingelogde
 * portalgebruiker is dus de primaire contactpersoon van één of meer Accounts, en precies die
 * Accounts mag hij zien. (Let op: dit is NIET het veld "Bedrijfsnaam"/parentcustomerid op het
 * Contact — dat is bij Activaa leeg.)
 *
 * Eén e-mailadres kan bij meerdere Accounts horen (dezelfde persoon als primaire contactpersoon
 * bij meerdere klantorganisaties) — die worden dan allemaal teruggegeven. Er is geen aparte
 * toegangsadministratie nodig: de koppeling die in Dynamics al bestaat bepaalt wat hij ziet.
 *
 * Gooit een fout met een 'code' veld zodat de aanroepende Function een passende status kan zetten.
 */
/**
 * Naam van het klantcategorie-veld op Account in Dataverse. Overschrijf via de
 * Application Setting DYNAMICS_KLANTCATEGORIE_VELD als het bij jullie anders heet
 * (bijv. "cr3a2_klantcategorie" i.p.v. dit voorbeeld).
 */
// De klantcategorie ("rechtsvorm") staat op Account in het veld sk_rechtsvorm. Overschrijf
// via de Application Setting DYNAMICS_KLANTCATEGORIE_VELD als het bij jullie anders heet.
// Zet expliciet op "-" (of een andere niet-bestaande naam) om het veld niet te gebruiken.
const KLANTCATEGORIE_VELD = process.env.DYNAMICS_KLANTCATEGORIE_VELD || "sk_rechtsvorm";

// Navigatie-eigenschappen (schemanamen) van de eigen lookup-velden op Account naar de
// systemuser: de relatiebeheerder (veld "Manager") en de accountant. Overschrijf via
// Application Settings als de schemanaam bij jullie anders is.
const RELATIEBEHEERDER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
const ACCOUNTANT_NAV = process.env.DYNAMICS_ACCOUNTANT_NAV || "sk_Accountant";

// Het echte cliëntnummer staat op Account in het veld sk_clientnummer (NIET accountnumber).
const CLIENTNUMMER_VELD = process.env.DYNAMICS_CLIENTNUMMER_VELD || "sk_clientnummer";
// Het automatische cliëntnummer (sk_clientnrauto) — hetzelfde nummer als in het klantoverzicht.
// Wordt op de achtergrond meegestuurd (o.a. als &ID in de webhooks), los van wat de klant ziet.
const CLIENTNRAUTO_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
// Het KvK-nummer staat op het Account in 'accountnumber'. Is dit gevuld, dan wordt het
// bedrijfsadres automatisch met de KvK gesynchroniseerd (en is het in het portaal read-only).
const KVK_VELD = process.env.DYNAMICS_KVK_VELD || "accountnumber";
// Het BTW-nummer staat (naar verwachting) op het Account in het veld sk_btwnummer — gebruikt om
// de eigen bedrijfsgegevens (Facturatiemodule → Bedrijfsgegevens & logo) mee voor te vullen.
// Overschrijf via de Application Setting DYNAMICS_BTW_VELD als de schemanaam bij jullie anders is.
// Bestaat het veld (nog) niet onder die naam, dan valt herleidAccounts() er automatisch op terug
// om het gewoon niet mee te selecteren, zodat de rest van de koppeling blijft werken.
const BTW_VELD = process.env.DYNAMICS_BTW_VELD || "sk_btwnummer";
// De groepsnaam ("cliëntgroep", bv. ACTIVAA/JOWO) is een lookup op Account naar de entiteit
// sk_groepen; de leesbare naam staat daar in het veld sk_name.
const GROEPSNAAM_NAV = process.env.DYNAMICS_GROEPSNAAM_NAV || "sk_Groepsnaam";
const GROEPSNAAM_NAAMVELD = process.env.DYNAMICS_GROEPSNAAM_NAAMVELD || "sk_name";

async function herleidAccounts(req, token) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const email = haalEmailUitPrincipal(req);

  if (!email) {
    const fout = new Error("Kon geen e-mailadres uit de ingelogde gebruiker halen.");
    fout.code = "GEEN_IDENTITEIT";
    throw fout;
  }

  const veilig = email.replace(/'/g, "''");
  // We zoeken alle actieve Accounts waarvan de PRIMAIRE CONTACTPERSOON dit e-mailadres heeft.
  // De relatiebeheerder (veld "Manager") en de accountant zijn eigen lookup-velden op Account
  // naar de systemuser; die halen we mee via $expand. Kloppen de schemanamen bij jullie niet,
  // pas ze dan aan via de Application Settings DYNAMICS_RELATIEBEHEERDER_NAV / DYNAMICS_ACCOUNTANT_NAV.
  const maakQuery = (metBtw) =>
    `${resource}/api/data/v9.2/accounts` +
    `?$select=accountid,${CLIENTNUMMER_VELD},${CLIENTNRAUTO_VELD},${KVK_VELD}${metBtw && BTW_VELD ? "," + BTW_VELD : ""},name,address1_line1,cr283_huisnummer,` +
    `cr283_huisnummertoevoeging,address1_postalcode,address1_city,address1_country,` +
    `emailaddress1,telephone1${KLANTCATEGORIE_VELD ? "," + KLANTCATEGORIE_VELD : ""}` +
    `&$filter=primarycontactid/emailaddress1 eq '${veilig}' and statecode eq 0` +
    `&$expand=primarycontactid($select=contactid,fullname,firstname,middlename,lastname,jobtitle,` +
    `mobilephone,telephone1,emailaddress1,birthdate,salutation,sk_aanhef,address1_line1,` +
    `cr283_huisnummer,cr283_huisnummertoevoeging,address1_postalcode,address1_city,` +
    `address1_stateorprovince,address1_country),` +
    `${GROEPSNAAM_NAV}($select=${GROEPSNAAM_NAAMVELD}),` +
    `${RELATIEBEHEERDER_NAV}($select=fullname,internalemailaddress,mobilephone,address1_telephone1),` +
    `${ACCOUNTANT_NAV}($select=fullname,internalemailaddress,mobilephone,address1_telephone1)`;

  const HEADERS = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    // Geeft naast de ruwe optieset-waarde ook het leesbare label mee
    // (bijv. "...@OData.Community.Display.V1.FormattedValue": "Zorg").
    Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };

  let res = await fetch(maakQuery(true), { headers: HEADERS });
  let tekstBijFout = "";
  if (!res.ok) {
    tekstBijFout = await res.text();
    // Staat het BTW-veld (nog) niet onder deze naam in Dataverse, val dan terug op de query
    // zonder dat veld — zo blijft de rest van de koppeling gewoon werken totdat de juiste
    // schemanaam is ingesteld via de Application Setting DYNAMICS_BTW_VELD.
    if (BTW_VELD && tekstBijFout.includes(BTW_VELD)) {
      res = await fetch(maakQuery(false), { headers: HEADERS });
    }
  }

  if (!res.ok) {
    const tekst = tekstBijFout || (await res.text());
    const fout = new Error(`Contacten opzoeken bij Dynamics mislukt: ${tekst}`);
    fout.code = "DYNAMICS_FOUT";
    throw fout;
  }

  const data = await res.json();
  const accountsRuw = data.value || [];

  if (accountsRuw.length === 0) {
    const fout = new Error(
      `Geen gekoppeld account gevonden voor ${email}. Controleer of er een Account bestaat ` +
      `waarbij dit e-mailadres als Primair contactpersoon is ingesteld.`
    );
    fout.code = "GEEN_KOPPELING";
    throw fout;
  }

  return {
    email,
    accounts: accountsRuw.map((account) => {
      const categorieLabel = KLANTCATEGORIE_VELD
        ? account[KLANTCATEGORIE_VELD + "@OData.Community.Display.V1.FormattedValue"] || ""
        : "";
      // Bij een multiselect-optieset staan meerdere labels gescheiden door een komma.
      const klantcategorieen = categorieLabel
        ? categorieLabel.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const maakPersoon = (u) =>
        u
          ? {
              naam: u.fullname || "",
              email: u.internalemailaddress || "",
              telefoon: u.mobilephone || u.address1_telephone1 || "",
            }
          : null;

      const relatiebeheerder = maakPersoon(account[RELATIEBEHEERDER_NAV]);
      const accountant = maakPersoon(account[ACCOUNTANT_NAV]);
      const contact = account.primarycontactid || {};
      // De contactpersoon-gegevens (persoon + privé-adres). Aanhef is een optieset (sk_aanhef);
      // we tonen het leesbare label. 'Functie rol' (sk_functietype) laten we bewust weg.
      const aanhefLabel =
        contact["sk_aanhef@OData.Community.Display.V1.FormattedValue"] || contact.salutation || "";
      const contactpersoon = {
        naam: contact.fullname || "",
        aanhef: aanhefLabel,
        voornaam: contact.firstname || "",
        tussenvoegsel: contact.middlename || "",
        achternaam: contact.lastname || "",
        functietitel: contact.jobtitle || "",
        mobiel: contact.mobilephone || contact.telephone1 || "",
        email: contact.emailaddress1 || "",
        geboortedatum: contact.birthdate || "",
        adres: {
          straat: contact.address1_line1 || "",
          huisnummer: contact.cr283_huisnummer || "",
          toevoeging: contact.cr283_huisnummertoevoeging || "",
          postcode: contact.address1_postalcode || "",
          plaats: contact.address1_city || "",
          provincie: contact.address1_stateorprovince || "",
          land: contact.address1_country || "",
        },
        // compat met bestaande code die 'telefoon' verwacht:
        telefoon: contact.mobilephone || contact.telephone1 || "",
      };
      const groep = account[GROEPSNAAM_NAV];
      const clientnr = account[CLIENTNUMMER_VELD];
      const clientnrAuto = account[CLIENTNRAUTO_VELD];

      return {
        contactId: contact.contactid || null,
        contactNaam: contact.fullname || "",
        contactpersoon,
        accountId: account.accountid,
        klantnummer: clientnr != null && clientnr !== "" ? clientnr : "",
        // Alleen voor de achtergrond (o.a. webhook-ID); niet wat de klant in het portaal ziet.
        clientnrAuto: clientnrAuto != null && clientnrAuto !== "" ? clientnrAuto : "",
        klantnaam: account.name,
        groepsnaam: groep ? groep[GROEPSNAAM_NAAMVELD] || "" : "",
        klantcategorieen,
        relatiebeheerder,
        accountant,
        // 'adviseur' blijft bestaan voor terugwaartse compatibiliteit (= relatiebeheerder).
        adviseur: relatiebeheerder,
        account,
      };
    }),
  };
}

module.exports = { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal, KLANTCATEGORIE_VELD };
