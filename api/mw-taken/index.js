/**
 * /api/mw-taken — het medewerkerskant takenoverzicht (kantoorbreed). In tegenstelling tot
 * /api/taken (de KLANTkant, alleen de eigen accounts van de ingelogde klant en alleen de in Beheer
 * zichtbaar gezette soorten) toont dit endpoint ALLE taken in Dynamics, zodat een medewerker in
 * één scherm ziet wat er open staat en bij wie het ligt.
 *
 * Beveiligd via staticwebapp.config.json (rol 'beheerder' of 'medewerker'); daarnaast controleert
 * dit endpoint de rol ook zelf (defensief, een verborgen route houdt niemand tegen die het pad kent).
 *
 * GET  ?status=open|afgehandeld → { taken: [...], appUrl, configuratieNodig }
 *        - open        : alle taken met statecode 0 (Actief), nieuwste eerst op aanmaakdatum.
 *        - afgehandeld : alle taken met statecode 1 (Voltooid), nieuwste eerst.
 *      Elke taak bevat o.a. eigenaar (+ eigenaarVanMij), soort en `afwikkeling`
 *      ("automatisch" = de cliënt handelt de taak zelf af via akkoord/ondertekenen; "handmatig" =
 *      een medewerker moet 'm aftekenen), plus het klant-account-id zodat de voorkant de
 *      klantnaam/-nummer/groep erbij joint via /api/beheer-klanten.
 * PATCH { id, actie: "afronden" } → markeert de taak als Voltooid (statecode 1/5) met een notitie.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const {
  SOORT_VELD, KLANT_VELD, KLANT_VALUE, FV, DYNAMICS_HEADERS,
  haalSystemuser, haalAutomatischAfgewikkeldeSoorten, afwikkelingVoorSoort, dynamicsAppUrl,
} = require("../_gedeeld/takenGedeeld");

// Verbergt de interne "[dossier-ref: ...]"-koppeling die sommige flows in de omschrijving
// verstoppen (zie api/taken) — nooit bedoeld voor weergave.
function verbergDossierRef(tekst) {
  return String(tekst || "").replace(/\n*\[dossier-ref:[^\]]*\]/g, "").trimEnd();
}

const EXTRA = SOORT_VELD ? "," + SOORT_VELD : "";

function magErin(req) {
  const rollen = haalRollenUitPrincipal(req);
  return rollen.includes("beheerder") || rollen.includes("medewerker");
}

async function haalTaken(resource, token, statecode, automatischeSet, mijnId) {
  const orderby = statecode === 1 ? "modifiedon desc" : "createdon desc";
  const top = statecode === 1 ? 1000 : 2000;
  const query =
    `${resource}/api/data/v9.2/tasks` +
    `?$select=activityid,subject,description,scheduledend,createdon,modifiedon,prioritycode,statecode,statuscode,` +
    `_ownerid_value,_regardingobjectid_value,${KLANT_VALUE}${EXTRA}` +
    `&$filter=statecode eq ${statecode}` +
    `&$orderby=${orderby}&$top=${top}`;

  const res = await fetch(query, { headers: DYNAMICS_HEADERS(token) });
  if (!res.ok) throw new Error(`Ophalen taken mislukt: ${await res.text()}`);
  const data = await res.json();

  return (data.value || []).map((rij) => {
    const soortWaarde = SOORT_VELD ? rij[SOORT_VELD] : null;
    const eigenaarId = rij._ownerid_value || "";
    const klantAccountId = rij[KLANT_VALUE] || rij._regardingobjectid_value || "";
    return {
      id: rij.activityid,
      onderwerp: rij.subject || "(geen onderwerp)",
      omschrijving: verbergDossierRef(rij.description),
      deadline: rij.scheduledend || null,
      aangemaakt: rij.createdon || null,
      afgehandeldOp: statecode === 1 ? rij.modifiedon || null : null,
      prioriteit: rij[`prioritycode${FV}`] || "",
      prioriteitCode: rij.prioritycode ?? null,
      soort: SOORT_VELD ? rij[SOORT_VELD + FV] || "" : "",
      soortWaarde: soortWaarde == null ? null : String(soortWaarde),
      afwikkeling: afwikkelingVoorSoort(soortWaarde, automatischeSet),
      eigenaar: rij[`_ownerid_value${FV}`] || "",
      eigenaarId,
      eigenaarVanMij: !!mijnId && eigenaarId.toLowerCase() === mijnId.toLowerCase(),
      klantAccountId: klantAccountId ? String(klantAccountId).toLowerCase() : "",
      klantnaam: rij[`${KLANT_VALUE}${FV}`] || rij[`_regardingobjectid_value${FV}`] || "",
      statusLabel: rij[`statecode${FV}`] || (statecode === 1 ? "Voltooid" : "Actief"),
    };
  });
}

module.exports = async function (context, req) {
  if (!magErin(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd.", configuratieNodig: true } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const email = haalEmailUitPrincipal(req);

    if (req.method === "GET") {
      const statusParam = (req.query && req.query.status) === "afgehandeld" ? 1 : 0;
      const [automatischeSet, mij] = await Promise.all([
        haalAutomatischAfgewikkeldeSoorten(),
        haalSystemuser(resource, token, email),
      ]);
      const taken = await haalTaken(resource, token, statusParam, automatischeSet, mij.id);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { taken, appUrl: dynamicsAppUrl(resource), mijnNaam: mij.naam, configuratieNodig: !SOORT_VELD },
      };
      return;
    }

    if (req.method === "PATCH") {
      const taakId = (req.body && req.body.id) || (req.query && req.query.id);
      const actie = (req.body && req.body.actie) || "afronden";
      if (!taakId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef het id van de taak mee." } };
        return;
      }
      if (actie !== "afronden") {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } };
        return;
      }

      // Huidige omschrijving ophalen zodat de notitie eronder komt (en niet de bestaande tekst wist).
      let huidigeOmschrijving = "";
      try {
        const huidig = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?$select=description`, { headers: DYNAMICS_HEADERS(token) });
        if (huidig.ok) huidigeOmschrijving = (await huidig.json()).description || "";
      } catch { /* best-effort */ }

      const stempel = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
      const notitie = `\n\n[Afgehandeld door medewerker (${email || "onbekend"}) via het medewerkersportaal op ${stempel}]`;
      const body = { statecode: 1, statuscode: 5, description: (huidigeOmschrijving || "") + notitie };

      const updateRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
        method: "PATCH",
        headers: DYNAMICS_HEADERS(token),
        body: JSON.stringify(body),
      });
      if (!updateRes.ok) throw new Error(`Afronden taak mislukt: ${await updateRes.text()}`);

      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de taken.", detail: String(err.message || err) },
    };
  }
};
