const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalReviews, haalUitnodigingen } = require("../_gedeeld/reviewopslag");
const { haalInstellingen } = require("../_gedeeld/instellingen");

// Veld-/navigatienamen (overschrijfbaar via Application Settings). Defaults = de velden zoals ze
// in de Dynamics-view "1. Klantoverzicht" bij Activaa staan.
const CLIENTNUMMER_VELD = process.env.DYNAMICS_CLIENTNUMMER_VELD || "sk_clientnummer";
const GROEPSNAAM_NAV = process.env.DYNAMICS_GROEPSNAAM_NAV || "sk_Groepsnaam";
const GROEPSNAAM_NAAMVELD = process.env.DYNAMICS_GROEPSNAAM_NAAMVELD || "sk_name";
const RELATIEBEHEERDER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
const ACCOUNTANT_NAV = process.env.DYNAMICS_ACCOUNTANT_NAV || "sk_Accountant";
// Attribuut- (logische) namen van manager/accountant, voor het meelezen van de GUID (_value).
const RELATIEBEHEERDER_ATTR = process.env.DYNAMICS_RELATIEBEHEERDER_VELD || "cr283_manager";
const ACCOUNTANT_ATTR = process.env.DYNAMICS_ACCOUNTANT_VELD || "sk_accountant";
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
const BACKUP_VELD = process.env.DYNAMICS_KLANT_BACKUP_VELD || "cr283_assistent2";
const BELASTINGKANTOOR_VELD = process.env.DYNAMICS_KLANT_BELASTINGKANTOOR_VELD || "cr283_belastingkantoor";
// Navigatie-eigenschap van de secundaire contactpersoon (lookup naar contact).
const SECUNDAIR_NAV = process.env.DYNAMICS_KLANT_SECUNDAIRCONTACT_NAV || "cr283_Secundairecontactpersoon";

const MAX_KLANTEN = Number(process.env.BEHEER_MAX_KLANTEN || 3000);
const FV = "@OData.Community.Display.V1.FormattedValue";

