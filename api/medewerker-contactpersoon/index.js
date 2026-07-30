/**
 * /api/medewerker-contactpersoon — bewerken van één contactpersoon én het koppelen/ontkoppelen
 * van een contactpersoon aan een cliënt (Account), vanuit het contactpersonen-overzicht in het
 * medewerkersportaal. Legt elke handeling vast in het logboek (api/_gedeeld/klantlog.js), zodat
 * bij de cliënt én bij de contactpersoon terug te zien is wie wat wanneer heeft gedaan.
 *
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder'). Binnen dit
 * endpoint wordt per actie fijnmaziger afgedwongen:
 *   - GET  ?zoekKlant=<term>                 → cliënten zoeken om aan te koppelen (medewerker + beheerder)
 *   - GET  ?logAccountId=<guid>              → logboek van één cliënt (medewerker + beheerder)
 *   - GET  ?logContactId=<guid>              → logboek van één contactpersoon (medewerker + beheerder)
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
const { magWijzigen, magBulk } = require("../_gedeeld/wijzigrechten");
const { logGebeurtenis, haalLog } = require("../_gedeeld/klantlog");

const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
const SECUNDAIR_ATTR = process.env.DYNAMICS_KLANT_SECUNDAIRCONTACT_VELD || "cr283_secundairecontactpersoon";
const MAX_KLANT_ZOEK = 25;

// Alleen deze contactvelden mogen via het portaal gewijzigd worden — bewust dezelfde set als in
// api/medewerker-klant-wijzigen, zodat contactgegevens overal op dezelfde manier bewerkbaar zijn.
const CONTACT_VELDEN = [
  "firstname", "middlename", "lastname", "jobtitle",
  "emailaddress1", "mobilephone", "telephone1",
  "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
  "address1_postalcode", "address1_city", "address1_country",
];

// Velden die in bulk (op meerdere contactpersonen tegelijk) gewijzigd mogen worden. Bewuste
// subset van CONTACT_VELDEN: alleen velden die zinvol op meerdere personen tegelijk te zetten zijn
// (functie + adres). Naam/e-mail zijn per persoon uniek en zitten er dus bewust NIET bij.
const BULK_TOEGESTAAN = [
  "jobtitle", "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
  "address1_postalcode", "address1_city",
];

// Leesbare labels per veld — voor de omschrijving in het logboek ("Wijzigde … : Voornaam, E-mail").
const VELD_LABEL = {
  firstname: "Voornaam", middlename: "Tussenvoegsel", lastname: "Achternaam", jobtitle: "Functie",
  emailaddress1: "E-mail", mobilephone: "Mobiel", telephone1: "Telefoon",
  address1_line1: "Straat", cr283_huisnummer: "Huisnummer", cr283_huisnummertoevoeging: "Toevoeging",
  address1_postalcode: "Postcode", address1_city: "Plaats", address1_country: "Land",
};

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

/** Normaliseert een waarde voor het vergelijken van oud/nieuw ("", null, undefined → ""). */
function norm(v) {
  return v == null ? "" : String(v).trim();
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

/** Eén Account licht ophalen (naam, cliëntnummer, huidige primaire contactpersoon). */
async function haalAccountKort(resource, token, accountId) {
  const url =
    `${resource}/api/data/v9.2/accounts(${accountId})` +
    `?$select=accountid,name,${CLIENTNUMMER_VELD},_primarycontactid_value` +
    `&$expand=primarycontactid($select=contactid,fullname)`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const a = await res.json();
  const nummer = a[CLIENTNUMMER_VELD];
  const p = a.primarycontactid || null;
  return {
    accountId: a.accountid,
    klantnaam: a.name || "",
    klantnummer: nummer != null && nummer !== "" ? String(nummer) : "",
    primairContactId: p ? p.contactid : "",
    primairNaam: p ? p.fullname || "" : "",
  };
}

/** Eén contactpersoon met de bewerkbare velden ophalen (voor diff + naam). */
async function haalContactVolledig(resource, token, contactId) {
  const velden = ["contactid", "fullname", ...CONTACT_VELDEN].join(",");
  const url = `${resource}/api/data/v9.2/contacts(${contactId})?$select=${velden}`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  return await res.json();
}

/** Alle cliënten waar een contactpersoon aan hangt (primair of secundair) — voor het logboek. */
async function haalGekoppeldeAccounts(resource, token, contactId) {
  const url =
    `${resource}/api/data/v9.2/accounts` +
    `?$select=accountid,name,${CLIENTNUMMER_VELD}` +
    `&$filter=(_primarycontactid_value eq ${contactId} or _${SECUNDAIR_ATTR}_value eq ${contactId}) and statecode eq 0`;
  // Bestaat het secundair-veld niet onder deze naam, val dan terug op alleen primair.
  const maakUrl = (metSecundair) => (metSecundair ? url : url.replace(` or _${SECUNDAIR_ATTR}_value eq ${contactId}`, ""));
  let res = await fetch(maakUrl(true), { headers: leesHeaders(token) });
  if (!res.ok) {
    const tekst = await res.text();
    if (!tekst.includes(SECUNDAIR_ATTR)) return [];
    res = await fetch(maakUrl(false), { headers: leesHeaders(token) });
    if (!res.ok) return [];
  }
  const data = await res.json();
  return (data.value || []).map((a) => {
    const nummer = a[CLIENTNUMMER_VELD];
    return { accountId: a.accountid, klantnaam: a.name || "", klantnummer: nummer != null && nummer !== "" ? String(nummer) : "" };
  });
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
    // ── Logboek opvragen (medewerker + beheerder) ─────────────────────────
    if (methode === "GET" && (req.query.logAccountId || req.query.logContactId)) {
      const log = await haalLog({ accountId: req.query.logAccountId || undefined, contactId: req.query.logContactId || undefined });
      context.res = { headers: { "Content-Type": "application/json" }, body: { log } };
      return;
    }

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

      // Huidige waarden ophalen om te bepalen wát er wijzigt (voor het logboek) en om alleen de
      // daadwerkelijk gewijzigde velden weg te schrijven.
      const huidig = (await haalContactVolledig(resource, token, contactId)) || {};
      const patchBody = {};
      const gewijzigd = [];
      for (const veld of CONTACT_VELDEN) {
        if (!contact || !Object.prototype.hasOwnProperty.call(contact, veld)) continue;
        const nieuw = contact[veld];
        if (norm(nieuw) !== norm(huidig[veld])) {
          patchBody[veld] = nieuw === "" ? null : nieuw;
          gewijzigd.push(VELD_LABEL[veld] || veld);
        }
      }

      if (gewijzigd.length === 0) {
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, ongewijzigd: true } };
        return;
      }

      await patch(resource, token, "contacts", contactId, patchBody);

      // Naam voor het logboek: uit de (nieuwe) naamvelden, anders de bestaande fullname.
      const nieuweNaam = [
        norm(contact.firstname) || norm(huidig.firstname),
        norm(contact.middlename) || norm(huidig.middlename),
        norm(contact.lastname) || norm(huidig.lastname),
      ].filter(Boolean).join(" ").trim() || huidig.fullname || "";

      const accounts = await haalGekoppeldeAccounts(resource, token, contactId);
      await logGebeurtenis({
        door: email || "onbekend",
        actie: "bewerken",
        contactId,
        contactNaam: nieuweNaam,
        accountIds: accounts.map((a) => a.accountId),
        klantnaam: accounts.map((a) => a.klantnaam).filter(Boolean).join(", "),
        tekst: `Wijzigde gegevens van contactpersoon ${nieuweNaam || "(onbekend)"}: ${gewijzigd.join(", ")}.`,
      });

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

      // Situatie vóór de wijziging vastleggen (huidige primaire contactpersoon + cliëntnaam).
      const voor = await haalAccountKort(resource, token, accountId);
      const klantnaam = voor ? voor.klantnaam : "";
      const klantnummer = voor ? voor.klantnummer : "";

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
        const nieuwContact = (await haalContactVolledig(resource, token, contactId)) || {};
        const contactNaam = nieuwContact.fullname || "";
        const vervangt = voor && voor.primairContactId && voor.primairContactId !== contactId ? voor.primairNaam : "";

        await logGebeurtenis({
          door: email || "onbekend",
          actie: "koppel",
          accountId,
          accountIds: [accountId],
          klantnaam,
          klantnummer,
          contactId,
          contactNaam,
          tekst:
            `Koppelde ${contactNaam || "een contactpersoon"} als primaire contactpersoon aan ${klantnaam || "de cliënt"}` +
            (vervangt ? ` — verving ${vervangt}, die verliest hiermee de toegang.` : `.`),
        });

        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, contact: { contactId, naam: contactNaam } } };
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

      const losNaam = (voor && voor.primairNaam) || "";
      await logGebeurtenis({
        door: email || "onbekend",
        actie: "ontkoppel",
        accountId,
        accountIds: [accountId],
        klantnaam,
        klantnummer,
        contactId: (voor && voor.primairContactId) || contactId || null,
        contactNaam: losNaam,
        tekst: `Ontkoppelde ${losNaam || "de primaire contactpersoon"} van ${klantnaam || "de cliënt"} — de toegang tot het dossier is ingetrokken.`,
      });

      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    // ── Bulk bewerken: één veld op meerdere contactpersonen tegelijk (gate: magBulk) ──────
    if (actie === "bulk-bewerken") {
      if (!(await magBulk(email, beheerder))) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je hebt geen rechten om meerdere contactpersonen tegelijk te wijzigen." } };
        return;
      }
      const contactIds = Array.isArray(req.body && req.body.contactIds) ? req.body.contactIds.filter(Boolean) : [];
      const veld = req.body && req.body.veld;
      const waarde = req.body ? req.body.waarde : undefined;
      if (contactIds.length === 0) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'contactIds' mee." } };
        return;
      }
      if (!BULK_TOEGESTAAN.includes(veld)) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Dit veld mag niet in bulk gewijzigd worden." } };
        return;
      }
      const nieuweWaarde = waarde === "" || waarde == null ? null : waarde;
      const label = VELD_LABEL[veld] || veld;

      let gelukt = 0;
      const mislukt = [];
      for (const cid of contactIds) {
        try {
          await patch(resource, token, "contacts", cid, { [veld]: nieuweWaarde });
          gelukt++;
          // Best-effort per contactpersoon loggen (mag de bulk niet laten mislukken).
          try {
            const info = await haalContactVolledig(resource, token, cid);
            const naam = info ? info.fullname || "" : "";
            const accounts = await haalGekoppeldeAccounts(resource, token, cid);
            await logGebeurtenis({
              door: email || "onbekend",
              actie: "bewerken",
              contactId: cid,
              contactNaam: naam,
              accountIds: accounts.map((a) => a.accountId),
              klantnaam: accounts.map((a) => a.klantnaam).filter(Boolean).join(", "),
              tekst: `Wijzigde ${label} van contactpersoon ${naam || "(onbekend)"} (bulk) → ${nieuweWaarde == null ? "leeggemaakt" : `"${nieuweWaarde}"`}.`,
            });
          } catch { /* logging is best-effort */ }
        } catch (e) {
          mislukt.push({ contactId: cid, fout: String(e.message || e) });
        }
      }

      context.res = { headers: { "Content-Type": "application/json" }, body: { gelukt, mislukt } };
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
