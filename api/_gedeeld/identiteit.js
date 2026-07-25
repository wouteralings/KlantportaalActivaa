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
 * Herleidt de ingelogde gebruiker naar AL zijn Contact + Account-koppelingen in Dataverse.
 * Eén e-mailadres kan bij meerdere Contact-records horen (bijv. eenzelfde persoon als
 * contactpersoon bij meerdere klantorganisaties) — die worden dan allemaal teruggegeven.
 * Er is geen aparte toegangsadministratie nodig: de koppeling die in Dynamics al bestaat
 * (Contact -> parentcustomerid Account) bepaalt precies wat deze gebruiker mag zien.
 *
 * Gooit een fout met een 'code' veld zodat de aanroepende Function een passende status kan zetten.
 */
/**
 * Naam van het klantcategorie-veld op Account in Dataverse. Overschrijf via de
 * Application Setting DYNAMICS_KLANTCATEGORIE_VELD als het bij jullie anders heet
 * (bijv. "cr3a2_klantcategorie" i.p.v. dit voorbeeld).
 */
const KLANTCATEGORIE_VELD = process.env.DYNAMICS_KLANTCATEGORIE_VELD || "new_klantcategorie";

// Navigatie-eigenschappen (schemanamen) van de eigen lookup-velden op Account naar de
// systemuser: de relatiebeheerder (veld "Manager") en de accountant. Overschrijf via
// Application Settings als de schemanaam bij jullie anders is.
const RELATIEBEHEERDER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
const ACCOUNTANT_NAV = process.env.DYNAMICS_ACCOUNTANT_NAV || "sk_Accountant";

async function herleidAccounts(req, token) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  const email = haalEmailUitPrincipal(req);

  if (!email) {
    const fout = new Error("Kon geen e-mailadres uit de ingelogde gebruiker halen.");
    fout.code = "GEEN_IDENTITEIT";
    throw fout;
  }

  const veilig = email.replace(/'/g, "''");
  // De relatiebeheerder (veld "Manager") en de accountant zijn eigen lookup-velden op Account
  // naar de systemuser. We halen ze op via een geneste $expand. Kloppen de schemanamen bij
  // jullie niet, pas ze dan aan via de Application Settings DYNAMICS_RELATIEBEHEERDER_NAV /
  // DYNAMICS_ACCOUNTANT_NAV (i.p.v. deze code).
  const query =
    `${resource}/api/data/v9.2/contacts` +
    `?$select=contactid,fullname,emailaddress1` +
    `&$filter=emailaddress1 eq '${veilig}'` +
    `&$expand=parentcustomerid_account($select=accountid,accountnumber,name,address1_line1,` +
    `address1_postalcode,address1_city,emailaddress1,telephone1,${KLANTCATEGORIE_VELD};` +
    `$expand=${RELATIEBEHEERDER_NAV}($select=fullname,internalemailaddress,mobilephone,address1_telephone1),` +
    `${ACCOUNTANT_NAV}($select=fullname,internalemailaddress,mobilephone,address1_telephone1))`;

  const res = await fetch(query, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      // Geeft naast de ruwe optieset-waarde ook het leesbare label mee
      // (bijv. "...@OData.Community.Display.V1.FormattedValue": "Zorg").
      Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    },
  });

  if (!res.ok) {
    const tekst = await res.text();
    const fout = new Error(`Contacten opzoeken bij Dynamics mislukt: ${tekst}`);
    fout.code = "DYNAMICS_FOUT";
    throw fout;
  }

  const data = await res.json();
  const contacten = (data.value || []).filter((c) => c.parentcustomerid_account);

  if (contacten.length === 0) {
    const fout = new Error(
      `Geen gekoppeld account gevonden voor ${email}. Controleer of er een Contact bestaat ` +
      `met dit e-mailadres, gekoppeld aan een Account (parentcustomerid).`
    );
    fout.code = "GEEN_KOPPELING";
    throw fout;
  }

  return {
    email,
    accounts: contacten.map((contact) => {
      const account = contact.parentcustomerid_account;
      const labelSleutel = `${KLANTCATEGORIE_VELD}@OData.Community.Display.V1.FormattedValue`;
      const categorieLabel = account[labelSleutel] || "";
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

      return {
        contactId: contact.contactid,
        contactNaam: contact.fullname,
        accountId: account.accountid,
        klantnummer: account.accountnumber || "",
        klantnaam: account.name,
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

module.exports = { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal, KLANTCATEGORIE_VELD };
