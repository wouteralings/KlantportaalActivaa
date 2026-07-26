const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { email, accounts } = await herleidAccounts(req, token);

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        email,
        accounts: accounts.map(({ accountId, klantnummer, klantnaam, groepsnaam, contactpersoon, relatiebeheerder, accountant, account }) => ({
          accountId,
          klantnummer,
          klantnaam: klantnaam || account.name || "",
          groepsnaam: groepsnaam || "",
          // Bezoekadres van het bedrijf: read-only, wordt automatisch met de KvK gesynchroniseerd.
          klantadres: {
            straat: account.address1_line1 || "",
            huisnummer: account.cr283_huisnummer || "",
            toevoeging: account.cr283_huisnummertoevoeging || "",
            postcode: account.address1_postalcode || "",
            plaats: account.address1_city || "",
            land: account.address1_country || "",
          },
          // Volledige contactpersoon-gegevens (wijzigbaar via een verzoek, behalve functie rol).
          contactpersoon: contactpersoon || {},
          relatiebeheerder,
          accountant,
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
