const { haalGroepen, haalGroepEmails, leegCache, diagnoseGroep } = require("../_gedeeld/entraGroepen");
const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * Route is beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * Voedt het scherm Beheer → Medewerkers → "Toegang via Entra-groep": de lijst met groepen om uit
 * te kiezen, en van de gekozen groep de e-mailadressen van de leden. Met die adressen kan het
 * beheerscherm per medewerker laten zien of hij daadwerkelijk toegang tot het portaal krijgt —
 * dat is precies het verschil dat anders onzichtbaar is (iemand kan wel rechten aangevinkt
 * hebben en toch nergens in komen omdat hij niet in de groep zit).
 *
 * GET                → { groepen: [{ id, naam, email }], gekozenGroepId, leden: ["mail@..."] }
 * GET ?vernieuw=1    → hetzelfde, maar leegt eerst de ledencache (na een wijziging in Entra)
 */
module.exports = async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
      return;
    }

    if (req.query && req.query.vernieuw) leegCache();

    const instellingen = await haalInstellingen().catch(() => ({}));
    const gekozenGroepId = (instellingen && instellingen.medewerkersGroepId) || "";
    // Optioneel: leden van een ANDERE (nog niet opgeslagen) groep tonen, zodat het beheerscherm het
    // ledenaantal live kan laten zien zodra je een groep in de dropdown kiest — zonder eerst te
    // moeten opslaan. Valt terug op de opgeslagen groep als er geen groepId is meegegeven.
    const previewGroepId = ((req.query && req.query.groepId) || "").trim();
    const ledenGroepId = previewGroepId || gekozenGroepId;

    // De groepenlijst en de leden zijn onafhankelijk van elkaar; faalt één van de twee (bijv.
    // omdat de permissie GroupMember.Read.All nog niet is toegekend), dan willen we de andere
    // helft nog steeds kunnen tonen, met een duidelijke melding erbij.
    const [groepenResultaat, ledenResultaat] = await Promise.allSettled([
      haalGroepen(),
      ledenGroepId ? haalGroepEmails(ledenGroepId) : Promise.resolve(new Set()),
    ]);

    const fouten = [];
    let groepen = [];
    if (groepenResultaat.status === "fulfilled") groepen = groepenResultaat.value;
    else fouten.push(`Groepen ophalen mislukt: ${groepenResultaat.reason}`);

    let leden = [];
    if (ledenResultaat.status === "fulfilled") leden = [...ledenResultaat.value];
    else fouten.push(`Groepsleden ophalen mislukt: ${ledenResultaat.reason}`);

    if (fouten.length) context.log.error(fouten.join(" | "));

    // Tijdelijke diagnose (?diag=1): laat rechtstreeks zien wat Graph teruggeeft op de ledenqueries,
    // zodat we een permissie-op-gebruikersgegevens kunnen onderscheiden van een echt lege groep.
    let diag;
    if (req.query && req.query.diag) {
      diag = await diagnoseGroep(ledenGroepId).catch((e) => ({ fout: String((e && e.message) || e) }));
    }

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        groepen,
        gekozenGroepId,
        gekozenGroepNaam: (instellingen && instellingen.medewerkersGroepNaam) || "",
        ledenVoorGroepId: ledenGroepId,
        leden,
        diag,
        // Alleen een korte, niet-technische melding naar de UI; de details staan in de logs.
        fout: fouten.length
          ? "Entra-gegevens konden niet (volledig) worden opgehaald. Controleer of de app-registratie de permissie GroupMember.Read.All heeft met admin-consent."
          : "",
      },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De Entra-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de Entra-groepen.", detail: String(err) },
    };
  }
};
