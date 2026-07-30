const { metOffertesRecht } = require("../_gedeeld/offertesRecht");
const { haalDataverseStatus, isBeheerder } = require("../_gedeeld/offertesOnboarding");

// Verbindingsstatus-check voor Instellingen ("Tarieven — Dataverse inzien"): bevestigt of de
// tool daadwerkelijk bij Dynamics kan inloggen en of de twee tarieven-tabellen bestaan, zonder
// dat je daarvoor in de Power Apps-portal hoeft te kijken. Alleen lezend (GET), dus geen
// CSRF-header-check nodig (zelfde afweging als bij andere GET-endpoints in deze tool).
// Toegang loopt via de normale "authenticated"-routeregel in staticwebapp.config.json — dit
// endpoint staat bewust NIET in de anonieme-uitzonderingslijst. Beheerders-only, want dit
// hoort bij het (nu beheerders-only) Instellingen-scherm — zie isBeheerder.
const handler = async function (context, req) {
  try {
    if (!(await isBeheerder(req))) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { ok: false, verbonden: false, foutmelding: "Alleen beheerders hebben hier toegang toe." },
      };
      return;
    }
    const status = await haalDataverseStatus();
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: status,
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { ok: false, verbonden: false, foutmelding: "Er ging iets mis. Probeer het later opnieuw." },
    };
  }
};

// Alleen bereikbaar voor medewerkers met het offertes-recht (en voor beheerders) — zie
// api/_gedeeld/offertesRecht.js. Het verbergen van de tab in het portaal is cosmetisch;
// dit is de plek waar het daadwerkelijk wordt tegengehouden.
module.exports = metOffertesRecht(handler);
