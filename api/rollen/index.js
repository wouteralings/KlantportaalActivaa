const { haalGroepEmails } = require("../_gedeeld/entraGroepen");
const { haalNiveaus } = require("../_gedeeld/wijzigrechten");
const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * rolesSource voor Azure Static Web Apps: bepaalt bij het inloggen welke rollen iemand krijgt.
 *
 * Static Web Apps roept dit endpoint aan direct na een geslaagde login en verwacht
 * { "roles": ["medewerker"] } terug. Die rollen komen in het sessietoken en bepalen waar iemand
 * bij mag — zowel de routes in staticwebapp.config.json als de checks in de app zelf.
 *
 * Aanzetten gebeurt in staticwebapp.config.json met een "auth"-blok dat naar /api/rollen wijst.
 * Zolang dat blok er niet staat, doet dit endpoint niets en blijven de uitnodigingen in Azure
 * Role management gelden. Zo kan het los getest worden voordat de knop omgaat.
 *
 * De regels:
 *   1) Zit het e-mailadres in de ingestelde Entra-groep (Beheer → Medewerkers → "Toegang via
 *      Entra-groep", bij Activaa "Activaa B.V.")   → rol 'medewerker'.
 *   2) Staat het e-mailadres in Beheer → Medewerkers op niveau "Beheerder"   → ook rol 'beheerder'.
 *   3) Staat het e-mailadres in de Application Setting ROLLEN_NOODBEHEERDERS → altijd beide rollen.
 *
 * Waarom regel 3 bestaat: zodra dit endpoint de rollen bepaalt, is het ook de enige weg naar het
 * beheersportaal. Een verkeerd gekozen groep of een Graph-storing zou je dan buitensluiten uit
 * precies het scherm waarmee je het zou repareren. Die lijst staat daarom in de Application
 * Settings in Azure en niet in het portaal — hij is met opzet niet stuk te maken vanuit de UI.
 *
 * Klanten krijgen hier geen rol, en dat is goed: het klantportaal vraagt alleen 'authenticated'.
 * Een klant die inlogt houdt dus toegang tot zijn eigen portaal en komt niet in de medewerkers-
 * of beheerschermen.
 */

/** Haalt het bruikbare e-mailadres uit de payload die Static Web Apps meestuurt. */
function haalEmail(body) {
  const claims = Array.isArray(body && body.claims) ? body.claims : [];
  const uitClaim = claims.find((c) =>
    ["emailaddress", "preferred_username", "email", "upn"].some((sleutel) =>
      String(c.typ || c.type || "").toLowerCase().includes(sleutel)
    )
  );
  const kandidaat = (uitClaim && (uitClaim.val || uitClaim.value)) || (body && body.userDetails) || "";
  const tekst = String(kandidaat).trim();
  if (!tekst) return "";

  // Gastgebruikers-UPN's zien er soms uit als "naam_bedrijf.nl#EXT#@tenant.onmicrosoft.com";
  // het echte adres staat dan vóór #EXT#, met een underscore i.p.v. de laatste @.
  // Zelfde omzetting als in _gedeeld/identiteit.js.
  if (tekst.includes("#EXT#")) {
    const voorEXT = tekst.split("#EXT#")[0];
    const laatsteUnderscore = voorEXT.lastIndexOf("_");
    if (laatsteUnderscore > -1) {
      return (voorEXT.slice(0, laatsteUnderscore) + "@" + voorEXT.slice(laatsteUnderscore + 1)).toLowerCase();
    }
  }
  return tekst.toLowerCase();
}

/** De noodbeheerders uit de Application Settings: komma- of puntkomma-gescheiden e-mailadressen. */
function haalNoodbeheerders() {
  return String(process.env.ROLLEN_NOODBEHEERDERS || "")
    .split(/[;,]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = async function (context, req) {
  const antwoord = (rollen) => {
    context.res = { headers: { "Content-Type": "application/json" }, body: { roles: rollen } };
  };

  const email = haalEmail(req.body || {});
  if (!email) {
    context.log.warn
      ? context.log.warn("rollen: geen e-mailadres in de payload, geen rollen toegekend")
      : context.log("rollen: geen e-mailadres in de payload, geen rollen toegekend");
    antwoord([]);
    return;
  }

  const noodbeheerders = haalNoodbeheerders();
  if (noodbeheerders.includes(email)) {
    antwoord(["medewerker", "beheerder"]);
    return;
  }

  const rollen = new Set();
  try {
    const instellingen = await haalInstellingen();
    const groepId = (instellingen && instellingen.medewerkersGroepId) || "";
    if (groepId) {
      const groepEmails = await haalGroepEmails(groepId);
      if (groepEmails.has(email)) rollen.add("medewerker");
    }
  } catch (err) {
    // Bewust geen rollen toekennen bij een storing: liever iemand tijdelijk buiten dan onbedoeld
    // toegang. De noodbeheerders hierboven komen er altijd in, dus repareren blijft mogelijk.
    context.log.error(`rollen: groepslidmaatschap bepalen mislukt voor ${email}: ${err}`);
  }

  try {
    const niveaus = await haalNiveaus();
    if (niveaus[email] === "beheerder") {
      rollen.add("beheerder");
      // Beheerder is een superset: wie het beheersportaal in mag, mag ook het medewerkersportaal in.
      rollen.add("medewerker");
    }
  } catch (err) {
    context.log.error(`rollen: niveaus lezen mislukt voor ${email}: ${err}`);
  }

  antwoord([...rollen]);
};
