/**
 * De interne Dynamics-taak "printen & per post versturen" voor de backoffice.
 *
 * Stond eerst in api/brieven/index.js. Verhuisd naar hier omdat formulieren dezelfde knop hebben
 * gekregen: een ingevuld formulier gaat net zo goed op de post als een brief, en dan hoort er
 * dezelfde taak bij — met dezelfde eigenaar, soort en rubriek uit Beheer.
 */
const { haalDynamicsToken } = require("./identiteit");

// Dynamics-velden voor de backoffice-taak (zelfde defaults als _gedeeld/vervolgtaak.js).
const TAAK_KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
const TAAK_MANAGER_VELD = process.env.DYNAMICS_RELATIEBEHEERDER_VELD || "cr283_manager";
// Optioneel "Soort"-veld op Task — zelfde Application Setting als Beheer → Taken/Dossiers. Alleen
// gezet op de backoffice-taak als in Beheer → Brieven een taaksoort is gekozen (backofficeTaakSoort).
const TAAK_SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
// Optioneel "Rubriek"-veld op Task (cr283_rubriek) — zie /api/beheer-taakrubrieken. Alleen gezet op
// de backoffice-taak als in Beheer → Brieven een rubriek is gekozen (backofficeTaakRubriek).
const TAAK_RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";

/**
 * Maakt een interne Dynamics-taak "printen & versturen" voor de backoffice. `stuknaam` bepaalt of
 * er "brief" of "formulier" in de taaktekst staat. Eigenaar = het in
 * Beheer ingestelde backoffice-postvak (e-mail → systemuser), of anders de manager/relatiebeheerder
 * van de klant. `soortWaarde`/`rubriekWaarde` (beide optioneel) zetten de in Beheer → Brieven
 * ingestelde soort/rubriek op de taak — kies in Beheer een soort die daar NIET op "Zichtbaar" staat,
 * anders ziet de cliënt deze interne taak per ongeluk in zijn eigen portaal (zelfde valkuil als bij
 * de vervolgtaak-soort, zie _gedeeld/vervolgtaak.js). Best-effort — geeft { gedaan, reden, eigenaarGevonden }.
 */
async function maakBackofficeTaak({ context, accountId, klantnaam, onderwerp, eigenaarEmail, soortWaarde, rubriekWaarde, dossierGelukt, submap, briefUrl, stuknaam }) {
  const stuk = String(stuknaam || "brief").trim() || "brief";
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) return { gedaan: false, reden: "Dynamics-koppeling is nog niet geconfigureerd." };
  const H = (token) => ({ Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" });
  try {
    const token = await haalDynamicsToken();
    // Eigenaar = de manager/relatiebeheerder van de klant (cr283_manager). Let op: het toewijzen van
    // een taak-eigenaar in Dynamics verstuurt géén e-mail; het zet alleen wie de taak in behandeling
    // heeft. Geen e-mailadresveld meer — de eigenaar komt rechtstreeks van de klant.
    let ownerId = "";
    {
      const r = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})?$select=_${TAAK_MANAGER_VELD}_value`, { headers: H(token) });
      if (r.ok) { const j = await r.json(); ownerId = j[`_${TAAK_MANAGER_VELD}_value`] || ""; }
    }
    const linkRegel = briefUrl ? `\n\nDirecte link naar de ${stuk}: ${briefUrl}` : "";
    const beschrijving = (dossierGelukt
      ? `De te versturen ${stuk} staat als PDF in het SharePoint-dossier van de klant (map "${submap || "Brieven"}"). Graag printen en per post versturen.`
      : `Graag de ${stuk} printen en per post versturen. Let op: opslaan in het klantdossier is niet gelukt — vraag de behandelaar om de PDF.`) + linkRegel;
    const taakBody = {
      subject: (onderwerp || "").trim() || `${stuk.charAt(0).toUpperCase()}${stuk.slice(1)} printen en versturen — ${klantnaam || ""}`.trim(),
      description: beschrijving,
      [`${TAAK_KLANT_VELD}@odata.bind`]: `/accounts(${accountId})`,
    };
    if (ownerId) taakBody["ownerid@odata.bind"] = `/systemusers(${ownerId})`;
    if (TAAK_SOORT_VELD && Number.isFinite(soortWaarde)) taakBody[TAAK_SOORT_VELD] = soortWaarde;
    if (TAAK_RUBRIEK_VELD && Number.isFinite(rubriekWaarde)) taakBody[TAAK_RUBRIEK_VELD] = rubriekWaarde;
    const res = await fetch(`${resource}/api/data/v9.2/tasks`, { method: "POST", headers: H(token), body: JSON.stringify(taakBody) });
    if (!res.ok) return { gedaan: false, reden: `Aanmaken backoffice-taak mislukt (${res.status}).` };
    return { gedaan: true, eigenaarGevonden: !!ownerId };
  } catch (e) {
    if (context && context.log) context.log.error("Backoffice-brieftaak mislukt:", e);
    return { gedaan: false, reden: String(e.message || e) };
  }
}

module.exports = { maakBackofficeTaak };
