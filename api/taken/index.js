const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { voegAkkoordToe, haalAkkoordenVoorEmail } = require("../_gedeeld/taakakkoorden");

/**
 * Optionele eigen velden op Task; leeg laten als ze bij jullie niet bestaan (dan worden ze
 * niet opgevraagd). Zet anders de logische veldnaam via de Application Settings.
 */
const UPLOADLINK_VELD = process.env.DYNAMICS_TAAK_UPLOADLINK_VELD || "";
const VERLOOPDATUM_VELD = process.env.DYNAMICS_TAAK_VERLOOPDATUM_VELD || "";

// Het "Soort"-veld op Task is een keuzelijst (option set). Zet de LOGISCHE veldnaam via de
// Application Setting DYNAMICS_TAAK_SOORT_VELD (bijv. "sk_soort" of "cr283_soort"). Zolang dit
// leeg is (of er nog geen soorten in beheer zijn aangezet) toont het portaal — bewust — GEEN
// taken: we willen nooit per ongeluk verkeerde soorten aan de klant laten zien.
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";

const EXTRA_TAAK_VELDEN = [UPLOADLINK_VELD, VERLOOPDATUM_VELD, SOORT_VELD].filter(Boolean).join(",");
const FV = "@OData.Community.Display.V1.FormattedValue";

const DYNAMICS_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  // Geeft naast de ruwe optieset-waarde ook het leesbare label mee.
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
});

/**
 * Leest de per-soort-configuratie uit de instellingen en geeft twee sets met numerieke
 * optieset-waarden terug: welke soorten zichtbaar zijn en welke de klant mag goedkeuren.
 */
async function haalSoortConfig() {
  const instellingen = await haalInstellingen().catch(() => ({}));
  const config = instellingen.taaksoorten || {};
  const zichtbaar = new Set();
  const magGoedkeuren = new Set();
  for (const [waarde, opties] of Object.entries(config)) {
    if (opties?.zichtbaar) zichtbaar.add(String(waarde));
    if (opties?.magGoedkeuren) magGoedkeuren.add(String(waarde));
  }
  return { config, zichtbaar, magGoedkeuren };
}

/**
 * Haalt de open taken op die de klant mag zien: alleen de soorten die in beheer op "zichtbaar"
 * staan. Andere soorten worden bewust weggelaten.
 */
async function haalZichtbareTaken(resource, token, accounts, soortConfig) {
  const leegPerAccount = () =>
    accounts.map((a) => ({
      accountId: a.accountId,
      klantnummer: a.klantnummer,
      klantnaam: a.klantnaam,
      taken: [],
    }));

  // Zonder soort-veld of zonder ingeschakelde soorten tonen we niets (liever leeg dan lekken).
  if (!SOORT_VELD || soortConfig.zichtbaar.size === 0) {
    return { groepen: leegPerAccount(), configuratieNodig: true };
  }

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

  const perAccount = new Map(
    accounts.map((a) => [
      a.accountId,
      { accountId: a.accountId, klantnummer: a.klantnummer, klantnaam: a.klantnaam, taken: [] },
    ])
  );

  for (const rij of data.value || []) {
    const groep = perAccount.get(rij._regardingobjectid_value);
    if (!groep) continue;

    const soortWaarde = rij[SOORT_VELD];
    if (soortWaarde == null || !soortConfig.zichtbaar.has(String(soortWaarde))) continue;

    groep.taken.push({
      id: rij.activityid,
      titel: rij.subject || "(geen titel)",
      omschrijving: rij.description || "",
      deadline: rij.scheduledend || null,
      prioriteit: rij.prioritycode ?? 1,
      soort: rij[SOORT_VELD + FV] || "",
      kanAkkoord: soortConfig.magGoedkeuren.has(String(soortWaarde)),
      uploadLink: UPLOADLINK_VELD ? rij[UPLOADLINK_VELD] || null : null,
      uploadVerloopt: VERLOOPDATUM_VELD ? rij[VERLOOPDATUM_VELD] || null : null,
    });
  }

  return { groepen: Array.from(perAccount.values()), configuratieNodig: false };
}

/**
 * Haalt één taak op ter controle en geeft {accountId, subject, description, soortWaarde,
 * soortLabel} terug, of null als de taak niet bij de opgegeven accounts hoort.
 */
