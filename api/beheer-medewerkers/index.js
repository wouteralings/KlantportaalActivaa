const { haalDynamicsToken } = require("../_gedeeld/identiteit");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 * Haalt de actieve medewerkers (systemusers) van Activaa op uit Dynamics, voor het toekennen
 * van wijzig-rechten. GET → { medewerkers: [{ id, naam, email }] }.
 */
module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }
  try {
    const token = await haalDynamicsToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "odata.maxpagesize=1000",
    };
    // Actieve, interne gebruikers met een e-mailadres; applicatie-/systeemaccounts (applicationid) uitgesloten.
    const start =
      `${resource}/api/data/v9.2/systemusers` +
      `?$select=systemuserid,fullname,internalemailaddress` +
      `&$filter=isdisabled eq false and internalemailaddress ne null and applicationid eq null` +
      `&$orderby=fullname asc`;

    const alles = [];
    let next = start;
    while (next && alles.length < 2000) {
      const res = await fetch(next, { headers });
      if (!res.ok) throw new Error(`Ophalen medewerkers mislukt (${res.status}): ${await res.text()}`);
      const data = await res.json();
      alles.push(...(data.value || []));
      next = data["@odata.nextLink"] || null;
    }
    const medewerkers = alles
      .map((u) => ({ id: u.systemuserid, naam: u.fullname || "", email: (u.internalemailaddress || "").toLowerCase() }))
      .filter((m) => m.email);

    context.res = { headers: { "Content-Type": "application/json" }, body: { medewerkers } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de medewerkers niet ophalen.", detail: String(err) } };
  }
};
