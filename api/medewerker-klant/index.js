/**
 * /api/medewerker-klant — een cliënt (Account) toevoegen of verwijderen vanuit het
 * medewerkersportaal. Beheerder-only (zowel via de route in staticwebapp.config.json als hier in
 * de code). Elke handeling komt in het logboek (api/_gedeeld/klantlog.js).
 *
 *   - PATCH { actie: "toevoegen",  account: {...} }  → nieuwe cliënt aanmaken
 *   - PATCH { actie: "verwijderen", accountId }       → cliënt DEACTIVEREN (statecode = inactief)
 *
 * "Verwijderen" is bewust een deactivatie (statecode 1 / statuscode 2), niet een harde delete: de
 * cliënt verdwijnt uit alle portaal-lijsten (die filteren op statecode eq 0) en de portaal-toegang
 * vervalt automatisch (herleidAccounts filtert immers op actieve accounts), maar het record blijft
 * in Dynamics bestaan en is daar terug te zetten. Dat voorkomt kapotte koppelingen, facturen,
 * taken en historie.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { magSubBulkVerwijderen } = require("../_gedeeld/rollenConfig");

const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";

// Velden die bij het aanmaken van een cliënt meegegeven mogen worden (beknopt: naam + adres +
// contactgegevens van het bedrijf). De rest (cliënttype/team/kantoor, koppelen) gaat daarna via
// Bewerken/Koppelen.
const ACCOUNT_VELDEN = [
  "name", "address1_line1", "cr283_huisnummer", "cr283_huisnummertoevoeging",
  "address1_postalcode", "address1_city", "address1_country",
  "telephone1", "emailaddress1",
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
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
}

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
    method: "PATCH", headers: jsonHeaders(token), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${entiteitSet} bijwerken mislukt (${res.status}): ${await res.text()}`);
}

async function maakAccount(resource, token, velden) {
  const res = await fetch(`${resource}/api/data/v9.2/accounts?$select=accountid,name,${CLIENTNUMMER_VELD}`, {
    method: "POST",
    headers: { ...jsonHeaders(token), Prefer: "return=representation" },
    body: JSON.stringify(velden),
  });
  if (!res.ok) throw new Error(`Cliënt aanmaken mislukt (${res.status}): ${await res.text()}`);
  return await res.json();
}

async function haalAccountKort(resource, token, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=accountid,name,${CLIENTNUMMER_VELD}`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const a = await res.json();
  const nummer = a[CLIENTNUMMER_VELD];
  return { accountId: a.accountid, klantnaam: a.name || "", klantnummer: nummer != null && nummer !== "" ? String(nummer) : "" };
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  const email = haalEmailUitPrincipal(req);
  const beheerder = haalRollenUitPrincipal(req).includes("beheerder");
  // Toevoegen en losse verwijdering blijven beheerder-only (per actie afgedwongen, zie hieronder).
  // Bulk-verwijderen mag óók een rol met het bulk-recht op de subpagina Klanten (grant) — daarom is
  // de rol-gate niet meer over de hele functie, maar per actie.

  const methode = (req.method || "GET").toUpperCase();
  if (methode !== "PATCH" && methode !== "POST") {
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet toegestaan." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { actie, accountId, account } = req.body || {};

    if (actie === "toevoegen") {
      if (!beheerder) { context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen een beheerder mag cliënten toevoegen." } }; return; }
      const velden = filterVelden(account, ACCOUNT_VELDEN);
      if (!velden.name || !String(velden.name).trim()) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef minimaal een naam voor de cliënt." } };
        return;
      }
      const nieuw = await maakAccount(resource, token, velden);
      const nummer = nieuw[CLIENTNUMMER_VELD];
      const klantnummer = nummer != null && nummer !== "" ? String(nummer) : "";
      await logGebeurtenis({
        door: email || "onbekend", actie: "toevoegen",
        accountId: nieuw.accountid, accountIds: [nieuw.accountid],
        klantnaam: nieuw.name || "", klantnummer,
        tekst: `Nieuwe cliënt aangemaakt: ${nieuw.name || "(zonder naam)"}${klantnummer ? ` (cliëntnr ${klantnummer})` : ""}.`,
      });
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, accountId: nieuw.accountid, klantnaam: nieuw.name || "", klantnummer } };
      return;
    }

    // ── Meerdere cliënten in één keer deactiveren (bulk) ──
    //    Gate: BEHEERDER, of een rol met bulk-verwijderrecht op de subpagina Klanten
    //    (Beheer → Rollen & rechten → subpagina's → Klanten → Bulk). Zelfde deactivatie per cliënt.
    if (actie === "bulk-verwijderen") {
      const magBulkWeg = beheerder || (await magSubBulkVerwijderen(email, "klantoverzicht.klanten"));
      if (!magBulkWeg) {
        context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Je rol mag cliënten niet in bulk verwijderen." } };
        return;
      }
      const ids = Array.isArray(req.body && req.body.accountIds)
        ? [...new Set(req.body.accountIds.map((x) => String(x || "").trim()).filter(Boolean))]
        : [];
      if (!ids.length) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountIds' mee." } }; return; }
      if (ids.length > 200) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Maximaal 200 cliënten per keer." } }; return; }
      let gelukt = 0;
      const mislukt = [];
      for (const aid of ids) {
        try {
          const voor = await haalAccountKort(resource, token, aid);
          await patch(resource, token, "accounts", aid, { statecode: 1, statuscode: 2 });
          await logGebeurtenis({
            door: email || "onbekend", actie: "verwijderen",
            accountId: aid, accountIds: [aid],
            klantnaam: voor ? voor.klantnaam : "", klantnummer: voor ? voor.klantnummer : "",
            tekst: `Cliënt ${voor ? voor.klantnaam : ""} gedeactiveerd (bulk) — verwijderd uit het portaal; de portaal-toegang is vervallen.`,
          }).catch(() => {});
          gelukt += 1;
        } catch (e) { mislukt.push(aid); }
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verwijderd: gelukt, mislukt } };
      return;
    }

    if (actie === "verwijderen") {
      if (!beheerder) { context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Alleen een beheerder mag een cliënt verwijderen." } }; return; }
      if (!accountId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'accountId' mee." } };
        return;
      }
      const voor = await haalAccountKort(resource, token, accountId);
      // Deactiveren (op inactief). statecode 1 = Inactief, statuscode 2 = Inactief (standaard).
      await patch(resource, token, "accounts", accountId, { statecode: 1, statuscode: 2 });
      await logGebeurtenis({
        door: email || "onbekend", actie: "verwijderen",
        accountId, accountIds: [accountId],
        klantnaam: voor ? voor.klantnaam : "", klantnummer: voor ? voor.klantnummer : "",
        tekst: `Cliënt ${voor ? voor.klantnaam : ""} gedeactiveerd — verwijderd uit het portaal; de portaal-toegang is vervallen.`,
      });
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
      status: 500, headers: { "Content-Type": "application/json" },
      body: { error: "De actie is niet gelukt. Mogelijk heeft het portaal-account onvoldoende schrijfrechten in Dynamics.", detail: String(err) },
    };
  }
};