async function haalTaakVoorControle(resource, token, taakId, accountIds) {
  const select =
    `$select=subject,description,_regardingobjectid_value` + (SOORT_VELD ? "," + SOORT_VELD : "");
  const query = `${resource}/api/data/v9.2/tasks(${taakId})?${select}`;
  const res = await fetch(query, { headers: DYNAMICS_HEADERS(token) });
  if (!res.ok) return null;
  const data = await res.json();
  if (!accountIds.includes(data._regardingobjectid_value)) return null;
  return {
    accountId: data._regardingobjectid_value,
    subject: data.subject || "",
    description: data.description || "",
    soortWaarde: SOORT_VELD ? data[SOORT_VELD] : null,
    soortLabel: SOORT_VELD ? data[SOORT_VELD + FV] || "" : "",
  };
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { email, accounts } = await herleidAccounts(req, token);
    const soortConfig = await haalSoortConfig();

    if (req.method === "GET") {
      const { groepen, configuratieNodig } = await haalZichtbareTaken(resource, token, accounts, soortConfig);
      // Archief van eerder gegeven akkoorden (best-effort; portaal werkt ook zonder blob-opslag).
      const akkoorden = await haalAkkoordenVoorEmail(email).catch(() => []);
      akkoorden.sort((a, b) => new Date(b.akkoordOp) - new Date(a.akkoordOp));
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { groepen, akkoorden, configuratieNodig },
      };
      return;
    }

    if (req.method === "PATCH") {
      const taakId = req.query.id || req.body?.id;
      // Standaardactie is "akkoord": de klant keurt een zichtbare taak goed. "afhandelen" blijft
      // bestaan voor terugwaartse compatibiliteit (rondt zonder soort-controle af).
      const actie = req.body?.actie || req.query.actie || "akkoord";
      if (!taakId) {
        context.res = { status: 400, body: { error: "Geef het id van de taak mee." } };
        return;
      }

      const accountIds = accounts.map((a) => a.accountId);
      const taak = await haalTaakVoorControle(resource, token, taakId, accountIds);
      if (!taak) {
        context.res = { status: 403, body: { error: "Deze taak hoort niet bij een van jouw accounts." } };
        return;
      }

      // Voor een akkoord moet het soort in beheer op "mag goedkeuren" staan. Zo kan niemand via
      // een handmatige aanroep een taak goedkeuren die daar niet voor bedoeld is.
      if (actie === "akkoord") {
        const magGoedkeuren =
          SOORT_VELD &&
          taak.soortWaarde != null &&
          soortConfig.magGoedkeuren.has(String(taak.soortWaarde));
        if (!magGoedkeuren) {
          context.res = { status: 403, body: { error: "Deze taak kun je niet goedkeuren." } };
          return;
        }
      }

      const account = accounts.find((a) => a.accountId === taak.accountId) || {};

      // Notitie in de Dynamics-taak zodat Activaa ook in Dynamics ziet dat de klant akkoord gaf.
      const stempel = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
      const notitie =
        actie === "akkoord"
          ? `\n\n[Akkoord gegeven door klant (${email}) via het klantportaal op ${stempel}]`
          : "";
      const nieuweOmschrijving = notitie ? (taak.description || "") + notitie : undefined;

      // Taak afronden (statecode 1 = Voltooid, statuscode 5 = standaard 'Voltooid'-reden) en de
      // notitie in dezelfde PATCH meesturen.
      const body = { statecode: 1, statuscode: 5 };
      if (nieuweOmschrijving !== undefined) body.description = nieuweOmschrijving;

      const updateRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
        method: "PATCH",
        headers: DYNAMICS_HEADERS(token),
        body: JSON.stringify(body),
      });
      if (!updateRes.ok) throw new Error(`Verwerken taak mislukt: ${await updateRes.text()}`);

      // Akkoord vastleggen zodat het klantportaal een archief kan tonen. Best-effort: als de
      // opslag (nog) niet is geconfigureerd, is de taak al wél afgerond in Dynamics.
      let akkoord = null;
      if (actie === "akkoord") {
        try {
          akkoord = await voegAkkoordToe({
            taakId,
            accountId: taak.accountId,
            klantnummer: account.klantnummer,
            klantnaam: account.klantnaam,
            taaktitel: taak.subject,
            soort: taak.soortLabel,
            aanvragerEmail: email,
          });
        } catch (opslagFout) {
          context.log.error("Akkoord vastleggen in opslag mislukt:", opslagFout);
        }
      }

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { ok: true, akkoord },
      };
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
