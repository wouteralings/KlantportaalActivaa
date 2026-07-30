/**
 * /api/medewerker-contactpersoon — bewerken van één contactpersoon én het koppelen/ontkoppelen
 * van een contactpersoon aan een cliënt (Account), vanuit het contactpersonen-overzicht in het
 * medewerkersportaal.
 *
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder'). Binnen dit
 * endpoint wordt per actie fijnmaziger afgedwongen:
 *   - GET  ?zoekKlant=<term>                 → cliënten zoeken om aan te koppelen (medewerker + beheerder)
 *   - PATCH { actie: "bewerken", ... }        → contactvelden wijzigen  (gate: magWijzigen)
 *   - PATCH { actie: "koppel",   ... }        → primaire contactpersoon zetten (gate: BEHEERDER)
 *   - PATCH { actie: "ontkoppel",... }        → primaire contactpersoon verwijderen (gate: BEHEERDER)
 *
 * Waarom koppelen beheerder-only is: de portaal-toegang (en dus het delen van het volledige
 * dossier: documenten, NAW, taken, facturen) loopt uitsluitend via 'Primaire contactpersoon' op
 * het Account — zie herleidAccounts in _gedeeld/identiteit.js. Iemand koppelen betekent letterlijk
 * die persoon toegang geven; de vórige primaire contactpersoon verliest daarmee juist zijn toegang.
 * Daarom is dit een bewuste, beveiligde en dubbel te bevestigen handeling.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magWijzigen } = require("../_gedeeld/wijzigrechten");

const FV = "@OData.Community.Display.V1.FormattedValue";
const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
const MAX_KLANT_ZOEK = 25;

// Alleen deze contactvelden mogen via het portaal gewijzigd worden — bewust dezelfde set als in
// api/medewerker-klant-wijzigen, zodat contactgegevens overal op dezelfde manier bewerkbaar zijn.
const CONTACT_VELDEN = [
  "firstname", "middlename", "lastname", "jobtitle",
  "emailaddress1", "mobilephone", "telephone1",
  "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
  "address1_postalcode", "address1_city", "address1_country",
];

function jsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
}

function leesHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };
}

/** Alleen de meegegeven, toegestane velden overhouden; "" wordt null (leegmaken). */
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
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${entiteitSet} bijwerken mislukt (${res.status}): ${await res.text()}`);
}

/** Cliënten zoeken op naam of cliëntnummer, met de huidige primaire contactpersoon erbij. */
async function zoekKlanten(resource, token, term) {
  const veilig = String(term).replace(/'/g, "''");
  const numeriek = /^\d+$/.test(term.trim());
  // Op naam altijd; op cliëntnummer alleen als de term een getal is (het nummerveld is tekst/among).
  const filters = [`contains(name,'${encodeURIComponent(veilig)}')`];
  if (numeriek) filters.push(`contains(${CLIENTNUMMER_VELD},'${encodeURIComponent(veilig)}')`);
  const url =
    `${resource}/api/data/v9.2/accounts` +
    `?$select=accountid,name,${CLIENTNUMMER_VELD},_primarycontactid_value` +
    `&$filter=(${filters.join(" or ")}) and statecode eq 0` +
    `&$expand=primarycontactid($select=contactid,fullname,emailaddress1)` +
    `&$top=${MAX_KLANT_ZOEK}&$orderby=name asc`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) throw new Error(`Cliënten zoeken mislukt (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map((a) => {
    const p = a.primarycontactid || null;
    const nummer = a[CLIENTNUMMER_VELD];
    return {
      accountId: a.accountid,
      klantnaam: a.name || "",
      klantnummer: nummer != null && nummer !== "" ? String(nummer) : "",
      primairContactId: p ? p.contactid : "",
      primairNaam: p ? p.fullname || "" : "",
      primairEmail: p ? p.emailaddress1 || "" : "",
    };
  });
}

/** Eén contactpersoon licht ophalen (naam/e-mail) — voor nette meldingen en teruggave. */
async function haalContactKort(resource, token, contactId) {
  const url = `${resource}/api/data/v9.2/contacts(${contactId})?$select=contactid,fullname,emailaddress1`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const c = await res.json();
  return { contactId: c.contactid, naam: c.fullname || "", email: c.emailaddress1 || "" };
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  const email = haalEmailUitPrincipal(req);
  const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
  const methode = (req.method || "GET").toUpperCase();

  try {
    const token = await haalDynamicsToken();

    // ── Cliënten zoeken (om aan te koppelen) ──────────────────────────────
    if (methode === "GET") {
      const term = (req.query.zoekKlant || "").trim();
      if (term.length < 2) {
        context.res = { headers: { "Content-Type": "application/json" }, body: { klanten: [] } };
        return;
      }
      const klanten = await zoekKlanten(resource, token, term);
      context.res = { headers: { "Content-Type": "application/json" }, body: { klanten } };
      return;
    }

    if (methode !== "PATCH" && methode !== "POST") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
      return;
    }

    const { actie, contactId, accountId, contact } = req.body || {};

    // ── Contactpersoon bewerken (gate: magWijzigen) ───────────────────────
    if (actie === "bewerken") {
      if (!(await magWijzigen(email, beheerder))) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen rechten om contactgegevens te wijzigen." } };
        return;
      }
      if (!contactId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'contactId' mee." } };
        return;
      }
      const velden = filterVelden(contact, CONTACT_VELDEN);
      if (Object.keys(velden).length === 0) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geen wijzigbare velden meegegeven." } };
        return;
      }
      await patch(resource, token, "contacts", contactId, velden);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    // ── Koppelen / ontkoppelen (gate: BEHEERDER) ──────────────────────────
    if (actie === "koppel" || actie === "ontkoppel") {
      if (!beheerder) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen een beheerder mag contactpersonen aan cliënten koppelen." } };
        return;
      }
      if (!accountId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' mee." } };
        return;
      }

      if (actie === "koppel") {
        if (!contactId) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'contactId' mee." } };
          return;
        }
        // Zet deze contactpersoon als PRIMAIRE contactpersoon op het Account. Overschrijft een
        // eventuele bestaande primaire contactpersoon (die verliest daarmee zijn portaal-toegang).
        await patch(resource, token, "accounts", accountId, {
          "primarycontactid@odata.bind": `/contacts(${contactId})`,
        });
        const contactKort = await haalContactKort(resource, token, contactId);
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, contact: contactKort } };
        return;
      }

      // ontkoppel: primaire contactpersoon verwijderen ($ref DELETE). 404 = was al leeg.
      const res = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})/primarycontactid/$ref`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Primaire contactpersoon loskoppelen mislukt (${res.status}): ${await res.text()}`);
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende of ontbrekende 'actie'." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Bewerken is niet gelukt. Mogelijk heeft het portaal-account onvoldoende schrijfrechten in Dynamics.", detail: String(err) },
    };
  }
};