async function haalAlleKlanten(resource, token, extraKolommen) {
  const keuzeVelden = [CLIENTTYPE_VELD, STATUS_VELD, TEAM_VELD, KANTOOR_VELD].filter(Boolean);
  const lookupVelden = [ASSISTENT_VELD, FISCAALMEDEWERKER_VELD, LOONADMIN_VELD, BACKUP_VELD, BELASTINGKANTOOR_VELD].filter(Boolean);

  // Door de beheerder toegevoegde extra kolommen (tekst/keuze op het veld zelf, lookup via _value).
  const extra = Array.isArray(extraKolommen) ? extraKolommen.filter((c) => c && c.veld) : [];
  const extraSelect = extra.map((c) => (c.type === "lookup" ? `_${c.veld}_value` : c.veld));

  const selectVelden = [
    "accountid", CLIENTNUMMER_VELD, "name", KVK_VELD, SHAREPOINT_VELD,
    "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
    "address1_postalcode", "address1_city", "address1_country",
    "emailaddress1", "telephone1",
    ...keuzeVelden,
    ...lookupVelden.map((v) => `_${v}_value`),
    `_${RELATIEBEHEERDER_ATTR}_value`, `_${ACCOUNTANT_ATTR}_value`,
    ...extraSelect,
  ].filter(Boolean);

  const expand = [
    `primarycontactid($select=contactid,fullname,firstname,middlename,lastname,jobtitle,emailaddress1,mobilephone,telephone1,address1_line1,cr283_huisnummer,cr283_huisnummertoevoeging,address1_postalcode,address1_city,address1_country)`,
    `${GROEPSNAAM_NAV}($select=${GROEPSNAAM_NAAMVELD})`,
    `${RELATIEBEHEERDER_NAV}($select=fullname,internalemailaddress,mobilephone)`,
    `${ACCOUNTANT_NAV}($select=fullname,internalemailaddress,mobilephone)`,
    `${SECUNDAIR_NAV}($select=contactid,fullname,firstname,middlename,lastname,jobtitle,emailaddress1,mobilephone,telephone1,address1_line1,cr283_huisnummer,cr283_huisnummertoevoeging,address1_postalcode,address1_city,address1_country)`,
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

// Haalt naam/e-mail/telefoon van systemusers op in batches. Best-effort: bij een fout
// (of geen ids) komt er een lege map terug, zodat de medewerker-details terugvallen op de naam.
async function haalSystemusers(resource, token, ids) {
  const uniek = [...new Set((ids || []).filter(Boolean))];
  const map = {};
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
  for (let i = 0; i < uniek.length; i += 60) {
    const chunk = uniek.slice(i, i + 60);
    const filter = chunk.map((id) => `systemuserid eq ${id}`).join(" or ");
    const url = `${resource}/api/data/v9.2/systemusers?$select=systemuserid,fullname,internalemailaddress,mobilephone&$filter=${filter}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      for (const u of data.value || []) {
        map[u.systemuserid] = { naam: u.fullname || "", email: u.internalemailaddress || "", telefoon: u.mobilephone || "" };
      }
    } catch {
      // negeren; terugval op naam-only
    }
  }
  return map;
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const instellingen = await haalInstellingen().catch(() => ({}));
    const extraKolommen = (instellingen.klantoverzicht && instellingen.klantoverzicht.extraKolommen) || [];
    const [{ rijen, afgekapt }, reviews, uitnodigingen] = await Promise.all([
      haalAlleKlanten(resource, token, extraKolommen),
      haalReviews().catch(() => []),
      haalUitnodigingen().catch(() => ({})),
    ]);

    // Medewerker-lookups (assistent/fiscaal/loon) verrijken met e-mail + telefoon via systemusers.
    const lookupAttrs = [ASSISTENT_VELD, FISCAALMEDEWERKER_VELD, LOONADMIN_VELD, BACKUP_VELD].filter(Boolean);
    const persoonIds = [];
    for (const a of rijen) {
      for (const v of lookupAttrs) {
        const id = a[`_${v}_value`];
        if (id) persoonIds.push(id);
      }
    }
    const gebruikerMap = await haalSystemusers(resource, token, persoonIds).catch(() => ({}));

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

    const persoonUitExpand = (nav, rij, attr) => {
      const u = nav ? rij[nav] : null;
      const id = attr ? rij[`_${attr}_value`] || "" : "";
      return u ? { naam: u.fullname || "", email: u.internalemailaddress || "", telefoon: u.mobilephone || "", id } : null;
    };
    const persoonUitLookup = (veld, rij) => {
      const id = rij[`_${veld}_value`];
      const naam = leesLookup(rij, veld);
      if (!id && !naam) return null;
      const verrijkt = id ? gebruikerMap[id] : null;
      return {
        naam: (verrijkt && verrijkt.naam) || naam || "",
        email: (verrijkt && verrijkt.email) || "",
        telefoon: (verrijkt && verrijkt.telefoon) || "",
        id: id || "",
      };
    };

    const extraDefs = Array.isArray(extraKolommen) ? extraKolommen.filter((c) => c && c.veld) : [];
    const leesExtra = (a, def) => (def.type === "lookup" ? leesLookup(a, def.veld) : leesVeld(a, def.veld));

    const klanten = rijen.map((a) => {
      const contact = a.primarycontactid || {};
      const groep = a[GROEPSNAAM_NAV];
      const rb = a[RELATIEBEHEERDER_NAV];
      const acc = a[ACCOUNTANT_NAV];
      const rev = perAccount.get(a.accountid);
      const extra = {};
      for (const def of extraDefs) extra[def.veld] = leesExtra(a, def);
      return {
        extra,
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
        backup: persoonUitLookup(BACKUP_VELD, a),
        manager: persoonUitExpand(RELATIEBEHEERDER_NAV, a, RELATIEBEHEERDER_ATTR),
        accountantPersoon: persoonUitExpand(ACCOUNTANT_NAV, a, ACCOUNTANT_ATTR),
        secundairContact: (() => {
          const s = a[SECUNDAIR_NAV];
          if (!s) return null;
          return {
            contactId: s.contactid || "",
            naam: s.fullname || "",
            voornaam: s.firstname || "", tussenvoegsel: s.middlename || "", achternaam: s.lastname || "",
            functietitel: s.jobtitle || "",
            email: s.emailaddress1 || "",
            telefoon: s.mobilephone || s.telephone1 || "",
            adres: {
              straat: s.address1_line1 || "", huisnummer: s.cr283_huisnummer || "", toevoeging: s.cr283_huisnummertoevoeging || "",
              postcode: s.address1_postalcode || "", plaats: s.address1_city || "", land: s.address1_country || "",
            },
          };
        })(),
        contact: {
          contactId: contact.contactid || "",
          naam: contact.fullname || "",
          voornaam: contact.firstname || "",
          tussenvoegsel: contact.middlename || "",
          achternaam: contact.lastname || "",
          functietitel: contact.jobtitle || "",
          email: contact.emailaddress1 || "",
          telefoon: contact.mobilephone || contact.telephone1 || "",
          adres: {
            straat: contact.address1_line1 || "",
            huisnummer: contact.cr283_huisnummer || "",
            toevoeging: contact.cr283_huisnummertoevoeging || "",
            postcode: contact.address1_postalcode || "",
            plaats: contact.address1_city || "",
            land: contact.address1_country || "",
          },
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
