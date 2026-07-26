const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalReviews, haalUitnodigingen } = require("../_gedeeld/reviewopslag");

// Zelfde veld-/navigatienamen als in identiteit.js (overschrijfbaar via Application Settings).
const CLIENTNUMMER_VELD = process.env.DYNAMICS_CLIENTNUMMER_VELD || "sk_clientnummer";
const GROEPSNAAM_NAV = process.env.DYNAMICS_GROEPSNAAM_NAV || "sk_Groepsnaam";
const GROEPSNAAM_NAAMVELD = process.env.DYNAMICS_GROEPSNAAM_NAAMVELD || "sk_name";
const RELATIEBEHEERDER_NAV = process.env.DYNAMICS_RELATIEBEHEERDER_NAV || "cr283_Manager";
const ACCOUNTANT_NAV = process.env.DYNAMICS_ACCOUNTANT_NAV || "sk_Accountant";
const MAX_KLANTEN = Number(process.env.BEHEER_MAX_KLANTEN || 3000);

async function haalAlleKlanten(resource, token) {
  const startQuery =
    `${resource}/api/data/v9.2/accounts` +
    `?$select=accountid,${CLIENTNUMMER_VELD},name` +
    `&$filter=_primarycontactid_value ne null and statecode eq 0` +
    `&$expand=primarycontactid($select=contactid,fullname,emailaddress1),` +
    `${GROEPSNAAM_NAV}($select=${GROEPSNAAM_NAAMVELD}),` +
    `${RELATIEBEHEERDER_NAV}($select=fullname),` +
    `${ACCOUNTANT_NAV}($select=fullname)` +
    `&$orderby=name asc`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: "odata.maxpagesize=1000",
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
        relatiebeheerder: rb ? rb.fullname || "" : "",
        accountant: acc ? acc.fullname || "" : "",
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
