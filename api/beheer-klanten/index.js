const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalReviews, haalUitnodigingen } = require("../_gedeeld/reviewopslag");

// Veld-/navigatienamen (overschrijfbaar via Application Settings). Defaults = de velden zoals ze
// in de Dynamics-view "1. Klantoverzicht" bij Activaa staan.
const CLIENTNUMMER_VELD = process.env.DYNAMICS_CLIENTNUMMER_VELD || "sk_clientnummer";
const GROEPSNAAM_NAV = process.env.DYNAMICS_GROEPSNAAM_NAV || "sk_Groepsnaam";
const GROEPSNAAM_NAAMVELD = process.env.DYNAMICS_GROEPSNAAM_NAAMVELD || "sk_name";
const RELATIEBEHEERDER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
const ACCOUNTANT_NAV = process.env.DYNAMICS_ACCOUNTANT_NAV || "sk_Accountant";
const SHAREPOINT_VELD = process.env.DYNAMICS_KLANT_SHAREPOINT_VELD || "cr283_sharepoint";
const KVK_VELD = process.env.DYNAMICS_KVK_VELD || "accountnumber";

// Keuzelijst-/tekstvelden op Account (gelezen via het leesbare label / FormattedValue).
const CLIENTTYPE_VELD = process.env.DYNAMICS_KLANT_CLIENTTYPE_VELD || "businesstypecode";      // Onderneming / Natuurlijk persoon
const STATUS_VELD = process.env.DYNAMICS_KLANT_STATUS_VELD || "cr283_clienttype";              // Cliënt / Onboarding / Prospect
const TEAM_VELD = process.env.DYNAMICS_KLANT_TEAM_VELD || "cr283_team";                        // A&R / FS
const KANTOOR_VELD = process.env.DYNAMICS_KLANT_KANTOOR_VELD || "cr283_kantoor";               // Activaa

// Lookup-velden op Account (gelezen via het _<veld>_value + FormattedValue label).
const ASSISTENT_VELD = process.env.DYNAMICS_KLANT_ASSISTENT_VELD || "cr283_assistant1";
const FISCAALMEDEWERKER_VELD = process.env.DYNAMICS_KLANT_FISCAALMEDEWERKER_VELD || "cr283_fiscaalmedewerker";
const LOONADMIN_VELD = process.env.DYNAMICS_KLANT_LOONADMIN_VELD || "cr283_verantwoordelijkeloonadministratie";
const BELASTINGKANTOOR_VELD = process.env.DYNAMICS_KLANT_BELASTINGKANTOOR_VELD || "cr283_belastingkantoor";

const MAX_KLANTEN = Number(process.env.BEHEER_MAX_KLANTEN || 3000);
const FV = "@OData.Community.Display.V1.FormattedValue";

async function haalAlleKlanten(resource, token) {
  const keuzeVelden = [CLIENTTYPE_VELD, STATUS_VELD, TEAM_VELD, KANTOOR_VELD].filter(Boolean);
  const lookupVelden = [ASSISTENT_VELD, FISCAALMEDEWERKER_VELD, LOONADMIN_VELD, BELASTINGKANTOOR_VELD].filter(Boolean);

  const selectVelden = [
    "accountid", CLIENTNUMMER_VELD, "name", KVK_VELD, SHAREPOINT_VELD,
    "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
    "address1_postalcode", "address1_city", "address1_country",
    "emailaddress1", "telephone1",
    ...keuzeVelden,
    ...lookupVelden.map((v) => `_${v}_value`),
  ].filter(Boolean);

  const expand = [
    `primarycontactid($select=contactid,fullname,firstname,middlename,lastname,jobtitle,emailaddress1,mobilephone,telephone1)`,
    `${GROEPSNAAM_NAV}($select=${GROEPSNAAM_NAAMVELD})`,
    `${RELATIEBEHEERDER_NAV}($select=fullname,internalemailaddress,mobilephone)`,
    `${ACCOUNTANT_NAV}($select=fullname,internalemailaddress,mobilephone)`,
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

// Keuzelijst-/tekstveld: voorkeur voor het leesbare label (FormattedValue).
function leesVeld(rij, veld) {
  if (!veld) return "";
  if (rij[veld + FV] != null) return rij[veld + FV];
  return rij[veld] != null ? rij[veld] : "";
}
// Lookup-veld: het leesbare label van de gekoppelde record.
function leesLookup(rij, veld) {
  if (!veld) return "";
  return rij[`_${veld}_value${FV}`] || "";
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

    const persoonUitExpand = (nav, rij) => {
      const u = nav ? rij[nav] : null;
      return u ? { naam: u.fullname || "", email: u.internalemailaddress || "", telefoon: u.mobilephone || "" } : null;
    };
    const persoonUitLookup = (veld, rij) => {
      const naam = leesLookup(rij, veld);
      return naam ? { naam, email: "", telefoon: "" } : null;
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
        belastingkantoor: leesLookup(a, BELASTINGKANTOOR_VELD),
        kvk: a[KVK_VELD] || "",
        sharepointUrl: a[SHAREPOINT_VELD] || "",
        relatiebeheerder: rb ? rb.fullname || "" : "",
        accountant: acc ? acc.fullname || "" : "",
        assistent: persoonUitLookup(ASSISTENT_VELD, a),
        fiscaalMedewerker: persoonUitLookup(FISCAALMEDEWERKER_VELD, a),
        loonadministratie: persoonUitLookup(LOONADMIN_VELD, a),
        manager: persoonUitExpand(RELATIEBEHEERDER_NAV, a),
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
