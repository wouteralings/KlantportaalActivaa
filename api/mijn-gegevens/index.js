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
        accounts: accounts.map(({ accountId, klantnummer, contactNaam, adviseur, account }) => ({
          accountId,
          klantnummer,
          klantnaam: account.name || "",
          contactpersoon: contactNaam,
          adviseur,
          naw: {
            bedrijfsnaam: account.name || "",
            straat: account.address1_line1 || "",
            postcode: account.address1_postalcode || "",
            plaats: account.address1_city || "",
          },
          relatiegegevens: {
            email: account.emailaddress1 || "",
            telefoon: account.telephone1 || "",
          },
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
