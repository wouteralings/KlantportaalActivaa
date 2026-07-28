const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { magBulk } = require("../_gedeeld/wijzigrechten");

/**
 * Route is beveiligd via staticwebapp.config.json (rol 'medewerker' of 'beheerder'),
 * en aanvullend afgeschermd via magBulk (beheer bepaalt wie bulk-aanpassingen mag doen).
 *
 * POST body: { accountIds: ["<guid>", ...], veld: "<key>", waarde: "<guid>|<nr>|''" }
 *   - Team-rollen (veld = manager/accountant/assistent/backup/fiscaal/loon):
 *       waarde = systemuser-GUID → koppelen; "" → loskoppelen.
 *   - Classificatie (veld = clienttype/status/team/kantoor):
 *       waarde = numerieke optieset-waarde → zetten; "" → leegmaken (null).
 *
 * Past de wijziging toe op elk account afzonderlijk en meldt per account het resultaat terug:
 *   { ok, gelukt: <aantal>, mislukt: [{ accountId, error }] }
 */

// Lookup-navigatie-eigenschappen voor het team (→ systemuser).
const TEAM_NAV = {
  manager: "cr283_Manager",
  accountant: "sk_Accountant",
  assistent: "cr283_Assistant1",
  backup: "cr283_Assistent2",
  fiscaal: "cr283_Fiscaalmedewerker",
  loon: "cr283_Verantwoordelijkeloonadministratie",
};
// Classificatie-keuzevelden (numerieke optieset-waarde). Zelfde env-namen als het losse wijzig-endpoint.
const CHOICE_VELD = {
  clienttype: process.env.DYNAMICS_KLANT_CLIENTTYPE_VELD || "businesstypecode",
  status: process.env.DYNAMICS_KLANT_STATUS_VELD || "cr283_clienttype",
  team: process.env.DYNAMICS_KLANT_TEAM_VELD || "cr283_team",
  kantoor: process.env.DYNAMICS_KLANT_KANTOOR_VELD || "cr283_kantoor",
};

async function patch(resource, token, id, body) {
  const res = await fetch(`${resource}/api/data/v9.2/accounts(${id})`, {
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
  if (!res.ok) throw new Error(`bijwerken mislukt (${res.status}): ${await res.text()}`);
}

async function verwijderRef(resource, token, id, nav) {
  const res = await fetch(`${resource}/api/data/v9.2/accounts(${id})/${nav}/$ref`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
  });
  if (!res.ok && res.status !== 404) throw new Error(`${nav} loskoppelen mislukt (${res.status}): ${await res.text()}`);
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
    if (!(await magBulk(email, beheerder))) {
      context.res = { status: 403, body: { error: "Je hebt geen rechten om bulk-aanpassingen te doen." } };
      return;
    }

    const { accountIds, veld, waarde } = req.body || {};
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      context.res = { status: 400, body: { error: "Geef 'accountIds' (lijst) mee." } };
      return;
    }
    const isTeam = Object.prototype.hasOwnProperty.call(TEAM_NAV, veld);
    const isChoice = Object.prototype.hasOwnProperty.call(CHOICE_VELD, veld);
    if (!isTeam && !isChoice) {
      context.res = { status: 400, body: { error: "Onbekend veld voor bulk-aanpassing." } };
      return;
    }
    // Bovengrens om een per ongeluk enorme bulk-actie te voorkomen.
    if (accountIds.length > 1000) {
      context.res = { status: 400, body: { error: "Te veel klanten geselecteerd (max. 1000)." } };
      return;
    }

    const token = await haalDynamicsToken();
    const leeg = waarde === "" || waarde === null || typeof waarde === "undefined";

    let gelukt = 0;
    const mislukt = [];
    for (const id of accountIds) {
      try {
        if (isTeam) {
          const nav = TEAM_NAV[veld];
          if (leeg) await verwijderRef(resource, token, id, nav);
          else await patch(resource, token, id, { [`${nav}@odata.bind`]: `/systemusers(${waarde})` });
        } else {
          const veldNaam = CHOICE_VELD[veld];
          await patch(resource, token, id, { [veldNaam]: leeg ? null : Number(waarde) });
        }
        gelukt++;
      } catch (e) {
        mislukt.push({ accountId: id, error: String(e && e.message ? e.message : e) });
      }
    }

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: mislukt.length === 0, gelukt, mislukt },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Bulk-aanpassing is niet gelukt. Mogelijk heeft het portaal-account onvoldoende schrijfrechten in Dynamics.", detail: String(err) },
    };
  }
};
