const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalReviews, haalUitnodigingen } = require("../_gedeeld/reviewopslag");

// Zelfde veld-/navigatienamen als in identiteit.js (overschrijfbaar via Application Settings).
const CLIENTNUMMER_VELD = process.env.DYNAMICS_CLIENTNUMMER_VELD || "sk_clientnummer";
const GROEPSNAAM_NAV = process.env.DYNAMICS_GROEPSNAAM_NAV || "sk_Groepsnaam";
const GROEPSNAAM_NAAMVELD = process.env.DYNAMICS_GROEPSNAAM_NAAMVELD || "sk_name";
const RELATIEBEHEERDER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
const ACCOUNTANT_NAV = process.env.DYNAMICS_ACCOUNTANT_NAV || "sk_Accountant";

// SharePoint-linkveld op Account (bekend bij Activaa). Overschrijf via Application Setting.
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const KVK_VELD = process.env.DYNAMICS_KVK_VELD || "accountnumber";

// Extra kolommen voor het klantoverzicht. Leeg = kolom wordt niet opgevraagd (toont "—").
// Zet de LOGISCHE veldnaam via de bijbehorende Application Setting.
//  - Keuzelijst-/tekstvelden op Account:
const CLIENTTYPE_VELD = process.env.DYNAMICS_KLANT_CLIENTTYPE_VELD || "";       // bijv. Onderneming / Natuurlijk persoon
const STATUS_VELD = process.env.DYNAMICS_KLANT_STATUS_VELD || "";              // bijv. Cliënt / Onboarding / Prospect
const TEAM_VELD = process.env.DYNAMICS_KLANT_TEAM_VELD || "";                  // bijv. A&R / FS
const KANTOOR_VELD = process.env.DYNAMICS_KLANT_KANTOOR_VELD || "";            // bijv. Activaa
const BELASTINGKANTOOR_VELD = process.env.DYNAMICS_KLANT_BELASTINGKANTOOR_VELD || ""; // bijv. Kantoor Utrecht
//  - Lookups naar systemuser (navigatie-/schemanaam):
const ASSISTENT_NAV = process.env.DYNAMICS_ASSISTENT_NAV || "";
const FISCAALMEDEWERKER_NAV = process.env.DYNAMICS_FISCAALMEDEWERKER_NAV || "";
const LOONADMIN_NAV = process.env.DYNAMICS_LOONADMIN_NAV || "";

const MAX_KLANTEN = Number(process.env.BEHEER_MAX_KLANTEN || 3000);
const FV = "@OData.Community.Display.V1.FormattedValue";

