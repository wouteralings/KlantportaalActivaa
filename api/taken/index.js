const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");

/**
 * Naam van de velden op Task waar jullie de bestand-uitvraag-link en de verloopdatum
 * in zetten. Overschrijf via Application Settings als ze bij jullie anders heten.
 */
// Optionele eigen velden op Task; leeg laten als ze bij jullie niet bestaan (dan worden ze
// niet opgevraagd). Zet anders de logische veldnaam via de Application Settings.
const UPLOADLINK_VELD = process.env.DYNAMICS_TAAK_UPLOADLINK_VELD || "";
const VERLOOPDATUM_VELD = process.env.DYNAMICS_TAAK_VERLOOPDATUM_VELD || "";
const EXTRA_TAAK_VELDEN = [UPLOADLINK_VELD, VERLOOPDATUM_VELD].filter(Boolean).join(",");

const DYNAMICS_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
});

async function haalOpenTaken(resource, token, accounts) {
  const filterPerAccount = accounts
    .map((a) => `_regardingobjectid_value eq ${a.accountId}`)
    .join(" or ");

  const query =
    `${resource}/api/data/v9.2/tasks` +
    `?$select=activityid,subject,description,scheduledend,prioritycode,_regardingobjectid_value` +
    (EXTRA_TAAK_VELDEN ? "," + EXTRA_TAAK_VELDEN : "") +
    `&$filter=(${filterPerAccount}) and statecode eq 0` +
    `&$orderby=scheduledend asc`;

  const res = await fetch(query, { headers: DYNAMICS_HEADERS(token) });
  if (!res.ok) throw new Error(`Ophalen taken mislukt: ${await res.text()}`);

  const data = await res.json();

  // Groepeer per klant, ook als een klant (nog) geen open taken heeft.
  const perAccount = new Map(
    accounts.map((a) => [
      a.accountId,
      { accountId: a.accountId, klantnummer: a.klantnummer, klantnaam: a.klantnaam, taken: [] },
    ])
  );

  for (const rij of data.value || []) {
    const groep = perAccount.get(rij._regardingobjectid_value);
    if (!groep) continue; // zou niet moeten gebeuren door het filter, maar voor de zekerheid
    groep.taken.push({
      id: rij.activityid,
      titel: rij.subject || "(geen titel)",
      omschrijving: rij.description || "",
      deadline: rij.scheduledend || null,
      prioriteit: rij.prioritycode ?? 1,
      uploadLink: rij[UPLOADLINK_VELD] || null,
      uploadVerloopt: rij[VERLOOPDATUM_VELD] || null,
    });
  }

  return Array.from(perAccount.values());
}

async function taakHoortBijAccounts(resource, token, taakId, accountIds) {
  const query = `${resource}/api/data/v9.2/tasks(${taakId})?$select=_regardingobjectid_value`;
  const res = await fetch(query, { headers: DYNAMICS_HEADERS(token) });
  if (!res.ok) return false;
  const data = await res.json();
  return accountIds.includes(data._regardingobjectid_value);
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);

    if (req.method === "GET") {
      const taken = await haalOpenTaken(resource, token, accounts);
      context.res = { headers: { "Content-Type": "application/json" }, body: taken };
      return;
    }

    if (req.method === "PATCH") {
      const taakId = req.query.id || req.body?.id;
      if (!taakId) {
        context.res = { status: 400, body: { error: "Geef het id van de taak mee." } };
        return;
      }

      const accountIds = accounts.map((a) => a.accountId);
      const magWijzigen = await taakHoortBijAccounts(resource, token, taakId, accountIds);
      if (!magWijzigen) {
        context.res = { status: 403, body: { error: "Deze taak hoort niet bij een van jouw accounts." } };
        return;
      }

      // statecode 1 = Voltooid, statuscode 5 = standaard 'Voltooid'-reden in Dynamics.
      const updateRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
        method: "PATCH",
        headers: DYNAMICS_HEADERS(token),
        body: JSON.stringify({ statecode: 1, statuscode: 5 }),
      });

      if (!updateRes.ok) throw new Error(`Afhandelen taak mislukt: ${await updateRes.text()}`);

      context.res = { status: 204 };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING") {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij verwerken van taken.", detail: String(err) },
    };
  }
};
