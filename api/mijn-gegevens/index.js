const { haalDynamicsToken, herleidAccounts, IBAN_VELD, IBAN_TENAAMSTELLING_VELD } = require("../_gedeeld/identiteit");
const { haalStatussen } = require("../_gedeeld/facturatieInstellingen");

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { email, accounts } = await herleidAccounts(req, token);

    // Per account: staat de facturatiemodule aan, en heeft de klant hem eventueel al
    // aangevraagd? (beheerd in het beheerdersportaal, tab "Facturatie"). Best-effort: als
    // de opslag nog niet geconfigureerd is, gewoon uit / geen aanvraag.
    const facturatieStatussen = await haalStatussen().catch(() => ({}));

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        email,
        accounts: accounts.map(({ accountId, klantnummer, klantnaam, groepsnaam, contactpersoon, relatiebeheerder, accountant, account }) => ({
          accountId,
          klantnummer,
          klantnaam: klantnaam || account.name || "",
          groepsnaam: groepsnaam || "",
          // Bezoekadres van het bedrijf. Staat er een KvK-nummer (accountnumber), dan is het
          // KvK-gesynchroniseerd en read-only; zo niet, dan mag de klant het wél wijzigen.
          klantadres: {
            straat: account.address1_line1 || "",
            huisnummer: account.cr283_huisnummer || "",
            toevoeging: account.cr283_huisnummertoevoeging || "",
            postcode: account.address1_postalcode || "",
            plaats: account.address1_city || "",
            land: account.address1_country || "",
          },
          bedrijfsadresBewerkbaar: !(account[process.env.DYNAMICS_KVK_VELD || "accountnumber"] || "").toString().trim(),
          // Zelfde KvK-nummer, maar dan de waarde zelf — gebruikt om de eigen bedrijfsgegevens
          // (Facturatiemodule → Bedrijfsgegevens & logo) mee voor te vullen.
          kvkNummer: (account[process.env.DYNAMICS_KVK_VELD || "accountnumber"] || "").toString().trim(),
          // BTW-nummer, zelfde voorvul-doel als kvkNummer hierboven. Leeg als het veld (nog)
          // niet in Dataverse staat onder deze naam — zie identiteit.js / DYNAMICS_BTW_VELD.
          btwNummer: (account[process.env.DYNAMICS_BTW_VELD || "sk_btwnummer"] || "").toString().trim(),
          // IBAN + tenaamstelling, zelfde voorvul-doel — sinds 29-07-2026 uit Dataverse
          // (sk_iban / cr283_ibannaamstelling). Leeg als het veld niet is meegekomen.
          iban: (account[IBAN_VELD] || "").toString().trim(),
          ibanTenaamstelling: (account[IBAN_TENAAMSTELLING_VELD] || "").toString().trim(),
          // Volledige contactpersoon-gegevens (wijzigbaar via een verzoek, behalve functie rol).
          contactpersoon: contactpersoon || {},
          relatiebeheerder,
          accountant,
          facturatieIngeschakeld: !!(facturatieStatussen[accountId] && facturatieStatussen[accountId].ingeschakeld),
          facturatieAangevraagdOp: (facturatieStatussen[accountId] && facturatieStatussen[accountId].aangevraagdOp) || null,
        })),
      },
    };
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
      body: { error: "Onverwachte fout bij ophalen van je gegevens.", detail: String(err) },
    };
  }
};
