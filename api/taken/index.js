const { haalDynamicsToken, herleidAccounts, haalNaamUitPrincipal } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { voegAkkoordToe, haalAkkoordenVoorEmail } = require("../_gedeeld/taakakkoorden");
const { webhookMetId } = require("../_gedeeld/webhook");

/**
 * Optionele eigen velden op Task; leeg laten als ze bij jullie niet bestaan (dan worden ze
 * niet opgevraagd). Zet anders de logische veldnaam via de Application Settings.
 */
const UPLOADLINK_VELD = process.env.DYNAMICS_TAAK_UPLOADLINK_VELD || "";
const VERLOOPDATUM_VELD = process.env.DYNAMICS_TAAK_VERLOOPDATUM_VELD || "";
// Veld op Task met de SharePoint-link naar het document dat bij de taak hoort. Is dit gevuld,
// dan toont het portaal het document ingesloten onder de taak. Zet de logische veldnaam via
// Application Setting DYNAMICS_TAAK_DOCUMENT_VELD (leeg = geen documentweergave).
const DOCUMENT_VELD = process.env.DYNAMICS_TAAK_DOCUMENT_VELD || "";

// Het "Soort"-veld op Task is een keuzelijst (option set). Zet de LOGISCHE veldnaam via de
// Application Setting DYNAMICS_TAAK_SOORT_VELD (bijv. "sk_soort" of "cr283_soort"). Zolang dit
// leeg is (of er nog geen soorten in beheer zijn aangezet) toont het portaal — bewust — GEEN
// taken: we willen nooit per ongeluk verkeerde soorten aan de klant laten zien.
const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";

// De lookup op Task die naar de klant (Account) wijst. Bij Activaa is dat het eigen veld
// "Cliënt" (`sk_client`), NIET het standaardveld "Betreft" (`regardingobjectid`). Overschrijf
// via Application Setting DYNAMICS_TAAK_KLANT_VELD als het bij jullie anders heet.
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const KLANT_VALUE = `_${KLANT_VELD}_value`;

