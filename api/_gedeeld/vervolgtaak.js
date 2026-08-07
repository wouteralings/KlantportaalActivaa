/**
 * Gedeelde "vervolgtaak backoffice"-mechaniek: maakt, ná een akkoord/ondertekening van de klant,
 * automatisch een interne taak aan voor backoffice — alleen als dat voor de betreffende taaksoort
 * in Beheer → Taken aan staat (soortCfg.vervolgtaakBackoffice). Wordt op twee plekken aangeroepen:
 *   - api/taken (PATCH, actie "akkoord" — de gewone akkoord-knop op een taak zonder handtekening)
 *   - api/taken-ondertekenen (POST — akkoord via ondertekenen, bijv. bij "Aangifte versturen")
 * Zelfde per-taaksoort instelling in Beheer → Taken stuurt dus allebei; één configuratie volstaat
 * ongeacht via welke route de klant "akkoord" gaf.
 */

const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const KLANT_VELD = process.env.DYNAMICS_TAAK_KLANT_VELD || "sk_client";
// Optieset "Rubriek" op Task (cr283_rubriek) — dezelfde Application Setting en standaardwaarde als
// api/beheer-taakrubrieken, zodat een in Beheer → Taken gekozen rubriek ook echt op de vervolgtaak
// terechtkomt (net als bij de backoffice-taak van Brieven).
const RUBRIEK_VELD = process.env.DYNAMICS_TAAK_RUBRIEK_VELD || "cr283_rubriek";

// Manager/relatiebeheerder op het Account — gebruikt om de eigenaar van de nieuwe vervolgtaak te
// bepalen. Zelfde Application Setting als api/beheer-klanten/api/taken, zodat een eventuele
// aanpassing daar hier ook meteen goed staat.
const RELATIEBEHEERDER_VELD = process.env.DYNAMICS_RELATIEBEHEERDER_VELD || "cr283_manager";

const DYNAMICS_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
});

function vulVervolgtaakSjabloonIn(sjabloon, { klant, titel }) {
  const basis = (sjabloon || "").trim() || "Vervolgactie n.a.v. akkoord: {titel}";
  return basis.replaceAll("{klant}", klant || "").replaceAll("{titel}", titel || "");
}

/**
 * Maakt, ná een akkoord van de klant, automatisch een interne vervolgtaak aan voor backoffice —
 * alleen als dat voor déze taaksoort in Beheer → Taken aan staat (soortCfg.vervolgtaakBackoffice).
 * Onderwerp komt uit soortCfg.vervolgtaakOnderwerp (sjabloon met {klant}/{titel}); de "soort" van
 * de nieuwe taak is zelf ook weer een taaksoort (soortCfg.vervolgtaakSoort) — zo blijft die, mits
 * niet op "zichtbaar" gezet, vanzelf onzichtbaar voor klanten via hetzelfde bestaande mechanisme.
 * Prioriteit komt uit soortCfg.vervolgtaakPrioriteit (0/1/2 = Laag/Normaal/Hoog); leeg = Dynamics-
 * standaard. Eigenaar wordt de Manager/relatiebeheerder van het cliënt-account (cr283_manager op Account),
 * indien bekend — anders blijft de eigenaar op de Dynamics-standaardwaarde staan.
 *
 * Best-effort: gooit nooit door naar de aanroeper — een mislukte vervolgtaak mag het akkoord van
 * de klant zelf niet blokkeren. Fouten gaan alleen naar context.log.
 *
 * @param {{ accountId: string, subject: string }} taak
 */
async function maakVervolgtaak({ context, resource, token, taak, klantnaam, soortCfg }) {
  try {
    const taakBody = {
      subject: vulVervolgtaakSjabloonIn(soortCfg.vervolgtaakOnderwerp, { klant: klantnaam, titel: taak.subject }),
      description: `Automatisch aangemaakt na akkoord van de cliënt op taak "${taak.subject}".`,
      [`${KLANT_VELD}@odata.bind`]: `/accounts(${taak.accountId})`,
    };
    if (SOORT_VELD && soortCfg.vervolgtaakSoort !== undefined && soortCfg.vervolgtaakSoort !== "") {
      const soortWaarde = Number(soortCfg.vervolgtaakSoort);
      if (Number.isFinite(soortWaarde)) taakBody[SOORT_VELD] = soortWaarde;
    }
    // Prioriteit (Task.prioritycode — standaard Dataverse-optieset 0=Laag/1=Normaal/2=Hoog);
    // leeg/niet ingesteld = Dynamics-standaard (Normaal) laten staan.
    if (soortCfg.vervolgtaakPrioriteit !== undefined && soortCfg.vervolgtaakPrioriteit !== "") {
      const prioriteitWaarde = Number(soortCfg.vervolgtaakPrioriteit);
      if (Number.isFinite(prioriteitWaarde)) taakBody.prioritycode = prioriteitWaarde;
    }
    // Rubriek (Task.cr283_rubriek — optieset); leeg/niet ingesteld = geen rubriek meegeven.
    if (RUBRIEK_VELD && soortCfg.vervolgtaakRubriek !== undefined && soortCfg.vervolgtaakRubriek !== "") {
      const rubriekWaarde = Number(soortCfg.vervolgtaakRubriek);
      if (Number.isFinite(rubriekWaarde)) taakBody[RUBRIEK_VELD] = rubriekWaarde;
    }

    // Eigenaar = Manager van het cliënt-account, indien ingevuld.
    const accRes = await fetch(`${resource}/api/data/v9.2/accounts(${taak.accountId})?$select=_${RELATIEBEHEERDER_VELD}_value`, {
      headers: DYNAMICS_HEADERS(token),
    });
    if (accRes.ok) {
      const acc = await accRes.json();
      const managerId = acc[`_${RELATIEBEHEERDER_VELD}_value`];
      if (managerId) taakBody["ownerid@odata.bind"] = `/systemusers(${managerId})`;
    }

    const res = await fetch(`${resource}/api/data/v9.2/tasks`, {
      method: "POST",
      headers: DYNAMICS_HEADERS(token),
      body: JSON.stringify(taakBody),
    });
    if (!res.ok) throw new Error(`Aanmaken vervolgtaak mislukt (${res.status}): ${await res.text()}`);
  } catch (err) {
    context.log.error("Vervolgtaak voor backoffice aanmaken mislukt (akkoord van de klant zelf is wél verwerkt):", err);
  }
}

module.exports = { vulVervolgtaakSjabloonIn, maakVervolgtaak };
