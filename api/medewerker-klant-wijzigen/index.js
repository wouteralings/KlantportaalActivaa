const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen } = require("../_gedeeld/wijzigrechten");

// Alleen deze (tekst)velden mogen via het medewerkersportaal gewijzigd worden.
const ACCOUNT_VELDEN = [
  "name", "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
  "address1_postalcode", "address1_city", "address1_country",
  "telephone1", "emailaddress1",
  // Classificatie-keuzevelden (numerieke optieset-waarde):
  process.env.DYNAMICS_KLANT_CLIENTTYPE_VELD || "businesstypecode",
  process.env.DYNAMICS_KLANT_STATUS_VELD || "cr283_clienttype",
  process.env.DYNAMICS_KLANT_TEAM_VELD || "cr283_team",
  process.env.DYNAMICS_KLANT_KANTOOR_VELD || "cr283_kantoor",
];
const CONTACT_VELDEN = [
  "firstname", "middlename", "lastname", "jobtitle",
  "emailaddress1", "mobilephone", "telephone1",
  "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
  "address1_postalcode", "address1_city", "address1_country",
];

function filterVelden(bron, toegestaan) {
  const uit = {};
  for (const veld of toegestaan) {
    if (bron && Object.prototype.hasOwnProperty.call(bron, veld)) {
      uit[veld] = bron[veld] === "" ? null : bron[veld];
    }
  }
  return uit;
}

async function patch(resource, token, entiteitSet, id, body) {
  const res = await fetch(`${resource}/api/data/v9.2/${entiteitSet}(${id})`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${entiteitSet} bijwerken mislukt (${res.status}): ${await res.text()}`);
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const email = haalEmailUitPrincipal(req);
    const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
    if (!(await magWijzigen(email, beheerder))) {
      context.res = { status: 403, body: { error: "Je hebt geen rechten om klantgegevens te wijzigen." } };
      return;
    }

    const { accountId, contactId, account, contact } = req.body || {};
    if (!accountId) {
      context.res = { status: 400, body: { error: "Geef 'accountId' mee." } };
      return;
    }

    const accountVelden = filterVelden(account, ACCOUNT_VELDEN);
    const contactVelden = filterVelden(contact, CONTACT_VELDEN);
    if (Object.keys(accountVelden).length === 0 && Object.keys(contactVelden).length === 0) {
      context.res = { status: 400, body: { error: "Geen wijzigbare velden meegegeven." } };
      return;
    }

    const token = await haalDynamicsToken();

    if (Object.keys(accountVelden).length > 0) {
      await patch(resource, token, "accounts", accountId, accountVelden);
    }
    if (contactId && Object.keys(contactVelden).length > 0) {
      await patch(resource, token, "contacts", contactId, contactVelden);
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
  } catch (err) {
    context.log.error(err);
    // Onvoldoende schrijfrechten van het app-account geeft doorgaans een 403 vanuit Dataverse.
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Wijzigen is niet gelukt. Mogelijk heeft het portaal-account onvoldoende schrijfrechten in Dynamics.", detail: String(err) },
    };
  }
};