const EXTRA_TAAK_VELDEN = [UPLOADLINK_VELD, VERLOOPDATUM_VELD, SOORT_VELD, DOCUMENT_VELD].filter(Boolean).join(",");
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
  const vereistHandtekening = new Set();
  for (const [waarde, opties] of Object.entries(config)) {
    if (opties?.zichtbaar) zichtbaar.add(String(waarde));
    if (opties?.magGoedkeuren) magGoedkeuren.add(String(waarde));
    if (opties?.vereistHandtekening) vereistHandtekening.add(String(waarde));
  }
  return { config, zichtbaar, magGoedkeuren, vereistHandtekening };
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

  // Een taak hoort bij een klant via "Cliënt" (sk_client) óf via "Betreft" (regardingobjectid).
  const filterPerAccount = accounts
    .map((a) => `(${KLANT_VALUE} eq ${a.accountId} or _regardingobjectid_value eq ${a.accountId})`)
    .join(" or ");

  const query =
    `${resource}/api/data/v9.2/tasks` +
    `?$select=activityid,subject,description,scheduledend,prioritycode,_regardingobjectid_value,${KLANT_VALUE}` +
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
    const accId = rij[KLANT_VALUE] || rij._regardingobjectid_value;
    const groep = perAccount.get(accId);
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
      vereistHandtekening: soortConfig.vereistHandtekening.has(String(soortWaarde)),
      uploadLink: UPLOADLINK_VELD ? rij[UPLOADLINK_VELD] || null : null,
      uploadVerloopt: VERLOOPDATUM_VELD ? rij[VERLOOPDATUM_VELD] || null : null,
      // Alleen een boolean naar de klant: staat er een document op de taak? De echte SharePoint-url
      // wordt NOOIT prijsgegeven; de inhoud loopt via de gecontroleerde proxy /api/taken-document.
      // De frontend (TaakDocumentViewer) rendert op basis van taak.heeftDocument — vandaar deze sleutel.
      heeftDocument: DOCUMENT_VELD ? Boolean(rij[DOCUMENT_VELD]) : false,
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
    `$select=subject,description,_regardingobjectid_value,${KLANT_VALUE}` + (SOORT_VELD ? "," + SOORT_VELD : "");
  const query = `${resource}/api/data/v9.2/tasks(${taakId})?${select}`;
  const res = await fetch(query, { headers: DYNAMICS_HEADERS(token) });
  if (!res.ok) return null;
  const data = await res.json();
  const accId = data[KLANT_VALUE] || data._regardingobjectid_value;
  if (!accountIds.includes(accId)) return null;
  return {
    accountId: accId,
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
      // Naam + e-mail van de ingelogde contactpersoon, zodat het portaal het onderteken-formulier
      // vooraf kan invullen. De weergavenaam zit niet in /.auth/me, maar wel op het Contact in Dynamics.
      const eersteContact = accounts[0] || {};
      const gebruiker = {
        naam: haalNaamUitPrincipal(req) || eersteContact.contactNaam || eersteContact.contactpersoon?.naam || "",
        email: eersteContact.contactpersoon?.email || email || "",
      };
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { groepen, akkoorden, configuratieNodig, gebruiker },
      };
      return;
    }

    if (req.method === "PATCH") {
      const taakId = req.query.id || req.body?.id;
      // Standaardactie is "akkoord". "niet-akkoord" (of "afwijzen") = klant wijst af met reden.
      // "afhandelen" blijft bestaan voor terugwaartse compatibiliteit (rondt af zonder soort-controle).
      const actieRuw = req.body?.actie || req.query.actie || "akkoord";
      const isNietAkkoord = ["niet-akkoord", "niet_akkoord", "afwijzen"].includes(actieRuw);
      const isAkkoord = actieRuw === "akkoord";
      const isKlantReactie = isAkkoord || isNietAkkoord;
      const bericht = (req.body?.bericht || "").toString().trim();

      if (!taakId) {
        context.res = { status: 400, body: { error: "Geef het id van de taak mee." } };
        return;
      }
      // Bij "niet akkoord" is een toelichting/reden verplicht (die gaat mee in de mail naar Activaa).
      if (isNietAkkoord && !bericht) {
        context.res = { status: 400, body: { error: "Geef een reden/bericht mee bij 'Niet akkoord'." } };
        return;
      }

      const accountIds = accounts.map((a) => a.accountId);
      const taak = await haalTaakVoorControle(resource, token, taakId, accountIds);
      if (!taak) {
        context.res = { status: 403, body: { error: "Deze taak hoort niet bij een van jouw accounts." } };
        return;
      }

      // Een klantreactie (akkoord of niet-akkoord) mag alleen bij een soort dat in beheer op
      // "mag goedkeuren" staat. Zo kan niemand via een handmatige aanroep een taak afhandelen
      // die daar niet voor bedoeld is.
      if (isKlantReactie) {
        const magGoedkeuren =
          SOORT_VELD &&
          taak.soortWaarde != null &&
          soortConfig.magGoedkeuren.has(String(taak.soortWaarde));
        if (!magGoedkeuren) {
          context.res = { status: 403, body: { error: "Op deze taak kun je niet reageren." } };
          return;
        }
      }

      const account = accounts.find((a) => a.accountId === taak.accountId) || {};
      const stempel = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });

      // Dynamics bijwerken: akkoord => Voltooid (statecode 1/5); niet-akkoord => Geannuleerd
      // (statecode 2/6). In beide gevallen een notitie in de omschrijving zodat Activaa het terugziet.
      let body;
      let notitie = "";
      if (isNietAkkoord) {
        body = { statecode: 2, statuscode: 6 };
        notitie = `\n\n[NIET akkoord door klant (${email}) via het klantportaal op ${stempel}. Reden: ${bericht}]`;
      } else {
        body = { statecode: 1, statuscode: 5 };
        if (isAkkoord) notitie = `\n\n[Akkoord gegeven door klant (${email}) via het klantportaal op ${stempel}]`;
      }
      if (notitie) body.description = (taak.description || "") + notitie;

      const updateRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
        method: "PATCH",
        headers: DYNAMICS_HEADERS(token),
        body: JSON.stringify(body),
      });
      if (!updateRes.ok) throw new Error(`Verwerken taak mislukt: ${await updateRes.text()}`);

      // Reactie vastleggen in de log zodat klantportaal én beheer het terugzien. Best-effort.
      let akkoord = null;
      if (isKlantReactie) {
        try {
          akkoord = await voegAkkoordToe({
            taakId,
            accountId: taak.accountId,
            klantnummer: account.klantnummer,
            klantnaam: account.klantnaam,
            taaktitel: taak.subject,
            omschrijving: taak.description,
            soort: taak.soortLabel,
            aanvragerEmail: email,
            beslissing: isNietAkkoord ? "niet_akkoord" : "akkoord",
            bericht: isNietAkkoord ? bericht : "",
          });
        } catch (opslagFout) {
          context.log.error("Reactie vastleggen in opslag mislukt:", opslagFout);
        }
      }

      // Bij "niet akkoord": mail via de Power Automate-webhook (best-effort; blokkeert niet).
      if (isNietAkkoord) {
        try {
          const instellingen = await haalInstellingen().catch(() => ({}));
          const webhookUrl = instellingen.taakAfwijzingWebhookUrl || process.env.TAAK_AFWIJZING_WEBHOOK_URL || "";
          if (webhookUrl) {
            await fetch(webhookMetId(webhookUrl, account.clientnrAuto), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                gebeurtenis: "taak_niet_akkoord",
                taakId,
                taaktitel: taak.subject || "",
                soort: taak.soortLabel || "",
                klantnaam: account.klantnaam || "",
                klantnummer: account.klantnummer ?? "",
                aanvragerEmail: email,
                bericht,
                tijdstip: stempel,
              }),
            });
          } else {
            context.log.warn("Geen taakAfwijzingWebhookUrl ingesteld; mail bij 'niet akkoord' overgeslagen.");
          }
        } catch (webhookFout) {
          context.log.error("Webhook 'niet akkoord' aanroepen mislukt:", webhookFout);
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
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
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