async function haalAlleKlanten(resource, token) {
  const keuzeVelden = [CLIENTTYPE_VELD, STATUS_VELD, TEAM_VELD, KANTOOR_VELD, BELASTINGKANTOOR_VELD].filter(Boolean);
  const selectVelden = [
    "accountid", CLIENTNUMMER_VELD, "name", KVK_VELD, SHAREPOINT_VELD,
    "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
    "address1_postalcode", "address1_city", "address1_country",
    "emailaddress1", "telephone1",
    ...keuzeVelden,
  ].filter(Boolean);

  const persoonNavs = [RELATIEBEHEERDER_NAV, ACCOUNTANT_NAV, ASSISTENT_NAV, FISCAALMEDEWERKER_NAV, LOONADMIN_NAV].filter(Boolean);
  const expand = [
    `primarycontactid($select=contactid,fullname,firstname,middlename,lastname,jobtitle,emailaddress1,mobilephone,telephone1)`,
    `${GROEPSNAAM_NAV}($select=${GROEPSNAAM_NAAMVELD})`,
    ...persoonNavs.map((nav) => `${nav}($select=fullname,internalemailaddress,mobilephone)`),
  ].join(",");

  const startQuery =
    `${resource}/api/data/v9.2/accounts` +
    `?$select=${selectVelden.join(",")}` +
    `&$filter=_primarycontactid_value ne null and statecode eq 0` +
    `&$expand=${expand}` +
    `&$orderby=name asc`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };

  const alles = [];
  let url = startQuery;
  while (url && alles.length < MAX_KLANTEN) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Ophalen klanten mislukt: ${await res.text()}`);
    const data = await res.json();
    alles.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
  }
  return { rijen: alles.slice(0, MAX_KLANTEN), afgekapt: alles.length >= MAX_KLANTEN && !!url };
}

// Leest een keuzelijst-/tekstveld met voorkeur voor het leesbare label (FormattedValue).
function leesVeld(rij, veld) {
  if (!veld) return "";
  if (rij[veld + FV] != null) return rij[veld + FV];
  return rij[veld] != null ? rij[veld] : "";
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const [{ rijen, afgekapt }, reviews, uitnodigingen] = await Promise.all([
      haalAlleKlanten(resource, token),
      haalReviews().catch(() => []),
      haalUitnodigingen().catch(() => ({})),
    ]);

    // Reviews indexeren per account: aantal + laatste (nieuwste) review.
    const perAccount = new Map();
    for (const r of reviews) {
      if (!r.accountId) continue;
      const huidig = perAccount.get(r.accountId) || { aantal: 0, laatste: null };
      huidig.aantal += 1;
      if (!huidig.laatste || new Date(r.datum) > new Date(huidig.laatste.datum)) {
        huidig.laatste = { datum: r.datum, sterren: r.sterren };
      }
      perAccount.set(r.accountId, huidig);
    }

    const persoon = (nav, rij) => {
      const u = nav ? rij[nav] : null;
      return u ? { naam: u.fullname || "", email: u.internalemailaddress || "", telefoon: u.mobilephone || "" } : null;
    };

    const klanten = rijen.map((a) => {
      const contact = a.primarycontactid || {};
      const groep = a[GROEPSNAAM_NAV];
      const rb = a[RELATIEBEHEERDER_NAV];
      const acc = a[ACCOUNTANT_NAV];
      const rev = perAccount.get(a.accountid);
      return {
        accountId: a.accountid,
        klantnummer: a[CLIENTNUMMER_VELD] ?? "",
        klantnaam: a.name || "",
        groepsnaam: groep ? groep[GROEPSNAAM_NAAMVELD] || "" : "",
        clienttype: leesVeld(a, CLIENTTYPE_VELD),
        status: leesVeld(a, STATUS_VELD),
        team: leesVeld(a, TEAM_VELD),
        kantoor: leesVeld(a, KANTOOR_VELD),
        belastingkantoor: leesVeld(a, BELASTINGKANTOOR_VELD),
        kvk: a[KVK_VELD] || "",
        sharepointUrl: a[SHAREPOINT_VELD] || "",
        relatiebeheerder: rb ? rb.fullname || "" : "",
        accountant: acc ? acc.fullname || "" : "",
        assistent: persoon(ASSISTENT_NAV, a),
        fiscaalMedewerker: persoon(FISCAALMEDEWERKER_NAV, a),
        loonadministratie: persoon(LOONADMIN_NAV, a),
        contact: {
          naam: contact.fullname || "",
          voornaam: contact.firstname || "",
          tussenvoegsel: contact.middlename || "",
          achternaam: contact.lastname || "",
          functietitel: contact.jobtitle || "",
          email: contact.emailaddress1 || "",
          telefoon: contact.mobilephone || contact.telephone1 || "",
        },
        adres: {
          straat: a.address1_line1 || "",
          huisnummer: a.cr283_huisnummer || "",
          toevoeging: a.cr283_huisnummertoevoeging || "",
          postcode: a.address1_postalcode || "",
          plaats: a.address1_city || "",
          land: a.address1_country || "",
        },
        emailKlant: a.emailaddress1 || "",
        telefoonKlant: a.telephone1 || "",
        // Compat met bestaand reviewbeheer:
        contactNaam: contact.fullname || "",
        contactEmail: contact.emailaddress1 || "",
        aantalReviews: rev ? rev.aantal : 0,
        laatsteReview: rev ? rev.laatste : null,
        laatsteUitnodiging: uitnodigingen[a.accountid] || null,
      };
    });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { klanten, afgekapt },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij ophalen van de klantenlijst.", detail: String(err) },
    };
  }
};
